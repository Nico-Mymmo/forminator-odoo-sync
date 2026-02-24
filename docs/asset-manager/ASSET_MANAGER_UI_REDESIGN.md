# Asset Manager — UI/UX Redesign (v3.0)

> **Datum:** 2026-02-24  
> **Branch:** `assets-manager`  
> **Vorige iteratie:** 3-pane drawer layout (v2.0)  
> **Referentie-module:** Mail Signature Designer (Signature Designer)

---

## 1. Ontwerpverantwoording

### Probleem met de vorige UI (v2.0)

De v2.0 implementatie gebruikte een full-height drawer-layout (`height:calc(100vh - 48px)`) met een 3-pane structuur: folder tree | bestandenlijst | preview pane. Dit leidde tot:

- **"Mini-app in app" gevoel** — visueel sterk afwijkend van alle andere modules
- **Harde hoogte-overrides** — braken de bestaande layout op bepaalde viewports
- **Complexiteit** — dynamisch gebouwde folder tree, selectiestate, side pane, sorteer-knoppen los verspreid
- **Inconsistentie** — andere modules gebruiken `container mx-auto` met `padding-top: 48px`

### Oplossing (v3.0)

Volledig herschreven UI gebaseerd op:
1. **Container-layout** — identiek aan Signature Designer (`container mx-auto px-4 md:px-6 py-6 max-w-7xl`)
2. **Statische categorieën** — geen dynamische folder tree; vaste, uitbreidbare lijst
3. **Grid/list toggle** — twee view modes, eenvoudig te wisselen
4. **Kebab dropdown** per asset — vervangt alle losse tekst-actionknopen
5. **Preview als modal** — groot, visueel, imagefocus
6. **Sort als `<select>`** — niet als losse knoppen

---

## 2. Gewijzigde bestanden

| Bestand | Type wijziging | Beschrijving |
|---|---|---|
| `src/modules/asset-manager/ui.js` | Volledig herschreven | Nieuwe container-layout, categorieën, grid + list containers, alle modals opnieuw |
| `public/asset-manager-client.js` | Volledig herschreven | Nieuwe state, categorieën, renderGrid, renderListRow, kebab menu, preview modal |

### Backend — ongewijzigd

Geen wijzigingen aan:
- `src/modules/asset-manager/routes.js`
- `src/modules/asset-manager/module.js`
- `src/modules/asset-manager/lib/*` (r2-client, mime-types, path-utils)
- R2 storage logica
- API routes (`/assets/api/assets/*`)

---

## 3. Categorieën — technisch ontwerp

### Prefix-mapping

Categorieën zijn prefix-based. Iedere categorie filtert de R2-lijst op een bepaalde sleutelprefix:

| Label | Prefix (`data-prefix`) | Gebruik |
|---|---|---|
| Alles | `''` (leeg) | Toont alle assets in de bucket |
| Banners | `banners/` | Promotiebanners, headers |
| Events | `events/` | Eventspecifieke afbeeldingen |
| Logos | `logos/` | Logo-varianten |
| Overige | `uploads/` | Algemene uploads, legacy bestanden |

**Hoe het werkt:**

```
GET /assets/api/assets/list?prefix=banners/
→ R2.list({ prefix: 'banners/' })
→ Alle keys die beginnen met 'banners/'
```

### Uitbreidbaarheid

Nieuwe categorieën toevoegen vereist wijziging op **2 plaatsen**:

1. **`ui.js`** — voeg `<li>` toe in `#category-menu` (sidebar) én een `<button class="cat-tab">` in `#mobile-category-tabs`:
   ```html
   <li>
     <a data-prefix="eventbanners/" class="gap-2" id="cat-eventbanners">
       <i data-lucide="flag" class="w-4 h-4"></i> Eventbanners
     </a>
   </li>
   ```

2. **`ui.js`** — voeg `<option>` toe in de upload- en move-categorie `<select>`:
   ```html
   <option value="eventbanners/">Eventbanners</option>
   ```

De client.js heeft **geen aanpassingen nodig** — die werkt puur event-driven op `data-prefix` en de select-values.

---

## 4. UI-componentstructuur

### Layout (ui.js)

```
body.bg-base-200
  navbar (geïmporteerd)
  div[style="padding-top:48px"]
    div.container.mx-auto.px-4.md:px-6.py-6.max-w-7xl
      
      ── Paginakop (h1 + upload btn)
      ── Alert (#asset-alert)
      
      ── Hoofd layout: flex gap-6
         │
         ├── aside.w-44 (desktop sidebar, hidden on mobile)
         │     ul#category-menu.menu
         │       li > a[data-prefix=""] — Alles
         │       li > a[data-prefix="banners/"] — Banners
         │       li > a[data-prefix="events/"] — Events
         │       li > a[data-prefix="logos/"] — Logos
         │       li > a[data-prefix="uploads/"] — Overige
         │
         └── section.flex-1
               ── Mobile tabs (div#mobile-category-tabs, sm:hidden)
               ── Toolbar: search + sort-select + view-toggle + count
               ── States: #asset-list-loading, #asset-list-empty
               ── #asset-grid-view (grid, default zichtbaar)
               ── #asset-list-view (table, standaard verborgen)
               ── #asset-pagination
      
      ── Modals (buiten main layout, in body):
         asset-upload-modal
         asset-delete-modal
         asset-rename-modal
         asset-move-modal
         preview-modal
```

### Modalen — ID-mapping

| Modal ID | Doel | Triggerknop |
|---|---|---|
| `asset-upload-modal` | Bestand uploaden | `#asset-upload-btn` |
| `asset-delete-modal` | Verwijderbevest. | Kebab > Verwijderen |
| `asset-rename-modal` | Hernoemen | Kebab > Hernoemen (admin) |
| `asset-move-modal` | Verplaatsen | Kebab > Verplaatsen (admin) |
| `preview-modal` | Big preview | Card click / Kebab > Preview |

---

## 5. Client JS — functieoverzicht (v3.0)

### State variabelen

| Variabele | Type | Beschrijving |
|---|---|---|
| `viewMode` | `'grid'` \| `'list'` | Actieve view mode |
| `activeCategory` | `string` | Actief prefix (bv. `'banners/'`) |
| `allObjects` | `Array` | Gecachte objecten voor client-side sort/filter |
| `sortField` | `'name'` \| `'size'` \| `'date'` | Actief sorteerveld |
| `sortAsc` | `boolean` | Sorteerrichting |
| `pendingDeleteKey` | `string\|null` | Key wachten op delete-bevestiging |
| `pendingRenameKey` | `string\|null` | Key wachten op rename |
| `pendingMoveKey` | `string\|null` | Key wachten op move |

### Render pipeline

```
loadList(prefix, cursor)
  → fetch /assets/api/assets/list?prefix=...
  → allObjects = data.objects
  → parseSortSelect()
  → renderView(sortObjects(allObjects))
       ├── (viewMode=grid) → renderGrid(objects) → renderGridCard(obj) × n
       └── (viewMode=list) → renderTableList(objects) → renderListRow(obj) × n
```

### Kebab menu

`renderKebabMenu(obj)` → geeft `<details class="dropdown dropdown-end">` terug.

Items (afhankelijk van rol):
- **Altijd:** Preview, URL kopiëren
- **Admin:** Hernoemen, Verplaatsen
- **Admin of eigen key:** (hr) Verwijderen

### Preview modal

`openPreviewModal(obj)` → vult `#preview-modal-content` via `renderPreviewContent(obj, container)`.

Inhoud:
1. Afbeelding (aspect-fill, max 360px hoog) of bestandsicoon
2. Bestandsnaam + metadata (type · grootte · datum)
3. Publieke URL met kopieerknop (btn-primary)
4. Actieknoppen (Hernoem, Verplaats, Verwijder) — alleen voor admin/eigen key

---

## 6. Responsiviteit

| Schermgrootte | Gedrag |
|---|---|
| `< sm` | Sidebar verborgen; mobile category tabs bovenaan; type/grootte/datum kolommen verborgen |
| `sm` | Mobile tabs zichtbaar; type-kolom zichtbaar in list view |
| `md` | Grootte-kolom zichtbaar |
| `lg` | Datum-kolom zichtbaar |
| `≥ sm` | Desktop sidebar zichtbaar |

---

## 7. Uitbreidingspunten voor toekomstige modules

### Toevoegen van module-specifieke categorieën

Andere modules (bv. Event Operations) kunnen eigen categorieën toevoegen door:
- Een aparte categorie in de list, bijv. `eventbanners/` → prefix `event-operations/banners/`
- De routes.js van asset-manager heeft geen kennis van categorieën — alles is prefix-based

### Server-side categorie configuratie (toekomst)

Als categorieën per-rol of dynamisch moeten worden, kunnen ze via `window.__ASSET_STATE__` meegegeven worden vanuit `ui.js`. De client-JS is al gebouwd om categorie-links te lezen via `data-prefix` attributen op DOM-elementen — de rendering hoeft niet te veranderen.

### Multi-select + bulk acties (toekomst)

De state kan uitgebreid worden met een `selectedKeys: Set` variabele. In grid-cards kan een checkbox hidden verschijnen bij hover. De bestaande API-routes ondersteunen al per-key operaties; bulk zou batch-fetching vereisen.

---

## 8. Designprincipes (vastgelegd)

1. **Geen full-height overrides** — gebruik altijd `padding-top: 48px` als spacing t.o.v. navbar
2. **Container-gebaseerd** — `max-w-7xl` met responsive padding
3. **Geen template literals voor HTML in JS** — alleen `createElement` + `textContent`/`classList`
4. **Lucide SVG inline toegestaan** — voor iconen in dynamisch aangemaakte DOM-nodes
5. **DaisyUI-native components** — `dropdown`, `menu`, `card`, `badge`, `modal`, `table-zebra`
6. **Geen enterprise-app feel** — eenvoudige asset library, geen folder-hiërarchie

---

*Documentatie gegenereerd op basis van de actuele codebase, commit op branch `assets-manager`.*
