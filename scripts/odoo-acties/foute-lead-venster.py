# Serveractie "Foute lead: venster" op crm.lead, achter de knop Foute Lead.
# Ingezet door scripts/odoo-acties/foute-lead-venster.mjs.
#
# Kijkt na wat er aan de lead hangt (actieblad, contactpersoon, gebouw), wat
# daarvan weg MAG, en opent een venster met een vinkje per onderdeel.
# Wat niet bestaat, staat er niet bij; wat niet weg mag, staat grijs met de
# reden. Het verwijderen zelf gebeurt in "Foute lead: verwijderen", dat alles
# opnieuw nakijkt.

Lead = env['crm.lead'].with_context(active_test=False).sudo()
Sheet = env['x_sales_action_sheet'].with_context(active_test=False).sudo()
Partner = env['res.partner'].with_context(active_test=False).sudo()
Order = env['sale.order'].sudo()
Move = env['account.move'].sudo()
Msg = env['mail.message'].sudo()
Wiz = env['x_foute_lead'].sudo()

# Oude, niet afgewerkte vensters opruimen (wie op Annuleren klikte).
Wiz.search([('create_date', '<', datetime.datetime.now() - datetime.timedelta(days=1))]).unlink()

lead = record.with_context(active_test=False).sudo()
partner = lead.partner_id.with_context(active_test=False)
persoon = partner if (partner and not partner.is_company) else Partner
gebouw = partner if (partner and partner.is_company) else (partner.parent_id if partner else Partner)
bladen = lead.x_studio_opportunity_actionsheet_ids.with_context(active_test=False)
if persoon:
    bladen = bladen | Sheet.search([('x_studio_contact_id', '=', persoon.id)])


def notities(model, ids):
    return Msg.search_count([('model', '=', model), ('res_id', 'in', ids), ('message_type', 'in', ['comment', 'email'])])


def meervoud(n, een, veel):
    return '%s %s' % (n, een if n == 1 else veel)


waarden = {'x_name': lead.name or 'Foute lead', 'x_lead_id': lead.id}

# --- de lead zelf: gaat altijd weg ---
delen = []
if lead.stage_id:
    delen.append('fase ' + lead.stage_id.name)
delen.append('aangemaakt ' + lead.create_date.strftime('%d/%m/%Y'))
n = notities('crm.lead', [lead.id])
if n:
    delen.append(meervoud(n, 'bericht of notitie', 'berichten of notities'))
waarden['x_lead_tekst'] = (lead.name or '') + ' (' + ', '.join(delen) + ')'

# --- actieblad ---
waarden['x_heeft_actieblad'] = bool(bladen)
if bladen:
    andere = Lead.search([('x_studio_opportunity_actionsheet_ids', 'in', bladen.ids), ('id', '!=', lead.id)])
    stukken = []
    for b in bladen:
        info = []
        if b.x_studio_stage_id:
            info.append(b.x_studio_stage_id.x_name)
        if b.x_studio_linked_as_meetings_ids:
            info.append(meervoud(len(b.x_studio_linked_as_meetings_ids), 'meeting', 'meetings'))
        nb = notities('x_sales_action_sheet', [b.id])
        if nb:
            info.append(meervoud(nb, 'notitie', 'notities'))
        stukken.append((b.x_name or 'zonder naam') + (' (' + ', '.join(info) + ')' if info else ''))
    tekst = '; '.join(stukken)
    if andere:
        waarden['x_mag_actieblad'] = False
        tekst += '. Kan niet weg: hangt ook aan ' + ', '.join(andere.mapped('name')[:3]) + '.'
    else:
        waarden['x_mag_actieblad'] = True
    waarden['x_actieblad_tekst'] = tekst
    waarden['x_actieblad'] = waarden['x_mag_actieblad']

# --- contactpersoon ---
waarden['x_heeft_contact'] = bool(persoon)
if persoon:
    redenen = []
    andere = Lead.search_count([('partner_id', '=', persoon.id), ('id', '!=', lead.id)])
    if andere:
        redenen.append('heeft nog ' + meervoud(andere, 'andere lead', 'andere leads'))
    eigen_bladen = Sheet.search([('x_studio_contact_id', '=', persoon.id)]) - bladen
    if eigen_bladen:
        redenen.append('heeft nog een ander actieblad')
    if Order.search_count([('partner_id', 'child_of', persoon.id)]):
        redenen.append('heeft een offerte of abonnement')
    if Move.search_count([('partner_id', 'child_of', persoon.id)]):
        redenen.append('heeft een factuur')
    info = []
    if persoon.email:
        info.append(persoon.email)
    np = notities('res.partner', [persoon.id])
    if np:
        info.append(meervoud(np, 'bericht', 'berichten'))
    tekst = (persoon.name or '') + (' (' + ', '.join(info) + ')' if info else '')
    if redenen:
        tekst += '. Kan niet weg: ' + ', '.join(redenen) + '.'
    elif bladen:
        tekst += '. Gaat enkel mee weg als ook het actieblad weggaat.'
    waarden['x_mag_contact'] = not redenen
    waarden['x_contact_tekst'] = tekst
    waarden['x_contact'] = not redenen

# --- gebouw ---
waarden['x_heeft_gebouw'] = bool(gebouw)
if gebouw:
    redenen = []
    anderen = Partner.search([('parent_id', '=', gebouw.id), ('id', '!=', persoon.id or 0)])
    if anderen:
        redenen.append('ook ' + ', '.join(anderen.mapped('name')[:3]) + ' staat eronder')
    if Lead.search_count([('partner_id', 'child_of', gebouw.id), ('id', '!=', lead.id)]):
        redenen.append('er hangt nog een andere lead aan')
    if Sheet.search_count([('x_studio_for_company_id', '=', gebouw.id), ('id', 'not in', bladen.ids)]):
        redenen.append('er hangt nog een ander actieblad aan')
    if Order.search_count([('partner_id', 'child_of', gebouw.id)]):
        redenen.append('er is een offerte of abonnement')
    if Move.search_count([('partner_id', 'child_of', gebouw.id)]):
        redenen.append('er is een factuur')
    tekst = gebouw.name or ''
    if redenen:
        tekst += '. Kan niet weg: ' + '; '.join(redenen) + '.'
    elif persoon:
        tekst += '. Gaat enkel mee weg als ook de contactpersoon weggaat.'
    waarden['x_mag_gebouw'] = not redenen
    waarden['x_gebouw_tekst'] = tekst
    waarden['x_gebouw'] = not redenen

venster = Wiz.create(waarden)
action = {
    'type': 'ir.actions.act_window',
    'name': 'Foute lead verwijderen',
    'res_model': 'x_foute_lead',
    'res_id': venster.id,
    'view_mode': 'form',
    'views': [[False, 'form']],
    'target': 'new',
}
