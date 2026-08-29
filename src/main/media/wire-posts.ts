/**
 * The Wire's personality layer: short social-style posts that ride alongside
 * the articles, written in the voices of the fictional press corps defined in
 * ecosystem.ts and routed per EVENT_ROUTING (scoop → follow-ups → takes, with
 * the occasional rumor front-running a coaching change).
 *
 * Deterministic like articles.ts: the same event always produces the same
 * posts. A phrase template is only eligible when every {TOKEN} it uses can be
 * filled from real save data — no invented numbers, ever.
 */
import type { MediaEvent } from '../../shared/types.ts';
import { AWARD_NAMES } from '../../shared/awards.ts';
import type { RawEvent } from './articles.ts';
import { EVENT_ROUTING, OUTLETS, PERSONALITIES, type MediaPersonality } from './ecosystem.ts';
import { sayFresh, type VarietyLedger } from './voices.ts';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Tokens = Record<string, string>;

/**
 * A personality's post for this event, chosen through the season-cycle
 * ledger — nobody repeats a line inside one cycle, and a template only
 * renders when every {TOKEN} it names fills from real save data.
 */
function speak(p: MediaPersonality, tokens: Tokens, seed: string, ledger: VarietyLedger): string | null {
  return sayFresh(
    ledger,
    `p:${p.id}`,
    p.phrases.map((t) => ({ t })),
    seed + p.id,
    tokens
  );
}

interface PostSpec {
  personality: MediaPersonality;
  text: string;
  slot: 'rumor' | 'first' | 'then' | 'reaction';
}

/** Assemble a cascade for one routing key: scoop, a follow-up or two, one take. */
function cascade(
  routeKey: string,
  tokens: Tokens,
  seed: string,
  ledger: VarietyLedger,
  opts: { withRumor?: boolean; maxThen?: number; withReaction?: boolean } = {}
): PostSpec[] {
  const route = EVENT_ROUTING[routeKey];
  if (!route) return [];
  const posts: PostSpec[] = [];
  const used = new Set<string>();

  const tryAdd = (ids: string[], slot: PostSpec['slot'], salt: number): boolean => {
    const order = [...ids].sort(
      (a, b) => ((hash(seed + a + salt) % 97) - (hash(seed + b + salt) % 97))
    );
    for (const id of order) {
      if (used.has(id)) continue;
      const p = PERSONALITIES[id];
      if (!p) continue;
      const text = speak(p, tokens, seed + slot, ledger);
      if (!text) continue;
      used.add(id);
      posts.push({ personality: p, text, slot });
      return true;
    }
    return false;
  };

  if (opts.withRumor && route.rumor && hash(seed + 'rumor') % 2 === 0) {
    tryAdd(route.rumor, 'rumor', 1);
  }
  tryAdd(route.first, 'first', 2);
  const thenCount = Math.min(opts.maxThen ?? 2, route.then.length);
  for (let i = 0; i < thenCount; i++) tryAdd(route.then, 'then', 3 + i);
  if ((opts.withReaction ?? true) && route.reaction) tryAdd(route.reaction, 'reaction', 9);
  return posts;
}

function toEvents(
  r: RawEvent,
  specs: PostSpec[],
  parentPriority: number,
  aboutUser: boolean,
  tags: string[],
  weekOverride?: number
): MediaEvent[] {
  return specs.map((s, i) => ({
    id: `${r.id}-w${i}`,
    createdAt: Date.now(),
    seasonYear: r.ctx.seasonYear,
    week: weekOverride ?? r.ctx.week,
    weekType: r.ctx.weekType,
    // Rumors read as if they beat the news; everything else trails the article.
    type: r.kind === 'bigGame' ? 'bigGame' : r.kind === 'userGame' ? 'userGame' : (r.kind as MediaEvent['type']),
    priority: Math.max(1, parentPriority - (s.slot === 'rumor' ? -2 : 18 + i * 2)),
    aboutUser,
    tags: [...tags, 'Wire'],
    outlet: s.personality.outlet,
    headline: s.text,
    dek: '',
    body: [],
    format: 'post',
    byline: {
      name: s.personality.name,
      handle: s.personality.handle,
      role: s.personality.role,
      outletName: OUTLETS[s.personality.outlet]?.name ?? s.personality.outlet
    }
  }));
}

export function writeWirePosts(r: RawEvent, ledger: VarietyLedger): MediaEvent[] {
  try {
    const ctx = r.ctx;
    switch (r.kind) {
      case 'userGame':
      case 'bigGame': {
        const g = r.game;
        const home = ctx.teamsByRow.get(g.homeRow);
        const away = ctx.teamsByRow.get(g.awayRow);
        const homeWon = g.status === 'home';
        const winner = homeWon ? home : away;
        const loser = homeWon ? away : home;
        if (!winner || !loser) return [];
        const winScore = homeWon ? g.homeScore : g.awayScore;
        const loseScore = homeWon ? g.awayScore : g.homeScore;
        const upset = (winner.rank ?? 0) === 0 && (loser.rank ?? 99) <= 15;
        const isUser = r.kind === 'userGame';
        // Posts only where the wire would actually light up.
        if (!isUser && !upset && !g.gotw) return [];
        const tokens: Tokens = {
          TEAM: winner.longName,
          OPPONENT: loser.longName,
          SCORE: `${winScore}-${loseScore}`,
          // Only close games unlock "closer than the score" material.
          CLOSE_SCORE: winScore - loseScore <= 8 ? `${winScore}-${loseScore}` : '',
          WEEK: String(g.week),
          COACH: winner.headCoach ?? ''
        };
        const route = /National Championship|NationalChampionship/i.test((g.bowlName ?? '') + g.weekType)
          ? 'bowl_game'
          : g.bowlName
            ? 'bowl_game'
            : r.rivalryName
              ? 'rivalry_game'
              : upset
                ? 'upset_win'
                : 'game_recap';
        tokens.NICK = winner.nickName ?? '';
        tokens.RIVALRY = r.rivalryName ?? '';
        tokens.BOWL = g.bowlName ?? '';
        const specs = cascade(route, tokens, r.id, ledger, {
          maxThen: isUser || upset ? 2 : 1,
          withReaction: isUser || upset || !!g.bowlName || !!r.rivalryName
        });
        const basePriority = isUser ? 88 : 60;
        return toEvents(r, specs, basePriority, isUser, [winner.longName, loser.longName, 'Results'], g.week);
      }
      case 'pollMove': {
        const team = ctx.teamsByRow.get(r.teamRow);
        if (!team || r.to <= 0) return [];
        const tokens: Tokens = {
          TEAM: team.longName,
          RANK: String(r.to),
          WEEK: String(ctx.week),
          COACH: team.headCoach ?? ''
        };
        const isUser = r.teamRow === ctx.userRow;
        const specs = cascade('rankings_release', tokens, r.id, ledger, {
          maxThen: r.to === 1 || isUser ? 2 : 1,
          withReaction: r.to === 1
        });
        return toEvents(r, specs, isUser ? 68 : 56, isUser, [team.longName, 'Polls']);
      }
      case 'commit': {
        const rec = r.recruit;
        const school = rec.committedTo ?? '';
        if (!school) return [];
        const isUser = school === ctx.userName;
        // The wire chases stars: your commits always, elsewhere only the marquee names.
        if (!isUser && rec.stars < 5) return [];
        // The user's standing NIL offer, when this commit was on the board —
        // real save numbers (RecruitTarget.CurrentNILOffer / NILExpectation).
        const target = isUser
          ? ctx.snapshot.school?.board?.targets.find((t) => t.recruitRow === rec.row)
          : undefined;
        const pts = (n: number) => `${n.toLocaleString('en-US')} pts`;
        const tokens: Tokens = {
          TEAM: school,
          RECRUIT: rec.name,
          STARS: String(rec.stars),
          POSITION: rec.position,
          NIL: target && target.nilOffer > 0 ? pts(target.nilOffer) : '',
          NIL_ASK: target && target.nilExpectation > 0 ? pts(target.nilExpectation) : ''
        };
        const specs = cascade('recruit_commitment', tokens, r.id, ledger, {
          maxThen: rec.stars >= 4 ? 2 : 1,
          withReaction: rec.stars === 5
        });
        return toEvents(r, specs, (isUser ? 36 : 6) + rec.stars * 9, isUser, [school, 'Recruiting']);
      }
      case 'coachChange': {
        const team = ctx.teamsByRow.get(r.teamRow);
        if (!team) return [];
        const isUser = r.teamRow === ctx.userRow;
        const roleTxt =
          r.role === 'HC' ? 'head coach' : r.role === 'OC' ? 'offensive coordinator' : 'defensive coordinator';
        const firedTokens: Tokens = { TEAM: team.longName, COACH: r.outgoing, ROLE: roleTxt };
        const hiredTokens: Tokens = { TEAM: team.longName, COACH: r.incoming, ROLE: roleTxt };
        const fired = cascade('coaching_fired', firedTokens, r.id + 'f', ledger, {
          withRumor: true,
          maxThen: 1,
          withReaction: r.role === 'HC'
        });
        const hired = cascade('coaching_hired', hiredTokens, r.id + 'h', ledger, {
          maxThen: r.role === 'HC' ? 2 : 1,
          withReaction: false
        });
        return toEvents(r, [...fired, ...hired], isUser ? 64 : 52, isUser, [team.longName, 'Coaching']);
      }
      case 'hotSeat': {
        const team = ctx.teamsByRow.get(r.teamRow);
        if (!team) return [];
        const isUser = r.teamRow === ctx.userRow;
        const tokens: Tokens = { TEAM: team.longName, COACH: r.coach, ROLE: 'head coach' };
        const specs = cascade('coaching_hot_seat', tokens, r.id, ledger, { maxThen: 1, withReaction: true });
        return toEvents(r, specs, isUser ? 62 : 50, isUser, [team.longName, 'Coaching']);
      }
      case 'rosterMove': {
        // The portal wire covers departures; arrivals get their day via commits.
        const specs: PostSpec[] = [];
        for (const [name, pos] of r.departures.slice(0, 2)) {
          const tokens: Tokens = { TEAM: ctx.userName, PLAYER: name, POSITION: pos };
          specs.push(
            ...cascade('portal_entry', tokens, `${r.id}-${name}`, ledger, { maxThen: 1, withReaction: false })
          );
        }
        return toEvents(r, specs.slice(0, 4), 42, true, [ctx.userName, 'Roster']);
      }
      case 'seasonSoFar': {
        const team = ctx.snapshot.school!.team;
        const tokens: Tokens = {
          TEAM: team.longName,
          COACH: team.headCoach ?? '',
          RANK: team.rank > 0 ? String(team.rank) : '',
          WEEK: String(ctx.week)
        };
        const specs = cascade('season_state', tokens, r.id, ledger, { maxThen: 1, withReaction: false });
        return toEvents(r, specs, 96, true, [team.longName, 'Feature']);
      }
      case 'statLine': {
        const team = ctx.teamsByRow.get(r.teamRow);
        const opp = ctx.teamsByRow.get(r.oppRow);
        if (!team) return [];
        const isUser = r.teamRow === ctx.userRow;
        const tokens: Tokens = {
          PLAYER: r.name,
          POSITION: r.position,
          TEAM: team.longName,
          NICK: team.nickName ?? '',
          OPPONENT: opp?.longName ?? '',
          YDS: r.yards.toLocaleString('en-US'),
          WEEK: String(r.week)
        };
        const specs = cascade('stat_line', tokens, r.id, ledger, {
          maxThen: isUser ? 2 : 1,
          withReaction: isUser
        });
        return toEvents(r, specs, isUser ? 66 : 44, isUser, [team.longName, 'Numbers'], r.week);
      }
      case 'streak': {
        const team = ctx.snapshot.school!.team;
        const tokens: Tokens = {
          TEAM: team.longName,
          NICK: team.nickName ?? '',
          COACH: team.headCoach ?? '',
          N: String(r.n),
          WEEK: String(ctx.week)
        };
        const specs = cascade('milestone_or_streak', tokens, r.id, ledger, {
          maxThen: 2,
          withReaction: true
        });
        return toEvents(r, specs, 72, true, [team.longName, 'Feature']);
      }
      case 'weeklyAward': {
        const a = r.award;
        const honor = `${a.confRow === null ? 'National' : 'Conference'} ${a.side === 'off' ? 'Offensive' : 'Defensive'} Player of the Week`;
        const tokens: Tokens = {
          PLAYER: a.name,
          POSITION: a.position,
          TEAM: a.teamName,
          HONOR: honor,
          WEEK: String(a.week)
        };
        const specs = cascade('weekly_award', tokens, r.id, ledger, { maxThen: 1, withReaction: true });
        return toEvents(r, specs, 58, true, [a.teamName, 'Awards']);
      }
      case 'awardShow': {
        const heisman = r.winners.find((w) => w.awardType === 'HEISMAN');
        if (!heisman) return [];
        const tokens: Tokens = {
          PLAYER: heisman.name,
          TEAM: heisman.teamName,
          AWARD: AWARD_NAMES['HEISMAN'] ?? 'Heisman'
        };
        const specs = cascade('award_show', tokens, r.id, ledger, { maxThen: 2, withReaction: true });
        const userTeam = ctx.teamsByRow.get(ctx.userRow);
        const aboutUser = !!userTeam && [userTeam.longName, userTeam.displayName].includes(heisman.teamName);
        return toEvents(r, specs, 80, aboutUser, [heisman.teamName, 'Awards']);
      }
      case 'awardWin': {
        const w = r.winner;
        const tokens: Tokens = {
          PLAYER: w.name,
          POSITION: w.position ?? '',
          TEAM: w.teamName,
          AWARD: AWARD_NAMES[w.awardType] ?? w.awardType
        };
        const specs = cascade('award_show', tokens, r.id, ledger, { maxThen: 1, withReaction: true });
        return toEvents(r, specs, 76, true, [w.teamName, 'Awards']);
      }
      case 'draftPick': {
        const team = ctx.teamsByRow.get(ctx.userRow);
        const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
        const tokens: Tokens = {
          PLAYER: r.name,
          POSITION: r.position,
          TEAM: ctx.userName,
          NICK: team?.nickName ?? '',
          ROUND: ordinals[r.round] ?? `round-${r.round}`
        };
        const specs = cascade('draft_day', tokens, r.id, ledger, { maxThen: 2, withReaction: true });
        return toEvents(r, specs, 60, true, [ctx.userName, 'Draft']);
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}
