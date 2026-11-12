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
  });

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
    const fien2 = herlaad(fien);
    await wacht();
    await nodigUit(fien2);
    await daan.ev('friendPoll()');
    await wacht(30000);
    check('weer samen, zonder dat Daan eerst weg moest', fien2.get('!!(session && session.online)') &&
      daan.get('!!(session && session.online)') && fien2.fen() === daan.fen());
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
    tikTekst(daan, 'Vrienden worden');
    await wacht();
    const kaart = fien.modal() + ' ' + tekstVan(fien, 'eindkaart');
    check('Fien ziet de vraag van Daan in haar eindkaart', /Daan/.test(kaart) && /vrienden/i.test(kaart) &&
      fien.get('modalQueue.length') === 0);
  });

  await nogNiet('[4.8] een apparaat koppelen met de vier woorden, getypt met spaties', async function (check) {
    const mees = maakApparaat('Mees'), ipad = maakApparaat(null);
    await mees.ev('linkShareFlow()');
    await wacht();
    const woorden = mees.modal().replace(/<[^>]*>/g, ' ').split(/[^a-z]+/).filter(function (w) { return WOORDEN.indexOf(w) >= 0; }).slice(0, 4);
    check('testopzet: vier woorden op het scherm', woorden.length === 4);
    ipad.ev('linkEntryFlow()');
    await wacht();
    vulIn(ipad, ipad.el('wordInp'), woorden.join(' '));
    tikTekst(ipad, 'Koppel');
    await wacht();
    check('het profiel van Mees is gevonden', /Mees/.test(ipad.scherm()));
  });

  await nogNiet('[4.9] de nep-server: een kamer met een potje leeft 12 uur stil, een lege kamer een kwartier', async function (check) {
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
}
