#!/usr/bin/env bash
# Kopiert jedes Bild aus einem Quellordner (z.B. G:\HiFly\images\large) in den
# gleichnamigen Unterordner unter dem Zielverzeichnis (z.B. G:\HiFly\images\klosterneuburg_stadt/<name>/)
# und benennt es dabei nach dem übergebenen Variantennamen (z.B. large.jpg).
#
# Optional 4. Argument: Suffix, das vom Dateinamen entfernt wird, bevor der
# Zielordner ermittelt wird (z.B. "_result", falls die Quelldateien anders
# heißen als die Zielordner).
#
# Usage: ./copy-image-variants.sh <quellordner> <zielbasisordner> <zieldateiname> [suffix]
# Beispiel: ./copy-image-variants.sh /g/HiFly/images/large /g/HiFly/images/klosterneuburg_stadt large.jpg
# Beispiel mit Suffix: ./copy-image-variants.sh /g/HiFly/images/preview /g/HiFly/images/klosterneuburg_stadt preview.jpg _result
set -euo pipefail

src="${1:?Usage: $0 <quellordner> <zielbasisordner> <zieldateiname> [suffix]}"
dest_base="${2:?Usage: $0 <quellordner> <zielbasisordner> <zieldateiname> [suffix]}"
dest_name="${3:?Usage: $0 <quellordner> <zielbasisordner> <zieldateiname> [suffix]}"
strip_suffix="${4:-}"

error_log="$(mktemp)"

find "$src" -maxdepth 1 -type f -iname "*.jpg" -print0 | while IFS= read -r -d '' f; do
  filename="$(basename "$f")"
  base="${filename%.*}"
  if [ -n "$strip_suffix" ]; then
    base="${base%$strip_suffix}"
  fi
  target_dir="$dest_base/$base"
  if [ ! -d "$target_dir" ]; then
    echo "FAIL: Zielordner fehlt für $filename ($target_dir)" >> "$error_log"
    echo FAIL
    continue
  fi
  if cp "$f" "$target_dir/$dest_name" 2>>"$error_log"; then
    echo OK
  else
    echo "FAIL: cp fehlgeschlagen für $filename" >> "$error_log"
    echo FAIL
  fi
done | sort | uniq -c

echo "--- Fehler ---"
cat "$error_log"
