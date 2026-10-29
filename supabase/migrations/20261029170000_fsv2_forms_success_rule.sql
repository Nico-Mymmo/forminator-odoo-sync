-- Een andere bedankboodschap als een veld boven een getal zit:
-- {"field": "aantal_kavels", "above": 25, "title": "...", "text": "..."}.
-- Hoort bij het formulier; de plugin toont ze (mymmo-forms 1.24.3).
alter table public.fs_v2_forms add column if not exists success_rule jsonb;
