#!/usr/bin/env bash
#
# De mymmo-forms-plugin bouwen.
#
#   bash wp-plugin/build-mymmo-forms.sh 1.0.1
#
# Waarom een script en niet met de hand: public/mymmo-forms.css is de ENIGE
# bron van de formulier-stylesheet. De Operations Manager heeft hem daar nodig
# voor het voorbeeld in de bouwer (dat voorbeeld staat in een iframe met precies
# deze CSS, zodat het niet kan liegen), en de plugin heeft er een kopie van
# nodig. Die kopie wordt hier gemaakt, niet met de hand bijgehouden -- anders
# lopen ze uit elkaar en toont de bouwer iets anders dan de bezoeker ziet.
#
# Volgt verder de procedure uit CLAUDE.md: bouwen in een SCHONE kopie, nooit
# in-place, geen edit_*.py-restanten in de zip, en oudere zips blijven staan.

set -euo pipefail

VERSIE="${1:-}"
if [[ -z "$VERSIE" ]]; then
  echo "Gebruik: bash wp-plugin/build-mymmo-forms.sh <versie>   (bv. 1.0.1)" >&2
  exit 1
fi

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$WORTEL/wp-plugin/mymmo-forms"
BOUW="${TMPDIR:-/tmp}/mymmo-forms-build"

# ── 1. Versienummer controleren: het staat op TWEE plekken ──────────────────
DOCBLOCK="$(grep -m1 '^ \* Version:' "$PLUGIN/mymmo-forms.php" | sed 's/.*Version: *//' | tr -d ' \r')"
CONSTANTE="$(grep -m1 "define('MYMMO_FORMS_VERSION'" "$PLUGIN/mymmo-forms.php" | sed "s/.*'\\([0-9.]*\\)'.*/\\1/")"

if [[ "$DOCBLOCK" != "$VERSIE" || "$CONSTANTE" != "$VERSIE" ]]; then
  echo "Versie klopt niet met mymmo-forms.php:" >&2
  echo "  docblock : $DOCBLOCK" >&2
  echo "  constante: $CONSTANTE" >&2
  echo "  gevraagd : $VERSIE" >&2
  echo "Beide moeten gelijk staan -- de constante bepaalt de cache-busting van CSS/JS." >&2
  exit 1
fi

# ── 2. De stylesheet uit public/ halen ──────────────────────────────────────
cp "$WORTEL/public/mymmo-forms.css" "$PLUGIN/assets/css/mymmo-forms.css"
echo "stylesheet gekopieerd uit public/mymmo-forms.css"

# ── 3. Schone kopie, nooit in-place ─────────────────────────────────────────
rm -rf "$BOUW"
mkdir -p "$BOUW"
cp -r "$PLUGIN" "$BOUW/mymmo-forms"
find "$BOUW/mymmo-forms" -iname "edit_*.py*" -o -iname "*.bak" | xargs -r rm -f

# zip/unzip zitten niet in elke omgeving -- Git Bash op Windows levert ze niet
# mee. Python wel, en zipfile maakt een gewone zip die WordPress aanneemt. De
# controle op edit_*-restanten hoort in BEIDE takken thuis: die is er niet voor
# de netheid, maar om te vermijden dat een bewerkingsscript meegaat naar een
# live site.
if command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  ( cd "$BOUW" && zip -r -q "mymmo-forms-$VERSIE.zip" mymmo-forms )

  RESTANTEN="$(unzip -l "$BOUW/mymmo-forms-$VERSIE.zip" | grep -c "edit_" || true)"
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
doel = os.path.join(bouw, 'mymmo-forms-%s.zip' % versie)
wortel = os.path.join(bouw, 'mymmo-forms')

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

# ── 4. Naast de bestaande zips zetten, nooit eroverheen ─────────────────────
DOEL="$WORTEL/wp-plugin/mymmo-forms-$VERSIE.zip"
if [[ -e "$DOEL" ]]; then
  echo "$DOEL bestaat al. Oudere zips blijven bewust staan; hoog het versienummer op." >&2
  exit 1
fi
cp "$BOUW/mymmo-forms-$VERSIE.zip" "$DOEL"

echo "klaar: wp-plugin/mymmo-forms-$VERSIE.zip"
if command -v unzip >/dev/null 2>&1; then
  unzip -l "$DOEL" | tail -3
else
  ls -l "$DOEL"
fi
