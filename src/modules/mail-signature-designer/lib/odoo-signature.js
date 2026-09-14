/**
 * Mail Signature Designer — de handtekening OOK naar Odoo schrijven.
 *
 * WAAROM DIT BESTAAT. De chatter van Odoo plakt `res.users.signature` onderaan
 * elke mail die een medewerker naar een klant stuurt (gemeten in de headers van
 * een echt chatterbericht, 2026-09-14). Tot nu toe stond daar bij iedereen nog
 * de Odoo-standaard `--<br>Naam`, terwijl de echte huisstijl-handtekening al
 * gecompileerd werd voor Gmail. Twee plekken, twee waarheden.
 *
 * De oplossing is bewust GEEN tweede compiler: `compileSignature()` draait al in
 * `pushOneUser()`, en die ene HTML gaat naar twee bestemmingen. Zo kunnen Gmail
 * en Odoo per constructie niet uit elkaar lopen.
 *
 * WAAROM DE BASIS-HTML EN NIET EEN VARIANT. Odoo kent één handtekening per
 * gebruiker; er is geen equivalent van Gmail's sendAs-aliassen. De variant die
 * bij het primaire adres hoort is dus de enige zinnige keuze.
 *
 * WAAROM BEST-EFFORT. Een gebruiker zonder Odoo-account (of een Odoo dat even
 * niet antwoordt) mag de Gmail-push niet laten mislukken — dat is de push waar
 * de gebruiker op dat moment op staat te wachten. Deze functie GOOIT daarom
 * niet; ze geeft terug wat er gebeurd is, zodat de aanroeper het in het
 * auditlog kan zetten.
 *
 * OVER SANITISATIE. `res.users.signature` is een Html-veld en Odoo haalt daar
 * `html_sanitize()` overheen. Gemeten met een proefhandtekening (2026-09-14):
 * `<table>`, `<td>`, inline `style`, `background-color`, `border-radius`,
 * `object-fit`, `<img>` met width/height en `&nbsp;` overleven allemaal. Het
 * enige verschil is dat een zelfsluitende `<img ... />` als `<img ...>`
 * terugkomt. Er is dus GEEN `sanitize=false`-ingreep nodig zoals bij de
 * copy-wizard in `cx-automations`.
 */

import { searchRead, write } from '../../../lib/odoo.js';

/** Actieve interne gebruikers; portaalgebruikers (`share`) hebben geen chatter. */
const GEBRUIKER_DOMEIN = [['active', '=', true], ['share', '=', false]];

/**
 * De Odoo-gebruiker zoeken die bij dit mailadres hoort.
 *
 * Eerst op `login`, dan op `email`. Die twee lopen in deze database vrijwel
 * altijd gelijk (`nico@mymmo.com`), maar een login is uniek en een e-mailadres
 * niet — vandaar de volgorde.
 *
 * @returns {Promise<{id: number, login: string}|null>}
 */
export async function vindOdooGebruiker(env, email) {
  const adres = String(email || '').trim().toLowerCase();
  if (!adres) return null;

  for (const veld of ['login', 'email']) {
    const rijen = await searchRead(env, {
      model: 'res.users',
      domain: [...GEBRUIKER_DOMEIN, [veld, '=ilike', adres]],
      fields: ['id', 'login'],
      limit: 2
    });
    // Twee treffers op `email` betekent dat we niet kunnen weten wie bedoeld is.
    // Dan liever niets schrijven dan de verkeerde handtekening overschrijven.
    if (rijen.length === 1) return rijen[0];
    if (rijen.length > 1) return null;
  }
  return null;
}

/**
 * De gecompileerde handtekening naar `res.users.signature` schrijven.
 *
 * Gooit nooit. Bij een fout komt de reden in het resultaat terecht.
 *
 * @param {Object} env
 * @param {string} userEmail - het adres waarop de push draait
 * @param {string} html      - de basis-HTML uit compileSignature()
 * @returns {Promise<{synced: boolean, odooUserId?: number, reason?: string}>}
 */
export async function pushSignatureToOdoo(env, userEmail, html) {
  if (!html || !String(html).trim()) {
    return { synced: false, reason: 'lege handtekening' };
  }

  try {
    const gebruiker = await vindOdooGebruiker(env, userEmail);
    if (!gebruiker) {
      return { synced: false, reason: 'geen unieke Odoo-gebruiker voor dit adres' };
    }

    await write(env, {
      model: 'res.users',
      ids: [gebruiker.id],
      values: { signature: html }
    });

    return { synced: true, odooUserId: gebruiker.id };
  } catch (err) {
    // Bewust alleen loggen: de Gmail-push is al geslaagd en mag niet omvallen
    // omdat Odoo even niet bereikbaar is.
    console.warn('[mail-signature] Odoo-handtekening niet bijgewerkt voor', userEmail, '-', err.message);
    return { synced: false, reason: err.message };
  }
}
