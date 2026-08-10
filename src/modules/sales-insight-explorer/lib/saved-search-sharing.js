/**
 * Delen van een opgeslagen zoekopdracht met mini-apps
 *
 * Eén concept, één rij, één vlag: de gebruiker bewaart in de wizard een
 * zoekopdracht ("Mijn zoekopdrachten", tabel saved_searches) en vinkt in
 * DIEZELFDE actie eventueel aan dat mini-apps ze mogen gebruiken. Er bestaat
 * geen apart "mini-app-query"-object en geen apart beheerscherm om die vlag
 * te zetten.
 *
 * Technisch heeft een mini-app wel een gevalideerde query_definition nodig om
 * uit te voeren, en die zit niet in saved_searches (dat bewaart de wizard-
 * toestand, dus UI-state). Daarom houdt dit bestand één AFGELEIDE rij in
 * sales_insight_queries bij, waarnaar saved_searches.mini_app_query_id
 * verwijst. Belangrijke eigenschappen van die afgeleide rij:
 *
 * - Ze wordt uitsluitend hier aangemaakt, herschreven en verwijderd. Geen
 *   andere UI en geen andere route beheert haar.
 * - Ze wordt bij ELKE save van de zoekopdracht volledig herschreven vanuit de
 *   payload die de wizard net uitvoerde. Er kan dus geen versie-drift ontstaan
 *   tussen "wat de gebruiker ziet" en "wat de mini-app draait".
 * - Ze verdwijnt zodra de gebruiker het vinkje uitzet of de zoekopdracht
 *   verwijdert -- waarmee de mini-app-toegang automatisch mee verdwijnt.
 *
 * De {{param.NAAM}}-placeholders worden bij elke save opnieuw automatisch
 * gedetecteerd (autoDetectMiniAppParameters). Dat is bewust deterministisch en
 * niet handmatig bij te sturen: het vroegere tekstvak waarin een admin
 * "naam|label"-regels moest intikken is verdwenen samen met het aparte
 * beheerscherm.
 *
 * @module modules/sales-insight-explorer/lib/saved-search-sharing
 */

import { saveQuery, updateQuery, deleteQuery, getQueryById } from './query-repository.js';
import { validateCascadeQuery, isCascadeQuery, collectAliases } from './graph/cascade-models.js';
import { autoDetectMiniAppParameters } from './mini-app-bridge.js';

class SharingError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Zorg dat de afgeleide, met mini-apps gedeelde query in lijn is met de
 * opgeslagen zoekopdracht.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} input
 * @param {string|null} input.currentQueryId - Huidige saved_searches.mini_app_query_id
 * @param {boolean|undefined} input.share - true = delen, false = niet delen,
 *        undefined = laat de deelstatus zoals ze is (maar werk een reeds
 *        gedeelde query wel bij met de nieuwe definitie)
 * @param {Object} [input.query] - QueryDefinition zoals de wizard ze uitvoert
 * @param {string} input.name - Naam van de zoekopdracht (wordt de naam die een
 *        mini-app te zien krijgt)
 * @param {string} [input.description]
 * @returns {Promise<{mini_app_query_id: string|null, parameters: Array, changed: boolean}>}
 * @throws {SharingError} bij ontbrekende query, ontbrekend schema of validatiefouten
 */
export async function syncSharedQueryForSavedSearch(env, input) {
  const currentQueryId = input.currentQueryId || null;
  const share = input.share;
  const query = input.query;
  const name = (input.name || '').trim() || 'Zoekopdracht';
  const description = input.description === undefined ? null : input.description;

  // Niet (langer) delen -> afgeleide rij weg, toegang verdwijnt mee.
  if (share === false) {
    if (currentQueryId) {
      await deleteQuery(env, currentQueryId);
      console.log('[saved-search-sharing] afgeleide query verwijderd:', currentQueryId);
      return { mini_app_query_id: null, parameters: [], changed: true };
    }
    return { mini_app_query_id: null, parameters: [], changed: false };
  }

  // Deelstatus onaangeroerd laten en niets gedeeld -> niets te doen.
  if (share !== true && !currentQueryId) {
    return { mini_app_query_id: null, parameters: [], changed: false };
  }

  // Vanaf hier moet er een gedeelde rij bestaan of komen.
  if (!isCascadeQuery(query)) {
    if (share !== true && currentQueryId) {
      // Enkel een naamwijziging o.i.d. zonder query -> naam meenemen, definitie laten staan.
      await updateQuery(env, currentQueryId, { name, description });
      return { mini_app_query_id: currentQueryId, parameters: [], changed: true };
    }
    throw new SharingError(
      'Delen met mini-apps vereist de volledige zoekopdracht in cascade-vorm (query ontbreekt of is verouderd).',
      'MISSING_QUERY'
    );
  }

  // De GRAAF is de autoriteit over wat uitvoerbaar is, niet een schema-snapshot:
  // validateCascadeQuery() controleert het vertrekpunt, elke edge, de richting
  // van elke stap en de aliassen tegen dezelfde declaraties die de executor
  // gebruikt. Daardoor is er geen schema-introspectie meer nodig bij het delen
  // (en dus ook geen "ververs eerst het schema"-doodlopertje): een nieuw
  // Studio-model verschijnt hier automatisch zodra het een node in de graaf is.
  const validation = validateCascadeQuery(query);
  if (!validation.is_valid) {
    throw new SharingError('Zoekopdracht is niet geldig als gedeelde query.', 'VALIDATION_FAILED', {
      validation_errors: validation.errors
    });
  }

  // Complexiteit = diepte + breedte van de cascade. Puur een hint voor de
  // AI-begeleiding in mini-apps, geen poort.
  //
  // De waarden zijn NIET vrij te kiezen: de kolom sales_insight_queries
  // .complexity_hint heeft een check-constraint op precies deze drie
  // ('simple' | 'moderate' | 'complex'), dezelfde die de vroegere
  // assessQueryComplexity() als guidance_level teruggaf.
  const aliases = collectAliases(query);
  const maxDepth = aliases.reduce((m, a) => Math.max(m, a.depth), 0);
  const complexityHint = maxDepth >= 3 || aliases.length > 4
    ? 'complex'
    : (maxDepth >= 1 ? 'moderate' : 'simple');

  // Placeholders opnieuw detecteren op de verse payload -- deterministisch,
  // dus dezelfde zoekopdracht levert altijd dezelfde parameters op.
  const detected = autoDetectMiniAppParameters(query);

  const payload = {
    name,
    description,
    query_definition: detected.query_definition,
    complexity_hint: complexityHint,
    is_shared_mini_apps: true,
    mini_app_parameters: detected.parameters
  };

  if (currentQueryId) {
    const existing = await getQueryById(env, currentQueryId);
    if (existing) {
      await updateQuery(env, currentQueryId, payload);
      console.log('[saved-search-sharing] afgeleide query bijgewerkt:', currentQueryId);
      return { mini_app_query_id: currentQueryId, parameters: detected.parameters, changed: true };
    }
    // Rij is elders verdwenen (bv. admin-DELETE op een oude losse query):
    // opnieuw aanmaken in plaats van falen.
    console.warn('[saved-search-sharing] gekoppelde query bestaat niet meer, opnieuw aanmaken:', currentQueryId);
  }

  const created = await saveQuery(env, {
    name,
    description,
    query_definition: detected.query_definition,
    source: 'user',
    complexity_hint: complexityHint
  });
  await updateQuery(env, created.id, {
    is_shared_mini_apps: true,
    mini_app_parameters: detected.parameters
  });
  console.log('[saved-search-sharing] afgeleide query aangemaakt:', created.id);

  return { mini_app_query_id: created.id, parameters: detected.parameters, changed: true };
}

/**
 * Ruim de afgeleide rij op wanneer een zoekopdracht verwijderd wordt.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {string|null} queryId
 * @returns {Promise<void>}
 */
export async function removeSharedQueryForSavedSearch(env, queryId) {
  if (!queryId) return;
  try {
    await deleteQuery(env, queryId);
    console.log('[saved-search-sharing] afgeleide query verwijderd bij verwijderen zoekopdracht:', queryId);
  } catch (err) {
    // De zoekopdracht zelf moet altijd verwijderd kunnen worden; een
    // mislukte opruiming mag dat niet blokkeren (de FK staat op
    // ON DELETE SET NULL, dus er blijft geen kapotte verwijzing achter).
    console.error('[saved-search-sharing] opruimen mislukt:', err.message);
  }
}

export { SharingError };
