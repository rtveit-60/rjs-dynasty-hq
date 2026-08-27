/**
 * Original bowl marks, drawn on a 24x24 grid.
 *
 * The game ships no readable bowl logo art, so these are our own simple symbols
 * evoking each bowl's namesake — a rose for the Rose Bowl, a saguaro for the
 * Arizona Bowl, an anchor for the Military Bowl at Annapolis. They are
 * deliberately NOT reproductions of any bowl's real logo. Each mark is painted
 * in that bowl's own brand colors, read from the save.
 *
 * Silhouettes are chosen to stay distinct from each other at 16px: the round
 * fruits split into whole-fruit (Orange), cut wheel (Citrus) and cleft (Peach),
 * and the service bowls split into anchor / chevrons / bell / firework / medal /
 * Maltese cross rather than all defaulting to a star.
 *
 * Keyed by the save's stable `AssetName` (survives sponsor renames), with a
 * display-name fallback for rows whose asset name is blank or renamed.
 */

import { isPlayoffRound } from './cfp-mark.ts';

/** `alt` paints with the bowl's secondary color; everything else uses primary. */
export type BowlShape =
  | { t: 'c'; x: number; y: number; r: number; alt?: boolean }
  | { t: 'e'; x: number; y: number; rx: number; ry: number; rot?: number; alt?: boolean }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx?: number; alt?: boolean }
  | { t: 'p'; d: string; alt?: boolean }
  | { t: 'l'; d: string; w?: number; alt?: boolean };

const rad = (deg: number) => (deg * Math.PI) / 180;
const n2 = (v: number) => +v.toFixed(2);

/** Ring of circles — flower petals, cotton lobes. */
const petals = (cx: number, cy: number, dist: number, r: number, count: number, start = -90): BowlShape[] =>
  Array.from({ length: count }, (_, i) => {
    const a = rad(start + (360 / count) * i);
    return { t: 'c' as const, x: n2(cx + Math.cos(a) * dist), y: n2(cy + Math.sin(a) * dist), r };
  });

/** Ring of ellipses pointing outward — poinsettia bracts. */
const blades = (
  cx: number,
  cy: number,
  dist: number,
  rx: number,
  ry: number,
  count: number,
  start = -90
): BowlShape[] =>
  Array.from({ length: count }, (_, i) => {
    const deg = start + (360 / count) * i;
    const a = rad(deg);
    return {
      t: 'e' as const,
      x: n2(cx + Math.cos(a) * dist),
      y: n2(cy + Math.sin(a) * dist),
      rx,
      ry,
      rot: n2(deg + 90)
    };
  });

/** Ring of straight spokes — sun rays, firework spokes. */
const spokes = (
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  count: number,
  w = 1.5,
  start = -90,
  alt = false
): BowlShape[] =>
  Array.from({ length: count }, (_, i) => {
    const a = rad(start + (360 / count) * i);
    return {
      t: 'l' as const,
      d: `M${n2(cx + Math.cos(a) * r0)} ${n2(cy + Math.sin(a) * r0)} L${n2(cx + Math.cos(a) * r1)} ${n2(cy + Math.sin(a) * r1)}`,
      w,
      alt
    };
  });

/** Ring of dots — firework spark tips. */
const sparks = (cx: number, cy: number, dist: number, r: number, count: number, start = -90): BowlShape[] =>
  Array.from({ length: count }, (_, i) => {
    const a = rad(start + (360 / count) * i);
    return { t: 'c' as const, x: n2(cx + Math.cos(a) * dist), y: n2(cy + Math.sin(a) * dist), r };
  });

const STAR =
  'M12 2.6 L14.7 9.4 L21.9 9.8 L16.3 14.3 L18.2 21.3 L12 17.4 L5.8 21.3 L7.7 14.3 L2.1 9.8 L9.3 9.4 Z';
const SHIELD = 'M12 2.4 L20.6 5.4 V12 C20.6 16.8 16.8 20.4 12 21.8 C7.2 20.4 3.4 16.8 3.4 12 V5.4 Z';
const LEAF_R = 'M12.6 6.4 C14.4 3.6 17.6 3 19.4 3.6 C18.8 6.6 16 8.4 13.2 7.6 Z';
/** Four fronds arcing off a crown point — palms, pineapple tops. */
const FRONDS =
  'M12.6 8.6 C9.6 6.2 5.6 6.6 3.4 9.4 C6.4 8.4 9.4 8.8 11.6 10.4 Z M12.6 8.6 C15.6 6.2 19.6 6.6 21.8 9.4 C18.8 8.4 15.8 8.8 13.6 10.4 Z M12.6 8.6 C11.4 5.2 7.8 3.2 4.6 3.8 C7.6 5 9.8 6.6 11.2 9.4 Z M12.6 8.6 C13.8 5.2 17.4 3.2 20.6 3.8 C17.6 5 15.4 6.6 14 9.4 Z';

export const BOWL_ART: Record<string, BowlShape[]> = {
  // ——— New Year's Six ———
  /** Rose Bowl — the Tournament of Roses bloom. */
  Rose_Bowl: [
    ...petals(12, 12.5, 4.4, 4.3, 6),
    { t: 'c', x: 12, y: 12.5, r: 3.6, alt: true },
    { t: 'c', x: 12, y: 12.5, r: 1.7 }
  ],
  /** Sugar Bowl — stacked sugar cubes (the fleur-de-lis is left to New Orleans). */
  Sugar_Bowl: [
    { t: 'r', x: 2.6, y: 12.6, w: 9, h: 9, rx: 1.4 },
    { t: 'r', x: 12.4, y: 12.6, w: 9, h: 9, rx: 1.4 },
    { t: 'r', x: 7.5, y: 2.8, w: 9, h: 9, rx: 1.4 },
    { t: 'r', x: 4.9, y: 14.9, w: 4.4, h: 4.4, rx: 0.8, alt: true },
    { t: 'r', x: 14.7, y: 14.9, w: 4.4, h: 4.4, rx: 0.8, alt: true },
    { t: 'r', x: 9.8, y: 5.1, w: 4.4, h: 4.4, rx: 0.8, alt: true }
  ],
  /** Orange Bowl — whole fruit with a leaf. */
  Orange_Bowl: [
    { t: 'c', x: 12, y: 13.8, r: 7.6 },
    { t: 'p', d: LEAF_R, alt: true },
    { t: 'l', d: 'M12 6.6 V4.4', w: 1.4, alt: true }
  ],
  /** Peach Bowl — the Georgia peach, read by its cleft. */
  Peach_Bowl: [
    { t: 'c', x: 9.9, y: 14.2, r: 6.1 },
    { t: 'c', x: 14.1, y: 14.2, r: 6.1 },
    { t: 'l', d: 'M12 8.6 C10.7 11.2 10.7 14 12 16.6', w: 1.3, alt: true },
    { t: 'p', d: 'M12.4 7.8 C14 5.2 17 4.6 18.6 5.2 C18 7.8 15.4 9.4 13 8.8 Z', alt: true }
  ],
  /**
   * Cotton Bowl — a burst boll: fluffy lint over five spiky bracts. The bracts
   * are spikes rather than a filled star so the lint still reads when a bowl's
   * two brand colors sit close together.
   */
  Cotton_Bowl: [
    ...spokes(12, 12, 4.4, 10.8, 5, 2.3, -90, true),
    ...petals(12, 12, 2.6, 3.1, 4)
  ],
  /** Fiesta Bowl — a celebration starburst. */
  Fiesta_Bowl: [
    {
      t: 'p',
      d: 'M12 1.4 L14.4 6.3 L19.6 4.4 L17.7 9.6 L22.6 12 L17.7 14.4 L19.6 19.6 L14.4 17.7 L12 22.6 L9.6 17.7 L4.4 19.6 L6.3 14.4 L1.4 12 L6.3 9.6 L4.4 4.4 L9.6 6.3 Z'
    },
    { t: 'c', x: 12, y: 12, r: 4.2, alt: true }
  ],

  // ——— Bowl season ———
  /** Citrus Bowl — a cut citrus wheel, so it never reads as the Orange Bowl. */
  Citrus_Bowl: [
    { t: 'c', x: 12, y: 12, r: 8.6 },
    { t: 'c', x: 12, y: 12, r: 7, alt: true },
    ...spokes(12, 12, 0.6, 6.6, 8, 1.5),
    { t: 'c', x: 12, y: 12, r: 1.1 }
  ],
  /** Gator Bowl — an alligator's head seen from above. */
  Gator_Bowl: [
    {
      t: 'p',
      d: 'M12 1.4 C13.1 1.4 13.8 2.4 13.9 4 L14.5 10.2 C17.8 11.1 19.8 13.5 19.8 16.2 C19.8 19.6 16.3 22.2 12 22.2 C7.7 22.2 4.2 19.6 4.2 16.2 C4.2 13.5 6.2 11.1 9.5 10.2 L10.1 4 C10.2 2.4 10.9 1.4 12 1.4 Z'
    },
    { t: 'c', x: 8.7, y: 14.4, r: 1.8, alt: true },
    { t: 'c', x: 15.3, y: 14.4, r: 1.8, alt: true },
    { t: 'c', x: 11.1, y: 3.4, r: 0.6, alt: true },
    { t: 'c', x: 12.9, y: 3.4, r: 0.6, alt: true },
    { t: 'l', d: 'M7.6 19.4 L8.8 21 M12 19.8 V21.6 M16.4 19.4 L15.2 21', w: 1, alt: true }
  ],
  /** Alamo Bowl — the mission's scalloped gable over its arched door. */
  Alamo_Bowl: [
    {
      t: 'p',
      d: 'M3.4 21 V11.4 H5.6 V9.2 C5.6 5.8 8.5 3.4 12 3.4 C15.5 3.4 18.4 5.8 18.4 9.2 V11.4 H20.6 V21 Z'
    },
    { t: 'p', d: 'M10 21 V15.6 C10 14.4 11 13.5 12 13.5 C13 13.5 14 14.4 14 15.6 V21 Z', alt: true }
  ],
  /** Sun Bowl — a sun disc with long straight rays. */
  Sun_Bowl: [{ t: 'c', x: 12, y: 12, r: 5.8 }, ...spokes(12, 12, 7.6, 11, 12, 1.6)],
  /** Texas Bowl — the Lone Star. */
  Texas_Bowl: [{ t: 'p', d: STAR }],
  /** Music City Bowl — an eighth note, for Nashville. */
  Music_City_Bowl: [
    { t: 'e', x: 8.4, y: 17.4, rx: 4.4, ry: 3.3, rot: -22 },
    { t: 'r', x: 11.2, y: 3.6, w: 2, h: 13.6, rx: 0.5 },
    { t: 'p', d: 'M13.2 3.6 C17 5.6 19.4 8 19.4 11.4 C19.4 8.8 16.8 6.9 13.2 6.2 Z' }
  ],
  /** Duke's Mayo Bowl — the jar. */
  Duke_s_Mayo_Bowl: [
    { t: 'r', x: 5.6, y: 7.6, w: 12.8, h: 13.6, rx: 2.2 },
    { t: 'r', x: 4.8, y: 3.6, w: 14.4, h: 4.4, rx: 1.3, alt: true },
    { t: 'r', x: 7.8, y: 11.4, w: 8.4, h: 6, rx: 1, alt: true }
  ],
  /** Pop-Tarts Bowl — a frosted toaster pastry. */
  Pop_Tarts_Bowl: [
    { t: 'r', x: 3.4, y: 5.6, w: 17.2, h: 12.8, rx: 2.4 },
    { t: 'r', x: 6.2, y: 8.4, w: 11.6, h: 7.2, rx: 1.4, alt: true },
    {
      t: 'l',
      d: 'M8.2 10.6 L9.8 10.6 M11.2 13.2 L12.8 13.2 M14.4 10.4 L16 10.4 M9.4 13.6 L11 13.6 M14.2 13.8 L15.8 13.8',
      w: 1.7
    }
  ],
  /** Holiday Bowl — the poinsettia, the game's official flower. */
  Holiday_Bowl: [
    ...blades(12, 12, 5, 2.2, 5.2, 6),
    { t: 'c', x: 12, y: 12, r: 1.5, alt: true },
    { t: 'c', x: 10.3, y: 11.1, r: 1.1, alt: true },
    { t: 'c', x: 13.3, y: 12.8, r: 1.1, alt: true }
  ],
  /** Hawaii Bowl — the pineapple behind the bowl's long-running motif. */
  Hawaii_Bowl: [
    { t: 'e', x: 12, y: 15.2, rx: 5.6, ry: 6.4 },
    {
      t: 'p',
      d: 'M12 9 C11 6 9.4 4 8 3.2 C8.8 5.6 9 7.4 9.4 9.2 Z M12 9 C13 6 14.6 4 16 3.2 C15.2 5.6 15 7.4 14.6 9.2 Z M11.6 9.2 C11.4 6.2 11.7 4 12 2.8 C12.3 4 12.6 6.2 12.4 9.2 Z'
    },
    { t: 'l', d: 'M8.4 12.6 L15.6 17.8 M15.6 12.6 L8.4 17.8', w: 1, alt: true }
  ],
  /** Las Vegas Bowl — a die. */
  Las_Vegas_Bowl: [
    { t: 'r', x: 3.6, y: 3.6, w: 16.8, h: 16.8, rx: 3.4 },
    { t: 'c', x: 8, y: 8, r: 1.6, alt: true },
    { t: 'c', x: 16, y: 8, r: 1.6, alt: true },
    { t: 'c', x: 12, y: 12, r: 1.6, alt: true },
    { t: 'c', x: 8, y: 16, r: 1.6, alt: true },
    { t: 'c', x: 16, y: 16, r: 1.6, alt: true }
  ],
  /** Liberty Bowl — the bell, cracked. */
  Liberty_Bowl: [
    { t: 'p', d: 'M5.4 17.4 C5.4 11 7.8 6.6 12 6.6 C16.2 6.6 18.6 11 18.6 17.4 Z' },
    { t: 'r', x: 4.2, y: 17.4, w: 15.6, h: 2.6, rx: 0.8 },
    { t: 'r', x: 10.6, y: 3.6, w: 2.8, h: 3.2, rx: 0.8, alt: true },
    { t: 'l', d: 'M12.4 9 L11 13 L12.6 14.6 L11.2 17.4', w: 1.3, alt: true }
  ],
  /** Military Bowl — the anchor, for Annapolis. */
  Military_Bowl: [
    { t: 'c', x: 12, y: 4.4, r: 2.3 },
    { t: 'c', x: 12, y: 4.4, r: 1.1, alt: true },
    { t: 'r', x: 11, y: 6, w: 2, h: 14, rx: 0.6 },
    { t: 'r', x: 6.6, y: 8.2, w: 10.8, h: 1.9, rx: 0.9 },
    {
      t: 'p',
      d: 'M4 13.2 C4 18.2 7.6 21.6 12 21.6 C16.4 21.6 20 18.2 20 13.2 H17.6 C17.6 16.8 15.2 19.2 12 19.2 C8.8 19.2 6.4 16.8 6.4 13.2 Z'
    }
  ],
  /** Armed Forces Bowl — rank chevrons. */
  Armed_Forces_Bowl: [
    { t: 'p', d: 'M12 3.6 L20 9.6 L17.6 9.6 L12 5.4 L6.4 9.6 L4 9.6 Z' },
    { t: 'p', d: 'M12 9.4 L20 15.4 L17.6 15.4 L12 11.2 L6.4 15.4 L4 15.4 Z' },
    { t: 'p', d: 'M12 15.2 L20 21.2 L17.6 21.2 L12 17 L6.4 21.2 L4 21.2 Z', alt: true }
  ],
  /** Salute to Veterans Bowl (the old Camellia Bowl) — a service medal. */
  Camellia_Bowl: [
    { t: 'p', d: 'M7.6 2.4 H11 L13.4 9.2 H10 Z' },
    { t: 'p', d: 'M16.4 2.4 H13 L10.6 9.2 H14 Z', alt: true },
    { t: 'c', x: 12, y: 15.4, r: 6.4 },
    {
      t: 'p',
      d: 'M12 10.8 L13.3 14.2 L17 14.4 L14.1 16.7 L15 20.2 L12 18.2 L9 20.2 L9.9 16.7 L7 14.4 L10.7 14.2 Z',
      alt: true
    }
  ],
  /** Independence Bowl — a firework burst. */
  Independence_Bowl: [
    { t: 'c', x: 12, y: 12, r: 1.8 },
    ...spokes(12, 12, 3.4, 8, 8, 1.4),
    ...sparks(12, 12, 9.6, 1.2, 8)
  ],
  /** First Responder Bowl — the firefighter's Maltese cross. */
  First_Responder_Bowl: [
    {
      t: 'p',
      d: 'M12 12 L4.6 4.6 C7 3.2 10 3.2 12 4.8 C14 3.2 17 3.2 19.4 4.6 Z M12 12 L19.4 4.6 C20.8 7 20.8 10 19.2 12 C20.8 14 20.8 17 19.4 19.4 Z M12 12 L19.4 19.4 C17 20.8 14 20.8 12 19.2 C10 20.8 7 20.8 4.6 19.4 Z M12 12 L4.6 19.4 C3.2 17 3.2 14 4.8 12 C3.2 10 3.2 7 4.6 4.6 Z'
    }
  ],
  /** Frisco Bowl — a to-go coffee cup. */
  Frisco_Bowl: [
    { t: 'r', x: 5.4, y: 4.4, w: 13.2, h: 3, rx: 1.1 },
    { t: 'p', d: 'M6.4 8 H17.6 L16 21.4 H8 Z' },
    { t: 'r', x: 7.2, y: 12.4, w: 9.6, h: 4.2, rx: 0.8, alt: true }
  ],
  /** Myrtle Beach Bowl — sun over the surf. */
  Myrtle_Beach_Bowl: [
    { t: 'c', x: 12, y: 8, r: 4.8 },
    {
      t: 'l',
      d: 'M2.4 15.6 C5 13.6 7 13.6 9.6 15.6 C12.2 17.6 14.2 17.6 16.8 15.6 C19 13.9 20.8 13.6 22.6 14.8',
      w: 1.9,
      alt: true
    },
    {
      t: 'l',
      d: 'M2.4 19.8 C5 17.8 7 17.8 9.6 19.8 C12.2 21.8 14.2 21.8 16.8 19.8 C19 18.1 20.8 17.8 22.6 19',
      w: 1.9,
      alt: true
    }
  ],
  /** New Orleans Bowl — the fleur-de-lis. */
  New_Orleans_Bowl: [
    {
      t: 'p',
      d: 'M12 1.8 C13.4 5 14.4 6.8 14.4 8.8 C14.4 10.6 13.4 11.8 12 11.8 C10.6 11.8 9.6 10.6 9.6 8.8 C9.6 6.8 10.6 5 12 1.8 Z'
    },
    { t: 'p', d: 'M11 11.4 C8.4 9.4 4.4 9.6 3.2 12 C2 14.4 4 17.2 7 17.2 C9 17.2 10.6 16 11 14.2 Z' },
    { t: 'p', d: 'M13 11.4 C15.6 9.4 19.6 9.6 20.8 12 C22 14.4 20 17.2 17 17.2 C15 17.2 13.4 16 13 14.2 Z' },
    { t: 'r', x: 10.9, y: 11.6, w: 2.2, h: 10.4, rx: 0.8 },
    { t: 'r', x: 7.6, y: 16.2, w: 8.8, h: 2, rx: 0.8, alt: true }
  ],
  /**
   * New Mexico Bowl — an Albuquerque balloon. Deliberately NOT the Zia sun:
   * that emblem is sacred to Zia Pueblo and its commercial use is contested.
   */
  New_Mexico_Bowl: [
    {
      t: 'p',
      d: 'M12 2.2 C16.7 2.2 20.2 6 20.2 10.5 C20.2 14 17.5 16.9 12 19.6 C6.5 16.9 3.8 14 3.8 10.5 C3.8 6 7.3 2.2 12 2.2 Z'
    },
    { t: 'l', d: 'M8.4 3.8 C6.8 8 6.8 13.4 9.6 18', w: 1.1, alt: true },
    { t: 'l', d: 'M15.6 3.8 C17.2 8 17.2 13.4 14.4 18', w: 1.1, alt: true },
    { t: 'r', x: 10.3, y: 19.8, w: 3.4, h: 2.6, rx: 0.7, alt: true },
    { t: 'l', d: 'M10.2 18.4 L10.6 19.8 M13.8 18.4 L13.4 19.8', w: 0.9, alt: true }
  ],
  /** Arizona Bowl — the Sonoran saguaro. */
  Arizona_Bowl: [
    { t: 'r', x: 10.4, y: 3.6, w: 3.2, h: 18.4, rx: 1.6 },
    { t: 'p', d: 'M6.2 21.4 V13.2 C6.2 10.8 8 9.2 10.4 9.2 V11.7 C9.3 11.7 8.5 12.5 8.5 13.5 V21.4 Z' },
    { t: 'p', d: 'M17.8 21.4 V15.4 C17.8 13 16 11.4 13.6 11.4 V13.9 C14.7 13.9 15.5 14.7 15.5 15.7 V21.4 Z' }
  ],
  /** Boca Raton Bowl — a South Florida palm. */
  Boca_Raton_Bowl: [
    { t: 'p', d: 'M11.2 21.6 C11.2 16 11.6 12.4 12.6 9.4 L14.4 10 C13.6 12.8 13.2 16.2 13.2 21.6 Z' },
    { t: 'p', d: FRONDS, alt: true },
    { t: 'c', x: 12.6, y: 8.8, r: 1.6 }
  ],
  /** Birmingham Bowl — the forge anvil, for Vulcan and the Magic City's iron. */
  Birmingham_Bowl: [
    {
      t: 'p',
      d: 'M2.6 9.2 C5 8.4 7 8.2 9 8.2 H19.4 C20.6 8.2 21 9.2 20 10.2 L17.4 12.8 H13.6 V16 H16.8 C17.8 16 18.4 16.6 18.4 17.6 V20.2 H5.6 V17.6 C5.6 16.6 6.2 16 7.2 16 H10.4 V12.8 H7.4 C5 12.8 3.2 11.4 2.6 9.2 Z'
    }
  ],
  /** Fenway Bowl — a baseball, for the ballpark. */
  Fenway_Bowl: [
    { t: 'c', x: 12, y: 12, r: 8.6 },
    { t: 'l', d: 'M6.6 5.6 C9.2 8.8 9.2 15.2 6.6 18.4', w: 1.4, alt: true },
    { t: 'l', d: 'M17.4 5.6 C14.8 8.8 14.8 15.2 17.4 18.4', w: 1.4, alt: true }
  ],
  /** Gasparilla Bowl — the pirate skull of Tampa's festival. */
  Gasparilla_Bowl: [
    {
      t: 'p',
      d: 'M12 2.8 C17 2.8 20.4 6.4 20.4 11.2 C20.4 14.2 19 16.4 17 17.6 V20.2 H7 V17.6 C5 16.4 3.6 14.2 3.6 11.2 C3.6 6.4 7 2.8 12 2.8 Z'
    },
    { t: 'c', x: 8.8, y: 11, r: 2.4, alt: true },
    { t: 'c', x: 15.2, y: 11, r: 2.4, alt: true },
    { t: 'p', d: 'M12 14.4 L13.4 17 H10.6 Z', alt: true }
  ],
  /** Famous Idaho Potato Bowl — the russet itself. */
  Famous_Idaho_Potato_Bowl: [
    { t: 'e', x: 12, y: 12, rx: 9, ry: 6.2, rot: -18 },
    { t: 'c', x: 8.6, y: 11.4, r: 1.1, alt: true },
    { t: 'c', x: 13.2, y: 9.4, r: 1, alt: true },
    { t: 'c', x: 14.4, y: 14, r: 1.1, alt: true },
    { t: 'c', x: 10, y: 15, r: 0.9, alt: true }
  ],
  /** 68 Ventures Bowl — a warship, for the port of Mobile. */
  '68Ventures_Bowl': [
    { t: 'p', d: 'M2.4 15.6 H21.6 L19 20.6 H5.4 Z' },
    { t: 'r', x: 9.4, y: 8.4, w: 5.4, h: 7.2, rx: 0.7 },
    { t: 'l', d: 'M12.1 8.4 V3.4', w: 1.3 },
    { t: 'l', d: 'M12.1 5 H16', w: 1.1, alt: true },
    { t: 'r', x: 4.4, y: 12.6, w: 4.6, h: 1.7, rx: 0.7, alt: true }
  ],
  /** Rate Bowl — a desert mesa (the game becomes the Cactus Bowl again in 2026). */
  Guaranteed_Rate_Bowl: [
    { t: 'c', x: 12, y: 7, r: 3.8 },
    { t: 'p', d: 'M1.8 20.8 L5.4 13 H13 L16.6 20.8 Z' },
    { t: 'p', d: 'M14.2 20.8 L16.8 15.4 H19.6 L22.2 20.8 Z', alt: true }
  ],
  /** ReliaQuest Bowl — a shield, for the sponsor's security trade. */
  Reliaquest_Bowl: [
    { t: 'p', d: SHIELD },
    { t: 'l', d: 'M7.8 12 L10.8 15 L16.4 9.4', w: 2.2, alt: true }
  ],
  /** Cure Bowl — the awareness ribbon. */
  Cure_Bowl: [
    {
      t: 'p',
      d: 'M12 3 C15.4 3 17.6 5.8 17.6 9 C17.6 12 15.6 14.4 13.6 16.4 L16.8 21.4 L14.2 21.4 L12 17.6 L9.8 21.4 L7.2 21.4 L10.4 16.4 C8.4 14.4 6.4 12 6.4 9 C6.4 5.8 8.6 3 12 3 Z'
    },
    { t: 'c', x: 12, y: 9, r: 2.6, alt: true }
  ],
  /** Xbox Bowl — a controller (the save still calls this slot the Bahamas Bowl). */
  Bahamas_Bowl: [
    {
      t: 'p',
      d: 'M7.4 7.6 H16.6 C19.4 7.6 21.6 10.4 21.6 13.8 C21.6 16.2 20.2 17.8 18.4 17.8 C16.6 17.8 15.8 16.4 12 16.4 C8.2 16.4 7.4 17.8 5.6 17.8 C3.8 17.8 2.4 16.2 2.4 13.8 C2.4 10.4 4.6 7.6 7.4 7.6 Z'
    },
    { t: 'l', d: 'M6.2 12.4 H9.8 M8 10.6 V14.2', w: 1.7, alt: true },
    { t: 'c', x: 15.9, y: 11.4, r: 1.1, alt: true },
    { t: 'c', x: 18.1, y: 13.4, r: 1.1, alt: true }
  ],
  /** Anything the save names that we have no mark for. */
  Generic: [
    { t: 'e', x: 12, y: 12, rx: 9, ry: 5.6 },
    { t: 'l', d: 'M9.4 12 H14.6 M11 10.2 V13.8 M13 10.2 V13.8', w: 1.3, alt: true }
  ]
};

/**
 * Keep a bowl color legible in both themes. Several bowls brand in near-black
 * or white, which disappears against one background or the other. Mixing toward
 * `--ink` self-corrects: the ink token flips with the theme, so a near-black
 * mark lightens in dark mode and stays dark in light mode (and vice versa).
 * Mid-range colors are left exactly as the bowl brands them.
 */
export function readable(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  if (l >= 0.16 && l <= 0.78) return hex;
  return `color-mix(in srgb, ${hex} 55%, var(--ink) 45%)`;
}

/** Display-name routes for save rows whose AssetName is blank or since renamed. */
const NAME_ALIASES: Record<string, string> = {
  'Rate Bowl': 'Guaranteed_Rate_Bowl',
  'Cactus Bowl': 'Guaranteed_Rate_Bowl',
  'Xbox Bowl': 'Bahamas_Bowl',
  'Salute to Veterans Bowl': 'Camellia_Bowl',
  'Generic Bowl': 'Generic'
};

/**
 * Resolve a save bowl to its mark. Returns null for the CFP bracket rows —
 * those are not bowls of their own and render the CFP mark instead.
 */
export function bowlArtKey(assetName: string, name: string): string | null {
  if (isPlayoffRound(name)) return null;
  if (assetName && BOWL_ART[assetName]) return assetName;
  const alias = NAME_ALIASES[name];
  if (alias && BOWL_ART[alias]) return alias;
  const slug = name.replace(/[^A-Za-z0-9]+/g, '_');
  if (BOWL_ART[slug]) return slug;
  return name ? 'Generic' : null;
}
