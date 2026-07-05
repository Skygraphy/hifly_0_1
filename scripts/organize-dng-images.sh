#!/usr/bin/env bash
# Verschiebt jede *.dng-Datei in einem Verzeichnis in einen eigenen Ordner
# (benannt nach dem ursprünglichen Dateinamen ohne Endung) und benennt sie
# dabei in original.dng um.
#
# Usage: ./organize-dng-images.sh /pfad/zum/bilder-ordner
set -euo pipefail

target="${1:?Usage: $0 <verzeichnis>}"
cd "$target"

error_log="$(mktemp)"
ok=0
fail=0

find . -maxdepth 1 -type f -name "*.dng" -print0 | while IFS= read -r -d '' f; do
  base="${f%.dng}"
  base="${base#./}"
  if mkdir "$base" 2>>"$error_log" && mv "$f" "$base/original.dng" 2>>"$error_log"; then
    echo OK
  else
    echo "FAIL: $f" >> "$error_log"
    echo FAIL
  fi
done | sort | uniq -c

echo "--- Fehler ---"
cat "$error_log"
