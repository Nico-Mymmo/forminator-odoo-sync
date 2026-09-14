/**
 * Gmail → Chatter — clientlogica.
 *
 * De werklijst toont CONTACTEN, geen losse mails. Per mail beslissen betekent
 * dat je bij elke nieuwe mail van dezelfde persoon opnieuw hetzelfde doet; per
 * contact beslis je één keer, en dat geldt dan ook voor zijn toekomstige mail.
 *
 * Eén centrale click-listener op data-attributen (geen inline handlers), zoals
 * de UI-regels van deze repo voorschrijven.
 */

const S = {
  tab: 'werklijst',
  overzicht: null,
  rijen: [],
  actiefContact: null,
  zoekTimer: null
};

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function api(pad, opties = {}) {
  const res = await fetch(`/gmail-chatter${pad}`, { credentials: 'include', ...opties });
  if (res.status === 401) { window.location.href = '/'; throw new Error('niet ingelogd'); }
  const data = await res.json().catch(() => ({ success: false, error: 'Ongeldig antwoord' }));
  if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data.data;
}

function toast(tekst, soort = 'info') {
  const kleur = soort === 'error' ? 'alert-error' : soort === 'success' ? 'alert-success' : 'alert-info';
  const node = document.createElement('div');
  node.className = `alert ${kleur} shadow-lg`;
  node.innerHTML = `<span>${esc(tekst)}</span>`;
  el('toasts').appendChild(node);
  setTimeout(() => node.remove(), 5000);
}

function datum(s) {
  if (!s) return '';
  return new Date(s).toLocaleString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Statusbalk ──────────────────────────────────────────────────────────────

function tekenStatus() {
  const o = S.overzicht;
  if (!o) return;
  const t = o.tellingen || {};

  const syncTekst = !o.actief
    ? `<span class="badge badge-warning badge-sm">staat uit</span>
       <span class="opacity-70">Je mailbox wordt nog niet gelezen.</span>`
    : o.sync
      ? `<span class="badge badge-success badge-sm">actief</span>
         <span class="opacity-70">Laatst gecontroleerd ${esc(datum(o.sync.laatst))} · ${o.sync.bekeken} berichten bekeken</span>`
      : `<span class="badge badge-info badge-sm">actief</span>
         <span class="opacity-70">Nog niet gedraaid — de eerste ronde volgt binnen 5 minuten.</span>`;

  const fout = o.sync?.fout
    ? `<div class="alert alert-error mt-3 text-sm"><span>Laatste fout: ${esc(o.sync.fout)}</span></div>`
    : '';

  el('statusCard').innerHTML = `
    <div class="card-body p-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <i data-lucide="mail" class="w-4 h-4 opacity-60"></i>
        <span class="font-medium">${esc(o.email)}</span>
        ${syncTekst}
      </div>
      <div class="flex flex-wrap gap-4 mt-3 text-sm">
        <span><span class="font-semibold">${t.unmatched || 0}</span> <span class="opacity-70">wachten op jou</span></span>
        <span><span class="font-semibold">${t.posted || 0}</span> <span class="opacity-70">geplaatst</span></span>
        <span><span class="font-semibold">${t.skipped || 0}</span> <span class="opacity-70">genegeerd</span></span>
      </div>
      ${fout}
    </div>`;
  lucide.createIcons();
}

// ─── Weergaves ───────────────────────────────────────────────────────────────

function leegKaart(titel, uitleg) {
  return `<div class="card bg-base-100 shadow-sm"><div class="card-body items-center text-center py-10">
    <i data-lucide="check-circle-2" class="w-8 h-8 text-success"></i>
    <p class="font-medium mt-2">${esc(titel)}</p>
    <p class="text-sm opacity-70">${esc(uitleg)}</p>
  </div></div>`;
}

function tekenContacten() {
  if (!S.rijen.length) {
    return leegKaart('Niets te doen', 'Alle opgevangen mail is bij een lead terechtgekomen.');
  }
  return S.rijen.map(c => `
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-4 flex-row items-center gap-3">
        <i data-lucide="user" class="w-5 h-5 opacity-50 shrink-0"></i>
        <div class="grow min-w-0">
          <div class="font-medium truncate">${esc(c.counterpart_email)}</div>
          <div class="text-sm opacity-70 truncate">
            ${c.aantal} ${c.aantal === 1 ? 'mail' : 'mails'} · laatst ${esc(datum(c.laatste))}
            ${c.laatste_onderwerp ? ' · ' + esc(c.laatste_onderwerp) : ''}
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn btn-sm btn-primary" data-action="kies-lead" data-email="${esc(c.counterpart_email)}">
            <i data-lucide="link" class="w-4 h-4"></i> Aan lead hangen
          </button>
          <button class="btn btn-sm btn-ghost" data-action="negeer" data-email="${esc(c.counterpart_email)}">Nooit</button>
        </div>
      </div>
    </div>`).join('');
}

function tekenBerichten() {
  if (!S.rijen.length) return `<div class="text-sm opacity-60 py-6 text-center">Niets te tonen.</div>`;
  return S.rijen.map(b => {
    const pijl = b.direction === 'incoming'
      ? '<i data-lucide="arrow-down-left" class="w-4 h-4 text-info"></i>'
      : '<i data-lucide="arrow-up-right" class="w-4 h-4 text-success"></i>';
    const duiding = b.status === 'posted'
      ? `<span class="badge badge-success badge-sm">lead ${b.odoo_res_id}</span>
         <span class="opacity-60">via ${esc(b.match_method || '-')}</span>`
      : `<span class="badge badge-ghost badge-sm">${esc(b.skip_reason || 'genegeerd')}</span>`;
    return `
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body p-4 flex-row items-start gap-3">
          <div class="mt-1">${pijl}</div>
          <div class="grow min-w-0">
            <div class="font-medium truncate">${esc(b.subject || '(geen onderwerp)')}</div>
            <div class="text-sm opacity-70 truncate">
              ${b.direction === 'incoming' ? 'van' : 'aan'} ${esc(b.counterpart_email || '-')} · ${esc(datum(b.internal_date))}
            </div>
            <div class="text-xs mt-1 flex flex-wrap items-center gap-2">${duiding}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function tekenKoppelingen() {
  if (!S.rijen.length) {
    return leegKaart('Nog geen uitzonderingen', 'Alles loopt via de automatische koppeling op e-mailadres.');
  }
  return S.rijen.map(k => `
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-4 flex-row items-center gap-3">
        <div class="grow min-w-0">
          <div class="font-medium truncate">${esc(k.counterpart_email)}</div>
          <div class="text-sm opacity-70">
            ${k.action === 'ignore'
              ? '<span class="badge badge-ghost badge-sm">wordt genegeerd</span>'
              : `<span class="badge badge-success badge-sm">lead ${k.odoo_res_id}</span>`}
            <span class="opacity-60 ml-2">door ${esc(k.created_by || '?')} · ${esc(k.source || 'om')}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" data-action="verwijder-koppeling" data-email="${esc(k.counterpart_email)}">
          Ongedaan maken
        </button>
      </div>
    </div>`).join('');
}

async function laadLijst() {
  el('lijst').innerHTML = '<div class="animate-pulse opacity-60 text-sm">Laden…</div>';
  try {
    if (S.tab === 'werklijst') {
      S.rijen = await api('/api/contacts');
      el('lijst').innerHTML = tekenContacten();
    } else if (S.tab === 'koppelingen') {
      S.rijen = await api('/api/links');
      el('lijst').innerHTML = tekenKoppelingen();
    } else {
      S.rijen = await api(`/api/messages?status=${encodeURIComponent(S.tab)}`);
      el('lijst').innerHTML = tekenBerichten();
    }
    lucide.createIcons();
  } catch (e) {
    el('lijst').innerHTML = `<div class="alert alert-error text-sm"><span>${esc(e.message)}</span></div>`;
  }
}

async function laadAlles() {
  try {
    S.overzicht = await api('/api/overview');
    tekenStatus();
  } catch (e) {
    el('statusCard').innerHTML = `<div class="card-body p-4"><div class="alert alert-error text-sm"><span>${esc(e.message)}</span></div></div>`;
  }
  await laadLijst();
}

// ─── Leadkiezer ──────────────────────────────────────────────────────────────

function openLeadDialog(contactEmail) {
  S.actiefContact = contactEmail;
  el('leadDialogOnderwerp').textContent =
    `Alle mail van en naar ${contactEmail} komt voortaan bij de gekozen lead.`;
  el('leadZoek').value = '';
  el('leadResultaten').innerHTML =
    '<p class="text-sm opacity-60 py-4 text-center">Typ minstens twee tekens om te zoeken.</p>';
  el('leadDialog').showModal();
  setTimeout(() => el('leadZoek').focus(), 50);
}

async function zoekLeads(term) {
  const doel = el('leadResultaten');
  if (term.trim().length < 2) {
    doel.innerHTML = '<p class="text-sm opacity-60 py-4 text-center">Typ minstens twee tekens om te zoeken.</p>';
    return;
  }
  doel.innerHTML = '<div class="animate-pulse opacity-60 text-sm py-4">Zoeken…</div>';
  try {
    const leads = await api(`/api/leads?q=${encodeURIComponent(term)}`);
    if (!leads.length) {
      doel.innerHTML = '<p class="text-sm opacity-60 py-4 text-center">Geen lead gevonden.</p>';
      return;
    }
    doel.innerHTML = leads.map(l => `
      <button class="btn btn-ghost btn-block justify-start h-auto py-2 normal-case text-left"
              data-action="wijs-toe" data-lead="${l.id}">
        <span class="grow min-w-0">
          <span class="block font-medium truncate">${esc(l.name || '(naamloos)')}</span>
          <span class="block text-xs opacity-70 truncate">
            ${esc(l.contact_name || '')}${l.contact_name && l.email_from ? ' · ' : ''}${esc(l.email_from || '')}
          </span>
        </span>
        <span class="badge badge-ghost badge-sm shrink-0">#${l.id}</span>
      </button>`).join('');
  } catch (e) {
    doel.innerHTML = `<div class="alert alert-error text-sm"><span>${esc(e.message)}</span></div>`;
  }
}

async function koppelContact(leadId) {
  if (!S.actiefContact) return;
  try {
    const r = await api(`/api/contacts/${encodeURIComponent(S.actiefContact)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: Number(leadId) })
    });
    el('leadDialog').close();
    const extra = r.vanCollega ? ` (${r.vanCollega} bij een collega blijven staan)` : '';
    toast(`Gekoppeld aan "${r.lead}" — ${r.geplaatst} ${r.geplaatst === 1 ? 'mail' : 'mails'} geplaatst${extra}`, 'success');
    await laadAlles();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function negeerContact(email) {
  try {
    await api(`/api/contacts/${encodeURIComponent(email)}/ignore`, { method: 'POST' });
    toast(`${email} wordt voortaan genegeerd`, 'success');
    await laadAlles();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function verwijderKoppeling(email) {
  try {
    await api(`/api/links/${encodeURIComponent(email)}`, { method: 'DELETE' });
    toast('Koppeling ongedaan gemaakt', 'success');
    await laadLijst();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Eén centrale listener ───────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    S.tab = tab.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('tab-active', t === tab));
    laadLijst();
    return;
  }

  const knop = e.target.closest('[data-action]');
  if (!knop) return;
  const { action, email, lead } = knop.dataset;

  if (action === 'refresh') laadAlles();
  else if (action === 'kies-lead') openLeadDialog(email);
  else if (action === 'negeer') negeerContact(email);
  else if (action === 'wijs-toe') koppelContact(lead);
  else if (action === 'verwijder-koppeling') verwijderKoppeling(email);
  else if (action === 'sluit-lead-dialog') el('leadDialog').close();
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'leadZoek') return;
  clearTimeout(S.zoekTimer);
  const term = e.target.value;
  S.zoekTimer = setTimeout(() => zoekLeads(term), 250);
});

// ─── Start ───────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
  } catch {
    window.location.href = '/';
    return;
  }
  lucide.createIcons();
  await laadAlles();
})();
