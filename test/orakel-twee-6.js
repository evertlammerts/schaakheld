/* Orakel, tweeapparatentests voor vriendenpotjes die dagen doorlopen. Een potje
   tussen vrienden staat op beide apparaten en in een versleutelde potjesbus per kind
   op de server; een zet wacht daar tot de ander de app opent. Elke testnaam begint
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

/* het adres van een potjesbus: het bewijs komt uit K en de rol, het adres is de sha256 ervan */
function potjesbus(app, fid, eigen) {
  return app.ev('(async function () { var f = P.friends[' + JSON.stringify(fid) + '];' +
    'return sha256hex(b64url(await hkdfBits(f.k, "potje-" + ' + (eigen ? 'myRole(f)' : 'theirRole(f)') + ', 32))); })()');
}
/* een blob ontsleuteld met K, zoals de vriend hem leest; null als dat niet lukt */
function ontsleutel(app, fid, blob) {
  return app.ev('(async function () { try { return await openJSON(P.friends[' + JSON.stringify(fid) + '].k, "potje", b64urlBytes(' +
    JSON.stringify(blob) + ')); } catch (e) { return null; } })()');
}
function busInhoud(app, fid, bus) {
  return __server.potjes[bus] ? ontsleutel(app, fid, __server.potjes[bus].blob) : Promise.resolve(null);
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

  await regel('[6.1] na een zet staat het potje in de eigen potjesbus: met K te lezen, dezelfde zetten, wit als rol en geen naam', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    const wit = await zetUit(RUSTIG, mees, fien);
    const bus = await potjesbus(wit, fid, true);
    const inhoud = await busInhoud(wit, fid, bus), r = vriendenpotjeMet(wit, fid);
    check('de bus van wit staat op de server', !!__server.potjes[bus]);
    check('met K te lezen, als potje', !!inhoud && inhoud.v === 1 && inhoud.state === 'potje' && !!r && inhoud.gameId === r.gameId);
    check('dezelfde zetten', !!inhoud && JSON.stringify(wit.get('potjeZetten(' + JSON.stringify(inhoud.moves) + ')')) === JSON.stringify([RUSTIG[0]]));
    check('wit staat erin als rol van de vriendschap', !!inhoud && inhoud.white === wit.get('myRole(P.friends[' + JSON.stringify(fid) + '])'));
    check('geen naam erin', !!inhoud && !/Mees|Fien/.test(JSON.stringify(inhoud)));
  });

  await regel('[6.1] een potjesbus is na 40 halve zetten even lang als na 2', async function (check) {
    const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, magZetten(mees) ? mees : fien);
    const bussen = [await potjesbus(mees, fid, true), await potjesbus(mees, fid, false)];
    const lengtes = function () { return bussen.map(function (b) { return __server.potjes[b] ? __server.potjes[b].blob.length : 0; }); };
    const na2 = lengtes();
    while (mees.get('session.S.hist.length') < 40) await zetUit(RUSTIG, mees, fien);
    const na40 = lengtes();
    check('na 2 halve zetten staan beide bussen er, even lang', na2[0] > 0 && na2[1] === na2[0]);
    check('na 40 halve zetten precies even lang', na40[0] === na2[0] && na40[1] === na2[0]);
  });

  await regel('[6.1] een vriendenpotje zoals het nu bewaard staat (met kamer en stoel) leest de nieuwe app zonder verlies, en het gaat verder via de potjesbus', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const K = 'geheimvanmeesenfien-' + 'x'.repeat(20), fid = 'meesenfien01';
    const opslag = function (seat, host, kleur, naam) {
      const o = maakOpslag();
      o.setItem('schaakheld-samen', JSON.stringify({ v: 1, games: { potjevanvroeger1: { gameId: 'potjevanvroeger1', fid, room: 'kamervanvroeger1',
        seat, host, myColor: kleur, gameNo: 1, moves: ['e2e4', 'e7e5'], peerName: naam, result: null, offer: null, shown: false, updated: Date.now() - DAG } } }));
      return o;
    };
    let mees = maakApparaat('Mees', { opslag: opslag('stoelvanmees1', true, 'w', 'Fien') });
    let fien = maakApparaat('Fien', { opslag: opslag('stoelvanfien1', false, 'b', 'Mees') });
    mees.ev('setFriend("' + fid + '", { k: "' + K + '", naam: "Fien", host: true, weg: false, since: Date.now() - 9 * 864e5 })');
    fien.ev('setFriend("' + fid + '", { k: "' + K + '", naam: "Mees", host: false, weg: false, since: Date.now() - 9 * 864e5 })');
    mees = await opent(mees);
    fien = await opent(fien);
    const r = vriendenpotjeMet(mees, fid);
    check('het potje staat er nog, met zijn id, kleur en zetten', !!r && r.gameId === 'potjevanvroeger1' && r.myColor === 'w' &&
      JSON.stringify(r.moves) === '["e2e4","e7e5"]');
    check('de kaart: het potje met Fien, Mees is aan zet', /je potje met Fien/i.test(tekstVan(mees, 'verder')) && /Jij bent aan zet/.test(tekstVan(mees, 'verder')));
    mees.tik('verderKaart');
    await wacht();
    check('het bord van toen, en Mees kan zetten', mees.get('session.S.hist.length') === 2 && magZetten(mees));
    zet(mees, 'g1f3');
    await tijd(20000);
    check('Fien leest dat Mees zette', /Mees heeft gezet\. Jij bent aan zet\./.test(tekstVan(fien, 'verder')));
    fien.tik('verderKaart');
    await wacht();
    check('Fien heeft hetzelfde bord en kan zetten', fien.fen() === mees.fen() && magZetten(fien));
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

  await regel('[6.2] de server herstart tussen de zet van Mees en het openen van Fien: zodra Mees opent, krijgt Fien de zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    await potjeTot(mees, fien, 2, mees);
    stopApparaat(fien);
    await zetUit(RUSTIG, mees);
    const bus = await potjesbus(mees, fid, true);
    stopApparaat(mees);
    __herstartServer();
    schuifKlok(DAG);
    fien = await opent(fien);
    check('zonder de bus van Mees wacht Fien nog op Mees', /Mees is aan zet/.test(tekstVan(fien, 'verder')) && !/heeft gezet/.test(tekstVan(fien, 'verder')));
    mees = await opent(mees);
    check('Mees schreef zijn bus terug', !!__server.potjes[bus]);
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

  await regel('[6.2] een eigen potjesbus wordt na zeven dagen opnieuw geschreven, met precies dezelfde bytes, en niet eerder', async function (check) {
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

  await regel('[6.2] na het einde blijft de eigen bus staan tot de vriend het einde kent; wie de bus van de ander met hetzelfde einde ziet, haalt de eigen weg', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await vriendenpotje(mees, fien);
    const bus = await potjesbus(mees, fid, true);
    stopApparaat(fien);
    await geefOp(mees);
    await tijd(60000);
    check('testopzet: de opgave staat in de bus van Mees', !!__server.potjes[bus]);
    tikTekst(mees, 'Naar huis');
    await wacht();
    schuifKlok(2 * DAG);
    mees = await opent(mees);
    check('zolang Fien het einde niet kent, blijft de bus van Mees', !!__server.potjes[bus]);
    fien = await opent(fien);
    check('Fien ziet het einde', /Je potje met Mees is klaar/.test(tekstVan(fien, 'verder')));
    const fienBus = await potjesbus(fien, fid, true);
    fien.tik('verderKaart');
    await wacht();
    tikTekst(fien, 'Naar huis');
    await tijd(40000);
    check('Fien zag het einde in de bus van Mees: haar eigen bus is weg', !(fienBus in __server.potjes));
  });

  await regel('[6.3] Mees zet op twee gekoppelde apparaten verschillend in dezelfde stand: de zet in de bus telt, het andere apparaat zegt het, en Fien ziet die zet', async function (check) {
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
    const bewaard = (opgeslagen(mees, 'schaakheld-samen') || { games: {} }).games, r = Object.keys(bewaard || {}).map(function (k) { return bewaard[k]; })
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
      const kaart = tekstVan(fien, 'verder'), fienWit = /Jij speelt met wit\./.test(kaart);
      kleurUitdaging.push(fienWit);
      check('de kaart: Mees daagt je uit, met de kleur', /Mees daagt je uit/.test(kaart) && (fienWit || /Jij speelt met zwart\./.test(kaart)));
      check('in de kaart Nu niet en Ja, spelen!, en geen regel dat het potje blijft staan', kanTikken(fien, 'Nu niet') && kanTikken(fien, 'Ja, spelen!') &&
        !/blijft staan/.test(kaart));
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
    check('Fien ziet geen uitdaging en geen bericht', !/daagt je uit|ingetrokken/.test(zegt(fien) + ' ' + toastTekst(fien) + ' ' + vriendRijTekst(fien, fid)));
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

  await regel('[6.4] twee uitdagingen die elkaar kruisen: rol a houdt de zijne, de ander krijgt die van a om te beantwoorden', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await wordenVrienden(mees, fien);
    const meesA = mees.get('myRole(P.friends[' + JSON.stringify(fid) + '])') === 'a';
    stopApparaat(fien);
    /* de uitdaging van Mees is nog onderweg als Fien de hare maakt */
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
    const a = meesA ? mees : fien, b = meesA ? fien : mees, naamA = meesA ? 'Mees' : 'Fien', naamB = meesA ? 'Fien' : 'Mees';
    for (const x of [a, b]) x.tik('tabSpelen');
    const ka = tekstVan(a, 'verder') + ' ' + ookNogRegels(a).join(' '), kb = tekstVan(b, 'verder') + ' ' + ookNogRegels(b).join(' ');
    check('rol a houdt zijn uitdaging', new RegExp('Je uitdaging aan ' + naamB).test(ka) && !new RegExp(naamB + ' daagt je uit').test(ka));
    check('de ander beantwoordt die van a, en de eigen is weg', new RegExp(naamA + ' daagt je uit').test(kb) && !new RegExp('Je uitdaging aan ' + naamA).test(kb));
  });

  await regel('[6.5] tussen vrienden eindigt een potje niet als de kamer weg is: allebei spelen verder via de potjesbussen', async function (check) {
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

  /* wat al zo werkt en zo moet blijven: zonder vriendschap geen geheim, dus geen potjesbus */
  await regel('[6.12] een potje met woordcodes tussen kinderen die geen vrienden zijn, eindigt nog als de kamer weg is, en heeft geen potjesbus', async function (check) {
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
    check('geen potjesbus geschreven', JSON.stringify(Object.keys(__server.potjes).sort()) === potjesVoor);
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
    check('op de eigen beurt staat er nog geen aanbod in de bus', !inhoud || !inhoud.offer);
    check('de strook zegt wat nu', tekstVan(mees, 'bubble').indexOf('Doe nu je zet: daarmee bied je Fien remise aan.') >= 0);
    await zetUit(RUSTIG, mees);
    await wacht(5000);
    inhoud = await busInhoud(mees, fid, bus);
    check('met de zet gaat het aanbod mee, in de stand na die zet', !!inhoud && !!inhoud.offer && inhoud.offer.ply === n + 1);
    const blob = __server.potjes[bus] && __server.potjes[bus].blob;
    mees.tik('meerBtn');
    await wacht();
    if (kanTikken(mees, 'Remise aanbieden')) { tikTekst(mees, 'Remise aanbieden'); await wacht(); }
    if (mees.open()) mees.ev('closeModal()');
    await wacht(5000);
    check('een tweede aanbod voor de volgende eigen zet verandert de bus niet', !!blob && __server.potjes[bus].blob === blob);
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

  await nogNiet('[6.6] Fien neemt het aanbod twee dagen later aan: remise voor allebei, met de datum op de kaart, en één keer geteld', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await aanbodVanMees(mees, fien);
    const voorM = tellers(mees), voorF = tellers(fien);
    stopApparaat(mees);
    schuifKlok(2 * DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('de kaart: Mees biedt remise aan, met de laatste dag om te antwoorden', /Mees biedt remise aan/.test(kaart) && /Antwoorden kan tot en met vrijdag 27 november\./.test(kaart));
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

  await nogNiet('[6.6] na 13 dagen en 23 uur geen remise; na 14 dagen remise voor allebei, met de dag van het aanbod, één keer geteld', async function (check) {
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

  await nogNiet('[6.6] een klok die een week voorloopt, maakt de termijn niet korter: de server meet', async function (check) {
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

  await regel('[6.6] een zet van Fien die de server een seconde voor de remise van Mees kreeg, wint op beide apparaten', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const t0 = Date.now(), voorM = tellers(mees), voorF = tellers(fien);
    const meesBus = await potjesbus(mees, fid, true), fienBus = await potjesbus(mees, fid, false);
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + 10 * 60000);
    /* de zet van Fien blijft onderweg tot Mees zijn remise schrijft; dan komt hij aan, en de remise een seconde later */
    const echt = fetch, nieuw = function (body, bus) { return !__server.potjes[bus] || body.blob !== __server.potjes[bus].blob; };
    let fienZet = false, fienVast = null, gekruist = false;
    fetch = function (url, o) {
      const body = /\/v1\/potje$/.test(url) && o && typeof o.body === 'string' ? JSON.parse(o.body) : null;
      if (body && body.blob && body.bus === fienBus && fienZet && !gekruist && nieuw(body, fienBus)) {
        return new Promise(function (klaar) { fienVast = function () { klaar(echt(url, o)); }; });
      }
      if (body && body.blob && body.bus === meesBus && fienVast && !gekruist && nieuw(body, meesBus)) {
        gekruist = true;
        fienVast();
        return new Promise(function (klaar) { setTimeout(function () { klaar(echt(url, o)); }, 1000); });
      }
      return echt(url, o);
    };
    try {
      fien = await opent(fien);
      const kaart = tekstVan(fien, 'verder');
      check('na de laatste dag zegt de kaart van Fien dat antwoorden nu nog kan, zonder datum', /Mees biedt remise aan/.test(kaart) &&
        /Antwoorden kan nu nog\./.test(kaart) && !/november|december/.test(kaart));
      fien.tik('verderKaart');
      await wacht();
      fienZet = true;
      await zetUit(RUSTIG, fien);
      check('testopzet: de zet van Fien is onderweg', !!fienVast);
      mees = await opent(mees);
      check('testopzet: Mees schreef zijn remise een seconde na de zet van Fien', gekruist);
    } finally {
      fetch = echt;
      if (fienVast && !gekruist) fienVast();
    }
    await tijd(40000);
    check('Fien speelt door: geen remise', !/is remise|Gelijkspel/i.test(zegt(fien)) && !fien.get('!!(session && session.over)'));
    const km = tekstVan(mees, 'verder');
    check('Mees: de zet van Fien telt en het potje gaat door', /Fien heeft gezet\. Jij bent aan zet\./.test(km) && !/is remise/.test(km));
    mees.tik('verderKaart');
    await wacht();
    check('Mees kan zetten', magZetten(mees));
    check('niets geteld', tellers(mees) === voorM && tellers(fien) === voorF);
  });

  await nogNiet('[6.6] dezelfde bytes opnieuw schrijven zet de termijn niet terug', async function (check) {
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

  await nogNiet('[6.6] een herstart van de server maakt de termijn langer, nooit korter', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    const fid = await aanbodVanMees(mees, fien);
    const t0 = Date.now(), bus = await potjesbus(mees, fid, true);
    stopApparaat(mees);
    zetOp(t0 + 5 * DAG);
    __herstartServer();
    zetOp(t0 + 6 * DAG);
    mees = await opent(mees);
    check('testopzet: Mees schreef zijn bus terug', !!__server.potjes[bus]);
    stopApparaat(mees);
    zetOp(t0 + 14 * DAG + UUR);
    mees = await opent(mees);
    check('na 14 dagen nog geen remise: de termijn begon bij het terugschrijven', !/is remise/.test(tekstVan(mees, 'verder')));
    stopApparaat(mees);
    zetOp(t0 + 20 * DAG + UUR);
    mees = await opent(mees);
    check('na 20 dagen wel', /Je potje met Fien is remise/.test(tekstVan(mees, 'verder')));
  });

  await nogNiet('[6.7] Fien geeft op terwijl Mees weg is; Mees opent op twee gekoppelde apparaten na elkaar: de winst en de week tellen één keer', async function (check) {
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
    check('de tablet toont het einde niet nog eens: het telde al op de telefoon', !/is klaar|gaf op/.test(tekstVan(tab, 'verder')));
    await tab.ev('syncNow()');
    await wacht();
    await tel.ev('syncNow()');
    await wacht();
    check('na het samenvoegen op beide apparaten precies één keer', tellers(tel) === nogEen(voor, true) && tellers(tab) === nogEen(voor, true) &&
      weekOnline(tel) === week + 1 && weekOnline(tab) === week + 1);
  });

  await nogNiet('[6.7] schaakmat terwijl de ander weg is: die ziet het bij het openen, op de kaart en de eindkaart', async function (check) {
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

  await nogNiet('[6.7] pat terwijl de ander weg is: remise bij het openen, met de reden op de eindkaart', async function (check) {
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

  await nogNiet('[6.7] "Alles wissen" terwijl de vriend weg is: de vriend ziet bij het openen dat Mees opgaf', async function (check) {
    zetDatum('2026-11-16T10:00:00');
    let mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
    await vriendenpotje(mees, fien);
    await zetUit(RUSTIG, mees, fien);
    stopApparaat(fien);
    mees.tik('backBtn');
    await wacht();
    mees.tik('setBtn');
    mees.tik('setReset');
    check('de vraag zegt dat het potje met Fien wordt opgegeven', /Dan geef je ook je potje met Fien op\./.test(mees.scherm()));
    mees.tik('rstGo');
    await tijd(20000);
    schuifKlok(DAG);
    fien = await opent(fien);
    const kaart = tekstVan(fien, 'verder');
    check('Fien: Mees gaf op', /Je potje met Mees is klaar/.test(kaart) && /Mees gaf op\. Jij wint dit potje!/.test(kaart));
  });

  await nogNiet('[6.7] "Alles wissen" op een gekoppeld apparaat haalt het vriendenpotje alleen daar weg: het speelt verder op het andere, en de vriend ziet geen opgave', async function (check) {
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
    await tijd(20000);
    schuifKlok(DAG);
    fien = await opent(fien);
    check('Fien ziet geen opgave, en het potje loopt', !/gaf op|is klaar/.test(tekstVan(fien, 'verder')) && /je potje met Mees/i.test(tekstVan(fien, 'verder')));
    tel = await opent(tel);
    check('op de telefoon loopt het potje', /je potje met Fien/i.test(tekstVan(tel, 'verder')) && !!vriendenpotjeMet(tel, fid));
  });

  await nogNiet('[6.8] een week zonder zet van de vriend: stil, onderaan, en weer bovenaan zodra de vriend zet', async function (check) {
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

  await nogNiet('[6.8] een potje zonder aanbod is na 400 dagen nog een potje, en er telt niets', async function (check) {
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

  await nogNiet('[6.8] een vriend met een lopend potje weghalen vraagt eerst om op te geven; de vriend ziet de opgave bij het openen', async function (check) {
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

  await nogNiet('[6.9] een uitnodiging van een andere vriend terwijl een vriendenpotje loopt: het kind kan ja zeggen, en het eerste potje blijft staan', async function (check) {
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

  await nogNiet('[6.9] een uitdaging om te beantwoorden staat vóór het potje tegen Turbo, de eigen uitdaging erna, en de telregel noemt ze', async function (check) {
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

  await regel('[6.11] de server ziet geen naam en geen zet: alleen bus, bewijs en blob, en elke potjesbus even lang', async function (check) {
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
    check('testopzet: potjesbussen geschreven', potjes.length >= 4);
    check('alleen bus, bewijs en blob', potjes.every(function (b) { return JSON.stringify(Object.keys(b).sort()) === '["bewijs","blob","bus"]'; }));
    const lengtes = potjes.map(function (b) { return b.blob.length; }).filter(function (n) { return n > 0; });
    check('elke potjesbus is even lang', lengtes.length >= 4 && lengtes.every(function (n) { return n === lengtes[0]; }));
    const tekst = log.filter(function (r) { return typeof r.body === 'string'; }).map(function (r) { return r.body; }).join('\n');
    check('in geen verzoek een naam of de inhoud van een potje', !/Mees|Fien|moves|gameId|"white"/.test(tekst));
  });
}
