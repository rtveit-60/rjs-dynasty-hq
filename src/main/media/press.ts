/**
 * The article desks: bylined reporters for every masthead the wire publishes
 * under, plus depth staff for the fictional outlets. All names are original
 * fiction. Together with the posting personalities in ecosystem.ts the press
 * corps runs 100+ profiles; each reporter's tone drives which templates their
 * stories draw, so two writers covering the same game read differently.
 *
 * Beats: games · postseason · recruiting · coaching · polls · awards · draft ·
 * numbers · feature
 */

export type ReporterTone = 'wire' | 'network' | 'analytic' | 'hype' | 'column' | 'irreverent';

export interface Reporter {
  id: string;
  name: string;
  handle: string;
  /** Masthead id (brand-pack labeled in the UI) or a fictional wire outlet. */
  outlet: string;
  role: string;
  beats: string[];
  tone: ReporterTone;
}

const R = (
  id: string,
  name: string,
  handle: string,
  outlet: string,
  role: string,
  beats: string[],
  tone: ReporterTone
): Reporter => ({ id, name, handle, outlet, role, beats, tone });

export const REPORTERS: Reporter[] = [
  // ——— espn desk ———
  R('esp_calloway', 'Marcus Calloway', '@MarcusCalloway', 'espn', 'Senior National Writer', ['games', 'postseason', 'feature'], 'network'),
  R('esp_ferro', 'Gia Ferro', '@GiaFerro', 'espn', 'National Insider', ['coaching', 'draft'], 'wire'),
  R('esp_whitlow', 'Dez Whitlow', '@DezWhitlow', 'espn', 'Recruiting Director', ['recruiting'], 'hype'),
  R('esp_okafor', 'Sam Okafor', '@SamOkafor', 'espn', 'Game Analyst', ['games', 'numbers'], 'analytic'),
  R('esp_briceno', 'Lena Briceño', '@LenaBriceno', 'espn', 'Playoff Reporter', ['polls', 'postseason'], 'analytic'),
  R('esp_hutch', 'Tom Hutchins', '@TomHutchins', 'espn', 'Columnist', ['feature', 'coaching', 'games'], 'column'),
  R('esp_delgado', 'Ray Delgado', '@RayDelgadoTV', 'espn', 'Studio Reporter', ['games', 'awards'], 'network'),
  R('esp_marsh', 'Kendra Marsh', '@KendraMarsh', 'espn', 'Awards & Honors Desk', ['awards'], 'wire'),
  R('esp_pryor', 'Deion Pryor', '@DeionPryor', 'espn', 'Draft Analyst', ['draft', 'numbers'], 'analytic'),
  R('esp_stanton', 'Cole Stanton', '@ColeStanton', 'espn', 'Saturday Desk', ['games'], 'network'),
  R('esp_ivers', 'Maya Ivers', '@MayaIvers', 'espn', 'Portal & Roster Reporter', ['recruiting', 'coaching'], 'wire'),
  R('esp_bannon', 'Pat Bannon', '@PatBannon', 'espn', 'Poll Watcher', ['polls'], 'analytic'),
  R('esp_royce', 'Alvin Royce', '@AlvinRoyce', 'espn', 'Features Writer', ['feature', 'awards'], 'column'),
  R('esp_tam', 'Jessa Tam', '@JessaTam', 'espn', 'Numbers Desk', ['numbers'], 'analytic'),
  // ——— fox desk ———
  R('fox_maddux', 'Brick Maddux', '@BrickMaddux', 'fox', 'Lead Game Writer', ['games', 'postseason'], 'network'),
  R('fox_soriano', 'Val Soriano', '@ValSoriano', 'fox', 'National Reporter', ['games', 'coaching'], 'network'),
  R('fox_key', 'Damon Key', '@DamonKey', 'fox', 'Big-Game Columnist', ['postseason', 'feature'], 'hype'),
  R('fox_alders', 'Quinn Alders', '@QuinnAlders', 'fox', 'Rankings Desk', ['polls'], 'wire'),
  R('fox_batiste', 'Remy Batiste', '@RemyBatiste', 'fox', 'Recruiting Reporter', ['recruiting'], 'network'),
  R('fox_cho', 'Ellis Cho', '@EllisCho', 'fox', 'Stats & Trends', ['numbers'], 'analytic'),
  R('fox_grimaldi', 'Nico Grimaldi', '@NicoGrimaldi', 'fox', 'Sideline Reporter', ['games', 'awards'], 'network'),
  R('fox_pruitt', 'Harlan Pruitt', '@HarlanPruitt', 'fox', 'Columnist', ['feature', 'coaching'], 'column'),
  R('fox_vega', 'Marisol Vega', '@MarisolVega', 'fox', 'Draft Desk', ['draft'], 'wire'),
  R('fox_dean', 'Tucker Dean', '@TuckerDean', 'fox', 'Saturday Wrap', ['games'], 'hype'),
  // ——— cbs desk ———
  R('cbs_langford', 'Miles Langford', '@MilesLangford', 'cbs', 'Senior Writer', ['games', 'feature'], 'analytic'),
  R('cbs_ruiz', 'Carmen Ruiz', '@CarmenRuizCFB', 'cbs', 'National Reporter', ['coaching', 'polls'], 'wire'),
  R('cbs_thibodaux', 'Beau Thibodaux', '@BeauThibodaux', 'cbs', 'South Correspondent', ['games', 'recruiting'], 'column'),
  R('cbs_neary', 'Fiona Neary', '@FionaNeary', 'cbs', 'Numbers Columnist', ['numbers', 'polls'], 'analytic'),
  R('cbs_holt', 'Gardner Holt', '@GardnerHolt', 'cbs', 'Postseason Desk', ['postseason'], 'analytic'),
  R('cbs_amaya', 'Rosa Amaya', '@RosaAmaya', 'cbs', 'Recruiting Analyst', ['recruiting'], 'wire'),
  R('cbs_franks', 'Ossie Franks', '@OssieFranks', 'cbs', 'Awards Desk', ['awards'], 'wire'),
  R('cbs_kessler', 'Jonah Kessler', '@JonahKessler', 'cbs', 'Draft Reporter', ['draft'], 'analytic'),
  R('cbs_pham', 'Lily Pham', '@LilyPham', 'cbs', 'Game Desk', ['games'], 'wire'),
  R('cbs_ostrander', 'Gus Ostrander', '@GusOstrander', 'cbs', 'Columnist', ['feature', 'games'], 'column'),
  // ——— gameday desk ———
  R('gd_bosworth', 'Sonny Bosworth', '@SonnyBosworth', 'gameday', 'Host Desk', ['games', 'feature'], 'hype'),
  R('gd_ricketts', 'Ty Ricketts', '@TyRicketts', 'gameday', 'Campus Reporter', ['games', 'postseason'], 'hype'),
  R('gd_moss', 'Angela Moss', '@AngelaMoss', 'gameday', 'Features & Pageantry', ['feature', 'awards'], 'column'),
  R('gd_leblanc', 'Cy LeBlanc', '@CyLeBlanc', 'gameday', 'Rivalry Historian', ['games', 'feature'], 'column'),
  R('gd_farley', 'Bump Farley', '@BumpFarley', 'gameday', 'Picks Desk', ['games', 'polls'], 'irreverent'),
  R('gd_soto', 'Iris Soto', '@IrisSoto', 'gameday', 'Recruiting Trail', ['recruiting'], 'hype'),
  R('gd_crane', 'Walt Crane', '@WaltCrane', 'gameday', 'Awards Stage', ['awards'], 'hype'),
  R('gd_iverson', 'Nell Iverson', '@NellIverson', 'gameday', 'Saturday Scenes', ['games'], 'network'),
  // ——— si desk ———
  R('si_ashford', 'Vera Ashford', '@VeraAshford', 'si', 'Senior Writer', ['feature', 'games'], 'column'),
  R('si_beaumont', 'Judge Beaumont', '@JudgeBeaumont', 'si', 'The Long Read', ['feature', 'coaching'], 'column'),
  R('si_castell', 'Enzo Castell', '@EnzoCastell', 'si', 'Recruiting Writer', ['recruiting'], 'column'),
  R('si_drummond', 'Faye Drummond', '@FayeDrummond', 'si', 'Postseason Writer', ['postseason', 'awards'], 'column'),
  R('si_eastman', 'Hal Eastman', '@HalEastman', 'si', 'National Desk', ['games', 'polls'], 'analytic'),
  R('si_novak', 'Petra Novak', '@PetraNovak', 'si', 'Draft & Development', ['draft', 'numbers'], 'analytic'),
  R('si_quill', 'Aurelio Quill', '@AurelioQuill', 'si', 'Columnist-at-Large', ['feature', 'games'], 'column'),
  R('si_winslow', 'Dot Winslow', '@DotWinslow', 'si', 'Awards Writer', ['awards'], 'column'),
  // ——— depth staff for the fictional wire outlets ———
  R('ncsn_okoro', 'Chidi Okoro', '@ChidiOkoro', 'ncsn', 'Overnight Desk', ['games', 'polls'], 'wire'),
  R('ncsn_liu', 'Vivian Liu', '@VivianLiu', 'ncsn', 'Roster Reporter', ['recruiting', 'coaching'], 'wire'),
  R('ncsn_burdette', 'Ash Burdette', '@AshBurdette', 'ncsn', 'Postseason Unit', ['postseason'], 'network'),
  R('grid_severin', 'Lotte Severin', '@LotteSeverin', 'gridiron', 'Contributing Writer', ['feature', 'awards'], 'column'),
  R('grid_ames', 'Percy Ames', '@PercyAmes', 'gridiron', 'History Desk', ['feature', 'games'], 'column'),
  R('grid_yun', 'Sable Yun', '@SableYun', 'gridiron', 'Charting Project', ['numbers'], 'analytic'),
  R('bc_teller', 'Rook Teller', '@RookTeller', 'bluechip', 'Class Rankings Analyst', ['recruiting'], 'hype'),
  R('bc_mahoe', 'Kai Mahoe', '@KaiMahoe', 'bluechip', 'West Recruiting', ['recruiting'], 'network'),
  R('bc_sisk', 'Etta Sisk', '@EttaSisk', 'bluechip', 'NIL Ledger', ['recruiting'], 'analytic'),
  R('npw_vann', 'Cordelia Vann', '@CordeliaVann', 'npw', 'Agate Desk', ['numbers', 'awards'], 'wire'),
  R('npw_ibrahim', 'Musa Ibrahim', '@MusaIbrahim', 'npw', 'National Wire', ['games', 'draft'], 'wire'),
  R('sp_gentry', 'Boone Gentry', '@BooneGentry', 'sidelinepass', 'Trending Desk', ['games', 'polls'], 'irreverent'),
  R('sp_calder', 'Mimi Calder', '@MimiCalder', 'sidelinepass', 'Quick Hits', ['recruiting', 'awards'], 'network'),
  R('sc_voss', 'Harmon Voss', '@HarmonVoss', 'snapcount', 'Market Recap', ['games', 'numbers'], 'analytic'),
  R('lp_ferrell', 'June Ferrell', '@JuneFerrell', 'local_press', 'City Desk', ['games', 'coaching'], 'wire'),
  R('lp_okada', 'Ren Okada', '@RenOkada', 'local_press', 'Prep & Recruiting Beat', ['recruiting'], 'wire'),
  R('lp_stack', 'Emmett Stack', '@EmmettStack', 'local_press', 'Sunday Column', ['feature'], 'column'),
  R('tap_burgess', 'Sunny Burgess', '@SunnyBurgess', 'the_tap', 'Vibes Correspondent', ['games', 'awards'], 'irreverent'),
  R('tap_mccrae', 'Ziggy McCrae', '@ZiggyMcCrae', 'the_tap', 'Tailgate Bureau', ['games', 'feature'], 'irreverent'),
  R('ff_leclair', 'Odette LeClair', '@OdetteLeClair', 'fontaine_show', 'Producer & Second Chair', ['awards', 'feature'], 'column')
];

/** Reporter lookup for byline assignment: same outlet, right beat, seeded pick. */
export function reporterFor(outlet: string, beat: string, seedHash: number): Reporter | null {
  const staff = REPORTERS.filter((r) => r.outlet === outlet && r.beats.includes(beat));
  if (!staff.length) return null;
  return staff[seedHash % staff.length];
}
