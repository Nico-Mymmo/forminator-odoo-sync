-- Homepage: modules gegroepeerd per departement.
--
-- module_departments = de kolom links op de homepage. Elke module hoort bij
-- hoogstens een departement (modules.department_id); zonder departement komt
-- ze onder "Overige". Beheerders passen beide aan vanop de homepage zelf
-- (tandwiel op een tegel, knoppen in de linkerkolom), zie
-- src/modules/admin/department-routes.js.
--
-- De indeling hieronder is een eerste voorstel; ze is volledig aanpasbaar.

create table if not exists public.module_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.module_departments enable row level security;

alter table public.modules
  add column if not exists department_id uuid
  references public.module_departments(id) on delete set null;

insert into public.module_departments (name, icon, display_order) values
  ('Marketing',  'megaphone',    10),
  ('Sales',      'trending-up',  20),
  ('CX',         'heart-handshake', 30),
  ('Operations', 'settings-2',   40)
on conflict (name) do nothing;

update public.modules m
set department_id = d.id
from public.module_departments d
where m.department_id is null
  and (
    (d.name = 'Marketing'  and m.code in ('forminator_sync_v2', 'newsletters', 'campaign_funnels', 'content_feed',
                                          'mail_signature_designer', 'event_operations_v2', 'event_operations', 'av_slides'))
 or (d.name = 'Sales'      and m.code in ('sales_insight_explorer', 'dashboards', 'booking_links', 'product_features',
                                          'gmail_chatter', 'web_story'))
 or (d.name = 'CX'         and m.code in ('cx_powerboard', 'cx_automations'))
 or (d.name = 'Operations' and m.code in ('project_generator', 'odoo_controle', 'mini_apps', 'admin_helpers',
                                          'wp_form_schemas'))
  );
