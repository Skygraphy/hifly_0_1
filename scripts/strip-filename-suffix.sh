#!/usr/bin/env bash
# Entfernt einen Suffix aus allen Dateinamen (vor der Endung) in einem Verzeichnis.
#
# Usage: ./strip-filename-suffix.sh <verzeichnis> <suffix> [endung]
# Beispiel: ./strip-filename-suffix.sh /g/HiFly/images/preview _result jpg
set -euo pipefail

dir="${1:?Usage: $0 <verzeichnis> <suffix> [endung]}"
suffix="${2:?Usage: $0 <verzeichnis> <suffix> [endung]}"
ext="${3:-jpg}"

error_log="$(mktemp)"

find "$dir" -maxdepth 1 -type f -iname "*.${ext}" -print0 | while IFS= read -r -d '' f; do
  filename="$(basename "$f")"
  base="${filename%.*}"
  extension="${filename##*.}"
  if [[ "$base" != *"$suffix" ]]; then
    echo SKIP
    continue
  fi
  new_base="${base%$suffix}"
  new_path="$(dirname "$f")/${new_base}.${extension}"
  if mv "$f" "$new_path" 2>>"$error_log"; then
    echo OK
  else
    echo "FAIL: $filename" >> "$error_log"
    echo FAIL
  fi
done | sort | uniq -c

echo "--- Fehler ---"
cat "$error_log"
