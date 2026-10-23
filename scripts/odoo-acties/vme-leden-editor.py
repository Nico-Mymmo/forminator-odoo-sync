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


# Een kleine JSON-lezer: in een rekenveld is de module json niet beschikbaar, en
# geneste functies mogen er niet (Odoo weigert closures). Leest enkel de vorm die
# hier bestaat: een lijst van objecten met tekstwaarden. Een andere waarde wordt None.
def ml_parse(s):
    s = s or ''
    n = len(s)
    i = 0
    res = []
    obj = None
    key = None
    while i < n:
        c = s[i]
        if c == '{':
            obj = {}
            key = None
            i += 1
            continue
        if c == '}':
            if obj is not None:
                res.append(obj)
            obj = None
            key = None
            i += 1
            continue
        if c == '"':
            out = []
            i += 1
            while i < n and s[i] != '"':
                if s[i] == chr(92) and i + 1 < n:
                    e = s[i + 1]
                    if e == 'u' and i + 5 < n:
                        hx = s[i + 2:i + 6]
                        hexok = len(hx) == 4
                        for ch in hx:
                            if ch not in '0123456789abcdefABCDEF':
                                hexok = False
                        if hexok:
                            out.append(chr(int(hx, 16)))
                        i += 6
                        continue
                    out.append({'n': ' ', 't': ' ', 'r': '', 'b': '', 'f': ''}.get(e, e))
                    i += 2
                    continue
                out.append(s[i])
                i += 1
            i += 1
            txt = ''.join(out)
            if obj is not None:
                if key is None:
                    key = txt
                else:
                    obj[key] = txt
                    key = None
            continue
        if obj is not None and key is not None and c not in (' ', chr(9), chr(10), chr(13), ':', ',', '[', ']'):
            while i < n and s[i] not in ',}]':
                i += 1
            obj[key] = None
            key = None
            continue
        i += 1
    return res


def ml_rij(e, v, n):
    tds = ''
    for k, w, ph in (('e', e, 'naam@voorbeeld.be'), ('v', v, 'Voornaam'), ('n', n, 'Naam')):
        tds += ("<td style='" + ML_CEL + "'><input type='text' data-mlk='" + k + "' value='" + h(w)
                + "' placeholder='" + ph + "' style='" + ML_VELD + "'></td>")
    return ("<tr data-mlr='1'>" + tds + "<td style='" + ML_CEL + "width:28px;text-align:center;'>"
            + "<button type='button' data-mlweg='1' title='Weghalen' style='border:0;background:none;cursor:pointer;color:#999;font-size:16px;'>×</button></td></tr>")


for record in self:
    if not isinstance(record.id, int):
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
    kop = ''
    for t in ('E-mail', 'Voornaam', 'Naam', ''):
        kop += "<th style='text-align:left;font-weight:600;color:#666;font-size:12px;padding:2px 4px;'>" + t + "</th>"
    record['x_vme_members_editor'] = (
        "<div data-mllead='1' data-id='" + str(record.id) + "'>"
        + "<div style='font-weight:600;margin-bottom:4px;'>VME-leden (" + str(len(rijen)) + ")</div>"
        + "<div data-mlbox='1'"
        + " oninput='" + ML_INIT + "window.__mlL.typ(event.target)'"
        + " onchange='" + ML_INIT + "window.__mlL.sync(event.target)'"
        + " onclick='" + ML_INIT + "window.__mlL.klik(event.target)'"
        + " onpaste='" + ML_INIT + "window.__mlL.geplakt(event.target)'>"
        + "<input type='hidden' data-punt='leden' value='" + h(waarde) + "'>"
        + "<table data-mlt='1' style='width:100%;border-collapse:collapse;margin-bottom:4px;'><thead><tr>" + kop + "</tr></thead><tbody>"
        + ''.join([ml_rij(r[0], r[1], r[2]) for r in rijen]) + "</tbody></table>"
        + "<button type='button' data-mlplus='1' style='border:0;background:none;color:#017e84;cursor:pointer;padding:0;font-size:12px;'>+ Rij toevoegen</button>"
        + "<div style='margin-top:10px;font-size:12px;color:#666;'>Plak hier een tekst met mailadressen (een mail, een lijst, een tabel...). De adressen en namen komen er vanzelf bij; kijk ze daarna even na. Wijzigingen worden meteen bewaard.</div>"
        + "<textarea data-mlraw='1' rows='3' style='" + ML_VELD + "'></textarea>"
        + "<div style='display:flex;gap:8px;align-items:center;margin-top:4px;'>"
        + "<button type='button' data-mlhaal='1' class='btn btn-secondary btn-sm'>Haal adressen eruit</button>"
        + "<span data-mlstatus='1' style='font-size:12px;color:#666;'></span></div>"
        + "</div></div>")
