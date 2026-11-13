# SchaakHeld: werkafspraken

## Wat dit is

Nederlandstalige schaaktrainer voor Oscar (9), single-file webapp. Zie
README.md voor de spelvormen en de opbouw.

## Bouwen

- `./build.sh` bouwt uit `src/` twee bestanden:
  - `index.html`: standalone met doctype, viewport en PWA-tags (GitHub
    Pages). `head.html`, dan `engine.js`, `koning.js`, `trucs.js`,
    `words.js`, `qr.js`, `jsqr.js` en `tail.html` staan er inline in.
  - `sw.js`: service worker uit `src/sw.js`. De cacheversie is een hash
    van `index.html`, dus een vergeten versie-bump bestaat niet. Wel na
    elke src-wijziging opnieuw bouwen en de gegenereerde bestanden mee
    committen, anders serveert Pages een oude cacheversie.
- Bewerk nooit `index.html` of `sw.js` direct. Altijd `src/` aanpassen en
  opnieuw bouwen.
- Gegenereerd, niet met de hand bewerken:
  - `src/words.js` en `src/words-nl.txt` (de woorden voor koppel- en
    speelcodes) uit `uv run tools/make-wordlist.py`.
  - `src/koning.js` (de puzzels van Koning ontsnapt) uit
    `tools/make-koning.js`, en `src/trucs.js` (de trucs van de Trucendoos
    en de opdrachten van Red je stuk) uit `tools/make-trucs.js`. Een
    opdracht goed controleren kost seconden per stelling, op een trage
    telefoon tientallen; daarom gebeurt het vooraf met node (op de
    devbox), met een diepere hercontrole. Werkers zoeken parallel, elk naar
    een eigen bestand, en `merge` schrijft de voorraad. `make-koning.js
    toets` doet de diepste controle in delen. De zoektochten van de engine
    tellen knopen, geen tijd: `make-trucs.js` vindt met hetzelfde zaad
    dezelfde stellingen. Live gemaakt worden alleen Speurogen en De Beste
    Zet (kiezen uit drie, veilig of valstrik); de Trucendoos, Red je stuk
    en Koning ontsnapt vallen alleen op de live generatoren terug als hun
    voorraad leeg of onleesbaar is.
  - App-iconen uit `tools/make-icons.py` (pure stdlib, reproduceerbaar); de
    PNG's staan in de repo-root en worden meegecommit.
- `src/qr.js` is de eigen QR-encoder (geverifieerd via round-trip-decoderen
  met OpenCV). `src/jsqr.js` is jsQR, de QR-lezer, meegeleverd en
  geminificeerd; bij een update het hele bestand vervangen.
- De server (koppelcodes, profiel-sync, de relay van de kamers, de
  brievenbussen voor uitnodigingen en de staat van een paar vrienden) staat
  in `server/`, Go. Naast de standaardbibliotheek gebruikt hij één pakket,
  `github.com/coder/websocket` voor de relay, meegeleverd in
  `server/vendor/`. Tests draaien via `./test.sh` als er een go-toolchain
  is, anders op de devbox: `nix shell nixpkgs#go -c go test ./server/...`.
- `tools/dev.sh start [MAP] [POORT]` serveert een build op
  `http://127.0.0.1:POORT` met een eigen Go-server op POORT+1000, en zet in
  elke pagina die lokale server als `schaakheld-server`. De server staat
  precies die ene origin toe, dus altijd `127.0.0.1`, nooit `localhost`.
  Eerst `tools/dev.sh status` voor `stop` of `reset`: poorten worden
  gedeeld.
- `tools/compat/` is de compatibiliteitspoort (eigen README); alleen daar
  staan npm-pakketten. De app zelf heeft geen dependencies.

## Profiel

- Het profiel is een state-based CRDT (`DOC`, de waarheid in localStorage
  onder `schaakheld1`) met een platte weergave (`P`) waar de UI uit leest.
  Tellers schrijf je met `bump(pad, n)`, weektellers met
  `bumpWeek(sleutel, n)` (pad `wk.<isoweek>.<sleutel>`),
  naam/thema/instellingen/weekdoel met `setPref`, trofeeën met `addBadge`,
  opdrachtresultaten met `logResult(spel, moeilijkheid, ms, sterren)` (de
  vorm-log, 28 dagen) en vrienden met `setFriend(id, f)` (LWW per vriend).
  Nooit rechtstreeks `P.xp += n` schrijven: dat raakt alleen de weergave en
  is weg na herladen.
- Per apparaat, in `DOC.loc`, nooit samengevoegd: streak, lastLevel,
  lastKind, lastSeen, weekSeen, shownBadges (de trofeeën die dit apparaat
  al liet zien) en de dag (`P.day`): de winst-XP per sterkte, en `vriend`,
  de dagteller voor de XP van een potje met een ander kind. Die telt per
  kind, onder de id van de vriend of onder de naam zolang ze nog geen
  vrienden zijn; worden ze vrienden, dan gaat de telling van vandaag mee
  naar de id van de vriend. De UI schrijft die velden direct in `P` en
  `saveP()` neemt ze mee. Ook per apparaat: `geteld`, per vriend de id's
  van de laatste acht potjes op de staat die dit apparaat telde. Een einde
  telt op het ene apparaat waarvan het merk in de staat staat, en de id
  komt in dezelfde opslag als de tellers, zodat een herstart nooit twee
  keer telt.
- Koppelen: een apparaat dat een profiel overneemt, schrijft een 0 onder
  zijn eigen id in de XP-teller (`meldApparaat`). De som verandert niet, en
  zo ziet het andere apparaat bij de volgende sync dat het gekoppeld is.
  Samenvoegen houdt zo'n 0 vast.
- Buiten het profiel, per apparaat en nooit gesynct: het bewaarde potje
  tegen Turbo per sterkte (`schaakheld-potje`), de rondjes in uitvoering
  (`schaakheld-rondjes`), de potjes in een kamer met een ander kind
  (`schaakheld-samen`; wat zo'n potje over een herlading houdt, staat in
  één lijst, `SAMEN_VELDEN`, die bewaren en hervatten allebei aflopen), per
  vriend de staat van hun potje zoals dit apparaat hem kent met de rij
  handelingen die nog weg moeten (`schaakheld-paar`), de plek in de
  voorraad trucs (`schaakheld-trucplek`), de geziene uitnodigingen
  (`schaakheld-inv`), het koppelaccount (`schaakheld-acc`), de id van het
  apparaat (`schaakheld-dev`) en een ander serveradres
  (`schaakheld-server`).
- Wat een kind nog moet zien (een zin in de strook, een venster, wat een
  potje verdiende) staat bij het bewaarde potje of bij het paar, nooit
  alleen in een variabele in het geheugen: een herlading of een app die
  dichtgaat mag het niet laten verdwijnen. Elk veld van het geheugen van
  een potje met een ander kind (`MP`) wordt bewaard (`SAMEN_VELDEN`), komt
  uit het paar, of staat met een reden in de lijst `IN_GEHEUGEN`. De regels
  "een potje in de kamer door al zijn gebeurtenissen" en "een potje op de
  staat door al zijn gebeurtenissen" in `test/orakel-twee-6.js` lezen elke
  sleutel van `MP` en falen op een veld zonder plek.
- Bestaande punten mogen bij een update nooit verloren gaan: nieuwe
  tellerpaden en velden komen erbij, oude blijven staan, en elke verandering
  aan wat bewaard wordt krijgt een migratie en een compat-test (zie Testen).

## Vrienden

- Het geheim K komt uit ECDH over de relay (de server ziet het niet). Op de
  server bestaat geen persoon of lijst.
- Vrienden worden is een uitwisseling van toestand, geen vraag en antwoord.
  Elk apparaat houdt per verblijf in de kamer (een sessie) bij hoe vaak dit
  kind wil, op welk willen van de ander het "Nu niet" zei en welk willen het
  zag, en stuurt dat met elke groet; elke verandering (een tik, wat het zag,
  het einde van een potje, een vriend bewaard of teruggenomen, een andere
  vriendenlijst) groet opnieuw. Een apparaat bewaart de vriend pas als
  beide willen en de ander zijn willen zag; het geheim komt uit de sleutels
  van de twee sessies, de rollen uit hun volgorde. Een vriend die maar aan
  één kant aankwam, gaat terug zodra een groet zonder bewijs uit een nieuwe
  sessie komt.
- Het `hallo` draagt per vriend HKDF(K, 'hallo-<kamer>'): wie een eigen
  waarde terugziet weet dat hij de ander al kent, en dan biedt de app
  "vrienden worden" niet nog eens aan (dat maakte een tweede geheim met
  dezelfde persoon). Per kamer anders en aangevuld met willekeur tot een
  vaste lengte, dus de relay heeft er niets aan (ook het aantal niet).
- Op de server staat alles onder een adres dat sha256 is van een bewijs
  uit K; wie schrijft, toont het bewijs en de server controleert de hash.
  Zonder K is een adres niet te vinden en een briefje niet te lezen.
  - Uitnodigingen: bewijs HKDF(K, 'bus-<rol>'), verzegeld met de sleutel
    'uitnodiging', tien minuten, alleen in het geheugen van de server.
  - Een potje tussen vrienden dat dagen loopt: één staat per paar, bewijs
    HKDF(K, 'potje') zonder rol, verzegeld met de sleutel 'paar' en
    aangevuld tot een vaste lengte. De versie is de SHA-256 van de tekst.
    Een apparaat verandert de staat alleen met een schrijfactie die de
    versie noemt die het las; klopt die niet meer, dan verandert er niets,
    krijgt het de staat van nu terug, en beslist het opnieuw. Geen apparaat
    voegt twee lezingen samen. `staatNa(staat, actie, rol, nu)` is de tabel
    van wat een handeling met de staat doet. De staat leeft dertig dagen na
    het laatste schrijven en staat op schijf; een apparaat schrijft hem na
    zeven dagen opnieuw zolang hij nog telt.
- Elke handeling op de staat (een zet, ja of nee op een uitdaging, opgeven,
  remise) wacht eerst in de rij van het apparaat, ook over een herstart, en
  gaat zodra er netwerk is. Zitten beide kinderen in het potje, dan zegt de
  kamer alleen "kijk nu", zodat de ander meteen leest.
- Een potje dat live in de kamer begint, zet de gastheer pas op de staat
  als de gast antwoordt dat hij volgt; zolang dat antwoord niet kwam, stuurt
  de gastheer het aanbod opnieuw, en gaat hij naar huis, sluit de app of is
  de kamer weg, dan vervalt het begin. Volgt de gast niet (geen vriend aan
  zijn kant), dan blijft het een potje van de kamer. Een server zonder
  staten met een versie (de check geeft geen `nu`) maakt van elk
  vriendenpotje weer een potje van de kamer.
- Ontwerp en achtergrond: memo
  `~/projects/memos/schaakheld/2026-08-14-multiplayer-en-sync-ontwerp.md`.

## Testen

- `./test.sh` draait alles en faalt als een suite rood is of afbreekt (een
  fout in een async-blok komt als `ASYNC EXCEPTION` in de uitvoer): de
  engine-tests, de flowtests en de tests met twee apparaten onder jsc, de
  PWA-checks, de woordlijst, de compatibiliteitspoort (node), de
  layoutcontroles (`playwright-cli`; met `LAYOUT_POORT` als twee bomen
  tegelijk draaien) en de Go-tests (met een go-toolchain, anders op de
  devbox). Alle suites moeten groen zijn voor een wijziging telt als af.
  Welk bestand wat test en hoe je een test schrijft: `test/README.md`.
- Gedrag dat nog niet gebouwd is, staat in de suite als `nogNiet(...)`:
  zijn blok moet falen. Gebouwd gedrag is `regel(...)`. Een verwachte
  uitkomst veranderen is een ontwerpwijziging, geen testreparatie.
- Engine-wijzigingen: perft-counts in `test/test-engine.js` zijn heilig.
  Nooit een verwachte count aanpassen om een test groen te krijgen. De
  regels over schaken die in de engine wonen (de voorraden, het
  blunder-alarm, herhaling, de knopenbudgetten, het belangrijkste moment)
  staan in `test/orakel-engine.js`.
- Alles wat pas misgaat als beide kanten echt draaien (samen spelen,
  vrienden, uitnodigen, potjes over dagen, koppelen en sync) hoort in de
  tests met twee apparaten: twee (of meer) volledige app-instanties met
  elk een eigen DOM, opslag en globals, op een gedeelde nep-server, relay
  en klok. Een kant met een rauwe socket naspelen mist precies de fouten
  die uit de volgorde komen.
- UI-wijzigingen: voeg een flowtest toe die het nieuwe gedrag naspeelt op
  de DOM-shim, met tikken zoals een kind: een tik op iets dat niet in beeld
  is, faalt. De shim (`test/dom-shim.js`) heeft een nep-server met de
  semantiek van `server/` (koppelcodes, profielen, kamers, paren,
  brievenbussen, de staat van een paar met versies), een nep-relay en
  nep-WebCrypto (AES-GCM, HKDF, ECDH, SHA-256: symmetrisch, rond-trippend,
  verkeerde sleutel faalt). Hou die gelijk met de Go-code.
- Wat op maten hangt (het bord in beeld, niets scrolt, een zin past), hoort
  in `test/layout/run.mjs`: elke maat in een echte browser-engine. De
  DOM-shim is daar blind voor.
- De compatibiliteitspoort (`tools/compat/`) controleert de build tegen de
  oudste browsers die de app moet draaien. Nieuwe syntax of een nieuwe
  web-API alleen als de poort hem toelaat, of met een test die de terugval
  bewijst.
- Verdiende voortgang: de compat-tests laden een document van de vorige
  release en van nu, en controleren dat XP, sterren, trofeeën, tellers,
  bordkleuren en de weekgeschiedenis blijven. Breid ze uit bij elke
  verandering aan wat bewaard wordt.
- Generatoren die live zoeken mogen een paar seconden duren maar niet
  meer; de spinner dekt dat. Meet het in de engine-suite.

## Stijl

- Alle tekst die Oscar ziet is Nederlands, korte zinnen, vrolijk, nooit
  straffend. Fouten krijgen altijd uitleg (wie valt aan, wie verdedigt,
  waarom een ruil wel of niet gunstig is), en wat de app zegt is waar op
  het bord dat er staat.
- Puntentaal consistent houden: pion 1, paard 3, loper 3, toren 5, dame 9.
  Punten zijn de waarde van stukken; wat een kind verdient heet XP.
- Schaaktermen kloppen: opgeven (niet stoppen), remise aanbieden, rokade.
- Motivatie is het weekdoel plus het level; geen dagenreeks die kapot kan,
  geen klok op het potje (langzaam denken is snel winnen), en geen XP kwijt
  voor fouten.
- Een potje eindigt alleen door het uit te spelen, op te geven of remise.
- Geen externe dependencies, geen CDN's, geen webfonts. De app moet offline
  werken en in een enkel bestand passen; alles blijft inline.
