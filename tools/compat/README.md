# Compatibiliteitspoort

Ontwikkelgereedschap, geen onderdeel van de app. De poort controleert de
gebouwde `index.html` en `sw.js` tegen de oudste browsers die de app moet
draaien: iOS Safari 15.0, Safari 15, Chrome voor Android 120, Samsung
Internet 24 en de nieuwste Chrome, Safari en Firefox op de desktop. Een
stukje onbekende syntax stopt het hele script op de oudste iPhone, en een
emulatie in Playwright draait altijd een nieuwe engine; alleen deze poort
bewaakt die ondergrens.

`./test.sh` draait eerst de zelftest en dan de poort, en faalt bij elke
bevinding. Zonder node faalt `./test.sh`; ontbreekt `node_modules` of is
`package-lock.json` nieuwer, dan draait het eerst `npm ci` hier.

```
node tools/compat/selftest.mjs   # bewijst dat de poort de valkuilen vindt
node tools/compat/gate.mjs       # de poort op de build in de repo
```

Een bevinding wijst naar de bronregel in `src/`, met het kenmerk tussen
haken: `src/head.html:37:3: ... [css-focus-visible]`.

## Wat de poort controleert

- De build zelf: `index.html` en `sw.js` moeten gelijk zijn aan een verse
  build van `src/` (`build-stale`).
- JavaScript, in elk script-blok van elk JavaScript-type, in `sw.js`, in
  inline handlers (`onclick=`) en in `javascript:`-links:
  - syntax: de parser van ESLint (`syntax`);
  - syntax en ingebouwde functies: eslint-plugin-es-x. Van ES2022 en later
    staat elke regel aan, behalve wat `ES_ON_FLOOR` met de gegevens
    vrijgeeft; van ES2021 en ouder alleen de regels waarvan de gegevens
    zeggen dat het onderdeel ergens ontbreekt (`Atomics`,
    `SharedArrayBuffer`, RegExp lookbehind). Een nieuwe editie van es-x komt
    vanzelf mee;
  - web-API's op globale namen: eslint-plugin-compat, aangevuld met de
    MDN-gegevens voor statische leden (`AbortSignal.timeout`, ook achter
    `window.`, `self.` en `globalThis.`), leden van de bekende globale
    objecten (`document`, `navigator`, `window.crypto`) en globale namen
    (`CompressionStream`);
  - leden van web-API's op objecten van onbekend type (`el.inert`,
    `form.requestSubmit()`): een naam telt als hij in de gegevens alleen
    bestaat op interfaces die ergens op de ondergrens ontbreken. Bestaat de
    naam op meer interfaces, dan noemt het kenmerk de eerste op alfabet en
    de melding de rest;
  - HTML en CSS in strings: HTML-stukken gaan door de HTML-controle;
    strings voor `querySelector`, `matches` en `closest` door de
    selectorcontrole; strings voor `style`, `cssText`, `setProperty`,
    `setAttribute('style')` en `insertRule` door de CSS-controle; overige
    strings op een paar valkuilen (`:has(`, `@container`, `dvh` en
    verwanten, `color-mix(`).
- CSS, in `<style>`-blokken en `style`-attributen: doiuse (caniuse), plus
  de MDN-gegevens voor eigenschappen (een `-webkit-`-tweeling in dezelfde
  regel telt mee), waarden, functies, at-rules, mediavoorwaarden en
  selectors. Een selectorlijst met een selector die een browser niet kent,
  laat daar de hele regel vallen; dat meldt de poort apart
  (`css-selector-list`).
- HTML: elementen en attributen met de MDN-gegevens.

Gedeeltelijke ondersteuning is geen bevinding, behalve bij JavaScript.
Regel: een regel voor JavaScript-syntax of een ingebouwde functie gaat
alleen uit waar de MDN-gegevens volledige ondersteuning op elke browser van
de ondergrens tonen, want gedeeltelijke ondersteuning in JavaScript gooit
tijdens het draaien een fout. Daarom blijven klassevelden met een
beginwaarde verboden: MDN meldt voor Safari 14.1 tot 15.6 dat haakjes in
zo'n beginwaarde een `ReferenceError` kunnen geven (WebKit-bug 236843).

## Doorlaten

Twee manieren, elk met een smalle regel.

1. Per regel, voor een gebruik dat bewaakt is met een feature-test en een
   geteste terugval, of dat op een doelbrowser onschuldig anders werkt:

   ```
   code  // compat-allow <kenmerk>: <reden van minstens drie woorden>
   ```

   In CSS `/* ... */`, in HTML `<!-- ... -->`. Alleen in een echte
   opmerking, hoogstens een per regel, voor een kenmerk. Een toestemming
   zonder reden, zonder bevinding op die regel, of voor `syntax`,
   `css-syntax`, `build-stale` en `script-src` is zelf een bevinding. De
   opmerkingen van eslint en doiuse werken niet.
2. De tabel `NOT_APPLICABLE` in `gate.mjs`, alleen voor een kenmerk dat op
   die browsers geen betekenis heeft (`cursor` op een aanraakscherm,
   `playsinline` buiten iOS). De zelftest eist dat de gegevens elke regel
   nog steeds melden.

## Wat de poort niet ziet

- Een methode op een waarde waarvan het type onbekend is, als een oudere
  ingebouwde functie dezelfde naam heeft: `it.map()` op een Iterator lijkt
  op `Array.prototype.map`. Een methode van een nieuwere ingebouwde functie
  telt pas als hij wordt aangeroepen.
- Een lid van een web-API op een object van onbekend type, als de app
  dezelfde naam zelf gebruikt als sleutel in een object, als lid van een
  klasse of als methode die ze toewijst. De gegevens hebben ruim
  tweeduizend ledennamen die op de ondergrens ontbreken, met gewone namen
  ertussen (`to`, `level`, `move`); zonder dit filter meldde de controle
  166 keer een eigen veld van de app. Ook leden van `style` (dat zijn
  CSS-eigenschappen) en van `dataset` telt deze controle niet.
- CSS en selectors die in stukken worden samengesteld buiten de bekende
  plekken, behalve de paar valkuilen hierboven.
- Code die pas tijdens het draaien ontstaat: `eval`, `new Function`,
  `setTimeout` met een string.
- Verschillen in gedrag en opmaak die geen ontbrekende functie zijn. Daar
  zijn de schermafdrukken en de controle op een echt toestel voor.

## Gegevens bijwerken

De gegevens komen uit de vastgezette versies in `package-lock.json`
(`@mdn/browser-compat-data`, `caniuse-lite`). Bijwerken is een bewuste
stap: `npm update` hier, dan `./test.sh`. Faalt de zelftest op de tabel of
op `ES_ON_FLOOR`, dan zijn de gegevens veranderd en moet die regel weg of
anders.
