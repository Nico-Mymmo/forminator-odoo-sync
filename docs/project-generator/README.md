# Project Generator Module Documentatie

## Overzicht
De Project Generator module maakt het mogelijk om herbruikbare projectsjablonen te ontwerpen en automatisch Odoo projecten te genereren op basis van deze sjablonen.

## Belangrijkste Documenten

### Finale Oplevering
- [PROJECT_GENERATOR_COMPLETE_V1.md](PROJECT_GENERATOR_COMPLETE_V1.md) - Complete referentie voor V1 implementatie
- [MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md](MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md) - Volledige implementatie log met architectuur en beslissingen

### Addendums (Specificaties & Contracten)
Addendums definiëren architecturale beslissingen, data contracten en ordering invariants:

- [ADDENDUM_A_B.md](ADDENDUM_A_B.md) - Foundational specs (A & B combined)
- [ADDENDUM_C.md](ADDENDUM_C.md) - Blueprint editor enhancements
- [ADDENDUM_D.md](ADDENDUM_D.md) - Task dependencies
- [ADDENDUM_E.md](ADDENDUM_E.md) - Stakeholder mapping
- [ADDENDUM_F.md](ADDENDUM_F.md) - Color coding system
- [ADDENDUM_G.md](ADDENDUM_G.md) - Tag system
- [ADDENDUM_H.md](ADDENDUM_H.md) - Task timing
- [ADDENDUM_H1.md](ADDENDUM_H1.md) - Timing refinements
- [ADDENDUM_I.md](ADDENDUM_I.md) - Stage system
- [ADDENDUM_J.md](ADDENDUM_J.md) - Generation lifecycle
- [ADDENDUM_K.md](ADDENDUM_K.md) - Multi-level task hierarchy
- [ADDENDUM_L.md](ADDENDUM_L.md) - Parent-child ordering
- [ADDENDUM_M.md](ADDENDUM_M.md) - Milestone-dominant ordering
- [ADDENDUM_M1.md](ADDENDUM_M1.md) - Milestone-leading sort fix
- [ADDENDUM_M2.md](ADDENDUM_M2.md) - Task ordering contract (normative)

### Analyse & Ontwerp
Zie [analysis/](analysis/) submap voor:
- [FUNCTIONAL_ANALYSIS_V1.md](analysis/FUNCTIONAL_ANALYSIS_V1.md) - Wat gebruikers kunnen doen
- [TECHNICAL_ANALYSIS_V1.md](analysis/TECHNICAL_ANALYSIS_V1.md) - Hoe V1 te implementeren
- [EXPLORER_V1.md](analysis/EXPLORER_V1.md) - Waarom V1 beslissingen genomen zijn

### Forensics & Debugging
Zie [forensics/](forensics/) submap voor:
- [FULL_FORENSIC_MODULE_REPORT.md](forensics/FULL_FORENSIC_MODULE_REPORT.md) - Complete module forensics
- [FORENSIC_ORDERING_TRACE.md](forensics/FORENSIC_ORDERING_TRACE.md) - Task ordering trace analysis
- [FORENSIC_MILESTONE_REORDER_TRACE.md](forensics/FORENSIC_MILESTONE_REORDER_TRACE.md) - Milestone reordering investigation
- [DIAGNOSTIC_REPORT_GENERATION_PERFORMANCE.md](forensics/DIAGNOSTIC_REPORT_GENERATION_PERFORMANCE.md) - Performance analyse

### Odoo Models
Zie [models/](models/) submap voor PDF exports van Odoo modellen


## Quick Reference

### Wat is Project Generator V1?

Een systeem waarmee gebruikers:
1. **Ontwerpen** - Een projectstructuur maken (stages, milestones, taken, subtaken, dependencies)
2. **Opslaan** - Als herbruikbare template (Supabase)
3. **Genereren** - Een Odoo project aanmaken op basis van de template

**Architectureel Principe:** De Project Generator past zich aan Odoo aan. Odoo wordt niet gewijzigd, uitgebreid of omzeild.

### Implementatie Status

**✅ Iteration 1:** Database foundation  
**✅ Iteration 2:** Template library CRUD + UI  
**✅ Iteration 3:** Blueprint editor  
**✅ Iteration 4:** Project generation + Odoo integration  
**✅ Iteration 5:** Sequence backfill voor legacy data  

Zie [iterations/](iterations/) voor volledige implementatie logs.

### Flow

```
Blueprint → Template → Odoo Project
(ontwerp)   (opslag)   (één keer pushen)
```

**Geen sync. Geen updates. Geen versiebeheer in V1.**

## Documentatie Structuur

```
project-generator/
├── README.md (dit bestand)
├── PROJECT_GENERATOR_COMPLETE_V1.md (finale oplevering)
├── ADDENDUM_*.md (specificaties & contracten)
├── analysis/ (functionele & technische analyse)
├── forensics/ (debugging & trace analyses)
├── iterations/ (implementatie logs per iteratie)
└── models/ (Odoo model exports)
```
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
## Gerelateerde Modules
- Sales Insight Explorer - Analytics en rapportage
- CRM Leads - Lead classificatie en verrijking

## Support & Contact
Voor vragen en ondersteuning, zie de hoofddocumentatie in [docs/README.md](../README.md)

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
