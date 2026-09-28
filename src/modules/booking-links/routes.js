/**
 * Afspraaklinks — beheerroutes. Alleen JSON, behalve `GET /`.
 *
 * Rechten: elke collega beheert de links waarvan HIJ de eigenaar is (in Odoo)
 * of die hij zelf aanmaakte; een admin beheert alles en mag een link voor
 * iemand anders aanmaken.
 */

import { calendlyConfigured, listEventTypes } from '../forminator-sync-v2/calendly/client.js';
import {
  BookingLinkError,
  listSites,
  bookingUrl,
  bookingUrls,
  generalBookingUrl,
  resolveOdooUser,
  listOdooUsers,
  listLinks,
  getLink,
  normalizeLinkPayload,
  createLink,
  updateLink,
  deleteLink,
  toSlug,
} from './lib/links.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  const status = err instanceof BookingLinkError ? err.status : 500;
  if (status === 500) console.error('[booking-links]', err);
  return json({ success: false, error: err.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return null; }
}

const isAdmin = (user) => user?.role === 'admin';

function metUrl(env, link) {
  return { ...link, public_url: bookingUrl(env, link), public_urls: bookingUrls(env, link) };
}

/** Mag deze gebruiker deze rij bewerken? */
async function magBewerken(env, user, link) {
  if (isAdmin(user)) return true;
  if (link.om_user_id && link.om_user_id === user.id) return true;
  const eigen = await resolveOdooUser(env, user).catch(() => null);
  return Boolean(eigen && eigen.id === link.odoo_user_id);
}

// Calendly's eventtypes kosten één aanroep per lid van de organisatie. Per
// isolate vijf minuten bewaren: de lijst verandert zelden, en het scherm vraagt
// ze bij elke keer dat iemand het dialoogvenster opent.
let eventTypeMemo = { at: 0, data: null };
const EVENT_TYPE_TTL_MS = 5 * 60 * 1000;

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/booking-links.html', context.request.url))),

  /** Alles wat het scherm bij het openen nodig heeft. */
  'GET /api/bootstrap': async ({ env, user }) => {
    try {
      const eigen = await resolveOdooUser(env, user).catch(() => null);
      return json({
        success: true,
        data: {
          is_admin: isAdmin(user),
          me: eigen,
          sites: listSites(env),
          general_url: generalBookingUrl(env),
          calendly_configured: calendlyConfigured(env),
        },
      });
    } catch (err) {
      return fout(err);
    }
  },

  'GET /api/links': async ({ env, user, request }) => {
    try {
      const alles = isAdmin(user) && new URL(request.url).searchParams.get('all') === '1';
      const eigen = alles ? null : await resolveOdooUser(env, user).catch(() => null);
      const rijen = await listLinks(env, { all: alles, omUserId: user.id, odooUserId: eigen?.id || null });
      return json({ success: true, data: rijen.map((r) => metUrl(env, r)) });
    } catch (err) {
      return fout(err);
    }
  },

  'GET /api/event-types': async ({ env, request }) => {
    try {
      if (!calendlyConfigured(env)) {
        return json({ success: true, data: [], note: 'CALENDLY_ACCESS_TOKEN is niet ingesteld.' });
      }
      const ververs = new URL(request.url).searchParams.get('refresh') === '1';
      if (ververs || !eventTypeMemo.data || Date.now() - eventTypeMemo.at > EVENT_TYPE_TTL_MS) {
        const types = await listEventTypes(env);
        eventTypeMemo = {
          at: Date.now(),
          data: types
            .filter((t) => t.scheduling_url)
            .map((t) => ({
              uri: t.uri,
              name: t.name,
              active: t.active,
              duration: t.duration,
              pooling_type: t.pooling_type,
              scheduling_url: t.scheduling_url,
              description: t.description || '',
              owner_name: t.owner_name,
              owner_type: t.owner_type,
              hosts: (t.hosts || []).map((h) => h.name).filter(Boolean),
            })),
        };
      }
      return json({ success: true, data: eventTypeMemo.data });
    } catch (err) {
      return fout(err);
    }
  },

  /** Admin: voor wie kan een link aangemaakt worden. */
  'GET /api/odoo-users': async ({ env, user }) => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    try {
      return json({ success: true, data: await listOdooUsers(env) });
    } catch (err) {
      return fout(err);
    }
  },

  'POST /api/links': async ({ env, user, request }) => {
    try {
      const body = await leesBody(request);
      if (!body) throw new BookingLinkError('Geen geldige gegevens ontvangen');

      const mijn = await resolveOdooUser(env, user).catch(() => null);
      let eigenaar;
      if (isAdmin(user) && Number.isInteger(body.odoo_user_id) && body.odoo_user_id > 0) {
        const lijst = await listOdooUsers(env);
        eigenaar = lijst.find((u) => u.id === body.odoo_user_id);
        if (!eigenaar) throw new BookingLinkError('Die Odoo-gebruiker bestaat niet (of is geen interne gebruiker).');
      } else {
        eigenaar = mijn;
        if (!eigenaar) {
          throw new BookingLinkError(`Er is geen Odoo-gebruiker gevonden voor ${user.email}. Vraag een beheerder om de link voor je aan te maken.`, 422);
        }
      }

      if (!body.slug) {
        const voornaam = String(eigenaar.name || '').split(/\s+/)[0];
        body.slug = toSlug(`${voornaam}-${body.kind || 'afspraak'}`);
      }

      const rij = normalizeLinkPayload(env, body, { isNieuw: true });
      const nieuw = await createLink(env, {
        ...rij,
        odoo_user_id: eigenaar.id,
        odoo_user_name: eigenaar.name || '',
        om_user_id: mijn && mijn.id === eigenaar.id ? user.id : null,
        created_by: user.id,
      });
      return json({ success: true, data: metUrl(env, nieuw) }, 201);
    } catch (err) {
      return fout(err);
    }
  },

  'PUT /api/links/:id': async ({ env, user, request, params }) => {
    try {
      const bestaande = await getLink(env, params.id);
      if (!bestaande) throw new BookingLinkError('Afspraaklink niet gevonden', 404);
      if (!(await magBewerken(env, user, bestaande))) throw new BookingLinkError('Dit is niet jouw afspraaklink', 403);

      const body = await leesBody(request);
      if (!body) throw new BookingLinkError('Geen geldige gegevens ontvangen');
      const wijziging = normalizeLinkPayload(env, body, { isNieuw: false });
      const bijgewerkt = await updateLink(env, bestaande.id, bestaande, wijziging);
      return json({ success: true, data: metUrl(env, bijgewerkt) });
    } catch (err) {
      return fout(err);
    }
  },

  'DELETE /api/links/:id': async ({ env, user, params }) => {
    try {
      const bestaande = await getLink(env, params.id);
      if (!bestaande) throw new BookingLinkError('Afspraaklink niet gevonden', 404);
      if (!(await magBewerken(env, user, bestaande))) throw new BookingLinkError('Dit is niet jouw afspraaklink', 403);
      await deleteLink(env, bestaande.id);
      return json({ success: true });
    } catch (err) {
      return fout(err);
    }
  },
};
