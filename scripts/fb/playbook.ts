/**
 * Playbook model builder: decodes the base64→protobuf master gamesheet embedded in a
 * `.../gamesheets/college_<slug>_<side>` EBX asset into a compact, render-ready book model.
 *
 * The protobuf is self-describing (no Frostbite type descriptors needed). Schema (field
 * numbers verified against Air Raid offense + Multiple defense) is documented in
 * docs/RESEARCH.md → "Playbook data — the master gamesheet is self-describing protobuf".
 */

// ---- minimal protobuf reader -------------------------------------------------

export interface PbField {
  field: number;
  wire: number;
  varint?: bigint;
  f32?: number;
  sub?: Buffer;
}

function readVarint(b: Buffer, p: { i: number }): bigint {
  let shift = 0n;
  let result = 0n;
  for (;;) {
    const byte = b[p.i++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return result;
}

/** Parse a protobuf message; returns [] on any structural inconsistency. */
export function pbMessage(b: Buffer): PbField[] {
  const p = { i: 0 };
  const fields: PbField[] = [];
  while (p.i < b.length) {
    const start = p.i;
    const tag = readVarint(b, p);
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (field === 0) return fields;
    if (wire === 0) {
      fields.push({ field, wire, varint: readVarint(b, p) });
    } else if (wire === 2) {
      const len = Number(readVarint(b, p));
      if (p.i + len > b.length) return fields;
      fields.push({ field, wire, sub: b.subarray(p.i, p.i + len) });
      p.i += len;
    } else if (wire === 5) {
      if (p.i + 4 > b.length) return fields;
      fields.push({ field, wire, f32: b.readFloatLE(p.i) });
      p.i += 4;
    } else if (wire === 1) {
      p.i += 8;
      fields.push({ field, wire });
    } else {
      return fields;
    }
    if (p.i <= start) return fields;
  }
  return fields;
}

const first = (fs: PbField[], n: number) => fs.find((f) => f.field === n);
const all = (fs: PbField[], n: number) => fs.filter((f) => f.field === n);
const str = (f?: PbField) => (f?.sub ? f.sub.toString('utf8') : '');
const num = (f?: PbField) => (f?.varint !== undefined ? Number(f.varint) : undefined);

/** Extract the embedded base64 protobuf blob from a master gamesheet EBX payload. */
export function extractMasterProtobuf(ebx: Buffer): Buffer {
  const txt = ebx.toString('latin1');
  const m = txt.match(/[A-Za-z0-9+/]{200,}={0,2}/);
  if (!m) throw new Error('no base64 protobuf blob found in gamesheet');
  return Buffer.from(m[0], 'base64');
}

// ---- render model ------------------------------------------------------------

export interface PlayerAlign {
  x: number;
  y: number;
  posId?: number; // position/slot id (field 5)
  posType?: number; // position-type id (field 7)
  side?: number;
}

export interface RoutePoint {
  x: number;
  y: number;
}

export interface PlayRoute {
  points: RoutePoint[]; // absolute yard coordinates, starting at the player's alignment
}

export interface Play {
  name: string;
  id: number;
  routes: PlayRoute[]; // one per player slot, aligned to formation.alignment order
  buttons: (string | null)[]; // controller passing icon per player slot (null = not a target)
}

export interface Formation {
  family: string;
  name: string;
  personnel: string[];
  alignment: PlayerAlign[]; // base "Normal" alignment, 11 players
  motions: string[]; // alignment-variant names (Normal, M1left, …)
  plays: Play[];
}

export interface PlaybookModel {
  formations: Formation[];
  playCount: number;
}

// ---- geometry ----------------------------------------------------------------

/**
 * Walk one player's route steps into an absolute yard polyline starting at `start`.
 * Each play assignment is `{1:routeId, 3: step[]}`; each step is `{1:stepType, <k>: geom}`
 * where the geometry sub-message carries `{1:distance, 2:angle°, 3:speed%}`. Angle is an
 * absolute heading in degrees with 90° = straight upfield (+y); absent angle = continue
 * previous heading. Steps with no geometry (stance/logic markers) are skipped.
 */
export function walkRoute(start: PlayerAlign, assignment: PbField[]): PlayRoute {
  const points: RoutePoint[] = [{ x: start.x, y: start.y }];
  let heading = 90; // upfield
  let cur = { x: start.x, y: start.y };
  for (const step of all(assignment, 3)) {
    if (!step.sub) continue;
    const sf = pbMessage(step.sub);
    // the geometry is the one sub-message field that carries a float distance
    let geom: PbField[] | null = null;
    for (const f of sf) {
      if (f.field === 1) continue; // stepType
      if (!f.sub) continue;
      const inner = pbMessage(f.sub);
      if (inner.some((x) => x.wire === 5)) {
        geom = inner;
        break;
      }
    }
    if (!geom) continue;
    const dist = first(geom, 1)?.f32;
    const angle = first(geom, 2)?.f32;
    if (dist === undefined || !Number.isFinite(dist) || dist === 0) continue;
    if (angle !== undefined && Number.isFinite(angle)) heading = angle;
    const rad = (heading * Math.PI) / 180;
    cur = { x: cur.x + dist * Math.cos(rad), y: cur.y + dist * Math.sin(rad) };
    points.push({ x: round(cur.x), y: round(cur.y) });
  }
  return { points };
}

const round = (n: number) => Math.round(n * 100) / 100;

// Controller passing icons: outside/slot receivers take the face buttons in read order,
// backfield receivers the bumpers/triggers — the convention the reference sites mirror.
const FACE_BUTTONS = ['X', 'Y', 'A', 'B'];
const BUMPER_BUTTONS = ['RB', 'LB', 'RT', 'LT'];

/** Map field-24 read order (player indices) to controller buttons per player slot. */
function assignButtons(alignment: PlayerAlign[], order: number[]): (string | null)[] {
  const buttons: (string | null)[] = new Array(alignment.length).fill(null);
  let fi = 0;
  let bi = 0;
  for (const pidx of order) {
    const p = alignment[pidx];
    if (!p) continue;
    const isBack = p.y <= -3.5; // set in the backfield
    buttons[pidx] = isBack
      ? BUMPER_BUTTONS[bi++] ?? BUMPER_BUTTONS[BUMPER_BUTTONS.length - 1]
      : FACE_BUTTONS[fi++] ?? BUMPER_BUTTONS[bi++] ?? 'A';
  }
  return buttons;
}

// ---- model builder -----------------------------------------------------------

export function buildPlaybook(masterEbx: Buffer): PlaybookModel {
  const pb = extractMasterProtobuf(masterEbx);
  const root = pbMessage(pb);

  // root is repeated: each field-1 = one formation-family section
  // { 1: family header {1:name}, 2: formation-with-plays[] }.
  const formations: Formation[] = [];
  let playCount = 0;

  for (const section of all(root, 1)) {
    if (!section.sub) continue;
    const sf = pbMessage(section.sub);
    const family = str(first(pbMessage(first(sf, 1)?.sub ?? Buffer.alloc(0)), 1));

    for (const node of all(sf, 2)) {
      if (!node.sub) continue;
      const group = pbMessage(node.sub);
      const fdef = first(group, 1);
      if (!fdef?.sub) continue;
      const ff = pbMessage(fdef.sub);
      const fname = str(first(ff, 1));

      const personnel = all(ff, 12).map((p) => str(first(pbMessage(p.sub!), 1))).filter(Boolean);

      const alignVariants = all(ff, 13).map((a) => pbMessage(a.sub!));
      const motions = alignVariants.map((v) => str(first(v, 1))).filter(Boolean);
      const base = alignVariants[0] ?? [];
      const alignment: PlayerAlign[] = all(base, 4).map((pl) => {
        const pm = pbMessage(pl.sub!);
        const pos = first(pm, 1)?.sub ? pbMessage(first(pm, 1)!.sub!) : [];
        return {
          x: round(first(pos, 1)?.f32 ?? 0),
          y: round(first(pos, 2)?.f32 ?? 0),
          posId: num(first(pm, 5)),
          side: num(first(pm, 6)),
          posType: num(first(pm, 7)),
        };
      });

      const plays: Play[] = all(group, 2).map((pl) => {
        const pm = pbMessage(pl.sub!);
        const assignments = all(pm, 28).map((a) => pbMessage(a.sub!));
        const routes = assignments.map((asn, i) =>
          walkRoute(alignment[i] ?? { x: 0, y: 0 }, asn),
        );
        // field 24 lists the eligible receivers by player index in the game's read order —
        // the passing-icon (controller-button) assignment. See docs/RESEARCH.md.
        const order = all(pm, 24)
          .map((e) => num(first(pbMessage(e.sub!), 1)))
          .filter((n): n is number => n !== undefined);
        return {
          name: str(first(pm, 1)),
          id: num(first(pm, 2)) ?? 0,
          routes,
          buttons: assignButtons(alignment, order),
        };
      });
      playCount += plays.length;

      formations.push({ family, name: fname, personnel, alignment, motions, plays });
    }
  }

  return { formations, playCount };
}
