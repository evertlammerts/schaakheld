/* Gedeeld door de flowsuite en de tweeapparatensuite.

   Een app-instantie heeft een eigen DOM, opslag, adresbalk en eigen globals;
   de nep-server, de relay en de klok zijn van de wereld. herlaad() speelt een
   herstart na: de oude instantie sterft (haar timers lopen niet meer af, haar
   sockets gaan dicht) en een nieuwe start op dezelfde opslag.

   Regels uit plan.md die nog niet gebouwd zijn staan in de suite als
   nogNiet(naam, blok): het blok moet mislukken (een controle faalt of er
   valt een uitzondering), dan blijft de suite groen; slaagt het, dan wordt
   de suite rood. Een gebouwde regel heet regel(naam, blok), met hetzelfde
   blok. */

var ORAKEL = { nogNiet: 0, gebouwd: 0, apps: [], uit: function (t) { print(t); } };

function maakApparaat(naam, opties) {
  opties = opties || {};
  const doc = maakDocument(), opslag = opties.opslag || maakOpslag(), loc = opties.locatie || maakLocatie();
  const leven = { dood: false, sockets: [] };
  /* de timers en sockets van een gestorven instantie lopen niet door, net als
     bij een echte herstart; zonder dit schreef een oude Turbo-zet nog in de
     opslag van de nieuwe */
  const eigenTimer = function (fn, ms) { return setTimeout(function () { if (!leven.dood) fn(); }, ms); };
  const EigenSocket = function (url) { const s = new WebSocket(url); leven.sockets.push(s); return s; };
  const maak = new Function('document', 'localStorage', 'location', 'history', '__els', 'setTimeout', 'WebSocket',
    __APP_SRC + '\n;return function (code) { return eval(code); };');
  const ev = maak(doc, opslag, loc, loc.__history, doc.__els, eigenTimer, EigenSocket);
  const app = {
    naam, doc, els: doc.__els, opslag, location: loc, ev, leven,
    get(expr) { return ev('(' + expr + ')'); },
    el(id) { return doc.getElementById(id); },
    modal() { return doc.getElementById('modalBox').innerHTML; },
    scherm() { return app.modal().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90); },
    ziet(t) { return app.open() && app.modal().indexOf(t) >= 0; },
    open() { return !doc.getElementById('overlay').classList.contains('hidden'); },
    tik(id) { fire(doc.getElementById(id), 'click'); },
    fen() { return app.get('session && session.S ? toFEN(session.S) : null'); }
  };
  ORAKEL.apps.push(app);
  if (!opties.herstart) {
    ev('closeModal()');
    if (naam) ev('setPref("name", ' + JSON.stringify(naam) + ')');
  }
  return app;
}

function stopApparaat(app) {
  if (app.leven.dood) return;
  app.leven.dood = true;
  app.leven.sockets.forEach(function (s) { s.close(); });
}

function herlaad(app) {
  stopApparaat(app);
  return maakApparaat(app.naam, { opslag: app.opslag, locatie: app.location, herstart: true });
}

/* de wereld een stukje vooruit: timers en de microtaakwachtrij */
async function wacht(venster) {
  const tot = __klok + (venster == null ? 5000 : venster);
  for (let i = 0; i < 5; i++) {
    drainTot(400, tot);
    for (let j = 0; j < 40; j++) await null;
  }
}

/* ---------- een vaste datum ----------
   De app leest de tijd uit Date. Een test die een week, een dag of "drie
   dagen weg" nodig heeft, zet hier de datum; de virtuele klok van de timers
   loopt erbij op. */
var __EchteDate = Date, __datumBasis = null, __datumKlok = 0;
function zetDatum(iso) {
  __datumBasis = new __EchteDate(iso).getTime();
  __datumKlok = __klok;
  Date = function (...a) {
    if (!(this instanceof Date)) return new __EchteDate(__datumBasis + __klok - __datumKlok).toString();
    return a.length ? new __EchteDate(...a) : new __EchteDate(__datumBasis + __klok - __datumKlok);
  };
  Date.now = function () { return __datumBasis + __klok - __datumKlok; };
  Date.UTC = __EchteDate.UTC;
  Date.parse = __EchteDate.parse;
  Date.prototype = __EchteDate.prototype;
}
function echteDatum() { Date = __EchteDate; __datumBasis = null; }

/* ---------- handelingen zoals een kind ze doet ---------- */

/* een zet via het bord: eerst het stuk, dan het veld (de tikhandler) */
function zet(app, key) {
  return app.ev('(function () {' +
    'var m = legalMoves(session.S).find(function (x) { return moveKey(x) === ' + JSON.stringify(key) + '; });' +
    'if (!m) return false; onCell(m.from); onCell(m.to); return true; })()');
}

/* alles wat nu te tikken valt: in een open venster alleen het venster */
function knoppen(app) {
  if (app.open()) return app.el('modalBox').querySelectorAll('button, a, [data-tik]');
  const uit = [];
  const els = app.els;
  for (const id in els) {
    const e = els[id];
    for (const c of e.children || []) if (c.textContent && uit.indexOf(c) < 0) uit.push(c);
    if (e._html && !e.classList.contains('hidden')) {
      for (const k of e.querySelectorAll('button, a, [data-tik]')) if (uit.indexOf(k) < 0) uit.push(k);
    }
  }
  return uit;
}

/* een knop aantikken op wat erop staat; heeft hij zelf geen luisteraar, dan
   krijgt de lijst eromheen de tik, zoals een klik in de browser omhoog bubbelt */
function tikTekst(app, tekst) {
  const k = knoppen(app).find(function (b) { return !b.disabled && (b.textContent || '').indexOf(tekst) >= 0; });
  if (!k) return false;
  if (k._ev.click && k._ev.click.length) { fire(k, 'click', { target: k }); return true; }
  for (const id in app.els) {
    const host = app.els[id];
    if (host._qsa && host._qsa.knopen.indexOf(k) >= 0) fire(host, 'click', { target: k });
  }
  return true;
}

function heeftKlik(app, id) {
  const e = app.els[id];
  return !!(e && e._ev.click && e._ev.click.length);
}

function zichtbaar(app, id) {
  const e = app.els[id];
  return !!e && !e.classList.contains('hidden');
}

function tekstVan(app, id) {
  const e = app.els[id];
  if (!e) return '';
  const binnen = (e._html || e._text || '').replace(/<[^>]*>/g, ' ');
  const kids = (e.children || []).map(function (c) { return c.textContent || ''; }).join(' ');
  return (binnen + ' ' + kids).replace(/\s+/g, ' ').trim();
}

function toastTekst(app) {
  return zichtbaar(app, 'toast') ? tekstVan(app, 'toast') : '';
}

function opgeslagen(app, sleutel) {
  const v = app.opslag.getItem(sleutel);
  if (v == null) return null;
  try { return JSON.parse(v); } catch (e) { return v; }
}

function opThuis(app) { return zichtbaar(app, 'scr-home') && !zichtbaar(app, 'scr-play'); }
function opSpeelscherm(app) { return zichtbaar(app, 'scr-play') && !zichtbaar(app, 'scr-home'); }

/* naar een potje tegen Turbo, zoals een kind: de knop op Spelen, dan het
   niveau. Zolang Spelen nog de oude kaarten heeft (vaste opmaak, die de shim
   niet kent) opent de test het keuzevenster dat die kaart opent. */
async function startPotje(app, niveau) {
  if (heeftKlik(app, 'spelTurbo')) app.tik('spelTurbo'); else app.ev('startGameFlow()');
  await wacht();
  const knop = app.el('modalBox').querySelectorAll('[data-lvl="' + niveau + '"]')[0];
  if (!knop) return false;
  fire(knop, 'click', { target: knop });
  await wacht();
  return true;
}

async function startOefening(app, soort) {
  if (heeftKlik(app, 'oefen-' + soort)) app.tik('oefen-' + soort); else app.ev('startDrill(' + JSON.stringify(soort) + ')');
  await wacht();
}

/* Speurogen goed beantwoorden: elk aangevallen veld aantikken, dan Klaar */
async function scanGoed(app) {
  const doelen = app.get('session.task.targets.slice()');
  for (const sq of doelen) app.ev('onCell(' + sq + ')');
  tikTekst(app, 'Klaar');
  await wacht();
}

async function zetEnWacht(app, key) {
  const gelukt = zet(app, key);
  await wacht();
  return gelukt;
}

/* opgeven zoals een kind: de knop Opgeven (in de rij of achter ⋯), dan ja */
async function geefOp(app) {
  if (!tikTekst(app, 'Opgeven')) { app.tik('meerBtn'); await wacht(); tikTekst(app, 'Opgeven'); }
  await wacht();
  tikTekst(app, 'Ja');
  await wacht();
}

async function biedRemise(app) {
  if (!tikTekst(app, 'Remise')) { app.tik('meerBtn'); await wacht(); tikTekst(app, 'Remise'); }
  await wacht();
}

/* ---------- regels die nog niet gebouwd zijn ---------- */

async function orakelBlok(naam, blok, gebouwd) {
  const fouten = [];
  const check = function (wat, cond) { if (!cond) fouten.push(wat); return !!cond; };
  const voor = ORAKEL.apps.length;
  try {
    await blok(check);
  } catch (e) {
    fouten.push('uitzondering: ' + (e && e.message ? e.message : e));
  } finally {
    ORAKEL.apps.splice(voor).forEach(stopApparaat);
    echteDatum();
  }
  if (gebouwd) {
    if (fouten.length) { fails++; ORAKEL.uit('FAIL  ' + naam + '  (' + fouten.join('; ') + ')'); }
    else { ORAKEL.gebouwd++; ORAKEL.uit('PASS  ' + naam); }
  } else if (fouten.length) {
    ORAKEL.nogNiet++;
    ORAKEL.uit('NOG NIET GEBOUWD  ' + naam + '  (' + fouten[0] + ')');
  } else {
    fails++;
    ORAKEL.uit('FAIL  ' + naam + '  (staat als nog niet gebouwd, maar slaagt al: maak er regel() van)');
  }
}
function nogNiet(naam, blok) { return orakelBlok(naam, blok, false); }
function regel(naam, blok) { return orakelBlok(naam, blok, true); }

/* Bewijst het mechanisme zelf, met de eigen ok() van de suite. De uitvoer van
   de proefblokken gaat niet naar het scherm. */
async function orakelZelftest() {
  const f0 = fails, n0 = ORAKEL.nogNiet, g0 = ORAKEL.gebouwd, regels = [];
  const uit = ORAKEL.uit;
  ORAKEL.uit = function (t) { regels.push(t); };
  await nogNiet('[proef] een controle faalt', function (check) { check('nog niet', false); });
  await nogNiet('[proef] een uitzondering', function () { throw new Error('bestaat nog niet'); });
  const naVerwacht = { fails, nogNiet: ORAKEL.nogNiet };
  await nogNiet('[proef] slaagt al', function (check) { check('werkt', true); });
  const naOnverwacht = fails;
  await regel('[proef] gebouwd en kapot', function (check) { check('kapot', false); });
  const naKapot = fails;
  ORAKEL.uit = uit;
  fails = f0; ORAKEL.nogNiet = n0; ORAKEL.gebouwd = g0;
  ok('orakel: wat nog niet gebouwd is en faalt, houdt de suite groen',
    naVerwacht.fails === f0 && naVerwacht.nogNiet === n0 + 2 &&
    regels[0].indexOf('NOG NIET GEBOUWD') === 0 && regels[1].indexOf('bestaat nog niet') >= 0);
  ok('orakel: wat nog niet gebouwd is maar slaagt, maakt de suite rood',
    naOnverwacht === f0 + 1 && regels[2].indexOf('FAIL') === 0);
  ok('orakel: een gebouwde regel die faalt, maakt de suite rood', naKapot === f0 + 2);
}
