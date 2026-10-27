# Knop "Naar OpenVME en Syndicoach..." in het venster "Maak in OpenVME" op de lead
# (ingezet door scripts/odoo-acties/openvme-knop.mjs).
# Opent het venster "Naar Syndicoach" van het actieblad van deze lead (actie
# 1201): daar vul je de punten voor Syndicoach in, en "Versturen naar Syndicoach
# en OpenVME" stuurt dan beide in een keer (syndicoach-en-openvme.mjs).
OVERDRACHT = 1201
NL = chr(10)

for lead in records:
    vme = lead.partner_id.parent_id if lead.partner_id else False
    sheet = False
    for s in lead.x_studio_opportunity_actionsheet_ids:
        if vme and s.x_studio_for_company_id.id == vme.id:
            sheet = s
            break
    if not sheet and lead.x_studio_opportunity_actionsheet_ids:
        sheet = lead.x_studio_opportunity_actionsheet_ids[0]
    if not sheet:
        raise UserError('Deze lead heeft nog geen actieblad. Zonder actieblad kan er niets naar Syndicoach.' + NL + NL
                        + 'Kies "Enkel naar OpenVME", of koppel eerst het actieblad aan de lead.')
    action = env['ir.actions.server'].browse(OVERDRACHT).with_context(
        active_model='x_sales_action_sheet', active_id=sheet.id, active_ids=[sheet.id]).run()
    break
