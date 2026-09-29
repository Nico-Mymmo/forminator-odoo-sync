/**
 * Welk event er in de e-mailhandtekeningen staat.
 *
 * TOT NU koos marketing dat met de hand in de signature designer: een
 * event-id in de marketingconfig, en bij het opslaan werd er naar iedereen
 * gepusht. Het gevolg was dat een handtekening een event bleef tonen dat al
 * geweest was, tot iemand eraan dacht om het te wisselen.
 *
 * NU is het AFGELEID. Een medewerker vinkt in het eventbeheer aan welke
 * events in de handtekening mogen (`x_studio_in_signature`, er mogen er
 * meerdere aanstaan), en deze module kiest daaruit telkens het EERSTVOLGENDE
 * dat nog AAN DE BEURT is. Is dat een ander dan wat er nu in de config staat,
 * dan schuift ze door: config bijwerken en dezelfde push starten die de
 * handmatige weg ook gebruikte.
 *
 * "Aan de beurt" is niet hetzelfde als "moet nog komen": per event staat er
 * in Eventbeheer hoeveel dagen VOOR de start het eruit moet
 * (`x_studio_signature_until_days`, leeg = tot de start zelf). Dat bestaat
 * voor een event waarvoor inschrijven eerder sluit dan het begint -- anders
 * blijven honderden mails naar een gesloten pagina verwijzen. Die grens is
 * per event anders, dus ze kan niet in het Odoo-domein: we halen de
 * kandidaten op volgorde op en nemen de eerste die zijn grens nog niet
 * gepasseerd is.
 *
 * ELKE wissel gaat naar het chatkanaal (SIGNATURE_EVENT_WARNING_CHANNEL),
 * niet alleen het geval "er staat niets meer klaar". Een handtekening is iets
 * wat namens iedereen vertrekt; dat die stilzwijgend van inhoud verandert, is
 * precies wat marketing niet pas achteraf uit een verstuurde mail hoort af te
 * leiden.
 *
 * WAT HIER BEWUST NIET GEBEURT: een eigen push schrijven, of een eigen manier
 * om de handtekening samen te stellen. `triggerPushAllBackground()` doet dat
 * al, inclusief de uitsluitingen en de per-gebruiker-opt-out via
 * `hidden_event_id`. Een tweede pad zou betekenen dat een handtekening die
 * langs deze weg vertrekt, anders is dan een die marketing zelf pusht.
 */

import { listEvents } from '../../event-operations-v2/lib/events-service.js';
import { PUBLICATION_STATE, PUBLIC_EVENT_PATH } from '../../event-operations-v2/constants.js';
import { resolvePublicOrigin } from '../../event-operations-v2/lib/mail-service.js';
import { sendSystemChannelMessage } from '../../mini-apps/lib/chat.js';
import { getMarketingSettings, upsertMarketingSettings } from './signature-store.js';
import { triggerPushAllBackground } from '../routes.js';

const LOG_PREFIX = '[mail-signature-designer:rotatie]';

/*
 * Wat VROEGER instelbaar was in de signature designer en nu vastligt.
 *
 * Het opschrift is geen eventgegeven: het hoort
 * bij de VORM van het blok, en die is voor elk event gelijk. Het per event
 * laten instellen betekende dat een handtekening er anders uitzag naargelang
 * wie het event had aangemaakt.
 */
const EYEBROW = 'Schrijf je in';

/**
 * De datum zoals ze in de handtekening komt te staan:
 * "22 oktober 2026 om 19.00u".
 *
 * Voluit, en in EUROPE/BRUSSELS. Odoo bewaart datums in UTC -- dat event staat
 * er als 17:00, maar het begint hier om 19:00. De ruwe waarde tonen (of niet
 * omrekenen) laat elke lezer twee uur te vroeg komen, en dat is niet iets wat
 * iemand meldt: het ziet eruit als een gewone datum.
 *
 * Met formatToParts in plaats van een opmaakstring, omdat de scheidingstekens
 * per locale verschillen: we willen exact "om 19.00u", niet wat nl-BE er
 * toevallig van maakt.
 */
function handtekeningDatum(iso) {
  if (!iso) return '';
  try {
    const delen = {};
    const opmaak = new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels',
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    for (const deel of opmaak.formatToParts(new Date(iso))) {
      delen[deel.type] = deel.value;
    }
    if (!delen.day || !delen.month) return '';
    return `${delen.day} ${delen.month} ${delen.year} om ${delen.hour}.${delen.minute}u`;
  } catch (error) {
    return '';
  }
}

/**
 * Het complete eventblok voor de handtekening, AFGELEID uit het event.
 *
 * De marketingconfig is hiermee geen invoer meer maar een kopie: de rotatie is
 * de enige schrijver. Dat is bewust -- de merge-engine en de compiler lezen
 * nog steeds precies dezelfde sleutels, dus er verandert niets aan hoe een
 * handtekening gebouwd wordt. Alleen bepaalt niemand ze nog met de hand.
 */
function eventBlok(env, event) {
  if (!event) {
    return {
      eventPromoEnabled: false,
      eventId: null,
      eventTitle: null,
      eventDate: null,
      eventImageUrl: '',
      eventImageMaxHeight: null,
      eventEyebrow: EYEBROW,
      eventRegUrl: ''
    };
  }

  // De site volgt het MERK van het event: een syndicoach-event mag geen
  // openvme-link in de handtekening krijgen.
  const origin = resolvePublicOrigin(env, event.brand || null);
  const slug = String(event.slug || '').trim();

  return {
    eventPromoEnabled: true,
    eventId: event.id,
    eventTitle: event.title,
    eventDate: handtekeningDatum(event.starts_at),
    // BEWUST GEEN BEELD in de handtekening, ook als het event een hero-beeld
    // heeft: titel, datum en knop volstaan. De sleutels blijven leeg staan
    // (niet weg), want de compiler en de merge-engine lezen ze nog.
    eventImageUrl: '',
    eventImageMaxHeight: null,
    eventEyebrow: EYEBROW,
    // `owid` hangt de klik aan het event vast in de webstatistieken; die
    // vorm stond al in de handmatig ingevulde links.
    eventRegUrl: slug ? `${origin}${PUBLIC_EVENT_PATH}/${slug}/?owid=${event.id}` : ''
  };
}

/*
 * Hoeveel kandidaten we ophalen om er EEN uit te kiezen.
 *
 * Meer dan een, want de grens per event kan niet mee in het Odoo-domein: het
 * eerstvolgende event kan zijn eigen grens al gepasseerd zijn, en dan is het
 * tweede aan de beurt. Vijfentwintig is ruim -- zoveel events staan er nooit
 * tegelijk aangevinkt -- en het kost niets: het is dezelfde ene Odoo-ronde.
 */
const KANDIDATEN_LIMIET = 25;

/**
 * Tot wanneer dit event in de handtekening mag staan, als tijdstempel.
 *
 * Standaard de start zelf; `signature_until_days` schuift dat naar voren.
 * Geen leesbare startdatum -> null, en dat betekent voor de aanroeper "laat
 * door": een event tegenhouden op grond van een datum die we niet konden
 * lezen, is een handtekening zonder event om een reden die niemand ziet.
 */
function signatureCutoff(event) {
  if (!event || !event.starts_at) return null;
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return null;
  const dagen = Math.max(0, Number(event.signature_until_days) || 0);
  return start - (dagen * 86400000);
}

/** Diezelfde grens, leesbaar, voor in een chatbericht. */
function grensTekst(event) {
  const tot = signatureCutoff(event);
  if (tot === null) return 'onbekend';
  const dagen = Math.max(0, Number(event?.signature_until_days) || 0);
  const wanneer = moment(new Date(tot).toISOString());
  if (dagen <= 0) return `${wanneer} (de start van het event)`;
  return `${wanneer} (${dagen} ${dagen === 1 ? 'dag' : 'dagen'} voor de start)`;
}

/**
 * Het eerstvolgende event dat in de handtekening hoort.
 *
 * Alleen GEPUBLICEERD: een concept of geannuleerd event in ieders
 * handtekening is een lek. En alleen wat nog moet komen (`from: nu`) --
 * daarmee valt het afgelopen event er vanzelf uit, zonder aparte "is het al
 * geweest"-controle die apart fout kan gaan.
 *
 * Dat domein levert een SUPERSET: elke grens ligt op of voor de start, dus
 * wat Odoo teruggeeft bevat ook events waarvan de grens al gepasseerd is. Die
 * worden hier overgeslagen, op volgorde van startdatum.
 *
 * @returns {Promise<Object|null>}
 */
export async function resolveSignatureEvent(env) {
  const nu = Date.now();
  const { events } = await listEvents(env, {
    filters: {
      publication_states: [PUBLICATION_STATE.PUBLISHED],
      signature: true,
      from: new Date(nu).toISOString()
    },
    limit: KANDIDATEN_LIMIET,
    offset: 0,
    order: 'x_studio_event_datetime asc',
    // Niet uit de cache: deze functie beslist wat er naar honderden
    // handtekeningen gaat, en dan is een antwoord van een kwartier oud net
    // het verschil tussen wel en niet doorschuiven.
    bypassCache: true
  });

  for (const event of (events || [])) {
    const tot = signatureCutoff(event);
    if (tot === null || tot > nu) return event;
  }

  return null;
}

/**
 * De handtekeningen gelijkzetten met het eerstvolgende aangevinkte event.
 *
 * Doet niets als er niets verandert -- dat is het normale geval, want deze
 * functie draait elk kwartier. Alleen bij een ECHTE wissel wordt er geschreven
 * en gepusht.
 *
 * @param {Object} env
 * @param {{ ctx?: Object, actorEmail?: string }} [opties]
 */
export async function syncSignatureEvent(env, { ctx = null, actorEmail = 'rotatie-automatisch' } = {}) {
  const volgende = await resolveSignatureEvent(env);
  const bestaand = await getMarketingSettings(env);
  const config = { ...(bestaand?.config || {}) };

  const huidigId = config.eventId ? String(config.eventId) : '';
  const nieuwId = volgende ? String(volgende.id) : '';
  const nieuwBlok = eventBlok(env, volgende);

  /*
   * Vergelijken op het HELE blok, niet enkel op het event-id.
   *
   * Anders blijft een verkeerde waarde eeuwig staan zodra het event niet meer
   * wisselt: een hernoemd event, een nieuw hero-beeld, of -- zoals gebeurd --
   * een datum die door een oudere versie als ruwe ISO-tekst was weggeschreven.
   * De config is een AFGELEIDE kopie, dus elke afwijking hoort weggewerkt te
   * worden, niet alleen een ander id.
   */
  const verschilt = Object.keys(nieuwBlok).some(
    (sleutel) => String(config[sleutel] ?? '') !== String(nieuwBlok[sleutel] ?? '')
  );
  if (!verschilt) {
    return { changed: false, eventId: nieuwId || null };
  }

  Object.assign(config, nieuwBlok);

  await upsertMarketingSettings(env, config, null);

  /*
   * De voorkeur van de GEBRUIKER wordt hier NIET aangeraakt.
   *
   * Vroeger werd bij elke wissel `hidden_event_id` gewist, waardoor het blok
   * vanzelf terugkwam bij iedereen die het had weggeklikt. Dat is een
   * wijziging aan de handtekening van iemand anders: wie het vinkje uitzet,
   * zegt "ik wil hier geen events" en niet "ik wil dit ene event niet".
   * Marketing bepaalt WELK event klaarstaat; de eigenaar bepaalt OF het
   * getoond wordt. Zie `show_event_promo` op user_signature_settings.
   */

  /*
   * Ook pushen als er GEEN opvolger is. Dan moet het oude event juist uit
   * iedereens handtekening verdwijnen -- niet pushen zou betekenen dat een
   * afgelopen event er blijft staan, en dat is precies wat deze hele module
   * moet oplossen.
   */
  const push = triggerPushAllBackground({ env, actorEmail });
  if (ctx?.waitUntil) ctx.waitUntil(push); else await push;

  await meldWissel(env, {
    anderEvent: huidigId !== nieuwId,
    vorigeTitel: bestaand?.config?.eventTitle || null,
    volgende
  });

  console.log(
    `${LOG_PREFIX} gewisseld: ${huidigId || 'geen'} -> ${nieuwId || 'geen'}`
    + (volgende ? ` (${volgende.title})` : '')
  );

  return { changed: true, eventId: volgende ? volgende.id : null, title: volgende ? volgende.title : null };
}

/**
 * Een leesbaar tijdstip voor in een chatbericht.
 *
 * Expliciet Europe/Brussels: `starts_at` is UTC, en een event van 19:00 dat in
 * de chat als 17:00 verschijnt laat iemand denken dat er iets misstaat met het
 * event in plaats van met de weergave.
 */
function moment(iso) {
  if (!iso) return 'datum onbekend';
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels',
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch (error) {
    return String(iso);
  }
}

/**
 * Een TESTBERICHT naar het waarschuwingskanaal.
 *
 * Bestaat om twee dingen te kunnen nakijken zonder te wachten tot een event
 * passeert: komt er uberhaupt iets aan in dat kanaal, en klopt wat de rotatie
 * zou doen met wat er nu in de handtekeningen staat.
 *
 * Het WIJZIGT niets -- geen config, geen push, geen opt-outs. Een testknop die
 * onderweg iets verzet, is geen testknop.
 */
export async function stuurTestBericht(env, { actorEmail = null } = {}) {
  const kanaal = String(env?.SIGNATURE_EVENT_WARNING_CHANNEL || '').trim();
  if (!kanaal) {
    throw new Error(
      'SIGNATURE_EVENT_WARNING_CHANNEL staat niet ingesteld, dus er is geen kanaal'
      + ' om naartoe te sturen. Zet het secret op de naam van een kanaal uit'
      + ' Mini-apps -> Chat-kanalen.'
    );
  }

  const bestaand = await getMarketingSettings(env);
  const config = bestaand?.config || {};
  const actiefId = (config.eventPromoEnabled && config.eventId) ? String(config.eventId) : '';
  const volgende = await resolveSignatureEvent(env);
  const volgendId = volgende ? String(volgende.id) : '';

  const regels = ['*Testbericht van de e-mailhandtekeningen.*', ''];

  if (actiefId) {
    regels.push(`In de handtekeningen staat nu: *${config.eventTitle || 'onbekend'}*`);
    regels.push(`Wanneer: ${config.eventDate || 'datum onbekend'}`);
    // De grens staat niet in de config (die is een kopie van het BLOK, en het
    // blok bevat ze niet) -- dus alleen tonen als het actieve event ook het
    // event is dat we net opgezocht hebben.
    if (volgende && volgendId === actiefId) {
      regels.push(`Blijft staan tot: ${grensTekst(volgende)}`);
    }
  } else {
    regels.push('Er staat op dit moment *geen* event in de handtekeningen.');
  }
  regels.push('');

  if (!volgende) {
    regels.push(
      'Er staat ook niets klaar: geen enkel aankomend event heeft'
      + ' "Toon in de e-mailhandtekeningen" aan staan in Eventbeheer.'
    );
  } else if (volgendId === actiefId) {
    regels.push('Dat is ook wat er hoort te staan -- de rotatie is bij.');
  } else {
    regels.push(`De rotatie schuift straks door naar: *${volgende.title}*`);
    regels.push(`Wanneer: ${handtekeningDatum(volgende.starts_at) || 'datum onbekend'}`);
    regels.push(`Blijft dan staan tot: ${grensTekst(volgende)}`);
    regels.push('Dat gebeurt vanzelf, binnen het kwartier.');
  }

  if (actorEmail) {
    regels.push('');
    regels.push(`Getest door ${actorEmail}.`);
  }

  const { channelName } = await sendSystemChannelMessage(
    env, kanaal, regels.join('\n'), { bron: 'handtekeningen, testknop' }
  );

  return {
    channelName,
    activeEventId: actiefId || null,
    nextEventId: volgendId || null,
    inSync: volgendId === actiefId
  };
}

/**
 * Melden dat de handtekeningen net veranderd zijn.
 *
 * Draait bij ELKE wissel, niet alleen wanneer er niets meer klaarstaat. Wat
 * hier vertrekt is al gebeurd -- de config is bijgewerkt en de push loopt --
 * dus dit is een mededeling, geen vraag.
 *
 * Er zijn drie gevallen, en ze lezen bewust verschillend:
 *
 *   1. ANDER EVENT -- de gewone doorschuif. Met de grens erbij, want dat is
 *      het enige wat je niet uit Eventbeheer kan aflezen zonder te rekenen.
 *   2. ZELFDE EVENT, andere gegevens -- iemand hernoemde het event, verzette
 *      de datum of wisselde het beeld. Dat als doorschuif melden zou
 *      betekenen dat niemand nog gelooft wat er staat.
 *   3. GEEN OPVOLGER -- het enige geval waarin iemand IETS moet doen. Stil
 *      niets tonen is hier de slechtste uitkomst: een handtekening zonder
 *      eventblok ziet er gewoon normaal uit, dus niemand merkt het.
 */
async function meldWissel(env, { anderEvent = true, vorigeTitel = null, volgende = null } = {}) {
  const kanaal = String(env?.SIGNATURE_EVENT_WARNING_CHANNEL || '').trim();
  if (!kanaal) {
    console.warn(
      `${LOG_PREFIX} handtekeningen gewisseld, maar SIGNATURE_EVENT_WARNING_CHANNEL`
      + ' staat niet ingesteld -- er is dus niemand op de hoogte gebracht.'
    );
    return;
  }

  let regels;

  if (!volgende) {
    regels = [
      'Er staat geen event meer in de e-mailhandtekeningen.',
      vorigeTitel
        ? `Het laatste was "${vorigeTitel}" en dat is niet meer aan de beurt.`
        : 'Het vorige event is niet meer aan de beurt.',
      '',
      'Vink in Eventbeheer bij een volgend event "Toon in de e-mailhandtekeningen" aan;'
      + ' het wordt dan vanzelf naar iedereen gepusht.'
    ];
  } else if (anderEvent) {
    regels = [
      `De e-mailhandtekeningen tonen nu: *${volgende.title}*`,
      `Wanneer: ${handtekeningDatum(volgende.starts_at) || 'datum onbekend'}`,
      `Blijft staan tot: ${grensTekst(volgende)}`
    ];
    if (vorigeTitel) regels.push(`Daarvoor stond er "${vorigeTitel}".`);
    regels.push('', 'Dit staat vanaf nu in ieders handtekening.');
  } else {
    regels = [
      `De handtekeningen zijn bijgewerkt voor: *${volgende.title}*`,
      `Wanneer: ${handtekeningDatum(volgende.starts_at) || 'datum onbekend'}`,
      `Blijft staan tot: ${grensTekst(volgende)}`,
      '',
      'Er is niet doorgeschoven naar een ander event -- de titel, datum, het beeld'
      + ' of de inschrijflink van dit event is in Eventbeheer gewijzigd, en dat is'
      + ' meteen in ieders handtekening gezet.'
    ];
  }

  try {
    await sendSystemChannelMessage(env, kanaal, regels.join('\n'), { bron: 'handtekeningen' });
  } catch (error) {
    // Een mislukte melding mag de rotatie niet terugdraaien: de handtekeningen
    // zijn op dat moment al correct bijgewerkt.
    console.error(`${LOG_PREFIX} melding naar de chat mislukt:`, error?.message);
  }
}
