# Tests

`./test.sh` draait alles en faalt als een suite rood is of afbreekt.

| Suite | Bestanden | Draait op |
|---|---|---|
| engine | `test-engine.js` (perft-counts zijn heilig), `orakel-engine.js` | jsc |
| flow | `flow-test.js`, `orakel-flow.js`, `orakel-flow-5.js`, `orakel-flow-6.js`, `orakel-versies.js` | jsc, DOM-shim |
| twee apparaten | `twee-apparaten.js`, `orakel-twee.js`, `orakel-twee-6.js`, `orakel-paar.js` | jsc, DOM-shim, gedeelde nep-server |
| server | `server/*_test.go`, ook `orakel_test.go` en `potje_test.go` | go |
| layout | `layout/run.mjs` | WebKit via playwright-cli |
| compatibiliteit | `tools/compat/` (eigen README) | node |

De runners `run-engine.js`, `run-flow.js` en `run-twee.js` laden de
bronnen uit `src/` en dan de testbestanden. Een nieuw testbestand komt daar
bij; de functie van een orakelbestand van de flowsuite of de
tweeapparatensuite wordt aan het eind van `flow-test.js` of
`twee-apparaten.js` aangeroepen, en `orakel-engine.js` draait zodra het
geladen is.

## Wat staat waar

- `test-engine.js`: perft, mat en pat, de ruil-oordelen en de generatoren
  van de opdrachten.
- `orakel-engine.js`: de regels over schaken die in de engine wonen. De
  voorraden van de Trucendoos, Red je stuk en Koning ontsnapt (leesbaar,
  legale antwoorden, het type klopt, genoeg per type, een diepe steekproef
  per type), veilig of valstrik, het blunder-alarm, herhaling tellen, de
  knopenbudgetten van Super Turbo en de live generatoren, en het
  belangrijkste moment.
- `flow-test.js`: de flowtests per scherm, en de compat-tests die een
  profiel van de vorige release en van nu laden.
- `orakel-flow.js`: één apparaat. Bewaren en hervatten, het speelscherm,
  Thuis en de kaart Verder, het weekdoel, Ik en de instellingen, en de
  schermen voor vrienden zonder vriend erbij.
- `orakel-flow-5.js`: de schaakinhoud zoals een kind hem ziet. De
  oefeningen en wat een foute poging zegt, Turbo's zinnen in de strook,
  het blunder-alarm, herhaling, en de eindkaart met het belangrijkste
  moment.
- `orakel-flow-6.js`: één apparaat met de staat van een paar vrienden in
  de opslag en geen vriend erbij. De kaart en "Ook nog", stille potjes,
  de grens van acht potjes, een vriend weghalen, uitdagen voor later en
  intrekken.
- `orakel-versies.js`: de tabel van `staatNa(staat, actie, rol, nu)`,
  de functie die zegt wat een handeling met de staat van een paar doet:
  voor elke fase elke handeling van beide rollen, wat mag en wat er dan
  staat. Ook het verzegelen (één lengte, heen en terug, onleesbaar is
  `null`) en de versie.
- `twee-apparaten.js`: samen spelen, koppelen en sync, met de helpers
  `samenSpelen`, `speel`, `typ` en `scanQR`.
- `orakel-twee.js`: samen spelen in een kamer, vrienden worden, uitnodigen
  en koppelen, met de helpers `wordenVrienden`, `nodigUit` en `zegt` (wat
  een kind nu leest).
- `orakel-twee-6.js`: potjes met vrienden die dagen duren, zoals de
  kinderen het zien. Helpers: `tijd(ms)` en `tijdFijn(ms)` laten de wereld
  in stapjes van 2,5 s of 50 ms lopen, `schuifKlok(ms)` verzet de datum,
  `opent(app)` is een kind dat de app opent, `vriendenpotje(a, b)`,
  `daagUit(van, fid, naam)`, `tweedeApparaat(app)` en `oudeServer` (een
  server zonder staten met een versie).
- `orakel-paar.js`: de staat van een paar op de server. Schrijven met de
  gelezen versie en wie dan wint, een antwoord dat zoekraakt, wachten
  zonder netwerk en na een herstart, één keer tellen per kind en per
  apparaat, de veertien dagen op de klok van de server, een verloren staat
  die een apparaat terugschrijft, een nieuwere of onleesbare staat die
  blijft staan, en een willekeurige reeks handelingen op vier apparaten.
- `server/orakel_test.go` en `server/potje_test.go`: de server, met het
  schrijven met een versie, twee schrijvers tegelijk en de schijf.
- `layout/run.mjs`: alles wat op schermmaten hangt.

## Het orakel: gedrag dat nog niet gebouwd is

Een testnaam begint met een nummer tussen haken, bijvoorbeeld
`[1.2] pauze: ...`; tests met hetzelfde nummer leggen samen één gedrag
vast. Zolang dat gedrag niet gebouwd is, staat zijn test er als "nog niet
gebouwd": het blok moet falen (een controle die mislukt of een
uitzondering), dan blijft de suite groen; slaagt het toch, dan is de suite
rood. Wie het gedrag bouwt, zet in dezelfde commit zijn tests om en
verandert niets aan het blok zelf. Moet het blok anders, dan verandert het
gedrag zelf: dat is een ontwerpkeuze, geen testreparatie.

| Suite | Nog niet gebouwd | Gebouwd |
|---|---|---|
| engine | `nogNiet('[n.m] ...', function (check) {...})` | `regel('[n.m] ...', ...)` |
| flow, twee apparaten | `nogNiet('[n.m] ...', async check => {...})` | `regel('[n.m] ...', ...)` |
| server | `nogNiet(t, "[n.m] ...", func(t tb) {...})` | het blok rechtstreeks met `t` |
| layout | het nummer staat niet in `GEBOUWD` | het nummer staat in `GEBOUWD` |

Elke suite bewijst dit mechanisme zelf (`orakelZelftest` in `harnas.js`,
het proefblok bovenin `orakel-engine.js`, `TestOrakelMechanisme`,
`zelftest()` in `layout/run.mjs`). Een engine-blok dat lang zoekt,
controleert eerst goedkoop of wat het nodig heeft er is, zodat het snel
faalt zolang het gedrag niet gebouwd is.

## Een flowtest of tweeapparatentest schrijven

`harnas.js` geeft elke test een of meer verse app-instanties, elk met een
eigen DOM, opslag en adresbalk; de nep-server, de relay en de klok zijn
gedeeld.

- `maakApparaat(naam, opties)`: een kind met een naam. Opties: `opslag`
  (vooraf gevuld: een bewaard potje, een document van nu), `beweging: true`
  (de app laat een stuk schuiven; standaard vraagt de shim minder beweging,
  zodat een zet meteen staat) en `klokAf` (de klok van dit apparaat loopt
  zoveel ms voor of achter). `app.netwerk.haak = (url, o, fetch) => ...`
  stuurt de verzoeken van alleen dit apparaat.
- `verzegelParen(opslag)` verzegelt de staten van een paar die een test in
  de opslag zet, zoals een apparaat ze bewaart: als tekst, met de versie.
- `herlaad(app)`: de app gaat dicht (timers en sockets stoppen) en start
  opnieuw op dezelfde opslag, hetzelfde netwerk en dezelfde scheve klok.
- `wacht(ms)`: de timers die binnen `ms` vallen lopen af, en de beloftes
  erna; standaard vijf seconden. De klok gaat niet verder dan de laatste
  timer die afliep: wie echt N seconden verder wil, zet eerst een timer op
  N seconden. `zagOoit(vraag, ms)` loopt in stapjes van 50 ms en zegt of
  de vraag onderweg ooit waar was (voor wat maar even in beeld is).
- `zetDatum('2026-11-16T09:00:00')` zet de datum voor de rest van de test;
  `Date` loopt daarna mee met de klok van de timers. Zonder `zetDatum` is
  `Date.now()` de echte klok van de machine, en veroudert er niets: een
  test over minuten of dagen heeft `zetDatum` nodig.
- Tikken zoals een kind: `zet(app, 'e2e4')` en `tikVeld(app, veld)` via
  de tikhandler van het bord, `tikTekst(app, 'Volgende')` op wat er op een
  knop staat, `app.tik(id)` op een element met een id, `tikEl(app, el)` op
  een element uit `querySelectorAll`, `tikInRij(app, fid, tekst)` op een
  knop in de rij van een vriend, `vulIn(app, veld, tekst)` in een
  invoerveld, `startPotje(app, niveau)`, `startOefening(app, soort)`,
  `geefOp(app)` en `biedRemise(app)`.
- Een kind tikt alleen wat het ziet. Een tik op een element dat zelf of via
  een ouder verborgen is (de klasse `hidden`, of `display: none`), dat niet
  meer in de pagina hangt, of dat achter een open venster ligt, gooit een
  fout en laat de test falen; `tikTekst` ook als geen knop in beeld die
  tekst draagt. Een knop die uit staat, doet niets. Vragen of iets te
  tikken valt: `kanTikken(app, tekst)`, `tikbaar(app, el)` (geeft de reden,
  of `''`), `knopTeksten(app)`.
- Kijken: `tekstVan(app, id)` en `app.scherm()` (de hele tekst van het
  open venster) lezen alleen wat in beeld is, zonder verborgen delen en met
  tekens zoals ze er staan; `zichtbaar(app, id)` kijkt ook naar de ouders.
  Verder `toastTekst(app)`, `opgeslagen(app, sleutel)`, `app.fen()`,
  `opThuis(app)`, `opSpeelscherm(app)`, `turboPotje(app, niveau)`,
  `samenPotje(app)`, `vriendenpotjeMet(app, fid)`, `ookNogRegels(app)` en
  `vriendRijTekst(app, fid)`.
- Netwerk per apparaat: `geenNetwerk(app)` breekt de open lijnen (code
  1006) en laat `fetch` falen, nieuwe lijnen gaan niet open;
  `weerNetwerk(app)` zet het terug. Het blijft bij een herstart. De
  nep-server ziet een gebroken lijn meteen en zegt het de ander; de echte
  server merkt het pas bij zijn ping, elke dertig seconden. Wie "de server
  merkte niets" wil naspelen, roept de sluithandler van de app zelf aan.
- In het blok: `check('wat er moet kloppen', voorwaarde)`. De oudere tests
  in `flow-test.js` en `twee-apparaten.js` gebruiken `ok(naam, voorwaarde)`.

Een opdracht klaarzetten mag via de binnenkant van de app, zoals de
bestaande tests doen; beantwoorden nooit. Een kind tikt, dus een test ook:
een fout die alleen in de tikhandler zit, bleef maanden onzichtbaar omdat
een test de functie erachter direct aanriep.

De namen die de tests nodig hebben (ids, het formaat van een opgeslagen
rondje, `nextStep`, `staatNa`) horen bij de app: wie er een verandert,
past de tests in dezelfde commit aan.

## De DOM-shim

`dom-shim.js` speelt de browser na zonder opmaak. Hij kent de vaste opmaak
van `src/head.html` (ids, klassen, tekst), zoekt met `querySelectorAll` in
de HTML die de app schrijft (enkelvoudige selectors), en onthoudt
`scrollTo` en `scrollIntoView`. Waar het op maten aankomt, is de shim
blind: dat hoort in de layoutcontroles.

Zoals een browser maakt elke `innerHTML` nieuwe elementen: met de klassen,
data en inhoud uit de opmaak, zonder de luisteraars van de oude. Een
element zonder id is een object, welke ouder je ook doorzoekt. `remove()`
haalt een element echt weg. Anders dan een browser volgt de tekst van een
ouder een kind niet: zet de app `textContent` op een deel van een kaart,
dan leest een test dat deel via zijn id, niet via de kaart.

De nep-server heeft de semantiek van `server/`: koppelcodes, profielen,
kamers, paren, brievenbussen voor uitnodigingen, en de staten van een paar
met hun versie (`POST /v1/potje`: schrijven met de gelezen versie, `409`
met de staat van nu, dertig dagen, hoogstens 1024). `__server.klok`
schuift de klok van de server vooruit, `__herstartServer()` gooit weg wat
alleen in het geheugen staat en houdt de staten die op schijf staan, en
`__potjesKwijt()` speelt een verloren map met staten na. Hou de nep-server
gelijk met de Go-code.

De nep-server sluit een lijn zoals `server/room.go`: een onbekende kamer of
een fout stoeltje met 1008 en de reden `onbekend`, een kapotte join met
1008 `eerst joinen`, een overgenomen stoeltje met `{"t":"stoel"}` en dan
1006. Zonder netwerk gaat een lijn nooit open en sluit hij met 1006 zonder
reden; de app sluit zelf met 1005.

## Een layoutcontrole schrijven

`layout/run.mjs` serveert de build met `tools/dev.sh` op poort 8719, of op
`LAYOUT_POORT` als twee bomen tegelijk draaien (`DEV_SH` wijst desgewenst
een ander dev.sh aan), en draait elk geval in een verse pagina van de
sessie `fd-layout-<poort>`. Geeft de browser op een geval geen antwoord,
of doet een geval geen enkele controle, dan faalt de suite, ook voor
gedrag dat nog niet gebouwd is. Een geval in `GEVALLEN` heeft de namen van
zijn controles (`regels`) en de code die in de pagina draait:

- `vers(B, H, opslag)`: een verse pagina van B bij H met een kind met een
  naam, en eventueel meer in de opslag (staten van een paar worden
  verzegeld zoals een apparaat ze bewaart);
- tikken zoals een kind: `klik('#id', '.oude-selector')`,
  `klikTekst(/Volgende/)`, `zet('e2e4')`, `startPotje()`,
  `startOefening('scan')`;
- meten: `rect('#board')`, `binnen(rect, B, H)`, `gelijk(a, b)`,
  `pagina()`, `laatsteOnder()`;
- `check(naam, 'wat er moet kloppen', voorwaarde)`.

De run duurt minuten, niet seconden. Ruim sessies op en lees nooit "het
nieuwste bestand" in `.playwright/out/`: andere sessies schrijven daar
ook.
