/**
 * Team logo matching. Logos aren't stored in the dynasty save (they live in the
 * game's Frostbite archives), so the app offers a one-time, user-triggered
 * import that matches our school names against ESPN's public team directory and
 * caches each school's mark locally. Pure matching logic lives here so the
 * dev harness can exercise it without Electron.
 */

export function slugName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Save name → ESPN location name, where they differ. */
const ALIASES: Record<string, string> = {
  USF: 'South Florida',
  'Southern Mississippi': 'Southern Miss',
  'Miami University': 'Miami (OH)',
  'Florida International': 'FIU',
  'Appalachian State': 'App State',
  UMass: 'Massachusetts'
};

export interface EspnTeam {
  location: string;
  displayName: string;
  logo: string;
}

export interface LogoMatch {
  row: number;
  name: string;
  url: string;
}

export function matchTeams(
  ours: { row: number; longName: string; nickName: string }[],
  espn: EspnTeam[]
): { matches: LogoMatch[]; misses: string[] } {
  const byLocation = new Map<string, EspnTeam>();
  const byDisplay = new Map<string, EspnTeam>();
  for (const t of espn) {
    if (!byLocation.has(norm(t.location))) byLocation.set(norm(t.location), t);
    byDisplay.set(norm(t.displayName), t);
  }

  const matches: LogoMatch[] = [];
  const misses: string[] = [];
  for (const team of ours) {
    if (team.longName.startsWith('FCS ')) continue; // generic filler teams
    const wanted = ALIASES[team.longName] ?? team.longName;
    const hit =
      byLocation.get(norm(wanted)) ??
      byDisplay.get(norm(`${team.longName} ${team.nickName}`)) ??
      byDisplay.get(norm(`${wanted} ${team.nickName}`));
    if (hit?.logo) matches.push({ row: team.row, name: team.longName, url: hit.logo });
    else misses.push(team.longName);
  }
  return { matches, misses };
}

export function parseEspnDirectory(payload: any): EspnTeam[] {
  const out: EspnTeam[] = [];
  const teams = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  for (const entry of teams) {
    const t = entry?.team;
    if (!t) continue;
    out.push({
      location: String(t.location ?? ''),
      displayName: String(t.displayName ?? ''),
      logo: String(t.logos?.[0]?.href ?? '')
    });
  }
  return out;
}

export const ESPN_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000';
