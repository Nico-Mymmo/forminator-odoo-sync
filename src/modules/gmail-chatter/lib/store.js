/**
 * Gmail → chatter — de opslag (Supabase).
 *
 * Twee tabellen, zie `supabase/migrations/20260914160000_gmail_chatter.sql`:
 * `gmail_sync_state` (hoe ver staan we per medewerker) en
 * `gmail_captured_messages` (één rij per bekeken bericht, en meteen de
 * idempotentiesleutel).
 */

import { getSupabaseClient } from '../../../lib/database.js';

export async function getSyncState(env, userEmail) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_sync_state')
    .select('*')
    .eq('user_email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`gmail_sync_state lezen mislukt: ${error.message}`);
  return data || null;
}

export async function saveSyncState(env, userEmail, { historyId, error: foutmelding = null, extraSeen = 0 }) {
  const supabase = getSupabaseClient(env);
  const huidig = await getSyncState(env, userEmail);
  const rij = {
    user_email: userEmail,
    history_id: historyId ?? huidig?.history_id ?? null,
    last_synced_at: new Date().toISOString(),
    last_error: foutmelding,
    messages_seen: Number(huidig?.messages_seen || 0) + Number(extraSeen || 0),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from('gmail_sync_state')
    .upsert(rij, { onConflict: 'user_email' });
  if (error) throw new Error(`gmail_sync_state schrijven mislukt: ${error.message}`);
}

/**
 * Welke van deze Gmail-berichten kennen we al?
 *
 * Dit is wat voorkomt dat een bericht twee keer in de chatter belandt — en het
 * scheelt bij elke ronde een metadata-call per al bekeken bericht.
 *
 * @returns {Promise<Set<string>>}
 */
export async function reedsGezien(env, messageIds) {
  if (!messageIds.length) return new Set();
  const supabase = getSupabaseClient(env);
  const gevonden = new Set();

  // In blokken: een `in`-filter met honderden waarden wordt een te lange URL.
  for (let i = 0; i < messageIds.length; i += 100) {
    const blok = messageIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('gmail_captured_messages')
      .select('gmail_message_id')
      .in('gmail_message_id', blok);
    if (error) throw new Error(`gmail_captured_messages lezen mislukt: ${error.message}`);
    for (const r of data || []) gevonden.add(r.gmail_message_id);
  }
  return gevonden;
}

/**
 * Eerder geplaatste berichten uit dezelfde draad zoeken.
 *
 * `messageIds` komt uit References/In-Reply-To. Vinden we daar een van terug,
 * dan weten we exact bij welke lead(s) dit antwoord hoort — zonder te gokken
 * op een e-mailadres. Het origineel kan bij MEERDERE leads geplaatst zijn
 * (zelfde adres op meerdere leads, zie `alleLeadsOpAdres()` in matching.js) —
 * een antwoord in diezelfde draad hoort dan bij AL die leads, niet enkel de
 * meest recente.
 *
 * @returns {Promise<Array<{model: string, res_id: number, method: string}>>}
 */
export async function zoekDraadMatch(env, messageIds) {
  const kandidaten = (messageIds || []).filter(Boolean).slice(0, 50);
  if (!kandidaten.length) return [];

  const supabase = getSupabaseClient(env);
  const { data: berichten, error } = await supabase
    .from('gmail_captured_messages')
    .select('gmail_message_id')
    .in('rfc822_message_id', kandidaten);
  if (error) throw new Error(`draadmatch zoeken mislukt: ${error.message}`);
  const berichtIds = [...new Set((berichten || []).map(b => b.gmail_message_id))];
  if (!berichtIds.length) return [];

  const { data: targets, error: targetError } = await supabase
    .from('gmail_captured_message_targets')
    .select('odoo_model, odoo_res_id')
    .in('gmail_message_id', berichtIds);
  if (targetError) throw new Error(`draadmatch-doelen zoeken mislukt: ${targetError.message}`);

  const gezien = new Set();
  const uit = [];
  for (const t of targets || []) {
    const sleutel = `${t.odoo_model}/${t.odoo_res_id}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ model: t.odoo_model, res_id: t.odoo_res_id, method: 'draad' });
  }
  return uit;
}

export async function bewaarBericht(env, rij) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('gmail_captured_messages')
    .upsert(rij, { onConflict: 'gmail_message_id' });
  if (error) throw new Error(`bericht bewaren mislukt: ${error.message}`);
}

/**
 * Alle leads bewaren waar een bericht daadwerkelijk in de chatter is gezet.
 *
 * Losse tabel van `gmail_captured_messages` omdat één bericht bij meerdere
 * leads kan horen — zie `alleLeadsOpAdres()` in matching.js. De eerste van
 * `targets` staat ook op `gmail_captured_messages.odoo_model`/`odoo_res_id`
 * (de bestaande, enkelvoudige kolommen), deze tabel draagt de volledige lijst.
 */
export async function bewaarBerichtTargets(env, gmailMessageId, targets) {
  if (!targets?.length) return;
  const supabase = getSupabaseClient(env);
  const rijen = targets.map(t => ({
    gmail_message_id: gmailMessageId,
    odoo_model: t.model,
    odoo_res_id: t.res_id,
    odoo_chatter_message_id: typeof t.odoo_message_id === 'number' ? t.odoo_message_id : null,
    match_method: t.method || null
  }));
  const { error } = await supabase
    .from('gmail_captured_message_targets')
    .upsert(rijen, { onConflict: 'gmail_message_id,odoo_model,odoo_res_id' });
  if (error) throw new Error(`bericht-doelen bewaren mislukt: ${error.message}`);
}

/** De werklijst: wat we niet konden plaatsen. */
export async function nietGeplaatst(env, limit = 100) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_captured_messages')
    .select('*')
    .in('status', ['unmatched', 'failed'])
    .order('internal_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`werklijst lezen mislukt: ${error.message}`);
  return data || [];
}

// ─── Opruimen ────────────────────────────────────────────────────────────────

/**
 * Hoe lang een rij bewaard blijft, per status, in DAGEN.
 *
 * De drie statussen hebben een heel andere waarde, en dat is de reden dat dit
 * geen één getal is:
 *
 * - `skipped` is verreweg de grootste stapel (24 van de 28 in de eerste echte
 *   ronde): intern verkeer, nieuwsbrieven, noreply-afzenders. Zo'n rij dient
 *   alleen om te voorkomen dat we hetzelfde bericht opnieuw beoordelen. Dat is
 *   nodig zolang een herstart de mail nog eens kan tegenkomen, en die bootstrap
 *   kijkt maar twee dagen terug. Veertien dagen is dus ruim.
 *
 * - `posted` draagt de DRAADSLEUTEL (`rfc822_message_id`). Daarmee belandt het
 *   antwoord van een klant bij dezelfde lead, ook als zijn adres intussen
 *   veranderd is. Die waarde slijt langzaam: na ruim een jaar is een antwoord op
 *   diezelfde mail zeldzaam, en dan vangt het adres het nog steeds op.
 *
 * - `unmatched` en `failed` staan in de werklijst. Heeft niemand er in een half
 *   jaar naar gekeken, dan gaat dat ook niet meer gebeuren.
 */
export const BEWAARTERMIJNEN_DAGEN = {
  skipped: 14,
  posted: 400,
  unmatched: 180,
  failed: 180
};

/**
 * De verlopen rijen weggooien.
 *
 * Draait bij ELKE ronde mee, en dat mag: per ronde valt hooguit een handvol
 * rijen over de grens, dus het is een kleine, geïndexeerde delete. Een aparte
 * planning zou alleen maar een tweede ding zijn dat stuk kan gaan.
 *
 * @returns {Promise<Object>} aantal verwijderde rijen per status
 */
export async function ruimOp(env) {
  const supabase = getSupabaseClient(env);
  const verwijderd = {};

  for (const [status, dagen] of Object.entries(BEWAARTERMIJNEN_DAGEN)) {
    const grens = new Date(Date.now() - dagen * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('gmail_captured_messages')
      .delete()
      .eq('status', status)
      .lt('created_at', grens)
      .select('gmail_message_id');

    if (error) {
      console.warn('[gmail-chatter] opruimen van', status, 'mislukt:', error.message);
      continue;
    }
    if (data?.length) verwijderd[status] = data.length;
  }

  return verwijderd;
}

// ─── Contactkoppelingen (de uitzonderingen) ──────────────────────────────────

/**
 * De koppeling voor één adres, of null.
 *
 * Wordt bij elk te beoordelen bericht aangeroepen, dus bewust één rij op de
 * primaire sleutel — geen zoekopdracht.
 */
export async function getContactLink(env, adres) {
  const email = String(adres || '').trim().toLowerCase();
  if (!email) return null;
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_contact_links')
    .select('*')
    .eq('counterpart_email', email)
    .maybeSingle();
  if (error) throw new Error(`contactkoppeling lezen mislukt: ${error.message}`);
  return data || null;
}

/** Alle koppelingen, voor het beheerscherm. */
export async function listContactLinks(env, limit = 500) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_contact_links')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`koppelingen lezen mislukt: ${error.message}`);
  return data || [];
}

/**
 * Een koppeling vastleggen of bijwerken.
 *
 * Bewust een upsert op het adres: twee keer hetzelfde contact koppelen hoort
 * geen fout te geven maar het doel te verplaatsen.
 */
export async function upsertContactLink(env, { email, action, odooModel = null, odooResId = null, createdBy = null, source = null, note = null }) {
  const supabase = getSupabaseClient(env);
  const rij = {
    counterpart_email: String(email).trim().toLowerCase(),
    action,
    odoo_model: action === 'lead' ? (odooModel || 'crm.lead') : null,
    odoo_res_id: action === 'lead' ? odooResId : null,
    created_by: createdBy,
    source,
    note,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('gmail_contact_links')
    .upsert(rij, { onConflict: 'counterpart_email' })
    .select()
    .maybeSingle();
  if (error) throw new Error(`koppeling bewaren mislukt: ${error.message}`);
  return data;
}

export async function deleteContactLink(env, email) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('gmail_contact_links')
    .delete()
    .eq('counterpart_email', String(email).trim().toLowerCase());
  if (error) throw new Error(`koppeling verwijderen mislukt: ${error.message}`);
}

/**
 * De nog niet geplaatste berichten van één contact.
 *
 * Gebruikt wanneer je een contact alsnog aan een lead hangt: die openstaande
 * mail hoort dan mee in het dossier terecht te komen. Met een plafond, want bij
 * een oud contact wil je geen honderd berichten tegelijk in één lead duwen.
 */
export async function openstaandVoorContact(env, email, limit = 50) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_captured_messages')
    .select('*')
    .eq('counterpart_email', String(email).trim().toLowerCase())
    .in('status', ['unmatched', 'failed'])
    .order('internal_date', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`openstaande berichten lezen mislukt: ${error.message}`);
  return data || [];
}

/**
 * De werklijst GEGROEPEERD PER CONTACT.
 *
 * Dit is wat het scherm toont. Per mail beslissen betekent dat je bij elke
 * nieuwe mail van dezelfde persoon opnieuw hetzelfde doet; per contact beslis
 * je één keer.
 */
export async function werklijstPerContact(env, userEmail = null) {
  const supabase = getSupabaseClient(env);
  let q = supabase
    .from('gmail_captured_messages')
    .select('counterpart_email, subject, internal_date, direction, status, user_email')
    .in('status', ['unmatched', 'failed'])
    .order('internal_date', { ascending: false })
    .limit(1000);
  if (userEmail) q = q.eq('user_email', userEmail);

  const { data, error } = await q;
  if (error) throw new Error(`werklijst lezen mislukt: ${error.message}`);

  const per = new Map();
  for (const r of data || []) {
    const sleutel = r.counterpart_email || '(onbekend)';
    if (!per.has(sleutel)) {
      per.set(sleutel, {
        counterpart_email: sleutel,
        aantal: 0,
        laatste: r.internal_date,
        laatste_onderwerp: r.subject,
        richtingen: new Set()
      });
    }
    const g = per.get(sleutel);
    g.aantal++;
    g.richtingen.add(r.direction);
    if (!g.laatste || (r.internal_date && r.internal_date > g.laatste)) {
      g.laatste = r.internal_date;
      g.laatste_onderwerp = r.subject;
    }
  }
  return [...per.values()]
    .map(g => ({ ...g, richtingen: [...g.richtingen] }))
    .sort((a, b) => String(b.laatste || '').localeCompare(String(a.laatste || '')));
}
