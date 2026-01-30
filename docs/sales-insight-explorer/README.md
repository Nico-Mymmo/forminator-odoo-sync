# Sales Insight Explorer Module Documentatie

## Overzicht
De Sales Insight Explorer is een **schema-driven query engine** voor Odoo die gebruikers in staat stelt om data te verkennen zonder SQL kennis. Gebouwd met zero hardcoded assumptions en strikte validatie.

## Belangrijkste Documenten

### Finale Oplevering
- [SALES_INSIGHT_COMPLETE.md](SALES_INSIGHT_COMPLETE.md) - Complete implementatie samenvatting (Iterations 1-7)
- [SALES_INSIGHT_EXPLORER.md](SALES_INSIGHT_EXPLORER.md) - Technische referentie en API documentatie

## Implementatie Geschiedenis

### Status: ✅ PRODUCTION-READY

**Iterations 1-6** (Development Phase):
- Complete query infrastructuur
- Schema introspection, validatie, executie, presets, persistentie, export, UI
- ~15 uur implementatie
- ~6,270 regels productie code

**Iteration 7** (Production Debugging):
- 4 critical production blockers opgelost
- Deployed en getest in live omgeving
- Full end-to-end workflow verificatie

**Iterations 8-9**: Verdere uitbreidingen en optimalisaties

Zie [iterations/](iterations/) voor volledige implementatie logs per iteratie.

## Core Features

### Schema Introspection
- Dynamische model discovery
- Field type detection en validatie
- Relatie mapping (many2one, one2many, many2many)

### Query Builder UI
- Visual query constructie zonder SQL
- Field selection en filtering
- Relatie navigatie
- Export naar JSON/CSV

### Query Persistence
- Opslaan van queries als presets
- Herbruikbare query templates
- User-scoped query storage (Supabase)

### Safety & Validation
- Strikte field validation
- Relatie verificatie
- SQL injection preventie
- Error handling met duidelijke feedback

## Architectuur

### Core Philosophie
> "Je bouwt dit alsof het 5 jaar moet meegaan, meerdere teams ermee werken, elke fout later duur is."

**Prioriteiten:**
- **Maintainability** boven quick wins
- **Safety** boven convenience
- **Honesty** boven promises
- **Schema-driven** boven assumptions

### Technische Stack
- **Backend**: Cloudflare Workers (src/modules/sales-insight-explorer/)
- **Frontend**: Vanilla JavaScript met DaisyUI (public/sales-insights-app.js)
- **Storage**: Supabase (query persistence)
- **API**: Odoo XML-RPC executeKw

## Documentatie Structuur

```
sales-insight-explorer/
├── README.md (dit bestand)
├── SALES_INSIGHT_COMPLETE.md (finale oplevering)
├── SALES_INSIGHT_EXPLORER.md (technische referentie)
└── iterations/ (implementatie logs per iteratie)
    ├── ITERATION_1_DELIVERY.md
    ├── ITERATION_2_DELIVERY.md
    ├── ...
    └── ITERATION_9.4_LEAD_PROPERTY_GROUPS.md
```

## Gerelateerde Modules
- CRM Leads - Levert lead data voor exploratie
- Project Generator - Kan gekoppeld worden aan sales insights

## Support & Contact
Voor vragen en ondersteuning, zie de hoofddocumentatie in [docs/README.md](../README.md)
