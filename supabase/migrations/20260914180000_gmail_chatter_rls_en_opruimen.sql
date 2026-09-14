-- Gmail → chatter: de twee tabellen dichtzetten en voorbereiden op opruimen.
--
-- WAAROM RLS ZONDER POLICIES. Deze tabellen worden UITSLUITEND door de Worker
-- aangeraakt, en die praat met de service role key (zie src/lib/database.js).
-- Die sleutel omzeilt RLS volledig, dus een deny-all raakt de applicatie niet.
-- Zonder deze regel staan de tabellen in Supabase als "Unrestricted" en kan
-- iedereen met de anon key ze uitlezen — en daar staan e-mailadressen van
-- klanten en onderwerpregels van correspondentie in.
--
-- Er komen dus BEWUST geen policies bij: geen enkele rol buiten service_role
-- heeft hier iets te zoeken. Wie het scherm gebruikt, komt binnen via de
-- Worker, die zelf al server-side op `user_email` filtert (routes.js).

ALTER TABLE gmail_sync_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_captured_messages  ENABLE ROW LEVEL SECURITY;

-- Index voor de opruimronde (lib/store.js → ruimOp).
-- De opruiming filtert op status + ouderdom; zonder deze index wordt dat een
-- sequentiële scan over de hele tabel, elke vijf minuten.
CREATE INDEX IF NOT EXISTS gmail_captured_opruimen_idx
  ON gmail_captured_messages (status, created_at);
