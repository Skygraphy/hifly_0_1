#!/usr/bin/env bash
# Benennt alle Dateien "thumbs.jpg" (case-insensitive) rekursiv in einem
# Verzeichnis zu "thumb.jpg" um — überspringt eine Datei, wenn im selben
# Ordner bereits eine thumb.jpg liegt (kein Überschreiben ohne Rückfrage).
#
# Usage: ./rename-thumbs-to-thumb.sh <verzeichnis>
# Beispiel: ./rename-thumbs-to-thumb.sh /g/HiFly/images/klosterneuburg_stadt
set -euo pipefail

dir="${1:?Usage: $0 <verzeichnis>}"

error_log="$(mktemp)"
skipped_log="$(mktemp)"

find "$dir" -type f -iname "thumbs.jpg" -print0 | while IFS= read -r -d '' f; do
  target="$(dirname "$f")/thumb.jpg"
  if [[ -e "$target" ]]; then
    echo "$f" >> "$skipped_log"
    echo SKIP
    continue
  fi
  if mv "$f" "$target" 2>>"$error_log"; then
    echo OK
  else
    echo "FAIL: $f" >> "$error_log"
    echo FAIL
  fi
done | sort | uniq -c

echo "--- Übersprungen (thumb.jpg existiert im selben Ordner bereits) ---"
cat "$skipped_log"
echo "--- Fehler ---"
cat "$error_log"
