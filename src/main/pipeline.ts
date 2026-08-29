import { app } from 'electron';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  LeagueLeaders,
  MediaEvent,
  Profile,
  ProfileRequest,
  RecruitCard,
  Snapshot,
  WatchStatus
} from '../shared/types.ts';
import type { ScoutCriterion, ScoutHit } from '../shared/ratings.ts';
import { extractLeagueLeaders } from './parser/league.ts';
import { extractRecruitCard } from './parser/recruit-card.ts';
import { extractCoachProfile, extractPlayerProfile, extractSchoolProfile } from './parser/profile.ts';
import { scoutRecruits } from './parser/recruit-scout.ts';
import { mergeSeasonHistory } from './history.ts';
import { bankSeasonGames, readBankedGames } from './schedule-bank.ts';
import { generateMedia, sortEvents, type MediaState } from './media/engine.ts';
import { extractSnapshot } from './parser/extract.ts';
import { loadFranchise } from './parser/franchise.ts';

export interface PipelineEvents {
  onSnapshot: (snapshot: Snapshot) => void;
  onStatus: (status: WatchStatus) => void;
  onMedia: (events: MediaEvent[]) => void;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as T;
  } catch {
    return null;
  }
}

/**
 * Owns the parse lifecycle: copy the save out of the game's folder (never parse
 * in place, never write back), skip unchanged content, extract, and push.
 */
export class Pipeline {
  private events: PipelineEvents;
  private franchise: any = null;
  private lastHash = '';
  private lastUpdate: number | null = null;
  private busy = false;
  private queued = false;
  /** The school scoped by the latest refresh/rescope; marks "us" in profiles. */
  private lastSchoolRow: number | null = null;
  /** League leaders, swept once per parsed save (keyed by its hash). */
  private leaders: LeagueLeaders | null = null;
  private leadersHash = '';

  constructor(events: PipelineEvents) {
    this.events = events;
  }

  reset(): void {
    this.franchise = null;
    this.lastHash = '';
    this.lastUpdate = null;
  }

  async refresh(savePath: string, schoolTeamRow: number | null, force = false): Promise<void> {
    if (this.busy) {
      this.queued = true;
      return;
    }
    this.busy = true;
    this.events.onStatus({ kind: 'parsing' });
    try {
      const bytes = readFileSync(savePath);
      const hash = createHash('sha1').update(bytes).digest('hex');
      if (hash !== this.lastHash || !this.franchise || force) {
        const cacheDir = join(app.getPath('userData'), 'cache');
        mkdirSync(cacheDir, { recursive: true });
        const workingCopy = join(cacheDir, 'active-save');
        copyFileSync(savePath, workingCopy);
        this.franchise = await loadFranchise(workingCopy);
        this.lastHash = hash;
        this.lastUpdate = Date.now();
        console.log(`[hq] parsed ${basename(savePath)} (${hash.slice(0, 8)})`);
      }
      this.lastSchoolRow = schoolTeamRow;
      const snapshot = await extractSnapshot(this.franchise, {
        schoolTeamRow,
        fileName: basename(savePath)
      });
      this.bankHistory(snapshot);
      this.events.onSnapshot(snapshot);
      this.updateMedia(snapshot, await this.leagueLeaders());
      this.events.onStatus({ kind: 'watching', lastUpdate: this.lastUpdate });
    } catch (err) {
      this.events.onStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.busy = false;
      if (this.queued) {
        this.queued = false;
        void this.refresh(savePath, schoolTeamRow);
      }
    }
  }

  /** Detail for one recruit, read straight from the cached parse. */
  async recruitCard(playerRow: number): Promise<RecruitCard | null> {
    if (!this.franchise) return null;
    return extractRecruitCard(this.franchise, playerRow);
  }

  /** League stat leaders for Media HQ — swept once per parse, then cached. */
  async leagueLeaders(): Promise<LeagueLeaders | null> {
    if (!this.franchise) return null;
    if (!this.leaders || this.leadersHash !== this.lastHash) {
      this.leaders = await extractLeagueLeaders(this.franchise);
      this.leadersHash = this.lastHash;
    }
    return this.leaders;
  }

  /** Attribute search across the recruiting class. */
  async scout(criteria: ScoutCriterion[]): Promise<ScoutHit[]> {
    if (!this.franchise) return [];
    return scoutRecruits(this.franchise, criteria);
  }

  /** Pop-up profile for a clicked name — player, coach or school. */
  async profile(req: ProfileRequest): Promise<Profile | null> {
    if (!this.franchise) return null;
    if (req.kind === 'player') return extractPlayerProfile(this.franchise, req.row, this.lastSchoolRow);
    if (req.kind === 'coach') return extractCoachProfile(this.franchise, req.row);
    if (req.kind === 'school') return extractSchoolProfile(this.franchise, req.row, readBankedGames());
    return null;
  }

  /** Re-scope to a different school without re-parsing the file. */
  async rescope(savePath: string, schoolTeamRow: number | null): Promise<void> {
    if (!this.franchise) {
      await this.refresh(savePath, schoolTeamRow);
      return;
    }
    this.lastSchoolRow = schoolTeamRow;
    const snapshot = await extractSnapshot(this.franchise, {
      schoolTeamRow,
      fileName: basename(savePath)
    });
    this.bankHistory(snapshot);
    this.events.onSnapshot(snapshot);
    this.updateMedia(snapshot, await this.leagueLeaders());
    this.events.onStatus({ kind: 'watching', lastUpdate: this.lastUpdate });
  }

  /** Fold banked seasons into the save's five-season window (see history.ts). */
  private bankHistory(snapshot: Snapshot): void {
    if (!snapshot.school) return;
    snapshot.school.seasonHistory = mergeSeasonHistory(
      snapshot.school.team.row,
      snapshot.school.seasonHistory
    );
    // And the league schedule: the save recycles SeasonGame every year, so the
    // bank is the only game-by-game record a finished season will ever have.
    if (snapshot.season) bankSeasonGames(snapshot.season.seasonYear, snapshot.games);
  }

  /** Diff against the stored per-school media state, append fresh stories, push the feed. */
  private updateMedia(snapshot: Snapshot, leaders: LeagueLeaders | null): void {
    try {
      if (!snapshot.school) {
        this.events.onMedia([]);
        return;
      }
      const teamRow = snapshot.school.team.row;
      const dir = join(app.getPath('userData'), 'media');
      mkdirSync(dir, { recursive: true });
      const stateFile = join(dir, `state-${teamRow}.json`);
      const eventsFile = join(dir, `events-${teamRow}.json`);

      const prev = readJson<MediaState>(stateFile);
      const log = readJson<MediaEvent[]>(eventsFile) ?? [];
      const { state, events } = generateMedia(prev, snapshot, leaders);
      const known = new Set(log.map((e) => e.id));
      const fresh = events.filter((e) => !known.has(e.id));
      const merged = sortEvents([...fresh, ...log]).slice(0, 400);

      if (state) writeFileSync(stateFile, JSON.stringify(state), 'utf8');
      writeFileSync(eventsFile, JSON.stringify(merged), 'utf8');
      this.events.onMedia(merged);
    } catch {
      // media is downstream of the core dashboard — never break a refresh over it
    }
  }
}
