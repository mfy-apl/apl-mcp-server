// Hub code → terminal name mappings (same as apl-website-api)
const HUB_TERMINALS = {
  LHR: ['Heathrow T2', 'Heathrow T3', 'Heathrow T4', 'Heathrow T5'],
  LGW: ['Gatwick North', 'Gatwick South'],
  STN: ['Stansted Airport'],
  LTN: ['Luton'],
  LCY: ['City Airport'],
  EDI: ['Edinburgh Airport'],
  SOC: ['Southampton Cruise Port'],
  DVR: ['Dover Cruise Port'],
  PME: ['Portsmouth Cruise Port'],
  LON: ['Central London'],
  UK: ['UK Airport'],
};

// Aliases that map common names/codes to hub codes
const HUB_ALIASES = {
  // Heathrow
  'heathrow': 'LHR',
  'london heathrow': 'LHR',
  'heathrow airport': 'LHR',
  'london heathrow airport': 'LHR',
  'lhr': 'LHR',
  'heathrow t2': 'LHR',
  'heathrow t3': 'LHR',
  'heathrow t4': 'LHR',
  'heathrow t5': 'LHR',
  'heathrow terminal 2': 'LHR',
  'heathrow terminal 3': 'LHR',
  'heathrow terminal 4': 'LHR',
  'heathrow terminal 5': 'LHR',
  // Gatwick
  'gatwick': 'LGW',
  'london gatwick': 'LGW',
  'gatwick airport': 'LGW',
  'london gatwick airport': 'LGW',
  'lgw': 'LGW',
  'gatwick north': 'LGW',
  'gatwick south': 'LGW',
  'gatwick north terminal': 'LGW',
  'gatwick south terminal': 'LGW',
  // Stansted
  'stansted': 'STN',
  'london stansted': 'STN',
  'stansted airport': 'STN',
  'london stansted airport': 'STN',
  'stn': 'STN',
  // Luton
  'luton': 'LTN',
  'london luton': 'LTN',
  'luton airport': 'LTN',
  'london luton airport': 'LTN',
  'ltn': 'LTN',
  // City Airport
  'city airport': 'LCY',
  'london city': 'LCY',
  'london city airport': 'LCY',
  'lcy': 'LCY',
  // Edinburgh
  'edinburgh': 'EDI',
  'edinburgh airport': 'EDI',
  'edi': 'EDI',
  // Southampton Cruise
  'southampton cruise': 'SOC',
  'southampton cruise port': 'SOC',
  'southampton port': 'SOC',
  'southampton': 'SOC',
  'soc': 'SOC',
  // Dover Cruise
  'dover cruise': 'DVR',
  'dover cruise port': 'DVR',
  'dover port': 'DVR',
  'dover': 'DVR',
  'dvr': 'DVR',
  // Portsmouth Cruise
  'portsmouth cruise': 'PME',
  'portsmouth cruise port': 'PME',
  'portsmouth port': 'PME',
  'portsmouth': 'PME',
  'pme': 'PME',
  // Central London
  'central london': 'LON',
  'london': 'LON',
  'lon': 'LON',
};

// Core airport/port keywords → hub code (for fuzzy substring matching)
// Order matters: more specific keywords first to avoid false matches
const HUB_KEYWORDS = [
  { word: 'heathrow', hub: 'LHR' },
  { word: 'gatwick', hub: 'LGW' },
  { word: 'stansted', hub: 'STN' },
  { word: 'luton', hub: 'LTN' },
  { word: 'city airport', hub: 'LCY' },
  { word: 'london city', hub: 'LCY' },
  { word: 'edinburgh', hub: 'EDI' },
  { word: 'southampton', hub: 'SOC' },
  { word: 'dover', hub: 'DVR' },
  { word: 'portsmouth', hub: 'PME' },
];

/**
 * Try to resolve user input to a hub.
 * Returns { hubCode, terminals } or null if not a hub.
 */
function resolveHub(input) {
  const normalised = input.trim().toLowerCase();

  // 1. Exact alias match (fastest path)
  const hubCode = HUB_ALIASES[normalised];
  if (hubCode) {
    return { hubCode, terminals: HUB_TERMINALS[hubCode] };
  }

  // 2. Check if input is already a hub code in uppercase
  const upper = input.trim().toUpperCase();
  if (HUB_TERMINALS[upper]) {
    return { hubCode: upper, terminals: HUB_TERMINALS[upper] };
  }

  // 3. Strip filler words and try alias match again
  const cleaned = normalised
    .replace(/^(?:the|a|an|is|from|to|at|in|near|around|go|going|get|show|find)\s+/g, '')
    .replace(/\s+(?:please|pls|thanks|airport|station|terminal)$/g, '')
    .trim();
  if (cleaned !== normalised && HUB_ALIASES[cleaned]) {
    const code = HUB_ALIASES[cleaned];
    return { hubCode: code, terminals: HUB_TERMINALS[code] };
  }

  // 4. Keyword substring match — check if input contains an airport/port name
  //    Skip "london" to avoid false matches (only match specific airports)
  for (const { word, hub } of HUB_KEYWORDS) {
    if (normalised.includes(word)) {
      return { hubCode: hub, terminals: HUB_TERMINALS[hub] };
    }
  }

  return null;
}

module.exports = { HUB_TERMINALS, HUB_ALIASES, resolveHub };
