const https = require('https');

const API_BASE = process.env.LONDON_TECH_API_URL || 'https://api.london-tech.com/api/v1';

function makeRequest(url, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, body: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('London Tech API timeout'));
    });

    if (data) req.write(data);
    req.end();
  });
}

/**
 * POST /api/v1/suggestions — search for locations
 */
async function searchSuggestions(query) {
  const result = await makeRequest(`${API_BASE}/suggestions`, 'POST', {
    value: query,
    'session-token': ''
  });

  if (result.status !== 200 || !result.body || !result.body.result) {
    return { points: [], sessionToken: '', token: '' };
  }

  // Key "0" in the result object contains Google Places results;
  // other keys are London Tech system locations (airports, stations, etc.)
  const resultObj = result.body.result;
  const googlePoints = (resultObj['0'] || []).map(p => ({ ...p, _isGooglePlace: true }));
  const systemPoints = Object.entries(resultObj)
    .filter(([key]) => key !== '0')
    .flatMap(([, pts]) => pts);
  // System points first (more accurate), then Google
  const points = [...systemPoints, ...googlePoints];
  return {
    points,
    sessionToken: result.body['session-token'] || '',
    token: result.body.token || ''
  };
}

/**
 * POST /api/v1/google-places/ — get accurate details for a Google Places point.
 * Must be called for any point from key "0" in suggestions before using it.
 */
async function getGooglePlaceDetails(point) {
  const cleanPoint = { ...point };
  delete cleanPoint._isGooglePlace;
  const result = await makeRequest(`${API_BASE}/google-places/`, 'POST', { point: cleanPoint });

  if (result.status !== 200 || !result.body || !result.body.point) {
    throw new Error('Google Places detail lookup failed');
  }

  // Return the enriched point object, not the wrapper
  return result.body.point;
}

/**
 * POST /api/v1/quotation — get prices
 */
async function getQuotation(pickupPoints, dropoffPoints, dateTimeStr) {
  const result = await makeRequest(`${API_BASE}/quotation`, 'POST', {
    selectedPickupPoints: pickupPoints,
    selectedDropoffPoints: dropoffPoints,
    transferDateTimeString: dateTimeStr
  });

  if (!result.body || result.body.status !== 200) {
    const errorMsg = result.body?.error?.global?.[0] || 'Quotation request failed';
    throw new Error(errorMsg);
  }

  return {
    quotationOptions: result.body.quotationOptions || [],
    duration: result.body.duration || null,
    pickupPoints: result.body.pickupPoints || pickupPoints,
    dropoffPoints: result.body.dropoffPoints || dropoffPoints
  };
}

/**
 * POST /api/v1/reservation/ — create reservation via London Tech API.
 * Uses the same endpoint as booking-api (no auth headers needed).
 * The channelId + accountId in the payload tags it as GIA.
 */
async function createReservation(payload) {
  const result = await makeRequest(`${API_BASE}/reservation/`, 'POST', payload);
  return result;
}

module.exports = { searchSuggestions, getGooglePlaceDetails, getQuotation, createReservation };
