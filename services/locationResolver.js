const https = require('https');
const http = require('http');
const pool = require('../config/database');

// Cache suggestions for 30 seconds
const suggestionsCache = new Map();
const SUGGESTIONS_TTL = 30 * 1000;

// Cache geocode results for 5 minutes
const geocodeCache = new Map();
const GEOCODE_TTL = 5 * 60 * 1000;

// Cache known zones for 5 minutes
let knownZones = null;
let knownZonesTime = 0;
const ZONES_TTL = 5 * 60 * 1000;

/**
 * Load all distinct zones from prices table AND zone_distances table.
 * This ensures we can resolve zones that only have mileage-based pricing.
 */
async function getKnownZones() {
  if (knownZones && Date.now() - knownZonesTime < ZONES_TTL) {
    return knownZones;
  }
  const [pickups] = await pool.query(
    "SELECT DISTINCT Pickup AS zone FROM prices WHERE Status = 'active'"
  );
  const [dropoffs] = await pool.query(
    "SELECT DISTINCT Dropoff AS zone FROM prices WHERE Status = 'active'"
  );
  const [distZones] = await pool.query(
    "SELECT DISTINCT zone_name AS zone FROM zone_distances"
  );
  const set = new Set();
  for (const row of pickups) set.add(row.zone);
  for (const row of dropoffs) set.add(row.zone);
  for (const row of distZones) set.add(row.zone);
  knownZones = set;
  knownZonesTime = Date.now();
  return knownZones;
}

/**
 * HTTP GET request helper.
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('HTTP GET timeout'));
    });
  });
}

/**
 * HTTP POST request helper (same pattern as booking-api).
 */
function makeRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, body: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('London Tech API timeout'));
    });

    if (data) req.write(data);
    req.end();
  });
}

/**
 * Call london-tech suggestions API with caching.
 */
async function searchSuggestions(query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = suggestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < SUGGESTIONS_TTL) {
    return cached.data;
  }

  const apiBase = process.env.LONDON_TECH_API_URL || 'https://api.london-tech.com/api/v1';
  const url = `${apiBase}/suggestions`;
  const result = await makeRequest(url, 'POST', {
    value: query,
    'session-token': ''
  });

  if (result.status !== 200 || !result.body || !result.body.result) {
    return [];
  }

  const points = Object.values(result.body.result).flat();

  suggestionsCache.set(cacheKey, { data: points, time: Date.now() });

  // Prune old entries
  if (suggestionsCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of suggestionsCache) {
      if (now - v.time > SUGGESTIONS_TTL) suggestionsCache.delete(k);
    }
  }

  return points;
}

/**
 * Call Google Maps Geocoding API to resolve an address to a postcode.
 * Returns the postal_code string or null.
 */
async function geocodeToPostcode(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const cacheKey = address.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.time < GEOCODE_TTL) {
    return cached.data;
  }

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&components=country:GB&key=${apiKey}`;
    const result = await httpGet(url);

    if (result.status !== 200 || !result.body || result.body.status !== 'OK') {
      geocodeCache.set(cacheKey, { data: null, time: Date.now() });
      return null;
    }

    const components = result.body.results[0]?.address_components || [];
    const postalCode = components.find(c => c.types.includes('postal_code'));
    const postcode = postalCode?.long_name || null;

    geocodeCache.set(cacheKey, { data: postcode, time: Date.now() });

    // Prune old entries
    if (geocodeCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of geocodeCache) {
        if (now - v.time > GEOCODE_TTL) geocodeCache.delete(k);
      }
    }

    return postcode;
  } catch (e) {
    console.error('Geocode error:', e.message);
    return null;
  }
}

// Common city/town names → their postcode zone
// This prevents "Oxford" matching "Oxford Circus, London" via suggestions API
const CITY_ZONE_MAP = {
  'oxford': 'OX1',
  'cambridge': 'CB1',
  'brighton': 'BN1',
  'reading': 'RG1',
  'bath': 'BA1',
  'bristol': 'BS1',
  'swindon': 'SN1',
  'milton keynes': 'MK1',
  'northampton': 'NN1',
  'coventry': 'CV1',
  'birmingham': 'B1',
  'leicester': 'LE1',
  'nottingham': 'NG1',
  'derby': 'DE1',
  'sheffield': 'S1',
  'manchester': 'M1',
  'liverpool': 'L1',
  'leeds': 'LS1',
  'york': 'YO1',
  'winchester': 'SO23',
  'canterbury': 'CT1',
  'guildford': 'GU1',
  'ipswich': 'IP1',
  'norwich': 'NR1',
  'exeter': 'EX1',
  'plymouth': 'PL1',
  'bournemouth': 'BH1',
  'portsmouth': 'PO1',
  'cheltenham': 'GL50',
  'gloucester': 'GL1',
  'worcester': 'WR1',
  'peterborough': 'PE1',
  'colchester': 'CO1',
  'chelmsford': 'CM1',
  'basildon': 'SS14',
  'southend': 'SS1',
  'maidstone': 'ME14',
  'chatham': 'ME4',
  'margate': 'CT9',
  'folkestone': 'CT20',
  'ashford': 'TN24',
  'tunbridge wells': 'TN1',
  'crawley': 'RH10',
  'horsham': 'RH12',
  'chichester': 'PO19',
  'worthing': 'BN11',
  'eastbourne': 'BN21',
  'hastings': 'TN34',
  'st albans': 'AL1',
  'watford': 'WD17',
  'hemel hempstead': 'HP1',
  'aylesbury': 'HP20',
  'high wycombe': 'HP11',
  'slough': 'SL1',
  'maidenhead': 'SL6',
  'windsor': 'SL4',
  'bracknell': 'RG12',
  'woking': 'GU21',
  'basingstoke': 'RG21',
  'newbury': 'RG14',
  'salisbury': 'SP1',
  'southampton': 'SO14',
  'portsmouth city': 'PO1',
  'poole': 'BH15',
  'taunton': 'TA1',
  'sunderland': 'SR1',
  'newcastle': 'NE1',
  'edinburgh': 'EH1',
  'glasgow': 'G1',
  'cardiff': 'CF10',
  'swansea': 'SA1',
  'aberdeen': 'AB10',
  'dundee': 'DD1',
  'inverness': 'IV1',
  'belfast': 'BT1',
};

// London neighborhoods, landmarks, hotels, stations, venues → postcode zone
// Used for quoting only — booking still requires specific address/postcode
const LONDON_ZONE_MAP = {
  // ── West End & Central ──────────────────────────────────────────────
  'west end':           'WC2',
  'theatreland':        'WC2',
  'soho':               'W1D',
  'mayfair':            'W1J',
  'marylebone':         'W1U',
  'fitzrovia':          'W1T',
  'bloomsbury':         'WC1B',
  'holborn':            'WC1V',
  'covent garden':      'WC2E',
  'leicester square':   'WC2H',
  'trafalgar square':   'WC2N',
  'the strand':         'WC2R',
  'aldwych':            'WC2B',
  'piccadilly':         'W1J',
  'piccadilly circus':  'W1D',
  'regent street':      'W1B',
  'oxford street':      'W1D',
  'oxford circus':      'W1W',
  'bond street':        'W1S',
  'carnaby street':     'W1F',
  'savile row':         'W1S',
  'harley street':      'W1G',
  'baker street':       'W1U',
  'portland place':     'W1B',
  'chinatown':          'W1D',
  'st james':           'SW1Y',
  "st james's":         'SW1Y',
  'pall mall':          'SW1Y',
  'jermyn street':      'SW1Y',

  // ── Westminster & Government ────────────────────────────────────────
  'westminster':        'SW1A',
  'whitehall':          'SW1A',
  'downing street':     'SW1A',
  'parliament':         'SW1A',
  'houses of parliament': 'SW1A',
  'palace of westminster': 'SW1A',
  'millbank':           'SW1P',
  'pimlico':            'SW1V',
  'victoria':           'SW1E',
  'belgravia':          'SW1W',

  // ── South Bank & Southwark ──────────────────────────────────────────
  'south bank':         'SE1',
  'southwark':          'SE1',
  'waterloo':           'SE1',
  'lambeth':            'SE1',
  'borough':            'SE1',
  'borough market':     'SE1',
  'bermondsey':         'SE1',
  'elephant and castle': 'SE1',
  'bankside':           'SE1',

  // ── City of London ──────────────────────────────────────────────────
  'city of london':     'EC2',
  'the city':           'EC2',
  'bank':               'EC2',
  'moorgate':           'EC2',
  'barbican':           'EC2',
  'clerkenwell':        'EC1R',
  'farringdon':         'EC1A',
  'smithfield':         'EC1A',
  'fleet street':       'EC4A',
  'blackfriars':        'EC4V',
  'monument':           'EC3R',
  'fenchurch street':   'EC3M',
  'aldgate':            'EC3N',
  'bishopsgate':        'EC2M',
  'threadneedle street': 'EC2R',
  'lombard street':     'EC3V',
  'cheapside':          'EC2V',
  'mansion house':      'EC4N',
  'old street':         'EC1V',
  'shoreditch':         'EC2A',

  // ── Knightsbridge, Chelsea & South Kensington ───────────────────────
  'knightsbridge':      'SW1X',
  'chelsea':            'SW3',
  'south kensington':   'SW7',
  'earls court':        'SW5',
  "earl's court":       'SW5',
  'kensington':         'W8',
  'high street kensington': 'W8',
  'holland park':       'W11',
  'notting hill':       'W11',
  'portobello':         'W11',
  'portobello road':    'W11',
  'fulham':             'SW6',
  'parsons green':      'SW6',
  'battersea':          'SW11',
  'clapham':            'SW4',
  'brixton':            'SW9',
  'putney':             'SW15',
  'wandsworth':         'SW18',
  'wimbledon':          'SW19',
  'richmond':           'TW9',
  'twickenham':         'TW1',
  'hampton court':      'KT8',
  'kingston':           'KT1',
  'kingston upon thames': 'KT1',

  // ── Paddington, Bayswater & West ────────────────────────────────────
  'paddington':         'W2',
  'bayswater':          'W2',
  'lancaster gate':     'W2',
  'hammersmith':        'W6',
  'shepherds bush':     'W12',
  "shepherd's bush":    'W12',
  'white city':         'W12',
  'acton':              'W3',
  'chiswick':           'W4',
  'ealing':             'W5',

  // ── North London ───────────────────────────────────────────────────
  'camden':             'NW1',
  'camden town':        'NW1',
  "regent's park":      'NW1',
  'regents park':       'NW1',
  'primrose hill':      'NW1',
  "king's cross":       'N1C',
  'kings cross':        'N1C',
  'st pancras':         'N1C',
  'euston':             'NW1',
  'angel':              'N1',
  'islington':          'N1',
  'highbury':           'N5',
  'finsbury park':      'N4',
  'highgate':           'N6',
  'hampstead':          'NW3',
  'swiss cottage':      'NW3',
  'st johns wood':      'NW8',
  "st john's wood":     'NW8',
  "lord's cricket ground": 'NW8',
  'kilburn':            'NW6',
  'maida vale':         'W9',
  'cricklewood':        'NW2',
  'golders green':      'NW11',
  'hendon':             'NW4',
  'finchley':           'N3',
  'muswell hill':       'N10',
  'crouch end':         'N8',
  'wood green':         'N22',
  'tottenham':          'N17',
  'enfield':            'EN1',
  'barnet':             'EN5',
  'walthamstow':        'E17',
  'edmonton':           'N9',

  // ── East London & Docklands ────────────────────────────────────────
  'canary wharf':       'E14',
  'docklands':          'E14',
  'isle of dogs':       'E14',
  'whitechapel':        'E1',
  'brick lane':         'E1',
  'spitalfields':       'E1',
  'tower hamlets':      'E1',
  'bethnal green':      'E2',
  'bow':                'E3',
  'hackney':            'E8',
  'dalston':            'E8',
  'stratford':          'E15',
  'olympic park':       'E20',
  'queen elizabeth olympic park': 'E20',
  'leyton':             'E10',
  'leytonstone':        'E11',
  'plaistow':           'E13',
  'ilford':             'IG1',
  'romford':            'RM1',
  'barking':            'IG11',
  'dagenham':           'RM10',

  // ── South East London ─────────────────────────────────────────────
  'greenwich':          'SE10',
  'blackheath':         'SE3',
  'lewisham':           'SE13',
  'deptford':           'SE8',
  'peckham':            'SE15',
  'camberwell':         'SE5',
  'dulwich':            'SE21',
  'crystal palace':     'SE19',
  'catford':            'SE6',
  'eltham':             'SE9',
  'woolwich':           'SE18',
  'charlton':           'SE7',
  'bromley':            'BR1',
  'beckenham':          'BR3',
  'croydon':            'CR0',
  'sutton':             'SM1',
  'epsom':              'KT18',

  // ── South West London ─────────────────────────────────────────────
  'tooting':            'SW17',
  'streatham':          'SW16',
  'balham':             'SW12',
  'mitcham':            'CR4',
  'morden':             'SM4',
  'surbiton':           'KT6',
  'new malden':         'KT3',

  // ── Landmarks & Attractions ────────────────────────────────────────
  'buckingham palace':  'SW1A',
  'big ben':            'SW1A',
  'tower of london':    'EC3N',
  'tower bridge':       'SE1',
  'london bridge':      'SE1',
  'london eye':         'SE1',
  'tate modern':        'SE1',
  'tate britain':       'SW1P',
  'british museum':     'WC1B',
  'natural history museum': 'SW7',
  'science museum':     'SW7',
  'victoria and albert museum': 'SW7',
  'v&a museum':         'SW7',
  'v and a':            'SW7',
  'hyde park':          'W2',
  'marble arch':        'W1H',
  'speakers corner':    'W1H',
  'harrods':            'SW1X',
  'selfridges':         'W1A',
  'liberty london':     'W1B',
  'fortnum and mason':  'W1A',
  "fortnum & mason":    'W1A',
  'royal albert hall':  'SW7',
  'albert hall':        'SW7',
  'kensington palace':  'W8',
  'madame tussauds':    'NW1',
  "madame tussaud's":   'NW1',
  'lords cricket ground': 'NW8',
  'the shard':          'SE1',
  'sky garden':         'EC3M',
  'st pauls cathedral':  'EC4M',
  "st paul's cathedral": 'EC4M',
  'westminster abbey':  'SW1P',
  'london zoo':         'NW1',
  'regents park zoo':   'NW1',
  'kew gardens':        'TW9',
  'hampton court palace': 'KT8',
  'greenwich observatory': 'SE10',
  'cutty sark':         'SE10',
  'national gallery':   'WC2N',
  'national portrait gallery': 'WC2H',
  'somerset house':     'WC2R',
  'royal opera house':  'WC2E',
  'london palladium':   'W1F',
  'columbia road':      'E2',

  // ── Rail Stations ──────────────────────────────────────────────────
  'paddington station':   'W2',
  'victoria station':     'SW1V',
  'waterloo station':     'SE1',
  'kings cross station':  'N1C',
  "king's cross station": 'N1C',
  'st pancras station':   'N1C',
  'st pancras international': 'N1C',
  'euston station':       'NW1',
  'liverpool street station': 'EC2M',
  'fenchurch street station': 'EC3M',
  'marylebone station':   'NW1',
  'charing cross station': 'WC2N',
  'london bridge station': 'SE1',
  'blackfriars station':  'EC4V',
  'cannon street station': 'EC4N',
  'moorgate station':     'EC2',

  // ── Venues, Arenas & Exhibition Centres ────────────────────────────
  'the o2':             'SE10',
  'o2 arena':           'SE10',
  'millennium dome':    'SE10',
  'excel centre':       'E16',
  'excel london':       'E16',
  'excel':              'E16',
  'olympia':            'W14',
  'olympia london':     'W14',
  'earls court exhibition centre': 'SW5',
  'alexandra palace':   'N22',
  'ally pally':         'N22',
  'wembley stadium':    'HA9',
  'wembley arena':      'HA9',
  'wembley':            'HA9',
  'tottenham hotspur stadium': 'N17',
  'emirates stadium':   'N5',
  'stamford bridge':    'SW6',
  'the oval':           'SE11',
  'twickenham stadium': 'TW1',
  'lords':              'NW8',

  // ── Business Districts ─────────────────────────────────────────────
  'tech city':          'EC1V',
  'silicon roundabout': 'EC1V',

  // ── Major Hotels (most-searched by airport transfer customers) ─────
  'the ritz':           'W1J',
  'the ritz london':    'W1J',
  'claridges':          'W1K',
  "claridge's":         'W1K',
  'the dorchester':     'W1K',
  'dorchester hotel':   'W1K',
  'the savoy':          'WC2R',
  'savoy hotel':        'WC2R',
  'the langham':        'W1B',
  'langham hotel':      'W1B',
  'corinthia london':   'SW1A',
  'corinthia hotel':    'SW1A',
  'shangri-la the shard': 'SE1',
  'shangri-la at the shard': 'SE1',
  'four seasons park lane': 'W1J',
  'four seasons london': 'W1J',
  'hilton park lane':   'W1K',
  'hilton london paddington': 'W2',
  'hilton paddington':  'W2',
  'hilton bankside':    'SE1',
  'hilton tower bridge': 'SE1',
  'hilton canary wharf': 'E14',
  'hilton kensington':  'W11',
  'hilton olympia':     'W14',
  'hilton metropole':   'W2',
  'intercontinental london': 'W1J',
  'intercontinental park lane': 'W1J',
  'intercontinental o2': 'SE10',
  'marriott park lane': 'W1K',
  'marriott marble arch': 'W1H',
  'marriott county hall': 'SE1',
  'marriott canary wharf': 'E14',
  'jw marriott grosvenor house': 'W1K',
  'grosvenor house':    'W1K',
  'rosewood london':    'WC1V',
  'one aldwych':        'WC2B',
  'the connaught':      'W1K',
  'browns hotel':       'W1S',
  "brown's hotel":      'W1S',
  'the berkeley':       'SW1X',
  'the lanesborough':   'SW1X',
  'mandarin oriental hyde park': 'SW1X',
  'mandarin oriental':  'SW1X',
  'the ned':            'EC2R',
  'nobu hotel london':  'W1S',
  'premier inn london':  'SE1',
  'travelodge covent garden': 'WC2H',
  'citizenm tower of london': 'EC3N',
  'park plaza westminster': 'SE1',
  'park plaza':         'SE1',
  'tower hotel':        'E1W',
  'the tower hotel':    'E1W',
  'leonardo royal hotel london': 'SE1',
  'strand palace hotel': 'WC2R',
  'strand palace':      'WC2R',
  'waldorf hilton':     'WC2B',
  'me london':          'WC2R',
  'st ermins hotel':    'SW1H',
  "st ermin's hotel":   'SW1H',
  'great northern hotel': 'N1C',
  'st pancras renaissance': 'N1C',
  'the standard london': 'N1C',

  // ── Common colloquial names ────────────────────────────────────────
  'central london':     'WC2',
  'central':            'WC2',
  'the west end':       'WC2',
  'east end':           'E1',
  'east london':        'E1',
  'west london':        'W8',
  'north london':       'N1',
  'south london':       'SE1',
  'city centre':        'EC2',
  'london city centre': 'EC2',
  'docklands':          'E14',
};

// UK postcode regex: captures full postcode like "W1K 1LN" or "SW1A 2AA"
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/**
 * Extract the outward code from a postcode string.
 * "W1K 1LN" → "W1K", "SW1A 2AA" → "SW1A"
 */
function extractOutwardCode(postcode) {
  const m = postcode.match(POSTCODE_RE);
  if (m) return m[1].toUpperCase();
  // Maybe it's already just an outward code like "W1K" or "SW1A"
  const outward = /^([A-Z]{1,2}\d[A-Z\d]?)$/i;
  const m2 = postcode.trim().match(outward);
  if (m2) return m2[1].toUpperCase();
  return null;
}

/**
 * Try progressively shorter outward codes against our zones.
 * "W1K" → try "W1K", then "W1"
 * "SW1A" → try "SW1A", then "SW1"
 */
async function matchOutwardToZone(outward) {
  const zones = await getKnownZones();
  // Try exact outward code first
  if (zones.has(outward)) return outward;
  // Try removing the last character (district letter)
  // "W1K" → "W1", "SW1A" → "SW1", "EC2A" → "EC2"
  const shorter = outward.replace(/[A-Z]$/i, '');
  if (shorter !== outward && zones.has(shorter)) return shorter;
  return null;
}

/**
 * Resolve a user's location input to a zone that exists in our prices table.
 * Returns { zone, resolvedAddress, method } or null.
 *
 * Resolution chain:
 * 1. Direct zone match (e.g. "W1", "OX1")
 * 2. Outward code extraction from input (e.g. "W1K 1LN" → "W1K" → "W1")
 * 3. Suggestions API → extract postcodes from addresses
 * 4. Google Maps Geocoding → get postal_code → match zone
 */
async function resolveLocation(input) {
  const trimmed = input.trim();
  const zones = await getKnownZones();

  // 1. Direct match: check if input is already a known zone (case-insensitive)
  for (const z of zones) {
    if (z.toLowerCase() === trimmed.toLowerCase()) {
      return { zone: z, resolvedAddress: z, method: 'direct' };
    }
  }

  // 2. City/town name → zone mapping (prevents "Oxford" → "Oxford Circus, London")
  const cityZone = CITY_ZONE_MAP[trimmed.toLowerCase()];
  if (cityZone) {
    const matched = await matchOutwardToZone(cityZone);
    if (matched) {
      return { zone: matched, resolvedAddress: trimmed, method: 'city_name' };
    }
  }

  // 2b. London neighborhood/landmark/hotel/station → zone mapping (exact match)
  const londonZone = LONDON_ZONE_MAP[trimmed.toLowerCase()];
  if (londonZone) {
    const matched = await matchOutwardToZone(londonZone);
    if (matched) {
      return { zone: matched, resolvedAddress: trimmed, method: 'london_place' };
    }
  }

  // 2c. London place name contained within input (e.g. "Selfridges Oxford Street" → "selfridges")
  //     Picks the longest matching key to prefer specific matches over general ones
  if (!londonZone) {
    let bestZone = null;
    let bestLen = 0;
    for (const [key, zone] of Object.entries(LONDON_ZONE_MAP)) {
      if (key.length < 4) continue; // skip short keys to avoid false matches
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(trimmed) && key.length > bestLen) {
        bestZone = zone;
        bestLen = key.length;
      }
    }
    if (bestZone) {
      const matched = await matchOutwardToZone(bestZone);
      if (matched) {
        return { zone: matched, resolvedAddress: trimmed, method: 'london_place' };
      }
    }
  }

  // 3. Check if input looks like an outward code or full postcode and matches
  const asOutward = extractOutwardCode(trimmed);
  if (asOutward) {
    const matched = await matchOutwardToZone(asOutward);
    if (matched) {
      return { zone: matched, resolvedAddress: trimmed, method: 'postcode' };
    }
  }

  // 3. Call suggestions API to resolve the address
  let points;
  try {
    points = await searchSuggestions(trimmed);
  } catch (e) {
    console.error('Suggestions API error:', e.message);
  }

  if (points && points.length > 0) {
    // Try each suggestion to find one with a matchable postcode in the address text
    for (const pt of points) {
      const addr = pt.address || '';
      const outward = extractOutwardCode(addr);
      if (outward) {
        const matched = await matchOutwardToZone(outward);
        if (matched) {
          return { zone: matched, resolvedAddress: addr, method: 'suggestions_api' };
        }
      }
    }
  }

  // 4. Fallback: use Google Maps Geocoding API
  // Try original input first, then each suggestion address
  const geocodeCandidates = [trimmed];
  if (points && points.length > 0) {
    for (const pt of points) {
      if (pt.address) geocodeCandidates.push(pt.address);
    }
  }

  for (const candidate of geocodeCandidates) {
    try {
      const postcode = await geocodeToPostcode(candidate);
      if (postcode) {
        const outward = extractOutwardCode(postcode);
        if (outward) {
          const matched = await matchOutwardToZone(outward);
          if (matched) {
            return { zone: matched, resolvedAddress: candidate, method: 'geocode' };
          }
        }
      }
    } catch (e) {
      console.error('Geocode fallback error:', e.message);
    }
  }

  return null;
}

/**
 * Get driving distance between two locations using Google Distance Matrix API.
 * Returns { miles, durationMins } or null.
 */
async function getGoogleDrivingDistance(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const o = encodeURIComponent(origin + ', UK');
    const d = encodeURIComponent(destination + ', UK');
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${o}&destinations=${d}&mode=driving&key=${apiKey}`;
    const result = await httpGet(url);

    if (result.status !== 200 || !result.body || result.body.status !== 'OK') return null;

    const el = result.body.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return null;

    const meters = el.distance?.value;
    const seconds = el.duration?.value;
    if (!meters) return null;

    return {
      miles: Math.round((meters / 1609.344) * 100) / 100,
      durationMins: seconds ? Math.round(seconds / 60) : null
    };
  } catch (e) {
    console.error('Google Distance Matrix error:', e.message);
    return null;
  }
}

module.exports = { resolveLocation, getKnownZones, extractOutwardCode, getGoogleDrivingDistance };
