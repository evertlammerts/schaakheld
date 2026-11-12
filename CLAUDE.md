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
  `tools/make-wordlist.py`; niet met de hand bewerken. `src/koning.js` (de
  voorraad Koning-ontsnapt-puzzels) komt uit `tools/make-koning.js`: live
  genereren met de soundness-controle duurt tientallen seconden per puzzel,
  dus dat gebeurt vooraf (node op de devbox), met een diepere hercontrole
  per redding. Het hangende-stuk-type wordt wel live gegenereerd. `src/qr.js` is de
  eigen QR-encoder (geverifieerd via round-trip-decoderen met OpenCV).
- De server (koppelcodes en profiel-sync) staat in `server/`, Go, alleen
  stdlib. Tests draaien via `./test.sh` als er een go-toolchain is, anders
  op de devbox: `nix shell nixpkgs#go -c go test ./server/...`.
- App-iconen komen uit `tools/make-icons.py` (pure stdlib, reproduceerbaar);
  gegenereerde PNG's staan in de repo-root en worden meegecommit.

## Profiel

- Het profiel is een state-based CRDT (`DOC`, de waarheid in localStorage)
  met een platte weergave (`P`) waar de UI uit leest. Tellers schrijf je met
  `bump(pad, n)`, weektellers met `bumpWeek(sleutel, n)` (pad
  `wk.<isoweek>.<sleutel>`), naam/thema/instellingen/weekdoel met
  `setPref`, trofeeen met `addBadge`, opdrachtresultaten met
  `logResult(spel, moeilijkheid, ms, sterren)` (de vorm-log, 28 dagen) en
  vrienden met `setFriend(id, f)` (LWW per vriend). Nooit rechtstreeks
  `P.xp += n` schrijven: dat raakt alleen de weergave en is weg na herladen.
  Streak, lastLevel, de dagteller voor winst-XP en weekSeen zijn bewust per
  apparaat; die schrijven wel direct in `P` en `saveP()` neemt ze mee.
- Bestaande punten mogen bij een update nooit verloren gaan: nieuwe
  tellerpaden komen erbij, oude blijven staan. De compat-test in
  `test/flow-test.js` laadt een doc van de vorige release en controleert dat.
- Vrienden: het geheim K komt uit ECDH over de relay (server ziet het niet),
  bus-id = sha256(HKDF(K, 'bus-<rol>')). Zonder K is een bus niet te vinden
  en een briefje niet te lezen. Op de server bestaat geen persoon of lijst.
  Het `hallo` draagt per vriend HKDF(K, 'hallo-<kamer>'): wie een eigen
  waarde terugziet weet dat hij de ander al kent, en dan biedt de app
  "vrienden worden" niet nog eens aan (dat maakte een tweede geheim met
  dezelfde persoon). Per kamer anders en aangevuld met willekeur tot een
  vaste lengte, dus de relay heeft er niets aan (ook het aantal niet).
- Ontwerp en achtergrond: memo
  `~/projects/memos/schaakheld/2026-08-14-multiplayer-en-sync-ontwerp.md`.

## Testen

- `./test.sh` draait alles headless onder jsc en faalt als een van de
  suites rood is of afbreekt (een fout in een async-blok komt als
  `ASYNC EXCEPTION` in de uitvoer). Alle suites moeten groen zijn voor een
  wijziging telt als af. De Go-tests draaien mee als er een go-toolchain
  is, anders op de devbox.
- Engine-wijzigingen: perft-counts in `test/test-engine.js` zijn heilig.
  Nooit een verwachte count aanpassen om een test groen te krijgen.
- Alles wat pas misgaat als beide kanten echt draaien (samen spelen,
  vrienden, uitnodigen, koppelen en sync) hoort in `test/twee-apparaten.js`:
  twee (of drie) volledige app-instanties met elk een eigen DOM, opslag en
  globals, op een gedeelde nep-server, relay en klok. `maakApparaat()` geeft
  een handvat waarmee je in die instantie leest en aanroept. Een kant met een
  rauwe socket naspelen mist precies de fouten die uit de volgorde komen.
- UI-wijzigingen: voeg een flowtest toe in `test/flow-test.js` die het
  nieuwe gedrag naspeelt op de DOM-shim. De shim heeft een nep-server met
  de semantiek van `server/` (koppelcodes, profielen, kamers, paren,
  bussen), een nep-relay en nep-WebCrypto (AES-GCM, HKDF, ECDH: symmetrisch,
  rond-trippend, verkeerde sleutel faalt). Hou die gelijk met de Go-code.
- Generatoren die zoeken (mat in 2, Koning ontsnapt) mogen een paar seconden
  duren maar niet meer; de spinner dekt dat. Meet het in de engine-suite.

## Stijl

- Alle tekst die Oscar ziet is Nederlands, korte zinnen, vrolijk, nooit
  straffend. Fouten krijgen altijd uitleg (wie valt aan, wie verdedigt,
  waarom een ruil wel of niet gunstig is).
- Puntentaal consistent houden: pion 1, paard 3, loper 3, toren 5, dame 9.
- Schaaktermen kloppen: opgeven (niet stoppen), remise aanbieden, rokade.
- Motivatie is het weekdoel plus het level; geen dagenreeks die kapot kan,
  geen klok op het potje (langzaam denken is snel winnen).
- Geen externe dependencies, geen CDN's, geen webfonts. De app moet offline
  werken en in een enkel bestand passen; alles blijft inline.
