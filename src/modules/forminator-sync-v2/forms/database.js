/**
 * Koppelingen — formulieren: databasetoegang
 *
 * Alles via getSupabaseClient(env), zoals de rest van de repo. Nooit een eigen
 * createClient() en geen module-eigen supabaseClient.js.
 *
 * Bewust een apart bestand naast database.js van de module: dat bestand is al
 * 56KB en staat op de lijst waar herhaaldelijk bestandscorruptie optrad. Een
 * nieuw, klein bestand naast de bestaande is veiliger dan er nog eens 200
 * regels in duwen.
 */

import { getSupabaseClient } from '../../../lib/database.js';

const TABLES = {
  forms:           'fs_v2_forms',
  fields:          'fs_v2_form_fields',
  integrations:    'fs_v2_integrations',
  submissions:     'fs_v2_submissions',
  fieldTransforms: 'fs_v2_field_transforms',
};

function getSupabase(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return getSupabaseClient(env);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchFields(supabase, formId) {
  const { data, error } = await supabase
    .from(TABLES.fields)
    .select('*')
    .eq('form_id', formId)
    .order('order_index', { ascending: true });

  if (error) throw new Error(`Kon de formuliervelden niet ophalen: ${error.message}`);
  return ensureArray(data);
}

/** Het formulier van één koppeling, met zijn velden. Null als er geen is. */
export async function getFormByIntegrationId(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.forms)
    .select('*')
    .eq('integration_id', integrationId)
    .maybeSingle();

  if (error) throw new Error(`Kon het formulier niet ophalen: ${error.message}`);
  if (!data) return null;

  return { form: data, fields: await fetchFields(supabase, data.id) };
}

/**
 * Een formulier via zijn slug — het publieke leespad.
 *
 * `publishedOnly` staat standaard AAN. Een concept geeft daardoor hetzelfde
 * antwoord als een onbestaande slug (de aanroeper maakt er 404 van, geen 403):
 * dat iets bestaat is zelf informatie, en een half afgewerkt formulier hoort
 * nooit op een pagina te kunnen staan.
 */
export async function getFormBySlug(env, slug, { publishedOnly = true } = {}) {
  const supabase = getSupabase(env);

  let query = supabase.from(TABLES.forms).select('*').eq('slug', slug);
  if (publishedOnly) query = query.eq('status', 'published');

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Kon het formulier niet ophalen: ${error.message}`);
  if (!data) return null;

  return { form: data, fields: await fetchFields(supabase, data.id) };
}

/**
 * Alle GEPUBLICEERDE formulieren, met hun aantal velden.
 *
 * Voor de shortcode-bouwer in de WordPress-plugin. Concepten staan er bewust
 * niet bij: die zijn via de publieke API sowieso onvindbaar, en een shortcode
 * van een concept zou op de website niets tonen -- dat is een valstrik.
 *
 * Het aantal velden komt uit één extra query in plaats van uit een join per
 * formulier: dit is een lijst van hooguit enkele tientallen rijen, en zo blijft
 * het bij twee aanroepen ongeacht hoeveel formulieren er zijn.
 */
export async function listPublishedForms(env) {
  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from(TABLES.forms)
    .select('*')
    .eq('status', 'published')
    .order('name', { ascending: true });

  if (error) throw new Error(`Kon de formulieren niet oplijsten: ${error.message}`);
  const forms = ensureArray(data);
  if (forms.length === 0) return [];

  const { data: velden, error: veldFout } = await supabase
    .from(TABLES.fields)
    .select('form_id, field_type')
    .in('form_id', forms.map((f) => f.id));

  if (veldFout) throw new Error(`Kon de velden niet tellen: ${veldFout.message}`);

  // Opmaakblokken tellen niet mee: "3 velden" moet betekenen dat een bezoeker
  // drie dingen invult, niet dat er twee tussentitels tussen staan.
  const OPMAAK = ['heading', 'paragraph'];
  const aantal = {};
  ensureArray(velden).forEach((rij) => {
    if (OPMAAK.indexOf(rij.field_type) !== -1) return;
    aantal[rij.form_id] = (aantal[rij.form_id] || 0) + 1;
  });

  return forms.map((form) => ({ form, fieldCount: aantal[form.id] || 0 }));
}

/**
 * Veldsleutels die al in een bewaarde inzending voorkomen.
 *
 * Dit is de bron voor de sleutel-op-slot-regel. Er wordt bewust naar de ECHTE
 * payloads gekeken en niet naar "heeft deze koppeling al eens gedraaid":
 * een veld dat pas vorige week is toegevoegd en nog nooit ingevuld werd, mag
 * je gerust nog hernoemen.
 *
 * Beperkt tot de laatste 500 inzendingen. Een sleutel die daarvoor wél en
 * daarna nooit meer voorkwam, hoort bij een veld dat allang uit het formulier
 * verdwenen is; die tegenhouden zou het formulier voorgoed op slot zetten.
 */
export async function getUsedFieldKeys(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('source_payload')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`Kon de inzendingen niet nakijken: ${error.message}`);

  const keys = new Set();
  for (const row of ensureArray(data)) {
    const payload = row?.source_payload;
    const formData = payload && typeof payload === 'object' ? payload.form_data : null;
    if (formData && typeof formData === 'object') {
      for (const key of Object.keys(formData)) {
        if (!key.startsWith('meta_')) keys.add(key);
      }
    }
  }
  return keys;
}

/**
 * Formulier + velden bewaren.
 *
 * De velden worden VERVANGEN, niet samengevoegd: de bouwer stuurt altijd de
 * volledige lijst in de juiste volgorde, en een gedeeltelijke update zou
 * betekenen dat verwijderen en verplaatsen twee aparte, botsende paden krijgen.
 *
 * Supabase-REST kent geen transactie over meerdere aanroepen. De volgorde is
 * daarom zo gekozen dat een onderbreking halverwege niets kapotmaakt dat niet
 * met opnieuw opslaan te herstellen is: eerst het formulier (dan staat de
 * nieuwe versie er), dan de velden vervangen. Breekt het tussen die twee, dan
 * heeft het formulier een versienummer dat één te hoog is — de WordPress-cache
 * haalt dan één keer te veel op, en verder niets.
 */
export async function saveForm(env, integrationId, { form, fields }) {
  const supabase = getSupabase(env);
  const now = new Date().toISOString();

  const existing = await getFormByIntegrationId(env, integrationId);

  const formRow = {
    integration_id:  integrationId,
    slug:            form.slug,
    name:            form.name,
    description:     form.description,
    status:          form.status,
    submit_label:    form.submit_label,
    success_mode:    form.success_mode,
    success_message: form.success_message,
    redirect_url:    form.redirect_url,
    theme:           form.theme,
    allowed_sites:   form.allowed_sites,
    languages:       form.languages,
    default_language: form.default_language,
    i18n:            form.i18n,
    updated_at:      now,
  };

  // published_at is het moment van de EERSTE publicatie en wordt daarna niet
  // meer aangeraakt — anders leest het als "laatst gewijzigd", wat updated_at
  // al doet.
  if (form.status === 'published' && !existing?.form?.published_at) {
    formRow.published_at = now;
  }

  let formId;
  if (existing) {
    formRow.version = (Number(existing.form.version) || 1) + 1;
    const { data, error } = await supabase
      .from(TABLES.forms)
      .update(formRow)
      .eq('id', existing.form.id)
      .select('*')
      .single();
    if (error) throw new Error(mapSaveError(error));
    formId = data.id;
  } else {
    formRow.version = 1;
    formRow.created_at = now;
    const { data, error } = await supabase
      .from(TABLES.forms)
      .insert(formRow)
      .select('*')
      .single();
    if (error) throw new Error(mapSaveError(error));
    formId = data.id;
  }

  const { error: deleteError } = await supabase
    .from(TABLES.fields)
    .delete()
    .eq('form_id', formId);
  if (deleteError) throw new Error(`Kon de oude velden niet vervangen: ${deleteError.message}`);

  if (fields.length > 0) {
    const rows = fields.map((f, index) => ({
      form_id:         formId,
      order_index:     index,
      field_key:       f.field_key || `blok_${index + 1}`,
      field_type:      f.field_type,
      label:           f.label,
      help_text:       f.help_text,
      placeholder:     f.placeholder,
      is_required:     f.is_required,
      default_value:   f.default_value,
      options:         f.options,
      width:           f.width,
      validation:      f.validation,
      odoo_field_type: f.odoo_field_type,
      i18n:            f.i18n,
      created_at:      now,
      updated_at:      now,
    }));

    const { error: insertError } = await supabase.from(TABLES.fields).insert(rows);
    if (insertError) throw new Error(`Kon de velden niet bewaren: ${insertError.message}`);
  }

  return getFormByIntegrationId(env, integrationId);
}

/**
 * Opmaakblokken (heading/paragraph) hebben geen echte veldsleutel maar wel een
 * UNIQUE-constraint op (form_id, field_key). Ze krijgen hierboven `blok_<n>`.
 * Die naam komt nooit in de payload, want buildPipelinePayload() loopt alleen
 * over invoervelden.
 */

function mapSaveError(error) {
  const message = String(error?.message || '');
  if (message.includes('uq_fs_v2_forms_slug')) {
    return 'Die slug is al in gebruik door een ander formulier. Kies een andere.';
  }
  if (message.includes('ck_fs_v2_forms_slug_shape')) {
    return 'De slug mag enkel kleine letters, cijfers en koppeltekens bevatten.';
  }
  return `Kon het formulier niet bewaren: ${message}`;
}

export async function deleteForm(env, integrationId) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.forms)
    .delete()
    .eq('integration_id', integrationId);
  if (error) throw new Error(`Kon het formulier niet verwijderen: ${error.message}`);
}

/**
 * De veldtypes doorgeven aan fs_v2_field_transforms.
 *
 * Dat is de tabel die de pipeline gebruikt om een binnenkomende string naar het
 * juiste Odoo-type te duwen. Bij Forminator moet je die met de hand invullen,
 * want daar weet niemand vooraf dat "ja" een boolean moest zijn. Hier weten we
 * het wél, dus vullen we ze automatisch aan.
 *
 * ALLEEN ontbrekende rijen. Een bestaande rij wordt nooit overschreven: iemand
 * kan er bewust iets anders van gemaakt hebben (bijvoorbeeld een many2one met
 * een eigen value_map), en dat stil terugzetten naar de standaard zou een
 * werkende koppeling breken zonder dat er iets zichtbaar verandert.
 */
export async function seedFieldTransforms(env, integrationId, fields) {
  const supabase = getSupabase(env);

  const { data: existing, error } = await supabase
    .from(TABLES.fieldTransforms)
    .select('field_name')
    .eq('integration_id', integrationId);
  if (error) throw new Error(`Kon de veldtransformaties niet nakijken: ${error.message}`);

  const known = new Set(ensureArray(existing).map((row) => row.field_name));
  const now = new Date().toISOString();

  const rows = [];
  for (const field of fields) {
    if (!field.field_key || known.has(field.field_key)) continue;

    // Een selectieveld levert zijn value_map gratis: de optiewaarden staan al in
    // de definitie. Identiteitsafbeelding, zodat het scherm toont welke waarden
    // er binnenkomen en je ze daar kan omzetten naar wat Odoo verwacht.
    const valueMap = field.odoo_field_type === 'selection' && Array.isArray(field.options) && field.options.length
      ? Object.fromEntries(field.options.map((o) => [String(o.value), String(o.value)]))
      : null;

    rows.push({
      integration_id: integrationId,
      field_name:     field.field_key,
      field_type:     field.odoo_field_type,
      value_map:      valueMap,
      created_at:     now,
      updated_at:     now,
    });
  }

  if (rows.length === 0) return 0;

  const { error: insertError } = await supabase.from(TABLES.fieldTransforms).insert(rows);
  if (insertError) throw new Error(`Kon de veldtransformaties niet aanvullen: ${insertError.message}`);
  return rows.length;
}
