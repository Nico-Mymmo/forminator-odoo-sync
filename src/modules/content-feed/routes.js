/**
 * Content Feed — Beheerroutes
 *
 * Alleen JSON, behalve `GET /` (de pagina zelf) en de beeldroute. Odoo is de
 * enige database: er staat hier geen enkele Supabase-aanroep.
 */

import { LOG_PREFIX, CACHE_TTL, STATUSES, TIMELINE_COLORS } from './constants.js';
import { serveSnippetImage } from './lib/image.js';
import { fetchArticle, ArticleFetchError } from './lib/article-fetch.js';
import { analyseerArtikel } from './lib/article-ai.js';
import { serializeAiError, httpStatusForAiError } from '../mini-apps/lib/ai-errors.js';
import {
  listSnippets,
  getSnippet,
  listAudiences,
  listTaxonomy,
  listOwners,
  createSnippet,
  updateSnippet,
  setSnippetActive
} from './lib/content-service.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function fout(message, status = 400) {
  return json({ success: false, error: message }, status);
}

async function leesBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * De payload controleren vóór hij naar Odoo gaat.
 *
 * Bewust streng op de gesloten lijstjes (status, kleur): een typefout
 * belandt anders als onbekende waarde in Odoo en die leest dan overal terug
 * als de standaardwaarde, zonder dat iemand ziet dat er iets fout ging.
 */
function valideer(payload, { isNieuw }) {
  if (!payload || typeof payload !== 'object') return 'Geen geldige gegevens ontvangen';

  if (isNieuw && !String(payload.title || '').trim()) {
    return 'Een bericht heeft een titel nodig';
  }
  if (payload.status !== undefined && !STATUSES.includes(payload.status)) {
    return `Onbekende status: ${payload.status}`;
  }
  if (payload.color !== undefined && payload.color !== null
    && !TIMELINE_COLORS.includes(payload.color)) {
    return `Onbekende kleur: ${payload.color}`;
  }
  // De doelgroep wordt NIET tegen een lijst gecontroleerd: die lijst staat in
  // Odoo en Odoo weigert zelf een onbekende selection-waarde. Een tweede
  // controle hier zou betekenen dat een net in Studio toegevoegde doelgroep
  // eerst hier moet worden bijgewerkt voor ze bruikbaar is.
  if (payload.publishedOn !== undefined && payload.publishedOn
    && !/^\d{4}-\d{2}-\d{2}$/.test(payload.publishedOn)) {
    return 'De publicatiedatum moet de vorm JJJJ-MM-DD hebben';
  }
  // De beeld-URL komt uit onze eigen analyse, maar hij staat wel in een
  // payload die de browser samenstelt -- en de server haalt hem straks op.
  // Dus hier evengoed afkloppen, niet alleen in de analyse.
  if (payload.imageSourceUrl) {
    try {
      const u = new URL(String(payload.imageSourceUrl));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'De afbeeldingslink moet http of https zijn';
      }
    } catch {
      return 'De afbeeldingslink is geen geldige URL';
    }
  }
  // Publiceren zonder datum wordt geweigerd: de datum is de ENIGE
  // sorteersleutel van de tijdlijn (zie SORT_ORDER). Zonder datum landt een
  // bericht op een onvoorspelbare plek, en dat is precies wat er vandaag met
  // zes records aan de hand is.
  if (payload.status === 'published' && payload.publishedOn !== undefined
    && !payload.publishedOn) {
    return 'Een gepubliceerd bericht heeft een publicatiedatum nodig';
  }
  return null;
}

export const routes = {
  'GET /': async ({ env, request }) =>
    env.ASSETS.fetch(new Request(new URL('/content-feed.html', request.url))),

  'GET /api/items': async ({ env, request }) => {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    try {
      const { items } = await listSnippets(env, {
        statuses: statusParam ? statusParam.split(',').filter(Boolean) : null,
        search: url.searchParams.get('search') || null,
        typeId: Number(url.searchParams.get('type_id')) || null,
        tagId: Number(url.searchParams.get('tag_id')) || null,
        limit: Number(url.searchParams.get('limit')) || 100,
        offset: Number(url.searchParams.get('offset')) || 0,
        includeArchived: url.searchParams.get('include_archived') === '1',
        ttlSeconds: CACHE_TTL.ADMIN_LIST_SECONDS
      });
      return json({ success: true, items });
    } catch (error) {
      console.error(`${LOG_PREFIX} lijst ophalen mislukt:`, error?.message);
      return fout('Kon de berichten niet ophalen uit Odoo', 502);
    }
  },

  'GET /api/items/:id': async ({ env, params }) => {
    try {
      const item = await getSnippet(env, params.id, { bypassCache: true });
      if (!item) return fout('Niet gevonden', 404);
      return json({ success: true, item });
    } catch (error) {
      console.error(`${LOG_PREFIX} bericht ophalen mislukt:`, error?.message);
      return fout('Kon het bericht niet ophalen uit Odoo', 502);
    }
  },

  /**
   * De afbeelding, voor het BEHEERSCHERM. Staat los van de publieke
   * beeldroute: die vraagt een sitesleutel en toont enkel gepubliceerde
   * berichten, terwijl je hier ook het beeld van een concept moet zien.
   */
  'GET /api/items/:id/image': async ({ env, ctx, request, params }) => {
    try {
      // De versie komt uit ?v= (zelfde cachebuster als de publieke URL).
      // Zonder versie werkt het nog steeds -- dan deelt het gewoon één
      // cache-ingang, wat hoogstens betekent dat een vervangen beeld even
      // blijft hangen.
      const versie = new URL(request.url).searchParams.get('v') || '0';
      const res = await serveSnippetImage(env, ctx, params.id, versie);
      if (!res) return fout('Geen afbeelding', 404);
      return res;
    } catch (error) {
      console.error(`${LOG_PREFIX} beeld ophalen mislukt:`, error?.message);
      return fout('Kon de afbeelding niet ophalen', 502);
    }
  },

  'POST /api/items': async ({ env, request }) => {
    const payload = await leesBody(request);
    const melding = valideer(payload, { isNieuw: true });
    if (melding) return fout(melding, 422);
    try {
      const item = await createSnippet(env, payload);
      return json({ success: true, item }, 201);
    } catch (error) {
      console.error(`${LOG_PREFIX} aanmaken mislukt:`, error?.message);
      return fout('Kon het bericht niet aanmaken in Odoo', 502);
    }
  },

  'PUT /api/items/:id': async ({ env, request, params }) => {
    const payload = await leesBody(request);
    const melding = valideer(payload, { isNieuw: false });
    if (melding) return fout(melding, 422);
    try {
      const item = await updateSnippet(env, params.id, payload);
      if (!item) return fout('Niet gevonden', 404);
      return json({ success: true, item });
    } catch (error) {
      console.error(`${LOG_PREFIX} bijwerken mislukt:`, error?.message);
      return fout('Kon het bericht niet bijwerken in Odoo', 502);
    }
  },

  /** Verwijderen is ARCHIVEREN — zie setSnippetActive(). */
  'DELETE /api/items/:id': async ({ env, params }) => {
    try {
      const item = await setSnippetActive(env, params.id, false);
      return json({ success: true, item, archived: true });
    } catch (error) {
      console.error(`${LOG_PREFIX} archiveren mislukt:`, error?.message);
      return fout('Kon het bericht niet archiveren', 502);
    }
  },

  'POST /api/items/:id/restore': async ({ env, params }) => {
    try {
      const item = await setSnippetActive(env, params.id, true);
      return json({ success: true, item });
    } catch (error) {
      console.error(`${LOG_PREFIX} terughalen mislukt:`, error?.message);
      return fout('Kon het bericht niet terughalen', 502);
    }
  },

  /**
   * Een artikel ophalen en laten analyseren.
   *
   * Bewaart NIETS: dit geeft een VOORSTEL terug dat het bewerkscherm invult,
   * zodat een mens het nakijkt voor het op de site staat. De AI stelt voor,
   * de redacteur beslist -- automatisch publiceren zou betekenen dat een
   * verzonnen samenvatting rechtstreeks bij klanten belandt.
   */
  'POST /api/analyze': async ({ env, request, user }) => {
    const body = await leesBody(request);
    const url = body && typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return fout('Geef een link naar het artikel', 422);

    // De doelgroep stuurt de samenvatting en de keuze van het citaat, dus ze
    // moet een ECHTE waarde uit Odoo zijn. Een onbekende waarde negeren we
    // liever dan ze door te geven: dan krijgt de AI een verzonnen doelgroep
    // en schrijft ze met overtuiging voor niemand.
    const gevraagd = body && typeof body.audience === 'string' ? body.audience.trim() : '';
    const doelgroepen = await listAudiences(env);
    const doelgroep = doelgroepen.find((d) => d.value === gevraagd) || null;
    if (gevraagd && !doelgroep) {
      return fout(`Onbekende doelgroep: ${gevraagd}`, 422);
    }

    let artikel;
    try {
      artikel = await fetchArticle(url);
    } catch (error) {
      if (error instanceof ArticleFetchError) {
        console.warn(`${LOG_PREFIX} artikel ophalen mislukt (${error.code}):`, error.message);
        // 422: de link klopt niet of is niet leesbaar -- dat is iets wat de
        // gebruiker kan oplossen, geen storing aan onze kant.
        return json({ success: false, error: error.message, code: error.code }, 422);
      }
      console.error(`${LOG_PREFIX} artikel ophalen faalde onverwacht:`, error?.message);
      return fout('Het artikel kon niet opgehaald worden', 502);
    }

    try {
      const taxonomy = await listTaxonomy(env);
      const voorstel = await analyseerArtikel(env, user, artikel, taxonomy.tags, {
        audience: doelgroep ? doelgroep.value : null,
        audienceLabel: doelgroep ? doelgroep.label : null
      });
      return json({
        success: true,
        proposal: voorstel,
        article: {
          url: artikel.url,
          title: artikel.title,
          siteName: artikel.siteName,
          imageUrl: artikel.imageUrl,
          textChars: artikel.text.length
        }
      });
    } catch (error) {
      // Het foutcontract van lib/ai-errors.js reist ONGEWIJZIGD door naar de
      // browser (Regel 2 in CLAUDE.md): de UI leest `code`, niet de tekst.
      if (error?.code && String(error.code).startsWith('AI_')) {
        const serialized = serializeAiError(error);
        console.error(`${LOG_PREFIX} AI-analyse mislukt: ${serialized.code}`);
        return json({ success: false, ...serialized }, httpStatusForAiError(error));
      }
      console.error(`${LOG_PREFIX} analyse faalde onverwacht:`, error?.message);
      return fout('De analyse is mislukt', 502);
    }
  },

  'GET /api/taxonomy': async ({ env }) => {
    try {
      // De doelgroepen komen uit het Studio-veld zelf, niet uit een lijst in
      // deze code -- zo verschijnt wat een marketeer toevoegt vanzelf.
      const [taxonomy, audiences] = await Promise.all([
        listTaxonomy(env),
        listAudiences(env)
      ]);
      return json({ success: true, ...taxonomy, audiences });
    } catch (error) {
      console.error(`${LOG_PREFIX} taxonomie ophalen mislukt:`, error?.message);
      return fout('Kon types en labels niet ophalen', 502);
    }
  },

  'GET /api/owners': async ({ env }) => {
    try {
      const owners = await listOwners(env);
      return json({ success: true, owners });
    } catch (error) {
      console.error(`${LOG_PREFIX} gebruikers ophalen mislukt:`, error?.message);
      return fout('Kon de gebruikers niet ophalen', 502);
    }
  }
};
