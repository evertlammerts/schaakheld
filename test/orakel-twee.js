/* Orakel, tweeapparatentests: de regels van plan.md voor increment 4, die
   pas te zien zijn als beide kanten echt draaien. Elke testnaam begint met
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

  await regel('[2.5] na een vriendenpotje: lukt de vraag of het ja niet, dan staat dat in de strook en is de knop weer als eerst', async function (check) {
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
      check('de knop van Daan is weer als eerst', kanTikken(daan, 'Vrienden worden') && !/Gevraagd/.test(tekstVan(daan, 'eindkaart')));
      crypto.subtle.generateKey = echt;
      tikTekst(fien, 'Vrienden worden');
      await wacht();
      check('testopzet: Daan krijgt de vraag van Fien', kanTikken(daan, 'Ja'));
      crypto.subtle.generateKey = kapot;
      tikTekst(daan, 'Ja');
      await wacht();
      check('Daan leest in de strook dat het niet lukte', /Dat lukte niet/.test(tekstVan(daan, 'bubble')));
    } finally { crypto.subtle.generateKey = echt; }
  });

  /* D34: een sync telt als getoond wat van het andere apparaat kwam; wat hier verdiend is en wacht, blijft wachten */
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
    check('de kaart van het rondje toont het level en de trofee van de tablet', /Level Paard/.test(kaart) && /Sterrenregen/.test(kaart));
    check('en niet de trofee van de telefoon', !/Orakel/.test(kaart));
    tikTekst(tablet, 'Naar huis');
    await wacht();
    check('thuis het level', tablet.ziet('LEVEL OMHOOG'));
    tablet.tik('lvlOk');
    check('thuis geen trofee van de telefoon', !tablet.ziet('Orakel'));
    await tablet.ev('syncNow()');
    await wacht();
    await telefoon.ev('syncNow()');
    await wacht();
    telefoon = herlaad(telefoon);
    await wacht();
    check('de telefoon toont bij het openen zijn eigen Orakel', telefoon.ziet('Orakel'));
    check('en niet de Sterrenregen van de tablet', !telefoon.ziet('Sterrenregen'));
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

  /* D35: na elke verbinding en zodra de ander terug is, sturen beide kanten de hele stand van het potje (zetten,
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
    tikTekst(zwart, 'Nee');
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
    tikTekst(antwoordt, 'Ja, remise');
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
     het potje. Geen netwerk is iets anders: dan blijft het staan (D15). */
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

  await nogNiet('[4.5] een uitnodiging tijdens een potje komt op de Verder-kaart, vóór het potje tegen Turbo', async function (check) {
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

  await nogNiet('[4.5] vastgelopen in ronde 0: wie herlaadt en opnieuw uitnodigt, bereikt de ander die nog in het oude potje zit', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
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
    await wacht();
    await nodigUit(fien2);
    await daan.ev('friendPoll()');
    await wacht(30000);
    check('weer samen, zonder dat Daan eerst weg moest', fien2.get('!!(session && session.online)') &&
      daan.get('!!(session && session.online)'));
    check('in hetzelfde potje: de stand na e2e4, op beide borden', fien2.fen() === naE4 && daan.fen() === naE4);
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

  await regel('[4.1] uitnodigen terwijl er een vriendenpotje bewaard staat: de zin noemt de vriend', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await samenSpelen(fien, daan);
    fien.tik('backBtn');
    await wacht();
    fien.tik('tabVrienden');
    tikTekst(fien, 'Uitnodigen');
    await wacht(100);
    check('de zin', toastTekst(fien) === 'Je potje met Daan loopt nog. Speel dat eerst uit.');
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

  await regel('[2.5] vrienden worden lukt niet aan de kant die ja zegt: wie vroeg, hoort het en kan het nog eens vragen', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await samenSpelen(daan, fien);
    await geefOp(aanZet(daan, fien));
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    const echt = crypto.subtle.generateKey;
    try {
      crypto.subtle.generateKey = function () { return Promise.reject(new Error('geen sleutel')); };
      tikTekst(fien, 'Ja');
      await wacht();
    } finally { crypto.subtle.generateKey = echt; }
    await wacht();
    check('Daan hoort dat het niet lukte', /lukte niet/.test(tekstVan(daan, 'bubble')));
    check('en kan het nog eens vragen', kanTikken(daan, 'Vrienden worden') && !/Gevraagd/.test(tekstVan(daan, 'eindkaart')));
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
