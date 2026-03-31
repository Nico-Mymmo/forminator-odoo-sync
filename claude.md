# Projectregels — forminator-odoo-sync

## Stack

- **Backend:** Cloudflare Worker (`src/`) — enkel API routes en server-logica
- **Frontend:** Statische bestanden in `public/` — HTML, CSS, JavaScript
- **Database:** Supabase (PostgreSQL)
- **UI framework:** daisyUI 4 + Tailwind (via CDN in HTML bestanden)
- **Icons:** Lucide (via CDN)

---

## REGEL 1 — UI hoort in `/public`, niet in de Worker

**Elke nieuwe module met een UI krijgt:**
- `public/{module-naam}.html` — de pagina
- `public/{module-naam}.js` — de client-side logica (optioneel, als het groot wordt)

**De Worker route voor een UI-pagina doet enkel dit:**
```js
'GET /': async (context) => {
  return context.env.ASSETS.fetch(
    new Request(new URL('/{module-naam}.html', context.request.url))
  );
}
```

**NOOIT** HTML strings genereren in de Worker. NOOIT template literals met HTML. NOOIT `return new Response('<html>...</html>')` voor een volledige pagina.

---

## REGEL 2 — HTML bestanden gebruiken geen string concatenatie voor UI

In `public/*.html` schrijf je gewone HTML en gewone JavaScript. Geen string concatenatie voor DOM-elementen. Gebruik in plaats daarvan:

```js
// ✅ DOM manipulatie
const btn = document.createElement('button');
btn.className = 'btn btn-primary';
btn.textContent = 'Klik hier';
btn.dataset.action = 'openTest';
btn.dataset.id = someId;
container.appendChild(btn);

// ✅ Of innerHTML met data-attributen (geen variabelen in event handlers)
container.innerHTML = items.map(item =>
  `<div data-action="openItem" data-id="${item.id}">${item.name}</div>`
).join('');

// ❌ NOOIT
container.innerHTML = '<button onclick="openItem(\'' + item.id + '\')">...</button>';
```

---

## REGEL 3 — Event handlers gebruiken altijd data-attributen

Nooit variabelen in inline event handlers. Altijd data-attributen + één centrale event listener:

```js
// ✅ In HTML
`<button data-action="openItem" data-id="${item.id}">Open</button>`

// ✅ Centrale listener
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, key } = el.dataset;
  if (action === 'openItem') openItem(id);
});

// ❌ NOOIT
`<button onclick="openItem('${item.id}')">Open</button>`
```

---

## REGEL 4 — API routes retourneren altijd JSON

Worker routes retourneren uitsluitend JSON. Nooit HTML. De enige uitzondering is `GET /` van een module die een HTML bestand serveert via `ASSETS.fetch()`.

```js
// ✅ Correct
return new Response(JSON.stringify({ success: true, data }), {
  headers: { 'Content-Type': 'application/json' }
});

// ❌ Nooit
return new Response('<div>...</div>', {
  headers: { 'Content-Type': 'text/html' }
});
```

---

## REGEL 5 — Auth in de frontend via sessie-cookie

HTML pagina's in `public/` authenticeren via de bestaande sessie-cookie. Bij elke `fetch()` call:

```js
const res = await fetch('/api/...', {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
});
```

Als de server 401 teruggeeft, redirect naar `/`:
```js
if (res.status === 401) { window.location.href = '/'; return; }
```

---

## Bestaande uitzonderingen

De volgende bestanden zijn legacy server-rendered UI en worden **niet** herschreven tenzij expliciet gevraagd:
- `src/modules/sales-insight-explorer/ui-claude-settings.js`
- `src/modules/sales-insight-explorer/ui-query-builder.js`
- Andere bestaande `ui.js` bestanden in modules

Bij aanpassingen aan deze legacy bestanden: gebruik altijd string concatenatie (+), nooit geneste template literals, nooit variabelen in inline event handlers.

---

## Nieuwe module checklist

Bij het aanmaken van een nieuwe module:
- [ ] `public/{module}.html` aangemaakt
- [ ] Worker route `GET /` serveert via `ASSETS.fetch()`
- [ ] Geen HTML strings in de Worker
- [ ] Client-side JS gebruikt data-attributen voor event handlers
- [ ] API routes retourneren JSON