/**
 * AV-slides -- routes. Alleen JSON, behalve `GET /`.
 */

import { GoogleAuthError, getServiceAccountClientId } from '../../lib/google-auth.js';
import { bouwSlides, DEFAULT_ICON, DEFAULT_DECOR } from './lib/layout.js';
import { verzamelBronnen, nieuweInhoud, vernieuwInhoud, TEKENING_EIGEN } from './lib/sources.js';
import { verzamelInzichten } from './lib/insights.js';
import { lijstTekeningen, tekeningZoeker, pngSleutel, vergeetTekeningen } from './lib/thingies.js';
import { zetInPresentatie, SlidesError, SLIDES_SCOPE } from './lib/slides-api.js';
import {
  EditionError, geldigeMaand, geldigeDatum, normaliseerInhoud,
  lijstEdities, haalEditie, bewaarEditie, markeerIngevoegd,
} from './lib/editions.js';

const MAX_BEELD = 10 * 1024 * 1024;
const MAX_TEKENING = 2 * 1024 * 1024;
const BEELD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
// Een prikbord van ongeveer vijf weken: tot net na de volgende AV.
const VENSTER_DAGEN = 34;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  if (err instanceof GoogleAuthError) {
    return json({ success: false, error: err.message, code: err.code }, err.code === 'SCOPE_NOT_AUTHORIZED' ? 503 : 400);
  }
  const status = err instanceof EditionError || err instanceof SlidesError ? err.status : 500;
  if (status >= 500) console.error('[av-slides]', err);
  return json({ success: false, error: err.message || 'Onbekende fout', code: err.code || null }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return null; }
}

function vandaag() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function plusDagen(iso, dagen) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dagen * 86400000).toISOString().slice(0, 10);
}

/** De standaarddatums voor een maand zonder opgeslagen versie. */
function standaard(maand) {
  const nu = vandaag();
  const av = nu.slice(0, 7) === maand ? nu : `${maand}-01`;
  return { av_date: av, from: av, until: plusDagen(av, VENSTER_DAGEN) };
}

/** De URL van het beeld zoals Google en de browser hem ophalen (publieke R2-route). */
function beeldUrl(content, origin) {
  const key = content && content.wist && content.wist.image && content.wist.image.key;
  return key ? `${origin}/assets/${key}` : null;
}

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/av-slides.html', context.request.url))),

  'GET /api/editions': async ({ env }) => {
    try {
      return json({ success: true, data: await lijstEdities(env) });
    } catch (err) { return fout(err); }
  },

  'GET /api/editions/:month': async ({ env, params }) => {
    try {
      if (!geldigeMaand(params.month)) throw new EditionError('Ongeldige maand.');
      const editie = await haalEditie(env, params.month);
      return json({ success: true, data: editie, defaults: standaard(params.month) });
    } catch (err) { return fout(err); }
  },

  /**
   * Gegevens (opnieuw) ophalen. Wat iemand al aanpaste, blijft staan; zie
   * vernieuwInhoud() in sources.js.
   */
  'POST /api/editions/:month/generate': async ({ env, user, params, request }) => {
    try {
      const maand = params.month;
      if (!geldigeMaand(maand)) throw new EditionError('Ongeldige maand.');
      const body = (await leesBody(request)) || {};
      const std = standaard(maand);
      const av = geldigeDatum(body.av_date) ? body.av_date : std.av_date;
      const van = geldigeDatum(body.from) ? body.from : av;
      const tot = geldigeDatum(body.until) ? body.until : plusDagen(van, VENSTER_DAGEN);
      if (tot < van) throw new EditionError('De einddatum van het prikbord ligt voor de begindatum.');
      if (plusDagen(van, 92) < tot) throw new EditionError('Het prikbord kan hoogstens drie maanden beslaan.');

      const [bronnen, weetjes, bestaand] = await Promise.all([
        verzamelBronnen(env, van, tot),
        verzamelInzichten(env, maand),
        haalEditie(env, maand),
      ]);
      const vers = nieuweInhoud({ van, tot, bronnen, inzichten: weetjes.insights });
      const inhoud = vernieuwInhoud(bestaand && bestaand.content, vers);
      const editie = await bewaarEditie(env, user, maand, { av_date: av, content: inhoud });
      return json({ success: true, data: editie, meldingen: [...bronnen.meldingen, ...weetjes.meldingen] });
    } catch (err) { return fout(err); }
  },

  'PUT /api/editions/:month': async ({ env, user, params, request }) => {
    try {
      const body = await leesBody(request);
      if (!body || typeof body.content !== 'object') throw new EditionError('Geen inhoud meegestuurd.');
      const editie = await bewaarEditie(env, user, params.month, { av_date: body.av_date, content: body.content });
      return json({ success: true, data: editie });
    } catch (err) { return fout(err); }
  },

  /** Het voorbeeld: exact de vormen die ook naar Google Slides gaan. */
  'POST /api/layout': async ({ env, request }) => {
    try {
      const body = await leesBody(request);
      const inhoud = normaliseerInhoud(body && body.content);
      const origin = new URL(request.url).origin;
      const lijst = await lijstTekeningen(env).catch(() => []);
      return json({
        success: true,
        data: bouwSlides(inhoud, { imageUrl: beeldUrl(inhoud, origin), tekening: tekeningZoeker(lijst, origin) }),
      });
    } catch (err) { return fout(err); }
  },

  /**
   * Een beeld voor links op Wist-je-weetje. In R2 onder `av-slides/`, met een
   * UUID als naam: Google haalt het op via de publieke /assets/-route, dus het
   * moet zonder aanmelding te lezen zijn, maar niet te raden.
   */
  'POST /api/images': async ({ env, request }) => {
    try {
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ext = BEELD_TYPES[type];
      if (!ext) throw new EditionError('Enkel PNG, JPEG of GIF: Google Slides aanvaardt geen andere beeldformaten.');
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) throw new EditionError('Leeg bestand.');
      if (bytes.byteLength > MAX_BEELD) throw new EditionError('Het beeld is groter dan 10 MB.');
      const key = `av-slides/${crypto.randomUUID()}.${ext}`;
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ success: true, data: { key, url: `/assets/${key}` } });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:month/insert': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const editie = await haalEditie(env, params.month);
      if (!editie) throw new EditionError('Er is voor deze maand nog niets klaargezet.', 404);
      const inhoud = normaliseerInhoud(editie.content);
      const origin = new URL(request.url).origin;

      // Google Slides kent geen SVG. Welke tekeningen vraagt de opmaak, en heeft
      // elk daarvan al een PNG-kopie? Zo niet: 409 met de namen, en het scherm
      // maakt ze (canvas) en probeert opnieuw. Een naam die niet (meer) in de
      // Asset Manager staat, telt niet mee: die kaart toont dan haar emoji.
      const lijst = await lijstTekeningen(env, { vers: true });
      const perNaam = new Map(lijst.map((t) => [t.name, t]));
      const gevraagd = new Set();
      bouwSlides(inhoud, { tekening: (naam) => { if (naam) gevraagd.add(naam); return null; } });
      const ontbreekt = [...gevraagd].filter((n) => perNaam.has(n) && !perNaam.get(n).pngKey);
      if (ontbreekt.length) {
        return json({ success: false, code: 'DRAWINGS_MISSING', missing: ontbreekt, error: 'Er ontbreken nog PNG-kopieen van tekeningen.' }, 409);
      }

      const tekening = tekeningZoeker(lijst, origin, { enkelPng: true });
      const uitkomst = await zetInPresentatie(env, {
        email: user.email,
        invoer: body.presentation_url,
        bouw: (scale) => bouwSlides(inhoud, { scale, imageUrl: beeldUrl(inhoud, origin), tekening }),
      });
      await markeerIngevoegd(env, user, params.month, `https://docs.google.com/presentation/d/${uitkomst.presentationId}/edit`);
      return json({ success: true, data: uitkomst });
    } catch (err) { return fout(err); }
  },

  /** De tekeningetjes uit de Asset Manager (brand/thingies), voor de keuzelijsten. */
  'GET /api/thingies': async ({ env }) => {
    try {
      const lijst = await lijstTekeningen(env);
      return json({
        success: true,
        data: lijst.map((t) => ({
          name: t.name,
          label: t.label,
          svg: `/assets/${t.svgKey}`,
          png: t.pngKey ? `/assets/${t.pngKey}` : null,
        })),
        // De standaardkeuzes, zodat het scherm ze niet zelf hoeft te kennen.
        defaults: { icon: DEFAULT_ICON, decor: DEFAULT_DECOR, custom: TEKENING_EIGEN },
      });
    } catch (err) { return fout(err); }
  },

  /** De PNG-kopie van een tekening, gemaakt door de browser (zie thingies.js). */
  'PUT /api/thingies/:name': async ({ env, params, request }) => {
    try {
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (type !== 'image/png') throw new EditionError('Enkel een PNG.');
      const lijst = await lijstTekeningen(env, { vers: true });
      const t = lijst.find((x) => x.name === params.name);
      if (!t) throw new EditionError('Die tekening bestaat niet in de Asset Manager.', 404);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_TEKENING) throw new EditionError('De PNG is leeg of groter dan 2 MB.');
      const key = pngSleutel(t.name, t.tag);
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
      vergeetTekeningen();
      return json({ success: true, data: { png: `/assets/${key}` } });
    } catch (err) { return fout(err); }
  },

  /** Wat er in Google ingesteld moet zijn, voor de uitleg in het scherm. */
  'GET /api/setup': async ({ env }) => json({
    success: true,
    data: { client_id: getServiceAccountClientId(env), scope: SLIDES_SCOPE },
  }),
};
