const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { getQuote } = require('../tools/getQuote');
const { createBooking } = require('../tools/createBooking');
const { chat } = require('../services/chatLLM');
const { lookupFlight } = require('../services/flightStatsClient');
const { findMeetingPoint } = require('../data/meetingPoints');

const router = express.Router();

// Stricter rate limit for chat (LLM calls are expensive)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req.ip || '127.0.0.1').replace(/:\d+$/, ''),
  validate: false,
  message: { error: 'Too many chat requests. Please wait a moment and try again.' }
});

// ── Auth middleware: x-api-key → api_agents lookup ───────────────────
async function agentAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM api_agents WHERE api_key = ? AND is_active = 1',
      [apiKey]
    );
    if (rows.length === 0) {
      console.warn(`[API] Invalid agent API key from ${req.ip}`);
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }
    req.agent = rows[0];
    next();
  } catch (err) {
    console.error('[API] Auth lookup error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.use(agentAuth);

// ── Request logging ──────────────────────────────────────────────────
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const agent = req.agent?.agent_name || 'unknown';
    console.log(`[API] ${req.method} ${req.originalUrl} | ${res.statusCode} | ${duration}ms | agent=${agent} | ip=${req.ip}`);
  });
  next();
});

// ── POST /api/quote ──────────────────────────────────────────────────
// Uses APL fixed prices from our database (same as MCP get_quote tool)
router.post('/quote', async (req, res) => {
  try {
    const { origin, destination, passengers, suitcases, transfer_date, transfer_time } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin and destination are required' });
    }

    const { requestedDiscountPercent } = req.body;
    const result = await getQuote({ origin, destination, passengers: passengers || 1, transfer_date, transfer_time });

    if (result.error) {
      return res.status(400).json(result);
    }

    // A2A pricing negotiation: cap discount at 5%
    const requested = parseFloat(requestedDiscountPercent) || 0;
    const applied = Math.min(Math.max(requested, 0), 5);

    // Flatten to simpler format for REST API consumers
    const direction = result.direction || 'from_hub';
    const prices = result[direction] || result.from_hub || result.to_hub || [];

    const cars = prices.map(p => {
      const basePrice = p.final_price_gbp || p.price_gbp;
      const finalPrice = applied > 0 ? Math.round(basePrice * (1 - applied / 100) * 100) / 100 : basePrice;
      return {
        car_type: p.car_type,
        price_gbp: finalPrice,
        max_passengers: p.max_passengers,
        max_bags: p.max_bags,
        description: p.description || null
      };
    });

    const response = {
      pickup: direction === 'from_hub' ? (result.hub + ' Airport') : result.resolved_address,
      dropoff: direction === 'from_hub' ? result.resolved_address : (result.hub + ' Airport'),
      transfer_date: result.transfer_date || transfer_date || new Date().toISOString().split('T')[0],
      transfer_time: result.transfer_time || transfer_time || null,
      passengers: result.passengers || 1,
      recommended_car_type: result.recommended_car_type,
      cars,
      ...(applied > 0 ? { appliedDiscountPercent: applied } : {})
    };

    if (result.meeting_point) {
      response.meeting_point = result.meeting_point;
    }

    return res.json(response);
  } catch (err) {
    console.error('[API] Quote error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/book ───────────────────────────────────────────────────
router.post('/book', async (req, res) => {
  try {
    const {
      origin, destination, transfer_date, transfer_time,
      passengers, suitcases, car_type, passenger_name, passenger_phone,
      passenger_email, door_number, flight_number, cruise_name, train_number, special_requests,
      account_reference, invoice_price, skip_tag, extra_pickups, extra_dropoffs, staff_note
    } = req.body;

    // Validate required fields
    const missing = [];
    if (!origin) missing.push('origin');
    if (!destination) missing.push('destination');
    if (!transfer_date) missing.push('transfer_date');
    if (!transfer_time) missing.push('transfer_time');
    if (!passenger_name) missing.push('passenger_name');
    if (!passenger_phone) missing.push('passenger_phone');
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const agent = req.agent;
    const agentConfig = {
      agentName: agent.agent_name,
      accountId: agent.account_id,
      channelId: agent.channel_id,
      paymentType: parseInt(String(agent.payment_type || '1').split(',')[0]) || 1,
      bookingPrefix: agent.booking_prefix,
      skipTag: !!skip_tag
    };

    const result = await createBooking({
      origin, destination, transfer_date, transfer_time,
      passengers: passengers || 1,
      suitcases: suitcases || 1,
      car_type, passenger_name, passenger_phone, passenger_email,
      door_number, flight_number, cruise_name, train_number, special_requests,
      account_reference, invoice_price, extra_pickups, extra_dropoffs, staff_note
    }, agentConfig);

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[API] Book error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/validate-flight ────────────────────────────────────────
// Validates a flight number and returns airline, terminal, arrival time
router.post('/validate-flight', async (req, res) => {
  try {
    const { flight_number, date } = req.body;

    if (!flight_number) {
      return res.status(400).json({ error: 'flight_number is required' });
    }
    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const result = await lookupFlight(flight_number, date);

    if (!result.valid) {
      return res.json({
        valid: false,
        message: result.error || 'Could not verify flight. Booking can still proceed without flight validation.'
      });
    }

    // Look up meeting point using airport name + terminal from FlightStats
    const airportName = result.arrivalAirportName || result.arrivalAirport || '';
    const terminal = result.arrivalTerminal || null;
    const meetingPoint = findMeetingPoint(airportName, terminal);

    return res.json({
      valid: true,
      airline: result.airline,
      flight_number: `${result.carrier}${result.flightNum}`,
      arrival_airport: result.arrivalAirportName || result.arrivalAirport,
      arrival_terminal: terminal,
      arrival_time: result.arrivalTime || null,
      departure_airport: result.departureAirport || null,
      source: result.source,
      meeting_point: meetingPoint ? { name: meetingPoint.name, instructions: meetingPoint.message } : null
    });
  } catch (err) {
    console.error('[API] Validate flight error:', err.message);
    return res.json({
      valid: false,
      message: 'Flight validation temporarily unavailable. Booking can still proceed.'
    });
  }
});

// ── POST /api/chat ───────────────────────────────────────────────────
// AI-powered chat using LLM (Claude or Gemini) with get_quote tool
router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'message too long (max 500 characters)' });
    }

    // Validate history if provided
    const safeHistory = [];
    if (Array.isArray(history)) {
      for (const msg of history.slice(-20)) { // Keep last 20 messages max
        if (msg.role && msg.content && typeof msg.content === 'string') {
          safeHistory.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content.slice(0, 1000) // Truncate long history entries
          });
        }
      }
    }

    const result = await chat(message, safeHistory);
    return res.json(result);
  } catch (err) {
    console.error('[API] Chat error:', err.message);
    return res.status(500).json({ error: 'Chat service temporarily unavailable. Please try again.' });
  }
});

module.exports = router;
