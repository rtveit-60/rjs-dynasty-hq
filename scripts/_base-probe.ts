import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const pT = mainTable(fr, 'Player');
await pT.readRecords();
let vT: any = null;
for (const t of (fr as any).tables) if (t?.name === 'CharacterVisuals') {
  if (!vT || (t.header?.recordCapacity ?? 0) > (vT.header?.recordCapacity ?? 0)) vT = t;
}
if (vT && !vT.recordsRead) await vT.readRecords();
const SLOTS = ['HeadWear','FaceMask','Visor','MouthWear','FacePaint','LeftHandWear','LeftShoe','LeftArmWear','Towel','BackPlate','FlakJacket'];
const seen = new Set<string>();
for (const p of pT.records as any[]) {
  if (p.isEmpty) continue;
  const pos = String(val(p, 'Position') ?? '');
  if (!pos || seen.has(pos)) continue;
  const ref = refFromRecord(p, 'CharacterVisuals');
  if (!ref || (ref.tableId === 0 && ref.row === 0)) continue;
  let j: any;
  try { j = JSON.parse(String(vT.records[ref.row]._fields.RawData.value)); } catch { continue; }
  if (!j || !Array.isArray(j.loadouts)) continue;
  seen.add(pos);
  const items: Record<string, string> = {};
  const dupes: string[] = [];
  for (const lo of j.loadouts) for (const el of lo?.loadoutElements ?? []) {
    if (!el?.slotType || !el?.itemAssetName || !SLOTS.includes(el.slotType)) continue;
    if (items[el.slotType] !== undefined && items[el.slotType] !== el.itemAssetName) {
      dupes.push(`${el.slotType}: ${items[el.slotType]} THEN ${el.itemAssetName}`);
    }
    if (items[el.slotType] === undefined) items[el.slotType] = el.itemAssetName;
  }
  if (['QB','HB','WR','K'].includes(pos)) {
    console.log(`${pos}: ${JSON.stringify(items)}`);
    if (dupes.length) console.log(`  CONFLICTS: ${dupes.join(' | ')}`);
  }
}
