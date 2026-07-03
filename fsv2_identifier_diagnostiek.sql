-- ══════════════════════════════════════════════════════════════
-- DIAGNOSTIEK ronde 2: is_identifier op mappings + identifier_field op targets
-- ══════════════════════════════════════════════════════════════

-- 1. Alle mappings met is_identifier = true
SELECT
  i.name                 AS integratie,
  t.id                   AS target_id,
  t.odoo_model,
  t.identifier_field     AS target_identifier_field,
  m.id                   AS mapping_id,
  m.odoo_field,
  m.source_type,
  m.source_value,
  m.is_identifier,
  m.order_index
FROM fs_v2_mappings m
JOIN fs_v2_targets t ON t.id = m.target_id
JOIN fs_v2_integrations i ON i.id = t.integration_id
WHERE m.is_identifier = true
ORDER BY i.name, t.id;

-- ──────────────────────────────────────────────────────────────
-- 2. Voor elk target: identifier_field + hoeveel mappings voor dat odoo_field
SELECT
  i.name                 AS integratie,
  t.id                   AS target_id,
  t.odoo_model,
  t.identifier_field,
  COUNT(m.id) FILTER (WHERE m.odoo_field = t.identifier_field) AS mappings_voor_identifier,
  COUNT(m.id) FILTER (WHERE m.is_identifier = true)            AS mappings_met_is_identifier_true
FROM fs_v2_targets t
JOIN fs_v2_integrations i ON i.id = t.integration_id
LEFT JOIN fs_v2_mappings m ON m.target_id = t.id
GROUP BY i.name, t.id, t.odoo_model, t.identifier_field
ORDER BY i.name, t.odoo_model;

-- ──────────────────────────────────────────────────────────────
-- 3. Volledig overzicht van ALLE mappings per target (gesorteerd)
SELECT
  i.name                 AS integratie,
  t.id                   AS target_id,
  t.odoo_model,
  t.identifier_field,
  m.odoo_field,
  m.source_type,
  m.source_value,
  m.is_identifier,
  m.is_required,
  m.order_index
FROM fs_v2_targets t
JOIN fs_v2_integrations i ON i.id = t.integration_id
LEFT JOIN fs_v2_mappings m ON m.target_id = t.id
ORDER BY i.name, t.id, m.order_index;
