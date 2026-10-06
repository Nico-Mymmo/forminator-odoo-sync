/**
 * Belgische wettelijke feestdagen. Puur: geen env, geen fetch.
 *
 * Ze staan niet in Odoo (resource.calendar.leaves is leeg), dus ze worden hier
 * uitgerekend. De namen volgen hoe ze op het prikbord stonden ("Pinksteren" op
 * de maandag, want dat is de vrije dag). Een brugdag of sluitingsdag van het
 * bedrijf is geen wettelijke feestdag: die zet je als eigen kaart op het prikbord.
 */

/** Paaszondag volgens het Gregoriaanse "anonieme" algoritme. */
export function paaszondag(jaar) {
  const a = jaar % 19;
  const b = Math.floor(jaar / 100);
  const c = jaar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jaar, maand - 1, dag));
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function plus(d, dagen) {
  return new Date(d.getTime() + dagen * 86400000);
}

/** @returns {Array<{date: string, name: string}>} */
export function feestdagenVan(jaar) {
  const pasen = paaszondag(jaar);
  return [
    { date: `${jaar}-01-01`, name: 'Nieuwjaar' },
    { date: iso(plus(pasen, 1)), name: 'Pasen' },
    { date: `${jaar}-05-01`, name: 'Dag van de arbeid' },
    { date: iso(plus(pasen, 39)), name: 'Hemelvaart' },
    { date: iso(plus(pasen, 50)), name: 'Pinksteren' },
    { date: `${jaar}-07-21`, name: 'Nationale feestdag' },
    { date: `${jaar}-08-15`, name: 'O.L.V.-Hemelvaart' },
    { date: `${jaar}-11-01`, name: 'Allerheiligen' },
    { date: `${jaar}-11-11`, name: 'Wapenstilstand' },
    { date: `${jaar}-12-25`, name: 'Kerstmis' },
  ];
}

/** Feestdagen tussen twee datums (JJJJ-MM-DD, beide inbegrepen). */
export function feestdagenTussen(van, tot) {
  const j1 = Number(String(van).slice(0, 4));
  const j2 = Number(String(tot).slice(0, 4));
  const uit = [];
  for (let j = j1; j <= j2; j++) {
    for (const f of feestdagenVan(j)) {
      if (f.date >= van && f.date <= tot) uit.push(f);
    }
  }
  return uit;
}
