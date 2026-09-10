/**
 * Koppelingen — formulierschema (puur)
 *
 * Geen env, geen fetch, geen database. Alles hier is een functie van haar
 * argumenten, zodat tests zonder netwerk of Supabase kunnen draaien
 * (src/modules/forminator-sync-v2/tests/forms-test.mjs).
 *
 * Dit bestand is de enige waarheid over WELKE veldtypes bestaan en wat ze
 * betekenen. De bouwer in de OM, de publieke API en de WordPress-plugin
 * lezen alle drie uit FIELD_TYPES — voeg je een type toe, dan verschijnt het
 * automatisch in de bouwer en in de validatie. De renderer in PHP moet er
 * wel apart een template voor krijgen; dat is de enige plek waar een nieuw
 * type handwerk kost.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Veldtypes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * input      — levert een waarde aan de payload (heading/paragraph niet)
 * options    — heeft een keuzelijst nodig; zonder opties is het veld ongeldig
 * multi      — kan meerdere waarden hebben (komt als komma-string binnen, want
 *              normalizeFormValues() in worker-handler.js plakt arrays aan
 *              elkaar met ", " — dat is bestaand gedrag, niet iets nieuws)
 * odooType   — standaard voor fs_v2_field_transforms als de gebruiker niets kiest
 */
export const FIELD_TYPES = {
  text:           { input: true,  options: false, multi: false, odooType: 'text',      label: 'Tekst' },
  email:          { input: true,  options: false, multi: false, odooType: 'text',      label: 'E-mailadres' },
  tel:            { input: true,  options: false, multi: false, odooType: 'text',      label: 'Telefoonnummer' },
  number:         { input: true,  options: false, multi: false, odooType: 'integer',   label: 'Getal' },
  date:           { input: true,  options: false, multi: false, odooType: 'text',      label: 'Datum' },
  textarea:       { input: true,  options: false, multi: false, odooType: 'text',      label: 'Lange tekst' },
  select:         { input: true,  options: true,  multi: false, odooType: 'selection', label: 'Keuzelijst' },
  radio:          { input: true,  options: true,  multi: false, odooType: 'selection', label: 'Keuzerondjes' },
  checkbox:       { input: true,  options: false, multi: false, odooType: 'boolean',   label: 'Vinkje' },
  checkbox_group: { input: true,  options: true,  multi: true,  odooType: 'text',      label: 'Meerkeuze' },
  hidden:         { input: true,  options: false, multi: false, odooType: 'text',      label: 'Verborgen veld' },
  heading:        { input: false, options: false, multi: false, odooType: 'text',      label: 'Tussentitel' },
  paragraph:      { input: false, options: false, multi: false, odooType: 'text',      label: 'Tekstblok' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Talen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De talen waarin een formulier kan bestaan.
 *
 * `native` is bewust de taal in ZICHZELF geschreven: dat is wat een bezoeker
 * herkent in een taalkiezer, en wat in de bouwer op het tabblad staat.
 */
export const LANGUAGES = {
  nl: { native: 'Nederlands', label: 'Nederlands' },
  fr: { native: 'Français',   label: 'Frans' },
  en: { native: 'English',    label: 'Engels' },
};

export const DEFAULT_LANGUAGE = 'nl';

export function isLanguage(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, value);
}

/**
 * Elke bezoekerstekst die NIET door een beheerder getypt wordt.
 *
 * Dit is de ENIGE bron. De catalogus reist mee in de publieke payload, zodat de
 * WordPress-plugin hem gebruikt in PHP én in de browser, en de Worker hem
 * gebruikt voor zijn eigen 422-antwoorden. Zo staat dezelfde zin nooit op twee
 * plekken -- de reden dat de renderer wél gedupliceerd is (PHP en JS) is dat
 * HTML nu eenmaal op twee plekken gemaakt wordt, maar voor tekst geldt dat niet.
 *
 * De browserballon ("Please fill out this field.") wordt hierdoor overbodig, en
 * dat is precies de bedoeling: die volgt de taal van de BROWSER, niet die van de
 * pagina. Een Franstalige bezoeker met een Engelse Chrome kreeg Engels te zien
 * op een Nederlandse pagina.
 *
 * {label} en {n} en {value} worden ingevuld door t().
 */
export const MESSAGES = {
  nl: {
    required:       '{label} is verplicht.',
    email:          '{label} is geen geldig e-mailadres.',
    number:         '{label} moet een getal zijn.',
    date:           '{label} moet een datum zijn (jjjj-mm-dd).',
    unknown_choice: '{label}: onbekende keuze "{value}".',
    minlength:      '{label} moet minstens {n} tekens bevatten.',
    maxlength:      '{label} mag hoogstens {n} tekens bevatten.',
    min:            '{label} moet minstens {n} zijn.',
    max:            '{label} mag hoogstens {n} zijn.',
    choose:         'Maak een keuze',
    submitting:     'Bezig met versturen…',
    check_fields:   'Kijk de gemarkeerde velden na.',
    expired:        'De pagina was verlopen. Probeer het opnieuw.',
    stale_page:     'Deze pagina stond te lang open. Ververs ze en probeer opnieuw.',
    rejected:       'De inzending kon niet verwerkt worden.',
    unavailable:    'Dit formulier is momenteel niet beschikbaar.',
    send_failed:    'We konden je bericht niet versturen. Probeer het zo meteen opnieuw.',
  },
  fr: {
    required:       '{label} est obligatoire.',
    email:          '{label} n\'est pas une adresse e-mail valide.',
    number:         '{label} doit être un nombre.',
    date:           '{label} doit être une date (aaaa-mm-jj).',
    unknown_choice: '{label} : choix inconnu « {value} ».',
    minlength:      '{label} doit contenir au moins {n} caractères.',
    maxlength:      '{label} ne peut pas dépasser {n} caractères.',
    min:            '{label} doit être au moins {n}.',
    max:            '{label} ne peut pas dépasser {n}.',
    choose:         'Faites votre choix',
    submitting:     'Envoi en cours…',
    check_fields:   'Veuillez vérifier les champs signalés.',
    expired:        'La page avait expiré. Veuillez réessayer.',
    stale_page:     'Cette page est restée ouverte trop longtemps. Actualisez-la et réessayez.',
    rejected:       "L'envoi n'a pas pu être traité.",
    unavailable:    "Ce formulaire n'est pas disponible pour le moment.",
    send_failed:    "Nous n'avons pas pu envoyer votre message. Réessayez dans un instant.",
  },
  en: {
    required:       '{label} is required.',
    email:          '{label} is not a valid email address.',
    number:         '{label} must be a number.',
    date:           '{label} must be a date (yyyy-mm-dd).',
    unknown_choice: '{label}: unknown choice "{value}".',
    minlength:      '{label} must be at least {n} characters.',
    maxlength:      '{label} may be at most {n} characters.',
    min:            '{label} must be at least {n}.',
    max:            '{label} may be at most {n}.',
    choose:         'Make a choice',
    submitting:     'Sending…',
    check_fields:   'Please check the highlighted fields.',
    expired:        'The page had expired. Please try again.',
    stale_page:     'This page was open too long. Refresh it and try again.',
    rejected:       'The submission could not be processed.',
    unavailable:    'This form is currently unavailable.',
    send_failed:    'We could not send your message. Please try again in a moment.',
  },
};

/**
 * Een bericht in een taal, met {plaatshouders} ingevuld.
 *
 * Onbekende taal valt terug op het Nederlands in plaats van de sleutel terug te
 * geven: een bezoeker die "required" op zijn scherm ziet staan is slechter af
 * dan een bezoeker die één zin in de verkeerde taal leest.
 */
export function t(lang, key, vars = {}) {
  const tabel = MESSAGES[lang] || MESSAGES[DEFAULT_LANGUAGE];
  const sjabloon = tabel[key] || MESSAGES[DEFAULT_LANGUAGE][key] || '';
  return sjabloon.replace(/\{(\w+)\}/g, (heel, naam) => (
    Object.prototype.hasOwnProperty.call(vars, naam) ? String(vars[naam]) : heel
  ));
}

export const ODOO_FIELD_TYPES = ['text', 'boolean', 'integer', 'float', 'selection', 'many2one'];

export const FIELD_WIDTHS = ['full', 'half'];
export const FORM_STATUSES = ['draft', 'published'];
export const SUCCESS_MODES = ['message', 'redirect'];

/**
 * Sleutels die de submit-handler zelf zet. Een veld mag ze niet claimen, want
 * dan overschrijft het formulier zijn eigen herkomstgegevens.
 *
 * De meta-sleutels krijgen bewust een `meta_`-prefix en geen punt: punten in
 * een sleutel gebruikt normalizeFormValues() al voor samengestelde velden
 * (name-1.first-name), dus een punt hier zou botsen met dat bestaande gedrag.
 */
export const META_PREFIX = 'meta_';
export const RESERVED_FIELD_KEYS = new Set([
  'form_id', 'form_slug', 'formid', 'form_uid', 'forminator_form_id',
  'ovme_forminator_id', 'form_data', 'form_fields',
]);

/**
 * Vaste velden die de plugin altijd meestuurt, ook als niemand ze mapt.
 *
 * `ovme_uuid` is de bezoeker-UUID uit de cookie die het tracking-script op de
 * website zet (`ovme_uuid`, twee jaar, path=/). Die is de sleutel tussen een
 * inzending en alles wat er van die bezoeker geweten is: paginaweergaves,
 * scrolldiepte, kliks. Zonder dat veld staat een lead in Odoo los van zijn
 * eigen voorgeschiedenis.
 *
 * `ovme_ref_uuid` is de UUID van de ANDERE site, gezet wanneer iemand van
 * openvme.be naar syndicoach.be doorklikt (of omgekeerd). Zo blijft een
 * bezoeker herkenbaar over de twee merken heen.
 *
 * Beide kunnen leeg zijn, en dat is normaal: het tracking-script zet geen
 * cookie voor wie het als bot herkent, en ook niet in een browser zonder
 * plugins of taalinstelling. Een formulier mag er dus NOOIT op steunen.
 */
export const META_KEYS = [
  'site', 'page_url', 'page_title', 'referrer', 'submitted_at',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ovme_uuid', 'ovme_ref_uuid', 'lang',
];

const MAX_FIELDS = 60;
const MAX_OPTIONS = 200;
const MAX_TEXT_VALUE = 20000;

// ─────────────────────────────────────────────────────────────────────────────
// Sleutels en slugs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Titel → slug voor de publieke URL en de shortcode.
 * Zelfde vorm als de check-constraint op fs_v2_forms.slug.
 */
export function slugifyForm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Label → veldsleutel. Onderstrepen in plaats van streepjes, want dit is een
 * JSON-sleutel en straks de linkerkant van een mapping — niet een URL.
 */
export function normalizeFieldKey(value) {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');

  // Moet met een letter beginnen (check-constraint ck_fs_v2_form_fields_key_shape).
  return /^[a-z]/.test(cleaned) ? cleaned : (cleaned ? `veld_${cleaned}` : '');
}

export function isValidFieldKey(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value) && value.length <= 60;
}

export function isValidSlug(value) {
  return typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validatie van een formulierdefinitie
// ─────────────────────────────────────────────────────────────────────────────

function str(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Wat er per taal vertaald kan worden.
 *
 * Bewust NIET in deze lijst: `slug` (die staat in de shortcode en in de URL en
 * moet één ding blijven), `field_key` (dat is de linkerkant van een mapping
 * naar Odoo) en de WAARDE van een optie. Dat laatste is de kern van waarom één
 * meertalig formulier volstaat en je geen tweede koppeling nodig hebt: een
 * Franstalige bezoeker die "Appartement" aanklikt, verstuurt exact dezelfde
 * waarde als een Nederlandstalige. Alleen het LABEL verschilt.
 */
const FORM_I18N_KEYS = ['name', 'description', 'submit_label', 'success_message'];
const FIELD_I18N_KEYS = ['label', 'help_text', 'placeholder'];

/**
 * Vertalingen opschonen: enkel bekende talen, enkel bekende sleutels, en de
 * standaardtaal er nooit in. Die staat al in de kolommen zelf -- ze ook in i18n
 * bewaren zou twee bronnen voor dezelfde tekst geven, en dan is de vraag welke
 * wint een bug die je pas maanden later merkt.
 */
function normalizeI18n(raw, languages, defaultLanguage, keys, optionValues) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

  for (const lang of languages) {
    if (lang === defaultLanguage) continue;
    const bron = raw[lang];
    if (!bron || typeof bron !== 'object' || Array.isArray(bron)) continue;

    const doel = {};
    for (const key of keys) {
      const waarde = str(bron[key]);
      if (waarde) doel[key] = waarde;
    }

    // Optielabels staan op de WAARDE, niet op een index: opties herschikken in
    // het Nederlands mag de Franse labels niet door elkaar gooien.
    if (Array.isArray(optionValues) && optionValues.length) {
      const toegestaan = new Set(optionValues);
      const opties = {};
      const ruweOpties = (bron.options && typeof bron.options === 'object' && !Array.isArray(bron.options))
        ? bron.options
        : {};
      for (const [waarde, label] of Object.entries(ruweOpties)) {
        // Een label voor een optie die niet meer bestaat gooien we weg; anders
        // groeit dit object bij elke wijziging aan tot een vuilnisbak.
        if (!toegestaan.has(String(waarde))) continue;
        const schoon = str(label);
        if (schoon) opties[String(waarde)] = schoon;
      }
      if (Object.keys(opties).length) doel.options = opties;
    }

    if (Object.keys(doel).length) out[lang] = doel;
  }

  return out;
}

/**
 * De tekst in één taal, met terugval.
 *
 * `verplicht` bepaalt wat er gebeurt als de vertaling ontbreekt:
 *   true  -> de standaardtaal. Een leeg label is een stuk formulier, één
 *            Nederlands label tussen Franse is lelijk maar bruikbaar.
 *   false -> leeg. Een hulptekst of placeholder in de verkeerde taal is
 *            verwarrender dan geen hulptekst.
 */
export function pickText(bron, i18n, lang, key, verplicht = true) {
  const vertaald = str(i18n && i18n[lang] && i18n[lang][key]);
  if (vertaald) return vertaald;
  return verplicht ? str(bron && bron[key]) : '';
}

/**
 * Een definitie normaliseren én valideren in één doorgang.
 *
 * Geeft ALTIJD { errors, form, fields } terug — bij errors.length > 0 mag er
 * niets bewaard worden. De genormaliseerde vorm is wat de database in gaat, zodat
 * de check-constraints daar nooit als eerste vangnet hoeven te dienen: een
 * constraint-fout is een 500 met een onleesbare Postgres-melding, en dit geeft
 * een zin die in de UI getoond kan worden.
 *
 * @param {object} input  { form: {...}, fields: [...] }
 * @param {object} [opts] { lockedKeys: Set<string> } — sleutels die al een
 *                        inzending hebben en dus niet meer mogen verdwijnen of
 *                        hernoemen (zie fs_v2_form_fields in de migratie).
 */
export function validateFormDefinition(input, opts = {}) {
  const errors = [];
  const lockedKeys = opts.lockedKeys instanceof Set ? opts.lockedKeys : new Set();

  const rawForm = (input && typeof input.form === 'object' && input.form) || {};
  const rawFields = Array.isArray(input && input.fields) ? input.fields : [];

  // ── Formulier ──────────────────────────────────────────────────────────────
  const name = str(rawForm.name);
  if (!name) errors.push('Geef het formulier een naam.');

  let slug = str(rawForm.slug) || slugifyForm(name);
  if (!isValidSlug(slug)) {
    errors.push(`"${slug}" is geen geldige slug: enkel kleine letters, cijfers en koppeltekens.`);
    slug = slugifyForm(slug) || 'formulier';
  }

  // Talen. De standaardtaal zit ALTIJD in de lijst -- anders zou het formulier
  // terugvallen op een taal die het zelf niet zegt te spreken.
  const defaultLanguage = isLanguage(rawForm.default_language) ? rawForm.default_language : DEFAULT_LANGUAGE;
  const gevraagd = Array.isArray(rawForm.languages) ? rawForm.languages.filter(isLanguage) : [];
  const languages = Object.keys(LANGUAGES).filter(
    (code) => code === defaultLanguage || gevraagd.includes(code)
  );

  const status = FORM_STATUSES.includes(rawForm.status) ? rawForm.status : 'draft';
  const successMode = SUCCESS_MODES.includes(rawForm.success_mode) ? rawForm.success_mode : 'message';
  const redirectUrl = str(rawForm.redirect_url);

  if (successMode === 'redirect') {
    if (!redirectUrl) {
      errors.push('Kies een doorstuur-URL, of zet het formulier terug op "melding tonen".');
    } else if (!/^https:\/\//i.test(redirectUrl)) {
      // Alleen https: een http-redirect vanuit een https-pagina is een
      // gemengde-inhoudwaarschuwing in de browser.
      errors.push('De doorstuur-URL moet met https:// beginnen.');
    }
  }

  const form = {
    name,
    slug,
    description: str(rawForm.description) || null,
    status,
    submit_label: str(rawForm.submit_label) || 'Versturen',
    success_mode: successMode,
    success_message: str(rawForm.success_message) || 'Bedankt, we hebben je bericht goed ontvangen.',
    redirect_url: successMode === 'redirect' ? redirectUrl : null,
    theme: (rawForm.theme && typeof rawForm.theme === 'object' && !Array.isArray(rawForm.theme)) ? rawForm.theme : {},
    languages,
    default_language: defaultLanguage,
    i18n: normalizeI18n(rawForm.i18n, languages, defaultLanguage, FORM_I18N_KEYS, null),
    allowed_sites: Array.isArray(rawForm.allowed_sites) ? rawForm.allowed_sites.map(str).filter(Boolean) : [],
  };

  // ── Velden ─────────────────────────────────────────────────────────────────
  if (rawFields.length > MAX_FIELDS) {
    errors.push(`Een formulier mag maximaal ${MAX_FIELDS} velden hebben.`);
  }

  const seen = new Set();
  const fields = [];

  rawFields.slice(0, MAX_FIELDS).forEach((raw, index) => {
    const type = FIELD_TYPES[raw && raw.field_type] ? raw.field_type : 'text';
    const spec = FIELD_TYPES[type];
    const label = str(raw && raw.label);
    const positie = `veld ${index + 1}${label ? ` ("${label}")` : ''}`;

    // Opmaakblokken hebben geen sleutel nodig; ze leveren niets aan de payload.
    let key = '';
    if (spec.input) {
      key = str(raw && raw.field_key) || normalizeFieldKey(label);
      if (!key) {
        errors.push(`Geef ${positie} een veldnaam.`);
      } else if (!isValidFieldKey(key)) {
        // Mét het label erbij: een melding over enkel de veldnaam laat je
        // zoeken naar welk veld ze bedoelt, en bij een lang formulier is dat
        // niet te doen.
        errors.push(`De veldnaam "${key}" bij ${positie} kan niet: begin met een letter, en gebruik enkel kleine letters, cijfers en liggende streepjes.`);
      } else if (RESERVED_FIELD_KEYS.has(key)) {
        errors.push(`"${key}" is een gereserveerde naam — kies een andere veldnaam voor ${positie}.`);
      } else if (key.startsWith(META_PREFIX)) {
        errors.push(`Veldnamen mogen niet met "${META_PREFIX}" beginnen; die prefix is voor de herkomstgegevens (${positie}).`);
      } else if (seen.has(key)) {
        errors.push(`De veldnaam "${key}" komt twee keer voor.`);
      }
      seen.add(key);
    }

    if (spec.input && !label && type !== 'hidden') {
      errors.push(`Geef ${positie} een label.`);
    }

    // Opties
    let options = [];
    if (spec.options) {
      const rawOptions = Array.isArray(raw && raw.options) ? raw.options : [];
      const seenValues = new Set();
      rawOptions.slice(0, MAX_OPTIONS).forEach((opt) => {
        const value = str(opt && (opt.value !== undefined ? opt.value : opt.label));
        const optLabel = str(opt && (opt.label !== undefined ? opt.label : opt.value));
        if (!value || seenValues.has(value)) return;
        seenValues.add(value);
        options.push({ value, label: optLabel || value });
      });
      if (options.length === 0) {
        errors.push(`${positie} is een keuzeveld en heeft minstens één optie nodig.`);
      }
    }

    const odooType = ODOO_FIELD_TYPES.includes(raw && raw.odoo_field_type)
      ? raw.odoo_field_type
      : spec.odooType;

    fields.push({
      order_index: index,
      field_key: key,
      field_type: type,
      label,
      help_text: str(raw && raw.help_text) || null,
      placeholder: str(raw && raw.placeholder) || null,
      is_required: spec.input ? Boolean(raw && raw.is_required) : false,
      default_value: str(raw && raw.default_value) || null,
      options,
      width: FIELD_WIDTHS.includes(raw && raw.width) ? raw.width : 'full',
      validation: normalizeValidation(raw && raw.validation),
      odoo_field_type: odooType,
      i18n: normalizeI18n(
        raw && raw.i18n,
        languages,
        defaultLanguage,
        FIELD_I18N_KEYS,
        options.map((o) => String(o.value))
      ),
    });
  });

  // Vastgezette sleutels mogen niet verdwijnen. Zie de migratie: een sleutel die
  // al in fs_v2_mappings.source_value en in bewaarde payloads staat, hernoemen
  // betekent dat een koppeling zonder foutmelding een leeg veld naar Odoo
  // schrijft. Verwijderen is even erg als hernoemen — beide laten dezelfde stap
  // stil leeglopen — dus beide worden hier geweigerd.
  for (const locked of lockedKeys) {
    if (!seen.has(locked)) {
      errors.push(`Het veld "${locked}" heeft al inzendingen en mag niet hernoemd of verwijderd worden. Verberg het desnoods, of maak een nieuw veld ernaast.`);
    }
  }

  // Een gepubliceerd formulier zonder invoervelden is een knop en verder niets.
  if (status === 'published' && fields.filter((f) => FIELD_TYPES[f.field_type].input).length === 0) {
    errors.push('Voeg minstens één invoerveld toe voor je publiceert.');
  }

  // Publiceren met een onvolledige vertaling wordt geweigerd.
  //
  // Zonder deze controle valt een ontbrekend Frans label stil terug op het
  // Nederlands, en dan staat er een half Nederlands formulier op een Franse
  // pagina zonder dat iemand het merkt -- want er is geen foutmelding, er is
  // gewoon tekst. Beter nu tegenhouden dan er over drie maanden achterkomen.
  //
  // Alleen wat de bezoeker MOET kunnen lezen telt mee: labels, de knop, de
  // bedanktekst en de naam. Een hulptekst of placeholder mag ontbreken; die
  // valt bewust terug op leeg in plaats van op het Nederlands.
  if (status === 'published') {
    for (const lang of languages) {
      if (lang === defaultLanguage) continue;
      const taal = LANGUAGES[lang].label;
      const vertaling = form.i18n[lang] || {};

      const ontbreekt = [];
      if (!str(vertaling.name)) ontbreekt.push('de naam van het formulier');
      if (!str(vertaling.submit_label)) ontbreekt.push('de tekst op de verstuurknop');
      if (!str(vertaling.success_message)) ontbreekt.push('de bedanktekst');

      const veldenZonder = fields.filter((f) => {
        const spec = FIELD_TYPES[f.field_type];
        // Een verborgen veld heeft geen label dat iemand leest; opmaakblokken
        // gebruiken hun label wél als zichtbare tekst, dus die tellen mee.
        if (spec.input && f.field_type === 'hidden') return false;
        return !str(f.i18n[lang] && f.i18n[lang].label);
      });

      if (veldenZonder.length) {
        const namen = veldenZonder.slice(0, 3).map((f) => `"${f.label || f.field_key}"`).join(', ');
        const rest = veldenZonder.length > 3 ? ` en ${veldenZonder.length - 3} andere` : '';
        ontbreekt.push(`het label van ${namen}${rest}`);
      }

      if (ontbreekt.length) {
        errors.push(`De ${taal}e vertaling is niet af: ${ontbreekt.join(', ')} ontbreekt nog. Vul ze aan, of haal ${taal} weg bij de talen van dit formulier.`);
      }
    }
  }

  return { errors, form, fields };
}

function normalizeValidation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of ['minlength', 'maxlength', 'min', 'max']) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) out[key] = value;
  }
  // Geen vrij patroon in v1: een regex uit de UI is een aanvalsvlak
  // (catastrophic backtracking) en er is vandaag geen enkel formulier dat het
  // nodig heeft. Type + required + min/max dekt alles wat we gebruiken.
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wat de website te zien krijgt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De publieke vorm van een formulier: precies genoeg om te renderen en te
 * valideren, en niets meer. Bewust GEEN integration_id, geen odoo_field_type,
 * geen interne id's — die horen niet op een publieke pagina, ook niet als de
 * plugin ze server-side ophaalt.
 */
export function toPublicFormPayload(form, fields) {
  const languages = Array.isArray(form.languages) && form.languages.length
    ? form.languages.filter(isLanguage)
    : [DEFAULT_LANGUAGE];
  const defaultLanguage = isLanguage(form.default_language) ? form.default_language : DEFAULT_LANGUAGE;

  // ALLE talen in één payload, en de plugin kiest.
  //
  // De voor de hand liggende andere aanpak -- ?lang=fr en de server stuurt het
  // vertaalde formulier -- geeft een cache-ingang en een ETag PER TAAL. Een
  // pagina die zowel NL als FR toont haalt dan twee keer op, en na een wijziging
  // verloopt de ene taal voor de andere. Eén payload voor alles is een paar
  // honderd bytes groter en heeft geen van die problemen.
  const messages = {};
  for (const lang of languages) messages[lang] = MESSAGES[lang] || MESSAGES[DEFAULT_LANGUAGE];

  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    description: form.description || '',
    version: form.version,
    submit_label: form.submit_label,
    success_mode: form.success_mode,
    success_message: form.success_message,
    redirect_url: form.success_mode === 'redirect' ? form.redirect_url : null,
    theme: form.theme || {},
    languages,
    default_language: defaultLanguage,
    i18n: (form.i18n && typeof form.i18n === 'object' && !Array.isArray(form.i18n)) ? form.i18n : {},
    messages,
    fields: (fields || []).map((f) => ({
      key: f.field_key || null,
      type: f.field_type,
      label: f.label,
      help_text: f.help_text || '',
      placeholder: f.placeholder || '',
      required: Boolean(f.is_required),
      default_value: f.default_value || '',
      options: Array.isArray(f.options) ? f.options : [],
      width: f.width,
      validation: f.validation || {},
      i18n: (f.i18n && typeof f.i18n === 'object' && !Array.isArray(f.i18n)) ? f.i18n : {},
    })),
  };
}

/**
 * De vorm van één formulier in de LIJST die de plugin ophaalt om er een
 * shortcode van te maken.
 *
 * Bewust veel lichter dan toPublicFormPayload(): een beheerder die een
 * shortcode zoekt heeft de velden niet nodig, en tien volledige schema's
 * ophalen om een keuzelijst te vullen is verspilling. Geen interne id's --
 * de slug is wat in de shortcode staat en verder heeft niemand iets nodig.
 */
export function toPublicFormListItem(form, fieldCount) {
  return {
    slug: form.slug,
    name: form.name,
    description: form.description || '',
    version: form.version,
    field_count: Number(fieldCount) || 0,
    updated_at: form.updated_at || null,
    // Wél de talen: de shortcode-bouwer moet lang="fr" kunnen aanbieden, en
    // zonder deze lijst zou hij talen voorstellen die het formulier niet heeft.
    languages: Array.isArray(form.languages) && form.languages.length ? form.languages : [DEFAULT_LANGUAGE],
    default_language: isLanguage(form.default_language) ? form.default_language : DEFAULT_LANGUAGE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Een binnenkomende inzending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serverzijdige controle van een inzending.
 *
 * De plugin valideert ook al in PHP (en de browser via required/type), maar dat
 * is gebruiksgemak, geen beveiliging: een POST komt hier ook binnen zonder ooit
 * een pagina geopend te hebben. Dit is de enige controle die telt.
 *
 * Geeft { errors, values } — values bevat enkel bekende veldsleutels, in de
 * volgorde van het formulier. Alles wat niet in het formulier staat wordt
 * WEGGEGOOID: anders kan een willekeurige poster elke sleutel bijverzinnen die
 * een mapping toevallig verwacht.
 */
export function validateSubmissionValues(fields, rawValues, lang = DEFAULT_LANGUAGE) {
  const taal = isLanguage(lang) ? lang : DEFAULT_LANGUAGE;
  const errors = [];
  const values = {};
  const source = (rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)) ? rawValues : {};

  for (const field of fields || []) {
    const spec = FIELD_TYPES[field.field_type];
    if (!spec || !spec.input) continue;

    const key = field.field_key;
    let raw = source[key];

    if (Array.isArray(raw)) raw = raw.map((v) => str(v)).filter(Boolean).join(', ');
    else if (raw && typeof raw === 'object') raw = '';
    else raw = str(raw);

    if (!raw && field.default_value) raw = str(field.default_value);
    if (raw.length > MAX_TEXT_VALUE) raw = raw.slice(0, MAX_TEXT_VALUE);

    // Het label in de taal van de bezoeker: een Franse melding die naar een
    // Nederlands veldlabel verwijst laat iemand zoeken naar een veld dat zo niet
    // op zijn scherm staat.
    const naam = pickText(field, field.i18n, taal, 'label') || key;

    if (field.is_required && !raw) {
      errors.push(t(taal, 'required', { label: naam }));
      values[key] = '';
      continue;
    }

    if (raw) {
      if (field.field_type === 'email' && !isPlausibleEmail(raw)) {
        errors.push(t(taal, 'email', { label: naam }));
      }
      if (field.field_type === 'number' && !Number.isFinite(Number(raw.replace(',', '.')))) {
        errors.push(t(taal, 'number', { label: naam }));
      }
      if (field.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        errors.push(t(taal, 'date', { label: naam }));
      }

      // Keuzevelden: de waarde MOET uit de lijst komen. Zonder deze controle kan
      // iemand een willekeurige string in een Odoo-selectieveld duwen.
      if (spec.options) {
        const toegestaan = new Set((field.options || []).map((o) => String(o.value)));
        const ingediend = spec.multi ? raw.split(',').map((v) => v.trim()).filter(Boolean) : [raw];
        const onbekend = ingediend.filter((v) => !toegestaan.has(v));
        if (onbekend.length) {
          errors.push(t(taal, 'unknown_choice', { label: naam, value: onbekend[0] }));
        }
      }

      const v = field.validation || {};
      if (Number.isFinite(v.minlength) && raw.length < v.minlength) {
        errors.push(t(taal, 'minlength', { label: naam, n: v.minlength }));
      }
      if (Number.isFinite(v.maxlength) && raw.length > v.maxlength) {
        errors.push(t(taal, 'maxlength', { label: naam, n: v.maxlength }));
      }
      if (field.field_type === 'number') {
        const getal = Number(raw.replace(',', '.'));
        if (Number.isFinite(v.min) && getal < v.min) errors.push(t(taal, 'min', { label: naam, n: v.min }));
        if (Number.isFinite(v.max) && getal > v.max) errors.push(t(taal, 'max', { label: naam, n: v.max }));
      }
    }

    values[key] = raw;
  }

  return { errors, values };
}

/**
 * Bewust soepel: dit is geen adrescontrole maar een vangnet tegen tikfouten.
 * Een te strenge regex weigert geldige adressen, en dat kost inzendingen.
 */
function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * De payload bouwen die de bestaande pipeline binnengaat.
 *
 * GEVERIFIEERD tegen worker-handler.js: normalizeFormValues() neemt
 * `form_data` (tweede kandidaat na `form_fields`) en resolveFormId() neemt
 * `form_id` (eerste kandidaat). Er is dus niets aan die functies gewijzigd om
 * dit te laten werken — een OM-formulier is voor de pipeline gewoon een derde
 * bron naast Forminator en de generieke webhook.
 *
 * De meta-waarden worden hier IN form_data gezet met een `meta_`-prefix.
 * Reden: normalizeFormValues() kijkt alleen naar form_data, dus een los
 * meta-object zou onbereikbaar zijn in het koppelingsscherm. Zo is
 * meta_utm_source gewoon een veld dat je naar Odoo kan mappen.
 */
export function buildPipelinePayload(form, values, meta) {
  const formData = { ...values };

  for (const key of META_KEYS) {
    const value = str(meta && meta[key]);
    if (value) formData[META_PREFIX + key] = value;
  }

  // De identiteit van het formulier OOK als mapbaar veld. Ze staat hierboven al
  // op het hoogste niveau, maar normalizeFormValues() kijkt alleen naar
  // form_data -- en in het Forminator-tijdperk werd `ovme_forminator_id` wel
  // naar Odoo geschreven. Dit is de opvolger daarvan. Bewust uit het
  // FORMULIER-record en niet uit wat de plugin meestuurt: zo kan een site niet
  // beweren dat ze een ander formulier is.
  formData[META_PREFIX + 'form_slug'] = String(form.slug || '');
  formData[META_PREFIX + 'form_id'] = String(form.id || '');

  return {
    form_id: form.id,
    form_slug: form.slug,
    form_name: form.name,
    form_version: form.version,
    form_data: formData,
  };
}
