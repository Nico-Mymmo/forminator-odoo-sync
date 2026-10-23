# Rekenveld crm.lead.x_vme_controle_html (html, niet bewaard): het overzicht in
# het venster "Maak in OpenVME" (scripts/odoo-acties/openvme-knop.mjs).
# Toont wat er naar OpenVME gaat, en in het oranje wat nog leeg is.
# In een rekenveld ziet een functie de andere namen niet: daarom geen
# hulpfuncties die elkaar oproepen, en geen backslashes.


def h(s):
    return (str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&#39;'))


LAND = {'BE': 'België', 'NL': 'Nederland'}
for record in self:
    p = record.partner_id
    email = (p.email if p else '') or record.email_from or ''
    gsm = (p.mobile if p else '') or (p.phone if p else '') or record.mobile or record.phone or ''
    leden = record.x_vme_members or ''
    aantal = leden.count('"email"') if leden else 0
    adres = ' '.join([x for x in [record.x_vme_straat or '', record.x_vme_huisnummer or ''] if x])
    plaats = ' '.join([x for x in [record.x_vme_postcode or '', record.x_vme_plaats or ''] if x])
    land = LAND.get(record.x_vme_land or '', '')
    regels = [
        ('Naam van de VME', record.x_vme_naam or ''),
        ('KBO-nummer', record.x_vme_kbo or ''),
        ('Adres', ', '.join([x for x in [adres, plaats, land] if x])),
        ('Contactpersoon', ((p.name if p else '') or record.contact_name or '')),
        ('E-mail contactpersoon', email),
        ('Gsm of telefoon', gsm),
        ('Leden', (str(aantal) + (' lid' if aantal == 1 else ' leden')) if aantal else ''),
    ]
    rijen = ''
    leeg = []
    for label, waarde in regels:
        if waarde:
            w = h(waarde)
            stijl = 'color:#1f2430;'
        else:
            w = 'leeg'
            stijl = 'color:#b45309;font-weight:600;'
            leeg.append(label.lower())
        rijen += ("<tr><td style='padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;'>" + h(label)
                  + "</td><td style='padding:4px 0;" + stijl + "'>" + w + "</td></tr>")
    if leeg:
        kop = ("<div style='padding:8px 12px;border-radius:6px;background-color:#fef3c7;color:#92400e;margin-bottom:12px;'>"
               + "Nog leeg: " + h(', '.join(leeg)) + ". Je kan toch doorsturen; dit kan nadien in OpenVME aangevuld worden.</div>")
    else:
        kop = ("<div style='padding:8px 12px;border-radius:6px;background-color:#dcfce7;color:#166534;margin-bottom:12px;'>"
               + "Alles is ingevuld.</div>")
    record['x_vme_controle_html'] = (
        "<div style='font-size:14px;'>" + kop
        + "<p style='margin:0 0 8px;'>Deze gegevens gaan naar OpenVME:</p>"
        + "<table style='border-collapse:collapse;'>" + rijen + "</table></div>")
