/**
 * Koppelingen — praten met de Calendly REST-API (v2).
 *
 * Authenticatie via env.CALENDLY_ACCESS_TOKEN, een persoonlijk toegangstoken
 * (Worker SECRET, nooit in wrangler.jsonc). Zonder dat token geeft elke functie
 * hier een nette fout en blijft de rest van de module werken -- een
 * Calendly-koppeling is dan enkel niet aan te melden.
 *
 * Benodigde rechten op het token: `webhooks:read`, `webhooks:write`,
 * `event_types:read`, `scheduled_events:read` (dat laatste is wat Calendly
 * vereist om je op invitee.created/invitee.canceled te mogen abonneren).
 *
 * WAAROM ÉÉN SUBSCRIPTION VOOR DE HELE MODULE
 * -------------------------------------------
 * Een webhook-subscription kan NIET op eventtype filteren: `scope` is enkel
 * `organization`, `user` of `group` (geverifieerd in Calendly's OpenAPI-spec).
 * Eén subscription per koppeling zou dus betekenen dat elke koppeling elke
 * boeking van de hele organisatie binnenkrijgt, en dat elke boeking N keer
 * verwerkt wordt. Daarom: één subscription, en de routering naar de juiste
 * koppeling gebeurt bij ons op `scheduled_event.event_type`.
 */

const API = 'https://api.calendly.com';

export function calendlyConfigured(env) {
  return !!(env && env.CALENDLY_ACCESS_TOKEN);
}

function createError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function calendlyFetch(env, pad, { method = 'GET', body = null, query = null } = {}) {
  if (!calendlyConfigured(env)) {
    throw createError('CALENDLY_ACCESS_TOKEN is niet ingesteld. Zet de Worker-secret en deploy opnieuw.');
  }

  const url = new URL(pad.startsWith('http') ? pad : API + pad);
  if (query) {
    for (const [sleutel, waarde] of Object.entries(query)) {
      if (waarde === undefined || waarde === null || waarde === '') continue;
      url.searchParams.set(sleutel, String(waarde));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${env.CALENDLY_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const tekst = await res.text();
  let data = null;
  try { data = tekst ? JSON.parse(tekst) : null; } catch (_) { data = null; }

  if (!res.ok) {
    // Calendly's foutvorm is { title, message, details: [...] }. De titel alleen
    // ("Permission Denied") zegt te weinig om iets mee te doen -- de details
    // vertellen welk recht ontbreekt, en dat is precies wat je wil zien.
    const titel = data?.title || `HTTP ${res.status}`;
    const melding = data?.message || tekst.slice(0, 300) || 'Onbekende fout';
    const details = Array.isArray(data?.details)
      ? ' — ' + data.details.map((d) => `${d.parameter || ''} ${d.message || ''}`.trim()).filter(Boolean).join('; ')
      : '';
    throw createError(`Calendly: ${titel} — ${melding}${details}`, res.status === 401 || res.status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR');
  }

  return data;
}

/** Wie is dit token? Levert ook de organisatie waar alles aan hangt. */
export async function getCurrentUser(env) {
  const data = await calendlyFetch(env, '/users/me');
  const r = data?.resource || {};
  return {
    uri: r.uri || '',
    name: r.name || '',
    email: r.email || '',
    organization: r.current_organization || '',
    scheduling_url: r.scheduling_url || '',
    timezone: r.timezone || '',
  };
}

/**
 * Alle eventtypes van de organisatie, ook de niet-actieve.
 *
 * Niet-actieve horen erbij: een eventtype dat tijdelijk uitstaat heeft mogelijk
 * nog lopende boekingen, en je wil de koppeling kunnen instellen vóór je het
 * eventtype weer aanzet.
 */
export async function listEventTypes(env, { organization } = {}) {
  const org = organization || (await getCurrentUser(env)).organization;
  if (!org) throw createError('Geen Calendly-organisatie gevonden voor dit token.');

  const alles = [];
  let volgende = null;
  // Harde bovengrens: tien pagina's van honderd. Zonder grens kan een fout in
  // Calendly's paginering hier een oneindige lus maken binnen één worker-run.
  for (let i = 0; i < 10; i++) {
    const data = volgende
      ? await calendlyFetch(env, volgende)
      : await calendlyFetch(env, '/event_types', { query: { organization: org, count: 100 } });

    for (const r of (data?.collection || [])) {
      alles.push({
        uri: r.uri || '',
        uuid: (r.uri || '').split('/').pop() || '',
        name: r.name || '',
        slug: r.slug || '',
        active: r.active === true,
        duration: r.duration ?? null,
        kind: r.kind || '',
        pooling_type: r.pooling_type || null,
        scheduling_url: r.scheduling_url || '',
        color: r.color || '',
        locale: r.locale || '',
        owner_name: r.profile?.name || '',
        owner_type: r.profile?.type || '',
      });
    }

    volgende = data?.pagination?.next_page || null;
    if (!volgende) break;
  }

  return alles;
}

export async function listWebhookSubscriptions(env, { organization, scope = 'organization' } = {}) {
  const org = organization || (await getCurrentUser(env)).organization;
  const data = await calendlyFetch(env, '/webhook_subscriptions', {
    query: { organization: org, scope, count: 100 },
  });
  return (data?.collection || []).map((r) => ({
    uri: r.uri || '',
    callback_url: r.callback_url || '',
    events: r.events || [],
    scope: r.scope || '',
    state: r.state || '',
    created_at: r.created_at || '',
  }));
}

/**
 * Een signing key genereren. Die geven we ZELF mee bij het aanmelden; Calendly
 * ondertekent er daarna elke bezorging mee. Wij bewaren hem, Calendly geeft hem
 * nooit meer terug -- ben je hem kwijt, dan is opnieuw aanmelden de enige weg.
 */
export function generateSigningKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createWebhookSubscription(env, { url, events, organization, scope = 'organization', signingKey }) {
  const org = organization || (await getCurrentUser(env)).organization;
  if (!org) throw createError('Geen Calendly-organisatie gevonden voor dit token.');

  const data = await calendlyFetch(env, '/webhook_subscriptions', {
    method: 'POST',
    body: {
      url,
      events,
      organization: org,
      scope,
      signing_key: signingKey,
    },
  });

  const r = data?.resource || {};
  return {
    uri: r.uri || '',
    callback_url: r.callback_url || url,
    events: r.events || events,
    scope: r.scope || scope,
    state: r.state || 'active',
    organization: org,
  };
}

export async function deleteWebhookSubscription(env, subscriptionUri) {
  if (!subscriptionUri) throw createError('Geen subscription-URI opgegeven.');
  await calendlyFetch(env, subscriptionUri, { method: 'DELETE' });
  return true;
}
