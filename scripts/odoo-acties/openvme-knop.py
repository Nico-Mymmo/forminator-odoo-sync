# Knop "Maak in OpenVME" op crm.lead (scripts/odoo-acties/openvme-knop.mjs).
# Kijkt na of alles wat OpenVME nodig heeft ingevuld is, en stuurt dan de
# webhook "OpenVME: VME aanmaken (webhook)". Ontbreekt er iets, dan zegt de
# knop welk veld, en wordt er niets verstuurd.
# Geen backslashes in deze code: nieuwe regels via chr(10).

# Wat verplicht is (afspraak met de ontwikkelaars van OpenVME). Zet op True of False.
KBO_VERPLICHT = True
LEDEN_VERPLICHT = False
WEBHOOK_ID = __WEBHOOK_ID__

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
    for veld, label in (('x_vme_naam', 'naam'), ('x_vme_straat', 'straat'),
                        ('x_vme_huisnummer', 'nummer'), ('x_vme_postcode', 'postcode'),
                        ('x_vme_plaats', 'plaats'), ('x_vme_land', 'land')):
        w = lead[veld]
        if not w or not str(w).strip():
            fout.append('Vul de ' + label + ' van de VME in (tabblad Syndicoach).')
    if KBO_VERPLICHT and not (lead.x_vme_kbo or '').strip():
        fout.append('Vul het KBO-nummer van de VME in (tabblad Syndicoach).')
    p = lead.partner_id
    if not p:
        fout.append('Er staat geen klant (contactpersoon) op de lead.')
    else:
        if p.x_studio_soid:
            fout.append('Deze contactpersoon staat al in OpenVME (soid ' + str(p.x_studio_soid) + ').')
        if not ml_mail_ok(p.email or lead.email_from):
            fout.append('De contactpersoon heeft geen geldig e-mailadres.')
        if not (p.mobile or p.phone or lead.mobile or lead.phone):
            fout.append('De contactpersoon heeft geen gsm- of telefoonnummer.')
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
        raise UserError('Nog niet klaar voor OpenVME:' + NL + NL + NL.join(['- ' + f for f in fout]))
    webhook = env['ir.actions.server'].browse(WEBHOOK_ID)
    if not webhook.exists() or not webhook.webhook_url:
        raise UserError('Alles is ingevuld, maar het adres van OpenVME staat nog niet in de actie "OpenVME: VME aanmaken (webhook)". Vraag het aan de ontwikkelaars van OpenVME.')
    webhook.with_context(active_model='crm.lead', active_id=lead.id, active_ids=[lead.id]).run()
    lead.message_post(body='Doorgestuurd naar OpenVME door ' + (env.user.name or '') + '.',
                      message_type='comment', subtype_xmlid='mail.mt_note')
