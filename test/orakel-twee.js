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

  await nogNiet('[4.1] een vriendenpotje staat na elke halve zet op beide apparaten', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    for (const x of [a, b]) {
      const r = opgeslagen(x, SAMEN);
      check('bewaard bij ' + x.naam, !!r && typeof r === 'object');
      check('vorm bij ' + x.naam, !!r && r.room === x.get('MP.room') && typeof r.seat === 'string' &&
        typeof r.host === 'boolean' && (r.myColor === 'w' || r.myColor === 'b') && typeof r.gameNo === 'number' &&
        Array.isArray(r.moves) && r.moves.length === 1 && r.moves[0] === 'e2e4' &&
        typeof r.peerName === 'string' && 'viaFriend' in r && r.updated > 0);
    }
  });

  await nogNiet('[4.1] wie op zijn eigen beurt herlaadt, speelt verder in dezelfde stand', async function (check) {
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

  await nogNiet('[4.1] wie herlaadt terwijl de ander aan zet is, ziet daarna de zet van de ander', async function (check) {
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

  await nogNiet('[4.1] allebei herladen: allebei weer in hetzelfde potje', async function (check) {
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

  await nogNiet('[4.2] ← in een vriendenpotje gaat naar huis en houdt potje en verbinding; de ander merkt niets', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    const zwart = aanZet(a, b), wit = zwart === a ? b : a;
    wit.tik('backBtn');
    await wacht();
    check('thuis, zonder vraag', opThuis(wit) && !wit.open());
    check('het potje is bewaard en de verbinding blijft', !!opgeslagen(wit, SAMEN) && wit.get('!!MP'));
    check('de ander merkt niets', !zwart.open() && zwart.get('!!(session && !session.over)'));
    await speel(zwart, wit, 'e7e5');
    wit.tik('verderKaart');
    await wacht();
    check('terug in het potje met de zet van de ander', opSpeelscherm(wit) && wit.fen() === zwart.fen());
  });

  await nogNiet('[4.3] wie blijft, hoort de waarheid: even weg, het potje blijft staan, het staat bij Verder', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    stopApparaat(a);
    await wacht();
    check('Fien is even weg', /Fien is even weg/.test(zegt(b)));
    check('het potje blijft staan, bij Verder', /blijft staan/.test(zegt(b)) && /Verder/.test(zegt(b)));
    check('geen belofte dat zetten vanzelf komen', !/komen straks|vanzelf goed/.test(zegt(b)));
    await wacht(10 * 60000);
    check('ook na tien minuten eerlijk', /even weg/.test(zegt(b)) && !/komen straks|vanzelf goed/.test(zegt(b)));
    check('en het potje staat er nog', !!opgeslagen(b, SAMEN));
  });

  await nogNiet('[4.4] is de kamer weg, dan zien beiden hetzelfde einde en telt het voor niemand', async function (check) {
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
    check('allebei: het telt niet mee', /telt niet mee/.test(zegt(a2)) && /telt niet mee/.test(zegt(b2)));
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
  await nogNiet('[4.4] moest de kamer plaatsmaken op een volle server, dan zien beiden hetzelfde einde', async function (check) {
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
      check('allebei: het telt niet mee', /telt niet mee/.test(zegt(a2)) && /telt niet mee/.test(zegt(b2)));
      check('aan geen kant een teller veranderd', tellersVan(a2) === ta && tellersVan(b2) === tb);
    } finally {
      lijnen.forEach(function (ws) { ws.close(); });
      vuller.forEach(function (id) { delete __server.wsrooms[id]; });
      __server.klok = klok;
    }
  });

  await nogNiet('[4.4] valt het netwerk weg tijdens het potje, dan blijft het potje staan en gaat het daarna verder', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const ta = tellersVan(a), tb = tellersVan(b);
    geenNetwerk(a);
    await wacht(5 * 60000);
    const r = opgeslagen(a, SAMEN);
    check('het potje staat nog bewaard, met beide zetten', !!r && Array.isArray(r.moves) && r.moves.length === 2);
    check('het potje is niet afgelopen', !a.get('!!(session && session.over)') && !/telt niet mee|gestopt/.test(zegt(a)));
    check('geen teller veranderd', tellersVan(a) === ta && tellersVan(b) === tb);
    await terugInHetPotje(check, a, b, 'g1f3');
  });

  await nogNiet('[4.4] wie de app opent zonder netwerk, houdt het vriendenpotje; de kaart zegt dat er nu geen verbinding is', async function (check) {
    const a = maakApparaat('Fien'), b = maakApparaat('Daan');
    await samenSpelen(a, b);
    await speel(a, b, 'e2e4');
    await speel(a, b, 'e7e5');
    const ta = tellersVan(a);
    stopApparaat(a);
    a.netwerk.uit = true;
    const a2 = herlaad(a);
    await wacht(5 * 60000);
    const r = opgeslagen(a2, SAMEN);
    check('het potje staat nog bewaard, met beide zetten', !!r && Array.isArray(r.moves) && r.moves.length === 2);
    check('de kaart noemt het potje en zegt dat er nu geen verbinding is', zichtbaar(a2, 'verder') &&
      /Daan/.test(tekstVan(a2, 'verder')) && /geen verbinding/i.test(tekstVan(a2, 'verder')));
    check('geen einde en geen teller veranderd', !/telt niet mee|gestopt/.test(zegt(a2)) && tellersVan(a2) === ta);
    await terugInHetPotje(check, a2, b, 'g1f3');
  });

  const kapotSamen = [
    ['kapotte tekst', 'kapot{'],
    ['zonder stoel', JSON.stringify({ room: 'kamer1', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'], peerName: 'Daan', updated: 1 })]
  ];
  for (const geval of kapotSamen) {
    await nogNiet('[4.1] een vriendenpotje dat niet te lezen is (' + geval[0] + ') wordt getoond, en pas het kind haalt het weg', async function (check) {
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

  await nogNiet('[4.6] "Nu niet" op een uitnodiging bereikt wie uitnodigde', async function (check) {
    const fien = maakApparaat('Fien'), daan = maakApparaat('Daan');
    await wordenVrienden(fien, daan);
    await nodigUit(fien);
    await daan.ev('friendPoll()');
    await wacht();
    check('testopzet: Daan krijgt de vraag', kanTikken(daan, 'Nu niet'));
    tikTekst(daan, 'Nu niet');
    await wacht(30000);
    check('Fien leest het', /Daan kan nu even niet/.test(zegt(fien)));
  });

  await nogNiet('[4.7] beide verbonden kaarten zeggen wie het potje start', async function (check) {
    const daan = maakApparaat('Daan'), fien = maakApparaat('Fien');
    await daan.ev('mpHostQR()');
    await wacht();
    scanQR(daan, fien);
    await wacht();
    fien.tik('mpJa');
    await wacht();
    check('bij Daan', /Daan start het potje\./.test(daan.scherm()));
    check('bij Fien', /Daan start het potje\. Even wachten\./.test(fien.scherm()));
  });

  await nogNiet('[4.7] een vriendschapsvraag na een potje staat in de eindkaart van de ander, niet erachter', async function (check) {
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

  await nogNiet('[4.8] een apparaat koppelen met de vier woorden, getypt met spaties', async function (check) {
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
