import { useEffect, useMemo, useState } from 'react';
import type { PlaybookBook, Snapshot } from '../../../shared/types.ts';
import { prestigeLabel, schemeLabel } from '../lib/format.ts';
import InfoDot from './InfoDot.tsx';
import { personnelLabel } from './PlayArt.tsx';

type School = NonNullable<Snapshot['school']>;

type Side = 'offense' | 'defense';

export default function PlaybookView({ school }: { school: School }) {
  const { team, staff } = school;
  const oc = staff.find((s) => s.role === 'OC');
  const dc = staff.find((s) => s.role === 'DC');
  const hc = staff.find((s) => s.role === 'HC');

  const [books, setBooks] = useState<{ offense: PlaybookBook | null; defense: PlaybookBook | null }>({
    offense: null,
    defense: null
  });
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState<Side>('offense');

  useEffect(() => {
    let live = true;
    setLoaded(false);
    Promise.all([
      window.hq.getPlaybook('offense', team.offPlaybookRow, team.offPlaybook),
      window.hq.getPlaybook('defense', team.defPlaybookRow, team.defPlaybook)
    ]).then(([offense, defense]) => {
      if (!live) return;
      setBooks({ offense, defense });
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [team.offPlaybookRow, team.defPlaybookRow, team.offPlaybook, team.defPlaybook]);

  const sides = [
    {
      key: 'offense' as Side,
      label: 'OFFENSE',
      scheme: schemeLabel(team.offScheme),
      playbook: schemeLabel(team.offPlaybook),
      caller: oc ?? hc,
      callerRole: oc ? 'Offensive Coordinator' : 'Head Coach'
    },
    {
      key: 'defense' as Side,
      label: 'DEFENSE',
      scheme: schemeLabel(team.defScheme),
      playbook: schemeLabel(team.defPlaybook),
      caller: dc ?? hc,
      callerRole: dc ? 'Defensive Coordinator' : 'Head Coach'
    }
  ];

  const activeBook = books[side];

  return (
    <>
      <div className="two-col" style={{ marginTop: 16 }}>
        {sides.map((s) => {
          const book = books[s.key];
          return (
          <div key={s.key} className="panel">
            <div className="panel-title">{s.label}</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1,
                textTransform: 'uppercase',
                margin: '6px 0 2px'
              }}
            >
              {book?.name ?? s.playbook}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {s.scheme} scheme{book ? ` · ${book.formationCount} formations · ${book.playCount} plays` : ''}
            </div>
            {s.caller && (
              <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
                Run by <b style={{ color: 'var(--ink)' }}>{s.caller.name}</b> ({s.callerRole},{' '}
                {prestigeLabel(s.caller.prestige)} prestige)
              </p>
            )}
          </div>
          );
        })}
      </div>

      <PlaybookBrowser book={activeBook} side={side} onSide={setSide} loaded={loaded} />
    </>
  );
}

function PlaybookBrowser({
  book,
  side,
  onSide,
  loaded
}: {
  book: PlaybookBook | null;
  side: Side;
  onSide: (s: Side) => void;
  loaded: boolean;
}) {
  const [formIdx, setFormIdx] = useState(0);
  const [playIdx, setPlayIdx] = useState(0);

  // Reset selection when the book changes.
  useEffect(() => {
    setFormIdx(0);
    setPlayIdx(0);
  }, [book?.slug]);

  const families = useMemo(() => {
    if (!book) return [];
    const groups: {
      family: string;
      items: { idx: number; name: string; plays: number; personnel: string | null }[];
    }[] = [];
    book.formations.forEach((f, idx) => {
      let g = groups.find((x) => x.family === f.family);
      if (!g) {
        g = { family: f.family, items: [] };
        groups.push(g);
      }
      g.items.push({ idx, name: f.name, plays: f.plays.length, personnel: personnelLabel(f, side) });
    });
    return groups;
  }, [book, side]);

  const formation = book?.formations[formIdx] ?? null;
  const play = formation?.plays[playIdx] ?? null;

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="panel-title" style={{ margin: 0 }}>
          Playbook Browser
          <InfoDot title="Playbook Browser">
            <p>
              Your selected schemes and playbooks, read live from the save. Every formation, play
              and personnel package comes from the book's own data, fully offline.
            </p>
          </InfoDot>
        </div>
        <div className="seg-toggle">
          {(['offense', 'defense'] as Side[]).map((s) => (
            <button
              key={s}
              className={`seg ${side === s ? 'active' : ''}`}
              onClick={() => onSide(s)}
            >
              {s === 'offense' ? 'Offense' : 'Defense'}
            </button>
          ))}
        </div>
      </div>

      {!loaded && <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0' }}>Loading book…</div>}

      {loaded && !book && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0' }}>
          This {side} book isn't bundled yet.
        </div>
      )}

      {book && formation && (
        <div className="pb-grid">
          {/* formation list */}
          <div className="pb-forms">
            {families.map((g) => (
              <div key={g.family}>
                <div className="pb-fam">
                  {g.family} <span style={{ color: 'var(--ink-3)', opacity: 0.7 }}>· {g.items.length}</span>
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.idx}
                    className={`pb-form ${it.idx === formIdx ? 'active' : ''}`}
                    onClick={() => {
                      setFormIdx(it.idx);
                      setPlayIdx(0);
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.name}
                      </span>
                      {it.personnel && (
                        <span style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.02em' }}>
                          {it.personnel}
                        </span>
                      )}
                    </span>
                    <span className="pb-count">{it.plays}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* play list */}
          <div className="pb-plays">
            {formation.plays.map((p, i) => (
              <button
                key={`${p.id}-${i}`}
                className={`pb-play ${i === playIdx ? 'active' : ''}`}
                onClick={() => setPlayIdx(i)}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* play art */}
          <div className="pb-art">
            <div className="pb-art-head">
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {formation.family} · {formation.name}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1.05 }}>
                  {play?.name}
                </div>
              </div>
              {personnelLabel(formation, side) && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: 'var(--ink-2)',
                    background: 'var(--sunken)',
                    border: '1px solid var(--line)',
                    borderRadius: 999,
                    padding: '3px 11px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {personnelLabel(formation, side)}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minHeight: 240,
                marginTop: 10,
                padding: 24,
                border: '1px dashed var(--line)',
                borderRadius: 8,
                background: 'var(--sunken)',
                textAlign: 'center'
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-2)'
                }}
              >
                Play Art
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 320 }}>
                Diagrams aren't drawn yet. The names and structure above are live from your book.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
