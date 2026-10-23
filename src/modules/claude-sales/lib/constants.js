/**
 * Claude voor sales -- vaste waarden.
 */

export const MODULE_CODE = 'claude_sales';
export const LOG_PREFIX = '[claude-sales]';

/** Het pad van de connector. De volledige URL is `${origin}${MCP_PATH}`. */
export const MCP_PATH = '/mcp/sales';

/**
 * Het publieke adres van de OM. NIET uit request.url halen: via
 * operations.openvme.be (een geproxyde CNAME) ziet de Worker daar het
 * workers.dev-adres, en Claude controleert dat de uitgever van het token
 * exact het adres is waar het de connector vond.
 */
export function publiekeOrigin(env) {
  return String(env?.CLAUDE_SALES_ORIGIN || 'https://operations.openvme.be').replace(/\/+$/, '');
}

/** Hoe lang een toegangstoken en een vernieuwingstoken geldig zijn. */
export const ACCESS_MS = 8 * 60 * 60 * 1000;
export const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
export const CODE_MS = 5 * 60 * 1000;

export class SalesError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
