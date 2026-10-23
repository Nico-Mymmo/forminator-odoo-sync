(function(){
// Mailadressen uit een tekst halen voor het venster "Naar Syndicoach" (Odoo,
// serveractie 1201). Dit bestand komt LETTERLIJK in een HTML-attribuut tussen
// enkele aanhalingstekens: dus nergens een enkel aanhalingsteken, een kleiner-dan
// of een ampersand, ook niet in commentaar. Commentaarregels gaan er bij het
// inzetten uit. Geen AI: enkel regels.
var PART = /^(van|de|der|den|vanden|vander|vande|ter|ten|le|la|du|von|op|del|da|di|dos|t)$/i;
var STOP = /^(kavel|kavels|voorzitter|bewindvoerder|eigenaar|eigenaars|verdieping|links|rechts|midden|gelijkvloers|app|appartement|bus|kinderen|dag|beste|hallo|mail|email|tel|gsm|tbc|geen|vme|vve|from|to|cc|subject|date|voor|via|laan|straat|nr|mevrouw|meneer|dhr|mevr|mr|mw)$/i;
var GEWOON = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|mac|telenet|skynet|proximus|pandora|scarlet|base|gmx|web|protonmail|proton|mail|online|orange|voo|edpnet|belgacom|ymail|aol)$/;
var EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
var CEL = "padding:3px 4px;border-bottom:1px solid #eee;";
var VELD = "width:100%;padding:3px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;";
var timer = null;

function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function schoon(s) { return String(s || "").replace(/[|;\t\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
function isNaam(w) {
  if (PART.test(w)) return true;
  if (w.length > 1) { if (/^[A-ZÀ-Þ]/.test(w)) return !STOP.test(w); }
  return false;
}
function emailOk(e) { return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(e); }

// Groepen van naamwoorden die met precies een spatie aan elkaar hangen.
function groepen(tekst) {
  var re = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ’\-]*/g, m, lijst = [], cur = null;
  while ((m = re.exec(tekst)) !== null) {
    var w = m[0].replace(/-+$/, ""), s = m.index;
    if (!isNaam(w)) { cur = null; continue; }
    if (cur) { if (tekst.slice(cur.e, s) === " ") { cur.w.push(w); cur.e = s + w.length; continue; } }
    cur = { w: [w], s: s, e: s + w.length };
    lijst.push(cur);
  }
  lijst.forEach(function (g) {
    while (g.w.length) { if (PART.test(g.w[0])) g.w.shift(); else break; }
    while (g.w.length) { if (PART.test(g.w[g.w.length - 1])) g.w.pop(); else break; }
  });
  return lijst.filter(function (g) { return g.w.length > 0; });
}

function delen(email) {
  var at = email.split("@"), loc = norm(at[0]), dom = norm((at[1] || "").split(".")[0]);
  var p = loc.split(/[^a-z]+/).filter(function (x) { return x.length > 1; });
  if (!GEWOON.test(dom)) p = p.concat(dom.split(/[^a-z]+/).filter(function (x) { return x.length > 2; }));
  var los = loc.replace(/[0-9]+/g, "").split(/[._\-]+/).filter(function (x) { return x.length > 1; });
  return { alle: p, los: los };
}

function past(w, parts) {
  var nw = norm(w);
  return parts.some(function (p) {
    if (p === nw) return true;
    if (PART.test(w)) return false;
    if (nw.length > 2) { if (p.indexOf(nw) > -1) return true; }
    if (p.length > 3) { if (nw.indexOf(p) === 0) return true; }
    return false;
  });
}

function splits(woorden) {
  return { v: woorden[0] || "", n: woorden.slice(1).join(" ") };
}

function parse(tekst) {
  tekst = String(tekst || "");
  var gevonden = [], gezien = {}, m;
  EMAIL.lastIndex = 0;
  while ((m = EMAIL.exec(tekst)) !== null) {
    var e = m[0].toLowerCase();
    if (gezien[e]) continue;
    gezien[e] = 1;
    gevonden.push({ e: e, s: m.index, eind: m.index + m[0].length });
  }
  var gemaskeerd = tekst.replace(EMAIL, function (x) { return new Array(x.length + 1).join(" "); });
  var gs = groepen(gemaskeerd);
  return gevonden.map(function (f) {
    var d = delen(f.e), best = null;
    gs.forEach(function (g) {
      var hits = [];
      g.w.forEach(function (w, k) { if (past(w, d.alle)) hits.push(k); });
      if (!hits.length) return;
      var afst = g.s > f.s ? g.s - f.eind : f.s - g.e;
      if (afst > 299) afst = 299;
      if (0 > afst) afst = 0;
      var sc = hits.length * 1000 + (g.w.length > 1 ? 300 : 0) - afst;
      if (!best || sc > best.sc) best = { g: g, hits: hits, sc: sc };
    });
    var woorden = null;
    if (best) {
      var w = best.g.w, a = best.hits[0], b = best.hits[best.hits.length - 1];
      if (w.length > 3) {
        if (a === b) {
          var eerst = d.los.length ? past(w[a], [d.los[0]]) : true;
          if (eerst) {
            while (b + 1 !== w.length) { if (PART.test(w[b + 1])) b++; else break; }
            if (b + 1 !== w.length) b++;
          } else {
            while (a > 0) { if (PART.test(w[a - 1])) a--; else break; }
            if (a > 0) a--;
          }
        }
        woorden = w.slice(a, b + 1);
      } else {
        woorden = w;
      }
    } else {
      gs.forEach(function (g) {
        if (woorden) return;
        if (g.e > f.s) return;
        var tussen = gemaskeerd.slice(g.e, f.s);
        if (tussen.length > 5) return;
        if (/^[\s:(\-–"=]*$/.test(tussen.split(String.fromCharCode(60)).join(""))) woorden = g.w.slice(-3);
      });
    }
    var r = woorden ? splits(woorden) : { v: "", n: "" };
    if (!woorden) {
      if (d.los.length > 1) { r = { v: cap(d.los[0]), n: d.los.slice(1).map(cap).join(" ") }; }
    } else if (!r.n) {
      var vn = norm(r.v);
      if (d.los.some(function (p) { return p === vn; })) {
        var rest = d.los.filter(function (p) { return p !== vn; }).filter(function (p) { return p.length > 3; });
        if (rest.length) r.n = rest.map(cap).join(" ");
      }
    }
    return { e: f.e, v: schoon(r.v), n: schoon(r.n) };
  });
}

function doos(el) { return el ? (el.closest ? el.closest("[data-mlbox]") : null) : null; }

function nieuweRij(box, e, v, n) {
  var tb = box.querySelector("[data-mlt] tbody");
  var tr = document.createElement("tr");
  tr.setAttribute("data-mlr", "1");
  [["e", e, "naam@voorbeeld.be"], ["v", v, "Voornaam"], ["n", n, "Naam"]].forEach(function (c) {
    var td = document.createElement("td");
    td.style.cssText = CEL;
    var i = document.createElement("input");
    i.type = "text";
    i.setAttribute("data-mlk", c[0]);
    i.value = c[1];
    i.placeholder = c[2];
    i.style.cssText = VELD;
    td.appendChild(i);
    tr.appendChild(td);
  });
  var td = document.createElement("td");
  td.style.cssText = CEL + "width:28px;text-align:center;";
  var knop = document.createElement("button");
  knop.type = "button";
  knop.setAttribute("data-mlweg", "1");
  knop.title = "Weghalen";
  knop.textContent = "×";
  knop.style.cssText = "border:0;background:none;cursor:pointer;color:#999;font-size:16px;";
  td.appendChild(knop);
  tr.appendChild(td);
  tb.appendChild(tr);
  return tr;
}

function bewaar(el) {
/*SCHRIJF*/
}

function sync(el) {
  var box = doos(el);
  if (!box) return;
  if (el.closest) { if (el.closest("[data-mlraw]")) { haal(el); return; } }
  var hid = box.querySelector("[data-punt]"), raw = box.querySelector("[data-mlraw]"), rijen = [];
  box.querySelectorAll("[data-mlr]").forEach(function (tr) {
    var g = function (k) { var x = tr.querySelector("[data-mlk=" + k + "]"); return x ? schoon(x.value) : ""; };
    var e = g("e").toLowerCase(), v = g("v"), n = g("n");
    var ev = tr.querySelector("[data-mlk=e]");
    if (ev) ev.style.borderColor = (e === "" || emailOk(e)) ? "#ccc" : "#e11d48";
    if (e || v || n) rijen.push([e, v, n].join("|"));
  });
  hid.value = rijen.length ? "LIJST:" + rijen.join(";") : (raw ? schoon(raw.value) : "");
  bewaar(hid);
}

function typ(el) {
  clearTimeout(timer);
  timer = setTimeout(function () { sync(el); }, 300);
}

function haal(el) {
  var box = doos(el);
  if (!box) return;
  var raw = box.querySelector("[data-mlraw]"), st = box.querySelector("[data-mlstatus]");
  var al = {};
  box.querySelectorAll("[data-mlk=e]").forEach(function (i) { al[schoon(i.value).toLowerCase()] = 1; });
  var rijen = parse(raw ? raw.value : ""), nieuw = 0;
  rijen.forEach(function (r) {
    if (al[r.e]) return;
    al[r.e] = 1;
    nieuweRij(box, r.e, r.v, r.n);
    nieuw++;
  });
  if (st) st.textContent = rijen.length ? (nieuw + " adres(sen) toegevoegd" + (nieuw === rijen.length ? "" : ", " + (rijen.length - nieuw) + " stond(en) er al") + ". Kijk de namen even na.") : "Geen mailadressen gevonden in deze tekst.";
  if (nieuw) { if (raw) raw.value = ""; }
  sync(box);
}

function geplakt(el) {
  if (el.closest("[data-mlraw]")) setTimeout(function () { haal(el); }, 0);
}

function klik(el) {
  var box = doos(el);
  if (!box) return;
  if (el.closest("[data-mlhaal]")) { haal(el); return; }
  if (el.closest("[data-mlplus]")) { var tr = nieuweRij(box, "", "", ""); tr.querySelector("input").focus(); return; }
  var weg = el.closest("[data-mlweg]");
  if (weg) { weg.closest("tr").remove(); sync(box); }
}

return { parse: parse, sync: sync, typ: typ, haal: haal, geplakt: geplakt, klik: klik };
})
