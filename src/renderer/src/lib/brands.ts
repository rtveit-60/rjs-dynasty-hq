import type { BrandPack } from '../../../shared/types.ts';

export const BRAND_NAMES: Record<BrandPack, Record<string, string>> = {
  real: {
    espn: 'ESPN',
    gameday: 'College GameDay',
    fox: 'FOX Sports',
    cbs: 'CBS Sports',
    si: 'Sports Illustrated'
  },
  parody: {
    espn: 'BSPN',
    gameday: 'College GameNight',
    fox: 'VOX Sports',
    cbs: 'GBS Sports',
    si: 'Sports Almanac'
  }
};

export function brandName(outlet: string, pack: BrandPack): string {
  return BRAND_NAMES[pack]?.[outlet] ?? BRAND_NAMES.real[outlet] ?? outlet.toUpperCase();
}
