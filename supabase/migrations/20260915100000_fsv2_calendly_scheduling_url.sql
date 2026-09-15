-- Koppelingen — Calendly: de BOEKINGSPAGINA als kopie bij de koppeling.
--
-- Waarom dit nodig is: de shortcode-bouwer van de mymmo-forms-plugin laat je
-- bij een knop-met-venster een "link naar de agenda" instellen, en die werd met
-- de hand geplakt. Een getypte Calendly-URL is onzichtbaar fout: een typfout of
-- een eventtype dat in Calendly hernoemd is, geeft een leeg tweede tabblad en
-- geen enkele foutmelding. Erger nog, niets garandeert dat de geplakte pagina
-- HOORT bij een eventtype dat de OM ook echt opvangt -- een boeking op zo'n
-- pagina belandt dan in het vangnet of nergens.
--
-- Met de boekingspagina als kolom kan de publieke API een lijst "gekende
-- afspraken" teruggeven en wordt het in wp-admin een keuzelijst.
--
-- Een KOPIE en geen live-bevraging van Calendly: precies dezelfde afweging als
-- calendly_event_type_name hierboven ("als kopie bewaard zodat het scherm iets
-- kan tonen zonder Calendly te bevragen"). De publieke API mag niet afhangen
-- van een externe dienst en van een token dat er niet hoeft te zijn.
--
-- Gevolg: bestaande Calendly-koppelingen hebben deze waarde pas nadat iemand
-- hun Calendly-tabblad één keer opslaat. Tot dan staan ze niet in de keuzelijst
-- (liever afwezig dan met een lege link).

ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS calendly_scheduling_url text    NULL,
  ADD COLUMN IF NOT EXISTS calendly_duration       integer NULL;

COMMENT ON COLUMN fs_v2_integrations.calendly_scheduling_url IS
  'De publieke boekingspagina van het gekozen eventtype (https://calendly.com/...). Kopie uit Calendly, gezet bij het opslaan van de Calendly-instellingen. Voedt de keuzelijst "gekende afspraken" in de WordPress-plugin.';
COMMENT ON COLUMN fs_v2_integrations.calendly_duration IS
  'Duur in minuten van het gekozen eventtype. Enkel om de keuzelijst leesbaar te maken ("Kennismaking — 30 min").';
