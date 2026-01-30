# Forminator-Odoo Sync - Documentatie

Deze directory bevat alle module-specifieke documentatie voor het Forminator-Odoo Sync project.

## Modules

### 📊 [Sales Insight Explorer](sales-insight-explorer/)
Schema-driven query engine voor Odoo data exploratie.

**Status:** ✅ Production-Ready  
**Kernfunctionaliteit:**
- Visual query builder zonder SQL kennis
- Schema introspection en validatie
- Query persistence en export (JSON/CSV)
- Zero hardcoded assumptions

**Documentatie:**
- [SALES_INSIGHT_COMPLETE.md](sales-insight-explorer/SALES_INSIGHT_COMPLETE.md) - Complete implementatie
- [iterations/](sales-insight-explorer/iterations/) - Alle iteratie logs

---

### 🎯 [Project Generator](project-generator/)
Herbruikbare projectsjablonen voor automatische Odoo project generatie.

**Status:** ✅ V1 Production-Ready  
**Kernfunctionaliteit:**
- Blueprint editor voor project structuren
- Template library met herbruikbare sjablonen
- One-click Odoo project generatie
- Milestone-dominant task ordering

**Documentatie:**
- [PROJECT_GENERATOR_COMPLETE_V1.md](project-generator/PROJECT_GENERATOR_COMPLETE_V1.md) - V1 referentie
- [ADDENDUM_*.md](project-generator/) - Specificaties en contracten (A t/m M2)
- [iterations/](project-generator/iterations/) - Implementatie logs
- [forensics/](project-generator/forensics/) - Debugging en trace analyses

---

### 🔍 [CRM Leads](crm-leads/)
Automatische lead classificatie, verrijking en semantic correction.

**Status:** ✅ Production-Ready  
**Kernfunctionaliteit:**
- Lead classificatie op basis van formdata
- Automatische lead verrijking
- Semantic correction voor data quality

**Documentatie:**
- [CRM_LEADS_EXTENSION_COMPLETE.md](crm-leads/CRM_LEADS_EXTENSION_COMPLETE.md) - Complete beschrijving
- [CRM_LEADS_QUICK_START.md](crm-leads/CRM_LEADS_QUICK_START.md) - Gebruikershandleiding

---

## Documentatie Structuur per Module

Elke module volgt deze standaard structuur:

```
module-naam/
├── README.md                    # Module overzicht en navigatie
├── MODULE_COMPLETE.md          # Finale oplevering en referentie
├── ADDENDUM_*.md               # Specificaties en contracten (indien van toepassing)
├── iterations/                 # Implementatie logs per iteratie
│   ├── ITERATION_1_*.md
│   ├── ITERATION_2_*.md
│   └── ...
├── analysis/                   # Functionele en technische analyses (indien van toepassing)
├── forensics/                  # Debugging en trace analyses (indien van toepassing)
└── models/                     # Odoo model exports (indien van toepassing)
```

## Root Documentatie

De volgende documentatie staat in de project root:
- **README.md** - Hoofd project documentatie
- **ARCHITECTURE.md** - Systeem architectuur overzicht
- **DEVELOPMENT.md** - Development guidelines
- **SERIALIZATION_CONTRACT.md** - Data serialisatie contracten

## Deprecated Documentatie

Zie [deprecated/](deprecated/) voor oude documentatie en tijdelijke artifacts die mogelijk in de toekomst worden verwijderd.
