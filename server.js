require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { mcpAuthRouter } = require('@modelcontextprotocol/sdk/server/auth/router.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const pool = require('./config/database');
const { getQuote } = require('./tools/getQuote');
const { createBooking } = require('./tools/createBooking');
const { lookupFlight } = require('./services/flightStatsClient');
const { ClientsStore } = require('./auth/clientsStore');
const { AplOAuthProvider } = require('./auth/oauthProvider');
const apiRouter = require('./routes/api');
const systemApiRouter = require('./routes/systemApi');
const docsRouter = require('./routes/docs');
const privacyRouter = require('./routes/privacy');
const a2aRouter = require('./routes/a2a');
const stripeWebhookRouter = require('./routes/stripeWebhook');
const { agentCard } = require('./a2a/agentCard');

const PORT = process.env.PORT || 5005;
const MCP_API_KEY = process.env.MCP_API_KEY;
const BASE_URL = 'https://mcp.airport-pickups-london.com';
const RESOURCE_URL = `${BASE_URL}/mcp`;

/**
 * Create a fresh MCP server with the get_quote tool registered.
 * Called per-request for stateless operation.
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'london-airport-transfers',
    version: '1.0.0',
    instructions: `You are a booking assistant for London Airport Transfers by Airport Pickups London (APL Cars) — a licensed London private hire airport transfer service.

ABOUT US:
- Licensed private hire operator based in London
- Airport transfers to/from Heathrow (T2-T5), Gatwick (North & South), Stansted, Luton, London City Airport, Edinburgh
- Cruise port transfers: Southampton, Dover, Portsmouth, Tilbury, Harwich
- Transfers to and from any UK address or postcode nationwide
- Available 24 hours a day, 7 days a week

PRICING:
- All prices are in GBP (£)
- Quotes include: Airport Meet & Greet, waiting time, parking, and tolls
- Fixed prices — no hidden charges or surge pricing
- Gratuities/tips are discretionary

WHY CHOOSE US:
- Free cancellation (12+ hours before pickup, £10 admin fee; 6-12 hours: 50% charge; under 6 hours: no refund)
- Free baby seats and child seats on request — just ask when booking
- Flight tracking — we track your flight and adjust pickup time to actual landing time
- Meet & greet — driver waits inside the terminal with a name board
- 30 mins free waiting (after that: £15–£45 depending on duration)
- Professional, licensed drivers

CUSTOMER RATINGS:
- TripAdvisor: 4.7/5
- Trustpilot: 4.9/5
- Reviews.io: 4.9/5

CONTACT US (24 hours):
- Phone: +44 208 688 7744
- WhatsApp: +44 7538 989360
- Live Chat: https://www.airport-pickups-london.com
- Email: info@aplcars.com

WEBSITE: https://www.airport-pickups-london.com

BOOKING FLOW:
1. Use london_airport_transfer_quote to show prices
2. Collect all passenger details
3. Inform the customer: booking is created as cash, but they can pay by card/Apple Pay/Google Pay via the manage booking link
4. Use book_london_airport_transfer to create the reservation
5. Share booking reference and manage_booking_url for tracking and online payment
6. If the customer needs help, direct them to our 24-hour contact lines above

LUGGAGE & SPECIAL ITEMS:
- Suitcase capacity is based on MEDIUM suitcases (60–69 cm / 24–26 inches). Larger suitcases (70 cm+) may need a bigger vehicle.
- Handbags, backpacks, and small personal items do not count towards the suitcase limit
- Golf bags, ski bags, surfboards: large and long — ONLY fit in 8 Seater, Executive MPV, or Executive 8 Seater
- Wheelchairs: must be foldable, any car type can accept
- Pushchairs: foldable ones fit any car, non-foldable counts as 1 suitcase
- Bicycles: need 8 Seater minimum, boxed or bagged
- Pets: welcome in all vehicles, £25 valeting charge applies, must be caged or harnessed (guide dogs free)
- If a customer mentions golf/ski bags, surfboards, or bicycles, only recommend suitable large vehicles
- Child seats: FREE. Types by age: baby seat (0-12mo), child seat (1-4yrs), booster (4-12yrs). Max per vehicle: Saloon 1, People Carrier 2, 8 Seater 3. If child seat requested, ask child's age. 4+ seats: must call +44 208 688 7744.

IMPORTANT — LONDON LOCATIONS:
- We recognise London neighborhoods, landmarks, hotels, and stations (e.g. Covent Garden, Westminster, Mayfair, Canary Wharf, Kings Cross, The Shard, Hilton Paddington). If the user mentions one of these, go ahead and get a quote.
- But if they just say "Central London" or "London" with no further detail, ask which area, postcode, or hotel they mean.
- BOOKING vs QUOTING: For a QUOTE, a neighborhood or landmark name is fine. But when the customer wants to BOOK, you MUST ask for the specific address, hotel name, or full postcode so the driver knows exactly where to go.

Always be helpful, professional, and transparent about pricing. Show all available car options and let the customer choose. Proactively mention our key benefits (fixed prices, free cancellation, free baby seats, flight tracking) when presenting quotes.`
  });

  server.tool(
    'london_airport_transfer_quote',
    'Get London airport transfer prices between a UK airport or cruise port and any UK address or postcode. Covers all London airports (Heathrow, Gatwick, Stansted, Luton, City Airport), Edinburgh Airport, and all major UK cruise ports (Southampton, Dover, Portsmouth). Transfers available to and from any UK postcode and address nationwide. Returns available car types with prices, passenger capacity, and luggage capacity. Use both passenger count and suitcase count to recommend the right car.',
    {
      origin: z.string().max(200).describe('Pickup location — airport name (e.g. "Heathrow", "Gatwick") OR full address/postcode/city'),
      destination: z.string().max(200).describe('Dropoff location — full address, postcode, city name, hotel name, or airport name'),
      passengers: z.number().min(1).max(50).default(1).describe('Number of passengers (determines recommended car type)'),
      suitcases: z.number().min(0).max(50).default(1).describe('Number of suitcases/large bags (helps recommend the right car)'),
      transfer_date: z.string().optional().describe('Transfer date (e.g. "2026-12-25"). Ask the user naturally for their travel date and convert to YYYY-MM-DD. Defaults to today.'),
      transfer_time: z.string().optional().describe('Transfer time (e.g. "14:30"). Ask the user naturally for their preferred time and convert to HH:MM. Defaults to now.')
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ origin, destination, passengers, transfer_date, transfer_time }) => {
      try {
        const result = await getQuote({ origin, destination, passengers, transfer_date, transfer_time });

        if (result.error) {
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: true
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        console.error('get_quote error:', err.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error' }) }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'book_london_airport_transfer',
    `Book a London airport or cruise port transfer to/from any UK address. Creates a REAL reservation — only call after the customer confirms.

REQUIRED FLOW — collect ALL info before booking:
1. Ask: Where are you travelling from and to?
2. Ask: What date and time? (ask naturally, never expose technical formats like YYYY-MM-DD to the user)
3. Ask: How many passengers and how many suitcases/large bags?
4. Call london_airport_transfer_quote to show prices and car options
5. Ask: Which car type would you like? (show the options with prices)
6. Ask: Passenger full name
7. Ask: Phone number (with country code)
8. Ask: Email address (for booking confirmation)
9. If destination/origin is a POSTCODE (e.g. SL4 5LP, W1K 1LN), ask: What is the house/building number or name at that postcode? The driver needs the exact door.
10. Ask the RIGHT transport detail based on booking type:
   - Airport PICKUP (customer arriving at airport) → Flight number (e.g. BA2534). Use validate_flight to verify and auto-detect terminal.
   - Airport DROPOFF (customer going TO airport) → Flight number is optional, don't require it
   - Cruise port pickup/dropoff → Cruise/ship name (e.g. P&O Ventura)
   - Train station pickup/dropoff → Train number or arriving from where
   - Non-airport/port/station route → skip, no transport detail needed
11. MANDATORY — Ask: "Do you have any special requests? For example, child seat, extra luggage, wheelchair, pet?" You MUST ask this every time. Do NOT skip it. If they mention a child seat, ask the child's age (baby seat 0-12mo, child seat 1-4yrs, booster 4-12yrs). Check seat limit for their car (Saloon 1, People Carrier 2, 8 Seater 3). If they ask for extra pickup or drop-off stops, tell them: "No problem! Extra stops will change the price — let me get you an updated quote." Then call london_airport_transfer_quote again with the full route.
12. MANDATORY — Before confirming the booking, inform the passenger: "We'll create your booking and you can pay the driver in cash on the day. If you prefer to pay online, you can do so via your manage booking link — we accept all major cards including Amex, Apple Pay, Google Pay, PayPal, Revolut, WeChat Pay, and AliPay." Wait for the customer to confirm.
13. Confirm all details with the customer, then call book_london_airport_transfer
14. AFTER booking: Share the booking_reference number and the manage_booking_url. Say: "Booking confirmed! You can track your driver, view booking details, and pay online (all major cards, Amex, Apple Pay, Google Pay, PayPal, Revolut, WeChat Pay, AliPay) using this link: {manage_booking_url}"
    - Share meeting_point instructions — ALWAYS include the terminal/location name from meeting_point.name (e.g. "Meeting point at Heathrow Terminal 2: ..."). Never show meeting instructions without specifying which terminal or location.

IMPORTANT: Never call book_london_airport_transfer without customer confirmation. Always show the price first via london_airport_transfer_quote.
IMPORTANT: The customer MUST choose a car type from the quote. Do NOT auto-select a car — always ask which one they want.
IMPORTANT: Email address is REQUIRED — it is used for the booking management link and confirmation.
IMPORTANT: Always inform the customer about payment options (cash or card/Apple Pay/Google Pay via manage booking link) BEFORE making the booking.`,
    {
      origin: z.string().max(200).describe('Pickup location — airport name or full address/postcode'),
      destination: z.string().max(200).describe('Dropoff location — full address, postcode, or airport name'),
      transfer_date: z.string().describe('Transfer date (e.g. "2026-03-15"). Ask the user naturally for their travel date and convert to YYYY-MM-DD internally.'),
      transfer_time: z.string().describe('Transfer time (e.g. "14:30"). Ask the user naturally for their preferred time and convert to HH:MM internally.'),
      passenger_name: z.string().max(100).describe('Full name of the passenger'),
      passenger_phone: z.string().max(30).describe('Passenger phone number with country code (e.g. "+447123456789")'),
      passenger_email: z.string().max(100).optional().describe('Passenger email address for confirmation'),
      passengers: z.number().min(1).max(50).default(1).describe('Number of passengers'),
      suitcases: z.number().min(0).max(50).default(1).describe('Number of suitcases/large bags'),
      car_type: z.string().max(50).optional().describe('Car type (e.g. "Saloon", "People Carrier", "Executive Saloon"). Auto-selected if not specified.'),
      door_number: z.string().max(100).optional().describe('House/building number or name for postcode destinations (e.g. "12", "Flat 3", "The Old Rectory"). Required when destination is a postcode.'),
      flight_number: z.string().max(20).optional().describe('Flight number for airport pickups/dropoffs (e.g. "BA2534")'),
      cruise_name: z.string().max(100).optional().describe('Cruise/ship name for cruise port pickups/dropoffs (e.g. "P&O Ventura")'),
      train_number: z.string().max(50).optional().describe('Train number or origin for train station pickups/dropoffs (e.g. "from Manchester")'),
      special_requests: z.string().max(500).optional().describe('Any special requirements (e.g. "child seat needed", "extra luggage")')
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (params) => {
      try {
        const result = await createBooking(params);

        if (result.error) {
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: true
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        console.error('create_booking error:', err.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error' }) }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'validate_flight',
    'Validate a flight number and get flight details including airline name, arrival airport, terminal, and arrival time. Use this to verify a customer\'s flight number before booking and auto-detect the correct terminal. Works with future scheduled flights.',
    {
      flight_number: z.string().max(10).describe('Flight number (e.g. "BA2534", "EK007", "FR1234")'),
      date: z.string().describe('Flight date in YYYY-MM-DD format')
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async ({ flight_number, date }) => {
      try {
        const result = await lookupFlight(flight_number, date);
        if (result.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              valid: true,
              airline: result.airline,
              flight_number: `${result.carrier}${result.flightNum}`,
              arrival_airport: result.arrivalAirportName || result.arrivalAirport,
              arrival_terminal: result.arrivalTerminal,
              arrival_time: result.arrivalTime,
              departure_airport: result.departureAirport
            }, null, 2) }]
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({
            valid: false,
            message: result.error || 'Flight not found'
          }, null, 2) }]
        };
      } catch (err) {
        console.error('validate_flight error:', err.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            valid: false,
            message: 'Could not verify flight. Booking can still proceed without flight validation.'
          }) }]
        };
      }
    }
  );

  return server;
}

// ── DB Migrations ────────────────────────────────────────────────────
async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gia_bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_ref VARCHAR(20) NOT NULL UNIQUE,
        external_ref VARCHAR(50),
        pickup_location VARCHAR(300),
        dropoff_location VARCHAR(300),
        transfer_date DATE,
        transfer_time VARCHAR(10),
        passengers INT DEFAULT 1,
        car_type VARCHAR(50),
        price DECIMAL(10,2),
        passenger_name VARCHAR(100),
        passenger_phone VARCHAR(30),
        passenger_email VARCHAR(100),
        flight_number VARCHAR(20),
        special_requests TEXT,
        london_tech_payload JSON,
        london_tech_response JSON,
        status VARCHAR(20) DEFAULT 'confirmed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[MCP] gia_bookings table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agent_name VARCHAR(100) NOT NULL,
        api_key VARCHAR(64) NOT NULL UNIQUE,
        account_id INT NOT NULL,
        channel_id INT NOT NULL,
        user_id INT,
        payment_type INT DEFAULT 1,
        booking_prefix VARCHAR(10) DEFAULT 'APL',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[MCP] api_agents table ready');

    // Seed GIA agent if not exists
    await pool.query(`
      INSERT IGNORE INTO api_agents (agent_name, api_key, account_id, channel_id, user_id, payment_type, booking_prefix)
      VALUES ('GIA', ?, ?, ?, ?, 1, 'APL')
    `, [
      process.env.MCP_API_KEY || 'default-gia-key',
      parseInt(process.env.GIA_ACCOUNT_ID) || 0,
      parseInt(process.env.GIA_CHANNEL_ID) || 0,
      parseInt(process.env.GIA_USER_ID) || 0
    ]);
    console.log('[MCP] api_agents seeded');

    // Add Stripe payment columns to gia_bookings if missing
    const [paymentCols] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'gia_bookings' AND COLUMN_NAME = 'payment_status'`);
    if (paymentCols.length === 0) {
      await pool.query(`ALTER TABLE gia_bookings ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid'`);
      await pool.query(`ALTER TABLE gia_bookings ADD COLUMN stripe_checkout_session_id VARCHAR(255)`);
      await pool.query(`ALTER TABLE gia_bookings ADD COLUMN stripe_payment_intent VARCHAR(255)`);
      await pool.query(`ALTER TABLE gia_bookings ADD COLUMN paid_at TIMESTAMP NULL`);
      console.log('[MCP] Added payment columns to gia_bookings');
    }

    // Add contact_email and website_url columns if missing
    const [agentCols] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'api_agents' AND COLUMN_NAME = 'contact_email'`);
    if (agentCols.length === 0) {
      await pool.query(`ALTER TABLE api_agents ADD COLUMN contact_email VARCHAR(200) AFTER booking_prefix`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN website_url VARCHAR(300) AFTER contact_email`);
      console.log('[MCP] Added contact_email + website_url columns to api_agents');
    }

    // Add source column to track how agent was created
    const [sourceCols] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'api_agents' AND COLUMN_NAME = 'source'`);
    if (sourceCols.length === 0) {
      await pool.query(`ALTER TABLE api_agents ADD COLUMN source VARCHAR(50) DEFAULT 'manual' AFTER website_url`);
      console.log('[MCP] Added source column to api_agents');
    }

    // Partner fields on api_agents
    const [partnerCols] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'api_agents' AND COLUMN_NAME = 'is_partner'`);
    if (partnerCols.length === 0) {
      await pool.query(`ALTER TABLE api_agents ADD COLUMN is_partner TINYINT(1) DEFAULT 0`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN partner_slug VARCHAR(50) UNIQUE`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN commission_percent DECIMAL(5,2) DEFAULT 0`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN partner_logo VARCHAR(300)`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN partner_display_name VARCHAR(200)`);
      await pool.query(`ALTER TABLE api_agents ADD COLUMN partner_color VARCHAR(20) DEFAULT '#d4a843'`);
      console.log('[MCP] Added partner columns to api_agents');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id VARCHAR(255) PRIMARY KEY,
        client_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[MCP] oauth_clients table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_auth_codes (
        code VARCHAR(128) PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL,
        code_challenge VARCHAR(128) NOT NULL,
        redirect_uri VARCHAR(500) NOT NULL,
        scopes VARCHAR(500),
        resource VARCHAR(500),
        created_at INT UNSIGNED NOT NULL,
        used TINYINT(1) DEFAULT 0
      )
    `);
    // Widen client_id for long OAuth client IDs (e.g. Google)
    await pool.query(`ALTER TABLE oauth_auth_codes MODIFY client_id VARCHAR(255) NOT NULL`).catch(() => {});
    console.log('[MCP] oauth_auth_codes table ready');

    // UK airports table — all UK airports and cruise ports for mileage-based pricing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uk_airports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type ENUM('airport','cruise_port') DEFAULT 'airport',
        postcode VARCHAR(10),
        parking_fee DECIMAL(8,2) DEFAULT 0,
        status ENUM('active','inactive') DEFAULT 'active'
      )
    `);
    console.log('[MCP] uk_airports table ready');

    // Seed uk_airports if empty
    const [ukCount] = await pool.query('SELECT COUNT(*) AS cnt FROM uk_airports');
    if (ukCount[0].cnt === 0) {
      const ukAirports = [
        // Airports
        ['Aberdeen Airport', 'airport', 'AB21', 15],
        ['Anglesey Airport', 'airport', 'LL63', 5],
        ['Belfast City Airport', 'airport', 'BT3', 10],
        ['Belfast International Airport', 'airport', 'BT29', 10],
        ['Benbecula Airport', 'airport', 'HS7', 5],
        ['Birmingham Airport', 'airport', 'B26', 10],
        ['Blackpool Airport', 'airport', 'FY4', 5],
        ['Bournemouth Airport', 'airport', 'BH23', 10],
        ['Bristol Airport', 'airport', 'BS48', 10],
        ['Cambridge Airport', 'airport', 'CB5', 5],
        ['Cardiff Airport', 'airport', 'CF62', 10],
        ['Carlisle Lake District Airport', 'airport', 'CA6', 5],
        ['City of Derry Airport', 'airport', 'BT47', 5],
        ['Cornwall Airport Newquay', 'airport', 'TR8', 5],
        ['Coventry Airport', 'airport', 'CV3', 5],
        ['Dundee Airport', 'airport', 'DD2', 5],
        ['Durham Tees Valley Airport', 'airport', 'DL2', 5],
        ['East Midlands Airport', 'airport', 'DE74', 10],
        ['Exeter Airport', 'airport', 'EX5', 10],
        ['Glasgow Airport', 'airport', 'PA3', 15],
        ['Glasgow Prestwick Airport', 'airport', 'KA9', 10],
        ['Gloucestershire Airport', 'airport', 'GL51', 5],
        ['Guernsey Airport', 'airport', 'GY1', 5],
        ['Humberside Airport', 'airport', 'DN39', 5],
        ['Inverness Airport', 'airport', 'IV2', 10],
        ['Isle of Man Airport', 'airport', 'IM9', 5],
        ['Islay Airport', 'airport', 'PA42', 5],
        ['Jersey Airport', 'airport', 'JE1', 5],
        ['Kirkwall Airport', 'airport', 'KW15', 5],
        ['Leeds Bradford Airport', 'airport', 'LS19', 10],
        ['Lerwick/Tingwall Airport', 'airport', 'ZE1', 5],
        ['Liverpool John Lennon Airport', 'airport', 'L24', 10],
        ['Manchester Airport', 'airport', 'M90', 15],
        ['Newcastle Airport', 'airport', 'NE13', 10],
        ['Norwich Airport', 'airport', 'NR6', 5],
        ['Nottingham East Midlands Airport', 'airport', 'DE74', 10],
        ['Robin Hood Doncaster Sheffield Airport', 'airport', 'DN9', 5],
        ['Scatsta Airport', 'airport', 'ZE2', 5],
        ['Southampton Airport', 'airport', 'SO18', 10],
        ['Southend Airport', 'airport', 'SS2', 10],
        ['Stornoway Airport', 'airport', 'HS2', 5],
        ['Sumburgh Airport', 'airport', 'ZE3', 5],
        ['Tiree Airport', 'airport', 'PA77', 5],
        ['Wick John O\'Groats Airport', 'airport', 'KW1', 5],
        // Cruise Ports
        ['Tilbury Cruise Terminal', 'cruise_port', 'RM18', 10],
        ['Harwich International Port', 'cruise_port', 'CO12', 10],
        ['Liverpool Cruise Terminal', 'cruise_port', 'L3', 10],
        ['Rosyth Cruise Port', 'cruise_port', 'KY11', 10],
      ];
      const insertSQL = 'INSERT INTO uk_airports (name, type, postcode, parking_fee) VALUES ?';
      await pool.query(insertSQL, [ukAirports]);
      console.log(`[MCP] Seeded ${ukAirports.length} UK airports/cruise ports`);
    }

    // Insert UK virtual hub into airports table if not exists
    await pool.query(`
      INSERT IGNORE INTO airports (code, name, type)
      VALUES ('UK', 'UK Airports & Ports', 'virtual')
    `);
    console.log('[MCP] UK virtual hub ready');

  } catch (err) {
    console.error('[MCP] Migration error:', err.message);
  }
}

// ── OAuth Provider Setup ─────────────────────────────────────────────
const clientsStore = new ClientsStore(pool);
const oauthProvider = new AplOAuthProvider(pool, clientsStore, {
  jwtSecret: process.env.JWT_SECRET,
  resourceUrl: RESOURCE_URL
});

// ── Express App ──────────────────────────────────────────────────────
const app = express();

// Trust IIS reverse proxy (fixes X-Forwarded-For for rate limiter)
app.set('trust proxy', 1);

// Share oauthProvider with routes (for Bearer token verification in A2A)
app.set('oauthProvider', oauthProvider);

// Security headers
app.use(helmet());

// CORS — allow AI platforms and APL sites to call our API
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (
    origin.endsWith('.airport-pickups-london.com') ||
    origin === 'https://airport-pickups-london.com' ||
    origin.endsWith('.google.com') ||
    origin.endsWith('.cloud.google.com') ||
    origin === 'https://vertexaisearch.cloud.google.com' ||
    origin === 'https://chatgpt.com' ||
    origin === 'https://platform.openai.com' ||
    origin.endsWith('.openai.com')
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting — max 60 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    // Strip port from IP if present (e.g. "172.68.229.169:26488" → "172.68.229.169")
    const ip = req.ip || '127.0.0.1';
    return ip.replace(/:\d+$/, '');
  },
  validate: false,
  message: {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Rate limit exceeded. Try again shortly.' },
    id: null
  }
});
app.use(limiter);

app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => {
    if (req.originalUrl === '/stripe-webhook') {
      req.rawBody = buf;
    }
  }
}));

// ── Request logger (debug OAuth/A2A flow) ────────────────────────────
app.use((req, res, next) => {
  if (req.path !== '/.well-known/agent.json' && !req.path.startsWith('/public')) {
    console.log(`[REQ] ${req.method} ${req.path} | IP: ${req.ip}`);
  }
  next();
});

// ── Favicon (for Google favicon service) ─────────────────────────────
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apl-logo.png'));
});

// ── Static files (logo etc.) ─────────────────────────────────────────
app.use('/public', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public')));

// ── API Documentation (public, no auth) ──────────────────────────────
app.use('/docs', docsRouter);

// ── Privacy Policy (public, no auth) ─────────────────────────────────
app.use('/privacy', privacyRouter);

// ── REST API Router (agent-authenticated) ────────────────────────────
app.use('/api', apiRouter);

// ── System API Router (London Tech pricing feed) ─────────────────────
app.use('/system-api', systemApiRouter);

// ── Stripe Webhook (public, signature-verified) ─────────────────────
app.use('/stripe-webhook', stripeWebhookRouter);

// ── A2A Agent Card (public, no auth) ─────────────────────────────────
app.get('/.well-known/agent.json', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(agentCard);
});
app.get('/.well-known/agent-card.json', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(agentCard);
});

// ── A2A JSON-RPC Router (agent-authenticated) ────────────────────────
app.use('/a2a', a2aRouter);

// ── PKCE bypass for OAuth clients that don't support it (e.g. Gemini Enterprise) ──
// The MCP SDK enforces OAuth 2.1 (PKCE required), but some clients use plain OAuth 2.0.
// Inject a known code_challenge/code_verifier pair when the client omits PKCE params.
const PKCE_BYPASS_VERIFIER = 'gemini-enterprise-no-pkce';
const PKCE_BYPASS_CHALLENGE = require('crypto')
  .createHash('sha256').update(PKCE_BYPASS_VERIFIER).digest('base64url');

app.use('/authorize', async (req, res, next) => {
  const params = req.method === 'POST' ? req.body : req.query;
  if (!params.code_challenge) {
    params.code_challenge = PKCE_BYPASS_CHALLENGE;
    params.code_challenge_method = 'S256';
    console.log(`[OAuth] PKCE bypass: injected code_challenge for client ${params.client_id}`);
  }

  // ── Dynamic redirect_uri registration for trusted platforms ──
  // ChatGPT/OpenAI uses dynamic callback URLs (e.g. /connector/oauth/{id}).
  // Auto-add the redirect_uri to the client's registered URIs if from a trusted domain.
  const redirectUri = params.redirect_uri;
  const clientId = params.client_id;
  if (redirectUri && clientId) {
    try {
      const trustedDomains = ['chatgpt.com', 'platform.openai.com', 'claude.ai', 'anthropic.com'];
      const redirectHost = new URL(redirectUri).hostname;
      const isTrusted = trustedDomains.some(d => redirectHost === d || redirectHost.endsWith('.' + d));
      if (isTrusted) {
        const client = await clientsStore.getClient(clientId);
        if (client && !client.redirect_uris.includes(redirectUri)) {
          client.redirect_uris.push(redirectUri);
          await pool.query('UPDATE oauth_clients SET client_data = ? WHERE client_id = ?',
            [JSON.stringify(client), clientId]);
          console.log(`[OAuth] Auto-registered redirect_uri for ${clientId}: ${redirectUri}`);
        }
      }
    } catch (err) {
      console.error('[OAuth] redirect_uri auto-register error:', err.message);
    }
  }

  next();
});

app.use('/token', express.urlencoded({ extended: false }), async (req, res, next) => {
  if (!req.body) return next();

  // ── Client Credentials grant (server-to-server, e.g. Vertex AI ADK) ──
  // The MCP SDK doesn't support this grant type, so handle it here directly.
  if (req.body.grant_type === 'client_credentials') {
    const { client_id, client_secret } = req.body;
    if (!client_id) return res.status(400).json({ error: 'invalid_request', error_description: 'client_id is required' });

    try {
      const client = await clientsStore.getClient(client_id);
      if (!client || client.client_secret !== client_secret) {
        return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
      }

      // Issue tokens directly via the OAuth provider
      const tokens = await oauthProvider._issueTokens(client_id, [], RESOURCE_URL);
      console.log(`[OAuth] Client credentials grant: issued token for ${client_id}`);
      return res.json(tokens);
    } catch (err) {
      console.error('[OAuth] Client credentials error:', err.message);
      return res.status(500).json({ error: 'server_error', error_description: 'Token generation failed' });
    }
  }

  // ── PKCE bypass for authorization_code grant ──
  if (req.body.grant_type === 'authorization_code' && !req.body.code_verifier) {
    req.body.code_verifier = PKCE_BYPASS_VERIFIER;
    console.log('[OAuth] PKCE bypass: injected code_verifier for token exchange');
  }

  // Debug: log token request details
  console.log(`[OAuth] Token request: grant_type=${req.body.grant_type} client_id=${req.body.client_id} has_code=${!!req.body.code} has_verifier=${!!req.body.code_verifier} has_secret=${!!req.body.client_secret} redirect_uri=${req.body.redirect_uri}`);

  // Capture SDK response for debugging
  const origJson = res.json.bind(res);
  res.json = (data) => {
    if (data.error) {
      console.error(`[OAuth] Token error response:`, JSON.stringify(data));
    } else if (data.access_token) {
      console.log(`[OAuth] Token issued successfully for ${req.body.client_id}`);
    }
    return origJson(data);
  };

  next();
});

// ── Override OAuth metadata to advertise client_credentials grant ─────
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: `${BASE_URL}/`,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    registration_endpoint: `${BASE_URL}/register`
  });
});

// ── Fix IP:port for SDK rate limiters (Cloudflare adds port to req.ip) ─
app.use(['/token', '/register', '/authorize'], (req, res, next) => {
  if (req.ip && req.ip.includes(':') && !req.ip.startsWith('[')) {
    // Strip port from IPv4:port (e.g. "141.101.98.27:25688" → "141.101.98.27")
    const stripped = req.ip.replace(/:\d+$/, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(stripped)) {
      Object.defineProperty(req, 'ip', { value: stripped, writable: true });
    }
  }
  next();
});

// ── OAuth Auth Router (must be mounted before /mcp routes) ───────────
// Provides: /.well-known/oauth-authorization-server (overridden above),
//           /.well-known/oauth-protected-resource/mcp,
//           /authorize, /token, /register
app.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl: new URL(BASE_URL),
  resourceServerUrl: new URL(RESOURCE_URL),
  resourceName: 'London Airport Transfers',
  // Disable SDK's built-in rate limiter on /authorize (we have our own global limiter)
  authorizationOptions: { rateLimit: false }
}));

// ── OAuth redirect fallback ──────────────────────────────────────────
// IIS ARR / Cloudflare sometimes rewrites external Location headers to local paths.
// If the browser lands here instead of the real redirect_uri, look up the auth code
// and forward to the correct external URL.
app.get('/oauth-redirect', async (req, res) => {
  console.log(`[OAuth] Fallback hit: ${req.originalUrl}`);
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing authorization code. URL: ' + req.originalUrl);

  try {
    const [rows] = await pool.query(
      'SELECT redirect_uri FROM oauth_auth_codes WHERE code = ?', [code]
    );
    if (rows.length && rows[0].redirect_uri) {
      const target = new URL(rows[0].redirect_uri);
      target.searchParams.set('code', code);
      if (state) target.searchParams.set('state', state);
      const url = target.toString();
      console.log(`[OAuth] Fallback redirect → ${url}`);
      // Use HTML redirect to bypass IIS ARR rewriting Location headers
      const safeUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return res.setHeader('Content-Type', 'text/html').status(200).send(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${safeUrl}"></head><body>Redirecting to authorization server...</body></html>`
      );
    }
  } catch (err) {
    console.error('[OAuth] Fallback redirect error:', err.message);
  }
  res.status(400).send('Invalid authorization code');
});

// ── Resource metadata URL for WWW-Authenticate headers ───────────────
const resourceMetadataUrl = `${BASE_URL}/.well-known/oauth-protected-resource/mcp`;

// Bearer auth middleware (JWT verification via OAuth provider)
const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl
});

/**
 * Dual-auth middleware: accepts API key OR OAuth Bearer token.
 * Tries each method in order — only rejects if ALL fail.
 */
async function dualAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  // 1. Master API key
  if (apiKey && MCP_API_KEY && apiKey === MCP_API_KEY) {
    return next();
  }

  // 2. Agent API key (api_agents table)
  if (apiKey) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM api_agents WHERE api_key = ? AND is_active = 1',
        [apiKey]
      );
      if (rows.length > 0) {
        req.agentConfig = {
          agentName: rows[0].agent_name,
          accountId: rows[0].account_id,
          channelId: rows[0].channel_id,
          paymentType: rows[0].payment_type,
          bookingPrefix: rows[0].booking_prefix
        };
        return next();
      }
    } catch (err) {
      console.error('[MCP] Agent key lookup error:', err.message);
    }
  }

  // 3. No API key configured — allow all (dev mode)
  if (!MCP_API_KEY) {
    console.warn('[MCP] WARNING: No MCP_API_KEY set — running without authentication');
    return next();
  }

  // 4. OAuth Bearer token (delegates to SDK middleware)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return bearerAuth(req, res, next);
  }

  // 5. Nothing valid
  console.warn(`[MCP] Auth failed from ${req.ip} — no valid API key or Bearer token`);
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Unauthorized — provide x-api-key or Bearer token' },
    id: null
  });
}

// Request logging
app.use('/mcp', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const toolName = req.body?.params?.name || req.body?.method || '-';
    console.log(`[MCP] ${req.method} /mcp | ${res.statusCode} | ${duration}ms | tool=${toolName} | ip=${req.ip}`);
  });
  next();
});

// POST /mcp — handle MCP requests (stateless: fresh server+transport per request)
app.post('/mcp', dualAuth, async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

// GET /mcp — 405 (stateless, no SSE)
app.get('/mcp', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null
  });
});

// DELETE /mcp — 405 (stateless, no sessions)
app.delete('/mcp', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null
  });
});

// Root page (helps Google discover favicon)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" href="/public/apl-logo.png"><title>Airport Pickups London API</title></head><body style="background:#0a0a0a;color:#fafafa;font-family:sans-serif;text-align:center;padding:80px"><h1>Airport Pickups London API</h1><p><a href="/docs" style="color:#d4a843">API Documentation</a></p></body></html>`);
});

// Health check (no auth required)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Run migrations then start server
runMigrations().then(() => {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`APL MCP Server running on 127.0.0.1:${PORT}`);
    if (!MCP_API_KEY) console.warn('WARNING: MCP_API_KEY not set — authentication disabled!');
    if (!process.env.SYSTEM_API_KEY) console.warn('WARNING: SYSTEM_API_KEY not set — System API will reject all requests!');
    if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET not set — OAuth will fail!');
    if (!process.env.GIA_AUTH_TOKEN) console.warn('WARNING: GIA_AUTH_TOKEN not set — create_booking will fail!');
  });
});
