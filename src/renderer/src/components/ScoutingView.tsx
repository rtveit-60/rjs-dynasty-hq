import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ClassRecruit } from '../../../shared/types.ts';
import {
  RATING_BY_FIELD,
  formatRatingValue,
  ratingGroupsFor,
  ratingsFor,
  type ScoutCriterion,
  type ScoutHit,
  type ScoutOp
} from '../../../shared/ratings.ts';
import {
  POSITION_GROUPS,
  STAGE_LABELS,
  SUB_POSITIONS,
  archetypeLabel,
  devClass,
  devLabel,
  fmt,
  positionsFor,
  spaceOut,
  stars
} from '../lib/format.ts';
import RecruitCardRow from './RecruitCardRow.tsx';

type Row = { r: ClassRecruit; values: Record<string, number> };

const PAGE_SIZE = 100;
const OPS: { op: ScoutOp; label: string }[] = [
  { op: 'gte', label: '≥' },
  { op: 'lte', label: '≤' }
];

/** Blank slate that matches the user's own example: a burner receiver. */
const DEFAULT_CRITERIA: ScoutCriterion[] = [{ field: 'SpeedRating', op: 'gte', value: 90 }];

export default function ScoutingView({
  recruits,
  teamName,
  portalActive
}: {
  recruits: ClassRecruit[];
  teamName: string | undefined;
  portalActive: boolean;
}) {
  const [criteria, setCriteria] = useState<ScoutCriterion[]>(DEFAULT_CRITERIA);
  const [group, setGroup] = useState('ALL');
  const [sub, setSub] = useState('ALL');
  const [archetype, setArchetype] = useState('ALL');
  const [pool, setPool] = useState<'all' | 'hs' | 'portal'>('all');
  const [minStars, setMinStars] = useState(0);
  const [openOnly, setOpenOnly] = useState(false);
  const [hits, setHits] = useState<ScoutHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sortField, setSortField] = useState<string>('');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const active = criteria.filter((c) => RATING_BY_FIELD.has(c.field) && Number.isFinite(c.value));
  const key = JSON.stringify(active);

  // The query runs in the main process against the cached parse — a few ms —
  // so it can re-run as the thresholds change without a search button.
  useEffect(() => {
    let alive = true;
    if (!active.length) {
      setHits([]);
      return;
    }
    setBusy(true);
    void window.hq
      .scoutRecruits(active)
      .then((h) => alive && setHits(h))
      .catch(() => alive && setHits([]))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byPlayerRow = useMemo(() => new Map(recruits.map((r) => [r.playerRow, r])), [recruits]);

  const rowsAll = useMemo(() => {
    const out: Row[] = [];
    for (const h of hits ?? []) {
      const r = byPlayerRow.get(h.playerRow);
      if (!r) continue;
      if (pool === 'hs' && r.isTransfer) continue;
      if (pool === 'portal' && !r.isTransfer) continue;
      if (minStars && r.stars < minStars) continue;
      if (openOnly && r.committedTo) continue;
      const allowed = positionsFor(group, sub);
      if (allowed.length && !allowed.includes(r.position)) continue;
      if (archetype !== 'ALL' && r.archetype !== archetype) continue;
      out.push({ r, values: h.values });
    }
    const dir = asc ? 1 : -1;
    const f = sortField || active[0]?.field;
    out.sort((a, b) => {
      if (f) {
        const d = ((a.values[f] ?? 0) - (b.values[f] ?? 0)) * dir;
        if (d) return d;
      }
      return (a.r.nationalRank || 1e9) - (b.r.nationalRank || 1e9);
    });
    return out;
  }, [hits, byPlayerRow, pool, minStars, openOnly, group, sub, archetype, sortField, asc, active]);

  /** Archetypes actually present for the current position selection. */
  const archetypeOptions = useMemo(() => {
    const allowed = positionsFor(group, sub);
    const seen = new Set<string>();
    for (const r of recruits) {
      if (allowed.length && !allowed.includes(r.position)) continue;
      if (r.archetype) seen.add(r.archetype);
    }
    return [...seen].sort();
  }, [recruits, group, sub]);

  const pageCount = Math.max(1, Math.ceil(rowsAll.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = rowsAll.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
    setOpenRow(null);
  }, [key, group, sub, archetype, pool, minStars, openOnly, sortField, asc]);

  const setC = (i: number, patch: Partial<ScoutCriterion>) =>
    setCriteria((cs) =>
      cs.map((c, j) => {
        if (j !== i) return c;
        const next = { ...c, ...patch };
        // Switching attribute: a rating threshold of 90 means nothing as a
        // weight, so fall back to that attribute's own default when the
        // carried-over number is outside its range.
        if (patch.field && patch.field !== c.field) {
          const def = RATING_BY_FIELD.get(patch.field);
          const lo = def?.min ?? 0;
          const hi = def?.max ?? 99;
          if (next.value < lo || next.value > hi) next.value = def?.dflt ?? Math.round((lo + hi) / 2);
        }
        return next;
      })
    );

  const columns = [...new Set(active.map((c) => c.field))];
  const COLS = 9 + columns.length;

  const sortBy = (f: string) => {
    if (sortField === f) setAsc(!asc);
    else {
      setSortField(f);
      setAsc(false);
    }
  };

  const options = ratingsFor(group);
  const optionGroups = ratingGroupsFor(group);

  return (
    <>
      <div className="scout-builder">
        <div className="scout-title">Attribute filters</div>
        <div className="scout-rows">
        {criteria.map((c, i) => (
          <div className="scout-row" key={i}>
            <select
              className="scout-select"
              value={c.field}
              onChange={(e) => setC(i, { field: e.target.value })}
            >
              {optionGroups.map((g) =>
                g.label ? (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((r) => (
                      <option key={r.field} value={r.field}>
                        {r.name} ({r.label})
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  g.items.map((r) => (
                    <option key={r.field} value={r.field}>
                      {r.name} ({r.label})
                    </option>
                  ))
                )
              )}
            </select>
            <div className="seg-ops">
              {OPS.map((o) => (
                <button
                  key={o.op}
                  className={`filter ${c.op === o.op ? 'active' : ''}`}
                  onClick={() => setC(i, { op: o.op })}
                  title={o.op === 'gte' ? 'at least' : 'at most'}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              className="search scout-value"
              type="number"
              min={RATING_BY_FIELD.get(c.field)?.min ?? 0}
              max={RATING_BY_FIELD.get(c.field)?.max ?? 99}
              value={Number.isFinite(c.value) ? c.value : ''}
              onChange={(e) => setC(i, { value: Number(e.target.value) })}
            />
            {RATING_BY_FIELD.get(c.field)?.kind === 'height' && (
              <span className="scout-hint">{formatRatingValue(c.field, c.value)}</span>
            )}
            <button
              className="btn"
              onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
              disabled={criteria.length === 1}
              title="Remove this filter"
            >
              ✕
            </button>
          </div>
        ))}
        </div>
        <button
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() =>
            setCriteria((cs) => {
              const next = options.find((o) => !cs.some((c) => c.field === o.field)) ?? options[0];
              return [...cs, { field: next.field, op: 'gte', value: next.dflt ?? 85 }];
            })
          }
        >
          + Add attribute
        </button>
      </div>

      <div className="filters" style={{ marginTop: 12 }}>
        {['ALL', ...Object.keys(POSITION_GROUPS)].map((g) => (
          <button
            key={g}
            className={`filter ${group === g ? 'active' : ''}`}
            onClick={() => {
              setGroup(g);
              setSub('ALL');
              setArchetype('ALL');
            }}
          >
            {g}
          </button>
        ))}

        <span className="filter-sep" />
        {[
          { k: 'all', label: 'All' },
          { k: 'hs', label: 'High School' },
          ...(portalActive ? [{ k: 'portal', label: 'Transfer Portal' }] : [])
        ].map((p) => (
          <button
            key={p.k}
            className={`filter ${pool === p.k ? 'active' : ''}`}
            onClick={() => setPool(p.k as typeof pool)}
          >
            {p.label}
          </button>
        ))}

        <span className="filter-sep" />
        {[
          { label: 'Any ★', min: 0 },
          { label: '5★', min: 5 },
          { label: '4★+', min: 4 },
          { label: '3★+', min: 3 }
        ].map((f) => (
          <button
            key={f.label}
            className={`filter ${minStars === f.min ? 'active' : ''}`}
            onClick={() => setMinStars(f.min)}
          >
            {f.label}
          </button>
        ))}
        <button className={`filter ${openOnly ? 'active' : ''}`} onClick={() => setOpenOnly(!openOnly)}>
          Uncommitted
        </button>
      </div>

      {/* Archetype, with the role chips beside it. Sides collapse into roles:
          LT/RT are both tackles, LOLB is the Will. */}
      <div className="filters" style={{ marginTop: 0 }}>
        <span className="filter-label">Archetype</span>
        <select
          className="scout-select"
          value={archetype}
          onChange={(e) => setArchetype(e.target.value)}
          style={{ minWidth: 190 }}
        >
          <option value="ALL">Any archetype ({archetypeOptions.length})</option>
          {archetypeOptions.map((a) => (
            <option key={a} value={a}>
              {archetypeLabel(a)}
            </option>
          ))}
        </select>

        {(SUB_POSITIONS[group]?.length ?? 0) > 0 && (
          <>
            <span className="filter-sep" />
            <span className="filter-label">Role</span>
            {['ALL', ...SUB_POSITIONS[group].map((s) => s.key)].map((k) => (
              <button
                key={k}
                className={`filter ${sub === k ? 'active' : ''}`}
                onClick={() => {
                  setSub(k);
                  setArchetype('ALL');
                }}
              >
                {k === 'ALL' ? 'All' : (SUB_POSITIONS[group].find((s) => s.key === k)?.label ?? k)}
              </button>
            ))}
          </>
        )}
      </div>

      {!active.length ? (
        <div className="empty" style={{ marginTop: 18 }}>
          Add an attribute filter to scout the class.
        </div>
      ) : (
        <>
          <div className="tbl-wrap tbl-scroll">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Gem</th>
                  <th>Recruit &amp; School</th>
                  <th>Pos</th>
                  <th>Archetype</th>
                  <th>Dev</th>
                  {columns.map((f) => (
                    <th
                      key={f}
                      className={`num ${sortField === f || (!sortField && f === active[0]?.field) ? 'sorted' : ''}`}
                      onClick={() => sortBy(f)}
                      title={RATING_BY_FIELD.get(f)?.name}
                    >
                      {RATING_BY_FIELD.get(f)?.label ?? f}
                      {(sortField === f || (!sortField && f === active[0]?.field)) && (
                        <span className="sort-caret">{asc ? '▲' : '▼'}</span>
                      )}
                    </th>
                  ))}
                  <th>Status</th>
                  <th className="num">Natl Rk</th>
                  <th>Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {!busy && !rows.length && (
                  <tr>
                    <td colSpan={COLS} style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--ink-3)' }}>
                      No recruits clear every threshold. Loosen one, or widen the position filter.
                    </td>
                  </tr>
                )}
                {rows.map(({ r, values }) => (
                  <Fragment key={r.row}>
                    <tr
                      className={`clickable ${openRow === r.row ? 'expanded' : ''}`}
                      onClick={() => setOpenRow(openRow === r.row ? null : r.row)}
                    >
                      <td>
                        <span className="stars-cell">{stars(r.stars).slice(0, r.stars)}</span>
                      </td>
                      <td>
                        {r.quality === 'GEM' && <span className="q gem">GEM</span>}
                        {r.quality === 'BUST' && <span className="q bust">BUST</span>}
                        {r.quality !== 'GEM' && r.quality !== 'BUST' && (
                          <span style={{ color: 'var(--ink-3)' }}>—</span>
                        )}
                      </td>
                      <td className="pname cell-clip name">
                        <span className="disclose">{openRow === r.row ? '▾' : '▸'}</span>
                        {r.onBoard && <span className="fav" title="On your board">▣ </span>}
                        {r.name}
                        <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>
                          {' · '}
                          {spaceOut(r.homeState)}
                          {r.isTransfer ? ` · ${r.classType}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className="pos-tag">{r.position}</span>
                      </td>
                      <td className="cell-clip" title={archetypeLabel(r.archetype)}>
                        {archetypeLabel(r.archetype)}
                      </td>
                      <td>
                        <span className={devClass(r.devTrait)}>{devLabel(r.devTrait)}</span>
                      </td>
                      {columns.map((f) => (
                        <td key={f} className="num">
                          <b>{values[f] === undefined ? '—' : formatRatingValue(f, values[f])}</b>
                        </td>
                      ))}
                      <td>
                        {r.committedTo ? (
                          <span
                            className={r.committedTo === teamName ? 'commit' : ''}
                            style={r.committedTo === teamName ? undefined : { color: 'var(--ink-3)' }}
                          >
                            → {r.committedTo}
                          </span>
                        ) : (
                          STAGE_LABELS[r.stage] ?? r.stage
                        )}
                      </td>
                      <td className="num">{r.nationalRank || '—'}</td>
                      <td className="cell-clip" style={{ color: 'var(--ink-2)' }}>
                        {spaceOut(r.pipeline)}
                      </td>
                    </tr>
                    {openRow === r.row && <RecruitCardRow playerRow={r.playerRow} span={COLS} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              ← Prev
            </button>
            <span className="pager-info">
              {busy
                ? 'Scouting…'
                : rowsAll.length
                  ? `${fmt(safePage * PAGE_SIZE + 1)}–${fmt(Math.min(rowsAll.length, (safePage + 1) * PAGE_SIZE))} of ${fmt(rowsAll.length)} matching`
                  : 'No recruits match these attributes'}
              {pageCount > 1 && (
                <span style={{ color: 'var(--ink-3)' }}>
                  {' '}
                  · page {safePage + 1} of {pageCount}
                </span>
              )}
            </span>
            <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Next →
            </button>
          </div>

          <p className="foot-note">
            Every attribute you filter on becomes a sortable column. Searches the recruiting class
            {portalActive ? ' and the transfer portal' : ' (the portal fills in the offseason)'}. Click a
            recruit for their full card.
          </p>
        </>
      )}
    </>
  );
}
