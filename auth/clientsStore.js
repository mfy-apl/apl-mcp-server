/**
 * MySQL-backed OAuth client store.
 * Implements OAuthRegisteredClientsStore from @modelcontextprotocol/sdk.
 */

class ClientsStore {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Look up a registered client by ID.
   * Returns the full client info object, or undefined if not found.
   */
  async getClient(clientId) {
    const [rows] = await this.pool.query(
      'SELECT client_data FROM oauth_clients WHERE client_id = ?',
      [clientId]
    );
    if (!rows.length) return undefined;

    const data = typeof rows[0].client_data === 'string'
      ? JSON.parse(rows[0].client_data)
      : rows[0].client_data;
    return data;
  }

  /**
   * Persist a newly registered client.
   * The SDK generates client_id, client_secret, etc. before calling this.
   */
  async registerClient(clientInfo) {
    await this.pool.query(
      'INSERT INTO oauth_clients (client_id, client_data) VALUES (?, ?)',
      [clientInfo.client_id, JSON.stringify(clientInfo)]
    );
    console.log(`[OAuth] Registered client: ${clientInfo.client_id} (${clientInfo.client_name || 'unnamed'})`);
    return clientInfo;
  }
}

module.exports = { ClientsStore };
