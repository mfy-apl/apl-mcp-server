const express = require('express');
const pool = require('../config/database');
const { HUB_TERMINALS } = require('../config/hubs');
const { getQuote } = require('../tools/getQuote');

const router = express.Router();

const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY;

// Hub display names
const HUB_NAMES = {
  LHR: 'Heathrow',
  LGW: 'Gatwick',
  STN: 'Stansted',
  LTN: 'Luton',
  LCY: 'City Airport',
  EDI: 'Edinburgh',
  SOC: 'Southampton Cruise',
  DVR: 'Dover Cruise',
  PME: 'Portsmouth Cruise',
  LON: 'Central London',
};

// ── Auth middleware ────────────────────────────────────────────────────
function systemAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }
  if (!SYSTEM_API_KEY) {
    console.warn('[SystemAPI] WARNING: SYSTEM_API_KEY not set — rejecting all requests');
    return res.status(500).json({ error: 'System API not configured' });
  }
  if (key !== SYSTEM_API_KEY) {
    console.warn(`[SystemAPI] Invalid API key from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

router.use(systemAuth);

// ── Request logging ───────────────────────────────────────────────────
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[SystemAPI] ${req.method} ${req.originalUrl} | ${res.statusCode} | ${duration}ms | ip=${req.ip}`);
  });
  next();
});

// ── POST /system-api/quote ────────────────────────────────────────────
// Real-time price lookup with all surcharges applied
router.post('/quote', async (req, res) => {
  try {
    const { origin, destination, transfer_date, transfer_time, passengers } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin and destination are required' });
    }

    const result = await getQuote({
      origin,
      destination,
      passengers: passengers || 1,
      transfer_date,
      transfer_time
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[SystemAPI] Quote error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/hubs ──────────────────────────────────────────────
// List all available hubs with terminal names
router.get('/hubs', (req, res) => {
  const hubs = Object.entries(HUB_TERMINALS).map(([code, terminals]) => ({
    code,
    name: HUB_NAMES[code] || code,
    terminals
  }));
  return res.json(hubs);
});

// ── GET /system-api/car-types ─────────────────────────────────────────
// List all active car types with capacity
router.get('/car-types', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, passengers, bags, description, image_url, sort_order FROM car_types WHERE status = 'active' ORDER BY sort_order ASC"
    );
    return res.json(rows);
  } catch (err) {
    console.error('[SystemAPI] Car types error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/prices/:hubCode ───────────────────────────────────
// Bulk export of all fixed prices for a hub.
// Optional ?date=YYYY-MM-DD&time=HH:MM to include surcharges.
router.get('/prices/:hubCode', async (req, res) => {
  try {
    const hubCode = req.params.hubCode.toUpperCase();
    const terminals = HUB_TERMINALS[hubCode];
    if (!terminals) {
      return res.status(400).json({ error: `Unknown hub code: ${hubCode}` });
    }

    const placeholders = terminals.map(() => '?').join(',');

    // Get all from_hub prices (terminal → zone)
    const [fromRows] = await pool.query(`
      SELECT p.Dropoff AS zone, p.Car_Type AS car_type, p.Price AS price, p.Area AS area
      FROM prices p
      WHERE p.Pickup IN (${placeholders}) AND p.Status = 'active'
      ORDER BY p.Dropoff, p.Car_Type
    `, terminals);

    // Get all to_hub prices (zone → terminal)
    const [toRows] = await pool.query(`
      SELECT p.Pickup AS zone, p.Car_Type AS car_type, p.Price AS price, p.Area AS area
      FROM prices p
      WHERE p.Dropoff IN (${placeholders}) AND p.Status = 'active'
      ORDER BY p.Pickup, p.Car_Type
    `, terminals);

    // Build a map: zone+car_type → { from_hub, to_hub }
    const priceMap = new Map();

    function getKey(zone, carType) {
      return `${zone}||${carType}`;
    }

    for (const row of fromRows) {
      // Skip terminal-to-terminal rows
      if (terminals.includes(row.zone)) continue;
      const key = getKey(row.zone, row.car_type);
      if (!priceMap.has(key)) {
        priceMap.set(key, { zone: row.zone, car_type: row.car_type, area: row.area, from_hub: null, to_hub: null });
      }
      priceMap.get(key).from_hub = parseFloat(row.price);
    }

    for (const row of toRows) {
      if (terminals.includes(row.zone)) continue;
      const key = getKey(row.zone, row.car_type);
      if (!priceMap.has(key)) {
        priceMap.set(key, { zone: row.zone, car_type: row.car_type, area: row.area, from_hub: null, to_hub: null });
      }
      priceMap.get(key).to_hub = parseFloat(row.price);
    }

    let prices = Array.from(priceMap.values());

    // If date/time provided, apply surcharges to each price
    const { date, time } = req.query;
    if (date) {
      const { applySurcharges } = require('../tools/getQuote');
      // applySurcharges is not exported — we'll compute inline using getQuote for individual lookups
      // Instead, for bulk we apply surcharges ourselves by querying surcharge rules once
      const surchargeInfo = await getBulkSurchargeMultiplier(hubCode, date, time);

      for (const p of prices) {
        if (p.from_hub !== null) {
          const result = applySurchargesBulk(p.from_hub, surchargeInfo);
          p.from_hub_final = result.finalPrice;
          p.surcharges = result.surcharges;
        }
        if (p.to_hub !== null) {
          const result = applySurchargesBulk(p.to_hub, surchargeInfo);
          p.to_hub_final = result.finalPrice;
          if (!p.surcharges) p.surcharges = result.surcharges;
        }
      }
    }

    // Sort by zone, then car_type
    prices.sort((a, b) => a.zone.localeCompare(b.zone) || a.car_type.localeCompare(b.car_type));

    return res.json({ hub: hubCode, generated_at: new Date().toISOString(), count: prices.length, prices });
  } catch (err) {
    console.error('[SystemAPI] Prices error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/prices/:hubCode/zones ─────────────────────────────
// List all zones that have prices for a hub
router.get('/prices/:hubCode/zones', async (req, res) => {
  try {
    const hubCode = req.params.hubCode.toUpperCase();
    const terminals = HUB_TERMINALS[hubCode];
    if (!terminals) {
      return res.status(400).json({ error: `Unknown hub code: ${hubCode}` });
    }

    const placeholders = terminals.map(() => '?').join(',');

    // Zones as dropoff (from_hub direction)
    const [fromZones] = await pool.query(`
      SELECT DISTINCT p.Dropoff AS zone, p.Area AS area
      FROM prices p
      WHERE p.Pickup IN (${placeholders}) AND p.Status = 'active'
      ORDER BY p.Dropoff
    `, terminals);

    // Zones as pickup (to_hub direction)
    const [toZones] = await pool.query(`
      SELECT DISTINCT p.Pickup AS zone, p.Area AS area
      FROM prices p
      WHERE p.Dropoff IN (${placeholders}) AND p.Status = 'active'
      ORDER BY p.Pickup
    `, terminals);

    // Merge and deduplicate
    const zoneMap = new Map();
    for (const row of fromZones) {
      if (terminals.includes(row.zone)) continue;
      if (!zoneMap.has(row.zone)) {
        zoneMap.set(row.zone, { zone: row.zone, area: row.area || null, directions: [] });
      }
      zoneMap.get(row.zone).directions.push('from_hub');
    }
    for (const row of toZones) {
      if (terminals.includes(row.zone)) continue;
      if (!zoneMap.has(row.zone)) {
        zoneMap.set(row.zone, { zone: row.zone, area: row.area || null, directions: [] });
      }
      const entry = zoneMap.get(row.zone);
      if (!entry.directions.includes('to_hub')) {
        entry.directions.push('to_hub');
      }
    }

    const zones = Array.from(zoneMap.values()).sort((a, b) => a.zone.localeCompare(b.zone));
    return res.json({ hub: hubCode, count: zones.length, zones });
  } catch (err) {
    console.error('[SystemAPI] Zones error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/mileage-bands/:hubCode ────────────────────────────
// Mileage band rates for a hub (price-per-mile by distance bracket and car type)
router.get('/mileage-bands/:hubCode', async (req, res) => {
  try {
    const hubCode = req.params.hubCode.toUpperCase();
    if (!HUB_TERMINALS[hubCode]) {
      return res.status(400).json({ error: `Unknown hub code: ${hubCode}` });
    }

    const [rows] = await pool.query(`
      SELECT mb.id, mb.from_distance, mb.to_distance, mb.price_per_mile, mb.min_fare, mb.supplement,
             mb.tunnel_id, ct.name AS car_type, ct.id AS car_type_id,
             mt.name AS tunnel_name, mt.zone_a AS tunnel_zone_a, mt.zone_b AS tunnel_zone_b
      FROM mileage_bands mb
      JOIN car_types ct ON ct.id = mb.car_type_id
      LEFT JOIN mileage_tunnels mt ON mt.id = mb.tunnel_id
      WHERE mb.hub_code = ?
      ORDER BY mb.tunnel_id IS NULL DESC, mb.tunnel_id, mb.from_distance, ct.sort_order
    `, [hubCode]);

    const bands = rows.map(r => ({
      car_type: r.car_type,
      car_type_id: r.car_type_id,
      from_miles: parseFloat(r.from_distance),
      to_miles: parseFloat(r.to_distance),
      price_per_mile: parseFloat(r.price_per_mile),
      min_fare: parseFloat(r.min_fare || 0),
      supplement: r.supplement || '0',
      tunnel: r.tunnel_id ? { id: r.tunnel_id, name: r.tunnel_name, zone_a: r.tunnel_zone_a, zone_b: r.tunnel_zone_b } : null
    }));

    return res.json({ hub: hubCode, count: bands.length, bands });
  } catch (err) {
    console.error('[SystemAPI] Mileage bands error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/zone-distances/:hubCode ───────────────────────────
// Zone distances from a hub (used for mileage-based pricing)
router.get('/zone-distances/:hubCode', async (req, res) => {
  try {
    const hubCode = req.params.hubCode.toUpperCase();
    if (!HUB_TERMINALS[hubCode]) {
      return res.status(400).json({ error: `Unknown hub code: ${hubCode}` });
    }

    const [rows] = await pool.query(
      'SELECT zone_name, distance_miles, duration_mins FROM zone_distances WHERE hub_code = ? ORDER BY zone_name',
      [hubCode]
    );

    const distances = rows.map(r => ({
      zone: r.zone_name,
      distance_miles: parseFloat(r.distance_miles),
      duration_mins: r.duration_mins ? parseFloat(r.duration_mins) : null
    }));

    return res.json({ hub: hubCode, count: distances.length, distances });
  } catch (err) {
    console.error('[SystemAPI] Zone distances error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /system-api/surcharges/:hubCode ───────────────────────────────
// All surcharge rules for a hub (rush hour, events, lead time, discounts, pickup charges, area supplements)
router.get('/surcharges/:hubCode', async (req, res) => {
  try {
    const hubCode = req.params.hubCode.toUpperCase();
    if (!HUB_TERMINALS[hubCode]) {
      return res.status(400).json({ error: `Unknown hub code: ${hubCode}` });
    }

    // Rush hour
    const [rushHour] = await pool.query(
      'SELECT name, start_time, end_time, days, type, value FROM rush_hour_surcharges WHERE hub_code = ? AND active = 1',
      [hubCode]
    );

    // Events
    const [events] = await pool.query(
      'SELECT event_name, from_date, to_date, surcharge AS percentage FROM event_surcharges WHERE hub_code = ? ORDER BY from_date',
      [hubCode]
    );

    // Lead time
    const [leadTime] = await pool.query(
      'SELECT min_hours, max_hours, surcharge AS percentage FROM lead_time_surcharges WHERE hub_code = ? ORDER BY min_hours',
      [hubCode]
    );

    // Genius discounts
    const [discounts] = await pool.query(
      'SELECT from_date, to_date, discount AS percentage FROM genius_discounts WHERE hub_code = ? ORDER BY from_date',
      [hubCode]
    );

    // Pickup charges
    const [pickup] = await pool.query(
      'SELECT parking_fee, meet_greet_fee FROM pickup_charges WHERE hub_code = ?',
      [hubCode]
    );

    // Area supplements
    const [areaSupplements] = await pool.query(
      'SELECT name, zones, amount FROM area_supplements WHERE hub_code = ? AND active = 1',
      [hubCode]
    );

    // Stop sales
    const [stopSales] = await pool.query(
      'SELECT from_date, to_date, reason FROM stop_sales WHERE hub_code = ? ORDER BY from_date',
      [hubCode]
    );

    return res.json({
      hub: hubCode,
      rush_hour: rushHour.map(r => ({
        name: r.name || 'Rush hour',
        start_time: r.start_time,
        end_time: r.end_time,
        days: r.days || '0,1,2,3,4,5,6',
        type: r.type,
        value: parseFloat(r.value)
      })),
      events: events.map(r => ({
        event_name: r.event_name,
        from_date: r.from_date,
        to_date: r.to_date,
        percentage: parseFloat(r.percentage)
      })),
      lead_time: leadTime.map(r => ({
        min_hours: r.min_hours,
        max_hours: r.max_hours,
        percentage: parseFloat(r.percentage)
      })),
      discounts: discounts.map(r => ({
        from_date: r.from_date,
        to_date: r.to_date,
        percentage: parseFloat(r.percentage)
      })),
      pickup_charges: pickup.length > 0 ? {
        parking_fee: parseFloat(pickup[0].parking_fee || 0),
        meet_greet_fee: parseFloat(pickup[0].meet_greet_fee || 0)
      } : null,
      area_supplements: areaSupplements.map(r => ({
        name: r.name,
        zones: r.zones,
        amount: parseFloat(r.amount)
      })),
      stop_sales: stopSales.map(r => ({
        from_date: r.from_date,
        to_date: r.to_date,
        reason: r.reason
      }))
    });
  } catch (err) {
    console.error('[SystemAPI] Surcharges error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Bulk surcharge helpers ────────────────────────────────────────────

/**
 * Fetch all surcharge rules for a hub+date+time once, to apply to many prices.
 */
async function getBulkSurchargeMultiplier(hubCode, transferDate, transferTime) {
  const info = {
    leadTimePct: 0,
    rushHourRules: [],
    eventPcts: [],
    discountPcts: [],
    parkingFee: 0,
    meetGreet: 0
  };

  // Lead time
  if (transferDate && transferTime) {
    const pickupDateTime = new Date(`${transferDate}T${transferTime}:00`);
    const hoursUntilPickup = Math.max(0, (pickupDateTime - new Date()) / (1000 * 60 * 60));

    const [ltRules] = await pool.query(
      'SELECT surcharge FROM lead_time_surcharges WHERE hub_code = ? AND min_hours <= ? AND max_hours >= ?',
      [hubCode, hoursUntilPickup, hoursUntilPickup]
    );
    if (ltRules.length > 0) {
      info.leadTimePct = parseFloat(ltRules[0].surcharge);
      info.leadTimeHours = Math.round(hoursUntilPickup);
    }
  }

  // Rush hour
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

      const inWindow = endMin > startMin
        ? (pickupMin >= startMin && pickupMin < endMin)
        : (pickupMin >= startMin || pickupMin < endMin);

      if (inWindow) {
        info.rushHourRules.push({ name: rh.name, type: rh.type, value: parseFloat(rh.value) });
      }
    }
  }

  // Events
  if (transferDate) {
    const [events] = await pool.query(
      'SELECT event_name, surcharge FROM event_surcharges WHERE hub_code = ? AND from_date <= ? AND to_date >= ?',
      [hubCode, transferDate, transferDate]
    );
    for (const evt of events) {
      info.eventPcts.push({ name: evt.event_name, pct: parseFloat(evt.surcharge) });
    }
  }

  // Genius discounts
  if (transferDate) {
    const [genius] = await pool.query(
      'SELECT discount FROM genius_discounts WHERE hub_code = ? AND from_date <= ? AND to_date >= ?',
      [hubCode, transferDate, transferDate]
    );
    for (const g of genius) {
      info.discountPcts.push(parseFloat(g.discount));
    }
  }

  // Pickup charges
  const [pickupRows] = await pool.query(
    'SELECT parking_fee, meet_greet_fee FROM pickup_charges WHERE hub_code = ?',
    [hubCode]
  );
  if (pickupRows.length > 0) {
    info.parkingFee = parseFloat(pickupRows[0].parking_fee || 0);
    info.meetGreet = parseFloat(pickupRows[0].meet_greet_fee || 0);
  }

  return info;
}

/**
 * Apply pre-fetched surcharge rules to a single base price.
 */
function applySurchargesBulk(basePrice, info) {
  let finalPrice = basePrice;
  const surcharges = [];

  // Lead time
  if (info.leadTimePct > 0) {
    const amount = Math.round(finalPrice * info.leadTimePct / 100 * 100) / 100;
    finalPrice += amount;
    surcharges.push({ type: 'lead_time', description: `Last-minute booking (${info.leadTimeHours}h)`, percentage: info.leadTimePct, amount });
  }

  // Rush hour
  for (const rh of info.rushHourRules) {
    if (rh.type === 'fixed') {
      finalPrice += rh.value;
      surcharges.push({ type: 'rush_hour', description: rh.name || 'Rush hour', amount: rh.value });
    } else {
      const amount = Math.round(finalPrice * rh.value / 100 * 100) / 100;
      finalPrice += amount;
      surcharges.push({ type: 'rush_hour', description: rh.name || 'Rush hour', percentage: rh.value, amount });
    }
  }

  // Events
  for (const evt of info.eventPcts) {
    const amount = Math.round(finalPrice * evt.pct / 100 * 100) / 100;
    finalPrice += amount;
    surcharges.push({ type: 'event', description: evt.name, percentage: evt.pct, amount });
  }

  // Discounts
  for (const pct of info.discountPcts) {
    const amount = Math.round(finalPrice * pct / 100 * 100) / 100;
    finalPrice -= amount;
    surcharges.push({ type: 'discount', description: 'Loyalty discount', percentage: pct, amount: -amount });
  }

  // Pickup charges
  if (info.parkingFee > 0) {
    finalPrice += info.parkingFee;
    surcharges.push({ type: 'parking_fee', description: 'Airport parking fee', amount: info.parkingFee });
  }
  if (info.meetGreet > 0) {
    finalPrice += info.meetGreet;
    surcharges.push({ type: 'meet_greet', description: 'Meet & greet fee', amount: info.meetGreet });
  }

  finalPrice = Math.round(finalPrice * 100) / 100;
  return { finalPrice, surcharges };
}

module.exports = router;
