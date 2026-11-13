/* Orakel, tweeapparatentests voor vriendenpotjes die dagen doorlopen. Een potje
   tussen vrienden staat in één versleutelde staat per paar op de server, die elk
   apparaat bijhoudt; een zet wacht daar tot de ander de app opent. Elke testnaam begint
   met zijn regelnummer. Gebruikt test/harnas.js, de tweeapparatensuite (speel, typ)
   en test/orakel-twee.js (wordenVrienden, nodigUit, zegt). Dagen gaan op de klok van
   de harnas: de apparaten en de nep-server schuiven samen, er wordt nooit echt
   gewacht. */

var DAG = 864e5, UUR = 36e5;
/* een rustig potje: geen slag, geen schaak en geen stand twee keer; plek n is de n-de halve zet */
var RUSTIG = ['g2g3', 'a7a6', 'c2c3', 'c7c6', 'e2e3', 'd8b6', 'f1c4', 'a8a7', 'b1a3', 'b6b3', 'd2d4', 'e8d8', 'd1g4', 'g7g6',
  'g4e6', 'b7b6', 'a3b1', 'd8c7', 'h2h3', 'f7f5', 'b1a3', 'f8g7', 'c4f1', 'b3b4', 'e6e4', 'd7d5', 'f1e2', 'b4a5', 'a1b1', 'g7f8',
  'e1d2', 'e7e6', 'd2c2', 'a5b4', 'e4g4', 'b4b5', 'e2d3', 'f8e7', 'b2b4', 'e7f6', 'c2b3', 'c7b7', 'g4d1', 'c6c5'];
/* wit geeft mat in de zevende halve zet; wit zet pat in de negentiende */
var MAT_WIT = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
var PAT_WIT = ['e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'h2h4', 'a6h6', 'a5c7', 'f7f6', 'c7d7', 'e8f7', 'd7b7', 'd8d3',
  'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6'];

function zetOp(ms) { zetDatum(new __EchteDate(ms).toISOString()); }
/* De wereld ms vooruit in stapjes. wacht() laat eerst alle timers van zijn venster lopen en pas daarna de
   beloftes; zo leest een apparaat de bus soms voordat een ander zijn schrijfactie afmaakte, en plant het zijn
   volgende keer pas na het venster. In stapjes van 2,5 s, met de klok mee, gaat het zoals op een echt apparaat. */
async function tijd(ms) {
  const tot = __klok + ms;
  while (__klok < tot) {
    const stap = Math.min(tot, __klok + 2500);
    drainTot(400, stap);
    if (__klok < stap) __klok = stap;
    for (let j = 0; j < 200; j++) await null;
  }
}
function schuifKlok(ms) { zetOp(Date.now() + ms); }
/* zoals tijd(), maar in stapjes van 50 ms: een schrijfactie komt aan het eind van zijn stap bij de nep-server aan, dus
   alleen met kleine stappen liggen twee schrijfacties echt minder dan een seconde uit elkaar */
async function tijdFijn(ms) {
  const tot = __klok + ms;
  while (__klok < tot) {
    const stap = Math.min(tot, __klok + 50);
    drainTot(400, stap);
    if (__klok < stap) __klok = stap;
    for (let j = 0; j < 50; j++) await null;
  }
}
/* schrijfacties naar de staat van een paar: houd(bus) laat de volgende onderweg tot laat(bus); kwijt(bus) laat de
   server de volgende krijgen, maar het antwoord raakt kwijt */
function onderweg() {
  const echt = fetch, vast = {};
  fetch = function (url, o) {
    const body = /\/v1\/potje$/.test(url) && o && typeof o.body === "string" ? JSON.parse(o.body) : null;
    const v = body && body.blob ? vast[body.bus] : null;
    if (v && !v.gedaan && v.modus === "houd") { v.gedaan = true; return new Promise(function (k) { v.laat = function () { k(echt(url, o)); }; }); }
    if (v && !v.gedaan && v.modus === "kwijt") { v.gedaan = true; return echt(url, o).then(function () { throw new Error("antwoord kwijt"); }); }
    return echt(url, o);
  };
  return { houd: function (bus) { vast[bus] = { modus: "houd" }; }, kwijt: function (bus) { vast[bus] = { modus: "kwijt" }; },
    laat: function (bus) { if (vast[bus] && vast[bus].laat) vast[bus].laat(); }, stop: function () { fetch = echt; } };
}
/* Mees daagt Fien uit terwijl zij weg is; Fien opent een uur later en ziet de uitdaging; Mees blijft open */
async function uitdagingVanMees() {
  zetDatum("2026-11-14T10:00:00");
  const mees = maakApparaat("Mees"), fien0 = maakApparaat("Fien");
  const fid = await wordenVrienden(mees, fien0);
  stopApparaat(fien0);
  await daagUit(mees, fid, "Fien");
  schuifKlok(UUR);
  const fien = await opent(fien0);
  return { mees, fien, fid };
}

/* het kind kan nu zetten: het speelscherm staat open en het bord wacht op zijn zet */
function magZetten(app) { return opSpeelscherm(app) && app.get('BD.mode') === 'move'; }

/* de volgende zet uit de lijst, door wie op het speelscherm aan zet is */
async function zetUit(lijst, a, b) {
  const x = magZetten(a) ? a : (b && magZetten(b) ? b : null);
  if (!x) throw new Error('niemand op het speelscherm kan zetten');
  const k = lijst[x.get('session.S.hist.length')];
  if (!zet(x, k)) throw new Error('de zet ' + k + ' kan niet');
  await wacht();
  return x;
}
/* rustige zetten tot er minstens n gespeeld zijn en `wie` aan zet is */
async function potjeTot(a, b, n, wie) {
  for (let i = 0; i < RUSTIG.length; i++) {
    if (magZetten(wie) && wie.get('session.S.hist.length') >= n) return;
    await zetUit(RUSTIG, a, b);
  }
  throw new Error('testopzet: het rustige potje is op');
}

/* wat thuis bij het openen over de kaart kan liggen: een nieuw level of een trofee */
function vierWeg(app) {
  for (let i = 0; i < 8 && app.open(); i++) {
    if (app.ziet('Level omhoog')) app.tik('lvlOk');
    else if (app.ziet('id="trofOk"')) app.tik('trofOk');
    else break;
  }
}
/* het kind opent de app: een nieuwe instantie op dezelfde opslag, die even rondkijkt */
async function opent(app) {
  const x = herlaad(app);
  vierWeg(x);
  await tijd(20000);
  vierWeg(x);
  return x;
}

/* twee kinderen worden vrienden en spelen meteen een potje zoals nu: uitnodigen, ja, starten */
async function vriendenpotje(a, b) {
  const fid = await wordenVrienden(a, b);
  await nodigUit(a);
  await b.ev('friendPoll()');
  await wacht();
  b.tik('invJa');
  await wacht();
  a.tik('mpGo');
  await wacht();
  return fid;
}
/* nog een vriend erbij; het id van de nieuwe vriendschap, ook als `a` al vrienden had */
async function vriendErbij(a, b) {
  const voor = a.get('Object.keys(P.friends)');
  await wordenVrienden(a, b);
  return a.get('Object.keys(P.friends)').filter(function (k) { return voor.indexOf(k) < 0; })[0];
}
/* uitnodigen terwijl de vriend er niet is, en er een uitdaging voor later van maken */
async function daagUit(van, fid, naam) {
  tikInRij(van, fid, 'Uitnodigen');
  await wacht();
  tikTekst(van, 'Daag ' + naam + ' uit voor later');
  await wacht();
  if (kanTikken(van, 'Naar huis')) { tikTekst(van, 'Naar huis'); await wacht(); }
}

/* een tweede apparaat van hetzelfde kind, gekoppeld zoals aan het eind van de koppelstap */
async function tweedeApparaat(app) {
  await app.ev('ensureAccount(); syncNow()');
  await wacht();
  const ander = maakApparaat(null);
  ander.ev('finishLink(' + app.get('JSON.stringify(ACC)') + ', null)');
  await wacht();
  return ander;
}

/* de potjes met andere kinderen zoals het apparaat ze kent: bewaard, en die met vrienden uit de staat van hun paar */
function samenZicht(app) { return { v: 1, games: app.get('samenRauw() || {}') }; }
/* een server van voor de staten met een versie: geen route voor een potje, en de check zegt geen tijd */
function oudeServer(echt) {
  return function (url, o) {
    if (/\/v1\/potje$/.test(url)) return Promise.resolve({ status: 404, json: function () { return Promise.resolve({}); } });
    if (/\/v1\/bus\/check$/.test(url)) return echt(url, o).then(function (r) { return { status: r.status, json: function () { return r.json().then(function (d) { delete d.nu; return d; }); } }; });
    return echt(url, o);
  };
}
/* het adres van de staat van het paar: het bewijs komt uit K, het adres is de sha256 ervan. Er is één staat per paar;
   eigen of van de vriend maakt niet meer uit. */
function potjesbus(app, fid) {
  return app.ev('(async function () { return (await paarBus(P.friends[' + JSON.stringify(fid) + '])).bus; })()');
}
/* de staat op de server zoals een apparaat van het paar hem opent; null als er niets staat of hij niet te lezen is */
function busInhoud(app, fid, bus) {
  return __server.potjes[bus] ? app.ev('blobNaarStaat(P.friends[' + JSON.stringify(fid) + '].k, ' + JSON.stringify(__server.potjes[bus].blob) + ')') :
    Promise.resolve(null);
}
/* wat de staat zegt over het potje: het id, potje of uitdaging, de uitslag (nee voor een Nu niet), het aantal zetten,
   en wie het einde kent; null als er geen potje of uitdaging staat */
async function busZegt(app, fid) {
  const s = await busInhoud(app, fid, await potjesbus(app, fid)), sp = s && s.spel;
  return sp ? { gameId: sp.id, state: sp.fase === 'uitdaging' || sp.fase === 'nee' ? 'uitdaging' : 'potje',
    uitslag: sp.fase === 'nee' ? 'nee' : sp.uitslag ? sp.uitslag.soort : null, zetten: sp.zetten.length, weet: sp.weet, bod: sp.bod } : null;
}
/* elke schrijfactie naar de staat van een paar: het adres, en of de blob leeg was */
function potjesLog() {
  const log = [], echt = fetch;
  fetch = function (url, o) {
    if (/\/v1\/potje$/.test(url)) { const b = JSON.parse(o.body); log.push({ bus: b.bus, leeg: !b.blob }); }
    return echt(url, o);
  };
  return { log, stop: function () { fetch = echt; } };
}
/* het venster dat er staat wegtikken met zijn eerste knop */
async function vensterWeg(app) {
  if (app.open()) { tikEl(app, app.el('modalBox').querySelectorAll('button')[0], 'de knop van het venster'); await wacht(); }
}

function tellers(x) { return x.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline])'); }
function nogEen(voor, winst) { const v = JSON.parse(voor); return JSON.stringify([v[0] + 1, v[1] + (winst ? 1 : 0)]); }
function weekOnline(x) { return x.get('wkGet(curWeek(), "online")'); }

/* tijdens fn geeft de willekeur van het apparaat alleen dit ene byte */
async function metVasteWillekeur(byte, fn) {
  const echt = crypto.getRandomValues;
  crypto.getRandomValues = function (a) { for (let i = 0; i < a.length; i++) a[i] = byte; return a; };
  try { return await fn(); } finally { crypto.getRandomValues = echt; }
}

/* een potje van 22 halve zetten; Mees zet, Fien is weg, en Mees biedt remise aan */
async function aanbodVanMees(mees, fien) {
  const fid = await vriendenpotje(mees, fien);
  await potjeTot(mees, fien, 22, mees);
  stopApparaat(fien);
  await zetUit(RUSTIG, mees);
  await biedRemise(mees);
  await wacht(5000);
  return fid;
}

async function orakelTwee6() {
  /* ================= vriendenpotjes die dagen doorlopen ================= */

  await regel('[6.1] na een zet staat het potje in de staat van het paar: met K te lezen, dezelfde zetten, wit als rol en geen naam', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    const wit = await zetUit(RUSTIG, mees, fien);
    const bus = await potjesbus(wit, fid);
    const s = await busInhoud(wit, fid, bus), r = vriendenpotjeMet(wit, fid);
    const rauw = __server.potjes[bus] ? await wit.ev('openJSON(P.friends[' + JSON.stringify(fid) + '].k, "paar", b64urlBytes(' + JSON.stringify(__server.potjes[bus].blob) + '))') : null;
    check('de staat staat op de server', !!__server.potjes[bus]);
    check('met K te lezen, als potje', !!s && !!s.spel && s.spel.fase === 'potje' && !!r && s.spel.id === r.gameId);
    check('dezelfde zetten', !!s && JSON.stringify(s.spel.zetten) === JSON.stringify([RUSTIG[0]]));
    check('wit staat erin als rol van de vriendschap', !!s && (s.spel.wit === 'a' || s.spel.wit === 'b') &&
      (s.spel.wit === wit.get('myRole(P.friends[' + JSON.stringify(fid) + '])')) === (wit.get('MP.myColor') === 'w'));
    check('geen naam erin', !!rauw && !/Mees|Fien/.test(JSON.stringify(rauw)));
  });

  await regel('[6.1] V7 de staat van het paar is na 40 halve zetten even lang als na 2', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, magZetten(mees) ? mees : fien);
    const bussen = [await potjesbus(mees, fid, true), await potjesbus(mees, fid, false)];
    const lengtes = function () { return bussen.map(function (b) { return __server.potjes[b] ? __server.potjes[b].blob.length : 0; }); };
    const na2 = lengtes();
    while (mees.get('session.S.hist.length') < 40) await zetUit(RUSTIG, mees, fien);
    const na40 = lengtes();
    check('na 2 halve zetten staat de staat er', na2[0] > 0 && na2[1] === na2[0]);
    check('na 40 halve zetten precies even lang', na40[0] === na2[0] && na40[1] === na2[0]);
  });


  await regel('[6.2] Mees zet en doet de app dicht; Fien opent een dag later en is aan zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    const n = mees.get('session.S.hist.length');
    await zetUit(RUSTIG, mees);
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('de kaart: Mees heeft gezet, Fien is aan zet', /je potje met Mees/i.test(kaart) && /Mees heeft gezet\. Jij bent aan zet\./.test(kaart));
    fien.tik('verderKaart');
    await wacht();
    check('de zet van Mees staat op het bord en Fien kan zetten', fien.get('session.S.hist.length') === n + 1 && magZetten(fien));
  });

  await regel('[6.2] de server herstart en is de staat kwijt tussen de zet van Mees en het openen van Fien: zodra Mees opent, krijgt Fien de zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    await zetUit(RUSTIG, mees);
    const bus = await potjesbus(mees, fid, true);
    stopApparaat(mees);
    __herstartServer();
    __potjesKwijt();
    schuifKlok(DAG);
    fien = await opent(fien);
    check('zonder de staat wacht Fien nog op Mees', /Mees is aan zet/.test(tekstVan(fien, 'verder')) && !/heeft gezet/.test(tekstVan(fien, 'verder')));
    mees = await opent(mees);
    check('Mees schreef de staat terug', !!__server.potjes[bus]);
    await tijd(20000);
    check('nu heeft Fien de zet van Mees', /Mees heeft gezet\. Jij bent aan zet\./.test(tekstVan(fien, 'verder')));
  });

  await regel('[6.2] allebei zetten zonder netwerk en komen later terug: geen zet raakt kwijt', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    const n = mees.get('session.S.hist.length');
    stopApparaat(fien);
    stopApparaat(mees);
    schuifKlok(DAG);
    mees.netwerk.uit = true;
    mees = await opent(mees);
    check('Mees: het potje staat er, zonder verbinding', /Er is nu geen verbinding\./.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, mees);
    check('de zet van Mees staat bewaard', vriendenpotjeMet(mees, fid).moves.length === n + 1);
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet de zet nog niet', /Mees is aan zet/.test(tekstVan(fien, 'verder')));
    mees.netwerk.uit = false;
    mees = await opent(mees);
    await tijd(20000);
    check('zodra Mees met netwerk opent, wel', /Mees heeft gezet\. Jij bent aan zet\./.test(tekstVan(fien, 'verder')));
    stopApparaat(mees);
    geenNetwerk(fien);
    fien.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, fien);
    stopApparaat(fien);
    fien.netwerk.uit = false;
    schuifKlok(DAG);
    fien = await opent(fien);
    mees = await opent(mees);
    check('Mees heeft de zet van Fien', /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(mees, 'verder')));
    check('en dezelfde zetten als Fien', JSON.stringify(vriendenpotjeMet(mees, fid).moves) === JSON.stringify(vriendenpotjeMet(fien, fid).moves) &&
      vriendenpotjeMet(mees, fid).moves.length === n + 2);
  });

  await regel('[6.2] zonder netwerk zegt de kaart wat het kind wel kan, en na een zet zegt de strook dat de zet hier bewaard is en naar de vriend gaat zodra er verbinding is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    stopApparaat(mees);
    schuifKlok(DAG);
    mees.netwerk.uit = true;
    mees = await opent(mees);
    check('de kaart op de eigen beurt, met Speel verder', /Er is nu geen verbinding\. Je kunt wel je zet doen\./.test(tekstVan(mees, 'verder')) &&
      kanTikken(mees, 'Speel verder'));
    mees.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, mees);
    await wacht();
    check('de strook na de zet', /Je zet is bewaard op .+\. Heb je weer verbinding, dan gaat hij naar Fien\./.test(zegt(mees)) && !/ziet hem bij het openen/.test(zegt(mees)));
    mees.tik('backBtn');
    await wacht();
    check('de kaart op de beurt van de vriend', /Er is nu geen verbinding\. Fien is aan zet\./.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.2] de staat van een lopend potje wordt na zeven dagen opnieuw geschreven, met precies dezelfde bytes, en niet eerder', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    await zetUit(RUSTIG, mees);
    await wacht(5000);
    const bus = await potjesbus(mees, fid, true), voor = JSON.parse(JSON.stringify(__server.potjes[bus] || null));
    stopApparaat(mees);
    schuifKlok(3 * DAG);
    mees = await opent(mees);
    check('na drie dagen niet opnieuw geschreven', !!voor && !!__server.potjes[bus] && __server.potjes[bus].tot === voor.tot);
    stopApparaat(mees);
    schuifKlok(5 * DAG);
    mees = await opent(mees);
    const na = __server.potjes[bus];
    check('na acht dagen opnieuw geschreven, dus langer bewaard', !!voor && !!na && na.tot > voor.tot);
    check('met precies dezelfde bytes, dus niet veranderd', !!voor && !!na && na.blob === voor.blob && na.veranderd === voor.veranderd);
  });

  await regel('[6.2] na het einde: de staat toont de uitslag, niemand haalt hem weg, hij wordt niet meer vernieuwd als allebei het weten, en een nieuwe uitdaging schrijft eroverheen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    const bus = await potjesbus(mees, fid, true), fienBus = await potjesbus(mees, fid, false);
    const log = potjesLog();
    try {
      stopApparaat(fien);
      await geefOp(mees);
      await tijd(60000);
      const id = (await busZegt(mees, fid, true) || {}).gameId;
      check('testopzet: de opgave staat in de staat', (await busZegt(mees, fid, true) || {}).uitslag === 'opgave');
      tikTekst(mees, 'Naar huis');
      await wacht();
      schuifKlok(2 * DAG);
      mees = await opent(mees);
      check('zolang Fien het einde niet kent, blijft de opgave in de staat', (await busZegt(mees, fid, true) || {}).uitslag === 'opgave');
      fien = await opent(fien);
      check('Fien ziet het einde', /Je potje met Mees is klaar/.test(tekstVan(fien, 'verder')));
      fien.tik('verderKaart');
      await wacht();
      tikTekst(fien, 'Naar huis');
      await tijd(40000);
      const f = await busZegt(fien, fid, true) || {};
      check('Fien zag het einde: de staat toont hetzelfde potje met een uitslag', f.gameId === id && !!f.uitslag);
      mees = await opent(mees);
      await tijd(20000);
      check('allebei weten het: de staat staat er nog', bus in __server.potjes && fienBus in __server.potjes);
      const bewaard = function (x) { const r = samenZicht(x); return !!r && !!r.games && id in r.games; };
      check('en geen van beide apparaten bewaart het potje nog', !bewaard(mees) && !bewaard(fien));
      const totM = __server.potjes[bus].tot, totF = __server.potjes[fienBus].tot;
      stopApparaat(mees);
      stopApparaat(fien);
      schuifKlok(8 * DAG);
      mees = await opent(mees);
      fien = await opent(fien);
      await tijd(20000);
      check('na acht dagen is de staat niet vernieuwd', !!__server.potjes[bus] && __server.potjes[bus].tot === totM &&
        !!__server.potjes[fienBus] && __server.potjes[fienBus].tot === totF);
      stopApparaat(fien);
      await daagUit(mees, fid, 'Fien');
      const m = await busZegt(mees, fid, true) || {};
      check('een nieuwe uitdaging van Mees staat nu in de staat', m.state === 'uitdaging' && !m.uitslag && m.gameId !== id);
    } finally { log.stop(); }
    check('niemand haalde de staat weg', log.log.length > 0 && !log.log.some(function (w) { return w.leeg; }));
  });

  await regel('[6.3] Mees zet op twee gekoppelde apparaten verschillend in dezelfde stand: de zet in de staat telt, het andere apparaat zegt het, en Fien ziet die zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    const tab = await tweedeApparaat(tel);
    check('testopzet: de tablet kent Fien', tab.get('!!P.friends[' + JSON.stringify(fid) + ']'));
    await potjeTot(tel, fien, 2, tel);
    const n = tel.get('session.S.hist.length');
    stopApparaat(fien);
    await tijd(20000);
    tab.tik('verderKaart');
    await wacht();
    check('testopzet: de tablet speelt hetzelfde potje, en Mees is aan zet', magZetten(tab) && tab.get('session.S.hist.length') === n);
    const opTel = RUSTIG[n], opTab = tel.get('legalMoves(session.S).map(moveKey).sort()').filter(function (k) { return k !== opTel; })[0];
    geenNetwerk(tel);
    zet(tel, opTel);
    await wacht();
    check('testopzet: de telefoon bewaarde zijn zet', vriendenpotjeMet(tel, fid).moves[n] === opTel);
    zet(tab, opTab);
    await wacht(5000);
    weerNetwerk(tel);
    tel.tik('backBtn');
    const gezegd = await zagOoit(function () { return /Je zet op je andere apparaat telde al\./.test(zegt(tel) + ' ' + toastTekst(tel)); }, 30000);
    naarSpelen(tel);
    tel.tik('verderKaart');
    await wacht();
    check('de telefoon zegt dat de zet op het andere apparaat telde', gezegd || /Je zet op je andere apparaat telde al\./.test(zegt(tel)));
    check('de telefoon neemt de zet van de tablet', vriendenpotjeMet(tel, fid).moves[n] === opTab && tel.get('moveKey(session.S.hist[' + n + '].m)') === opTab);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    check('Fien ziet de zet van de tablet', fien.get('session.S.hist.length') === n + 1 && fien.get('moveKey(session.S.hist[' + n + '].m)') === opTab);
  });

  await regel('[6.3] een uitslag is definitief: een zet zonder netwerk na de opgave van de vriend telt niet, en het kind hoort het', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    const n = mees.get('session.S.hist.length'), kamer = mees.get('MP.room'), voor = tellers(mees);
    geenNetwerk(mees);
    await wacht(3000);
    await geefOp(fien);
    tikTekst(fien, 'Naar huis');
    await wacht();
    stopApparaat(fien);
    delete __server.wsrooms[kamer];
    await zetUit(RUSTIG, mees);
    weerNetwerk(mees);
    await tijd(30000);
    const ek = tekstVan(mees, 'eindkaart');
    check('Mees wint: Fien gaf op', zichtbaar(mees, 'eindkaart') && /wint/i.test(ek) && /Fien gaf op|Fien geeft op/.test(ek));
    check('Mees hoort dat zijn zet niet telt', /telt niet mee/.test(zegt(mees)));
    const bewaard = (samenZicht(mees) || { games: {} }).games, r = Object.keys(bewaard || {}).map(function (k) { return bewaard[k]; })
      .filter(function (x) { return x && x.fid === fid; })[0];
    check('zijn zet staat niet meer in het potje', mees.get('session.S.hist.length') === n && (!r || r.moves.length === n));
    check('één keer geteld, als winst', JSON.parse(tellers(mees))[1] === JSON.parse(voor)[1] + 1);
  });

  const kleurUitdaging = [];
  for (const [vul, wat] of [[0, 'nullen'], [255, 'enen']]) {
    await regel('[6.4] een uitdaging (willekeur met ' + wat + '): Fien neemt hem aan bij het openen, en wit zet eerst', async function (check) {
      zetDatum('2026-11-14T10:00:00');
      let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await wordenVrienden(mees, fien);
      const voorM = tellers(mees), voorF = tellers(fien);
      stopApparaat(fien);
      tikInRij(mees, fid, 'Uitnodigen');
      await wacht();
      await metVasteWillekeur(vul, async function () { tikTekst(mees, 'Daag Fien uit voor later'); await wacht(); });
      if (kanTikken(mees, 'Naar huis')) { tikTekst(mees, 'Naar huis'); await wacht(); }
      schuifKlok(DAG);
      fien = await opent(fien);
      const kaart = tekstVan(fien, 'verder'), fienWit = /Jij speelt met wit: jij begint\./.test(kaart);
      kleurUitdaging.push(fienWit);
      check('de kaart: Mees daagt je uit, met de kleur', /Mees daagt je uit/.test(kaart) && (fienWit || /Jij speelt met zwart: Mees begint\./.test(kaart)));
      check('in de kaart Nu niet en Ja, spelen!, en geen regel dat het potje blijft staan', kanTikken(fien, 'Nu niet') && kanTikken(fien, 'Ja, spelen!') &&
        !/blijft staan/.test(kaart));
      fien.tik('tabVrienden');
      await wacht();
      check('de rij op Vrienden: onder de naam alleen of zij uitgedaagd is en welke kleur ze heeft',
        new RegExp('Daagt je uit · Jij hebt ' + (fienWit ? 'wit' : 'zwart') + '\\.').test(vriendRijTekst(fien, fid)) && !/Mees daagt|begint/.test(vriendRijTekst(fien, fid)));
      fien.tik('tabSpelen');
      await wacht();
      tikTekst(fien, 'Ja, spelen!');
      await wacht();
      check('Fien zit in het potje, en alleen wit kan zetten', opSpeelscherm(fien) && fien.get('session.S.hist.length') === 0 && magZetten(fien) === fienWit);
      if (fienWit) {
        await tijd(20000);
        check('Mees leest dat Fien meedoet en begint', /Fien doet mee\. Fien is aan zet\./.test(tekstVan(mees, 'verder')));
        zet(fien, 'e2e4');
        await tijd(20000);
        check('Mees leest dat Fien meedoet en zette', /Fien doet mee en heeft gezet\. Jij bent aan zet\./.test(tekstVan(mees, 'verder')));
      } else {
        await tijd(20000);
        check('Mees leest dat Fien meedoet en dat hij begint', /Fien doet mee\. Jij bent aan zet\./.test(zegt(mees)));
        mees.tik('verderKaart');
        await wacht();
        zet(mees, 'e2e4');
        await tijd(20000);
        check('Fien krijgt de zet en kan zetten', fien.get('session.S.hist.length') === 1 && magZetten(fien));
      }
      check('pas een echt einde telt: nog niets veranderd', tellers(mees) === voorM && tellers(fien) === voorF);
      if (kleurUitdaging.length === 2) check('de twee proeven gaven elk een andere kleur', kleurUitdaging[0] !== kleurUitdaging[1]);
    });
  }

  await regel('[6.4] wie uitdaagde, trekt de uitdaging in: een toast, de rij is weer als eerst, de vriend ziet niets, en geen teller verandert', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    const voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    check('testopzet: de rij zegt Uitgedaagd', /Uitgedaagd · nog geen antwoord/.test(vriendRijTekst(mees, fid)));
    tikInRij(mees, fid, '⋯');
    await wacht();
    tikTekst(mees, 'Uitdaging intrekken');
    await wacht(100);
    check('de toast', toastTekst(mees) === 'Je uitdaging aan Fien is ingetrokken.');
    check('de rij is weer als eerst', /vrienden sinds/.test(vriendRijTekst(mees, fid)) && /Uitnodigen/.test(vriendRijTekst(mees, fid)));
    schuifKlok(DAG);
    fien = await opent(fien);
    fien.tik('tabVrienden');
    check('Fien ziet geen uitdaging en geen bericht', !/daagt je uit|ingetrokken/i.test(zegt(fien) + ' ' + toastTekst(fien) + ' ' + vriendRijTekst(fien, fid)));
    check('geen teller veranderd', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  await regel('[6.4] de vriend zegt Nu niet: de uitdaging is aan beide kanten weg, en geen teller verandert', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    const voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('testopzet: de uitdaging staat op de kaart', /Mees daagt je uit/.test(tekstVan(fien, 'verder')));
    tikTekst(fien, 'Nu niet');
    await wacht();
    check('de kaart toont hem niet meer', !/daagt je uit/.test(tekstVan(fien, 'verder')));
    fien = await opent(fien);
    check('ook niet na opnieuw openen', !/daagt je uit/.test(zegt(fien)));
    mees = herlaad(mees);
    vierWeg(mees);
    await tijd(20000);
    const s = mees.scherm();
    check('met Oké', kanTikken(mees, 'Oké'));
    check('Mees hoort het één keer, rustig', /Fien kan nu even niet/.test(s) && /Daag Fien later gerust nog eens uit\./.test(s));
    tikEl(mees, mees.el('modalBox').querySelectorAll('button')[0], 'de knop van het bericht');
    await wacht();
    mees.tik('tabVrienden');
    check('Mees wacht niet meer op een antwoord, en kan weer uitnodigen', !mees.open() &&
      !/nog geen antwoord/.test(vriendRijTekst(mees, fid) + ' ' + tekstVan(mees, 'verder')) && /Uitnodigen/.test(vriendRijTekst(mees, fid)));
    mees = await opent(mees);
    check('en hoort het niet nog eens', !/kan nu even niet/.test(mees.scherm()));
    check('geen teller veranderd', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  await regel('[6.4] uitnodigen terwijl er een potje met die vriend loopt, opent dat potje en stuurt niets', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await zetUit(RUSTIG, mees, fien);
    for (const x of [mees, fien]) { x.tik('backBtn'); await wacht(); }
    const bussen = JSON.stringify(__server.buses);
    await mees.ev('inviteFriend(' + JSON.stringify(fid) + ')');
    await wacht();
    check('het lopende potje gaat open', opSpeelscherm(mees) && mees.get('session.S.hist.length') === 1);
    check('geen nieuwe uitnodiging', JSON.stringify(__server.buses) === bussen && !fien.open());
  });

  await regel('[6.4] één uitdaging per vriendenpaar: nog eens uitnodigen maakt geen tweede', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    const echt = fetch, geschreven = [];
    fetch = function (url, o) {
      if (/\/v1\/(bus|potje)$/.test(url) && o && typeof o.body === 'string' && JSON.parse(o.body).blob) geschreven.push(url);
      return echt(url, o);
    };
    try {
      await mees.ev('inviteFriend(' + JSON.stringify(fid) + ')');
      await wacht();
      if (kanTikken(mees, 'Daag Fien uit voor later')) { tikTekst(mees, 'Daag Fien uit voor later'); await wacht(); }
      if (kanTikken(mees, 'Naar huis')) { tikTekst(mees, 'Naar huis'); await wacht(); }
    } finally { fetch = echt; }
    check('geen tweede uitnodiging of uitdaging verstuurd', geschreven.length === 0);
    check('Vrienden staat open, bij de rij met de uitdaging', zichtbaar(mees, 'view-vrienden') && /Uitgedaagd · nog geen antwoord/.test(vriendRijTekst(mees, fid)));
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet precies één uitdaging', (zegt(fien).match(/Mees daagt je uit/g) || []).length === 1);
  });

  await regel('[6.4] een uitdaging trekt de uitnodiging in waar hij uit kwam: wie binnen tien minuten opent, ziet alleen de uitdaging', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    schuifKlok(60000);
    fien = await opent(fien);
    check('Fien krijgt geen uitnodiging om nu te spelen', !/wil een potje spelen|wil spelen/.test(zegt(fien)));
    check('wel de uitdaging', /Mees daagt je uit/.test(tekstVan(fien, 'verder')) && kanTikken(fien, 'Ja, spelen!'));
  });

  await regel('[6.4] zijn de tien minuten van een uitnodiging om, dan biedt het bericht de uitdaging aan, en pas een tik maakt hem', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    const bus = await potjesbus(mees, fid, true);
    tikInRij(mees, fid, 'Uitnodigen');
    await wacht(11 * 60000);
    check('het bericht biedt de uitdaging aan', kanTikken(mees, 'Daag Fien uit voor later'));
    check('er is nog geen uitdaging', !__server.potjes[bus]);
    tikTekst(mees, 'Daag Fien uit voor later');
    await wacht();
    check('na de tik wel', !!__server.potjes[bus] && /Uitdaging verstuurd!/.test(mees.scherm()));
  });

  await regel('[6.4] twee uitdagingen die elkaar kruisen: die het eerst op de server staat (die van Mees), blijft; die van Fien past niet meer, en Fien krijgt die van Mees om te beantwoorden', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    /* de uitdaging van Mees is nog onderweg als Fien de hare maakt; ze komen in die volgorde bij de server */
    const echt = fetch, vast = [];
    fetch = function (url, o) {
      if (/\/v1\/potje$/.test(url)) return new Promise(function (klaar) { vast.push(function () { klaar(echt(url, o)); }); });
      return echt(url, o);
    };
    try {
      await daagUit(mees, fid, 'Fien');
      stopApparaat(mees);
      fien = await opent(fien);
      check('testopzet: Fien ziet de uitdaging van Mees nog niet', !/Mees daagt je uit/.test(tekstVan(fien, 'verder')));
      await daagUit(fien, fid, 'Mees');
    } finally {
      fetch = echt;
      vast.splice(0).forEach(function (f) { f(); });
    }
    mees = await opent(mees);
    await tijd(20000);
    for (const x of [mees, fien]) x.tik('tabSpelen');
    const km = tekstVan(mees, 'verder') + ' ' + ookNogRegels(mees).join(' '), kf = tekstVan(fien, 'verder') + ' ' + ookNogRegels(fien).join(' ');
    check('Mees houdt zijn uitdaging', /Je uitdaging aan Fien/.test(km) && !/Fien daagt je uit/.test(km));
    check('Fien beantwoordt die van Mees, en de hare is weg', /Mees daagt je uit/.test(kf) && !/Je uitdaging aan Mees/.test(kf));
  });

  await regel('[6.5] tussen vrienden eindigt een potje niet als de kamer weg is: allebei spelen verder via de staat van het paar', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    const kamer = mees.get('MP.room'), voorM = tellers(mees), voorF = tellers(fien), n = mees.get('session.S.hist.length');
    stopApparaat(mees);
    stopApparaat(fien);
    delete __server.wsrooms[kamer];
    schuifKlok(DAG);
    mees = await opent(mees);
    fien = await opent(fien);
    mees.tik('verderKaart');
    fien.tik('verderKaart');
    await tijd(30000);
    check('aan geen kant een einde', !/gestopt|telt voor niemand/.test(zegt(mees) + ' ' + zegt(fien)) && opSpeelscherm(mees) && opSpeelscherm(fien));
    await zetUit(RUSTIG, mees);
    await tijd(30000);
    check('de zet van Mees komt via de bus bij Fien', fien.get('session.S.hist.length') === n + 1 && magZetten(fien));
    await zetUit(RUSTIG, fien);
    await tijd(30000);
    check('en die van Fien bij Mees', mees.get('session.S.hist.length') === n + 2 && magZetten(mees));
    check('geen teller veranderd', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  /* wat al zo werkt en zo moet blijven: zonder vriendschap geen geheim, dus geen staat van een paar */
  await regel('[6.12] een potje met woordcodes tussen kinderen die geen vrienden zijn, eindigt nog als de kamer weg is, en heeft geen staat op de server', async function (check) {
    const a = maakApparaat('Lotte'), b = maakApparaat('Sem');
    a.ev('mpWordFlow()');
    b.ev('mpWordFlow()');
    await wacht();
    const eigen = function (app) { const m = app.modal().match(/Jouw woorden: <b>1 ([a-z]+) &nbsp; 2 ([a-z]+)<\/b>/); return m ? [m[1], m[2]] : []; };
    const wa = eigen(a), wb = eigen(b);
    typ(a, 'mpInp', wb);
    typ(b, 'mpInp', wa);
    a.tik('mpKoppel');
    b.tik('mpKoppel');
    for (let i = 0; i < 8 && !(a.get('!!MP') && b.get('!!MP') && (a.ziet('mpGo') || b.ziet('mpGo'))); i++) await wacht();
    (a.ziet('mpGo') ? a : b).tik('mpGo');
    await wacht();
    check('testopzet: een potje met woordcodes', a.get('!!(session && session.online)') && b.get('!!(session && session.online)'));
    const potjesVoor = JSON.stringify(Object.keys(__server.potjes).sort());
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    check('geen staat geschreven', JSON.stringify(Object.keys(__server.potjes).sort()) === potjesVoor);
    const kamer = a.get('MP.room');
    stopApparaat(a);
    stopApparaat(b);
    delete __server.wsrooms[kamer];
    const a2 = herlaad(a), b2 = herlaad(b);
    await wacht();
    a2.tik('verderKaart');
    b2.tik('verderKaart');
    await tijd(30000);
    check('allebei: het potje is gestopt en telt voor niemand mee', /gestopt/.test(zegt(a2)) && /gestopt/.test(zegt(b2)) &&
      /telt voor niemand mee/.test(zegt(a2)) && /telt voor niemand mee/.test(zegt(b2)));
  });

  await regel('[6.6] een remise-aanbod gaat mee met de eigen zet, en kan maar één keer per eigen zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    const bus = await potjesbus(mees, fid, true), n = mees.get('session.S.hist.length');
    await biedRemise(mees);
    await wacht(5000);
    let inhoud = await busInhoud(mees, fid, bus);
    check('op de eigen beurt staat er nog geen aanbod in de staat', !inhoud || !inhoud.spel || !inhoud.spel.bod);
    check('de strook zegt wat nu', tekstVan(mees, 'bubble').indexOf('Doe nu je zet: daarmee bied je Fien remise aan.') >= 0);
    await zetUit(RUSTIG, mees);
    await wacht(5000);
    inhoud = await busInhoud(mees, fid, bus);
    check('met de zet gaat het aanbod mee, in de stand na die zet', !!inhoud && !!inhoud.spel.bod && inhoud.spel.bod.ply === n + 1);
    const blob = __server.potjes[bus] && __server.potjes[bus].blob;
    mees.tik('meerBtn');
    await wacht();
    if (kanTikken(mees, 'Remise aanbieden')) { tikTekst(mees, 'Remise aanbieden'); await wacht(); }
    if (mees.open()) mees.ev('closeModal()');
    await wacht(5000);
    check('een tweede aanbod voor de volgende eigen zet verandert de staat niet', !!blob && __server.potjes[bus].blob === blob);
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet het aanbod', /Mees biedt remise aan/.test(tekstVan(fien, 'verder')));
  });

  await regel('[6.6] als allebei kijken: het aanbod staat in de strook, Remise aannemen onder het bord en geen Nee; een zet wijst het af', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    await zetUit(RUSTIG, mees);
    await biedRemise(mees);
    await wacht();
    check('Fien leest het aanbod in de strook', tekstVan(fien, 'bubble').indexOf('Mees biedt remise aan. Tik onder het bord op Remise aannemen, of doe je zet om door te spelen.') >= 0);
    check('onder het bord Remise aannemen, en geen Nee', kanTikken(fien, 'Remise aannemen') && !knopTeksten(fien).some(function (t) { return /\bNee\b/.test(t); }));
    check('Mees ziet in de balk dat zijn aanbod staat', /½ aangeboden/.test(tekstVan(mees, 'verschil')));
    await zetUit(RUSTIG, fien);
    check('de zet wees het af', !kanTikken(fien, 'Remise aannemen') && !/aangeboden/.test(tekstVan(mees, 'verschil')) && magZetten(mees));
    check('het potje gaat door', !mees.get('session.over') && !fien.get('session.over'));
  });

  await regel('[6.6] Fien neemt het aanbod twee dagen later aan: remise voor allebei, met de datum op de kaart, en één keer geteld', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await aanbodVanMees(mees, fien);
    const voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(mees);
    schuifKlok(2 * DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('de kaart: Mees biedt remise aan, met de laatste dag om te antwoorden', /Mees biedt remise aan/.test(kaart) && /Doe je tot en met vrijdag 27 november geen zet, dan wordt het remise\./.test(kaart));
    check('een datum, geen klok', !/\d+:\d\d|nog \d+ dag/.test(kaart));
    check('geen regel dat het potje blijft staan', !/blijft staan/.test(kaart));
    fien.tik('verderKaart');
    await wacht();
    check('de strook zegt hoe Fien antwoordt', tekstVan(fien, 'bubble').indexOf('Mees biedt remise aan. Tik onder het bord op Remise aannemen, of doe je zet om door te spelen.') >= 0);
    check('Remise aannemen onder het bord, en geen Nee', kanTikken(fien, 'Remise aannemen') && !knopTeksten(fien).some(function (t) { return /\bNee\b/.test(t); }));
    tikTekst(fien, 'Remise aannemen');
    await wacht();
    check('remise bij Fien, één keer geteld', fien.get('!!(session && session.over)') && tellers(fien) === nogEen(voorF, false) && weekOnline(fien) === 1);
    tikTekst(fien, 'Naar huis');
    await wacht();
    schuifKlok(DAG);
    mees = await opent(mees);
    const km = tekstVan(mees, 'verder');
    check('de kaart van Mees', /Je potje met Fien is remise/.test(km) && /Fien nam je aanbod aan\. Goed gespeeld, allebei!/.test(km));
    mees.tik('verderKaart');
    await wacht();
    const ek = tekstVan(mees, 'eindkaart');
    check('de eindkaart van Mees', /Je potje met Fien is remise\./.test(ek) && /Fien nam je aanbod aan\. Goed gespeeld, allebei!/.test(ek));
    check('de strook zegt de kop van de eindkaart', tekstVan(mees, 'bubble').indexOf('Je potje met Fien is remise.') >= 0);
    check('één keer geteld bij Mees', tellers(mees) === nogEen(voorM, false) && weekOnline(mees) === 1);
    mees = await opent(mees);
    check('ook na opnieuw openen niet nog eens', tellers(mees) === nogEen(voorM, false));
  });

  await regel('[6.6] Fien antwoordt met een zet: het aanbod vervalt, en het potje gaat door, ook na veertien dagen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await aanbodVanMees(mees, fien);
    stopApparaat(mees);
    schuifKlok(2 * DAG);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, fien);
    await wacht(5000);
    check('na de zet geen Remise aannemen meer', !kanTikken(fien, 'Remise aannemen'));
    stopApparaat(fien);
    schuifKlok(15 * DAG);
    mees = await opent(mees);
    const km = tekstVan(mees, 'verder');
    check('Mees: Fien heeft gezet, geen remise', /Fien heeft gezet\. Jij bent aan zet\./.test(km) && !/remise/i.test(km));
    mees.tik('verderKaart');
    await wacht();
    check('het aanbod staat niet meer, en Mees kan zetten', !/aangeboden/.test(tekstVan(mees, 'verschil')) && magZetten(mees));
  });

  await regel('[6.6] na 13 dagen en 23 uur geen remise; na 14 dagen remise voor allebei, met de dag van het aanbod, één keer geteld', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await aanbodVanMees(mees, fien);
    const t0 = Date.now(), voorM = tellers(mees), voorF = tellers(fien);
    check('testopzet: Mees leest de laatste dag', tekstVan(mees, 'bubble').indexOf('Je biedt Fien remise aan. Doet Fien tot en met vrijdag 27 november geen zet, dan is het remise.') >= 0);
    stopApparaat(mees);
    zetOp(t0 + 13 * DAG + 23 * UUR);
    mees = await opent(mees);
    check('na 13 dagen en 23 uur nog geen remise', !/is remise/.test(tekstVan(mees, 'verder')) && tellers(mees) === voorM);
    check('de kaart van Mees zegt dat zijn aanbod staat, zonder regel eronder', /Je bood remise aan\. Fien is aan zet\./.test(tekstVan(mees, 'verder')) &&
      !/blijft staan/.test(tekstVan(mees, 'verder')));
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + 10 * 60000);
    mees = await opent(mees);
    const km = tekstVan(mees, 'verder');
    check('na 14 dagen: de kaart van Mees', /Je potje met Fien is remise/.test(km) && /Je aanbod stond twee weken open\./.test(km));
    mees.tik('verderKaart');
    await wacht();
    const ek = tekstVan(mees, 'eindkaart');
    check('de eindkaart van Mees noemt de dag van het aanbod', /Je potje met Fien is remise\./.test(ek) &&
      /Je bood het op 14 november aan, en na twee weken werd het vanzelf remise\./.test(ek) && /Goed gespeeld, allebei!/.test(ek));
    check('één keer geteld bij Mees', tellers(mees) === nogEen(voorM, false) && weekOnline(mees) === 1);
    tikTekst(mees, 'Naar huis');
    await wacht();
    fien = await opent(fien);
    const kf = tekstVan(fien, 'verder');
    check('de kaart van Fien', /Je potje met Mees is remise/.test(kf) && /Het aanbod van Mees stond twee weken open\./.test(kf));
    fien.tik('verderKaart');
    await wacht();
    const ef = tekstVan(fien, 'eindkaart');
    check('de eindkaart van Fien', /Je potje met Mees is remise\./.test(ef) &&
      /Mees bood het op 14 november aan, en na twee weken werd het vanzelf remise\./.test(ef) && /Goed gespeeld, allebei!/.test(ef));
    check('één keer geteld bij Fien', tellers(fien) === nogEen(voorF, false) && weekOnline(fien) === 1);
  });

  await regel('[6.6] een klok die een week voorloopt, maakt de termijn niet korter: de server meet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await aanbodVanMees(mees, fien);
    const t0 = Date.now();
    stopApparaat(mees);
    const klok = __server.klok;
    try {
      __server.klok = klok - 7 * DAG;
      zetOp(t0 + 14 * DAG + UUR);
      mees = await opent(mees);
      fien = await opent(fien);
      check('de apparaten zeggen 14 dagen, de server 7: nog geen remise', !/is remise/.test(tekstVan(mees, 'verder')) &&
        !/is remise/.test(tekstVan(fien, 'verder')) && /Mees biedt remise aan/.test(tekstVan(fien, 'verder')));
      __server.klok = klok;
      await tijd(40000);
      check('pas als de server 14 dagen meet, is het remise', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
    } finally { __server.klok = klok; }
  });

  await regel('[6.6] dezelfde bytes opnieuw schrijven zet de termijn niet terug', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const t0 = Date.now(), bus = await potjesbus(mees, fid, true);
    stopApparaat(mees);
    zetOp(t0 + 8 * DAG);
    const tot = __server.potjes[bus] && __server.potjes[bus].tot;
    mees = await opent(mees);
    check('testopzet: op dag 8 schreef Mees zijn bus opnieuw', !!tot && __server.potjes[bus].tot > tot);
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + 10 * 60000);
    mees = await opent(mees);
    check('toch na 14 dagen remise', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.6] V6 een herstart van de server verandert de termijn niet: de veertien dagen lopen vanaf de stempel', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const t0 = Date.now(), bus = await potjesbus(mees, fid), s0 = await busZegt(mees, fid);
    check('testopzet: het aanbod staat er met een stempel', !!s0 && !!s0.bod && s0.bod.t != null);
    stopApparaat(mees);
    zetOp(t0 + 5 * DAG);
    __herstartServer();
    zetOp(t0 + 6 * DAG);
    mees = await opent(mees);
    check('na de herstart staat dezelfde stempel', !!__server.potjes[bus] && ((await busZegt(mees, fid)) || {}).bod.t === s0.bod.t);
    stopApparaat(mees);
    zetOp(t0 + 13 * DAG);
    mees = await opent(mees);
    check('na 13 dagen nog geen remise', !/is remise/.test(tekstVan(mees, 'verder')) && !!vriendenpotjeMet(mees, fid));
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + UUR);
    mees = await opent(mees);
    check('na 14 dagen wel', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.7] Fien geeft op terwijl Mees weg is; Mees opent op twee gekoppelde apparaten na elkaar: de winst en de week tellen één keer', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 22, fien);
    let tab = await tweedeApparaat(tel);
    check('testopzet: de tablet kent Fien', tab.get('!!P.friends[' + JSON.stringify(fid) + ']'));
    const voor = tellers(tel), week = weekOnline(tel);
    stopApparaat(tel);
    stopApparaat(tab);
    await geefOp(fien);
    schuifKlok(DAG);
    tel = await opent(tel);
    const kaart = tekstVan(tel, 'verder');
    check('de kaart van de telefoon', /Je potje met Fien is klaar/.test(kaart) && /Fien gaf op\. Jij wint dit potje!/.test(kaart));
    tel.tik('verderKaart');
    await wacht();
    const ek = tekstVan(tel, 'eindkaart');
    check('de eindkaart', /Jij wint dit potje!/.test(ek) && /Fien gaf op\./.test(ek) && kanTikken(tel, 'Nieuw potje met Fien') && kanTikken(tel, 'Naar huis'));
    check('de strook zegt de kop van de eindkaart', tekstVan(tel, 'bubble').indexOf('Jij wint dit potje!') >= 0);
    check('geteld op de telefoon', tellers(tel) === nogEen(voor, true) && weekOnline(tel) === week + 1);
    tikTekst(tel, 'Naar huis');
    await wacht();
    await tel.ev('syncNow()');
    await wacht();
    tab = await opent(tab);
    check('de tablet toont geen potje met Fien meer: het einde telde al op de telefoon', !/Fien/.test(tekstVan(tab, 'verder')));
    await tab.ev('syncNow()');
    await wacht();
    await tel.ev('syncNow()');
    await wacht();
    check('na het samenvoegen op beide apparaten precies één keer', tellers(tel) === nogEen(voor, true) && tellers(tab) === nogEen(voor, true) &&
      weekOnline(tel) === week + 1 && weekOnline(tab) === week + 1);
  });

  await regel('[6.7] de eindkaart van een einde terwijl het kind weg was, zegt wat telde zoals een einde in de kamer: de XP, het weekdoel, of dat een kort potje niet telt', async function (check) {
    for (const lang of [true, false]) {
      zetDatum('2026-11-16T10:00:00');
      let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      await vriendenpotje(mees, fien);
      if (lang) mees.ev('setPref("weekGoal", { kind: "vriend", n: 3 })');
      await potjeTot(mees, fien, lang ? 22 : 4, fien);
      const xp = mees.get('(DOC.cnt.xp || {})[DEV] || 0');
      stopApparaat(mees);
      await geefOp(fien);
      schuifKlok(UUR);
      mees = await opent(mees);
      mees.tik('verderKaart');
      await wacht();
      const ek = tekstVan(mees, 'eindkaart');
      if (lang) {
        check('lang: +30 XP en dat het meetelt voor het weekdoel, en geteld', ek.indexOf('+30 XP. Telt mee voor je weekdoel. 🎯') >= 0 &&
          mees.get('(DOC.cnt.xp || {})[DEV] || 0') === xp + 30);
      } else {
        check('kort: dat het niet telt, en geen XP', /Dit potje telt niet mee: het was korter dan tien zetten\./.test(ek) && !/XP/.test(ek) &&
          mees.get('(DOC.cnt.xp || {})[DEV] || 0') === xp);
      }
    }
  });

  await regel('[6.7] schaakmat terwijl de ander weg is: die ziet het bij het openen, op de kaart en de eindkaart', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const a = maakApparaat('Mees'), b = maakApparaat('Fien');
    await vriendenpotje(a, b);
    const wit = magZetten(a) ? a : b, zwart = wit === a ? b : a;
    for (let i = 0; i < MAT_WIT.length - 1; i++) await zetUit(MAT_WIT, a, b);
    const voor = tellers(zwart);
    stopApparaat(zwart);
    await zetUit(MAT_WIT, wit);
    schuifKlok(DAG);
    const zw = await opent(zwart);
    const kaart = tekstVan(zw, 'verder');
    check('de kaart', new RegExp('Je potje met ' + wit.naam + ' is klaar').test(kaart) && new RegExp('Schaakmat\\. ' + wit.naam + ' wint dit potje\\.').test(kaart));
    zw.tik('verderKaart');
    await wacht();
    const ek = tekstVan(zw, 'eindkaart');
    check('de eindkaart', new RegExp(wit.naam + ' wint dit potje').test(ek) && /Schaakmat\. Goed gespeeld! Revanche\?/.test(ek) &&
      kanTikken(zw, 'Nieuw potje met ' + wit.naam) && kanTikken(zw, 'Naar huis'));
    check('één keer geteld: een potje, geen winst', tellers(zw) === nogEen(voor, false));
  });

  await regel('[6.7] pat terwijl de ander weg is: remise bij het openen, met de reden op de eindkaart', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const a = maakApparaat('Mees'), b = maakApparaat('Fien');
    await vriendenpotje(a, b);
    const wit = magZetten(a) ? a : b, zwart = wit === a ? b : a;
    for (let i = 0; i < PAT_WIT.length - 1; i++) await zetUit(PAT_WIT, a, b);
    const voor = tellers(zwart);
    stopApparaat(zwart);
    await zetUit(PAT_WIT, wit);
    schuifKlok(DAG);
    const zw = await opent(zwart);
    const kaart = tekstVan(zw, 'verder');
    check('de kaart', new RegExp('Je potje met ' + wit.naam + ' is remise').test(kaart) && /Het werd remise\. Goed gespeeld, allebei!/.test(kaart));
    zw.tik('verderKaart');
    await wacht();
    check('de eindkaart zegt waarom', /Pat! De koning kan nergens meer heen, maar staat geen schaak\./.test(tekstVan(zw, 'eindkaart')));
    check('één keer geteld', tellers(zw) === nogEen(voor, false));
  });

  await regel('[6.7] "Alles wissen" terwijl de vriend weg is: de vriend ziet bij het openen dat Mees opgaf, en op het gewiste apparaat telt die opgave niet', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, mees);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    mees.tik('setBtn');
    mees.tik('setReset');
    check('de vraag zegt dat het potje met Fien wordt opgegeven', /Dan geef je ook je potje met Fien op\./.test(mees.scherm()));
    mees.tik('rstGo');
    check('testopzet: de opgave wacht nog in het paar', mees.get('Object.keys(paren()).length') === 1);
    await tijd(20000);
    check('is de opgave bezorgd, dan heeft het gewiste apparaat geen paar en geen lijst meer', mees.get('Object.keys(paren()).length') === 0 &&
      mees.get('Object.keys(DOC.loc.geteld || {}).length') === 0 && !mees.opslag.getItem('schaakheld-paar'));
    check('het gewiste profiel telt geen potje en geen XP', mees.get('P.c.gamesPlayed || 0') === 0 && mees.get('P.xp || 0') === 0 &&
      mees.get('wkGet(curWeek(), "online") || 0') === 0);
    schuifKlok(DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('Fien: Mees gaf op', /Je potje met Mees is klaar/.test(kaart) && /Mees gaf op\. Jij wint dit potje!/.test(kaart));
  });

  await regel('[6.7] "Alles wissen" op een gekoppeld apparaat haalt het vriendenpotje alleen daar weg: het speelt verder op het andere, en de vriend ziet geen opgave', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    await zetUit(RUSTIG, tel, fien);
    let tab = await tweedeApparaat(tel);
    stopApparaat(fien);
    tel.tik('backBtn');
    await tijd(20000);
    check('testopzet: de tablet heeft het potje', /je potje met Fien/i.test(tekstVan(tab, 'verder')));
    tab.tik('setBtn');
    tab.tik('setReset');
    check('de vraag zegt niet dat het potje wordt opgegeven', !/geef je ook/.test(tab.scherm()) && /andere apparaat/.test(tab.scherm()));
    tab.tik('rstGo');
    check('de tablet vergeet het paar meteen', tab.get('Object.keys(paren()).length') === 0);
    await tijd(20000);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet geen opgave, en het potje loopt', !/gaf op|is klaar/.test(tekstVan(fien, 'verder')) && /je potje met Mees/i.test(tekstVan(fien, 'verder')));
    tel = await opent(tel);
    check('op de telefoon loopt het potje', /je potje met Fien/i.test(tekstVan(tel, 'verder')) && !!vriendenpotjeMet(tel, fid));
  });

  await regel('[6.8] een week zonder zet van de vriend: stil, onderaan, en weer bovenaan zodra de vriend zet', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), lotte = maakApparaat('Lotte');
    mees.ev('setPref("predict", false); setPref("guard", false)');
    const fidL = await wordenVrienden(mees, lotte);
    const fidF = await vriendErbij(mees, fien);
    stopApparaat(lotte);
    await daagUit(mees, fidL, 'Lotte');
    await startPotje(mees, 1);
    zet(mees, 'e2e4');
    await wacht();
    mees.tik('backBtn');
    await wacht();
    tikInRij(mees, fidF, 'Uitnodigen');
    await wacht();
    await fien.ev('friendPoll()');
    await wacht();
    fien.tik('invJa');
    await wacht();
    mees.tik('mpGo');
    await wacht();
    await potjeTot(mees, fien, 1, fien);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    stopApparaat(mees);
    const t0 = Date.now();
    const blad = async function () { tikTekst(mees, 'Ook nog'); await wacht(); const t = mees.scherm(); mees.ev('closeModal()'); return t; };
    zetOp(t0 + 6 * DAG + UUR);
    mees = await opent(mees);
    let b = await blad();
    check('na zes dagen nog niet stil: het potje staat voor de eigen uitdaging', b.indexOf('Je potje met Fien') >= 0 &&
      b.indexOf('Je potje met Fien') < b.indexOf('Je uitdaging aan Lotte') && /Fien is aan zet · 6 dagen geleden/.test(b) && !/een week niet gezet/.test(b));
    stopApparaat(mees);
    zetOp(t0 + 7 * DAG + UUR);
    mees = await opent(mees);
    b = await blad();
    check('na zeven dagen stil: onderaan het blad, met de regel', b.indexOf('Je uitdaging aan Lotte') >= 0 &&
      b.indexOf('Je potje met Fien') > b.indexOf('Je uitdaging aan Lotte') && /Fien heeft al een week niet gezet\./.test(b));
    mees.tik('tabVrienden');
    const rijen = mees.el('friendList').querySelectorAll('[data-fid]');
    check('op Vrienden staat Fien onderaan, met dezelfde regel', rijen.length >= 2 && rijen[rijen.length - 1] === vriendRij(mees, fidF) &&
      /Fien heeft al een week niet gezet\./.test(vriendRijTekst(mees, fidF)));
    stopApparaat(mees);
    zetOp(t0 + 9 * DAG);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, fien);
    stopApparaat(fien);
    mees = await opent(mees);
    check('Fien zette: haar potje staat weer bovenaan', /je potje met Fien/i.test(tekstVan(mees, 'verder')) &&
      /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.8] een potje zonder aanbod is na 400 dagen nog een potje, en er telt niets', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    await zetUit(RUSTIG, mees);
    const alles = function (x) { return x.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline, P.xp, P.wins, P.stars])'); };
    const voorM = alles(mees), voorF = alles(fien);
    stopApparaat(mees);
    schuifKlok(400 * DAG);
    mees = await opent(mees);
    const kaart = tekstVan(mees, 'verder');
    check('na 400 dagen is het potje nog de kaart, het enige wat bezig is', !!vriendenpotjeMet(mees, fid) && /je potje met Fien/i.test(kaart) &&
      /Fien heeft al 13 maanden niet gezet\./.test(kaart));
    mees.tik('tabVrienden');
    check('en de rij zegt hetzelfde, zonder Uitnodigen', /Fien heeft al 13 maanden niet gezet\./.test(vriendRijTekst(mees, fid)) &&
      !/Uitnodigen/.test(vriendRijTekst(mees, fid)));
    fien = await opent(fien);
    check('Fien krijgt de zet van Mees nog, want Mees schreef zijn bus terug', /Mees heeft gezet\. Jij bent aan zet\./.test(tekstVan(fien, 'verder')));
    check('er telde niets', alles(mees) === voorM && alles(fien) === voorF);
  });

  await regel('[6.8] een vriend met een lopend potje weghalen vraagt eerst om op te geven; de vriend ziet de opgave bij het openen', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    tikInRij(mees, fid, '⋯');
    await wacht();
    tikTekst(mees, 'Vriend weghalen');
    await wacht();
    check('de vraag', mees.ziet('Fien weghalen?') && /Je potje met Fien loopt nog\. Weghalen kan als het potje klaar is\. Opgeven\?/.test(mees.scherm()) &&
      kanTikken(mees, 'Nee, laat staan') && kanTikken(mees, 'Opgeven en weghalen'));
    tikTekst(mees, 'Opgeven en weghalen');
    await tijd(20000);
    check('Fien en het potje zijn weg bij Mees', mees.get('P.friends[' + JSON.stringify(fid) + '].weg') === true && !vriendenpotjeMet(mees, fid));
    schuifKlok(DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('Fien ziet dat Mees opgaf', /Je potje met Mees is klaar/.test(kaart) && /Mees gaf op\. Jij wint dit potje!/.test(kaart));
  });

  await regel('[6.9] twee vriendenpotjes tegelijk: elk houdt zijn eigen zetten, Vrienden toont ze allebei, en onder de kaart staat één regel', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fidF = await wordenVrienden(mees, fien), fidD = await vriendErbij(mees, daan);
    const samen = async function (fid, vriend) {
      tikInRij(mees, fid, 'Uitnodigen');
      await wacht();
      await vriend.ev('friendPoll()');
      await wacht();
      vriend.tik('invJa');
      await wacht();
      mees.tik('mpGo');
      await wacht();
    };
    await samen(fidF, fien);
    await zetUit(RUSTIG, mees, fien);
    for (const x of [mees, fien]) { x.tik('backBtn'); await wacht(); }
    await samen(fidD, daan);
    check('testopzet: een tweede potje naast het eerste', opSpeelscherm(mees) && opSpeelscherm(daan) && mees.get('session.S.hist.length') === 0);
    await zetUit(RUSTIG, mees, daan);
    await zetUit(RUSTIG, mees, daan);
    for (const x of [mees, daan]) { x.tik('backBtn'); await wacht(); }
    await tijd(20000);
    mees.tik('tabSpelen');
    const f = vriendenpotjeMet(mees, fidF), d = vriendenpotjeMet(mees, fidD);
    check('Mees heeft twee potjes, elk met zijn eigen zetten', !!f && !!d && f.gameId !== d.gameId && f.moves.length === 1 && d.moves.length === 2);
    check('Fien en Daan hebben elk hun eigen potje', vriendenpotjeMet(fien, fidF).moves.length === 1 && vriendenpotjeMet(daan, fidD).moves.length === 2);
    check('onder de kaart één regel die het andere potje noemt', ookNogRegels(mees).length === 1 && /Ook nog: je potje met (Fien|Daan)/.test(ookNogRegels(mees)[0]));
    mees.tik('tabVrienden');
    check('Vrienden toont beide potjes, en bij geen van beide Uitnodigen', [fidF, fidD].every(function (id) {
      return !/Uitnodigen/.test(vriendRijTekst(mees, id)) && /aan zet|heeft gezet/.test(vriendRijTekst(mees, id));
    }));
  });

  await regel('[6.9] een uitnodiging die wachtte terwijl het kind tegen Turbo speelde, komt thuis naast een vriendenpotje dat dagen loopt als venster, met Ja', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    const fidD = await wordenVrienden(fien, daan);
    await vriendErbij(fien, sem);
    fien.ev('setPref("predict", false); setPref("guard", false)');
    tikInRij(fien, fidD, 'Uitnodigen');
    await wacht();
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    await potjeTot(fien, daan, 2, fien);
    for (const x of [fien, daan]) { x.tik('backBtn'); await wacht(); }
    await startPotje(fien, 1);
    await zetEnWacht(fien, 'e2e4');
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    check('testopzet: in het potje tegen Turbo komt geen venster', !fien.open());
    fien.tik('backBtn');
    await wacht(500);
    check('testopzet: de kaart is het potje met Daan, eronder een regel die telt', /je potje met Daan/i.test(tekstVan(fien, 'verderKaart')) &&
      /^Ook nog (een|twee)/.test(tekstVan(fien, 'ookNog')));
    check('de uitnodiging komt als venster, met Ja, spelen!', /Sem wil een potje spelen!/.test(fien.scherm()) && kanTikken(fien, 'Ja, spelen!') &&
      !/loopt nog/.test(fien.scherm()));
  });

  await regel('[6.9] een uitnodiging van een andere vriend terwijl een vriendenpotje loopt: het kind kan ja zeggen, en het eerste potje blijft staan', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    const fidD = await wordenVrienden(fien, daan), fidS = await vriendErbij(fien, sem);
    tikInRij(fien, fidD, 'Uitnodigen');
    await wacht();
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    await zetUit(RUSTIG, fien, daan);
    for (const x of [fien, daan]) { x.tik('backBtn'); await wacht(); }
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    check('de uitnodiging van Sem komt aan, met Ja, spelen!', /Sem/.test(zegt(fien)) && kanTikken(fien, 'Ja, spelen!'));
    tikTekst(fien, 'Ja, spelen!');
    await wacht();
    sem.tik('mpGo');
    await wacht();
    check('Fien speelt met Sem', opSpeelscherm(fien) && fien.get('session.S.hist.length') === 0 && opSpeelscherm(sem));
    const d = vriendenpotjeMet(fien, fidD);
    check('het potje met Daan blijft staan, met zijn zet', !!d && d.moves.length === 1 && !!vriendenpotjeMet(fien, fidS));
  });

  await regel('[6.9] een uitdaging om te beantwoorden staat vóór het potje tegen Turbo, de eigen uitdaging erna, en de telregel noemt ze', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), daan = maakApparaat('Daan'), lotte = maakApparaat('Lotte');
    mees.ev('setPref("predict", false); setPref("guard", false)');
    const fidD = await wordenVrienden(mees, daan), fidL = await vriendErbij(mees, lotte);
    stopApparaat(lotte);
    await daagUit(mees, fidL, 'Lotte');
    await startPotje(mees, 2);
    zet(mees, 'e2e4');
    await wacht();
    mees.tik('backBtn');
    await wacht();
    stopApparaat(mees);
    await daagUit(daan, fidD, 'Mees');
    schuifKlok(DAG);
    mees = await opent(mees);
    check('de kaart: Daan daagt je uit', /Daan daagt je uit/.test(tekstVan(mees, 'verder')) && kanTikken(mees, 'Ja, spelen!'));
    check('één regel eronder die telt', JSON.stringify(ookNogRegels(mees)) === JSON.stringify(['Ook nog een potje en een uitdaging']));
    tikTekst(mees, 'Ook nog');
    await wacht();
    const blad = mees.scherm(), plek = ['Daan daagt je uit', 'Turbo', 'Je uitdaging aan Lotte'].map(function (t) { return blad.indexOf(t); });
    check('het blad: eerst Daan, dan Turbo, dan de eigen uitdaging zonder antwoord', /Wat nog bezig is/.test(blad) && plek.every(function (p) { return p >= 0; }) &&
      plek[0] < plek[1] && plek[1] < plek[2] && /nog geen antwoord/.test(blad));
  });

  await regel('[6.11] de server ziet geen naam en geen zet: alleen bus, bewijs, blob en de versie die de schrijver las, en elke staat even lang', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const log = [], echt = fetch;
    fetch = function (url, o) { log.push({ url, body: o && o.body }); return echt(url, o); };
    try {
      let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      await vriendenpotje(mees, fien);
      await potjeTot(mees, fien, 6, mees);
      stopApparaat(fien);
      await zetUit(RUSTIG, mees);
      await biedRemise(mees);
      await wacht(5000);
      stopApparaat(mees);
      schuifKlok(DAG);
      fien = await opent(fien);
      fien.tik('verderKaart');
      await wacht();
      await zetUit(RUSTIG, fien);
      await tijd(20000);
    } finally { fetch = echt; }
    const potjes = log.filter(function (r) { return /\/v1\/potje$/.test(r.url); }).map(function (r) { return JSON.parse(r.body); });
    check('testopzet: staten geschreven', potjes.length >= 4);
    check('alleen bus, bewijs, blob en als', potjes.every(function (b) { return JSON.stringify(Object.keys(b).sort()) === '["als","bewijs","blob","bus"]'; }));
    const lengtes = potjes.map(function (b) { return b.blob.length; }).filter(function (n) { return n > 0; });
    check('elke staat is even lang', lengtes.length >= 4 && lengtes.every(function (n) { return n === lengtes[0]; }));
    const tekst = log.filter(function (r) { return typeof r.body === 'string'; }).map(function (r) { return r.body; }).join('\n');
    check('in geen verzoek een naam of de inhoud van een potje', !/Mees|Fien|moves|gameId|"white"/.test(tekst));
  });

  /* ================= wat de vriend moet weten: een einde, een Nu niet, een intrekking ================= */

  await regel('[6.7] Fien geeft op zonder netwerk, en de kamer is weg als ze een dag later opent: haar bus krijgt de opgave alsnog, en Mees telt zijn winst', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, fien);
    const voor = tellers(mees), kamer = fien.get('MP.room');
    stopApparaat(mees);
    geenNetwerk(fien);
    await tijd(3000);
    await geefOp(fien);
    await tijd(5000);
    tikTekst(fien, 'Naar huis');
    await wacht();
    stopApparaat(fien);
    weerNetwerk(fien);
    delete __server.wsrooms[kamer];
    schuifKlok(DAG);
    fien = await opent(fien);
    await tijd(40000);
    check('de staat heeft de opgave', (await busZegt(fien, fid, true) || {}).uitslag === 'opgave');
    stopApparaat(fien);
    schuifKlok(DAG);
    mees = await opent(mees);
    check('Mees ziet dat Fien opgaf', /Fien gaf op\. Jij wint dit potje!/.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    check('en telt de winst', tellers(mees) === nogEen(voor, true));
  });

  await regel('[6.7] schaakmat zonder netwerk, en het netwerk komt terug terwijl de app open blijft: de mat bereikt de ander', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const a = maakApparaat('Mees'), b = maakApparaat('Fien');
    const fid = await vriendenpotje(a, b);
    const wit = magZetten(a) ? a : b, zwart = wit === a ? b : a;
    for (let i = 0; i < MAT_WIT.length - 1; i++) await zetUit(MAT_WIT, a, b);
    stopApparaat(zwart);
    geenNetwerk(wit);
    await tijd(3000);
    await zetUit(MAT_WIT, wit);
    await tijd(5000);
    tikTekst(wit, 'Naar huis');
    await wacht();
    weerNetwerk(wit);
    await tijd(120000);
    check('de staat heeft de mat', (await busZegt(wit, fid, true) || {}).uitslag === 'mat');
    stopApparaat(wit);
    const z = await opent(zwart);
    check('zwart ziet de mat bij het openen', new RegExp('Schaakmat\\. ' + wit.naam + ' wint dit potje\\.').test(tekstVan(z, 'verder')));
  });

  await regel('[6.7] Fien geeft op met netwerk, en dan herstart de server: als Fien opent, staat de opgave weer in haar bus, en Mees telt zijn winst', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, fien);
    const voor = tellers(mees);
    stopApparaat(mees);
    await geefOp(fien);
    await tijd(5000);
    tikTekst(fien, 'Naar huis');
    await wacht();
    stopApparaat(fien);
    __herstartServer();
    schuifKlok(DAG);
    fien = await opent(fien);
    await tijd(40000);
    check('de opgave staat weer in de staat', (await busZegt(fien, fid, true) || {}).uitslag === 'opgave');
    stopApparaat(fien);
    schuifKlok(DAG);
    mees = await opent(mees);
    check('Mees ziet dat Fien opgaf', /Fien gaf op\. Jij wint dit potje!/.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    check('en telt de winst', tellers(mees) === nogEen(voor, true));
  });

  await regel('[6.2] de server herstart nadat Fien het einde las en voordat Mees weer opent: Fien zet het einde terug in haar bus, en Mees is vrij', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(30000);
    tikTekst(mees, 'Naar huis');
    await wacht();
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    tikTekst(fien, 'Naar huis');
    await tijd(40000);
    check('testopzet: de staat zegt dat Fien het einde kent', !!(await busZegt(fien, fid, true) || {}).uitslag);
    __herstartServer();
    mees = await opent(mees);
    await tijd(120000);
    check('de opgave staat weer in de staat', (await busZegt(mees, fid, true) || {}).uitslag === 'opgave');
    check('het einde dat Fien kent, staat weer in de staat', !!(await busZegt(fien, fid, true) || {}).uitslag);
    mees.tik('tabVrienden');
    check('Mees is vrij: zijn rij biedt Uitnodigen, zonder de zin dat Fien het nog niet weet', /Uitnodigen/.test(vriendRijTekst(mees, fid)) &&
      !/Weer uitnodigen kan/.test(vriendRijTekst(mees, fid)));
  });

  await regel('[6.2] allebei geven op zonder netwerk: de staat toont één uitslag voor allebei, allebei tellen één potje, en allebei zijn vrij', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, mees);
    const voorM = tellers(mees), voorF = tellers(fien), kamer = mees.get('MP.room');
    geenNetwerk(mees);
    geenNetwerk(fien);
    await tijd(3000);
    await geefOp(mees);
    await geefOp(fien);
    /* de kamer is weg als ze terugkomen: de twee einden gaan via de staat van het paar */
    delete __server.wsrooms[kamer];
    await tijd(5000);
    for (const x of [mees, fien]) { tikTekst(x, 'Naar huis'); await wacht(); }
    weerNetwerk(mees);
    weerNetwerk(fien);
    await tijd(90000);
    const m = await busZegt(mees, fid, true) || {}, f = await busZegt(fien, fid, true) || {};
    check('beide apparaten lezen hetzelfde potje met een uitslag', !!m.uitslag && !!f.uitslag && m.gameId === f.gameId);
    check('allebei één potje geteld', JSON.parse(tellers(mees))[0] === JSON.parse(voorM)[0] + 1 && JSON.parse(tellers(fien))[0] === JSON.parse(voorF)[0] + 1);
    for (const x of [mees, fien]) x.tik('tabVrienden');
    check('allebei vrij: de rij biedt Uitnodigen, zonder de zin', [mees, fien].every(function (x) {
      return /Uitnodigen/.test(vriendRijTekst(x, fid)) && !/Weer uitnodigen kan/.test(vriendRijTekst(x, fid)); }));
  });

  await regel('[6.2] Mees geeft op terwijl Fien weg is en nodigt meteen weer uit: bezet, met de zin, en de opgave blijft staan; nadat Fien het einde las, is Mees vrij', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(10000);
    tikTekst(mees, 'Naar huis');
    await wacht();
    const uitnodigingen = JSON.stringify(__server.buses);
    mees.tik('tabVrienden');
    check('de rij zegt het, en biedt geen Uitnodigen', /Weer uitnodigen kan als Fien SchaakHeld opent\./.test(vriendRijTekst(mees, fid)) && !/Uitnodigen/.test(vriendRijTekst(mees, fid)));
    mees.ev('inviteFriend(' + JSON.stringify(fid) + ')');
    await wacht();
    check('wie toch uitnodigt (Nieuw potje met), krijgt de zin in een venster met één Oké, zonder kruisje',
      /Fien weet nog niet hoe jullie potje afliep\. Opent Fien SchaakHeld, dan kun je weer uitnodigen\./.test(mees.scherm()) && kanTikken(mees, 'Oké') && !mees.ziet('id="mClose"'));
    await vensterWeg(mees);
    check('geen uitnodiging verstuurd, en de opgave staat nog in de staat', JSON.stringify(__server.buses) === uitnodigingen &&
      (await busZegt(mees, fid, true) || {}).uitslag === 'opgave');
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet de opgave', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
    fien.tik('verderKaart');
    await wacht();
    tikTekst(fien, 'Naar huis');
    await tijd(20000);
    stopApparaat(fien);
    mees = await opent(mees);
    await tijd(20000);
    mees.tik('tabVrienden');
    check('nu is Mees vrij', /Uitnodigen/.test(vriendRijTekst(mees, fid)) && !/Weer uitnodigen kan/.test(vriendRijTekst(mees, fid)));
    await daagUit(mees, fid, 'Fien');
    check('en zijn nieuwe uitdaging staat in zijn bus', (await busZegt(mees, fid, true) || {}).state === 'uitdaging');
  });

  await regel('[6.4] Fien zegt Nu niet en daagt Mees meteen zelf uit: bezet, met de zin; nadat Mees hoorde dat Fien even niet kon, is Fien vrij', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    tikTekst(fien, 'Nu niet');
    await wacht();
    fien.tik('tabVrienden');
    check('de rij zegt het, en biedt geen Uitnodigen', /Weer uitnodigen kan als Mees SchaakHeld opent\./.test(vriendRijTekst(fien, fid)) && !/Uitnodigen/.test(vriendRijTekst(fien, fid)));
    fien.ev('inviteFriend(' + JSON.stringify(fid) + ')');
    await wacht();
    check('wie toch uitnodigt, krijgt de zin in een venster', /Mees weet nog niet wat je op de uitdaging zei\. Opent Mees SchaakHeld, dan kun je weer uitnodigen\./.test(fien.scherm()));
    await vensterWeg(fien);
    check('het Nu niet staat nog in de staat', (await busZegt(fien, fid, true) || {}).uitslag === 'nee');
    stopApparaat(fien);
    mees = herlaad(mees);
    vierWeg(mees);
    await tijd(20000);
    check('Mees hoort dat Fien even niet kan', /Fien kan nu even niet/.test(mees.scherm()));
    await vensterWeg(mees);
    await tijd(20000);
    stopApparaat(mees);
    fien = await opent(fien);
    await tijd(20000);
    fien.tik('tabVrienden');
    check('nu is Fien vrij', /Uitnodigen/.test(vriendRijTekst(fien, fid)) && !/Weer uitnodigen kan/.test(vriendRijTekst(fien, fid)));
    await daagUit(fien, fid, 'Mees');
    const f = await busZegt(fien, fid, true) || {};
    check('haar uitdaging staat in haar bus', f.state === 'uitdaging' && !f.uitslag);
  });

  await regel('[6.4] Mees trekt in voordat Fien Ja, spelen! tikt: geen potje, Fien hoort dat Mees de uitdaging introk, en Mees is vrij', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    const voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    schuifKlok(UUR);
    fien = await opent(fien);
    tikInRij(mees, fid, '⋯');
    await wacht(100);
    tikTekst(mees, 'Uitdaging intrekken');
    await tijd(2000);
    check('testopzet: Fien kan nog Ja, spelen! tikken', kanTikken(fien, 'Ja, spelen!'));
    tikTekst(fien, 'Ja, spelen!');
    await tijd(5000);
    check('geen bord bij Fien', !opSpeelscherm(fien));
    check('Fien hoort dat Mees de uitdaging introk', /Mees had de uitdaging ingetrokken\. Dit potje telt niet mee\. Daag Mees gerust zelf uit!/.test(fien.scherm()));
    await vensterWeg(fien);
    check('de kaart van Fien toont geen uitdaging meer', !/daagt je uit/.test(tekstVan(fien, 'verder')));
    await tijd(40000);
    mees.tik('tabVrienden');
    check('bij Mees geen potje, en hij is vrij', !vriendenpotjeMet(mees, fid) && /Uitnodigen/.test(vriendRijTekst(mees, fid)) &&
      !/doet mee/.test(tekstVan(mees, 'verder')));
    check('geen teller veranderd', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  /* na meer dan dertig dagen is de staat van de server verlopen; wat een apparaat dat zo lang sliep dan doet, is de
     grens die het ontwerp noemt (het schrijft het potje terug zoals het het kende) */
  for (const [hoe, later, zetten] of [['een dag later', DAG, 22], ['een dag later, na een te kort potje', DAG, 2]]) {
    await regel('[6.7] het potje eindigde op de telefoon; de tablet opent ' + hoe + ': geen potje met Fien, de rij zegt Uitnodigen, niets geteld en niets geschreven', async function (check) {
      zetDatum('2026-11-16T10:00:00');
      let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(tel, fien);
      await potjeTot(tel, fien, zetten, fien);
      let tab = await tweedeApparaat(tel);
      await tijd(30000);
      check('testopzet: de tablet heeft het potje met Fien', !!vriendenpotjeMet(tab, fid));
      stopApparaat(tab);
      await geefOp(fien);
      await tijd(5000);
      for (const x of [tel, fien]) tikTekst(x, 'Naar huis');
      await tijd(60000);
      await tel.ev('syncNow()');
      await tijd(5000);
      const telTellers = tellers(tel);
      stopApparaat(tel);
      stopApparaat(fien);
      schuifKlok(later);
      const busM = await potjesbus(tel, fid, true), log = potjesLog();
      try {
        tab = await opent(tab);
        await tijd(40000);
      } finally { log.stop(); }
      check('geen potje met Fien op de kaart', !/Fien/.test(tekstVan(tab, 'verder')) && !vriendenpotjeMet(tab, fid));
      tab.tik('tabVrienden');
      check('de rij zegt Uitnodigen', /Uitnodigen/.test(vriendRijTekst(tab, fid)) && !/aan zet/.test(vriendRijTekst(tab, fid)));
      check('de tablet telde niets', tellers(tab) === telTellers);
      check('de tablet schreef niets naar de staat', !log.log.some(function (w) { return w.bus === busM; }));
    });
  }

  for (const [hoe, venster] of [['wacht even', 10000], ['gaat na twee seconden dicht', 2000]]) {
    await regel('[6.7] Fien geeft op; de telefoon van Mees ziet het einde en ' + hoe + '; de tablet had hetzelfde einde nog nieuw bewaard: geen eindkaart, niets geteld, en samen één keer', async function (check) {
      zetDatum('2026-11-16T10:00:00');
      let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
      await vriendenpotje(tel, fien);
      await potjeTot(tel, fien, 22, fien);
      let tab = await tweedeApparaat(tel);
      const voor = tellers(tel), record = JSON.parse(JSON.stringify(samenPotje(tel)));
      await geefOp(fien);
      await wacht(venster);
      check('testopzet: de telefoon telde de winst', tellers(tel) === nogEen(voor, true));
      record.result = { kind: 'opgave', by: record.myColor === 'w' ? 'b' : 'w', ply: record.moves.length };
      stopApparaat(tel);
      stopApparaat(tab);
      tab.opslag.setItem('schaakheld-samen', JSON.stringify({ v: 1, games: { [record.gameId]: Object.assign({}, record, { shown: false }) } }));
      tab = await opent(tab);
      check('de tablet toont geen eindkaart voor het potje met Fien', !/Fien/.test(tekstVan(tab, 'verder')) && !kanTikken(tab, 'Bekijk'));
      check('en telde niets', tellers(tab) === nogEen(voor, true));
      tel = await opent(tel);
      await tab.ev('syncNow()');
      await wacht(2000);
      check('samen één keer geteld', tellers(tel) === nogEen(voor, true) && tellers(tab) === nogEen(voor, true));
    });
  }

  await regel('[6.7] een potje tegen Turbo dat afloopt terwijl een vriendenpotje doorloopt, gaat niet door de telling van de vriendenpotjes: de winst daarna telt', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    mees.ev('setPref("predict", false); setPref("guard", false)');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, fien);
    mees.tik('backBtn');
    await wacht(2000);
    await startPotje(mees, 1);
    await zetEnWacht(mees, 'e2e4');
    await wacht(6000);
    await geefOp(mees);
    tikTekst(mees, 'Naar huis');
    await wacht(2000);
    const voor = tellers(mees);
    mees.tik('verderKaart');
    await wacht(2000);
    await geefOp(fien);
    await tijd(5000);
    check('Mees leest dat hij wint', /JIJ WINT|Jij wint/.test(tekstVan(mees, 'eindkaart')));
    check('en de winst telt', tellers(mees) === nogEen(voor, true));
  });

  await regel('[6.9] een potje met iemand die geen vriend is, blijft bewaard als het kind een vriendenpotje opent, en de kaart leidt ernaar terug', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien'), sem = maakApparaat('Sem');
    const fid = await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 4, fien);
    let tab = await tweedeApparaat(tel);
    await samenSpelen(tab, sem);
    await speel(tab, sem, 'e2e4');
    await speel(tab, sem, 'e7e5');
    await speel(tab, sem, 'g1f3');
    tab.tik('backBtn');
    await tijd(40000);
    stopApparaat(tel);
    await zetUit(RUSTIG, fien);
    await tijd(40000);
    check('testopzet: de kaart van de tablet noemt het potje met Fien', /potje met Fien/i.test(tekstVan(tab, 'verder') + ' ' + ookNogRegels(tab).join(' ')));
    if (/potje met Fien/i.test(tekstVan(tab, 'verderKaart'))) tab.tik('verderKaart'); else tab.tik('ookNog');
    await wacht();
    await zetUit(RUSTIG, tab);
    await tijd(5000);
    tab.tik('backBtn');
    await tijd(3000);
    const semPotje = function (x) { const r = samenZicht(x); return !!r && !!r.games && Object.keys(r.games).some(function (k) {
      return r.games[k].peerName === 'Sem' && !r.games[k].result && r.games[k].moves.length === 3; }); };
    check('het potje met Sem staat nog bewaard, met zijn drie zetten', semPotje(tab));
    tab = await opent(tab);
    check('ook na opnieuw openen', semPotje(tab));
    check('de kaart leidt naar het potje met Sem', /potje met Sem/i.test(tekstVan(tab, 'verder') + ' ' + ookNogRegels(tab).join(' ')));
  });

  /* ================= wat een verkeerde bouw anders ongemerkt laat ================= */

  await regel('[6.1] een uitdaging, een leeg potje en een potje na 40 halve zetten zijn als staat even lang, en de aangevulde tekst is 2048 bytes', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fidF = await vriendenpotje(mees, fien);
    const busF = await potjesbus(mees, fidF);
    await wacht(2000);
    const leeg = __server.potjes[busF] ? __server.potjes[busF].blob.length : 0;
    await potjeTot(mees, fien, 40, mees);
    await wacht(2000);
    const lang = __server.potjes[busF] ? __server.potjes[busF].blob.length : 0, s = await busInhoud(mees, fidF, busF);
    const rauw = __server.potjes[busF] ? await mees.ev('openJSON(P.friends[' + JSON.stringify(fidF) + '].k, "paar", b64urlBytes(' + JSON.stringify(__server.potjes[busF].blob) + '))') : null;
    mees.tik('backBtn');
    await wacht();
    const fidD = await vriendErbij(mees, daan);
    stopApparaat(daan);
    await daagUit(mees, fidD, 'Daan');
    const busD = await potjesbus(mees, fidD), uitd = __server.potjes[busD] ? __server.potjes[busD].blob.length : 0;
    check('testopzet: drie staten, de lange met 40 zetten', !!leeg && !!lang && !!uitd && !!s && s.spel.zetten.length >= 40);
    check('even lang', leeg === lang && lang === uitd);
    check('de aangevulde tekst is 2048 bytes', mees.get('new TextEncoder().encode(' + JSON.stringify(JSON.stringify(rauw)) + ').length') === 2048);
  });

  await regel('[6.6] een tweede apparaat van wie remise aanbood, vernieuwt de bus met dezelfde bytes: de termijn loopt door, en na veertien dagen is het remise', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const busM = await potjesbus(mees, fid, true), voor = JSON.parse(JSON.stringify(__server.potjes[busM] || null));
    let tab = await tweedeApparaat(mees);
    await tijd(30000);
    check('testopzet: de tablet heeft het potje met het aanbod', !!voor && !!vriendenpotjeMet(tab, fid) && !!vriendenpotjeMet(tab, fid).offer);
    stopApparaat(mees);
    stopApparaat(tab);
    schuifKlok(8 * DAG);
    tab = await opent(tab);
    const na = __server.potjes[busM];
    check('de tablet vernieuwde de bus met dezelfde bytes: de server ziet hem als onveranderd', !!voor && !!na && na.tot > voor.tot &&
      na.blob === voor.blob && na.veranderd === voor.veranderd);
    stopApparaat(tab);
    schuifKlok(7 * DAG);
    tab = await opent(tab);
    await tijd(20000);
    check('na meer dan veertien dagen is het remise op de tablet', /Je potje met Fien is remise/.test(tekstVan(tab, 'verder')));
  });


  await regel('[6.11] een zet, een remise-aanbod en opgeven gaan allemaal naar de ene staat van het paar', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 6, mees);
    stopApparaat(fien);
    const busM = await potjesbus(mees, fid, true), log = potjesLog();
    try {
      await zetUit(RUSTIG, mees);
      await tijd(20000);
      mees.tik('backBtn');
      await tijd(20000);
      naarSpelen(mees);
      mees.tik('verderKaart');
      await wacht();
      await geefOp(mees);
      await tijd(20000);
    } finally { log.stop(); }
    check('testopzet: Mees schreef', log.log.length >= 2);
    check('alleen naar de staat van het paar', log.log.every(function (w) { return w.bus === busM; }));
  });

  await regel('[6.7] "Alles wissen" zonder ander apparaat, met twee vriendenpotjes: allebei de vrienden zien bij het openen dat Mees opgaf', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fidF = await vriendenpotje(mees, fien);
    await zetUit(RUSTIG, mees, fien);
    mees.tik('backBtn');
    await wacht();
    const fidD = await vriendErbij(mees, daan);
    tikInRij(mees, fidD, 'Uitnodigen');
    await wacht();
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    mees.tik('mpGo');
    await wacht();
    await zetUit(RUSTIG, mees, daan);
    check('testopzet: twee vriendenpotjes', !!vriendenpotjeMet(mees, fidF) && !!vriendenpotjeMet(mees, fidD));
    for (const x of [mees, fien, daan]) if (opSpeelscherm(x)) { x.tik('backBtn'); await wacht(); }
    stopApparaat(fien);
    stopApparaat(daan);
    mees.ev('confirmReset()');
    await wacht();
    check('de vraag noemt allebei', /Dan geef je ook je potjes met (Fien en Daan|Daan en Fien) op\./.test(mees.scherm()));
    tikTekst(mees, 'Ja, wis alles');
    await tijd(10000);
    schuifKlok(DAG);
    fien = await opent(fien);
    daan = await opent(daan);
    check('Fien ziet dat Mees opgaf', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
    check('Daan ook', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(daan, 'verder')));
  });

  await regel('[6.3] een keer lezen die mislukt, is niet hetzelfde als een bus die er niet is: het andere apparaat schrijft zijn oude stand niet over de nieuwe', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 4, tel);
    let tab = await tweedeApparaat(tel);
    await tijd(30000);
    stopApparaat(fien);
    stopApparaat(tel);
    const voorZet = (vriendenpotjeMet(tab, fid) || { moves: [] }).moves.length;
    tab.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, tab);
    await tijd(5000);
    const busM = await potjesbus(tab, fid, true), n = (await busZegt(tab, fid, true) || {}).zetten;
    stopApparaat(tab);
    const echt = fetch;
    fetch = function (url, o) { return /\/v1\/bus\/check$/.test(url) ? Promise.resolve({ status: 503, json: function () { return Promise.resolve({}); } }) : echt(url, o); };
    try {
      tel = herlaad(tel);
      vierWeg(tel);
      await tijd(40000);
    } finally { fetch = echt; }
    check('testopzet: de tablet zette, en de staat heeft die zet', voorZet > 0 && n === voorZet + 1);
    check('de staat heeft nog de zet van de tablet', (await busZegt(tel, fid, true) || {}).zetten === n);
  });

  await regel('[6.2] op het speelscherm leest de app vaker terwijl de vriend er niet is: om de vijf seconden', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    await tijd(10000);
    let keren = 0;
    const echt = fetch;
    fetch = function (url, o) { if (/\/v1\/bus\/check$/.test(url)) keren++; return echt(url, o); };
    try { await tijd(30000); } finally { fetch = echt; }
    check('testopzet: Mees zit op het speelscherm', opSpeelscherm(mees));
    check('in dertig seconden minstens vijf keer gelezen', keren >= 5);
  });

  await regel('[6.3] een opgave die het andere apparaat van Mees schreef, neemt de telefoon over, en hij schrijft het lopende potje niet terug, ook als het profiel niet bij is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 22, tel);
    let tab = await tweedeApparaat(tel);
    await tijd(30000);
    stopApparaat(tel);
    stopApparaat(fien);
    const echt = fetch;
    fetch = function (url, o) { return /\/v1\/profile\//.test(url) ? Promise.resolve({ status: 503, json: function () { return Promise.resolve({}); },
      arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(0)); } }) : echt(url, o); };
    try {
      tab.tik('verderKaart');
      await wacht();
      await geefOp(tab);
      await tijd(5000);
      tikTekst(tab, 'Naar huis');
      await wacht();
      check('testopzet: de opgave staat in de staat', (await busZegt(tab, fid, true) || {}).uitslag === 'opgave');
      stopApparaat(tab);
      tel = await opent(tel);
      await tijd(20000);
    } finally { fetch = echt; }
    check('de telefoon heeft geen lopend potje met Fien meer', !vriendenpotjeMet(tel, fid));
    check('en de staat zegt nog steeds dat hij opgaf', (await busZegt(tel, fid, true) || {}).uitslag === 'opgave');
  });

  await regel('[6.4] een uitdaging die op de telefoon gemaakt is, staat ook op de tablet: uit de staat, al heeft de vriend hem nog niet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(tel, fien);
    stopApparaat(fien);
    await daagUit(tel, fid, 'Fien');
    const tab = await tweedeApparaat(tel);
    await tijd(30000);
    tab.tik('tabVrienden');
    check('de rij op de tablet zegt Uitgedaagd', /Uitgedaagd · nog geen antwoord/.test(vriendRijTekst(tab, fid)));
  });

  await regel('[6.8] een vriend weghalen aan wie een uitdaging staat, trekt die in: de vriend ziet geen uitdaging bij het openen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    await daagUit(mees, fid, 'Fien');
    const bus = await potjesbus(mees, fid), metUitdaging = (__server.potjes[bus] || {}).blob;
    check('testopzet: de uitdaging staat op de server', !!metUitdaging);
    tikInRij(mees, fid, '⋯');
    await wacht();
    tikTekst(mees, 'Vriend weghalen');
    await wacht();
    tikTekst(mees, 'Ja, weghalen');
    await tijd(10000);
    check('Mees schreef het intrekken voordat de vriend weg is', !!__server.potjes[bus] && __server.potjes[bus].blob !== metUitdaging);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('de staat zegt dat er geen uitdaging staat', !(await busZegt(fien, fid)));
    check('Fien ziet geen uitdaging van Mees', !/Mees daagt je uit/.test(tekstVan(fien, 'verder')) && !vriendenpotjeMet(fien, fid));
  });

  await regel('[6.5] een server zonder staten met een versie: een potje tussen vrienden gaat dan alleen via de kamer, en stopt als de kamer weg is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const echt = fetch;
    fetch = oudeServer(echt);
    try {
      const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(mees, fien);
      await zetUit(RUSTIG, mees, fien);
      await zetUit(RUSTIG, mees, fien);
      await tijd(5000);
      check('de app weet dat deze server geen staten met een versie heeft', mees.get('versiesOnbekend') === true && fien.get('versiesOnbekend') === true);
      check('de zetten gaan via de kamer', mees.get('session.S.hist.length') === 2 && fien.get('session.S.hist.length') === 2);
      check('er staat niets op de server', !__server.potjes[await potjesbus(mees, fid)]);
      __herstartServer();
      await tijd(60000);
      check('als de kamer weg is, is het potje gestopt', /is gestopt/.test(mees.scherm() + ' ' + tekstVan(mees, 'verder')));
    } finally { fetch = echt; }
  });

  /* ================= de races: wie leest, beslist; een ja wint altijd; een geschreven remise is definitief ================= */

  const potjesVan = function (x, fid) {
    const r = samenZicht(x), g = r && r.games ? r.games : {};
    return Object.keys(g).map(function (k) { return g[k]; }).filter(function (y) { return y.fid === fid && !y.ingetrokken; });
  };

  await regel('[6.4] Fien tikt Ja, spelen! en haar ja komt pas na de intrekking van Mees bij de server: de intrekking was eerst, er is geen potje, en Fien hoort dat Mees introk', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const bus = await potjesbus(fien, fid), net = onderweg();
    try {
      net.houd(bus);
      tikTekst(fien, 'Ja, spelen!');
      await tijdFijn(1000);
      tikInRij(mees, fid, '⋯');
      await wacht(100);
      tikTekst(mees, 'Uitdaging intrekken');
      await tijdFijn(1000);
      net.laat(bus);
      await tijd(40000);
    } finally { net.stop(); }
    check('Fien zit niet in een potje en hoort dat Mees introk', !opSpeelscherm(fien) && !vriendenpotjeMet(fien, fid) && /had de uitdaging ingetrokken/.test(fien.scherm()));
    check('de staat heeft geen potje en geen uitdaging', !(await busZegt(mees, fid)));
    mees.tik('tabVrienden');
    check('Mees is vrij', !vriendenpotjeMet(mees, fid) && /Uitnodigen/.test(vriendRijTekst(mees, fid)));
  });

  await regel('[6.4] Fien tikt Ja, spelen!; voordat haar ja aankomt, trekt Mees in en daagt opnieuw uit: de nieuwe uitdaging staat, het ja op de oude past niet meer, en Fien ziet de nieuwe', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const id = vriendenpotjeMet(fien, fid).gameId, bus = await potjesbus(fien, fid), net = onderweg();
    try {
      net.houd(bus);
      tikTekst(fien, 'Ja, spelen!');
      await tijdFijn(1000);
      tikInRij(mees, fid, '⋯');
      await wacht(100);
      tikTekst(mees, 'Uitdaging intrekken');
      await wacht(100);
      await daagUit(mees, fid, 'Fien');
      check('testopzet: Mees heeft een nieuwe uitdaging', potjesVan(mees, fid).some(function (y) { return y.state === 'uitdaging' && y.gameId !== id; }));
      net.laat(bus);
      await tijd(60000);
    } finally { net.stop(); }
    const m = potjesVan(mees, fid), f = potjesVan(fien, fid), s = await busZegt(mees, fid);
    check('in de staat de nieuwe uitdaging', !!s && s.state === 'uitdaging' && s.gameId !== id);
    check('bij Mees alleen zijn nieuwe uitdaging', m.length === 1 && m[0].gameId === s.gameId && m[0].state === 'uitdaging');
    check('bij Fien de nieuwe uitdaging om te beantwoorden, geen potje', f.length === 1 && f[0].gameId === s.gameId && !opSpeelscherm(fien) &&
      /Mees daagt je uit/.test(tekstVan(fien, 'verder') + ' ' + fien.scherm()));
  });

  await regel('[6.4] Ja, spelen! zonder netwerk: het kind hoort dat er geen verbinding is en er is nog geen potje; zodra het netwerk terug is, begint het', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    geenNetwerk(fien);
    tikTekst(fien, 'Ja, spelen!');
    await wacht(1000);
    check('het kind hoort dat er geen verbinding is', /geen verbinding/.test(fien.scherm() + ' ' + toastTekst(fien)));
    await tijd(10000);
    check('nog geen potje en geen bord', !opSpeelscherm(fien) && (vriendenpotjeMet(fien, fid) || {}).state !== 'potje');
    weerNetwerk(fien);
    await tijd(40000);
    check('met netwerk begint het potje', (vriendenpotjeMet(fien, fid) || {}).state === 'potje');
    await tijd(20000);
    check('en Mees leest dat Fien meedoet', /Fien doet mee/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.4] het antwoord op het ja van Fien raakt kwijt: haar app leest dat het ja er is (of dat Mees het potje al nam), en er is één potje', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const busF = await potjesbus(fien, fid, true), net = onderweg();
    try {
      net.kwijt(busF);
      tikTekst(fien, 'Ja, spelen!');
      await tijd(60000);
    } finally { net.stop(); }
    const f = potjesVan(fien, fid), m = potjesVan(mees, fid);
    check('bij Fien één potje', f.length === 1 && f[0].state === 'potje');
    check('bij Mees één potje, en hij leest dat Fien meedoet', m.length === 1 && m[0].state === 'potje' && /Fien doet mee/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.4] na het versturen van het ja leest Fien dat Mees introk: dat verandert niets, het potje staat bij allebei', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const busF = await potjesbus(fien, fid, true), net = onderweg();
    try {
      net.kwijt(busF);
      tikTekst(fien, 'Ja, spelen!');
      await tijdFijn(500);
      tikInRij(mees, fid, '⋯');
      await wacht(100);
      tikTekst(mees, 'Uitdaging intrekken');
      await tijd(60000);
    } finally { net.stop(); }
    check('bij Fien staat het potje', (vriendenpotjeMet(fien, fid) || {}).state === 'potje' && !/ingetrokken/.test(fien.scherm()));
    check('bij Mees ook', (vriendenpotjeMet(mees, fid) || {}).state === 'potje' && /Fien doet mee/.test(tekstVan(mees, 'verder')));
  });

  for (const [eerst, dan] of [['Ja, spelen! op de telefoon', 'Nu niet op de tablet'], ['Nu niet op de tablet', 'Ja, spelen! op de telefoon']]) {
    await regel('[6.4] ' + eerst + ', daarna ' + dan + ' van hetzelfde kind: wat eerst kwam, staat', async function (check) {
      zetDatum('2026-11-14T10:00:00');
      let mees = maakApparaat('Mees'), tel = maakApparaat('Fien');
      const fid = await wordenVrienden(mees, tel);
      let tab = await tweedeApparaat(tel);
      await tijd(30000);
      stopApparaat(tel);
      stopApparaat(tab);
      await daagUit(mees, fid, 'Fien');
      schuifKlok(UUR);
      tel = await opent(tel);
      tab = await opent(tab);
      check('testopzet: beide apparaten tonen de uitdaging', /Mees daagt je uit/.test(tekstVan(tel, 'verder')) && /Mees daagt je uit/.test(tekstVan(tab, 'verder')));
      const ja = /^Ja/.test(eerst);
      if (ja) { tikTekst(tel, 'Ja, spelen!'); await tijdFijn(1500); tikTekst(tab, 'Nu niet'); }
      else { tikTekst(tab, 'Nu niet'); await tijdFijn(1500); tikTekst(tel, 'Ja, spelen!'); }
      await tijd(40000);
      if (ja) {
        check('de tablet heeft het potje, geen Nu niet', (vriendenpotjeMet(tab, fid) || {}).state === 'potje');
        check('Mees leest dat Fien meedoet, en hoort geen Nu niet', /Fien doet mee/.test(tekstVan(mees, 'verder')) && !/kan nu even niet/.test(mees.scherm()));
      } else {
        check('de telefoon heeft geen potje, en de uitdaging is van de kaart', !opSpeelscherm(tel) && (vriendenpotjeMet(tel, fid) || {}).state !== 'potje' &&
          !/Mees daagt je uit/.test(tekstVan(tel, 'verder')));
        check('Mees hoort dat Fien even niet kan', /Fien kan nu even niet/.test(mees.scherm()));
      }
    });
  }

  /* het aanbod van Mees staat veertien dagen en tien minuten; Fien zit op haar bord met het aanbod */
  /* een rustig potje van n halve zetten: paarden heen en weer, en om de 98 halve zetten een pionzet van elk, zodat de
     vijftigzettenregel het niet beëindigt */
  const rustigLang = function (n) {
    const z = [], wit = ['a2a3', 'b2b3', 'c2c3', 'd2d3', 'e2e3', 'f2f3'], zwart = ['a7a6', 'b7b6', 'c7c6', 'd7d6', 'e7e6', 'f7f6'];
    while (z.length < n) {
      const i = z.length % 98, blok = Math.floor(z.length / 98);
      z.push(i === 96 ? wit[blok] : i === 97 ? zwart[blok] : ['g1f3', 'g8f6', 'f3g1', 'f6g8'][i % 4]);
    }
    return z;
  };

  await regel('[6.6] V9 met de 500e halve zet is een potje tussen vrienden remise: wie hem zet ziet het meteen, de ander bij het openen, met de zin over de marathon, en elk telt één keer', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    tikTekst(fien, 'Ja, spelen!');
    await tijd(5000);
    if (fien.get('!!(session && session.online)')) { fien.tik('backBtn'); await wacht(); }
    const lijst = rustigLang(500);
    /* een ander apparaat van Mees bracht het potje tot de 499e halve zet; zwart doet de 500e */
    const uit = JSON.parse(await mees.ev('(async function (fid, zetten) { await leesPaar(fid); var f = P.friends[fid], p = paarVan(fid);' +
      ' var s = JSON.parse(JSON.stringify(p.staat)); s.spel.zetten = zetten; s.seq += 1; var blob = await staatNaarBlob(f.k, s);' +
      ' var a = await schrijfPaar(f, blob, p.toont); return JSON.stringify({ code: a.code, meesWit: s.spel.wit === myRole(f) }); })(' +
      JSON.stringify(fid) + ', ' + JSON.stringify(lijst.slice(0, 499)) + ')'));
    check('testopzet: het potje staat op 499 halve zetten', uit.code === 204 && ((await busZegt(mees, fid)) || {}).zetten === 499);
    let zw = uit.meesWit ? fien : mees, wt = uit.meesWit ? mees : fien;
    const naamZw = uit.meesWit ? 'Fien' : 'Mees', naamWt = uit.meesWit ? 'Mees' : 'Fien';
    const voorZw = tellers(zw), voorWt = tellers(wt);
    stopApparaat(wt);
    zw = await opent(zw);
    zw.tik('verderKaart');
    await wacht();
    check('testopzet: zwart kan de 500e halve zet doen', magZetten(zw) && zw.get('session.S.hist.length') === 499);
    zet(zw, lijst[499]);
    await tijd(5000);
    const marathon = 'Remise: dit potje duurde 250 zetten, en langer kan niet. Wat een marathon!';
    const s = (await busInhoud(zw, fid, await potjesbus(zw, fid))).spel;
    check('de staat: remise met de 500e halve zet, soort lang', !!s && s.fase === 'klaar' && s.uitslag.soort === 'lang' && s.uitslag.ply === 500 && s.zetten.length === 500);
    check('wie de zet deed, ziet meteen de remise met de zin', /Gelijkspel!/.test(tekstVan(zw, 'eindkaart')) && tekstVan(zw, 'eindkaart').indexOf(marathon) >= 0);
    check('en telt één gespeeld potje', JSON.parse(tellers(zw))[0] === JSON.parse(voorZw)[0] + 1);
    schuifKlok(UUR);
    wt = await opent(wt);
    check('de ander ziet bij het openen dat het potje remise is', new RegExp('Je potje met ' + naamZw + ' is remise').test(tekstVan(wt, 'verder')));
    wt.tik('verderKaart');
    await wacht();
    check('de eindkaart van de ander heeft de zin', tekstVan(wt, 'eindkaart').indexOf(marathon) >= 0);
    check('en telt één gespeeld potje', JSON.parse(tellers(wt))[0] === JSON.parse(voorWt)[0] + 1);
    check('niemand wint', JSON.parse(tellers(zw))[1] === JSON.parse(voorZw)[1] && JSON.parse(tellers(wt))[1] === JSON.parse(voorWt)[1] && !!naamWt);
  });

  const remiseKlaar = async function () {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const t0 = Date.now(), voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + 10 * 60000);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    return { mees, fien, fid, voorM, voorF };
  };

  await regel('[6.6] de zet van Fien komt 0,4 s na de remise van Mees bij de server: de remise is definitief, Fien leest dat haar laatste zet niet meetelt, en elk telt één keer', async function (check) {
    let { mees, fien, fid, voorM, voorF } = await remiseKlaar();
    const bus = await potjesbus(fien, fid), echt = fetch;
    let fienVast = null, gekruist = false;
    /* de eerste schrijfactie na het openen is de zet van Fien: die blijft hangen tot de remise van Mees erop staat */
    fetch = function (url, o) {
      const b = /\/v1\/potje$/.test(url) && o && typeof o.body === 'string' ? JSON.parse(o.body) : null;
      if (b && b.bus === bus && !gekruist && !fienVast) return new Promise(function (k) { fienVast = function () { k(echt(url, o)); }; });
      if (b && b.bus === bus && fienVast && !gekruist) {
        gekruist = true;
        return echt(url, o).then(function (r) { if (r.status === 204) setTimeout(fienVast, 400); return r; });
      }
      return echt(url, o);
    };
    const n0 = fien.get('session.S.hist.length');
    try {
      await zetUit(RUSTIG, fien);
      check('testopzet: de zet van Fien hangt', !!fienVast);
      mees = herlaad(mees);
      vierWeg(mees);
      await tijdFijn(20000);
      await tijd(60000);
    } finally { fetch = echt; if (fienVast && !gekruist) fienVast(); }
    check('testopzet: de remise ging eerst, de zet 0,4 s later', gekruist);
    const u = ((await busInhoud(mees, fid, bus)) || { spel: {} }).spel.uitslag;
    check('de staat is remise vanzelf, zonder de zet van Fien', !!u && u.soort === 'remise' && !!u.vanzelf && u.ply === n0 && (await busZegt(mees, fid)).zetten === n0);
    check('Mees: het potje is remise', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    await tijd(20000);
    const f = fien.scherm() + ' ' + tekstVan(fien, 'verder') + ' ' + tekstVan(fien, 'eindkaart');
    check('Fien: remise, en haar laatste zet telt niet mee', /remise/i.test(f) && /Je laatste zet telt niet mee: het was toen al remise\./.test(f));
    check('elk één potje geteld', JSON.parse(tellers(mees))[0] === JSON.parse(voorM)[0] + 1 && JSON.parse(tellers(fien))[0] === JSON.parse(voorF)[0] + 1);
  });

  await regel('[6.6] de zet van Fien komt 0,4 s voor Mees leest: geen remise, het potje gaat door bij allebei, en er telt niets', async function (check) {
    let { mees, fien, fid, voorM, voorF } = await remiseKlaar();
    await zetUit(RUSTIG, fien);
    await tijdFijn(400);
    mees = herlaad(mees);
    vierWeg(mees);
    await tijd(60000);
    check('Mees: Fien heeft gezet, hij is aan zet', /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(mees, 'verder')));
    check('Fien speelt door', !fien.get('!!(session && session.over)') && !/remise/i.test(tekstVan(fien, 'eindkaart')));
    check('niets geteld', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  await regel('[6.6] een vriend wiens bus voor altijd weg is: een remise-aanbod en veertien dagen beëindigen het potje', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const fienBus = await potjesbus(mees, fid, false);
    stopApparaat(mees);
    delete __server.potjes[fienBus];
    schuifKlok(14 * DAG + UUR);
    mees = await opent(mees);
    await tijd(40000);
    check('het potje is remise', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
  });

  /* ================= één keer tellen op twee apparaten, en een server zonder staten met een versie ================= */

  await regel('[6.7] de tablet staat open terwijl Mees op de telefoon opgeeft en Fien weg is: samen telt het één keer, en de tablet toont het einde niet opnieuw', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 22, fien);
    let tab = await tweedeApparaat(tel);
    await tijd(30000);
    stopApparaat(fien);
    const voor = tellers(tel);
    await geefOp(tel);
    tikTekst(tel, 'Naar huis');
    await tijd(40000);
    const zag = /Je potje met Fien is klaar/.test(tekstVan(tab, 'verder'));
    if (zag) { tab.tik('verderKaart'); await wacht(); if (kanTikken(tab, 'Naar huis')) tikTekst(tab, 'Naar huis'); }
    await tijd(20000);
    await tab.ev('syncNow()');
    await wacht(2000);
    await tel.ev('syncNow()');
    await wacht(2000);
    check('de tablet toont het einde niet meer: Mees zag het al op de telefoon', !zag);
    check('samen één keer geteld', tellers(tel) === nogEen(voor, false) && tellers(tab) === nogEen(voor, false));
  });

  for (const [hoe, netwerk] of [['zonder netwerk en krijgt het einde tien seconden later', 'uit'], ['en de server geeft 503 op het profiel', '503']]) {
    await regel('[6.7] de tablet opent ' + hoe + ': samen één keer geteld', async function (check) {
      zetDatum('2026-11-16T10:00:00');
      let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
      await vriendenpotje(tel, fien);
      await potjeTot(tel, fien, 22, fien);
      let tab = await tweedeApparaat(tel);
      await tijd(30000);
      stopApparaat(tab);
      stopApparaat(fien);
      const voor = tellers(tel);
      await geefOp(tel);
      tikTekst(tel, 'Naar huis');
      await tijd(10000);
      let zag = false;
      const echt = fetch;
      if (netwerk === '503') fetch = function (url, o) { return /\/v1\/profile\//.test(url) ? Promise.resolve({ status: 503, json: function () { return Promise.resolve({}); },
        arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(0)); } }) : echt(url, o); };
      try {
        if (netwerk === 'uit') tab.netwerk.uit = true;
        tab = herlaad(tab);
        vierWeg(tab);
        await tijd(5000);
        if (netwerk === 'uit') weerNetwerk(tab);
        await tijd(30000);
        zag = /Je potje met Fien is klaar/.test(tekstVan(tab, 'verder'));
        /* een profiel ophalen dat mislukt, is geen profiel dat binnenkwam */
        if (netwerk === '503') { await tab.ev('syncNow()'); await wacht(1000); }
        if (zag) { tab.tik('verderKaart'); await wacht(); if (kanTikken(tab, 'Naar huis')) tikTekst(tab, 'Naar huis'); }
        await tijd(20000);
      } finally { fetch = echt; }
      check('de tablet toont het einde niet meer: Mees zag het al op de telefoon', !zag);
      await tab.ev('syncNow()');
      await wacht(2000);
      await tel.ev('syncNow()');
      await wacht(2000);
      check('samen één keer geteld', tellers(tel) === nogEen(voor, false) && tellers(tab) === nogEen(voor, false));
    });
  }

  await regel('[6.7] wie het einde zelf maakte of in de kamer zag, telt meteen, en het profiel gaat meteen naar de server', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    const tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 22, fien);
    await tel.ev('ensureAccount(); syncNow()');
    await tijd(20000);
    const voor = tellers(tel), puts = [], echt = fetch;
    fetch = function (url, o) { if (/\/v1\/profile\//.test(url) && o && o.method === 'PUT') puts.push(__klok); return echt(url, o); };
    let t0;
    try {
      t0 = __klok;
      fien.ev('resignNow()');
      await tijdFijn(1500);
    } finally { fetch = echt; }
    check('Mees telde meteen', tellers(tel) === nogEen(voor, true));
    check('en het profiel ging binnen anderhalve seconde naar de server', puts.some(function (t) { return t - t0 <= 1500; }));
  });

  await regel('[6.5] een server zonder staten met een versie: na een potje nodigen twee vrienden elkaar meteen weer uit, en een tweede potje begint', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const echt = fetch;
    fetch = oudeServer(echt);
    try {
      const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(mees, fien);
      await zetUit(RUSTIG, mees, fien);
      await tijd(5000);
      await geefOp(mees);
      await tijd(5000);
      for (const x of [mees, fien]) if (kanTikken(x, 'Naar huis')) { tikTekst(x, 'Naar huis'); await wacht(); }
      tikInRij(mees, fid, 'Uitnodigen');
      await wacht();
      check('geen zin dat Fien het einde nog niet weet', !/weet nog niet/.test(mees.scherm()) && !/Weer uitnodigen kan/.test(vriendRijTekst(mees, fid)));
      await fien.ev('friendPoll()');
      await wacht();
      fien.tik('invJa');
      await wacht();
      mees.tik('mpGo');
      await wacht();
      check('een tweede potje begint', opSpeelscherm(mees) && opSpeelscherm(fien) && mees.get('session.S.hist.length') === 0);
    } finally { fetch = echt; }
  });

  await regel('[6.2] na een potje in de kamer kennen allebei het einde zodra hun apparaten het in de staat schreven: de rij zegt meteen Uitnodigen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    await geefOp(mees);
    await wacht(2000);
    for (const x of [mees, fien]) if (kanTikken(x, 'Naar huis')) { tikTekst(x, 'Naar huis'); await wacht(); }
    await wacht(2000);
    const s = await busZegt(mees, fid);
    check('testopzet: allebei schreven hun merk', !!s && !!s.weet.a && !!s.weet.b);
    mees.tik('tabVrienden');
    check('de rij zegt Uitnodigen, zonder de zin', /Uitnodigen/.test(vriendRijTekst(mees, fid)) && !/Weer uitnodigen kan/.test(vriendRijTekst(mees, fid)));
  });

  await regel('[6.5] een server zonder staten met een versie: wie opgeeft terwijl de vriend weg is, kan die vriend meteen weer uitnodigen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const echt = fetch;
    fetch = oudeServer(echt);
    try {
      const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(mees, fien);
      await zetUit(RUSTIG, mees, fien);
      await tijd(5000);
      stopApparaat(fien);
      await geefOp(mees);
      await tijd(5000);
      if (kanTikken(mees, 'Naar huis')) { tikTekst(mees, 'Naar huis'); await wacht(); }
      tikInRij(mees, fid, 'Uitnodigen');
      await wacht();
      check('geen zin dat Fien het einde nog niet weet, maar de uitnodiging', !/weet nog niet/.test(mees.scherm()) && /Wachten op Fien/.test(mees.scherm()));
    } finally { fetch = echt; }
  });

  await regel('[6.4] V2 Fien zegt ja op de telefoon en daarna op haar tablet die het nog niet las: de tablet ziet dat het al gedaan is en opent het potje', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const tab = await tweedeApparaat(fien);
    await tijd(30000);
    vierWeg(tab);
    check('testopzet: de tablet toont de uitdaging', kanTikken(tab, 'Ja, spelen!'));
    tikTekst(fien, 'Ja, spelen!');
    await tijd(3000);
    check('testopzet: Fien speelt op de telefoon', opSpeelscherm(fien) && !!mees);
    tikTekst(tab, 'Ja, spelen!');
    await tijd(5000);
    check('de tablet opent het potje, zonder zin over intrekken', opSpeelscherm(tab) && !/ingetrokken/.test(tab.scherm()) && !!vriendenpotjeMet(tab, fid));
  });

  await regel('[6.4] V2 Nu niet op een uitdaging die Mees al introk: de server weigert het, de staat blijft die van het intrekken, en de uitdaging gaat van de kaart', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    tikInRij(mees, fid, '⋯');
    await wacht(100);
    tikTekst(mees, 'Uitdaging intrekken');
    await tijdFijn(500);
    check('testopzet: Fien ziet de uitdaging nog', kanTikken(fien, 'Nu niet'));
    const bus = await potjesbus(fien, fid), voor = __server.potjes[bus] && __server.potjes[bus].blob;
    check('testopzet: het intrekken staat op de server', !!voor && !(await busZegt(mees, fid)));
    tikTekst(fien, 'Nu niet');
    await tijd(30000);
    check('de staat op de server is nog die van het intrekken', (__server.potjes[bus] || {}).blob === voor);
    check('de uitdaging is van de kaart', !/daagt je uit/.test(tekstVan(fien, 'verder')));
    check('Fien ziet geen venster', !fien.open());
  });

  await regel('[6.4] Mees trekt in nadat Fien de uitdaging al zag: bij haar volgende keer lezen gaat de uitdaging van de kaart, zonder bericht', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    check('testopzet: Fien ziet de uitdaging', /Mees daagt je uit/.test(tekstVan(fien, 'verder')));
    tikInRij(mees, fid, '⋯');
    await wacht(100);
    tikTekst(mees, 'Uitdaging intrekken');
    await tijd(30000);
    check('de uitdaging is van de kaart', !/daagt je uit/.test(tekstVan(fien, 'verder')) && !vriendenpotjeMet(fien, fid));
    check('zonder bericht', !fien.open() && !/ingetrokken/.test(fien.scherm()));
  });

  /* ================= wat bewaard blijft tot de vriend het weet, en het teken (de lijst van de recensent) ================= */

  await regel('[6.6] een remise na veertien dagen die Mees al bekeek, blijft bewaard tot Fien hem kent: na een herstart staat hij weer in zijn bus, en Fien ziet hem', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    stopApparaat(mees);
    schuifKlok(14 * DAG + UUR);
    mees = await opent(mees);
    await tijd(40000);
    check('testopzet: het is remise op de kaart van Mees', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    tikTekst(mees, 'Naar huis');
    await tijd(20000);
    stopApparaat(mees);
    __herstartServer();
    mees = await opent(mees);
    await tijd(20000);
    check('de remise staat weer in de staat', (await busZegt(mees, fid, true) || {}).uitslag === 'remise');
    stopApparaat(mees);
    fien = await opent(fien);
    check('Fien ziet de remise', /Je potje met Mees is remise/.test(tekstVan(fien, 'verder')));
  });

  await regel('[6.2] Fien zag het einde en daagt Mees meteen uit: voor Mees telt die uitdaging als "Fien weet het", het oude potje is weg en de uitdaging staat op zijn kaart', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(10000);
    tikTekst(mees, 'Naar huis');
    await wacht();
    const id = (await busZegt(mees, fid, true) || {}).gameId;
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    tikTekst(fien, 'Naar huis');
    await wacht();
    /* de uitdaging van Fien schrijft over haar teken heen */
    await daagUit(fien, fid, 'Mees');
    check('testopzet: de staat toont de uitdaging van Fien', (await busZegt(fien, fid, true) || {}).state === 'uitdaging');
    stopApparaat(fien);
    mees = await opent(mees);
    await tijd(20000);
    const r = samenZicht(mees), heeftOud = !!r && !!r.games && id in r.games;
    check('het oude potje is weg bij Mees', !heeftOud);
    check('de uitdaging van Fien staat op zijn kaart', /Fien daagt je uit/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.7] een einde dat Fien leerde maar nog niet bekeek, blijft op haar kaart, ook als ze de staat nog een paar keer leest', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(10000);
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    await tijd(60000);
    check('het einde staat nog op de kaart van Fien', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
    fien = await opent(fien);
    check('ook als ze de app opnieuw opent', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
  });

  await regel('[6.2] een einde dat Fien leerde maar niet bekeek: haar teken gaat één keer de bus in, wordt niet vernieuwd, en na een herstart zet ze het terug zodra Mees zijn einde terugzet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(10000);
    tikTekst(mees, 'Naar huis');
    await wacht();
    stopApparaat(mees);
    schuifKlok(DAG);
    const busF = await potjesbus(fien, fid, true), log = potjesLog();
    try {
      fien = await opent(fien);
      await tijd(60000);
      stopApparaat(fien);
      schuifKlok(8 * DAG);
      fien = await opent(fien);
      await tijd(20000);
    } finally { log.stop(); }
    check('testopzet: het merk van Fien staat in de staat', !!(await busZegt(fien, fid, true) || {}).uitslag);
    check('één keer geschreven, ook na acht dagen niet opnieuw', log.log.filter(function (w) { return w.bus === busF; }).length === 1);
    __herstartServer();
    mees = await opent(mees);
    await tijd(60000);
    check('na de herstart zette Fien het teken terug', !!(await busZegt(fien, fid, true) || {}).uitslag);
    mees.tik('tabVrienden');
    check('en Mees is vrij', /Uitnodigen/.test(vriendRijTekst(mees, fid)) && !/Weer uitnodigen kan/.test(vriendRijTekst(mees, fid)));
  });

  await regel('[6.9] V5 een einde dat Fien nog moet leren, blijft in de staat als Mees intussen met Daan speelt, en Fien ziet het bij het openen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fidF = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(10000);
    tikTekst(mees, 'Naar huis');
    await wacht();
    await samenSpelen(mees, daan);
    await speel(mees, daan, 'e2e4');
    await speel(mees, daan, 'e7e5');
    mees.tik('backBtn');
    await tijd(20000);
    const z = await busZegt(mees, fidF);
    check('het einde met Fien staat nog in de staat, en alleen Mees kent het', !!z && z.uitslag === 'opgave' &&
      Object.keys(z.weet).filter(function (r) { return !!z.weet[r]; }).length === 1);
    stopApparaat(mees);
    __herstartServer();
    mees = await opent(mees);
    stopApparaat(mees);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet dat Mees opgaf', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
  });

  /* ================= deel E: het aanbod op twee apparaten, de eigen eindkaart van de remise, weghalen dat nog bezorgt ================= */

  await regel('[6.6] een tweede apparaat van wie remise aanbood: geen tweede aanbod voor dezelfde zet, en neemt Fien het aan, dan is het remise op de tablet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const busM = await potjesbus(mees, fid, true);
    let tab = await tweedeApparaat(mees);
    await tijd(30000);
    stopApparaat(mees);
    const voor = JSON.parse(JSON.stringify(__server.potjes[busM]));
    naarSpelen(tab);
    tab.tik('verderKaart');
    await wacht();
    await biedRemise(tab);
    await tijd(10000);
    check('de strook zegt het eigen aanbod met de dag', /Je biedt Fien remise aan\./.test(zegt(tab)));
    check('de bus is niet veranderd: geen tweede aanbod', __server.potjes[busM].blob === voor.blob && __server.potjes[busM].veranderd === voor.veranderd);
    tab.tik('backBtn');
    await wacht();
    schuifKlok(DAG);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    tikTekst(fien, 'Remise aannemen');
    await tijd(10000);
    stopApparaat(fien);
    await tijd(40000);
    check('op de tablet is het remise: Fien nam het aanbod aan', /Je potje met Fien is remise/.test(tekstVan(tab, 'verder')) || /nam je aanbod aan/.test(tekstVan(tab, 'eindkaart')));
  });

  await regel('[6.6] de remise na veertien dagen op een open potje: bij allebei de eigen woorden en Nieuw potje met, nooit "afgesproken" en geen Revanche', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    stopApparaat(mees);
    schuifKlok(14 * DAG + UUR);
    fien = await opent(fien);
    fien.tik('verderKaart');
    await wacht();
    mees = herlaad(mees);
    vierWeg(mees);
    naarSpelen(mees);
    mees.tik('verderKaart');
    await tijd(60000);
    const em = tekstVan(mees, 'eindkaart'), ef = tekstVan(fien, 'eindkaart');
    check('Mees: zijn eigen woorden', /Je bood het op .+ aan, en na twee weken werd het vanzelf remise\./.test(em) && /Goed gespeeld, allebei!/.test(em));
    check('Fien: de woorden van de remise na twee weken', /Mees bood het op .+ aan, en na twee weken werd het vanzelf remise\./.test(ef));
    check('bij allebei Nieuw potje met, geen Revanche en geen "afgesproken"', kanTikken(mees, 'Nieuw potje met Fien') && kanTikken(fien, 'Nieuw potje met Mees') &&
      !/Revanche|afgesproken/.test(em + ef));
  });

  for (const [hoe, netwerk] of [['zonder netwerk', 'uit'], ['met een herstart van de server voordat Fien leest', 'herstart']]) {
    await regel('[6.8] Opgeven en weghalen ' + hoe + ': Fien staat niet meer in de lijst van Mees, en toch hoort Fien bij het openen dat Mees opgaf', async function (check) {
      zetDatum('2026-11-14T10:00:00');
      let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(mees, fien);
      await potjeTot(mees, fien, 4, mees);
      stopApparaat(fien);
      mees.tik('backBtn');
      await wacht();
      if (netwerk === 'uit') geenNetwerk(mees);
      tikInRij(mees, fid, '⋯');
      await wacht();
      tikTekst(mees, 'Vriend weghalen');
      await wacht();
      tikTekst(mees, 'Opgeven en weghalen');
      await tijd(10000);
      mees.tik('tabVrienden');
      check('Fien staat niet meer in de lijst', !vriendRij(mees, fid));
      if (netwerk === 'uit') {
        mees.tik('tabSpelen');
        await wacht();
        check('het potje met Fien staat niet op de kaart, terwijl de opgave nog op het apparaat wacht', !vriendenpotjeMet(mees, fid) &&
          !/Fien/.test(tekstVan(mees, 'verder')) && mees.get('paarVan(' + JSON.stringify(fid) + ').rij.length') === 1);
        weerNetwerk(mees);
        await tijd(40000);
      }
      else { await tijd(20000); stopApparaat(mees); __herstartServer(); mees = await opent(mees); await tijd(40000); }
      check('is de opgave bezorgd, dan vergeet het apparaat het paar en zijn lijst van getelde potjes met Fien',
        !mees.get('(' + JSON.stringify(fid) + ' in paren())') && !mees.get('(' + JSON.stringify(fid) + ' in (DOC.loc.geteld || {}))'));
      stopApparaat(mees);
      schuifKlok(DAG);
      fien = await opent(fien);
      check('Fien ziet dat Mees opgaf', /Mees gaf op\. Jij wint dit potje!/.test(tekstVan(fien, 'verder')));
    });
  }

  await regel('[6.8] een vriend weghalen die jou uitdaagde, is een Nu niet: die vriend hoort dat je even niet kunt', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    stopApparaat(mees);
    tikInRij(fien, fid, '⋯');
    await wacht();
    tikTekst(fien, 'Vriend weghalen');
    await wacht();
    tikTekst(fien, 'Ja, weghalen');
    await tijd(20000);
    const m = await opent(mees);
    check('Mees hoort dat Fien even niet kan', /Fien kan nu even niet/.test(m.scherm()));
  });

  await regel('[6.6] een remise-aanbod zonder netwerk: tot het op de server staat, zegt de strook dat het gaat zodra er verbinding is, en de laatste dag telt vanaf dat moment', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, mees);
    stopApparaat(fien);
    geenNetwerk(mees);
    await tijd(3000);
    await biedRemise(mees);
    await zetUit(RUSTIG, mees);
    await wacht();
    check('de strook zegt dat het aanbod bewaard is en gaat zodra er verbinding is', /Je remise-aanbod is bewaard\. Heb je weer verbinding, dan gaat het naar Fien\./.test(zegt(mees)));
    schuifKlok(3 * DAG);
    const tNet = Date.now();
    weerNetwerk(mees);
    await tijd(40000);
    const r = vriendenpotjeMet(mees, fid);
    check('de dag van het aanbod is de dag dat het op de server kwam', !!r && !!r.offer && r.offer.t >= tNet);
  });

  /* ================= deel E5: wat de eerste recensent nog ongetest vond ================= */

  await regel('[6.6] V6 een aanbod dat nog niet op de server staat, telt de veertien dagen niet, ook als de staat al lang onveranderd is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 22, mees);
    stopApparaat(fien);
    await zetUit(RUSTIG, mees);
    await tijd(5000);
    geenNetwerk(mees);
    await biedRemise(mees);
    await tijd(3000);
    schuifKlok(15 * DAG);
    weerNetwerk(mees);
    await tijd(60000);
    check('geen remise: het aanbod stond nog niet op de server', !!vriendenpotjeMet(mees, fid));
    const s = await busZegt(mees, fid), nu = Math.floor(__busNu() / 1000);
    check('het aanbod staat nu wel op de server, met de stempel van nu', !!s && !!s.bod && s.bod.t != null && nu - s.bod.t < 120);
  });

  for (const [n, telt] of [[22, true], [2, false]]) {
    await regel('[6.8] Opgeven en weghalen na ' + n + ' halve zetten telt ' + (telt ? 'één gespeeld potje' : 'niets'), async function (check) {
      zetDatum('2026-11-14T10:00:00');
      const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
      const fid = await vriendenpotje(mees, fien);
      await potjeTot(mees, fien, n, mees);
      stopApparaat(fien);
      mees.tik('backBtn');
      await wacht();
      const voor = tellers(mees);
      tikInRij(mees, fid, '⋯');
      await wacht();
      tikTekst(mees, 'Vriend weghalen');
      await wacht();
      tikTekst(mees, 'Opgeven en weghalen');
      await tijd(10000);
      check(telt ? 'één gespeeld potje erbij, geen winst' : 'niets geteld', tellers(mees) === (telt ? nogEen(voor, false) : voor));
    });
  }

  await regel('[6.7] Nieuw potje met op de eindkaart van een potje dat afliep terwijl Mees weg was, nodigt Fien uit', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, fien);
    stopApparaat(mees);
    await geefOp(fien);
    await tijd(10000);
    stopApparaat(fien);
    schuifKlok(DAG);
    mees = await opent(mees);
    mees.tik('verderKaart');
    await wacht();
    tikTekst(mees, 'Nieuw potje met Fien');
    await wacht();
    check('de uitnodiging gaat uit: Mees wacht op Fien', /Wachten op Fien/.test(mees.scherm()));
  });

  await regel('[6.4] een uitdaging uit het wachtscherm haalt de uitnodiging van de server: Fien krijgt alleen de uitdaging', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    stopApparaat(fien);
    const adres = await mees.ev('(async function () { var f = P.friends[' + JSON.stringify(fid) + ']; return (await busFor(f, theirRole(f))).bus; })()');
    tikInRij(mees, fid, 'Uitnodigen');
    await wacht();
    check('testopzet: de uitnodiging staat op de server', !!(__server.buses[adres] && __server.buses[adres].blob));
    tikTekst(mees, 'Daag Fien uit voor later');
    await tijd(5000);
    check('de uitnodiging is van de server', !(__server.buses[adres] && __server.buses[adres].blob));
  });

  /* ================= deel F: een uitnodiging nooit alleen in een telling, en een zet gedateerd op wanneer hij gedaan is ================= */

  await regel('[6.9] een uitnodiging die binnenkwam tijdens een potje tegen Turbo, en die niet de kaart is, gaat open als venster zodra Mees thuis is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), kim = maakApparaat('Kim');
    mees.ev('setPref("predict", false); setPref("guard", false)');
    await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    const fidK = await vriendErbij(mees, kim);
    await startPotje(mees, 1);
    await zetEnWacht(mees, 'e2e4');
    tikInRij(kim, fidK, 'Uitnodigen');
    await tijd(20000);
    check('testopzet: Mees zit in zijn potje tegen Turbo', opSpeelscherm(mees));
    mees.tik('backBtn');
    await tijd(3000);
    check('thuis gaat de uitnodiging open als venster', /Kim wil een potje spelen!/.test(mees.scherm()));
  });

  await regel('[6.9] twee zetten van vrienden die Mees in één keer leest, staan in de volgorde waarin ze gedaan zijn: de laatste eerst', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), sem = maakApparaat('Sem');
    mees.ev('setPref("predict", false); setPref("guard", false)');
    const fidF = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, fien);
    mees.tik('backBtn');
    await wacht();
    const fidS = await vriendErbij(mees, sem);
    tikInRij(mees, fidS, 'Uitnodigen');
    await wacht();
    await sem.ev('friendPoll()');
    await wacht();
    sem.tik('invJa');
    await wacht();
    mees.tik('mpGo');
    await wacht();
    if (!magZetten(sem)) await zetUit(RUSTIG, mees, sem);
    stopApparaat(mees);
    await zetUit(RUSTIG, sem);
    await tijd(10000);
    stopApparaat(sem);
    schuifKlok(3 * DAG);
    await zetUit(RUSTIG, fien);
    await tijd(10000);
    stopApparaat(fien);
    schuifKlok(UUR);
    mees = await opent(mees);
    check('de kaart: de zet van Fien van een uur geleden', /je potje met Fien/i.test(tekstVan(mees, 'verderKaart')) && /Fien heeft gezet/.test(tekstVan(mees, 'verderKaart')));
  });

  await regel('[6.8] V6 een apparaat waarvan de klok twee dagen voorloopt, zegt de dag van de server: na de eigen zet is Fien vandaag aan zet, en een dag later sinds gisteren', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees', { klokAf: 2 * DAG }), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, fien);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    await tijd(30000);
    mees.tik('tabVrienden');
    check('vandaag', /Fien is aan zet · vandaag/.test(vriendRijTekst(mees, fid)));
    stopApparaat(mees);
    schuifKlok(DAG);
    mees = await opent(mees);
    mees.tik('tabVrienden');
    check('een dag later: gisteren', /Fien is aan zet · gisteren/.test(vriendRijTekst(mees, fid)));
  });

  await regel('[6.9] V4 een zet die zonder netwerk wacht, houdt de tijd van het potje: twee minuten later staat het potje met Fien op Spelen nog voor dat met Sem, waarin Sem al een uur aan zet is', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien'), sem = maakApparaat('Sem');
    const fidF = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 4, mees);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    const fidS = await vriendErbij(mees, sem);
    tikInRij(mees, fidS, 'Uitnodigen');
    await wacht();
    await sem.ev('friendPoll()');
    await wacht();
    sem.tik('invJa');
    await wacht();
    mees.tik('mpGo');
    await wacht();
    await potjeTot(mees, sem, 2, sem);
    stopApparaat(sem);
    mees.tik('backBtn');
    await wacht();
    schuifKlok(UUR);
    await tijd(30000);
    check('testopzet: de kaart is het potje met Fien, waarin Mees aan zet is', /Verder: je potje met Fien/.test(tekstVan(mees, 'verder')) &&
      !!vriendenpotjeMet(mees, fidS));
    geenNetwerk(mees);
    mees.tik('verderKaart');
    await wacht();
    await zetUit(RUSTIG, mees);
    mees.tik('backBtn');
    await wacht();
    await tijd(2 * 60000);
    const v = tekstVan(mees, 'verder');
    check('testopzet: de zet wacht nog op het apparaat', mees.get('paarVan(' + JSON.stringify(fidF) + ').rij.length') === 1);
    check('het potje met Fien vooraan, dat met Sem in de regel Ook nog', /Verder: je potje met Fien/.test(v) && /Ook nog: je potje met Sem/.test(v));
  });

  await regel('[6.8] de tablet en de telefoon zeggen dezelfde dag: Fien is aan zet sinds vijf dagen, ook op een tablet die het potje net leest', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let tel = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(tel, fien);
    await potjeTot(tel, fien, 4, fien);
    stopApparaat(fien);
    tel.tik('backBtn');
    await wacht();
    await tel.ev('ensureAccount(); syncNow()');
    await tijd(10000);
    stopApparaat(tel);
    schuifKlok(5 * DAG);
    tel = await opent(tel);
    const tab = await tweedeApparaat(tel);
    await tijd(40000);
    for (const x of [tel, tab]) x.tik('tabVrienden');
    check('de telefoon: 5 dagen geleden', /Fien is aan zet · 5 dagen geleden/.test(vriendRijTekst(tel, fid)));
    check('de tablet ook', /Fien is aan zet · 5 dagen geleden/.test(vriendRijTekst(tab, fid)));
  });

  /* ================= zonder verbinding: de kaart en de strook zeggen alleen wat waar is ================= */

  await regel('[6.2] zonder verbinding zegt de kaart van een potje zonder kamer dat er geen verbinding is, en zodra lezen weer lukt niet meer; bij het openen zegt de strook het ook', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    const kamer = mees.get('MP.room');
    stopApparaat(fien);
    stopApparaat(mees);
    delete __server.wsrooms[kamer];
    schuifKlok(UUR);
    mees = await opent(mees);
    check('testopzet: het potje heeft geen kamer meer', !(vriendenpotjeMet(mees, fid) || {}).room);
    geenNetwerk(mees);
    await tijd(20000);
    check('de kaart zegt dat er geen verbinding is', /Er is nu geen verbinding. Je kunt wel je zet doen./.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    check('bij het openen zegt de strook het ook', /Er is nu geen verbinding. Je kunt wel je zet doen./.test(zegt(mees)) && !/ziet hem bij het openen/.test(zegt(mees)));
    mees.tik('backBtn');
    await wacht();
    weerNetwerk(mees);
    await tijd(20000);
    check('met verbinding is de zin weg', !/geen verbinding/.test(tekstVan(mees, 'verder')) && /Jij bent aan zet/.test(tekstVan(mees, 'verder')));
  });

  await regel('[6.4] het wachtvenster na Ja, spelen! heeft Stoppen: wie stopt voordat het ja verstuurd is, houdt de uitdaging op de kaart', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const echt = fetch;
    /* de laatste lezing is ouder dan een minuut: het ja leest eerst, en dat lezen blijft hangen */
    schuifKlok(2 * 60000);
    fetch = function (url, o) { return /\/v1\/bus\/check$/.test(url) ? new Promise(function () {}) : echt(url, o); };
    try {
      tikTekst(fien, 'Ja, spelen!');
      await wacht(1000);
      check('testopzet: Fien wacht', /Verbinden/.test(fien.scherm()));
      check('het venster heeft Stoppen', kanTikken(fien, 'Stoppen'));
      tikTekst(fien, 'Stoppen');
      await wacht(1000);
    } finally { fetch = echt; }
    check('het venster is weg, en de uitdaging staat op de kaart', !fien.open() && /Mees daagt je uit/.test(tekstVan(fien, 'verder')) &&
      kanTikken(fien, 'Ja, spelen!'));
    check('er ging geen ja naar de staat', (await busZegt(fien, fid) || {}).state === 'uitdaging');
  });

  await regel('[6.4] het wachtvenster na Ja, spelen! heeft Stoppen: een ja dat onderweg is, kan niet terug; Stoppen sluit het venster, en het potje staat daarna op de kaart, zonder dat het bord vanzelf opengaat', async function (check) {
    const { mees, fien, fid } = await uitdagingVanMees();
    const bus = await potjesbus(fien, fid), net = onderweg();
    try {
      net.houd(bus);
      tikTekst(fien, 'Ja, spelen!');
      await wacht(1000);
      check('testopzet: Fien wacht, met Stoppen', /Verbinden/.test(fien.scherm()) && kanTikken(fien, 'Stoppen'));
      tikTekst(fien, 'Stoppen');
      await wacht(1000);
      check('het venster is weg en Fien is thuis', !fien.open() && opThuis(fien));
      net.laat(bus);
      await tijd(10000);
    } finally { net.stop(); }
    check('het potje staat op de kaart, en het bord ging niet vanzelf open', /je potje met Mees/i.test(tekstVan(fien, 'verder')) && !opSpeelscherm(fien));
    check('het ja staat in de staat', (await busZegt(fien, fid) || {}).state === 'potje');
  });
}
