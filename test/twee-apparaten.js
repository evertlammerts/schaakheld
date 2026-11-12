/* Twee apparaten, één wereld.

   De flowtests draaien één app en spelen de andere kant na met een rauwe
   socket. Alles wat pas misgaat als beide kanten écht draaien (allebei een
   uitnodiging open, allebei tegelijk op een knop, een vraag die achter een
   ander scherm in de wachtrij belandt) valt daar buiten. Hier krijgt elk
   apparaat zijn eigen DOM, opslag, adresbalk en app-globals; de nep-server,
   de relay en de klok zijn gedeeld, precies zoals twee telefoons op één
   server. De app-code is dezelfde: geen nabouw van het protocol.

   Draaien: test.sh (of jsc test/run-twee.js na een build van .tmp-ui.js). */

var fails = 0;
function ok(naam, cond) {
  if (!cond) fails++;
  print((cond ? 'PASS' : 'FAIL') + '  ' + naam);
}

/* maakApparaat(naam) staat in test/harnas.js, gedeeld met de flowsuite */

/* de wereld een stukje vooruit: timers en de microtaakwachtrij van beide
   apparaten, tot alles is uitgewerkt */
/* het einde van een potje staat in de eindkaart over het bord, niet in een venster */
function eindziet(app, tekst) {
  return app.get('$("eindkaart").classList.contains("hidden") ? "" : $("eindkaart").textContent').indexOf(tekst) >= 0;
}

async function tik(venster) {
  const tot = __klok + (venster == null ? 5000 : venster);
  for (let i = 0; i < 5; i++) {
    drainTot(400, tot);
    for (let j = 0; j < 40; j++) await null;
  }
}

/* een QR laten scannen: het fragment uit de QR van de host in de adresbalk
   van de gast, precies wat de camera-app doet */
function scanQR(host, gast) {
  const room = host.get('MP.room');
  const gastTok = __server.wsrooms[room].order[1];
  gast.location.hash = '#' + host.get('PLAY_PREFIX') + room + '.' + gastTok;
  gast.ev('checkPlayFragment()');
}

/* woorden intypen zoals een kind doet: woord in het vakje, dan Enter */
function typ(app, invId, woorden) {
  for (const w of woorden) {
    app.el(invId).value = w;
    fire(app.el(invId), 'keydown', { key: 'Enter' });
  }
}

/* wie aan zet is speelt de zet van het scriptje, via het bord */
async function speel(a, b, key) {
  const speler = a.get('!!(session && MP && session.S.turn === MP.myColor)') ? a :
    (b.get('!!(session && MP && session.S.turn === MP.myColor)') ? b : null);
  if (!speler) return null;
  const gelukt = speler.ev('(function () {' +
    'var m = legalMoves(session.S).find(function (x) { return moveKey(x) === ' + JSON.stringify(key) + '; });' +
    'if (!m) return false; onCell(m.from); onCell(m.to); return true; })()');
  await tik();
  return gelukt ? speler : null;
}

/* een potje opzetten tot beide kanten aan het bord zitten */
async function samenSpelen(a, b) {
  await a.ev('mpHostQR()');
  await tik();
  scanQR(a, b);
  await tik();
  b.tik('mpJa');
  await tik();
  a.tik('mpGo');
  await tik();
}

async function alles() {
  const evert = maakApparaat('Evert'), oscar = maakApparaat('Oscar');

  /* ---------- 1. samen spelen via een QR ---------- */
  await evert.ev('mpHostQR()');
  await tik();
  ok('qr: Evert heeft een kamer en wacht', evert.get('!!MP && MP.host === true') && evert.ziet('Samen spelen'));
  scanQR(evert, oscar);
  await tik();
  ok('qr: Oscar wordt gevraagd of hij meedoet', oscar.ziet('Meespelen'));
  oscar.tik('mpJa');
  await tik();
  ok('qr: Oscar ziet dezelfde drie plaatjes als Evert',
    oscar.ziet('Verbonden met Evert') && evert.ziet('Verbonden met Oscar') &&
    oscar.get('mpEmojiTrio(MP.room)') === evert.get('mpEmojiTrio(MP.room)'));
  ok('qr: alleen de host krijgt de startknop', evert.ziet('mpGo') && !oscar.ziet('mpGo'));
  evert.tik('mpGo');
  await tik();
  ok('qr: allebei een potje, tegengestelde kleuren en hetzelfde bord',
    evert.get('!!session && session.online') && oscar.get('!!session && session.online') &&
    evert.get('MP.myColor') !== oscar.get('MP.myColor') && evert.fen() === oscar.fen());
  ok('qr: alleen wit mag zetten',
    (evert.get('BD.mode') === 'move') !== (oscar.get('BD.mode') === 'move'));

  /* het herdersmat, om en om via het bord van de speler die aan zet is */
  const partij = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  let zetten = 0;
  for (const key of partij) {
    if (await speel(evert, oscar, key)) zetten++;
    if (evert.fen() !== oscar.fen()) break;
  }
  ok('potje: alle zeven zetten aangekomen op beide borden en gelijk gebleven',
    zetten === partij.length && evert.fen() === oscar.fen());
  const wit = evert.get('MP.myColor') === 'w' ? evert : oscar;
  const zwart = wit === evert ? oscar : evert;
  ok('potje: mat, de winnaar wint en de verliezer verliest',
    eindziet(wit, 'JIJ WINT') && eindziet(zwart, 'wint dit potje') &&
    wit.get('session.over') === true && zwart.get('session.over') === true);
  ok('potje: online winst telt apart, niet als winst op Turbo',
    wit.get('P.c.winsOnline') === 1 && wit.get('P.c.wins || 0') === 0);

  /* ---------- 2. allebei tegelijk vrienden worden ---------- */
  ok('vrienden: het eindscherm biedt het allebei aan',
    eindziet(evert, 'Vrienden worden') && eindziet(oscar, 'Vrienden worden'));
  evert.tik('mpVriend');
  oscar.tik('mpVriend');
  await tik();
  const eK = evert.get('Object.keys(P.friends)'), oK = oscar.get('Object.keys(P.friends)');
  ok('vrienden: precies één vriendschap aan beide kanten',
    eK.length === 1 && oK.length === 1 && eK[0] === oK[0]);
  ok('vrienden: hetzelfde geheim, en de rollen zijn tegengesteld',
    evert.get('P.friends[Object.keys(P.friends)[0]].k') === oscar.get('P.friends[Object.keys(P.friends)[0]].k') &&
    evert.get('P.friends[Object.keys(P.friends)[0]].host') !== oscar.get('P.friends[Object.keys(P.friends)[0]].host'));
  ok('vrienden: allebei dezelfde drie plaatjes en geen vraag meer open',
    evert.ziet('nu vrienden') && oscar.ziet('nu vrienden') &&
    evert.get('modalQueue.length') === 0 && oscar.get('modalQueue.length') === 0);
  const fid = eK[0];
  evert.tik('vrEind');
  oscar.tik('vrEind');
  await tik();
  ok('vrienden: allebei netjes thuis', !evert.get('!!MP') && !oscar.get('!!MP') &&
    !evert.get('!!session') && !oscar.get('!!session'));

  /* ---------- 3. uitnodigen en aannemen ---------- */
  await evert.ev('inviteFriend(' + JSON.stringify(fid) + ')');
  await tik();
  ok('uitnodigen: Evert wacht op Oscar', evert.get('!!INV') && evert.ziet('Wachten op Oscar'));
  await oscar.ev('friendPoll()');
  await tik();
  ok('uitnodigen: Oscar krijgt de vraag', oscar.ziet('wil een potje spelen'));
  oscar.tik('invJa');
  await tik();
  ok('uitnodigen: Evert ziet dat Oscar er is, en het briefje is opgeruimd',
    evert.ziet('Verbonden met Oscar') && evert.get('INV') === null &&
    Object.keys(__server.buses).length === 0);
  evert.tik('mpGo');
  await tik();
  ok('uitnodigen: potje op beide telefoons', evert.get('!!session && session.online') &&
    oscar.get('!!session && session.online') && evert.fen() === oscar.fen());
  const eersteZet = await speel(evert, oscar, 'e2e4');
  ok('uitnodigen: de eerste zet komt aan bij de ander', !!eersteZet && evert.fen() === oscar.fen());
  evert.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 4. al vrienden: geen tweede vriendschap ---------- */
  /* het bord van een vriendenpotje hoort bij de verbinding (MP.S); het speelscherm kijkt ernaar */
  await samenSpelen(evert, oscar);
  ok('herkennen: allebei herkennen ze elkaar aan het bewijs in het hallo',
    evert.get('MP.viaFriend') === fid && oscar.get('MP.viaFriend') === fid);
  evert.ev('session.S = MP.S = parseFEN("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"); renderBoard()');
  oscar.ev('session.S = MP.S = parseFEN("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"); renderBoard()');
  const witNu = evert.get('MP.myColor') === 'w' ? evert : oscar;
  witNu.ev('BD.mode = "move"');
  await speel(evert, oscar, 'a1a8');
  ok('herkennen: het eindscherm biedt geen tweede vriendschap aan',
    eindziet(evert, 'Revanche') && eindziet(oscar, 'Revanche') && !eindziet(evert, 'Vrienden worden') && !eindziet(oscar, 'Vrienden worden') &&
    evert.get('Object.keys(P.friends).length') === 1 && oscar.get('Object.keys(P.friends).length') === 1);
  evert.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 5. gekruiste uitnodigingen ---------- */
  __server.buses = {};
  evert.ev('seenInv = []');
  oscar.ev('seenInv = []');
  await evert.ev('inviteFriend(' + JSON.stringify(fid) + ')');
  await oscar.ev('inviteFriend(' + JSON.stringify(fid) + ')');
  await tik();
  ok('gekruist: allebei wachten ze eerst op de ander',
    evert.get('!!INV') && oscar.get('!!INV') && Object.keys(__server.buses).length === 2);
  await evert.ev('friendPoll()');
  await oscar.ev('friendPoll()');
  await tik();
  const vraagt = evert.ziet('wil een potje spelen') ? evert : (oscar.ziet('wil een potje spelen') ? oscar : null);
  ok('gekruist: precies één kant krijgt de vraag, de ander blijft wachten',
    !!vraagt && !(evert.ziet('wil een potje spelen') && oscar.ziet('wil een potje spelen')));
  if (vraagt) {
    const ander = vraagt === evert ? oscar : evert;
    vraagt.tik('invJa');
    await tik();
    ok('gekruist: ja = één potje, geen briefjes meer in de bus',
      ander.ziet('Verbonden met') && vraagt.get('!!MP') && ander.get('!!MP') &&
      vraagt.get('MP.room') === ander.get('MP.room') &&
      vraagt.get('INV') === null && ander.get('INV') === null &&
      Object.keys(__server.buses).length === 0);
    ander.tik('mpGo');
    await tik();
    ok('gekruist: en dan gewoon spelen', vraagt.get('!!session && session.online') &&
      ander.get('!!session && session.online') && vraagt.fen() === ander.fen());
    evert.ev('mpVerlaat()');
    oscar.ev('mpVerlaat()');
    await tik();
  }

  /* ---------- 6. herverbinden midden in een potje ---------- */
  await samenSpelen(evert, oscar);
  await speel(evert, oscar, 'e2e4');
  await speel(evert, oscar, 'e7e5');
  const fenVoor = evert.fen();
  oscar.ev('MP.ws.close()');
  await tik(20000);
  ok('herverbinden: Oscar is er weer en beide borden zijn gelijk',
    oscar.get('!!MP && MP.open') === true && evert.fen() === oscar.fen() && oscar.fen() === fenVoor);
  const naGat = await speel(evert, oscar, 'g1f3');
  ok('herverbinden: en het potje loopt gewoon door', !!naGat && evert.fen() === oscar.fen());

  /* ---------- 7. opgeven ---------- */
  const weekVoor = evert.get('wkGet(curWeek(), "online") || 0');
  const opgever = evert.get('BD.mode') === 'move' ? oscar : evert;
  const blijver = opgever === evert ? oscar : evert;
  opgever.ev('resignAsk()');
  opgever.tik('rsJa');
  await tik();
  ok('opgeven: de ander wint en beide kanten zijn klaar',
    eindziet(blijver, 'JIJ WINT') && opgever.get('session.over') === true &&
    blijver.get('session.over') === true);
  ok('opgeven: een kort potje telt niet mee voor de week',
    blijver.get('wkGet(curWeek(), "online") || 0') === weekVoor);

  evert.tik('mpEind');
  oscar.tik('mpEind');
  await tik();

  /* ---------- 8. revanche: kleuren wisselen, potje twee ---------- */
  await samenSpelen(evert, oscar);
  const witEen = evert.get('MP.myColor') === 'w' ? evert : oscar;
  witEen.ev('resignAsk()');
  witEen.tik('rsJa');
  await tik();
  evert.tik('mpRev');
  oscar.tik('mpRev');
  await tik();
  ok('revanche: allebei een vers potje met gewisselde kleuren',
    evert.get('session.S.hist.length') === 0 && oscar.get('session.S.hist.length') === 0 &&
    evert.get('MP.myColor') !== oscar.get('MP.myColor') &&
    (witEen.get('MP.myColor') === 'b') && evert.get('MP.gameNo') === 2 && oscar.get('MP.gameNo') === 2);
  ok('revanche: het bord staat aan beide kanten weer in de beginstand en niemand is over',
    evert.fen() === oscar.fen() && evert.get('session.over') === false && oscar.get('session.over') === false);
  const revZet = await speel(evert, oscar, 'd2d4');
  ok('revanche: en de eerste zet komt aan', !!revZet && evert.fen() === oscar.fen());

  /* ---------- 9. remise aanbieden, afwijzen en aannemen ---------- */
  const bieder = evert.get('BD.mode') === 'move' ? evert : oscar;
  const krijger = bieder === evert ? oscar : evert;
  bieder.ev('offerDraw()');
  await tik();
  ok('remise: de ander krijgt de vraag', krijger.ziet('biedt remise aan'));
  krijger.tik('rmNee');
  await tik();
  ok('remise: nee = doorspelen, allebei nog in het potje',
    evert.get('session.over') === false && oscar.get('session.over') === false && !krijger.open());
  bieder.ev('offerDraw()');
  await tik();
  ok('remise: te snel opnieuw vragen mag niet, en de vrager hoort waarom',
    !krijger.open() && bieder.el('bubble').innerHTML.indexOf('net al remise') >= 0);
  bieder.ev('session.drawAsked = null; offerDraw()');
  await tik();
  krijger.tik('rmJa');
  await tik();
  ok('remise: ja = gelijkspel op allebei de telefoons',
    evert.get('session.over') === true && oscar.get('session.over') === true &&
    eindziet(evert, 'Gelijkspel') && eindziet(oscar, 'Gelijkspel'));
  evert.tik('mpEind');
  oscar.tik('mpEind');
  await tik();

  /* ---------- 10. samen spelen met woordcodes ---------- */
  evert.ev('mpWordFlow()');
  oscar.ev('mpWordFlow()');
  await tik();
  /* de eigen woorden staan genummerd: "Jouw woorden: 1 wild 2 duizend" (regel 4.8) */
  const eigen = function (app) { const m = app.modal().match(/Jouw woorden: <b>1 ([a-z]+) &nbsp; 2 ([a-z]+)<\/b>/); return m ? m[1] + '-' + m[2] : undefined; };
  const codeE = eigen(evert), codeO = eigen(oscar);
  ok('woorden: allebei twee woorden om voor te lezen', !!codeE && !!codeO && codeE !== codeO);
  typ(evert, 'mpInp', codeO.split('-'));
  typ(oscar, 'mpInp', codeE.split('-'));
  const blokjes = function (app, code) { const w = code.split('-'); return new RegExp('1\\s*' + w[0] + '[^]*2\\s*' + w[1]).test(app.doc.__tekst(app.el('mpChips'))); };
  ok('woorden: allebei de twee woorden van de ander ingetypt', blokjes(evert, codeO) && blokjes(oscar, codeE));
  evert.tik('mpKoppel');
  oscar.tik('mpKoppel');
  /* elk pollt om de 2,5 s; de nepklok springt naar de eerstvolgende timer, dus wacht op de koppeling zelf */
  for (let i = 0; i < 8 && !(evert.get('!!MP') && oscar.get('!!MP')); i++) await tik(5000);
  ok('woorden: dezelfde kamer, één host, en beiden verbonden',
    evert.get('!!MP') && oscar.get('!!MP') && evert.get('MP.room') === oscar.get('MP.room') &&
    evert.get('MP.host') !== oscar.get('MP.host'));
  ok('woorden: allebei zien ze de verbinding en dezelfde drie plaatjes',
    evert.ziet('Verbonden met Oscar') && oscar.ziet('Verbonden met Evert') &&
    evert.get('mpEmojiTrio(MP.room)') === oscar.get('mpEmojiTrio(MP.room)'));
  const woordHost = evert.get('MP.host') ? evert : oscar;
  woordHost.tik('mpGo');
  await tik();
  ok('woorden: en dan een potje op beide telefoons',
    evert.get('!!session && session.online') && oscar.get('!!session && session.online') &&
    evert.fen() === oscar.fen());
  evert.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 11. het tweede apparaat van hetzelfde kind ---------- */
  const ipad = maakApparaat(null);
  await evert.ev('linkShareFlow()');
  await tik();
  /* de code staat als vier genummerde woorden (regel 4.8) */
  const vier = (evert.modal().match(/<span class="w-chip"><b>\d<\/b> [a-z]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>|\d/g, '').trim(); });
  const code4 = vier.length === 4 ? vier.join('-') : undefined;
  ok('koppelen: Evert krijgt vier woorden om over te typen', !!code4);
  evert.tik('linkDone');
  ipad.ev('linkEntryFlow()');
  typ(ipad, 'wordInp', code4.split('-'));
  ipad.tik('linkGo');
  await tik();
  ok('koppelen: de iPad vindt Everts profiel', ipad.ziet('Profiel gevonden') && ipad.ziet('Evert'));
  ipad.tik('linkYes');
  await tik();
  ok('koppelen: zelfde account, en naam, punten en vriend staan er ook op',
    ipad.get('ACC.id') === evert.get('ACC.id') && ipad.get('P.name') === 'Evert' &&
    ipad.get('P.xp') === evert.get('P.xp') && ipad.get('Object.keys(P.friends).length') === 1 &&
    ipad.get('P.friends[Object.keys(P.friends)[0]].k') === evert.get('P.friends[' + JSON.stringify(fid) + '].k'));
  ok('koppelen: de koppelcode is eenmalig', Object.keys(__server.links).length === 0);
  /* allebei apart punten verdienen en pas daarna syncen: niets mag kwijtraken */
  const xpVoor = evert.get('P.xp');
  evert.ev('bump("xp", 30)');
  ipad.ev('bump("xp", 12)');
  await evert.ev('syncNow()');
  await tik();
  await ipad.ev('syncNow()');
  await tik();
  await evert.ev('syncNow()');
  await tik();
  ok('koppelen: punten van beide apparaten tellen op in plaats van elkaar te overschrijven',
    evert.get('P.xp') === xpVoor + 42 && ipad.get('P.xp') === xpVoor + 42);

  /* ---------- 12. Oscar nodigt uit; Evert heeft twee apparaten ---------- */
  __server.buses = {};
  evert.ev('seenInv = []; INV = null; session = null');
  ipad.ev('seenInv = []; INV = null; session = null');
  const oFid = oscar.get('Object.keys(P.friends)[0]');
  await oscar.ev('inviteFriend(' + JSON.stringify(oFid) + ')');
  await tik();
  await evert.ev('friendPoll()');
  await ipad.ev('friendPoll()');
  await tik();
  ok('twee apparaten: allebei krijgen ze de vraag van Oscar (ze delen het geheim)',
    evert.ziet('wil een potje spelen') && ipad.ziet('wil een potje spelen'));
  evert.tik('invJa');
  await tik();
  ok('twee apparaten: de telefoon zit als gast in Oscars kamer',
    evert.get('!!MP') && evert.get('MP.room') === oscar.get('MP.room') && oscar.ziet('Verbonden met Evert'));
  /* het kind neemt de uitnodiging ook op de iPad aan: die neemt het
     stoeltje over. Zonder bericht daarover zouden de twee apparaten elkaar
     eindeloos wegduwen (gemeten: vijftig herverbindingen per twintig
     seconden, elk); nu stopt de telefoon en zegt het eerlijk. */
  globalThis.__welkomTel = { telefoon: 0, ipad: 0 };
  evert.ev('(function () { var o = mpMsg; mpMsg = function (m) {' +
    'if (m && m.t === "welkom") globalThis.__welkomTel.telefoon++; return o(m); }; })()');
  ipad.ev('(function () { var o = mpMsg; mpMsg = function (m) {' +
    'if (m && m.t === "welkom") globalThis.__welkomTel.ipad++; return o(m); }; })()');
  ipad.tik('invJa');
  await tik(20000);
  ok('twee apparaten: de telefoon stopt en zegt dat je op je andere apparaat speelt',
    evert.get('MP') === null && evert.ziet('andere apparaat'));
  ok('twee apparaten: de iPad heeft het stoeltje en Oscar merkt er niets van',
    ipad.get('!!MP && MP.open') === true && ipad.get('MP.room') === oscar.get('MP.room') &&
    oscar.get('!!MP && !MP.weg') === true && !oscar.ziet('gestopt') &&
    oscar.get('!!session') === false);
  const welkomNa20 = globalThis.__welkomTel.telefoon + globalThis.__welkomTel.ipad;
  await tik(120000);
  ok('twee apparaten: geen pingpong, ook niet na twee minuten',
    globalThis.__welkomTel.telefoon + globalThis.__welkomTel.ipad === welkomNa20 && welkomNa20 <= 2 &&
    ipad.get('!!MP && MP.open') === true);
  evert.tik('meldOk');
  ipad.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 13. een zet die aankomt terwijl de ander net wegvalt ---------- */
  await samenSpelen(evert, oscar);
  const witH = evert.get('MP.myColor') === 'w' ? evert : oscar;
  const zwartH = witH === evert ? oscar : evert;
  zwartH.ev('MP.ws.close()'); /* wifi weg, precies voor de zet */
  witH.ev('(function () { var m = legalMoves(session.S).find(function (x) { return moveKey(x) === "e2e4"; });' +
    'onCell(m.from); onCell(m.to); })()');
  await tik(20000);
  ok('hersync: na het gat staat de zet op beide borden',
    witH.fen() === zwartH.fen() && witH.get('session.S.hist.length') === 1 &&
    zwartH.get('session.S.hist.length') === 1);
  ok('hersync: de juiste kant is weer aan zet', zwartH.get('BD.mode') === 'move' &&
    witH.get('BD.mode') === 'off');
  const naSync = await speel(evert, oscar, 'e7e5');
  ok('hersync: en het potje loopt gewoon door', !!naSync && witH.fen() === zwartH.fen());

  /* ---------- 14. de host loopt weg midden in het potje ---------- */
  const wegloper = evert, blijft = oscar;
  wegloper.ev('mpVerlaat()');
  await tik();
  ok('weglopen: de ander hoort het en kan naar huis',
    blijft.ziet('is gestopt') && blijft.get('session.over') === true);
  blijft.tik('mpWegOk');
  await tik();

  /* ---------- 15. vriend weghalen: herkennen stopt ---------- */
  evert.ev('showHomeTab("vrienden")');
  fire(evert.el('friendList'), 'click', { target: { dataset: { remove: fid } } });
  evert.tik('rmVrJa');
  await tik();
  ok('weghalen: bij Evert weg, bij Oscar blijft de vriendschap staan',
    evert.get('P.friends[' + JSON.stringify(fid) + '].weg') === true &&
    oscar.get('P.friends[' + JSON.stringify(fid) + '].weg') === false);
  await evert.ev('syncNow()');
  await tik();
  await ipad.ev('syncNow()');
  await tik();
  ok('weghalen: het tweede apparaat van Evert haalt hem ook weg',
    ipad.get('P.friends[' + JSON.stringify(fid) + '].weg') === true);
  await samenSpelen(evert, oscar);
  ok('weghalen: niemand herkent nog een vriendschap',
    evert.get('MP.viaFriend') == null && oscar.get('MP.viaFriend') == null);
  evert.ev('session.S = MP.S = parseFEN("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"); renderBoard()');
  oscar.ev('session.S = MP.S = parseFEN("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"); renderBoard()');
  (evert.get('MP.myColor') === 'w' ? evert : oscar).ev('BD.mode = "move"');
  await speel(evert, oscar, 'a1a8');
  ok('weghalen: en het eindscherm biedt vrienden worden weer aan',
    eindziet(evert, 'Vrienden worden') && eindziet(oscar, 'Vrienden worden'));
  evert.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 16. herverbinden in de wachtkamer stapelt geen kaarten ---------- */
  await evert.ev('mpHostQR()');
  await tik();
  scanQR(evert, oscar);
  await tik();
  oscar.tik('mpJa');
  await tik();
  ok('wachtkamer: allebei verbonden, één kaart', evert.ziet('Verbonden met Oscar') &&
    evert.get('modalQueue.length') === 0);
  oscar.ev('MP.ws.close()'); /* wifi hikt voordat er gestart is */
  await tik(20000);
  ok('wachtkamer: na herverbinden nog steeds één kaart, geen tweede startknop',
    evert.ziet('Verbonden met Oscar') && evert.get('modalQueue.length') === 0 &&
    oscar.get('modalQueue.length') === 0 && oscar.get('!!MP && MP.open') === true);
  evert.tik('mpGo');
  await tik();
  ok('wachtkamer: één tik op start geeft één potje, en er staat niets meer overheen',
    evert.get('!!session && session.online') && oscar.get('!!session && session.online') &&
    evert.get('MP.gameNo') === 1 && !evert.open() && !oscar.open() &&
    evert.fen() === oscar.fen());
  const naStart = await speel(evert, oscar, 'd2d4');
  ok('wachtkamer: en het potje loopt', !!naStart && evert.fen() === oscar.fen() &&
    evert.get('session.S.hist.length') === 1);
  evert.ev('mpVerlaat()');
  oscar.ev('mpVerlaat()');
  await tik();

  /* ---------- 17. het maatje stopt al in de wachtkamer ---------- */
  await evert.ev('mpHostQR()');
  await tik();
  scanQR(evert, oscar);
  await tik();
  oscar.tik('mpJa');
  await tik();
  ok('wachtkamer: allebei verbonden', evert.ziet('Verbonden met Oscar') && oscar.ziet('Verbonden met Evert'));
  oscar.tik('mpNee'); /* Oscar stopt voordat Evert op start drukt */
  await tik();
  ok('wachtkamer: Evert hoort dat Oscar gestopt is en de startknop is weg',
    evert.get('MP') === null && evert.ziet('Oscar is gestopt') && evert.modal().indexOf('mpGo') < 0 &&
    evert.get('modalQueue.length') === 0);
  evert.tik('meldOk');
  await tik();
  ok('wachtkamer: en Evert is gewoon thuis', !evert.open() && evert.get('MP') === null && evert.get('session') === null);

  /* ---------- 19. de ander geeft op terwijl jij thuis bent: het einde wacht bij Verder ---------- */
  {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await samenSpelen(fien, daan);
    await speel(fien, daan, 'e2e4');
    fien.tik('backBtn');
    await tik();
    daan.ev('resignAsk()');
    daan.tik('rsJa');
    await tik();
    ok('[4.2] thuis: Fien hoort het nog niet midden in iets anders', !fien.open() && fien.get('session') === null);
    fien.tik('verderKaart');
    await tik();
    ok('[4.2] bij Verder: Fien wint, en het potje is niet meer bewaard', eindziet(fien, 'JIJ WINT') &&
      fien.opslag.getItem('schaakheld-samen') === null);
    fien.ev('mpVerlaat()');
    daan.ev('mpVerlaat()');
    await tik();
  }

  /* ---------- 18. het materiaal en de letters, elk vanaf de eigen kant ---------- */
  {
    const lotte = maakApparaat('Lotte'), sem = maakApparaat('Sem');
    await samenSpelen(lotte, sem);
    for (const key of ['e2e4', 'd7d5', 'e4d5']) await speel(lotte, sem, key);
    const wit = lotte.get('MP.myColor') === 'w' ? lotte : sem, zwart = wit === lotte ? sem : lotte;
    const witNaam = wit === lotte ? 'Lotte' : 'Sem';
    const tekst = function (app, id) { return app.doc.__tekst(app.el(id)); };
    ok('[2.3] samen: wit leest dat hij een pion voor staat', /Jij \+1/.test(tekst(wit, 'materiaal')));
    ok('[2.3] samen: zwart leest dat ' + witNaam + ' een pion voor staat', new RegExp(witNaam + ' \\+1').test(tekst(zwart, 'materiaal')));
    ok('[2.3] samen: de letters onder het bord vanaf de eigen kant', /^\s*a/.test(tekst(wit, 'coordsF')) && /^\s*h/.test(tekst(zwart, 'coordsF')));
    ok('[2.3] samen: de cijfers naast het bord vanaf de eigen kant', /^\s*8/.test(tekst(wit, 'coordsR')) && /^\s*1/.test(tekst(zwart, 'coordsR')));
    lotte.ev('mpVerlaat()');
    sem.ev('mpVerlaat()');
    await tik();
  }

  await orakelTwee();
  print('');
  print('orakel: ' + ORAKEL.nogNiet + ' nog niet gebouwd, ' + ORAKEL.gebouwd + ' gebouwd');
  print(fails === 0 ? 'ALL TWO-DEVICE TESTS PASSED' : (fails + ' TWO-DEVICE TESTS FAILED'));
}

alles().catch(function (e) { print('ASYNC EXCEPTION: ' + e + '\n' + (e && e.stack)); });
