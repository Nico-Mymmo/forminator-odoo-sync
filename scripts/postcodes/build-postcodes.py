"""
Postcodelijsten bouwen voor het postcodeveld van de OM-formulieren en voor
de kaart in Dashboards.

    python scripts/postcodes/build-postcodes.py            # downloadt alles
    python scripts/postcodes/build-postcodes.py --cache D  # hergebruikt D/*.zip

Schrijft:
    src/modules/forminator-sync-v2/forms/postcodes/be.js
    src/modules/forminator-sync-v2/forms/postcodes/nl.js

Die twee bestanden zijn GEGENEREERD. Bewerk ze nooit met de hand: draai dit
script opnieuw. De WordPress-plugin krijgt bij het bouwen een afgeslankte kopie
(wp-plugin/build-mymmo-forms.sh), zodat er maar één bron is.

Bronnen, en waarom deze:

  BE  FOD BOSA, BeST Address -- de federale export van de drie regionale
      adresregisters (openaddress-bebru/bevlg/bewal.zip), CC BY 4.0, wekelijks
      bijgewerkt. bpost publiceert ook een lijst, maar die is niet open
      gelicentieerd en niet rechtstreeks downloadbaar. BeST is wat de overheid
      zelf als authentieke bron gebruikt, en het heeft per adres een
      coordinaat: het zwaartepunt van een postcode is hier dus het gemiddelde
      van ALLE adressen erin (waar de mensen wonen), niet het midden van een
      vlak.
  NL  GeoNames postal codes (NL.zip), CC BY 4.0. Viercijferige postcodes (PC4)
      met plaats, gemeente, provincie en een middelpunt. Minder fijn dan BE,
      maar genoeg om een postcode te herkennen en op de kaart te zetten.

Bijzonderheden van BeST die hier rechtgezet worden (vastgesteld op de export
van 30-09-2026):

  - In Vlaanderen staat per adres de VOLLEDIGE lijst plaatsen van de postcode
    in een veld, met "/" ertussen, en de hoofdplaats in hoofdletters
    ("AFFLIGEM/Essene/Hekelgem/Teralfene"). Die hoofdletters worden hersteld
    met de schrijfwijze van de gemeente, of anders netjes gekapitaliseerd.
  - In Brussel is de postnaam LEEG; de plaats is daar de gemeente, en die is
    officieel tweetalig. 1020, 1120 en 1130 heten bij bpost en de Stad Brussel
    Laken, Neder-Over-Heembeek en Haren, maar BeST geeft er enkel "Brussel":
    die drie staan hieronder in AANVULLING.
  - In de Duitstalige Gemeenschap is de postnaam ook leeg: de Duitse
    gemeentenaam, met de Franse ernaast.
  - In Wallonie staan per adres de GEHUCHTEN: 4960 Malmedy heeft er 28, sommige
    met een enkel adres. In een keuzelijst is dat onbruikbaar, dus een plaats
    telt pas mee vanaf MIN_ADRESSEN adressen (de hoofdplaats altijd). Wie in een
    weggelaten gehucht woont, kiest de hoofdplaats of "Andere plaats" -- het
    gemeenteveld in het formulier blijft altijd vrij in te vullen.
"""

import argparse
import collections
import csv
import datetime
import io
import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile

WORTEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DOEL = os.path.join(WORTEL, 'src', 'modules', 'forminator-sync-v2', 'forms', 'postcodes')

BEST_BRONNEN = {
    'bru': 'https://opendata.bosa.be/download/best/openaddress-bebru.zip',
    'vlg': 'https://opendata.bosa.be/download/best/openaddress-bevlg.zip',
    'wal': 'https://opendata.bosa.be/download/best/openaddress-bewal.zip',
}
GEONAMES_NL = 'https://download.geonames.org/export/zip/NL.zip'

# Een Waals gehucht telt mee vanaf zoveel adressen (zie de uitleg bovenaan).
MIN_ADRESSEN = 100

# Plaatsen die BeST niet als postnaam geeft, maar die er wel een eigen
# postcode voor hebben (zelfde aanvulling als lekoala/belgian-geography).
AANVULLING = {
    '1020': [{'nl': 'Laken', 'fr': 'Laeken'}],
    '1120': [{'nl': 'Neder-Over-Heembeek', 'fr': 'Neder-Over-Heembeek'}],
    '1130': [{'nl': 'Haren', 'fr': 'Haren'}],
}

# Hoofdletters die zo horen (SHAPE is het hoofdkwartier van de NAVO).
BEHOUD_HOOFDLETTERS = {'SHAPE'}

# Woorden die midden in een samengestelde plaatsnaam klein horen.
KLEINE_WOORDEN = {'in', "'t", 'op', 'den', 'aan', 'ter', 'ten', 'de', 'het'}

# Provincie uit de NIS-code van de gemeente.
def provincie_be(nis):
    if nis.startswith('21'):
        return 'Brussel'
    if nis.startswith('23') or nis.startswith('24'):
        return 'Vlaams-Brabant'
    if nis.startswith('25'):
        return 'Waals-Brabant'
    return {
        '1': 'Antwerpen', '3': 'West-Vlaanderen', '4': 'Oost-Vlaanderen',
        '5': 'Henegouwen', '6': 'Luik', '7': 'Limburg', '8': 'Luxemburg',
        '9': 'Namen',
    }.get(nis[:1], '')

PROVINCIES_NL = {
    '01': 'Drenthe', '02': 'Friesland', '03': 'Gelderland', '04': 'Groningen',
    '05': 'Limburg', '06': 'Noord-Brabant', '07': 'Noord-Holland',
    '09': 'Utrecht', '10': 'Zeeland', '11': 'Zuid-Holland', '15': 'Overijssel',
    '16': 'Flevoland',
}


def haal(url, cache):
    pad = os.path.join(cache, os.path.basename(url))
    if not os.path.exists(pad):
        print('downloaden:', url)
        urllib.request.urlretrieve(url, pad)
    return pad


def herstel_hoofdletters(naam, gemeentenamen):
    """'AFFLIGEM' -> 'Affligem'; mengvormen blijven zoals ze zijn."""
    if not naam or naam != naam.upper() or not re.search('[A-Z]', naam):
        return naam
    if naam in BEHOUD_HOOFDLETTERS:
        return naam
    for g in gemeentenamen:
        if g and g.upper() == naam:
            return g
    delen = re.split(r'([ \-])', naam.lower())
    uit = []
    eerste = True
    for d in delen:
        if d in (' ', '-') or d == '':
            uit.append(d)
            continue
        uit.append(d if (not eerste and d in KLEINE_WOORDEN) else d[:1].upper() + d[1:])
        eerste = False
    return ''.join(uit)


def poets(naam):
    """Schrijfwijzen die in BeST net niet kloppen."""
    naam = naam.strip()
    # 's-Gravenwezel, 's-Herenelderen: BeST schrijft "'S Gravenwezel".
    naam = re.sub(r"^'[Ss][ -]", "'s-", naam)
    # Sint-Job-In-'T-Goor -> Sint-Job-in-'t-Goor
    delen = naam.split('-')
    for i in range(1, len(delen)):
        if delen[i].lower() in KLEINE_WOORDEN and i < len(delen) - 1:
            delen[i] = delen[i].lower()
    return '-'.join(delen)


def bouw_be(cache):
    agg = collections.defaultdict(lambda: {
        'n': 0, 'lat': 0.0, 'lng': 0.0,
        'vlg': collections.Counter(), 'wal': collections.Counter(),
        'gemeente': collections.Counter(), 'regio': collections.Counter(),
    })
    gemeenten = {}
    for regio, url in BEST_BRONNEN.items():
        z = zipfile.ZipFile(haal(url, cache))
        with z.open(z.infolist()[0]) as f:
            for rij in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8')):
                if rij['status'] != 'current':
                    continue
                pc = rij['postcode'].strip()
                if not re.fullmatch(r'[1-9]\d{3}', pc):
                    continue
                try:
                    lat = float(rij['EPSG:4326_lat'])
                    lng = float(rij['EPSG:4326_lon'])
                except ValueError:
                    continue
                a = agg[pc]
                a['n'] += 1
                a['lat'] += lat
                a['lng'] += lng
                nis = rij['municipality_id']
                a['gemeente'][nis] += 1
                a['regio'][regio] += 1
                gemeenten.setdefault(nis, {
                    'nl': rij['municipality_name_nl'],
                    'fr': rij['municipality_name_fr'],
                    'de': rij['municipality_name_de'],
                })
                if rij['postname_nl']:
                    a['vlg'][rij['postname_nl']] += 1
                elif rij['postname_fr']:
                    a['wal'][(rij['postname_fr'], nis)] += 1
                else:
                    a['wal'][('', nis)] += 1

    postcodes = {}
    for pc in sorted(agg):
        a = agg[pc]
        hoofd_nis = a['gemeente'].most_common(1)[0][0]
        g = gemeenten[hoofd_nis]
        namen_gemeente = [g['nl'], g['fr'], g['de']]
        plaatsen = []

        def voeg(p):
            if p and p not in plaatsen:
                plaatsen.append(p)

        for extra in AANVULLING.get(pc, []):
            voeg(extra)

        if a['vlg']:
            # Een lijst per postcode; de hoofdplaats (in hoofdletters) vooraan.
            lijst = a['vlg'].most_common(1)[0][0].split('/')
            hoofd = [x for x in lijst if x == x.upper()]
            rest = [x for x in lijst if x != x.upper()]
            for ruw in hoofd + rest:
                voeg(poets(herstel_hoofdletters(ruw.strip(), namen_gemeente)))
        else:
            # Brussel, Duitstalige Gemeenschap en Wallonie, per adres geteld.
            telling = collections.Counter()
            for (naam, nis), n in a['wal'].items():
                telling[(naam, nis)] += n
            geordend = sorted(telling.items(), key=lambda kv: (-kv[1], kv[0][0]))
            for (naam, nis), n in geordend:
                gm = gemeenten[nis]
                if naam:
                    if n < MIN_ADRESSEN and naam.upper() != (gm['fr'] or '').upper() and plaatsen:
                        continue
                    voeg(poets(herstel_hoofdletters(naam, [gm['fr'], gm['nl'], gm['de']])))
                elif nis.startswith('21'):
                    voeg({'nl': gm['nl'], 'fr': gm['fr']})
                elif gm['de']:
                    voeg({'de': gm['de'], 'fr': gm['fr']} if gm['fr'] and gm['fr'] != gm['de'] else gm['de'])
                else:
                    voeg(gm['fr'] or gm['nl'])
            # De hoofdplaats vooraan: de plaats met de naam van de gemeente.
            for i, p in enumerate(plaatsen):
                if isinstance(p, str) and p.upper() in {x.upper() for x in namen_gemeente if x}:
                    plaatsen.insert(0, plaatsen.pop(i))
                    break

        postcodes[pc] = {
            'c': [round(a['lat'] / a['n'], 4), round(a['lng'] / a['n'], 4)],
            'p': plaatsen,
            'g': hoofd_nis,
            'a': a['n'],
        }

    gebruikt = {v['g'] for v in postcodes.values()}
    gem_uit = {}
    for nis in sorted(gebruikt):
        g = gemeenten[nis]
        eigen = g['nl'] if not nis.startswith(('5', '6', '8', '9', '25')) else (g['fr'] or g['nl'])
        if nis.startswith('63') and g['de']:
            eigen = g['de']
        rij = {'n': eigen, 'pr': provincie_be(nis)}
        for taal in ('nl', 'fr', 'de'):
            if g[taal] and g[taal] != eigen:
                rij[taal] = g[taal]
        gem_uit[nis] = rij
    return postcodes, gem_uit


def bouw_nl(cache):
    z = zipfile.ZipFile(haal(GEONAMES_NL, cache))
    regels = z.read('NL.txt').decode('utf-8').splitlines()
    agg = collections.defaultdict(lambda: {'n': 0, 'lat': 0.0, 'lng': 0.0, 'p': [], 'g': collections.Counter()})
    gemeenten = {}
    for regel in regels:
        d = regel.split('\t')
        pc, plaats, prov_code, gem_naam, gem_code = d[1], d[2], d[4], d[5], d[6]
        if not re.fullmatch(r'[1-9]\d{3}', pc):
            continue
        a = agg[pc]
        try:
            a['lat'] += float(d[9])
            a['lng'] += float(d[10])
            a['n'] += 1
        except ValueError:
            pass
        if plaats and plaats not in a['p']:
            a['p'].append(plaats)
        naam = re.sub(r'^Gemeente\s+|\s+Municipality$', '', gem_naam).strip()
        code = gem_code or naam
        a['g'][code] += 1
        gemeenten.setdefault(code, {'n': naam, 'pr': PROVINCIES_NL.get(prov_code, '')})
    postcodes = {}
    for pc in sorted(agg):
        a = agg[pc]
        if not a['n']:
            continue
        postcodes[pc] = {
            'c': [round(a['lat'] / a['n'], 4), round(a['lng'] / a['n'], 4)],
            'p': a['p'],
            'g': a['g'].most_common(1)[0][0],
        }
    gebruikt = {v['g'] for v in postcodes.values()}
    return postcodes, {k: v for k, v in sorted(gemeenten.items()) if k in gebruikt}


def schrijf(land, postcodes, gemeenten, bron, licentie, stand):
    os.makedirs(DOEL, exist_ok=True)
    pad = os.path.join(DOEL, land.lower() + '.js')
    regels = [
        '// GEGENEREERD door scripts/postcodes/build-postcodes.py -- niet met de hand bewerken.',
        '// Bron: %s (%s). Stand: %s.' % (bron, licentie, stand),
        '//',
        '// p = plaatsen (string, of {taal: naam} waar een plaats officieel meertalig is),',
        '// c = [lat, lng] zwaartepunt, g = gemeentecode, a = aantal adressen (enkel BE).',
        'export default {',
        '  land: %s,' % json.dumps(land),
        '  stand: %s,' % json.dumps(stand),
        '  bron: %s,' % json.dumps(bron, ensure_ascii=False),
        '  licentie: %s,' % json.dumps(licentie),
        '  postcodes: {',
    ]
    for pc, v in postcodes.items():
        regels.append('    %s: %s,' % (json.dumps(pc), json.dumps(v, ensure_ascii=False, separators=(',', ':'))))
    regels.append('  },')
    regels.append('  gemeenten: {')
    for code, v in gemeenten.items():
        regels.append('    %s: %s,' % (json.dumps(code), json.dumps(v, ensure_ascii=False, separators=(',', ':'))))
    regels.append('  },')
    regels.append('};')
    inhoud = '\n'.join(regels) + '\n'
    with open(pad, 'w', encoding='utf-8', newline='\n') as f:
        f.write(inhoud)
    print('%s: %d postcodes, %d gemeenten -> %s (%d kB)' % (
        land, len(postcodes), len(gemeenten), os.path.relpath(pad, WORTEL), len(inhoud.encode('utf-8')) // 1024))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', help='map met (of voor) de gedownloade zips')
    args = ap.parse_args()
    cache = args.cache or os.path.join(tempfile.gettempdir(), 'om-postcodes')
    os.makedirs(cache, exist_ok=True)
    stand = datetime.date.today().isoformat()

    be, be_gem = bouw_be(cache)
    schrijf('BE', be, be_gem, 'FOD BOSA, BeST Address (openaddress-be*.zip)', 'CC BY 4.0', stand)
    nl, nl_gem = bouw_nl(cache)
    schrijf('NL', nl, nl_gem, 'GeoNames postal codes (NL.zip)', 'CC BY 4.0', stand)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
