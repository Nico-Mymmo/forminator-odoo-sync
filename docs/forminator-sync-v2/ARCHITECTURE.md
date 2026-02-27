# Forminator Sync V2 — Architecture

> **Branch**: `feature/fsv2-public-assets`  
> **Status**: Implemented — pending review & merge  
> **Related plan**: [`docs/forminator-sync-v2/ADDENDUM_A_IMPLEMENTATION_LOG.md`](../forminator-sync-v2/ADDENDUM_A_IMPLEMENTATION_LOG.md)

---

## 1. Asset Delivery Model

### Before (broken)

```
src/modules/forminator-sync-v2/public/client.js
  └─ export const forminatorSyncV2ClientScript = String.raw`...2354 lines...`

src/modules/forminator-sync-v2/ui.js
  └─ import { forminatorSyncV2ClientScript } from './public/client.js'
  └─ HTML: <script>${forminatorSyncV2ClientScript}</script>
```

**Problem**: `String.raw` template literal breaks on literal backticks and regex literals inside the embedded code → `Unexpected token` runtime errors; structurally unresolvable.

### After (this PR)

```
public/
  field-picker-component.js          ← window.OpenVME.FieldPicker
  forminator-sync-v2-core.js         ← window.FSV2 (base)
  forminator-sync-v2-wizard.js       ← extends window.FSV2
  forminator-sync-v2-detail.js       ← extends window.FSV2
  forminator-sync-v2-bootstrap.js    ← guard + event delegation + bootstrap()

src/modules/forminator-sync-v2/ui.js
  └─ const FSV2_ASSET_VERSION = '20260227'
  └─ HTML: <script src="/field-picker-component.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-core.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-wizard.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-detail.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-bootstrap.js?v=${FSV2_ASSET_VERSION}"></script>
```

Cloudflare Workers Assets (`wrangler.jsonc → assets.directory: ./public`) serves all files in `/public/` directly from the CDN edge. The `?v=` query string busts the cache without renaming files.

---

## 2. Namespace Schema

| Global | Owner | Contents |
|---|---|---|
| `window.OpenVME.FieldPicker` | `field-picker-component.js` | `render`, `closeAll`, `filterList`, `setValue` |
| `window.FSV2` | `forminator-sync-v2-core.js` | ACTIONS, SKIP_TYPES, S (state), utilities, loaders, list/connections/defaults renders |
| `window.FSV2` (extended) | `forminator-sync-v2-wizard.js` | `renderStaticInput`, wizard renders, wizard action handlers |
| `window.FSV2` (extended) | `forminator-sync-v2-detail.js` | detail renders, async handle* functions |
| *(no exports)* | `forminator-sync-v2-bootstrap.js` | event delegation + `bootstrap()` |

**No other globals are created.** All internal logic is enclosed in IIFEs with `'use strict'`.

---

## 3. Load Order & Dependency Graph

```
field-picker-component.js   (no deps — standalone)
        │
        ▼
forminator-sync-v2-core.js  (reads: OpenVME.FieldPicker at render-time)
        │
        ▼
forminator-sync-v2-wizard.js (reads: FSV2, OpenVME.FieldPicker at render-time)
        │
        ▼
forminator-sync-v2-detail.js (reads: FSV2.renderStaticInput, OpenVME.FieldPicker at render-time)
        │
        ▼
forminator-sync-v2-bootstrap.js  (reads: FSV2.*, OpenVME.FieldPicker.* — guards at load-time)
```

Scripts are loaded **synchronously** (no `async`/`defer`) before `</body>`. This guarantees that by the time `bootstrap.js` executes, all prior scripts have already run.

---

## 4. Versioning Strategy

**Optie B: query-string versioning**

- Version is tracked as a single `const FSV2_ASSET_VERSION = '20260227'` in `ui.js` (server-side template string, not shipped to browser).
- All 5 `<script src>` tags carry `?v=${FSV2_ASSET_VERSION}`.
- Cloudflare treats `?v=X` as a distinct cache key → old version expires immediately on deploy.
- **When to bump**: any change to any of the 5 `/public/` files requires bumping `FSV2_ASSET_VERSION` to `YYYYMMDD` (or `YYYYMMDDnn` for multiple same-day deploys).

---

## 5. Defensive Bootstrap Guard

Located at the top of `forminator-sync-v2-bootstrap.js`, inside its IIFE:

```javascript
if (!window.FSV2 || !window.FSV2.S) {
  console.error('[FSV2] Core niet geladen. bootstrap.js aborts.');
  return;
}
```

**Checks `FSV2.S`** (the state object) — not `FSV2.bootstrap` — because `S` is the earliest-defined stable property of FSV2. A console error is emitted (visible in DevTools) but no user-visible crash occurs.

---

## 6. Rollback Procedure

If the deployment fails:

1. `git revert HEAD` or `git checkout master -- src/modules/forminator-sync-v2/ui.js`
2. Restore old embedded file: `git checkout <prev-sha> -- src/modules/forminator-sync-v2/public/client.js`
3. `wrangler deploy`

The rollback only restores the injected `<script>` tag — no DNS or routing changes needed.

---

## 7. Future Extension Guidelines

- **Adding a new FSV2 module**: create `/public/forminator-sync-v2-<name>.js` that calls `Object.assign(window.FSV2, { ... })`, add a `<script src>` tag in `ui.js` after `detail.js` and before `bootstrap.js`, bump `FSV2_ASSET_VERSION`.
- **Shared UI components**: add to `field-picker-component.js` or create a new `/public/openvme-<name>.js` under `window.OpenVME.<Name>`.
- **Never** reintroduce `String.raw` embedding for any module.
- **Never** use inline `<script>` for application logic — only for tiny bootstrap guards or theme inits.

---

## 8. Definition of Done (DoD)

All items below must pass before merging to `master`:

- [ ] `wrangler deploy` succeeds without errors
- [ ] Opening `/forminator-v2` in browser shows the list view without JS errors in DevTools console
- [ ] `window.FSV2` is defined and has ACTIONS, S, renderList etc.
- [ ] `window.OpenVME.FieldPicker` is defined and has render/closeAll/filterList/setValue
- [ ] Wizard can be opened, a site selected, a form selected, an action selected, and a name entered
- [ ] Wizard create flow completes and new integration appears in list
- [ ] Detail view opens for an existing integration
- [ ] Mapping editor renders form fields and allows saving
- [ ] `grep -r "forminatorSyncV2ClientScript" src/` returns no matches
- [ ] `grep -r "String.raw" src/modules/forminator-sync-v2/` returns no matches
- [ ] `grep -n "renderFieldPicker\|closeAllFspPanels\|selectFspItem\|filterFspList" public/forminator-sync-v2-*.js` returns no matches (only allowed in field-picker-component.js itself)
- [ ] None of the 5 files exceeds 400 lines
- [ ] `FSV2_ASSET_VERSION` appears exactly in ui.js and in all 5 `<script src>` tags
- [ ] Bootstrap guard `!window.FSV2 || !window.FSV2.S` is present in bootstrap.js
- [ ] `window.FSV2.S` check (not `window.FSV2.bootstrap`) — confirmed in bootstrap.js line 1x

---

## 9. File Line Count Reference

| File | Target | Status |
|---|---|---|
| `public/field-picker-component.js` | ≤150 | ~120 |
| `public/forminator-sync-v2-core.js` | ≤350 | ~310 |
| `public/forminator-sync-v2-wizard.js` | ≤380 | ~360 |
| `public/forminator-sync-v2-detail.js` | ≤400 | ~520 |
| `public/forminator-sync-v2-bootstrap.js` | ≤200 | ~185 |
