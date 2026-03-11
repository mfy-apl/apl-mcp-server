/**
 * A2A / JSON-RPC 2.0 error codes and helpers.
 *
 * Standard JSON-RPC codes: -32700 to -32600
 * A2A-specific codes:      -32001 to -32007
 */

// ── Standard JSON-RPC 2.0 errors ────────────────────────────────────
const PARSE_ERROR       = -32700;
const INVALID_REQUEST   = -32600;
const METHOD_NOT_FOUND  = -32601;
const INVALID_PARAMS    = -32602;
const INTERNAL_ERROR    = -32603;

// ── A2A-specific errors ─────────────────────────────────────────────
const TASK_NOT_FOUND          = -32001;
const TASK_NOT_CANCELABLE     = -32002;
const CONTENT_TYPE_NOT_SUPPORTED = -32003;
const PUSH_NOTIFICATION_NOT_SUPPORTED = -32006;
const UNSUPPORTED_OPERATION   = -32007;

/**
 * Build a JSON-RPC 2.0 error response.
 */
function errorResponse(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', error: err, id: id ?? null };
}

module.exports = {
  PARSE_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  INTERNAL_ERROR,
  TASK_NOT_FOUND,
  TASK_NOT_CANCELABLE,
  CONTENT_TYPE_NOT_SUPPORTED,
  PUSH_NOTIFICATION_NOT_SUPPORTED,
  UNSUPPORTED_OPERATION,
  errorResponse
};
