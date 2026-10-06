/**
 * AV-slides -- opslag per maand (tabel av_slide_editions) en de vorm van de
 * inhoud. Alles wat van de browser komt, gaat door `normaliseerInhoud()`: die
 * tekst belandt in een gedeelde presentatie en de lettertypenamen in een
 * Google-verzoek en een Google Fonts-link.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { BLOK_STIJLEN, DEFAULT_STYLE } from './layout.js';

const TABEL = 'av_slide_editions';
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const BEELD_SLEUTEL = /^av-slides\/[0-9a-f-]{36}\.(png|jpe?g|gif)$/;
const LETTERTYPE = /^[A-Za-z0-9 ]{2,40}$/;
const SOORTEN = ['event', 'birthday', 'holiday', 'custom'];

export class EditionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function geldigeMaand(m) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
}

export function geldigeDatum(d) {
  return DATUM.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
}

export function beeldSleutelGeldig(key) {
  return BEELD_SLEUTEL.test(String(key || ''));
}

const tekst = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, max);
const bool = (v, standaard = true) => (v === undefined || v === null ? standaard : v === true);

function blok(b) {
  if (!b || typeof b !== 'object') return null;
  const type = b.type === 'review' ? 'review' : 'text';
  const uit = {
    key: /^[a-z0-9_-]{1,30}$/.test(String(b.key || '')) ? b.key : 'blok',
    type,
    style: BLOK_STIJLEN[b.style] ? b.style : (type === 'review' ? 'white' : 'mint'),
    include: bool(b.include),
    edited: b.edited === true,
    text: tekst(b.text, 1500),
  };
  if (type === 'review') {
    uit.name = tekst(b.name, 80);
    uit.source = tekst(b.source, 40);
    uit.stars = Math.max(1, Math.min(5, Math.round(Number(b.stars) || 5)));
    uit.when = tekst(b.when, 40);
  } else {
    uit.title = tekst(b.title, 80);
  }
  return uit;
}

function kaart(k) {
  if (!k || typeof k !== 'object' || !geldigeDatum(k.date)) return null;
  return {
    key: tekst(k.key, 60) || `custom:${crypto.randomUUID()}`,
    kind: SOORTEN.includes(k.kind) ? k.kind : 'custom',
    date: k.date,
    emoji: tekst(k.emoji, 16),
    tint: HEX.test(String(k.tint || '')) ? k.tint : '#e0f2fe',
    title: tekst(k.title, 120),
    text: tekst(k.text, 200),
    span: k.span === 2 ? 2 : 1,
    include: bool(k.include),
    edited: k.edited === true,
    meta: k.meta && typeof k.meta === 'object'
      ? { type: tekst(k.meta.type, 40), brand: tekst(k.meta.brand, 20) }
      : undefined,
  };
}

function inzicht(i) {
  if (!i || typeof i !== 'object' || !i.text) return null;
  return {
    id: tekst(i.id, 30),
    group: i.group === 'website' ? 'website' : 'cijfer',
    label: tekst(i.label, 60),
    text: tekst(i.text, 400),
    note: tekst(i.note, 300),
  };
}

export function normaliseerInhoud(c) {
  const inhoud = c && typeof c === 'object' ? c : {};
  const st = inhoud.style || {};
  const wist = inhoud.wist || {};
  const p = inhoud.prikbord || {};
  const beeld = wist.image && beeldSleutelGeldig(wist.image.key)
    ? {
      key: wist.image.key,
      width: Math.max(0, Math.round(Number(wist.image.width) || 0)),
      height: Math.max(0, Math.round(Number(wist.image.height) || 0)),
    }
    : null;
  return {
    version: 1,
    style: {
      titleFont: LETTERTYPE.test(String(st.titleFont || '')) ? st.titleFont : DEFAULT_STYLE.titleFont,
      bodyFont: LETTERTYPE.test(String(st.bodyFont || '')) ? st.bodyFont : DEFAULT_STYLE.bodyFont,
    },
    birthdaysText: tekst(inhoud.birthdaysText, 1500),
    insights: (Array.isArray(inhoud.insights) ? inhoud.insights : []).map(inzicht).filter(Boolean).slice(0, 30),
    wist: {
      title: tekst(wist.title, 80),
      image: beeld,
      blocks: (Array.isArray(wist.blocks) ? wist.blocks : []).map(blok).filter(Boolean).slice(0, 6),
    },
    prikbord: {
      title: tekst(p.title, 60),
      from: geldigeDatum(p.from) ? p.from : null,
      until: geldigeDatum(p.until) ? p.until : null,
      cards: (Array.isArray(p.cards) ? p.cards : []).map(kaart).filter(Boolean).slice(0, 80),
    },
  };
}

// ── Database ────────────────────────────────────────────────────────────────

const LIJST_VELDEN = 'id, month, av_date, presentation_url, inserted_at, updated_at';

export async function lijstEdities(env) {
  const { data, error } = await getSupabaseClient(env)
    .from(TABEL).select(LIJST_VELDEN).order('month', { ascending: false }).limit(36);
  if (error) throw new EditionError(`Kon de lijst niet lezen: ${error.message}`, 500);
  return data || [];
}

export async function haalEditie(env, maand) {
  const { data, error } = await getSupabaseClient(env)
    .from(TABEL).select('*').eq('month', maand).maybeSingle();
  if (error) throw new EditionError(`Kon de maand niet lezen: ${error.message}`, 500);
  return data || null;
}

export async function bewaarEditie(env, user, maand, { av_date, content }) {
  if (!geldigeMaand(maand)) throw new EditionError('Ongeldige maand.');
  if (!geldigeDatum(av_date)) throw new EditionError('Ongeldige AV-datum.');
  const nu = new Date().toISOString();
  const { data, error } = await getSupabaseClient(env)
    .from(TABEL)
    .upsert({
      month: maand,
      av_date,
      content: normaliseerInhoud(content),
      updated_by: user?.id || null,
      updated_at: nu,
    }, { onConflict: 'month' })
    .select('*')
    .single();
  if (error) throw new EditionError(`Bewaren mislukt: ${error.message}`, 500);
  return data;
}

export async function markeerIngevoegd(env, user, maand, url) {
  const { error } = await getSupabaseClient(env)
    .from(TABEL)
    .update({ presentation_url: url, inserted_at: new Date().toISOString(), inserted_by: user?.id || null })
    .eq('month', maand);
  if (error) console.error('[av-slides] invoegen niet bewaard:', error.message);
}
