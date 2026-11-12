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
  opnieuw op dezelfde opslag.
- `wacht(ms)`: timers en beloftes lopen door; standaard vijf seconden.
- Tikken zoals een kind: `zet(app, 'e2e4')` via de tikhandler van het
  bord, `tikTekst(app, 'Volgende')` op wat er op een knop staat,
  `app.tik(id)` op een element met een id, `startPotje(app, niveau)` en
  `startOefening(app, soort)`.
- Kijken: `tekstVan(app, id)`, `zichtbaar(app, id)`, `toastTekst(app)`,
  `opgeslagen(app, sleutel)`, `app.fen()`, `opThuis(app)`.
- `zetDatum('2026-11-16T09:00:00')` zet de datum voor de rest van de test.
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

## Een layoutcontrole schrijven

`layout/run.mjs` serveert de build met `tools/dev.sh` op poort 8719
(`DEV_SH` wijst desgewenst een ander dev.sh aan) en draait elk geval in een
verse pagina van de sessie `fd-layout-webkit`. Een geval in `GEVALLEN`
heeft de namen van zijn controles (`regels`) en de code die in de pagina
draait:

- `vers(B, H, opslag)`: een verse pagina van B bij H met een kind met een
  naam, en eventueel meer in de opslag;
- tikken zoals een kind: `klik('#id', '.oude-selector')`,
  `klikTekst(/Volgende/)`, `zet('e2e4')`, `startPotje()`,
  `startOefening('scan')`;
- meten: `rect('#board')`, `binnen(rect, B, H)`, `gelijk(a, b)`,
  `pagina()`, `laatsteOnder()`;
- `check(naam, 'wat er moet kloppen', voorwaarde)`.

De run duurt ongeveer een minuut. Ruim sessies op en lees nooit "het
nieuwste bestand" in `.playwright/out/`: andere agents schrijven daar ook.
