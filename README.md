# Airport Pickups London — MCP Server & A2A Agent

A production MCP server and A2A agent for London airport transfer bookings. Implements the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) for AI tool use and the [Agent-to-Agent](https://google.github.io/A2A/) (A2A) protocol for inter-agent communication.

Live at **[mcp.airport-pickups-london.com](https://mcp.airport-pickups-london.com)**

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Express Server                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ MCP SDK  │  │   A2A    │  │    REST API       │  │
│  │ /mcp     │  │ /a2a     │  │ /api/quote        │  │
│  │          │  │          │  │ /api/book          │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │             │
│       └──────────────┼─────────────────┘             │
│                      │                               │
│              ┌───────┴───────┐                       │
│              │  Tools Layer  │                       │
│              │  - getQuote   │                       │
│              │  - createBook │                       │
│              └───────┬───────┘                       │
│                      │                               │
│     ┌────────────────┼────────────────┐              │
│     │                │                │              │
│  ┌──┴───┐    ┌───────┴──────┐  ┌─────┴────┐        │
│  │ MySQL│    │ London Tech  │  │ Google   │        │
│  │  DB  │    │ Dispatch API │  │ Maps API │        │
│  └──────┘    └──────────────┘  └──────────┘        │
└─────────────────────────────────────────────────────┘
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `london_airport_transfer_quote` | Get fixed prices for airport/cruise transfers to any UK address |
| `book_london_airport_transfer` | Create a real booking with passenger details, flight info |
| `validate_flight` | Validate flight numbers and auto-detect terminals |

### MCP Configuration

Add to your MCP client (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "airport-pickups-london": {
      "type": "streamable-http",
      "url": "https://mcp.airport-pickups-london.com/mcp"
    }
  }
}
```

## A2A Protocol

Agent card served at `/.well-known/agent.json` — discoverable by any A2A-compatible agent (Google Gemini Enterprise, Azure AI, etc.).

### Skills

- **get_quote** — Fixed-price quotes for all London airports (LHR, LGW, STN, LTN, LCY), Edinburgh (EDI), and UK cruise ports
- **create_booking** — End-to-end booking with flight validation, meet & greet, child seats
- **validate_flight** — Real-time flight status with terminal auto-detection via FlightStats

### Self-Registration

External AI agents can register for API access:

```bash
curl -X POST https://mcp.airport-pickups-london.com/a2a/register \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "email": "agent@example.com"}'
```

Returns an API key for authenticated access to all endpoints.

## REST API

For direct integration without MCP or A2A:

```bash
# Get a quote
curl -X POST https://mcp.airport-pickups-london.com/api/quote \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from": "Heathrow Terminal 5", "to": "W1K 1BE"}'

# Create a booking
curl -X POST https://mcp.airport-pickups-london.com/api/book \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Heathrow Terminal 5",
    "to": "W1K 1BE",
    "date": "2026-04-15",
    "time": "14:00",
    "passengers": 2,
    "carType": "Standard Saloon",
    "passengerName": "John Smith",
    "passengerPhone": "+447700900000",
    "passengerEmail": "john@example.com",
    "flightNumber": "BA123"
  }'
```

## ChatGPT Action

OpenAPI spec at `/public/openapi.json` — can be imported as a ChatGPT custom action.

## Setup (Self-Hosting)

```bash
git clone https://github.com/mfy-apl/apl-mcp-server.git
cd apl-mcp-server
npm install
cp .env.example .env
# Fill in your credentials in .env
node server.js
```

Requires:
- Node.js 18+
- MySQL database with pricing tables
- London Tech dispatch API account (for bookings)
- Google Maps API key (for distance calculations)

## Tech Stack

- **Runtime**: Node.js + Express
- **MCP**: `@modelcontextprotocol/sdk` with Streamable HTTP transport
- **A2A**: Custom JSON-RPC implementation (v0.2.5)
- **Auth**: OAuth 2.1 (PKCE), API key, Bearer token
- **Database**: MySQL (mysql2)
- **Payments**: Stripe (optional, for partner bookings)
- **LLM**: Gemini or Claude (optional, for natural language chat)
- **Flight Data**: FlightStats API

## Coverage

- **Airports**: Heathrow (all terminals), Gatwick (N/S), Stansted, Luton, London City, Edinburgh
- **Cruise Ports**: Southampton, Dover, Portsmouth, Tilbury, Harwich
- **Destinations**: Any UK address or postcode
- **Car Types**: Saloon, Estate, MPV, 8-Seater, Executive, VIP

## License

MIT
