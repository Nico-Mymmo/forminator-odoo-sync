/**
 * Odoo-controle -- het skill-concept: een SKILL.md uit de patronen en de
 * afgehandelde cases, met Odoo-links in debugmodus. Een team zet die in
 * Claude Code of Cowork.
 */

import { ODOO_URL, SOORT, STATUS, statusVan, isAfgehandeld, odooUrl } from './constants.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Documentnummers in een tekst (S00514, CFVK/2025/00201, ...) herkennen op basis
 * van alle refs van alle cases. Enkel labels met een cijfer en minstens vijf
 * tekens, dus geen klantnamen.
 */
export function refIndex(cases) {
  const idx = new Map();
  for (const c of cases) {
    for (const r of c.refs || []) {
      if (r && r.label && r.id && /\d/.test(r.label) && r.label.length >= 5 && !idx.has(r.label)) idx.set(r.label, r);
    }
  }
  const keys = [...idx.keys()].sort((a, b) => b.length - a.length).map(esc);
  const re = keys.length ? new RegExp(`(^|[^\\w/])(${keys.join('|')})(?![\\w/])`, 'g') : null;
  return { idx, re };
}

export function mdLinks(str, { idx, re }) {
  if (!re || !str) return str || '';
  return str.replace(re, (all, pre, label) => `${pre}[${label}](${odooUrl(idx.get(label))})`);
}

function dagLabel(s) {
  const [j, m, d] = String(s).split('-').map(Number);
  if (!j || !m || !d) return s;
  return new Date(Date.UTC(j, m - 1, d)).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function skillMarkdown({ cases, patterns, meta = {} }) {
  const links = refIndex(cases);
  const done = cases.filter(isAfgehandeld);
  const L = [];
  const stand = meta['info.stand'] || meta.stand;
  L.push('---', 'name: offerte-en-factuurbeheer',
    'description: Gebruik bij elke offerte, verlenging, upsell, add-on, korting, creditnota of factuur van een abonnement in Odoo (mymmo), en bij het aanmaken of afsluiten van een bedrijf, contact of verkoopkans. Regels en controles die voorkomen dat een klant te veel, te weinig of niet gefactureerd wordt, en dat bedrijven en leads de cijfers vertekenen.',
    '---', '', '# Offerte-, factuur- en CRM-beheer', '',
    `Opgemaakt uit de factuur-, abonnement- en CRM-controle van ${stand ? dagLabel(stand) : 'oktober 2026'}: ${cases.length} cases, waarvan ${done.length} afgehandeld.`,
    `Odoo: ${ODOO_URL} (links openen in debugmodus)`, '');

  const perSoort = SOORT.map((x) => [x[1], cases.filter((c) => (c.soort || 'onbekend') === x[0] && !c.geen_fout).length])
    .filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  if (perSoort.length) {
    L.push('## Waar het misgaat', '');
    perSoort.forEach((x) => L.push(`- ${x[0]}: ${x[1]} cases`));
    L.push('');
  }

  L.push('## Regels', '');
  let i = 0;
  const gesorteerd = [...patterns].sort((a, b) => (a.nr || 99) - (b.nr || 99) || String(a.titel).localeCompare(String(b.titel)));
  for (const p of gesorteerd) {
    const cs = cases.filter((c) => (c.patterns || []).includes(p.id));
    if (!cs.length && !p.regel) continue;
    i += 1;
    L.push(`### ${i}. ${p.titel}`, '');
    if (p.regel) L.push(`**Regel:** ${p.regel}`, '');
    if (p.uitleg) L.push(`**Waarom:** ${p.uitleg}`, '');
    if (p.controle) L.push(`**Controle:** ${p.controle}`, '');
    const ex = cs.filter((c) => (c.wat_gebeurde || c.les) && statusVan(c) !== 'open');
    if (ex.length) {
      L.push('**Gezien bij:**');
      for (const c of ex) {
        const orders = (c.refs || []).filter((r) => r.model === 'sale.order').slice(0, 3).map((r) => `[${r.label}](${odooUrl(r)})`).join(', ');
        L.push(`- ${c.klant}${orders ? ` (${orders})` : ''}: ${mdLinks([c.wat_gebeurde, c.les ? `Les: ${c.les}` : ''].filter(Boolean).join(' '), links)}`);
      }
      L.push('');
    }
  }

  const other = cases.filter((c) => !(c.patterns || []).length && (c.les || c.wat_gebeurde));
  if (other.length) {
    L.push('## Andere lessen', '');
    for (const c of other) L.push(`- ${c.klant}: ${mdLinks([c.wat_gebeurde, c.les ? `Les: ${c.les}` : ''].filter(Boolean).join(' '), links)}`);
    L.push('');
  }

  const checks = gesorteerd.filter((p) => p.controle);
  if (checks.length) {
    L.push('## Controle vóór je een order bevestigt of een creditnota maakt', '');
    checks.forEach((p) => L.push(`- [ ] ${p.controle}`));
    L.push('');
  }
  return L.join('\n');
}

export { STATUS };
