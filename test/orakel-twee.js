/* Orakel, tweeapparatentests: de regels van plan.md die pas te zien zijn
   als beide kanten echt draaien. Elke testnaam begint met
   zijn regelnummer. Gebruikt de helpers van test/harnas.js en de
   tweeapparatensuite (samenSpelen, speel, scanQR). */

var SAMEN = 'schaakheld-samen';

function aanZet(a, b) { return a.get('!!(session && MP && session.S.turn === MP.myColor)') ? a : b; }

/* wat een kind nu leest: het open venster en de plekken met tekst die in beeld zijn */
function zegt(app) {
  return [app.scherm()].concat(['verder', 'bubble', 'strook', 'eindkaart'].filter(function (id) { return zichtbaar(app, id); })
    .map(function (id) { return tekstVan(app, id); })).join(' ');
}

/* twee kinderen worden vrienden zoals in de app: een potje, een geeft op,
   allebei "Vrienden worden" */
async function wordenVrienden(a, b) {
  await samenSpelen(a, b);
  await geefOp(aanZet(a, b));
  tikTekst(a, 'Vrienden worden');
  tikTekst(b, 'Vrienden worden');
  await wacht();
  a.tik('vrEind');
  b.tik('vrEind');
  await wacht();
  a.ev('closeModal()');
  b.ev('closeModal()');
  return a.get('Object.keys(P.friends)[0]');
}

async function nodigUit(van) {
  van.tik('tabVrienden');
  tikTekst(van, 'Uitnodigen');
  await wacht();
}

async function orakelTwee() {
  /* ================= increment 2 ================= */

  /* regel 2.5: op een speelscherm staat geen melding; een antwoord of een fout na een vriendenpotje staat in de strook */
  await regel('[2.5] na een vriendenpotje: "Nu niet" op de vriendschapsvraag staat in de strook van wie vroeg, en zijn knop is weer als eerst', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await samenSpelen(daan, fien);
    await geefOp(aanZet(daan, fien));
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: Fien kan "Nu niet" zeggen', kanTikken(fien, 'Nu niet'));
    tikTekst(fien, 'Nu niet');
    await wacht();
    check('Daan leest het antwoord in de strook', /Fien wil nu even niet/.test(tekstVan(daan, 'bubble')));
    check('de knop van Daan is weer als eerst', kanTikken(daan, 'Vrienden worden') && !/Gevraagd/.test(tekstVan(daan, 'eindkaart')));
  });

  /* een sync telt als getoond wat van het andere apparaat kwam; wat hier verdiend is en wacht, blijft wachten */
  await regel('[2.5] twee gekoppelde apparaten: een sync midden in een rondje laat het level en de trofee van hier wachten, en toont die van daar niet', async function (check) {
    const tablet = maakApparaat('Mees');
    let telefoon = maakApparaat(null);
    tablet.ev('setPref("predict", false); setPref("guard", false)');
    await tablet.ev('ensureAccount(); syncNow()');
    await wacht();
    /* koppelen zoals het eind van de koppelstap: hetzelfde account, en het profiel van de server erbij */
    telefoon.ev('finishLink(' + tablet.get('JSON.stringify(ACC)') + ', null)');
    await wacht();
    check('testopzet: een profiel op twee apparaten', telefoon.get('P.name') === 'Mees' && telefoon.get('ACC.id') === tablet.get('ACC.id'));
    /* op de telefoon de trofee Orakel, en die staat daarna op de server */
    telefoon.ev('bump("c.predictHits", 5); checkBadges()');
    await telefoon.ev('syncNow()');
    await wacht();
    tablet.ev('bump("xp", 140); bump("stars", 99)');
    await startOefening(tablet, 'scan');
    await scanGoed(tablet);
    check('testopzet: op de tablet wachten level Paard en Sterrenregen', tablet.get('levelIdx(P.xp)') === 1 && tablet.get('!!P.badges.sterren'));
    await tablet.ev('syncNow()');
    await wacht();
    check('testopzet: de sync bracht Orakel naar de tablet', tablet.get('!!P.badges.orakel'));
    for (let i = 0; i < 4; i++) { tikTekst(tablet, 'Volgende'); await wacht(); await scanGoed(tablet); }
    tikTekst(tablet, 'Volgende');
    await wacht();
    const kaart = tablet.scherm();
    check('de kaart van het rondje toont het level en de trofee van de tablet', /Level Paard/.test(kaart) && /Sterrenregen/.test(zonderZacht(kaart)));
    check('en niet de trofee van de telefoon', !/Orakel/.test(kaart));
    tikTekst(tablet, 'Naar huis');
    await wacht();
    check('thuis het level', tablet.ziet('Level omhoog'));
    tablet.tik('lvlOk');
    check('thuis geen trofee van de telefoon', !tablet.ziet('Orakel'));
    await tablet.ev('syncNow()');
    await wacht();
    await telefoon.ev('syncNow()');
    await wacht();
    telefoon = herlaad(telefoon);
    await wacht();
    check('de telefoon toont bij het openen zijn eigen Orakel', telefoon.ziet('Orakel'));
    check('en niet de Sterrenregen van de tablet', !/Sterrenregen/.test(zonderZacht(telefoon.scherm())));
  });

  /* ================= increment 3 ================= */

  await regel('[3.2] een potje met een vriend telt als gezien, op beide apparaten', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    for (const x of [a, b]) x.ev('P.lastSeen = "2026-11-07"; saveP()');
    await samenSpelen(a, b);
    check('testopzet: samen in een potje', a.get('!!(session && session.online)') && b.get('!!(session && session.online)'));
    for (const x of [a, b]) {
      const d = opgeslagen(x, 'schaakheld1');
      check('vandaag gezien bij ' + x.naam, !!d && d.loc.lastSeen === '2026-11-12');
    }
  });

  await regel('[3.2] verder spelen in een vriendenpotje via de kaart telt ook als gezien', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    a.tik('backBtn');
    await wacht();
    a.ev('P.lastSeen = "2026-11-07"; saveP()');
    a.tik('verderKaart');
    await wacht();
    check('testopzet: weer in het potje', a.get('!!(session && session.online)'));
    const d = opgeslagen(a, 'schaakheld1');
    check('vandaag gezien', !!d && d.loc.lastSeen === '2026-11-12');
  });

  await regel('[3.5] na echt koppelen zegt Ik op beide apparaten dat alles ook op het andere staat', async function (check) {
    /* Mees heeft nog niets verdiend: de iPad weet het dan alleen doordat hij overnam */
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    /* de code staat als vier genummerde woorden (regel 4.8) */
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    const code = vier.length === 4 ? vier.join('-') : undefined;
    check('testopzet: vier woorden', !!code);
    mees.tik('linkDone');
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', code.split('-'));
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    await wacht();
    ipad.tik('tabIk');
    check('de iPad nam het profiel over', ipad.get('P.name') === 'Mees' && /andere apparaat/.test(tekstVan(ipad, 'ikBewaard')));
    ipad.ev('bump("xp", 10)');
    await ipad.ev('syncNow()');
    await wacht();
    await mees.ev('syncNow()');
    await wacht();
    mees.tik('tabIk');
    check('Mees kreeg iets van de iPad en zegt het ook', mees.get('P.xp') === 10 && /andere apparaat/.test(tekstVan(mees, 'ikBewaard')));
  });

  /* ================= increment 4 ================= */

  /* regel 1.4: niets anders haalt het bewaarde potje tegen Turbo weg, ook niet
     een potje met een vriend dat ertussen gespeeld wordt en afloopt */
  await regel('[1.4] een vriendenpotje ertussen laat het bewaarde potje tegen Turbo staan, ook als het afloopt', async function (check) {
    const o = maakOpslag(), zetten = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const ruw = JSON.stringify({ v: 1, level: 2, moves: zetten, tips: 3, drawAsked: null, started: 1794700000000, updated: 1794700000000 });
    o.setItem('schaakheld-potje', ruw);
    const a = maakApparaat('Fien', { opslag: o }), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    check('testopzet: samen in een potje', a.get('!!(session && session.online)') && b.get('!!(session && session.online)'));
    await speel(a, b, 'd2d4');
    await speel(a, b, 'd7d5');
    check('tijdens het vriendenpotje onveranderd', a.opslag.getItem('schaakheld-potje') === ruw);
    await geefOp(aanZet(a, b));
    check('testopzet: het vriendenpotje is uit', a.get('!!(session && session.over)') && b.get('!!(session && session.over)'));
    check('na het einde onveranderd', a.opslag.getItem('schaakheld-potje') === ruw);
    const a2 = herlaad(a);
    await wacht();
    a2.tik('verderKaart');
    await wacht();
    check('Verder speelt het potje tegen Turbo', opSpeelscherm(a2) && a2.get('session.level') === 2 && a2.get('session.S.hist.length') === 4);
  });

  await regel('[4.1] een vriendenpotje staat na elke halve zet op beide apparaten', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const ids = [];
    for (const x of [a, b]) {
      const alles = opgeslagen(x, SAMEN), r = samenPotje(x);
      check('bewaard bij ' + x.naam + ', als kaart van potjes', !!alles && alles.v === 1 && !!r && typeof r === 'object');
      check('vorm bij ' + x.naam, !!r && typeof r.gameId === 'string' && !!alles.games[r.gameId] && r.room === x.get('MP.room') &&
        typeof r.seat === 'string' && typeof r.host === 'boolean' && (r.myColor === 'w' || r.myColor === 'b') && typeof r.gameNo === 'number' &&
        Array.isArray(r.moves) && r.moves.length === 1 && r.moves[0] === 'e2e4' &&
        typeof r.peerName === 'string' && r.fid === null && r.result === null && r.updated > 0);
      if (r) ids.push(r.gameId);
    }
    check('hetzelfde potje-id op beide apparaten', ids.length === 2 && ids[0] === ids[1]);
  });

  await regel('[4.1] wie op zijn eigen beurt herlaadt, speelt verder in dezelfde stand', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const zwart = aanZet(a, b), wit = zwart === a ? b : a;
    const terug = herlaad(zwart);
    await wacht();
    terug.tik('verderKaart');
    await wacht();
    check('dezelfde stand', terug.fen() === wit.fen());
    check('en weer aan zet', terug.get('!!(session && MP && session.S.turn === MP.myColor)'));
    const zette = await speel(terug, wit, 'e7e5');
    check('de volgende zet komt aan', zette === terug && terug.fen() === wit.fen());
  });

  await regel('[4.1] wie herlaadt terwijl de ander aan zet is, ziet daarna de zet van de ander', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const zwart = aanZet(a, b), wit = zwart === a ? b : a;
    stopApparaat(wit);
    await speel(wit, zwart, 'e7e5');
    const terug = herlaad(wit);
    await wacht();
    terug.tik('verderKaart');
    await wacht();
    check('de zet van de ander staat er', terug.fen() === zwart.fen() && zwart.get('session.S.hist.length') === 2);
    check('en jij bent aan zet', terug.get('!!(session && MP && session.S.turn === MP.myColor)'));
  });

  await regel('[4.1] allebei herladen: allebei weer in hetzelfde potje', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const fen = a.fen();
    const a2 = herlaad(a), b2 = herlaad(b);
    await wacht();
    a2.tik('verderKaart');
    b2.tik('verderKaart');
    await wacht();
    check('dezelfde stand op beide', a2.fen() === fen && b2.fen() === fen);
    check('precies een van beiden aan zet', a2.get('!!(session && MP && session.S.turn === MP.myColor)') !==
      b2.get('!!(session && MP && session.S.turn === MP.myColor)'));
  });

  /* na elke verbinding en zodra de ander terug is, sturen beide kanten de hele stand van het potje (zetten,
     uitslag, een open remise-aanbod); de langere lijst die de andere verlengt wint, en een einde telt één keer */
  const ZETTEN22 = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b1c3', 'g8f6', 'd2d3', 'd7d6', 'c1g5', 'c8g4',
    'h2h3', 'g4h5', 'a2a3', 'a7a6', 'b2b4', 'c5a7', 'c3d5', 'h7h6', 'g5h4', 'g7g5'];
  const telt = function (x) { return x.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline, wkGet(curWeek(), "online")])'); };
  const plusEen = function (voor, winst) { const v = JSON.parse(voor); return JSON.stringify([v[0] + 1, v[1] + (winst ? 1 : 0), v[2] + 1]); };
  const aanDeBeurt = function (x) { return x.get('!!(session && MP && MP.S && session.S === MP.S && MP.S.turn === MP.myColor)'); };
  async function tweeZetten() {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const wit = aanZet(a, b);
    return { wit, zwart: wit === a ? b : a };
  }
  async function langPotje() {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    for (const z of ZETTEN22) await speel(a, b, z);
    const op = aanZet(a, b);
    return { op, ander: op === a ? b : a };
  }

  await regel('[4.1] een zet zonder netwerk: daarna dezelfde stand op beide borden, en de volgende zet komt aan', async function (check) {
    const { wit, zwart } = await tweeZetten();
    geenNetwerk(wit);
    await wacht(3000);
    zet(wit, 'g1f3');
    await wacht(1000);
    check('de zet staat bewaard', samenPotje(wit).moves.length === 3);
    weerNetwerk(wit);
    await wacht(60000);
    check('dezelfde stand', wit.fen() === zwart.fen() && zwart.get('MP.S.hist.length') === 3);
    check('zwart is aan zet', aanDeBeurt(zwart) && !aanDeBeurt(wit));
    const wie = await speel(wit, zwart, 'b8c6');
    check('de volgende zet komt aan', wie === zwart && wit.fen() === zwart.fen());
  });

  await regel('[4.1] een zet die in een lijn verdween die al kapot was: na het opnieuw verbinden dezelfde stand', async function (check) {
    const { wit, zwart } = await tweeZetten();
    /* bij zwart gaat precies dit ene zetbericht verloren, wit merkt niets */
    zwart.ev('(function () { var w = MP.ws, o = w.onmessage; w.onmessage = function (ev) { if (/"t":"zet"/.test(ev.data)) { w.onmessage = o; return; } o(ev); }; })()');
    zet(wit, 'g1f3');
    await wacht(1000);
    check('testopzet: zwart mist de zet', zwart.get('MP.S.hist.length') === 2);
    geenNetwerk(wit);
    await wacht(3000);
    weerNetwerk(wit);
    await wacht(60000);
    check('dezelfde stand en zwart aan zet', wit.fen() === zwart.fen() && aanDeBeurt(zwart));
  });

  await regel('[4.1] wie zet en de app dichtdoet terwijl de ander weg is: als beiden terug zijn, dezelfde stand', async function (check) {
    const { wit, zwart } = await tweeZetten();
    stopApparaat(zwart);
    await wacht(3000);
    zet(wit, 'g1f3');
    await wacht(1000);
    stopApparaat(wit);
    const zwart2 = herlaad(zwart);
    await wacht();
    zwart2.tik('verderKaart');
    await wacht();
    const wit2 = herlaad(wit);
    await wacht(30000);
    check('zwart heeft de zet van wit', zwart2.get('MP.S.hist.length') === 3 && zwart2.fen() === wit2.get('toFEN(MP.S)'));
    check('en zwart is aan zet', aanDeBeurt(zwart2));
  });

  await regel('[4.1] ‹ Pauze terwijl de zet van de ander nog schuift: de zet staat toch in het potje', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const wit = aanZet(a, b), zwart = wit === a ? b : a;
    /* de stand-in schuift niets; in de browser duurt het schuiven 245 ms */
    zwart.ev('animateMove = function (m, klaar) { setTimeout(klaar, 245); }');
    zet(wit, 'e2e4');
    await wacht(100);
    check('testopzet: de zet van wit schuift nog bij zwart', zwart.get('!!(MP && MP.S)') && wit.get('MP.S.hist.length') === 1);
    zwart.tik('backBtn');
    await wacht();
    check('thuis, en de zet staat in het potje', opThuis(zwart) && zwart.get('MP.S.hist.length') === 1 && samenPotje(zwart).moves.length === 1);
    zwart.tik('verderKaart');
    await wacht();
    check('Verder toont hem, en zwart is aan zet', zwart.fen() === wit.fen() && aanDeBeurt(zwart));
  });

  await regel('[4.1] opgegeven terwijl de app van de ander dicht was: de ander ziet het einde bij Verder, en het telt één keer', async function (check) {
    const { op, ander } = await langPotje();
    const voor = telt(ander);
    stopApparaat(ander);
    await wacht(3000);
    await geefOp(op);
    await wacht(2000);
    check('testopzet: wie opgaf ziet de eindkaart', eindziet(op, 'Je gaf op'));
    const ander2 = herlaad(ander);
    await wacht(30000);
    check('de kaart zegt dat het potje klaar is', /is klaar/.test(tekstVan(ander2, 'verder')) && kanTikken(ander2, 'Bekijk'));
    tikTekst(ander2, 'Bekijk');
    await wacht();
    check('de eindkaart: gewonnen', eindziet(ander2, 'WINT') && /gaf op/.test(tekstVan(ander2, 'eindkaart')));
    check('één keer geteld, als winst', telt(ander2) === plusEen(voor, true));
    tikTekst(ander2, 'Naar huis');
    await wacht();
    const ander3 = herlaad(ander2);
    await wacht(30000);
    check('na herladen geen kaart meer en niet nog eens geteld', !/klaar/.test(tekstVan(ander3, 'verder')) && telt(ander3) === plusEen(voor, true));
  });

  await regel('[4.1] wie opgaf, ging naar huis en deed de app dicht: de ander hoort het einde zodra die app weer opengaat', async function (check) {
    const { op, ander } = await langPotje();
    const voor = telt(ander);
    stopApparaat(ander);
    await geefOp(op);
    await wacht(2000);
    tikTekst(op, 'Naar huis');
    await wacht();
    check('testopzet: thuis, zonder kaart voor dit potje', opThuis(op) && !/Verder: je potje met/.test(tekstVan(op, 'verder')));
    stopApparaat(op);
    const ander2 = herlaad(ander);
    await wacht(30000);
    const op2 = herlaad(op);
    await wacht(30000);
    check('de ander ziet dat het potje klaar is', /is klaar/.test(tekstVan(ander2, 'verder')) || eindziet(ander2, 'WINT'));
    if (kanTikken(ander2, 'Bekijk')) { tikTekst(ander2, 'Bekijk'); await wacht(); }
    check('en het telt één keer, als winst', eindziet(ander2, 'WINT') && telt(ander2) === plusEen(voor, true));
    check('wie opgaf telt niets dubbel', !/is klaar/.test(tekstVan(op2, 'verder')));
  });

  await regel('[4.1] wie opgaf en naar huis ging met de app open: de ander hoort het einde zodra die terugkomt', async function (check) {
    const { op, ander } = await langPotje();
    const voor = telt(ander);
    stopApparaat(ander);
    await geefOp(op);
    await wacht(2000);
    tikTekst(op, 'Naar huis');
    await wacht();
    const ander2 = herlaad(ander);
    await wacht(30000);
    check('de ander ziet dat het potje klaar is', /is klaar/.test(tekstVan(ander2, 'verder')));
    tikTekst(ander2, 'Bekijk');
    await wacht();
    check('en het telt één keer, als winst', eindziet(ander2, 'WINT') && telt(ander2) === plusEen(voor, true));
    check('daarna is er bij wie opgaf niets meer bewaard of verbonden', samenPotje(op) === null && !op.get('!!MP'));
  });

  /* een uitslag is definitief: een zet die erna kwam telt niet, en de stand gaat niet eindeloos heen en weer.
     De teller telt de standen die een apparaat echt verstuurt, ook over een nieuwe verbinding heen. */
  const telStanden = function (x) {
    const n = JSON.stringify(x.naam);
    x.ev('(function () { globalThis.__standen = globalThis.__standen || {}; globalThis.__standen[' + n + '] = 0; if (mpSend.__telt) return;' +
      'var s = mpSend; mpSend = function (o) { if (o && o.t === "sync" && MP && MP.open) globalThis.__standen[' + n + ']++; return s(o); };' +
      'mpSend.__telt = true; })()');
  };
  const standen = function (x) { return globalThis.__standen[x.naam]; };
  const handvol = function (check, a, b) {
    check('hooguit een handvol standen (' + standen(a) + ' en ' + standen(b) + ')', standen(a) <= 6 && standen(b) <= 6);
  };
  async function stil(check, a, b) {
    telStanden(a);
    telStanden(b);
    await wacht(60000);
    check('daarna gaat er geen stand meer heen en weer (' + standen(a) + ' en ' + standen(b) + ')', standen(a) === 0 && standen(b) === 0);
  }
  const VERVALLEN = /Je laatste zet telt niet mee: het potje was al klaar voor je hem deed\. Dat kon je niet zien, want er was geen verbinding\./;
  const vervallenGezegd = function (x) { return VERVALLEN.test(tekstVan(x, 'eindkaart')) && /Je laatste zet telt niet mee: het potje was al klaar\./.test(tekstVan(x, 'bubble')); };
  for (const hoe of ['allebei verbonden', 'wie opgeeft heeft even geen lijn']) {
    await regel('[4.1] opgeven en een zet kruisen elkaar (' + hoe + '): beide kanten hetzelfde einde, en dan is het stil', async function (check) {
      const { op: zetter, ander: opgever } = await langPotje();
      const voorZ = telt(zetter), voorO = telt(opgever), zetten = zetter.get('MP.S.hist.length');
      if (hoe !== 'allebei verbonden') { geenNetwerk(opgever); await wacht(2000); }
      telStanden(zetter);
      telStanden(opgever);
      const zet1 = zetter.get('moveKey(legalMoves(MP.S)[0])');
      zet(zetter, zet1);
      opgever.ev('resignNow()');
      if (hoe !== 'allebei verbonden') { await wacht(1000); weerNetwerk(opgever); }
      await wacht(60000);
      check('testopzet: beide potjes zijn uit', zetter.get('session.over') === true && opgever.get('session.over') === true);
      check('dezelfde zetten: de zet na de opgave telt niet', zetter.get('MP.S.hist.length') === zetten && opgever.get('MP.S.hist.length') === zetten);
      check('hetzelfde einde', eindziet(zetter, 'WINT') && eindziet(opgever, 'Je gaf op'));
      check('wie te laat zette, leest dat die zet niet telt', vervallenGezegd(zetter) && !VERVALLEN.test(tekstVan(opgever, 'eindkaart')));
      check('één keer geteld', telt(zetter) === plusEen(voorZ, true) && telt(opgever) === plusEen(voorO, false));
      handvol(check, zetter, opgever);
      await stil(check, zetter, opgever);
    });
  }

  await regel('[4.1] ja op remise zonder lijn, terwijl wie het aanbood al verder zette: remise voor allebei, en die zet telt niet', async function (check) {
    const { op: wit, ander: zwart } = await langPotje();
    const voorW = telt(wit), voorZ = telt(zwart), zetten = wit.get('MP.S.hist.length');
    await biedRemise(wit);
    await wacht(500);
    check('testopzet: de vraag komt aan', /biedt remise aan/.test(zegt(zwart)));
    geenNetwerk(zwart);
    await wacht(3000);
    telStanden(wit);
    telStanden(zwart);
    zet(wit, wit.get('moveKey(legalMoves(MP.S)[0])'));
    await wacht(2000);
    check('testopzet: wit zette', wit.get('MP.S.hist.length') === zetten + 1);
    tikTekst(zwart, 'Remise aannemen');
    await wacht(2000);
    weerNetwerk(zwart);
    await wacht(60000);
    check('remise aan beide kanten', eindziet(wit, 'Gelijkspel') && eindziet(zwart, 'Gelijkspel'));
    check('dezelfde zetten: de zet na het ja telt niet', wit.get('MP.S.hist.length') === zetten && zwart.get('MP.S.hist.length') === zetten);
    check('wit leest dat zijn zet niet telt', vervallenGezegd(wit));
    check('één keer geteld', telt(wit) === plusEen(voorW, false) && telt(zwart) === plusEen(voorZ, false));
    handvol(check, wit, zwart);
    await stil(check, wit, zwart);
  });

  await regel('[4.1] mat en opgeven in hetzelfde gat: aan beide kanten wint wit, één keer geteld, en dan is het stil', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    for (const z of ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6']) await speel(a, b, z);
    const wit = aanZet(a, b), zwart = wit === a ? b : a;
    const voorW = telt(wit), voorZ = telt(zwart);
    geenNetwerk(zwart);
    await wacht(3000);
    telStanden(wit);
    telStanden(zwart);
    await geefOp(zwart);
    zet(wit, 'h5f7');
    await wacht(3000);
    check('testopzet: wit zette mat, zwart gaf op', eindziet(wit, 'JIJ WINT') && eindziet(zwart, 'Je gaf op'));
    weerNetwerk(zwart);
    await wacht(60000);
    check('wit wint aan beide kanten', eindziet(wit, 'JIJ WINT') && eindziet(zwart, 'wint dit potje'));
    /* een opgave voor de twintigste halve zet telt voor wie opgaf nergens voor mee */
    check('één keer geteld', telt(wit) === plusEen(voorW, true) && telt(zwart) === voorZ);
    handvol(check, wit, zwart);
    await stil(check, wit, zwart);
  });

  await regel('[4.1] allebei opgeven in hetzelfde gat: beide opgaven staan, niemand wint, en beide eindkaarten zeggen het', async function (check) {
    const { op: wit, ander: zwart } = await langPotje();
    const voorW = telt(wit), voorZ = telt(zwart);
    geenNetwerk(zwart);
    await wacht(3000);
    telStanden(wit);
    telStanden(zwart);
    await geefOp(zwart);
    await geefOp(wit);
    check('testopzet: allebei gaven op', eindziet(wit, 'Je gaf op') && eindziet(zwart, 'Je gaf op'));
    weerNetwerk(zwart);
    await wacht(60000);
    check('beide eindkaarten: allebei opgegeven, niemand wint', [wit, zwart].every(function (x) {
      const ander = x === wit ? zwart : wit;
      return zichtbaar(x, 'eindkaart') && tekstVan(x, 'ekKop') === 'Jullie gaven allebei op' &&
        tekstVan(x, 'ekZin') === ander.naam + ' gaf ook op, terwijl er geen verbinding was. Daarom wint niemand dit potje.';
    }));
    check('ieder telt één gespeeld potje en geen winst', telt(wit) === plusEen(voorW, false) && telt(zwart) === plusEen(voorZ, false));
    handvol(check, wit, zwart);
    await stil(check, wit, zwart);
  });

  /* twee standen die elk achterlopen op de ander en niet samen kunnen komen (hier een uitslag bij een zet die niet
     klopt): elke kant antwoordt één keer op dezelfde stand, en dan houdt het op */
  await regel('[4.1] een stand die niet bij te werken is, krijgt één keer antwoord, niet eindeloos', async function (check) {
    const { wit, zwart } = await tweeZetten();
    zwart.ev('MP.result = { kind: "opgave", by: MP.myColor, ply: 1 }; MP.over = true;');
    await speel(wit, zwart, 'g1f3');
    check('testopzet: wit zette, zwart nam de zet niet meer aan', wit.get('MP.S.hist.length') === 3 && zwart.get('MP.S.hist.length') === 2);
    telStanden(wit);
    telStanden(zwart);
    zwart.ev('stuurStand()');
    await wacht(60000);
    handvol(check, wit, zwart);
    await stil(check, wit, zwart);
  });

  await regel('[4.1] wie opgaf zonder lijn en naar huis ging: de ander leest de winst op de eindkaart, zonder venster erover', async function (check) {
    const { op: wit, ander: zwart } = await langPotje();
    geenNetwerk(zwart);
    await wacht(3000);
    await geefOp(zwart);
    tikTekst(zwart, 'Naar huis');
    await wacht(2000);
    weerNetwerk(zwart);
    const gestopt = await zagOoit(function () { return /is gestopt/.test(wit.scherm()); }, 60000);
    check('wit ziet de winst op de eindkaart', eindziet(wit, 'WINT'));
    check('en nooit "is gestopt" eroverheen', !gestopt && !wit.open());
  });

  /* een afgelopen potje maakt nooit bezig: uitnodigen, een uitnodiging krijgen en een nieuw potje kunnen meteen */
  async function vriendEnPotje() {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    await wordenVrienden(fien, sem);
    fien.ev('if (MP) mpStop(true); goHome()');
    sem.ev('if (MP) mpStop(true); goHome()');
    await wacht();
    await samenSpelen(fien, daan);
    for (const z of ZETTEN22) await speel(fien, daan, z);
    return { fien, daan, sem };
  }
  async function semNodigtUit(check, fien, sem) {
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    check('de uitnodiging van Sem komt aan', /Sem/.test(fien.scherm()) && kanTikken(fien, 'Nu niet'));
    tikTekst(fien, 'Nu niet');
    await zagOoit(function () { return /kan nu even niet/.test(zegt(sem)); }, 30000);
    sem.ev('modalQueue = []; closeModal(); goHome()');
    await wacht();
    await nodigUit(fien);
    check('Fien nodigt Sem uit, zonder "al bezig"', !/bezig/.test(toastTekst(fien)) && fien.get('!!INV'));
  }

  await regel('[4.1] wie opgaf terwijl de app van de ander dicht was, is niet bezig: een uitnodiging komt aan, en uitnodigen kan', async function (check) {
    const { fien, daan, sem } = await vriendEnPotje();
    stopApparaat(daan);
    await wacht(3000);
    await geefOp(fien);
    tikTekst(fien, 'Naar huis');
    await wacht();
    check('testopzet: het einde wacht nog op Daan', fien.get('!!(MP && MP.result && !MP.bekend)'));
    check('thuis geen kaart voor een potje dat Fien al zag', !/Daan/.test(tekstVan(fien, 'verder')));
    await semNodigtUit(check, fien, sem);
  });

  await regel('[4.1] een einde dat thuis wacht, maakt niet bezig, ook niet na herladen; het blijft staan tot het kind het zag', async function (check) {
    const { fien, daan, sem } = await vriendEnPotje();
    fien.tik('backBtn');
    await wacht();
    await geefOp(daan);
    await wacht(3000);
    const fien2 = herlaad(fien);
    await wacht(30000);
    check('testopzet: de kaart zegt dat het potje met Daan klaar is', /Je potje met Daan is klaar/.test(tekstVan(fien2, 'verder')));
    await semNodigtUit(check, fien2, sem);
    check('het einde met Daan staat nog bewaard', /"peerName":"Daan"/.test(fien2.opslag.getItem(SAMEN) || ''));
  });

  await regel('[4.1] een nieuw potje terwijl een einde thuis wacht: het einde blijft, telt één keer als het kind het ziet, en het nieuwe potje loopt door', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    await samenSpelen(fien, daan);
    for (const z of ZETTEN22) await speel(fien, daan, z);
    const voor = telt(fien);
    fien.tik('backBtn');
    await wacht();
    await geefOp(daan);
    await wacht(3000);
    check('testopzet: de kaart zegt dat het potje met Daan klaar is', /Je potje met Daan is klaar/.test(tekstVan(fien, 'verder')));
    await samenSpelen(fien, sem);
    await speel(fien, sem, 'e2e4');
    check('testopzet: het potje met Sem loopt', fien.get('!!(MP && MP.S && MP.S.hist.length === 1 && MP.peerName === "Sem")'));
    check('Fien heeft één open lijn: de oude is dicht', fien.leven.sockets.filter(function (s) { return s.readyState === 1; }).length === 1);
    fien.tik('backBtn');
    await wacht();
    const t = tekstVan(fien, 'verder');
    check('de kaart heeft allebei: het einde met Daan en het potje met Sem', /Je potje met Daan is klaar/.test(t) && /je potje met Sem/.test(t));
    check('nog niets geteld', telt(fien) === voor);
    tikTekst(fien, 'Bekijk');
    await wacht();
    check('de eindkaart van het potje met Daan: gewonnen', eindziet(fien, 'WINT') && /Daan gaf op/.test(tekstVan(fien, 'eindkaart')));
    check('een potje dat al klaar was, heeft geen revanche en geen Vrienden worden', !kanTikken(fien, 'Revanche') && !kanTikken(fien, 'Vrienden worden'));
    check('één keer geteld, als winst', telt(fien) === plusEen(voor, true));
    tikTekst(fien, 'Naar huis');
    await wacht();
    check('het potje met Sem loopt nog, verbonden', fien.get('!!(MP && MP.peerName === "Sem" && MP.S && !MP.over && MP.open)') &&
      /Verder: je potje met Sem/.test(tekstVan(fien, 'verder')) && !/Daan/.test(tekstVan(fien, 'verder')));
    check('Sem merkt niets', !sem.open() && sem.get('!!(session && !session.over)'));
    const fien2 = herlaad(fien);
    await wacht(30000);
    check('na herladen geen kaart meer voor Daan, en niet nog eens geteld', !/Daan/.test(tekstVan(fien2, 'verder')) && telt(fien2) === plusEen(voor, true));
    check('en het potje met Sem staat er nog', /je potje met Sem/.test(tekstVan(fien2, 'verder')));
  });

  await regel('[4.1] een einde dat de ander nog niet hoorde, en dan een nieuw potje: de oude lijn gaat dicht, en de ander krijgt het gewone einde', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    await samenSpelen(fien, daan);
    for (const z of ZETTEN22) await speel(fien, daan, z);
    const kamer = fien.get('MP.room'), voorD = telt(daan);
    stopApparaat(daan);
    await wacht(3000);
    await geefOp(fien);
    tikTekst(fien, 'Naar huis');
    await wacht();
    await samenSpelen(fien, sem);
    check('testopzet: het potje met Sem loopt', fien.get('!!(MP && MP.S && MP.peerName === "Sem")'));
    check('Fien heeft één open lijn: de oude is dicht', fien.leven.sockets.filter(function (s) { return s.readyState === 1; }).length === 1);
    check('bij Fien staat alleen het potje met Sem', !/"peerName":"Daan"/.test(fien.opslag.getItem(SAMEN) || ''));
    /* de kamer leeft nog twaalf uur nadat de laatste wegging; daarna is hij weg */
    delete __server.wsrooms[kamer];
    const daan2 = herlaad(daan);
    await wacht(30000);
    daan2.tik('verderKaart');
    await wacht();
    check('Daan leest dat het potje gestopt is en voor niemand telt', /gestopt/.test(zegt(daan2)) && /telt voor niemand mee/.test(zegt(daan2)));
    check('bij Daan geen teller veranderd', telt(daan2) === voorD);
  });

  await regel('[4.1] opgeven zonder verbinding: de ander wint zodra de lijn terug is, één keer geteld', async function (check) {
    const { op, ander } = await langPotje();
    const voorOp = telt(op), voorAnder = telt(ander);
    geenNetwerk(op);
    await wacht(3000);
    await geefOp(op);
    await wacht(2000);
    check('testopzet: wie opgaf ziet zijn einde, één keer geteld', eindziet(op, 'Je gaf op') && telt(op) === plusEen(voorOp, false));
    weerNetwerk(op);
    await wacht(60000);
    check('de ander ziet de winst', eindziet(ander, 'WINT'));
    check('één keer geteld aan beide kanten', telt(ander) === plusEen(voorAnder, true) && telt(op) === plusEen(voorOp, false));
  });

  await regel('[4.1] de ander geeft op terwijl jouw lijn even weg is: je ziet het einde zodra de lijn terug is', async function (check) {
    const { wit, zwart } = await tweeZetten();
    geenNetwerk(wit);
    await wacht(2000);
    await geefOp(zwart);
    await wacht(1000);
    weerNetwerk(wit);
    await wacht(60000);
    check('wit ziet dat zwart opgaf, en speelt niet door', eindziet(wit, 'WINT') && wit.get('session.over') === true);
  });

  await regel('[4.1] remise aanbieden zonder verbinding: het aanbod komt aan zodra de lijn terug is', async function (check) {
    const { wit, zwart } = await tweeZetten();
    geenNetwerk(wit);
    await wacht(3000);
    await biedRemise(wit);
    weerNetwerk(wit);
    await wacht(60000);
    check('zwart krijgt de vraag', /biedt remise aan/.test(zwart.scherm()) || /biedt remise aan/.test(zegt(zwart)));
    tikTekst(zwart, 'Nee, doorspelen');
    await wacht(5000);
    check('wit hoort het antwoord', /wil doorspelen/.test(tekstVan(wit, 'bubble')));
  });

  await regel('[4.1] ja op remise vlak nadat de lijn wegviel: remise voor allebei, één keer geteld', async function (check) {
    const { op: vraagt, ander: antwoordt } = await langPotje();
    const voorV = telt(vraagt), voorA = telt(antwoordt);
    await biedRemise(vraagt);
    await wacht(500);
    check('testopzet: de vraag komt aan', /biedt remise aan/.test(zegt(antwoordt)));
    geenNetwerk(antwoordt);
    await wacht(1000);
    tikTekst(antwoordt, 'Remise aannemen');
    await wacht(2000);
    check('testopzet: remise bij wie ja zei', eindziet(antwoordt, 'Gelijkspel'));
    weerNetwerk(antwoordt);
    await wacht(120000);
    check('remise bij wie het aanbood', eindziet(vraagt, 'Gelijkspel'));
    check('één keer geteld aan beide kanten', telt(vraagt) === plusEen(voorV, false) && telt(antwoordt) === plusEen(voorA, false));
  });

  await regel('[4.2] ← in een vriendenpotje gaat naar huis en houdt potje en verbinding; de ander merkt niets', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const zwart = aanZet(a, b), wit = zwart === a ? b : a;
    wit.tik('backBtn');
    await wacht();
    check('thuis, zonder vraag', opThuis(wit) && !wit.open());
    check('het potje is bewaard en de verbinding blijft', !!samenPotje(wit) && wit.get('!!MP'));
    check('de ander merkt niets', !zwart.open() && zwart.get('!!(session && !session.over)'));
    await speel(zwart, wit, 'e7e5');
    wit.tik('verderKaart');
    await wacht();
    check('terug in het potje met de zet van de ander', opSpeelscherm(wit) && wit.fen() === zwart.fen());
  });

  await regel('[4.3] wie blijft, hoort de waarheid: even weg, het potje blijft staan, het staat bij Verder', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    stopApparaat(a);
    await wacht();
    check('Fien is er nu niet', /Fien is er nu niet/.test(zegt(b)));
    check('het potje blijft staan, bij Verder', /blijft staan/.test(zegt(b)) && /Verder/.test(zegt(b)));
    check('geen belofte dat zetten vanzelf komen', !/komen straks|vanzelf goed/.test(zegt(b)));
    await wacht(10 * 60000);
    check('ook na tien minuten eerlijk', /is er nu niet/.test(zegt(b)) && !/komen straks|vanzelf goed/.test(zegt(b)));
    check('en het potje staat er nog', !!samenPotje(b));
  });

  /* steekproef: wat de strook en het bord zeggen als de ander weg is, of na het einde wegging */
  await regel('[4.3] is de ander weg, dan zegt de strook dat ook na een eigen zet, en niet dat de ander nu zet', async function (check) {
    const { wit, zwart } = await tweeZetten();
    stopApparaat(zwart);
    await wacht(3000);
    check('testopzet: de strook zegt dat Daan er nu niet is', /er nu niet/.test(tekstVan(wit, 'bubble')));
    zet(wit, 'g1f3');
    await wacht();
    check('na de eigen zet nog steeds dat de ander er nu niet is', /er nu niet/.test(tekstVan(wit, 'bubble')) && !/^\s*Nu /.test(tekstVan(wit, 'bubble')));
  });

  await regel('[4.3] wie het potje weer opent terwijl de ander weg is, leest dat de ander er nu niet is', async function (check) {
    const { wit, zwart } = await tweeZetten();
    stopApparaat(zwart);
    await wacht(3000);
    zet(wit, 'g1f3');
    await wacht();
    wit.tik('backBtn');
    await wacht();
    wit.tik('verderKaart');
    await wacht();
    check('de strook zegt dat de ander er nu niet is', /er nu niet/.test(tekstVan(wit, 'bubble')) && !/is aan zet/.test(tekstVan(wit, 'bubble')));
  });

  await regel('[2.3] gaat de ander na het einde naar huis, dan blijft het bord achter de eindkaart vanaf de eigen kant', async function (check) {
    const { wit, zwart } = await tweeZetten();
    await geefOp(wit);
    await wacht();
    check('testopzet: zwart ziet het bord vanaf zwart', eindziet(zwart, 'WINT') && /^\s*h/.test(tekstVan(zwart, 'coordsF')));
    tikTekst(wit, 'Naar huis');
    await wacht(30000);
    check('na het vertrek van de ander nog steeds vanaf zwart', eindziet(zwart, 'WINT') && /^\s*h/.test(tekstVan(zwart, 'coordsF')));
  });

  await regel('[2.1] de uitleg onder het bord van een oefening staat niet onder het bord van een vriendenpotje erna', async function (check) {
    const a = maakApparaat('Lotte'), b = maakApparaat('Fien');
    await startOefening(a, 'trucs');
    await wacht();
    check('testopzet: de oefening heeft een uitleg onder het bord', zichtbaar(a, 'hulpZin'));
    a.tik('backBtn');
    await wacht();
    await samenSpelen(a, b);
    check('in het vriendenpotje geen uitleg van de oefening', opSpeelscherm(a) && !zichtbaar(a, 'hulpZin'));
  });

  await regel('[3.5] het apparaat dat de code liet zien, zegt dat het gelukt is zodra het nieuwe apparaat gekoppeld is', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    check('testopzet: vier woorden', vier.length === 4);
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', vier);
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    /* in kleine stapjes: het codevenster kijkt om de vijf tellen, en elke keer is een heen-en-weer met de server */
    await zagOoit(function () { return /Gelukt/.test(tekstVan(mees, 'linkTijd')); }, 40000);
    check('het codevenster zegt het', /Gelukt! Je level, sterren en trofeeën staan nu ook op je andere apparaat\./.test(tekstVan(mees, 'linkTijd')) &&
      kanTikken(mees, 'Klaar') && !zichtbaar(mees, 'linkWoorden'));
    mees.tik('linkDone');
    mees.tik('tabIk');
    ipad.ev('closeModal()');
    ipad.tik('tabIk');
    check('Ik zegt op beide apparaten dat ze gekoppeld zijn', [mees, ipad].every(function (x) {
      return /✔ Gekoppeld: je level, sterren en trofeeën staan ook op je andere apparaat\./.test(tekstVan(x, 'ikBewaard'));
    }));
  });

  await regel('[3.5] na koppelen weet ook het oude apparaat dat alles op twee apparaten staat, ook als het nieuwe nog niets verdiende', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    check('testopzet: vier woorden', vier.length === 4);
    mees.tik('linkDone');
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', vier);
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    await wacht(30000);
    const mees2 = herlaad(mees);
    await wacht(30000);
    mees2.tik('tabIk');
    check('het oude apparaat zegt het ook', /andere apparaat/.test(tekstVan(mees2, 'ikBewaard')) && !/Koppel het/.test(tekstVan(mees2, 'ikBewaard')));
  });

  async function codeEnKoppel(mees, ipad, klaarMeteen) {
    await mees.ev('linkShareFlow()');
    await wacht();
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    if (klaarMeteen) mees.tik('linkDone');
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', vier);
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    return vier.length === 4;
  }
  const gekoppeld = function (x) { return /✔ Gekoppeld/.test(tekstVan(x, 'ikBewaard')) && !/Koppel het/.test(tekstVan(x, 'ikBewaard')); };

  await regel('[3.5] Klaar voordat het nieuwe apparaat koppelde: het oude apparaat ziet het toch, zonder herstart', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    check('testopzet: vier woorden', await codeEnKoppel(mees, ipad, true));
    mees.tik('tabIk');
    check('binnen een minuut zegt Ik op het oude apparaat dat ze gekoppeld zijn', await zagOoit(function () { return gekoppeld(mees); }, 60000));
  });

  await regel('[3.5] Ik kijkt zelf of een ander apparaat koppelde, ook als het oude apparaat in de tien minuten geen lijn had', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    mees.tik('linkDone');
    geenNetwerk(mees);
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', vier);
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    /* de tien minuten van de code zijn om */
    zetDatum(new Date(Date.now() + 11 * 60000).toISOString());
    await zagOoit(function () { return false; }, 60000);
    weerNetwerk(mees);
    mees.tik('tabIk');
    check('testopzet: Ik zegt eerst nog dat alles hier staat', /Koppel het/.test(tekstVan(mees, 'ikBewaard')));
    check('even later: gekoppeld', await zagOoit(function () { return gekoppeld(mees); }, 5000));
  });

  await regel('[3.5] een nieuwe code zegt pas Gelukt als een apparaat met deze code koppelde, niet voor een apparaat dat er al was', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    const vier = (mees.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
    mees.tik('linkDone');
    /* het oude apparaat hoort er in de tien minuten niets van: de eerste code weet het dus niet */
    geenNetwerk(mees);
    ipad.ev('linkEntryFlow()');
    typ(ipad, 'wordInp', vier);
    ipad.tik('linkGo');
    await wacht();
    ipad.tik('linkYes');
    zetDatum(new Date(Date.now() + 11 * 60000).toISOString());
    await zagOoit(function () { return false; }, 60000);
    weerNetwerk(mees);
    await mees.ev('linkShareFlow()');
    await zagOoit(function () { return false; }, 15000);
    check('geen Gelukt, de woorden staan er nog', !/Gelukt/.test(tekstVan(mees, 'linkTijd')) && zichtbaar(mees, 'linkWoorden'));
  });

  await regel('[3.5] terwijl het codevenster open is, leest de app het profiel alleen; schrijven doet hij niet om de vijf tellen', async function (check) {
    const mees = maakApparaat('Mees');
    await mees.ev('linkShareFlow()');
    await zagOoit(function () { return false; }, 10000);
    const echt = fetch;
    let geschreven = 0, gelezen = 0;
    fetch = function (url, o) {
      if (/\/v1\/profile\//.test(url)) { if (o && o.method === 'PUT') geschreven++; else gelezen++; }
      return echt(url, o);
    };
    try { await zagOoit(function () { return false; }, 60000); } finally { fetch = echt; }
    check('gelezen wel (' + gelezen + '), geschreven niet (' + geschreven + ')', gelezen >= 5 && geschreven === 0);
  });

  await regel('[3.5] twee apparaten die onder een oudere versie koppelden, het tweede verdiende niets: na de update weet het oude het', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    mees.ev('bump("xp", 140)');
    await mees.ev('ensureAccount(); syncNow()');
    await wacht(2000);
    /* zo koppelde de vorige versie: het profiel overnemen, zonder een eigen regel in het profiel */
    ipad.ev('ACC = ' + mees.get('JSON.stringify(ACC)') + '; saveAcc()');
    const ipad2 = herlaad(ipad);
    await wacht(30000);
    await mees.ev('syncNow()');
    await wacht(2000);
    mees.tik('tabIk');
    check('het oude apparaat zegt dat ze gekoppeld zijn', gekoppeld(mees));
    check('en het tweede telt niets mee', ipad2.get('P.xp') === 140 && mees.get('P.xp') === 140);
  });

  await regel('[3.5] compat: een apparaat met eigen XP en sterren dat koppelt, houdt ze; beide apparaten hebben daarna de som', async function (check) {
    const tablet = maakApparaat('Mees'), telefoon = maakApparaat('Mees');
    tablet.ev('bump("xp", 200)');
    telefoon.ev('bump("xp", 140); bump("stars", 3)');
    await tablet.ev('ensureAccount(); syncNow()');
    await wacht(2000);
    telefoon.ev('finishLink(' + tablet.get('JSON.stringify(ACC)') + ', null)');
    await wacht(20000);
    await tablet.ev('syncNow()');
    await wacht(2000);
    await telefoon.ev('syncNow()');
    await wacht(2000);
    check('telefoon ' + telefoon.get('P.xp') + ' XP, tablet ' + tablet.get('P.xp') + ' XP: allebei 340, en 3 sterren',
      telefoon.get('P.xp') === 340 && tablet.get('P.xp') === 340 && telefoon.get('P.stars') === 3 && tablet.get('P.stars') === 3);
  });

  /* na het einde wacht er alleen iets op de ander zolang de ander er is */
  async function eindeTussenTwee() {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    await geefOp(daan);
    await wacht();
    return { fien, daan };
  }
  const wachtKnoppen = function (x) { return kanTikken(x, 'Revanche') || kanTikken(x, 'Vrienden worden'); };

  await regel('[4.1] het venster "Jullie zijn nu vrienden!" na Naar huis van de ander: geen Revanche, en de regel zegt het', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Vrienden worden');
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: allebei het venster met Revanche', /Jullie zijn nu vrienden/.test(fien.scherm()) && kanTikken(fien, 'Revanche'));
    daan.tik('vrEind');
    await wacht(30000);
    check('geen Revanche meer in het venster', /Jullie zijn nu vrienden/.test(fien.scherm()) && !kanTikken(fien, 'Revanche') && kanTikken(fien, 'Naar huis'));
    check('het venster en de strook zeggen het', /Daan ging naar huis\. Nodig Daan later weer uit bij Vrienden\./.test(fien.scherm()) &&
      /Daan ging naar huis\. Nodig Daan later weer uit bij Vrienden\./.test(tekstVan(fien, 'bubble')));
    check('nergens wachten op wie weg is', !/Wachten op/.test(fien.scherm()));
  });

  await regel('[4.1] de app van de ander gaat dicht na het einde: geen knop die op de ander wacht, en de strook zegt het', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    check('testopzet: de knoppen staan er', kanTikken(fien, 'Revanche') && kanTikken(fien, 'Vrienden worden'));
    stopApparaat(daan);
    await wacht(3000);
    check('geen Revanche en geen Vrienden worden', !wachtKnoppen(fien) && kanTikken(fien, 'Naar huis'));
    check('de strook', /Daan ging naar huis\. Leuk dat jullie samen speelden!/.test(tekstVan(fien, 'bubble')));
  });

  await regel('[4.1] valt de lijn van de ander na het einde even weg, dan zijn de knoppen weg en daarna weer terug, en een vraag komt aan', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    geenNetwerk(daan);
    await wacht(3000);
    check('in het gat: geen knop die op de ander wacht', !wachtKnoppen(fien));
    await wacht(7000);
    weerNetwerk(daan);
    await wacht(30000);
    check('de ander is terug: de knoppen ook', kanTikken(fien, 'Revanche') && kanTikken(fien, 'Vrienden worden'));
    tikTekst(fien, 'Vrienden worden');
    await wacht();
    check('Gevraagd staat er pas nu, en de vraag komt aan', /Gevraagd\. Nu wachten op Daan\./.test(tekstVan(fien, 'eindkaart')) &&
      /wil vrienden worden/.test(zegt(daan)));
  });

  await regel('[4.1] een vriendschapsvraag van de ander gaat van de kaart als de ander naar huis gaat', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: de vraag staat op de kaart van Fien', /wil vrienden worden/.test(tekstVan(fien, 'eindkaart')));
    tikTekst(daan, 'Naar huis');
    await wacht(30000);
    check('de vraag is weg', !/wil vrienden worden/.test(tekstVan(fien, 'eindkaart')) && !wachtKnoppen(fien));
  });

  /* een venster voor een nieuw potje dat geen potje wordt: het vervangen potje komt terug, op elke manier */
  async function eindeVoorDaan(metSem) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    if (metSem) {
      await wordenVrienden(fien, sem);
      fien.ev('if (MP) mpStop(true); goHome()');
      sem.ev('if (MP) mpStop(true); goHome()');
      await wacht();
    }
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    stopApparaat(daan);
    await wacht(3000);
    await geefOp(fien);
    tikTekst(fien, 'Naar huis');
    await wacht();
    return { fien, daan, sem };
  }
  async function daanZietKlaar(check, fien, daan) {
    check('Fien is weer verbonden met het potje met Daan', fien.get('!!(MP && MP.S && MP.result && MP.peerName === "Daan")'));
    const daan2 = herlaad(daan);
    await wacht(30000);
    check('Daan leest dat het potje klaar is', /Je potje met Fien is klaar/.test(tekstVan(daan2, 'verder')));
  }
  const manieren = [
    ['Stop met wachten', true, async function (fien, sem) { await nodigUit(fien); tikTekst(fien, 'Stop met wachten'); await wacht(); }],
    ['Nu niet van de ander', true, async function (fien, sem) {
      await nodigUit(fien); await sem.ev('friendPoll()'); await wacht(); tikTekst(sem, 'Nu niet');
      await zagOoit(function () { return /Sem kan nu even niet/.test(zegt(fien)); }, 30000); }],
    ['de tien minuten', true, async function (fien, sem) { await nodigUit(fien); await wacht(10 * 60000 + 30000); }],
    ['ja op een uitnodiging van wie dan weg is', true, async function (fien, sem) {
      await nodigUit(sem); await fien.ev('friendPoll()'); await wacht(); stopApparaat(sem); fien.tik('invJa'); await wacht(40000); }],
    ['Stoppen in Verbinden', true, async function (fien, sem) {
      await nodigUit(sem); await fien.ev('friendPoll()'); await wacht(); stopApparaat(sem); fien.tik('invJa'); await wacht(2000);
      tikTekst(fien, 'Stoppen'); await wacht(); }],
    ['Stoppen van de ander op Verbonden', false, async function (fien, sem) {
      await fien.ev('mpHostQR()'); await wacht(); scanQR(fien, sem); await wacht(); sem.tik('mpJa'); await wacht();
      tikTekst(sem, 'Stoppen'); await wacht(5000); }]
  ];
  for (const m of manieren) {
    await regel('[4.1] een venster voor een nieuw potje eindigt zonder potje (' + m[0] + '): het vervangen potje komt terug, en de ander hoort het einde', async function (check) {
      const { fien, daan, sem } = await eindeVoorDaan(m[1]);
      await m[2](fien, sem);
      await daanZietKlaar(check, fien, daan);
    });
  }

  /* vrienden worden: op beide apparaten of op geen van beide, ook als een lijn even wegvalt */
  const vriendenVan = function (x) { return x.get('Object.keys(P.friends).filter(function (id) { return !P.friends[id].weg; }).length'); };
  const geheimen = function (x) { return x.get('Object.keys(P.friends).filter(function (k) { return !P.friends[k].weg; }).map(function (k) { return P.friends[k].k; }).join()'); };
  async function daanVraagt() {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    return { fien, daan };
  }
  const lijnWeg = [
    ['de lijn van wie de vraag kreeg valt weg, voor het ja', false, 'fien'],
    ['de lijn van wie vroeg valt weg, voor het ja', false, 'daan'],
    ['de lijn van wie ja zei valt weg, net na het ja', true, 'fien'],
    ['de lijn van wie vroeg valt weg, net na het ja', true, 'daan']
  ];
  for (const geval of lijnWeg) {
    await regel('[2.5] vrienden worden en een lijn die even wegvalt (' + geval[0] + '): vrienden op beide apparaten of op geen van beide', async function (check) {
      const { fien, daan } = await daanVraagt();
      check('testopzet: Fien heeft de vraag', /wil vrienden worden/.test(tekstVan(fien, 'eindkaart')));
      const weg = geval[2] === 'fien' ? fien : daan;
      if (geval[1]) tikTekst(fien, 'Ja, vrienden');
      geenNetwerk(weg);
      await wacht(5000);
      weerNetwerk(weg);
      await wacht(30000);
      if (!geval[1] && kanTikken(fien, 'Ja, vrienden')) { tikTekst(fien, 'Ja, vrienden'); await wacht(30000); }
      const nF = vriendenVan(fien), nD = vriendenVan(daan);
      check('allebei of geen van beide (' + nF + ' en ' + nD + ')', nF === nD);
      for (const x of [fien, daan]) {
        if (vriendenVan(x) === 0) check(x.naam + ': geen venster dat zegt dat het gelukt is', !/Jullie zijn nu vrienden/.test(x.scherm()));
      }
      check('niemand leest Gevraagd zonder dat er een vraag openstaat', !/Gevraagd/.test(tekstVan(daan, 'ekWacht')) || /wil vrienden worden/.test(tekstVan(fien, 'eindkaart')));
      check('heeft Fien een vraag, dan leest Daan Gevraagd', !/wil vrienden worden/.test(tekstVan(fien, 'eindkaart')) || /Gevraagd/.test(tekstVan(daan, 'ekWacht')));
      check('na het ja en de lijn terug: allebei vrienden, met één geheim', nF === 1 && geheimen(fien) === geheimen(daan));
    });
  }

  /* één bericht tegelijk: zo valt een lijn weg precies tussen twee berichten in */
  async function stapTot(vraag) {
    for (let i = 0; i < 2000 && !vraag(); i++) { drainTot(1, __klok + 1000); for (let j = 0; j < 40; j++) await null; }
    return !!vraag();
  }
  await regel('[2.5] een bevestiging die onderweg verloren gaat, komt opnieuw als de lijn terug is: dan zijn ze allebei vrienden', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Ja, vrienden');
    await stapTot(function () { return vriendenVan(daan) > 0; });
    check('testopzet: Daan heeft Fien al, Fien heeft de bevestiging nog niet', vriendenVan(daan) === 1 && vriendenVan(fien) === 0);
    geenNetwerk(fien);
    const lukteNiet = function () { return /Dat lukte niet/.test(tekstVan(fien, 'bubble')); };
    check('in het gat zegt niets dat het niet lukte, ook na tien tellen', !(await zagOoit(lukteNiet, 15000)));
    check('in het gat: Fien is nog geen vriend en leest niet dat het gelukt is', vriendenVan(fien) === 0 && !/Jullie zijn nu vrienden/.test(fien.scherm()));
    weerNetwerk(fien);
    await wacht(30000);
    check('terug: allebei vrienden, met hetzelfde geheim', vriendenVan(fien) === 1 && vriendenVan(daan) === 1 &&
      fien.get('P.friends[Object.keys(P.friends)[0]].k') === daan.get('P.friends[Object.keys(P.friends)[0]].k'));
    check('Fien leest dat het gelukt is', /Jullie zijn nu vrienden/.test(fien.scherm()));
  });

  await regel('[2.5] allebei tegelijk gevraagd en een lijn valt weg voor het antwoord aankomt: vrienden op beide apparaten of op geen van beide', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Vrienden worden');
    tikTekst(daan, 'Vrienden worden');
    const bewaarde = function (x) { return vriendenVan(x) > 0; };
    await stapTot(function () { return bewaarde(fien) || bewaarde(daan); });
    const groot = bewaarde(fien) ? daan : fien;
    check('testopzet: één kant bewaarde de vriend al', bewaarde(fien) !== bewaarde(daan));
    geenNetwerk(groot);
    await wacht(5000);
    weerNetwerk(groot);
    await wacht(30000);
    check('allebei vrienden, met één geheim (' + vriendenVan(fien) + ' en ' + vriendenVan(daan) + ')', vriendenVan(fien) === 1 && geheimen(fien) === geheimen(daan));
  });

  /* een telefoon die van netwerk wisselt: de oude lijn is dood, de app verbindt opnieuw en neemt zijn stoel over,
     en de server ziet niemand vertrekken (room.go: een vervangen verbinding ruimt niets op) */
  function wissel(x) {
    x.ev('(function () { var w = MP.ws, h = w.onclose; w.onclose = null; w.onmessage = null; w.onerror = null; h({ code: 1006, reason: "", wasClean: false }); })()');
  }
  const hoofdKnoppen = function (x) { return knoppen(x).filter(function (k) { return k.classList && k.classList.contains('sun'); }).length; };
  const vraagOpKaart = function (x) { return /wil vrienden worden/.test(tekstVan(x, 'eindkaart')) && kanTikken(x, 'Ja, vrienden'); };

  await regel('[2.5] Daan vroeg om vrienden te worden en de lijn van Fien wisselt zonder dat de server het ziet: de vraag blijft aan beide kanten, en ja maakt ze allebei vrienden', async function (check) {
    const { fien, daan } = await daanVraagt();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    wissel(fien);
    await wacht(60000);
    check('na een minuut: Fien heeft de vraag nog, Daan wacht erop', vraagOpKaart(fien) && /Gevraagd/.test(tekstVan(daan, 'ekWacht')));
    check('één hoofdknop bij Fien', hoofdKnoppen(fien) === 1);
    tikTekst(fien, 'Ja, vrienden');
    await wacht(10000);
    check('allebei vrienden', vriendenVan(fien) === 1 && vriendenVan(daan) === 1);
  });

  await regel('[2.5] Daan vroeg om vrienden te worden en zijn eigen lijn wisselt: de vraag blijft aan beide kanten, met één hoofdknop', async function (check) {
    const { fien, daan } = await daanVraagt();
    wissel(daan);
    await wacht(60000);
    check('Fien heeft de vraag, Daan wacht erop', vraagOpKaart(fien) && /Gevraagd/.test(tekstVan(daan, 'ekWacht')));
    check('één hoofdknop bij Fien', hoofdKnoppen(fien) === 1);
    tikTekst(fien, 'Ja, vrienden');
    await wacht(10000);
    check('allebei vrienden', vriendenVan(fien) === 1 && vriendenVan(daan) === 1);
  });

  await regel('[4.1] een revanche en een lijn die wisselt zonder dat de server het ziet: wie gevraagd was, weet het, en samen begint het nieuwe potje', async function (check) {
    for (const wanneer of ['na de vraag', 'tijdens de vraag']) {
      const { fien, daan } = await eindeTussenTwee();
      const oud = fien.get('MP.gameId');
      if (wanneer === 'na de vraag') { tikTekst(fien, 'Revanche'); await wacht(2000); wissel(daan); }
      else { wissel(daan); tikTekst(fien, 'Revanche'); }
      await wacht(60000);
      check(wanneer + ': Fien wacht nog op Daan, Daan leest dat Fien revanche wil', /Wachten op Daan/.test(knopTeksten(fien).join(' ')) &&
        /Fien wil revanche/.test(tekstVan(daan, 'bubble')));
      tikTekst(daan, 'Revanche');
      await wacht(5000);
      const id = function (x) { return x.get('MP && session && session.online && !session.over ? MP.gameId : null'); };
      check(wanneer + ': een nieuw potje op beide', !!id(fien) && id(fien) !== oud && id(daan) === id(fien));
    }
  });

  await regel('[4.1] na het einde: is de eigen lijn terug en ging de ander in dat gat weg, dan zegt de strook dat, niet dat er geen verbinding is', async function (check) {
    for (const hoe of ['Naar huis', 'de app dicht']) {
      const { fien, daan } = await eindeTussenTwee();
      geenNetwerk(fien);
      await wacht(3000);
      check(hoe + ': zonder lijn zegt de strook het', /De uitslag van jullie potje is al bewaard/.test(tekstVan(fien, 'bubble')));
      if (hoe === 'Naar huis') tikTekst(daan, 'Naar huis'); else stopApparaat(daan);
      await wacht(5000);
      weerNetwerk(fien);
      await wacht(30000);
      check(hoe + ': de lijn is terug en de strook zegt dat Daan naar huis ging', !/geen verbinding/.test(tekstVan(fien, 'bubble')) &&
        /Daan ging naar huis/.test(tekstVan(fien, 'bubble')) && !wachtKnoppen(fien) && kanTikken(fien, 'Naar huis'));
    }
  });

  await regel('[4.3] in een potje: waren beide lijnen weg en is de ander eerst terug, dan zegt de strook niet dat de ander er niet is', async function (check) {
    for (const zet of [false, true]) {
      const { wit, zwart } = await tweeZetten();
      const daan = zwart, fien = wit;
      await speel(fien, daan, 'g1f3');
      geenNetwerk(daan);
      await wacht(3000);
      check('testopzet: Fien leest dat Daan er niet is', /er nu niet/.test(tekstVan(fien, 'bubble')));
      geenNetwerk(fien);
      await wacht(3000);
      weerNetwerk(daan);
      await wacht(30000);
      if (zet) await speel(fien, daan, 'b8c6');
      weerNetwerk(fien);
      await wacht(60000);
      check((zet ? 'Daan zette: ' : 'Daan zette niet: ') + 'de strook zegt wie aan zet is', !/er nu niet/.test(tekstVan(fien, 'bubble')) &&
        (zet ? /Jij bent aan zet/ : new RegExp(daan.naam + ' is aan zet')).test(tekstVan(fien, 'bubble')));
    }
  });

  await regel('[2.5] wie ja zei en wacht terwijl de ander voorgoed naar huis gaat, leest dat vrienden worden nu niet lukt', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Ja, vrienden');
    stopApparaat(daan);
    await wacht(5000);
    check('de regel', /Daan ging naar huis, dus vrienden worden lukt nu niet\. Na een volgend potje kan het weer\./.test(tekstVan(fien, 'bubble')));
    check('niemand is vriend', vriendenVan(fien) === 0);
  });

  /* de klok echt zoveel tellen verder, ook als er geen timer tussen zit */
  async function tel(s) { await zagOoit(function () { return false; }, s * 1000); }

  /* de klok een timer per keer vooruit, tot het waar is */
  async function totHetWaarIs(vraag, venster) {
    const tot = __klok + venster;
    while (!vraag() && __klok < tot) { const n = drainTot(1, Math.min(tot, __klok + 50)); if (!n) __klok = Math.min(tot, __klok + 50); for (let j = 0; j < 40; j++) await null; }
    return !!vraag();
  }
  await regel('[2.5] een ja dat op bevestiging wacht, blijft als de ander even weg is: wie vroeg kan de vriend al hebben', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Ja, vrienden');
    await stapTot(function () { return !!geheimen(daan); });
    /* het ok van Daan gaat verloren, en daarna is Daan zelf even weg */
    geenNetwerk(fien);
    await tel(2);
    weerNetwerk(fien);
    await tel(1);
    geenNetwerk(daan);
    await tel(3);
    weerNetwerk(daan);
    await tel(40);
    check('testopzet: Daan had Fien al als vriend', !!geheimen(daan));
    check('allebei vrienden, met hetzelfde geheim', geheimen(fien) === geheimen(daan));
  });

  await regel('[2.5] een groet die komt terwijl het ja nog zijn sleutel maakt, laat dezelfde vraag niet opnieuw zien', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    try {
      await samenSpelen(fien, daan);
      await geefOp(aanZet(fien, daan));
      await tel(2);
      tikTekst(fien, 'Vrienden worden');
      await tel(1);
      __server.vertraging = function (s) { return daan.leven.sockets.indexOf(s) >= 0 ? 300 : 0; };
      fien.ev('globalThis.__groetVanFien = false; var __zg = mpSend; mpSend = function (m) { if (m && m.t === "hallo") globalThis.__groetVanFien = true; return __zg(m); }');
      wissel(daan);
      await totHetWaarIs(function () { return globalThis.__groetVanFien && kanTikken(daan, 'Ja, vrienden'); }, 10000);
      /* de groet van Fien is nu onderweg naar Daan; Daan tikt Ja */
      tikTekst(daan, 'Ja, vrienden');
      /* de groet landt voordat het apparaat klaar is met de sleutel (een trage telefoon): eerst de berichten, dan pas de beloften */
      drainTot(400, __klok + 1000);
      const weer = kanTikken(daan, 'Ja, vrienden');
      if (weer) tikTekst(daan, 'Ja, vrienden');
      await tel(40);
      check('de vraag kwam niet terug op de kaart', !weer);
      check('allebei vrienden, met hetzelfde geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan));
    } finally { __server.vertraging = null; }
  });

  await regel('[3.5] na een koppelcode tekent het kijken het scherm alleen opnieuw als het iets nieuws las', async function (check) {
    const mees = maakApparaat('Mees');
    await mees.ev('linkShareFlow()');
    await wacht();
    mees.tik('linkDone');
    await tel(6);
    mees.ev('globalThis.__opnieuw = 0; var __rh = renderHome; renderHome = function () { globalThis.__opnieuw++; return __rh.apply(this, arguments); }');
    await tel(60);
    check('een minuut kijken zonder iets nieuws: het scherm blijft zoals het is (' + globalThis.__opnieuw + ' keer opnieuw)', globalThis.__opnieuw === 0);
  });

  await regel('[3.5] na de tien minuten van een koppelcode kijkt het apparaat niet meer', async function (check) {
    const mees = maakApparaat('Mees');
    await mees.ev('linkShareFlow()');
    await wacht();
    mees.tik('linkDone');
    zetDatum(new Date(Date.now() + 11 * 60000).toISOString());
    await tel(10);
    const echt = fetch;
    let gelezen = 0;
    fetch = function (url, o) { if (/\/v1\/profile\//.test(url)) gelezen++; return echt(url, o); };
    try { await tel(60); } finally { fetch = echt; }
    check('geen enkele keer gelezen (' + gelezen + ')', gelezen === 0);
  });

  await regel('[4.1] een revanche die de ander niet meer vraagt, telt bij een groet niet meer: dan begint er geen potje', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    /* Daan laat de code zien: hij begint een revanche zodra hij denkt dat Fien het ook wil */
    await samenSpelen(daan, fien);
    await speel(daan, fien, 'e2e4');
    await speel(daan, fien, 'e7e5');
    await geefOp(fien);
    await wacht();
    const oud = daan.get('MP.gameId');
    tikTekst(fien, 'Revanche');
    await wacht(2000);
    check('testopzet: Daan leest dat Fien revanche wil', /Fien wil revanche/.test(tekstVan(daan, 'bubble')));
    geenNetwerk(daan);
    await tel(3);
    check('testopzet: Fien vraagt niets meer, Daan ging weg', !fien.get('MP.revMine'));
    weerNetwerk(daan);
    await tel(30);
    tikTekst(daan, 'Revanche');
    await tel(5);
    check('geen nieuw potje: Daan wacht op Fien, en Fien leest dat Daan revanche wil', daan.get('MP.gameId') === oud &&
      fien.get('session.over') === true && /Daan wil revanche/.test(tekstVan(fien, 'bubble')));
  });

  await regel('[4.1] een server die nog niet bijgewerkt is (zijn welkom zegt niets over de ander): de app telt de ander niet als weg', async function (check) {
    __server.welkomZonderAnder = true;
    try {
      const { fien, daan } = await eindeTussenTwee();
      geenNetwerk(fien);
      await tel(3);
      weerNetwerk(fien);
      await tel(30);
      check('na het einde: geen zin dat Daan naar huis ging, en de knoppen weer', !/ging naar huis/.test(tekstVan(fien, 'bubble')) && kanTikken(fien, 'Revanche'));
      /* ging de ander in het gat weg, dan weet de app dat niet; hij is dan ook niet bereikbaar tot hij groet */
      const t = await eindeTussenTwee();
      geenNetwerk(t.fien);
      await tel(3);
      stopApparaat(t.daan);
      await tel(3);
      weerNetwerk(t.fien);
      await tel(30);
      check('na het einde, de ander weg in het gat: geen knop die op hem wacht', !kanTikken(t.fien, 'Revanche') && !kanTikken(t.fien, 'Vrienden worden'));
      const { wit, zwart } = await tweeZetten();
      geenNetwerk(zwart);
      await tel(3);
      geenNetwerk(wit);
      await tel(3);
      weerNetwerk(zwart);
      await tel(30);
      weerNetwerk(wit);
      await tel(60);
      check('in een potje: de strook zegt niet dat de ander er niet is', !/er nu niet/.test(tekstVan(wit, 'bubble')));
    } finally { __server.welkomZonderAnder = false; }
  });

  /* vrienden worden als toestand: wat elk kind wil, gaat mee met elke groet en na elke tik; het apparaat handelt
     naar de twee toestanden, nooit naar de volgorde van berichten */
  await regel('[2.5] Nu niet, en dan vraagt wie vroeg opnieuw: de ander krijgt de vraag weer, en ja maakt één vriendschap', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Nu niet');
    await wacht();
    check('Daan leest het en kan opnieuw vragen', /wil nu even niet/.test(tekstVan(daan, 'bubble')) && kanTikken(daan, 'Vrienden worden'));
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('Fien krijgt de vraag weer', vraagOpKaart(fien));
    tikTekst(fien, 'Ja, vrienden');
    await tel(10);
    check('één vriendschap, één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
  });

  await regel('[2.5] wie Nu niet zei, vraagt later zelf: de ander krijgt de vraag, en ja maakt één vriendschap', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Nu niet');
    await wacht();
    tikTekst(fien, 'Vrienden worden');
    await wacht();
    check('Daan krijgt de vraag van Fien', vraagOpKaart(daan) && /Gevraagd/.test(tekstVan(fien, 'ekWacht')));
    tikTekst(daan, 'Ja, vrienden');
    await tel(10);
    check('één vriendschap, één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
  });

  await regel('[2.5] een vraag die openstaat als een revanche begint, staat er weer op de volgende eindkaart', async function (check) {
    /* met de vraag open heeft Fien geen Revanche meer: zij tikte hem voor de vraag kwam */
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    tikTekst(daan, 'Revanche');
    await wacht();
    check('testopzet: een nieuw potje', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    /* een toestand die tijdens het potje komt (de lijn van Daan wisselt), wacht tot het einde */
    wissel(daan);
    await tel(5);
    check('midden in het potje geen vraag en geen venster', !fien.open() && !vraagOpKaart(fien) && fien.get('!!(session && !session.over)'));
    for (const z of ['e2e4', 'e7e5']) await speel(fien, daan, z);
    await geefOp(aanZet(fien, daan));
    await wacht();
    check('de vraag van Daan staat weer op de kaart van Fien, en Daan wacht', vraagOpKaart(fien) && /Gevraagd/.test(tekstVan(daan, 'ekWacht')));
  });

  await regel('[2.5] een ja dat onderweg is, en dan Vrienden worden op een trage lijn: één vriendschap met één geheim', async function (check) {
    let gespeeld = 0;
    for (let poging = 0; poging < 8 && gespeeld < 4; poging++) {
      const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
      try {
        await samenSpelen(fien, daan);
        await geefOp(aanZet(fien, daan));
        await tel(2);
        tikTekst(daan, 'Vrienden worden');
        await tel(1);
        wissel(daan);
        tikTekst(fien, 'Ja, vrienden');
        for (let j = 0; j < 400; j++) await null;
        const stoel = daan.get('MP.seat');
        __server.vertraging = function (sock, data) { return sock._seat === stoel && /"t":"hallo"/.test(data) ? 1500 : 0; };
        if (await totHetWaarIs(function () { return kanTikken(fien, 'Vrienden worden'); }, 20000)) {
          await totHetWaarIs(function () { return false; }, 600);
          if (kanTikken(fien, 'Vrienden worden')) tikTekst(fien, 'Vrienden worden');
        }
        gespeeld++;
        await tel(40);
        check('poging ' + (poging + 1) + ': elk heeft de ander precies één keer, met hetzelfde geheim', !!geheimen(fien) &&
          geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
      } finally { __server.vertraging = null; ORAKEL.apps.splice(ORAKEL.apps.indexOf(fien)).forEach(stopApparaat); }
    }
  });

  await regel('[2.5] twee snelle tikken tellen als één, ook als het nee van de ander al onderweg is: wie Nu niet zei, krijgt de vraag niet nog eens', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    /* bij Fien blijven de groeten van Daan liggen, zodat ze er een voor een uit kunnen */
    fien.ev('globalThis.__houdA = []; var __mma = mpMsg; globalThis.__losA = function (n) { var h = globalThis.__houdA, nu = h.splice(0, n == null ? h.length : n); if (n == null) globalThis.__houdA = null; nu.forEach(function (m) { __mma(m); }); }; mpMsg = function (m) { if (globalThis.__houdA && m && m.t === "hallo") { globalThis.__houdA.push(m); return; } return __mma(m); }');
    const knop = daan.el('mpVriend');
    fire(knop, 'click', { target: knop });
    fire(knop, 'click', { target: knop });
    await tel(3);
    check('testopzet: een groet van Daan ligt klaar', globalThis.__houdA.length >= 1);
    globalThis.__losA(1);
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    tikTekst(fien, 'Nu niet');
    globalThis.__losA();
    await tel(5);
    check('Fien krijgt de vraag niet nog eens, en Daan leest het nee en heeft zijn knop weer', !vraagOpKaart(fien) &&
      /wil nu even niet/.test(tekstVan(daan, 'bubble')) && kanTikken(daan, 'Vrienden worden'));
  });

  await regel('[2.5] twee snelle tikken op Vrienden worden tellen als één: één Nu niet beantwoordt de vraag', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    const knop = daan.el('mpVriend');
    fire(knop, 'click', { target: knop });
    fire(knop, 'click', { target: knop });
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    tikTekst(fien, 'Nu niet');
    await wacht();
    check('Daan leest het nee, de knop is terug, en hij wacht niet meer', /wil nu even niet/.test(tekstVan(daan, 'bubble')) &&
      kanTikken(daan, 'Vrienden worden') && !/Gevraagd/.test(tekstVan(daan, 'ekWacht')));
    check('Fien heeft geen vraag meer', !vraagOpKaart(fien));
  });

  await regel('[2.5] een Nu niet en een eigen vraag in één toestand: de ander ziet alleen de vraag, niet ook het nee', async function (check) {
    const { fien, daan } = await daanVraagt();
    /* Fien zegt Nu niet en vraagt zelf terwijl de lijn van Daan wisselt: beide komen samen met haar volgende groet */
    wissel(daan);
    tikTekst(fien, 'Nu niet');
    tikTekst(fien, 'Vrienden worden');
    await tel(10);
    check('Daan ziet de vraag van Fien', vraagOpKaart(daan));
    check('en leest niet dat Fien nu even niet wil', !/wil nu even niet/.test(tekstVan(daan, 'bubble')));
  });

  await regel('[2.5] is wie vroeg weg zonder dat de server het weet, dan maakt het ja van de ander aan geen kant een vriend', async function (check) {
    const { fien, daan } = await daanVraagt();
    /* de lijn van Daan is dood (een telefoon op slot): de server merkt niets, en wat Daan zendt of krijgt komt niet aan */
    daan.ev('globalThis.__dood = mpSend; mpSend = function () {}');
    __server.vertraging = function (s) { return daan.leven.sockets.indexOf(s) >= 0 ? 1e9 : 0; };
    try {
      tikTekst(fien, 'Ja, vrienden');
      await tel(30);
      check('Fien heeft geen vriend, en geen knop of vraag', !geheimen(fien) && !kanTikken(fien, 'Ja, vrienden') && !kanTikken(fien, 'Vrienden worden'));
      check('Fien leest dat het ja onderweg is', /Jullie willen het allebei! Nu wachten tot Daan het ziet./.test(tekstVan(fien, 'ekWacht')));
      check('Daan ook geen vriend', !geheimen(daan));
      /* de lijn van Daan komt terug */
      daan.ev('mpSend = globalThis.__dood');
      __server.vertraging = null;
      wissel(daan);
      await tel(30);
      check('daarna allebei vrienden, met één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
    } finally { __server.vertraging = null; }
  });

  /* een vriend die maar aan één kant aankwam: Daan bewaarde, wat hij daarna stuurde kwam niet bij Fien, en een van de twee
     herlaadt tijdens de revanche */
  async function eenKantVriend() {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    await geefOp(daan);
    await wacht();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    fien.ev('globalThis.__blok = false; var __mmb = mpMsg; mpMsg = function (m) { if (globalThis.__blok && m && m.t === "hallo") return; return __mmb(m); }');
    tikTekst(fien, 'Ja, vrienden');
    globalThis.__blok = true;
    await tel(5);
    return { fien, daan };
  }
  async function terugInPotje(x) {
    const y = herlaad(x);
    await wacht();
    if (y.el('verderKaart')) { y.tik('verderKaart'); await wacht(); }
    return y;
  }
  for (const wie of ['zonder', 'met']) {
    await regel('[2.5] een vriend die maar aan één kant aankwam, gaat terug zodra het apparaat ' + (wie === 'zonder' ? 'zonder' : 'met') + ' die vriend herlaadt, ook midden in de revanche; de strook zegt het aan het einde, naar wat de kaart dan laat zien, en daarna maken ze hem samen opnieuw', async function (check) {
      let { fien, daan } = await eenKantVriend();
      check('testopzet: Daan heeft Fien, Fien heeft Daan nog niet', !!geheimen(daan) && !geheimen(fien));
      tikTekst(daan, 'Revanche');
      await tel(3);
      check('testopzet: een revanche loopt', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
      globalThis.__blok = false;
      if (wie === 'zonder') fien = await terugInPotje(fien); else daan = await terugInPotje(daan);
      check('testopzet: terug in het potje', fien.get('!!(session && session.online && !session.over)') && daan.get('!!(session && session.online && !session.over)'));
      await tel(3);
      check('nog tijdens de revanche: niemand heeft de vriend, en er staat niets over het bord', !geheimen(daan) && !geheimen(fien) && !daan.open() && !fien.open());
      check('de strook zegt het nog niet midden in het potje', !/kwam net niet aan/.test(tekstVan(daan, 'bubble')));
      await geefOp(aanZet(fien, daan));
      if (wie === 'zonder') {
        const terug = await zagOoit(function () { return /Vrienden worden kwam net niet aan bij Fien\. Fien krijgt je vraag nog een keer\./.test(tekstVan(daan, 'bubble')); }, 40000);
        check('Daan wacht nog op zijn vraag, en leest dat Fien hem nog een keer krijgt; Fien heeft hem voor zich', terug &&
          /Gevraagd/.test(tekstVan(daan, 'ekWacht')) && vraagOpKaart(fien));
        tikTekst(fien, 'Ja, vrienden');
      } else {
        const terug = await zagOoit(function () { return /Vrienden worden kwam net niet aan bij Fien\. Tik gewoon nog eens!/.test(tekstVan(daan, 'bubble')); }, 40000);
        check('Daan heeft de vraag van Fien voor zich en leest dat hij gewoon nog eens kan tikken; Fien wacht', terug &&
          vraagOpKaart(daan) && /Gevraagd/.test(tekstVan(fien, 'ekWacht')));
        tikTekst(daan, 'Ja, vrienden');
      }
      await tel(30);
      check('daarna allebei vrienden, één geheim, en elk heeft de ander één keer', !!geheimen(fien) && geheimen(fien) === geheimen(daan) &&
        geheimen(fien).split(',').length === 1);
    });
  }

  await regel('[2.5] wat een kind bij het einde nog moet lezen, blijft over een herlading heen: de regel over een vriend die terugging', async function (check) {
    let { fien, daan } = await eenKantVriend();
    tikTekst(daan, 'Revanche');
    await tel(3);
    globalThis.__blok = false;
    fien = await terugInPotje(fien);
    await tel(3);
    check('testopzet: Daan nam de vriend midden in het potje terug', !geheimen(daan) && daan.get('!!(session && !session.over)'));
    daan = await terugInPotje(daan);
    check('testopzet: Daan is terug in het potje', daan.get('!!(session && session.online && !session.over)'));
    await geefOp(aanZet(fien, daan));
    const terug = await zagOoit(function () { return /Vrienden worden kwam net niet aan bij Fien\./.test(tekstVan(daan, 'bubble')); }, 40000);
    check('aan het einde leest Daan dat de vriend net niet aankwam', terug);
  });

  await regel('[2.5] wat een kind bij het einde nog moet zien, blijft over een herlading heen: het venster met de drie plaatjes', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    fien.ev('globalThis.__houdF2 = []; var __mmf2 = mpMsg; globalThis.__losF2 = function () { var h = globalThis.__houdF2; globalThis.__houdF2 = null; h.forEach(function (m) { __mmf2(m); }); }; mpMsg = function (m) { if (globalThis.__houdF2 && m && m.t === "hallo") { globalThis.__houdF2.push(m); return; } return __mmf2(m); }');
    tikTekst(fien, 'Ja, vrienden');
    await tel(3);
    tikTekst(daan, 'Revanche');
    await tel(3);
    globalThis.__losF2();
    await tel(3);
    check('testopzet: Fien bewaarde de vriend midden in de revanche', !!geheimen(fien) && fien.get('!!(session && !session.over)') && !fien.open());
    const fien2 = await terugInPotje(fien);
    check('testopzet: Fien is terug in het potje', fien2.get('!!(session && session.online && !session.over)'));
    await geefOp(aanZet(fien2, daan));
    await wacht();
    check('aan het einde ziet Fien het venster met de drie plaatjes', fien2.ziet('Jullie zijn nu vrienden!'));
  });

  await regel('[2.5] een vriend die beide hebben, blijft als een van de twee tijdens de revanche herlaadt', async function (check) {
    let fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await geefOp(aanZet(fien, daan));
    await tel(2);
    tikTekst(fien, 'Vrienden worden');
    await tel(2);
    tikTekst(daan, 'Ja, vrienden');
    await tel(3);
    check('testopzet: allebei de vriend', !!geheimen(fien) && geheimen(fien) === geheimen(daan));
    tikTekst(fien, 'Revanche');
    tikTekst(daan, 'Revanche');
    await tel(2);
    fien = await terugInPotje(fien);
    await tel(3);
    await geefOp(aanZet(fien, daan));
    const terug = await zagOoit(function () { return /kwam net niet aan/.test(tekstVan(fien, 'bubble') + tekstVan(daan, 'bubble')); }, 15000);
    check('allebei nog dezelfde vriend, één keer, en niemand leest dat het net niet aankwam', !terug && !!geheimen(fien) &&
      geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
  });

  await regel('[2.5] een vriend gaat pas terug op een groet waarvan de bewijzen gelezen zijn: wie herlaadt en eindigt voor de ander groet, houdt de vriend', async function (check) {
    let fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await geefOp(aanZet(fien, daan));
    await tel(2);
    tikTekst(fien, 'Vrienden worden');
    await tel(2);
    tikTekst(daan, 'Ja, vrienden');
    await tel(3);
    tikTekst(fien, 'Revanche');
    tikTekst(daan, 'Revanche');
    await tel(2);
    const oud = fien;
    stopApparaat(oud);
    /* de nieuwe Fien krijgt de groeten van Daan pas na het einde */
    fien = maakApparaat('Fien', { opslag: oud.opslag, locatie: oud.location, netwerk: oud.netwerk, herstart: true });
    fien.ev('globalThis.__houdG = []; var __mmg = mpMsg; globalThis.__losG = function () { var h = globalThis.__houdG; globalThis.__houdG = null; h.forEach(function (m) { __mmg(m); }); }; mpMsg = function (m) { if (globalThis.__houdG && m && m.t === "hallo") { globalThis.__houdG.push(m); return; } return __mmg(m); }');
    await wacht();
    if (fien.el('verderKaart')) { fien.tik('verderKaart'); await wacht(); }
    check('testopzet: Fien is terug in het potje', fien.get('!!(session && session.online && !session.over)'));
    await geefOp(fien.get('!!(session && MP && session.S.turn === MP.myColor)') ? fien : daan);
    await tel(3);
    check('aan het einde, voor een groet van Daan: Fien heeft de vriend nog, en leest niet dat het net niet aankwam', !!geheimen(fien) && !/kwam net niet aan/.test(tekstVan(fien, 'bubble')));
    globalThis.__losG();
    await tel(5);
    check('na zijn groet: allebei nog dezelfde vriend', !!geheimen(fien) && geheimen(fien) === geheimen(daan));
  });

  await regel('[2.5] een Nu niet hoort bij de sessie waarin het gezegd is: vraagt wie herlaadde opnieuw, dan krijgt de ander de vraag', async function (check) {
    let fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await geefOp(aanZet(fien, daan));
    await tel(2);
    tikTekst(daan, 'Vrienden worden');
    await tel(2);
    tikTekst(fien, 'Nu niet');
    await tel(2);
    tikTekst(fien, 'Revanche');
    tikTekst(daan, 'Revanche');
    await tel(2);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    daan = await terugInPotje(daan);
    await tel(3);
    await geefOp(aanZet(fien, daan));
    await tel(5);
    tikTekst(daan, 'Vrienden worden');
    await tel(5);
    check('Fien krijgt de vraag, en Daan leest Gevraagd en niet dat Fien nu even niet wil', vraagOpKaart(fien) &&
      /Gevraagd/.test(tekstVan(daan, 'ekWacht')) && !/wil nu even niet/.test(tekstVan(daan, 'bubble')));
  });

  await regel('[2.5] "wil nu even niet" zegt de strook één keer per antwoord, niet bij elke groet daarna', async function (check) {
    const { fien, daan } = await daanVraagt();
    tikTekst(fien, 'Nu niet');
    await wacht();
    check('testopzet: Daan leest het', /wil nu even niet/.test(tekstVan(daan, 'bubble')));
    /* Daan tikt zelf iets anders, zodat zijn strook iets anders zegt */
    tikTekst(daan, 'Revanche');
    await wacht();
    check('testopzet: de strook van Daan zegt nu iets anders', !/wil nu even niet/.test(tekstVan(daan, 'bubble')));
    wissel(fien);
    const weer = await zagOoit(function () { return /wil nu even niet/.test(tekstVan(daan, 'bubble')); }, 5000);
    check('na een nieuwe groet van Fien zegt de strook het niet nog eens, ook niet even', !weer);
  });

  await regel('[2.5] twee kinderen die al vrienden waren, met een app die deze uitwisseling niet kent: geen knop en geen zin over de nieuwste SchaakHeld', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    fien.ev('if (MP) mpStop(); goHome()');
    daan.ev('if (MP) mpStop(); goHome()');
    await wacht();
    alsOudeApp(daan);
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    await geefOp(daan);
    await wacht();
    check('geen Vrienden worden en geen zin over de nieuwste SchaakHeld', !kanTikken(fien, 'Vrienden worden') &&
      !/nieuwste SchaakHeld/.test(tekstVan(fien, 'eindkaart')));
  });

  await regel('[2.5] lukt de sleutel hier niet, dan zegt de strook dat, en alles is als voor de tik: de knop, of de vraag van de ander', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await samenSpelen(daan, fien);
    await geefOp(aanZet(daan, fien));
    const echt = crypto.subtle.generateKey;
    const kapot = function () { return Promise.reject(new Error('geen sleutel')); };
    try {
      crypto.subtle.generateKey = kapot;
      tikTekst(daan, 'Vrienden worden');
      await wacht();
      check('Daan leest in de strook dat het hier niet lukt', /Dat lukt hier niet/.test(tekstVan(daan, 'bubble')));
      check('de knop van Daan is weer als eerst, en Fien kreeg geen vraag', kanTikken(daan, 'Vrienden worden') &&
        !/Gevraagd/.test(tekstVan(daan, 'eindkaart')) && !vraagOpKaart(fien));
      crypto.subtle.generateKey = echt;
      tikTekst(fien, 'Vrienden worden');
      await wacht();
      check('testopzet: Daan krijgt de vraag van Fien', vraagOpKaart(daan));
      crypto.subtle.generateKey = kapot;
      tikTekst(daan, 'Ja, vrienden');
      await wacht();
      check('Daan leest het weer, en de vraag van Fien staat er nog', /Dat lukt hier niet/.test(tekstVan(daan, 'bubble')) && vraagOpKaart(daan));
      check('Fien wacht nog, en niemand heeft een vriend', /Gevraagd/.test(tekstVan(fien, 'ekWacht')) && !geheimen(fien) && !geheimen(daan));
      crypto.subtle.generateKey = echt;
      tikTekst(daan, 'Ja, vrienden');
      await tel(10);
      check('daarna lukt het: allebei vrienden, één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
    } finally { crypto.subtle.generateKey = echt; }
  });

  await regel('[2.5] een tik telt pas als de sleutel er is: lukt hij niet, dan verandert er niets, ook niet als de ander intussen vraagt', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await samenSpelen(daan, fien);
    await geefOp(aanZet(daan, fien));
    await wacht();
    const echt = crypto.subtle.generateKey;
    let eerste = true;
    /* alleen de sleutel van Daan lukt niet, en pas na 300 ms; in die tijd vraagt Fien */
    crypto.subtle.generateKey = function () {
      if (!eerste) return echt.apply(this, arguments);
      eerste = false;
      return new Promise(function (ja, nee) { setTimeout(function () { nee(new Error('geen sleutel')); }, 300); });
    };
    try {
      tikTekst(daan, 'Vrienden worden');
      await wacht(50);
      tikTekst(fien, 'Vrienden worden');
      for (let j = 0; j < 400; j++) await null;
      await tel(5);
      check('Daan leest dat het hier niet lukt en heeft de vraag van Fien voor zich; Fien leest Gevraagd',
        /Dat lukt hier niet/.test(tekstVan(daan, 'bubble')) && vraagOpKaart(daan) && /Gevraagd/.test(tekstVan(fien, 'ekWacht')));
      tikTekst(daan, 'Nu niet');
      await tel(3);
      check('na Nu niet van Daan: Fien heeft haar knop weer, en geen vraag van een Daan die niet vroeg', kanTikken(fien, 'Vrienden worden') && !vraagOpKaart(fien));
    } finally { crypto.subtle.generateKey = echt; }
  });

  await regel('[2.5] een vraag die openstaat als de revanche begint, en de ander herlaadt tijdens de revanche: aan het einde heeft die de vraag weer, en ja maakt één vriendschap', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    tikTekst(daan, 'Revanche');
    await tel(3);
    check('testopzet: een revanche loopt', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    const fien2 = herlaad(fien);
    await wacht();
    if (fien2.el('verderKaart')) { fien2.tik('verderKaart'); await wacht(); }
    check('testopzet: Fien is terug in het potje', fien2.get('!!(session && session.online && !session.over)'));
    await tel(3);
    check('midden in het potje geen vraag en geen venster', !fien2.open() && !daan.open() && !geheimen(fien2) && !geheimen(daan));
    await geefOp(aanZet(fien2, daan));
    await tel(5);
    check('aan het einde heeft Fien de vraag van Daan weer, en Daan wacht', vraagOpKaart(fien2) && /Gevraagd/.test(tekstVan(daan, 'ekWacht')));
    tikTekst(fien2, 'Ja, vrienden');
    await tel(30);
    check('daarna allebei vrienden, één geheim', !!geheimen(fien2) && geheimen(fien2) === geheimen(daan) && geheimen(fien2).split(',').length === 1);
  });

  await regel('[2.5] komt de laatste toestand pas tijdens de revanche aan, dan hebben beide de vriend meteen, met één geheim en zonder venster over het bord; het venster komt aan het einde, het potje blijft wat het was', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    /* wat Daan na het ja over vrienden zegt, komt bij Fien pas aan als de revanche loopt */
    fien.ev('globalThis.__houdF = []; var __mmf = mpMsg; globalThis.__losF = function () { var h = globalThis.__houdF; globalThis.__houdF = null; h.forEach(function (m) { __mmf(m); }); }; mpMsg = function (m) { if (globalThis.__houdF && m && m.t === "hallo") { globalThis.__houdF.push(m); return; } return __mmf(m); }');
    tikTekst(fien, 'Ja, vrienden');
    await tel(3);
    check('testopzet: Daan heeft Fien en ziet het venster, Fien wacht op wat Daan zag', !!geheimen(daan) && !geheimen(fien) &&
      daan.ziet('Jullie zijn nu vrienden!') && /Jullie willen het allebei/.test(tekstVan(fien, 'ekWacht')));
    tikTekst(daan, 'Revanche');
    await tel(3);
    check('testopzet: de revanche loopt aan beide kanten', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    globalThis.__losF();
    await tel(3);
    check('tijdens de revanche: allebei de vriend, met één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
    check('en geen venster over het bord', !fien.open() && !daan.open());
    check('het potje van Fien begon niet tussen vrienden, en blijft dat', !fien.get('MP.viaFriend'));
    for (const z of ['e2e4', 'e7e5']) await speel(fien, daan, z);
    await geefOp(aanZet(fien, daan));
    await wacht();
    check('aan het einde ziet Fien het venster met de drie plaatjes, en Daan niet nog eens', fien.ziet('Jullie zijn nu vrienden!') && !daan.ziet('Jullie zijn nu vrienden!'));
  });

  await regel('[2.5] een toestand die tijdens de revanche verloren gaat, komt met de volgende groet: dan hebben beide de vriend, nog tijdens de revanche', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('testopzet: Fien heeft de vraag', vraagOpKaart(fien));
    /* wat Daan na het ja over vrienden stuurt, gaat verloren */
    fien.ev('globalThis.__verloren = true; var __mmv = mpMsg; mpMsg = function (m) { if (globalThis.__verloren && m && m.t === "hallo") return; return __mmv(m); }');
    tikTekst(fien, 'Ja, vrienden');
    await tel(3);
    check('testopzet: Daan heeft Fien, Fien nog niet', !!geheimen(daan) && !geheimen(fien));
    tikTekst(daan, 'Revanche');
    await tel(3);
    check('testopzet: de revanche loopt', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    globalThis.__verloren = false;
    wissel(fien);
    await tel(5);
    check('na de nieuwe lijn, nog tijdens de revanche: allebei de vriend, met één geheim', fien.get('!!(session && !session.over)') &&
      !!geheimen(fien) && geheimen(fien) === geheimen(daan) && geheimen(fien).split(',').length === 1);
    check('en geen venster over het bord', !fien.open() && !daan.open());
  });

  await regel('[2.5] wat een groet bewijst, is van dat moment: wie daarna een vriend bewaart of terugneemt, groet opnieuw, en nooit hebben twee kinderen een ander geheim', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    /* bij Daan blijft liggen wat Fien stuurt nadat ze zijn willen zag, en na haar herlading alles wat ze stuurt */
    daan.ev('globalThis.__houdD = { oud: [], nieuw: null }; var __mmd = mpMsg; globalThis.__losD = function (t) { var h = globalThis.__houdD[t]; globalThis.__houdD[t] = null; h.forEach(function (m) { __mmd(m); }); }; mpMsg = function (m) { var H = globalThis.__houdD; if (m && H.oud && m.t === "hallo" && m.vr && m.vr.sessie === 1 && m.vr.zag > 0) { H.oud.push(m); return; } if (m && H.nieuw && m.t === "hallo") { H.nieuw.push(m); return; } return __mmd(m); }');
    /* allebei tegelijk: Fien bewaart als het zien van Daan aankomt, Daan wacht op het zien van Fien */
    tikTekst(daan, 'Vrienden worden');
    tikTekst(fien, 'Vrienden worden');
    await tel(3);
    check('testopzet: Fien heeft Daan, Daan nog niet', !!geheimen(fien) && !geheimen(daan));
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Revanche');
    await tel(3);
    check('testopzet: de revanche loopt', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    globalThis.__houdD.nieuw = [];
    const fien2 = herlaad(fien);
    await wacht();
    if (fien2.el('verderKaart')) { fien2.tik('verderKaart'); await wacht(); }
    check('testopzet: Fien is terug in het potje', fien2.get('!!(session && session.online && !session.over)'));
    /* Daan bewaart de vriend pas nu, uit wat Fien voor de herlading wilde; dan pas komt wat ze daarna stuurde */
    globalThis.__losD('oud');
    await tel(3);
    check('testopzet: Daan heeft de vriend nu ook, Fien niet meer', !!geheimen(daan) && !geheimen(fien2));
    globalThis.__losD('nieuw');
    await tel(10);
    const gF = geheimen(fien2), gD = geheimen(daan);
    check('tijdens de revanche: allebei dezelfde vriend of geen van beide (' + !!gF + ', ' + !!gD + ')', gF === gD);
    await geefOp(aanZet(fien2, daan));
    await tel(10);
    if (kanTikken(fien2, 'Ja, vrienden')) { tikTekst(fien2, 'Ja, vrienden'); await tel(30); }
    if (kanTikken(daan, 'Ja, vrienden')) { tikTekst(daan, 'Ja, vrienden'); await tel(30); }
    check('na het einde en een ja: allebei vrienden, met één geheim', !!geheimen(fien2) && geheimen(fien2) === geheimen(daan) && geheimen(fien2).split(',').length === 1);
  });

  await regel('[2.5] het venster "Jullie zijn nu vrienden!" hoort bij het einde: begint de revanche, ook bij een gast die de start uit de stand haalt, dan is het weg', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(daan, 'Revanche');
    await wacht();
    tikTekst(fien, 'Vrienden worden');
    await wacht();
    tikTekst(daan, 'Ja, vrienden');
    await tel(1);
    check('testopzet: beide zien het venster', fien.ziet('Jullie zijn nu vrienden!') && daan.ziet('Jullie zijn nu vrienden!'));
    wissel(daan);
    tikTekst(fien, 'Revanche');
    await tel(5);
    check('testopzet: een nieuw potje aan beide kanten', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
    check('geen venster meer, aan geen kant', !fien.open() && !daan.open());
  });

  /* een potje houdt de soort waarmee het begon: in de kamer, of op de staat van het paar */
  const opStaatVan = function (x) { return x.get('!!(MP && MP.paar)'); };
  const staatHeeft = function (x, fid, id) { return x.get('(function () { var s = zichtVan(' + JSON.stringify(fid) + '); return !!s && ((!!s.spel && s.spel.id === ' + JSON.stringify(id) + ') || s.vorige.some(function (v) { return v.id === ' + JSON.stringify(id) + '; })); })()'); };
  const houdGroet = function (x) {
    x.ev('globalThis.__houd = []; var __mmh = mpMsg; globalThis.__laat = function () { var h = globalThis.__houd; globalThis.__houd = null; h.forEach(function (m) { __mmh(m); }); }; mpMsg = function (m) { if (globalThis.__houd && m && m.t === "hallo") { globalThis.__houd.push(m); return; } return __mmh(m); }');
  };
  for (const [wie, uitleg] of [['gast', 'de gast heeft de vriend al, de gastheer nog niet'], ['gastheer', 'de gastheer heeft de vriend al, de gast nog niet']]) {
    await regel('[2.5] W10 ' + uitleg + ' als de revanche begint: die blijft voor allebei een potje in de kamer, met gelijke borden bij elke zet; aan het einde hebben beide de vriend, en het volgende potje staat in de staat van het paar', async function (check) {
      const { fien, daan } = await eindeTussenTwee();
      check('testopzet: Fien is de gastheer', fien.get('MP.host') === true && daan.get('MP.host') === false);
      /* wie de vriend als laatste krijgt, mist eerst de groet van de ander */
      const later = wie === 'gast' ? fien : daan, eerder = wie === 'gast' ? daan : fien;
      tikTekst(later, 'Revanche');
      await wacht();
      tikTekst(eerder, 'Vrienden worden');
      await wacht();
      houdGroet(later);
      tikTekst(later, 'Ja, vrienden');
      await tel(3);
      check('testopzet: alleen ' + (wie === 'gast' ? 'Daan' : 'Fien') + ' heeft de vriend', !!geheimen(eerder) && !geheimen(later));
      daan.ev('globalThis.__starts = []; var __mst = mpMsg; mpMsg = function (m) { if (m && m.t === "start") globalThis.__starts.push(m); return __mst(m); }');
      tikTekst(eerder, 'Revanche');
      await tel(3);
      check('testopzet: de revanche loopt aan beide kanten', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)'));
      check('de revanche is aan beide kanten een potje in de kamer', !opStaatVan(fien) && !opStaatVan(daan));
      check('de gastheer bood geen potje op de staat aan: de gast bewees de vriend niet', daan.get('globalThis.__starts.length') >= 1 &&
        daan.get('globalThis.__starts.every(function (m) { return !m.paar; })'));
      later.ev('globalThis.__laat()');
      await tel(3);
      check('nog tijdens de revanche hebben beide de vriend, met één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan));
      const id = fien.get('MP.gameId'), fid = daan.get('Object.keys(P.friends).filter(function (k) { return !P.friends[k].weg; })[0]');
      let gelijk = true;
      for (const z of ['e2e4', 'e7e5', 'g1f3', 'b8c6']) { await speel(fien, daan, z); await wacht(); gelijk = gelijk && fien.fen() === daan.fen() && !!fien.fen(); }
      check('de borden zijn bij elke zet gelijk, en het potje blijft in de kamer', gelijk && !opStaatVan(fien) && !opStaatVan(daan));
      check('de staat van het paar heeft dat potje niet', !staatHeeft(fien, fid, id) && !staatHeeft(daan, fid, id));
      await geefOp(aanZet(fien, daan));
      await tel(3);
      for (const x of [fien, daan]) if (x.open()) { x.ev('closeModal()'); await wacht(); }
      tikTekst(fien, 'Revanche');
      await wacht();
      tikTekst(daan, 'Revanche');
      await tel(5);
      const id2 = fien.get('MP.gameId');
      check('het volgende potje staat aan beide kanten op de staat van het paar', opStaatVan(fien) && opStaatVan(daan) && id2 !== id);
      await speel(fien, daan, fien.get('MP.myColor') === 'w' ? 'e2e4' : 'e2e4');
      await tel(3);
      check('en de staat heeft dat potje met zijn zet', staatHeeft(fien, fid, id2) && fien.fen() === daan.fen());
    });
  }

  await regel('[2.5] W10 de gast nam de vriend terug net voor de start van de gastheer aankwam: hij volgt niet, het potje is voor allebei een potje in de kamer, en de staat van het paar kreeg het nooit', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Vrienden worden');
    await wacht();
    tikTekst(daan, 'Ja, vrienden');
    await tel(5);
    for (const x of [fien, daan]) if (x.open()) { x.ev('closeModal()'); await wacht(); }
    check('testopzet: allebei de vriend, met één geheim', !!geheimen(fien) && geheimen(fien) === geheimen(daan));
    const fid = daan.get('Object.keys(P.friends)[0]');
    /* bij Daan gaat de vriend weg op het moment dat de start van Fien binnenkomt */
    daan.ev('var __mms = mpMsg; mpMsg = function (m) { if (m && m.t === "start") { var f = P.friends[' + JSON.stringify(fid) + ']; setFriend(' + JSON.stringify(fid) + ', Object.assign({}, f, { weg: true })); MP.bewijzenP = null; } return __mms(m); }');
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Revanche');
    await tel(5);
    const id = fien.get('MP.gameId');
    check('testopzet: de revanche loopt aan beide kanten', fien.get('!!(session && !session.over)') && daan.get('!!(session && !session.over)') && daan.get('MP.gameId') === id);
    check('aan beide kanten een potje in de kamer', !opStaatVan(fien) && !opStaatVan(daan));
    let gelijk = true;
    for (const z of ['e2e4', 'e7e5', 'g1f3']) { await speel(fien, daan, z); await wacht(); gelijk = gelijk && fien.fen() === daan.fen() && !!fien.fen(); }
    check('de borden zijn bij elke zet gelijk', gelijk);
    check('de staat van het paar kreeg het potje nooit, en bij Fien wacht er niets voor', !staatHeeft(fien, fid, id) &&
      fien.get('paarVan(' + JSON.stringify(fid) + ').rij.filter(function (a) { return a.id === ' + JSON.stringify(id) + '; }).length') === 0);
  });

  /* een app van de vorige versie: zijn groet draagt geen toestand voor na het einde, en hij vraagt met een eigen bericht */
  function alsOudeApp(x) {
    x.ev('var __oud = mpSend; mpSend = function (m) { if (m && m.t === "hallo") { m = Object.assign({}, m); delete m.naEinde; delete m.sessie; delete m.vr; } return __oud(m); }');
  }
  await regel('[2.5] met een app die deze uitwisseling niet kent: geen Vrienden worden, wel de zin dat het kan als de ander de nieuwste SchaakHeld heeft', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    alsOudeApp(daan);
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    await geefOp(daan);
    await wacht();
    check('geen knop Vrienden worden', !kanTikken(fien, 'Vrienden worden'));
    check('de stille regel', /Vrienden worden kan als Daan de nieuwste SchaakHeld heeft\./.test(tekstVan(fien, 'eindkaart')));
  });

  await regel('[2.5] een vraag van een app die deze uitwisseling niet kent, krijgt geen antwoord: de strook zegt waarom, en niemand heeft een vriend', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    alsOudeApp(daan);
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    await speel(fien, daan, 'e7e5');
    await geefOp(daan);
    await wacht();
    fien.ev('globalThis.__antwoord = false; var __za = mpSend; mpSend = function (m) { if (m && m.t === "vriend") globalThis.__antwoord = true; return __za(m); }');
    daan.ev('mpSend({ t: "vriend?", pub: "' + 'A'.repeat(87) + '" })');
    await wacht();
    check('de strook van Fien', /Daan wil vrienden worden\. Dat kan als Daan de nieuwste SchaakHeld heeft\./.test(tekstVan(fien, 'bubble')));
    check('geen Ja en geen antwoord', !kanTikken(fien, 'Ja, vrienden') && !globalThis.__antwoord);
    check('niemand heeft een vriend', !geheimen(fien) && !geheimen(daan));
  });

  await regel('[4.1] valt de eigen lijn na het einde weg, dan zegt de strook dat; komt hij terug, dan de knoppen ook', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    geenNetwerk(fien);
    await wacht(3000);
    check('de strook zegt het, en er wacht niets op de ander', /Er is nu geen verbinding/.test(tekstVan(fien, 'bubble')) && !wachtKnoppen(fien));
    weerNetwerk(fien);
    await wacht(30000);
    check('terug: de knoppen weer', kanTikken(fien, 'Revanche') && kanTikken(fien, 'Vrienden worden') && !/geen verbinding/.test(tekstVan(fien, 'bubble')));
  });

  await regel('[4.1] na een eigen nieuwe verbinding wacht er pas weer iets op de ander als die zich meldt', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    geenNetwerk(fien);
    await wacht(3000);
    stopApparaat(daan);
    await wacht(3000);
    weerNetwerk(fien);
    await wacht(30000);
    check('de ander ging weg terwijl de eigen lijn weg was: geen knop die op hem wacht', !wachtKnoppen(fien));
  });

  await regel('[4.1] wat gevraagd was en een knop die wachtte, gaan terug als de ander weggaat en terugkomt', async function (check) {
    const { fien, daan } = await eindeTussenTwee();
    tikTekst(fien, 'Revanche');
    await wacht();
    check('testopzet: Fien wacht op revanche', !kanTikken(fien, 'Revanche'));
    geenNetwerk(daan);
    await wacht(3000);
    weerNetwerk(daan);
    await wacht(30000);
    check('terug: gewoon Revanche, niet meer wachten', kanTikken(fien, 'Revanche') && !/Wachten op/.test(knopTeksten(fien).join(' ')));
    tikTekst(fien, 'Vrienden worden');
    await wacht();
    check('testopzet: gevraagd', /Gevraagd/.test(tekstVan(fien, 'ekWacht')));
    fien.ev('naEindeTekenen()');
    check('opnieuw tekenen laat Vrienden worden weg zolang de vraag openstaat', !kanTikken(fien, 'Vrienden worden'));
    stopApparaat(daan);
    await wacht(3000);
    check('de ander ging weg: niets meer gevraagd', tekstVan(fien, 'ekWacht') === '' && !kanTikken(fien, 'Vrienden worden'));
    fire(fien.el('mpRev'), 'click', { target: fien.el('mpRev') });
    check('een tik op de verborgen Revanche wacht nergens op', !/Wachten/.test(fien.get('document.getElementById("mpRev").textContent')));
  });

  await regel('[4.3] na een eigen nieuwe verbinding in een potje zegt de strook dat de ander er niet is, als die weg was', async function (check) {
    const { wit, zwart } = await tweeZetten();
    stopApparaat(zwart);
    await wacht(3000);
    geenNetwerk(wit);
    await wacht(5000);
    weerNetwerk(wit);
    await wacht(30000);
    check('de strook', /er nu niet/.test(tekstVan(wit, 'bubble')) && !/Jij bent aan zet/.test(tekstVan(wit, 'bubble')));
  });

  await regel('[4.1] de verbinding geeft het op terwijl het venster voor een nieuw potje open is: het vervangen potje komt terug', async function (check) {
    const { fien, daan } = await eindeVoorDaan(false);
    await fien.ev('mpHostQR()');
    await wacht();
    geenNetwerk(fien);
    await wacht(5 * 60000);
    check('testopzet: de verbinding is weg', /De verbinding is weg/.test(fien.scherm()));
    weerNetwerk(fien);
    await wacht(60000);
    await daanZietKlaar(check, fien, daan);
  });

  await regel('[4.1] een potje dat niet te lezen is, blijft naast een lopend potje staan tot het kind kiest', async function (check) {
    const fien = maakApparaat('Fien'), sem = maakApparaat('Sem');
    await samenSpelen(fien, sem);
    await speel(fien, sem, 'e2e4');
    const d = opgeslagen(fien, SAMEN);
    d.games.mnopqrstuvwx = { gameId: 'mnopqrstuvwx', fid: null, room: 'kamer2abc', seat: 'stoel2abc', host: true, myColor: 'w', gameNo: 1,
      moves: ['e2e4', 'e2e4'], peerName: 'Lotte', result: null, offer: null, shown: false, updated: 1 };
    fien.opslag.setItem(SAMEN, JSON.stringify(d));
    await wacht(10000);
    await speel(fien, sem, 'e7e5');
    const d2 = opgeslagen(fien, SAMEN);
    check('na tien tellen en een zet staan ze er allebei', !!d2 && !!d2.games.mnopqrstuvwx && Object.keys(d2.games).length === 2);
    fien.tik('backBtn');
    await wacht();
    check('de kaart zegt het', /kan ik niet meer openen/.test(tekstVan(fien, 'verder')));
    tikTekst(fien, 'Weghalen');
    await wacht();
    const d3 = opgeslagen(fien, SAMEN);
    check('Weghalen haalt alleen dat potje weg', !!d3 && !d3.games.mnopqrstuvwx && Object.keys(d3.games).length === 1);
  });

  /* de eindkaart van een potje tussen kinderen zegt wat telde: de XP van het potje, en het weekdoel als dat meetelt */
  async function potjeMetDoel(doelFien, doelDaan, kort) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    if (doelFien) a.ev('setPref("weekGoal", ' + JSON.stringify(doelFien) + ')');
    if (doelDaan) b.ev('setPref("weekGoal", ' + JSON.stringify(doelDaan) + ')');
    await samenSpelen(a, b);
    for (const z of (kort ? ['e2e4', 'e7e5'] : ZETTEN22)) await speel(a, b, z);
    await geefOp(aanZet(a, b));
    await wacht();
    return { a, b };
  }
  await regel('[4.1] de eindkaart van een potje tussen kinderen: het weekdoel met vrienden gehaald, of alleen de XP van het potje', async function (check) {
    const { a, b } = await potjeMetDoel({ kind: 'vriend', n: 1 }, null, false);
    check('Fien haalde haar weekdoel', tekstVan(a, 'eindkaart').indexOf('+30 XP. Je weekdoel is gehaald: +60 XP! 🎯') >= 0);
    check('Daan heeft geen weekdoel met vrienden: alleen de XP van het potje', /\+30 XP/.test(tekstVan(b, 'eindkaart')) &&
      !/weekdoel/.test(tekstVan(b, 'eindkaart')) && !/geen XP/.test(tekstVan(b, 'eindkaart')));
  });

  await regel('[4.1] de eindkaart van een potje tussen kinderen: telt mee voor het weekdoel, of telt niet want te kort', async function (check) {
    const lang = await potjeMetDoel({ kind: 'vriend', n: 3 }, null, false);
    check('telt mee, het doel is nog niet gehaald', tekstVan(lang.a, 'eindkaart').indexOf('+30 XP. Telt mee voor je weekdoel. 🎯') >= 0 && !/gehaald/.test(tekstVan(lang.a, 'eindkaart')));
    const kort = await potjeMetDoel({ kind: 'vriend', n: 3 }, null, true);
    check('te kort: aan beide kanten', [kort.a, kort.b].every(function (x) { return /Dit potje telt niet mee: het was korter dan tien zetten\./.test(tekstVan(x, 'eindkaart')); }));
  });

  /* een potje tussen kinderen dat telt, geeft XP; vanaf het vierde op een dag met hetzelfde kind de helft */
  const SNEL_MAT = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const xpVan = function (x) { return x.get('P.xp'); };
  async function revanche(a, b) {
    tikTekst(a, 'Revanche');
    tikTekst(b, 'Revanche');
    await wacht();
  }
  await regel('[4.1] een potje tussen kinderen dat telt, geeft beide kinderen 30 XP: winst en verlies, remise, en te kort niets', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    let xa = xpVan(a), xb = xpVan(b);
    for (const z of SNEL_MAT) await speel(a, b, z);
    await wacht();
    check('mat: wie won en wie verloor, allebei 30', xpVan(a) === xa + 30 && xpVan(b) === xb + 30);
    check('de kaart zegt het op de plek van de XP', [a, b].every(function (x) { return /\+30 XP/.test(tekstVan(x, 'eindkaart')) && !/geen XP/.test(tekstVan(x, 'eindkaart')); }));
    await revanche(a, b);
    xa = xpVan(a); xb = xpVan(b);
    for (const z of ZETTEN22) await speel(a, b, z);
    const wit = aanZet(a, b), zwart = wit === a ? b : a;
    await biedRemise(wit);
    await wacht(500);
    tikTekst(zwart, 'Remise aannemen');
    await wacht(2000);
    check('remise na twintig halve zetten: allebei 30', eindziet(a, 'Gelijkspel') && xpVan(a) === xa + 30 && xpVan(b) === xb + 30);
    await revanche(a, b);
    xa = xpVan(a); xb = xpVan(b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    await geefOp(aanZet(a, b));
    await wacht();
    check('opgeven voor de twintigste halve zet: niets', xpVan(a) === xa && xpVan(b) === xb &&
      /Dit potje telt niet mee: het was korter dan tien zetten\./.test(tekstVan(a, 'eindkaart')));
  });

  await regel('[4.1] vanaf het vierde potje op een dag met hetzelfde kind 15 XP, met de zin; een ander kind en de volgende dag weer 30', async function (check) {
    zetDatum('2026-11-12T10:00:00');
    const a = maakApparaat('Fien'), b = maakApparaat('Daan'), c = maakApparaat('Lotte');
    await samenSpelen(a, b);
    const kregen = [], zin = /Jullie speelden vandaag al veel samen! Nu krijg je voor potjes met (Daan|Fien) nog 15 XP per potje\./;
    let eerderNergens = true;
    for (let i = 0; i < 4; i++) {
      if (i) await revanche(a, b);
      const xa = xpVan(a), xb = xpVan(b);
      for (const z of SNEL_MAT) await speel(a, b, z);
      await wacht();
      kregen.push((xpVan(a) - xa) + '/' + (xpVan(b) - xb));
      if (i < 3) eerderNergens = eerderNergens && [a, b].every(function (x) { return !zin.test(tekstVan(x, 'eindkaart')) && !zin.test(tekstVan(x, 'bubble')); });
    }
    check('drie keer 30, dan 15 (' + kregen.join(', ') + ')', kregen.join() === '30/30,30/30,30/30,15/15');
    check('in de eerste drie potjes nergens de zin over 15 XP', eerderNergens);
    check('bij het vierde: de zin in de strook, niet op de kaart, en +15 XP op de kaart', [a, b].every(function (x) {
      return zin.test(tekstVan(x, 'bubble')) && !zin.test(tekstVan(x, 'eindkaart')) && /\+15 XP/.test(tekstVan(x, 'eindkaart'));
    }));
    a.ev('if (MP) mpStop(); goHome()');
    await wacht();
    await samenSpelen(a, c);
    let xa = xpVan(a);
    for (const z of SNEL_MAT) await speel(a, c, z);
    await wacht();
    check('met een ander kind: 30', xpVan(a) === xa + 30);
    a.ev('if (MP) mpStop(); goHome()');
    b.ev('if (MP) mpStop(); goHome()');
    await wacht();
    zetDatum('2026-11-13T10:00:00');
    await samenSpelen(a, b);
    xa = xpVan(a);
    for (const z of SNEL_MAT) await speel(a, b, z);
    await wacht();
    check('de volgende dag met hetzelfde kind: weer 30', xpVan(a) === xa + 30);
  });

  await regel('[4.1] worden twee kinderen vrienden op de eindkaart van het derde potje, dan geeft het vierde die dag 15 XP', async function (check) {
    zetDatum('2026-11-12T10:00:00');
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const kregen = [];
    for (let i = 0; i < 4; i++) {
      if (i) await revanche(a, b);
      const xa = xpVan(a), xb = xpVan(b);
      for (const z of SNEL_MAT) await speel(a, b, z);
      await wacht();
      kregen.push((xpVan(a) - xa) + '/' + (xpVan(b) - xb));
      if (i === 2) {
        tikTekst(a, 'Vrienden worden');
        await wacht(2000);
        tikTekst(b, 'Ja, vrienden');
        await wacht(3000);
        check('testopzet: vrienden na het derde potje', !!geheimen(a) && geheimen(a) === geheimen(b));
      }
    }
    check('drie keer 30, dan 15 (' + kregen.join(', ') + ')', kregen.join() === '30/30,30/30,30/30,15/15');
  });

  await regel('[4.1] een vriend die midden in het vierde potje van de dag bewaard wordt, verandert niet hoe dat potje telt, ook niet na een herlading: 15 XP', async function (check) {
    zetDatum('2026-11-12T10:00:00');
    let a = maakApparaat('Fien');
    const b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const kregen = [];
    for (let i = 0; i < 4; i++) {
      if (i === 3) {
        /* Fien wil revanche, Daan vraagt, Fien zegt ja; wat Daan daarna stuurt, komt bij Fien pas als het vierde potje loopt */
        tikTekst(a, 'Revanche');
        await wacht();
        tikTekst(b, 'Vrienden worden');
        await wacht();
        a.ev('globalThis.__houdX = []; var __mmx = mpMsg; globalThis.__losX = function () { var h = globalThis.__houdX; globalThis.__houdX = null; h.forEach(function (m) { __mmx(m); }); }; mpMsg = function (m) { if (globalThis.__houdX && m && m.t === "hallo") { globalThis.__houdX.push(m); return; } return __mmx(m); }');
        tikTekst(a, 'Ja, vrienden');
        await tel(3);
        tikTekst(b, 'Revanche');
        await tel(3);
        globalThis.__losX();
        await tel(3);
        check('testopzet: Fien bewaarde de vriend midden in het vierde potje', !!geheimen(a) && geheimen(a) === geheimen(b) && a.get('!!(session && !session.over)'));
        /* en Fien laadt opnieuw voor het potje uit is */
        a = await terugInPotje(a);
        check('testopzet: Fien is terug in het vierde potje', a.get('!!(session && session.online && !session.over)'));
      } else if (i) await revanche(a, b);
      const xa = xpVan(a), xb = xpVan(b);
      for (const z of SNEL_MAT) await speel(a, b, z);
      await wacht();
      kregen.push((xpVan(a) - xa) + '/' + (xpVan(b) - xb));
    }
    check('drie keer 30, dan 15 (' + kregen.join(', ') + ')', kregen.join() === '30/30,30/30,30/30,15/15');
  });

  await regel('[4.1] een einde dat een kind pas later bij Verder ziet, geeft één keer XP, geteld bij hetzelfde kind: het vierde potje van de dag geeft 15', async function (check) {
    zetDatum('2026-11-12T10:00:00');
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    for (let i = 0; i < 3; i++) {
      if (i) await revanche(a, b);
      for (const z of SNEL_MAT) await speel(a, b, z);
      await wacht();
    }
    await revanche(a, b);
    for (const z of ZETTEN22) await speel(a, b, z);
    const op = aanZet(a, b), ander = op === a ? b : a, kamer = ander.get('MP.room');
    const xp = xpVan(ander);
    /* het kind is thuis als de ander opgeeft, en daarna is de kamer weg: het einde komt uit het bewaarde potje */
    ander.tik('backBtn');
    await wacht();
    await geefOp(op);
    await wacht(3000);
    stopApparaat(op);
    stopApparaat(ander);
    delete __server.wsrooms[kamer];
    const ander2 = herlaad(ander);
    await wacht(30000);
    check('testopzet: de kaart zegt dat het potje klaar is', kanTikken(ander2, 'Bekijk'));
    tikTekst(ander2, 'Bekijk');
    await wacht();
    check('het einde later gezien: 15 XP, want het is het vierde potje van de dag met dit kind', xpVan(ander2) === xp + 15);
    tikTekst(ander2, 'Naar huis');
    await wacht();
    const ander3 = herlaad(ander2);
    await wacht(30000);
    check('nog eens laden geeft niets erbij', xpVan(ander3) === xp + 15);
  });

  await regel('[3.10] compat: een profiel van de vorige versie houdt zijn XP, krijgt er niets bij door te laden, en zijn dagteller werkt met potjes tussen kinderen', async function (check) {
    const a0 = maakApparaat('Fien'), b = maakApparaat('Daan');
    const vandaag = a0.get('todayStr()');
    const oud = { v: 2, epoch: 0, cnt: { xp: { d1: 500, d2: 20 }, stars: { d1: 40 } }, set: { badges: { winst: true } },
      lww: { name: { v: 'Fien', t: 1 } }, max: { best: 6 },
      loc: { streak: 2, lastLevel: 1, day: { date: vandaag, wins: 1, stars: 5, done: {}, allDone: false, winsByLvl: { 1: 2, 2: 0, 3: 0 } } } };
    a0.opslag.setItem('schaakheld1', JSON.stringify(oud));
    const a = herlaad(a0);
    await wacht();
    check('na laden precies de XP van de vorige versie', a.get('P.xp') === 520);
    await samenSpelen(a, b);
    for (const z of SNEL_MAT) await speel(a, b, z);
    await wacht();
    check('het eerste potje met Daan geeft 30, en de dagteller van Turbo blijft', a.get('P.xp') === 550 && a.get('P.day.winsByLvl[1]') === 2);
  });

  const doelBijHetEinde = [
    ['een weekdoel met vrienden', { kind: 'vriend', n: 1 }, 0, '+30 XP. Je weekdoel is gehaald: +60 XP! 🎯'],
    ['een weekdoel van een andere soort, dat net vol is van het andere apparaat', { kind: 'opdr', n: 10 }, 10, '+30 XP. Je weekdoel is gehaald: +60 XP! 🎯']
  ];
  for (const geval of doelBijHetEinde) {
    await regel('[4.1] ' + geval[0] + ', gehaald bij het einde van een potje tussen kinderen: de regel zegt het doel en zijn punten, en de kaart heeft geen tegel', async function (check) {
      const a = maakApparaat('Fien'), b = maakApparaat('Daan');
      a.ev('setPref("weekGoal", ' + JSON.stringify(geval[1]) + ')');
      if (geval[2]) a.ev('bump("wk." + curWeek() + ".opdr", ' + geval[2] + ')');
      await samenSpelen(a, b);
      for (const z of ZETTEN22) await speel(a, b, z);
      const xp = a.get('P.xp');
      check('testopzet: het doel was nog niet gehaald', !a.get('goalDoneWeek(curWeek())'));
      await geefOp(aanZet(a, b));
      await wacht();
      const kaart = tekstVan(a, 'eindkaart');
      check('de regel: ' + geval[3], kaart.indexOf(geval[3]) >= 0);
      check('geen regel die zegt dat er geen XP is', !/geen XP/.test(kaart));
      check('geen tegel Weekdoel gehaald op de kaart', !/Weekdoel gehaald/.test(a.get('document.getElementById("eindkaart").innerHTML')));
      check('de punten één keer: 30 voor het potje en 60 voor het doel', a.get('P.xp') === xp + 90);
    });
  }

  await regel('[4.1] een tweede potje nadat het weekdoel met vrienden gehaald is, zegt niet nog eens dat het nu gehaald is', async function (check) {
    const { a, b } = await potjeMetDoel({ kind: 'vriend', n: 1 }, null, false);
    check('testopzet: het eerste potje haalde het doel', /Je weekdoel is gehaald/.test(tekstVan(a, 'eindkaart')));
    const xp = a.get('P.xp');
    tikTekst(a, 'Revanche');
    tikTekst(b, 'Revanche');
    await wacht();
    for (const z of ZETTEN22) await speel(a, b, z);
    await geefOp(aanZet(a, b));
    await wacht();
    check('testopzet: het tweede potje is klaar en telde', a.get('session.S.hist.length') >= 22 &&
      /JIJ WINT|wint dit potje/.test(tekstVan(a, 'eindkaart')) && !/korter dan tien zetten/.test(tekstVan(a, 'eindkaart')));
    check('niet nog eens gehaald, en alleen de 30 van het potje', !/gehaald/.test(tekstVan(a, 'eindkaart')) && a.get('P.xp') === xp + 30);
  });

  await regel('[4.1] met een weekdoel van een andere soort zegt de eindkaart van een potje tussen kinderen niet dat het meetelt', async function (check) {
    const { a } = await potjeMetDoel({ kind: 'opdr', n: 10 }, null, false);
    const kaart = tekstVan(a, 'eindkaart');
    check('testopzet: het potje is klaar en telde', /JIJ WINT|wint dit potje/.test(kaart) && !/korter dan tien zetten/.test(kaart));
    check('geen Telt mee voor je weekdoel', !/Telt mee voor je weekdoel/.test(kaart));
  });

  await regel('[4.2] Pauze uit een potje met een ander kind gaat naar Spelen, waar de kaart het potje toont, ook als het van Vrienden kwam', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    a.tik('tabVrienden');
    await wacht();
    await samenSpelen(a, b);
    a.tik('backBtn');
    await wacht();
    check('geen vriend: op Spelen, met het potje op de kaart', zichtbaar(a, 'view-spelen') && /je potje met Daan/.test(tekstVan(a, 'verder')));
    const c = maakApparaat('Mila'), d = maakApparaat('Sem');
    const fid = await wordenVrienden(c, d);
    c.ev('if (MP) mpStop(true); goHome("vrienden")');
    d.ev('if (MP) mpStop(true); goHome()');
    await wacht();
    await nodigUit(c);
    await d.ev('friendPoll()');
    await wacht();
    d.tik('invJa');
    await wacht();
    c.tik('mpGo');
    await wacht();
    check('testopzet: een potje tussen vrienden', c.get('!!(session && session.online && MP && MP.viaFriend)'));
    c.tik('backBtn');
    await wacht();
    check('vriend: ook op Spelen, met het potje op de kaart', zichtbaar(c, 'view-spelen') && /je potje met Sem/.test(tekstVan(c, 'verder')));
  });

  await regel('[4.6] wie uitnodigt, leest dat de uitnodiging klaarstaat, zonder te zeggen dat de app van de ander dicht is', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    check('het venster', /Je uitnodiging staat klaar voor Daan\. Zeg het gerust even!/.test(fien.scherm()) && !/zodra de app open gaat/.test(fien.scherm()));
    check('de rij', /Wachten op Daan…/.test(tekstVan(fien, 'friendList')) && !/SchaakHeld opent/.test(tekstVan(fien, 'friendList')));
  });

  await regel('[4.4] is de kamer weg, dan zien beiden hetzelfde einde en telt het voor niemand', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const kamer = a.get('MP.room');
    const tellers = function (x) { return JSON.stringify(x.get('[P.c.gamesPlayed, P.c.winsOnline, P.xp, P.wins, P.stars]')); };
    const ta = tellers(a), tb = tellers(b);
    stopApparaat(a);
    stopApparaat(b);
    delete __server.wsrooms[kamer];
    const a2 = herlaad(a), b2 = herlaad(b);
    await wacht();
    a2.tik('verderKaart');
    b2.tik('verderKaart');
    await wacht(30000);
    check('allebei: het potje is gestopt', /gestopt/.test(zegt(a2)) && /gestopt/.test(zegt(b2)));
    check('allebei: het telt voor niemand mee', /telt voor niemand mee/.test(zegt(a2)) && /telt voor niemand mee/.test(zegt(b2)));
    check('aan geen kant een teller veranderd', tellers(a2) === ta && tellers(b2) === tb);
    check('en het is aan geen kant meer bewaard', opgeslagen(a2, SAMEN) === null && opgeslagen(b2, SAMEN) === null);
  });

  /* Alleen het antwoord van de server dat de kamer weg is, maakt een eind aan
     het potje. Geen netwerk is iets anders: dan blijft het staan. */
  const tellersVan = function (x) { return JSON.stringify(x.get('[P.c.gamesPlayed, P.c.winsOnline, P.xp, P.wins, P.stars]')); };
  async function terugInHetPotje(check, x, ander, zet) {
    weerNetwerk(x);
    if (!x.open() && opSpeelscherm(x)) { x.tik('backBtn'); await wacht(); }
    x.tik('verderKaart');
    await wacht(30000);
    const zette = await speel(x, ander, zet);
    check('met netwerk weer verder in hetzelfde potje', !!zette && x.fen() === ander.fen() && x.get('session.S.hist.length') === 3);
  }

  /* hetzelfde einde als een verdwenen kamer, maar nu moest de kamer
     plaatsmaken op een volle server; de server geeft hetzelfde antwoord */
  await regel('[4.4] Alles wissen haalt ook de kaart van een gestopt vriendenpotje weg', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const kamer = a.get('MP.room');
    a.tik('backBtn');
    await wacht();
    delete __server.wsrooms[kamer];
    geenNetwerk(a);
    await wacht(3000);
    weerNetwerk(a);
    await wacht(30000);
    check('testopzet: de kaart zegt dat het potje gestopt is', /is gestopt/.test(tekstVan(a, 'verder')));
    a.tik('setBtn');
    await wacht();
    a.tik('setReset');
    await wacht();
    a.tik('rstGo');
    await wacht();
    check('na Alles wissen geen kaart van dat potje meer', a.get('samenWeg') === null && !/is gestopt/.test(tekstVan(a, 'verder')));
  });

  await regel('[4.4] moest de kamer plaatsmaken op een volle server, dan zien beiden hetzelfde einde', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const kamer = a.get('MP.room');
    const ta = tellersVan(a), tb = tellersVan(b);
    stopApparaat(a);
    stopApparaat(b);
    await wacht();
    const klok = __server.klok, vuller = [], lijnen = [];
    try {
      /* een minuut later: de kamer is ouder dan de drie seconden waarin een
         kamer van net nooit plaatsmaakt. Andere kinderen maken kamers en
         zitten erin, tot de server vol is. */
      __server.klok += 60000;
      for (let i = 0; i < 2 * MAX_KAMERS && (kamer in __server.wsrooms); i++) {
        const r = await fetch('https://test.local/v1/room', { method: 'POST' });
        if (r.status !== 200) break;
        const k = await r.json();
        vuller.push(k.room);
        const ws = new WebSocket('wss://test.local/v1/room/ws');
        ws.onopen = function () { ws.send(JSON.stringify({ room: k.room, seat: k.seat })); };
        lijnen.push(ws);
        await wacht(0);
      }
      check('testopzet: de kamer moest plaatsmaken', !(kamer in __server.wsrooms));
      const a2 = herlaad(a), b2 = herlaad(b);
      await wacht();
      a2.tik('verderKaart');
      b2.tik('verderKaart');
      await wacht(30000);
      check('allebei: het potje is gestopt', /gestopt/.test(zegt(a2)) && /gestopt/.test(zegt(b2)));
      check('allebei: het telt voor niemand mee', /telt voor niemand mee/.test(zegt(a2)) && /telt voor niemand mee/.test(zegt(b2)));
      check('aan geen kant een teller veranderd', tellersVan(a2) === ta && tellersVan(b2) === tb);
    } finally {
      lijnen.forEach(function (ws) { ws.close(); });
      vuller.forEach(function (id) { delete __server.wsrooms[id]; });
      __server.klok = klok;
    }
  });

  await regel('[4.4] valt het netwerk weg tijdens het potje, dan blijft het potje staan en gaat het daarna verder', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const ta = tellersVan(a), tb = tellersVan(b);
    geenNetwerk(a);
    await wacht(5 * 60000);
    const r = samenPotje(a);
    check('het potje staat nog bewaard, met beide zetten', !!r && Array.isArray(r.moves) && r.moves.length === 2);
    check('het potje is niet afgelopen', !a.get('!!(session && session.over)') && !/telt niet mee|gestopt/.test(zegt(a)));
    check('geen teller veranderd', tellersVan(a) === ta && tellersVan(b) === tb);
    await terugInHetPotje(check, a, b, 'g1f3');
  });

  await regel('[4.4] wie de app opent zonder netwerk, houdt het vriendenpotje; de kaart zegt dat er nu geen verbinding is', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const ta = tellersVan(a);
    stopApparaat(a);
    a.netwerk.uit = true;
    const a2 = herlaad(a);
    await wacht(5 * 60000);
    const r = samenPotje(a2);
    check('het potje staat nog bewaard, met beide zetten', !!r && Array.isArray(r.moves) && r.moves.length === 2);
    check('de kaart noemt het potje en zegt dat er nu geen verbinding is', zichtbaar(a2, 'verder') &&
      /Daan/.test(tekstVan(a2, 'verder')) && /geen verbinding/i.test(tekstVan(a2, 'verder')));
    check('geen einde en geen teller veranderd', !/telt niet mee|gestopt/.test(zegt(a2)) && tellersVan(a2) === ta);
    await terugInHetPotje(check, a2, b, 'g1f3');
  });

  const kapotSamen = [
    ['kapotte tekst', 'kapot{'],
    ['zonder stoel', JSON.stringify({ room: 'kamer1', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'], peerName: 'Daan', updated: 1 })],
    ['een potje in de kaart zonder stoel', JSON.stringify({ v: 1, games: { abcdefghijkl: { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc',
      host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'], peerName: 'Daan', result: null, updated: 1 } } })]
,
    ['een uitslag die niet kan', JSON.stringify({ v: 1, games: { abcdefghijkl: { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc', seat: 'stoel1abc',
      host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'], peerName: 'Daan', result: { kind: 'weg', by: 'w', ply: 1 }, updated: 1 } } })],
    ['een zet die niet kan', JSON.stringify({ v: 1, games: { abcdefghijkl: { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc', seat: 'stoel1abc',
      host: true, myColor: 'w', gameNo: 1, moves: ['e2e4', 'e2e4'], peerName: 'Daan', result: null, updated: 1 } } })]
  ];
  for (const geval of kapotSamen) {
    await regel('[4.1] een vriendenpotje dat niet te lezen is (' + geval[0] + ') wordt getoond, en pas het kind haalt het weg', async function (check) {
      const o = maakOpslag();
      o.setItem(SAMEN, geval[1]);
      const a = maakApparaat('Fien', { opslag: o });
      await wacht();
      check('de Verder-kaart zegt het', zichtbaar(a, 'verder') && tekstVan(a, 'verder').indexOf('kan ik niet meer openen') >= 0);
      const b = herlaad(a);
      await wacht();
      check('na herladen staat het er nog, onveranderd', b.opslag.getItem(SAMEN) === geval[1]);
      tikTekst(b, 'Weghalen');
      await wacht();
      check('pas "Weghalen" haalt het weg', b.opslag.getItem(SAMEN) === null);
    });
  }

  await regel('[4.5] een uitnodiging tijdens een potje komt op de Verder-kaart, vóór het potje tegen Turbo', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    daan.ev('setPref("predict", false); setPref("guard", false)');
    await startPotje(daan, 1);
    await zetEnWacht(daan, 'e2e4');
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    check('tijdens het potje geen venster', !daan.open() && opSpeelscherm(daan));
    daan.tik('backBtn');
    await wacht();
    const t = tekstVan(daan, 'verder');
    check('na Pauze op de kaart', /Fien/.test(t));
    check('vóór het potje tegen Turbo', t.indexOf('Turbo') > t.indexOf('Fien') && t.indexOf('Fien') >= 0);
  });

  /* D38: een uitnodiging op de Verder-kaart heeft beide antwoorden in de kaart */
  async function uitnodigingTijdensPotje() {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    daan.ev('setPref("predict", false); setPref("guard", false)');
    await startPotje(daan, 1);
    await zetEnWacht(daan, 'e2e4');
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('backBtn');
    await wacht();
    return { fien, daan };
  }
  await regel('[4.5] een uitnodiging op de Verder-kaart heeft Nu niet en Ja, spelen! in de kaart; Ja begint het potje', async function (check) {
    const { fien, daan } = await uitnodigingTijdensPotje();
    check('testopzet: de kaart noemt Fien', /Fien wil spelen/.test(tekstVan(daan, 'verder')));
    check('beide antwoorden in de kaart', kanTikken(daan, 'Nu niet') && kanTikken(daan, 'Ja, spelen!') && !daan.open());
    tikTekst(daan, 'Ja, spelen!');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    check('samen in een potje', fien.get('!!(session && session.online && MP && MP.S)') && daan.get('!!(session && session.online && MP && MP.S)'));
    check('het potje tegen Turbo staat nog bewaard', !!turboPotje(daan, 1));
  });

  await regel('[4.5] Nu niet op de Verder-kaart bereikt wie uitnodigde, en de kaart toont weer het potje tegen Turbo', async function (check) {
    const { fien, daan } = await uitnodigingTijdensPotje();
    tikTekst(daan, 'Nu niet');
    check('Fien leest het', await zagOoit(function () { return /Daan kan nu even niet/.test(zegt(fien)); }, 30000));
    check('de kaart toont het potje tegen Turbo', /Verder: je potje tegen/.test(tekstVan(daan, 'verder')) && !/Fien wil spelen/.test(tekstVan(daan, 'verder')));
  });

  /* de uitnodiging op de kaart: terugnemen, de minuten, en naast een lopend vriendenpotje */
  async function semNodigtUitTijdensTurbo() {
    const fien = maakApparaat('Fien'), sem = maakApparaat('Sem');
    await wordenVrienden(fien, sem);
    fien.ev('setPref("predict", false); setPref("guard", false)');
    await startPotje(fien, 1);
    await zetEnWacht(fien, 'e2e4');
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    return { fien, sem };
  }
  await regel('[4.5] een uitnodiging die de vriend terugnam, gaat van de kaart zodra het lezen van de bus dat ziet', async function (check) {
    const { fien, sem } = await semNodigtUitTijdensTurbo();
    check('testopzet: de uitnodiging wacht', fien.get('!!uitnodigingWacht'));
    tikTekst(sem, 'Stop met wachten');
    await wacht(20000);
    fien.tik('backBtn');
    await wacht();
    check('thuis geen uitnodiging op de kaart en geen venster', !/Sem wil spelen/.test(tekstVan(fien, 'verder')) && !fien.open());
  });

  await regel('[4.5] kan de bus niet gelezen worden, dan blijft de uitnodiging staan tot het lezen weer lukt', async function (check) {
    const { fien, sem } = await semNodigtUitTijdensTurbo();
    geenNetwerk(fien);
    tikTekst(sem, 'Stop met wachten');
    await wacht(20000);
    fien.tik('backBtn');
    await wacht();
    check('zonder netwerk blijft ze op de kaart', /Sem wil spelen/.test(tekstVan(fien, 'verder')));
    weerNetwerk(fien);
    await wacht(20000);
    check('zodra het lezen lukt, is ze weg', !/Sem wil spelen/.test(tekstVan(fien, 'verder')) && !fien.open());
  });

  await regel('[4.5] de minuten op de kaart tellen af, en na tien minuten is de uitnodiging weg', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const { fien } = await semNodigtUitTijdensTurbo();
    fien.tik('backBtn');
    await wacht();
    check('testopzet: nog 10 minuten', /De uitnodiging is nog 10 minuten geldig\./.test(tekstVan(fien, 'verder')));
    await wacht(5 * 60000);
    check('na vijf minuten: nog 5 minuten', /De uitnodiging is nog 5 minuten geldig\./.test(tekstVan(fien, 'verder')));
    await wacht(4 * 60000 + 30000);
    check('in de laatste minuut: nog 1 minuut', /De uitnodiging is nog 1 minuut geldig\./.test(tekstVan(fien, 'verder')));
    await wacht(60000);
    check('na tien minuten is ze weg', !/wil spelen/.test(tekstVan(fien, 'verder')) && !fien.open());
  });

  await regel('[4.5] een uitnodiging naast een lopend vriendenpotje: de zin dat het potje nog loopt heeft Nu niet, en wie uitnodigde hoort het meteen', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), sem = maakApparaat('Sem');
    await wordenVrienden(fien, sem);
    fien.ev('if (MP) mpStop(true); goHome()');
    sem.ev('if (MP) mpStop(true); goHome()');
    await wacht();
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    /* Daan is aan zet: dan is de uitnodiging de kaart, wat de kleur van Fien ook is */
    if (fien.get('MP.myColor') === 'b') await speel(fien, daan, 'e7e5');
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    fien.tik('backBtn');
    await wacht();
    check('testopzet: de kaart is de uitnodiging van Sem, met het potje met Daan eronder', /Sem wil spelen/.test(tekstVan(fien, 'verder')) &&
      /je potje met Daan/.test(tekstVan(fien, 'verder')) && kanTikken(fien, 'Ja, spelen!'));
    tikTekst(fien, 'Ja, spelen!');
    await wacht();
    check('de zin, met Nu niet en het kruisje', /Je potje met Daan loopt nog\. Speel dat eerst uit\./.test(fien.scherm()) && kanTikken(fien, 'Nu niet') &&
      zichtbaar(fien, 'mClose'));
    fien.tik('mClose');
    await wacht(3000);
    check('het kruisje sluit alleen: de uitnodiging staat er nog, en Sem wacht nog', /Sem wil spelen/.test(tekstVan(fien, 'verder')) &&
      !/kan nu even niet/.test(zegt(sem)));
    tikTekst(fien, 'Ja, spelen!');
    await wacht();
    tikTekst(fien, 'Nu niet');
    check('Sem hoort het meteen', await zagOoit(function () { return /Fien kan nu even niet/.test(zegt(sem)); }, 30000));
    check('de uitnodiging is van de kaart, het potje met Daan loopt nog', !/Sem wil spelen/.test(tekstVan(fien, 'verder')) && fien.get('samenLoopt()'));
  });

  await regel('[4.5] een uitnodiging die niet op de kaart past, komt als venster zodra het kind thuis is', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), lotte = maakApparaat('Lotte'), sem = maakApparaat('Sem');
    await wordenVrienden(fien, sem);
    fien.ev('if (MP) mpStop(true); goHome()');
    sem.ev('if (MP) mpStop(true); goHome()');
    await wacht();
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    fien.tik('backBtn');
    await wacht();
    await geefOp(daan);
    await wacht(3000);
    await samenSpelen(fien, lotte);
    await speel(fien, lotte, 'e2e4');
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    check('testopzet: de uitnodiging wacht', fien.get('!!uitnodigingWacht'));
    fien.tik('backBtn');
    await wacht();
    check('testopzet: de kaart toont het einde met Daan en een regel Ook nog, niet de uitnodiging',
      /Je potje met Daan is klaar/.test(tekstVan(fien, 'verder')) && !/Sem wil spelen/.test(tekstVan(fien, 'verder')));
    check('de uitnodiging komt als venster', /Sem wil een potje spelen!/.test(fien.scherm()) && kanTikken(fien, 'Nu niet'));
  });

  async function lotteLooptSemNodigtUit(metKapotPotje) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), lotte = maakApparaat('Lotte'), sem = maakApparaat('Sem');
    await wordenVrienden(fien, sem);
    fien.ev('if (MP) mpStop(true); goHome()');
    sem.ev('if (MP) mpStop(true); goHome()');
    await wacht();
    if (metKapotPotje) fien.ev('localStorage.setItem(POTJE_KEY, "{dit is geen potje")');
    else {
      await samenSpelen(fien, daan);
      await speel(fien, daan, 'e2e4');
      fien.tik('backBtn');
      await wacht();
      await geefOp(daan);
      await wacht(3000);
    }
    await samenSpelen(fien, lotte);
    await speel(fien, lotte, 'e2e4');
    await nodigUit(sem);
    await fien.ev('friendPoll()');
    await wacht();
    fien.tik('backBtn');
    await wacht();
    return { fien, sem };
  }
  for (const kapot of [false, true]) {
    await regel('[4.5] een uitnodiging naast een lopend vriendenpotje die niet op de kaart past' + (kapot ? ', naast een potje dat niet te lezen is' : '') +
      ': één venster met de zin dat het potje nog loopt, en Nu niet laat het de vriend meteen weten', async function (check) {
      const { fien, sem } = await lotteLooptSemNodigtUit(kapot);
      if (kapot) check('testopzet: de kaart zegt dat een potje niet te lezen is', /kan ik niet meer openen/.test(tekstVan(fien, 'verder')));
      check('het venster: wie uitnodigt en dat het potje met Lotte nog loopt', /Sem wil een potje spelen!/.test(fien.scherm()) &&
        /Je potje met Lotte loopt nog\. Speel dat eerst uit\./.test(fien.scherm()));
      check('Nu niet en het kruisje, geen Ja dat alleen naar die zin leidt', kanTikken(fien, 'Nu niet') && zichtbaar(fien, 'mClose') && !kanTikken(fien, 'Ja, spelen'));
      tikTekst(fien, 'Nu niet');
      check('Sem hoort het meteen', await zagOoit(function () { return /Fien kan nu even niet/.test(zegt(sem)); }, 30000));
    });
  }

  await regel('[4.5] een uitnodiging verloopt ook zonder netwerk na haar tien minuten', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const { fien } = await semNodigtUitTijdensTurbo();
    geenNetwerk(fien);
    fien.tik('backBtn');
    await wacht();
    check('testopzet: op de kaart', /Sem wil spelen/.test(tekstVan(fien, 'verder')));
    await wacht(10 * 60000 + 30000);
    check('na tien minuten weg, ook zonder netwerk', !/wil spelen/.test(tekstVan(fien, 'verder')));
  });

  await regel('[4.5] een fout van de server bij het lezen van de bus laat de uitnodiging staan', async function (check) {
    const { fien, sem } = await semNodigtUitTijdensTurbo();
    const echt = fetch;
    fetch = function (url, o) {
      if (/\/v1\/bus\/check/.test(url)) return Promise.resolve({ status: 500, json: function () { return Promise.resolve({}); } });
      return echt(url, o);
    };
    try {
      tikTekst(sem, 'Stop met wachten');
      await wacht(20000);
      fien.tik('backBtn');
      await wacht();
      check('de uitnodiging staat er nog', /Sem wil spelen/.test(tekstVan(fien, 'verder')));
    } finally { fetch = echt; }
    await wacht(20000);
    check('zodra het lezen lukt, is ze weg', !/Sem wil spelen/.test(tekstVan(fien, 'verder')));
  });

  await regel('[4.5] vastgelopen in ronde 0 bestaat niet meer: wie herlaadt, zit zonder nieuwe uitnodiging weer in hetzelfde potje, en dezelfde vriend nog eens uitnodigen opent dat potje', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fid = await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    check('testopzet: samen in een potje', fien.get('!!(session && session.online)') && daan.get('!!(session && session.online)'));
    await speel(fien, daan, 'e2e4');
    const naE4 = daan.fen();
    check('testopzet: e2e4 staat op beide borden', fien.fen() === naE4 && naE4 !== toFEN(newGame()));
    const fien2 = herlaad(fien);
    await wacht(30000);
    fien2.tik('verderKaart');
    await wacht();
    check('weer samen in hetzelfde potje, zonder nieuwe uitnodiging en zonder dat Daan eerst weg moest', fien2.get('!!(session && session.online)') &&
      daan.get('!!(session && session.online)') && fien2.fen() === naE4 && daan.fen() === naE4);
    fien2.tik('backBtn');
    await wacht();
    fien2.tik('tabVrienden');
    await wacht();
    check('de rij van Daan biedt het potje, geen Uitnodigen', (kanTikken(fien2, 'Jij bent aan zet') || kanTikken(fien2, 'Bekijk')) && !kanTikken(fien2, 'Uitnodigen'));
    fien2.ev('inviteFriend(' + JSON.stringify(fid) + ')');
    await wacht(100);
    check('Daan nog eens uitnodigen opent het potje dat loopt', opSpeelscherm(fien2) && fien2.fen() === naE4);
  });

  await regel('[4.6] "Nu niet" op een uitnodiging bereikt wie uitnodigde', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    check('testopzet: Daan krijgt de vraag', kanTikken(daan, 'Nu niet'));
    tikTekst(daan, 'Nu niet');
    /* het antwoord gaat versleuteld via de bus: in stapjes wachten, zodat dat werk ook af kan */
    check('Fien leest het', await zagOoit(function () { return /Daan kan nu even niet/.test(zegt(fien)); }, 30000));
  });

  /* "Nu niet" is nooit een uitnodiging: niet als wie uitnodigde al stopte, niet op een tweede apparaat, niet op de release */
  await regel('[4.6] "Nu niet" nadat wie uitnodigde al stopte met wachten: geen uitnodiging', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    check('testopzet: Daan krijgt de vraag', kanTikken(daan, 'Nu niet'));
    tikTekst(fien, 'Stop met wachten');
    await wacht();
    tikTekst(daan, 'Nu niet');
    await wacht(3000);
    await fien.ev('friendPoll()');
    check('Fien leest geen uitnodiging', !(await zagOoit(function () { return /wil een potje spelen/.test(zegt(fien)); }, 20000)));
  });

  await regel('[4.6] "Nu niet": het tweede apparaat van wie uitnodigde leest geen uitnodiging', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    const tablet = maakApparaat(null);
    await fien.ev('ensureAccount(); syncNow()');
    await wacht();
    tablet.ev('finishLink(' + fien.get('JSON.stringify(ACC)') + ', null)');
    await wacht();
    check('testopzet: de tablet kent Daan', tablet.get('Object.keys(P.friends).length') === 1);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    tikTekst(daan, 'Nu niet');
    await wacht(3000);
    await tablet.ev('friendPoll()');
    check('de tablet leest geen uitnodiging', !(await zagOoit(function () { return /wil een potje spelen/.test(zegt(tablet)); }, 20000)));
  });

  await regel('[4.6] het briefje "Nu niet" heeft geen kamer en geen stoel die een app van de release zou lezen, en is even lang als een uitnodiging', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    const fid = fien.get('Object.keys(P.friends)[0]');
    const blobs = function () { return Object.keys(__server.buses).map(function (b) { return __server.buses[b].blob; }); };
    const voor = blobs();
    await nodigUit(fien);
    const uitnodiging = blobs().filter(function (x) { return voor.indexOf(x) < 0; })[0];
    await daan.ev('friendPoll()');
    await wacht();
    tikTekst(daan, 'Nu niet');
    await wacht(3000);
    const briefjes = blobs().filter(function (x) { return x !== uitnodiging && voor.indexOf(x) < 0; });
    check('testopzet: een uitnodiging en een briefje op de server', !!uitnodiging && briefjes.length === 1);
    if (!briefjes.length) return;
    const nee = await fien.ev('openJSON(P.friends[' + JSON.stringify(fid) + '].k, "uitnodiging", b64urlBytes(' + JSON.stringify(briefjes[0]) + '))');
    /* zo leest de release een briefje: geldigeUitnodiging van de release */
    const releaseLeest = function (inv) {
      return !!inv && typeof inv === 'object' && typeof inv.id === 'string' && inv.id.length <= 24 &&
        /^[A-Za-z0-9_-]{8,64}$/.test(String(inv.room)) && /^[A-Za-z0-9_-]{8,64}$/.test(String(inv.seat)) &&
        isFinite(+inv.ts) && Date.now() - +inv.ts < 15 * 60000;
    };
    check('de release ziet er geen uitnodiging in', !!nee && nee.nee === true && !releaseLeest(nee));
    check('even lang als de uitnodiging', briefjes[0].length === uitnodiging.length);
  });

  await regel('[4.1] de kaart van een gestopt potje hoort bij dat potje: een nieuw potje met die vriend haalt hem weg, en Bekijk haalt nooit een ander potje weg', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    fien.tik('backBtn');
    daan.tik('backBtn');
    await wacht();
    const kamer = fien.get('MP.room');
    stopApparaat(fien);
    stopApparaat(daan);
    delete __server.wsrooms[kamer];
    const fien2 = herlaad(fien), daan2 = herlaad(daan);
    await wacht(30000);
    check('testopzet: de kaart zegt dat het potje gestopt is', /is gestopt/.test(tekstVan(fien2, 'verder')));
    await samenSpelen(fien2, daan2);
    await speel(fien2, daan2, 'd2d4');
    fien2.tik('backBtn');
    await wacht();
    check('het nieuwe potje staat op de kaart, niet het oude', /Verder: je potje met Daan/.test(tekstVan(fien2, 'verder')) && !/is gestopt/.test(tekstVan(fien2, 'verder')));
    check('en het nieuwe potje staat bewaard', !!samenPotje(fien2) && samenPotje(fien2).moves.length === 1);
  });

  await regel('[4.1] de kaart van een gestopt potje en een nieuw potje met een ander: Bekijk laat het nieuwe potje staan', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan'), lotte = maakApparaat('Lotte');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    fien.tik('backBtn');
    daan.tik('backBtn');
    await wacht();
    const kamer = fien.get('MP.room');
    stopApparaat(fien);
    stopApparaat(daan);
    delete __server.wsrooms[kamer];
    const fien2 = herlaad(fien);
    await wacht(30000);
    check('testopzet: de kaart zegt dat het potje met Daan gestopt is', /is gestopt/.test(tekstVan(fien2, 'verder')));
    await samenSpelen(fien2, lotte);
    await speel(fien2, lotte, 'd2d4');
    fien2.tik('backBtn');
    await wacht();
    const nieuw = samenPotje(fien2);
    check('testopzet: het potje met Lotte staat bewaard', !!nieuw && nieuw.peerName === 'Lotte');
    tikTekst(fien2, 'Bekijk');
    await wacht();
    check('Bekijk liet het potje met Lotte staan', !!samenPotje(fien2) && samenPotje(fien2).gameId === nieuw.gameId);
  });

  await regel('[4.1] na een vriendenpotje met zwart staan de letters en cijfers weer goed bij Turbo en bij een oefening', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const zwart = aanZet(a, b) === a ? b : a;
    check('testopzet: zwart ziet h tot a', /^h/.test(tekstVan(zwart, 'coordsF').trim()));
    zwart.tik('backBtn');
    await wacht();
    zwart.ev('setPref("predict", false); setPref("guard", false)');
    await startPotje(zwart, 1);
    const f = tekstVan(zwart, 'coordsF').replace(/\s/g, ''), r = tekstVan(zwart, 'coordsR').replace(/\s/g, '');
    check('tegen Turbo: a links en 1 onderaan', f === 'abcdefgh' && r === '87654321');
    zwart.tik('backBtn');
    await wacht();
    await startOefening(zwart, 'scan');
    check('in een oefening ook', tekstVan(zwart, 'coordsF').replace(/\s/g, '') === 'abcdefgh');
  });

  await regel('[4.1] "Alles wissen" tijdens een vriendenpotje: de vraag zegt dat het opgeven is, en de ander wint', async function (check) {
    const { op, ander } = await langPotje();
    op.tik('backBtn');
    await wacht();
    op.ev('confirmReset()');
    await wacht();
    check('de vraag noemt het potje', new RegExp('Dan geef je ook je potje met ' + ander.naam + ' op\\.').test(op.scherm()));
    tikTekst(op, 'Ja, wis alles');
    await wacht(5000);
    check('de ander krijgt de eindkaart van een opgave', eindziet(ander, 'WINT') && /geeft op/.test(tekstVan(ander, 'eindkaart')));
  });

  await regel('[4.1] uitnodigen terwijl er een vriendenpotje bewaard staat: de uitnodiging aan een andere vriend gaat uit, en het potje blijft', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fid = await wordenVrienden(fien, daan);
    await samenSpelen(fien, daan);
    /* de rij van Daan heeft nu Speel verder; een andere vriend nodigt Fien uit */
    fien.ev('setFriend("vriendsemsem1", { naam: "Sem", k: "sleutelsleutelsleutelsleutelsleutelsem", since: Date.now(), host: true, weg: false })');
    fien.tik('backBtn');
    await wacht();
    fien.tik('tabVrienden');
    tikTekst(fien, 'Uitnodigen');
    await wacht(100);
    check('de uitnodiging aan Sem gaat uit', fien.ziet('Wachten op Sem') && !/loopt nog/.test(toastTekst(fien)));
    check('het potje met Daan blijft bewaard', !!vriendenpotjeMet(fien, fid));
  });

  await regel('[4.1] een vriendenpotje dat niet bewaard kan worden: geen ✔ bewaard, en de strook zegt het', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const wit = aanZet(a, b), zwart = wit === a ? b : a;
    check('testopzet: ✔ bewaard en ‹ Pauze in een vriendenpotje', /‹ Pauze/.test(tekstVan(wit, 'backBtn')));
    wit.opslag.setItem = function () { throw new Error('vol'); };
    zet(wit, 'e2e4');
    await wacht();
    check('geen ✔ bewaard', !/✔ bewaard/.test(tekstVan(wit, 'bewaard')) || !zichtbaar(wit, 'bewaard'));
    check('de strook zegt het', /Dit potje kon ik niet bewaren\. Laat de app open, dan kunnen jullie verder\./.test(tekstVan(wit, 'bubble')));
  });

  /* wat een kapotte bouw liet passeren (de mutaties van de review) */
  /* regel 4.2: een remise-aanbod dat komt terwijl het kind thuis is, wacht; het antwoord staat onder het bord */
  await regel('[4.2] een remise-aanbod terwijl het kind thuis is, wacht: de kaart zegt het, en Antwoord opent het potje met de vraag onder het bord', async function (check) {
    const { wit, zwart } = await tweeZetten();
    zwart.tik('backBtn');
    await wacht();
    await biedRemise(wit);
    await wacht();
    const t = tekstVan(zwart, 'verder');
    check('thuis geen venster', opThuis(zwart) && !zwart.open());
    check('de kaart zegt het, met Antwoord', new RegExp(wit.naam + ' biedt remise aan').test(t) && /Remise is gelijkspel: niemand wint, niemand verliest\./.test(t) &&
      /Antwoord/.test(t));
    check('geen regel onder de kaart', !/blijft vandaag staan/.test(t));
    zwart.tik('verderKaart');
    await wacht();
    check('het potje, met de vraag in de strook en het antwoord onder het bord, zonder venster over het bord', opSpeelscherm(zwart) && !zwart.open() &&
      /biedt remise aan/.test(tekstVan(zwart, 'bubble')) && kanTikken(zwart, 'Remise aannemen') && kanTikken(zwart, 'Nee, doorspelen'));
    tikTekst(zwart, 'Nee, doorspelen');
    await wacht();
    check('nee: de vraag is weg en wit hoort het', !kanTikken(zwart, 'Remise aannemen') && /wil doorspelen/.test(tekstVan(wit, 'bubble')));
  });

  await regel('[4.2] Remise aannemen onder het bord is remise voor allebei', async function (check) {
    const { wit, zwart } = await tweeZetten();
    await biedRemise(wit);
    await wacht();
    check('testopzet: het antwoord staat onder het bord, zonder venster', kanTikken(zwart, 'Remise aannemen') && !zwart.open());
    check('Remise aannemen en Nee, doorspelen zijn allebei gewone knoppen', zwart.get('actionBtns.rmJa.className') === 'btn plain' &&
      zwart.get('actionBtns.rmNee.className') === 'btn plain');
    tikTekst(zwart, 'Remise aannemen');
    await wacht();
    check('remise aan beide kanten', eindziet(wit, 'Gelijkspel') && eindziet(zwart, 'Gelijkspel'));
  });

  /* regel 4.12 met D38: de rij van een vriend toont het ene lopende potje */
  await regel('[4.12] de rij van een vriend toont het lopende potje: wie aan zet is, en de knop opent het', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    check('testopzet: samen in een potje tussen vrienden', fien.get('!!(MP && MP.viaFriend && MP.S && !MP.over)') && daan.get('!!(MP && MP.viaFriend && MP.S)'));
    const wit = aanZet(fien, daan), zwart = wit === fien ? daan : fien;
    for (const x of [wit, zwart]) { x.tik('backBtn'); await wacht(); x.tik('tabVrienden'); await wacht(); }
    const rij = function (x) { return x.doc.__tekst(x.el('friendList')); };
    check('wit leest dat het aan zet is, met de knop Jij bent aan zet', /Jij bent aan zet\./.test(rij(wit)) && kanTikken(wit, 'Jij bent aan zet') && !/Uitnodigen/.test(rij(wit)));
    check('zwart leest wie aan zet is en sinds wanneer, met Bekijk', new RegExp(wit.naam + ' is aan zet · vandaag').test(rij(zwart)) &&
      kanTikken(zwart, 'Bekijk') && !/Uitnodigen/.test(rij(zwart)));
    tikTekst(wit, 'Jij bent aan zet');
    await wacht();
    check('de knop opent het potje', opSpeelscherm(wit) && aanDeBeurt(wit));
    await speel(wit, zwart, 'e2e4');
    check('na de zet van wit leest zwart op Vrienden dat wit zette en dat het aan zet is', new RegExp(wit.naam + ' heeft gezet\\.').test(rij(zwart)) &&
      kanTikken(zwart, 'Jij bent aan zet'));
  });

  await regel('[4.2] een zet van de ander terwijl het kind thuis is: meteen bewaard, en de kaart zegt wie aan zet is', async function (check) {
    const { wit, zwart } = await tweeZetten();
    zwart.tik('backBtn');
    await wacht();
    await speel(wit, zwart, 'g1f3');
    check('testopzet: wit zette', wit.get('MP.S.hist.length') === 3);
    check('bij zwart meteen bewaard', samenPotje(zwart).moves.length === 3);
    check('en de kaart zegt dat zwart aan zet is', /Jij bent aan zet/.test(tekstVan(zwart, 'verder')));
  });

  await regel('[4.2] Verder op een open lijn haalt een gemiste zet op', async function (check) {
    const { wit, zwart } = await tweeZetten();
    zwart.tik('backBtn');
    await wacht();
    zwart.ev('(function () { var w = MP.ws, o = w.onmessage; w.onmessage = function (ev) { if (/"t":"zet"/.test(ev.data)) { w.onmessage = o; return; } o(ev); }; })()');
    await speel(wit, zwart, 'g1f3');
    check('testopzet: zwart mist de zet', zwart.get('MP.S.hist.length') === 2 && zwart.get('MP.open') === true);
    zwart.tik('verderKaart');
    await wacht();
    check('na Verder dezelfde stand, en zwart aan zet', zwart.fen() === wit.fen() && aanDeBeurt(zwart));
  });

  /* een stand van de ander zoals de app hem stuurt, met wat de test erin verandert */
  const standVan = function (x, anders) {
    return x.get('JSON.stringify(Object.assign({ t: "sync", id: MP.gameId, gameNo: MP.gameNo, jij: MP.myColor, result: null, offer: null,' +
      'moves: MP.S.hist.map(function (u) { return { from: u.m.from, to: u.m.to, promo: u.m.promo || null }; }) }, ' + JSON.stringify(anders || {}) + '))');
  };
  /* witte openingszetten zoals een stand ze draagt; twee keer dezelfde is een lijst die niet kan */
  const zetVan = function (x, sleutels) {
    return x.get('(function () { return ' + JSON.stringify(sleutels) + '.map(function (k) { var m = legalMoves(newGame()).find(function (z) { return moveKey(z) === k; }); ' +
      'return { from: m.from, to: m.to, promo: null }; }); })()');
  };

  await regel('[4.1] een stand geeft alleen een einde dat de ander kan geven, in de stand waarin het viel', async function (check) {
    const { wit } = await tweeZetten();
    const mijn = wit.get('MP.myColor'), hun = mijn === 'w' ? 'b' : 'w';
    wit.ev('mpMsg(' + standVan(wit, { result: { kind: 'opgave', by: mijn, ply: 2 } }) + ')');
    await wacht();
    check('"jij gaf op" van de ander telt niet', wit.get('session.over') === false && wit.get('MP.result') === null);
    wit.ev('mpMsg(' + standVan(wit, { result: { kind: 'opgave', by: hun, ply: 1 } }) + ')');
    await wacht();
    check('een opgave bij een andere stand telt niet', wit.get('session.over') === false && wit.get('MP.result') === null);
    const anders = wit.get('(function () { var S = newGame(); ["d2d4", "d7d5"].forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); }); ' +
      'return S.hist.map(function (u) { return { from: u.m.from, to: u.m.to, promo: null }; }); })()');
    wit.ev('mpMsg(' + standVan(wit, { moves: anders, result: { kind: 'opgave', by: hun, ply: 2 } }) + ')');
    await wacht();
    check('een opgave aan het eind van andere zetten telt niet', wit.get('session.over') === false && wit.get('MP.result') === null);
    wit.ev('mpMsg({ t: "opgave", gameNo: MP.gameNo, ply: 99 })');
    await wacht();
    check('een opgave bij een zet die niet bestaat, geldt bij de stand van nu', wit.get('MP.result && MP.result.ply') === 2);
  });

  /* de ander gaat na het einde naar huis: de eindkaart houdt alleen Naar huis, en de strook zegt het */
  const vertrek = [
    ['voor een tik', null, 'Daan ging naar huis. Leuk dat jullie samen speelden!'],
    ['na Vrienden worden', 'Vrienden worden', 'Daan ging naar huis, dus vrienden worden lukt nu niet. Na een volgend potje kan het weer.'],
    ['na Revanche', 'Revanche', 'Daan ging naar huis, dus er komt nu geen revanche. Leuk dat jullie samen speelden!']
  ];
  for (const geval of vertrek) {
    await regel('[4.1] de ander gaat na het einde naar huis (' + geval[0] + '): de strook zegt het, en er is geen knop meer die op de ander wacht', async function (check) {
      const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
      await samenSpelen(fien, daan);
      for (const z of ZETTEN22) await speel(fien, daan, z);
      await geefOp(daan);
      await wacht();
      check('testopzet: Fien wint en kan nog vragen', eindziet(fien, 'WINT') && kanTikken(fien, 'Revanche') && kanTikken(fien, 'Vrienden worden'));
      if (geval[1]) { tikTekst(fien, geval[1]); await wacht(); }
      tikTekst(daan, 'Naar huis');
      await wacht(30000);
      check('de strook zegt het', tekstVan(fien, 'bubble').indexOf(geval[2]) >= 0);
      check('de eindkaart blijft, met alleen Naar huis', eindziet(fien, 'WINT') && !fien.open() && !kanTikken(fien, 'Revanche') &&
        !kanTikken(fien, 'Vrienden worden') && kanTikken(fien, 'Naar huis') && !/Gevraagd|Wachten/.test(tekstVan(fien, 'eindkaart')));
    });
  }

  await regel('[4.1] een vriend gaat na het einde naar huis: de strook zegt dat het kind die vriend later weer kan uitnodigen', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    await geefOp(daan);
    await wacht();
    tikTekst(fien, 'Revanche');
    await wacht();
    tikTekst(daan, 'Naar huis');
    await wacht(30000);
    check('de strook', tekstVan(fien, 'bubble').indexOf('Daan ging naar huis, dus er komt nu geen revanche. Nodig Daan later weer uit bij Vrienden.') >= 0);
    check('alleen Naar huis', !kanTikken(fien, 'Revanche') && kanTikken(fien, 'Naar huis'));
  });

  await regel('[4.1] Stoppen in het venster voor een nieuw potje laat een einde dat de ander nog moet horen niet vallen', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    for (const z of ZETTEN22) await speel(fien, daan, z);
    const voor = telt(daan);
    stopApparaat(daan);
    await wacht(3000);
    await geefOp(fien);
    tikTekst(fien, 'Naar huis');
    await wacht();
    await fien.ev('mpHostQR()');
    await wacht();
    check('testopzet: het venster voor een nieuw potje', kanTikken(fien, 'Stoppen'));
    tikTekst(fien, 'Stoppen');
    await wacht();
    check('Fien is weer verbonden met het potje met Daan', fien.get('!!(MP && MP.S && MP.result && MP.peerName === "Daan")'));
    const daan2 = herlaad(daan);
    await wacht(30000);
    check('Daan ziet dat het potje klaar is', /is klaar/.test(tekstVan(daan2, 'verder')));
    tikTekst(daan2, 'Bekijk');
    await wacht();
    check('en wint, één keer geteld', eindziet(daan2, 'WINT') && telt(daan2) === plusEen(voor, true));
  });

  await regel('[4.1] Weghalen haalt alleen het vriendenpotje weg dat niet te lezen is; een einde dat wacht, blijft en telt', async function (check) {
    const o = maakOpslag();
    const goed = { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc', seat: 'stoel1abc', host: true, myColor: 'w', gameNo: 1, moves: ZETTEN22,
      peerName: 'Daan', result: { kind: 'opgave', by: 'b', ply: 22 }, offer: null, shown: false, updated: 2 };
    const kapot = { gameId: 'mnopqrstuvwx', fid: null, room: 'kamer2abc', seat: 'stoel2abc', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4', 'e2e4'],
      peerName: 'Sem', result: null, offer: null, shown: false, updated: 1 };
    o.setItem(SAMEN, JSON.stringify({ v: 1, games: { abcdefghijkl: goed, mnopqrstuvwx: kapot } }));
    const a = maakApparaat('Fien', { opslag: o });
    await wacht(30000);
    const voor = telt(a);
    check('testopzet: de kaart zegt dat er een potje niet open kan, en noemt het einde', /kan ik niet meer openen/.test(tekstVan(a, 'verder')) &&
      /je potje met Daan/.test(tekstVan(a, 'verder')));
    tikTekst(a, 'Weghalen');
    await wacht();
    const d = opgeslagen(a, SAMEN);
    check('alleen het kapotte potje is weg', !!d && !!d.games.abcdefghijkl && !d.games.mnopqrstuvwx);
    check('de kaart zegt dat het potje met Daan klaar is', /Je potje met Daan is klaar/.test(tekstVan(a, 'verder')));
    tikTekst(a, 'Bekijk');
    await wacht();
    check('gewonnen, één keer geteld', eindziet(a, 'WINT') && telt(a) === plusEen(voor, true));
  });

  await regel('[4.1] een nieuw vriendenpotje haalt een potje weg dat niet te lezen is, zoals het venster zegt; een einde dat wacht, blijft', async function (check) {
    const o = maakOpslag();
    const goed = { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc', seat: 'stoel1abc', host: true, myColor: 'w', gameNo: 1, moves: ZETTEN22,
      peerName: 'Lotte', result: { kind: 'opgave', by: 'b', ply: 22 }, offer: null, shown: false, updated: 2 };
    const kapot = { gameId: 'mnopqrstuvwx', fid: null, room: 'kamer2abc', seat: 'stoel2abc', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'],
      peerName: 'Sem', result: { kind: 'weg', by: 'w', ply: 1 }, offer: null, shown: false, updated: 1 };
    o.setItem(SAMEN, JSON.stringify({ v: 1, games: { abcdefghijkl: goed, mnopqrstuvwx: kapot } }));
    const fien = maakApparaat('Fien', { opslag: o }), daan = maakApparaat('Daan');
    await wacht(30000);
    await fien.ev('mpHostQR()');
    await wacht();
    check('testopzet: het venster zegt dat een nieuw potje het weghaalt', /Een nieuw potje haalt het weg/.test(fien.scherm()));
    fien.ev('closeModal(); if (MP) mpStop(true)');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    const d = opgeslagen(fien, SAMEN);
    check('het onleesbare potje is weg, het einde met Lotte en het nieuwe potje staan er', !!d && !d.games.mnopqrstuvwx && !!d.games.abcdefghijkl &&
      Object.keys(d.games).length === 2);
  });

  await regel('[4.1] na het openen gaat de verbinding naar het potje dat loopt, niet naar een afgelopen potje ernaast', async function (check) {
    const o = maakOpslag();
    const af = { gameId: 'abcdefghijkl', fid: null, room: 'kamer1abc', seat: 'stoel1abc', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'],
      peerName: 'Daan', result: { kind: 'opgave', by: 'b', ply: 1 }, offer: null, shown: false, updated: 9 };
    const loopt = { gameId: 'mnopqrstuvwx', fid: null, room: 'kamer2abc', seat: 'stoel2abc', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4', 'e7e5'],
      peerName: 'Sem', result: null, offer: null, shown: false, updated: 1 };
    o.setItem(SAMEN, JSON.stringify({ v: 1, games: { abcdefghijkl: af, mnopqrstuvwx: loopt } }));
    const a = maakApparaat('Fien', { opslag: o });
    check('de verbinding is die van het lopende potje', a.get('MP && MP.gameId') === 'mnopqrstuvwx');
  });

  await regel('[4.1] een stand met een nieuwe zet en het einde samen geldt in één keer', async function (check) {
    const { wit, zwart } = await tweeZetten();
    geenNetwerk(wit);
    await wacht(3000);
    const stand = zwart.get('(function () { var S = newGame(); ["e2e4", "e7e5", "g1f3"].forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); });' +
      'return JSON.stringify({ t: "sync", id: MP.gameId, gameNo: MP.gameNo, jij: MP.myColor, result: { kind: "opgave", by: other(MP.myColor), ply: 3 }, offer: null,' +
      'moves: S.hist.map(function (u) { return { from: u.m.from, to: u.m.to, promo: null }; }) }); })()');
    zwart.ev('mpMsg(' + stand + ')');
    await wacht();
    check('de zet staat erin en het potje is uit', zwart.get('MP.S.hist.length') === 3 && zwart.get('session.over') === true && eindziet(zwart, 'WINT'));
  });

  await regel('[4.1] ja op remise zonder lijn, terwijl wie het aanbood al verder zette en de app opnieuw opende: remise, en die zet telt niet', async function (check) {
    const { op: wit, ander: zwart } = await langPotje();
    const zetten = wit.get('MP.S.hist.length');
    await biedRemise(wit);
    await wacht(500);
    check('testopzet: de vraag komt aan', /biedt remise aan/.test(zegt(zwart)));
    geenNetwerk(zwart);
    await wacht(3000);
    zet(wit, wit.get('moveKey(legalMoves(MP.S)[0])'));
    await wacht(2000);
    const wit2 = herlaad(wit);
    await wacht(5000);
    tikTekst(zwart, 'Remise aannemen');
    await wacht(2000);
    weerNetwerk(zwart);
    await wacht(60000);
    check('remise bij wie het aanbood, en de zet erna telt niet', wit2.get('!!(MP && MP.result && MP.result.kind === "remise")') && wit2.get('MP.S.hist.length') === zetten);
    check('remise bij wie ja zei', eindziet(zwart, 'Gelijkspel'));
  });

  await regel('[4.1] alleen de gastheer begint een nieuw potje; een gast die de start miste, begint vanuit de stand', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const host = a.get('MP.host') ? a : b, gast = host === a ? b : a, nr = host.get('MP.gameNo');
    host.ev('mpMsg(' + JSON.stringify({ t: 'sync', id: 'AAAAAAAAAAAB', gameNo: nr + 1, jij: 'w', moves: [], result: null, offer: null }) + ')');
    await wacht();
    check('een gast geeft de gastheer geen nieuw potje', host.get('MP.gameNo') === nr && host.get('MP.S.hist.length') === 1);
    telStanden(host);
    host.ev('mpMsg(' + JSON.stringify({ t: 'sync', id: 'AAAAAAAAAAAB', gameNo: nr - 1, jij: 'w', moves: [], result: null, offer: null }) + ')');
    await wacht();
    check('een stand van een ouder potje krijgt de stand van nu terug', standen(host) === 1);
    await geefOp(gast);
    gast.ev('mpMsg(' + JSON.stringify({ t: 'sync', id: 'AAAAAAAAAAAC', gameNo: nr + 1, jij: 'b', moves: zetVan(gast, ['d2d4', 'd2d4']), result: null, offer: null }) + ')');
    await wacht();
    check('een stand met een zet die niet kan, begint niets', gast.get('MP.gameNo') === nr && gast.get('MP.gameId') !== 'AAAAAAAAAAAC');
    gast.ev('mpMsg(' + JSON.stringify({ t: 'sync', id: 'AAAAAAAAAAAD', gameNo: nr + 1, jij: 'b', moves: zetVan(gast, ['d2d4']), result: null, offer: null }) + ')');
    await wacht();
    check('de gast begint het nieuwe potje vanuit de stand', gast.get('MP.gameNo') === nr + 1 && gast.get('MP.gameId') === 'AAAAAAAAAAAD' &&
      gast.get('MP.myColor') === 'b' && gast.get('MP.S.hist.length') === 1 && gast.get('!!session && session.S === MP.S && !session.over'));
  });

  await regel('[4.1] wie remise aanbood en herlaadt, houdt het aanbod: een ja is remise voor allebei', async function (check) {
    const { op: vraagt, ander: antwoordt } = await langPotje();
    const voorV = telt(vraagt), voorA = telt(antwoordt);
    await biedRemise(vraagt);
    await wacht(500);
    check('testopzet: de vraag komt aan', /biedt remise aan/.test(zegt(antwoordt)));
    const vraagt2 = herlaad(vraagt);
    await wacht(30000);
    vraagt2.tik('verderKaart');
    await wacht();
    tikTekst(antwoordt, 'Remise aannemen');
    await wacht(30000);
    check('remise aan beide kanten', eindziet(antwoordt, 'Gelijkspel') && eindziet(vraagt2, 'Gelijkspel'));
    check('één keer geteld', telt(vraagt2) === plusEen(voorV, false) && telt(antwoordt) === plusEen(voorA, false));
  });

  await regel('[4.1] remise die de ander aannam terwijl het kind thuis was: na herladen en Bekijk is er niets meer bewaard of verbonden', async function (check) {
    const { op: vraagt, ander: antwoordt } = await langPotje();
    await biedRemise(vraagt);
    await wacht(500);
    vraagt.tik('backBtn');
    await wacht();
    tikTekst(antwoordt, 'Remise aannemen');
    await wacht(3000);
    check('testopzet: thuis wacht het einde', /is klaar/.test(tekstVan(vraagt, 'verder')));
    tikTekst(antwoordt, 'Naar huis');
    await wacht(3000);
    check('testopzet: de ander is klaar en weg', !antwoordt.get('!!MP'));
    const vraagt2 = herlaad(vraagt);
    await wacht(30000);
    tikTekst(vraagt2, 'Bekijk');
    await wacht();
    check('remise', eindziet(vraagt2, 'Gelijkspel'));
    tikTekst(vraagt2, 'Naar huis');
    await wacht();
    check('niets meer bewaard of verbonden', opgeslagen(vraagt2, SAMEN) === null && !vraagt2.get('!!MP'));
  });

  await regel('[4.1] de ander gaf op terwijl het kind thuis was, en de kamer is daarna weg: het einde blijft, en Bekijk telt één keer', async function (check) {
    const { op, ander } = await langPotje();
    const voor = telt(ander), kamer = ander.get('MP.room');
    ander.tik('backBtn');
    await wacht();
    await geefOp(op);
    await wacht(3000);
    stopApparaat(op);
    stopApparaat(ander);
    delete __server.wsrooms[kamer];
    const ander2 = herlaad(ander);
    await wacht(30000);
    check('de kaart zegt dat het potje klaar is', /is klaar/.test(tekstVan(ander2, 'verder')));
    tikTekst(ander2, 'Bekijk');
    await wacht();
    check('gewonnen, één keer geteld', eindziet(ander2, 'WINT') && telt(ander2) === plusEen(voor, true));
  });

  await regel('[4.1] een "nee" op remise dat onderweg verloren ging, komt aan met de stand', async function (check) {
    const { wit, zwart } = await tweeZetten();
    await biedRemise(wit);
    await wacht(500);
    check('testopzet: de vraag komt aan', /biedt remise aan/.test(zegt(zwart)));
    geenNetwerk(wit);
    await wacht(3000);
    tikTekst(zwart, 'Nee, doorspelen');
    await wacht(2000);
    weerNetwerk(wit);
    const gehoord = await zagOoit(function () { return /wil doorspelen/.test(tekstVan(wit, 'bubble')); }, 60000);
    check('wit hoort het antwoord', gehoord && wit.get('MP.offer && MP.offer.answer') === 'nee');
  });

  await regel('[4.1] remise-vragen gelden in hun eigen stand, en een aanbod zonder antwoord mag nog eens', async function (check) {
    const { wit, zwart } = await tweeZetten();
    zwart.ev('mpMsg({ t: "remise?", gameNo: MP.gameNo, ply: 1 })');
    await wacht();
    check('een vraag voor een andere stand komt niet', !/biedt remise aan/.test(zegt(zwart)));
    await biedRemise(wit);
    await wacht(500);
    check('testopzet: de vraag komt aan', kanTikken(zwart, 'Remise aannemen'));
    await biedRemise(wit);
    await wacht(500);
    check('een tweede aanbod zonder antwoord gaat ook weg', /Je biedt \S+ remise aan\. \S+ kan ja zeggen of doorspelen\./.test(tekstVan(wit, 'bubble')) && !/net al/.test(tekstVan(wit, 'bubble')));
    zet(wit, 'g1f3');
    await wacht(2000);
    check('na de zet van wit is de vraag weg', !kanTikken(zwart, 'Remise aannemen'));
    zwart.ev('remiseJa()');
    await wacht(5000);
    check('en een ja dat toch nog komt, is geen remise', zwart.get('session.over') === false && wit.get('session.over') === false);
  });

  await regel('[4.1] wat de strook en het bord zeggen: ✔ bewaard na de zet van de ander, en een eigen zet zonder lijn', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const wit = aanZet(a, b), zwart = wit === a ? b : a;
    check('testopzet: bij zwart nog geen ✔ bewaard', !zichtbaar(zwart, 'bewaard'));
    await speel(a, b, 'e2e4');
    check('na de zet van wit staat bij zwart ✔ bewaard', zichtbaar(zwart, 'bewaard') && /✔ bewaard/.test(tekstVan(zwart, 'bewaard')));
    geenNetwerk(zwart);
    await wacht(3000);
    zet(zwart, 'e7e5');
    await wacht(1000);
    check('de strook zegt dat de ander de zet nog niet ziet', /Er is nu geen verbinding, dus .* ziet hem nog niet/.test(tekstVan(zwart, 'bubble')));
  });

  await regel('[4.1] een vriendenpotje dat niet bewaard kan worden: thuis belooft de kaart niet dat het blijft staan', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    const wit = aanZet(a, b);
    wit.opslag.setItem = function () { throw new Error('vol'); };
    zet(wit, 'e2e4');
    await wacht();
    wit.tik('backBtn');
    await wacht();
    check('testopzet: de kaart noemt het potje', /Verder: je potje met/.test(tekstVan(wit, 'verder')));
    check('en zegt niet dat het blijft staan', !/blijft vandaag staan/.test(tekstVan(wit, 'verder')));
  });

  await regel('[4.1] een revanche krijgt een nieuw potje-id', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const oud = samenPotje(a).gameId;
    await geefOp(aanZet(a, b));
    tikTekst(a, 'Revanche');
    tikTekst(b, 'Revanche');
    await wacht();
    const nieuw = samenPotje(a);
    check('een nieuw id, op beide apparaten hetzelfde', !!nieuw && nieuw.gameId !== oud && !!samenPotje(b) && samenPotje(b).gameId === nieuw.gameId);
  });

  await regel('[4.1] in een potje tussen vrienden staat de vriend in het bewaarde potje', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    const fid = await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    daan.tik('invJa');
    await wacht();
    fien.tik('mpGo');
    await wacht();
    check('testopzet: samen in een potje', !!samenPotje(fien) && !!samenPotje(daan));
    check('bij allebei het id van de vriend', samenPotje(fien).fid === fid && samenPotje(daan).fid === fid);
  });

  for (const [hoe, doe] of [['de ander is gestopt', 'mpMsg({ t: "weg" })'], ['een ander apparaat nam de stoel', 'mpMsg({ t: "stoel" })']]) {
    await regel('[4.1] ' + hoe + ': het bewaarde potje is weg', async function (check) {
      const { wit } = await tweeZetten();
      wit.ev(doe);
      await wacht();
      check('niet meer bewaard', samenPotje(wit) === null);
    });
  }

  await regel('[4.1] "Alles wissen" tijdens een vriendenpotje: het potje is daarna weg op dit apparaat', async function (check) {
    const { op } = await langPotje();
    op.tik('backBtn');
    await wacht();
    op.ev('confirmReset()');
    await wacht();
    tikTekst(op, 'Ja, wis alles');
    await wacht(5000);
    check('niet meer bewaard en geen verbinding', samenPotje(op) === null && !op.get('!!MP'));
  });

  /* een "Nu niet" telt alleen als antwoord op de uitnodiging die nu wacht, en alleen als het vers is */
  async function briefjeVoor(van, aan, velden) {
    await van.ev('(async function () { var f = P.friends[Object.keys(P.friends)[0]]; var to = await busFor(f, theirRole(f));' +
      'var blob = b64url(await sealJSON(f.k, "uitnodiging", vasteLengte(Object.assign({ id: b64url(randBytes(9)), nee: true, room: "", seat: "", ts: Date.now() }, ' +
      JSON.stringify(velden) + '))));' +
      'await fetch(SYNC_URL + "/v1/bus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bus: to.bus, bewijs: to.bewijs, blob: blob }) }); })()');
    await wacht(1000);
  }
  for (const [wat, velden] of [['een antwoord op een andere uitnodiging', { op: 'eenAndereUitnodiging' }], ['een oud antwoord', { oud: true }]]) {
    await regel('[4.6] ' + wat + ' telt niet als "Nu niet"', async function (check) {
      const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
      await wordenVrienden(fien, daan);
      await nodigUit(fien);
      const v = velden.oud ? { op: fien.get('INV.id'), ts: Date.now() - 11 * 60000 } : velden;
      await briefjeVoor(daan, fien, v);
      await fien.ev('friendPoll()');
      await wacht(2000);
      check('Fien wacht nog', fien.get('!!INV') && !/kan nu even niet/.test(zegt(fien)));
    });
  }

  await regel('[4.6] na "Nu niet" wacht wie uitnodigde niet meer, en heeft geen kamer meer open', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    tikTekst(daan, 'Nu niet');
    check('testopzet: Fien leest het', await zagOoit(function () { return /Daan kan nu even niet/.test(zegt(fien)); }, 30000));
    check('geen wachten en geen kamer meer', fien.get('INV') === null && !fien.get('!!MP'));
  });

  await regel('[4.7] beide verbonden kaarten zeggen wie het potje start', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await daan.ev('mpHostQR()');
    await wacht();
    scanQR(daan, fien);
    await wacht();
    fien.tik('mpJa');
    await wacht();
    check('bij Daan', /Jij start het potje\. Tik op Spelen!/.test(daan.scherm()));
    check('bij Fien', /Daan start het potje\. Even wachten\./.test(fien.scherm()));
  });

  await regel('[4.7] een vriendschapsvraag na een potje staat in de eindkaart van de ander, niet erachter', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await samenSpelen(daan, fien);
    await geefOp(aanZet(daan, fien));
    check('testopzet: allebei een eindkaart', /Vrienden worden/.test(zegt(daan)) && /Vrienden worden/.test(zegt(fien)));
    check('testopzet: nog geen vraag bij Fien', !/wil vrienden worden/.test(zegt(fien)));
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    check('Fien ziet de vraag van Daan in haar eindkaart, zonder venster erover', !fien.open() && zichtbaar(fien, 'eindkaart') &&
      /Daan wil vrienden worden/.test(tekstVan(fien, 'eindkaart')));
    /* "Ja" in de kaart maakt ze vrienden: de vraag staat er niet alleen, hij werkt ook */
    tikTekst(fien, 'Ja');
    await wacht();
    check('met Ja zijn ze vrienden, aan beide kanten', fien.get('Object.keys(P.friends).length') === 1 &&
      daan.get('Object.keys(P.friends).length') === 1);
  });

  await regel('[4.8] een apparaat koppelen met de vier woorden, getypt met spaties', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    /* de code is de eerste rij van vier lijstwoorden achter elkaar: een los
       lijstwoord in de zin eromheen ("vier", "tien") telt niet mee */
    const tekens = mees.scherm().toLowerCase().split(/[^a-z]+/).filter(Boolean);
    let woorden = [];
    for (let i = 0; i + 4 <= tekens.length && !woorden.length; i++) {
      const rij = tekens.slice(i, i + 4);
      if (rij.every(function (w) { return WOORDEN.indexOf(w) >= 0; })) woorden = rij;
    }
    check('testopzet: vier woorden op het scherm', woorden.length === 4);
    ipad.ev('linkEntryFlow()');
    await wacht();
    vulIn(ipad, ipad.el('wordInp'), woorden.join(' '));
    tikTekst(ipad, 'Koppel');
    await wacht();
    check('het profiel van Mees is gevonden', /Mees/.test(ipad.scherm()));
  });

  await regel('[4.9] de nep-server: een kamer met een potje leeft 12 uur stil, een lege kamer een kwartier', async function (check) {
    const klok = __server.klok;
    try {
      const a = maakApparaat('Fien'), b = maakApparaat('Daan');
      await samenSpelen(a, b);
      const kamer = a.get('MP.room');
      stopApparaat(a);
      stopApparaat(b);
      await wacht();
      const veeg = async function () { const x = maakApparaat('Sem'); await x.ev('mpHostQR()'); await wacht(); const r = x.get('MP.room'); stopApparaat(x); return r; };
      __server.klok += 2 * 3600000;
      const leeg = await veeg();
      check('na 2 uur stil staat de kamer met een potje er nog', kamer in __server.wsrooms);
      __server.klok += 16 * 60000;
      await veeg();
      check('een lege kamer is na een kwartier weg', !(leeg in __server.wsrooms));
      __server.klok += 10 * 3600000;
      await veeg();
      check('na ruim 12 uur stil is ook de kamer met een potje weg', !(kamer in __server.wsrooms));
    } finally { __server.klok = klok; }
  });

  /* zelfde grenzen als de Go-test van 4.10: na 9,5 minuten nog wel, na 10,5 niet meer */
  await regel('[4.10] de nep-server: een koppelcode werkt tien minuten, daarna niet meer', async function (check) {
    const klok = __server.klok;
    const post = function (pad, body) { return fetch('https://test.local' + pad, { method: 'POST', body: JSON.stringify(body) }); };
    try {
      await post('/v1/link', { code: 'orakel-een', payload: 'p1' });
      __server.klok += 9.5 * 60000;
      check('na 9,5 minuten werkt hij nog', (await post('/v1/link/redeem', { code: 'orakel-een' })).status === 200);
      await post('/v1/link', { code: 'orakel-twee', payload: 'p2' });
      __server.klok += 10.5 * 60000;
      check('na 10,5 minuten niet meer', (await post('/v1/link/redeem', { code: 'orakel-twee' })).status === 404);
    } finally { __server.klok = klok; }
  });
}
