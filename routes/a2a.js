/**
 * A2A protocol Express router.
 *
 * POST /a2a — JSON-RPC 2.0 endpoint (API key auth)
 * Auth: x-api-key checked against MCP_API_KEY env var + api_agents table.
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { handleRequest } = require('../a2a/jsonRpcHandler');
const { errorResponse, PARSE_ERROR, INTERNAL_ERROR } = require('../a2a/errors');

const router = express.Router();

const MCP_API_KEY = process.env.MCP_API_KEY;

// ── Self-Registration (public, no auth) ──────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many registrations from this IP. Try again in an hour.' },
  validate: { ip: false }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, url } = req.body || {};

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'name is required (min 2 characters)' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const trimmedName = name.trim().slice(0, 100);
  const trimmedEmail = email.trim().toLowerCase().slice(0, 200);
  const trimmedUrl = (url && typeof url === 'string') ? url.trim().slice(0, 300) : null;

  try {
    // Check duplicate email
    const [existing] = await pool.query(
      'SELECT id FROM api_agents WHERE contact_email = ?',
      [trimmedEmail]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An agent with this email is already registered' });
    }

    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Insert with defaults from env
    await pool.query(
      `INSERT INTO api_agents (agent_name, api_key, account_id, channel_id, payment_type, booking_prefix, contact_email, website_url, source)
       VALUES (?, ?, ?, ?, 1, 'APL', ?, ?, 'self-registered')`,
      [trimmedName, apiKey, parseInt(process.env.GIA_ACCOUNT_ID) || 0, parseInt(process.env.GIA_CHANNEL_ID) || 0, trimmedEmail, trimmedUrl]
    );

    console.log(`[A2A] New agent registered: ${trimmedName} <${trimmedEmail}> from ${req.ip}`);

    return res.status(201).json({
      agent_name: trimmedName,
      api_key: apiKey,
      message: 'API key created. Use this key in the x-api-key header for all A2A, REST API, and MCP requests.'
    });
  } catch (err) {
    console.error('[A2A] Registration error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * Auth middleware — accepts:
 *   1. x-api-key header (MCP_API_KEY or api_agents key)
 *   2. OAuth Bearer token (JWT from /token endpoint, e.g. Gemini Enterprise)
 * Sets req.agentConfig if the key belongs to an agent (for multi-agent bookings).
 */
async function a2aAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  // ── OAuth Bearer token (Gemini Enterprise etc.) ──
  if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
    try {
      // Try Google OIDC token first (Gemini Enterprise sends these)
      const token = authHeader.slice(7);
      let googleVerified = false;

      try {
        const { OAuth2Client } = require('google-auth-library');
        const googleClient = new OAuth2Client();
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID || undefined,
        });
        const payload = ticket.getPayload();
        console.log(`[A2A] Google OIDC auth: email=${payload.email}, iss=${payload.iss}`);
        // Look up Gemini agent config
        const [geminiRows] = await pool.query(
          "SELECT * FROM api_agents WHERE agent_name = 'Gemini' AND is_active = 1"
        );
        req.agentConfig = geminiRows.length > 0 ? {
          agentName: geminiRows[0].agent_name,
          accountId: geminiRows[0].account_id,
          channelId: geminiRows[0].channel_id,
          paymentType: geminiRows[0].payment_type,
          bookingPrefix: geminiRows[0].booking_prefix
        } : null;
        googleVerified = true;
        return next();
      } catch (googleErr) {
        // Not a Google token — try our own OAuth
      }

      if (!googleVerified) {
        const oauthProvider = req.app.get('oauthProvider');
        if (oauthProvider) {
          const authInfo = await oauthProvider.verifyAccessToken(token);
          console.log(`[A2A] OAuth Bearer auth: client=${authInfo.clientId}`);
          req.agentConfig = null;
          return next();
        }
      }
    } catch (err) {
      console.warn(`[A2A] Invalid Bearer token from ${req.ip}: ${err.message}`);
      return res.status(401).json(
        errorResponse(req.body?.id ?? null, -32000, 'Unauthorized — invalid Bearer token')
      );
    }
  }

  // ── No auth provided — allow A2A message/send from Gemini Enterprise ──
  // Gemini Enterprise sends requests without auth when OAuth is not configured.
  // We allow these through with the Gemini agent config so bookings are tagged correctly.
  if (!apiKey && !authHeader) {
    const method = req.body?.method;
    if (method === 'message/send' || method === 'message/stream') {
      console.log(`[A2A] Unauthenticated A2A request from ${req.ip} — allowing as Gemini`);
      const [geminiRows] = await pool.query(
        "SELECT * FROM api_agents WHERE agent_name = 'Gemini' AND is_active = 1"
      );
      req.agentConfig = geminiRows.length > 0 ? {
        agentName: geminiRows[0].agent_name,
        accountId: geminiRows[0].account_id,
        channelId: geminiRows[0].channel_id,
        paymentType: geminiRows[0].payment_type,
        bookingPrefix: geminiRows[0].booking_prefix
      } : null;
      return next();
    }
    return res.status(401).json(
      errorResponse(req.body?.id ?? null, -32000, 'Missing x-api-key or Authorization header')
    );
  }

  // ── Master API key ──
  if (MCP_API_KEY && apiKey === MCP_API_KEY) {
    req.agentConfig = null; // GIA default
    return next();
  }

  // ── api_agents table key ──
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
    console.error('[A2A] Auth DB error:', err.message);
  }

  console.warn(`[A2A] Invalid API key from ${req.ip}`);
  return res.status(401).json(
    errorResponse(req.body?.id ?? null, -32000, 'Unauthorized — invalid API key')
  );
}

// Request logging
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.body?.method || '-';
    const agent = req.agentConfig?.agentName || 'GIA';
    console.log(`[A2A] POST /a2a | ${res.statusCode} | ${duration}ms | method=${method} | agent=${agent} | ip=${req.ip}`);
  });
  next();
});

router.post('/', a2aAuth, async (req, res) => {
  const body = req.body;

  // Validate JSON-RPC envelope
  if (!body || typeof body !== 'object') {
    return res.json(errorResponse(null, PARSE_ERROR, 'Request body must be a JSON object'));
  }

  try {
    const response = await handleRequest(body, req.agentConfig);
    return res.json(response);
  } catch (err) {
    console.error('[A2A] Handler error:', err.message);
    return res.json(errorResponse(body.id ?? null, INTERNAL_ERROR, 'Internal server error'));
  }
});

module.exports = router;
