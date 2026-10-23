# Rekenveld crm.lead.x_vme_members_editor (html, niet bewaard, sanitize uit).
# Toont x_vme_members (JSON [{firstname, lastname, email}]) als tabel om te lezen
# en aan te passen, met het plakvak van het venster "Naar Syndicoach". Wat je
# wijzigt, schrijft de browser meteen naar x_vme_members.
# Ingezet door scripts/odoo-acties/vme-leden-editor.mjs; __ML_INIT__ wordt daar
# vervangen door de browsercode (overdracht-mailadressen.lib.js) met een eigen
# naam (window.__mlL) en eigen schrijfstap, zodat ze nooit die van het venster
# gebruikt.
ML_INIT = r"""__ML_INIT__"""
ML_CEL = "padding:3px 4px;border-bottom:1px solid #eee;"
ML_VELD = "width:100%;padding:3px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"


def h(s):
    return (str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&#39;'))


def schoon(s):
    return ' '.join(str(s or '').replace('|', ' ').replace(';', ' ').split())


# __ML_PARSE__ (scripts/odoo-acties/ml-parse.py)


# Wat een functie gebruikt, krijgt ze als standaardwaarde mee: in een rekenveld
# ziet een functie de andere namen van deze code niet (Odoo houdt ze apart).
def ml_rij(e, v, n, h=h, ML_CEL=ML_CEL, ML_VELD=ML_VELD):
    tds = ''
    for k, w, ph in (('e', e, 'naam@voorbeeld.be'), ('v', v, 'Voornaam'), ('n', n, 'Naam')):
        tds += ("<td style='" + ML_CEL + "'><input type='text' data-mlk='" + k + "' value='" + h(w)
                + "' placeholder='" + ph + "' style='" + ML_VELD + "'></td>")
    return ("<tr data-mlr='1'>" + tds + "<td style='" + ML_CEL + "width:28px;text-align:center;'>"
            + "<button type='button' data-mlweg='1' title='Weghalen' style='border:0;background:none;cursor:pointer;color:#999;font-size:16px;'>×</button></td></tr>")


for record in self:
    # In het formulier rekent Odoo dit veld na een wijziging opnieuw op een
    # tijdelijke kopie van de lead (NewId); .origin is dan het echte nummer.
    rid = record.id
    if not isinstance(rid, int):
        rid = rid.origin
    if not rid:
        record['x_vme_members_editor'] = "<div style='font-size:12px;color:#666;'>Bewaar de lead eerst, dan kan je hier de leden invullen.</div>"
        continue
    leden = [l for l in ml_parse(record.x_vme_members) if isinstance(l, dict)]
    rijen = []
    for l in leden:
        e = schoon(l.get('email'))
        v = schoon(l.get('firstname'))
        nm = schoon(l.get('lastname'))
        if e or v or nm:
            rijen.append((e, v, nm))
    waarde = ('LIJST:' + ';'.join([r[0] + '|' + r[1] + '|' + r[2] for r in rijen])) if rijen else ''
    rijen_html = ''
    for r in rijen:
        rijen_html += ml_rij(r[0], r[1], r[2])
    kop = ''
    for t in ('E-mail', 'Voornaam', 'Naam', ''):
        kop += "<th style='text-align:left;font-weight:600;color:#666;font-size:12px;padding:2px 4px;'>" + t + "</th>"
    record['x_vme_members_editor'] = (
        "<div data-mllead='1' data-id='" + str(rid) + "'>"
        + "<div style='font-weight:600;margin-bottom:4px;'>VME-leden (" + str(len(rijen)) + ")</div>"
        + "<div data-mlbox='1'"
        + " onchange='" + ML_INIT + "window.__mlL3.sync(event.target)'"
        + " onclick='" + ML_INIT + "window.__mlL3.klik(event.target)'"
        + " onpaste='" + ML_INIT + "window.__mlL3.geplakt(event.target)'>"
        + "<input type='hidden' data-punt='leden' value='" + h(waarde) + "'>"
        + "<table data-mlt='1' style='width:100%;border-collapse:collapse;margin-bottom:4px;'><thead><tr>" + kop + "</tr></thead><tbody>"
        + rijen_html + "</tbody></table>"
        + "<button type='button' data-mlplus='1' style='border:0;background:none;color:#017e84;cursor:pointer;padding:0;font-size:12px;'>+ Rij toevoegen</button>"
        + "<div style='margin-top:10px;font-size:12px;color:#666;'>Plak hier een tekst met mailadressen (een mail, een lijst, een tabel...). De adressen en namen komen er vanzelf bij; kijk ze daarna even na.</div>"
        + "<textarea data-mlraw='1' rows='3' style='" + ML_VELD + "'></textarea>"
        + "<div style='display:flex;gap:8px;align-items:center;margin-top:4px;'>"
        + "<span data-mlstatus='1' style='font-size:12px;color:#666;'></span></div>"
        + "<div style='display:flex;gap:8px;align-items:center;margin-top:12px;padding-top:8px;border-top:1px solid #eee;'>"
        + "<span data-mlbewaarstatus='1' style='font-size:12px;color:#666;'>Wijzigingen worden bewaard samen met de lead: als je op Opslaan klikt of de lead verlaat. Verwerpen zet ze terug. Dezelfde lijst staat in het venster Naar Syndicoach op het actieblad.</span></div>"
        + "</div></div>")
