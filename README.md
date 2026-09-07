# SchaakHeld

Een vrolijke schaaktrainer voor kinderen, gebouwd voor Oscar (9). Volledig
Nederlandstalig, met Turbo de Schildpad als mascotte. Het motto: langzaam
denken is snel winnen.

De app traint twee vaardigheden die jonge schakers vaak overslaan:

1. **Het bord overzien.** Eerst kijken wat er overal staat en wat er dreigt.
2. **Vooruitdenken.** Eerst bedenken wat de tegenstander hierna kan doen, dan
   pas zetten.

## Spelvormen

Het startscherm heeft drie tabs: **Spelen**, **Vrienden** en **Ik**.

Twee potjes:

- **Potje tegen Turbo.** Een echte partij op drie sterktes. Turbo opent
  uit een klein openingsboek en Super Turbo denkt met een tijdsbudget
  (iteratief verdiepen, transpositietabel). Met een denk-meter die geduld
  beloont, een voorspel-bonus, een blunder-alarm dat waarschuwt zonder
  voor te zeggen, een strategie-coach en een denkwolk: een droomkopie van
  het bord om vrij vooruit te proberen. Een potje verlaat je niet zomaar:
  je kunt remise aanbieden (Turbo neemt alleen aan bij een echt gelijke
  stand) of opgeven.
- **Potje met een vriend.** Samen spelen via een speel-QR of wederzijdse
  woordcodes. Na een potje kunnen jullie vrienden worden (allebei ja
  tikken); daarna nodig je elkaar met één tik uit.

Vijf oefenspellen, elk vijf opdrachten per rondje met uitleg bij elke
fout:

- **Speurogen.** Tik alle aangevallen stukken aan, alles wat je kunt
  slaan, alle velden waar een stuk heen kan, het stuk dat je met winst
  kunt slaan, of wat Turbo dreigt te pakken als jij zou passen.
- **De Beste Zet.** Om en om: kies de beste van drie zetten, of
  beoordeel een voorgenomen zet als veilig of valstrik. Bij een verkeerde
  keuze zie je wat er dan gebeurt.
- **Turbo's Trucendoos.** Vind de vork, penning, spies, aftrekaanval,
  mat in een of mat in twee. Het Trucenboekje op het Ik-tabblad houdt bij
  hoe vaak je ze al gespot hebt.
- **Koning ontsnapt.** Verdedigen: je staat schaak of Turbo dreigt mat,
  en precies een of twee zetten redden je. Of een stuk van je
  hangt: wegzetten, dekken of tegenaanvallen. De koningspuzzels komen uit
  een vooraf met de engine gegenereerde en dieper nagerekende voorraad
  (`tools/make-koning.js`), omdat de bewijsvoering per puzzel tientallen
  seconden kost.
- **Openingsschool.** Structuur leren zien. De coach beoordeelt de eerste
  acht zetten op centrum, ontwikkeling, koningsveiligheid en tempo (met
  een engine-check: een nette zet die een stuk weggeeft heet gewoon een
  valstrik). Drie openingspaden (Italiaans, Londen, zwart tegen 1.e4)
  vertellen per zet waarom.

Motivatie zonder straf: een **weekdoel** dat het kind zelf kiest (zoveel
opdrachten, potjes of toprondes per week) met zeven bolletjes voor de
dagen, en een **vorm-score** per oefenspel over de laatste veertien dagen
(trefkans, moeilijkheid, tempo en hoe vaak je oefent). Daarnaast levels
met meesterproeven, trofeeen en bordkleuren.

Fouten worden altijd uitgelegd: wie valt aan, wie verdedigt, en waarom een
ruil wel of niet gunstig is. Onder het bord staat een puntenwijzer
(pion 1, paard 3, loper 3, toren 5, dame 9).

## Spelen

Open `index.html` in een browser. Geen dependencies, geen build-tooling.
Voortgang (sterren, levels, trofeeen, weekdoel, vorm, vrienden,
instellingen) staat in localStorage als een CRDT-document en kan via
`server/` versleuteld gesynct worden naar een tweede apparaat. Diezelfde
kleine Go-server relayt de zetten van potjes met een vriend en bewaart de
versleutelde uitnodigingen (brievenbussen); zonder server werkt alles
behalve samen spelen.

De site is een PWA: één keer online openen, daarna werkt alles offline
(vliegtuigstand incluis). Op een iPad of telefoon: "Zet op beginscherm",
dan opent hij als echte app met het schildpad-icoon. De service worker
haalt online altijd de nieuwste versie op en valt offline terug op de
cache.

## Bouwen en testen

```
./build.sh   # bouwt index.html en sw.js uit src/
./test.sh    # draait de engine-tests en de UI-flowtests headless
```

De tests draaien onder `jsc` (JavaScriptCore, zit standaard in macOS). De
engine-suite draait ook onder node: `node test/test-engine.js`.

## Techniek

Alles zit in een enkel HTML-bestand, opgebouwd uit drie delen in `src/`:

- `head.html`: opmaak en styling.
- `engine.js`: schaaklogica. 0x88-bordrepresentatie, volledige legale
  zetgeneratie (rokade, en passant, promotie), mat/pat-detectie, een
  alpha-beta-zoeker met quiescence voor de oefeningen, een zoeker met
  tijdsbudget (iteratief verdiepen, Zobrist-hash, transpositietabel,
  killer/history-ordening, schaak-extensie) voor Super Turbo, een klein
  openingsboek, static exchange evaluation voor de ruil-oordelen, mat-in-N
  via de zoeker, en generatoren die oefenposities maken via zelfspel met
  ruis (ook verdedigingsopdrachten: mat-dreiging of hangend stuk met een
  of twee reddende zetten).
- `tail.html`: de gehele gebruikersinterface.

De zetgeneratie is geverifieerd met perft-tests op vijf standaardposities
(exacte nodecounts, tot diepte 4). De UI-flows zijn afgedekt met een
headless testsuite op een minimale DOM-shim.
