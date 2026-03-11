/**
 * Flight lookup service — two layers:
 * 1. FlightStats API (primary) — real-time flight status with terminal, gate, status
 * 2. Static airline→terminal mapping — instant fallback when API has no data
 *
 * Validates flight numbers and returns arrival airport, terminal, and time.
 * Never blocks booking — graceful fallback on any failure.
 */

const FLIGHTSTATS_BASE = 'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status';

// In-memory cache: key = "BA115:2026-03-15" → { data, ts }
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ── IATA airport code → hub code mapping (UK airports we care about) ─
const AIRPORT_TO_HUB = {
  LHR: 'LHR', LGW: 'LGW', STN: 'STN', LTN: 'LTN', LCY: 'LCY', EDI: 'EDI',
};

// Hub code → human-readable airport name
const HUB_NAMES = {
  LHR: 'Heathrow', LGW: 'Gatwick', STN: 'Stansted',
  LTN: 'Luton', LCY: 'London City Airport', EDI: 'Edinburgh Airport',
};

// ── Static airline IATA code → Heathrow terminal mapping ─────────────
// Source: https://www.lookbookair.com/lhr-airport/airlines/ (March 2026)
// BA operates from T3 (short-haul) AND T5 (most flights) — default T5
const HEATHROW_TERMINALS = {
  // Terminal 2 — Star Alliance + partners
  A3: 'T2', EI: 'T2', AC: 'T2', CA: 'T2', AI: 'T2', NH: 'T2', OZ: 'T2',
  OS: 'T2', AV: 'T2', SN: 'T2', OU: 'T2', MS: 'T2', ET: 'T2', EW: 'T2',
  BR: 'T2', FI: 'T2', B6: 'T2', LM: 'T2', LO: 'T2', LH: 'T2', SK: 'T2',
  ZH: 'T2', SQ: 'T2', LX: 'T2', TP: 'T2', TG: 'T2', TK: 'T2', UA: 'T2',
  // Terminal 3
  AA: 'T3', AM: 'T3', JD: 'T3', CX: 'T3', CI: 'T3', DL: 'T3', EK: 'T3',
  AY: 'T3', HU: 'T3', JL: 'T3', LA: 'T3', ME: 'T3', QF: 'T3', RJ: 'T3',
  UL: 'T3', GS: 'T3', VS: 'T3',
  // Terminal 4
  AH: 'T4', KC: 'T4', AF: 'T4', JU: 'T4', J2: 'T4', BG: 'T4', FB: 'T4',
  MU: 'T4', CZ: 'T4', LY: 'T4', EY: 'T4', GF: 'T4', KQ: 'T4', KL: 'T4',
  KM: 'T4', KE: 'T4', KU: 'T4', MH: 'T4', WY: 'T4', QR: 'T4', AT: 'T4',
  BI: 'T4', WB: 'T4', SV: 'T4', TU: 'T4', HY: 'T4', VN: 'T4', VY: 'T4',
  WS: 'T4',
  // Terminal 5 — British Airways + oneworld partners
  BA: 'T5', IB: 'T5',
};

// ── Static airline IATA code → Gatwick terminal mapping ──────────────
// Source: simpleflying.com Gatwick terminal guide (March 2026)
const GATWICK_TERMINALS = {
  // North Terminal
  MU: 'North', EK: 'North', ET: 'North', B6: 'North', QR: 'North',
  SV: 'North', WS: 'North', XQ: 'North', LH: 'North', FI: 'North',
  AT: 'North', DL: 'North',
  // South Terminal
  EI: 'South', BA: 'South', LS: 'South', DY: 'South', D8: 'South',
  FR: 'South', TP: 'South', TK: 'South', VY: 'South', W6: 'South',
  AI: 'South', A3: 'South', UX: 'South', XR: 'South', QS: 'South',
  OU: 'South', I2: 'South',
};

// ── Airline name lookup (common carriers) ────────────────────────────
const AIRLINE_NAMES = {
  BA: 'British Airways', EK: 'Emirates', AA: 'American Airlines', DL: 'Delta Air Lines',
  UA: 'United Airlines', VS: 'Virgin Atlantic', QF: 'Qantas', CX: 'Cathay Pacific',
  SQ: 'Singapore Airlines', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM',
  QR: 'Qatar Airways', EY: 'Etihad Airways', TK: 'Turkish Airlines', IB: 'Iberia',
  AY: 'Finnair', SK: 'SAS', LX: 'Swiss', OS: 'Austrian Airlines',
  EI: 'Aer Lingus', TP: 'TAP Portugal', FR: 'Ryanair', U2: 'easyJet',
  W6: 'Wizz Air', DY: 'Norwegian', JL: 'Japan Airlines', NH: 'ANA',
  AI: 'Air India', CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern',
  KE: 'Korean Air', OZ: 'Asiana Airlines', MH: 'Malaysia Airlines', TG: 'Thai Airways',
  BR: 'EVA Air', CI: 'China Airlines', GF: 'Gulf Air', WY: 'Oman Air',
  SV: 'Saudia', KU: 'Kuwait Airways', ME: 'Middle East Airlines', RJ: 'Royal Jordanian',
  ET: 'Ethiopian Airlines', KQ: 'Kenya Airways', MS: 'EgyptAir', AT: 'Royal Air Maroc',
  LY: 'El Al', VN: 'Vietnam Airlines', HU: 'Hainan Airlines', BI: 'Royal Brunei',
  AM: 'Aeromexico', LA: 'LATAM Airlines', AV: 'Avianca', AC: 'Air Canada',
  WS: 'WestJet', B6: 'JetBlue', FI: 'Icelandair', LO: 'LOT Polish Airlines',
  SN: 'Brussels Airlines', OU: 'Croatia Airlines', VY: 'Vueling', UL: 'SriLankan Airlines',
  A3: 'Aegean Airlines', LS: 'Jet2', LM: 'Loganair', EW: 'Eurowings',
  KC: 'Air Astana', WB: 'RwandAir', KM: 'KM Malta Airlines',
};

/**
 * Parse a flight number string into carrier code and number.
 * Handles: "BA2534", "BA 2534", "EK007", "FR1234", "TK 199"
 * Also handles alphanumeric carriers: "U2 8345", "W6 1234", "D8 4533"
 * Returns { carrier, flightNum } or null if unparseable.
 */
function parseFlightNumber(flightNumber) {
  if (!flightNumber) return null;
  const cleaned = flightNumber.trim().toUpperCase();
  // Try 2-letter carrier first (most common: BA, EK, AA, etc.)
  const match2 = cleaned.match(/^([A-Z]{2})\s*(\d{1,4})$/);
  if (match2) return { carrier: match2[1], flightNum: match2[2] };
  // Try alphanumeric 2-char carrier (U2, W6, D8, 6E, etc.)
  const matchAlpha = cleaned.match(/^([A-Z\d]{2})\s*(\d{1,4})$/);
  if (matchAlpha) return { carrier: matchAlpha[1], flightNum: matchAlpha[2] };
  // Try 3-letter carrier (rare: THY, etc.)
  const match3 = cleaned.match(/^([A-Z]{3})\s*(\d{1,4})$/);
  if (match3) return { carrier: match3[1], flightNum: match3[2] };
  return null;
}

/**
 * Get terminal from static mapping for a given airline at a UK airport.
 * Returns terminal string (e.g. "T5", "North") or null.
 */
function getStaticTerminal(carrierCode, airportCode) {
  if (airportCode === 'LHR') return HEATHROW_TERMINALS[carrierCode] || null;
  if (airportCode === 'LGW') return GATWICK_TERMINALS[carrierCode] || null;
  return null;
}

/**
 * Look up a flight. Tries FlightStats API → static mapping fallback.
 *
 * @param {string} flightNumber - e.g. "BA2534", "EK007"
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<object>}
 */
async function lookupFlight(flightNumber, date) {
  const parsed = parseFlightNumber(flightNumber);
  if (!parsed) {
    return { valid: false, error: `Could not parse flight number "${flightNumber}"` };
  }

  const { carrier, flightNum } = parsed;
  const flightIata = `${carrier}${flightNum}`;

  // Check cache
  const cacheKey = `${flightIata}:${date}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }

  // 1. Try FlightStats API
  const appId = process.env.FLIGHTSTATS_APP_ID;
  const appKey = process.env.FLIGHTSTATS_APP_KEY;

  if (appId && appKey) {
    try {
      const [year, month, day] = date.split('-');
      const url = `${FLIGHTSTATS_BASE}/${carrier}/${flightNum}/arr/${year}/${month}/${day}?appId=${appId}&appKey=${appKey}&utc=false`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.warn(`[Flight] FlightStats error for ${flightIata}: ${data.error.errorMessage || JSON.stringify(data.error)}`);
      } else if (data.flightStatuses && data.flightStatuses.length > 0) {
        const flight = data.flightStatuses[0];

        // Airline name from appendix
        let airlineName = AIRLINE_NAMES[carrier] || carrier;
        if (data.appendix?.airlines) {
          const airline = data.appendix.airlines.find(a => a.fs === carrier || a.iata === carrier);
          if (airline) airlineName = airline.name;
        }

        const arrivalAirport = flight.arrivalAirportFsCode;

        // Terminal from airportResources
        let arrivalTerminal = flight.airportResources?.arrivalTerminal || null;
        if (arrivalTerminal && /^\d+$/.test(arrivalTerminal)) {
          arrivalTerminal = `T${arrivalTerminal}`;
        }
        if (!arrivalTerminal && arrivalAirport) {
          arrivalTerminal = getStaticTerminal(carrier, arrivalAirport);
        }

        // Arrival time (local)
        let arrivalTime = null;
        const arrDate = flight.arrivalDate?.dateLocal
          || flight.operationalTimes?.scheduledGateArrival?.dateLocal;
        if (arrDate) {
          const match = arrDate.match(/T(\d{2}:\d{2})/);
          if (match) arrivalTime = match[1];
        }

        const result = {
          valid: true,
          carrier,
          flightNum,
          airline: airlineName,
          arrivalAirport,
          arrivalTerminal,
          arrivalTime,
          departureAirport: flight.departureAirportFsCode,
          arrivalAirportName: HUB_NAMES[arrivalAirport] || arrivalAirport,
          status: flight.status,
          source: 'flightstats',
        };

        cache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      }
    } catch (err) {
      console.warn(`[Flight] FlightStats lookup failed for ${flightIata}:`, err.message);
    }
  }

  // 2. Fallback: static terminal mapping
  const staticResult = buildStaticResult(carrier, flightNum);
  if (staticResult) {
    cache.set(cacheKey, { data: staticResult, ts: Date.now() });
    return staticResult;
  }

  return { valid: false, error: `Could not verify flight ${flightIata}. The booking will proceed — we'll confirm the terminal closer to your travel date.` };
}

// ── Static mapping fallback ──────────────────────────────────────────
function buildStaticResult(carrier, flightNum) {
  const lhrTerminal = HEATHROW_TERMINALS[carrier];
  const lgwTerminal = GATWICK_TERMINALS[carrier];

  if (!lhrTerminal && !lgwTerminal) return null;

  const airport = lhrTerminal ? 'LHR' : 'LGW';
  const terminal = lhrTerminal || lgwTerminal;

  return {
    valid: true,
    carrier,
    flightNum,
    airline: AIRLINE_NAMES[carrier] || carrier,
    arrivalAirport: airport,
    arrivalTerminal: terminal,
    arrivalTime: null,
    departureAirport: null,
    arrivalAirportName: HUB_NAMES[airport],
    source: 'static_mapping',
  };
}

module.exports = { lookupFlight, parseFlightNumber, getStaticTerminal, AIRPORT_TO_HUB, HUB_NAMES };
