/**
 * Skill executor — routes A2A message parts to the appropriate tool.
 *
 * Supports:
 *  - DataPart with { skill: "get_quote", ... } → direct route
 *  - DataPart without skill → auto-detect (has passenger_name? → booking, otherwise → quote)
 *  - TextPart → return input-required with expected schema
 */

const { getQuote } = require('../tools/getQuote');
const { createBooking } = require('../tools/createBooking');

const QUOTE_SCHEMA = {
  skill: 'get_quote',
  required: ['origin', 'destination'],
  optional: ['passengers', 'suitcases', 'transfer_date', 'transfer_time'],
  example: {
    skill: 'get_quote',
    origin: 'Heathrow',
    destination: 'W1K 1LN',
    passengers: 2,
    transfer_date: '2026-04-01',
    transfer_time: '14:00'
  }
};

const BOOKING_SCHEMA = {
  skill: 'create_booking',
  required: ['origin', 'destination', 'transfer_date', 'transfer_time', 'passenger_name', 'passenger_phone'],
  optional: ['passengers', 'suitcases', 'car_type', 'passenger_email', 'door_number', 'flight_number', 'cruise_name', 'train_number', 'special_requests'],
  example: {
    skill: 'create_booking',
    origin: 'Heathrow',
    destination: 'W1K 1LN',
    transfer_date: '2026-04-01',
    transfer_time: '14:00',
    passenger_name: 'John Smith',
    passenger_phone: '+447123456789',
    passenger_email: 'john@example.com',
    car_type: 'Saloon'
  }
};

/**
 * Execute a skill from message parts.
 * Returns { state, artifact?, message? }
 *   state: 'completed' | 'failed' | 'input-required'
 *   artifact: the result data (if completed)
 *   message: guidance text (if input-required or failed)
 */
async function executeSkill(parts, agentConfig) {
  console.log('[A2A] Incoming parts:', JSON.stringify(parts));

  // Find DataPart: { type: 'data', data: {...} } or { data: {...} }
  const dataPart = parts.find(p => p.type === 'data' || (p.data && typeof p.data === 'object'));
  // Find TextPart: { type: 'text', text: '...' } or { text: '...' } (Gemini v0.2.5 format)
  const textPart = parts.find(p => p.type === 'text' || (p.text && typeof p.text === 'string'));

  if (dataPart) {
    return executeDataPart(dataPart.data, agentConfig);
  }

  if (textPart) {
    return await handleTextPart(textPart.text);
  }

  return {
    state: 'failed',
    message: 'Message must contain at least one DataPart (application/json) or TextPart.'
  };
}

/**
 * Execute a DataPart — either explicitly routed via `skill` or auto-detected.
 */
async function executeDataPart(data, agentConfig) {
  const skill = data.skill || detectSkill(data);

  if (skill === 'get_quote') {
    return runQuote(data);
  }

  if (skill === 'create_booking') {
    return runBooking(data, agentConfig);
  }

  return {
    state: 'input-required',
    message: `Unknown skill "${skill || ''}". Available skills: get_quote, create_booking. Send a DataPart with { "skill": "get_quote", "origin": "...", "destination": "..." }.`
  };
}

/**
 * Auto-detect which skill the data is for based on field presence.
 */
function detectSkill(data) {
  if (data.passenger_name || data.passenger_phone) return 'create_booking';
  if (data.origin || data.destination) return 'get_quote';
  return null;
}

/**
 * Handle a plain text message — use Gemini Flash for conversational responses.
 * Falls back to schema guidance if chat service is unavailable.
 */
async function handleTextPart(text) {
  try {
    const { chat } = require('../services/chatLLM');
    const result = await chat(text, []);
    return {
      state: 'completed',
      artifact: {
        name: 'response',
        parts: [{ type: 'text', text: result.reply }]
      }
    };
  } catch (err) {
    console.error('[A2A] Chat fallback error:', err.message);
    // Fallback to schema guidance
    const lower = (text || '').toLowerCase();
    const isBooking = /\b(book|reserve|reservation|booking)\b/.test(lower);
    const isQuote = /\b(quote|price|cost|how much|fare|rate)\b/.test(lower);

    let guidance = 'I\'m the Airport Pickups London booking agent. I can help you with:\n\n';
    if (isBooking) {
      guidance += `To create a booking, send:\n${JSON.stringify(BOOKING_SCHEMA.example, null, 2)}`;
    } else if (isQuote) {
      guidance += `To get a quote, send:\n${JSON.stringify(QUOTE_SCHEMA.example, null, 2)}`;
    } else {
      guidance += `1. **Get a quote** — Ask me the price for any UK transfer\n`;
      guidance += `2. **Book a transfer** — I'll guide you through the booking\n\n`;
      guidance += `Try: "How much from Heathrow to central London?"`;
    }
    return { state: 'input-required', message: guidance };
  }
}

/**
 * Run the get_quote tool.
 */
async function runQuote(data) {
  if (!data.origin || !data.destination) {
    return {
      state: 'input-required',
      message: `get_quote requires "origin" and "destination". Example:\n${JSON.stringify(QUOTE_SCHEMA.example, null, 2)}`
    };
  }

  try {
    const result = await getQuote({
      origin: data.origin,
      destination: data.destination,
      passengers: data.passengers || 1,
      transfer_date: data.transfer_date,
      transfer_time: data.transfer_time
    });

    if (result.error) {
      return { state: 'failed', message: result.error };
    }

    return {
      state: 'completed',
      artifact: {
        name: 'quote',
        parts: [{ type: 'data', data: result, mimeType: 'application/json' }]
      }
    };
  } catch (err) {
    console.error('[A2A] get_quote error:', err.message);
    return { state: 'failed', message: 'Internal error getting quote.' };
  }
}

/**
 * Run the create_booking tool.
 */
async function runBooking(data, agentConfig) {
  const missing = [];
  for (const field of BOOKING_SCHEMA.required) {
    if (!data[field]) missing.push(field);
  }
  if (missing.length > 0) {
    return {
      state: 'input-required',
      message: `create_booking requires: ${missing.join(', ')}.\nExample:\n${JSON.stringify(BOOKING_SCHEMA.example, null, 2)}`
    };
  }

  try {
    const result = await createBooking({
      origin: data.origin,
      destination: data.destination,
      transfer_date: data.transfer_date,
      transfer_time: data.transfer_time,
      passenger_name: data.passenger_name,
      passenger_phone: data.passenger_phone,
      passenger_email: data.passenger_email,
      passengers: data.passengers || 1,
      suitcases: data.suitcases || 1,
      car_type: data.car_type,
      door_number: data.door_number,
      flight_number: data.flight_number,
      cruise_name: data.cruise_name,
      train_number: data.train_number,
      special_requests: data.special_requests
    }, agentConfig || undefined);

    if (result.error) {
      return { state: 'failed', message: result.error };
    }

    return {
      state: 'completed',
      artifact: {
        name: 'booking',
        parts: [{ type: 'data', data: result, mimeType: 'application/json' }]
      }
    };
  } catch (err) {
    console.error('[A2A] create_booking error:', err.message);
    return { state: 'failed', message: 'Internal error creating booking.' };
  }
}

module.exports = { executeSkill };
