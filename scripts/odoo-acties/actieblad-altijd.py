# Automatische regel op crm.lead: "Actieblad: altijd een, pauzeren als verloren".
# Ingezet door scripts/odoo-acties/actieblad-altijd.mjs.
#
# 1) Staat de lead op een PERSOON (geen bedrijf), dan heeft die persoon een
#    actieblad en hangt de lead eraan. Bestaat er nog geen, dan wordt het
#    aangemaakt (de fase, pijnpunten en checklist zet Odoo zelf via de
#    bestaande regels 37, 29 en 66). Heeft de persoon er al een of meer, dan
#    hangt de lead aan elk ervan: er wordt nooit iets samengevoegd of gekozen.
#    Een gearchiveerd actieblad van die persoon komt terug uit het archief
#    zodra er een actieve lead aan hangt.
# 2) Zijn ALLE leads van een actieblad verloren, dan krijgt het het vinkje
#    Gepauzeerd (x_studio_gepauzeerd), in welke fase het ook staat. Wordt een
#    van die leads weer actief, dan gaat het vinkje uit. De fase blijft staan:
#    zo zie je waar in het traject iemand afhaakte. Heeft het gebouw een
#    lopend abonnement, dan wordt het nooit gepauzeerd.
# Er wordt enkel geschreven als er echt iets verandert.

Sheet = env['x_sales_action_sheet'].with_context(active_test=False)
Lead = env['crm.lead'].with_context(active_test=False)

for lead in records:
    partner = lead.partner_id
    if partner and not partner.is_company:
        bladen = Sheet.search([('x_studio_contact_id', '=', partner.id)], order='id asc')
        if not bladen:
            Sheet.create({
                # Enkel namen, geen vaste woorden: juist in elke taal.
                'x_name': (partner.parent_id.name + ' · ' + (partner.name or '')) if partner.parent_id else (partner.name or ''),
                'x_studio_contact_id': partner.id,
                'x_studio_user_id': lead.user_id.id or False,
                'x_studio_as_opportunity_ids': [(4, lead.id)],
            })
        else:
            for blad in bladen:
                if lead.id not in blad.x_studio_as_opportunity_ids.ids:
                    blad.write({'x_studio_as_opportunity_ids': [(4, lead.id)]})

    # Via de lead zelf, zonder het archief weg te filteren.
    for blad in lead.with_context(active_test=False).x_studio_opportunity_actionsheet_ids:
        alle = Lead.search([('x_studio_opportunity_actionsheet_ids', 'in', [blad.id])])
        open_lead = False
        for l in alle:
            if l.active:
                open_lead = True
        echte_open_lead = open_lead
        # Een gebouw met een lopend abonnement is klant: nooit pauzeren, ook
        # als de lead van DEZE persoon verloren staat (vaak won een collega).
        gebouw = blad.x_studio_for_company_id
        if gebouw and env['sale.order'].search_count([
            ('partner_id', 'child_of', gebouw.id),
            ('is_subscription', '=', True),
            ('subscription_state', 'in', ['3_progress', '4_paused']),
        ]):
            open_lead = True
        waarden = {}
        if alle and not open_lead and not blad.x_studio_gepauzeerd:
            waarden['x_studio_gepauzeerd'] = True
        if open_lead and blad.x_studio_gepauzeerd:
            waarden['x_studio_gepauzeerd'] = False
        if echte_open_lead and not blad.x_active:
            waarden['x_active'] = True
        if waarden:
            blad.write(waarden)
