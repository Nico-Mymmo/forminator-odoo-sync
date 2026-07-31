# link.openvme.be — redirect niet-trackerverkeer naar www.openvme.be

## Doel

Alles op `link.openvme.be` behalve echte trackbare links (`/t/<slug>`) moet
doorgestuurd worden naar `https://www.openvme.be` — dus zowel een kaal bezoek
aan `link.openvme.be` (root) als een verzonnen/verlopen pad.

## Waarom dit NIET via de Worker-code kan (en niet meer geprobeerd wordt)

`link.openvme.be` loopt (net als `operations.openvme.be`) via een geproxyde
CNAME vanuit een ander Cloudflare-account naar dezelfde Worker
(`forminator-sync.openvme-odoo.workers.dev`). Getest en bevestigd: in die
constructie krijgt de Worker de Host-header niet betrouwbaar door — hij ziet
soms de interne workers.dev-doelhostname in plaats van `link.openvme.be` of
`operations.openvme.be`. Daardoor kan de Worker-code zelf niet met zekerheid
zeggen "dit bezoek kwam via link.openvme.be, stuur door" zonder ook per
ongeluk `operations.openvme.be` (de echte inlogpagina voor collega's) te
raken. Een Cloudflare Redirect Rule op de zone zelf werkt wél betrouwbaar,
want die ziet de hostname vóórdat het verkeer ooit bij de Worker aankomt.

## Stappen

1. Log in op het Cloudflare-account dat de zone `openvme.be` beheert (zelfde
   account als waar de DNS-records voor `operations` en `link` al in staan).
2. Ga naar **Rules → Redirect Rules** (in sommige Cloudflare-UI's heet dit nog
   "Single Redirects" of, op oudere accounts, "Page Rules").
3. Nieuwe regel aanmaken met:
   - **Als (voorwaarde):**
     `Hostname` `equals` `link.openvme.be`
     **EN**
     `URI Path` `does not start with` `/t/`
   - **Dan (actie):** Static of Dynamic Redirect naar `https://www.openvme.be`
     Status: **301** (permanent — dit is een blijvende regel, geen tijdelijke
     actie)
4. Opslaan.
5. **Belangrijk:** de voorwaarde `URI Path does not start with /t/` moet
   correct blijven staan — anders werken de gedeelde trackbare links
   (`link.openvme.be/t/<slug>`) niet meer, want die moeten wél bij de Worker
   terechtkomen (voor het redirecten naar de echte doel-URL + het loggen van
   de klik/scan).

## Verificatie

- `https://link.openvme.be/` → moet meteen naar `https://www.openvme.be`
  springen (301, geen Operations Manager-inlogscherm).
- `https://link.openvme.be/nietbestaandpad` → zelfde, naar
  `https://www.openvme.be`.
- Een bestaande trackbare link, bv. `https://link.openvme.be/t/CduPvgN` →
  moet nog steeds gewoon naar zijn eigen doel-URL doorsturen (dus NIET naar
  www.openvme.be) — dit bevestigt dat de `/t/`-uitzondering goed staat.

Zodra deze regel actief is, is de aparte "geen sessie/onbekend pad"-pagina
die de Worker zelf toont (voor `operations.openvme.be`, waar deze regel niet
op van toepassing is) nog steeds relevant als vangnet, maar voor
`link.openvme.be` zal deze Cloudflare-regel bijna alles al onderscheppen
vóór de Worker er ooit iets van ziet.
