# Knop "Maak in OpenVME" op crm.lead (scripts/odoo-acties/openvme-knop.mjs).
# Kijkt na of alles wat OpenVME nodig heeft ingevuld is, en stuurt dan de
# webhook "OpenVME: VME aanmaken (webhook)". Ontbreekt er iets, dan zegt de
# knop welk veld, en wordt er niets verstuurd.
# Geen backslashes in deze code: nieuwe regels via chr(10).

# De VME is een bedrijf in Odoo: het Bedrijf (parent_id) van de contactpersoon.
# Wat verplicht is (afspraak met de ontwikkelaars van OpenVME). Zet op True of False.
KBO_VERPLICHT = True
LEDEN_VERPLICHT = False
WEBHOOK_ID = __WEBHOOK_ID__
VENSTER = 'OpenVME: bevestigen'

# __ML_PARSE__


def ml_mail_ok(e):
    e = (e or '').strip()
    if ' ' in e or e.count('@') != 1:
        return False
    naam, domein = e.split('@')
    return bool(naam) and '.' in domein and not domein.startswith('.') and not domein.endswith('.')


NL = chr(10)
for lead in records:
    fout = []
    p = lead.partner_id
    vme = p.parent_id if p else False
    if not p:
        fout.append('Er staat geen klant (contactpersoon) op de lead.')
    else:
        if p.is_company:
            fout.append('De klant op de lead is een bedrijf. Zet er de contactpersoon (een persoon) op.')
        if p.x_studio_soid:
            fout.append('Deze contactpersoon staat al in OpenVME (soid ' + str(p.x_studio_soid) + ').')
        if not ml_mail_ok(p.email or lead.email_from):
            fout.append('De contactpersoon heeft geen geldig e-mailadres.')
        if not vme and not p.is_company:
            fout.append('De contactpersoon hangt nog aan geen VME. Maak de VME aan als bedrijf en kies ze bij de contactpersoon als Bedrijf.')
    if vme:
        wie = ' (bedrijf ' + (vme.name or '') + ')'
        if not vme.is_company:
            fout.append('Het bedrijf van de contactpersoon' + wie + ' staat niet als bedrijf in Odoo.')
        for veld, label in (('name', 'naam'), ('street', 'straat en huisnummer'), ('zip', 'postcode'), ('city', 'plaats')):
            if not (vme[veld] or '').strip():
                fout.append('Vul de ' + label + ' van de VME in' + wie + '.')
        straat = vme.street or ''
        cijfer = False
        for c in straat:
            if c.isdigit():
                cijfer = True
        if straat.strip() and not cijfer:
            fout.append('Het huisnummer ontbreekt in de straat van de VME' + wie + ': zet het achter de straat, bv. Teststraat 36.')
        if not vme.country_id or vme.country_id.code not in ('BE', 'NL'):
            fout.append('Het land van de VME moet België of Nederland zijn' + wie + '.')
        if KBO_VERPLICHT and not (vme.x_studio_registration_number or '').strip():
            fout.append('Vul het ondernemingsnummer (KBO) van de VME in' + wie + '.')
    leden = []
    for l in ml_parse(lead.x_vme_members):
        if isinstance(l, dict):
            leden.append(l)
    fouteAdressen = []
    for l in leden:
        e = str(l.get('email') or '')
        if not ml_mail_ok(e):
            fouteAdressen.append(e or '(leeg)')
    if LEDEN_VERPLICHT and not leden:
        fout.append('De ledenlijst is leeg (tabblad Syndicoach).')
    if fouteAdressen:
        fout.append('Deze adressen in de ledenlijst kloppen niet: ' + ', '.join(fouteAdressen) + '.')
    if fout:
        if env.context.get('syndicoach_overdracht'):
            # Gestart vanuit "Versturen naar Syndicoach" (syndicoach-en-openvme.mjs):
            # dan is er ook niets naar Syndicoach gegaan.
            raise UserError('Er is niets verstuurd, niet naar Syndicoach en niet naar OpenVME. Op de lead "'
                            + (lead.name or '') + '" ontbreekt nog:' + NL + NL + NL.join(['- ' + f for f in fout]))
        raise UserError('Nog niet klaar voor OpenVME:' + NL + NL + NL.join(['- ' + f for f in fout]))
    if not env.context.get('openvme_bevestigd'):
        # Eerst het venster: wat er doorgaat en wat nog leeg is; doorsturen
        # gebeurt pas met de knop daar (die deze actie opnieuw start).
        view = env['ir.ui.view'].sudo().search([('model', '=', 'crm.lead'), ('name', '=', VENSTER)], limit=1)
        action = {
            'type': 'ir.actions.act_window',
            'name': 'Maak in OpenVME',
            'res_model': 'crm.lead',
            'res_id': lead.id,
            'view_mode': 'form',
            'views': [(view.id, 'form')],
            'target': 'new',
        }
        break
    webhook = env['ir.actions.server'].browse(WEBHOOK_ID)
    if not webhook.exists() or not webhook.webhook_url:
        raise UserError('Alles is ingevuld, maar het adres van OpenVME staat nog niet in de actie "OpenVME: VME aanmaken (webhook)". Vraag het aan de ontwikkelaars van OpenVME.')
    webhook.with_context(active_model='crm.lead', active_id=lead.id, active_ids=[lead.id]).run()
    lead.message_post(body='Doorgestuurd naar OpenVME door ' + (env.user.name or '')
                      + (' (samen met de overdracht naar Syndicoach).' if env.context.get('syndicoach_overdracht') else '.'),
                      message_type='comment', subtype_xmlid='mail.mt_note')
    action = {
        'type': 'ir.actions.client',
        'tag': 'display_notification',
        'params': {'title': 'OpenVME', 'message': 'Doorgestuurd naar OpenVME.', 'type': 'success',
                   'next': {'type': 'ir.actions.act_window_close'}},
    }
