#!/bin/sh
# Bouwt twee varianten uit src/:
#  - index.html: standalone pagina met doctype en viewport, o.a. voor GitHub Pages.
#  - artifact.html: kale concat zonder doctype, voor publicatie als Claude-artifact
#    (de artifact-runtime voegt zelf het html/head/body-skelet toe).
set -e
cd "$(dirname "$0")"
n=$(grep -n '</style>' src/head.html | head -1 | cut -d: -f1)
{
  printf '<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  head -n "$n" src/head.html
  printf '</head>\n<body>\n'
  tail -n +"$((n + 1))" src/head.html
  cat src/engine.js src/tail.html
  printf '</body>\n</html>\n'
} > index.html
cat src/head.html src/engine.js src/tail.html > artifact.html
echo "gebouwd: index.html ($(wc -c < index.html | tr -d ' ') bytes) en artifact.html"
