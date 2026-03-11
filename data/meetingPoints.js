/**
 * Airport, cruise port, and train station meeting points.
 * Used to tell customers where to meet their driver after booking.
 */
const MEETING_POINTS = [
  {
    id: 1,
    name: 'Heathrow T2',
    keywords: ['heathrow', 'terminal 2', 'lhr t2'],
    message: 'Our driver will hold your name on a board inside the terminal. Meeting point for international flights will be in front of the Arrival Gate, just in front of the Currency Exchange office. For Domestic flights, the meeting point is in front of Caffe Nero, which is in front of the domestic arrivals gate.'
  },
  {
    id: 2,
    name: 'Heathrow T3',
    keywords: ['heathrow', 'terminal 3', 'lhr t3'],
    message: 'Our driver will hold your name on a board inside the terminal. Meeting point is in front of the WH Smith shop under the Heathrow Terminal Welcome Board.'
  },
  {
    id: 3,
    name: 'Heathrow T4',
    keywords: ['heathrow', 'terminal 4', 'lhr t4'],
    message: 'Our driver will hold your name on a board inside the terminal. Meeting point is in front of the Costa Coffee shop, which is situated near the arrivals gate.'
  },
  {
    id: 4,
    name: 'Heathrow T5',
    keywords: ['heathrow', 'terminal 5', 'lhr t5'],
    message: 'Our driver will hold a board with your name inside the terminal. International flights: Meeting point is outside the Costa Coffee shop, just opposite the International Arrivals gate. Domestic flights: Meeting point is in front of the Domestic Arrivals gate.'
  },
  {
    id: 5,
    name: 'Gatwick South',
    keywords: ['gatwick', 'south terminal'],
    message: 'Our driver will hold your name on a board inside the terminal. Meeting point for international and domestic flights will be outside the Greggs Coffee and Bakery Shop, just opposite the arrivals gate.'
  },
  {
    id: 6,
    name: 'Gatwick North',
    keywords: ['gatwick', 'north terminal'],
    message: 'Our driver will hold your name on a board inside the terminal. Meeting point for international flights will be in front of the arrivals gate. For domestic flights, the meeting point is in front of the UK arrival door.'
  },
  {
    id: 7,
    name: 'Stansted Airport',
    keywords: ['stansted'],
    message: 'Our driver will hold your name on a name board by the Airport Information Desk.'
  },
  {
    id: 8,
    name: 'Luton Airport',
    keywords: ['luton'],
    message: 'Our driver will hold your name on a name board by the WH Smith.'
  },
  {
    id: 9,
    name: 'London City Airport',
    keywords: ['city airport', 'lcy'],
    message: 'Our driver will hold your name on a name board by the WH Smith.'
  },
  {
    id: 10,
    name: 'Dover Cruise Terminal',
    keywords: ['dover'],
    message: 'Our driver will hold your name on a name board by the arrival gate of your cruise disembarking dock.'
  },
  {
    id: 11,
    name: 'Southampton Cruise Port',
    keywords: ['southampton'],
    message: 'Our driver will hold your name on a name board by the arrival gate of your cruise disembarking dock.'
  },
  {
    id: 12,
    name: 'Portsmouth Cruise Port',
    keywords: ['portsmouth'],
    message: 'Our driver will hold your name on a name board by the arrival gate of your cruise disembarking dock.'
  },
  {
    id: 13,
    name: 'Harwich Cruise Port',
    keywords: ['harwich'],
    message: 'Our driver will hold your name on a name board by the arrival gate of your cruise disembarking dock.'
  },
  {
    id: 14,
    name: 'Tilbury Cruise Port',
    keywords: ['tilbury'],
    message: 'Our driver will hold your name on a name board by the arrival gate of your cruise disembarking dock.'
  },
  {
    id: 15,
    name: 'St Pancras Station',
    keywords: ['st pancras', 'saint pancras'],
    message: 'Our driver will hold your name board by the Eurostar arrival gates.'
  },
  {
    id: 16,
    name: 'Euston Station',
    keywords: ['euston'],
    message: 'Our driver will hold your name on a name board by WH Smith newsagent at the arrivals concourse.'
  },
  {
    id: 17,
    name: 'Victoria Station',
    keywords: ['victoria station'],
    message: 'Our driver will hold your name on a name board by WH Smith newsagent at the arrivals concourse.'
  },
  {
    id: 18,
    name: 'Paddington Station',
    keywords: ['paddington'],
    message: 'Our driver will hold your name on a name board by the Travel Information desk at the main concourse.'
  },
  {
    id: 19,
    name: 'Waterloo Station',
    keywords: ['waterloo'],
    message: 'Our driver will hold your name on a name board by the Travel Information desk at the main concourse.'
  },
  {
    id: 20,
    name: 'Kings Cross Station',
    keywords: ['kings cross', "king's cross"],
    message: 'Our driver will hold your name on a name board by the Meeting Point signage on the concourse of the station, next to the information desk.'
  }
];

/**
 * Find the meeting point for a given location string.
 * Checks pickup address against known meeting point keywords.
 * For Heathrow (multiple terminals), requires terminal number match.
 *
 * @param {string} locationStr - The pickup/dropoff address string
 * @param {string} [flightTerminal] - Optional terminal from FlightStats (e.g. "T5", "North")
 */
function findMeetingPoint(locationStr, flightTerminal) {
  if (!locationStr) return null;
  const loc = locationStr.toLowerCase();

  // Heathrow needs special handling — match specific terminal
  if (loc.includes('heathrow')) {
    // If FlightStats provided a terminal, use it directly
    if (flightTerminal) {
      const ft = flightTerminal.toLowerCase();
      if (ft.includes('2') || ft === 't2') return MEETING_POINTS[0];
      if (ft.includes('3') || ft === 't3') return MEETING_POINTS[1];
      if (ft.includes('4') || ft === 't4') return MEETING_POINTS[2];
      if (ft.includes('5') || ft === 't5') return MEETING_POINTS[3];
    }
    if (loc.includes('terminal 2') || loc.includes('t2')) return MEETING_POINTS[0];
    if (loc.includes('terminal 3') || loc.includes('t3')) return MEETING_POINTS[1];
    if (loc.includes('terminal 4') || loc.includes('t4')) return MEETING_POINTS[2];
    if (loc.includes('terminal 5') || loc.includes('t5')) return MEETING_POINTS[3];
    // Generic Heathrow — return T2 as default with note
    return { ...MEETING_POINTS[0], name: 'Heathrow Airport', message: 'Please confirm your terminal. Meeting point instructions will be provided based on your terminal.' };
  }

  // Gatwick needs terminal match
  if (loc.includes('gatwick')) {
    // If FlightStats provided a terminal, use it directly
    if (flightTerminal) {
      const ft = flightTerminal.toLowerCase();
      if (ft.includes('south') || ft === 's') return MEETING_POINTS[4];
      if (ft.includes('north') || ft === 'n') return MEETING_POINTS[5];
    }
    if (loc.includes('south')) return MEETING_POINTS[4];
    if (loc.includes('north')) return MEETING_POINTS[5];
    return { ...MEETING_POINTS[4], name: 'Gatwick Airport', message: 'Please confirm your terminal (North or South). Meeting point instructions will be provided based on your terminal.' };
  }

  // All other locations — match by keywords
  for (const mp of MEETING_POINTS) {
    // Skip Heathrow/Gatwick (already handled above)
    if (mp.keywords.includes('heathrow') || mp.keywords.includes('gatwick')) continue;
    if (mp.keywords.some(kw => loc.includes(kw))) return mp;
  }

  return null;
}

module.exports = { MEETING_POINTS, findMeetingPoint };
