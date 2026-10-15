-- Nieuwsbrieven: twee losse soorten mailing (zonder ritme, zonder rubrieken:
-- elke mailing ervan start blanco). Lijsten, afzender, logo, tint en
-- chatkanaal worden overgenomen van de OpenVME platform-update; marketing
-- past ze aan bij de instellingen van het soort. Idempotent (code is uniek).

INSERT INTO newsletter_series (code, name, brand, description, audience, tone, odoo_list_ids,
  from_name, from_email, reply_to, logo_url, tint, chat_channel, cadence, sections)
SELECT 'productupdate', 'Productupdate', 'openvme',
  'Een losse mailing over wat er nieuw is in het platform.',
  s.audience, s.tone, s.odoo_list_ids, s.from_name, s.from_email, s.reply_to, s.logo_url, s.tint, s.chat_channel,
  'none', '[]'::jsonb
FROM newsletter_series s WHERE s.code = 'openvme'
ON CONFLICT (code) DO NOTHING;

INSERT INTO newsletter_series (code, name, brand, description, audience, tone, odoo_list_ids,
  from_name, from_email, reply_to, logo_url, tint, chat_channel, cadence, sections)
SELECT 'aankondiging', 'Aankondiging', 'openvme',
  'Een losse mailing met één boodschap: een event, een verandering, een nieuwigheid.',
  s.audience, s.tone, s.odoo_list_ids, s.from_name, s.from_email, s.reply_to, s.logo_url, s.tint, s.chat_channel,
  'none', '[]'::jsonb
FROM newsletter_series s WHERE s.code = 'openvme'
ON CONFLICT (code) DO NOTHING;
