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
 * { field_id, label, type, required }
 */

const SKIP_TYPES = new Set([
  'page-break',
  'group',
  'html',
  'section',
  'captcha'
]);

/**
 * @param {Array} fields - Ruwe velden van WP (raw_schema[n].fields)
 * @returns {Array} Flattened mappable velden
 * @throws {Error} Bij dubbele field_id's
 */
export function flattenFields(fields) {
  if (!Array.isArray(fields)) return [];

  const seen   = new Set();
  const result = [];

  function addField(fieldId, label, type, required) {
    const id = String(fieldId);
    if (seen.has(id)) {
      throw new Error(`Dubbele field_id gedetecteerd: "${id}"`);
    }
    seen.add(id);
    result.push({
      field_id: id,
      label:    String(label ?? id),
      type:     String(type ?? 'text'),
      required: Boolean(required)
    });
  }

  for (const field of fields) {
    const type = String(field.type ?? '');

    // Regel 2 — skip niet-mappable types
    if (SKIP_TYPES.has(type)) continue;

    // Regel 1 — composite: parent overslaan, children toevoegen
    if (field.is_composite === true) {
      const children = Array.isArray(field.children) ? field.children : [];

      // Regel 5 — composite zonder children: overslaan
      if (children.length === 0) continue;

      for (const child of children) {
        addField(child.field_id, child.label, child.type ?? type, child.required ?? field.required);
      }
      continue;
    }

    // Regel 3 — normaal veld
    addField(field.field_id, field.label, type, field.required);
  }

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
