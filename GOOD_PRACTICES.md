# Good Practices - Forminator Odoo Sync

## UI/UX Principles

### Never Use Browser Dialogs for Data Input
**Rule**: Never use `prompt()`, `alert()`, or `confirm()` for collecting user input in forms.

**Rationale**: 
- Browser dialogs interrupt the user flow
- They're not themeable or styleable
- Poor UX on mobile devices
- No inline validation possible

**Correct Approach**: Use inline form fields like domain conditions
```javascript
// ❌ BAD - Using prompt()
function addValueMappingRow(formField) {
    const key = prompt('Enter original value:');
    if (!key) return;
    const value = prompt('Enter mapped value:');
    // ...
}

// ✅ GOOD - Inline editing with empty row
function addValueMappingRow(formField) {
    if (!valueMapping[formField]) valueMapping[formField] = {};
    valueMapping[formField][''] = '';  // Add empty row for inline editing
    renderValueMappingRows(formField);
}
```

**Implementation Pattern**:
1. Add an empty row to the data structure
2. Render the row with input fields
3. Update the data structure on input change
4. Provide delete button for each row

This pattern is used consistently in:
- Domain conditions (`addDomainRow`)
- Value mappings (`addValueMappingRow`)

---

## Design System

### DaisyUI First Philosophy
**Rule**: Use only DaisyUI components and Tailwind utilities. Avoid custom CSS.

**Approach**:
- If a component doesn't exist in DaisyUI, compose it from existing components
- Use DaisyUI theme tokens for all spacing, colors, shadows, and borders
- Custom CSS only for animations that DaisyUI doesn't handle (e.g., collapse transitions)

**Shadow Hierarchy**:
- `shadow-sm`: Navigation elements (navbar)
- `shadow`: Standard cards
- `shadow-md`: Workflow steps, emphasized sections
- `shadow-lg`: Login/modal overlays
- `shadow-xl`: Top-level modals

**Spacing Consistency**:
- Card bodies: `p-4` (16px)
- Collapse content: Default padding (no `pt-2` override)
- All titles: `text-sm font-medium flex items-center gap-2`
- All icons in titles: `w-4 h-4`

---

## Code Organization

### Component Modularity
Keep UI components in separate files under `src/lib/components/`:
- `navbar.js` - Navigation with theme selector
- `sidebar.js` - Navigation sidebar
- `login.js` - Authentication UI
- `modal.js` - Reusable modal component
- `editor.js` - Main editor interface
- `field_palette.js` - Draggable field palette

### Configuration Separation
- `src/config/odoo_models.js` - Odoo model configurations with search templates
- `src/config/form_mappings.js` - Form field mapping structure
- `src/config/mappings.json` - Runtime mapping storage

---

## State Management

### Auto-save Pattern
Implement debounced auto-save for all workflow changes:
```javascript
let saveTimeout;
function scheduleAutoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveMappings();
    }, 1000);
}
```

### Collapse State Preservation
Preserve collapse states during re-renders:
```javascript
const preservedCollapseStates = {};
// Before render: capture state
// During render: restore state with checked attribute
// After render: re-initialize Lucide icons
```

---

## Git Workflow

### Branch Strategy
- `master` - Production-ready code
- `feature/*` - New features
- `refactor/*` - Code restructuring

### Commit Guidelines
- Descriptive commit messages with bullet points
- List all major changes
- Deploy immediately after merge to master
- Clean up merged branches (local and remote)

---

## Deployment

### Cloudflare Workers
- Deploy with `wrangler deploy`
- Test on staging KV namespace before production
- Use `sync-kv.js` for KV namespace migrations
- Always verify deployment URL after deploy

---

## Documentation

This document should be updated whenever new patterns or practices are established.
