-- ─── PRODUCTFEATURES ─────────────────────────────────────────────────────────
-- De bibliotheek van wat OpenVME kan, als boom (globaal -> fijn), met per
-- feature de feiten die een mail of (later) een klantgerichte pagina nodig
-- heeft. Bewerkbaar in de OM (/productfeatures). Toon: feitelijk, concreet,
-- geen reclametaal (beslissing Nico, 2026-10-16).
--
-- Vaste lijsten (categorie, voordelen, doelgroepen, pakketten) staan in
-- src/modules/product-features/lib/constants.js; de kolommen hier bewaren
-- enkel de sleutels.

CREATE TABLE IF NOT EXISTS product_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Bovenliggende feature; NULL = een hoofdfeature.
  parent_id     UUID REFERENCES product_features(id) ON DELETE SET NULL,
  code          TEXT NOT NULL UNIQUE,
  brand         TEXT NOT NULL DEFAULT 'openvme' CHECK (brand IN ('openvme', 'syndicoach')),
  position      INTEGER NOT NULL DEFAULT 0,
  -- Wat de lezer ziet.
  name          TEXT NOT NULL,                         -- titel
  eyebrow       TEXT NOT NULL DEFAULT '',              -- label boven de titel
  summary       TEXT NOT NULL DEFAULT '',              -- korte uitleg: wat het doet
  why           TEXT NOT NULL DEFAULT '',              -- waarom we dit gemaakt hebben
  image_url     TEXT NOT NULL DEFAULT '',
  usps          JSONB NOT NULL DEFAULT '[]'::jsonb,    -- lijst van korte, feitelijke punten
  url           TEXT NOT NULL DEFAULT '',              -- webpagina
  -- Indeling.
  category      TEXT CHECK (category IN ('technisch', 'communicatie', 'financieel', 'wettelijk')),
  benefits      TEXT[] NOT NULL DEFAULT '{}',          -- sleutels uit VOORDELEN
  audiences     TEXT[] NOT NULL DEFAULT '{}',          -- sleutels uit DOELGROEPEN
  plan          TEXT NOT NULL DEFAULT '',              -- vanaf welk pakket ('' = overal)
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_product_features_parent ON product_features (parent_id, position);

-- ─── VOORVULLING ─────────────────────────────────────────────────────────────
-- Uit openvme.be (functiepagina's, prijzen, helpcenter) en de voorbeeldpagina
-- "VME-rekening" (2026-10-16). Idempotent: bestaande codes blijven staan.

-- Hoofdfeatures (de menu-indeling "Functionaliteiten" van de site).
INSERT INTO product_features (code, position, name, eyebrow, summary, why, url, usps, category, benefits, audiences, plan)
VALUES
('algemene-vergadering', 10, 'Algemene vergadering', 'Functionaliteit',
 'De jaarlijkse of bijzondere algemene vergadering van begin tot einde in het platform: dagorde, uitnodiging, volmachten, stemmen en verslag.',
 'De wet schrijft voor wat er op een AV moet gebeuren en hoe. Dat stap voor stap in één scherm zetten, voorkomt vergeten stappen en achteraf discussie.',
 'https://openvme.be/functies/vme-algemene-vergadering/',
 '["Dagorde en uitnodiging opmaken en versturen","Stemmen tijdens de vergadering, gewogen volgens de aandelen","Verslag meteen na de vergadering, digitaal te ondertekenen","Mede-eigenaars volgen mee op smartphone, tablet of computer"]'::jsonb,
 'wettelijk', '{gemoedsrust,tijdswinst,betrokkenheid}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'basic'),

('financieel-beheer', 20, 'Financieel beheer', 'Functionaliteit',
 'De boekhouding van de VME: voorschotten, facturen, afrekeningen en de bankrekeningen, in dubbel boekhouden.',
 'Een VME met 20 of meer kavels moet een dubbele boekhouding voeren. Dat moet ook kunnen zonder boekhouder te zijn.',
 'https://openvme.be/functies/boekhouding-vme/',
 '["Altijd dubbele boekhouding, volgens het minimum algemeen rekeningstelsel (MAR)","Voorschotten verdeeld volgens de verdeelsleutels van de basisakte","Voorlopige en eindafrekening per mede-eigenaar","Bankverkeer dagelijks ingelezen via een bankkoppeling"]'::jsonb,
 'financieel', '{gemoedsrust,transparantie,tijdswinst}', '{eigenaar-syndicus,professionele-syndicus,boekhouder}', 'basic'),

('communicatie', 30, 'Communicatie', 'Functionaliteit',
 'Berichten, forum, prikbord en een gedeelde kalender voor iedereen in het gebouw, met e-mailsjablonen voor de syndicus.',
 'Veel conflicten in een gebouw komen door informatie die niet of te laat bij iedereen komt.',
 '',
 '["Berichten één-op-één","Forum voor het hele gebouw, met toegangsrechten per groep","Digitaal prikbord","Gedeelde kalender waar leden zelf iets kunnen bijzetten"]'::jsonb,
 'communicatie', '{betrokkenheid,transparantie,overzicht}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar,bewoner}', 'gratis'),

('documentenbeheer', 40, 'Documentenbeheer', 'Functionaliteit',
 'Alle documenten van de VME op één plek, gekoppeld aan kavels, facturen of vergaderingen, met sjablonen en digitale handtekening.',
 'Basisakte, verslagen, contracten en attesten moeten voor elke mede-eigenaar terug te vinden zijn, ook na een wissel van syndicus.',
 'https://openvme.be/functies/documenten-sjablonen-vme/',
 '["Documenten gekoppeld aan bewoners, facturen of vergaderingen","Sjablonen voor brieven, volmachten en contracten","Documenten delen en digitaal ondertekenen"]'::jsonb,
 'wettelijk', '{overzicht,tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar,rvme}', 'gratis'),

('eigenaarsportaal', 50, 'Eigenaarsportaal', 'Functionaliteit',
 'Elke mede-eigenaar heeft een eigen login en ziet wat bij zijn kavel hoort: documenten, communicatie, voorschotten en afrekeningen.',
 'Een mede-eigenaar hoeft niets te vragen aan de syndicus om te weten hoe het met het gebouw en zijn eigen rekening staat.',
 '',
 '["Eigen omgeving per kavel","Inkomsten en uitgaven van de VME op elk moment in te kijken","Leden van de raad van mede-eigendom krijgen extra rechten"]'::jsonb,
 'communicatie', '{transparantie,betrokkenheid,mobiel}', '{mede-eigenaar,rvme,bewoner}', 'gratis'),

('technisch-beheer', 60, 'Technisch beheer', 'Functionaliteit',
 'Het onderhoud van het gebouw opvolgen: keuringen en attesten per installatie, meldingen, taken en dossiers.',
 'Lift, verwarming, brandveiligheid en elektriciteit hebben elk hun eigen keuringsritme. Wie dat niet bijhoudt, komt het pas te weten als er iets misloopt.',
 'https://openvme.be/voor-elke-vme/',
 '["Gebouwscan: per installatie de keuring, het attest en de vervaldatum","Meldingen van bewoners en hun opvolging","Taken en dossiers: wat gebeurde, wat loopt, wie volgt op"]'::jsonb,
 'technisch', '{overzicht,gemoedsrust,tijdswinst}', '{eigenaar-syndicus,professionele-syndicus,rvme}', 'gratis'),

('leveranciers', 70, 'Leveranciers', 'Functionaliteit',
 'Vakmensen vinden en hun opdrachten voor het gebouw opvolgen, met de facturen die rechtstreeks in de boekhouding komen.',
 'Een eigenaar-syndicus kent niet altijd een betrouwbare loodgieter of liftfirma, en wil de opvolging niet in zijn eigen mailbox doen.',
 '',
 '["Netwerk van leveranciers","Opdrachten opvolgen in het platform","Facturen via Peppol rechtstreeks in de boekhouding"]'::jsonb,
 'technisch', '{tijdswinst,overzicht}', '{eigenaar-syndicus,professionele-syndicus}', ''),

('cindy-ai', 80, 'Cindy AI', 'Functionaliteit',
 'De ingebouwde assistent die vragen beantwoordt op basis van de documenten van jouw VME en de geldende wetgeving.',
 'Er zijn te weinig syndici. Een eigenaar-syndicus moet antwoorden kunnen vinden zonder voor elke vraag een expert te betalen.',
 'https://openvme.be/2025/11/21/ontmoet-cindy-ai/',
 '["Werkt enkel op de brondocumenten in OpenVME: basisakte, verslagen, contracten","Kent de wetgeving op mede-eigendom","Helpt communicatie opstellen","In OpenVME Pro: met de context van de hele portefeuille"]'::jsonb,
 'wettelijk', '{eenvoud,tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', ''),

('expertencentrum', 90, 'Expertencentrum', 'Functionaliteit',
 'Advies van experts vanuit het platform: juridische vragen aan advocaten en begeleiding door een Syndicoach.',
 'Sommige vragen horen niet bij software maar bij een jurist of een ervaren syndicus. Die moeten even bereikbaar zijn.',
 'https://openvme.be/en/functies/syndicus-expert/',
 '["Juridische vragen aan de advocaten van Verenigde Eigenaars (betalend)","Startbegeleiding: 2 uur advies van een Syndicoach (€250)"]'::jsonb,
 'wettelijk', '{gemoedsrust,eenvoud}', '{eigenaar-syndicus,rvme}', ''),

('openvme-pro', 100, 'OpenVME Pro', 'Voor de professionele syndicus',
 'De versie voor wie meerdere gebouwen beheert: één cockpit voor de hele portefeuille, Cindy AI met portefeuillecontext en toegang tot het Syndicoach-netwerk.',
 'Een professionele syndicus herhaalt dezelfde handelingen voor elk gebouw. Dat moet vanuit één overzicht kunnen.',
 'https://openvme.be/syndicus-beheer/professionele-syndicus-beheer/',
 '["Centraal portefeuillebeheer","Cindy AI met de context van alle gebouwen","Toegang tot het Syndicoach-netwerk"]'::jsonb,
 NULL, '{tijdswinst,overzicht}', '{professionele-syndicus}', 'pro')
ON CONFLICT (code) DO NOTHING;

-- Onderliggende features.
INSERT INTO product_features (code, parent_id, position, name, eyebrow, summary, why, url, usps, category, benefits, audiences, plan)
SELECT v.code, p.id, v.position, v.name, v.eyebrow, v.summary, v.why, v.url, v.usps::jsonb, v.category, v.benefits::text[], v.audiences::text[], v.plan
FROM (VALUES
-- Algemene vergadering
('dagorde-en-uitnodiging', 'algemene-vergadering', 10, 'Dagorde en uitnodiging', 'Algemene vergadering',
 'Je stelt de dagorde op in het platform en verstuurt de uitnodiging met de bijlagen die de wet vraagt: volmachtformulier en agendapunten.',
 '', 'https://openvme.be/functies/documenten-sjablonen-vme/',
 '["Uitnodiging met volmachtformulier en agendapunten als bijlage","Sjablonen voor de vaste onderdelen","Mede-eigenaars kunnen vooraf agendapunten aanbrengen"]',
 'wettelijk', '{tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus}', 'basic'),
('live-stemmen', 'algemene-vergadering', 20, 'Stemmen tijdens de vergadering', 'Algemene vergadering',
 'Mede-eigenaars stemmen via smartphone, tablet of computer. Het platform berekent het quorum en weegt elke stem volgens de aandelen.',
 '', 'https://helpcenter.openvme.be/nl/articles/10713958-hoe-stem-je-tijdens-de-av-en-hoe-geef-gebruik-je-een-volmacht',
 '["Quorum automatisch berekend","Stemmen gewogen volgens de aandelen in de basisakte","De syndicus kan een stem ook manueel ingeven","Stemmen voor eigen kavels en voor volmachten"]',
 'wettelijk', '{gemoedsrust,betrokkenheid,mobiel}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'basic'),
('volmachten', 'algemene-vergadering', 30, 'Volmachten', 'Algemene vergadering',
 'Een mede-eigenaar die niet aanwezig kan zijn, geeft een volmacht. Die registreer je in het tabblad Volmachten; de stem telt dan mee bij de volmachthouder.',
 '', 'https://helpcenter.openvme.be/nl/articles/10570401-veelgestelde-vragen',
 '["Maximaal drie volmachten per persoon, tenzij de stemmen samen onder 10% van het totaal blijven","Volmachtformulier zit bij de uitnodiging"]',
 'wettelijk', '{gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'basic'),
('verslag-en-handtekening', 'algemene-vergadering', 40, 'Verslag en digitale handtekening', 'Algemene vergadering',
 'Het verslag wordt meteen na de vergadering aangemaakt uit de stemmingen, digitaal ondertekend, gemaild en bewaard in het eigenaarsportaal.',
 '', 'https://helpcenter.openvme.be/nl/articles/12381089-hoe-volg-ik-een-vergadering-mee-als-mede-eigenaar',
 '["Verslag meteen na de vergadering","Digitaal ondertekenen","Automatisch gemaild en bewaard in het portaal"]',
 'wettelijk', '{tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'basic'),

-- Financieel beheer
('dubbele-boekhouding', 'financieel-beheer', 10, 'Dubbele boekhouding', 'Financieel beheer',
 'Elke boeking is automatisch een dubbele boeking volgens het minimum algemeen rekeningstelsel. Wettelijk verplicht voor een VME met 20 of meer kavels.',
 '', 'https://openvme.be/financieel-beheer/minimum-algemeen-rekeningstelsel/',
 '["Dubbel boekhouden zonder boekhoudkennis","Minimum algemeen rekeningstelsel (MAR) ingebouwd","Verplicht vanaf 20 kavels, voor kleinere VME''s mag het ook"]',
 'financieel', '{gemoedsrust,eenvoud}', '{eigenaar-syndicus,professionele-syndicus,boekhouder}', 'basic'),
('voorschotten-en-verdeelsleutels', 'financieel-beheer', 20, 'Voorschotten en verdeelsleutels', 'Financieel beheer',
 'Voorschotten worden automatisch verdeeld over de mede-eigenaars volgens de verdeelsleutels van de basisakte.',
 '', 'https://openvme.be/functies/boekhouding-vme/',
 '["Verdeelsleutels uit de basisakte","Voorschotten per kavel automatisch berekend","Elke eigenaar ziet welke voorschotten betaald zijn"]',
 'financieel', '{tijdswinst,transparantie}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'basic'),
('afrekeningen', 'financieel-beheer', 30, 'Voorlopige en eindafrekening', 'Financieel beheer',
 'Een voorlopige afrekening toont tussentijds kosten en opbrengsten tegenover de voorschotten; de eindafrekening verdeelt ze definitief op het einde van het boekjaar.',
 '', 'https://helpcenter.openvme.be/nl/articles/10982828-boekhoudkundige-termen-uitgelegd',
 '["Voorlopige afrekening op elk moment","Eindafrekening per mede-eigenaar","Sluit aan op de voorschotten en facturen, zonder overtypen"]',
 'financieel', '{transparantie,tijdswinst}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar,boekhouder}', 'basic'),
('bankkoppeling', 'financieel-beheer', 40, 'Bankkoppeling', 'Financieel beheer',
 'De transacties op de bankrekeningen van de VME worden dagelijks ingelezen, zodat de boekhouding klopt met de bank.',
 '', 'https://openvme.be/prijzen/',
 '["Dagelijkse import van alle transacties","Via Ponto of CodaBox","€5 per rekening per maand bij Basic en Smart, inbegrepen bij Unlimited"]',
 'financieel', '{tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,boekhouder}', 'basic'),
('peppol', 'financieel-beheer', 50, 'Facturen via Peppol', 'Financieel beheer',
 'De VME wordt geregistreerd in het Peppol-netwerk. Elektronische facturen van leveranciers komen rechtstreeks in de boekhouding.',
 '', 'https://openvme.be/prijzen/',
 '["Registratie van de VME in het Peppol-netwerk","Facturen goedkeuren en met één klik klaarzetten om te betalen","€2 per maand bij Basic en Smart, inbegrepen bij Unlimited"]',
 'financieel', '{tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,boekhouder}', 'basic'),
('vme-rekening', 'financieel-beheer', 60, 'VME-rekening via Mollie', 'VME-rekening',
 'Een werk- en een reserverekening op naam van de VME, aangevraagd vanuit OpenVME. Elke rekening krijgt een Belgisch IBAN-nummer; de betalingen staan rechtstreeks in de boekhouding. €9 per maand voor beide rekeningen.',
 'Een VME-rekening openen bij een bank vraagt veel papierwerk, en de rekening staat te vaak op naam van de syndicus in plaats van de VME.',
 'https://openvme.be/?page_id=19900',
 '["Werkrekening voor de terugkerende uitgaven, reserverekening voor grote werken","De VME is de rekeninghouder, niet de syndicus: bij een wissel pas je enkel de toegang aan","Belgisch IBAN-nummer per rekening","Voorschotten, facturen en de jaarafrekening sluiten aan zonder overtypen","Peppol-facturen goedkeuren en met één klik klaarzetten in Mollie","Mollie B.V. is een elektronischgeldinstelling onder toezicht van De Nederlandsche Bank; het geld van klanten staat apart van haar eigen vermogen"]',
 'financieel', '{eenvoud,transparantie,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,rvme}', 'basic'),

-- Communicatie
('berichten', 'communicatie', 10, 'Berichten', 'Communicatie',
 'Eén-op-één berichten tussen de syndicus en een mede-eigenaar of bewoner, bewaard bij het gebouw in plaats van in een persoonlijke mailbox.',
 '', '', '["Gesprekken blijven bij de VME","Bereikbaar via het portaal"]',
 'communicatie', '{overzicht,betrokkenheid}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar,bewoner}', 'gratis'),
('forum', 'communicatie', 20, 'Forum', 'Communicatie',
 'Een forum voor het hele gebouw. Via Instellingen > Toegangsrechten bepaal je wie het forum mag inkijken.',
 '', 'https://helpcenter.openvme.be/nl/articles/10570401-veelgestelde-vragen',
 '["Discussies per onderwerp","Toegangsrechten per groep"]',
 'communicatie', '{betrokkenheid}', '{mede-eigenaar,bewoner,eigenaar-syndicus}', 'gratis'),
('prikbord-en-kalender', 'communicatie', 30, 'Prikbord en gedeelde kalender', 'Communicatie',
 'Een digitaal prikbord voor mededelingen en een gedeelde kalender waar leden zelf afspraken en events kunnen bijzetten.',
 '', '', '["Mededelingen voor het hele gebouw","Kalender met eigen inbreng van de leden"]',
 'communicatie', '{overzicht,betrokkenheid}', '{mede-eigenaar,bewoner,eigenaar-syndicus}', 'gratis'),
('mailsjablonen', 'communicatie', 40, 'E-mailsjablonen', 'Communicatie',
 'Gestandaardiseerde e-mails voor de terugkerende communicatie van de syndicus, zodat je niet elke keer opnieuw begint.',
 '', '', '["Vaste sjablonen voor terugkerende berichten"]',
 'communicatie', '{tijdswinst}', '{eigenaar-syndicus,professionele-syndicus}', 'gratis'),

-- Documentenbeheer
('centrale-documenten', 'documentenbeheer', 10, 'Documenten bij het gebouw', 'Documentenbeheer',
 'Documenten worden centraal bewaard en gekoppeld aan een bewoner, een factuur of een vergadering, zodat ze bij de juiste context terug te vinden zijn.',
 '', 'https://openvme.be/functies/documenten-sjablonen-vme/',
 '["Koppeling aan bewoners, facturen en vergaderingen","Blijft bij de VME bij een wissel van syndicus"]',
 'wettelijk', '{overzicht,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar,rvme}', 'gratis'),
('sjablonen', 'documentenbeheer', 20, 'Sjablonen', 'Documentenbeheer',
 'Brieven, volmachten, contracten en andere documenten maak je uit sjablonen die de gegevens van de VME zelf invullen.',
 '', 'https://openvme.be/functies/documenten-sjablonen-vme/',
 '["Brieven, volmachten en contracten","Gegevens van de VME vooraf ingevuld"]',
 'wettelijk', '{tijdswinst}', '{eigenaar-syndicus,professionele-syndicus}', 'gratis'),
('digitaal-ondertekenen', 'documentenbeheer', 30, 'Delen en digitaal ondertekenen', 'Documentenbeheer',
 'Een document delen met de mede-eigenaars en het digitaal laten ondertekenen, bijvoorbeeld het verslag van de algemene vergadering.',
 '', 'https://openvme.be/functies/documenten-sjablonen-vme/',
 '["Delen met één of alle mede-eigenaars","Digitale handtekening"]',
 'wettelijk', '{tijdswinst,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,mede-eigenaar}', 'gratis'),

-- Eigenaarsportaal
('mijn-kavel', 'eigenaarsportaal', 10, 'Mijn kavel', 'Eigenaarsportaal',
 'Een persoonlijke omgeving per kavel: de eigen documenten, communicatie en de opvolging van eigen dossiers.',
 '', 'https://openvme.be/voor-elke-vme/',
 '["Eigen documenten en dossiers","Voorschotten en afrekeningen van de eigen kavel"]',
 'communicatie', '{transparantie,mobiel}', '{mede-eigenaar,bewoner}', 'gratis'),
('rechten-rvme', 'eigenaarsportaal', 20, 'Extra rechten voor de raad van mede-eigendom', 'Eigenaarsportaal',
 'Leden van de raad van mede-eigendom zien meer dan een gewone mede-eigenaar: financiële details, contracten, offertes en communicatie, in real time.',
 'De raad van mede-eigendom (verplicht vanaf 20 kavels) controleert de syndicus en heeft daarvoor de cijfers en documenten nodig, niet een samenvatting.',
 'https://openvme.be/voor-wie-is-openvme/lid-van-de-rvme/',
 '["Financiële details, contracten en offertes inkijken","Real time, zonder het te moeten opvragen","Gewone mede-eigenaars zien enkel wat voor hen relevant is"]',
 'communicatie', '{transparantie,gemoedsrust}', '{rvme}', 'gratis'),

-- Technisch beheer
('gebouwscan', 'technisch-beheer', 10, 'Gebouwscan', 'Technisch beheer',
 'Per installatie (lift, centrale verwarming, brandveiligheid, elektriciteit) zie je de laatste keuring, het attest en de vervaldatum.',
 '', 'https://openvme.be/voor-elke-vme/',
 '["Lift, centrale verwarming, brandveiligheid en elektriciteit","Keuring, attest en vervaldatum per installatie","Gratis"]',
 'technisch', '{overzicht,gemoedsrust}', '{eigenaar-syndicus,professionele-syndicus,rvme}', 'gratis'),
('meldingen', 'technisch-beheer', 20, 'Meldingen', 'Technisch beheer',
 'Bewoners melden een defect of probleem in het portaal; de syndicus volgt de melding op tot ze afgehandeld is.',
 '', '', '["Melden vanuit het portaal","Status zichtbaar voor wie meldde"]',
 'technisch', '{overzicht,betrokkenheid}', '{bewoner,mede-eigenaar,eigenaar-syndicus,professionele-syndicus}', 'gratis'),
('taken-en-dossiers', 'technisch-beheer', 30, 'Taken en dossiers', 'Technisch beheer',
 'Per dossier zie je wat er al gebeurde, wat nog loopt en wie het opvolgt.',
 '', 'https://openvme.be/voor-elke-vme/',
 '["Geschiedenis per dossier","Eigenaar per taak"]',
 'technisch', '{overzicht,tijdswinst}', '{eigenaar-syndicus,professionele-syndicus,rvme}', 'gratis'),

-- Leveranciers
('leveranciersnetwerk', 'leveranciers', 10, 'Leveranciersnetwerk', 'Leveranciers',
 'Vakmensen vinden die met OpenVME werken en hun opdrachten voor het gebouw opvolgen in het platform.',
 '', '', '["Vakmensen per regio en vak","Opdrachten en facturen bij het dossier"]',
 'technisch', '{tijdswinst}', '{eigenaar-syndicus,professionele-syndicus}', ''),

-- Cindy AI
('cindy-vragen', 'cindy-ai', 10, 'Vragen over je gebouw', 'Cindy AI',
 'Stel een vraag over je VME; Cindy antwoordt op basis van de documenten in OpenVME (basisakte, verslagen, contracten) en de wetgeving op mede-eigendom.',
 '', 'https://openvme.be/2025/11/21/ontmoet-cindy-ai/',
 '["Enkel op basis van de brondocumenten in het platform","Verwijst naar het document waar het antwoord vandaan komt"]',
 'wettelijk', '{eenvoud,tijdswinst}', '{eigenaar-syndicus,mede-eigenaar,rvme}', ''),
('cindy-communicatie', 'cindy-ai', 20, 'Communicatie opstellen', 'Cindy AI',
 'Cindy helpt een bericht, brief of antwoord aan een mede-eigenaar op te stellen, in de context van jouw gebouw.',
 '', 'https://openvme.be/2025/11/21/ontmoet-cindy-ai/',
 '["Voorstel van tekst in de context van het gebouw","Jij leest na en verstuurt"]',
 'communicatie', '{tijdswinst,eenvoud}', '{eigenaar-syndicus,professionele-syndicus}', ''),

-- Expertencentrum
('juridisch-advies', 'expertencentrum', 10, 'Juridisch advies', 'Expertencentrum',
 'Een complexe juridische vraag leg je vanuit het platform voor aan de advocaten van Verenigde Eigenaars. Betalend, per vraag.',
 '', 'https://verenigdeeigenaars.be/dossier/partnership-met-openvme/',
 '["Advocaten gespecialiseerd in mede-eigendom","Vaste prijs per vraag"]',
 'wettelijk', '{gemoedsrust}', '{eigenaar-syndicus,rvme}', ''),
('startbegeleiding', 'expertencentrum', 20, 'Startbegeleiding door een Syndicoach', 'Expertencentrum',
 'Twee uur advies van een Syndicoach om je gebouw in OpenVME op te zetten en de eerste stappen als syndicus te zetten. €250, optioneel.',
 '', 'https://openvme.be/prijzen/',
 '["2 uur advies","Optioneel bij elk pakket"]',
 'wettelijk', '{eenvoud,gemoedsrust}', '{eigenaar-syndicus}', ''),

-- OpenVME Pro
('portefeuillebeheer', 'openvme-pro', 10, 'Centraal portefeuillebeheer', 'OpenVME Pro',
 'Alle gebouwen van een professionele syndicus in één cockpit, met dezelfde handelingen voor elk gebouw vanuit één overzicht.',
 '', 'https://openvme.be/syndicus-beheer/professionele-syndicus-beheer/',
 '["Eén overzicht over alle gebouwen","Zelfde werkwijze per gebouw"]',
 NULL, '{tijdswinst,overzicht}', '{professionele-syndicus}', 'pro')
) AS v(code, parent_code, position, name, eyebrow, summary, why, url, usps, category, benefits, audiences, plan)
JOIN product_features p ON p.code = v.parent_code
ON CONFLICT (code) DO NOTHING;

-- ─── MODULE REGISTRATION ────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'product_features',
  'Productfeatures',
  'Wat OpenVME kan, als bibliotheek: feitelijke blokken voor mails en pagina''s',
  '/productfeatures',
  'blocks',
  true,
  false,
  150
)
ON CONFLICT (code) DO NOTHING;

-- Beheerders en marketing: zij houden de bibliotheek bij.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'product_features'
  AND u.is_active = true
  AND u.role IN ('admin', 'marketing_signature')
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
