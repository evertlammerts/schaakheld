/* Orakel, flowtests: de regels van plan.md voor increment 1, 2 en 3, elk op
   een eigen verse app-instantie (test/harnas.js). Elke testnaam begint met
   zijn regelnummer. Een kind tikt: het bord via onCell, knoppen op wat erop
   staat. Een opdracht klaarzetten gebeurt zoals de bestaande tests het doen. */

var POTJE = 'schaakheld-potje', RONDJES = 'schaakheld-rondjes';
var START_FEN_O = toFEN(newGame());
/* twintig halve zetten zonder slag of herhaling, gelijk materiaal */
var TWINTIG = ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5', 'b1c3', 'b8c6', 'd2d3', 'd7d6',
  'c1g5', 'c8g4', 'h2h3', 'h7h6', 'g5h4', 'g4h5', 'a2a3', 'a7a6', 'b2b4', 'b7b5'];

function naSpelen(zetten) {
  const S = newGame();
  for (const k of zetten) {
    const m = legalMoves(S).find(function (x) { return moveKey(x) === k; });
    if (!m) throw new Error('testopzet: ' + k + ' is geen zet');
    makeMove(S, m);
  }
  return S;
}

/* een vers kind dat rustig speelt: geen voorspelvraag en geen blunderalarm,
   zodat Turbo nooit op een tik wacht en een zet altijd doorgaat */
function nieuwKind(opties) {
  const a = maakApparaat('Mees', opties);
  a.ev('setPref("predict", false); setPref("guard", false)');
  return a;
}

function opslagMetPotje(level, zetten, extra) {
  const o = maakOpslag();
  o.setItem(POTJE, JSON.stringify(Object.assign({ v: 1, level, moves: zetten, tips: 3, drawAsked: null,
    started: 1794700000000, updated: 1794700000000 }, extra || {})));
  return o;
}

/* een opdracht klaarzetten in het lopende rondje, zoals de bestaande tests */
function zetOpdracht(app, fen, type, antwoorden, extra) {
  app.ev('(function () {' +
    'var S = parseFEN(' + JSON.stringify(fen) + ');' +
    'var ans = ' + JSON.stringify(antwoorden) + '.map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), info: null }; });' +
    'session.S = S;' +
    'session.task = Object.assign({ S: S, type: ' + JSON.stringify(type) + ', answers: ans, hintUsed: false }, ' + (extra || '{}') + ');' +
    'session.phase = "puzzle"; session.tries = 0; BD.mode = "puzzle"; renderBoard(); })()');
}

function wekelijks(app) {
  app.tik('tabIk');
  return tekstVan(app, 'weekCard');
}

/* naar huis zoals een kind: "Naar huis" als dat er staat, anders de terugknop */
async function naarHuis(app) {
  if (kanTikken(app, 'Naar huis')) { tikTekst(app, 'Naar huis'); await wacht(); }
  if (!app.open() && opSpeelscherm(app)) { app.tik('backBtn'); await wacht(); }
}

/* een level omhoog legt een venster over Volgende; een kind tikt dat eerst weg */
async function volgende(app) {
  for (let i = 0; i < 8 && app.ziet('LEVEL OMHOOG'); i++) app.tik('lvlOk');
  tikTekst(app, 'Volgende');
  await wacht();
}

async function rondjeGoed(app, n) {
  for (let i = 0; i < n; i++) {
    await scanGoed(app);
    if (i < n - 1) await volgende(app);
  }
}

async function orakelFlow() {
  /* ================= increment 1 ================= */

  await nogNiet('[1.1] na elke halve zet staat het potje bewaard, in de afgesproken vorm', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const r = opgeslagen(a, POTJE);
    check('er staat een potje in ' + POTJE, !!r && typeof r === 'object');
    check('vorm {v: 1, level, moves, tips, drawAsked, started, updated}', !!r && r.v === 1 && r.level === 1 &&
      Array.isArray(r.moves) && typeof r.tips === 'number' && 'drawAsked' in r && r.started > 0 && r.updated > 0);
    check('beide halve zetten als van-naar', !!r && r.moves.length === 2 && r.moves[0] === 'e2e4' &&
      /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(r.moves[1]));
  });

  await nogNiet('[1.1] herladen als jij aan zet bent: dezelfde stand, hetzelfde niveau, hulp die over is', async function (check) {
    /* na Pf3 valt wit de pion op e5 aan: dan heeft de Speurbril iets te tonen */
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e4', 'e7e5', 'g1f3', 'b8c6']) });
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht();
    await zetEnWacht(a, 'f1c4');
    const fen = a.fen();
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('zelfde stand en wie er aan zet is', b.fen() === fen);
    check('zelfde niveau', b.get('session && session.level') === 2);
    check('de Speurbril heeft er nog 2', knopTeksten(b).some(function (t) { return /Speurbril\D*2/.test(t); }));
  });

  await nogNiet('[1.1] herladen als Turbo aan zet is: Turbo zet', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    zet(a, 'e2e4');
    drainTimers(400, 40);
    const r = opgeslagen(a, POTJE);
    check('jouw zet staat al bewaard voor Turbo zet', !!r && r.moves && r.moves.length === 1);
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('Turbo heeft gezet en jij bent aan zet', b.get('session && session.S.hist.length') === 2 &&
      b.get('session && session.S.turn') === 'w');
  });

  await nogNiet('[1.1] herladen na een slag en na een rokade', async function (check) {
    const zetten = ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'g1f3', 'c8g4', 'f1e2', 'b8c6', 'e1g1', 'e8c8'];
    const b = nieuwKind({ opslag: opslagMetPotje(1, zetten) });
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('de stand na slag en rokades, wit aan zet', b.fen() === toFEN(naSpelen(zetten)));
  });

  await nogNiet('[1.1] herladen terwijl je schaak staat: de koning staat rood, net als voor het herladen', async function (check) {
    const zetten = ['f2f3', 'e7e5', 'e1f2', 'd8h4'];
    const rood = function (x) { return [...x.el('board').children].filter(function (c) { return /\bcheck\b/.test(c.className); }).length; };
    const laatste = function (x) { return [...x.el('board').children].filter(function (c) { return /\blast\b/.test(c.className); }).length; };
    const a = nieuwKind({ opslag: opslagMetPotje(1, zetten) });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    check('testopzet: wit staat schaak', a.get('inCheck(session.S)') === true);
    check('een rood veld, op de koning, en de laatste zet gemarkeerd', rood(a) === 1 && a.get('BD.check') === a.get('session.S.kings.w') && laatste(a) === 2);
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('na herladen dezelfde markering', rood(b) === 1 && b.get('BD.check') === b.get('session.S.kings.w') && laatste(b) === 2);
  });

  await nogNiet('[1.1] een teruggenomen zet en een gebruikte speurbril staan ook bewaard', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'd7d5']) });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht();
    check('testopzet: de speurbril is gebruikt', a.get('session.tips') === 2);
    await zetEnWacht(a, 'g1f3');
    tikTekst(a, 'Zet terug');
    await wacht();
    check('testopzet: de zet is terug', a.get('session.S.hist.length') === 2);
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('na herladen de stand van na het terugnemen', b.fen() === toFEN(naSpelen(['e2e4', 'd7d5'])));
    check('en de speurbril is nog steeds gebruikt', b.get('session.tips') === 2);
  });

  await nogNiet('[1.1] de trucbonus telt per potje, ook over Pauze en herladen heen', async function (check) {
    const zetten = ['b1c3', 'e7e6', 'c3b5', 'd8e7'];
    const metDrie = nieuwKind({ opslag: opslagMetPotje(1, zetten, { patXP: 3 }) });
    await wacht();
    metDrie.tik('verderKaart');
    await wacht();
    const xp3 = metDrie.get('P.xp');
    await zetEnWacht(metDrie, 'b5c7');
    check('testopzet: de vork telt als truc', metDrie.get('P.c.pat.vork') === 1);
    check('drie bonussen al gehad in dit potje: geen trucbonus meer', metDrie.get('P.xp') === xp3);
    const zonder = nieuwKind({ opslag: opslagMetPotje(1, zetten) });
    await wacht();
    zonder.tik('verderKaart');
    await wacht();
    const xp0 = zonder.get('P.xp');
    await zetEnWacht(zonder, 'b5c7');
    check('een potje zonder dat veld telt als nul: de bonus komt', zonder.get('P.xp') === xp0 + 10);
    const r = opgeslagen(zonder, POTJE);
    check('en het bewaarde potje telt hem', !!r && r.patXP === 1);
  });

  await nogNiet('[1.1] een verkeerde telling van de hulp kost het potje niet en geeft niets extra', async function (check) {
    const zetten = ['b1c3', 'e7e6', 'c3b5', 'd8e7'];
    for (const tips of [99, 'x']) {
      const a = nieuwKind({ opslag: opslagMetPotje(1, zetten, { tips: tips }) });
      await wacht();
      check('tips ' + JSON.stringify(tips) + ': de Verder-kaart opent het potje', /Verder:/.test(tekstVan(a, 'verder')) && !/kan ik niet/.test(tekstVan(a, 'verder')));
      a.tik('verderKaart');
      await wacht();
      check('tips ' + JSON.stringify(tips) + ': dezelfde stand en geen hulp erbij', opSpeelscherm(a) && a.fen() === toFEN(naSpelen(zetten)) && a.get('session.tips') === 0);
    }
    const b = nieuwKind({ opslag: opslagMetPotje(1, zetten, { drawAsked: 'x', patXP: 'x' }) });
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('een verkeerde remise- en trucbonusteller: het potje opent', opSpeelscherm(b) && b.fen() === toFEN(naSpelen(zetten)));
    const xp = b.get('P.xp');
    await zetEnWacht(b, 'b5c7');
    check('en geeft geen trucbonus', b.get('P.c.pat.vork') === 1 && b.get('P.xp') === xp);
  });

  await nogNiet('[1.1] een potje zonder zet wordt niet bewaard: Pauze vraagt niets en zegt dat het nog niet begonnen was', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    check('testopzet: in een potje', opSpeelscherm(a));
    check('zonder zet staat er niets bewaard', opgeslagen(a, POTJE) === null);
    a.tik('backBtn');
    await wacht(500);
    check('geen vraag, terug op Spelen', !a.open() && opThuis(a));
    check('na Pauze ook niet', opgeslagen(a, POTJE) === null);
    check('de melding zegt dat het nog niet begonnen was', /nog niet begonnen/.test(toastTekst(a)));
    check('geen "Verder:" voor een potje', !/Verder:/.test(tekstVan(a, 'verder')));
    await startPotje(a, 2);
    check('een ander niveau kiezen vraagt niets', !a.open() && opSpeelscherm(a) && a.get('session.level') === 2);
  });

  await nogNiet('[1.2] de terugknop heet Pauze, in een potje en in een rondje', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    check('in een potje', tekstVan(a, 'backBtn').indexOf('Pauze') >= 0);
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'scan');
    check('in een rondje', tekstVan(a, 'backBtn').indexOf('Pauze') >= 0);
  });

  await nogNiet('[1.2] Pauze in een potje: geen vraag, terug naar Spelen, en de melding zegt bij welke zet', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    a.tik('backBtn');
    await wacht(500);
    check('geen venster', !a.open());
    check('terug op Spelen', opThuis(a) && zichtbaar(a, 'view-spelen'));
    check('het potje is niet afgelopen', !!opgeslagen(a, POTJE));
    check('melding "Bewaard ... zet 2"', /Bewaard/.test(toastTekst(a)) && /zet 2\b/.test(toastTekst(a)));
  });

  await nogNiet('[1.2] ✔ bewaard staat in beeld na elke bewaarde zet en elk antwoord', async function (check) {
    const bewaardInBeeld = function (x) { return zichtbaar(x, 'bewaard') && tekstVan(x, 'bewaard').indexOf('✔ bewaard') >= 0; };
    const a = nieuwKind();
    await startPotje(a, 1);
    check('in een potje zonder zet nog niet: er is niets bewaard', !bewaardInBeeld(a));
    await zetEnWacht(a, 'e2e4');
    const r = opgeslagen(a, POTJE);
    check('na de zetten wel, en dan staan ze ook echt bewaard', bewaardInBeeld(a) && !!r &&
      r.moves.length === a.get('session.S.hist.length'));
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'scan');
    check('in een rondje zonder antwoord nog niet', !bewaardInBeeld(a));
    await scanGoed(a);
    check('na een antwoord wel, en het rondje staat bewaard', bewaardInBeeld(a) && !!opgeslagen(a, RONDJES));
  });

  await nogNiet('[1.2] lukt bewaren niet, dan staat er geen "✔ bewaard" en zegt Pauze het', async function (check) {
    const weigert = function (sleutel) {
      const o = maakOpslag(), schrijf = o.setItem;
      o.setItem = function (k, v) { if (k === sleutel) throw new Error('vol'); return schrijf.call(this, k, v); };
      return o;
    };
    const a = nieuwKind({ opslag: weigert(POTJE) });
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    check('geen "✔ bewaard" in beeld', !(zichtbaar(a, 'bewaard') && /✔/.test(tekstVan(a, 'bewaard'))));
    check('wel dat het niet bewaard is', zichtbaar(a, 'bewaard') && /niet/.test(tekstVan(a, 'bewaard')));
    a.tik('backBtn');
    await wacht(500);
    check('Pauze zegt niet "Bewaard"', toastTekst(a) !== '' && !/Bewaard/.test(toastTekst(a)));
    check('en er staat geen Verder-kaart voor een potje', !/Verder:/.test(tekstVan(a, 'verder')));
    const b = nieuwKind({ opslag: weigert(RONDJES) });
    await startOefening(b, 'scan');
    await scanGoed(b);
    check('rondje: geen "✔ bewaard"', !(zichtbaar(b, 'bewaard') && /✔/.test(tekstVan(b, 'bewaard'))));
    b.tik('backBtn');
    await wacht(500);
    check('rondje: Pauze zegt niet "Bewaard"', toastTekst(b) !== '' && !/Bewaard/.test(toastTekst(b)));
  });

  await nogNiet('[1.2] lukt bewaren later niet meer, dan blijft het laatst bewaarde staan en zegt Pauze waar het staat', async function (check) {
    const weigerLater = function (sleutel) {
      const o = maakOpslag(), schrijf = o.setItem;
      o.weiger = false;
      o.setItem = function (k, v) { if (k === sleutel && o.weiger) throw new Error('vol'); return schrijf.call(this, k, v); };
      return o;
    };
    const oa = weigerLater(POTJE);
    const a = nieuwKind({ opslag: oa });
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const voor = opgeslagen(a, POTJE);
    check('testopzet: twee halve zetten bewaard', !!voor && voor.moves.length === 2);
    oa.weiger = true;
    await zetEnWacht(a, 'd2d4');
    check('de balk zegt niet bewaard', zichtbaar(a, 'bewaard') && /niet/.test(tekstVan(a, 'bewaard')) && !/✔/.test(tekstVan(a, 'bewaard')));
    check('het laatst bewaarde staat er nog', JSON.stringify(opgeslagen(a, POTJE)) === JSON.stringify(voor));
    a.tik('backBtn');
    await wacht(500);
    check('Pauze zegt waar het potje staat, zonder "Bewaard."', /zet 2\b/.test(toastTekst(a)) && !/Bewaard\./.test(toastTekst(a)));
    check('de Verder-kaart toont wat er echt bewaard is', /Zet 2\b/.test(tekstVan(a, 'verder')));
    const ob = weigerLater(RONDJES);
    const b = nieuwKind({ opslag: ob });
    await startOefening(b, 'scan');
    await scanGoed(b);
    check('testopzet: opdracht 1 bewaard', !!opgeslagen(b, RONDJES) && opgeslagen(b, RONDJES).scan.round === 1);
    ob.weiger = true;
    await volgende(b);
    await scanGoed(b);
    check('rondje: de balk zegt niet bewaard', /niet/.test(tekstVan(b, 'bewaard')) && !/✔/.test(tekstVan(b, 'bewaard')));
    check('rondje: opdracht 1 staat er nog', opgeslagen(b, RONDJES).scan.round === 1);
    b.tik('backBtn');
    await wacht(500);
    check('rondje: Pauze zegt bij welke opdracht het verder gaat', /opdracht 2\b/.test(toastTekst(b)) && !/Bewaard\./.test(toastTekst(b)));
  });

  await nogNiet('[1.2] een rondje zonder antwoord zegt bij Pauze dat het nog niet begonnen was', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.tik('backBtn');
    await wacht(500);
    check('melding "nog niets bewaard", opnieuw bij opdracht 1', /nog niets bewaard/.test(toastTekst(a)) && /opdracht 1\b/.test(toastTekst(a)));
  });

  await nogNiet('[1.2] de denkwolk gaat eerst dicht en zijn droombord blijft niet bewaard', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const echt = a.fen();
    tikTekst(a, 'Denkwolk');
    await wacht();
    await zetEnWacht(a, 'd2d4');
    a.tik('backBtn');
    await wacht(500);
    check('na Pauze op Spelen', opThuis(a));
    a.tik('verderKaart');
    await wacht();
    check('verder spelen geeft de echte stand, niet de droom', a.fen() === echt && !a.get('!!(session && session.cloud)'));
  });

  await nogNiet('[1.3] met een bewaard potje toont Speel tegen Turbo eerst dat potje', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e4', 'e7e5']) });
    if (heeftKlik(a, 'spelTurbo')) a.tik('spelTurbo'); else a.ev('startGameFlow()');
    await wacht();
    const h = a.modal(), verder = h.indexOf('Verder spelen'), niveau = h.indexOf('data-lvl');
    check('"Verder spelen" staat boven de niveaus', verder >= 0 && niveau >= 0 && verder < niveau);
  });

  await nogNiet('[1.3] een niveau kiezen vraagt eerst; "Nee, verder spelen" houdt het potje', async function (check) {
    const zetten = ['e2e4', 'e7e5'];
    const a = nieuwKind({ opslag: opslagMetPotje(2, zetten) });
    await startPotje(a, 1);
    check('de vraag noemt opgeven', a.open() && /opgeven/i.test(a.scherm()) && kanTikken(a, 'Nee, verder spelen'));
    tikTekst(a, 'Nee, verder spelen');
    await wacht();
    check('terug in hetzelfde potje', opSpeelscherm(a) && a.fen() === toFEN(naSpelen(zetten)) && a.get('session.level') === 2);
    check('het bewaarde potje is onveranderd', JSON.stringify(opgeslagen(a, POTJE).moves) === JSON.stringify(zetten));
  });

  await nogNiet('[1.3] ja voor twintig halve zetten: een nieuw potje, en geen teller verandert', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, TWINTIG.slice(0, 6)) });
    const voor = a.get('[P.c.gamesPlayed, P.xp, wkGet(curWeek(), "potjes2")]');
    await startPotje(a, 3);
    tikTekst(a, 'Ja');
    await wacht();
    check('een nieuw potje op niveau 3', opSpeelscherm(a) && a.get('session.level') === 3 && a.fen() === START_FEN_O);
    check('het oude potje is weg, en het nieuwe staat pas na een zet bewaard', opgeslagen(a, POTJE) === null);
    check('tellers gelijk', JSON.stringify(a.get('[P.c.gamesPlayed, P.xp, wkGet(curWeek(), "potjes2")]')) === JSON.stringify(voor));
  });

  await nogNiet('[1.3] ja na twintig halve zetten telt precies als opgeven', async function (check) {
    const tellers = '[P.c.gamesPlayed, P.xp, wkGet(curWeek(), "potjes2")]';
    const verschil = function (voor, na) { return na.map(function (x, i) { return x - voor[i]; }); };
    /* zo telt opgeven: hetzelfde potje, met de knop Opgeven */
    const c = nieuwKind({ opslag: opslagMetPotje(2, TWINTIG) });
    const cVoor = c.get(tellers);
    c.tik('verderKaart');
    await wacht();
    await geefOp(c);
    const opgeven = verschil(cVoor, c.get(tellers));
    check('opgeven na twintig halve zetten telt (zoals vandaag)', opgeven[0] === 1);
    const a = nieuwKind({ opslag: opslagMetPotje(2, TWINTIG) });
    const aVoor = a.get(tellers);
    await startPotje(a, 3);
    tikTekst(a, 'Ja');
    await wacht();
    check('nieuw niveau kiezen telt hetzelfde', JSON.stringify(verschil(aVoor, a.get(tellers))) === JSON.stringify(opgeven));
  });

  await nogNiet('[1.3] Revanche na afloop begint meteen een nieuw potje, zonder vraag', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    a.tik('verderKaart');
    await wacht();
    await zetEnWacht(a, 'd1h5');
    check('het potje is uit (mat)', a.get('!!(session && session.over)'));
    tikTekst(a, 'Revanche');
    await wacht();
    check('nieuw potje zonder vraag', !a.open() && opSpeelscherm(a) && a.fen() === START_FEN_O);
  });

  await nogNiet('[1.4] opgeven, mat en een aangenomen remise halen het bewaarde potje weg', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    check('eerst bewaard', !!opgeslagen(a, POTJE));
    await geefOp(a);
    check('weg na opgeven', opgeslagen(a, POTJE) === null);
    const b = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    b.tik('verderKaart');
    await wacht();
    await zetEnWacht(b, 'd1h5');
    check('weg na mat', b.get('!!(session && session.over)') && opgeslagen(b, POTJE) === null);
    const c = nieuwKind({ opslag: opslagMetPotje(1, TWINTIG) });
    c.tik('verderKaart');
    await wacht();
    await biedRemise(c);
    check('weg na een aangenomen remise', c.get('!!(session && session.over)') && opgeslagen(c, POTJE) === null);
  });

  await nogNiet('[1.4] Alles wissen noemt het potje dat bezig is en haalt het weg', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    a.tik('setBtn');
    await wacht();
    a.tik('setReset');
    await wacht();
    check('de vraag noemt het potje dat bezig is', a.ziet('potje dat bezig is'));
    a.tik('rstGo');
    await wacht();
    check('het potje is weg', opgeslagen(a, POTJE) === null);
  });

  await nogNiet('[1.4] Alles wissen midden in een potje of een rondje: daarna loopt er niets meer van door', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    check('testopzet: het potje staat bewaard', !!opgeslagen(a, POTJE));
    a.tik('setBtn');
    await wacht();
    a.tik('setReset');
    await wacht();
    a.tik('rstGo');
    await wacht(3000);
    check('geen potje meer bezig en niet meer op het speelscherm', a.get('session') === null && !opSpeelscherm(a));
    check('en er komt niets terug in de opslag', opgeslagen(a, POTJE) === null);
    const b = nieuwKind();
    await startOefening(b, 'scan');
    await scanGoed(b);
    check('testopzet: het rondje staat bewaard', !!opgeslagen(b, RONDJES));
    b.tik('setBtn');
    await wacht();
    b.tik('setReset');
    await wacht();
    b.tik('rstGo');
    await wacht(3000);
    check('geen rondje meer bezig en niet meer op het speelscherm', b.get('session') === null && !opSpeelscherm(b));
    check('en geen rondje in de opslag', opgeslagen(b, RONDJES) === null);
  });

  await nogNiet('[1.4] niets anders haalt het bewaarde potje weg', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const zetten = JSON.stringify(opgeslagen(a, POTJE) && opgeslagen(a, POTJE).moves);
    a.tik('backBtn');
    await wacht();
    a.tik('tabIk');
    a.tik('tabVrienden');
    a.tik('tabSpelen');
    await startOefening(a, 'scan');
    a.tik('backBtn');
    await wacht();
    const b = herlaad(a);
    await wacht();
    check('na Pauze, tabs, een rondje en herladen staat het er nog', !!opgeslagen(b, POTJE) &&
      JSON.stringify(opgeslagen(b, POTJE).moves) === zetten && zetten !== 'null');
  });

  const onleesbaar = [
    ['kapotte tekst', 'kapot{'],
    ['een onbekende versie', JSON.stringify({ v: 9, level: 1, moves: ['e2e4'], tips: 3 })],
    ['een zet die niet kan', JSON.stringify({ v: 1, level: 1, moves: ['e2e4', 'e2e4'], tips: 3, drawAsked: null, started: 1, updated: 1 })]
  ];
  for (const geval of onleesbaar) {
    await nogNiet('[1.5] een potje dat niet te lezen is (' + geval[0] + ') wordt getoond, niet weggegooid', async function (check) {
      const o = maakOpslag();
      o.setItem(POTJE, geval[1]);
      const a = nieuwKind({ opslag: o });
      await wacht();
      check('de Verder-kaart zegt het', zichtbaar(a, 'verder') && tekstVan(a, 'verder').indexOf('kan ik niet meer openen') >= 0);
      const b = herlaad(a);
      await wacht();
      check('na herladen staat het er nog, onveranderd', b.opslag.getItem(POTJE) === geval[1]);
      tikTekst(b, 'Weghalen');
      await wacht();
      check('pas "Weghalen" haalt het weg', b.opslag.getItem(POTJE) === null);
    });
  }

  /* een rondje is een telling: de sterren staan al in het profiel, dus weghalen kost niets */
  await nogNiet('[1.5] rondjes die niet te lezen zijn (kapotte tekst) worden stil weggehaald, en het rondje begint opnieuw', async function (check) {
    const o = maakOpslag();
    o.setItem(RONDJES, 'kapot{');
    const a = nieuwKind({ opslag: o });
    await wacht();
    check('geen venster en geen melding', !a.open() && toastTekst(a) === '');
    check('niets op de Verder-kaart', !/kan ik niet|Speurogen/.test(tekstVan(a, 'verder')));
    await startOefening(a, 'scan');
    check('Speurogen begint bij opdracht 1', opSpeelscherm(a) && /opdracht 1 van 5/i.test(tekstVan(a, 'roundChip')));
    check('de kapotte tekst is weg', a.opslag.getItem(RONDJES) !== 'kapot{');
  });

  await nogNiet('[1.5] een rondje dat niet te lezen is, wordt weggehaald; het rondje ernaast blijft', async function (check) {
    const o = maakOpslag();
    o.setItem(RONDJES, JSON.stringify({ scan: { round: 'drie', earned: null }, best3: { round: 2, earned: 6 } }));
    const a = nieuwKind({ opslag: o });
    await wacht();
    check('geen venster en geen melding', !a.open() && toastTekst(a) === '');
    await startOefening(a, 'scan');
    check('Speurogen begint bij opdracht 1', /opdracht 1 van 5/i.test(tekstVan(a, 'roundChip')));
    const r = opgeslagen(a, RONDJES);
    check('het kapotte rondje is weg', !r || !r.scan || typeof r.scan.round === 'number');
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'best3');
    check('De Beste Zet gaat verder bij opdracht 3, met zijn 6 sterren', /opdracht 3 van 5/i.test(tekstVan(a, 'roundChip')) &&
      /\b6\b/.test(tekstVan(a, 'drillStars')));
  });

  await nogNiet('[1.5] een rondje met een verkeerde vorm wordt weggehaald, en daarna wordt er weer bewaard', async function (check) {
    for (const ruw of ['{"scan":{"round":7,"earned":0}}', '{"scan":5}', '[1,2]', '"tekst"']) {
      const o = maakOpslag();
      o.setItem(RONDJES, ruw);
      const a = nieuwKind({ opslag: o });
      await wacht();
      check(ruw + ': niets op de Verder-kaart', !/Speurogen|Opdracht/.test(tekstVan(a, 'verder')));
      await startOefening(a, 'scan');
      check(ruw + ': Speurogen begint bij opdracht 1', /opdracht 1 van 5/i.test(tekstVan(a, 'roundChip')));
      await scanGoed(a);
      const r = opgeslagen(a, RONDJES);
      check(ruw + ': na een antwoord staat het rondje bewaard', !!r && !Array.isArray(r) && !!r.scan && r.scan.round === 1);
    }
  });

  await nogNiet('[1.6] een rondje bewaart telling en sterren, Pauze zegt het, en opnieuw starten gaat verder', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    await rondjeGoed(a, 2);
    a.tik('backBtn');
    await wacht(500);
    check('melding "Bewaard ... opdracht 3"', /Bewaard/.test(toastTekst(a)) && /opdracht 3\b/.test(toastTekst(a)));
    check('er staat een rondje in ' + RONDJES, !!opgeslagen(a, RONDJES));
    const b = herlaad(a);
    await wacht();
    await startOefening(b, 'scan');
    check('verder bij opdracht 3', /opdracht 3 van 5/i.test(tekstVan(b, 'roundChip')));
    check('de sterren van het rondje staan er nog (6)', /\b6\b/.test(tekstVan(b, 'drillStars')));
  });

  await nogNiet('[1.6] een rondje dat af is telt als topronde in de week waarin het af is', async function (check) {
    zetDatum('2026-11-15T19:00:00');
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 2);
    a.tik('backBtn');
    await wacht();
    zetDatum('2026-11-16T09:00:00');
    const b = herlaad(a);
    await wacht();
    b.ev('closeModal()');
    await startOefening(b, 'scan');
    await rondjeGoed(b, 3);
    await volgende(b);
    await naarHuis(b);
    check('telt in de nieuwe week: 1 van 2', /1\s*(\/|van)\s*2/.test(wekelijks(b)));
  });

  await nogNiet('[1.6] een rondje is af bij het vijfde antwoord: wie dan weggaat, laat geen opdracht 6 achter', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    for (let i = 0; i < 8 && a.ziet('LEVEL OMHOOG'); i++) a.tik('lvlOk');
    a.tik('backBtn');
    await wacht();
    check('Pauze zegt dat het rondje klaar is', /Rondje klaar/.test(toastTekst(a)));
    check('er blijft geen rondje staan', opgeslagen(a, RONDJES) === null && tekstVan(a, 'verder') === '');
    check('de topronde telt meteen', /1\s*(\/|van)\s*2/.test(wekelijks(a)));
    await startOefening(a, 'scan');
    check('een nieuw rondje begint bij opdracht 1', /opdracht 1 van 5/i.test(tekstVan(a, 'roundChip')));
  });

  await nogNiet('[1.6] een openingsles bewaart alleen de sterren en zegt dat', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'opening');
    const pad = a.el('modalBox').querySelectorAll('[data-pad]')[0];
    if (pad) tikEl(a, pad, 'een openingspad');
    await wacht();
    check('in de les', opSpeelscherm(a));
    a.tik('backBtn');
    await wacht(500);
    check('melding over de sterren en de les', /sterren zijn bewaard/.test(toastTekst(a)) &&
      /De les begint de volgende keer opnieuw/.test(toastTekst(a)));
  });

  await nogNiet('[1.7] een bewaard potje staat op de Verder-kaart, één tik speelt verder', async function (check) {
    const zetten = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const a = nieuwKind({ opslag: opslagMetPotje(2, zetten) });
    await wacht();
    check('de kaart staat er en noemt Turbo en de zet', zichtbaar(a, 'verder') && /Turbo/.test(tekstVan(a, 'verder')) &&
      /Zet 3\b/.test(tekstVan(a, 'verder')));
    a.tik('verderKaart');
    await wacht();
    check('één tik: verder in dezelfde stand', opSpeelscherm(a) && a.fen() === toFEN(naSpelen(zetten)));
  });

  await nogNiet('[1.7] met een potje zegt een regel dat het op dit apparaat blijft', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    await wacht();
    check('"blijft staan op deze ..."', /blijft staan op (deze|dit) /.test(tekstVan(a, 'verder')));
  });

  await nogNiet('[1.7] alleen een rondje: de kaart noemt het rondje en gaat verder bij die opdracht', async function (check) {
    const a = nieuwKind();
    check('zonder iets bezig geen "Verder:"', tekstVan(a, 'verder').indexOf('Verder:') < 0);
    await startOefening(a, 'scan');
    await rondjeGoed(a, 2);
    a.tik('backBtn');
    await wacht();
    check('het rondje op de kaart', zichtbaar(a, 'verder') && /Speurogen/.test(tekstVan(a, 'verder')) &&
      /Opdracht 3 van 5/i.test(tekstVan(a, 'verder')));
    a.tik('verderKaart');
    await wacht();
    check('verder bij opdracht 3', opSpeelscherm(a) && /opdracht 3 van 5/i.test(tekstVan(a, 'roundChip')));
  });

  await nogNiet('[1.7] een potje en een rondje: het potje eerst, het rondje als "Ook nog"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    await rondjeGoed(a, 1);
    a.tik('backBtn');
    await wacht();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    a.tik('backBtn');
    await wacht();
    const t = tekstVan(a, 'verder');
    check('het potje vooraan', t.indexOf('Turbo') >= 0 && t.indexOf('Turbo') < t.indexOf('Ook nog'));
    check('het rondje als "Ook nog"', /Ook nog[^]*Speurogen/.test(t));
  });

  await nogNiet('[1.8] elke plek begint bovenaan', async function (check) {
    const a = nieuwKind();
    const bovenaan = function () { const s = __scrolls.slice(); __scrolls.length = 0; return s.some(function (x) { return x.top === 0; }); };
    __scrolls.length = 0;
    await startPotje(a, 1);
    check('een potje', bovenaan());
    a.tik('backBtn');
    await wacht();
    check('terug op Spelen', bovenaan());
    await startOefening(a, 'scan');
    check('een rondje', bovenaan());
    a.tik('backBtn');
    await wacht();
    a.tik('tabIk');
    check('een tab', bovenaan());
  });

  /* B24: wat een verlaten opdracht nog had klaarstaan, mag het nieuwe potje niet raken */
  async function nieuwPotjeIsSchoon(check, a) {
    /* meteen een nieuw potje, voordat de keten van de opdracht afloopt */
    if (heeftKlik(a, 'spelTurbo')) a.tik('spelTurbo'); else a.ev('startGameFlow()');
    const knop = a.el('modalBox').querySelectorAll('[data-lvl="1"]')[0];
    if (knop) tikEl(a, knop, 'niveau 1');
    await wacht();
    check('het nieuwe potje begint in de beginstand', a.fen() === START_FEN_O);
    check('jij bent aan zet', a.get('session && session.S.turn') === 'w' && a.get('session.kind') === 'game');
    const gelukt = zet(a, 'e2e4');
    await wacht();
    check('de eerste zet gaat', gelukt && a.get('session.S.hist.length') === 2 && a.get('session.S.turn') === 'w');
  }

  await nogNiet('[1.9] een mat in twee verlaten na de eerste zet raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    zet(a, 'c6b6');
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await nogNiet('[1.9] De Beste Zet verlaten na een foute keus raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    const fout = a.get('session.task.options.findIndex(function (o) { return o !== session.task.best; })');
    const knop = a.el('optionsBox').querySelectorAll('.opt-btn[data-i="' + fout + '"]')[0];
    check('de opties zijn aan te tikken', !!knop);
    if (knop) tikEl(a, knop, 'een foute optie');
    tikTekst(a, 'Deze kies ik');
    drainTimers(400, 50);
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await nogNiet('[1.9] Koning ontsnapt verlaten na een foute zet raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '1r4k1/8/8/8/8/8/r6P/6K1 w - - 0 1', 'mat1', ['h2h3', 'h2h4']);
    zet(a, 'g1f1');
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await nogNiet('[1.10] in een mat in twee gaat de tweede zet met tikken', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    const voor = a.get('session.earned');
    zet(a, 'c6b6');
    await wacht();
    check('Turbo heeft geantwoord, jij geeft mat', a.get('session.S.hist.length') === 2);
    const matzet = a.get('(function () { var S = session.S; var m = legalMoves(S).find(function (x) { makeMove(S, x); var mat = gameStatus(S).reason === "mat"; unmakeMove(S); return mat; }); return m ? moveKey(m) : null; })()');
    zet(a, matzet);
    await wacht();
    check('de matzet met tikken telt: mat en drie sterren', a.get('gameStatus(session.S).reason') === 'mat' &&
      a.get('session.earned') - voor === 3);
  });

  /* Koning ontsnapt: een foute zet waarop Turbo niet mat geeft en niets slaat,
     zodat de app zijn antwoord moet benoemen (B01) */
  function fouteZetZonderMat(fen, antwoorden) {
    const S = parseFEN(fen);
    for (const m of legalMoves(S)) {
      if (antwoorden.indexOf(moveKey(m)) >= 0) continue;
      makeMove(S, m);
      const reply = rootScores(S, 2)[0];
      let goed = false;
      if (reply) {
        const cap = !!S.board[reply.m.to];
        makeMove(S, reply.m);
        goed = !gameStatus(S).over && !cap;
        unmakeMove(S);
      }
      unmakeMove(S);
      if (goed) return moveKey(m);
    }
    return null;
  }
  /* de toren op a1 hangt (loper c3); veilig zijn de torenzetten die de loper niet raakt */
  const STUK_FEN = '6k1/8/8/8/8/2b5/6P1/R5K1 w - - 0 1';
  const STUK_REDDING = ['a1a2', 'a1a3', 'a1a4', 'a1a6', 'a1a7', 'a1a8', 'a1b1', 'a1c1', 'a1d1', 'a1f1'];
  const schaakTaak = KONING_POOL.find(function (x) { return x.type === 'schaak' && fouteZetZonderMat(x.fen, x.answers); });
  const matTaak = KONING_POOL.find(function (x) { return x.type === 'mat1'; });
  /* het laatste veld: deze vorm bevriest vandaag al niet, dus de regel staat voor hem als gebouwd */
  const koningGevallen = [
    /* hier noemt de app Turbo's zet nadat hij al gespeeld is: B01 */
    ['een schaak-opdracht, Turbo antwoordt rustig', 'schaak', schaakTaak.fen, schaakTaak.answers, fouteZetZonderMat(schaakTaak.fen, schaakTaak.answers), null, false],
    ['een matdreiging, Turbo geeft mat', 'mat1', matTaak.fen, matTaak.answers,
      moveKey(legalMoves(parseFEN(matTaak.fen)).find(function (m) { return matTaak.answers.indexOf(moveKey(m)) < 0; })), null, true],
    ['een hangend stuk, Turbo slaat', 'stuk', STUK_FEN, STUK_REDDING, 'g1h1', '{ hang: threatDetails(S)[0] }', true]
  ];
  /* de tekst die het kind bij de opdracht leest, waar die in deze bouw ook staat */
  const uitleg = function (a) {
    return ['bubble', 'strook', 'onder'].filter(function (id) { return zichtbaar(a, id); }).map(function (id) { return tekstVan(a, id); }).join(' ').trim();
  };
  /* De woorden van de uitleg horen bij regel 5.5; hier: niets bevriest, Turbo's
     antwoord staat op het bord, een uitleg vervangt de openingszin, en de
     opdracht gaat door (nog een poging, of het antwoord staat er). */
  for (const geval of koningGevallen) {
    await (geval[6] ? regel : nogNiet)('[1.11] Koning ontsnapt, ' + geval[0] + ': niets bevriest, Turbo antwoordt op het bord, een uitleg vervangt de openingszin en de opdracht gaat door', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, geval[2], geval[1], geval[3], geval[5]);
      const opening = uitleg(a), h0 = a.get('session.S.hist.length');
      check('testopzet: er staat een openingszin', opening !== '');
      zet(a, geval[4]);
      const opBord = await zagOoit(function () {
        return a.get('session.S.hist.length') === h0 + 2 && a.get('moveKey(session.S.hist[' + h0 + '].m)') === geval[4];
      }, 5000);
      check('Turbo\'s antwoord staat op het bord', opBord);
      const na = uitleg(a);
      check('een uitleg vervangt de openingszin', na !== '' && na.indexOf(opening) < 0);
      if (a.get('session.phase') === 'puzzle') {
        check('nog een poging gaat met tikken', zet(a, geval[3][0]));
        await wacht();
      }
      check('de opdracht gaat door tot het antwoord', a.get('session.phase') === 'review' && kanTikken(a, 'Volgende'));
    });
  }

  await nogNiet('[1.12] een topronde telt voor het weekdoel toprondes', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    await volgende(a);
    await naarHuis(a);
    check('het doel staat op 1 van 2', /1\s*(\/|van)\s*2/.test(wekelijks(a)));
  });

  await nogNiet('[1.12] compat: de toprondes die Lotte al haalde, tellen meteen (1 van 2)', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const dev = '8b5e441a-6545-4b80-9242-b3db318e11af', een = function (n) { const o = {}; o[dev] = n; return o; };
    const doc = { v: 2, epoch: 0,
      cnt: { xp: een(2565), stars: een(230), wins: een(9), 'c.gamesPlayed': een(31), 'c.pat.mat2': een(3),
        'wk.2026-W45.top.trucs': een(1), 'wk.2026-W46.top.trucs': een(1), 'wk.2026-W46.top.scan': een(0) },
      set: { badges: { vlam: true, trucs: true, potje: true, winst: true, sterren: true, speurneus: true } },
      lww: { name: { v: 'Lotte', t: 1791210600353 }, weekGoal: { v: { kind: 'top', n: 2, game: 'trucs' }, t: 1791989040004 },
        theme: { v: 'bos', t: 1794411840002 } },
      max: { best: 44, goal: {} }, friends: {},
      loc: { streak: 0, lastLevel: 2, day: { date: '2026-10-11', winsByLvl: { 1: 1, 2: 0, 3: 0 } }, weekSeen: '2026-W46' } };
    const o = maakOpslag();
    o.setItem('schaakheld1', JSON.stringify(doc));
    const a = maakApparaat('Lotte', { opslag: o, herstart: true });
    await wacht();
    a.ev('closeModal()');
    check('Lotte staat op 1 van 2', /1\s*(\/|van)\s*2/.test(wekelijks(a)));
    check('en verloor niets', a.get('P.xp') === 2565 && a.get('P.stars') === 230 && a.get('Object.keys(P.badges).length') === 6);
  });

  await nogNiet('[1.14] een melding verdwijnt als er een venster opengaat', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    a.tik('backBtn');
    await wacht(100);
    check('eerst een melding', toastTekst(a) !== '');
    a.tik('setBtn');
    await wacht(100);
    check('weg zodra het venster open is', a.open() && toastTekst(a) === '');
  });

  /* ================= increment 2 ================= */

  await nogNiet('[2.3] ⋯ houdt Remise aanbieden, Opgeven en de Puntenwijzer; de hulpjes staan onder het bord', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    a.tik('verderKaart');
    await wacht();
    const balk = gedeeldeOuder(a, 'backBtn', 'meerBtn');
    check('de balk met Pauze en ⋯ noemt tegen wie je speelt', !!balk && /Turbo/.test(a.doc.__tekst(balk)));
    const zicht = knopTeksten(a).join(' | ');
    check('Denkwolk, Speurbril en Zet terug in de rij', /Denkwolk/.test(zicht) && /Speurbril/.test(zicht) && /Zet terug/.test(zicht));
    check('Opgeven en Remise niet in de rij', !/Opgeven/.test(zicht) && !/Remise/.test(zicht));
    a.tik('meerBtn');
    await wacht();
    const menu = knopTeksten(a).join(' | ');
    check('achter ⋯', /Remise aanbieden/.test(menu) && /Opgeven/.test(menu) && /Puntenwijzer/.test(menu));
  });

  await nogNiet('[2.3] de schakelaars voor blunderalarm en voorspellen staan in Instellingen en houden hun waarde', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("predict", false); setPref("guard", true)');
    check('niet meer op het speelscherm', !/tglPredict|tglGuard/.test(a.els['scr-play']._html || ''));
    a.tik('setBtn');
    await wacht();
    check('wel in Instellingen', /Voorspellen/.test(a.scherm()) && /alarm/i.test(a.scherm()));
    const b = herlaad(a);
    check('de opgeslagen waarden blijven', b.get('P.predict') === false && b.get('P.guard') === true);
  });

  /* de regel in het blad met geslagen stukken komt uit outline.md en interaction.md */
  const materiaal = [
    ['jij staat een pion voor', ['e2e4', 'd7d5', 'e4d5', 'g8f6'], /Jij \+1/, /Jij pakte 1 punt meer dan Turbo\./],
    ['Turbo staat een pion voor', ['e2e4', 'd7d5', 'd2d3', 'd5e4'], /Turbo \+1/, /Turbo pakte 1 punt meer dan jij\./]
  ];
  for (const geval of materiaal) {
    await nogNiet('[2.3] het materiaalverschil in de balk: ' + geval[0], async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(1, geval[1]) });
      a.tik('verderKaart');
      await wacht();
      check('de balk zegt het', zichtbaar(a, 'materiaal') && geval[2].test(tekstVan(a, 'materiaal')));
      a.tik('materiaal');
      await wacht();
      check('tikken laat de geslagen stukken zien, met wat het verschil betekent', a.open() && geval[3].test(a.scherm()));
    });
  }

  await nogNiet('[2.3] bij gelijk materiaal staat er geen verschil', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    a.tik('verderKaart');
    await wacht();
    check('in een potje, met een plek voor het materiaal', opSpeelscherm(a) && 'materiaal' in a.els);
    check('verborgen bij gelijk', !zichtbaar(a, 'materiaal') || !/\+\d/.test(tekstVan(a, 'materiaal')));
  });

  await nogNiet('[2.4] na een antwoord staat de uitleg onder het bord met Volgende bovenaan, en de eerste reden in de strook', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    tikTekst(a, 'Klaar');
    await wacht();
    const onder = a.el('onder');
    const eerste = onder.querySelectorAll('button').concat(onder.children || []).filter(function (k) { return !tikbaar(a, k); })[0];
    check('Volgende is de eerste knop onder het bord', !!eerste && /Volgende/.test(knopTekst(a, eerste)));
    check('de strook zegt wat er gemist is', /Gemist/.test(tekstVan(a, 'strook')));
  });

  await nogNiet('[2.5] het einde van een potje is een kaart over het bord, met Revanche!, Naar huis en nieuwe trofeeën', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    a.tik('verderKaart');
    await wacht();
    const voor = a.get('Object.keys(P.badges)');
    await zetEnWacht(a, 'd1h5');
    const nieuw = a.get('Object.keys(P.badges)').filter(function (b) { return voor.indexOf(b) < 0; });
    const namen = nieuw.map(function (b) { return a.get('BADGES.find(function (x) { return x.id === ' + JSON.stringify(b) + '; }).n'); });
    const kaart = tekstVan(a, 'eindkaart');
    check('een kaart, geen venster', zichtbaar(a, 'eindkaart') && !a.open());
    check('Revanche! en Naar huis', /Revanche!/.test(kaart) && /Naar huis/.test(kaart));
    check('het resultaat (learning.md 3: "Gewonnen!")', /Gewonnen!/.test(kaart));
    check('wat er verdiend is', /XP/.test(kaart));
    check('nieuwe trofeeën in de kaart, niet als melding', namen.length > 0 && namen.every(function (n) {
      return kaart.indexOf(n) >= 0 && toastTekst(a).indexOf(n) < 0;
    }));
  });

  await regel('[2.6] de zeven bordkleuren houden id, naam en het level dat ze opent; een gekozen kleur blijft gekozen', async function (check) {
    const a = nieuwKind();
    const thema = a.get('THEMES.map(function (t) { return [t.id, t.naam, t.lvl]; })');
    check('dezelfde zeven', JSON.stringify(thema) === JSON.stringify([['munt', 'Munt', 0], ['oceaan', 'Oceaan', 1],
      ['bos', 'Bos', 2], ['snoep', 'Snoep', 3], ['lava', 'Lava', 4], ['goud', 'Goud', 5], ['ruimte', 'Ruimte', 6]]));
    a.ev('setPref("theme", "bos")');
    check('na herladen nog gekozen', herlaad(a).get('P.theme') === 'bos');
  });

  await nogNiet('[2.8] de voorspelvraag neemt de zet niet af: Turbo wacht op een tik', async function (check) {
    const echt = Math.random;
    Math.random = function () { return 0.1; };
    try {
      const a = maakApparaat('Mees');
      a.ev('setPref("guard", false); setPref("predict", true)');
      await startPotje(a, 1);
      zet(a, 'e2e4');
      await wacht(20000);
      check('Turbo vraagt en wacht', a.get('session.S.hist.length') === 1);
      check('"Speel maar" staat in beeld', kanTikken(a, 'Speel maar'));
      tikTekst(a, 'Speel maar');
      await wacht();
      check('na "Speel maar" zet Turbo', a.get('session.S.hist.length') === 2);
    } finally { Math.random = echt; }
  });

  await nogNiet('[2.8] de voorspelvraag: een tik op een stuk van Turbo is het antwoord, en dan zet Turbo', async function (check) {
    const echt = Math.random;
    Math.random = function () { return 0.1; };
    try {
      const a = maakApparaat('Mees');
      a.ev('setPref("guard", false); setPref("predict", true)');
      await startPotje(a, 1);
      zet(a, 'e2e4');
      await wacht(20000);
      check('Turbo vraagt en wacht', a.get('session.S.hist.length') === 1);
      tikVeld(a, a.get('sqFromAlg("g8")'));
      await wacht();
      check('na een tik op zijn paard zet Turbo', a.get('session.S.hist.length') === 2);
    } finally { Math.random = echt; }
  });

  await nogNiet('[2.8] de Speurbril-randjes blijven tot je volgende zet', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5', 'g1f3', 'b8c6']) });
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht(20000);
    check('na lang kijken nog aan', a.get('BD.spy.size') > 0);
    await zetEnWacht(a, 'f1c4');
    check('na je zet weg', a.get('BD.spy.size') === 0);
  });

  /* ================= increment 3 ================= */

  const NU = new __EchteDate('2026-11-12T16:00:00').getTime();
  const dagenTerug = function (n) { return new __EchteDate(NU - n * 86400000).toISOString().slice(0, 10); };
  async function stap(a, ctx) {
    return a.get('nextStep(P, ' + JSON.stringify(Object.assign({ now: NU, potje: null, rondjes: null, samen: null, uitnodiging: null, moment: null }, ctx || {})) + ')');
  }

  await nogNiet('[3.1] geval 1: nieuw, antwoord "nieuw": R6, Speurogen, "Nieuw voor jou."', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("start", "nieuw")');
    const r = await stap(a);
    check('R6 Speurogen', r.rule === 'R6' && /Speurogen/.test(r.title) && r.action.kind === 'scan');
    check('de reden', /Nieuw voor jou\./.test(r.text));
  });

  await nogNiet('[3.1] geval 2: nieuw, antwoord "sterk": R7 tegen Turbo, niet Super Turbo', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("start", "sterk")');
    const r = await stap(a);
    check('R7 op niveau 2', r.rule === 'R7' && r.action.go === 'game' && r.action.level === 2);
    check('de zin', /Win je van Turbo, dan wacht Super Turbo\./.test(r.text) && !/Super Turbo/.test(r.button));
  });

  await nogNiet('[3.1] geval 3: een bestaand profiel zonder start en twee keer Turbo verslagen: sterk, nooit gevraagd', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 1200); bump("wins", 2); bump("c.winsL2", 2); bump("c.gamesPlayed", 9)');
    const r = await stap(a);
    check('R7 bij Turbo (stadium sterk)', r.rule === 'R7' && r.action.level === 2);
    const b = herlaad(a);
    await wacht();
    check('geen vraag hoe goed je schaakt', !/Hoe goed ken je schaken/.test(b.modal()));
  });

  await nogNiet('[3.1] geval 4: wat bezig is gaat voor, in de volgorde van de kaart', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('P.lastSeen = ' + JSON.stringify(dagenTerug(5)));
    const potje = { v: 1, level: 2, moves: ['e2e4', 'e7e5'], tips: 3, drawAsked: null, started: NU, updated: NU };
    const samen = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'], peerName: 'Fien', viaFriend: true, updated: NU };
    const rondjes = { scan: { round: 2, earned: 6 } };
    let r = await stap(a, { potje: potje });
    check('R2 gaat voor R3', r.rule === 'R2');
    r = await stap(a, { potje: potje, samen: samen });
    check('R1 met "Ook nog" voor het potje', r.rule === 'R1' && /Fien/.test(r.title) && (r.ook || []).some(function (x) { return /Turbo/.test(x); }));
    r = await stap(a, { potje: potje, rondjes: rondjes });
    check('R2 met "Ook nog" voor het rondje', r.rule === 'R2' && (r.ook || []).some(function (x) { return /Speurogen/.test(x); }));
    r = await stap(a, { rondjes: rondjes });
    check('R2b bij opdracht 3', r.rule === 'R2b' && /Opdracht 3 van 5/.test(r.text));
  });

  await nogNiet('[3.1] geval 5: vier dagen weg: R3 met het level', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5)');
    a.ev('P.lastSeen = ' + JSON.stringify(dagenTerug(4)));
    const r = await stap(a);
    check('R3 welkom terug met Loper', r.rule === 'R3' && /Welkom terug, Mees!/.test(r.title) && /Loper/.test(r.text));
  });

  await nogNiet('[3.1] geval 6: weekdoel potjes 3, er staan er 2: R4 "Nog 1 potje tegen ..."', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); setPref("weekGoal", { kind: "potjes", n: 3, lvl: 2 }); bumpWeek("potjes2", 2)');
    const r = await stap(a);
    check('R4', r.rule === 'R4' && /Nog 1 potje tegen/.test(r.text));
  });

  await nogNiet('[3.1] geval 7: na een potje zonder sleutelmoment: R6, niet de laatst geoefende', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); logResult("scan", 0.5, 20000, 3); P.lastKind = "game"');
    const r = await stap(a);
    check('R6, niet Speurogen', r.rule === 'R6' && r.action.kind !== 'scan');
  });

  await nogNiet('[3.1] geval 8: na Speurogen: R7, nooit R6 Speurogen', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.gamesPlayed", 5); P.lastKind = "scan"');
    const r = await stap(a);
    check('R7', r.rule === 'R7');
  });

  await nogNiet('[3.1] geval 9: genoeg XP voor Toren maar Turbo niet verslagen: R7 op niveau 2, "Win je, dan word je Toren"', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 950); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "scan"');
    const r = await stap(a);
    check('R7, niveau 2, de zin', r.rule === 'R7' && r.action.level === 2 && /Win je, dan word je Toren/.test(r.text));
  });

  await nogNiet('[3.1] geval 10: twee oefeningen gelijk: de eerste in de leervolgorde', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game";' +
      '["scan", "koning", "opening"].forEach(function (k) { logResult(k, 0.5, 20000, 3); logResult(k, 0.5, 20000, 3); })');
    const r = await stap(a);
    check('De Beste Zet voor de Trucendoos', r.rule === 'R6' && r.action.kind === 'best3');
  });

  /* learning.md 1.7: zolang de poort "5 perfecte speurrondes" open is, kiest R6
     eerst Speurogen, ook als dat de laatst geoefende is; R7 speelt dan L* */
  await nogNiet('[3.1] de poort "5 perfecte speurrondes" staat open: R6 kiest Speurogen, R7 speelt tegen Turbo', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.gamesPlayed", 5); logResult("scan", 0.5, 20000, 3); P.lastKind = "game"');
    let r = await stap(a);
    check('R6 Speurogen', r.rule === 'R6' && r.action.kind === 'scan');
    a.ev('P.lastKind = "scan"');
    r = await stap(a);
    check('R7 op niveau 2', r.rule === 'R7' && r.action.go === 'game' && r.action.level === 2);
  });

  /* de kaart zelf: zij toont wat nextStep zegt, en haar knop doet het */
  async function kaartMetSuggestie(check, start) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("start", ' + JSON.stringify(start) + ')');
    const b = herlaad(a);
    await wacht();
    const r = await stap(b);
    const kaart = tekstVan(b, 'verder');
    check('de kaart toont de titel en de zin van de suggestie', zichtbaar(b, 'verder') && !!r.title && !!r.text &&
      kaart.indexOf(r.title) >= 0 && kaart.indexOf(r.text) >= 0);
    check('en haar knop', zichtbaar(b, 'verderKaart') && !!r.button && tekstVan(b, 'verderKaart').indexOf(r.button) >= 0);
    b.tik('verderKaart');
    await wacht();
    return b;
  }

  await nogNiet('[3.1] de Verder-kaart met een potje als suggestie: één tik start het potje', async function (check) {
    const b = await kaartMetSuggestie(check, 'sterk');
    check('een potje tegen Turbo op niveau 2', opSpeelscherm(b) && b.get('session.kind') === 'game' && b.get('session.level') === 2);
  });

  await nogNiet('[3.1] de Verder-kaart met een oefening als suggestie: één tik start Speurogen', async function (check) {
    const b = await kaartMetSuggestie(check, 'nieuw');
    check('Speurogen begint', opSpeelscherm(b) && b.get('session.kind') === 'scan' && /opdracht 1 van 5/i.test(tekstVan(b, 'roundChip')));
  });

  /* learning.md 1.4: lastKind wordt gezet als een rondje af is, of het kind de kaart volgde of niet */
  await nogNiet('[3.2] na een rondje Speurogen stelt de kaart een potje voor, niet weer Speurogen', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5)');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    await volgende(a);
    await naarHuis(a);
    check('het rondje is onthouden als het laatste', a.get('P.lastKind') === 'scan');
    const r = await stap(a);
    check('de suggestie is een potje', r.rule === 'R7' && r.action.go === 'game');
    check('en de kaart zegt het', opThuis(a) && tekstVan(a, 'verder').indexOf(r.title) >= 0 && !/Speurogen/.test(tekstVan(a, 'verder')));
  });

  await nogNiet('[3.2] alle vijf oefeningen en beide spelknoppen staan op Spelen, wat de kaart ook zegt', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    const ids = ['spelTurbo', 'spelVriend', 'oefen-scan', 'oefen-best3', 'oefen-trucs', 'oefen-koning', 'oefen-opening'];
    check('elk een knop die werkt', ids.every(function (id) { return heeftKlik(a, id) && zichtbaar(a, id); }));
    a.tik('oefen-scan');
    await wacht();
    check('Speurogen begint', opSpeelscherm(a) && /opdracht 1 van 5/i.test(tekstVan(a, 'roundChip')));
  });

  await nogNiet('[3.4] de levelchip in de kop opent Ik', async function (check) {
    const a = nieuwKind();
    a.tik('lvlChip');
    check('Ik staat open', zichtbaar(a, 'view-ik') && !zichtbaar(a, 'view-spelen'));
  });

  const docVan = function (naam, cnt, extra) {
    const dev = 'aaaabbbb-cccc-dddd-eeee-ffff00001111', o = {};
    for (const k in cnt) { o[k] = {}; o[k][dev] = cnt[k]; }
    return Object.assign({ v: 2, epoch: 0, cnt: o, set: { badges: {} }, lww: { name: { v: naam, t: 1 } },
      max: { best: 0, goal: {} }, friends: {}, loc: { streak: 0, lastLevel: null, weekSeen: '2026-W46' } }, extra || {});
  };
  async function kindUitDoc(doc) {
    zetDatum('2026-11-12T16:00:00');
    const o = maakOpslag();
    o.setItem('schaakheld1', JSON.stringify(doc));
    const a = maakApparaat(null, { opslag: o, herstart: true });
    await wacht();
    a.ev('closeModal()');
    return a;
  }

  await nogNiet('[3.5] Ik: XP en de meesterproef als twee aparte controles (Mees)', async function (check) {
    const a = await kindUitDoc(docVan('Mees', { xp: 1800, stars: 69, wins: 6, 'c.winsL2': 2, 'c.perfectScans': 8, 'c.gamesPlayed': 25 },
      { max: { best: 10, goal: { '2026-W42': 60, '2026-W43': 60, '2026-W44': 60, '2026-W45': 60 } } }));
    a.tik('tabIk');
    const t = tekstVan(a, 'levelPath') + ' ' + tekstVan(a, 'lpNext');
    check('de XP is gehaald', /✔\s*1800 XP/.test(t));
    check('de proef staat nog open, 2 van 3', /Nog te doen[^]*versla Turbo[^]*2 van 3/.test(t));
  });

  await nogNiet('[3.5] Ik: XP en de meesterproef als twee aparte controles (Lotte)', async function (check) {
    const a = await kindUitDoc(docVan('Lotte', { xp: 2565, stars: 230, wins: 1, 'c.perfectScans': 13, 'c.gamesPlayed': 7 }));
    a.tik('tabIk');
    const t = tekstVan(a, 'levelPath') + ' ' + tekstVan(a, 'lpNext');
    check('de XP is gehaald', /✔\s*900 XP/.test(t));
    check('de proef staat nog open, 0 van 1', /Nog te doen[^]*versla Turbo[^]*0 van 1/.test(t));
  });

  await nogNiet('[3.5] Ik zegt wat er bewaard is en waar', async function (check) {
    const a = nieuwKind();
    a.tik('tabIk');
    check('de bewaard-regel', /bewaard|staat op deze/i.test(tekstVan(a, 'ikBewaard')) &&
      /blijft op dit apparaat/.test(tekstVan(a, 'ikBewaard')));
  });

  await nogNiet('[3.6] het getal dat het level bepaalt heet XP, zonder ster', async function (check) {
    const a = nieuwKind();
    const kop = a.doc.__ouderTekst(a.els.xpNum);
    check('in de kop staat XP bij het getal, zonder ster', /XP/.test(kop) && !/⭐/.test(kop));
    a.tik('tabIk');
    const pad = tekstVan(a, 'levelPath') + ' ' + tekstVan(a, 'lpNext');
    check('op het levelpad XP', /XP/.test(pad) && !/\d+\s*⭐/.test(pad));
    await startOefening(a, 'scan');
    for (const sq of a.get('session.task.targets.slice()')) tikVeld(a, sq);
    tikTekst(a, 'Klaar');
    const zwevend = function () { return (a.doc.body.children || []).some(function (c) { return /\+\d+ XP/.test(a.doc.__tekst(c)); }); };
    check('de zwevende winst zegt XP', await zagOoit(zwevend, 3000));
    check('de trofee voor 100 sterren telt sterren', /100 sterren/.test(a.get('BADGES.find(function (b) { return b.id === "sterren"; }).d')));
  });

  await nogNiet('[3.7] geen reeks in een rondje en geen reeksbonus meer: drie goede antwoorden geven 90 XP', async function (check) {
    const a = nieuwKind();
    const xp = a.get('P.xp');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 3);
    check('geen "op een rij"', !/op een rij/.test(tekstVan(a, 'drillStars')));
    check('geen vorm tijdens het rondje', !/Vorm/i.test(tekstVan(a, 'drillStars')));
    check('90 XP zonder bonus', a.get('P.xp') - xp === 90);
  });

  await nogNiet('[3.7] Vuurpijl: 25 opdrachten met drie sterren, in de nieuwe teller c.drie', async function (check) {
    const a = nieuwKind();
    a.ev('bump("c.drie", 24)');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('c.drie telt mee', a.get('P.c.drie') === 25);
    check('Vuurpijl verdiend', a.get('!!P.badges.vlam'));
    check('de tekst', /25 opdrachten met 3 sterren/.test(a.get('BADGES.find(function (b) { return b.id === "vlam"; }).d')));
  });

  await nogNiet('[3.7] compat: een document van nu met best 6 houdt Vuurpijl', async function (check) {
    const a = await kindUitDoc(docVan('Daan', { xp: 2710, stars: 70, 'c.pat.penning': 3 },
      { set: { badges: { vlam: true } }, max: { best: 6, goal: {} }, loc: { streak: 4, lastLevel: 3, weekSeen: '2026-W46' } }));
    check('Vuurpijl blijft', a.get('!!P.badges.vlam') && a.get('P.best') === 6);
    check('en de nieuwe teller bestaat', a.get('P.c.drie') === 0);
  });

  await nogNiet('[3.8] Instellingen: naam, bordkleur, geluid, de twee hulpjes, ander apparaat, en Alles wissen als laatste', async function (check) {
    const a = nieuwKind();
    a.tik('setBtn');
    await wacht();
    const h = a.scherm();
    const plek = ['Naam', 'Bordkleur', 'Geluid', 'Blunder', 'Voorspellen', 'ander apparaat', 'Alles wissen'].map(function (w) { return h.indexOf(w); });
    check('alles staat erin', plek.every(function (i) { return i >= 0; }));
    check('Alles wissen als laatste', plek[6] === Math.max.apply(null, plek));
    const veld = a.el('modalBox').querySelectorAll('input')[0];
    if (veld) { vulIn(a, veld, 'Mees de Grote'); fire(veld, 'change', { target: veld }); }
    await wacht();
    check('de naam is te veranderen', a.get('P.name') === 'Mees de Grote');
  });

  await nogNiet('[3.9] de kaart van een nieuwe week begint nooit met een nul', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "opdr", n: 10 })');
    /* de app onthoudt de week pas bij een start met een naam: nog een keer
       openen in de eerste week, zoals een kind dat doet */
    const a2 = herlaad(a);
    await wacht();
    zetDatum('2026-11-17T09:00:00');
    const b = herlaad(a2);
    await wacht();
    check('testopzet: er is een kaart van de nieuwe week', b.open() && /week/i.test(b.scherm()));
    check('nieuwe week, nieuwe kansen', /Nieuwe week, nieuwe kansen/.test(b.scherm()) && !/\b0 van 10\b/.test(b.scherm()));
  });

  await nogNiet('[3.9] een gehaald doel: "Vorige week: doel gehaald!"', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "opdr", n: 2 }); bumpWeek("opdr", 2)');
    const a2 = herlaad(a);
    await wacht();
    zetDatum('2026-11-17T09:00:00');
    const b = herlaad(a2);
    await wacht();
    check('testopzet: er is een kaart van de nieuwe week', b.open() && /week/i.test(b.scherm()));
    check('de zin', /Vorige week: doel gehaald!/.test(b.scherm()));
  });

  await nogNiet('[3.10] compat: een document van nu laadt met alles, krijgt geen vraag, en de nieuwe velden komen erbij', async function (check) {
    const doc = docVan('Daan', { xp: 2710, stars: 70, wins: 12, 'c.winsL2': 4, 'c.winsL3': 1, 'c.pat.penning': 3, 'c.gamesPlayed': 40 },
      { set: { badges: { vlam: true, winst: true } }, lww: { name: { v: 'Daan', t: 1 }, theme: { v: 'lava', t: 1 } },
        max: { best: 6, goal: {} }, loc: { streak: 4, lastLevel: 3, weekSeen: '2026-W46' } });
    const a = await kindUitDoc(doc);
    check('alles van vroeger', a.get('P.xp') === 2710 && a.get('P.stars') === 70 && a.get('P.c.pat.penning') === 3 &&
      a.get('!!P.badges.vlam') && a.get('P.theme') === 'lava');
    check('geen vraag hoe goed je schaakt', !/Hoe goed ken je schaken/.test(a.modal()));
    const r = await stap(a);
    check('het stadium komt uit de geschiedenis', !!r && typeof r.rule === 'string');
    await startOefening(a, 'scan');
    await scanGoed(a);
    a.tik('backBtn');
    await wacht();
    const opgeslagen1 = opgeslagen(a, 'schaakheld1');
    check('de nieuwe teller c.drie staat in het document', !!opgeslagen1.cnt['c.drie']);
    check('lastKind en lastSeen per apparaat', !!opgeslagen1.loc && 'lastSeen' in opgeslagen1.loc);
    check('de oude tellers staan er nog', !!opgeslagen1.cnt['c.pat.penning'] && !!opgeslagen1.cnt['c.winsL3']);
  });

  /* ================= increment 4 (wat op een apparaat te zien is) ================= */

  const koppelInvoer = [
    ['met streepjes', 'lang-beloven-kaal-neer'],
    ['met spaties', 'lang beloven kaal neer'],
    ['geplakt, met komma\'s', 'lang, beloven, kaal, neer']
  ];
  for (const geval of koppelInvoer) {
    await nogNiet('[4.8] koppelwoorden ' + geval[0] + ': vier genummerde woorden, ook het laatste, en Koppel! werkt', async function (check) {
      const a = nieuwKind();
      a.ev('linkEntryFlow()');
      await wacht();
      vulIn(a, a.el('wordInp'), geval[1]);
      await wacht();
      check('vier woorden in genummerde vakjes', /1\s*lang[^]*2\s*beloven[^]*3\s*kaal[^]*4\s*neer/.test(tekstVan(a, 'wordChips')));
      check('de knop staat aan', heeftKlik(a, 'linkGo') && !a.el('linkGo').disabled && !tikbaar(a, a.el('linkGo')));
    });
  }

  /* typen zoals een kind: een woord, Enter, het volgende woord achter wat er al staat */
  await nogNiet('[4.8] koppelwoorden met Enter na elk woord: vier genummerde woorden, en Koppel! werkt', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    for (const w of ['lang', 'beloven', 'kaal', 'neer']) {
      const veld = a.el('wordInp');
      vulIn(a, veld, veld.value + w);
      fire(veld, 'keydown', { key: 'Enter', target: veld });
      await wacht();
    }
    check('vier woorden in genummerde vakjes', /1\s*lang[^]*2\s*beloven[^]*3\s*kaal[^]*4\s*neer/.test(tekstVan(a, 'wordChips')));
    check('de knop staat aan', heeftKlik(a, 'linkGo') && !a.el('linkGo').disabled && !tikbaar(a, a.el('linkGo')));
  });

  await nogNiet('[4.8] een woord dat niet in de lijst staat, wordt genoemd', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    vulIn(a, a.el('wordInp'), 'lang beloven kaal lamq');
    await wacht();
    check('"\'lamq\' ken ik niet"', /'lamq' ken ik niet/.test(a.scherm()));
  });

  await nogNiet('[4.8] het veld staat boven de knop en heeft geen lengtegrens', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    const h = a.modal();
    check('veld voor de knop', h.indexOf('id="wordInp"') >= 0 && h.indexOf('id="wordInp"') < h.indexOf('id="linkGo"'));
    check('geen maxlength', !/id="wordInp"[^>]*maxlength/.test(h));
  });

  await nogNiet('[4.8] dezelfde woordinvoer voor vrienden: twee woorden in een keer', async function (check) {
    const a = nieuwKind();
    a.ev('mpWordFlow()');
    await wacht();
    vulIn(a, a.el('mpInp'), 'lang neer');
    await wacht();
    check('twee genummerde woorden', /1\s*lang[^]*2\s*neer/.test(tekstVan(a, 'mpChips')));
    check('Verbind! staat aan', heeftKlik(a, 'mpKoppel') && !a.el('mpKoppel').disabled && !tikbaar(a, a.el('mpKoppel')));
  });

  await nogNiet('[4.10] de koppelcode zegt in hele minuten hoe lang hij werkt, en biedt daarna een nieuwe', async function (check) {
    /* met een vaste datum loopt de klok van Date mee met de timers, zoals op een
       echt apparaat; een app die de tijd leest in plaats van tikken telt, ziet hem */
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    await a.ev('linkShareFlow()');
    await wacht();
    check('werkt nog 10 minuten', /Werkt nog 10 minuten/.test(a.scherm()));
    check('geen tikkende seconden', !/\d+:\d\d/.test(a.scherm()));
    await wacht(61000);
    check('na een minuut: 9', /Werkt nog 9 minuten/.test(a.scherm()));
    await wacht(10 * 60000);
    check('daarna is hij op', /Deze code is op/.test(a.scherm()));
    const oud = a.scherm();
    tikTekst(a, 'Nieuwe code');
    await wacht();
    check('een nieuwe code, weer 10 minuten', /Werkt nog 10 minuten/.test(a.scherm()) && a.scherm() !== oud);
  });
}
