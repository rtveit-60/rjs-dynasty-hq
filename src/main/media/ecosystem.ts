/**
 * The Dynasty Wire's fictional media ecosystem: outlets, personalities, and
 * event routing. All outlets and personalities are fictional. Credibility
 * (0-1) = how often a rumor from this source resolves true; speed (1-10) =
 * how early they post relative to the event; volatility (1-10) = willingness
 * to run with unverified claims. Sample phrases use {TOKEN} placeholders that
 * wire-posts.ts fills from real save data — a phrase is only used when every
 * token it needs is available.
 */

export interface MediaOutlet {
  id: string;
  name: string;
  longName?: string;
  archetype: string;
  tone: string;
  tickerPriority: number;
}

export interface MediaPersonality {
  id: string;
  name: string;
  handle: string;
  outlet: string;
  role: string;
  credibility: number;
  speed: number;
  volatility: number;
  toneTags: string[];
  phrases: string[];
}

export const OUTLETS: Record<string, MediaOutlet> = {
  ncsn: {
    id: 'ncsn',
    name: 'NCSN',
    longName: 'National College Sports Network',
    archetype: 'national_broadcast',
    tone: 'authoritative, institutional',
    tickerPriority: 1
  },
  gridiron: {
    id: 'gridiron',
    name: 'The Gridiron',
    archetype: 'subscription_longform',
    tone: 'writerly, analytical, occasionally elegiac',
    tickerPriority: 3
  },
  bluechip: {
    id: 'bluechip',
    name: 'BlueChip',
    longName: 'BlueChip Recruiting Network',
    archetype: 'recruiting_portal_nil',
    tone: 'urgent, insider-y',
    tickerPriority: 2
  },
  npw: {
    id: 'npw',
    name: 'National Press Wire',
    archetype: 'wire_service',
    tone: 'flat, neutral, inverted pyramid',
    tickerPriority: 1
  },
  sidelinepass: {
    id: 'sidelinepass',
    name: 'SidelinePass',
    archetype: 'fast_digital',
    tone: 'conversational, aggregating',
    tickerPriority: 2
  },
  snapcount: {
    id: 'snapcount',
    name: 'The Snap Count',
    archetype: 'betting_analytics',
    tone: 'numbers-first, dry humor',
    tickerPriority: 4
  },
  rooney_show: {
    id: 'rooney_show',
    name: 'The Cal Rooney Show',
    archetype: 'talk_radio',
    tone: 'loud, contrarian, personal',
    tickerPriority: 5
  },
  local_press: {
    id: 'local_press',
    name: 'Local Press',
    archetype: 'beat_local',
    tone: 'granular, program-specific, mildly protective',
    tickerPriority: 3
  },
  social: {
    id: 'social',
    name: 'Independent',
    archetype: 'social_ecosystem',
    tone: 'varies wildly',
    tickerPriority: 6
  }
};

/**
 * Every personality, verbatim from the ecosystem bible. Phrases are the
 * canonical voice samples; wire-posts.ts picks among the ones it can fill.
 */
export const PERSONALITIES: Record<string, MediaPersonality> = {
  marchetti: {
    id: 'marchetti',
    name: 'Wes Marchetti',
    handle: '@WesMarchetti',
    outlet: 'ncsn',
    role: 'Senior National Insider',
    credibility: 0.95,
    speed: 9,
    volatility: 2,
    toneTags: ['terse', 'authoritative', 'scoop-first'],
    phrases: [
      'Sources: {TEAM} is finalizing a deal with {COACH}. An announcement is expected within 24 hours.',
      "I'm told {TEAM} has informed {COACH} he will not return next season.",
      'Sources: {TEAM} is making a change at {ROLE}. {COACH} is out.'
    ]
  },
  whitcomb: {
    id: 'whitcomb',
    name: 'Dana Whitcomb',
    handle: '@DanaWhitcomb',
    outlet: 'ncsn',
    role: 'Playoff & Governance Reporter',
    credibility: 0.9,
    speed: 6,
    volatility: 2,
    toneTags: ['explanatory', 'measured'],
    phrases: [
      "Here's what the committee is actually weighing with {TEAM} at No. {RANK} — and why the argument is thinner than it looks.",
      'Walking through the seeding math after Saturday. {TEAM} controls its own path.',
      'The {TEAM} move to No. {RANK} matters more than it sounds. Explaining it.'
    ]
  },
  ealy: {
    id: 'ealy',
    name: 'Marcus Ealy',
    handle: '@MarcusEaly',
    outlet: 'ncsn',
    role: 'Lead Game Analyst',
    credibility: 0.8,
    speed: 4,
    volatility: 5,
    toneTags: ['film-forward', 'quotable'],
    phrases: [
      '{TEAM} is playing the best football in the country right now and it isn’t close.',
      "You don't win {SCORE} on the road unless the whole roster believes. That told me everything.",
      "I've been wrong about {TEAM} all year. Saying it out loud."
    ]
  },
  steadman: {
    id: 'steadman',
    name: 'Rich Steadman',
    handle: '@RichSteadman',
    outlet: 'ncsn',
    role: 'Studio Host',
    credibility: 0.75,
    speed: 3,
    volatility: 3,
    toneTags: ['connective', 'neutral'],
    phrases: [
      "Big show today. {TEAM}'s season is the story at the top.",
      'Nobody on this desk picked {TEAM}. Nobody.',
      "Let's get to it."
    ]
  },
  raghunathan: {
    id: 'raghunathan',
    name: 'Priya Raghunathan',
    handle: '@PriyaRag',
    outlet: 'ncsn',
    role: 'Sideline Reporter',
    credibility: 0.88,
    speed: 10,
    volatility: 2,
    toneTags: ['immediate', 'factual'],
    phrases: [
      '{COACH} told me at the half: “We’re not tackling. That’s it. That’s the whole thing.”',
      '{TEAM}’s sideline as the clock hit zero: pure disbelief.'
    ]
  },
  tanner: {
    id: 'tanner',
    name: 'Bo Tanner',
    handle: '@BoTanner',
    outlet: 'ncsn',
    role: 'Regional Reporter — South',
    credibility: 0.85,
    speed: 7,
    volatility: 4,
    toneTags: ['drawling', 'well-connected'],
    phrases: [
      'Been on the phone all morning with people around the {TEAM} program. It’s tense.',
      "Don't sleep on what {COACH} is building. That staff can flat recruit.",
      'Hearing {TEAM} had this one locked up longer than anyone let on.'
    ]
  },
  vance: {
    id: 'vance',
    name: 'Callie Vance',
    handle: '@CallieVance',
    outlet: 'ncsn',
    role: 'Regional Reporter — Midwest',
    credibility: 0.86,
    speed: 7,
    volatility: 3,
    toneTags: ['dry', 'detail-oriented'],
    phrases: [
      '{TEAM} keeps winning the unglamorous way. It has been the story since August.',
      '{COACH} declined to make it about himself. Third week in a row.'
    ]
  },
  dolan: {
    id: 'dolan',
    name: 'Everett Dolan',
    handle: '@EverettDolan',
    outlet: 'gridiron',
    role: 'National Columnist',
    credibility: 0.85,
    speed: 2,
    volatility: 4,
    toneTags: ['literary', 'sweeping'],
    phrases: [
      "What happened in {TEAM}'s stadium on Saturday was the sport arguing with itself.",
      '{TEAM} won the game and lost the argument. Both things are true.',
      'We keep asking college football to be two things at once. {TEAM} against {OPPONENT} was the bill coming due.'
    ]
  },
  buscher: {
    id: 'buscher',
    name: 'Nate Buscher',
    handle: '@NateBuscher',
    outlet: 'gridiron',
    role: 'Coaching Carousel Reporter',
    credibility: 0.84,
    speed: 8,
    volatility: 6,
    toneTags: ['aggressive', 'hedged'],
    phrases: [
      'The {TEAM} search moved faster than anyone expected. {COACH} was the call all along.',
      'Three names I kept hearing for the {TEAM} job. Only one was a sitting head coach — and they got him.',
      'Staff movement around {TEAM} incoming. Keep an eye on the coordinator room.'
    ]
  },
  rutherford: {
    id: 'rutherford',
    name: 'Imani Rutherford',
    handle: '@ImaniRuth',
    outlet: 'gridiron',
    role: 'Enterprise & Features Writer',
    credibility: 0.92,
    speed: 1,
    volatility: 1,
    toneTags: ['narrative', 'patient'],
    phrases: [
      'New from me: the six weeks that changed {TEAM}’s season.',
      'For two years nobody at {TEAM} would explain the turnaround. They told me.'
    ]
  },
  okonkwo: {
    id: 'okonkwo',
    name: 'Danny Okonkwo',
    handle: '@DOkonkwo',
    outlet: 'gridiron',
    role: 'Analytics Writer',
    credibility: 0.9,
    speed: 3,
    volatility: 2,
    toneTags: ['numerate', 'corrective'],
    phrases: [
      '{TEAM} is No. {RANK} in the polls and lower in my ratings. The schedule has done a lot of work.',
      'That win was closer than the {CLOSE_SCORE} suggests. Two swings flipped it.',
      '{TEAM} beat {OPPONENT} by exactly what the model expected. Nobody believes me.',
      '{TEAM} is the biggest disagreement between my model and the human consensus.'
    ]
  },
  petrosino: {
    id: 'petrosino',
    name: 'Sam Petrosino',
    handle: '@SamPetrosino',
    outlet: 'gridiron',
    role: 'West Coast Correspondent',
    credibility: 0.87,
    speed: 5,
    volatility: 3,
    toneTags: ['wry', 'structural'],
    phrases: [
      '{TEAM} keeps drawing the late window and keeps winning it. Nobody out here is surprised.',
      '{COACH} on the stretch run: “We’ll be fine.” For once he looked like he meant it.'
    ]
  },
  reed: {
    id: 'reed',
    name: 'Hollis Reed',
    handle: '@HollisReed',
    outlet: 'gridiron',
    role: 'Southern Beat Writer',
    credibility: 0.88,
    speed: 6,
    volatility: 3,
    toneTags: ['embedded', 'skeptical'],
    phrases: [
      "I've covered four coaching changes at {TEAM}. This one feels different, and here's why.",
      'The fan base wanted a name. The athletic director wanted a fit. {TEAM} thinks it got both.'
    ]
  },
  grange: {
    id: 'grange',
    name: 'Tyler Grange',
    handle: '@TylerGrange',
    outlet: 'bluechip',
    role: 'National Recruiting Director',
    credibility: 0.89,
    speed: 9,
    volatility: 4,
    toneTags: ['breathless', 'star-obsessed'],
    phrases: [
      '🚨BREAKING🚨 {STARS}-star {POSITION} {RECRUIT} has COMMITTED to {TEAM}!',
      '{RECRUIT} to {TEAM}. All signs pointed one direction for weeks.',
      "{TEAM}'s class takes a JUMP with that commitment."
    ]
  },
  alvarado: {
    id: 'alvarado',
    name: 'Rico Alvarado',
    handle: '@RicoAlvarado',
    outlet: 'bluechip',
    role: 'Transfer Portal Insider',
    credibility: 0.78,
    speed: 10,
    volatility: 7,
    toneTags: ['rapid-fire', 'hedged'],
    phrases: [
      'Hearing {PLAYER} is expected to enter the portal. Not official yet.',
      '{PLAYER} ({POSITION}) is no longer with the {TEAM} program, per sources.',
      'Portal is about to get busy. Buckle up.'
    ]
  },
  bell: {
    id: 'bell',
    name: 'Shauna Bell',
    handle: '@ShaunaBellNIL',
    outlet: 'bluechip',
    role: 'NIL & Revenue Share Reporter',
    credibility: 0.86,
    speed: 6,
    volatility: 5,
    toneTags: ['money-focused', 'unsentimental'],
    phrases: [
      '{RECRUIT}’s NIL package at {TEAM} is worth a reported {NIL}, with performance escalators.',
      'The number on {RECRUIT}: {NIL}. That’s what it takes now.',
      '{RECRUIT} wanted {NIL_ASK} and got {NIL}. Read into that what you will.',
      'The money mattered here. It always matters now.'
    ]
  },
  whitfield: {
    id: 'whitfield',
    name: 'Deuce Whitfield',
    handle: '@DeuceWhitfield',
    outlet: 'bluechip',
    role: 'Regional Recruiting Analyst',
    credibility: 0.8,
    speed: 5,
    volatility: 4,
    toneTags: ['evaluator', 'enthusiastic'],
    phrases: [
      "Watched all of {RECRUIT}'s tape. He's a {STARS}-star for me, easy.",
      "Best {POSITION} I've evaluated in this class. {TEAM} is going to look really smart for this.",
      '{TEAM} fans: you got a good one.'
    ]
  },
  hallberg: {
    id: 'hallberg',
    name: 'Ed Hallberg',
    handle: '@EdHallbergNPW',
    outlet: 'npw',
    role: 'National Football Writer',
    credibility: 0.93,
    speed: 4,
    volatility: 1,
    toneTags: ['flat', 'institutional'],
    phrases: [
      '{TEAM} moved to No. {RANK} in this week’s poll.',
      '{TEAM} announced that {COACH} has been named {ROLE}.',
      '{TEAM} announced that {COACH} has been relieved of his duties.'
    ]
  },
  lin: {
    id: 'lin',
    name: 'Margaret Lin',
    handle: '@MargaretLinNPW',
    outlet: 'npw',
    role: 'Game Recap Writer',
    credibility: 0.92,
    speed: 8,
    volatility: 1,
    toneTags: ['inverted pyramid', 'no flourish'],
    phrases: [
      '{TEAM} beat {OPPONENT} {SCORE} on Saturday.',
      '“We just kept playing,” {COACH} said after {TEAM}’s {SCORE} win over {OPPONENT}.'
    ]
  },
  dunlavy: {
    id: 'dunlavy',
    name: 'Trey Dunlavy',
    handle: '@TreyDunlavy',
    outlet: 'sidelinepass',
    role: 'National Writer',
    credibility: 0.72,
    speed: 6,
    volatility: 6,
    toneTags: ['listicle', 'engagement-hungry'],
    phrases: [
      'Power Rankings, Week {WEEK}: {TEAM} is rising and it’s finally not close.',
      'Ten things we learned in Week {WEEK}. {TEAM} is most of them.',
      'Nobody had {TEAM} over {OPPONENT}. Nobody honest, anyway.'
    ]
  },
  adeyemi: {
    id: 'adeyemi',
    name: 'Ola Adeyemi',
    handle: '@OlaAdeyemi',
    outlet: 'sidelinepass',
    role: 'News Desk',
    credibility: 0.75,
    speed: 9,
    volatility: 5,
    toneTags: ['quick', 'aggregating'],
    phrases: [
      'Per NCSN, {TEAM} is closing in on a deal. More as we get it.',
      '{TEAM} fans are not taking this well.',
      '{COACH} had a blunt answer when asked about the move.'
    ]
  },
  cardoza: {
    id: 'cardoza',
    name: 'Vince Cardoza',
    handle: '@VinceCardoza',
    outlet: 'sidelinepass',
    role: 'Columnist',
    credibility: 0.7,
    speed: 5,
    volatility: 8,
    toneTags: ['combative', 'declarative'],
    phrases: [
      'Stop pretending {TEAM} is a playoff team. Look at who they’ve beaten.',
      "I'll say what everyone in that press box was thinking about {TEAM}.",
      '{TEAM} should have made this move a year ago. Now it costs twice as much.'
    ]
  },
  farrow: {
    id: 'farrow',
    name: 'Jules Farrow',
    handle: '@JulesFarrow',
    outlet: 'snapcount',
    role: 'Model & Projections',
    credibility: 0.88,
    speed: 4,
    volatility: 2,
    toneTags: ['probabilistic', 'dryly funny'],
    phrases: [
      "{TEAM}'s odds jumped after Saturday. The model saw it before I did.",
      'The model gives {TEAM} a real chance to win out. It has been wrong before. Loudly.',
      'Ran it 10,000 times. {TEAM} makes the field in most of them.'
    ]
  },
  pisani: {
    id: 'pisani',
    name: 'Bobby Pisani',
    handle: '@BobbyPisani',
    outlet: 'snapcount',
    role: 'Betting Analyst',
    credibility: 0.8,
    speed: 8,
    volatility: 5,
    toneTags: ['market-literate', 'slangy'],
    phrases: [
      'The market never believed in {OPPONENT}. It believed in {TEAM}. It was right.',
      'Biggest move of the week and nobody was talking about it. They are now.'
    ]
  },
  rooney: {
    id: 'rooney',
    name: 'Cal Rooney',
    handle: '@CalRooneyShow',
    outlet: 'rooney_show',
    role: 'Host',
    credibility: 0.5,
    speed: 7,
    volatility: 10,
    toneTags: ['bombastic', 'personal'],
    phrases: [
      "I've been telling you for two years about {TEAM}. TWO YEARS.",
      "That fan base doesn't want to hear it. I don't care. I really don't.",
      "Call the show. Tell me I'm wrong about {TEAM}. You can't."
    ]
  },
  ballard: {
    id: 'ballard',
    name: 'Duke Ballard',
    handle: '@DukeBallard',
    outlet: 'rooney_show',
    role: 'Co-host',
    credibility: 0.65,
    speed: 5,
    volatility: 6,
    toneTags: ['genial', 'player-defensive'],
    phrases: [
      "Cal, you've never been in that locker room in November. It's different.",
      "I've played for a coach like that. You'd run through a wall for him.",
      'Everybody wants a villain. Sometimes the other team is just better.'
    ]
  },
  portal_pigeon: {
    id: 'portal_pigeon',
    name: 'Portal Pigeon',
    handle: '@PortalPigeon',
    outlet: 'social',
    role: 'Anonymous Aggregator',
    credibility: 0.42,
    speed: 10,
    volatility: 10,
    toneTags: ['anonymous', 'cryptic'],
    phrases: [
      '👀👀 something happening at {TEAM}',
      'Hearing movement around the {TEAM} program. Grain of salt.',
      'Deleting this later'
    ]
  },
  carousel_hq: {
    id: 'carousel_hq',
    name: 'Coaching Carousel HQ',
    handle: '@CoachCarouselHQ',
    outlet: 'social',
    role: 'Rumor Tracker',
    credibility: 0.58,
    speed: 9,
    volatility: 8,
    toneTags: ['tracker-style', 'unsourced'],
    phrases: [
      '🔴 UPDATE: {COACH} — {TEAM}. Board updated.',
      'Candidate board for the {TEAM} {ROLE} vacancy, updated:',
      'Class tracker updated: {TEAM} after the {RECRUIT} news.'
    ]
  },
  film_room_frank: {
    id: 'film_room_frank',
    name: 'Frank Deitz',
    handle: '@FilmRoomFrank',
    outlet: 'social',
    role: 'Independent Film Analyst',
    credibility: 0.87,
    speed: 3,
    volatility: 2,
    toneTags: ['technical', 'patient'],
    phrases: [
      'Thread on how {TEAM} took it from {OPPONENT}. It’s not the personnel.',
      'This is the concept {TEAM} has run 40 times this year. {OPPONENT} never solved it.'
    ]
  },
  sideline_snitch: {
    id: 'sideline_snitch',
    name: 'Sideline Snitch',
    handle: '@SidelineSnitch',
    outlet: 'social',
    role: 'Chaos Account',
    credibility: 0.28,
    speed: 10,
    volatility: 10,
    toneTags: ['inflammatory', 'deniable'],
    phrases: [
      'What I’m hearing out of {TEAM} right now is not good. Not going to say more.',
      'More on this tomorrow if I’m allowed'
    ]
  },
  cfb_ledger: {
    id: 'cfb_ledger',
    name: 'Anna Kirtley',
    handle: '@CFBLedger',
    outlet: 'social',
    role: 'Independent Business Reporter',
    credibility: 0.91,
    speed: 4,
    volatility: 2,
    toneTags: ['documents-first', 'authoritative'],
    phrases: [
      'The structure of the {TEAM} deal is unusual. Notes below.',
      'This move matters more off the field than on it. Thread.'
    ]
  },
  weatherby: {
    id: 'weatherby',
    name: 'Hank Weatherby',
    handle: '@HankWeatherby',
    outlet: 'local_press',
    role: 'Beat Writer',
    credibility: 0.9,
    speed: 7,
    volatility: 3,
    toneTags: ['granular', 'practical'],
    phrases: [
      'Depth chart notes after the {TEAM} {ROLE} news. Changes coming.',
      'Practice observations: nothing about {RECRUIT}’s film was a surprise to this staff.',
      'What the {TEAM} locker room was saying after the {SCORE} win.'
    ]
  },
  castellanos: {
    id: 'castellanos',
    name: 'Ruth Castellanos',
    handle: '@RuthCastellanos',
    outlet: 'local_press',
    role: 'Local Columnist',
    credibility: 0.83,
    speed: 4,
    volatility: 7,
    toneTags: ['pointed', 'civic-minded'],
    phrases: [
      '{TEAM} fans deserve an honest answer about where this program is going.',
      'This town has been patient. Patience has a shelf life.',
      'The silence from the athletic department was a decision. So is this.'
    ]
  },
  mowrey: {
    id: 'mowrey',
    name: 'Gil Mowrey',
    handle: '@GilMowrey',
    outlet: 'local_press',
    role: 'Veteran Columnist',
    credibility: 0.86,
    speed: 2,
    volatility: 4,
    toneTags: ['nostalgic', 'institutional memory'],
    phrases: [
      'I covered the 1989 team. This {TEAM} group reminds me of them — and this time in a good way.',
      "They've had six coaches since I started. I've heard this press conference before.",
      "The game's changed. Some of it for the better. Some of it not."
    ]
  }
};

/**
 * Who covers what, in order: `first` breaks it, `then` files the follow-ups,
 * `reaction` supplies the takes, `rumor` may front-run the news. Routing keys
 * are the diff engine's event flavors, not the raw kinds.
 */
export const EVENT_ROUTING: Record<
  string,
  { first: string[]; then: string[]; reaction?: string[]; rumor?: string[] }
> = {
  coaching_fired: {
    first: ['marchetti'],
    then: ['hallberg', 'buscher', 'reed', 'castellanos'],
    reaction: ['rooney', 'cardoza', 'carousel_hq', 'dunlavy'],
    rumor: ['portal_pigeon', 'sideline_snitch', 'carousel_hq']
  },
  coaching_hired: {
    first: ['marchetti'],
    then: ['hallberg', 'buscher', 'cfb_ledger', 'weatherby'],
    reaction: ['rooney', 'steadman', 'adeyemi']
  },
  upset_win: {
    first: ['lin'],
    then: ['dolan', 'dunlavy', 'okonkwo', 'farrow'],
    reaction: ['rooney', 'cardoza', 'ealy', 'pisani']
  },
  game_recap: {
    first: ['lin'],
    then: ['okonkwo', 'film_room_frank', 'weatherby'],
    reaction: ['ealy', 'dunlavy', 'ballard']
  },
  recruit_commitment: {
    first: ['grange'],
    then: ['whitfield', 'weatherby', 'bell'],
    reaction: ['carousel_hq', 'tanner']
  },
  portal_entry: {
    first: ['alvarado'],
    then: ['portal_pigeon', 'weatherby'],
    reaction: ['buscher']
  },
  coaching_hot_seat: {
    first: ['carousel_hq'],
    then: ['castellanos', 'reed', 'buscher'],
    reaction: ['rooney', 'cardoza', 'ballard']
  },
  rankings_release: {
    first: ['hallberg'],
    then: ['whitcomb', 'okonkwo', 'farrow', 'dunlavy'],
    reaction: ['rooney', 'cardoza']
  },
  milestone_or_streak: {
    first: ['lin'],
    then: ['mowrey', 'dolan', 'weatherby'],
    reaction: ['steadman']
  },
  season_state: {
    first: ['steadman'],
    then: ['rutherford', 'vance', 'petrosino', 'mowrey'],
    reaction: ['farrow']
  }
};
