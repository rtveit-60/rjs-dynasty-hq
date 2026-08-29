import type { Snapshot, StaffTendency } from '../../../shared/types.ts';
import { fmt, pct, prestigeLabel } from '../lib/format.ts';
import InfoDot from './InfoDot.tsx';

type School = NonNullable<Snapshot['school']>;

function Meter({
  left,
  right,
  value
}: {
  left: string;
  right: string;
  value: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="meter">
      <div className="poles">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="track">
        <span className="thumb" style={{ left: `${clamped}%` }} />
      </div>
      <div className="val">{clamped}</div>
    </div>
  );
}

function StaffCard({ s }: { s: StaffTendency }) {
  const showOff = s.role !== 'DC';
  const showDef = s.role !== 'OC';
  return (
    <div className="panel">
      <div className="panel-title">
        {s.role} · {s.name} <span className="grade good" style={{ marginLeft: 6 }}>{prestigeLabel(s.prestige)}</span>
      </div>
      {showOff && s.offRunPass !== null && (
        <Meter left="Pass" right="Run" value={s.offRunPass} />
      )}
      {showOff && s.offAggression !== null && (
        <Meter left="Conservative" right="Aggressive" value={s.offAggression} />
      )}
      {showDef && s.defAggression !== null && (
        <Meter left="Conservative" right="Aggressive (Def)" value={s.defAggression} />
      )}
      {showDef && s.defRunPass !== null && s.defRunPass > 0 && (
        <Meter left="Stop Pass" right="Stop Run" value={s.defRunPass} />
      )}
    </div>
  );
}

export default function TendenciesView({ school }: { school: School }) {
  const sp = school.splits;
  const plays = sp ? sp.rushAtt + sp.passAtt : 0;
  const runPct = sp ? pct(sp.rushAtt, plays) : 0;

  return (
    <>
      {sp && plays > 0 ? (
        <>
          <div className="section-h">
            <h3>On the field</h3>
            <InfoDot title="On the field">
              <p>
                Splits accumulate from the game's own box scores: the current season once you have
                played, last season before kickoff.
              </p>
            </InfoDot>
            <div className="rule" />
            <span className="count">
              {sp.scope === 'current'
                ? `through ${sp.games} game${sp.games === 1 ? '' : 's'} (${sp.wins}–${sp.losses})`
                : `last season (${sp.wins}–${sp.losses})`}
            </span>
          </div>

          <div className="split-bar">
            <div className="run" style={{ width: `${Math.max(runPct, 12)}%` }}>
              RUN {runPct}%
            </div>
            <div className="pass">PASS {100 - runPct}%</div>
          </div>
          <p className="foot-note" style={{ marginTop: 8 }}>
            {fmt(sp.rushAtt)} rushes for {fmt(sp.rushYds)} yds (
            {(sp.rushYds / Math.max(sp.rushAtt, 1)).toFixed(1)}/carry) · {fmt(sp.passAtt)} dropbacks for{' '}
            {fmt(sp.passYds)} yds ({(sp.passYds / Math.max(sp.passAtt, 1)).toFixed(1)}/att)
          </p>

          <div className="statgrid" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="lbl">3rd Down</div>
              <div className="num">{pct(sp.thirdConv, sp.thirdDowns)}%</div>
              <div className="sub">
                {sp.thirdConv} of {sp.thirdDowns}
              </div>
            </div>
            <div className="stat">
              <div className="lbl">4th Down</div>
              <div className="num">{pct(sp.fourthConv, sp.fourthDowns)}%</div>
              <div className="sub">
                {sp.fourthConv} of {sp.fourthDowns} · {sp.fourthDowns > 0 && sp.fourthDowns / Math.max(sp.games, 1) >= 1.5 ? 'goes for it' : 'selective'}
              </div>
            </div>
            <div className="stat">
              <div className="lbl">Red Zone TD</div>
              <div className="num">{pct(sp.redzoneTds, sp.redzoneTrips)}%</div>
              <div className="sub">
                {sp.redzoneTds} TD · {sp.redzoneFgs} FG in {sp.redzoneTrips} trips
              </div>
            </div>
            <div className="stat">
              <div className="lbl">Turnover Margin</div>
              <div className="num">
                {sp.takeaways - sp.giveaways > 0 ? '+' : ''}
                {sp.takeaways - sp.giveaways}
              </div>
              <div className="sub">
                {sp.takeaways} took · {sp.giveaways} gave
              </div>
            </div>
            <div className="stat">
              <div className="lbl">Defense Faces</div>
              <div className="num">{pct(sp.defPassYds, sp.defPassYds + sp.defRushYds)}%</div>
              <div className="sub">of yards allowed through the air</div>
            </div>
            <div className="stat">
              <div className="lbl">Sacks</div>
              <div className="num">{sp.sacks}</div>
              <div className="sub">{(sp.sacks / Math.max(sp.games, 1)).toFixed(1)} per game</div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty">No season stats yet. They fill in after your first game.</div>
      )}

      {school.staff.length > 0 && (
        <>
          <div className="section-h">
            <h3>Coaching identity</h3>
            <InfoDot title="Coaching identity">
              <p>
                Each meter is a temperament slider read straight from the coach record: run lean and
                aggression on offense, aggression and run focus on defense.
              </p>
              <p>
                The save keeps no per-play man/zone or blitz counts, so sliders and scheme identity
                are the closest signal the game stores.
              </p>
            </InfoDot>
            <div className="rule" />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10
            }}
          >
            {school.staff.map((s) => (
              <StaffCard key={s.role} s={s} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
