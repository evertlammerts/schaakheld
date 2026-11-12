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
  /* het netwerk hoort bij het apparaat, niet bij de app: het blijft bij een herstart */
  const netwerk = opties.netwerk || { uit: false };
  const leven = { dood: false, sockets: [] };
  /* de timers en sockets van een gestorven instantie lopen niet door, net als
     bij een echte herstart; zonder dit schreef een oude Turbo-zet nog in de
     opslag van de nieuwe */
  const eigenTimer = function (fn, ms) { return setTimeout(function () { if (!leven.dood) fn(); }, ms); };
  const EigenSocket = function (url) {
    const s = netwerk.uit ? new GeenNetSocket(url) : new WebSocket(url);
    leven.sockets.push(s);
    return s;
  };
  const eigenFetch = function (url, o) {
    return netwerk.uit ? Promise.reject(new TypeError('Load failed')) : fetch(url, o);
  };
  const maak = new Function('document', 'localStorage', 'location', 'history', '__els', 'setTimeout', 'WebSocket', 'fetch',
    __APP_SRC + '\n;return function (code) { return eval(code); };');
  const ev = maak(doc, opslag, loc, loc.__history, doc.__els, eigenTimer, EigenSocket, eigenFetch);
  const app = {
    naam, doc, els: doc.__els, opslag, location: loc, ev, leven, netwerk,
    get(expr) { return ev('(' + expr + ')'); },
    el(id) { return doc.getElementById(id); },
    modal() { return doc.getElementById('modalBox').innerHTML; },
    /* de hele tekst van het open venster zoals een kind hem leest */
    scherm() { return app.open() ? doc.__tekst(doc.getElementById('modalBox')) : ''; },
    ziet(t) { return app.open() && app.modal().indexOf(t) >= 0; },
    open() { return !doc.getElementById('overlay').classList.contains('hidden'); },
    tik(id) { return tikEl(app, doc.__els[id], '#' + id); },
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
  return maakApparaat(app.naam, { opslag: app.opslag, locatie: app.location, netwerk: app.netwerk, herstart: true });
}

/* het netwerk van dit apparaat valt weg: open lijnen breken zonder
   sluitbericht, nieuwe gaan niet open, fetch faalt */
function geenNetwerk(app) {
  app.netwerk.uit = true;
  app.leven.sockets.forEach(function (s) { if (s.verbreek) s.verbreek(); });
}
function weerNetwerk(app) { app.netwerk.uit = false; }

/* de wereld een stukje vooruit: timers en de microtaakwachtrij */
async function wacht(venster) {
  const tot = __klok + (venster == null ? 5000 : venster);
  for (let i = 0; i < 5; i++) {
    drainTot(400, tot);
    for (let j = 0; j < 40; j++) await null;
  }
}

/* de klok in stapjes van 50 ms vooruit, met na elke stap de vraag: is het nu
   waar? Voor wat maar even in beeld is, zoals een zwevende winst of een zet
   die Turbo laat zien en weer terugneemt. */
async function zagOoit(vraag, venster) {
  const tot = __klok + (venster == null ? 5000 : venster);
  let gezien = !!vraag();
  while (__klok < tot) {
    const stap = Math.min(tot, __klok + 50);
    drainTot(400, stap);
    if (__klok < stap) __klok = stap;
    for (let j = 0; j < 40; j++) await null;
    if (vraag()) gezien = true;
  }
  return gezien;
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

/* een test die Math.random vastzet, laat dat niet na voor de tests erna */
var __echteRandom = Math.random;

/* ---------- handelingen zoals een kind ze doet ----------
   Een kind tikt alleen wat het ziet: een element dat zelf of via een ouder
   verborgen is, of dat achter een open venster ligt, laat de test falen. */

/* waarom dit element nu niet te tikken is, of '' als het wel kan */
function tikbaar(app, el) {
  if (!el) return 'bestaat niet';
  const p = app.doc.__pad(el), venster = app.el('overlay');
  if (!p) return 'hangt niet in de pagina';
  if (p.verborgen) return 'is verborgen';
  /* de opmaak verbergt de kop op het speelscherm (body.speelt header.top), en die kent de shim niet */
  if (app.doc.body.classList.contains('speelt') && p.tags.indexOf('header') >= 0) return 'staat in de kop, die het speelscherm verbergt';
  if (app.open() && el !== venster && p.keten.indexOf(venster) < 0) return 'ligt achter het open venster';
  return '';
}

/* heeft het element zelf geen luisteraar, dan krijgt de eerste ouder met een
   luisteraar de tik, zoals een klik in de browser omhoog bubbelt; een knop die
   uit staat doet niets, net als echt */
function tikEl(app, el, naam) {
  const waarom = tikbaar(app, el);
  if (waarom) throw new Error('tik op ' + (naam || (el && el.id)) + ': ' + waarom);
  if (el.disabled) return false;
  if (el._ev.click && el._ev.click.length) { fire(el, 'click', { target: el }); return true; }
  for (const o of app.doc.__pad(el).keten) {
    if (o._ev && o._ev.click && o._ev.click.length) { fire(o, 'click', { target: el }); return true; }
  }
  return true;
}

/* een veld invullen zoals een kind typt: alleen een veld dat het ziet */
function vulIn(app, el, tekst) {
  const waarom = tikbaar(app, el);
  if (waarom) throw new Error('typen in ' + (el && el.id) + ': ' + waarom);
  el.value = tekst;
  fire(el, 'input', { target: el });
}

/* een tik op een veld van het bord: alleen als het bord in beeld is */
function tikVeld(app, sq) {
  const waarom = tikbaar(app, app.els.board);
  if (waarom) throw new Error('tik op het bord: ' + waarom);
  app.ev('onCell(' + sq + ')');
}

/* een zet via het bord: eerst het stuk, dan het veld (de tikhandler) */
function zet(app, key) {
  const m = app.get('(function () { var m = legalMoves(session.S).find(function (x) { return moveKey(x) === ' +
    JSON.stringify(key) + '; }); return m ? [m.from, m.to] : null; })()');
  if (!m) return false;
  tikVeld(app, m[0]);
  tikVeld(app, m[1]);
  return true;
}

/* alles wat nu te tikken valt: knoppen, links en [data-tik] in beeld */
function knoppen(app) {
  const uit = [], kandidaten = [];
  const voeg = function (k) { if (k && kandidaten.indexOf(k) < 0) kandidaten.push(k); };
  const bronnen = app.open() ? [app.el('modalBox')] : Object.keys(app.els).map(function (id) { return app.els[id]; });
  for (const e of bronnen) {
    if (e._tag === 'button' || e._tag === 'a' || (e._attrs && 'data-tik' in e._attrs)) voeg(e);
    for (const c of e.children || []) if (c.textContent) voeg(c);
    if (e._html) for (const k of e.querySelectorAll('button, a, [data-tik]')) voeg(k);
  }
  for (const k of kandidaten) if (!tikbaar(app, k)) uit.push(k);
  return uit;
}
function knopTekst(app, k) { return app.doc.__tekst(k); }
function knopTeksten(app) { return knoppen(app).map(function (k) { return knopTekst(app, k); }); }

function vindKnop(app, tekst) {
  return knoppen(app).find(function (b) { return !b.disabled && knopTekst(app, b).indexOf(tekst) >= 0; }) || null;
}
function kanTikken(app, tekst) { return !!vindKnop(app, tekst); }

/* een knop aantikken op wat erop staat */
function tikTekst(app, tekst) {
  const k = vindKnop(app, tekst);
  if (!k) throw new Error('geen knop "' + tekst + '" in beeld die iets doet');
  return tikEl(app, k, '"' + tekst + '"');
}

function heeftKlik(app, id) {
  const e = app.els[id];
  return !!(e && e._ev.click && e._ev.click.length);
}

/* in beeld: het element en al zijn ouders zijn zichtbaar */
function zichtbaar(app, id) {
  const e = app.els[id];
  const p = e && app.doc.__pad(e);
  return !!p && !p.verborgen;
}

/* het binnenste element dat beide bevat, zoals de balk om de terugknop en ⋯ */
function gedeeldeOuder(app, idA, idB) {
  const a = app.els[idA] && app.doc.__pad(app.els[idA]), b = app.els[idB] && app.doc.__pad(app.els[idB]);
  if (!a || !b) return null;
  return a.keten.find(function (x) { return b.keten.indexOf(x) >= 0; }) || null;
}

/* een trofeenaam mag een zacht afbreekstreepje hebben; een kind ziet het pas als de naam afbreekt */
function zonderZacht(t) { return String(t).replace(/\u00ad/g, ''); }

/* de tekst in het element die een kind ziet (verborgen delen tellen niet) */
function tekstVan(app, id) {
  const e = app.els[id];
  return e ? app.doc.__tekst(e) : '';
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
/* de spelknoppen staan op Spelen: een kind dat op een andere tab staat, tikt eerst Spelen */
function naarSpelen(app) {
  if (zichtbaar(app, 'scr-home') && !zichtbaar(app, 'view-spelen')) app.tik('tabSpelen');
}

async function startPotje(app, niveau) {
  if (heeftKlik(app, 'spelTurbo')) { naarSpelen(app); app.tik('spelTurbo'); } else app.ev('startGameFlow()');
  await wacht();
  const knop = app.el('modalBox').querySelectorAll('[data-lvl="' + niveau + '"]')[0];
  if (!knop) return false;
  tikEl(app, knop, 'niveau ' + niveau);
  await wacht();
  return true;
}

async function startOefening(app, soort) {
  if (heeftKlik(app, 'oefen-' + soort)) { naarSpelen(app); app.tik('oefen-' + soort); } else app.ev('startDrill(' + JSON.stringify(soort) + ')');
  await wacht();
}

/* Speurogen goed beantwoorden: elk aangevallen veld aantikken, dan Klaar */
async function scanGoed(app) {
  const doelen = app.get('session.task.targets.slice()');
  for (const sq of doelen) tikVeld(app, sq);
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
  if (!kanTikken(app, 'Opgeven')) { app.tik('meerBtn'); await wacht(); }
  tikTekst(app, 'Opgeven');
  await wacht();
  tikTekst(app, 'Ja');
  await wacht();
}

async function biedRemise(app) {
  if (!kanTikken(app, 'Remise')) { app.tik('meerBtn'); await wacht(); }
  tikTekst(app, 'Remise');
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
    Math.random = __echteRandom;
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
  harnasZelftest();
  /* de nep-server zegt "kamer weg" zoals room.go, en dat is iets anders dan geen netwerk */
  const s = new WebSocket('ws://test.local/v1/room/ws'), g = new GeenNetSocket('ws://test.local/v1/room/ws');
  let open = false, dicht = null, gOpen = false, gDicht = null;
  s.onopen = function () { open = true; s.send(JSON.stringify({ room: 'bestaat-niet', seat: 'tok' })); };
  s.onclose = function (e) { dicht = e; };
  g.onopen = function () { gOpen = true; };
  g.onclose = function (e) { gDicht = e; };
  await wacht(100);
  ok('nep-server: een kamer die er niet is, sluit na het openen met 1008 "onbekend"',
    open && !!dicht && dicht.code === 1008 && dicht.reason === 'onbekend' && dicht.wasClean === true);
  ok('nep-server: zonder netwerk gaat de lijn nooit open en sluit met 1006 zonder reden',
    !gOpen && !!gDicht && gDicht.code === 1006 && gDicht.reason === '' && gDicht.wasClean === false);
}

/* De harnas liegt niet over wat een kind ziet: bewezen op een eigen pagina,
   zonder app. */
function harnasZelftest() {
  const doc = maakDocument('<header><span class="xp"><b id="num">5</b> XP</span><button id="kopKnop">Kop</button></header>' +
    '<section id="speel"><div id="balk" class="hidden"><button id="skip">Speel maar</button></div>' +
    '<div class="rij"><button id="zie">Zie mij</button></div><div class="hidden"><button>Verstopt</button></div></section>' +
    '<div id="overlay" class="hidden"><div id="modalBox"></div></div>');
  const app = { doc, els: doc.__els, el: function (id) { return doc.getElementById(id); },
    open: function () { return !doc.getElementById('overlay').classList.contains('hidden'); } };
  const gooit = function (f) { try { f(); return false; } catch (e) { return true; } };
  let tikken = 0;
  app.els.skip.addEventListener('click', function () { tikken++; });
  ok('harnas: een knop in een verborgen ouder is niet te tikken', !kanTikken(app, 'Speel maar') &&
    gooit(function () { tikTekst(app, 'Speel maar'); }) && gooit(function () { tikEl(app, app.els.skip); }) && tikken === 0);
  ok('harnas: een knop in een verborgen blok zonder id is niet te tikken', !kanTikken(app, 'Verstopt'));
  doc.body.classList.add('speelt');
  ok('harnas: op het speelscherm is een knop in de kop niet te tikken', gooit(function () { tikEl(app, app.els.kopKnop); }));
  doc.body.classList.remove('speelt');
  ok('harnas: thuis wel', !gooit(function () { tikEl(app, app.els.kopKnop); }));
  app.els.balk.classList.remove('hidden');
  ok('harnas: zichtbaar gemaakt wel', kanTikken(app, 'Speel maar') && tikTekst(app, 'Speel maar') && tikken === 1);
  const lang = 'Typ deze vier woorden in de app. Of scan de code. ' + 'lamp boom kat vis '.repeat(6) + 'Werkt nog 9 minuten.';
  app.el('modalBox').innerHTML = '<h2>Jouw code</h2><p>' + lang + '</p><p class="hidden">Deze code is op.</p>' +
    '<p>&#39;lamq&#39; ken ik niet &amp; zo</p><button id="ok">Klaar</button>';
  app.el('overlay').classList.remove('hidden');
  const tekst = doc.__tekst(app.el('modalBox'));
  ok('harnas: de hele tekst van een venster, zonder verborgen deel, met tekens zoals ze er staan',
    tekst.length > 150 && /Werkt nog 9 minuten\.$/.test(tekst.split(' \'lamq')[0]) && !/Deze code is op/.test(tekst) &&
    /'lamq' ken ik niet & zo/.test(tekst));
  ok('harnas: met een open venster ligt de rest erachter', gooit(function () { tikEl(app, app.els.zie); }) &&
    !gooit(function () { tikEl(app, app.els.ok); }));
  app.el('modalBox').innerHTML = '<button class="b">Nog eens</button>';
  let keer = 0;
  const bind = function () { app.el('modalBox').querySelectorAll('.b')[0].addEventListener('click', function () { keer++; }); };
  bind();
  app.el('modalBox').innerHTML = '<button class="b">Nog eens</button>';
  bind();
  tikTekst(app, 'Nog eens');
  ok('harnas: twee keer dezelfde HTML geeft nieuwe knoppen, dus een tik telt een keer', keer === 1);
  ok('harnas: de tekst naast een element', doc.__ouderTekst(app.els.num) === '5 XP');
  const balk = gedeeldeOuder(app, 'skip', 'zie');
  ok('harnas: het binnenste element om twee elementen heen', !!balk && doc.__tekst(balk) === 'Speel maar Zie mij');
  /* querySelectorAll ziet ook wat de app met appendChild toevoegde, in de volgorde van de pagina */
  const d2 = maakDocument('<div id="onder"><button>Hint</button><div class="rij"><button>Klaar</button></div>' +
    '<div id="rij"></div><button>Laatste</button></div>');
  const onder = d2.getElementById('onder');
  const volgende = d2.createElement('button');
  volgende.textContent = 'Volgende';
  volgende.dataset.stap = '2';
  d2.getElementById('rij').appendChild(volgende);
  const tussen = d2.createElement('button');
  tussen.textContent = 'Tussen';
  onder.querySelectorAll('.rij')[0].appendChild(tussen);
  const namen = onder.querySelectorAll('button').map(function (b) { return b.textContent; }).join(' ');
  ok('shim: aangehangen knoppen tellen mee, in de volgorde van de pagina', namen === 'Hint Klaar Tussen Volgende Laatste');
  ok('shim: ook in het hele document en op hun data', d2.querySelectorAll('[data-stap="2"]')[0] === volgende);
  /* het document is de pagina zoals hij nu is */
  const zwevend = d2.createElement('div');
  zwevend.className = 'zweef';
  d2.body.appendChild(zwevend);
  d2.getElementById('rij').innerHTML = '<span id="weg">x</span>';
  d2.getElementById('rij').innerHTML = '';
  ok('shim: het document vindt wat aan body hangt, niet wat weggehaald is, en null zonder treffer',
    d2.querySelectorAll('.zweef')[0] === zwevend && d2.querySelectorAll('#weg').length === 0 &&
    d2.querySelector('.bestaat-niet') === null);
}
