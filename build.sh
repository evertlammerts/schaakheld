#!/bin/sh
# Bouwt twee bestanden uit src/:
#  - index.html: standalone pagina met doctype, viewport en PWA-tags, voor
#    GitHub Pages. Werkt samen met sw.js en manifest.webmanifest offline.
#  - sw.js: service worker uit src/sw.js, met een hash van index.html als
#    cacheversie. Zo krijgt elke release vanzelf een verse cache.
# Met een map als argument komen beide daar terecht in plaats van naast dit
# script (de compatibiliteitspoort vergelijkt zo de build met src/).
set -e
OUT=$(cd "${1:-$(dirname "$0")}" && pwd)
cd "$(dirname "$0")"
n=$(grep -n '</style>' src/head.html | head -1 | cut -d: -f1)
{
  printf '<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  printf '<link rel="manifest" href="manifest.webmanifest">\n'
  printf '<meta name="theme-color" content="#BCE4F6">\n'
  printf '<link rel="icon" href="icon-192.png">\n'
  printf '<link rel="apple-touch-icon" href="icon-180.png">\n'
  printf '<meta name="apple-mobile-web-app-capable" content="yes">\n'
  printf '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
  printf '<meta name="apple-mobile-web-app-title" content="SchaakHeld">\n'
  head -n "$n" src/head.html
  printf '</head>\n<body>\n'
  tail -n +"$((n + 1))" src/head.html
  cat src/engine.js src/koning.js src/words.js src/qr.js src/jsqr.js src/tail.html
  printf '</body>\n</html>\n'
} > "$OUT/index.html"
HASH=$(shasum "$OUT/index.html" | cut -c1-12)
sed "s/__VERSION__/$HASH/" src/sw.js > "$OUT/sw.js"
echo "gebouwd: index.html ($(wc -c < "$OUT/index.html" | tr -d ' ') bytes) en sw.js (versie $HASH)"
