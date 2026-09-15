/**
 * Koppelingen — praten met de Calendly REST-API (v2).
 *
 * Authenticatie via env.CALENDLY_ACCESS_TOKEN, een persoonlijk toegangstoken
 * (Worker SECRET, nooit in wrangler.jsonc). Zonder dat token geeft elke functie
 * hier een nette fout en blijft de rest van de module werken -- een
 * Calendly-koppeling is dan enkel niet aan te melden.
 *
 * Benodigde rechten op het token: `users:read` (nodig voor GET /users/me,
 * de allereerste aanroep die elke route hier doet -- zonder deze scope geeft
 * Calendly meteen "Insufficient scope", ook al staan de andere vier goed),
 * `webhooks:read`, `webhooks:write`, `event_types:read`, `scheduled_events:read`
 * (dat laatste is wat Calendly vereist om je op
 * invitee.created/invitee.canceled te mogen abonneren), en `organizations:read`
 * (nodig om de ledenlijst op te vragen -- zie listEventTypes() hieronder voor
 * waarom dat nodig is om gedeelde/team-eventtypes te kunnen tonen).
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
 * Alle leden van de organisatie (naam + e-mail + Calendly-user-URI).
 *
 * Bestaat enkel om listEventTypes() hieronder per lid te kunnen doorlopen --
 * de enige manier om gedeelde/team-eventtypes te vinden (zie daar). Vraagt
 * `organizations:read`; een token zonder org-adminrechten krijgt hier een
 * 403 en listEventTypes() vangt dat gewoon op (dan zie je enkel je eigen
 * eventtypes, zoals voorheen -- geen harde fout).
 */
export async function listOrganizationMemberships(env, { organization } = {}) {
  const org = organization || (await getCurrentUser(env)).organization;
  if (!org) throw createError('Geen Calendly-organisatie gevonden voor dit token.');

  const alles = [];
  let volgende = null;
  for (let i = 0; i < 10; i++) {
    const data = volgende
      ? await calendlyFetch(env, volgende)
      : await calendlyFetch(env, '/organization_memberships', { query: { organization: org, count: 100 } });

    for (const r of (data?.collection || [])) {
      alles.push({
        uri: r.user?.uri || '',
        name: r.user?.name || '',
        email: r.user?.email || '',
        role: r.role || '',
      });
    }

    volgende = data?.pagination?.next_page || null;
    if (!volgende) break;
  }

  return alles;
}

/**
 * Eén ophaalronde. `viaLid` is het organisatielid namens wie we vragen (null
 * bij de organisatie-brede ronde).
 *
 * HOE WE AAN DE HOSTS KOMEN. Calendly's API v2 heeft GEEN endpoint dat de
 * hosts van een round-robin- of collectief eventtype teruggeeft -- `profile`
 * noemt enkel de eigenaar, en dat is bij een team-eventtype het team, niet de
 * mensen. Wat we wél weten: `/event_types?user=<lid>` geeft de eventtypes die
 * DAT LID kan inplannen. Verschijnt een round robin onder Thomas, Jiri en
 * Kobe, dan zijn dat zijn hosts. De hostlijst hieronder is dus AFGELEID uit
 * wie het eventtype terugkreeg, en het scherm zegt dat er ook bij -- het is
 * geen veld dat Calendly ons geeft.
 */
async function verzamelEventTypes(env, query, opgehaald, viaLid = null) {
  let volgende = null;
  for (let i = 0; i < 10; i++) {
    const data = volgende
      ? await calendlyFetch(env, volgende)
      : await calendlyFetch(env, '/event_types', { query: { ...query, count: 100 } });

    for (const r of (data?.collection || [])) {
      const uri = r.uri || '';
      if (!uri) continue;

      // Al gezien in een eerdere ronde: enkel dit lid als host bijschrijven.
      // Vroeger stond hier een `continue`, waardoor de tweede vindplaats van
      // een gedeeld eventtype volledig wegviel -- en precies dat tweede lid is
      // wat je bij een round robin wil zien.
      if (opgehaald.has(uri)) {
        if (viaLid) voegHostToe(opgehaald.get(uri), viaLid);
        continue;
      }

      const rij = {
        uri,
        uuid: uri.split('/').pop() || '',
        name: r.name || '',
        slug: r.slug || '',
        active: r.active === true,
        duration: r.duration ?? null,
        kind: r.kind || '',
        pooling_type: r.pooling_type || null,
        scheduling_url: r.scheduling_url || '',
        color: r.color || '',
        locale: r.locale || '',
        secret: r.secret === true,
        owner_uri: r.profile?.owner || '',
        owner_name: r.profile?.name || '',
        owner_type: r.profile?.type || '',
        hosts: [],
      };
      if (viaLid) voegHostToe(rij, viaLid);
      opgehaald.set(uri, rij);
    }

    volgende = data?.pagination?.next_page || null;
    if (!volgende) break;
  }
}

function voegHostToe(rij, lid) {
  if (!rij || !lid || !lid.uri) return;
  if (rij.hosts.some((h) => h.uri === lid.uri)) return;
  rij.hosts.push({ uri: lid.uri, name: lid.name || '', email: lid.email || '' });
}

/**
 * Alle eventtypes van de organisatie, ook de niet-actieve, ook gedeeld/team.
 *
 * Niet-actieve horen erbij: een eventtype dat tijdelijk uitstaat heeft mogelijk
 * nog lopende boekingen, en je wil de koppeling kunnen instellen vóór je het
 * eventtype weer aanzet.
 *
 * GEDEELDE EVENTTYPES ZIJN EEN APARTE OPHAALRONDE, NIET EEN VLAG OP DEZE ÉÉN.
 * Calendly's eigen support bevestigt: een /event_types-aanroep met enkel
 * `organization` geeft NOOIT de "Shared event types" terug die je in de
 * Calendly-UI onder een lid ziet staan -- dat is een architecturale beperking
 * van hun API, geen instelling die je kan aanzetten. De enige weg is: elk lid
 * van de organisatie apart opvragen (`/event_types?user=<uri>`) en samenvoegen
 * op `uri`. Vandaar de ledenlijst hierboven en de dedup-`Map` hier.
 */
export async function listEventTypes(env, { organization, includeShared = true } = {}) {
  const org = organization || (await getCurrentUser(env)).organization;
  if (!org) throw createError('Geen Calendly-organisatie gevonden voor dit token.');

  const opgehaald = new Map();
  // Harde bovengrens: tien pagina's van honderd per aanroep. Zonder grens kan
  // een fout in Calendly's paginering hier een oneindige lus maken binnen één
  // worker-run.
  await verzamelEventTypes(env, { organization: org }, opgehaald);

  if (includeShared) {
    // Mislukt dit (token is geen org-admin, of `organizations:read` ontbreekt),
    // dan blijft gewoon staan wat de organisatie-brede aanroep hierboven al
    // opleverde -- geen harde fout, enkel minder volledig.
    try {
      const leden = await listOrganizationMemberships(env, { organization: org });
      for (const lid of leden) {
        if (!lid.uri) continue;
        try {
          await verzamelEventTypes(env, { user: lid.uri }, opgehaald, lid);
        } catch (err) {
          // één lid waarvoor het ophalen mislukt mag de rest niet blokkeren
        }
      }
    } catch (err) {
      // geen ledenlijst beschikbaar -- zie docblok hierboven
    }
  }

  const rijen = [...opgehaald.values()];
  for (const rij of rijen) {
    rij.hosts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return rijen;
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
