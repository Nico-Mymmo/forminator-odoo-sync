# Serveractie 913 "Foute Lead (definitief verwijderen)" op crm.lead.
# Ingezet door scripts/odoo-acties/foute-lead.mjs.
#
# Voor een test of spam: verwijdert definitief de lead, en daarna enkel wat
# NERGENS anders meer aan hangt:
# - het actieblad van de persoon, als er geen andere lead meer aan hangt
#   (pijnpunten, checklist en meetings gaan automatisch mee);
# - de persoon, als die geen andere lead en geen actieblad meer heeft;
# - het gebouw, als er geen enkel contact meer onder staat (ook geen
#   gearchiveerd), geen lead, geen actieblad en geen verkooporder of abonnement.
# Tot 2026-10-29 bleef het actieblad als lege wees achter, en ging een gebouw
# al weg als er geen ACTIEF contact meer onder stond.

records = records.sudo()
if not records:
    raise UserError("Geen lead(s) geselecteerd voor deep clean.")

Lead = env['crm.lead'].with_context(active_test=False).sudo()
Sheet = env['x_sales_action_sheet'].with_context(active_test=False).sudo()
Partner = env['res.partner'].with_context(active_test=False).sudo()
Order = env['sale.order'].sudo()

try:
    for lead in records:
        lead = lead.with_context(active_test=False).sudo()
        partner = lead.partner_id.with_context(active_test=False).sudo()
        company = False
        if partner:
            company = partner if partner.is_company else partner.parent_id.with_context(active_test=False).sudo()
        bladen = lead.x_studio_opportunity_actionsheet_ids
        if partner and not partner.is_company:
            bladen = bladen | Sheet.search([('x_studio_contact_id', '=', partner.id)])
        bladen = bladen.with_context(active_test=False).sudo()

        # 1) de lead
        lead.unlink()

        # 2) actiebladen zonder andere lead
        for blad in bladen:
            if not Lead.search_count([('x_studio_opportunity_actionsheet_ids', 'in', [blad.id])]):
                blad.unlink()

        # 3) de persoon
        if partner and not partner.is_company:
            if not Lead.search_count([('partner_id', '=', partner.id)]) and not Sheet.search_count([('x_studio_contact_id', '=', partner.id)]):
                partner.unlink()

        # 4) het gebouw
        if company and company.exists():
            leeg = (
                not Partner.search_count([('parent_id', '=', company.id)])
                and not Lead.search_count([('partner_id', 'child_of', company.id)])
                and not Sheet.search_count([('x_studio_for_company_id', '=', company.id)])
                and not Order.search_count([('partner_id', 'child_of', company.id)])
            )
            if leeg:
                company.unlink()

    action = {
        'type': 'ir.actions.act_url',
        'url': '/web#action=crm.crm_lead_action_pipeline',
        'target': 'self',
    }

except Exception as e:
    env.cr.rollback()
    raise UserError("Fout tijdens deep clean:\n%s" % e)
