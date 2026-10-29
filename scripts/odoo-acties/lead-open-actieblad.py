# Serveractie "Open actieblad" op crm.lead, achter de knop Actiebladen op de lead.
# Ingezet door scripts/odoo-acties/lead-open-actieblad.mjs.
#
# Een actieblad: meteen dat actieblad openen, zonder tussenlijst.
# Meer dan een (of geen): de lijst van de actiebladen van deze lead, zoals
# de knop vroeger altijd deed.

bladen = record.with_context(active_test=False).x_studio_opportunity_actionsheet_ids
if len(bladen) == 1:
    action = {
        'type': 'ir.actions.act_window',
        'name': 'Actieblad',
        'res_model': 'x_sales_action_sheet',
        'res_id': bladen.id,
        'view_mode': 'form',
        'views': [[False, 'form']],
        'target': 'current',
    }
else:
    action = {
        'type': 'ir.actions.act_window',
        'name': 'Actiebladen',
        'res_model': 'x_sales_action_sheet',
        'view_mode': 'tree,form',
        'views': [[False, 'list'], [False, 'form']],
        'domain': [('id', 'in', bladen.ids)],
        'context': {'active_test': False, 'default_x_studio_as_opportunity_ids': [record.id]},
        'target': 'current',
    }
