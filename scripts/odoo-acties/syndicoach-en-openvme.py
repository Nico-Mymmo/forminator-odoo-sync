# Stap in "Versturen naar Syndicoach" op het actieblad (actie 1180, ingezet door
# scripts/odoo-acties/syndicoach-en-openvme.mjs). Maakt in dezelfde klik ook de
# VME in OpenVME aan, met de knop "Maak in OpenVME" van de lead (openvme-knop.py).
# Ontbreekt er iets voor OpenVME, dan stopt die knop met een melding en is er
# NIETS verstuurd, ook niet naar Syndicoach: de webhook naar Syndicoach komt pas
# na deze stap, en de rest wordt teruggedraaid.
# Staat de VME al in OpenVME (soid, of de lead werd al doorgestuurd), dan wordt
# OpenVME overgeslagen en gaat enkel de overdracht naar Syndicoach.
OPENVME_KNOP = __OPENVME_KNOP__
NL = chr(10)

if env.context.get('syndicoach_overdracht'):
    for sheet in records:
        gebouw = sheet.x_studio_for_company_id
        lead = False
        # Liefst de lead waarvan de contactpersoon bij het gebouw van dit actieblad hoort.
        for ld in sheet.x_studio_as_opportunity_ids:
            if ld.partner_id and gebouw and ld.partner_id.parent_id.id == gebouw.id:
                lead = ld
                break
        if not lead:
            for ld in sheet.x_studio_as_opportunity_ids:
                if ld.partner_id:
                    lead = ld
                    break
        if not lead:
            raise UserError('Er is niets verstuurd, niet naar Syndicoach en niet naar OpenVME.' + NL + NL
                            + 'Koppel eerst de lead aan dit actieblad, met de contactpersoon als klant op de lead.')
        al_gedaan = bool(lead.partner_id.x_studio_soid) or env['mail.message'].search_count([
            ('model', '=', 'crm.lead'), ('res_id', '=', lead.id), ('body', 'ilike', 'Doorgestuurd naar OpenVME')]) > 0
        if al_gedaan:
            continue
        env['ir.actions.server'].browse(OPENVME_KNOP).with_context(
            active_model='crm.lead', active_id=lead.id, active_ids=[lead.id], openvme_bevestigd=True).run()
