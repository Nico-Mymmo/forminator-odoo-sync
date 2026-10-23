# Automatische regel op crm.lead: "VME-leden: contactpersoon erin, geen dubbels".
# Ingezet door scripts/odoo-acties/vme-leden-contact.mjs.
#
# Bij aanmaken/wijzigen van de klant, de ledenlijst of de fase:
# - de contactpersoon (partner_id) staat in x_vme_members, als eerste rij,
#   tenzij zijn e-mailadres er al in staat;
# - elk e-mailadres staat er maar een keer in (de eerste blijft);
# - enkel voor leads met een ledenlijst, een naam van de VME, of die gewonnen zijn.
# Er wordt enkel geschreven als er echt iets verandert.
# Geen backslashes in deze code: Q en BS worden met chr() gemaakt.

# __ML_PARSE__


def ml_js(s):
    BS = chr(92)
    Q = chr(34)
    out = ''
    for ch in str(s or ''):
        if ch == BS:
            out += BS + BS
        elif ch == Q:
            out += BS + Q
        elif ord(ch) < 32:
            out += ' '
        else:
            out += ch
    return Q + out + Q


for lead in records:
    heeft_lijst = bool(lead.x_vme_members)
    gewonnen = lead.won_status == 'won'
    if not heeft_lijst and not gewonnen and not lead.x_vme_naam:
        continue
    lijst = []
    for l in ml_parse(lead.x_vme_members):
        if isinstance(l, dict):
            lijst.append(l)
    gezien = set()
    schoon = []
    for l in lijst:
        e = str(l.get('email') or '').strip().lower()
        if e:
            if e in gezien:
                continue
            gezien.add(e)
        schoon.append({
            'firstname': ' '.join(str(l.get('firstname') or '').split()),
            'lastname': ' '.join(str(l.get('lastname') or '').split()),
            'email': e,
        })
    veranderd = len(schoon) != len(lijst)
    p = lead.partner_id
    email = ((p.email if p else '') or lead.email_from or '').strip().lower()
    if email and '@' in email and email not in gezien:
        delen = ((p.name if p else '') or lead.contact_name or '').split()
        schoon.insert(0, {
            'firstname': delen[0] if delen else '',
            'lastname': ' '.join(delen[1:]),
            'email': email,
        })
        veranderd = True
    if veranderd:
        rijen = []
        for x in schoon:
            rijen.append('{"firstname":' + ml_js(x['firstname']) + ',"lastname":' + ml_js(x['lastname'])
                         + ',"email":' + ml_js(x['email']) + '}')
        lead.write({'x_vme_members': ('[' + ','.join(rijen) + ']') if rijen else False})
