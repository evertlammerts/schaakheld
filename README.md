# SchaakHeld

Een vrolijke schaaktrainer voor kinderen, gebouwd voor Oscar (9). Volledig
Nederlandstalig, met Turbo de Schildpad als mascotte. Het motto: langzaam
denken is snel winnen.

De app traint twee vaardigheden die jonge schakers vaak overslaan:

1. **Het bord overzien.** Eerst kijken wat er overal staat en wat er dreigt.
2. **Vooruitdenken.** Eerst bedenken wat de tegenstander hierna kan doen, dan
   pas zetten.

## Spelvormen

- **Speurogen.** Speuropdrachten op steeds een nieuw bord: tik alle
  aangevallen stukken aan, alles wat je kunt slaan, alle velden waar een stuk
  heen kan, of het stuk dat je met winst kunt slaan.
- **Valstrik-detector.** Je ziet een voorgenomen zet. Veilig, of pakt de
  tegenstander daarna iets af? Bij een fout speelt Turbo de straf voor.
- **De Beste Zet.** Drie kandidaat-zetten, kies de beste. Bij een verkeerde
  keuze zie je wat er dan gebeurt, en mag je opnieuw.
- **Potje tegen Turbo.** Een echte partij op drie sterktes. Met een
  denk-meter die geduld beloont, een voorspel-bonus (raad welk stuk Turbo
  gaat spelen) en een blunder-alarm dat waarschuwt zonder voor te zeggen.

Fouten worden altijd uitgelegd: wie valt aan, wie verdedigt, en waarom een
ruil wel of niet gunstig is. Onder het bord staat een puntenwijzer
(pion 1, paard 3, loper 3, toren 5, dame 9).

## Spelen

Open `index.html` in een browser. Meer is er niet: geen dependencies, geen
server, geen build-tooling. Voortgang (sterren, levels, trofeeën,
instellingen) staat in localStorage.

De site is een PWA: één keer online openen, daarna werkt alles offline
(vliegtuigstand incluis). Op een iPad of telefoon: "Zet op beginscherm",
dan opent hij als echte app met het schildpad-icoon. De service worker
haalt online altijd de nieuwste versie op en valt offline terug op de
cache.

## Bouwen en testen

```
./build.sh   # bouwt index.html en artifact.html uit src/
./test.sh    # draait de engine-tests en de UI-flowtests headless
```

De tests draaien onder `jsc` (JavaScriptCore, zit standaard in macOS). De
engine-suite draait ook onder node: `node test/test-engine.js`.

## Techniek

Alles zit in een enkel HTML-bestand, opgebouwd uit drie delen in `src/`:

- `head.html`: opmaak en styling.
- `engine.js`: schaaklogica. 0x88-bordrepresentatie, volledige legale
  zetgeneratie (rokade, en passant, promotie), mat/pat-detectie, een kleine
  alpha-beta-zoeker met quiescence voor de computertegenstander, static
  exchange evaluation voor de ruil-oordelen, en generatoren die
  oefenposities maken via zelfspel met ruis.
- `tail.html`: de gehele gebruikersinterface.

De zetgeneratie is geverifieerd met perft-tests op vijf standaardposities
(exacte nodecounts, tot diepte 4). De UI-flows zijn afgedekt met een
headless testsuite op een minimale DOM-shim.
