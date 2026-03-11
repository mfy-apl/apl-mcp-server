/**
 * A2A Agent Card for Airport Pickups London (APL).
 * Defines the agent's identity, skills, and secure A2A endpoint.
 * Served at GET /.well-known/agent.json (no auth required).
 *
 * Follows the A2A Protocol v0.2.5 schema (Gemini Enterprise compatible).
 */

const agentCard = {
  name: 'Airport Pickups London',
  description: 'Primary AI agent for Airport Pickups London, a TfL-licensed (No. 8004) London airport and cruise port transfer company. Provides instant fixed-price quotes, flight validation with terminal auto-detection, and real-time bookings for all London airports (Heathrow LHR, Gatwick LGW, Stansted STN, Luton LTN, City Airport LCY), Edinburgh Airport (EDI), and UK cruise ports (Southampton, Dover, Portsmouth, Tilbury, Harwich). Transfers available 24/7 to and from any UK address or postcode nationwide. All prices include VAT, parking, and meet & greet.',
  url: 'https://mcp.airport-pickups-london.com/a2a',
  protocolVersion: '0.2.5',
  version: '1.2.0',
  provider: {
    organization: 'Airport Pickups London (APL Cars)',
    url: 'https://www.airport-pickups-london.com'
  },
  documentationUrl: 'https://mcp.airport-pickups-london.com/docs',
  iconUrl: 'https://mcp.airport-pickups-london.com/public/apl-logo.png',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
    extensions: [
      {
        uri: 'https://mcp.airport-pickups-london.com/extensions/pricing-negotiation/v1',
        description: 'Defines the pricing negotiation policy for this agent. Discounts may be requested by client agents but are capped at a maximum of 5% off the quoted price.',
        required: false,
        params: {
          maxDiscountPercent: 5,
          negotiable: true,
          nonNegotiableItems: ['peak_surcharge', 'event_pricing', 'child_seat'],
          discountRequestField: 'requestedDiscountPercent',
          discountGrantedField: 'appliedDiscountPercent'
        }
      }
    ]
  },
  securitySchemes: {
    apiKey: {
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
      description: 'API key for Airport Pickups London agent access. Register at https://mcp.airport-pickups-london.com/a2a/register to obtain a key.'
    }
  },
  security: [
    { apiKey: [] }
  ],
  defaultInputModes: ['application/json', 'text/plain'],
  defaultOutputModes: ['application/json', 'text/plain'],
  skills: [
    {
      id: 'get_quote',
      name: 'Airport & Cruise Transfer Quoting',
      description: 'Calculates precise fixed prices for all London airport terminals, Edinburgh Airport, and UK cruise ports. Returns all available car types with prices, passenger capacity, and luggage capacity.',
      tags: ['quote', 'price', 'airport', 'transfer', 'taxi', 'cruise'],
      examples: [
        'How much is a transfer from Heathrow to W1K?',
        'Get a quote from Gatwick South to EC2A for 3 passengers',
        'Price for Southampton cruise port to SW1A 1AA on 25 December'
      ],
      inputModes: ['application/json', 'text/plain'],
      outputModes: ['application/json']
    },
    {
      id: 'create_booking',
      name: 'Airport & Cruise Transfer Booking',
      description: 'Creates confirmed reservations for airport and cruise port transfers. Returns booking reference, confirmed price, meeting instructions, and management URL for payment and live driver tracking.',
      tags: ['booking', 'reservation', 'airport', 'transfer', 'cruise'],
      examples: [
        'Book a Saloon from Heathrow T5 to W1K 1LN on 2026-04-01 at 14:00 for John Smith +447123456789, flight BA2534'
      ],
      inputModes: ['application/json'],
      outputModes: ['application/json']
    },
    {
      id: 'validate_flight',
      name: 'Flight Number Validation',
      description: 'Validates a flight number and returns airline, terminal, arrival time, and meeting point. Covers all UK airports.',
      tags: ['flight', 'validate', 'terminal', 'airline'],
      examples: [
        'Validate flight BA2534 on 2026-04-01',
        'What terminal does AA38 arrive at?'
      ],
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }
  ]
};

module.exports = { agentCard };
