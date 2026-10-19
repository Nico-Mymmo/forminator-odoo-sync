/**
 * Projecten -- vaste lijsten. EEN plek; het scherm krijgt ze via
 * GET /projecten/api/bootstrap en kent ze niet zelf.
 */

export const LOG_PREFIX = '[projecten]';

export const PROJECT_STATUSSEN = [
  { key: 'op_schema', label: 'Op schema', tone: 'success' },
  { key: 'risico', label: 'Risico', tone: 'warning' },
  { key: 'vertraagd', label: 'Vertraagd', tone: 'error' },
  { key: 'gepauzeerd', label: 'Gepauzeerd', tone: 'neutral' },
  { key: 'afgerond', label: 'Afgerond', tone: 'info' },
];

export const PRIORITEITEN = [
  { key: 'laag', label: 'Laag' },
  { key: 'normaal', label: 'Normaal' },
  { key: 'hoog', label: 'Hoog' },
  { key: 'dringend', label: 'Dringend' },
];

// Kleuren van een project: een gesloten lijst (Tailwind-tint + hex voor de
// kalender, die geen klassen kent).
export const KLEUREN = [
  { key: 'sky', hex: '#0284c7' },
  { key: 'teal', hex: '#0d9488' },
  { key: 'green', hex: '#16a34a' },
  { key: 'amber', hex: '#d97706' },
  { key: 'orange', hex: '#ea580c' },
  { key: 'rose', hex: '#e11d48' },
  { key: 'violet', hex: '#7c3aed' },
  { key: 'slate', hex: '#475569' },
];

// Waar een taak naar kan verwijzen in Odoo. Gesloten lijst: de zoekroute
// spreekt Odoo enkel voor deze modellen aan, en enkel lezend.
export const ODOO_MODELLEN = [
  { key: 'crm.lead', label: 'Lead / verkoopkans', icon: 'target', fields: ['name', 'partner_name', 'email_from'], search: ['name', 'partner_name', 'email_from'], context: { active_test: false } },
  { key: 'res.partner', label: 'Klant / contact / VME', icon: 'building-2', fields: ['display_name', 'email'], search: ['name', 'email'] },
  { key: 'sale.order', label: 'Offerte / abonnement', icon: 'file-text', fields: ['name', 'partner_id'], search: ['name', 'partner_id.name'] },
];

export const MAX_TITEL = 300;
export const MAX_BESCHRIJVING = 20000;
export const MAX_OPMERKING = 10000;
export const MAX_LABELS = 10;
export const MAX_BIJLAGE = 15 * 1024 * 1024;
export const BIJLAGEN_MAP = 'projecten/';
