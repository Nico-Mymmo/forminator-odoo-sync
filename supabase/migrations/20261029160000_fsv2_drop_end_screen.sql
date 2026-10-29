-- Het eindscherm per stap (end_title / end_text) is terug weg: het hoort in
-- de plugin (Instellingen -> Verbinding -> Grote gebouwen), niet in Koppelingen.
alter table public.fs_v2_targets drop column if exists end_title;
alter table public.fs_v2_targets drop column if exists end_text;
