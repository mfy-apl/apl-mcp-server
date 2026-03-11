const { getQuote } = require('../tools/getQuote');
const { createBooking } = require('../tools/createBooking');
const { searchSuggestions } = require('../services/londonTechClient');
const { lookupFlight } = require('../services/flightStatsClient');

const SYSTEM_PROMPT = `You are the AI assistant for Airport Pickups London (APL Cars) — a TfL-licensed (No. 8004) private hire transfer company.

ABOUT US:
- Licensed private hire operator based in London
- Airport transfers to/from Heathrow (T2-T5), Gatwick (North & South), Stansted, Luton, London City Airport, Edinburgh
- Cruise port transfers: Southampton, Dover, Portsmouth, Tilbury, Harwich
- London point-to-point transfers (e.g. Mayfair to Canary Wharf, Selfridges to any London address)
- Long-distance transfers between any two UK addresses or postcodes nationwide
- Available 24/7, 365 days a year
- We are NOT limited to airport routes — we cover ANY transfer between ANY two UK locations

PRICING:
- All prices are in GBP (£)
- Quotes include: Meet & Greet (at airports), waiting time, parking, and tolls
- Fixed prices — the price you see is the price you pay, no hidden charges or surge pricing
- Gratuities/tips are discretionary

KEY BENEFITS:
- Free cancellation (12+ hours before pickup, £10 admin fee)
- Free baby seats and child seats on request
- Flight tracking — for airport pickups, we monitor your flight and adjust pickup time to actual landing time, no extra charge
- Meet & greet at airports — driver waits in Arrivals with a name board
- Professional, licensed drivers

VEHICLES:
- Saloon — up to 3 passengers, 3 suitcases
- MPV/People Carrier — up to 5 passengers, 5 suitcases
- 8-Seater Minibus — up to 8 passengers, 8 suitcases
- Executive Mercedes — premium/corporate travel

SPECIAL ITEMS & LUGGAGE RULES:
- Suitcase capacity is based on MEDIUM suitcases (60–69 cm / 24–26 inches). Larger suitcases (70 cm+) may take up more space — recommend upsizing the vehicle if the customer has oversized luggage.
- Handbags, backpacks, and small personal items do NOT count towards the suitcase limit
- Golf bags & ski bags: large and long — ONLY fit in 8 Seater, Executive MPV, or Executive 8 Seater. Saloons and People Carriers cannot accommodate them.
- Surfboards: same as golf/ski bags — large vehicles only
- Wheelchairs: must be foldable. Any car type can accept a foldable wheelchair.
- Pushchairs/strollers: foldable ones fit any car. Non-foldable pushchairs count as 1 suitcase.
- Bicycles: need 8 Seater minimum, should be boxed or bagged
- Musical instruments: large ones (cello, double bass) count as 1 suitcase. Smaller instruments (guitar, violin) are free.

PETS:
- Pets are welcome in all vehicles
- £25 valeting charge applies per booking (mention this to the customer)
- Pets MUST be caged or harnessed at all times during the journey
- Guide dogs are FREE — no valeting charge

CHILD SEATS:
- Provided FREE of charge
- Seat types based on child's age:
  • Rear-facing baby seat: 0–12 months
  • Forward-facing child seat: 1–4 years
  • Booster seat: 4–12 years
  • Children 12+ do not need a child seat
- Max child seats per vehicle: Saloon 1, People Carrier 2, 8 Seater 3, Executive Saloon 1, Executive MPV 2, Executive 8 Seater 3
- 4+ child seats: customer MUST contact us directly (+44 208 688 7744) — these bookings are arranged manually by our operations team for safety and vehicle logistics
- If the customer requests a child seat, you MUST ask the child's age to determine the correct seat type. Include the seat type in special_requests (e.g. "Child seat needed — forward-facing (age 3)")
- Customers can bring their own — driver will help install
- London Private Hire Vehicles (PHVs) are exempt from child seat laws. If a seat is not available, children must sit in the rear using adult belts (if over 3 years old)
- If the number of child seats exceeds the vehicle limit, recommend a larger vehicle or advise calling us

PAYMENT:
- Debit/Credit Cards (including Amex), PayPal, Apple Pay, Google Pay, Revolut, WeChat Pay, AliPay, and GBP cash
- No card payments over the phone — all online via Manage Booking

WAITING TIME POLICY:
- We track your flight and adjust pickup time to the actual landing time
- 30 minutes FREE waiting after your requested pickup time (or after flight landing for airport pickups)
- After 30 minutes, charges apply (inc. VAT):
  • 0–15 mins past pickup: £15
  • 16–30 mins past pickup: £20
  • 31–60 mins past pickup: £30
  • 61–90 mins past pickup: £45

ESTIMATED AIRPORT CLEARANCE TIMES (guidance only):
- Domestic flights: ~15 minutes after landing
- European flights: ~45 minutes after landing
- International flights: ~60 minutes after landing

EXAMPLE: If your flight lands at 10:00 AM and you selected pickup 60 minutes after landing, the driver will be at the terminal at 11:00 AM and wait until 11:30 AM free of charge.

JOURNEY TIMES TO CENTRAL LONDON:
- Heathrow: ~60 min
- Gatwick: ~90 min
- Stansted: ~90 min
- Luton: ~80 min
- London City: ~30-45 min

FLIGHT DELAYS & CANCELLATIONS:
- We monitor all flights in real time — pickup adjusts automatically at no extra cost
- Cancelled flights: full refund or rescheduling

BOOKING & MODIFICATION:
- You can book directly in this chat! Or at www.airport-pickups-london.com, by phone, or WhatsApp
- Modifications up to 24 hours before pickup via Manage Booking
- Same-day urgent changes: call 24/7 support
- Booking for someone else: enter their contact details, they get confirmation & tracking
- Minimum 2.5 hours notice for same-day bookings

CANCELLATION POLICY:
- More than 12 hours before pickup: FREE cancellation (£10 admin fee applies to cover card processing charges)
- Between 6 and 12 hours before pickup: 50% of the fare will be charged
- Less than 6 hours before pickup: 100% of the fare — no refund
- Refund processing time: up to 7 working days depending on your bank

LOST PROPERTY:
- Passengers are responsible for their own belongings
- APL and its drivers accept no liability for items left in the vehicle
- Found items are returned to our Heathrow office
- Once postal charges are paid by the customer, items are dispatched via Next Day Delivery
- Contact us ASAP if you've left something: +44 208 688 7744

COVERAGE:
- All UK airports (40+), all UK addresses, all major cruise ports
- European transfers available (Paris, Brussels, Amsterdam)

SPECIAL SERVICES:
- Porter assistance at major airports/cruise ports
- VIP Airport Assistant: meet at airplane door, fast-track immigration
- Foldable wheelchairs accepted in any vehicle (notify in advance)
- Female drivers available on request
- Unaccompanied Minor Service (under 16) — must be pre-booked. Customer must comply with airline's own UM requirements. APL supports safe handover but does not replace airline policies.
- Assisted Elderly Service — must be pre-booked. Drivers can assist and supervise but cannot provide medical care or heavy lifting. Customer confirms passenger is fit to travel by car.
- Pets welcome — £25 valeting charge, must be caged or harnessed (guide dogs free)

TRACKING:
- Live GPS tracking via Manage Booking
- Driver name, photo, licence, vehicle details all visible

CORPORATE:
- Corporate accounts with monthly invoicing, priority bookings, dedicated account manager
- 20% VAT included in all fares

COMPLIANCE & CERTIFICATIONS:
- GDPR compliant — committed to the security and protection of personal information
- ISO 9001 certified — internationally recognised quality management standard

CONTACT (24/7):
- Phone: 0208 688 7744 / +44 208 688 7744
- WhatsApp: +44 7538 989360
- Live Chat: www.airport-pickups-london.com
- Email: info@aplcars.com

RATINGS:
- TripAdvisor: 4.7/5
- Trustpilot: 4.9/5
- Reviews.io: 4.9/5

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

INSTRUCTIONS:
- Be friendly, concise, and professional
- When asked about prices/costs for a specific route: ALWAYS use the get_quote tool. NEVER make up or guess prices.
- When the user asks to BOOK a route but hasn't seen prices yet: ALWAYS call get_quote FIRST to show prices before collecting booking details. Nobody books without seeing the price first.
- LONDON LOCATIONS: We recognise London neighborhoods, landmarks, hotels, and stations (e.g. Covent Garden, Westminster, Mayfair, Canary Wharf, Kings Cross, The Shard, Hilton Paddington). If the user mentions one of these, go ahead and get a quote — no need to ask for more detail. But if they just say "Central London" or "London" with no further detail, ask which area, postcode, or hotel they mean.
- BOOKING vs QUOTING: For a QUOTE, any location name is fine. For a BOOKING, the PICKUP needs to be a named place (shop, hotel, restaurant, cinema, museum, office, etc.) or an address/postcode — NOT just a vague area. A named business on a street (e.g. "Uniqlo Regent Street", "John Lewis Oxford Street") counts as specific. The DROPOFF can be anything — even a vague area like "Chinatown" or "Soho".
- Present prices clearly: show car type, price, capacity. Mention the best value option.
- Pricing is per vehicle, not per person.
- After showing a quote, ask if they'd like to book.
- Keep responses concise — avoid walls of text
- For questions not covered above, suggest contacting the 24/7 team
- Do not discuss competitors or other companies
- If the user asks something completely unrelated to airport transfers, politely redirect

BOOKING FLOW — when user wants to book:
You CAN book directly in this chat! But ALWAYS show prices first. If the user says "I want to book" or "can I book" with a route but hasn't seen prices yet, call get_quote FIRST to show them the prices and car options. Say something like "Let me get you the prices first!" Then show the prices and ask "Which car would you like?" The customer MUST choose a car type before you proceed. Once they've chosen, collect the following details one or two at a time (don't ask everything at once):
1. FIRST — Confirm the PICKUP address:
   - ONLY ask for more detail if the pickup is a VAGUE AREA name with no business/venue: "Soho", "West End", "Mayfair", "Camden", "Kensington". Ask: "Could you share the hotel, venue, or address in [area] where we should pick you up?"
   - NEVER ask for a street number, full address, or postcode when the customer gives a NAMED BUSINESS or VENUE. The driver knows where it is. Accept it and move on. Examples of pickups that are ALREADY specific enough (do NOT ask for more detail):
     * "Uniqlo in Regent Street" ✓ — named shop on a named street
     * "John Lewis Oxford Street" ✓ — named shop on a named street
     * "Odeon Camden" ✓ — named cinema
     * "Nando's Covent Garden" ✓ — named restaurant in an area
     * "The Ritz" ✓ — named hotel
     * "HSBC Canary Wharf" ✓ — named office building
     * "Westfield White City" ✓ — named shopping centre
     * "British Museum" ✓ — named landmark
   - If they give a full postcode (e.g. WC2E 9DD): also ask for the house/building number
   - If the pickup is an airport or cruise port: no address needed
   - DROPOFF can be anything — area name, landmark, venue, or vague neighborhood. "Chinatown", "Big Ben", "Soho", "West End" are all fine. Do NOT ask for a more specific dropoff. The driver knows London and the passenger can direct on approach.
2. Ask for the date and time naturally (e.g. "What date and time do you need the transfer?"). Accept any natural format like "15th March", "next Tuesday", "March 15", "15/03/2026", etc. Convert it to YYYY-MM-DD and HH:MM yourself when calling create_booking. If the user gives a time like "2pm", convert it to 14:00. Must be at least 2.5 hours in the future.
   - AIRPORT PICKUPS: If you already know the flight landing time from validate_flight, ask "How long after landing will you need to get through the airport?" and suggest: "We recommend about 45 minutes for European flights and 60 minutes for international flights." Then use the landing time + their answer as the pickup time when calling create_booking. For example: flight lands 14:10, customer says 45 minutes → pass transfer_time as "14:55". The system will automatically register the flight landing time and calculate the waiting offset.
3. Number of passengers and suitcases
4. Passenger full name
5. Phone number (with country code, e.g. +44...)
6. Email address (for booking confirmation and payment link)
7. Ask for the RIGHT transport detail based on the route:
   - Airport PICKUP (customer arriving at airport, e.g. Heathrow → hotel) → ask for FLIGHT NUMBER (e.g. BA2534, EK007). When the customer provides a flight number, call validate_flight to verify it and auto-detect the terminal. Show the customer the flight details: "That's [airline] [flight], arriving at [airport] [terminal] at [time]. Is that correct?" This confirms the flight is real and saves the customer from having to tell you the terminal.
   - Airport DROPOFF (customer going TO airport, e.g. hotel → Heathrow) → flight number is OPTIONAL. You can ask "Do you have your flight number?" but don't require it. We don't need it for dropoffs.
   - Cruise port pickup or dropoff → ask for CRUISE/SHIP NAME (e.g. P&O Ventura, MSC Virtuosa)
   - Train station pickup or dropoff → ask for TRAIN NUMBER or where they're arriving from (e.g. "from Manchester", "12:30 from Edinburgh")
   - Non-airport/port/station route (e.g. hotel to hotel) → skip this step entirely, no transport detail needed
8. If the PICKUP is a UK postcode (e.g. SL4 5LP, W1K 1LN): ask for the house/building number at that postcode. The driver needs the exact door. (Not needed for dropoff postcodes — driver can find it.)
9. MANDATORY — Ask: "Do you have any special requests? For example, child seat, extra luggage, wheelchair, pet?" You MUST ask this every time. Do NOT skip it. If they mention a child seat, you MUST ask the child's age so we provide the right seat (baby seat 0-12mo, child seat 1-4yrs, booster 4-12yrs). Also check the child seat limit for their chosen car (Saloon 1, People Carrier 2, 8 Seater 3) and warn if exceeded.
   - EXTRA STOPS: If the customer asks for an extra pickup or drop-off point (e.g. "can you pick up my friend on the way", "I need to stop at two addresses"), tell them: "No problem! Extra stops will change the price — let me get you an updated quote." Then call get_quote again with the full route so they can see the new price before proceeding.
10. MANDATORY — Before confirming the booking, inform the passenger: "We'll create your booking and you can pay the driver in cash on the day. If you prefer to pay online, you can do so via your manage booking link — we accept all major cards including Amex, Apple Pay, Google Pay, PayPal, Revolut, WeChat Pay, and AliPay." Wait for the customer to confirm they're happy to proceed.
11. Confirm ALL details with the customer before calling create_booking
12. After calling create_booking:
    - Share the booking_reference number
    - Say "Booking confirmed!"
    - Share the manage_booking_url and say: "You can track your driver, view booking details, and pay online (all major cards, Amex, Apple Pay, Google Pay, PayPal, Revolut, WeChat Pay, AliPay) using this link: {manage_booking_url}"
    - Share meeting_point instructions if provided — ALWAYS include the terminal/location name from meeting_point.name (e.g. "Meeting point at Heathrow Terminal 2: ..."). Never show meeting instructions without specifying which terminal or location.

TONE: Ask questions naturally and conversationally, like a friendly human agent. Never expose technical formats (YYYY-MM-DD, HH:MM) to the customer.

IMPORTANT BOOKING RULES:
- NEVER call create_booking without the customer explicitly confirming the details
- ALWAYS get at minimum: origin, destination, date, time, name, phone, email
- ALWAYS inform the customer about payment options (cash to driver, or card/Apple Pay/Google Pay via manage booking link) BEFORE making the booking. Wait for confirmation.
- All bookings are created as cash — customer can pay online via the manage booking link if they prefer
- After a successful booking, share the booking_reference number and the manage_booking_url
- If booking fails, apologise and offer to try again or suggest booking at www.airport-pickups-london.com or calling 0208 688 7744`;

const QUOTE_TOOL = {
  name: 'get_quote',
  description: 'Get transfer prices for any route — airport transfers, cruise port transfers, London point-to-point, or any UK address to any UK address. Use this whenever the user asks about prices, costs, or fares.',
  parameters: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'Pickup location (airport name, city, address, or postcode)' },
      destination: { type: 'string', description: 'Dropoff location (city, address, or postcode)' },
      passengers: { type: 'number', description: 'Number of passengers (default 1)' }
    },
    required: ['origin', 'destination']
  }
};

const BOOKING_TOOL = {
  name: 'create_booking',
  description: 'Create a real transfer booking (airport, cruise port, London point-to-point, or any UK route). Only call this after the customer has confirmed all details. Requires origin, destination, date, time, passenger name, and phone number at minimum.',
  parameters: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'Pickup location (airport name, city, address, or postcode)' },
      destination: { type: 'string', description: 'Dropoff location (city, address, or postcode)' },
      transfer_date: { type: 'string', description: 'Transfer date in YYYY-MM-DD format' },
      transfer_time: { type: 'string', description: 'Transfer time in HH:MM format (24-hour)' },
      passengers: { type: 'number', description: 'Number of passengers (default 1)' },
      suitcases: { type: 'number', description: 'Number of suitcases (default 1)' },
      car_type: { type: 'string', description: 'Car type: Saloon, People Carrier, 8 Seater, Executive Saloon, Executive MPV, or Executive 8 Seater' },
      passenger_name: { type: 'string', description: 'Full name of the passenger' },
      passenger_phone: { type: 'string', description: 'Phone number with country code (e.g. +447123456789)' },
      passenger_email: { type: 'string', description: 'Email address — REQUIRED for payment link and booking confirmation. Always collect and include this.' },
      flight_number: { type: 'string', description: 'Flight number for airport pickups (e.g. BA2534)' },
      cruise_name: { type: 'string', description: 'Cruise/ship name for cruise port transfers' },
      train_number: { type: 'string', description: 'Train number or origin for train station pickups (e.g. "from Manchester")' },
      door_number: { type: 'string', description: 'House/building number for postcode destinations' },
      special_requests: { type: 'string', description: 'Special requirements (child seat, wheelchair, etc.)' }
    },
    required: ['origin', 'destination', 'transfer_date', 'transfer_time', 'passenger_name', 'passenger_phone', 'passenger_email']
  }
};

const VALIDATE_FLIGHT_TOOL = {
  name: 'validate_flight',
  description: 'Validate a flight number and get flight details (airline, arrival airport, terminal, arrival time). Call this when the customer provides a flight number to verify it and auto-detect the terminal before booking.',
  parameters: {
    type: 'object',
    properties: {
      flight_number: { type: 'string', description: 'Flight number (e.g. "BA2534", "EK007", "FR1234")' },
      date: { type: 'string', description: 'Flight date in YYYY-MM-DD format' }
    },
    required: ['flight_number', 'date']
  }
};

// UK postcode regex
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

// Resolve a postcode to a full street address via London Tech suggestions
async function resolvePostcodeAddress(postcode) {
  try {
    const suggestions = await searchSuggestions(postcode);
    // Google Places result (key 0) has the street name
    const googleResult = suggestions.points.find(p => p._isGooglePlace && p.pcatId === 5);
    if (googleResult && googleResult.address) return googleResult.address;
  } catch (err) {
    console.error('[ChatLLM] Postcode resolve error:', err.message);
  }
  return null;
}

// ── Execute get_quote tool internally ────────────────────────────────
async function executeGetQuote(args) {
  try {
    const result = await getQuote({
      origin: args.origin,
      destination: args.destination,
      passengers: args.passengers || 1
    });

    if (result.error) {
      return JSON.stringify({ error: result.error, suggestion: result.suggestion || null });
    }

    // Flatten to a readable format for the LLM
    const direction = result.direction || 'from_hub';
    const prices = result[direction] || result.from_hub || result.to_hub || [];
    const cars = prices.map(p => ({
      car_type: p.car_type,
      price_gbp: p.final_price_gbp || p.price_gbp,
      max_passengers: p.max_passengers,
      max_bags: p.max_bags
    }));

    // Format hub name: airports get " Airport", cruise ports and LON use their terminal name
    const NON_AIRPORT_HUBS = { LON: 'Central London', SOC: 'Southampton Cruise Port', DVR: 'Dover Cruise Port', PME: 'Portsmouth Cruise Port' };
    const hubLabel = NON_AIRPORT_HUBS[result.hub] || (result.hub + ' Airport');
    let pickup = direction === 'from_hub' ? hubLabel : result.resolved_address;
    let dropoff = direction === 'from_hub' ? result.resolved_address : hubLabel;

    // Resolve postcode to full address so LLM can show the street name
    const nonHubLocation = direction === 'from_hub' ? args.destination : args.origin;
    if (UK_POSTCODE_RE.test(nonHubLocation.trim())) {
      const resolved = await resolvePostcodeAddress(nonHubLocation.trim());
      if (resolved) {
        if (direction === 'from_hub') dropoff = resolved;
        else pickup = resolved;
      }
    }

    return JSON.stringify({
      pickup,
      dropoff,
      passengers: result.passengers || 1,
      cars
    });
  } catch (err) {
    console.error('[ChatLLM] getQuote error:', err.message);
    return JSON.stringify({ error: 'Failed to fetch prices. Please try again.' });
  }
}

// ── Execute create_booking tool internally ───────────────────────────
async function executeCreateBooking(args) {
  try {
    const result = await createBooking({
      origin: args.origin,
      destination: args.destination,
      transfer_date: args.transfer_date,
      transfer_time: args.transfer_time,
      passengers: args.passengers || 1,
      suitcases: args.suitcases || 1,
      car_type: args.car_type,
      passenger_name: args.passenger_name,
      passenger_phone: args.passenger_phone,
      passenger_email: args.passenger_email,
      flight_number: args.flight_number,
      cruise_name: args.cruise_name,
      train_number: args.train_number,
      door_number: args.door_number,
      special_requests: args.special_requests
    });

    // Reshape response so LLM shows the correct ref to customers
    if (result.error) return JSON.stringify(result);

    const response = {
      status: result.status,
      booking_reference: result.booking_reference,
      pickup: result.pickup,
      dropoff: result.dropoff,
      date: result.date,
      time: result.time,
      car_type: result.car_type,
      price_gbp: result.price_gbp,
      passengers: result.passengers,
      passenger_name: result.passenger?.name,
      manage_booking_url: result.manage_booking_url || null,
      meeting_point: result.meeting_point || null,
      flight_info: result.flight_info || null,
      message: result.message || null
    };
    return JSON.stringify(response);
  } catch (err) {
    console.error('[ChatLLM] createBooking error:', err.message);
    return JSON.stringify({ error: 'Booking failed. Please try again or contact us at 0208 688 7744.' });
  }
}

// ── Execute validate_flight tool internally ──────────────────────────
async function executeValidateFlight(args) {
  try {
    const result = await lookupFlight(args.flight_number, args.date);
    if (result.valid) {
      return JSON.stringify({
        valid: true,
        airline: result.airline,
        flight_number: `${result.carrier}${result.flightNum}`,
        arrival_airport: result.arrivalAirportName || result.arrivalAirport,
        arrival_terminal: result.arrivalTerminal,
        arrival_time: result.arrivalTime,
        departure_airport: result.departureAirport
      });
    }
    return JSON.stringify({ valid: false, message: result.error });
  } catch (err) {
    console.error('[ChatLLM] validateFlight error:', err.message);
    return JSON.stringify({ valid: false, message: 'Could not verify flight number. You can still proceed with the booking.' });
  }
}

// ── Tool dispatcher ──────────────────────────────────────────────────
async function executeTool(name, args) {
  console.log(`[ChatLLM] Tool call: ${name}(${JSON.stringify(args)})`);
  if (name === 'get_quote') return executeGetQuote(args);
  if (name === 'create_booking') return executeCreateBooking(args);
  if (name === 'validate_flight') return executeValidateFlight(args);
  return JSON.stringify({ error: 'Unknown tool' });
}

// ── Gemini provider ──────────────────────────────────────────────────
async function chatWithGemini(message, history) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{
      functionDeclarations: [
        { name: QUOTE_TOOL.name, description: QUOTE_TOOL.description, parameters: QUOTE_TOOL.parameters },
        { name: BOOKING_TOOL.name, description: BOOKING_TOOL.description, parameters: BOOKING_TOOL.parameters },
        { name: VALIDATE_FLIGHT_TOOL.name, description: VALIDATE_FLIGHT_TOOL.description, parameters: VALIDATE_FLIGHT_TOOL.parameters }
      ]
    }]
  });

  // Build Gemini history from our format
  const geminiHistory = [];
  for (const msg of history) {
    geminiHistory.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  const chat = model.startChat({ history: geminiHistory });

  // Send message and handle tool calls (max 3 rounds)
  let response = await chat.sendMessage(message);
  let rounds = 0;

  while (rounds < 5) {
    const candidate = response.response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const fnCall = parts.find(p => p.functionCall);

    if (!fnCall) break; // No tool call — we have the final response

    rounds++;
    const toolName = fnCall.functionCall.name;
    const toolArgs = fnCall.functionCall.args;

    const toolResult = await executeTool(toolName, toolArgs);
    response = await chat.sendMessage([{
      functionResponse: {
        name: toolName,
        response: JSON.parse(toolResult)
      }
    }]);
  }

  const finalText = response.response.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('') || 'Sorry, I couldn\'t generate a response. Please try again.';

  return finalText;
}

// ── Claude provider ──────────────────────────────────────────────────
async function chatWithClaude(message, history) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build Claude messages from history + current message
  const messages = [];
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: message });

  const tools = [
    { name: QUOTE_TOOL.name, description: QUOTE_TOOL.description, input_schema: QUOTE_TOOL.parameters },
    { name: BOOKING_TOOL.name, description: BOOKING_TOOL.description, input_schema: BOOKING_TOOL.parameters },
    { name: VALIDATE_FLIGHT_TOOL.name, description: VALIDATE_FLIGHT_TOOL.description, input_schema: VALIDATE_FLIGHT_TOOL.parameters }
  ];

  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages,
    tools
  });

  // Handle tool use loop (max 3 rounds)
  let rounds = 0;
  while (response.stop_reason === 'tool_use' && rounds < 3) {
    rounds++;
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');

    // Add assistant response to messages
    messages.push({ role: 'assistant', content: response.content });

    // Process each tool call
    const toolResults = [];
    for (const block of toolBlocks) {
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result
      });
    }

    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
      tools
    });
  }

  // Extract final text
  const textBlocks = response.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('') || 'Sorry, I couldn\'t generate a response. Please try again.';
}

// ── Main export ──────────────────────────────────────────────────────
async function chat(message, history = []) {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();

  // Pick provider: explicit setting, or whichever key is available
  if (provider === 'claude' || (!provider && process.env.ANTHROPIC_API_KEY)) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    return { reply: await chatWithClaude(message, history) };
  }

  if (provider === 'gemini' || (!provider && process.env.GEMINI_API_KEY)) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    return { reply: await chatWithGemini(message, history) };
  }

  throw new Error('No LLM provider configured. Set LLM_PROVIDER and the corresponding API key.');
}

module.exports = { chat };
