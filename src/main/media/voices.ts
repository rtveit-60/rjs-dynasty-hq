/**
 * The wire's variety engine: template banks with a per-cycle usage ledger, so
 * no headline or post template repeats inside one season/offseason cycle.
 *
 * Voice notes (tones are style studies, all copy original):
 *  - 'wire'      — flat national desk: subject-verb-object, no flourish.
 *  - 'network'   — broadcast punch: short, declarative, built to be read aloud.
 *  - 'analytic'  — measured, numbers-forward, mildly corrective.
 *  - 'hype'      — pageantry and superlatives, gameday-morning energy.
 *  - 'column'    — writerly, a little literary, allowed a metaphor.
 *  - 'irreverent'— fan-brained, unfiltered, jokes first.
 * A template with no tones fits every outlet.
 */

export interface Template {
  t: string;
  tones?: string[];
}

/** Season-cycle usage ledger, persisted inside MediaState. */
export interface VarietyLedger {
  cycle: number;
  used: Record<string, number>;
}

export function makeLedger(prev: { cycle?: number; used?: Record<string, number> } | null | undefined, cycle: number): VarietyLedger {
  if (!prev || prev.cycle !== cycle) return { cycle, used: {} };
  return { cycle, used: { ...(prev.used ?? {}) } };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a template the reader has not seen this cycle. Fresh entries first
 * (deterministic by seed); when a bank runs dry the least-recently-used entry
 * is allowed back in, so a 40-game sim still reads varied rather than halting.
 */
export function pickFresh(
  ledger: VarietyLedger,
  bankKey: string,
  bank: Template[],
  seed: string,
  tone?: string
): string {
  const eligible = bank
    .map((tpl, i) => ({ tpl, id: `${bankKey}#${i}` }))
    .filter(({ tpl }) => !tone || !tpl.tones || tpl.tones.includes(tone));
  const pool = eligible.length ? eligible : bank.map((tpl, i) => ({ tpl, id: `${bankKey}#${i}` }));
  const fresh = pool.filter(({ id }) => ledger.used[id] === undefined);
  const pickFromList = fresh.length
    ? fresh
    : [...pool].sort((a, b) => (ledger.used[a.id] ?? 0) - (ledger.used[b.id] ?? 0)).slice(0, Math.max(1, Math.ceil(pool.length / 3)));
  const chosen = pickFromList[hash(seed) % pickFromList.length];
  ledger.used[chosen.id] = Date.now();
  return chosen.tpl.t;
}

/** Fill {TOKEN} slots; returns null if any needed token is missing. */
export function fillTokens(template: string, tokens: Record<string, string>): string | null {
  let ok = true;
  const out = template.replace(/\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    const v = tokens[key];
    if (v === undefined || v === '') {
      ok = false;
      return '';
    }
    return v;
  });
  return ok ? out : null;
}

/**
 * pickFresh over templates that can actually be filled from the tokens at
 * hand — the variety ledger only charges for the template that renders.
 */
export function sayFresh(
  ledger: VarietyLedger,
  bankKey: string,
  bank: Template[],
  seed: string,
  tokens: Record<string, string>,
  tone?: string
): string | null {
  const renderable = bank
    .map((tpl, i) => ({ tpl, i, text: fillTokens(tpl.t, tokens) }))
    .filter((x): x is { tpl: Template; i: number; text: string } => !!x.text)
    .filter(({ tpl }) => !tone || !tpl.tones || tpl.tones.includes(tone));
  if (!renderable.length) return null;
  const fresh = renderable.filter(({ i }) => ledger.used[`${bankKey}#${i}`] === undefined);
  const pool = fresh.length ? fresh : renderable;
  const chosen = pool[hash(seed) % pool.length];
  ledger.used[`${bankKey}#${chosen.i}`] = Date.now();
  return chosen.text;
}
