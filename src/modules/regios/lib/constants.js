/**
 * Regio's -- vaste waarden.
 */

export const LOG_PREFIX = '[regios]';

/** De mini-app waaruit deze module overgenomen werd (zie lib/overname.js). */
export const MINI_APP_ID = '0913f371-1d50-47a6-9706-d39ef50beb43';

/** Kleuren die een nieuwe syndicoach krijgt, in deze volgorde (dezelfde als de mini-app). */
export const PALET = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#d946ef'];

export const MAX_NAAM = 60;

/** Een Belgische postcode: vier cijfers, niet met 0 beginnend. */
export const POSTCODE_RE = /^[1-9][0-9]{3}$/;

export const KLEUR_RE = /^#[0-9a-f]{6}$/i;

export class RegioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** "B-9000 ", "9000" -> "9000"; iets anders -> null. */
export function normaliseerPostcode(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/^B\s*-?\s*/, '').replace(/\s+/g, '');
  return POSTCODE_RE.test(s) ? s : null;
}
