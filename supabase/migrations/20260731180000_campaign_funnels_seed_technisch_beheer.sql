-- ============================================================================
-- Ad & Sales Campaigns — seed: "Technisch beheer" funnel
-- ============================================================================
-- Eerste werkend voorbeeld, overgenomen uit het Miro-funnelsjabloon (PDF
-- "Technisch beheer marketing & social media", aangeleverd 2026-07-31).
-- 5 swimlanes (één per user-issue), elk met kaarten in de 7 funnel-stages.
-- Sales-argumentatie (2A/2B/2C) is hier WEL ingevuld (in de Miro zelf ontbrak
-- dit nog, maar de kolommen laten zich goed afleiden uit de reality checks +
-- de al bestaande kernargumenten elders in het sjabloon).
--
-- Idempotent: als er al een funnel "Technisch beheer" bestaat, doet dit script niets.
-- ============================================================================

DO $$
DECLARE
  v_funnel_id UUID;
  v_lane_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM campaign_funnels WHERE name = 'Technisch beheer') THEN
    RAISE NOTICE 'Funnel "Technisch beheer" bestaat al -- seed overgeslagen.';
    RETURN;
  END IF;

  INSERT INTO campaign_funnels (name, description, status)
  VALUES ('Technisch beheer', 'Technisch onderhoud is de blinde vlek van veel gebouwen. OpenVME maakt het gebouw zichtbaar, houdt alles overzichtelijk en brengt de juiste vakmensen binnen handbereik. Bron: Miro-funnelsjabloon (2026-07).', 'lopend')
  RETURNING id INTO v_funnel_id;

  -- --- Swimlane 1: Reactief i.p.v. preventief technisch beheer ---
  INSERT INTO campaign_swimlanes (funnel_id, title, description, sort_order)
  VALUES (v_funnel_id, 'Reactief i.p.v. preventief technisch beheer', 'Eigenaars lossen problemen pas op als ze zich stellen; technisch beheer komt bijna altijd reactief naar boven.', 1)
  RETURNING id INTO v_lane_id;

  INSERT INTO campaign_cards (swimlane_id, stage, content, card_type, source_ref, sort_order) VALUES
    (v_lane_id, 'onderzoek', 'Waarom zouden we problemen oplossen die er nog niet zijn? We hebben al genoeg aan ons hoofd.', 'reality_check', NULL, 1),
    (v_lane_id, 'onderzoek', 'Wat een gedoe komt er kijken bij het oplossen van een aanslepend probleem.', 'reality_check', NULL, 2),
    (v_lane_id, 'onderzoek', 'Omdat de deur van het fietsenhok nog steeds niet gemaakt is zijn er vannacht inbrekers geweest en ze hebben 3 elektrische fietsen gestolen.', 'reality_check', NULL, 3),
    (v_lane_id, 'onderzoek', '"Een schadegeval van midden ''25 is de aanleiding geweest van de hele problematiek die we nu hebben."', 'gebruikersonderzoek', NULL, 4),
    (v_lane_id, 'onderzoek', 'Het technisch beheer komt bijna altijd reactief naar boven, na een incident dat voorgevallen is.', 'gebruikersonderzoek', NULL, 5),
    (v_lane_id, 'kernboodschap', 'Reactief in plaats van preventief technisch beheer.', 'kernboodschap', NULL, 1),
    (v_lane_id, 'argument', 'Vooruitplannen kost tijd en geld voor iets dat misschien nooit gebeurt.', 'vooroordeel', NULL, 1),
    (v_lane_id, 'argument', 'We lossen de problemen op als ze zich stellen (eigenaars).', 'vooroordeel', NULL, 2),
    (v_lane_id, 'argument', 'Ontkenning, struisvogelgedrag: iemand anders zal het wel doen.', 'vooroordeel', NULL, 3),
    (v_lane_id, 'argument', 'Uitstelgedrag zorgt ervoor dat dingen blijven liggen i.p.v. dat ze meteen worden aangepakt.', 'vooroordeel', NULL, 4),
    (v_lane_id, 'kernargument', 'Zie je het probleem niet, dan is het er ook niet. Wij maken zichtbaar wat anders verborgen blijft — preventief beheer zorgt voor rust in de chaos.', 'kernargument', NULL, 1),
    (v_lane_id, 'kernargument', 'Een gebouw met preventief beheer is het gezondste gebouw.', 'kernargument', NULL, 2),
    (v_lane_id, 'kernargument', 'Vooruitkijken per kwartaal kost minder dan één incident achteraf.', 'kernargument', NULL, 3),
    (v_lane_id, 'onderbouwing', 'Escalatiepad vocht: kleine vochtige plek op de keldermuur -> schimmel breidt uit, muur brokkelt -> vocht trekt in structuur/fundering, herstel vraagt een aannemer en een dossier van duizenden euro''s.', 'onderbouwing', NULL, 1),
    (v_lane_id, 'onderbouwing', 'Escalatiepad CV-ketel: jaarlijks onderhoud €150 -> storing/herstelling €300-500 -> plaatsing nieuwe ketel €1.500-3.000.', 'onderbouwing', NULL, 2),
    (v_lane_id, 'onderbouwing', '52,6% van de gebouwen is gebouwd vóór 1971 -> ouder gebouw, meer nazicht nodig.', 'bron', 'Statbel', 3),
    (v_lane_id, 'onderbouwing', 'Ongeveer de helft van de schadegevallen bij woningverzekeringen gaat over waterschade (gem. €1.500). Vorst (barstende leidingen) is de grootste oorzaak — te voorkomen met tijdige controle.', 'bron', 'Assuralia', 4),
    (v_lane_id, 'product', 'Gebouwscan: geprioriteerd overzicht van wat nagekeken/in orde gebracht moet worden.', 'feature', NULL, 1),
    (v_lane_id, 'product', 'Vervaldatum-herinneringen voor keuringen en attesten.', 'feature', NULL, 2),
    (v_lane_id, 'product', 'Mijn gebouw: overzicht van wat er speelt en wat eraan komt.', 'feature', NULL, 3),
    (v_lane_id, 'conversie', 'Blog: "5 dingen die je beter aan een professional overlaat".', 'touchpoint', NULL, 1),
    (v_lane_id, 'conversie', 'Landingspagina + lead form: OpenVME gebouwscan.', 'touchpoint', NULL, 2),
    (v_lane_id, 'conversie', 'Nurture mails na het aanmaken van een gebouwscan.', 'touchpoint', NULL, 3);

  -- --- Swimlane 2: Gebrek aan transparantie over het technisch beheer ---
  INSERT INTO campaign_swimlanes (funnel_id, title, description, sort_order)
  VALUES (v_funnel_id, 'Gebrek aan transparantie over het technisch beheer', 'Bij een externe syndicus is er vaak weinig inspraak/transparantie over gekozen leveranciers en uitgevoerd werk.', 2)
  RETURNING id INTO v_lane_id;

  INSERT INTO campaign_cards (swimlane_id, stage, content, card_type, source_ref, sort_order) VALUES
    (v_lane_id, 'onderzoek', 'Onze externe syndicus kiest eigen leveranciers en aannemers, buiten onze controle en inspraak. Er is ook geen formeel goedkeuringsproces.', 'reality_check', NULL, 1),
    (v_lane_id, 'onderzoek', 'Bij de externe syndicus is er een gebrek aan inspraak en transparantie over wat er gedaan is en/of moet gebeuren.', 'reality_check', NULL, 2),
    (v_lane_id, 'onderzoek', 'Ik weet niet of de gekozen leverancier de goedkoopste was.', 'reality_check', NULL, 3),
    (v_lane_id, 'onderzoek', '"Ik wil niet meebetalen aan iets als ik niet wist dat er iets aan scheelde."', 'gebruikersonderzoek', NULL, 4),
    (v_lane_id, 'onderzoek', 'Eigenaars worden niet op de hoogte gesteld van de gebreken en weten niet wat er speelt -> gevoel van onveiligheid.', 'gebruikersonderzoek', NULL, 5),
    (v_lane_id, 'kernboodschap', 'Gebrek aan transparantie over het technisch beheer.', 'kernboodschap', NULL, 1),
    (v_lane_id, 'argument', 'Het beheer is uitbesteed, dus dat hoef ik niet op te volgen.', 'vooroordeel', NULL, 1),
    (v_lane_id, 'argument', 'Het is normaal dat de syndicus meer weet dan ons, daarvoor betalen we hem.', 'vooroordeel', NULL, 2),
    (v_lane_id, 'argument', 'Dat is werk voor een specialist. Zolang niemand klaagt is het in orde.', 'vooroordeel', NULL, 3),
    (v_lane_id, 'kernargument', 'Je hoeft het beheer niet over te nemen om te kunnen meekijken en meebeslissen — transparantie zorgt voor vertrouwen, minder frustraties, gevoel van controle.', 'kernargument', NULL, 1),
    (v_lane_id, 'kernargument', 'Het is niet normaal dat de syndicus dingen achterhoudt; een syndicus hoort open en transparant te zijn, het draait tenslotte om jouw geld.', 'kernargument', NULL, 2),
    (v_lane_id, 'onderbouwing', 'Artikel 3.89 §5, 9° BW verplicht de syndicus om mede-eigenaars inzage te laten nemen van alle niet-private documenten/gegevens over de mede-eigendom.', 'bron', 'Burgerlijk Wetboek, art. 3.89 §5, 9°', 1),
    (v_lane_id, 'onderbouwing', 'Artikel 577-8 §4, 9° BW verplicht een aftredende syndicus om binnen 30 dagen het volledige beheersdossier aan zijn opvolger te overhandigen.', 'bron', 'Burgerlijk Wetboek, art. 577-8 §4, 9°', 2),
    (v_lane_id, 'product', 'Mijn gebouw: mede-bewoners kunnen meekijken zonder zelf te beheren (inzage in status, beslissingen, wat er speelt).', 'feature', NULL, 1),
    (v_lane_id, 'product', 'Inspraak: eigenaars zien welke leverancier gekozen wordt en kunnen mee beslissen.', 'feature', NULL, 2),
    (v_lane_id, 'product', 'Zichtbaar maken wat er tussen vergaderingen door met het gebouw gebeurt.', 'feature', NULL, 3),
    (v_lane_id, 'conversie', 'Nav bar: "Voor wie?" en "Functionaliteiten" wijzen naar gratis inzage in OpenVME.', 'touchpoint', NULL, 1),
    (v_lane_id, 'conversie', 'In-app comms + newsletter over openstaande beslissingen.', 'touchpoint', NULL, 2);

  -- --- Swimlane 3: Gebrek aan inzicht, bewustzijn van en kennis over gebouwsituatie ---
  INSERT INTO campaign_swimlanes (funnel_id, title, description, sort_order)
  VALUES (v_funnel_id, 'Gebrek aan inzicht, bewustzijn van en kennis over gebouwsituatie', 'De technische ruimte en de wettelijke verplichtingen zijn onbekend terrein voor de meeste eigenaars.', 3)
  RETURNING id INTO v_lane_id;

  INSERT INTO campaign_cards (swimlane_id, stage, content, card_type, source_ref, sort_order) VALUES
    (v_lane_id, 'onderzoek', 'Geen technische kennis aanwezig in de VME, huidige aanpak: zoeken op Google.', 'reality_check', NULL, 1),
    (v_lane_id, 'onderzoek', 'De technische ruimte is voor de meeste eigenaars onbekend terrein. Geen totaalbeeld van wat onderhoud nodig heeft of welke technische documenten vereist zijn.', 'reality_check', NULL, 2),
    (v_lane_id, 'onderzoek', '"Niet altijd op de hoogte van de wettelijke verplichtingen — bij het vernieuwen van de parlofoon wees de elektricien erop dat niet aan alle wettelijke vereisten was voldaan."', 'gebruikersonderzoek', NULL, 3),
    (v_lane_id, 'onderzoek', 'Attesten verlopen zonder dat iemand het opmerkt.', 'reality_check', NULL, 4),
    (v_lane_id, 'onderzoek', 'Mensen zijn eerst bezig met hun eigen appartement in orde brengen, en pas later met de gemene delen.', 'reality_check', NULL, 5),
    (v_lane_id, 'kernboodschap', 'Gebrek aan inzicht, bewustzijn van en kennis over gebouwsituatie.', 'kernboodschap', NULL, 1),
    (v_lane_id, 'argument', 'Hoe moet ik nu weten waarmee ik in orde moet zijn, da''s toch geen basiskennis?', 'vooroordeel', NULL, 1),
    (v_lane_id, 'argument', 'Kennis is voor experts, en geen klachten betekent dat alles goed zit.', 'vooroordeel', NULL, 2),
    (v_lane_id, 'argument', 'Als het niet verplicht is, gaan mensen het niet in orde brengen; ze liggen er niet van wakker.', 'vooroordeel', NULL, 3),
    (v_lane_id, 'kernargument', 'Je hoeft geen expert te zijn om te weten wat de status is van je gebouw. Analogie: het dashboard van je auto — je hoeft geen monteur te zijn, de lampjes zeggen wanneer iets aandacht vraagt.', 'kernargument', NULL, 1),
    (v_lane_id, 'kernargument', 'De staat van je gebouw kennen en weten wat er moet gebeuren brengt alleen maar voordelen met zich mee.', 'kernargument', NULL, 2),
    (v_lane_id, 'onderbouwing', 'Als je niet op de hoogte bent, kan je zware boetes riskeren of subsidies mislopen.', 'onderbouwing', NULL, 1),
    (v_lane_id, 'onderbouwing', 'Deadline asbestattest: 1 januari 2027 — uitstellen is geen optie meer. Zonder dat attest kan een verkoop of overdracht vanaf 2027 geblokkeerd worden.', 'bron', 'ImmoKeuring BV / asbestwetgeving', 2),
    (v_lane_id, 'onderbouwing', 'Administratie niet op orde = geen premies — link met EPC en renovatiepremies.', 'onderbouwing', NULL, 3),
    (v_lane_id, 'product', 'Gebouwscan: overzicht van welke technische documenten vereist zijn en wat gekeurd moet worden.', 'feature', NULL, 1),
    (v_lane_id, 'product', 'Aanduiden wat wel en niet verplicht is, gekoppeld aan EPC en renovatiepremies.', 'feature', NULL, 2),
    (v_lane_id, 'product', '"De onbekende technische ruimte": tonen wat daar hangt (verdeelbord, watermeters, CV, brandhaspels) — micro-educatie.', 'feature', NULL, 3),
    (v_lane_id, 'conversie', 'Blog: "Verplichte keuringen gemene delen".', 'touchpoint', NULL, 1),
    (v_lane_id, 'conversie', 'FAQ-expert over keuringen en elektriciteit in gemene delen.', 'touchpoint', NULL, 2),
    (v_lane_id, 'conversie', 'Expert-content: Afitec — keuring van brandveiligheid in appartementsgebouwen.', 'touchpoint', NULL, 3);

  -- --- Swimlane 4: Onduidelijke verantwoordelijkheid en gebrekkige opvolging ---
  INSERT INTO campaign_swimlanes (funnel_id, title, description, sort_order)
  VALUES (v_funnel_id, 'Onduidelijke verantwoordelijkheid en gebrekkige opvolging', 'Niemand voelt zich verantwoordelijk voor het technisch beheer, waardoor onderhoud slecht gebeurt of uitblijft.', 4)
  RETURNING id INTO v_lane_id;

  INSERT INTO campaign_cards (swimlane_id, stage, content, card_type, source_ref, sort_order) VALUES
    (v_lane_id, 'onderzoek', 'Niemand voelt zich verantwoordelijk. Technisch beheer komt zelden uit zichzelf ter sprake.', 'reality_check', NULL, 1),
    (v_lane_id, 'onderzoek', 'Een lek dat al eerder optrad en is teruggekomen, zonder gestructureerde opvolging.', 'reality_check', NULL, 2),
    (v_lane_id, 'onderzoek', 'Onduidelijkheid over wie wat regelt en opvolgt in een gebouw.', 'reality_check', NULL, 3),
    (v_lane_id, 'onderzoek', 'Kleine problemen blijven liggen tot ze groot worden omdat niemand verantwoordelijk is.', 'reality_check', NULL, 4),
    (v_lane_id, 'onderzoek', '"Ik meld niets van de deur, de syndicus doet er toch niets aan." / "De deur klemt, maar ik heb geen idee aan wie ik het moet melden."', 'gebruikersonderzoek', NULL, 5),
    (v_lane_id, 'kernboodschap', 'Onduidelijke verantwoordelijkheid en gebrekkige opvolging — het onderhoud gebeurt slecht of gebeurt niet.', 'kernboodschap', NULL, 1),
    (v_lane_id, 'argument', 'Een systeem of vaste taakverdeling is overdreven voor een klein gebouw.', 'vooroordeel', NULL, 1),
    (v_lane_id, 'argument', 'Niemand wil de boeman zijn die iedereen aan taken herinnert.', 'vooroordeel', NULL, 2),
    (v_lane_id, 'argument', 'Als we lang genoeg wachten met die deur, zal er wel iets gebeuren waardoor het niet langer genegeerd kan worden — mijn buren zullen dat wel melden.', 'vooroordeel', NULL, 3),
    (v_lane_id, 'kernargument', 'Maak zichtbaar wat de syndicus doet via een platform en hou hem verantwoordelijk — vele handen maken licht werk, met wél een eindverantwoordelijke die overzicht houdt.', 'kernargument', NULL, 1),
    (v_lane_id, 'kernargument', 'Een persoon wordt niet de zeurpiet, het systeem is de zeurpiet.', 'kernargument', NULL, 2),
    (v_lane_id, 'kernargument', 'Als iedereen iets kan melden en meeleest, worden problemen aangepakt vóór ze groter worden.', 'kernargument', NULL, 3),
    (v_lane_id, 'onderbouwing', 'Reactief beheer = wachten tot problemen zich voordoen en er dan naar handelen. Preventief/proactief beheer = periodieke keuringen en nazicht inplannen om problemen te voorkomen.', 'onderbouwing', NULL, 1),
    (v_lane_id, 'onderbouwing', 'Een preventief gebouw is goedkoper (bespaart op onverwachte onderhoudskosten), overzichtelijker (je kent de stavaza) en geeft een gevoel van controle.', 'onderbouwing', NULL, 2),
    (v_lane_id, 'onderbouwing', 'De kloof tussen eigenaar en syndicus zit in structuur/verwachting: de syndicus voert uit wat de AV beslist en beheert de gemene delen op afstand, maar veel eigenaars verwachten dat hij ook het kleine en technische ziet en oppakt.', 'onderbouwing', NULL, 3),
    (v_lane_id, 'product', 'Dossier: terugkerende problemen (bv. een lek dat terugkeert) bundelen zodat opvolging niet verloren gaat.', 'feature', NULL, 1),
    (v_lane_id, 'product', 'Status en opvolging per dossier, zodat kleine problemen niet blijven liggen.', 'feature', NULL, 2),
    (v_lane_id, 'product', 'Zichtbaar maken wat wel/niet al gedaan is — voorkomt dubbel werk en gemiste deadlines.', 'feature', NULL, 3),
    (v_lane_id, 'conversie', 'Content: "Wat als de syndicus niets doet?"', 'touchpoint', NULL, 1),
    (v_lane_id, 'conversie', 'In-app comms bij openstaande dossiers/meldingen.', 'touchpoint', NULL, 2);

  -- --- Swimlane 5: Moeilijke leveranciers- en offerteaanpak ---
  INSERT INTO campaign_swimlanes (funnel_id, title, description, sort_order)
  VALUES (v_funnel_id, 'Moeilijke leveranciers- en offerteaanpak', 'De juiste vakman vinden en offertes vergelijken is omslachtig en informeel geregeld.', 5)
  RETURNING id INTO v_lane_id;

  INSERT INTO campaign_cards (swimlane_id, stage, content, card_type, source_ref, sort_order) VALUES
    (v_lane_id, 'onderzoek', 'Als je een offerte wil aanvragen moet je vaak door websites, formulieren en mails worstelen, en telkens opnieuw je case opbouwen.', 'reality_check', NULL, 1),
    (v_lane_id, 'onderzoek', 'De juiste vakman vinden voor de juiste klus voor de juiste prijs is omslachtig.', 'reality_check', NULL, 2),
    (v_lane_id, 'onderzoek', 'Offertes die binnenkomen zijn vaak moeilijk te vergelijken.', 'reality_check', NULL, 3),
    (v_lane_id, 'onderzoek', 'Geen enkel platform heeft referenties van andere gebouwen.', 'reality_check', NULL, 4),
    (v_lane_id, 'onderzoek', 'Vakmensen zoeken verloopt bij de meeste VME''s informeel of ad hoc.', 'reality_check', NULL, 5),
    (v_lane_id, 'kernboodschap', 'Moeilijke leveranciers- en offerteaanpak.', 'kernboodschap', NULL, 1),
    (v_lane_id, 'argument', 'Ik weet toch niet wie te bellen als de lift kapot is?', 'vooroordeel', NULL, 1),
    (v_lane_id, 'argument', 'Offertes vergelijken is zoveel gedoe, ik pak wel gewoon de goedkoopste.', 'vooroordeel', NULL, 2),
    (v_lane_id, 'argument', 'Het vooroordeel: leveranciers vinden is persoonlijk netwerk — mensen zijn nog niet gewoon om dit via een platform te doen.', 'vooroordeel', NULL, 3),
    (v_lane_id, 'kernargument', 'Een gedeeld netwerk neemt het giswerk weg — minder gokwerk, sneller de juiste hulp, makkelijker te beslissen met de VME.', 'kernargument', NULL, 1),
    (v_lane_id, 'kernargument', 'De goedkoopste offerte is niet per se de beste; wij helpen je de juiste keuze maken.', 'kernargument', NULL, 2),
    (v_lane_id, 'kernargument', 'Zoeken -> vergelijken -> aanvragen -> opvolgen -> betalen in één platform: één aanvraag naar meerdere vakmensen i.p.v. tien losse mails.', 'kernargument', NULL, 3),
    (v_lane_id, 'onderbouwing', 'Eerste gestructureerde leveranciersnetwerk in de BE/NL-markt voor gebouwen.', 'onderbouwing', NULL, 1),
    (v_lane_id, 'onderbouwing', 'Verificatie op echt gebruik door VME''s, niet op betaling voor plaatsing — leveranciers moeten betrouwbaar zijn en hun diensten moeten duidelijk zijn.', 'onderbouwing', NULL, 2),
    (v_lane_id, 'onderbouwing', 'Je eigen vertrouwde vakman kan gewoon mee in het netwerk (bestaande leveranciers gelinkt met geverifieerde).', 'onderbouwing', NULL, 3),
    (v_lane_id, 'product', 'Leverancier-offertes vergelijken.', 'feature', NULL, 1),
    (v_lane_id, 'product', 'Leverancier zoeken op diensten en regio.', 'feature', NULL, 2),
    (v_lane_id, 'product', 'Geverifieerd-badge en "reeds in gesprek"-status maken het leveranciersnetwerk geloofwaardig.', 'feature', NULL, 3),
    (v_lane_id, 'conversie', 'Landingspagina + lead form: "Leveranciers vinden en beoordelen".', 'touchpoint', NULL, 1),
    (v_lane_id, 'conversie', 'Blog: "Wat is het EPC van de gemeenschappelijke delen?"', 'touchpoint', NULL, 2),
    (v_lane_id, 'conversie', 'Ads gericht op leveranciers-zoekintentie.', 'touchpoint', NULL, 3);

END $$;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
