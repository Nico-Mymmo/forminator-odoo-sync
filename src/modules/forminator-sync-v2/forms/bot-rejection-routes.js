/**
 * Koppelingen — beheerroutes van de botcontrole (Instellingen -> Botcontrole).
 *
 * Staan in een eigen bestand zodat routes.js maar één import en één spread
 * krijgt (zelfde aanpak als calendly/routes.js). Ze lopen door dezelfde
 * auth-gate als de rest van de module: wie koppelingen beheert, kan ook een
 * inzending doorlaten -- dat is niet meer dan wat Replay in Indieningen al kan.
 */

import {
  BotRejectionError,
  BEWAARTERMIJN_DAGEN,
  STATUSSEN,
  countBotRejections,
  formulierenVan,
  laterVerstuurd,
  listBotRejections,
  releaseBotRejection,
  setDismissed,
} from './bot-rejections.js';
import { turnstileMode } from './turnstile.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fout(error) {
  if (error instanceof BotRejectionError) return json({ success: false, error: error.message }, error.status);
  console.error('[forms-botcontrole]', error?.message);
  return json({ success: false, error: error?.message || 'Er ging iets mis.' }, 500);
}

export const botRejectionRoutes = {

  /**
   * De lijst voor het scherm, plus alles wat het scherm nodig heeft om ze te
   * beoordelen: de stand van Turnstile, de tellingen per status, de velden per
   * koppeling (labels) en of iemand na de weigering toch nog binnenkwam.
   */
  'GET /api/bot-rejections': async (context) => {
    try {
      const gevraagd = new URL(context.request.url).searchParams.get('status') || 'open';
      const status = gevraagd === 'all' || STATUSSEN.includes(gevraagd) ? gevraagd : 'open';

      const [rijen, tellingen] = await Promise.all([
        listBotRejections(context.env, { status }),
        countBotRejections(context.env),
      ]);
      const formulieren = await formulierenVan(context.env, rijen);
      const later = await laterVerstuurd(context.env, rijen, formulieren);

      return json({
        success: true,
        data: {
          mode: turnstileMode(context.env),
          retention_days: BEWAARTERMIJN_DAGEN,
          counts: tellingen,
          integrations: formulieren,
          items: rijen.map((rij) => ({ ...rij, later_submission: later[rij.id] || null })),
        },
      });
    } catch (error) {
      return fout(error);
    }
  },

  /** Alsnog door de koppeling laten lopen. */
  'POST /api/bot-rejections/:id/release': async (context) => {
    try {
      const id = String(context.params?.id || '');
      if (!UUID_RE.test(id)) return json({ success: false, error: 'Ongeldige inzending.' }, 400);
      const data = await releaseBotRejection(context.env, id, {
        user: context.user,
        requestUrl: context.request.url,
      });
      return json({ success: true, data });
    } catch (error) {
      return fout(error);
    }
  },

  /** Negeren (of terugzetten met `undo: true`), één of meerdere tegelijk. */
  'POST /api/bot-rejections/dismiss': async (context) => {
    try {
      const body = await context.request.json().catch(() => ({}));
      const aantal = await setDismissed(context.env, body?.ids, { user: context.user, undo: body?.undo === true });
      return json({ success: true, data: { updated: aantal } });
    } catch (error) {
      return fout(error);
    }
  },
};
