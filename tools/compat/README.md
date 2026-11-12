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
  - nieuwere syntax en ingebouwde functies vanaf ES2022, plus RegExp
    lookbehind: eslint-plugin-es-x;
  - web-API's op globale namen: eslint-plugin-compat, aangevuld met de
    MDN-gegevens voor statische leden (`AbortSignal.timeout`), leden van de
    bekende globale objecten (`document`, `navigator`, `window.crypto`) en
    globale namen (`CompressionStream`);
  - een vaste lijst DOM-leden met een eigen naam (`inert`, `showModal`,
    popover, `showPicker`, `requestSubmit` en meer, zie `DOM_MEMBERS`);
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

Gedeeltelijke ondersteuning is geen bevinding, behalve bij JavaScript: een
es-x-regel gaat alleen uit als MDN volledige ondersteuning op de hele
ondergrens toont (`ES_ON_FLOOR`), want een gat in JavaScript gooit een
fout. Daarom blijven klassevelden met een beginwaarde verboden: MDN meldt
voor Safari 14.1 tot 15.6 dat haakjes in zo'n beginwaarde een
`ReferenceError` kunnen geven (WebKit-bug 236843).

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
- DOM-leden op objecten van onbekend type die niet in `DOM_MEMBERS` staan.
  De MDN-gegevens hebben honderden namen die op de ondergrens ontbreken,
  maar ook gewone namen (`to`, `check`, `level`); een controle op alle
  namen meldt vooral de eigen velden van de app.
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
