-- Het domein van het afzenderadres van een mailstap (jiri@mymmo.com wordt
-- jiri@syndicoach.be). Leeg = het adres zoals het in Odoo staat.
alter table public.fs_v2_targets add column if not exists mail_from_domain text;

-- Een eigen eindscherm voor de bezoeker: liep deze stap bij de inzending,
-- dan toont het venster op de site deze titel en tekst.
alter table public.fs_v2_targets add column if not exists end_title text;
alter table public.fs_v2_targets add column if not exists end_text text;
