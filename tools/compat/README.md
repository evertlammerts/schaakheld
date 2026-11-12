# Compatibiliteitspoort

Ontwikkelgereedschap, geen onderdeel van de app. De poort controleert de
gebouwde `index.html` en `sw.js` tegen de oudste browsers die de app moet
draaien: iOS Safari 15.0, Safari 15, Chrome voor Android 120, Samsung
Internet 24 en de nieuwste Chrome, Safari en Firefox op de desktop. Een
stukje onbekende syntax stopt het hele script op de oudste iPhone, en een
emulatie in Playwright draait altijd een nieuwe engine; alleen deze poort
bewaakt die ondergrens.

`./test.sh` draait eerst de poort en dan de zelftest, en faalt bij elke
bevinding. Zonder node faalt `./test.sh`; ontbreekt `node_modules` of is
`package-lock.json` nieuwer, dan draait het eerst `npm ci` hier. ESLint 10
vraagt node 20.19, 22.13 of 24 en nieuwer.

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
  - statische leden van ingebouwde functies waar es-x geen regel voor heeft
    (`Error.captureStackTrace`), en leden van Window ook zonder `window.`
    ervoor (`navigation`, `cancelIdleCallback()`);
  - leden van web-API's op objecten van onbekend type (`el.inert`,
    `form.requestSubmit()`): een naam telt als hij in de gegevens alleen
    bestaat op interfaces die ergens op de ondergrens ontbreken. Bestaat de
    naam op meer interfaces, dan noemt het kenmerk de eerste op alfabet en
    de melding de rest. Een naam die de app zelf als methode definieert,
    telt niet; een naam die de app alleen als veld heeft (een sleutel in een
    object), telt niet bij lezen maar wel bij aanroepen (`r.bytes()`);
  - gebeurtenissen op naam: `addEventListener('scrollend', ...)` en
    `el.onscrollend`;
  - HTML en CSS in strings: HTML-stukken gaan door de HTML-controle;
    strings voor `querySelector`, `matches` en `closest` door de
    selectorcontrole; strings voor `style`, `cssText`, `setProperty`,
    `setAttribute('style')`, `insertRule` en `matchMedia` door de
    CSS-controle (ook als de waarde geen tekst is, telt de eigenschap); een
    gat in een template is nooit een syntaxfout, de vaste delen worden
    gelezen; overige strings op een paar valkuilen (`:has(`, `@container`,
    `dvh` en verwanten, `color-mix(`). Een onbekende tag in een string is
    tekst, geen opmaak.
- CSS, in `<style>`-blokken en `style`-attributen: doiuse (caniuse), plus
  de MDN-gegevens voor eigenschappen (een `-webkit-`-tweeling in dezelfde
  regel telt mee), waarden, functies (ook in eigen variabelen als
  `--kleur: color-mix(...)`), lengte-eenheden (`lh`), at-rules,
  mediavoorwaarden en selectors. Een selectorlijst met een selector die een browser niet kent,
  laat daar de hele regel vallen; dat meldt de poort apart
  (`css-selector-list`).
- HTML: elementen, attributen en hun waarden (`<input type="date">`,
  `hidden="until-found"`) met de MDN-gegevens; bij `<meta>` en `<link>`
  alleen het attribuut, want hun waarden zijn hints die een browser stil
  overslaat.

Gedeeltelijke ondersteuning is geen bevinding, behalve bij JavaScript.
Regel: een regel voor JavaScript-syntax of een ingebouwde functie gaat
alleen uit waar de MDN-gegevens volledige ondersteuning op elke browser van
de ondergrens tonen, want gedeeltelijke ondersteuning in JavaScript gooit
tijdens het draaien een fout. Daarom zijn alle velden van een instantie
verboden, met of zonder beginwaarde, openbaar en privé (`class A { x; }`,
`class B { #p; }`): MDN meldt voor Safari 14.1 tot 15.6 dat haakjes in de
beginwaarde van een veld een `ReferenceError` kunnen geven (WebKit-bug
236843), en es-x maakt geen onderscheid. Statische velden, privé-methoden
en `#x in obj` mogen wel.

## Doorlaten

Twee manieren, elk met een smalle regel.

1. Per regel, voor een gebruik dat bewaakt is met een feature-test en een
   geteste terugval, of dat op een doelbrowser onschuldig anders werkt:

   ```
   code  // compat-allow <kenmerk>: <reden van minstens drie woorden>
   ```

   In CSS `/* ... */`, in HTML `<!-- ... -->`. Alleen in een echte
   opmerking, hoogstens een per regel, voor een kenmerk. Een toestemming
   zonder reden of zonder bevinding op die regel is zelf een bevinding. De
   opmerkingen van eslint en doiuse werken niet.

   Nooit door te laten: nieuwe syntax, ook in een reguliere expressie als
   literal (`/(?<=a)b/`, een static-blok, `using`), want een oude browser
   leest dan het hele script niet en geen feature-test helpt; verder
   `syntax`, `css-syntax`, `build-stale` en `script-src`. Wat pas bij het
   draaien gooit, mag wel met een geteste terugval: `new RegExp('(?<=a)b')`
   in een `try`. Klassevelden leest de ondergrens wel in; die mogen met een
   toestemming.
2. De tabel `NOT_APPLICABLE` in `gate.mjs`, alleen voor een kenmerk dat op
   die browsers geen betekenis heeft (`cursor` op een aanraakscherm,
   `playsinline` buiten iOS). De zelftest eist dat de gegevens elke regel
   nog steeds melden.

## Wat de poort niet ziet

- Een methode op een waarde waarvan het type onbekend is, als een oudere
  ingebouwde functie dezelfde naam heeft: `it.map()` op een Iterator lijkt
  op `Array.prototype.map`. Een methode van een nieuwere ingebouwde functie
  telt pas als hij wordt aangeroepen; `const f = xs.toSorted; f.call(xs)`
  en `Reflect.apply(xs.toSorted, xs, [])` ziet de poort niet.
- De ledencontrole kent het type van een object niet; ze kent alleen
  namen. De gegevens hebben ruim tweeduizend ledennamen die op de
  ondergrens ontbreken, met gewone namen ertussen (`to`, `level`, `move`).
  Twee gevolgen:
  - Een eigen veld dat nergens als sleutel in een object staat, kan een
    melding geven onder de naam van een web-API (`spel.sync = 1` geeft
    `api.ServiceWorkerRegistration.sync`). Zet het veld dan ergens als
    sleutel neer, bijvoorbeeld bij zijn beginwaarde, of geef die regel een
    toestemming.
  - Een eigen methode verbergt die naam in het hele script, ook bij een
    DOM-object: met `{ show() {} }` ergens in de app ziet de poort
    `dialoog.show()` niet meer, en een eigen sleutel `inert` verbergt het
    lezen en zetten van `el.inert`.
  Leden van `style` (CSS-eigenschappen) en `dataset` telt deze controle
  niet.
- CSS en selectors die in stukken worden samengesteld buiten de bekende
  plekken, behalve de paar valkuilen hierboven; een eigenschap waarvan de
  naam zelf een variabele is (`el.style[naam]`, `setProperty(naam, ...)`).
- Eenheden buiten de lengtes (hoeken, tijden, resoluties).
- Een gebeurtenis die niet als `addEventListener('naam', ...)` of `on...`
  wordt gekoppeld.
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
