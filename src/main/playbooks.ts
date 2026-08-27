import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { app } from 'electron';
import type { PlaybookBook, PlaybookFormation } from '../shared/types.ts';
export { decodePlaybookRow } from './parser/franchise.ts';

/**
 * Bundled playbook data, produced offline by scripts/extract-playbooks.ts from the game's
 * Frostbite archives (see docs/RESEARCH.md). The app itself never reads game files — it
 * resolves the save's coach playbook selection against the manifest and reads a gzip.
 *
 *   manifest.json           — coach-row → slug maps, scheme-enum → slug fallback, book directory
 *   books/<o|d>_<slug>.json.gz — one gzipped { formations } per book
 */
function playbooksDir(): string {
  return app?.isPackaged
    ? join(process.resourcesPath, 'playbooks')
    : join(app?.getAppPath() ?? process.cwd(), 'resources', 'playbooks');
}

interface Manifest {
  coachOffense: Record<string, string>;
  coachDefense: Record<string, string>;
  archetypes: Record<string, string>;
  books: Record<string, { side: string; name: string; formationCount: number; playCount: number }>;
}

let manifestCache: Manifest | null | undefined;
function manifest(): Manifest | null {
  if (manifestCache !== undefined) return manifestCache;
  try {
    const file = join(playbooksDir(), 'manifest.json');
    manifestCache = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest) : null;
  } catch {
    manifestCache = null;
  }
  return manifestCache;
}

const bookCache = new Map<string, PlaybookBook | null>();

function loadBook(key: string, side: 'offense' | 'defense', slug: string): PlaybookBook | null {
  if (bookCache.has(key)) return bookCache.get(key) ?? null;
  let book: PlaybookBook | null = null;
  try {
    const file = join(playbooksDir(), 'books', `${key}.json.gz`);
    if (existsSync(file)) {
      const parsed = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as {
        formations: PlaybookFormation[];
      };
      const meta = manifest()?.books[key];
      book = {
        slug,
        side,
        name: meta?.name ?? slug,
        formationCount: meta?.formationCount ?? parsed.formations.length,
        playCount: meta?.playCount ?? parsed.formations.reduce((n, f) => n + f.plays.length, 0),
        formations: parsed.formations,
      };
    }
  } catch {
    book = null;
  }
  bookCache.set(key, book);
  return book;
}

/**
 * Resolve the book a coach actually runs: their playbook-row selection first
 * (Coach.OffensivePlaybook / DefensivePlaybook), falling back to the team's scheme archetype
 * (Default Offensive/Defensive Scheme) when the exact book isn't in the bundled set.
 */
export function resolvePlaybook(
  side: 'offense' | 'defense',
  coachRow: number | null,
  schemeEnum: string,
): PlaybookBook | null {
  const m = manifest();
  if (!m) return null;
  const rowMap = side === 'offense' ? m.coachOffense : m.coachDefense;
  const slug =
    (coachRow != null ? rowMap[String(coachRow)] : undefined) ?? m.archetypes[schemeEnum];
  if (!slug) return null;
  return loadBook(`${side[0]}_${slug}`, side, slug);
}
