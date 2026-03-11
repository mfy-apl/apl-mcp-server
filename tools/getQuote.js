const pool = require('../config/database');
const { resolveHub, HUB_TERMINALS } = require('../config/hubs');
const { resolveLocation, getGoogleDrivingDistance } = require('../services/locationResolver');
const { findMeetingPoint } = require('../data/meetingPoints');

// Cache uk_airports for 5 minutes
let ukAirportsCache = null;
let ukAirportsCacheTime = 0;
const UK_AIRPORTS_TTL = 5 * 60 * 1000;

/**
 * Load active UK airports from the database (cached).
 */
async function getUkAirports() {
  if (ukAirportsCache && Date.now() - ukAirportsCacheTime < UK_AIRPORTS_TTL) {
    return ukAirportsCache;
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM uk_airports WHERE status = ?', ['active']
    );
    ukAirportsCache = rows;
    ukAirportsCacheTime = Date.now();
    return rows;
  } catch (e) {
    return [];
  }
}

/**
 * Try to match user input against the uk_airports table.
 * Returns the matched airport row or null.
 */
async function resolveUkAirport(input) {
  const airports = await getUkAirports();
  if (airports.length === 0) return null;

  const normalised = input.trim().toLowerCase();

  // 1. Exact match on name
  for (const ap of airports) {
    if (ap.name.toLowerCase() === normalised) return ap;
  }

  // 2. Check if input contains airport name or airport name contains input
  //    Extract meaningful keywords from airport names for fuzzy matching
  for (const ap of airports) {
    const apName = ap.name.toLowerCase();
    // Check if input contains the full airport name
    if (normalised.includes(apName)) return ap;
    // Check if airport name (without "Airport"/"Cruise Port"/"Terminal") appears in input
    const shortName = apName
      .replace(/\s+(airport|cruise\s+port|cruise\s+terminal|international\s+port|international\s+airport)\s*$/i, '')
      .trim();
    if (shortName.length >= 4 && normalised.includes(shortName)) return ap;
  }

  return null;
}

/**
 * Find a matching mileage tunnel for a given hub, destination zone, and optional origin zone.
 * Primary match: destination zone must appear in tunnel's zone_b.
 * If tunnel has zone_a set AND originZone is provided, also checks originZone is in zone_a.
 * Returns tunnel_id or null.
 */
async function findMatchingTunnel(hubCode, destZone, originZone) {
  try {
    const [tunnels] = await pool.query(
      'SELECT id, zone_a, zone_b FROM mileage_tunnels WHERE hub_code = ?',
      [hubCode]
    );
    const destUpper = destZone.toUpperCase();
    const destParent = destZone.replace(/[A-Z]$/i, '').toUpperCase();
    const origUpper = originZone ? originZone.toUpperCase() : null;
    const origParent = originZone ? originZone.replace(/[A-Z]$/i, '').toUpperCase() : null;

    for (const t of tunnels) {
      if (!t.zone_b) continue;
      const bZones = t.zone_b.split(',').map(z => z.trim().toUpperCase());
      const destMatch = bZones.includes(destUpper) || (destParent !== destUpper && bZones.includes(destParent));
      if (!destMatch) continue;

      // If tunnel has zone_a and we have an origin, check origin matches pickup side
      if (t.zone_a && origUpper) {
        const aZones = t.zone_a.split(',').map(z => z.trim().toUpperCase());
        const origMatch = aZones.includes(origUpper) || (origParent !== origUpper && aZones.includes(origParent));
        if (!origMatch) continue; // Origin doesn't match this tunnel's pickup zones
      }

      return t.id;
    }
  } catch (e) { /* tunnel table may not exist yet */ }
  return null;
}

/**
 * Calculate mileage-based prices for a hub+zone when no fixed price exists.
 * Uses zone_distances + mileage_bands tables.
 * For LON hub, checks mileage tunnels first for zone-specific rates.
 * Optional originZone helps match tunnels that have zone_a (pickup) restrictions.
 */
async function getMileagePrices(hubCode, zone, originZone, overrideDistance) {
  let miles;

  if (overrideDistance != null) {
    // Use pre-calculated distance (e.g. from UK airport flow)
    miles = overrideDistance;
  } else {
    const [dist] = await pool.query(
      'SELECT distance_miles FROM zone_distances WHERE hub_code = ? AND zone_name = ?',
      [hubCode, zone]
    );

    if (dist.length > 0) {
      miles = parseFloat(dist[0].distance_miles);
    } else {
      // Fallback: get real driving distance from Google Distance Matrix API
      const googleOrigin = originZone || HUB_TERMINALS[hubCode]?.[0] || hubCode;
      console.log(`[getQuote] No zone_distances for ${hubCode}+${zone}, fetching from Google (${googleOrigin} → ${zone})`);
      const googleResult = await getGoogleDrivingDistance(googleOrigin, zone);
      if (!googleResult) return { prices: [], distance: null };

      miles = googleResult.miles;
      // Save to database for future use
      try {
        await pool.query(
          'INSERT INTO zone_distances (hub_code, zone_name, distance_miles, duration_mins) VALUES (?, ?, ?, ?)',
          [hubCode, zone, miles, googleResult.durationMins]
        );
        console.log(`[getQuote] Saved zone_distances: ${hubCode}+${zone} = ${miles} mi (${googleResult.durationMins} min)`);
      } catch (e) {
        console.error('[getQuote] Failed to save zone_distance:', e.message);
      }
    }
  }
  // Round up to nearest whole mile so distances like 28.57 match the 29-30 band
  // (mileage bands have integer boundaries with gaps, e.g. 27-28, 29-30)
  const queryMiles = Math.ceil(miles);

  // Check for tunnel-specific mileage bands (LON only, but works for any hub)
  const tunnelId = await findMatchingTunnel(hubCode, zone, originZone);
  let tunnelClause = 'AND mb.tunnel_id IS NULL';
  let tunnelParams = [];
  if (tunnelId) {
    tunnelClause = 'AND mb.tunnel_id = ?';
    tunnelParams = [tunnelId];
  }

  let [bands] = await pool.query(`
    SELECT mb.price_per_mile, mb.min_fare, mb.supplement, mb.car_type_id,
           ct.name AS Car_Type, ct.passengers, ct.bags,
           ct.description AS car_description, ct.sort_order
    FROM mileage_bands mb
    JOIN car_types ct ON ct.id = mb.car_type_id
    WHERE mb.hub_code = ? AND mb.from_distance <= ? AND mb.to_distance >= ?
      ${tunnelClause}
    ORDER BY ct.sort_order ASC
  `, [hubCode, queryMiles, queryMiles, ...tunnelParams]);

  // If tunnel had no bands, fall back to general bands
  if (bands.length === 0 && tunnelId) {
    [bands] = await pool.query(`
      SELECT mb.price_per_mile, mb.min_fare, mb.supplement, mb.car_type_id,
             ct.name AS Car_Type, ct.passengers, ct.bags,
             ct.description AS car_description, ct.sort_order
      FROM mileage_bands mb
      JOIN car_types ct ON ct.id = mb.car_type_id
      WHERE mb.hub_code = ? AND mb.from_distance <= ? AND mb.to_distance >= ?
        AND mb.tunnel_id IS NULL
      ORDER BY ct.sort_order ASC
    `, [hubCode, queryMiles, queryMiles]);
  }

  if (bands.length === 0) return { prices: [], distance: miles };

  const results = bands.map(band => {
    let price = miles * parseFloat(band.price_per_mile);

    if (band.min_fare > 0 && price < parseFloat(band.min_fare)) {
      price = parseFloat(band.min_fare);
    }

    if (band.supplement && band.supplement !== '0') {
      if (String(band.supplement).includes('%')) {
        const pct = parseFloat(band.supplement.replace('%', ''));
        price += price * (pct / 100);
      } else {
        const val = parseFloat(band.supplement);
        if (val > 2) {
          // Fixed add-on (e.g. 15 = add £15)
          price += val;
        } else if (val > 0) {
          // Multiplier (e.g. 1 = no change, 1.25 = +25%)
          price = price * val;
        }
      }
    }

    price = Math.round(price * 100) / 100;

    return {
      Car_Type: band.Car_Type,
      Price: price,
      passengers: band.passengers,
      bags: band.bags,
      car_description: band.car_description,
      sort_order: band.sort_order
    };
  });

  return { prices: results, distance: miles };
}

/**
 * Apply all surcharges to a base price for a given hub, date, and time.
 * Returns { finalPrice, surcharges[] }.
 * Surcharge order: lead_time → rush_hour → event → genius_discount → pickup_charges
 */
async function applySurcharges(basePrice, hubCode, transferDate, transferTime, originZone, destZone) {
  let finalPrice = basePrice;
  const surcharges = [];

  // 1. Lead time surcharge (last-minute booking)
  if (transferDate && transferTime) {
    const pickupDateTime = new Date(`${transferDate}T${transferTime}:00`);
    const hoursUntilPickup = Math.max(0, (pickupDateTime - new Date()) / (1000 * 60 * 60));

    const [ltRules] = await pool.query(
      'SELECT surcharge FROM lead_time_surcharges WHERE hub_code = ? AND min_hours <= ? AND max_hours >= ?',
      [hubCode, hoursUntilPickup, hoursUntilPickup]
    );
    if (ltRules.length > 0) {
      const pct = parseFloat(ltRules[0].surcharge);
      const amount = Math.round(finalPrice * pct / 100 * 100) / 100;
      finalPrice += amount;
      surcharges.push({
        type: 'lead_time',
        description: `Last-minute booking (${Math.round(hoursUntilPickup)}h before pickup)`,
        percentage: pct,
        amount
      });
    }
  }

  // 2. Rush hour surcharge (time-of-day / day-of-week)
  if (transferDate && transferTime) {
    const pickupDay = new Date(`${transferDate}T${transferTime}:00`).getDay();
    const [rhRules] = await pool.query(
      'SELECT name, start_time, end_time, days, type, value FROM rush_hour_surcharges WHERE hub_code = ? AND active = 1',
      [hubCode]
    );
    for (const rh of rhRules) {
      const days = (rh.days || '0,1,2,3,4,5,6').split(',').map(Number);
      if (!days.includes(pickupDay)) continue;

      const startParts = rh.start_time.split(':');
      const endParts = rh.end_time.split(':');
      const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      const timeParts = transferTime.split(':');
      const pickupMin = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);

      // Handle midnight wraparound (e.g., 22:00-06:00)
      const inWindow = endMin > startMin
        ? (pickupMin >= startMin && pickupMin < endMin)
        : (pickupMin >= startMin || pickupMin < endMin);

      if (inWindow) {
        if (rh.type === 'fixed') {
          const amount = parseFloat(rh.value);
          finalPrice += amount;
          surcharges.push({ type: 'rush_hour', description: rh.name || 'Rush hour', amount });
        } else {
          const pct = parseFloat(rh.value);
          const amount = Math.round(finalPrice * pct / 100 * 100) / 100;
          finalPrice += amount;
          surcharges.push({ type: 'rush_hour', description: rh.name || 'Rush hour', percentage: pct, amount });
        }
      }
    }
  }

  // 3. Event surcharges (Christmas, bank holidays, etc.)
  if (transferDate) {
    const [events] = await pool.query(
      'SELECT event_name, surcharge FROM event_surcharges WHERE hub_code = ? AND from_date <= ? AND to_date >= ?',
      [hubCode, transferDate, transferDate]
    );
    for (const evt of events) {
      const pct = parseFloat(evt.surcharge);
      const amount = Math.round(finalPrice * pct / 100 * 100) / 100;
      finalPrice += amount;
      surcharges.push({ type: 'event', description: evt.event_name, percentage: pct, amount });
    }
  }

  // 4. Genius discounts (loyalty)
  if (transferDate) {
    const [genius] = await pool.query(
      'SELECT discount FROM genius_discounts WHERE hub_code = ? AND from_date <= ? AND to_date >= ?',
      [hubCode, transferDate, transferDate]
    );
    for (const g of genius) {
      const pct = parseFloat(g.discount);
      const amount = Math.round(finalPrice * pct / 100 * 100) / 100;
      finalPrice -= amount;
      surcharges.push({ type: 'discount', description: 'Loyalty discount', percentage: pct, amount: -amount });
    }
  }

  // 5. Pickup charges (parking, meet & greet) — only for from_hub direction
  const [pickupRows] = await pool.query(
    'SELECT parking_fee, meet_greet_fee FROM pickup_charges WHERE hub_code = ?',
    [hubCode]
  );
  if (pickupRows.length > 0) {
    const parkingFee = parseFloat(pickupRows[0].parking_fee || 0);
    const meetGreet = parseFloat(pickupRows[0].meet_greet_fee || 0);
    if (parkingFee > 0) {
      finalPrice += parkingFee;
      surcharges.push({ type: 'parking_fee', description: 'Airport parking fee', amount: parkingFee });
    }
    if (meetGreet > 0) {
      finalPrice += meetGreet;
      surcharges.push({ type: 'meet_greet', description: 'Meet & greet fee', amount: meetGreet });
    }
  }

  // 6. Area supplements (zone-based fixed surcharge for mileage pricing)
  if (originZone || destZone) {
    try {
      const [asRules] = await pool.query(
        'SELECT name, zones, amount FROM area_supplements WHERE hub_code = ? AND active = 1',
        [hubCode]
      );
      for (const rule of asRules) {
        const ruleZones = rule.zones.split(',').map(z => z.trim().toUpperCase());
        const zones = [originZone, destZone].filter(Boolean);
        let matched = false;
        for (const z of zones) {
          const zUp = z.toUpperCase();
          const zParent = z.replace(/[A-Z]$/i, '').toUpperCase();
          if (ruleZones.includes(zUp) || (zParent !== zUp && ruleZones.includes(zParent))) {
            matched = true;
            break;
          }
        }
        if (matched) {
          const amount = parseFloat(rule.amount);
          finalPrice += amount;
          surcharges.push({ type: 'area_supplement', description: rule.name || 'Area supplement', amount });
        }
      }
    } catch (e) { /* area_supplements table may not exist yet */ }
  }

  finalPrice = Math.round(finalPrice * 100) / 100;
  return { finalPrice, surcharges };
}

/**
 * Check if a stop sale is active for the given hub and date.
 */
async function checkStopSale(hubCode, transferDate) {
  if (!transferDate) return null;
  const [rows] = await pool.query(
    'SELECT reason FROM stop_sales WHERE hub_code = ? AND from_date <= ? AND to_date >= ?',
    [hubCode, transferDate, transferDate]
  );
  return rows.length > 0 ? (rows[0].reason || 'No bookings available for this date') : null;
}

/**
 * Core get_quote logic.
 * Resolves origin/destination, queries fixed prices, falls back to mileage bands,
 * then applies surcharges based on transfer date/time.
 */
async function getQuote({ origin, destination, passengers, transfer_date, transfer_time, _sourceZone }) {
  passengers = passengers || 1;

  // Determine which input is the hub and which is the zone
  const originHub = resolveHub(origin);
  const destHub = resolveHub(destination);

  // Hub-to-hub transfers (e.g. Heathrow to Gatwick): treat origin as hub, resolve dest to its postcode zone
  // LON (Central London) is not a real hub — treat it as a zone (SW1A) instead
  if (originHub && destHub) {
    if (destHub.hubCode === 'LON') {
      return getQuote({ origin, destination: 'SW1A', passengers, transfer_date, transfer_time, _sourceZone });
    }
    if (originHub.hubCode === 'LON') {
      return getQuote({ origin: 'SW1A', destination, passengers, transfer_date, transfer_time, _sourceZone });
    }
    const HUB_POSTCODES = { LHR: 'TW6', LGW: 'RH6', STN: 'CM24', LTN: 'LU2', LCY: 'E16', EDI: 'EH12', SOC: 'SO14', DVR: 'CT17', PME: 'PO1' };
    const destZone = HUB_POSTCODES[destHub.hubCode];
    if (destZone) {
      return getQuote({ origin, destination: destZone, passengers, transfer_date, transfer_time, _sourceZone });
    }
    return { error: 'Hub-to-hub transfer not supported for these locations.' };
  }

  // If neither is a hub, check if either is a source zone for a hub (e.g. EC1 is a source zone for LON)
  if (!originHub && !destHub) {
    const originResolved = await resolveLocation(origin);
    const destResolved = await resolveLocation(destination);
    const originZone = originResolved?.zone;
    const destZone = destResolved?.zone;

    let sourceHubCode = null;
    let sourceDirection = null;

    // Check if origin zone is a source zone for any hub
    if (originZone) {
      const [srcRows] = await pool.query(
        'SELECT hub_code FROM hub_source_zones WHERE zone_name = ? LIMIT 1', [originZone]
      );
      if (srcRows.length > 0) {
        sourceHubCode = srcRows[0].hub_code;
        sourceDirection = 'from_hub';
      }
    }
    // If not, check destination zone
    if (!sourceHubCode && destZone) {
      const [srcRows] = await pool.query(
        'SELECT hub_code FROM hub_source_zones WHERE zone_name = ? LIMIT 1', [destZone]
      );
      if (srcRows.length > 0) {
        sourceHubCode = srcRows[0].hub_code;
        sourceDirection = 'to_hub';
      }
    }

    if (sourceHubCode) {
      // Re-resolve as if the source zone's hub was specified
      const hubData = resolveHub(sourceHubCode);
      if (hubData) {
        const nonHubInput = sourceDirection === 'from_hub' ? destination : origin;
        const resolved = await resolveLocation(nonHubInput);
        if (resolved) {
          // Recursive call with the hub substituted, passing original source zone for tunnel matching
          return getQuote({
            origin: sourceDirection === 'from_hub' ? sourceHubCode : origin,
            destination: sourceDirection === 'from_hub' ? destination : sourceHubCode,
            passengers, transfer_date, transfer_time,
            _sourceZone: sourceDirection === 'from_hub' ? originZone : destZone
          });
        }
      }
    }

    // ── UK Airport fallback: check if either side is a UK airport/cruise port ──
    const originUkAirport = await resolveUkAirport(origin);
    const destUkAirport = await resolveUkAirport(destination);
    const ukAirport = originUkAirport || destUkAirport;

    if (ukAirport) {
      const ukDirection = originUkAirport ? 'from_hub' : 'to_hub';
      const ukNonHubInput = originUkAirport ? destination : origin;

      // Resolve the non-airport side to a zone
      const ukResolved = (originUkAirport ? destResolved : originResolved) || await resolveLocation(ukNonHubInput);
      if (!ukResolved) {
        return { error: `Could not resolve "${ukNonHubInput}" to a known pricing zone. Try using a UK postcode (e.g. "M1", "BS1") or a more specific address.` };
      }

      const ukZone = ukResolved.zone;
      const distKey = `UK-${ukAirport.id}`;

      // Get distance: check cache (zone_distances with hub_code = UK-{id}), then Google
      let ukMiles;
      const [distRow] = await pool.query(
        'SELECT distance_miles FROM zone_distances WHERE hub_code = ? AND zone_name = ?',
        [distKey, ukZone]
      );
      if (distRow.length > 0) {
        ukMiles = parseFloat(distRow[0].distance_miles);
      } else {
        // Compute distance via Google Distance Matrix: airport postcode → zone
        const googleResult = await getGoogleDrivingDistance(ukAirport.postcode, ukZone);
        if (!googleResult) {
          return { error: `Could not calculate distance from ${ukAirport.name} to ${ukZone}. Google Distance Matrix failed.` };
        }
        ukMiles = googleResult.miles;
        // Cache in zone_distances
        try {
          await pool.query(
            'INSERT INTO zone_distances (hub_code, zone_name, distance_miles, duration_mins) VALUES (?, ?, ?, ?)',
            [distKey, ukZone, ukMiles, googleResult.durationMins]
          );
          console.log(`[getQuote] Saved UK distance: ${distKey}+${ukZone} = ${ukMiles} mi`);
        } catch (e) {
          console.error('[getQuote] Failed to save UK zone_distance:', e.message);
        }
      }

      // Get mileage-based prices using UK hub bands with override distance
      const { prices: ukPrices } = await getMileagePrices('UK', ukZone, null, ukMiles);
      if (ukPrices.length === 0) {
        return { error: `No UK mileage bands configured. Please set up mileage bands for the UK hub.` };
      }

      // Apply surcharges (UK hub surcharges) + add parking fee
      const parkingFee = parseFloat(ukAirport.parking_fee || 0);
      const hasSurchargeParams = transfer_date || transfer_time;

      const fromHub = [];
      const toHub = [];
      for (const p of ukPrices) {
        let basePrice = parseFloat(p.Price);
        // Add parking fee for from_airport direction
        if (ukDirection === 'from_hub') {
          basePrice += parkingFee;
        }
        let finalPrice = basePrice;
        let carSurcharges = [];

        if (hasSurchargeParams) {
          const applied = await applySurcharges(p.Price, 'UK', transfer_date, transfer_time, null, null);
          finalPrice = applied.finalPrice;
          if (ukDirection === 'from_hub') finalPrice += parkingFee;
          carSurcharges = applied.surcharges;
          if (parkingFee > 0 && ukDirection === 'from_hub') {
            carSurcharges.push({ type: 'parking_fee', description: `${ukAirport.name} parking`, amount: parkingFee });
          }
        } else if (parkingFee > 0 && ukDirection === 'from_hub') {
          carSurcharges.push({ type: 'parking_fee', description: `${ukAirport.name} parking`, amount: parkingFee });
        }

        finalPrice = Math.round(finalPrice * 100) / 100;
        basePrice = Math.round(basePrice * 100) / 100;

        const entry = {
          car_type: p.Car_Type,
          base_price_gbp: basePrice,
          final_price_gbp: finalPrice,
          max_passengers: p.passengers || null,
          max_bags: p.bags || null,
          description: p.car_description || null,
          ...(carSurcharges.length > 0 ? { surcharges: carSurcharges } : {})
        };
        fromHub.push(entry);
        toHub.push(entry);
      }

      // Find recommended car
      const prices = ukDirection === 'from_hub' ? fromHub : toHub;
      let recommended = null;
      for (const p of prices) {
        if ((p.max_passengers || 0) >= passengers) {
          recommended = p.car_type;
          break;
        }
      }
      if (!recommended && prices.length > 0) {
        recommended = prices[prices.length - 1].car_type;
      }

      const result = {
        hub: 'UK',
        uk_airport: ukAirport.name,
        uk_airport_type: ukAirport.type,
        zone: ukZone,
        resolved_address: ukResolved.resolvedAddress,
        resolution_method: ukResolved.method,
        price_source: 'mileage_band',
        direction: ukDirection,
        passengers,
        recommended_car_type: recommended,
        distance_miles: ukMiles,
        from_hub: fromHub,
        to_hub: toHub
      };

      if (transfer_date) result.transfer_date = transfer_date;
      if (transfer_time) result.transfer_time = transfer_time;

      return result;
    }

    return { error: `Neither "${origin}" nor "${destination}" was recognised as an airport/hub or source zone. One of the locations must be an airport, hub, or a zone registered as a pickup point (e.g. Heathrow, Central London, EC1).` };
  }

  const hub = originHub || destHub;
  const nonHubInput = originHub ? destination : origin;
  const direction = originHub ? 'from_hub' : 'to_hub';

  // Check stop sale
  const stopSaleReason = await checkStopSale(hub.hubCode, transfer_date);
  if (stopSaleReason) {
    return { error: `Bookings unavailable for ${hub.hubCode} on ${transfer_date}: ${stopSaleReason}` };
  }

  // Resolve the non-hub location to a zone
  const resolved = await resolveLocation(nonHubInput);
  if (!resolved) {
    return {
      error: `Could not resolve "${nonHubInput}" to a known pricing zone. Try using a UK postcode (e.g. "W1", "OX1") or a more specific address.`
    };
  }

  let { zone, resolvedAddress, method } = resolved;
  const terminals = hub.terminals;
  const placeholders = terminals.map(() => '?').join(',');

  function dedup(rows) {
    const seen = new Map();
    for (const row of rows) {
      if (!seen.has(row.Car_Type)) {
        seen.set(row.Car_Type, row);
      }
    }
    return Array.from(seen.values());
  }

  async function queryFixedPrices(z) {
    const fromSQL = `
      SELECT p.Pickup, p.Dropoff, p.Price, p.Car_Type, p.Area,
             ct.passengers, ct.bags, ct.description AS car_description,
             ct.image_url, ct.sort_order
      FROM prices p
      LEFT JOIN car_types ct ON ct.name = p.Car_Type
      WHERE p.Pickup IN (${placeholders}) AND p.Dropoff = ? AND p.Status = 'active'
      ORDER BY ct.sort_order ASC
    `;
    const toSQL = `
      SELECT p.Pickup, p.Dropoff, p.Price, p.Car_Type, p.Area,
             ct.passengers, ct.bags, ct.description AS car_description,
             ct.image_url, ct.sort_order
      FROM prices p
      LEFT JOIN car_types ct ON ct.name = p.Car_Type
      WHERE p.Pickup = ? AND p.Dropoff IN (${placeholders}) AND p.Status = 'active'
      ORDER BY ct.sort_order ASC
    `;
    const [fromRows] = await pool.query(fromSQL, [...terminals, z]);
    const [toRows] = await pool.query(toSQL, [z, ...terminals]);
    return { from: dedup(fromRows), to: dedup(toRows) };
  }

  // Try exact zone first
  let { from: fromHubPrices, to: toHubPrices } = await queryFixedPrices(zone);

  // If no fixed prices, try shorter outward code (W1K → W1, SW1A → SW1)
  if (fromHubPrices.length === 0 && toHubPrices.length === 0) {
    const shorter = zone.replace(/[A-Z]$/i, '');
    if (shorter !== zone && shorter.length >= 2) {
      const result = await queryFixedPrices(shorter);
      if (result.from.length > 0 || result.to.length > 0) {
        fromHubPrices = result.from;
        toHubPrices = result.to;
        zone = shorter;
      }
    }
  }

  let priceSource = 'fixed';
  let distanceMiles = null;

  // Mileage band fallback when no fixed prices found
  if (fromHubPrices.length === 0 && toHubPrices.length === 0) {
    const { prices: mileagePrices, distance } = await getMileagePrices(hub.hubCode, zone, _sourceZone);
    distanceMiles = distance;

    if (mileagePrices.length > 0) {
      fromHubPrices = mileagePrices;
      toHubPrices = mileagePrices;
      priceSource = 'mileage_band';
    }
  }

  if (fromHubPrices.length === 0 && toHubPrices.length === 0) {
    return {
      error: `No prices found for zone "${zone}" (resolved from "${nonHubInput}") with ${hub.hubCode}. This zone may not be in our coverage area.`
    };
  }

  // Apply surcharges to each car type's base price
  // Zone params for area supplements: _sourceZone is the hub-side zone, zone is the non-hub zone
  const originZone = originHub ? _sourceZone : zone;
  const destZone = originHub ? zone : _sourceZone;
  const hasSurchargeParams = transfer_date || transfer_time || (priceSource === 'mileage_band' && (originZone || destZone));

  async function formatWithSurcharges(rows) {
    const results = [];
    for (const r of rows) {
      const base = parseFloat(r.Price);
      let final = base;
      let carSurcharges = [];

      if (hasSurchargeParams) {
        const applied = await applySurcharges(base, hub.hubCode, transfer_date, transfer_time, originZone, destZone);
        final = applied.finalPrice;
        carSurcharges = applied.surcharges;
      }

      results.push({
        car_type: r.Car_Type,
        base_price_gbp: base,
        final_price_gbp: final,
        max_passengers: r.passengers || null,
        max_bags: r.bags || null,
        description: r.car_description || null,
        ...(carSurcharges.length > 0 ? { surcharges: carSurcharges } : {})
      });
    }
    return results;
  }

  function formatBasic(rows) {
    return rows.map(r => ({
      car_type: r.Car_Type,
      price_gbp: parseFloat(r.Price),
      max_passengers: r.passengers || null,
      max_bags: r.bags || null,
      description: r.car_description || null
    }));
  }

  const fromHub = hasSurchargeParams ? await formatWithSurcharges(fromHubPrices) : formatBasic(fromHubPrices);
  const toHub = hasSurchargeParams ? await formatWithSurcharges(toHubPrices) : formatBasic(toHubPrices);

  // Find recommended car for passenger count
  const allPrices = (direction === 'from_hub' ? fromHub : toHub);
  const fallbackPrices = allPrices.length > 0 ? allPrices : (direction === 'from_hub' ? toHub : fromHub);
  let recommended = null;
  for (const p of fallbackPrices) {
    if ((p.max_passengers || 0) >= passengers) {
      recommended = p.car_type;
      break;
    }
  }
  if (!recommended && fallbackPrices.length > 0) {
    recommended = fallbackPrices[fallbackPrices.length - 1].car_type;
  }

  const result = {
    hub: hub.hubCode,
    zone,
    resolved_address: resolvedAddress,
    resolution_method: method,
    price_source: priceSource,
    direction,
    passengers,
    recommended_car_type: recommended,
    from_hub: fromHub,
    to_hub: toHub
  };

  if (transfer_date) result.transfer_date = transfer_date;
  if (transfer_time) result.transfer_time = transfer_time;
  if (distanceMiles !== null) result.distance_miles = distanceMiles;

  // Add meeting point info for airport/station pickups
  const meetingPoint = findMeetingPoint(origin) || findMeetingPoint(destination);
  if (meetingPoint) {
    result.meeting_point = { name: meetingPoint.name, instructions: meetingPoint.message };
  }

  return result;
}

module.exports = { getQuote };
