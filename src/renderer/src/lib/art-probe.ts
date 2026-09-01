import { useEffect, useState } from 'react';

/**
 * Probe an image URL once and remember the answer — used for per-machine
 * extracted art (gameicon://) where absence is normal and the UI should
 * simply not reserve space for it.
 */
const cache = new Map<string, Promise<boolean>>();

export function probeArt(url: string): Promise<boolean> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** True once the URL is known to load; false while unknown or missing. */
export function useArt(url: string | null): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(false);
    if (!url) return;
    let alive = true;
    void probeArt(url).then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, [url]);
  return ok;
}

/** gameicon:// slug for a save asset name ("Alabama_Auburn_Game" → "alabama-auburn-game"). */
export function assetSlug(assetName: string): string {
  return assetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
