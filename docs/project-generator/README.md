# Project Generator Documentation

## Active Documentation (V1 MVP Scope)

**Single Source of Truth:**
- [PROJECT_GENERATOR_COMPLETE_V1.md](PROJECT_GENERATOR_COMPLETE_V1.md) - Complete reference for V1 implementation

**Supporting Documentation:**
- [FUNCTIONAL_ANALYSIS_V1.md](FUNCTIONAL_ANALYSIS_V1.md) - What users can do in V1
- [TECHNICAL_ANALYSIS_V1.md](TECHNICAL_ANALYSIS_V1.md) - How to implement V1
- [EXPLORER_V1.md](EXPLORER_V1.md) - Why V1 decisions were made

---

## Quick Reference

### What is Project Generator V1?

A minimal system that allows users to:
1. **Design** a project structure (task stages, milestones, tasks, subtasks, dependencies)
2. **Save** it as a template (Supabase)
3. **Generate** an Odoo project from that template (API)

**Architectural Principle:** The Project Generator adapts to Odoo. Odoo is not modified, extended, or bypassed.

### Deterministic Flow

```
Blueprint → Template → Odoo Project
(design)    (storage)   (one-time push)
```

**No sync. No updates. No versioning in V1.**

### Implementation Scope

**Files to Create:**
- `src/modules/project-generator/module.js` - Module registration
- `src/modules/project-generator/library.js` - Template CRUD + list UI
- `src/modules/project-generator/editor.js` - Blueprint editor UI
- `src/modules/project-generator/generate.js` - Project generation UI
- `src/modules/project-generator/validation.js` - Validation logic
- `src/modules/project-generator/odoo-creator.js` - Odoo API calls

**Database:**
- Single table: `project_templates` (id, user_id, name, description, blueprint_data, created_at, updated_at)

**Estimated Effort:** 3-5 days

---

## NOT in V1 Scope

### Features Explicitly Excluded
- ❌ Template versioning (single version only, overwrite on save)
- ❌ Audit trail (no generation history tracking)
- ❌ Rollback on error (user manually deletes partial project in Odoo)
- ❌ Bidirectional sync (one-way push only, ZERO connection after generation)
- ❌ Visual dependency graph (text list only)
- ❌ Keyboard shortcuts (deliberate exclusion for simplicity)
- ❌ Confetti animations (deliberate exclusion for simplicity)
- ❌ Auto-save (manual save only, Cancel returns to last saved state)

### Data Explicitly Excluded (Except Subtasks)
- ✅ Subtasks (MANDATORY in V1 via parent_id field - essential for process thinking)
- ❌ Task descriptions (name only in V1)
- ❌ Estimated hours (not in V1)
- ❌ Task assignments (not in V1)
- ❌ Tags (not in V1)
- ❌ Stage colors (not in V1)

### Technical Patterns Explicitly Excluded
- ❌ New service layers (use existing odoo.js, database.js, auth/*)
- ❌ Alternative Odoo patterns (use existing executeKw from odoo.js only)
- ❌ State management library (plain JavaScript only)
- ❌ GraphQL (REST API only via existing patterns)
- ❌ Queue system (synchronous generation only)

---

## Document History

### 2026-01-28: V1 MVP Scope Rewrite
- Complete rewrite with strict scope reduction
- Removed 6 old documents (too broad)
- Created 4 new documents (V1 focused)
- Reduced scope from 11-week roadmap to 3-5 day MVP
- Eliminated all nice-to-have features
- Anchored entirely in existing app architecture

### 2026-01-28: Initial Analysis (DEPRECATED)
- Original comprehensive analysis
- Included versioning, audit trail, advanced UX
- 11-week implementation roadmap
- Too broad for initial validation
- Files removed: FUNCTIONAL_ANALYSIS.md, TECHNICAL_ANALYSIS.md, UX_STRUCTURE.md, RISKS_AND_MITIGATIONS.md, EXPLORER.md, PROJECT_GENERATOR_COMPLETE.md

---

## Key Architectural Constraints

### Must Use Existing Patterns
- `src/modules/registry.js` for module registration
- `src/lib/odoo.js` for all Odoo communication (executeKw only)
- `src/lib/database.js` for Supabase queries
- `src/lib/auth/*` for authentication
- DaisyUI components for all UI

### Must NOT Create
- ❌ New service layer abstractions
- ❌ Alternative Odoo client libraries
- ❌ Custom validation frameworks
- ❌ New routing systems
- ❌ State management libraries

### Sequential API Calls (V1)
1. Create project (`project.project`)
2. Create stages (`project.task.type`)
3. Create milestones (`project.milestone`)
4. Create tasks (`project.task`) - pass 1
5. Set dependencies (`project.task`) - pass 2

**No parallel execution in V1.**

---

## Validation Rules

### Errors (Block Save)
- Empty template/stage/task names
- Circular dependencies
- Duplicate stage/milestone names
- Invalid dependency references

### Warnings (Allow Save)
- Tasks without milestones
- Empty stages
- Isolated tasks
- No milestones defined

---

## Success Criteria

### Must Work
- ✅ Create template
- ✅ Edit template
- ✅ Delete template
- ✅ Generate Odoo project
- ✅ Project matches blueprint
- ✅ Validation catches errors
- ✅ RLS enforced

### Performance
- Template list: <1s
- Editor load: <500ms
- Validation: <200ms
- Save: <1s
- Generation (50 tasks): <10s

---

## Next Steps

1. Read [PROJECT_GENERATOR_COMPLETE_V1.md](PROJECT_GENERATOR_COMPLETE_V1.md)
2. Create database migration
3. Implement 6 files
4. Test with real Odoo
5. Deploy

**Start implementation immediately. All decisions made.**
