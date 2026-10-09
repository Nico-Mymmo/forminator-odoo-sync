#!/usr/bin/env bash
#
# De STEMPEL na een goede huisstijlreview (/huisstijl-review in Claude Code).
#
#   bash wp-plugin/huisstijl/stempel.sh "wat er nagekeken is en wat de bevindingen waren"
#
# Enkel git en bash nodig -- geen Node, geen Python. Wie een component bedenkt,
# heeft die niet, en hoeft ze ook niet te hebben: de huisstijlcontrole zelf
# draait op GitHub na het pushen (.github/workflows/huisstijl.yml).
#
# De stempel (wp-plugin/mymmo-cards.review.json) hoort bij PRECIES deze code:
# de vingerafdruk is die van de werkboom, inclusief wat nog niet gecommit is.
# Wie daarna nog iets aan de plugin wijzigt, moet opnieuw door de review.
#
# DE VINGERAFDRUK STAAT OOK IN controleer.mjs (vingerafdruk()). Wijzig ze
# SAMEN: lopen ze uiteen, dan past geen enkele stempel nog en is elke push rood.
# Per codebestand "<blob-id>\t<pad>", gesorteerd op pad, en daarvan de git-hash
# (eerste 16 tekens). README en CLAUDE.md tellen niet mee.
#
# Dit bestand staat onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.

set -euo pipefail

SAMENVATTING="${1:-}"
if [ "${#SAMENVATTING}" -lt 20 ]; then
  echo "Geen stempel: geef een samenvatting van de review mee (wat er nagekeken is en wat de bevindingen waren)." >&2
  exit 1
fi

WORTEL="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$WORTEL"

MAP="wp-plugin/mymmo-cards"
TAB="$(printf '\t')"

# Een tijdelijke index in de git-map (relatief pad: werkt ook in Git Bash op
# Windows, waar een /tmp-pad niet altijd tot bij git.exe geraakt).
INDEX="$(git rev-parse --git-dir)/mymmo-afdruk-$$.index"
trap 'rm -f "$INDEX"' EXIT

GIT_INDEX_FILE="$INDEX" git read-tree HEAD
GIT_INDEX_FILE="$INDEX" git add -A -- "$MAP" 2>/dev/null

# "<mode> <id> <stage>\t<pad>"  ->  "<id>\t<pad>"
AFDRUK="$(GIT_INDEX_FILE="$INDEX" git ls-files -s -- "$MAP" \
  | awk -F'\t' '{ split($1, kop, " "); print kop[2] "\t" $2 }' \
  | grep -E '\.(php|js|css|svg|json|html)$' \
  | LC_ALL=C sort -t "$TAB" -k2,2 \
  | git hash-object --stdin \
  | cut -c1-16)"

VERSIE="$(grep -m1 '^ \* Version:' "$MAP/mymmo-cards.php" | sed 's/.*Version: *//' | tr -d ' \r')"
DATUM="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
DOOR="$(git config user.name 2>/dev/null || true)"
DOOR="${DOOR:-onbekend}"

json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\r'/}"
  s="${s//$'\n'/ }"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}

{
  printf '{\n'
  printf '  "plugin": "mymmo-cards",\n'
  printf '  "versie": %s,\n' "$(json "$VERSIE")"
  printf '  "hash": "%s",\n' "$AFDRUK"
  printf '  "datum": "%s",\n' "$DATUM"
  printf '  "door": %s,\n' "$(json "$DOOR")"
  printf '  "samenvatting": %s\n' "$(json "$SAMENVATTING")"
  printf '}\n'
} > wp-plugin/mymmo-cards.review.json

echo "Stempel gezet: wp-plugin/mymmo-cards.review.json ($AFDRUK, versie $VERSIE)."
echo "Commit hem SAMEN met de code; de controle draait op GitHub na het pushen."
