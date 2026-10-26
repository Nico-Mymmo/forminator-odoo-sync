# Rekenveld crm.lead.x_vme_controle_html (html, niet bewaard): het overzicht in
# het venster "Maak in OpenVME" en op het tabblad Syndicoach
# (scripts/odoo-acties/openvme-knop.mjs).
# De VME is het Bedrijf (parent_id) van de contactpersoon op de lead.
# Rood = nog nodig voor je kan doorsturen, oranje = leeg maar niet verplicht.
# Moet gelijk lopen met de controle in openvme-knop.py.
# In een rekenveld ziet een functie de andere namen niet: daarom geen
# hulpfuncties die elkaar oproepen, en geen backslashes.


def h(s):
    return (str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&#39;'))


KBO_VERPLICHT = True
for record in self:
    p = record.partner_id
    vme = p.parent_id if p else False
    email = (p.email if p else '') or record.email_from or ''
    gsm = (p.mobile if p else '') or (p.phone if p else '') or record.mobile or record.phone or ''
    leden = record.x_vme_members or ''
    aantal = leden.count('"email"') if leden else 0
    naam = vme.name if vme else ''
    kbo = (vme.x_studio_registration_number or '') if vme else ''
    straat = (vme.street or '') if vme else ''
    plaats = ' '.join([x for x in [(vme.zip or '') if vme else '', (vme.city or '') if vme else ''] if x])
    land = ''
    if vme and vme.country_id and vme.country_id.code in ('BE', 'NL'):
        land = vme.country_id.name or vme.country_id.code
    cijfer = False
    for c in straat:
        if c.isdigit():
            cijfer = True
    adres_ok = bool(straat.strip()) and cijfer and bool((vme.zip or '').strip()) and bool((vme.city or '').strip()) and bool(land) if vme else False
    adres = ', '.join([x for x in [straat, plaats, land] if x])
    if vme and not cijfer and straat:
        adres = adres + ' (huisnummer ontbreekt)'
    # (label, waarde, ok, verplicht)
    regels = [
        ('Contactpersoon', (p.name if p else '') or record.contact_name or '', bool(p) and not p.is_company, True),
        ('E-mail contactpersoon', email, '@' in email, True),
        ('Gsm of telefoon', gsm, bool(gsm), False),
        ('VME (bedrijf van de contactpersoon)', naam, bool(vme) and vme.is_company, True),
        ('Adres van de VME', adres, adres_ok, True),
        ('Ondernemingsnummer', kbo, bool(kbo.strip()), KBO_VERPLICHT),
        ('Leden', (str(aantal) + (' lid' if aantal == 1 else ' leden')) if aantal else '', bool(aantal), False),
    ]
    rijen = ''
    nodig = []
    leeg = []
    for label, waarde, ok, verplicht in regels:
        if ok:
            stijl = 'color:#1f2430;'
        elif verplicht:
            stijl = 'color:#b91c1c;font-weight:600;'
            nodig.append(label.lower())
        else:
            stijl = 'color:#b45309;font-weight:600;'
            leeg.append(label.lower())
        w = h(waarde) if waarde else ('nog nodig' if verplicht else 'leeg')
        rijen += ("<tr><td style='padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;'>" + h(label)
                  + "</td><td style='padding:4px 0;" + stijl + "'>" + w + "</td></tr>")
    kop = ''
    if nodig:
        uitleg = ''
        if not vme:
            uitleg = (' Maak de VME aan als bedrijf (met adres en ondernemingsnummer) en kies ze bij de contactpersoon als Bedrijf.')
        kop += ("<div style='padding:8px 12px;border-radius:6px;background-color:#fee2e2;color:#991b1b;margin-bottom:8px;'>"
                + "Nog nodig voor je kan doorsturen: " + h(', '.join(nodig)) + "." + h(uitleg) + "</div>")
    if leeg:
        kop += ("<div style='padding:8px 12px;border-radius:6px;background-color:#fef3c7;color:#92400e;margin-bottom:8px;'>"
                + "Nog leeg: " + h(', '.join(leeg)) + ". Dat mag; het kan nadien in OpenVME aangevuld worden.</div>")
    if not nodig and not leeg:
        kop = ("<div style='padding:8px 12px;border-radius:6px;background-color:#dcfce7;color:#166534;margin-bottom:8px;'>"
               + "Alles is ingevuld.</div>")
    link = ''
    if vme:
        link = ("<p style='margin:8px 0 0;'><a href='/web#id=" + str(vme.id) + "&amp;model=res.partner&amp;view_type=form' target='_blank'>"
                + "VME openen om aan te passen</a></p>")
    record['x_vme_controle_html'] = (
        "<div style='font-size:14px;'>" + kop
        + "<p style='margin:4px 0 8px;'>Deze gegevens gaan naar OpenVME:</p>"
        + "<table style='border-collapse:collapse;'>" + rijen + "</table>" + link + "</div>")
