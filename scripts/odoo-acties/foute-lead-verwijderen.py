# Serveractie "Foute lead: verwijderen" op x_foute_lead, de knop Verwijderen
# in het venster. Ingezet door scripts/odoo-acties/foute-lead-venster.mjs.
#
# Verwijdert de lead altijd, en daarna enkel wat aangevinkt is EN nog altijd
# weg mag: alles wordt hier opnieuw nagekeken, want tussen het openen van het
# venster en de klik kan er iets veranderd zijn. In deze volgorde, zodat er
# nooit iets zonder ouder achterblijft: lead, actieblad, contact, gebouw.

Lead = env['crm.lead'].with_context(active_test=False).sudo()
Sheet = env['x_sales_action_sheet'].with_context(active_test=False).sudo()
Partner = env['res.partner'].with_context(active_test=False).sudo()
Order = env['sale.order'].sudo()
Move = env['account.move'].sudo()

venster = record.sudo()
lead = venster.x_lead_id.with_context(active_test=False).sudo()
if lead:
    partner = lead.partner_id.with_context(active_test=False)
    persoon = partner if (partner and not partner.is_company) else Partner
    gebouw = partner if (partner and partner.is_company) else (partner.parent_id if partner else Partner)
    bladen = lead.x_studio_opportunity_actionsheet_ids.with_context(active_test=False)
    if persoon:
        bladen = bladen | Sheet.search([('x_studio_contact_id', '=', persoon.id)])

    try:
        lead.unlink()

        if venster.x_actieblad:
            for blad in bladen:
                if not Lead.search_count([('x_studio_opportunity_actionsheet_ids', 'in', [blad.id])]):
                    blad.unlink()

        if venster.x_contact and persoon and persoon.exists():
            if not (Lead.search_count([('partner_id', '=', persoon.id)])
                    or Sheet.search_count([('x_studio_contact_id', '=', persoon.id)])
                    or Order.search_count([('partner_id', 'child_of', persoon.id)])
                    or Move.search_count([('partner_id', 'child_of', persoon.id)])):
                persoon.unlink()

        if venster.x_gebouw and gebouw and gebouw.exists():
            if not (Partner.search_count([('parent_id', '=', gebouw.id)])
                    or Lead.search_count([('partner_id', 'child_of', gebouw.id)])
                    or Sheet.search_count([('x_studio_for_company_id', '=', gebouw.id)])
                    or Order.search_count([('partner_id', 'child_of', gebouw.id)])
                    or Move.search_count([('partner_id', 'child_of', gebouw.id)])):
                gebouw.unlink()
    except Exception as e:
        env.cr.rollback()
        raise UserError("Verwijderen lukte niet, er is niets verwijderd:\n%s" % e)

venster.unlink()
action = {
    'type': 'ir.actions.act_url',
    'url': '/web#action=crm.crm_lead_action_pipeline',
    'target': 'self',
}
