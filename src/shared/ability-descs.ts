/**
 * One lookup for "what does this ability do", by the name the app displays.
 * Mental abilities are keyed by the game's display name (the save's member id
 * also resolves); physical abilities by the slot name. Both maps are generated
 * from the game's own SignatureAbility.Description strings — an ability the
 * game never described returns null, never invented text.
 */
import { MENTAL_ABILITIES } from './mental-abilities.ts';
import { PHYSICAL_ABILITY_DESCS } from './physical-abilities.ts';

const MENTAL_BY_NAME: Map<string, string | null> = new Map();
for (const [id, def] of Object.entries(MENTAL_ABILITIES)) {
  MENTAL_BY_NAME.set(def.name.toLowerCase(), def.desc);
  MENTAL_BY_NAME.set(id.toLowerCase(), def.desc);
}

export function abilityDesc(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim();
  if (PHYSICAL_ABILITY_DESCS[key]) return PHYSICAL_ABILITY_DESCS[key];
  const m = MENTAL_BY_NAME.get(key.toLowerCase()) ?? MENTAL_BY_NAME.get(key.replace(/\s+/g, '').toLowerCase());
  return m ?? null;
}
