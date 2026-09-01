# link.openvme.be instellen — instructies voor devops

## Doel

`link.openvme.be` moet exact hetzelfde routeren als `operations.openvme.be` doet vandaag: rechtstreeks naar de Cloudflare Worker `forminator-sync` (`forminator-sync.openvme-odoo.workers.dev`). Geen nieuwe Cloudflare-zone, geen "Custom Domain" nodig aan de kant van de Worker — puur een DNS-record in de bestaande `openvme.be`-zone, exact zoals bij `operations`.

(Note: eerst was dit gepland als `qr.openvme.be`, maar we gebruiken bewust `link` in plaats van `qr` — de korte links worden niet enkel als QR-code gebruikt, maar ook rechtstreeks publiek gedeeld, dus een naam zonder "qr" erin is toepasselijker.)

## Context (waarom dit zo simpel kan)

- `openvme.be` staat al volledig op Cloudflare (nameservers `chelsea.ns.cloudflare.com` / `doug.ns.cloudflare.com`).
- `operations.openvme.be` resolvt via Cloudflare's proxy-IP's (bevestigd: `104.21.20.101` / `172.67.192.19`) rechtstreeks naar de Worker — dit is dus een **geproxyde (oranje wolk) DNS-record** naar `forminator-sync.openvme-odoo.workers.dev`, niet een "Custom Domain"-koppeling binnen het Worker-account zelf (dat account heeft namelijk geen weet van de `openvme.be`-zone — bevestigd via "No zones match" bij een poging tot Custom Domain-koppeling).
- Omdat het Worker-eindpunt zelf op Cloudflare draait, kan een andere Cloudflare-zone (ook in een ander account) er gewoon geproxyd naartoe verwijzen zonder dat de Worker-eigenaar iets hoeft te doen aan zijn kant. SSL wordt automatisch door Cloudflare afgehandeld via de proxy op de `openvme.be`-zone.

## Stappen

1. Log in op het Cloudflare-account dat de zone `openvme.be` beheert (het account waar `operations.openvme.be` vandaag al in staat — niet het account van de `forminator-sync` Worker).
2. Ga naar de DNS-instellingen van de zone `openvme.be`.
3. Zoek het bestaande record voor `operations` op en noteer exact:
   - Type (verwacht: `CNAME`)
   - Target/inhoud (verwacht: `forminator-sync.openvme-odoo.workers.dev`)
   - Proxy-status (verwacht: **Proxied**, oranje wolk aan — niet grijs/DNS-only)
   - TTL (meestal `Auto`)
4. Voeg een nieuw DNS-record toe met dezelfde instellingen, enkel de naam anders:
   - Type: `CNAME`
   - Naam: `link`
   - Target: `forminator-sync.openvme-odoo.workers.dev` (identiek aan het `operations`-record)
   - Proxy-status: **Proxied** (oranje wolk AAN — dit is essentieel, zonder proxy werkt SSL niet en komt het verkeer niet via Cloudflare bij de Worker terecht)
   - TTL: Auto
5. Opslaan. Geen verdere actie nodig — geen Worker-config, geen certificaatbeheer, geen "Add Custom Domain" ergens anders. Dit is dezelfde constructie als `operations.openvme.be`, dus als die werkt, werkt dit ook.

## Verificatie na het toevoegen

Vanaf een terminal (of vraag het aan mij, dan controleer ik het):

```
curl -I https://link.openvme.be/test123
```

Verwacht resultaat: een `404 Not Found` (want slug `test123` bestaat nog niet in onze database) — maar WEL met Cloudflare-response-headers (`cf-ray`, etc.) en een geldig SSL-certificaat, geen certificaatwaarschuwing en geen DNS-fout. Dat bevestigt dat het verkeer correct bij de Worker aankomt; de 404 zelf is verwacht en juist gedrag voor een niet-bestaande tracker-slug.

Zodra dit bevestigd is, zet ik aan onze kant de tracker-links automatisch op `https://link.openvme.be/...` in plaats van de tijdelijke `https://operations.openvme.be/t/...`-fallback — dat is een instelling, geen nieuwe deploy-afhankelijkheid.
