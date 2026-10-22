#!/usr/bin/env node
/**
 * Mailadressen als lijst (e-mail, voornaam, naam) in het venster
 * "Naar Syndicoach" op een actieblad, en zo doorgestuurd naar de Navigator.
 *
 * Past twee serveracties in Odoo aan (geen Studio-veld erbij):
 *   1201  Custom Button | Open Overdracht Syndicoach  -> het venster tekent de
 *         lijst + een plakvak; de tekst wordt in de browser ontleed (geen AI),
 *         zie overdracht-mailadressen.lib.js.
 *   1179  Custom Sub | Generate Syndicoach Navigator Webhook Payload -> de lijst
 *         gaat als leesbare regels ("email | voornaam | naam") in `waarde` en
 *         als `mailadressen` [{email, voornaam, naam}] mee.
 *
 * Opslag in x_studio_overdracht_antwoorden: "LIJST:" + rijen gescheiden door
 * ";" met kolommen gescheiden door "|". Een oude vrije tekst blijft werken: die
 * komt in het plakvak en wordt bij het openen meteen ontleed.
 *
 * Welke punt: een checklistpunt van het type "tekst" met "mail" in de naam.
 *
 * Gebruik:  node scripts/odoo-acties/overdracht-mailadressen.mjs           (enkel tonen)
 *           node scripts/odoo-acties/overdracht-mailadressen.mjs --schrijf (naar Odoo)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const vars = Object.fromEntries(
  readFileSync(join(hier, '../../.dev.vars'), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const URL = 'https://mymmo.odoo.com/jsonrpc';
const DB = vars.DB_NAME, UID = Number(vars.UID), KEY = vars.API_KEY;
const schrijf = process.argv.includes('--schrijf');

async function kw(model, method, args, kwargs = {}) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: 'object', method: 'execute_kw', args: [DB, UID, KEY, model, method, args, kwargs] } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error.data?.message || j.error));
  return j.result;
}

function vervang(code, oud, nieuw, wat) {
  const n = code.split(oud).length - 1;
  if (n !== 1) throw new Error(`${wat}: verwacht 1 treffer, gevonden ${n}`);
  return code.replace(oud, () => nieuw);
}

// --- De browsercode, zonder commentaarregels -------------------------------
const lib = readFileSync(join(hier, 'overdracht-mailadressen.lib.js'), 'utf8')
  .replace(/\r/g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').trim();
for (const teken of ["'", '<', '&', '"""']) {
  if (lib.includes(teken)) throw new Error(`De browsercode bevat ${teken} -- mag niet in een HTML-attribuut`);
}
const [libVoor, libNa] = lib.split('/*SCHRIJF*/');
if (libNa === undefined) throw new Error('Marker /*SCHRIJF*/ ontbreekt');

const PY_1201 = `
# --- Mailadressen als lijst (scripts/odoo-acties/overdracht-mailadressen.mjs) ---
# De lijst wordt in de browser ontleed, zonder AI. Opslag: "LIJST:" + rijen met
# ";" ertussen, kolommen e-mail|voornaam|naam. De verborgen input met data-punt
# draagt die waarde; SCHRIJF hierboven neemt ze mee zoals elk ander punt.
ML_LIB = r"""${libVoor}""" + SCHRIJF + r"""${libNa}"""
ML_INIT = "window.__ml=window.__ml||" + ML_LIB + "();"
ML_CEL = "padding:3px 4px;border-bottom:1px solid #eee;"
ML_VELD = "width:100%;padding:3px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;"

def is_mailpunt(it):
    # Herkend op de NAAM, want in de Navigator kan je enkel Vinkje, Tekst of
    # Keuzelijst kiezen. "Mail verstuurd" telt niet, "E-mailadressen eigenaars" wel.
    n = (it.x_name or '').lower()
    return (it.x_studio_type or 'checkbox') == 'tekst' and ('mailadres' in n or 'e-mail' in n or 'email' in n)

def ml_rij(e, v, n):
    tds = ''
    for k, val, ph in (('e', e, 'naam@voorbeeld.be'), ('v', v, 'Voornaam'), ('n', n, 'Naam')):
        tds += ("<td style='" + ML_CEL + "'><input type='text' data-mlk='" + k + "' value='" + h(val)
                + "' placeholder='" + ph + "' style='" + ML_VELD + "'></td>")
    return ("<tr data-mlr='1'>" + tds + "<td style='" + ML_CEL + "width:28px;text-align:center;'>"
            + "<button type='button' data-mlweg='1' title='Weghalen' style='border:0;background:none;cursor:pointer;color:#999;font-size:16px;'>×</button></td></tr>")

def ml_doos(nid, waarde):
    rijen = []
    raw = ''
    if waarde.startswith('LIJST:'):
        for r in waarde[6:].split(';'):
            c = (r.split('|') + ['', '', ''])[:3]
            if c[0] or c[1] or c[2]:
                rijen.append(c)
    else:
        raw = waarde
    kop = ''
    for t in ('E-mail', 'Voornaam', 'Naam', ''):
        kop += "<th style='text-align:left;font-weight:600;color:#666;font-size:12px;padding:2px 4px;'>" + t + "</th>"
    auto = ''
    if raw and '@' in raw:
        auto = "<img src='data:image/gif;base64,x' style='display:none' onerror='" + ML_INIT + "window.__ml.haal(event.target)'>"
    return ("<div data-mlbox='1'"
            + " oninput='" + ML_INIT + "window.__ml.typ(event.target)'"
            + " onchange='" + ML_INIT + "window.__ml.sync(event.target)'"
            + " onclick='" + ML_INIT + "window.__ml.klik(event.target)'"
            + " onpaste='" + ML_INIT + "window.__ml.geplakt(event.target)'>"
            + "<input type='hidden' data-punt='" + h(nid) + "' value='" + h(waarde) + "'>"
            + "<table data-mlt='1' style='width:100%;border-collapse:collapse;margin-bottom:4px;'><thead><tr>" + kop + "</tr></thead><tbody>"
            + ''.join([ml_rij(c[0], c[1], c[2]) for c in rijen]) + "</tbody></table>"
            + "<button type='button' data-mlplus='1' style='border:0;background:none;color:#017e84;cursor:pointer;padding:0;font-size:12px;'>+ Rij toevoegen</button>"
            + "<div style='margin-top:10px;font-size:12px;color:#666;'>Plak hier een tekst met mailadressen (een mail, een lijst, een tabel...). De adressen en namen komen er vanzelf uit; kijk ze daarna even na.</div>"
            + "<textarea data-mlraw='1' rows='3' style='" + ML_VELD + "'>" + h(raw) + "</textarea>"
            + "<div style='display:flex;gap:8px;align-items:center;margin-top:4px;'>"
            + "<button type='button' data-mlhaal='1' class='btn btn-secondary btn-sm'>Haal adressen eruit</button>"
            + "<span data-mlstatus='1' style='font-size:12px;color:#666;'></span></div>"
            + auto + "</div>")

`;

const PY_1179_PUNT_OUD = `        waarde = antw.get(it.x_studio_navigator_id or '', '')
        punten.append({
            "item_id": it.x_studio_navigator_id or "",
            "naam": it.x_name or "",
            "type": soort,
            "waarde": waarde,
        })`;
const PY_1179_PUNT_NIEUW = `        waarde = antw.get(it.x_studio_navigator_id or '', '')
        # Mailadressen als lijst (scripts/odoo-acties/overdracht-mailadressen.mjs)
        ml_lijst = []
        if waarde.startswith('LIJST:'):
            for r in waarde[6:].split(';'):
                c = (r.split('|') + ['', '', ''])[:3]
                if c[0] or c[1] or c[2]:
                    ml_lijst.append({"email": c[0].strip(), "voornaam": c[1].strip(), "naam": c[2].strip()})
            waarde = '\\n'.join([x["email"] + ' | ' + x["voornaam"] + ' | ' + x["naam"] for x in ml_lijst])
        punt = {
            "item_id": it.x_studio_navigator_id or "",
            "naam": it.x_name or "",
            "type": soort,
            "waarde": waarde,
        }
        if ml_lijst:
            punt["mailadressen"] = ml_lijst
        punten.append(punt)`;
const PY_1179_CHATTER_OUD = `lijst += '<li>' + h(it.x_name) + ': <b>' + (h(waarde) or '—') + '</b></li>'`;
const PY_1179_CHATTER_NIEUW = `lijst += '<li>' + h(it.x_name) + ': <b>' + (h(waarde).replace('\\n', '<br/>') or '—') + '</b></li>'`;

const PY_1201_LUS_OUD = `        attr = " data-punt='" + h(nid) + "'"
        if soort == 'tekst':`;
const PY_1201_LUS_NIEUW = `        attr = " data-punt='" + h(nid) + "'"
        if is_mailpunt(it):
            rijen += ("<tr><td colspan='2' style='" + CEL + "'><div style='margin-bottom:4px;'>" + h(it.x_name) + "</div>"
                      + ml_doos(nid, waarde) + "</td></tr>")
            continue
        if waarde.startswith('LIJST:'):
            # Een punt dat niet (meer) als lijst herkend wordt (hernoemd in de
            # Navigator): toon de bewaarde lijst leesbaar in het gewone tekstveld.
            ml_delen = []
            for r in waarde[6:].split(';'):
                c = (r.split('|') + ['', '', ''])[:3]
                nm = (c[1] + ' ' + c[2]).strip()
                if c[0]:
                    ml_delen.append((nm + ' (' + c[0] + ')') if nm else c[0])
            waarde = ', '.join(ml_delen)
        if soort == 'tekst':`;

// --vanaf-oud: opnieuw toepassen op de code van VOOR de eerste aanpassing
// (bewaard in .uit/), om een verbeterde versie in te zetten.
const vanafOud = process.argv.includes('--vanaf-oud');
const acties = vanafOud
  ? [1201, 1179].map((id) => ({ id, code: readFileSync(join(hier, '.uit', id + '-oud.py'), 'utf8') }))
  : await kw('ir.actions.server', 'read', [[1201, 1179]], { fields: ['id', 'code'] });
const code = Object.fromEntries(acties.map((a) => [a.id, String(a.code || '').replace(/\r\n/g, '\n')]));

let c1201 = code[1201];
if (c1201.includes('ML_LIB')) throw new Error('1201 is al aangepast');
c1201 = vervang(c1201, '\ndef h(s):', PY_1201 + 'def h(s):', '1201 invoegpunt');
c1201 = vervang(c1201, PY_1201_LUS_OUD, PY_1201_LUS_NIEUW, '1201 lus');

let c1179 = code[1179];
if (c1179.includes('ml_lijst')) throw new Error('1179 is al aangepast');
c1179 = vervang(c1179, PY_1179_PUNT_OUD, PY_1179_PUNT_NIEUW, '1179 punten');
c1179 = vervang(c1179, PY_1179_CHATTER_OUD, PY_1179_CHATTER_NIEUW, '1179 chatter');

const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
if (!vanafOud) writeFileSync(join(uit, '1201-oud.py'), code[1201]);
writeFileSync(join(uit, '1201-nieuw.py'), c1201);
if (!vanafOud) writeFileSync(join(uit, '1179-oud.py'), code[1179]);
writeFileSync(join(uit, '1179-nieuw.py'), c1179);
console.log('Klaargezet in', uit);

if (schrijf) {
  await kw('ir.actions.server', 'write', [[1201], { code: c1201 }]);
  await kw('ir.actions.server', 'write', [[1179], { code: c1179 }]);
  console.log('Geschreven naar Odoo: 1201 en 1179.');
}
