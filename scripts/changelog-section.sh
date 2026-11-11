#!/bin/sh
# Vypíše záznam verze z CHANGELOG.md (bez nadpisu): sh scripts/changelog-section.sh 1.0.0
# Bez záznamu skončí chybou – vydání bez changelogu neprojde.
set -eu
version="$1"
file="${2:-CHANGELOG.md}"
notes=$(awk -v v="$version" '
  index($0, "## " v " ") == 1 || $0 == "## " v { on = 1; next }
  on && /^## / { exit }
  on { print }
' "$file")
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "V $file chybí záznam „## ${version}“." >&2
  exit 1
fi
printf '%s\n' "$notes" | sed -e '/./,$!d'
