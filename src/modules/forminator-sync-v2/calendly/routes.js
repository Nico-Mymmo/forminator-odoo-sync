/**
 * Koppelingen — Calendly: de beheerroutes.
 *
 * Staan in een eigen bestand zodat routes.js (2700 regels) maar één import en
 * één spread hoeft te krijgen. Ze worden daar in het routes-object gespreid en
 * lopen dus door dezelfde auth-gate en endpoint-tracking als de rest.
 *
 * De ONTVANGST van een boeking staat hier niet -- die is publiek (Calendly kan
 * geen sessiecookie sturen) en loopt via router/public-routes.js → webhook.js.
 */

import { executeKw } from '../../../lib/odoo.js';
import { getIntegrationById, updateIntegration } from '../database.js';
import {
  calendlyConfigured,
  getCurrentUser,
  listEventTypes,
  listWebhookSubscriptions,
  createWebhookSubscription,
  deleteWebhookSubscription,
  generateSigningKey,
} from './client.js';
import {
  getActiveCalendlySubscription,
  insertCalendlySubscription,
  retireCalendlySubscriptions,
  listCalendlyIntegrations,
} from './database.js';
import { CALENDLY_WEBHOOK_PATH } from './webhook.js';
import { CALENDLY_FIELDS, HANDLED_EVENTS } from './payload.js';
import { ensureCalendlySystemSteps, MEETING_MODEL, HOST_STAP, MEETING_STAP } from './system-step.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function status(error) {
  if (error?.code === 'NOT_FOUND') return 404;
  if (error?.code === 'FORBIDDEN') return 403;
  if (error?.code === 'VALIDATION_ERROR') return 400;
  return 500;
}

function webhookUrlVoor(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}${CALENDLY_WEBHOOK_PATH}`;
}

export const calendlyRoutes = {

  /**
   * Waar staan we? Eén aanroep die het hele instellingenscherm vult, zodat dat
   * scherm niet vier keer hoeft te vragen of er wel een token is.
   *
   * Een ontbrekend token is hier GEEN fout: de module werkt gewoon door, je kan
   * alleen niets aanmelden. Een 500 zou het instellingenscherm leeg laten en de
   * gebruiker niet vertellen wat eraan ontbreekt.
   */
  'GET /api/calendly/status': async (context) => {
    const ingesteld = calendlyConfigured(context.env);
    const basis = {
      token_configured: ingesteld,
      webhook_url: webhookUrlVoor(context.request),
      events: HANDLED_EVENTS,
    };

    if (!ingesteld) {
      return json({
        success: true,
        data: {
          ...basis,
          note: 'Zet de Worker-secret CALENDLY_ACCESS_TOKEN (een persoonlijk toegangstoken met de rechten users:read, webhooks:read, webhooks:write, event_types:read en scheduled_events:read) en deploy opnieuw.',
        },
      });
    }

    try {
      const [gebruiker, opgeslagen, koppelingen] = await Promise.all([
        getCurrentUser(context.env),
        getActiveCalendlySubscription(context.env),
        listCalendlyIntegrations(context.env),
      ]);

      // Wat Calendly ZELF zegt dat er aangemeld staat. Dat kan afwijken van
      // onze eigen rij: iemand kan de subscription bij Calendly verwijderd
      // hebben, en dan staat hier "actief" terwijl er nooit nog een boeking
      // binnenkomt. Die stille toestand is precies wat er sinds 24 juli met de
      // Zapier-koppeling aan de hand was, dus dit scherm hoort het te zien.
      let bijCalendly = [];
      try {
        bijCalendly = await listWebhookSubscriptions(context.env, { organization: gebruiker.organization });
      } catch (err) {
        bijCalendly = [];
      }

      const onzeUrl = webhookUrlVoor(context.request);
      const levend = bijCalendly.find((s) => s.callback_url === onzeUrl && s.state === 'active') || null;

      return json({
        success: true,
        data: {
          ...basis,
          user: gebruiker,
          subscription: opgeslagen
            ? {
                id: opgeslagen.id,
                uri: opgeslagen.subscription_uri,
                events: opgeslagen.events,
                scope: opgeslagen.scope,
                callback_url: opgeslagen.callback_url,
                created_at: opgeslagen.created_at,
              }
            : null,
          live_at_calendly: levend,
          // De drie standen die het scherm uit elkaar moet houden.
          health: !opgeslagen
            ? 'not_subscribed'
            : (levend ? 'ok' : 'missing_at_calendly'),
          integration_count: koppelingen.length,
          integrations: koppelingen.map((k) => ({
            id: k.id,
            name: k.name,
            is_active: k.is_active,
            event_type_uri: k.calendly_event_type_uri,
            event_type_name: k.calendly_event_type_name,
          })),
        },
      });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /** De eventtypes van de organisatie, om per koppeling uit te kiezen. */
  'GET /api/calendly/event-types': async (context) => {
    try {
      const types = await listEventTypes(context.env);
      return json({ success: true, data: types });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /**
   * De vier rijen uit x_calendlyeventtypes in Odoo.
   *
   * Uit Odoo en niet hardgecodeerd: die lijst is in Studio aan te vullen, en
   * een hardgecodeerde kopie zou stil verouderen -- precies hoe alles op
   * "Anders" belandde bij de Zapier-koppeling.
   */
  'GET /api/calendly/odoo-event-types': async (context) => {
    try {
      const rijen = await executeKw(context.env, {
        model: 'x_calendlyeventtypes',
        method: 'search_read',
        args: [[], ['id', 'x_name']],
        kwargs: { limit: 100 },
      });
      return json({
        success: true,
        data: (rijen || []).map((r) => ({ id: r.id, name: r.x_name || r.display_name || String(r.id) })),
      });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /**
   * De velden die een Calendly-koppeling levert.
   *
   * Bestaat om dezelfde reden als /api/forms/meta bij de OM-formulieren: zonder
   * dit blijft de keuzelijst bij Veldkoppelingen leeg tot de eerste boeking
   * binnen is, en dat is net de boeking waarvan je de mapping nog niet had.
   */
  'GET /api/calendly/fields': async () => {
    return json({
      success: true,
      data: {
        // `choices` (derde element, enkel bij booking_action) gaat mee: het
        // koppelingsscherm maakt er vinkjes van in de voorwaarde-editor in
        // plaats van een tekstveld waarin je de sleutel moet weten.
        fields: CALENDLY_FIELDS.map(([key, label, choices]) => (
          choices ? { key, label, choices } : { key, label }
        )),
        note: 'De antwoorden op de vragen van je boekingspagina komen hier bovenop als q_<vraag> zodra de eerste boeking binnen is.',
      },
    });
  },

  /**
   * De webhook bij Calendly aanmelden (of opnieuw aanmelden).
   *
   * De signing key maken WIJ en geven we mee; Calendly geeft hem daarna nooit
   * meer terug. Opnieuw aanmelden levert dus altijd een nieuwe sleutel op, en
   * de oude rij blijft als 'retired' staan zodat een bezorging die op dat
   * moment onderweg was nog geverifieerd kan worden.
   */
  'POST /api/calendly/subscribe': async (context) => {
    try {
      const gebruiker = await getCurrentUser(context.env);
      if (!gebruiker.organization) {
        return json({ success: false, error: 'Dit Calendly-token hoort bij geen organisatie.' }, 400);
      }

      const url = webhookUrlVoor(context.request);

      // Staat er al een subscription op precies deze URL, dan die eerst bij
      // Calendly weghalen. Anders weigert Calendly met een 409 (conflict) en
      // zit je met een aanmelding waarvan wij de sleutel niet meer hebben.
      const bestaande = await listWebhookSubscriptions(context.env, { organization: gebruiker.organization });
      for (const s of bestaande) {
        if (s.callback_url !== url) continue;
        try {
          await deleteWebhookSubscription(context.env, s.uri);
        } catch (err) {
          console.warn('[calendly] oude subscription niet kunnen verwijderen:', err.message);
        }
      }

      const signingKey = generateSigningKey();
      const aangemeld = await createWebhookSubscription(context.env, {
        url,
        events: HANDLED_EVENTS,
        organization: gebruiker.organization,
        scope: 'organization',
        signingKey,
      });

      await retireCalendlySubscriptions(context.env);
      const rij = await insertCalendlySubscription(context.env, {
        organization_uri: gebruiker.organization,
        subscription_uri: aangemeld.uri,
        signing_key: signingKey,
        events: aangemeld.events,
        scope: aangemeld.scope,
        callback_url: url,
        state: 'active',
        created_by: context.user?.email || null,
      });

      return json({
        success: true,
        data: {
          id: rij.id,
          uri: aangemeld.uri,
          callback_url: url,
          events: aangemeld.events,
          scope: aangemeld.scope,
        },
      });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /** De aanmelding bij Calendly weghalen. Koppelingen blijven staan. */
  'DELETE /api/calendly/subscription': async (context) => {
    try {
      const huidige = await getActiveCalendlySubscription(context.env);
      if (huidige?.subscription_uri) {
        try {
          await deleteWebhookSubscription(context.env, huidige.subscription_uri);
        } catch (err) {
          // Al weg bij Calendly is geen fout -- onze rij moet dan juist net wel
          // op retired, want anders blijft het scherm "actief" beweren.
          console.warn('[calendly] verwijderen bij Calendly mislukt:', err.message);
        }
      }
      await retireCalendlySubscriptions(context.env);
      return json({ success: true });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /** De Calendly-instellingen van één koppeling, plus de staat van de vaste stap. */
  'GET /api/integrations/:id/calendly': async (context) => {
    try {
      const integration = await getIntegrationById(context.env, context.params?.id);
      if (!integration) return json({ success: false, error: 'Integration not found' }, 404);
      if (integration.source_type !== 'calendly') {
        return json({ success: false, error: 'Deze koppeling is geen Calendly-koppeling.' }, 400);
      }

      return json({
        success: true,
        data: {
          event_type_uri: integration.calendly_event_type_uri || null,
          event_type_name: integration.calendly_event_type_name || null,
          pooling_type: integration.calendly_pooling_type || null,
          locale: integration.calendly_locale || null,
          odoo_event_type_id: integration.calendly_odoo_event_type_id || null,
          system_step: {
            model: MEETING_MODEL,
            host_label: HOST_STAP,
            meeting_label: MEETING_STAP,
          },
        },
      });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /**
   * De Calendly-instellingen van één koppeling opslaan.
   *
   * Bouwt daarna de vaste stappen opnieuw op. Dat is idempotent en het moet
   * hier gebeuren: wijzigt iemand het Odoo-eventtype, dan hoort dat meteen te
   * gelden en niet pas bij de volgende keer dat de koppeling aangemaakt wordt.
   */
  'PUT /api/integrations/:id/calendly': async (context) => {
    try {
      const integration = await getIntegrationById(context.env, context.params?.id);
      if (!integration) return json({ success: false, error: 'Integration not found' }, 404);
      if (integration.source_type !== 'calendly') {
        return json({ success: false, error: 'Deze koppeling is geen Calendly-koppeling.' }, 400);
      }

      const body = await context.request.json().catch(() => ({}));
      const updates = { updated_at: new Date().toISOString() };

      if (body.event_type_uri !== undefined) {
        const uri = String(body.event_type_uri || '').trim();
        if (uri && !/^https:\/\/api\.calendly\.com\/event_types\/[A-Za-z0-9-]+$/.test(uri)) {
          return json({ success: false, error: 'Dat is geen geldige Calendly-eventtype-URI.' }, 400);
        }

        // Twee koppelingen op hetzelfde eventtype betekent dat de ene de andere
        // overschrijft in Odoo, zonder dat iemand dat ziet: findCalendly...()
        // kiest er één en de andere doet nooit meer iets. Beter hier weigeren.
        const andere = (await listCalendlyIntegrations(context.env))
          .filter((k) => k.id !== integration.id);
        const botsing = andere.find((k) => String(k.calendly_event_type_uri || '').trim() === uri);
        if (botsing) {
          return json({
            success: false,
            error: uri
              ? `Koppeling "${botsing.name}" staat al op dit eventtype. Eén eventtype hoort bij één koppeling.`
              : `Koppeling "${botsing.name}" is al het vangnet voor eventtypes zonder eigen koppeling.`,
          }, 409);
        }

        updates.calendly_event_type_uri = uri || null;
      }

      if (body.event_type_name !== undefined) updates.calendly_event_type_name = String(body.event_type_name || '').trim() || null;
      if (body.pooling_type !== undefined) updates.calendly_pooling_type = String(body.pooling_type || '').trim() || null;
      if (body.locale !== undefined) updates.calendly_locale = String(body.locale || '').trim() || null;

      if (body.odoo_event_type_id !== undefined) {
        const id = parseInt(body.odoo_event_type_id, 10);
        updates.calendly_odoo_event_type_id = Number.isInteger(id) && id > 0 ? id : null;
      }

      const bijgewerkt = await updateIntegration(context.env, integration.id, updates);
      const stappen = await ensureCalendlySystemSteps(context.env, bijgewerkt);

      return json({ success: true, data: { integration: bijgewerkt, system_step: stappen } });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },

  /** De vaste stappen opnieuw opbouwen. Voor wanneer iemand ze toch stukmaakte. */
  'POST /api/integrations/:id/calendly/rebuild': async (context) => {
    try {
      const integration = await getIntegrationById(context.env, context.params?.id);
      if (!integration) return json({ success: false, error: 'Integration not found' }, 404);
      if (integration.source_type !== 'calendly') {
        return json({ success: false, error: 'Deze koppeling is geen Calendly-koppeling.' }, 400);
      }
      const stappen = await ensureCalendlySystemSteps(context.env, integration);
      return json({ success: true, data: stappen });
    } catch (error) {
      return json({ success: false, error: error.message }, status(error));
    }
  },
};
