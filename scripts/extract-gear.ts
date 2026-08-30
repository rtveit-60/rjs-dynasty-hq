/**
 * Generate src/shared/gear.ts — the game's own gear vocabulary — from the
 * installed game's data.
 *
 * CharacterVisuals blobs identify equipment by itemAssetName strings, but a
 * save only shows what its players happen to wear (10 of the game's helmets,
 * 34 of its 100+ facemasks). The full wearable vocabulary lives in the game's
 * own loadout JSONs — preset/generated-player loadout documents embedded in
 * Win32 superbundle chunks, the same `{ slotType, itemAssetName }` shape the
 * save's blobs use. Every item offered here appears in a real loadout in game
 * data (dev-only leftovers that exist merely as strings never qualify), and
 * helmet→facemask compatibility is every pairing those loadouts actually
 * dress: the same observed-pairs standard the save-side catalog uses, over a
 * far larger wardrobe.
 *
 * Coach/celebrity wardrobe items (…_C_KO_hat_Item, CoachWardrobe_…) ride the
 * same documents and are filtered out mechanically.
 *
 * Usage: node --max-old-space-size=8192 scripts/extract-gear.ts [--print]
 * Needs the installed game (reads every Win32 superbundle). Run after title
 * updates; never hand-edit the output.
 */
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';

const OUT = 'src/shared/gear.ts';
const printOnly = process.argv.includes('--print');

/** The slots the app offers, keyed by the canonical (left) slot name; the
 *  right side of a pair contributes to the same list. */
const SLOT_SIDES: Record<string, string[]> = {
  HeadWear: ['HeadWear'],
  FaceMask: ['FaceMask'],
  Visor: ['Visor'],
  MouthWear: ['MouthWear'],
  FacePaint: ['FacePaint'],
  LeftHandWear: ['LeftHandWear', 'RightHandWear'],
  LeftShoe: ['LeftShoe', 'RightShoe'],
  LeftArmWear: ['LeftArmWear', 'RightArmWear'],
  Towel: ['Towel'],
  BackPlate: ['BackPlate'],
  FlakJacket: ['FlakJacket']
};
const SIDE_TO_SLOT = new Map<string, string>();
for (const [slot, sides] of Object.entries(SLOT_SIDES)) for (const s of sides) SIDE_TO_SLOT.set(s, slot);

const COACH_WARDROBE = /_C_KO_|^CoachWardrobe/;

const bySlot = new Map<string, Set<string>>();
const helmetMasks = new Map<string, Set<string>>();
const dropped = new Set<string>();
let loadoutChunks = 0;

// Formatted documents: "slotType": "HeadWear", … "itemAssetName": "GearHelmet_X"
const RX_FMT = /"slotType":\s*"([A-Za-z]+)",\s*"itemAssetName":\s*"([^"]{1,64})"/g;

function harvest(s: string): void {
  let saw = false;
  // Helmet↔mask pairs are per loadout block, not per document.
  for (const block of s.split(/"loadoutElements"/)) {
    let helmet: string | null = null;
    let mask: string | null = null;
    for (const m of block.matchAll(RX_FMT)) {
      const [, side, item] = m;
      const slot = SIDE_TO_SLOT.get(side);
      if (!slot) continue;
      saw = true;
      if (COACH_WARDROBE.test(item)) {
        dropped.add(item);
        continue;
      }
      if (!bySlot.has(slot)) bySlot.set(slot, new Set());
      bySlot.get(slot)!.add(item);
      if (side === 'HeadWear') helmet = item;
      if (side === 'FaceMask') mask = item;
    }
    if (helmet && mask) {
      if (!helmetMasks.has(helmet)) helmetMasks.set(helmet, new Set());
      helmetMasks.get(helmet)!.add(mask);
    }
  }
  if (saw) loadoutChunks++;
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const seenGuids = new Set<string>();
for (const sb of layout.superBundles) {
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`)));
  } catch {
    continue;
  }
  for (const chunk of toc.chunks) {
    if (seenGuids.has(chunk.guid)) continue;
    seenGuids.add(chunk.guid);
    if (chunk.location.size > 96 * 1024 * 1024) continue;
    let data: Buffer;
    try {
      data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
    } catch {
      continue;
    }
    if (data.includes('itemAssetName')) harvest(data.toString('latin1'));
    if (data.length >= 4 && data[0] === 0x78) {
      try {
        const image = zlib.inflateSync(data);
        if (image.includes('itemAssetName')) harvest(image.toString('latin1'));
      } catch {
        // not a zlib image after all
      }
    }
  }
}

// ---- anchors: fail loudly rather than emit a thin module ----
const helmets = bySlot.get('HeadWear') ?? new Set();
const masks = bySlot.get('FaceMask') ?? new Set();
if (!helmets.has('GearHelmet_Speed_Flex') || helmets.size < 15) {
  throw new Error(`anchor failed: ${helmets.size} helmets, Speed_Flex ${helmets.has('GearHelmet_Speed_Flex')}`);
}
if (masks.size < 100) throw new Error(`anchor failed: only ${masks.size} facemasks`);
if ((helmetMasks.get('GearHelmet_Speed_Flex')?.size ?? 0) < 20) {
  throw new Error('anchor failed: Speed_Flex mask list too small');
}

const items: Record<string, string[]> = {};
for (const [slot, set] of bySlot) items[slot] = [...set].sort();
const compat: Record<string, string[]> = {};
for (const [h, set] of [...helmetMasks.entries()].sort()) compat[h] = [...set].sort();

console.log(`loadout-bearing chunks: ${loadoutChunks}`);
for (const [slot, list] of Object.entries(items)) console.log(`${slot}: ${list.length}`);
console.log(`helmets with mask pairs: ${Object.keys(compat).length}`);
console.log(`coach-wardrobe items dropped: ${[...dropped].sort().join(', ')}`);

const banner = `/**
 * GENERATED by scripts/extract-gear.ts — do not hand-edit.
 *
 * The game's own gear vocabulary, harvested from the loadout JSON documents
 * in the installed game's Win32 superbundles. Every item appears in a real
 * loadout there (string-pool-only leftovers are excluded), and HELMET_MASKS
 * is every helmet→facemask pairing those loadouts actually dress. Coach
 * wardrobe items are filtered out. Regenerate after game title updates:
 *   node --max-old-space-size=8192 scripts/extract-gear.ts
 */
`;
const body =
  banner +
  `\n/** slot (canonical left side) → every item the game's loadouts wear there. */` +
  `\nexport const GEAR_ITEMS: Record<string, string[]> = ${JSON.stringify(items, null, 2)};\n` +
  `\n/** helmet → the facemasks the game's loadouts pair with it. */` +
  `\nexport const HELMET_MASKS: Record<string, string[]> = ${JSON.stringify(compat, null, 2)};\n`;

if (printOnly) {
  console.log(body);
} else {
  fs.writeFileSync(OUT, body.replace(/\r\n/g, '\n'));
  console.log(`\nwrote ${OUT}`);
}
