# Tests

`./test.sh` draait alles en faalt als een suite rood is of afbreekt.

| Suite | Bestand | Draait op |
|---|---|---|
| engine | `test-engine.js` (perft-counts zijn heilig) | jsc |
| flow | `flow-test.js`, `orakel-flow.js` | jsc, DOM-shim |
| twee apparaten | `twee-apparaten.js`, `orakel-twee.js` | jsc, DOM-shim, gedeelde nep-server |
| server | `server/*_test.go`, ook `server/orakel_test.go` | go |
| layout | `layout/run.mjs` | WebKit via playwright-cli |
| compatibiliteit | `tools/compat/` (eigen README) | node |

## Het orakel: regels die nog niet gebouwd zijn

Elke regel uit `plan.md` heeft tests waarvan de naam begint met het
regelnummer, bijvoorbeeld `[1.2] pauze: ...`. Zolang een regel niet
gebouwd is, staat zijn test er als "nog niet gebouwd": het blok moet
falen (een controle die mislukt of een uitzondering), dan blijft de suite
groen; slaagt het toch, dan is de suite rood. Wie een regel bouwt, zet in
dezelfde commit zijn tests om en verandert niets aan het blok zelf; moet
het blok anders, dan is dat een ontwerpwijziging voor de lead.

| Suite | Nog niet gebouwd | Gebouwd |
|---|---|---|
| flow, twee apparaten | `nogNiet('[n.m] ...', async check => {...})` | `regel('[n.m] ...', ...)` |
| server | `nogNiet(t, "[n.m] ...", func(t tb) {...})` | het blok rechtstreeks met `t` |
| layout | het nummer staat niet in `GEBOUWD` | het nummer staat in `GEBOUWD` |

Elke suite bewijst dit mechanisme zelf (`orakelZelftest` in `harnas.js`,
`TestOrakelMechanisme`, `zelftest()` in `layout/run.mjs`).

## Een flowtest of tweeapparatentest schrijven

`harnas.js` geeft elke test een of meer verse app-instanties, elk met een
eigen DOM, opslag en adresbalk; de nep-server, de relay en de klok zijn
gedeeld.

- `maakApparaat(naam, { opslag })`: een kind met een naam, of met een
  opslag die je vooraf vult (een bewaard potje, een document van nu).
- `herlaad(app)`: de app gaat dicht (timers en sockets stoppen) en start
  opnieuw op dezelfde opslag en hetzelfde netwerk.
- `wacht(ms)`: timers en beloftes lopen door; standaard vijf seconden.
  `zagOoit(vraag, ms)` loopt in stapjes van 50 ms en zegt of de vraag
  onderweg ooit waar was (voor wat maar even in beeld is).
- Tikken zoals een kind: `zet(app, 'e2e4')` en `tikVeld(app, veld)` via
  de tikhandler van het bord, `tikTekst(app, 'Volgende')` op wat er op een
  knop staat, `app.tik(id)` op een element met een id, `tikEl(app, el)` op
  een element uit `querySelectorAll`, `vulIn(app, veld, tekst)` in een
  invoerveld, `startPotje(app, niveau)` en `startOefening(app, soort)`.
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
  `opThuis(app)`.
- Netwerk per apparaat: `geenNetwerk(app)` breekt de open lijnen (code
  1006) en laat `fetch` falen, nieuwe lijnen gaan niet open;
  `weerNetwerk(app)` zet het terug. Het blijft bij een herstart.
- `zetDatum('2026-11-16T09:00:00')` zet de datum voor de rest van de test;
  `Date` loopt daarna mee met de klok van de timers.
- In het blok: `check('wat er moet kloppen', voorwaarde)`.

Een opdracht klaarzetten mag via de binnenkant van de app, zoals de
bestaande tests doen; beantwoorden nooit. Een kind tikt, dus een test ook:
een fout die alleen in de tikhandler zit, bleef maanden onzichtbaar omdat
een test de functie erachter direct aanriep.

De namen die de tests nodig hebben en die nog niet bestaan (ids, het
formaat van een opgeslagen rondje, `nextStep`), staan in `plan.md` onder
"Names the tests rely on". Houd die lijst kort.

## De DOM-shim

`dom-shim.js` speelt de browser na zonder opmaak. Hij kent de vaste opmaak
van `src/head.html` (ids, klassen, tekst), zoekt met `querySelectorAll` in
de HTML die de app schrijft (enkelvoudige selectors), en onthoudt
`scrollTo` en `scrollIntoView`. Waar het op maten aankomt, is de shim
blind: dat hoort in de layoutcontroles.

Zoals een browser maakt elke `innerHTML` nieuwe elementen: met de klassen,
data en inhoud uit de opmaak, zonder de luisteraars van de oude. Een
element zonder id is een object, welke ouder je ook doorzoekt. `remove()`
haalt een element echt weg.

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
of doet een geval geen enkele controle, dan faalt de suite, ook voor een
regel die nog niet gebouwd is. Een geval in `GEVALLEN` heeft de namen van
zijn controles (`regels`) en de code die in de pagina draait:

- `vers(B, H, opslag)`: een verse pagina van B bij H met een kind met een
  naam, en eventueel meer in de opslag;
- tikken zoals een kind: `klik('#id', '.oude-selector')`,
  `klikTekst(/Volgende/)`, `zet('e2e4')`, `startPotje()`,
  `startOefening('scan')`;
- meten: `rect('#board')`, `binnen(rect, B, H)`, `gelijk(a, b)`,
  `pagina()`, `laatsteOnder()`;
- `check(naam, 'wat er moet kloppen', voorwaarde)`.

De run duurt ruim twee minuten. Ruim sessies op en lees nooit "het
nieuwste bestand" in `.playwright/out/`: andere agents schrijven daar ook.
