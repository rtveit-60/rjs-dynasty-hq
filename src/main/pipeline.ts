import { app } from 'electron';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  LeagueLeaders,
  MediaEvent,
  PlayerEditChanges,
  PlayerEditForm,
  PlayerEditResult,
  Profile,
  BoardEditRequest,
  CoachFireRequest,
  DepthChartEditRequest,
  ResourceEditRequest,
  ResourceForm,
  ProfileRequest,
  RecruitCard,
  Snapshot,
  WatchStatus
} from '../shared/types.ts';
import type { ScoutCriterion, ScoutHit } from '../shared/ratings.ts';
import {
  applyBoardEdit,
  applyCoachFire,
  applyDepthChartEdit,
  applyPlayerEdit,
  applyResourceEdit,
  buildEditForm,
  buildResourceForm
} from './editor.ts';
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
  /** End of a full refresh (never a rescope) — fires once per completed parse+extract. */
  onParsed: (snapshot: Snapshot) => void;
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
  /** Args of a refresh requested while one was in flight — re-run with these, not the stale ones. */
  private queuedArgs: { savePath: string; schoolTeamRow: number | null } | null = null;
  /** The school scoped by the latest refresh/rescope; marks "us" in profiles. */
  private lastSchoolRow: number | null = null;
  /** League leaders, swept once per parsed save (keyed by its hash). */
  private leaders: LeagueLeaders | null = null;
  private leadersHash = '';
  /**
   * Set when the app itself just wrote the save being parsed. The media diff
   * keys roster movement by name, so a rename would read as a fake
   * departure+arrival — that one refresh rebaselines state without stories.
   */
  private suppressMediaOnce = false;

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
      this.queuedArgs = { savePath, schoolTeamRow };
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
      this.events.onParsed(snapshot);
    } catch (err) {
      this.events.onStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.busy = false;
      if (this.queuedArgs) {
        const next = this.queuedArgs;
        this.queuedArgs = null;
        void this.refresh(next.savePath, next.schoolTeamRow);
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

  /** Current values + options for the edit dialog, from the cached parse. */
  async editForm(playerRow: number, savePath: string): Promise<PlayerEditForm | null> {
    if (!this.franchise || !savePath) return null;
    try {
      return await buildEditForm(this.franchise, playerRow, savePath);
    } catch {
      return null;
    }
  }

  /**
   * The app's only save-write shell. Guarded compare-and-swap: the file on
   * disk must still be the one this parse read (the game may have written
   * meanwhile) — then the edit lands in the <name>_RJsEdited sibling, never
   * the original, and the follow-up refresh is extract-only with media
   * rebaselining silently.
   */
  private async guardedEdit(
    savePath: string,
    write: () => Promise<{ editedPath: string; message?: string }>
  ): Promise<PlayerEditResult> {
    if (!this.franchise || !savePath) {
      return { ok: false, message: 'No parsed save to edit yet.' };
    }
    if (this.busy) {
      return { ok: false, message: 'A refresh is running — try again in a moment.' };
    }
    this.busy = true;
    try {
      const onDisk = createHash('sha1').update(readFileSync(savePath)).digest('hex');
      if (onDisk !== this.lastHash) {
        this.queuedArgs = { savePath, schoolTeamRow: this.lastSchoolRow };
        return {
          ok: false,
          message: 'The save changed on disk since it was read — refreshing now. Re-apply the edit in a moment.'
        };
      }
      const { editedPath, message } = await write();
      // The in-memory parse now matches the written file byte-for-byte in
      // content, so the follow-up refresh of the edited save skips the reload
      // and just re-extracts.
      this.lastHash = createHash('sha1').update(readFileSync(editedPath)).digest('hex');
      this.lastUpdate = Date.now();
      this.suppressMediaOnce = true;
      return {
        ok: true,
        message: message ?? `Saved to ${basename(editedPath)}.`,
        editedPath,
        editedFileName: basename(editedPath)
      };
    } catch (err) {
      // A failed write can leave the in-memory parse ahead of the disk —
      // drop it and reparse from the original so the dashboard stays truthful.
      this.reset();
      this.queuedArgs = { savePath, schoolTeamRow: this.lastSchoolRow };
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    } finally {
      this.busy = false;
      if (this.queuedArgs) {
        const next = this.queuedArgs;
        this.queuedArgs = null;
        void this.refresh(next.savePath, next.schoolTeamRow);
      }
    }
  }

  /** Player edits ride the guarded shell above. */
  async editPlayer(changes: PlayerEditChanges, savePath: string): Promise<PlayerEditResult> {
    return this.guardedEdit(savePath, () =>
      applyPlayerEdit(this.franchise, savePath, changes, app.getPath('userData'))
    );
  }

  /** Current budget/hours for the Fundraising and Hire Recruiters dialogs. */
  async resourceForm(savePath: string): Promise<ResourceForm | null> {
    if (!this.franchise || !savePath || this.lastSchoolRow === null) return null;
    try {
      return await buildResourceForm(this.franchise, this.lastSchoolRow, savePath);
    } catch {
      return null;
    }
  }

  /** Fundraising / recruiter hours, via the same guarded write shell. */
  async editResource(req: ResourceEditRequest, savePath: string): Promise<PlayerEditResult> {
    const teamRow = this.lastSchoolRow;
    if (teamRow === null) return { ok: false, message: 'Pick your program first.' };
    return this.guardedEdit(savePath, async () => {
      const { editedPath, applied } = await applyResourceEdit(
        this.franchise,
        savePath,
        { teamRow, kind: req.kind, amount: req.amount },
        app.getPath('userData')
      );
      const unit = req.kind === 'nil' ? 'program points' : 'recruiting hours';
      return {
        editedPath,
        message:
          applied === req.amount
            ? `Added ${applied} ${unit} — saved to ${basename(editedPath)}.`
            : `Added ${applied} ${unit} (the save format caps the field there) — saved to ${basename(editedPath)}.`
      };
    });
  }

  /** Depth-chart reorders/swaps, via the same guarded write shell. */
  async editDepthChart(req: DepthChartEditRequest, savePath: string): Promise<PlayerEditResult> {
    const teamRow = this.lastSchoolRow;
    if (teamRow === null) return { ok: false, message: 'Pick your program first.' };
    return this.guardedEdit(savePath, async () => {
      const { editedPath, windows } = await applyDepthChartEdit(
        this.franchise,
        savePath,
        { teamRow, changes: req.changes },
        app.getPath('userData')
      );
      return {
        editedPath,
        message: `Depth chart updated (${windows} window${windows === 1 ? '' : 's'}) — saved to ${basename(editedPath)}.`
      };
    });
  }

  /** Stage recruits onto or off the target board, via the guarded shell. */
  async editBoard(req: BoardEditRequest, savePath: string): Promise<PlayerEditResult> {
    const teamRow = this.lastSchoolRow;
    if (teamRow === null) return { ok: false, message: 'Pick your program first.' };
    return this.guardedEdit(savePath, async () => {
      const { editedPath, added, removed } = await applyBoardEdit(
        this.franchise,
        savePath,
        { teamRow, changes: req.changes },
        app.getPath('userData')
      );
      const parts = [added ? `${added} added` : '', removed ? `${removed} removed` : ''].filter(Boolean);
      return { editedPath, message: `Board updated (${parts.join(', ')}) — saved to ${basename(editedPath)}.` };
    });
  }

  /** Mark a CPU coach PendingFire (or restore Signed), via the guarded shell. */
  async fireCoach(req: CoachFireRequest, savePath: string): Promise<PlayerEditResult> {
    return this.guardedEdit(savePath, async () => {
      const { editedPath, coachName } = await applyCoachFire(
        this.franchise,
        savePath,
        { coachRow: req.coachRow, undo: req.undo },
        app.getPath('userData')
      );
      return {
        editedPath,
        message: req.undo
          ? `${coachName} is off the chopping block — saved to ${basename(editedPath)}.`
          : `${coachName} marked to be fired at season's end — saved to ${basename(editedPath)}.`
      };
    });
  }

  /**
   * View-only extract of another school's full HQ data from the cached parse.
   * Leaves the user's scope, media state and events untouched; takes the busy
   * lock so a watcher refresh queues instead of interleaving table reads.
   */
  async browseSchool(teamRow: number, savePath: string): Promise<Snapshot['school'] | null> {
    if (!this.franchise || this.busy) return null;
    this.busy = true;
    try {
      const snapshot = await extractSnapshot(this.franchise, {
        schoolTeamRow: teamRow,
        fileName: basename(savePath)
      });
      return snapshot.school;
    } catch {
      return null;
    } finally {
      this.busy = false;
      if (this.queuedArgs) {
        const next = this.queuedArgs;
        this.queuedArgs = null;
        void this.refresh(next.savePath, next.schoolTeamRow);
      }
    }
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
      // An app-written save diffs against itself (a rename reads as roster
      // churn): rebaseline the state, publish nothing.
      const suppressed = this.suppressMediaOnce;
      this.suppressMediaOnce = false;
      const known = new Set(log.map((e) => e.id));
      const fresh = suppressed ? [] : events.filter((e) => !known.has(e.id));
      const merged = sortEvents([...fresh, ...log]).slice(0, 400);

      if (state) writeFileSync(stateFile, JSON.stringify(state), 'utf8');
      writeFileSync(eventsFile, JSON.stringify(merged), 'utf8');
      this.events.onMedia(merged);
    } catch {
      // media is downstream of the core dashboard — never break a refresh over it
    }
  }
}
