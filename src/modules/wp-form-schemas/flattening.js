/**
 * wp-form-schemas — flattening logic
 *
 * Regels:
 * 1. field.is_composite === true  → parent NIET toevoegen; elk child afzonderlijk toevoegen
 * 2. type in SKIP_TYPES            → volledig negeren
 * 3. Alles anders                  → rechtstreeks mappable veld
 * 4. Dubbele field_id              → Error gooien
 * 5. Composite zonder children     → overslaan (geen velden te mappen)
 *
 * Geretourneerde structuur per veld:
 * { field_id, label, type, required, choices? }
 *
 * choices: aanwezig voor keuzevelden (radio, checkbox, select, …):
 *   [{ value: string, label: string }]
 *   value = de waarde die Forminator instuurt bij verzending
 *   label = de weergavenaam in het formulier
 */

const SKIP_TYPES = new Set([
  'page-break',
  'group',
  'html',
  'section',
  'captcha'
]);

/**
 * Veldtypes die keuzeopties kunnen bevatten.
 * Voor deze types worden choices (indien aanwezig in het raw schema) bewaard.
 */
const CHOICE_TYPES = new Set([
  'radio',
  'checkbox',
  'select',
  'multiselect',
  'multi-select',
]);

/**
 * Extraheer keuzemogelijkheden uit een raw Forminator-veld.
 *
 * Forminator stuurt altijd een 'choices'-sleutel, ook voor niet-keuzevelden (dan []).
 * Fallback naar 'options' en 'values' voor alternatieve notaties.
 *
 * @param {Object} field - Eén raw veld uit het WP-schema
 * @returns {Array<{value: string, label: string}>|null} - null als geen/lege choices
 */
function extractChoices(field) {
  // Primaire sleutel: 'choices' (WP Forminator openvme/v1 endpoint)
  // Fallback: 'options', 'values' voor andere notaties
  const raw = field.choices ?? field.options ?? field.values ?? null;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const result = [];
  for (const opt of raw) {
    if (typeof opt === 'string') {
      if (opt) result.push({ value: opt, label: opt });
      continue;
    }
    if (opt && typeof opt === 'object') {
      // WP Forminator stuurt { label, value } — fallback naar andere notaties
      const v = String(opt.value ?? opt.key ?? opt.id ?? opt.label ?? '').trim();
      const l = String(opt.label ?? opt.text ?? opt.title ?? opt.value ?? '').trim();
      if (v) result.push({ value: v, label: l || v });
    }
  }
  return result.length > 0 ? result : null;
}

/**
 * @param {Array} fields - Ruwe velden van WP (raw_schema[n].fields)
 * @returns {Array} Flattened mappable velden
 * @throws {Error} Bij dubbele field_id's
 */
export function flattenFields(fields) {
  if (!Array.isArray(fields)) return [];

  const seen   = new Set();
  const result = [];

  function addField(fieldId, label, type, required, choices, isComposite, compositeChildren, parentFieldId) {
    const id = String(fieldId);
    if (seen.has(id)) {
      throw new Error(`Dubbele field_id gedetecteerd: "${id}"`);
    }
    seen.add(id);
    const entry = {
      field_id: id,
      label:    String(label ?? id),
      type:     String(type ?? 'text'),
      required: Boolean(required)
    };
    if (choices && choices.length > 0) entry.choices = choices;
    if (isComposite) {
      entry.is_composite = true;
      if (compositeChildren && compositeChildren.length > 0) entry.composite_children = compositeChildren;
    }
    if (parentFieldId) entry.parent_field_id = String(parentFieldId);
    result.push(entry);
  }

  for (const field of fields) {
    const type = String(field.type ?? '');

    // Regel 2 — skip niet-mappable types
    if (SKIP_TYPES.has(type)) continue;

    // Regel 1 — composite: zowel de ouder als de kinderen toevoegen
    if (field.is_composite === true) {
      const children = Array.isArray(field.children) ? field.children : [];

      // Regel 5 — composite zonder children: overslaan
      if (children.length === 0) continue;

      // Ouder: mappable als gecombineerde waarde (in de worker samengevoegd met spatie)
      addField(
        field.field_id,
        field.label,
        type,
        field.required,
        null,   // ouder heeft zelf geen choices
        true,   // is_composite
        children.map(c => String(c.field_id))  // composite_children
      );

      // Kinderen: individueel mappable als sub-veld
      for (const child of children) {
        const childType = String(child.type ?? type);
        const childChoices = CHOICE_TYPES.has(childType) ? extractChoices(child) : null;
        addField(
          child.field_id,
          child.label,
          childType,
          child.required ?? field.required,
          childChoices,
          false,               // not composite
          null,                // no composite_children
          String(field.field_id)  // parent_field_id
        );
      }
      continue;
    }

    // Regel 3 — normaal veld (inclusief keuzevelden)
    const choices = CHOICE_TYPES.has(type) ? extractChoices(field) : null;
    addField(field.field_id, field.label, type, field.required, choices);  }

  return result;
}

/**
 * Flatten een volledig raw schema (array van forms met .fields).
 * Retourneert Map<form_id, Array> met flattened velden per formulier.
 *
 * @param {Array} rawForms
 * @returns {Map<string, Array>}
 */
export function flattenRawSchema(rawForms) {
  const result = new Map();
  for (const form of rawForms) {
    const formId = String(form.form_id);
    result.set(formId, flattenFields(form.fields ?? []));
  }
  return result;
}
