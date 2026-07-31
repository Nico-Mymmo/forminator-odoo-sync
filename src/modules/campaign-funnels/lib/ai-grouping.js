/**
 * Ad & Sales Campaigns — AI-groepering van onderzoek-inbox
 *
 * Hergebruikt de generieke Claude-aanroep uit mini-apps (zelfde abonnement,
 * geen train-on-data-laag zoals bij de dichtgezette Gemini/Drive-combinatie —
 * zie CLAUDE.md). Dit is een puur voorstel: niets wordt hier gepersisteerd,
 * de gebruiker keurt goed/bewerkt in de UI, pas daarna (confirm-groups in
 * routes.js) worden er echt Inzichten (campaign_swimlanes) van gemaakt.
 */
import { generate } from '../../mini-apps/lib/ai-providers/anthropic.js';

const SYSTEM_PROMPT = `Je helpt een marketing/salesteam ruwe onderzoeksnotities over klanten
(citaten, observaties, eigen ideeën, actiebladen) groeperen tot onderliggende inzichten.

Belangrijk: groepeer NIET op oppervlakkige woorden, maar op het onderliggende patroon/probleem.
Voorbeeld: "het is te duur" kan eigenlijk gaan over "kosten zijn niet transparant" OF over
"klanten zijn ontwijkend gedrag en vermijden het onderwerp" -- dat zijn twee heel verschillende
onderliggende inzichten, ook al klinkt de oppervlakkige uitspraak hetzelfde.

Elke input-notitie heeft een uniek id. Groepeer de notities die bij hetzelfde onderliggende
inzicht horen. Notities die nergens goed bij passen laat je in ongrouped_card_ids.

Antwoord UITSLUITEND met geldige JSON, exact dit schema, geen markdown-codeblok, geen tekst
ervoor of erna:
{
  "groups": [
    {
      "title": "Korte kernboodschap in 1 zin (het onderliggende patroon)",
      "description": "Samenvatting van het onderzoek: wat zeggen/denken/doen gebruikers, in 2-4 zinnen",
      "waarom": "Korte uitleg waarom deze notities bij elkaar horen (het onderliggend patroon)",
      "card_ids": ["<id>", "<id>"]
    }
  ],
  "ongrouped_card_ids": ["<id>"]
}`;

function buildPrompt(cards) {
  const lines = cards.map(c => `- id: ${c.id}\n  type: ${c.card_type || 'onbekend'}\n  tekst: ${c.content}`);
  return `Hier zijn de ruwe onderzoeksnotities:\n\n${lines.join('\n')}\n\nGroepeer ze zoals beschreven in de systeeminstructie.`;
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI-antwoord bevatte geen herkenbare JSON.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * @param {Object} params
 * @param {Object} params.env
 * @param {Array<{id: string, content: string, card_type: string|null}>} params.cards
 * @returns {Promise<{ groups: Array<{title:string, description:string, waarom:string, card_ids:string[]}>, ongrouped_card_ids: string[] }>}
 */
export async function suggestGroups({ env, cards }) {
  if (!cards || cards.length === 0) {
    return { groups: [], ongrouped_card_ids: [] };
  }

  const { text } = await generate({
    env,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(cards),
    maxOutputTokens: 4096
  });

  let parsed;
  try {
    parsed = extractJson(text);
  } catch (err) {
    const wrapped = new Error(`Kon AI-antwoord niet verwerken: ${err.message}`);
    wrapped.code = 'AI_PARSE_ERROR';
    throw wrapped;
  }

  const validIds = new Set(cards.map(c => c.id));
  const groups = (parsed.groups || [])
    .map(g => ({
      title: String(g.title || '').trim(),
      description: String(g.description || '').trim(),
      waarom: String(g.waarom || '').trim(),
      card_ids: (g.card_ids || []).filter(id => validIds.has(id))
    }))
    .filter(g => g.title && g.card_ids.length > 0);

  const groupedIds = new Set(groups.flatMap(g => g.card_ids));
  const ongroupedFromAi = (parsed.ongrouped_card_ids || []).filter(id => validIds.has(id) && !groupedIds.has(id));
  const missing = cards.map(c => c.id).filter(id => !groupedIds.has(id) && !ongroupedFromAi.includes(id));

  return { groups, ongrouped_card_ids: [...new Set([...ongroupedFromAi, ...missing])] };
}
