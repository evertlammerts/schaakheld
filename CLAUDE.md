# SchaakHeld: werkafspraken

## Wat dit is

Nederlandstalige schaaktrainer voor Oscar (9), single-file webapp. Zie
README.md voor de spelvormen en de opbouw.

## Bouwen

- `./build.sh` bouwt uit `src/` twee bestanden:
  - `index.html`: standalone met doctype, viewport en PWA-tags (GitHub
    Pages).
  - `sw.js`: service worker uit `src/sw.js`. De cacheversie is een hash
    van `index.html`, dus een vergeten versie-bump bestaat niet. Wel na
    elke src-wijziging opnieuw bouwen en de gegenereerde bestanden mee
    committen, anders serveert Pages een oude cacheversie.
- Bewerk nooit `index.html` of `sw.js` direct. Altijd `src/` aanpassen en
  opnieuw bouwen.
- `src/words.js` en `src/words-nl.txt` zijn gegenereerd door
  `tools/make-wordlist.py`; niet met de hand bewerken. `src/qr.js` is de
  eigen QR-encoder (geverifieerd via round-trip-decoderen met OpenCV).
- De server (koppelcodes en profiel-sync) staat in `server/`, Go, alleen
  stdlib. Tests draaien via `./test.sh` als er een go-toolchain is, anders
  op de devbox: `nix shell nixpkgs#go -c go test ./server/...`.
- App-iconen komen uit `tools/make-icons.py` (pure stdlib, reproduceerbaar);
  gegenereerde PNG's staan in de repo-root en worden meegecommit.

## Profiel

- Het profiel is een state-based CRDT (`DOC`, de waarheid in localStorage)
  met een platte weergave (`P`) waar de UI uit leest. Tellers schrijf je met
  `bump(pad, n)`, naam/thema/instellingen met `setPref`, trofeeen met
  `addBadge`. Nooit rechtstreeks `P.xp += n` schrijven: dat raakt alleen de
  weergave en is weg na herladen. Streak, lastLevel en dagmissies zijn
  bewust per apparaat; die schrijven wel direct in `P` en `saveP()` neemt ze
  mee.
- Ontwerp en achtergrond: memo
  `~/projects/memos/schaakheld/2026-08-14-multiplayer-en-sync-ontwerp.md`.

## Testen

- `./test.sh` draait alles headless onder jsc. Beide suites moeten groen
  zijn voor elke wijziging telt als af.
- Engine-wijzigingen: perft-counts in `test/test-engine.js` zijn heilig.
  Nooit een verwachte count aanpassen om een test groen te krijgen.
- UI-wijzigingen: voeg een flowtest toe in `test/flow-test.js` die het
  nieuwe gedrag naspeelt op de DOM-shim.

## Stijl

- Alle tekst die Oscar ziet is Nederlands, korte zinnen, vrolijk, nooit
  straffend. Fouten krijgen altijd uitleg (wie valt aan, wie verdedigt,
  waarom een ruil wel of niet gunstig is).
- Puntentaal consistent houden: pion 1, paard 3, loper 3, toren 5, dame 9.
- Geen externe dependencies, geen CDN's, geen webfonts. De app moet offline
  werken en in een enkel bestand passen; alles blijft inline.
