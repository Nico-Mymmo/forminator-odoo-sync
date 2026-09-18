-- ============================================================================
-- Koppelingen — module-breed pdf-sjabloon voor de "PDF genereren"-stap
-- ============================================================================
-- Datum: 2026-09-18
-- Zie docs/plan-offerte-pdf-stap.md voor de volledige onderbouwing.
--
-- Eén tabel, in de vorm van window.OFFERTE_DATA + window.OFFERTE_VELDEN uit
-- public/offerte-data.js: `data` = { gegevens, copy, velden }. `gegevens` is
-- hier altijd een STANDAARDWAARDE (bedrijfsnaam, demo-klant, ...), nooit
-- klantdata van een binnengekomen inzending -- die komt per generatie uit de
-- mapping van de pdf-stap en wordt nergens in deze tabel bewaard.
--
-- RLS volgt hetzelfde patroon als 20260910120000_fsv2_om_forms.sql: aan, met
-- een expliciete deny-all voor `public`. Alle databasetoegang loopt via
-- getSupabaseClient(env) met de service_role-sleutel, die RLS bypasst; de
-- echte rechtencontrole gebeurt in de Worker-routes.
--
-- Idempotent by design: IF NOT EXISTS overal, DROP POLICY IF EXISTS voor elke
-- CREATE POLICY, seed-insert achter WHERE NOT EXISTS.
-- ============================================================================

BEGIN;

-- ── 1. fs_v2_pdf_templates ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_v2_pdf_templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  fs_v2_pdf_templates IS
  'Module-breed pdf-sjabloon voor de generate_pdf-stap. data = { gegevens, copy, velden }, exact de vorm van window.OFFERTE_DATA + window.OFFERTE_VELDEN uit public/offerte-data.js.';
COMMENT ON COLUMN fs_v2_pdf_templates.data IS
  'gegevens = standaardwaarden (nooit klantdata), copy = de door een mens getypte tekst met {{pad.naar.waarde}}-verwijzingen, velden = gegroepeerde lijst van gegevens-paden voor het "Gegevens invullen"-scherm en de mapping-UI van de pdf-stap.';

-- ── 2. updated_at bijhouden ──────────────────────────────────────────────────
--
-- Vangnet zoals in 20260910120000_fsv2_om_forms.sql: maakt de functie enkel aan
-- als ze nog niet bestaat, vervangt een bestaande definitie nooit.

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    CREATE FUNCTION public.update_updated_at_column()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_fs_v2_pdf_templates_updated_at ON fs_v2_pdf_templates;
CREATE TRIGGER trg_fs_v2_pdf_templates_updated_at
  BEFORE UPDATE ON fs_v2_pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── 3. RLS: aan + deny-all voor public ───────────────────────────────────────

ALTER TABLE fs_v2_pdf_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_v2_pdf_templates_deny_all" ON fs_v2_pdf_templates;
CREATE POLICY "fs_v2_pdf_templates_deny_all"
  ON fs_v2_pdf_templates
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- ── 4. Seed: "Offerte gebouwbeheer" ──────────────────────────────────────────
--
-- Inhoud gegenereerd uit public/offerte-data.js (window.OFFERTE_DATA +
-- window.OFFERTE_VELDEN), niet overgetypt -- zie docs/plan-offerte-pdf-stap.md
-- §3.1. Achter WHERE NOT EXISTS zodat een tweede run geen dubbele rij geeft.

INSERT INTO fs_v2_pdf_templates (name, data)
SELECT
  'Offerte gebouwbeheer',
  '{"gegevens":{"offerte":{"nummer":"12347","datum":"17/09/2026","geldig_tot":"31/12/2026"},"klant":{"naam":"Linda Verstraeten"},"gebouw":{"adres":"Plantin en Moretuslei 255, 2018 Antwerpen","kavels":"26 kavels","bijzonderheden":"Lift, gemeenschappelijke tuin, collectieve verwarming"},"contact":{"naam":"Jiri Put","email":"jiri@syndicoach.com","foto":"offerte-assets/contact-jiri.png"},"prijs":{"maandelijks":"133","opstart":"960","licentie":"4","uurtarief":"80","verplaatsing":"0,42"},"bedrijf":{"naam":"Syndicoach","product":"Syndicoach Captain","platform":"OpenVME","kbo":"1040.396.957","biv":"202535","adres":"Borsbeeksebrug 1, 2600 Berchem","email":"info@syndicoach.be","telefoon":"03 657 28 50","website":"syndicoach.be"},"beeld":{"logo":"offerte-assets/syndicoach-logo.png","platform":"offerte-assets/openvme-platform.png","qr":"offerte-assets/qr-afspraak.png","pijl":"offerte-assets/pijl.png"}},"copy":{"kop":{"titel":"Offerte gebouwbeheer","regel":"{{bedrijf.product}}","geldig":"Tarieven geldig tot **{{offerte.geldig_tot}}**"},"voet":{"links":"{{bedrijf.naam}} · KBO {{bedrijf.kbo}} · BIV {{bedrijf.biv}} · {{bedrijf.adres}}","rechts":"{{bedrijf.email}} · {{bedrijf.telefoon}} · {{bedrijf.website}}"},"hero":{"titel":"Professioneel gebouwbeheer\nwaar je wél gelukkig van wordt.","tekst":"**{{bedrijf.product}}**: een professionele syndicus voor kleine tot middelgrote gebouwen.\nVolledig beheer van je gebouw, met 100% transparantie en ontzorging voor jullie."},"contact":{"titel":"Jouw contactpersoon"},"offerte":{"titel":"Offerte opgesteld voor","rijen":[{"label":"Adres","waarde":"{{gebouw.adres}}"},{"label":"Aangevraagd door","waarde":"{{klant.naam}}"},{"label":"Aantal kavels","waarde":"{{gebouw.kavels}}"},{"label":"Bijzonderheden","waarde":"{{gebouw.bijzonderheden}}"},{"label":"Offertenummer","waarde":"{{offerte.nummer}}"},{"label":"Datum","waarde":"{{offerte.datum}}"}]},"inleiding":{"titel":"Super dat jullie interesse hebben in {{bedrijf.naam}}!","tekst":"Bij ons is jullie beheer in goeie handen. In deze offerte vind je een overzicht van de kosten terug. Zijn er vragen of onduidelijkheden, aarzel dan zeker niet om ons te contacteren.\n\nTwijfel je tussen verschillende syndici en heb je nog een laatste duwtje in de rug nodig? We lijsten graag op waarom wij denken dat wij écht het verschil kunnen maken voor jullie!"},"vergelijking":{"titel":"Dit doet {{bedrijf.naam}} anders","kop":["","Klassieke syndicus","Bij {{bedrijf.naam}}"],"rijen":[["Aanwezigheid op AV","Soms niet aanwezig","Altijd fysiek aanwezig"],["Looptijd contract","Vaak drie jaar","Eén jaar"],["Mogelijk om zelf beheer over te nemen","Nooit","Altijd mogelijk, met ondersteuning"],["Financiële transparantie","Op vraag","Altijd zichtbaar in {{bedrijf.platform}}"],["Communicatie met leveranciers","Wordt niet gedeeld","Altijd zichtbaar in {{bedrijf.platform}}"],["Vragen van mede-eigenaars","Soms extra aangerekend","Inbegrepen"]]},"platform":{"titel":"Jouw gebouw altijd op zak","tekst":"Bij {{bedrijf.naam}} weet je altijd wat er speelt in je gebouw. Via ons platform {{bedrijf.platform}} houden we je transparant op de hoogte van alles wat we doen.\n\nElke bewoner, zowel huurders als eigenaars, heeft een persoonlijk portaal waarin je eenvoudig alles kunt opvolgen: van binnenkomende facturen en contacten met leveranciers tot tussentijdse afrekeningen. En het mooiste van alles: de data zijn en blijven van jullie."},"kosten":{"titel":"Wat kost het?","kaarten":[{"stijl":"blauw","label":"Maandelijks beheer","bedrag":"€{{prijs.maandelijks}}","voetnoot":"Voor het hele gebouw, ongeacht het aantal hoofdkavels","inhoudtitel":"Wat houdt dit in?","punten":["{{bedrijf.naam}} staat als syndicus in de KBO","Financieel beheer en boekhouding","Organisatie van de algemene vergadering","Altijd fysiek aanwezig op de algemene vergadering","Dagelijkse technische opvolging","Antwoord op de vragen van mede-eigenaars","Regelmatig overleg met de contactpersoon","Alles zichtbaar voor iedereen in {{bedrijf.platform}}"]},{"stijl":"roze","label":"Eenmalige opstartkost","bedrag":"€{{prijs.opstart}}","voetnoot":"Eén keer bij de opstart, voor het hele gebouw samen.","inhoudtitel":"Wat houdt dit in?","punten":["**Gebouwscan** ter plaatse: Het hele gebouw digitaal in kaart brengen in {{bedrijf.platform}}","Opstart van de boekhouding","Actieplan voor de wettelijke conformiteit","Reglement van interne orde en GDPR-register opmaken of updaten","Voorstelling van {{bedrijf.naam}} aan alle mede-eigenaars"]}],"strook":{"bedrag":"€{{prijs.licentie}}","titel":"Licentie {{bedrijf.platform}} platform","voetnoot":"Per hoofdkavel, per maand"}},"extra":{"titel":"Wat zijn mogelijke bijkomende kosten?","tekst":"Werk buiten het dagelijkse beheer registreren we per uur. Elk van deze prestaties staat met datum en omschrijving in het {{bedrijf.platform}} platform, dus jullie zien altijd waarvoor je betaalt.","rijen":[{"label":"Prestaties buiten het dagelijkse beheer (uurtarief)","waarde":"€ {{prijs.uurtarief}} per uur"},{"label":"Werkdagen buiten de kantooruren","waarde":"1.5 x uurtarief"},{"label":"Weekends en wettelijke feestdagen","waarde":"2 x uurtarief"},{"label":"Aanwezigheid buiten ons kantoor, inclusief verplaatsingstijd","waarde":"€ {{prijs.uurtarief}} per uur"},{"label":"Verplaatsingskost*","waarde":"€ {{prijs.verplaatsing}} per km"},{"label":"Vergaderzaal bij ons op kantoor, met water en koffie**","waarde":"gratis"}],"voetnoten":["*De verplaatsing van de gebouwscan zit in de opstartkost.","** Vergaderingen tot 30 deelnemers gaan door in ons kantoor in Berchem, tijdens de kantooruren ==ma tot vr, 9 tot 17 uur==. Op een andere locatie vergaderen kan ook, maar dan geldt een toeslag en draagt de VME de kosten van zaal en catering. Digitaal of hybride aansluiten kan altijd."]},"stappen":{"titel":"Wat gebeurt er nu?","items":[{"titel":"Bespreek deze offerte met mede-eigenaars:","tekst":"Stuur ze gerust door naar alle eigenaars, samen met de presentatie in bijlage. Wil je dat wij het zelf komen toelichten, digitaal of bij ons op kantoor, dan plannen we dat graag samen in."},{"titel":"Laat de VME beslissen.","tekst":"Dit kan met een eenparige schriftelijke beslissing van alle eigenaars, of met een gewone meerderheid op een algemene vergadering. In beide gevallen helpen we jullie hier bij."},{"titel":"Geef ons een seintje","tekst":"Hebben jullie gekozen om met {{bedrijf.naam}} aan de slag te gaan? Super! Wij plannen de gebouwscan in, vragen het dossier op bij de vorige beheerder en starten de boekhouding op."}],"slot":"Begin hier ruim voor de volgende algemene vergadering aan, dan is er tijd om alles voor te bereiden."},"vragen":{"titel":"Nog vragen?","items":[{"vraag":"Waarom rekenen jullie een opstartkost aan?","antwoord":"Een gebouw opstarten kost tijd: de boekhouding opzetten, de scan ter plaatse, alle leveranciers contacteren, een opstartvergadering houden. Veel kantoren verrekenen dat in de maandprijs en binden jullie daarom aan drie jaar. Wij zetten het apart, zodat jullie één keer betalen voor werk dat één keer gebeurt."},{"vraag":"Is ons gebouw met die opstart meteen wettelijk in orde?","antwoord":"Nee, dat beloven we niet. Soms ontbreekt een EPC of een asbestattest voor de gemene delen, of een keuring van een toestel. Wat er is, verzamelen en digitaliseren we. Wat ontbreekt, zetten we op een lijst met offertes erbij, zodat de VME zelf kiest wat er gebeurt."},{"vraag":"Wat is {{bedrijf.platform}}, en hoe leren we daarmee werken?","antwoord":"{{bedrijf.platform}} is het platform waarin we alles van het gebouw samenbrengen: boekhouding, documenten, de algemene vergadering, technisch beheer en communicatie. Elke mede-eigenaar krijgt een eigen login en kan zo meevolgen. Je hoeft niets te installeren en met vragen kan je steeds bij ons terecht."},{"vraag":"En na het eerste jaar?","antwoord":"Dan kiezen jullie opnieuw: ons het beheer laten verderzetten, of het zelf overnemen. Het dossier in het {{bedrijf.platform}} platform is van jullie, dus een overname van beheer kan zonder problemen. Wat jullie ook beslissen, wij blijven bereikbaar."},{"vraag":"Wat vragen wij van jullie?","antwoord":"Eén mede-eigenaar als aanspreekpunt, meer mag ook. Die persoon laat leveranciers binnen en stemt afspraken af, wat het beheer sneller en goedkoper maakt. Belangrijk is dat die persoon geen verantwoordelijkheid draagt, die blijft volledig bij {{bedrijf.naam}}."},{"vraag":"Hoe zijn jullie te bereiken?","antwoord":"Wij zijn steeds telefonisch en via mail te bereiken. Voor specifieke vragen vragen we steeds om een gesprek in te plannen, zodat we ons kunnen inlezen in uw dossier. Dringende vragen na de werkuren of in het weekend? Dan kan u ons steeds bereiken op ons noodnummer. Hiervoor worden wel extra kosten aangerekend."}]},"oproep":{"titel":"Klaar om te beslissen?","tekst":"Laat het ons weten en we zetten de volgende stap samen. Twijfelt de VME nog,\ndan plannen we graag een afspraak in waarin we vragen kunnen beantwoorden!","contact":"Liever mailen of bellen? {{bedrijf.email}} en {{bedrijf.telefoon}}."}},"velden":[{"groep":"Offerte","velden":[["offerte.nummer","Offertenummer"],["offerte.datum","Datum"],["offerte.geldig_tot","Tarieven geldig tot"]]},{"groep":"Gebouw en klant","velden":[["gebouw.adres","Adres"],["klant.naam","Aangevraagd door"],["gebouw.kavels","Aantal kavels"],["gebouw.bijzonderheden","Bijzonderheden"]]},{"groep":"Contactpersoon","velden":[["contact.naam","Naam"],["contact.email","E-mailadres"],["contact.foto","Foto (pad of URL)"]]},{"groep":"Prijzen","velden":[["prijs.maandelijks","Maandelijks beheer"],["prijs.opstart","Eenmalige opstartkost"],["prijs.licentie","Licentie per hoofdkavel"],["prijs.uurtarief","Uurtarief"],["prijs.verplaatsing","Verplaatsingskost per km"]]},{"groep":"Bedrijf","velden":[["bedrijf.naam","Naam"],["bedrijf.product","Product"],["bedrijf.platform","Platform"],["bedrijf.kbo","KBO-nummer"],["bedrijf.biv","BIV-nummer"],["bedrijf.adres","Adres"],["bedrijf.email","E-mailadres"],["bedrijf.telefoon","Telefoon"],["bedrijf.website","Website"]]},{"groep":"Beeldmateriaal","velden":[["beeld.logo","Logo"],["beeld.platform","Schermafdruk platform"],["beeld.qr","QR-code"],["beeld.pijl","Pijltje bij de QR-code"]]}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM fs_v2_pdf_templates);

COMMIT;

-- Terugdraaien:
--   DROP TABLE IF EXISTS fs_v2_pdf_templates;
-- Er is niets anders gewijzigd, dus dit is een volledige rollback.
