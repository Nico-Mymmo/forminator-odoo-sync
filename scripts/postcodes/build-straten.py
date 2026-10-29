"""
Straatnamen per postcode, voor het veld "Straat en huisnummer" van de
OM-formulieren.

    python scripts/postcodes/build-straten.py --cache D            # schrijft D/straten-be.sql
    npx wrangler d1 execute om-core --remote --file D/straten-be.sql

Bron: FOD BOSA, BeST Address (CC BY 4.0), dezelfde drie bestanden als
build-postcodes.py (openaddress-bebru/bevlg/bewal.zip). --cache wijst naar de
map waar ze al staan; anders worden ze gedownload (~230 MB).

Wat er in de tabel `straten` (D1 om-core, migratie 0016) komt: per postcode
een lijst straten, de drukste eerst (meeste adressen). Een straat met EEN
officiele naam is een tekst; in Brussel en op de taalgrens staat ze er in
meerdere talen als {nl, fr} of {de, fr}. Enkel adressen met status "current".

Waarom niet als module in de Worker zoals de postcodes: ~70.000 straten zijn
een paar MB, en een formulier heeft er telkens maar die van EEN postcode
nodig. De tabel is GEGENEREERD: wijzig niets met de hand, draai dit script
opnieuw (het vervangt elke postcode volledig).
"""

import argparse
import collections
import csv
import io
import json
import os
import urllib.request
import zipfile

BRONNEN = {
    'bru': 'https://opendata.bosa.be/download/best/openaddress-bebru.zip',
    'vlg': 'https://opendata.bosa.be/download/best/openaddress-bevlg.zip',
    'wal': 'https://opendata.bosa.be/download/best/openaddress-bewal.zip',
}

# Een postcode per INSERT: D1 weigert te lange statements (SQLITE_TOOBIG).
PER_INSERT = 1


def haal(url, cache):
    pad = os.path.join(cache, os.path.basename(url))
    if not os.path.exists(pad):
        print('downloaden:', url)
        urllib.request.urlretrieve(url, pad)
    return pad


def bouw(cache):
    # postcode -> street_id -> {'n': adressen, 'namen': (nl, fr, de)}
    per_pc = collections.defaultdict(dict)
    for url in BRONNEN.values():
        z = zipfile.ZipFile(haal(url, cache))
        with z.open(z.infolist()[0]) as f:
            for rij in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8')):
                if rij['status'] != 'current':
                    continue
                pc = rij['postcode'].strip()
                if len(pc) != 4 or not pc.isdigit():
                    continue
                namen = tuple(rij['streetname_' + t].strip() for t in ('nl', 'fr', 'de'))
                if not any(namen):
                    continue
                sleutel = rij['street_id'] or '|'.join(namen)
                s = per_pc[pc].get(sleutel)
                if s is None:
                    per_pc[pc][sleutel] = {'n': 1, 'namen': namen}
                else:
                    s['n'] += 1

    uit = {}
    for pc in sorted(per_pc):
        lijst = []
        gezien = set()
        for s in sorted(per_pc[pc].values(), key=lambda s: (-s['n'], s['namen'])):
            nl, fr, de = s['namen']
            talen = {t: v for t, v in (('nl', nl), ('fr', fr), ('de', de)) if v}
            verschillend = set(talen.values())
            item = next(iter(verschillend)) if len(verschillend) == 1 else talen
            sleutel = json.dumps(item, sort_keys=True, ensure_ascii=False)
            if sleutel in gezien:
                continue
            gezien.add(sleutel)
            lijst.append(item)
        uit[pc] = lijst
    return uit


def sql_tekst(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True, help='map met (of voor) de BeST-zips; daar komt ook de SQL')
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    straten = bouw(args.cache)
    regels = []
    rijen = list(straten.items())
    for i in range(0, len(rijen), PER_INSERT):
        waarden = ',\n'.join(
            '(' + ', '.join([sql_tekst('BE'), sql_tekst(pc), sql_tekst(json.dumps(lijst, ensure_ascii=False, separators=(',', ':'))), str(len(lijst))]) + ')'
            for pc, lijst in rijen[i:i + PER_INSERT]
        )
        regels.append('INSERT OR REPLACE INTO straten (land, postcode, namen, aantal) VALUES\n' + waarden + ';')

    pad = os.path.join(args.cache, 'straten-be.sql')
    with open(pad, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(regels) + '\n')
    totaal = sum(len(v) for v in straten.values())
    print(f'{len(straten)} postcodes, {totaal} straten -> {pad} ({os.path.getsize(pad) // 1024} kB)')


if __name__ == '__main__':
    main()
