#!/usr/bin/env bash
#
# De mymmo-cards-plugin bouwen.
#
#   bash wp-plugin/build-mymmo-cards.sh 1.0.1
#
# Waarom een script en niet met de hand: het versienummer staat op twee plekken
# en de constante bepaalt de cache-busting van CSS en JS. Staat die op een oude
# waarde, dan draait een bezoeker met de nieuwe plugin op de oude stylesheet --
# en dat leest als "mijn wijziging doet niets".
#
# Volgt verder de procedure uit CLAUDE.md: bouwen in een SCHONE kopie, nooit
# in-place, geen edit_*.py-restanten in de zip, en oudere zips blijven staan.
#
# Sinds 1.9.0 is er ook geen zip zonder groene HUISSTIJLCONTROLE en een REVIEW
# voor precies deze code (wp-plugin/huisstijl/controleer.mjs --bouw). Het
# regelboek: wp-plugin/mymmo-cards/CLAUDE.md.

set -euo pipefail

VERSIE="${1:-}"
if [[ -z "$VERSIE" ]]; then
  echo "Gebruik: bash wp-plugin/build-mymmo-cards.sh <versie>   (bv. 1.0.1)" >&2
  exit 1
fi

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$WORTEL/wp-plugin/mymmo-cards"
BOUW="${TMPDIR:-/tmp}/mymmo-cards-build"

# ── 1. Versienummer controleren: het staat op TWEE plekken ──────────────────
DOCBLOCK="$(grep -m1 '^ \* Version:' "$PLUGIN/mymmo-cards.php" | sed 's/.*Version: *//' | tr -d ' \r')"
CONSTANTE="$(grep -m1 "define('MYMMO_CARDS_VERSION'" "$PLUGIN/mymmo-cards.php" | sed "s/.*'\\([0-9.]*\\)'.*/\\1/")"

if [[ "$DOCBLOCK" != "$VERSIE" || "$CONSTANTE" != "$VERSIE" ]]; then
  echo "Versie klopt niet met mymmo-cards.php:" >&2
  echo "  docblock : $DOCBLOCK" >&2
  echo "  constante: $CONSTANTE" >&2
  echo "  gevraagd : $VERSIE" >&2
  echo "Beide moeten gelijk staan -- de constante bepaalt de cache-busting van CSS/JS." >&2
  exit 1
fi

# ── 1b. De huisstijl: controle en review ────────────────────────────────────
# Niet overslaan en niet "even" uitzetten: dit is de plek waar een designfout
# wordt tegengehouden voor ze op een site staat. Is een regel fout, dan wordt
# de REGEL aangepast (met Nico), niet het component eromheen gebouwd.
if ! command -v node >/dev/null 2>&1; then
  echo "Node ontbreekt: de huisstijlcontrole kan niet draaien, dus er komt geen zip." >&2
  exit 1
fi
if ! node "$WORTEL/wp-plugin/huisstijl/controleer.mjs" --bouw; then
  echo "" >&2
  echo "Geen zip: de huisstijlcontrole of de review is niet in orde (zie hierboven)." >&2
  exit 1
fi

# ── 2. Schone kopie, nooit in-place ─────────────────────────────────────────
rm -rf "$BOUW"
mkdir -p "$BOUW"
cp -r "$PLUGIN" "$BOUW/mymmo-cards"
find "$BOUW/mymmo-cards" -iname "edit_*.py*" -o -iname "*.bak" | xargs -r rm -f
# Het regelboek is voor wie bouwt, niet voor de site.
rm -f "$BOUW/mymmo-cards/CLAUDE.md"

# zip/unzip zitten niet in elke omgeving -- Git Bash op Windows levert ze niet
# mee. Python wel, en zipfile maakt een gewone zip die WordPress aanneemt. De
# controle op edit_*-restanten hoort in BEIDE takken thuis: die is er niet voor
# de netheid, maar om te vermijden dat een bewerkingsscript meegaat naar een
# live site.
if command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  ( cd "$BOUW" && zip -r -q "mymmo-cards-$VERSIE.zip" mymmo-cards )

  RESTANTEN="$(unzip -l "$BOUW/mymmo-cards-$VERSIE.zip" | grep -c "edit_" || true)"
  if [[ "$RESTANTEN" != "0" ]]; then
    echo "Er zitten edit_*-bestanden in de zip -- niet uitgeleverd." >&2
    exit 1
  fi
else
  # Niet op bestaan testen maar op WERKEN: Windows zet een doorverwijzing naar
  # de Microsoft Store op de naam python3.exe. command -v vindt die, maar hij
  # draait niets -- hij drukt "Python was not found" af en stopt.
  PY=""
  for KANDIDAAT in python3 python py; do
    if command -v "$KANDIDAAT" >/dev/null 2>&1 && "$KANDIDAAT" -c "import zipfile" >/dev/null 2>&1; then
      PY="$KANDIDAAT"
      break
    fi
  done
  if [[ -z "$PY" ]]; then
    echo "Noch zip noch een werkende python gevonden -- kan de zip niet maken." >&2
    exit 1
  fi
  "$PY" - "$BOUW" "$VERSIE" <<'PYEOF'
import os, sys, zipfile

bouw, versie = sys.argv[1], sys.argv[2]
doel = os.path.join(bouw, 'mymmo-cards-%s.zip' % versie)
wortel = os.path.join(bouw, 'mymmo-cards')

namen = []
with zipfile.ZipFile(doel, 'w', zipfile.ZIP_DEFLATED) as zf:
    for map_, _, bestanden in os.walk(wortel):
        for naam in sorted(bestanden):
            vol = os.path.join(map_, naam)
            # Voorwaartse schuine strepen: een zip met backslashes pakt op een
            # Linux-server uit als een bestand met een rare naam.
            arc = os.path.relpath(vol, bouw).replace(os.sep, '/')
            namen.append(arc)
            zf.write(vol, arc)

restanten = [n for n in namen if 'edit_' in os.path.basename(n)]
if restanten:
    sys.stderr.write('Er zitten edit_*-bestanden in de zip -- niet uitgeleverd: %s\n' % restanten)
    os.remove(doel)
    sys.exit(1)
print('%d bestanden ingepakt' % len(namen))
PYEOF
fi

# ── 3. Naast de bestaande zips zetten, nooit eroverheen ─────────────────────
DOEL="$WORTEL/wp-plugin/mymmo-cards-$VERSIE.zip"
if [[ -e "$DOEL" ]]; then
  echo "$DOEL bestaat al. Oudere zips blijven bewust staan; hoog het versienummer op." >&2
  exit 1
fi
cp "$BOUW/mymmo-cards-$VERSIE.zip" "$DOEL"

echo "klaar: wp-plugin/mymmo-cards-$VERSIE.zip"
if command -v unzip >/dev/null 2>&1; then
  unzip -l "$DOEL" | tail -3
else
  ls -l "$DOEL"
fi
