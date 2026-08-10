# SchaakHeld: werkafspraken

## Wat dit is

Nederlandstalige schaaktrainer voor Oscar (9), single-file webapp. Zie
README.md voor de spelvormen en de opbouw.

## Bouwen

- `./build.sh` bouwt uit `src/` drie bestanden:
  - `index.html`: standalone met doctype, viewport en PWA-tags (GitHub
    Pages).
  - `artifact.html`: kale concat voor het Claude-artifact. De
    artifact-runtime voegt zelf doctype/head/body toe, dus dit bestand mag
    die niet bevatten.
  - `sw.js`: service worker uit `src/sw.js`. De cacheversie is een hash
    van `index.html`, dus een vergeten versie-bump bestaat niet. Wel na
    elke src-wijziging opnieuw bouwen en de gegenereerde bestanden mee
    committen, anders serveert Pages een oude cacheversie.
- Bewerk nooit `index.html`, `artifact.html` of `sw.js` direct. Altijd
  `src/` aanpassen en opnieuw bouwen.
- App-iconen komen uit `tools/make-icons.py` (pure stdlib, reproduceerbaar);
  gegenereerde PNG's staan in de repo-root en worden meegecommit.

## Testen

- `./test.sh` draait alles headless onder jsc. Beide suites moeten groen
  zijn voor elke wijziging telt als af.
- Engine-wijzigingen: perft-counts in `test/test-engine.js` zijn heilig.
  Nooit een verwachte count aanpassen om een test groen te krijgen.
- UI-wijzigingen: voeg een flowtest toe in `test/flow-test.js` die het
  nieuwe gedrag naspeelt op de DOM-shim.

## Artifact publiceren

Het gepubliceerde artifact staat op
https://claude.ai/code/artifact/163c5374-5a4e-4964-b39a-ffbb597ea657.
Opnieuw publiceren: bouw `artifact.html`, publiceer via de Artifact-tool met
de artifact-URL als `url`-parameter (vanuit een nieuwe sessie is die
parameter verplicht, anders ontstaat een nieuwe URL). Favicon: 🐢.

## Stijl

- Alle tekst die Oscar ziet is Nederlands, korte zinnen, vrolijk, nooit
  straffend. Fouten krijgen altijd uitleg (wie valt aan, wie verdedigt,
  waarom een ruil wel of niet gunstig is).
- Puntentaal consistent houden: pion 1, paard 3, loper 3, toren 5, dame 9.
- Geen externe dependencies, geen CDN's, geen webfonts. Het artifact draait
  achter een strikte CSP; alles blijft inline.
