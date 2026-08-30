import { loadFranchise, mainTable } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
let vT: any = null;
for (const t of (fr as any).tables) if (t?.name === 'CharacterVisuals') {
  if (!vT || (t.header?.recordCapacity ?? 0) > (vT.header?.recordCapacity ?? 0)) vT = t;
}
await vT.readRecords();
const FAMILY: Record<string, RegExp> = {
  HeadWear: /^(GearHelmet_|UC_Hat_)/, FaceMask: /^GearFaceMask_/, Visor: /^GearVisor_/,
  MouthWear: /^GearMouthpiece_/, FacePaint: /^FaceMarks_/, LeftHandWear: /^GearHand_/,
  LeftShoe: /^GearFootwear_/, LeftArmWear: /^(GearArmSleeve_|ArmSleeve_)/, Towel: /^Towel_/,
  BackPlate: /^Backplate_/, FlakJacket: /^Flakjacket_/
};
let checked = 0; const bad = new Map<string, number>();
for (const rec of vT.records as any[]) {
  if (rec.isEmpty) continue;
  let j: any; try { j = JSON.parse(String(rec._fields.RawData.value)); } catch { continue; }
  for (const lo of j?.loadouts ?? []) for (const el of lo?.loadoutElements ?? []) {
    const rx = FAMILY[el?.slotType];
    if (!rx || !el?.itemAssetName) continue;
    checked++;
    if (!rx.test(el.itemAssetName)) {
      const k = `${el.slotType} <- ${el.itemAssetName}`;
      bad.set(k, (bad.get(k) ?? 0) + 1);
    }
  }
}
console.log(`elements checked: ${checked}, family mismatches: ${bad.size}`);
for (const [k, n] of [...bad.entries()].slice(0, 15)) console.log(`  ${k} ×${n}`);
