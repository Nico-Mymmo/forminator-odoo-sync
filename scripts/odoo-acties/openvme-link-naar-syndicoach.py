# Automatische regel op mail.message (scripts/odoo-acties/openvme-link-naar-syndicoach.mjs).
# OpenVME zet na het aanmaken een notitie op de lead: "VME aangemaakt in OpenVME:
# <a href=...>naam</a>". Die link komt op de VME (res.partner.x_openvme_url) en
# gaat meteen naar de Syndicoach Navigator, via de gewone gebouwsync van elk
# actieblad van die lead (1179 zonder overdracht = geen nieuwe overdracht, dan
# webhook 1177). De Navigator zet er het veld OpenVME-link mee.
PAYLOAD = 1179
WEBHOOK = 1177
Q = chr(34)

for msg in records:
    if msg.model != 'crm.lead' or not msg.res_id:
        continue
    body = msg.body or ''
    i = body.find('href=' + Q)
    if i < 0:
        continue
    url = body[i + 6:].split(Q)[0].strip()
    if not url.startswith('https://'):
        continue
    lead = env['crm.lead'].browse(msg.res_id)
    if not lead.exists():
        continue
    vme = lead.partner_id.parent_id if lead.partner_id else False
    if vme and vme.x_openvme_url != url:
        vme.write({'x_openvme_url': url})
    for sheet in lead.x_studio_opportunity_actionsheet_ids:
        gebouw = sheet.x_studio_for_company_id
        if not gebouw:
            continue
        if gebouw.x_openvme_url != url:
            gebouw.write({'x_openvme_url': url})
        ctx = {'active_model': 'x_sales_action_sheet', 'active_id': sheet.id, 'active_ids': [sheet.id]}
        env['ir.actions.server'].browse(PAYLOAD).with_context(**ctx).run()
        env['ir.actions.server'].browse(WEBHOOK).with_context(**ctx).run()
        sheet.message_post(body='Link naar OpenVME doorgegeven aan Syndicoach: ' + url,
                           message_type='comment', subtype_xmlid='mail.mt_note')
