/**
 * OAuth 2.1 provider for the MCP server.
 * Implements OAuthServerProvider from @modelcontextprotocol/sdk.
 *
 * Auto-approve flow: no login/consent page — authorize immediately generates
 * a code and redirects back, since the service is public (no user accounts).
 *
 * jose is ESM-only, so we use dynamic import() cached as a promise.
 */

const crypto = require('crypto');

const ACCESS_TOKEN_TTL = 3600;        // 1 hour
const REFRESH_TOKEN_TTL = 30 * 86400; // 30 days
const AUTH_CODE_TTL = 300;            // 5 minutes

// Lazy-load jose (ESM module) once
let _jose;
async function getJose() {
  if (!_jose) _jose = await import('jose');
  return _jose;
}

class AplOAuthProvider {
  /**
   * @param {import('mysql2/promise').Pool} pool
   * @param {import('./clientsStore').ClientsStore} clientsStore
   * @param {object} opts
   * @param {string} opts.jwtSecret  - hex-encoded HMAC secret
   * @param {string} opts.resourceUrl - MCP resource URL (audience)
   */
  constructor(pool, store, { jwtSecret, resourceUrl }) {
    this.pool = pool;
    this._clientsStore = store;
    this.secret = new TextEncoder().encode(jwtSecret);
    this.resourceUrl = resourceUrl;
  }

  /** Required by OAuthServerProvider — return the clients store. */
  get clientsStore() {
    return this._clientsStore;
  }

  // ── authorize ──────────────────────────────────────────────────────
  /**
   * Auto-approve: generate an auth code, store it, redirect back immediately.
   */
  async authorize(client, params, res) {
    const code = crypto.randomBytes(32).toString('hex');

    await this.pool.query(
      `INSERT INTO oauth_auth_codes
        (code, client_id, code_challenge, redirect_uri, scopes, resource, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        client.client_id,
        params.codeChallenge,
        params.redirectUri,
        (params.scopes || []).join(' '),
        params.resource ? params.resource.toString() : null,
        Math.floor(Date.now() / 1000)
      ]
    );

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) redirectUrl.searchParams.set('state', params.state);

    const target = redirectUrl.toString();
    console.log(`[OAuth] Authorized client ${client.client_id}, redirecting → ${target}`);
    // Standard 302 redirect. X-Redirect-To header + IIS outbound rule preserves
    // the external URL. Fallback /oauth-redirect route catches any rewrites.
    res.setHeader('X-Redirect-To', target);
    res.redirect(302, target);
  }

  // ── challengeForAuthorizationCode ──────────────────────────────────
  /**
   * Return the PKCE code_challenge stored when the authorization started.
   */
  async challengeForAuthorizationCode(client, authorizationCode) {
    const [rows] = await this.pool.query(
      'SELECT code_challenge FROM oauth_auth_codes WHERE code = ? AND client_id = ?',
      [authorizationCode, client.client_id]
    );
    if (!rows.length) throw new Error('Unknown authorization code');
    return rows[0].code_challenge;
  }

  // ── exchangeAuthorizationCode ──────────────────────────────────────
  /**
   * Verify the auth code is valid and unused, then issue JWT tokens.
   */
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, _redirectUri, resource) {
    const [rows] = await this.pool.query(
      'SELECT * FROM oauth_auth_codes WHERE code = ? AND client_id = ? AND used = 0',
      [authorizationCode, client.client_id]
    );

    if (!rows.length) throw new Error('Invalid or already-used authorization code');
    const row = rows[0];

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (now - row.created_at > AUTH_CODE_TTL) {
      throw new Error('Authorization code expired');
    }

    // Mark as used
    await this.pool.query('UPDATE oauth_auth_codes SET used = 1 WHERE code = ?', [authorizationCode]);

    const scopes = row.scopes ? row.scopes.split(' ').filter(Boolean) : [];
    const aud = resource ? resource.toString() : this.resourceUrl;

    return this._issueTokens(client.client_id, scopes, aud);
  }

  // ── exchangeRefreshToken ───────────────────────────────────────────
  /**
   * Verify a refresh JWT and issue a fresh access token.
   */
  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const { jwtVerify } = await getJose();
    let payload;
    try {
      const result = await jwtVerify(refreshToken, this.secret, {
        algorithms: ['HS256']
      });
      payload = result.payload;
    } catch {
      throw new Error('Invalid refresh token');
    }

    if (payload.type !== 'refresh') throw new Error('Token is not a refresh token');
    if (payload.client_id !== client.client_id) throw new Error('Refresh token client mismatch');

    const tokenScopes = scopes || (payload.scope ? payload.scope.split(' ') : []);
    const aud = resource ? resource.toString() : this.resourceUrl;

    return this._issueTokens(client.client_id, tokenScopes, aud);
  }

  // ── verifyAccessToken ──────────────────────────────────────────────
  /**
   * Verify a JWT access token signature and expiry.
   * Returns AuthInfo for the SDK's bearer-auth middleware.
   */
  async verifyAccessToken(token) {
    const { jwtVerify } = await getJose();
    const { payload } = await jwtVerify(token, this.secret, {
      algorithms: ['HS256']
    });

    if (payload.type !== 'access') throw new Error('Token is not an access token');

    return {
      token,
      clientId: payload.client_id,
      scopes: payload.scope ? payload.scope.split(' ') : [],
      expiresAt: payload.exp,
      resource: payload.aud ? new URL(payload.aud) : undefined
    };
  }

  // ── internal helpers ───────────────────────────────────────────────

  async _issueTokens(clientId, scopes, audience) {
    const { SignJWT } = await getJose();
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({
      client_id: clientId,
      scope: scopes.join(' '),
      type: 'access'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL)
      .sign(this.secret);

    const refreshToken = await new SignJWT({
      client_id: clientId,
      scope: scopes.join(' '),
      type: 'refresh'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TOKEN_TTL)
      .sign(this.secret);

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: scopes.join(' ')
    };
  }
}

module.exports = { AplOAuthProvider };
