#!/bin/sh
# Bouwt drie bestanden uit src/:
#  - index.html: standalone pagina met doctype, viewport en PWA-tags, voor
#    GitHub Pages. Werkt samen met sw.js en manifest.webmanifest offline.
#  - artifact.html: kale concat zonder doctype, voor publicatie als
#    Claude-artifact (de artifact-runtime voegt zelf het skelet toe).
#  - sw.js: service worker uit src/sw.js, met een hash van index.html als
#    cacheversie. Zo krijgt elke release vanzelf een verse cache.
set -e
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
  cat src/engine.js src/tail.html
  printf '</body>\n</html>\n'
} > index.html
cat src/head.html src/engine.js src/tail.html > artifact.html
HASH=$(shasum index.html | cut -c1-12)
sed "s/__VERSION__/$HASH/" src/sw.js > sw.js
echo "gebouwd: index.html ($(wc -c < index.html | tr -d ' ') bytes), artifact.html en sw.js (versie $HASH)"
