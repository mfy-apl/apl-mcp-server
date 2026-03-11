const pool = require('../config/database');
const { searchSuggestions, getGooglePlaceDetails, getQuotation, createReservation } = require('../services/londonTechClient');
const { findMeetingPoint } = require('../data/meetingPoints');
const { resolveLocation } = require('../services/locationResolver');
const { lookupFlight, AIRPORT_TO_HUB } = require('../services/flightStatsClient');

// Valid waiting pickup times for London Tech airport pickups (minutes after landing)
const VALID_WAITING_TIMES = [15, 30, 45, 60, 75, 90, 105, 120];

/**
 * Calculate waiting pickup time (minutes after flight landing).
 * Customer says "pick me up at 15:30", flight lands at 14:10 → 80 mins → rounds to 75.
 */
function calculateWaitingTime(arrivalTime, requestedTime) {
  const [arrH, arrM] = arrivalTime.split(':').map(Number);
  const [reqH, reqM] = requestedTime.split(':').map(Number);
  let diff = (reqH * 60 + reqM) - (arrH * 60 + arrM);
  if (diff < 0) diff += 24 * 60; // midnight crossing
  // Round down to nearest valid option (don't make driver wait longer than customer asked)
  if (diff <= 15) return 15;
  if (diff >= 120) return 120;
  // Find the largest valid time that doesn't exceed the diff
  for (let i = VALID_WAITING_TIMES.length - 1; i >= 0; i--) {
    if (VALID_WAITING_TIMES[i] <= diff) return VALID_WAITING_TIMES[i];
  }
  return 15;
}

// London Tech car type IDs
const CAR_TYPE_MAP = {
  1: 'Saloon',
  2: 'People Carrier',
  3: '8 Seater',
  4: 'Executive Saloon',
  5: 'Executive MPV',
  6: 'Executive 8 Seater',
  7: 'Mercedes S Class',
  14: 'Estate',
  16: 'Executive People Carrier',
  18: '16 Seater',
  19: '20 Seater',
  20: '40 Seater'
};

// Reverse map: name → id
const CAR_NAME_TO_ID = {};
for (const [id, name] of Object.entries(CAR_TYPE_MAP)) {
  CAR_NAME_TO_ID[name.toLowerCase()] = parseInt(id);
}

function generateBookingRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 6; i++) ref += chars.charAt(Math.floor(Math.random() * chars.length));
  return `APL-${ref}`;
}

/**
 * Normalize query so London Tech system search returns accurate results.
 * Expands abbreviations like "T2" → "Terminal 2" so system airports match.
 */
// Full UK postcode regex: "SW1A 2AA", "W1K 1LN", "EC2R 8AH" etc.
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

function normalizeQuery(query) {
  let q = query;
  const lower = q.toLowerCase();
  const airportKeywords = ['heathrow', 'gatwick', 'stansted', 'luton', 'city airport', 'edinburgh', 'lhr', 'lgw', 'stn', 'ltn', 'lcy', 'airport'];
  const isAirport = airportKeywords.some(kw => lower.includes(kw));

  if (isAirport) {
    // Expand terminal abbreviations and airport codes
    q = q.replace(/\bT(\d)\b/gi, 'Terminal $1');
    q = q.replace(/\bLHR\b/gi, 'Heathrow Airport');
    q = q.replace(/\bLGW\b/gi, 'Gatwick Airport');
    q = q.replace(/\bSTN\b/gi, 'Stansted Airport');
    q = q.replace(/\bLTN\b/gi, 'Luton Airport');
    q = q.replace(/\bLCY\b/gi, 'London City Airport');
    return q;
  }

  // Check if the query contains a known station, cruise port, or landmark name
  // If so, search by that name instead of extracting the postcode
  const stationKeywords = [
    'st pancras', 'st. pancras', 'king\'s cross', 'kings cross', 'paddington station',
    'victoria station', 'waterloo station', 'euston station', 'liverpool street',
    'marylebone station', 'charing cross station', 'london bridge station',
    'blackfriars station', 'fenchurch street station', 'cannon street station',
    'moorgate station',
    'southampton cruise', 'southampton port', 'dover cruise', 'dover port',
    'portsmouth cruise', 'portsmouth port',
    'gatwick', 'stansted', 'luton', 'city airport'
  ];
  const lowerQ = lower;
  for (const kw of stationKeywords) {
    if (lowerQ.includes(kw)) {
      return kw.replace(/\b\w/g, c => c.toUpperCase()); // e.g. "St Pancras"
    }
  }

  // If query contains a full UK postcode, extract it so system postcode (pcatId 5) matches first
  const postcodeMatch = q.match(UK_POSTCODE_RE);
  if (postcodeMatch) {
    return postcodeMatch[1].trim();
  }

  return q;
}

/**
 * Pick best matching point from suggestions results.
 * Prefers airports (pcatId 1) for airport-related queries.
 */
function pickBestPoint(points, query) {
  if (points.length === 0) return null;

  const q = query.toLowerCase();
  const airportKeywords = ['heathrow', 'gatwick', 'stansted', 'luton', 'city airport', 'edinburgh', 'lhr', 'lgw', 'stn', 'ltn'];
  const isAirportQuery = airportKeywords.some(kw => q.includes(kw));

  if (isAirportQuery) {
    // Prefer airport points (pcatId 1) with a terminal
    const airports = points.filter(p => p.pcatId === 1);
    if (airports.length > 0) return airports[0];
  }

  // For station-related queries, prefer station/place points (pcatId 3, 10, 7) over postcodes (5)
  const stationWords = ['station', 'pancras', 'kings cross', "king's cross", 'euston', 'paddington', 'waterloo', 'victoria station', 'liverpool street', 'marylebone', 'charing cross', 'blackfriars'];
  const isStationQuery = stationWords.some(kw => q.includes(kw));
  if (isStationQuery) {
    const stations = points.filter(p => [3, 10, 7].includes(p.pcatId));
    if (stations.length > 0) return stations[0];
  }

  // For cruise-related queries, prefer cruise points (pcatId 2)
  const cruiseWords = ['cruise', 'port', 'southampton', 'dover', 'portsmouth'];
  const isCruiseQuery = cruiseWords.some(kw => q.includes(kw));
  if (isCruiseQuery) {
    const cruises = points.filter(p => p.pcatId === 2);
    if (cruises.length > 0) return cruises[0];
  }

  // For postcodes, prefer pcatId 5
  if (/^[A-Z]{1,2}\d{1,2}\s*\d?[A-Z]{0,2}$/i.test(q.trim())) {
    const postcodes = points.filter(p => p.pcatId === 5);
    if (postcodes.length > 0) return postcodes[0];
  }

  // Default: first result
  return points[0];
}

/**
 * Format date from YYYY-MM-DD HH:MM to DD/MM/YYYY HH:MM (London Tech format)
 */
function formatDateForLT(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y} ${timeStr}`;
}

/**
 * Create a booking via the London Tech API using GIA credentials.
 */
async function createBooking({
  origin, destination, transfer_date, transfer_time,
  passengers, suitcases, car_type, passenger_name, passenger_phone,
  passenger_email, door_number, flight_number, cruise_name, train_number, special_requests,
  account_reference, invoice_price, extra_pickups, extra_dropoffs, staff_note
}, agentConfig) {
  passengers = passengers || 1;

  // 1. Search suggestions for both locations (normalize queries for better system matches)
  const [pickupSuggestions, dropoffSuggestions] = await Promise.all([
    searchSuggestions(normalizeQuery(origin)),
    searchSuggestions(normalizeQuery(destination))
  ]);

  let pickupPoint = pickBestPoint(pickupSuggestions.points, origin);
  let dropoffPoint = pickBestPoint(dropoffSuggestions.points, destination);

  if (!pickupPoint) {
    return { error: `Could not find pickup location "${origin}". Try a more specific address, postcode, or airport name.` };
  }
  if (!dropoffPoint) {
    return { error: `Could not find dropoff location "${destination}". Try a more specific address, postcode, or airport name.` };
  }

  // 1b. Resolve Google Places points to get accurate details
  //     If Google Places lookup fails (common for area names like "Chinatown"),
  //     fall back to searching by postcode zone from our location resolver.
  async function resolveGooglePlace(point, originalQuery) {
    if (!point._isGooglePlace) return point;
    try {
      return await getGooglePlaceDetails(point);
    } catch (e) {
      console.log(`[Booking] Google Places failed for "${originalQuery}", trying postcode fallback`);
      // Resolve the original query to a postcode zone via our location map
      const resolved = await resolveLocation(originalQuery);
      if (resolved?.zone) {
        const fallbackSuggestions = await searchSuggestions(resolved.zone);
        // Prefer a postcode-type point (pcatId 5) from system results
        const postcodePt = fallbackSuggestions.points.find(p => !p._isGooglePlace && p.pcatId === 5);
        const anySystemPt = fallbackSuggestions.points.find(p => !p._isGooglePlace);
        if (postcodePt || anySystemPt) {
          console.log(`[Booking] Fallback: using ${resolved.zone} system point for "${originalQuery}"`);
          return postcodePt || anySystemPt;
        }
      }
      throw e; // No fallback available
    }
  }

  if (pickupPoint._isGooglePlace || dropoffPoint._isGooglePlace) {
    const [resolvedPickup, resolvedDropoff] = await Promise.all([
      resolveGooglePlace(pickupPoint, origin),
      resolveGooglePlace(dropoffPoint, destination)
    ]);
    pickupPoint = resolvedPickup;
    dropoffPoint = resolvedDropoff;
  }

  // 1c. Flight validation & terminal auto-detection (airport pickups only)
  let flightData = null;
  const isPickupAirport = pickupPoint.pcatId === 1;

  if (flight_number && isPickupAirport) {
    try {
      const flightResult = await lookupFlight(flight_number, transfer_date);
      if (flightResult.valid) {
        flightData = flightResult;
        console.log(`[Booking] Flight ${flightResult.carrier}${flightResult.flightNum}: arrives ${flightResult.arrivalAirport} ${flightResult.arrivalTerminal || ''} at ${flightResult.arrivalTime}`);

        // If the arrival airport matches a UK hub, try to refine the pickup/dropoff to the specific terminal
        const arrivalHub = AIRPORT_TO_HUB[flightResult.arrivalAirport];
        if (arrivalHub && flightResult.arrivalTerminal) {
          const terminal = flightResult.arrivalTerminal; // e.g. "T5", "North"
          const terminalNum = terminal.replace(/^T/i, ''); // "5", "North"

          // Build the terminal-specific search query
          let terminalQuery = null;
          if (arrivalHub === 'LHR') {
            terminalQuery = `Heathrow Terminal ${terminalNum}`;
          } else if (arrivalHub === 'LGW') {
            terminalQuery = `Gatwick ${terminal}`; // "Gatwick North" / "Gatwick South"
          }

          // Only refine if the pickup point is generic (no terminal in address)
          if (terminalQuery) {
            const addr = (pickupPoint.address || '').toLowerCase();
            const hasTerminal = /terminal \d|t[2-5]|north|south/i.test(addr);

            if (!hasTerminal) {
              try {
                const termSuggestions = await searchSuggestions(terminalQuery);
                const termPoint = termSuggestions.points.find(p => p.pcatId === 1);
                if (termPoint) {
                  console.log(`[Booking] Refined pickup to: ${termPoint.address || terminalQuery}`);
                  pickupPoint = termPoint;
                }
              } catch (e) {
                console.warn(`[Booking] Terminal refinement failed:`, e.message);
              }
            }
          }
        }
      } else {
        console.warn(`[Booking] Flight validation failed for ${flight_number}: ${flightResult.error}`);
      }
    } catch (err) {
      console.warn(`[Booking] Flight lookup error (non-blocking):`, err.message);
    }
  }

  // 2. Get quotation
  const dateTimeStr = `${transfer_date} ${transfer_time}`;
  let quotation;
  try {
    quotation = await getQuotation([pickupPoint], [dropoffPoint], dateTimeStr);
  } catch (err) {
    return { error: `Quotation failed: ${err.message}` };
  }

  if (!quotation.quotationOptions || quotation.quotationOptions.length === 0) {
    return { error: 'No vehicles available for this route and time.' };
  }

  // 3. Select car type
  let selectedOption;
  if (car_type) {
    const requestedId = CAR_NAME_TO_ID[car_type.toLowerCase()];
    if (requestedId) {
      selectedOption = quotation.quotationOptions.find(q => q.carId === requestedId);
    }
    if (!selectedOption) {
      // Try fuzzy match
      const lower = car_type.toLowerCase();
      for (const opt of quotation.quotationOptions) {
        const name = (CAR_TYPE_MAP[opt.carId] || '').toLowerCase();
        if (name.includes(lower) || lower.includes(name)) {
          selectedOption = opt;
          break;
        }
      }
    }
    if (!selectedOption) {
      return {
        error: `Car type "${car_type}" not available.`,
        available: quotation.quotationOptions.map(q => ({
          car_type: CAR_TYPE_MAP[q.carId] || `Car ${q.carId}`,
          price_gbp: q.price
        }))
      };
    }

    // Validate capacity for the selected car
    const capacity = {
      1: { pax: 3, bags: 3 },   // Saloon
      2: { pax: 5, bags: 5 },   // People Carrier
      4: { pax: 3, bags: 3 },   // Executive Saloon
      5: { pax: 7, bags: 7 },   // Executive MPV
      3: { pax: 8, bags: 8 },   // 8 Seater
      7: { pax: 3, bags: 3 },   // Mercedes S Class
      6: { pax: 8, bags: 8 },   // Executive 8 Seater
    };
    const cap = capacity[selectedOption.carId];
    if (cap) {
      const bags = suitcases || 1;
      if (passengers > cap.pax || bags > cap.bags) {
        const carName = CAR_TYPE_MAP[selectedOption.carId];
        return {
          error: `${carName} capacity exceeded. Maximum: ${cap.pax} passengers and ${cap.bags} suitcases. You requested ${passengers} passengers and ${bags} suitcases. Please choose a larger vehicle or reduce luggage.`,
          available: quotation.quotationOptions.map(q => {
            const c = capacity[q.carId];
            return {
              car_type: CAR_TYPE_MAP[q.carId] || `Car ${q.carId}`,
              max_passengers: c ? c.pax : '?',
              max_bags: c ? c.bags : '?',
              price_gbp: q.price
            };
          })
        };
      }
    }
  } else {
    // Auto-select based on passenger count AND suitcase count
    const bags = suitcases || 1;
    // 6 car types available in APL booking system
    const sizeOrder = [1, 2, 4, 5, 3, 7];
    const capacity = {
      1: { pax: 3, bags: 3 },   // Saloon
      2: { pax: 5, bags: 5 },   // People Carrier
      4: { pax: 3, bags: 3 },   // Executive Saloon
      5: { pax: 7, bags: 7 },   // Executive MPV
      3: { pax: 8, bags: 8 },   // 8 Seater
      7: { pax: 3, bags: 3 },   // Mercedes S Class
    };

    for (const carId of sizeOrder) {
      const cap = capacity[carId] || { pax: 0, bags: 0 };
      if (cap.pax >= passengers && cap.bags >= bags) {
        selectedOption = quotation.quotationOptions.find(q => q.carId === carId);
        if (selectedOption) break;
      }
    }
    if (!selectedOption) selectedOption = quotation.quotationOptions[0];
  }

  const paymentType = parseInt(agentConfig?.paymentType) || 1;

  // 4. Build passenger details
  const nameParts = passenger_name.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  // 5. Use quotation-enriched points (API enriches with location data, zone IDs etc.)
  const enrichedPickup = quotation.pickupPoints[0] || pickupPoint;
  const enrichedDropoff = quotation.dropoffPoints[0] || dropoffPoint;

  // Add category-specific details required by London Tech validation
  function addPointDetails(point, originalQuery) {
    const cat = point.pcatId;
    if (cat === 1) {
      // Airport — needs flightDetails
      // Calculate waiting time: if we know flight arrival, diff from customer's requested time
      let waitingTime = 60; // default to 60 min (international standard) instead of 15
      if (flightData?.arrivalTime && transfer_time) {
        waitingTime = calculateWaitingTime(flightData.arrivalTime, transfer_time);
        console.log(`[Booking] Waiting time: ${waitingTime} mins (flight ${flightData.arrivalTime}, pickup ${transfer_time})`);
      } else if (transfer_time) {
        console.log(`[Booking] No flight arrival time available, using default ${waitingTime} mins for pickup at ${transfer_time}`);
      }
      point.flightDetails = { flightNumber: flight_number || '', waitingPickupTime: waitingTime };
    } else if (cat === 2) {
      // Cruise — needs cruiseNumber
      point.cruiseNumber = cruise_name || '';
    } else if (cat === 3) {
      // Train — needs trainNumber
      point.trainNumber = train_number || '';
    } else if (cat === 4) {
      // Hotel/Room — needs roomNumber
      if (!point.roomNumber) point.roomNumber = '';
    } else if (cat === 5) {
      // Postcode — use original query as full address if it has more than just a postcode
      let addr = point.address || '';
      if (originalQuery && originalQuery.length > (addr || '').length) {
        addr = originalQuery;
      }
      if (door_number && !addr.toLowerCase().startsWith(door_number.toLowerCase())) {
        addr = `${door_number}, ${addr}`;
      }
      point.postCodeDetails = { id: 0, postCodeAddress: addr };
    } else if (cat >= 7 && cat <= 10) {
      // Place/City/University/Other — needs address-description
      point['address-description'] = point.address || '';
    }
  }
  addPointDetails(enrichedPickup, origin);
  addPointDetails(enrichedDropoff, destination);

  // 5b. Resolve extra pickup/dropoff points for multi-stop bookings
  const allPickupPoints = [enrichedPickup];
  const allDropoffPoints = [];

  if (extra_dropoffs && extra_dropoffs.length > 0) {
    for (const addr of extra_dropoffs) {
      try {
        const suggestions = await searchSuggestions(normalizeQuery(addr));
        let point = pickBestPoint(suggestions.points, addr);
        if (point) {
          if (point._isGooglePlace) point = await getGooglePlaceDetails(point);
          addPointDetails(point, addr);
          allDropoffPoints.push(point);
        }
      } catch (err) {
        console.error(`Failed to resolve extra dropoff "${addr}":`, err.message);
      }
    }
  }
  allDropoffPoints.push(enrichedDropoff); // Main destination always last

  if (extra_pickups && extra_pickups.length > 0) {
    for (const addr of extra_pickups) {
      try {
        const suggestions = await searchSuggestions(normalizeQuery(addr));
        let point = pickBestPoint(suggestions.points, addr);
        if (point) {
          if (point._isGooglePlace) point = await getGooglePlaceDetails(point);
          addPointDetails(point, addr);
          allPickupPoints.push(point);
        }
      } catch (err) {
        console.error(`Failed to resolve extra pickup "${addr}":`, err.message);
      }
    }
  }

  // 6. Build reservation payload
  const agentTag = agentConfig?.agentName || 'GIA';
  const bookingRef = generateBookingRef();
  const accountId = agentConfig?.accountId || parseInt(process.env.GIA_ACCOUNT_ID) || 3099;
  const channelId = agentConfig?.channelId || parseInt(process.env.GIA_CHANNEL_ID) || 4;

  // If invoice_price provided (e.g. Saga), use it as journey price too
  const journeyPrice = invoice_price || selectedOption.price;

  const driverNote = agentConfig?.skipTag
    ? (special_requests || '')
    : `[${agentTag}] ${bookingRef}${special_requests ? ' | ' + special_requests : ''}`;

  // Staff note: includes staff_note (e.g. customer phone numbers) + driver note
  const staffNoteParts = [];
  if (staff_note) staffNoteParts.push(staff_note);
  if (driverNote) staffNoteParts.push(driverNote);
  const staffNote = staffNoteParts.join(' | ') || driverNote;

  const payload = {
    reservation: [{
      reservationDetails: {
        channelId,
        accountId,
        notes: JSON.stringify({ driverNote, staffNote })
      },
      selectedPickupPoints: allPickupPoints,
      selectedDropoffPoints: allDropoffPoints,
      quotation: {
        carId: selectedOption.carId,
        price: journeyPrice,
        normalPrice: selectedOption.normalPrice,
        token: selectedOption.token
      },
      transferDetails: {
        // For airport pickups with flight data: register flight landing time, not pickup time
        // The waitingPickupTime on the point tells London Tech when driver should actually be there
        transferDateTimeString: formatDateForLT(
          transfer_date,
          (isPickupAirport && flightData?.arrivalTime) ? flightData.arrivalTime : transfer_time
        ),
        pickupCategoryId: enrichedPickup.pcatId || 1,
        passengersNumber: passengers,
        passengerSuitcase: suitcases || 1,
        specialRequests: driverNote
      },
      passengerDetails: {
        token: '',
        firstname: firstName,
        lastname: lastName,
        language: 'en',
        email: passenger_email || '',
        phone: passenger_phone
      },
      paymentDetails: {
        token: '',
        paymentType,
        account: accountId,
        price: journeyPrice,
        accountReferanceNumber: account_reference || '',
        ...(invoice_price ? { invoicePrice: invoice_price } : {})
      }
    }],
    configurations: {
      sendConfirmationEmailToPassenger: !!passenger_email
    }
  };

  // 7. Create reservation via London Tech
  let ltResponse;
  let externalRef = null;

  try {
    ltResponse = await createReservation(payload);

    if (ltResponse.body && ltResponse.body.data && ltResponse.body.data['reservations-ids']) {
      const ids = ltResponse.body.data['reservations-ids'];
      externalRef = Array.isArray(ids[0]) ? ids[0][0] : String(ids[0]);
    } else if (ltResponse.body && ltResponse.body.reservationId) {
      externalRef = String(ltResponse.body.reservationId);
    }
  } catch (err) {
    console.error('GIA reservation error:', err.message);
    return { error: `Booking failed: ${err.message}` };
  }

  // Check if API returned an error
  if (ltResponse.status !== 200 || (ltResponse.body && ltResponse.body.status >= 400)) {
    let errMsg = 'Reservation rejected by London Tech';
    if (ltResponse.body?.error) {
      if (typeof ltResponse.body.error === 'string') errMsg = ltResponse.body.error;
      else if (ltResponse.body.error.global) errMsg = ltResponse.body.error.global[0];
      else errMsg = JSON.stringify(ltResponse.body.error);
    }
    console.error('GIA reservation rejected:', JSON.stringify(ltResponse.body));
    return { error: `Booking rejected: ${errMsg}` };
  }

  // 8. Save to local DB
  try {
    await pool.query(`
      INSERT INTO gia_bookings (
        booking_ref, external_ref,
        pickup_location, dropoff_location,
        transfer_date, transfer_time, passengers,
        car_type, price,
        passenger_name, passenger_phone, passenger_email,
        flight_number, special_requests,
        london_tech_payload, london_tech_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      bookingRef, externalRef,
      pickupPoint.address, dropoffPoint.address,
      transfer_date, transfer_time, passengers,
      CAR_TYPE_MAP[selectedOption.carId] || `Car ${selectedOption.carId}`,
      selectedOption.price,
      passenger_name, passenger_phone, passenger_email || null,
      flight_number || null, special_requests || null,
      JSON.stringify(payload), JSON.stringify(ltResponse.body)
    ]);
  } catch (dbErr) {
    console.error('Failed to save GIA booking to DB:', dbErr.message);
    // Booking was created successfully, just couldn't save locally
  }

  return {
    booking_reference: externalRef || bookingRef,
    status: 'confirmed',
    pickup: pickupPoint.address,
    dropoff: dropoffPoint.address,
    date: transfer_date,
    time: transfer_time,
    car_type: CAR_TYPE_MAP[selectedOption.carId] || `Car ${selectedOption.carId}`,
    price_gbp: selectedOption.price,
    passengers,
    passenger: {
      name: passenger_name,
      phone: passenger_phone,
      email: passenger_email || null
    },
    duration: quotation.duration || null,
    // Only include payment/manage links for cash bookings (paymentType 1) — account bookings are invoiced
    ...(paymentType === 1 && externalRef && passenger_email ? {
      manage_booking_url: `https://www.airport-pickups-london.com/manage-booking.html?reservationId=${externalRef}&email=${encodeURIComponent(passenger_email)}`
    } : {}),
    meeting_point: (() => {
      const flightTerminal = flightData?.arrivalTerminal || null;
      const mp = findMeetingPoint(pickupPoint.address, flightTerminal) || findMeetingPoint(dropoffPoint.address, flightTerminal);
      return mp ? { name: mp.name, instructions: mp.message } : null;
    })(),
    ...(flightData ? {
      flight_info: {
        airline: flightData.airline,
        flight_number: `${flightData.carrier}${flightData.flightNum}`,
        arrival_airport: flightData.arrivalAirportName || flightData.arrivalAirport,
        arrival_terminal: flightData.arrivalTerminal,
        arrival_time: flightData.arrivalTime,
        departure_airport: flightData.departureAirport
      }
    } : {}),
    message: paymentType === 1
      ? 'Booking confirmed! You can pay the driver in cash on the day, or pay online via the manage booking link — we accept all major cards (including Amex), Apple Pay, Google Pay, PayPal, Revolut, WeChat Pay, and AliPay.'
      : 'Booking confirmed.'
  };
}

module.exports = { createBooking };
