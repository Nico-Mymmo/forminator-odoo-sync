-- =============================================================================
-- om-sales — spiegel van de verkoopgegevens uit Odoo (binding SALES_DB)
-- =============================================================================
-- De OM is de ENIGE schrijver (src/modules/dashboards/lib/sales/sync.js).
-- Alles behalve subscription_snapshots is een kopie van Odoo: weg te gooien en
-- opnieuw op te bouwen met een volledige sync. Niets hierin is afgeleid; de
-- regels (actief, nieuw, verloren, wissel, merk, product) staan in
-- src/modules/dashboards/lib/sales/derive.js en lead-rules.js.
--
-- Kolomnamen volgen Odoo, met twee afkortingen die overal terugkomen:
--   origin_id  = sale.order.origin_order_id  (eerste contract van de keten)
--   parent_id  = sale.order.subscription_id  (het DIRECT vorige contract)
-- Groeperen gebeurt ALTIJD op origin_id. Op parent_id groeperen liet vanaf de
-- tweede verlenging orders wegvallen (docs/ontwerp-om-verkoopdashboard.md §4.1).
--
-- Datums: 'YYYY-MM-DD' voor date-velden, 'YYYY-MM-DD HH:MM:SS' (UTC, zoals
-- Odoo) voor datetime-velden. Booleans als 0/1. Many2many als JSON-array.
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY,
  name                TEXT,
  state               TEXT,          -- draft | sent | sale | done | cancel
  sub_state           TEXT,          -- subscription_state, NULL voor gewone orders
  origin_id           INTEGER,
  parent_id           INTEGER,
  partner_id          INTEGER,
  commercial_id       INTEGER,       -- commercial_partner_id: de klant zelf, ook als de order op een contactpersoon staat
  plan_id             INTEGER,
  start_date          TEXT,
  end_date            TEXT,
  next_invoice_date   TEXT,
  first_contract_date TEXT,
  date_order          TEXT,
  close_reason_id     INTEGER,
  recurring_monthly   REAL,
  amount_untaxed      REAL,
  user_id             INTEGER,
  team_id             INTEGER,
  opportunity_id      INTEGER,
  company_type_id     INTEGER,       -- x_studio_partner_company_type (van de orderpartner, ter controle)
  create_date         TEXT,
  write_date          TEXT
);
CREATE INDEX IF NOT EXISTS orders_origin ON orders (origin_id);
CREATE INDEX IF NOT EXISTS orders_commercial ON orders (commercial_id);
CREATE INDEX IF NOT EXISTS orders_write ON orders (write_date);

CREATE TABLE IF NOT EXISTS order_lines (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL,
  product_id      INTEGER,
  uom             TEXT,             -- naam van de eenheid (Kavels, Apartments, Houses, ...)
  qty             REAL,             -- product_uom_qty
  price_unit      REAL,
  discount        REAL,
  price_subtotal  REAL,
  is_recurring    INTEGER,
  display_type    TEXT,
  write_date      TEXT
);
CREATE INDEX IF NOT EXISTS order_lines_order ON order_lines (order_id);

-- sale.order.log: Odoo's eigen MRR-logboek. Begint op 2025-03-11, de dag waarop
-- alle abonnementen in Odoo (opnieuw) aangemaakt zijn; de creatie van oudere
-- abonnementen staat daar op die datum. Daarom NIET de bron van de historiek.
CREATE TABLE IF NOT EXISTS order_logs (
  id                 INTEGER PRIMARY KEY,
  order_id           INTEGER,
  origin_id          INTEGER,
  event_type         TEXT,
  event_date         TEXT,
  amount_signed      REAL,
  recurring_monthly  REAL,
  sub_state          TEXT
);
CREATE INDEX IF NOT EXISTS order_logs_origin ON order_logs (origin_id);

CREATE TABLE IF NOT EXISTS invoices (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT,
  move_type              TEXT,      -- out_invoice | out_refund
  state                  TEXT,      -- draft | posted | cancel
  payment_state          TEXT,
  partner_id             INTEGER,
  commercial_id          INTEGER,
  invoice_date           TEXT,
  invoice_date_due       TEXT,
  invoice_origin         TEXT,
  amount_untaxed_signed  REAL,
  amount_total_signed    REAL,
  amount_residual        REAL,
  payment_term_id        INTEGER,
  write_date             TEXT
);
CREATE INDEX IF NOT EXISTS invoices_commercial ON invoices (commercial_id);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id              INTEGER PRIMARY KEY,
  move_id         INTEGER NOT NULL,
  product_id      INTEGER,
  qty             REAL,
  price_subtotal  REAL,             -- in de valuta van de factuur, zonder teken van de creditnota
  sale_line_ids   TEXT,             -- JSON-array van sale.order.line-id's
  write_date      TEXT
);
CREATE INDEX IF NOT EXISTS invoice_lines_move ON invoice_lines (move_id);

-- Enkel de partners die ergens naar verwezen worden (orders, facturen, leads,
-- actiebladen) en hun ouder. res.partner telt honderdduizenden contacten.
CREATE TABLE IF NOT EXISTS partners (
  id                  INTEGER PRIMARY KEY,
  name                TEXT,
  is_company          INTEGER,
  parent_id           INTEGER,
  commercial_id       INTEGER,
  company_type_id     INTEGER,
  contact_type_id     INTEGER,
  company_status      TEXT,
  current_syndic_type TEXT,
  number_of_plots     INTEGER,
  number_of_apartments INTEGER,
  parent_expert_id    INTEGER,
  invoiced_by_partner INTEGER,
  non_invoiced        INTEGER,
  lang                TEXT,
  zip                 TEXT,
  city                TEXT,
  active              INTEGER,
  create_date         TEXT,
  write_date          TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY,   -- product.product
  template_id   INTEGER,
  name          TEXT,
  is_recurring  INTEGER,
  categ         TEXT,
  default_code  TEXT,
  active        INTEGER
);

CREATE TABLE IF NOT EXISTS leads (
  id                  INTEGER PRIMARY KEY,
  name                TEXT,
  type                TEXT,            -- lead | opportunity
  active              INTEGER,
  stage_id            INTEGER,
  lost_reason_id      INTEGER,
  partner_id          INTEGER,
  user_id             INTEGER,
  team_id             INTEGER,
  source_id           INTEGER,
  campaign_id         INTEGER,
  medium_id           INTEGER,
  brand_origin        TEXT,            -- x_studio_brand_origin
  lead_channel        TEXT,            -- x_studio_lead_channel
  syndicoach_pack     TEXT,            -- x_syndicoach_pack
  is_expert           INTEGER,         -- x_studio_isexpertlead
  tags                TEXT,            -- JSON-array van labelnamen
  actionsheet_ids     TEXT,            -- JSON-array
  expected_revenue    REAL,
  create_date         TEXT,
  date_closed         TEXT,
  date_last_stage_update TEXT,
  date_conversion     TEXT,
  write_date          TEXT
);
CREATE INDEX IF NOT EXISTS leads_create ON leads (create_date);
CREATE INDEX IF NOT EXISTS leads_partner ON leads (partner_id);

CREATE TABLE IF NOT EXISTS action_sheets (
  id                  INTEGER PRIMARY KEY,
  company_id          INTEGER,         -- x_studio_for_company_id (het gebouw)
  contact_id          INTEGER,
  apartments          INTEGER,
  plots               INTEGER,
  co_owners           INTEGER,
  current_syndic_type TEXT,
  hoa_established     INTEGER,
  has_commercial_plots INTEGER,
  lead_ids            TEXT,            -- JSON-array (x_studio_as_opportunity_ids)
  user_id             INTEGER,
  create_date         TEXT,
  write_date          TEXT
);
CREATE INDEX IF NOT EXISTS action_sheets_company ON action_sheets (company_id);

-- Kleine opzoeklijsten: kind = close_reason | plan | company_type | contact_type
-- | stage | lost_reason | user | team | utm_source | utm_campaign | utm_medium
-- | payment_term, of 'sel:<model>.<veld>' voor de labels van een selectieveld.
-- extra = JSON met wat een soort nog nodig heeft (stage: sequence, is_won).
CREATE TABLE IF NOT EXISTS lookups (
  kind   TEXT NOT NULL,
  id     TEXT NOT NULL,
  name   TEXT,
  extra  TEXT,
  PRIMARY KEY (kind, id)
);

-- Het enige wat NIET uit Odoo te herbouwen is: per dag per keten de stand,
-- want Odoo overschrijft subscription_state. Eén rij per (dag, keten).
CREATE TABLE IF NOT EXISTS subscription_snapshots (
  day               TEXT NOT NULL,
  origin_id         INTEGER NOT NULL,
  current_order_id  INTEGER,
  customer_id       INTEGER,
  status            TEXT,
  mrr               REAL,
  company_type_id   INTEGER,
  plan_id           INTEGER,
  PRIMARY KEY (day, origin_id)
);

-- Voortgang van de sync per model.
CREATE TABLE IF NOT EXISTS sync_state (
  model            TEXT PRIMARY KEY,
  last_write_date  TEXT,
  last_run_at      TEXT,
  last_full_at     TEXT,
  rows             INTEGER,
  last_error       TEXT
);
