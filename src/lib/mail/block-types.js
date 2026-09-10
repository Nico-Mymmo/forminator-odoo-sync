/**
 * Bloktypes voor de mailopmaak — één lijst, gedeeld door alle modules.
 *
 * Stond eerst in `event-operations-v2/lib/mail-blocks.js`. Verplaatst toen de
 * Koppelingen-module dezelfde renderer nodig had: twee lijsten die
 * "hetzelfde" bloktype anders spellen is precies de tweede waarheid die de
 * mailstudio kwam opruimen. `mail-blocks.js` her-exporteert hem, dus alle
 * bestaande imports blijven werken.
 *
 * EVENT_DETAILS en ANNOUNCEMENT zijn hier gewoon strings; of een module ze
 * AANBIEDT in haar editor is haar eigen keuze. Een koppelingsmail heeft geen
 * event om aan te kondigen en toont ze dus niet.
 */

export const BLOCK_TYPE = {
  HEADING: 'heading',
  TEXT: 'text',
  EVENT_DETAILS: 'event_details',
  BUTTON: 'button',
  MAP: 'map',
  SIGNATURE: 'signature',
  VIDEO: 'video',
  IMAGE: 'image',
  DIVIDER: 'divider',
  SPACER: 'spacer',
  CARD_BREAK: 'card_break',
  FOOTER: 'footer',
  ANNOUNCEMENT: 'announcement'
};
