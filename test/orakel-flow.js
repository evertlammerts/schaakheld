/* Orakel, flowtests: de regels van plan.md voor increment 1, 2 en 3, elk op
   een eigen verse app-instantie (test/harnas.js). Elke testnaam begint met
   zijn regelnummer. Een kind tikt: het bord via onCell, knoppen op wat erop
   staat. Een opdracht klaarzetten gebeurt zoals de bestaande tests het doen. */

var POTJE = 'schaakheld-potje', RONDJES = 'schaakheld-rondjes', SAMEN_O = 'schaakheld-samen';
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
/* potjes tegen Turbo in de vorm van nu: per niveau de zetten, en desgewenst wanneer het laatst gespeeld */
function opslagMetPotjes(perNiveau, wanneer) {
  const o = maakOpslag(), games = {};
  for (const n in perNiveau) games[n] = { level: +n, moves: perNiveau[n], tips: 3, drawAsked: null, started: 1794700000000,
    updated: (wanneer && wanneer[n]) || 1794700000000, patXP: 0 };
  o.setItem(POTJE, JSON.stringify({ v: 2, games }));
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

/* een level of trofee die tijdens het spelen kwam, krijgt thuis een venster; een kind tikt dat weg */
function thuisVenstersWeg(app) {
  for (let i = 0; i < 8 && app.open(); i++) {
    if (app.ziet('Level omhoog')) app.tik('lvlOk');
    else if (app.ziet('id="trofOk"')) app.tik('trofOk');
    else break;
  }
}

/* naar huis zoals een kind: "Naar huis" als dat er staat, anders de terugknop */
async function naarHuis(app) {
  if (kanTikken(app, 'Naar huis')) { tikTekst(app, 'Naar huis'); await wacht(); }
  if (!app.open() && opSpeelscherm(app)) { app.tik('backBtn'); await wacht(); }
  thuisVenstersWeg(app);
}

/* een level omhoog legt een venster over Volgende; een kind tikt dat eerst weg */
async function volgende(app) {
  for (let i = 0; i < 8 && app.ziet('Level omhoog'); i++) app.tik('lvlOk');
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

  await regel('[1.1] na elke halve zet staat het potje bewaard, in de afgesproken vorm', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const d = opgeslagen(a, POTJE), r = d && d.games ? d.games['1'] : null;
    check('er staat een potje in ' + POTJE, !!d && typeof d === 'object');
    check('vorm {v: 2, games: {1: {level, moves, tips, drawAsked, started, updated}}}', !!d && d.v === 2 && !!r && r.level === 1 &&
      Array.isArray(r.moves) && typeof r.tips === 'number' && 'drawAsked' in r && r.started > 0 && r.updated > 0);
    check('beide halve zetten als van-naar', !!r && r.moves.length === 2 && r.moves[0] === 'e2e4' &&
      /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(r.moves[1]));
  });

  await regel('[1.1] herladen als jij aan zet bent: dezelfde stand, hetzelfde niveau, hulp die over is', async function (check) {
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

  await regel('[1.1] herladen als Turbo aan zet is: Turbo zet', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    zet(a, 'e2e4');
    drainTimers(400, 40);
    const r = turboPotje(a, 1);
    check('jouw zet staat al bewaard voor Turbo zet', !!r && r.moves && r.moves.length === 1);
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('Turbo heeft gezet en jij bent aan zet', b.get('session && session.S.hist.length') === 2 &&
      b.get('session && session.S.turn') === 'w');
  });

  await regel('[1.1] herladen na een slag en na een rokade', async function (check) {
    const zetten = ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'g1f3', 'c8g4', 'f1e2', 'b8c6', 'e1g1', 'e8c8'];
    const b = nieuwKind({ opslag: opslagMetPotje(1, zetten) });
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('de stand na slag en rokades, wit aan zet', b.fen() === toFEN(naSpelen(zetten)));
  });

  await regel('[1.1] herladen terwijl je schaak staat: de koning staat rood, net als voor het herladen', async function (check) {
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

  await regel('[1.1] een teruggenomen zet en een gebruikte speurbril staan ook bewaard', async function (check) {
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

  await regel('[1.1] de trucbonus telt per potje en staat in het bewaarde potje: wie er al drie kreeg, krijgt er geen meer', async function (check) {
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
    const r = turboPotje(zonder, 1);
    check('en het bewaarde potje telt hem', !!r && r.patXP === 1);
  });

  await regel('[1.1] een verkeerde telling van de hulp kost het potje niet en geeft niets extra', async function (check) {
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

  /* de app gaat direct na de hulp of het aanbod dicht, zonder zet ertussen */
  await regel('[1.1] de Speurbril gebruiken en meteen dichtdoen: na het openen is hij nog steeds gebruikt', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5', 'g1f3', 'b8c6']) });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht();
    check('testopzet: de speurbril is gebruikt', a.get('session.tips') === 2);
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('na het openen nog 2 over', b.get('session.tips') === 2 &&
      knopTeksten(b).some(function (t) { return /Speurbril\D*2/.test(t); }));
  });

  await regel('[1.1] remise aanbieden en meteen dichtdoen: na het openen staat het aanbod er nog', async function (check) {
    const zetten = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const a = nieuwKind({ opslag: opslagMetPotje(1, zetten) });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    await biedRemise(a);
    check('testopzet: Turbo wil nog geen remise, het aanbod staat', !a.get('session.over') && a.get('session.drawAsked') === zetten.length);
    const b = herlaad(a);
    await wacht();
    const r = turboPotje(b, 1);
    check('het aanbod staat bewaard', !!r && r.drawAsked === zetten.length);
    b.tik('verderKaart');
    await wacht();
    check('en het potje gaat verder met dat aanbod', opSpeelscherm(b) && b.get('session.drawAsked') === zetten.length);
  });

  for (const niveau of [7, 0]) {
    await regel('[1.1] een bewaard potje op niveau ' + niveau + ', dat niet bestaat, gaat niet open maar staat op de kaart om weg te halen', async function (check) {
      const o = opslagMetPotje(niveau, ['e2e4', 'e7e5']), ruw = o.getItem(POTJE);
      const a = nieuwKind({ opslag: o });
      await wacht();
      check('de Verder-kaart zegt dat het niet open kan', zichtbaar(a, 'verder') && tekstVan(a, 'verder').indexOf('kan ik niet meer openen') >= 0 &&
        !/Verder:/.test(tekstVan(a, 'verder')));
      const b = herlaad(a);
      await wacht();
      check('het staat er na herladen nog, onveranderd', b.opslag.getItem(POTJE) === ruw);
    });
  }

  await regel('[1.1] na herladen zonder Speurbril over staat de Speurbril uit', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5'], { tips: 0 }) });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    check('testopzet: in het potje', opSpeelscherm(a) && a.get('session.tips') === 0);
    check('de knop staat uit', a.get('actionBtns.tip.disabled') === true && !kanTikken(a, 'Speurbril'));
  });

  await regel('[1.2] hervatten terwijl bewaren niet lukt: alles staat er al, dus ✔ bewaard, en Pauze meteen erna zegt Bewaard', async function (check) {
    const o = opslagMetPotje(1, ['e2e4', 'e7e5']), schrijf = o.setItem;
    o.setItem = function (k, v) { if (k === POTJE) throw new Error('vol'); return schrijf.call(this, k, v); };
    const a = nieuwKind({ opslag: o });
    await wacht();
    a.tik('verderKaart');
    await wacht();
    check('na hervatten ✔ bewaard', zichtbaar(a, 'bewaard') && /✔ bewaard/.test(tekstVan(a, 'bewaard')));
    a.tik('backBtn');
    await wacht(500);
    check('Pauze zonder zet zegt gewoon Bewaard bij zet 2', /✔ Bewaard\. Je kunt later verder bij zet 2\b/.test(toastTekst(a)));
  });

  await regel('[1.1] een potje zonder zet wordt niet bewaard: Pauze vraagt niets en zegt dat het nog niet begonnen was', async function (check) {
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

  await regel('[1.2] de terugknop heet Pauze, in een potje en in een rondje', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    check('in een potje', tekstVan(a, 'backBtn').indexOf('Pauze') >= 0);
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'scan');
    check('in een rondje', tekstVan(a, 'backBtn').indexOf('Pauze') >= 0);
  });

  await regel('[1.2] Pauze in een potje: geen vraag, terug naar Spelen, en de melding zegt bij welke zet', async function (check) {
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

  await regel('[1.2] ✔ bewaard staat in beeld na elke bewaarde zet en elk antwoord', async function (check) {
    const bewaardInBeeld = function (x) { return zichtbaar(x, 'bewaard') && tekstVan(x, 'bewaard').indexOf('✔ bewaard') >= 0; };
    const a = nieuwKind();
    await startPotje(a, 1);
    check('in een potje zonder zet nog niet: er is niets bewaard', !bewaardInBeeld(a));
    await zetEnWacht(a, 'e2e4');
    const r = turboPotje(a, 1);
    check('na de zetten wel, en dan staan ze ook echt bewaard', bewaardInBeeld(a) && !!r &&
      r.moves.length === a.get('session.S.hist.length'));
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'scan');
    check('in een rondje zonder antwoord nog niet', !bewaardInBeeld(a));
    await scanGoed(a);
    check('na een antwoord wel, en het rondje staat bewaard', bewaardInBeeld(a) && !!opgeslagen(a, RONDJES));
  });

  await regel('[1.2] lukt bewaren niet, dan staat er geen "✔ bewaard" en zegt Pauze het', async function (check) {
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

  await regel('[1.2] lukt bewaren later niet meer, dan blijft het laatst bewaarde staan en zegt Pauze waar het staat', async function (check) {
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
    check('testopzet: twee halve zetten bewaard', !!turboPotje(a, 1) && turboPotje(a, 1).moves.length === 2);
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

  await regel('[1.2] een rondje zonder afgemaakte opdracht zegt bij Pauze dat er nog niets bewaard is', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.tik('backBtn');
    await wacht(500);
    check('melding "nog geen opdracht af"', toastTekst(a).indexOf('Nog geen opdracht af, dus er is nog niets bewaard') >= 0);
  });

  await regel('[1.2] de denkwolk gaat eerst dicht en zijn droombord blijft niet bewaard', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const echt = a.fen();
    tikTekst(a, 'Denkwolk');
    await wacht();
    await zetEnWacht(a, 'd2d4');
    a.tik('backBtn');
    await wacht(500);
    thuisVenstersWeg(a);
    check('na Pauze op Spelen', opThuis(a));
    a.tik('verderKaart');
    await wacht();
    check('verder spelen geeft de echte stand, niet de droom', a.fen() === echt && !a.get('!!(session && session.cloud)'));
  });

  /* regel 4.13: één potje tegen Turbo per niveau; een niveau kiezen vraagt nooit iets */
  const niveauKnop = function (a, n) { return a.el('modalBox').querySelectorAll('[data-lvl="' + n + '"]')[0]; };
  const kiezerOpen = async function (a) {
    if (heeftKlik(a, 'spelTurbo')) { naarSpelen(a); a.tik('spelTurbo'); } else a.ev('startGameFlow()');
    await wacht();
  };
  const zettenVan = function (a) { return JSON.stringify(a.get('session.S.hist.map(function (h) { return moveKey(h.m); })')); };

  await regel('[1.3] met een bewaard potje zegt Tegen Turbo bij zijn niveau "Verder · zet {n}", en geen vraag', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e4', 'e7e5']) });
    await kiezerOpen(a);
    check('niveau 2: Verder · zet 2', /Verder · zet 2/.test(a.doc.__tekst(niveauKnop(a, 2))));
    check('niveau 1 en 3: hun eigen zin', /Doet soms een dutje/.test(a.doc.__tekst(niveauKnop(a, 1))) && /Kijkt ver vooruit/.test(a.doc.__tekst(niveauKnop(a, 3))));
    check('geen aparte knop en geen waarschuwing', !kanTikken(a, 'Verder spelen') && !/opgeven|Een nieuw potje/i.test(a.scherm()));
  });

  await regel('[1.3] een ander niveau kiezen begint daar een nieuw potje, zonder vraag, en het bewaarde potje blijft staan', async function (check) {
    const zetten = ['e2e4', 'e7e5'];
    const a = nieuwKind({ opslag: opslagMetPotje(2, zetten) });
    const voor = JSON.stringify(a.get('[P.c.gamesPlayed, P.xp, wkGet(curWeek(), "potjes2")]'));
    await startPotje(a, 1);
    check('een nieuw potje op niveau 1, zonder vraag', !a.open() && opSpeelscherm(a) && a.get('session.level') === 1 && a.fen() === START_FEN_O);
    await zetEnWacht(a, 'd2d4');
    check('het potje op niveau 2 staat er nog', !!turboPotje(a, 2) && JSON.stringify(turboPotje(a, 2).moves) === JSON.stringify(zetten));
    check('geen teller veranderd', JSON.stringify(a.get('[P.c.gamesPlayed, P.xp, wkGet(curWeek(), "potjes2")]')) === voor);
  });

  await regel('[4.13] een potje op niveau 1 en een op niveau 2 blijven allebei staan, ook na herladen, en elk niveau opent zijn eigen potje', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    a.tik('backBtn');
    await wacht();
    await startPotje(a, 2);
    check('niveau 2 begint zonder vraag een nieuw potje', !a.open() && opSpeelscherm(a) && a.get('session.level') === 2 && a.fen() === START_FEN_O);
    await zetEnWacht(a, 'd2d4');
    a.tik('backBtn');
    await wacht();
    const z1 = JSON.stringify(turboPotje(a, 1) && turboPotje(a, 1).moves), z2 = JSON.stringify(turboPotje(a, 2) && turboPotje(a, 2).moves);
    check('testopzet: allebei bewaard', /e2e4/.test(z1) && /d2d4/.test(z2));
    const b = herlaad(a);
    await wacht();
    check('na herladen staan ze er allebei', JSON.stringify(turboPotje(b, 1).moves) === z1 && JSON.stringify(turboPotje(b, 2).moves) === z2);
    await startPotje(b, 1);
    check('niveau 1 opent zijn eigen potje, zonder vraag', !b.open() && b.get('session.level') === 1 && zettenVan(b) === z1);
    b.tik('backBtn');
    await wacht();
    await startPotje(b, 2);
    check('niveau 2 ook', !b.open() && b.get('session.level') === 2 && zettenVan(b) === z2);
  });

  await regel('[4.13] opgeven op het ene niveau laat het potje op het andere staan; Alles wissen haalt ze allemaal weg', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotjes({ 1: ['e2e4', 'e7e5'], 3: ['d2d4', 'd7d5'] }) });
    await startPotje(a, 1);
    check('testopzet: niveau 1 gaat verder', a.get('session.level') === 1 && a.get('session.S.hist.length') === 2);
    await geefOp(a);
    check('niveau 1 is weg, niveau 3 staat er nog', turboPotje(a, 1) === null && JSON.stringify(turboPotje(a, 3).moves) === JSON.stringify(['d2d4', 'd7d5']));
    const b = nieuwKind({ opslag: opslagMetPotjes({ 1: ['e2e4', 'e7e5'], 3: ['d2d4', 'd7d5'] }) });
    b.tik('setBtn');
    await wacht();
    b.tik('setReset');
    await wacht();
    b.tik('rstGo');
    await wacht();
    check('Alles wissen: geen potje meer', opgeslagen(b, POTJE) === null);
  });

  await regel('[4.13] de Verder-kaart toont het potje dat het laatst gespeeld is, en Verder opent dat potje', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotjes({ 1: ['e2e4', 'e7e5'], 3: ['d2d4', 'd7d5', 'c2c4'] }, { 1: 1794700009000, 3: 1794700001000 }) });
    await wacht();
    check('de kaart noemt Slaapkop Turbo', /Slaapkop Turbo/.test(tekstVan(a, 'verder')) && !/Super Turbo/.test(tekstVan(a, 'verder')));
    a.tik('verderKaart');
    await wacht();
    check('Verder opent het potje op niveau 1', opSpeelscherm(a) && a.get('session.level') === 1 && a.get('session.S.hist.length') === 2);
  });

  await regel('[4.13] compat: een potje van de vorige vorm hoort daarna bij zijn niveau, naast een nieuw potje op een ander niveau', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(3, ['e2e4', 'e7e5']) });
    await kiezerOpen(a);
    check('niveau 3: Verder · zet 2', /Verder · zet 2/.test(a.doc.__tekst(niveauKnop(a, 3))));
    a.ev('closeModal()');
    await startPotje(a, 1);
    await zetEnWacht(a, 'g1f3');
    const d = opgeslagen(a, POTJE);
    check('in de nieuwe vorm, met het oude potje op niveau 3', !!d && d.v === 2 && JSON.stringify(turboPotje(a, 3).moves) === JSON.stringify(['e2e4', 'e7e5']) &&
      /g1f3/.test(JSON.stringify(turboPotje(a, 1).moves)));
    a.tik('backBtn');
    await wacht();
    await startPotje(a, 3);
    check('niveau 3 opent het oude potje', a.get('session.level') === 3 && zettenVan(a) === JSON.stringify(['e2e4', 'e7e5']));
  });

  await regel('[1.3] Revanche na afloop begint meteen een nieuw potje, zonder vraag', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    a.tik('verderKaart');
    await wacht();
    await zetEnWacht(a, 'd1h5');
    check('het potje is uit (mat)', a.get('!!(session && session.over)'));
    tikTekst(a, 'Revanche');
    await wacht();
    check('nieuw potje zonder vraag', !a.open() && opSpeelscherm(a) && a.fen() === START_FEN_O);
  });

  await regel('[1.4] opgeven, mat en een aangenomen remise halen het bewaarde potje weg', async function (check) {
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

  await regel('[1.4] Alles wissen noemt het potje dat bezig is en haalt het weg', async function (check) {
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

  await regel('[1.4] Alles wissen midden in een potje of een rondje: daarna loopt er niets meer van door', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    check('testopzet: het potje staat bewaard', !!opgeslagen(a, POTJE));
    /* Instellingen staat niet op het speelscherm: eerst Pauze, dan thuis Alles wissen */
    a.tik('backBtn');
    await wacht();
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
    /* tijdens een rondje staat Instellingen niet op het speelscherm: eerst Pauze, dan thuis Alles wissen */
    b.tik('backBtn');
    await wacht();
    b.tik('setBtn');
    await wacht();
    b.tik('setReset');
    await wacht();
    b.tik('rstGo');
    await wacht(3000);
    check('en het bewaarde rondje is weg', b.get('session') === null && opgeslagen(b, RONDJES) === null);
  });

  await regel('[1.4] niets anders haalt het bewaarde potje weg', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    const zetten = JSON.stringify(turboPotje(a, 1) && turboPotje(a, 1).moves);
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
    check('na Pauze, tabs, een rondje en herladen staat het er nog', !!turboPotje(b, 1) &&
      JSON.stringify(turboPotje(b, 1).moves) === zetten && zetten !== 'null');
  });

  const onleesbaar = [
    ['kapotte tekst', 'kapot{'],
    ['een onbekende versie', JSON.stringify({ v: 9, level: 1, moves: ['e2e4'], tips: 3 })],
    ['een zet die niet kan', JSON.stringify({ v: 1, level: 1, moves: ['e2e4', 'e2e4'], tips: 3, drawAsked: null, started: 1, updated: 1 })]
  ];
  for (const geval of onleesbaar) {
    await regel('[1.5] een potje dat niet te lezen is (' + geval[0] + ') wordt getoond, niet weggegooid', async function (check) {
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
  await regel('[1.5] een rondje onder de openingsles bestaat niet: het gaat stil weg', async function (check) {
    const o = maakOpslag();
    o.setItem(RONDJES, JSON.stringify({ opening: { round: 2, earned: 3 } }));
    const a = nieuwKind({ opslag: o });
    await wacht();
    check('geen Verder-kaart voor een les', !/Verder:/.test(tekstVan(a, 'verder')));
    check('en het record is weg', opgeslagen(a, RONDJES) === null);
  });

  await regel('[1.5] een potje dat niet te lezen is: een nieuw potje haalt het weg', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e2']) });
    await wacht();
    check('testopzet: de kaart zegt dat het niet open kan', /kan ik niet meer openen/.test(tekstVan(a, 'verder')));
    await startPotje(a, 2);
    check('een nieuw potje, zonder vraag', opSpeelscherm(a) && !a.open() && a.get('session.level') === 2);
    check('het kapotte potje is weg', opgeslagen(a, POTJE) === null);
  });

  await regel('[1.5] rondjes die niet te lezen zijn (kapotte tekst) worden stil weggehaald, en het rondje begint opnieuw', async function (check) {
    const o = maakOpslag();
    o.setItem(RONDJES, 'kapot{');
    const a = nieuwKind({ opslag: o });
    await wacht();
    check('geen venster en geen melding', !a.open() && toastTekst(a) === '');
    check('niets op de Verder-kaart', !/kan ik niet|Verder: |Opdracht \d van 5/.test(tekstVan(a, 'verder')));
    await startOefening(a, 'scan');
    check('Speurogen begint bij opdracht 1', opSpeelscherm(a) && /\b1 van 5/.test(tekstVan(a, 'roundChip')));
    check('de kapotte tekst is weg', a.opslag.getItem(RONDJES) !== 'kapot{');
  });

  await regel('[1.5] een rondje dat niet te lezen is, wordt weggehaald; het rondje ernaast blijft', async function (check) {
    const o = maakOpslag();
    o.setItem(RONDJES, JSON.stringify({ scan: { round: 'drie', earned: null }, best3: { round: 2, earned: 6 } }));
    const a = nieuwKind({ opslag: o });
    await wacht();
    check('geen venster en geen melding', !a.open() && toastTekst(a) === '');
    await startOefening(a, 'scan');
    check('Speurogen begint bij opdracht 1', /\b1 van 5/.test(tekstVan(a, 'roundChip')));
    const r = opgeslagen(a, RONDJES);
    check('het kapotte rondje is weg', !r || !r.scan || typeof r.scan.round === 'number');
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'best3');
    check('De Beste Zet gaat verder bij opdracht 3, met zijn 6 sterren', /\b3 van 5/.test(tekstVan(a, 'roundChip')) &&
      /\b6\b/.test(tekstVan(a, 'drillStars')));
  });

  await regel('[1.5] een rondje met een verkeerde vorm wordt weggehaald, en daarna wordt er weer bewaard', async function (check) {
    for (const ruw of ['{"scan":{"round":7,"earned":0}}', '{"scan":5}', '[1,2]', '"tekst"']) {
      const o = maakOpslag();
      o.setItem(RONDJES, ruw);
      const a = nieuwKind({ opslag: o });
      await wacht();
      check(ruw + ': niets op de Verder-kaart', !/Verder: |Opdracht \d van 5/.test(tekstVan(a, 'verder')));
      await startOefening(a, 'scan');
      check(ruw + ': Speurogen begint bij opdracht 1', /\b1 van 5/.test(tekstVan(a, 'roundChip')));
      await scanGoed(a);
      const r = opgeslagen(a, RONDJES);
      check(ruw + ': na een antwoord staat het rondje bewaard', !!r && !Array.isArray(r) && !!r.scan && r.scan.round === 1);
    }
  });

  await regel('[1.6] een rondje bewaart telling en sterren, Pauze zegt het, en opnieuw starten gaat verder', async function (check) {
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
    check('verder bij opdracht 3', /\b3 van 5/.test(tekstVan(b, 'roundChip')));
    check('de sterren van het rondje staan er nog (6)', /\b6\b/.test(tekstVan(b, 'drillStars')));
  });

  await regel('[1.6] een rondje dat af is telt als topronde in de week waarin het af is', async function (check) {
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

  await regel('[1.6] een rondje is af bij het vijfde antwoord: wie dan weggaat, laat geen opdracht 6 achter', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    a.tik('backBtn');
    await wacht();
    thuisVenstersWeg(a);
    check('Pauze zegt dat het rondje klaar is', /Rondje klaar/.test(toastTekst(a)));
    check('er blijft geen rondje staan', opgeslagen(a, RONDJES) === null && !/Verder: |Opdracht \d van 5/.test(tekstVan(a, 'verder')));
    check('de topronde telt meteen', /1\s*(\/|van)\s*2/.test(wekelijks(a)));
    await startOefening(a, 'scan');
    check('een nieuw rondje begint bij opdracht 1', /\b1 van 5/.test(tekstVan(a, 'roundChip')));
  });

  await regel('[1.6] een openingsles bewaart alleen de sterren en zegt dat', async function (check) {
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

  await regel('[1.7] een bewaard potje staat op de Verder-kaart, één tik speelt verder', async function (check) {
    const zetten = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const a = nieuwKind({ opslag: opslagMetPotje(2, zetten) });
    await wacht();
    check('de kaart staat er en noemt Turbo en de zet', zichtbaar(a, 'verder') && /Turbo/.test(tekstVan(a, 'verder')) &&
      /Zet 3\b/.test(tekstVan(a, 'verder')));
    a.tik('verderKaart');
    await wacht();
    check('één tik: verder in dezelfde stand', opSpeelscherm(a) && a.fen() === toFEN(naSpelen(zetten)));
  });

  await regel('[1.7] met een potje zegt een regel dat het op dit apparaat blijft', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    await wacht();
    check('"blijft staan op deze ..."', /blijft staan op (deze|dit) /.test(tekstVan(a, 'verder')));
  });

  await regel('[1.7] alleen een rondje: de kaart noemt het rondje en gaat verder bij die opdracht', async function (check) {
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
    check('verder bij opdracht 3', opSpeelscherm(a) && /\b3 van 5/.test(tekstVan(a, 'roundChip')));
  });

  await regel('[1.7] een potje en een rondje: het potje eerst, het rondje als "Ook nog"', async function (check) {
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

  await regel('[1.8] elke plek begint bovenaan', async function (check) {
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

  await regel('[1.9] een mat in twee verlaten na de eerste zet raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    zet(a, 'c6b6');
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await regel('[1.9] De Beste Zet verlaten na een foute keus raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    const fout = a.get('session.task.options.findIndex(function (o) { return o !== session.task.best; })');
    const knop = a.el('optionsBox').querySelectorAll('.opt[data-i="' + fout + '"]')[0];
    check('de opties zijn aan te tikken', !!knop);
    if (knop) tikEl(a, knop, 'een foute optie');
    tikTekst(a, 'Deze kies ik');
    drainTimers(400, 50);
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await regel('[1.9] Koning ontsnapt verlaten na een foute zet raakt het nieuwe potje niet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '1r4k1/8/8/8/8/8/r6P/6K1 w - - 0 1', 'mat1', ['h2h3', 'h2h4']);
    zet(a, 'g1f1');
    a.tik('backBtn');
    await nieuwPotjeIsSchoon(check, a);
  });

  await regel('[1.10] in een mat in twee gaat de tweede zet met tikken', async function (check) {
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
    await regel('[1.11] Koning ontsnapt, ' + geval[0] + ': niets bevriest, Turbo antwoordt op het bord, een uitleg vervangt de openingszin en de opdracht gaat door', async function (check) {
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

  await regel('[1.12] een topronde telt voor het weekdoel toprondes', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    await volgende(a);
    await naarHuis(a);
    check('het doel staat op 1 van 2', /1\s*(\/|van)\s*2/.test(wekelijks(a)));
  });

  await regel('[1.12] compat: de toprondes die Lotte al haalde, tellen meteen (1 van 2)', async function (check) {
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

  await regel('[1.14] een melding verdwijnt als er een venster opengaat', async function (check) {
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

  /* thuis eerst het level en dan de trofeeën; de melding van Pauze wacht tot het laatste venster dicht is */
  await regel('[1.14] na Pauze komt de melding pas als de vensters voor een level en trofeeën dicht zijn', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 140); bump("stars", 99); bump("c.perfectScans", 9)');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('testopzet: level Paard, Sterrenregen en Superspeurneus wachten', a.get('levelIdx(P.xp)') === 1 &&
      a.get('!!P.badges.sterren && !!P.badges.speurneus'));
    a.tik('backBtn');
    await wacht();
    check('eerst het level, zonder melding', a.ziet('Level omhoog') && toastTekst(a) === '');
    a.tik('lvlOk');
    check('dan de trofeeën samen, zonder melding', a.ziet('Trofeeën verdiend!') && /Sterrenregen/.test(zonderZacht(a.scherm())) &&
      /Superspeurneus/.test(zonderZacht(a.scherm())) && /Je verdiende ze tijdens het spelen\./.test(a.scherm()) && toastTekst(a) === '');
    tikTekst(a, 'Super');
    check('daarna de melding van Pauze', !a.open() && /Bewaard/.test(toastTekst(a)));
  });

  /* ================= increment 2 ================= */

  await regel('[2.3] ⋯ houdt Remise aanbieden, Opgeven en de Puntenwijzer; de hulpjes staan onder het bord', async function (check) {
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

  await regel('[2.3] de schakelaars voor blunderalarm en voorspellen staan in Instellingen en houden hun waarde', async function (check) {
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
    ['jij staat een pion voor', ['e2e4', 'd7d5', 'e4d5', 'g8f6'], /Jij \+1/, /Jij staat 1 punt voor\.[^]*Jij pakte:/],
    ['Turbo staat een pion voor', ['e2e4', 'd7d5', 'd2d3', 'd5e4'], /Turbo \+1/, /Turbo staat 1 punt voor\.[^]*Turbo pakte:/]
  ];
  for (const geval of materiaal) {
    await regel('[2.3] het materiaalverschil in de balk: ' + geval[0], async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(1, geval[1]) });
      a.tik('verderKaart');
      await wacht();
      check('de balk zegt het', zichtbaar(a, 'materiaal') && geval[2].test(tekstVan(a, 'materiaal')));
      a.tik('materiaal');
      await wacht();
      check('tikken laat de geslagen stukken zien, met wat het verschil betekent', a.open() && geval[3].test(a.scherm()));
    });
  }

  await regel('[2.3] bij gelijk materiaal staat er geen verschil', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    a.tik('verderKaart');
    await wacht();
    check('in een potje, met een plek voor het materiaal', opSpeelscherm(a) && 'materiaal' in a.els);
    check('verborgen bij gelijk', !zichtbaar(a, 'materiaal') || !/\+\d/.test(tekstVan(a, 'materiaal')));
  });

  /* tekst.md, bijlage: per soort opdracht de vraag in de strook en de zin onder het bord */
  const VRAGEN = {
    'scan.attacked': ['Welke stukken van jou valt Turbo aan?', 'Tik ze allemaal aan. Een stuk is aangevallen als een groen stuk het kan slaan als Turbo aan zet is.'],
    'scan.capture': ['Welke groene stukken kun jij nu slaan?', 'Tik ze allemaal aan. Kijk bij al je witte stukken wat ze kunnen pakken.'],
    'scan.mobility': ['Waar kan je {stuk} op {veld} heen?', 'Tik alle velden aan, ook de verre. Het stuk dat oplicht is het.'],
    'scan.free': ['Welk groen stuk sla je met winst?', 'Gratis is het mooist. Een ruil telt ook, als jij meer pakt dan Turbo terugpakt. Soms zijn er meer.'],
    'scan.threat': ['Wat kan Turbo nu met winst pakken?', 'Doe alsof jij past. Tik je stukken aan die Turbo dan wint: hij slaat, en jij pakt minder terug.'],
    'best3.best3': ['Welke zet is de beste voor wit? Tik er een aan.', ''],
    'best3.safe': ['Is {zet} veilig?', 'De pijl laat de zet zien. Kijk wat Turbo daarna kan doen: pakt hij dan iets van je af?'],
    'trucs.vork': ['Vind de vork! 🍴', 'Eén zet die twee stukken van Turbo tegelijk aanvalt, vanaf een veilig veld.'],
    'trucs.penning': ['Zet een penning! 📌', 'Zet een stuk van Turbo vast: er staat iets belangrijkers achter, zoals de koning of de dame.'],
    'trucs.spies': ['Zet een spies! 🍢', 'Val de koning of de dame aan. Die moet weg, en dan pak je wat erachter staat.'],
    'trucs.aftrek': ['Vind de aftrekaanval! 🎭', 'Zet een stuk opzij, zodat jouw stuk erachter ineens aanvalt.'],
    'trucs.mat1': ['Mat in één zet! 👑', 'Geef schaak zo dat Turbo\'s koning zich op geen enkele manier kan redden.'],
    'trucs.mat2': ['Mat in twee zetten! 👑', 'Eerst een zet waarna Turbo de mat niet meer kan tegenhouden. Turbo antwoordt, en dan geef jij mat.'],
    'koning.schaak': ['Je staat schaak! Red je koning.', 'Weglopen, ertussen zetten of de aanvaller slaan. {goed}'],
    'koning.mat1': ['Turbo dreigt mat in één!', 'Doe je niets, dan sta je de volgende zet mat. Welke zet houdt dat tegen?'],
    'koning.mat2': ['Turbo dreigt mat in twee!', 'Turbo heeft een plan van twee zetten. Zie wat hij wil, en houd het tegen.'],
    'koning.stuk': ['Red je stuk! 🛡️', 'Een stuk van jou hangt. Zet het weg, dek het, zet er iets tussen, of val zelf iets aan.'],
    'opening.coach': ['Jouw zet. Wat bouwt je stelling op?', 'Pak het midden, haal een stuk naar buiten, of breng je koning veilig. Kijk ook wat Turbo dreigt.'],
    'opening.pad': ['Zet {k} van {m}: speel het pad na.', '{hint}']
  };
  const strook = function (a) { return tekstVan(a, 'bubble').trim(); };
  const onderZin = function (a) { return zichtbaar(a, 'hulpZin') ? tekstVan(a, 'hulpZin').trim() : ''; };
  /* de tekst van de app voor deze opdracht, met de invulvelden als patroon */
  const alsPatroon = function (t) {
    return new RegExp('^' + t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{goed\}/g, '(Er is één goede zet\\.|Er zijn (twee|drie|vier|\\d+) goede zetten\\.)')
      .replace(/\{[a-z]+\}/g, '.+') + '$');
  };

  await regel('[2.4] de vragen en de zinnen onder het bord zijn die van tekst.md, voor alle soorten opdrachten', async function (check) {
    const a = nieuwKind();
    const app = a.get('JSON.stringify(OPDRACHTEN)');
    check('de app heeft de tabel', !!app);
    const t = app ? JSON.parse(app) : {};
    for (const k in VRAGEN) {
      check(k + ': de vraag', !!t[k] && t[k][0] === VRAGEN[k][0]);
      check(k + ': de zin onder het bord', !!t[k] && (t[k][1] || '') === VRAGEN[k][1]);
    }
    check('geen soorten die tekst.md niet kent', Object.keys(t).every(function (k) { return k in VRAGEN; }));
  });

  for (const soort of ['scan', 'best3', 'trucs', 'koning']) {
    await regel('[2.4] ' + soort + ': voor het antwoord staat in de strook alleen de vraag en de uitleg onder het bord', async function (check) {
      const a = nieuwKind();
      await startOefening(a, soort);
      const type = a.get('session.task.options ? "best3" : session.task.move ? "safe" : session.task.type');
      const v = VRAGEN[soort + '.' + type];
      check('testopzet: een bekende soort opdracht (' + type + ')', !!v);
      if (!v) return;
      check('de strook: alleen de vraag', alsPatroon(v[0]).test(strook(a)));
      check('onder het bord de uitleg', v[1] ? alsPatroon(v[1]).test(onderZin(a)) : onderZin(a) === '');
    });
  }

  await regel('[2.4] na een antwoord blijft de vraag staan en staan alle redenen onder het bord, de gemiste eerst, zonder tussenkop', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    /* de toren op a1 wordt aangevallen en is gemist; de koning op g1 is fout getikt */
    a.ev('(function () { var S = parseFEN("6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1"); session.S = S;' +
      'session.task = { S: S, type: "attacked", targets: attackedPieces(S, "w"), extra: null, details: null };' +
      'session.phase = "marking"; BD.marks.clear(); BD.mode = "mark"; renderBoard(); })()');
    const vraag = strook(a);
    tikVeld(a, a.get('sqFromAlg("g1")'));
    tikTekst(a, 'Klaar');
    await wacht();
    const onder = a.el('onder');
    const eerste = onder.querySelectorAll('button').filter(function (k) { return !tikbaar(a, k); })[0];
    check('Volgende is de eerste knop onder het bord', !!eerste && /Volgende/.test(knopTekst(a, eerste)));
    check('de strook houdt de vraag', strook(a) === vraag && vraag !== '');
    const redenen = a.el('taskBox').querySelectorAll('li').map(function (li) { return a.doc.__tekst(li); });
    check('twee redenen onder het bord', redenen.length === 2);
    check('de gemiste eerst', /Gemist/.test(redenen[0] || '') && /g1|koning/.test(redenen[1] || ''));
    check('geen tussenkop', !/Nog \d+ ding/.test(tekstVan(a, 'taskBox')));
    check('de uitleg van voor het antwoord is weg', onderZin(a) === '');
  });

  await regel('[2.4] een fout antwoord met één reden: het vak onder het bord is niet leeg (Mees)', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev('(function () { var S = parseFEN("6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1"); session.S = S;' +
      'session.task = { S: S, type: "attacked", targets: attackedPieces(S, "w"), extra: null, details: null };' +
      'session.phase = "marking"; BD.marks.clear(); BD.mode = "mark"; renderBoard(); })()');
    tikTekst(a, 'Klaar');
    await wacht();
    check('de reden staat onder het bord', /Gemist[^]*a1/.test(tekstVan(a, 'taskBox')));
  });

  /* Trucendoos en Koning ontsnapt: een hint en een poging die niet de laatste is staan onder het bord, nooit in de strook */
  await regel('[2.4] Trucendoos: de hint en een eerste foute zet staan onder het bord, de vraag blijft in de strook', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'mat1', ['a1a8']);
    const vraag = strook(a);
    tikTekst(a, 'Hint');
    await wacht();
    check('de hint onder het bord', /^Kijk naar het stuk dat nu oplicht\. Met deze hint is de opdracht nog 2 sterren waard\.$/.test(onderZin(a)));
    check('de strook houdt de vraag', strook(a) === vraag);
    zet(a, 'g1f1');
    await wacht(3000);
    check('de poging onder het bord, met een uitnodiging', /[Pp]robeer nog een zet\.$/.test(onderZin(a)));
    check('de strook houdt nog steeds de vraag', strook(a) === vraag);
    zet(a, 'g1f2');
    await wacht(5000);
    check('na de laatste poging: oordeel en Volgende, de reden eronder', a.get('session.phase') === 'review' && kanTikken(a, 'Volgende') &&
      /Dit was mat: .+\./.test(tekstVan(a, 'taskBox')) && strook(a) === vraag);
  });

  await regel('[2.4] Koning ontsnapt: de hint, een poging en de redding staan onder het bord, de vraag blijft in de strook', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, STUK_FEN, 'stuk', STUK_REDDING, '{ hang: threatDetails(S)[0] }');
    const vraag = strook(a);
    tikTekst(a, 'Hint');
    await wacht();
    check('de hint onder het bord', /^Het stuk dat nu oplicht, staat in gevaar\. Met deze hint is de opdracht nog 2 sterren waard\.$/.test(onderZin(a)));
    zet(a, 'g1h1');
    await wacht(4000);
    check('Turbo pakt de toren: de zet staat erbij, en "toch" want het was het hangende stuk', /^Turbo speelt .+ en pakt toch je toren\. Probeer nog een zet\.$/.test(onderZin(a)));
    check('de strook houdt de vraag', strook(a) === vraag);
    zet(a, 'a1a2');
    await wacht(3000);
    check('gered: oordeel en reden', /Gered/.test(tekstVan(a, 'taskBox')) && /Weggezet\./.test(tekstVan(a, 'taskBox')) && strook(a) === vraag);
  });

  await regel('[2.4] De Beste Zet: drie keuzes op een rij, en na de eerste tik vraagt de strook wat Turbo daarna doet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('setTask(null); setOptions(null); buildBest3()');
    await wacht();
    const knoppen = a.el('optionsBox').querySelectorAll('button');
    check('drie keuzes A, B en C', knoppen.length === 3 && ['A', 'B', 'C'].every(function (l, i) { return a.doc.__tekst(knoppen[i]).trim().indexOf(l) === 0; }));
    tikEl(a, knoppen[1]);
    await wacht();
    check('de strook na de eerste tik', strook(a) === 'Wat doet Turbo daarna? Kijk ook naar de andere twee.');
  });

  await regel('[2.4] Openingsschool: de vraag in de strook, de uitleg onder het bord, en na de zet het oordeel van de coach in hoogstens twee zinnen', async function (check) {
    const a = nieuwKind();
    a.ev('startOpening("coach", null)');
    await wacht();
    check('de vraag', strook(a) === VRAGEN['opening.coach'][0]);
    check('de uitleg', onderZin(a) === VRAGEN['opening.coach'][1]);
    zet(a, 'e2e4');
    await wacht(400);
    const oordeel = onderZin(a);
    check('na de zet: het oordeel onder het bord', oordeel !== '' && oordeel !== VRAGEN['opening.coach'][1]);
    check('hoogstens twee zinnen', (oordeel.match(/[.!?](\s|$)/g) || []).length <= 2);
    a.ev('startOpening("pad", PADEN[0])');
    await wacht();
    check('pad: de vraag', strook(a) === 'Zet 1 van 6: speel het pad na.');
    check('pad: de hint van het pad onder het bord', onderZin(a) === a.get('PADEN[0].hint[0]'));
  });

  await regel('[2.5] het einde van een potje is een kaart over het bord, met Revanche!, Naar huis en nieuwe trofeeën', async function (check) {
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

  await regel('[2.5] na het einde zegt het scherm niet meer dat het potje loopt: geen ✔ bewaard en geen hulpjes', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    a.tik('verderKaart');
    await wacht();
    check('testopzet: tijdens het potje ✔ bewaard en de hulpjes', zichtbaar(a, 'bewaard') && kanTikken(a, 'Speurbril'));
    await zetEnWacht(a, 'd1h5');
    check('testopzet: de eindkaart staat er', zichtbaar(a, 'eindkaart'));
    check('geen ✔ bewaard meer', !zichtbaar(a, 'bewaard'));
    check('geen hulpjes meer', !kanTikken(a, 'Speurbril') && !kanTikken(a, 'Denkwolk') && !kanTikken(a, 'Zet terug'));
    check('de strook zegt het einde', /Gewonnen!/.test(tekstVan(a, 'strook')));
  });

  await regel('[2.6] de zeven bordkleuren houden id, naam en het level dat ze opent; een gekozen kleur blijft gekozen', async function (check) {
    const a = nieuwKind();
    const thema = a.get('THEMES.map(function (t) { return [t.id, t.naam, t.lvl]; })');
    check('dezelfde zeven', JSON.stringify(thema) === JSON.stringify([['munt', 'Munt', 0], ['oceaan', 'Oceaan', 1],
      ['bos', 'Bos', 2], ['snoep', 'Snoep', 3], ['lava', 'Lava', 4], ['goud', 'Goud', 5], ['ruimte', 'Ruimte', 6]]));
    a.ev('setPref("theme", "bos")');
    check('na herladen nog gekozen', herlaad(a).get('P.theme') === 'bos');
  });

  await regel('[2.8] de voorspelvraag neemt de zet niet af: Turbo wacht op een tik', async function (check) {
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

  await regel('[2.8] de voorspelvraag: een tik op een stuk van Turbo is het antwoord, en dan zet Turbo', async function (check) {
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

  await regel('[2.8] de Speurbril-randjes blijven tot je volgende zet', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5', 'g1f3', 'b8c6']) });
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht(20000);
    check('na lang kijken nog aan', a.get('BD.spy.size') > 0);
    await zetEnWacht(a, 'f1c4');
    check('na je zet weg', a.get('BD.spy.size') === 0);
  });

  await regel('[2.8] de Speurbril-randjes gaan weg bij Zet terug en als de denkwolk opengaat', async function (check) {
    /* na Zet terug valt het paard op f3 de pion op e5 aan, dus de bril heeft dan weer iets te laten zien */
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']) });
    a.tik('verderKaart');
    await wacht();
    tikTekst(a, 'Speurbril');
    await wacht();
    check('testopzet: de randjes staan er', a.get('BD.spy.size') > 0);
    tikTekst(a, 'Zet terug');
    await wacht();
    check('na Zet terug weg', a.get('BD.spy.size') === 0);
    tikTekst(a, 'Speurbril');
    await wacht();
    check('testopzet: weer randjes', a.get('BD.spy.size') > 0);
    tikTekst(a, 'Denkwolk');
    await wacht();
    check('in de denkwolk weg', a.get('BD.spy.size') === 0);
  });

  /* een potje met de voorspelvraag open: wit zet, Turbo vraagt welk stuk hij zet */
  async function metVoorspelvraag(a) {
    a.ev('setPref("predict", true); Math.random = function () { return 0.1; }');
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    return await zagOoit(function () { return a.get('BD.mode') === 'predict'; }, 3000);
  }

  /* F2: bij elke truc van de Trucendoos horen de poging en de uitleg bij die truc, niet bij een andere */
  const TRUC_WOORD = { vork: /VORK/, penning: /PENNING/, spies: /SPIES/, aftrek: /AFTREK/, mat1: /^Dit was mat: .+\.$/, mat2: /dan kan Turbo de mat niet meer tegenhouden/ };
  for (const type of Object.keys(TRUC_WOORD)) {
    await regel('[2.4] Trucendoos, ' + type + ': de foute poging en de uitleg na twee missers horen bij deze truc', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      const fout = a.get('(function () { var t = genPatternTask(' + JSON.stringify(type) + '); if (!t) return null;' +
        'session.task = t; session.S = t.S; session.phase = "puzzle"; session.tries = 0; t.hintUsed = false;' +
        'BD.mode = "puzzle"; BD.glow.clear(); renderBoard(); opdrachtVan("trucs." + t.type);' +
        'var uit = legalMoves(t.S).filter(function (m) { var info = patternsAfterMove(t.S, m);' +
        '  return !patternMatches(t.S, m, t.type, info) && !patternMatches(t.S, m, t.type, Object.assign({}, info, { safe: true })); })' +
        '  .map(function (m) { return moveKey(m); }); return uit.slice(0, 2); })()');
      check('testopzet: een opdracht van deze soort met twee foute zetten', !!fout && fout.length === 2 && a.get('session.task.type') === type);
      if (!fout || fout.length < 2) return;
      const naam = a.get('PATTERNS[' + JSON.stringify(type) + '].n.toLowerCase()');
      zet(a, fout[0]);
      await wacht(3000);
      /* "mat" is een het-woord: nog geen mat in twee */
      check('de poging noemt deze truc', tekstVan(a, 'hulpZin').indexOf(type === 'mat2' ? 'Nog geen mat in twee.' : 'Nog niet de ' + naam + '.') === 0);
      zet(a, fout[1]);
      await wacht(8000);
      const reden = a.doc.__tekst(a.el('taskBox').querySelectorAll('.e-body')[0] || a.el('taskBox')).trim();
      check('de uitleg na twee missers noemt deze truc: ' + reden.slice(0, 60), a.get('session.phase') === 'review' && TRUC_WOORD[type].test(reden));
    });
  }

  await regel('[2.8] een tik op een eigen stuk bij de voorspelvraag: de strook zegt waarom er niets gebeurt', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    tikVeld(a, a.get('sqFromAlg("e4")'));
    await wacht(200);
    check('de vraag staat nog open', a.get('BD.mode') === 'predict');
    check('de strook zegt het', tekstVan(a, 'bubble').trim() === 'Dat is jouw stuk. Welk stuk zet Turbo? Tik het aan.');
  });

  await regel('[2.3] de voorspelvraag past: "Welk stuk zet Turbo? Tik het aan."', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    check('de vraag in de strook', tekstVan(a, 'bubble').trim() === 'Welk stuk zet Turbo? Tik het aan.');
  });

  await regel('[2.3] terwijl de voorspelvraag open staat, staan de hulpjes uit; Remise aanbieden werkt en sluit de vraag', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    const uit = ['cloudBtn', 'tip', 'undo'].every(function (id) { return a.get('!!(actionBtns.' + id + ' && actionBtns.' + id + '.disabled)'); });
    check('Denkwolk, Speurbril en Zet terug staan uit', uit);
    check('Speel maar is er', kanTikken(a, 'Speel maar'));
    const h = a.get('session.S.hist.length');
    await biedRemise(a);
    await wacht(2000);
    check('de vraag is dicht', a.get('BD.mode') !== 'predict' && !zichtbaar(a, 'predictBar'));
    check('Turbo antwoordt in de strook', /Remise/.test(tekstVan(a, 'bubble')));
    check('het potje gaat door', a.get('session.over') !== true && a.get('session.S.hist.length') >= h);
  });

  await regel('[2.3] de voorspelvraag en een rokade: een tik op de toren telt ook', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5', 'd2d3']) });
    /* met 0.1 stelt Turbo de vraag en wacht hij */
    a.ev('setPref("predict", true); Math.random = function () { return 0.1; }');
    a.tik('verderKaart');
    await wacht();
    /* Turbo is aan zet en gaat rokeren: de vraag staat open met die zet */
    a.ev('(function () { var m = legalMoves(session.S).find(function (x) { return x.flags === "K"; });' +
      'session.pending = m; BD.mode = "predict"; strookModus("predict"); })()');
    const voor = a.get('P.c.predictHits || 0');
    tikVeld(a, a.get('sqFromAlg("h8")'));
    await wacht(2000);
    check('de toren telt als goed voorspeld', a.get('P.c.predictHits || 0') === voor + 1);
  });

  await regel('[2.3] een goed voorspelde zet is Turbo\'s zin in de strook, geen melding', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    const van = a.get('session.pending.from');
    tikVeld(a, van);
    await wacht(200);
    check('Turbo zegt het in de strook', /Goed voorspeld/.test(tekstVan(a, 'bubble')));
    check('geen melding op het speelscherm', !zichtbaar(a, 'toast'));
  });

  await regel('[2.3] Hulp aan of uit in een potje: alleen de twee schakelaars met hun stand in woorden, en ze werken', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true); setPref("predict", false)');
    await startPotje(a, 1);
    a.tik('meerBtn');
    await wacht();
    tikTekst(a, 'Hulp aan of uit');
    await wacht();
    const s = a.scherm();
    check('de stand in woorden', /Blunder-alarm: aan/.test(s) && /Voorspellen: uit/.test(s));
    check('geen Alles wissen en geen ander apparaat', !/Alles wissen/.test(s) && !/ander apparaat/.test(s));
    check('Klaar is er', kanTikken(a, 'Klaar'));
    tikTekst(a, 'Blunder-alarm');
    await wacht();
    check('blunderalarm uit, opgeslagen en in woorden', a.get('P.guard') === false && a.get('DOC.lww.guard.v') === false && /Blunder-alarm: uit/.test(a.scherm()));
    tikTekst(a, 'Voorspellen');
    await wacht();
    check('voorspellen aan, opgeslagen en in woorden', a.get('P.predict') === true && a.get('DOC.lww.predict.v') === true && /Voorspellen: aan/.test(a.scherm()));
    tikTekst(a, 'Klaar');
    await wacht();
    check('Klaar sluit, terug in het potje', !a.open() && opSpeelscherm(a));
  });

  for (const plek of ['potje', 'oefening']) {
    await regel('[2.3] ⋯ heeft een rij voor het geluid met de stand in woorden: ' + plek, async function (check) {
      const a = nieuwKind();
      if (plek === 'potje') await startPotje(a, 1); else await startOefening(a, 'scan');
      a.tik('meerBtn');
      await wacht();
      check('de rij', /Geluid: aan/.test(a.scherm()));
      tikTekst(a, 'Geluid');
      await wacht();
      check('uit, opgeslagen', a.get('P.sound') === false && a.get('DOC.lww.sound.v') === false);
      if (!a.open()) { a.tik('meerBtn'); await wacht(); }
      check('en in woorden', /Geluid: uit/.test(a.scherm()));
    });
  }

  await regel('[2.3] een promotie verandert het materiaalverschil', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    a.ev('(function () { session.S = parseFEN("7k/1P6/8/8/8/8/8/K7 w - - 0 1"); BD.mode = "move"; updateTrays(); renderBoard(); })()');
    const voor = tekstVan(a, 'materiaal');
    zet(a, 'b7b8q');
    await wacht(3000);
    check('na de promotie staat jij meer voor', /Jij \+9/.test(tekstVan(a, 'materiaal')) && voor !== tekstVan(a, 'materiaal'));
  });

  await regel('[2.5] een potje korter dan tien zetten: de eindkaart zegt waarom het niet meetelt', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    await wacht(2000);
    await geefOp(a);
    await wacht(2000);
    check('de reden', /Dit potje telt niet mee: het was korter dan tien zetten\./.test(tekstVan(a, 'eindkaart')));
    check('als rustige regel, niet in de opmaak van de XP', !/class="ek-xp"[^>]*>Dit potje/.test(a.el('eindkaart')._html || ''));
  });

  await regel('[2.5] na Revanche! staat er geen eindkaart meer over het bord', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    await geefOp(a);
    await wacht(2000);
    check('testopzet: de eindkaart', zichtbaar(a, 'eindkaart'));
    tikTekst(a, 'Revanche');
    await wacht(2000);
    check('weg na Revanche', !zichtbaar(a, 'eindkaart') && opSpeelscherm(a) && a.get('session.over') !== true);
  });

  await regel('[2.5] een trofee en een gehaald weekdoel in een rondje: geen melding, wel een badge op de eindkaart van het rondje', async function (check) {
    const a = nieuwKind();
    a.ev('bump("stars", 99); setPref("weekGoal", { kind: "opdr", n: 1 })');
    await startOefening(a, 'scan');
    for (const sq of a.get('session.task.targets.slice()')) tikVeld(a, sq);
    tikTekst(a, 'Klaar');
    /* meteen kijken: een melding verdwijnt vanzelf na een paar seconden */
    check('geen melding op het speelscherm', !zichtbaar(a, 'toast'));
    await wacht();
    check('de trofee en het weekdoel zijn wel verdiend', a.get('!!P.badges.sterren') && a.get('goalDoneWeek(curWeek())'));
    for (let i = 0; i < 4; i++) { await volgende(a); await scanGoed(a); }
    await volgende(a);
    check('de eindkaart van het rondje toont de trofee en het weekdoel', /Sterrenregen/.test(zonderZacht(a.scherm())) && /Weekdoel gehaald/.test(a.scherm()));
  });

  await regel('[2.5] een level in een rondje: geen venster tijdens het spelen, een badge op de eindkaart, en thuis het venster', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 140); checkLevelUp()');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('geen venster over de opdracht', !a.ziet('Level omhoog') && kanTikken(a, 'Volgende'));
    for (let i = 0; i < 4; i++) { await volgende(a); await scanGoed(a); }
    tikTekst(a, 'Volgende');
    await wacht();
    check('de eindkaart van het rondje toont het level', /Level Paard/.test(a.scherm()));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis het venster met het nieuwe level', a.ziet('Level omhoog') && opThuis(a));
  });

  await regel('[2.5] een oefening: de kop zegt "1 van 5 · ⭐ 2 · ✔ bewaard" en geen reeks of vorm', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    await scanGoed(a);
    const kop = ['roundChip', 'drillStars', 'bewaard'].map(function (id) { return zichtbaar(a, id) ? tekstVan(a, id).trim() : ''; });
    check('de drie delen in deze volgorde', /^1 van 5$/.test(kop[0]) && /^⭐ 3$/.test(kop[1]) && /bewaard/.test(kop[2]));
    const html = a.els['scr-play']._html || '';
    check('in de pagina ook in deze volgorde', html.indexOf('id="roundChip"') < html.indexOf('id="drillStars"') &&
      html.indexOf('id="drillStars"') < html.indexOf('id="bewaard"'));
    check('geen reeks en geen vorm', !/op een rij|Vorm/.test(tekstVan(a, 'drillStars')));
  });

  /* Opgeven openen verandert niets; alleen een bevestigde opgave beëindigt het potje */
  for (const uitweg of ['het kruisje', 'een tik naast de kaart', 'Escape', 'Nee, doorspelen']) {
    await regel('[2.3] Opgeven tijdens de voorspelvraag, dan ' + uitweg + ': de vraag staat er nog zoals hij was', async function (check) {
      const a = nieuwKind();
      check('testopzet: de vraag staat open', await metVoorspelvraag(a));
      const zetten = a.get('session.S.hist.length'), turbo = a.get('session.pending.from');
      a.tik('meerBtn');
      await wacht(200);
      tikTekst(a, 'Opgeven');
      await wacht(200);
      check('testopzet: Opgeven? staat open', a.ziet('Opgeven?'));
      if (uitweg === 'het kruisje') a.tik('mClose');
      else if (uitweg === 'een tik naast de kaart') fire(a.el('overlay'), 'click', { target: a.el('overlay') });
      else if (uitweg === 'Escape') fire(a.doc, 'keydown', { key: 'Escape' });
      else tikTekst(a, 'Nee, doorspelen');
      await wacht(20000);
      check('het venster is dicht en het potje loopt', !a.open() && a.get('session.over') !== true);
      check('Turbo wacht nog: er kwam geen zet bij', a.get('session.S.hist.length') === zetten);
      check('de vraag staat er nog', a.get('BD.mode') === 'predict' && tekstVan(a, 'bubble').trim() === 'Welk stuk zet Turbo? Tik het aan.' &&
        kanTikken(a, 'Speel maar'));
      check('de hulpjes staan nog uit', ['cloudBtn', 'tip', 'undo'].every(function (id) { return a.get('actionBtns.' + id + '.disabled') === true; }));
      tikVeld(a, turbo);
      await wacht();
      check('een tik op het stuk van Turbo is het antwoord, en dan zet hij', a.get('session.S.hist.length') === zetten + 1 && a.get('BD.mode') !== 'predict');
    });
  }

  await regel('[2.3] Opgeven tijdens de voorspelvraag, dan "Ja, ik geef op": het potje is uit en de vraag is weg', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    await geefOp(a);
    await wacht(2000);
    check('de eindkaart', zichtbaar(a, 'eindkaart') && a.get('session.over') === true);
    check('geen vraag meer in de strook', !zichtbaar(a, 'predictBar') && a.get('BD.mode') !== 'predict' && !/Welk stuk zet Turbo/.test(tekstVan(a, 'bubble')));
  });

  /* de hulpjes komen terug zodra de vraag dicht is, behalve een Speurbril die op is */
  await regel('[2.3] na het antwoord op de voorspelvraag staan Denkwolk, Speurbril en Zet terug weer aan', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    tikVeld(a, a.get('session.pending.from'));
    await wacht();
    check('testopzet: het kind is aan zet', a.get('BD.mode') === 'move');
    check('de hulpjes staan aan', ['cloudBtn', 'tip', 'undo'].every(function (id) { return a.get('actionBtns.' + id + '.disabled') === false; }));
  });

  await regel('[2.3] nadat Remise aanbieden de voorspelvraag sloot, staan de hulpjes weer aan', async function (check) {
    const a = nieuwKind();
    check('testopzet: de vraag staat open', await metVoorspelvraag(a));
    await biedRemise(a);
    await wacht(5000);
    check('testopzet: het kind is aan zet', a.get('BD.mode') === 'move' && a.get('session.over') !== true);
    check('de hulpjes staan aan', ['cloudBtn', 'tip', 'undo'].every(function (id) { return a.get('actionBtns.' + id + '.disabled') === false; }));
  });

  await regel('[2.3] zonder Speurbril over blijft de Speurbril uit, ook nadat de voorspelvraag dicht ging', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5'], { tips: 0 }) });
    a.ev('setPref("predict", true); Math.random = function () { return 0.1; }');
    a.tik('verderKaart');
    await wacht();
    check('testopzet: de Speurbril is op', a.get('session.tips') === 0 && a.get('actionBtns.tip.disabled') === true);
    await zetEnWacht(a, 'g1f3');
    check('testopzet: de vraag staat open', await zagOoit(function () { return a.get('BD.mode') === 'predict'; }, 3000));
    tikVeld(a, a.get('session.pending.from'));
    await wacht();
    check('testopzet: het kind is aan zet', a.get('BD.mode') === 'move');
    check('de Speurbril blijft uit', a.get('actionBtns.tip.disabled') === true && !kanTikken(a, 'Speurbril'));
    check('de andere twee staan aan', a.get('actionBtns.cloudBtn.disabled') === false && a.get('actionBtns.undo.disabled') === false);
  });

  /* een profiel kent zijn level vanaf het begin, dus ook een nieuw kind hoort zijn eerste level */
  async function eersteRondjeFoutloos(a, check) {
    await startOefening(a, 'scan');
    let venster = false;
    for (let i = 0; i < 5; i++) {
      await scanGoed(a);
      venster = venster || a.open();
      tikTekst(a, 'Volgende');
      await wacht();
    }
    check('geen venster tijdens het rondje', !venster);
    check('testopzet: genoeg XP voor Paard', a.get('levelIdx(P.xp)') === 1);
    check('de kaart van het rondje toont het level', /Rondje klaar/.test(a.scherm()) && /Level Paard/.test(a.scherm()));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis het venster met het level en het nieuwe bord', opThuis(a) && a.ziet('Level omhoog') && /Paard/.test(a.scherm()) && /Oceaan/.test(a.scherm()));
    a.tik('lvlOk');
    await startOefening(a, 'scan');
    a.tik('backBtn');
    await wacht();
    check('het venster komt geen tweede keer', opThuis(a) && !a.ziet('Level omhoog'));
  }

  await regel('[2.5] een nieuw kind en zijn eerste level: een badge op de kaart van het rondje en thuis eenmaal het venster', async function (check) {
    await eersteRondjeFoutloos(nieuwKind(), check);
  });

  await regel('[2.5] een profiel van nu dat nog nooit een level bewaarde en nog geen naam heeft: het eerste level komt ook', async function (check) {
    /* zonder naam vraagt de app eerst de naam, en komt hij bij het openen niet langs het thuisvenster */
    const o = maakOpslag();
    o.setItem('schaakheld1', JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: {},
      max: { best: 0, goal: {} }, loc: { streak: 0, lastLevel: null, day: null, weekSeen: null } }));
    await eersteRondjeFoutloos(nieuwKind({ opslag: o }), check);
  });

  /* wat dit apparaat liet zien, staat per apparaat bewaard; een trofee die nog niet te zien was, komt thuis */
  async function potjeMetDromer(a) {
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    tikTekst(a, 'Denkwolk');
    await wacht(300);
    zet(a, 'g1f3');
    await wacht(3000);
    tikTekst(a, 'Terug naar echt');
    await wacht(300);
    return a.get('!!P.badges.wolk') && a.get('!session.cloud');
  }

  await regel('[2.5] een trofee in een potje en dan Pauze: thuis komt de trofee, daarna nergens nog een keer', async function (check) {
    const a = nieuwKind();
    check('testopzet: de trofee Dromer', await potjeMetDromer(a));
    check('op het speelscherm geen venster en geen melding', !a.open() && !zichtbaar(a, 'toast'));
    a.tik('backBtn');
    await wacht();
    check('thuis de trofee', opThuis(a) && a.ziet('Trofee verdiend!') && /Dromer/.test(a.scherm()) &&
      /Je verdiende hem tijdens het spelen\./.test(a.scherm()));
    tikTekst(a, 'Super');
    check('daarna de melding van Pauze', /Bewaard/.test(toastTekst(a)));
    await wacht();
    a.tik('verderKaart');
    await wacht();
    await geefOp(a);
    await wacht(2000);
    check('testopzet: de eindkaart', zichtbaar(a, 'eindkaart'));
    check('de eindkaart toont hem niet nog een keer', !/Dromer/.test(tekstVan(a, 'eindkaart')));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis ook niet', opThuis(a) && !a.ziet('Dromer'));
  });

  await regel('[2.5] een trofee in een potje en dan herladen: thuis komt de trofee, eenmaal', async function (check) {
    let a = nieuwKind();
    check('testopzet: de trofee Dromer', await potjeMetDromer(a));
    a = herlaad(a);
    await wacht();
    check('thuis de trofee', opThuis(a) && a.ziet('Trofee verdiend') && /Dromer/.test(a.scherm()));
    tikTekst(a, 'Super');
    a = herlaad(a);
    await wacht();
    check('na nog een keer herladen niet opnieuw', !a.ziet('Dromer'));
  });

  await regel('[2.5] een trofee in een potje dat uitgespeeld wordt: de eindkaart toont hem en thuis komt hij niet nog eens', async function (check) {
    const a = nieuwKind();
    check('testopzet: de trofee Dromer', await potjeMetDromer(a));
    await geefOp(a);
    await wacht(2000);
    check('de eindkaart toont de trofee', /Dromer/.test(tekstVan(a, 'eindkaart')));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis niet nog een keer', opThuis(a) && !a.ziet('Dromer'));
  });

  await regel('[2.5] een trofee in een rondje en dan Pauze: thuis komt de trofee, de kaart van het rondje later niet', async function (check) {
    const a = nieuwKind();
    a.ev('bump("stars", 99)');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('testopzet: Sterrenregen', a.get('!!P.badges.sterren'));
    a.tik('backBtn');
    await wacht();
    check('thuis de trofee', opThuis(a) && a.ziet('Trofee verdiend') && /Sterrenregen/.test(zonderZacht(a.scherm())));
    tikTekst(a, 'Super');
    a.tik('verderKaart');
    await wacht();
    for (let i = 0; i < 4; i++) { await scanGoed(a); await volgende(a); }
    check('testopzet: de kaart van het rondje', /Rondje klaar/.test(a.scherm()));
    check('die toont hem niet nog eens', !/Sterrenregen/.test(zonderZacht(a.scherm())));
  });

  await regel('[2.5] een profiel van nu met trofeeën: na de update telt elke trofee als getoond en komt alleen een nieuwe', async function (check) {
    const o = maakOpslag();
    o.setItem('schaakheld1', JSON.stringify({ v: 2, epoch: 0, cnt: { xp: { d1: 200 }, wins: { d1: 1 }, 'c.gamesPlayed': { d1: 3 } },
      set: { badges: { potje: true, winst: true } }, lww: { name: { v: 'Mees', t: 1 } }, max: { best: 2, goal: {} },
      loc: { streak: 0, lastLevel: 1, day: null, weekSeen: null } }));
    /* als herstart: zo sluit de testopzet geen venster dat de app bij het openen toont */
    const a = maakApparaat('Mees', { opslag: o, herstart: true });
    a.ev('setPref("predict", false); setPref("guard", false)');
    await wacht();
    check('bij het openen geen venster met oude trofeeën', !a.open());
    check('ze staan bewaard als getoond', JSON.stringify(opgeslagen(a, 'schaakheld1').loc.shownBadges.slice().sort()) === '["potje","winst"]');
    check('testopzet: de trofee Dromer', await potjeMetDromer(a));
    a.tik('backBtn');
    await wacht();
    check('thuis alleen de nieuwe', a.ziet('Trofee verdiend') && /Dromer/.test(a.scherm()) && !/Winnaar|Eerste potje/.test(a.scherm()));
  });

  await regel('[2.5] een sync tijdens een rondje: wat hier wacht, blijft wachten; wat het andere apparaat verdiende, komt hier niet', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 140); bump("stars", 99)');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('testopzet: hier Sterrenregen en level Paard', a.get('!!P.badges.sterren') && a.get('levelIdx(P.xp)') === 1);
    a.ev('applyRemoteDoc((function () { var d = JSON.parse(JSON.stringify(DOC)); d.cnt.xp.anderApparaat = 10;' +
      'd.set.badges.orakel = true; return d; })()); refreshAfterSync()');
    check('testopzet: de trofee van het andere apparaat is er', a.get('!!P.badges.orakel'));
    for (let i = 0; i < 4; i++) { tikTekst(a, 'Volgende'); await wacht(); await scanGoed(a); }
    tikTekst(a, 'Volgende');
    await wacht();
    const kaart = a.scherm();
    check('de kaart van het rondje toont wat hier verdiend is', /Sterrenregen/.test(zonderZacht(kaart)) && /Level Paard/.test(kaart));
    check('en niet de trofee van het andere apparaat', !/Orakel/.test(kaart));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis het level', a.ziet('Level omhoog'));
    a.tik('lvlOk');
    await wacht();
    check('thuis geen trofee van het andere apparaat', !a.ziet('Orakel'));
  });

  /* de randjes van een truc gaan vanzelf weg, die van de Speurbril pas als het bord verandert */
  await regel('[2.8] de Speurbril vlak na een truc van Turbo: de randjes blijven tot het bord verandert', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    const vork = async function () {
      /* Turbo aan zet; het paard naar c2 valt koning en toren tegelijk aan */
      a.ev('(function () { session.S = parseFEN("4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1"); BD.mode = "off"; BD.spy.clear(); renderBoard();' +
        'doTurboMove(legalMoves(session.S).find(function (m) { return moveKey(m) === "d4c2"; })); })()');
      await wacht(1500);
      return a.get('BD.mode') === 'move' && a.get('BD.spy.size') > 0;
    };
    check('testopzet: Turbo speelt de vork en zet zijn randjes', await vork());
    await wacht(4000);
    check('zonder Speurbril gaan de randjes van de truc vanzelf weg', a.get('BD.spy.size') === 0);
    check('testopzet: nog een vork', await vork());
    tikTekst(a, 'Speurbril');
    await wacht(300);
    const randjes = a.get('BD.spy.size');
    check('testopzet: de Speurbril zet randjes', randjes > 0 && a.get('session.tips') === 2);
    await wacht(6000);
    check('zes seconden later staan ze er nog', a.get('BD.spy.size') === randjes);
  });

  /* de keuzes staan waar Volgende stond (na veilig of valstrik); een tik in de eerste 350 ms telt niet */
  await regel('[2.4] De Beste Zet: een tik op een keuze in de eerste 350 ms van een nieuwe opdracht telt niet, daarna wel', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('(function () { session.round = 2; $("roundChip").textContent = "2 van 5"; setTask(null); setOptions(null); BD.arrows = []; buildSafe(); })()');
    await wacht(500);
    check('testopzet: opdracht 2 is veilig of valstrik', kanTikken(a, 'Veilig'));
    tikTekst(a, 'Veilig');
    await wacht(8000);
    check('testopzet: Volgende staat er', kanTikken(a, 'Volgende'));
    tikTekst(a, 'Volgende');
    await wacht(150);
    const keuzes = a.el('optionsBox').querySelectorAll('.opt');
    check('testopzet: opdracht 3 heeft drie keuzes', a.get('session.round') === 3 && keuzes.length === 3);
    if (keuzes.length !== 3) return;
    tikEl(a, keuzes[1], 'keuze B');
    await wacht(10);
    check('een tik vlak na het verschijnen telt niet', a.get('session.picked') === null && a.get('actionBtns.confirm.disabled') === true);
    await wacht(400);
    tikEl(a, keuzes[1], 'keuze B');
    await wacht(10);
    check('daarna telt een tik wel', a.get('session.picked') === 1 && a.get('actionBtns.confirm.disabled') === false);
  });

  /* F2: met een voorkeur voor de truc van de opdracht; een zet die twee trucs tegelijk is, toont die van de opdracht */
  const TWEE_TRUCS = [
    /* het paard naar e6: aftrekschaak van de loper op h8 en een vork op de torens; de opdracht is een vork */
    ['vork', '3r1r1k/8/8/8/3N4/8/8/B5K1 w - - 0 1', /VORK/],
    /* het paard naar e6: een vork en de loper valt de dame op g7 aan; de opdracht is een aftrekaanval */
    ['aftrek', '3r1r2/6q1/k7/8/3N4/8/8/B6K w - - 0 1', /AFTREKAANVAL/]
  ];
  for (const [type, fen, woord] of TWEE_TRUCS) {
    await regel('[2.4] Trucendoos, ' + type + ' die ook een andere truc is: de poging en de uitleg noemen de truc van de opdracht', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      zetOpdracht(a, fen, type, ['d4e6']);
      a.ev('opdrachtVan("trucs." + session.task.type)');
      const fout = a.get('legalMoves(session.S).filter(function (m) { var i = patternsAfterMove(session.S, m);' +
        'return !patternMatches(session.S, m, session.task.type, i) && !patternMatches(session.S, m, session.task.type, Object.assign({}, i, { safe: true })); })' +
        '.map(function (m) { return moveKey(m); }).slice(0, 2)');
      check('testopzet: d4e6 is twee trucs', a.get('patternCallouts(session.S, session.task.answers[0].m).length') === 2);
      check('testopzet: twee foute zetten', fout.length === 2);
      zet(a, fout[0]);
      await wacht(3000);
      check('de poging noemt deze truc', tekstVan(a, 'hulpZin').indexOf('Nog niet de ' + a.get('PATTERNS.' + type + '.n.toLowerCase()') + '.') === 0);
      zet(a, fout[1]);
      await wacht(8000);
      const reden = a.doc.__tekst(a.el('taskBox').querySelectorAll('.e-body')[0] || a.el('taskBox')).trim();
      check('de uitleg noemt deze truc: ' + reden.slice(0, 50), a.get('session.phase') === 'review' && woord.test(reden));
    });
  }

  /* de Trucendoos zegt bij mat in twee "Nog geen mat in twee", niet "de mat" */
  await regel('[2.4] Trucendoos, mat in twee: een foute eerste zet zegt "Nog geen mat in twee."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    zet(a, 'h1h2');
    await wacht(3000);
    check('de zin', onderZin(a) === 'Nog geen mat in twee. Kijk naar alle stukken van Turbo, en probeer nog een zet.');
  });

  /* Koning ontsnapt: "toch" alleen als Turbo het stuk pakt dat al hing */
  await regel('[2.4] Koning ontsnapt: pakt Turbo na een poging een ander stuk, dan zegt de zin welk stuk en waar, zonder "toch"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    /* de toren op d4 hangt (de pion op e5) en dekt het paard op d6 tegen de toren op d8 */
    zetOpdracht(a, '3r2k1/5ppp/3N4/4p3/3R4/8/PP4PP/6K1 w - - 0 1', 'stuk', ['d4d5', 'd4d3', 'd4d2', 'd4d1'], '{ hang: threatDetails(S)[0] }');
    zet(a, 'd4a4');
    await wacht(4000);
    check('de zin', /^Turbo speelt .+ en pakt je paard op d6\. Probeer nog een zet\.$/.test(onderZin(a)) && !/toch/.test(onderZin(a)));
  });

  await regel('[2.4] Koning ontsnapt: de hint zegt of de koning het zelf moet doen', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '6k1/8/8/8/8/8/6PP/r5K1 w - - 0 1', 'schaak', ['g1f2']);
    tikTekst(a, 'Hint');
    await wacht();
    check('alleen de koning kan weg', onderZin(a).indexOf('Je koning moet het zelf doen.') === 0);
    zetOpdracht(a, '6k1/8/8/8/8/8/3R1PPP/r5K1 w - - 0 1', 'schaak', ['d2d1']);
    a.ev('setActions([{ label: "💡 Hint", cls: "plain small hint", fn: koningHint, id: "hint" }])');
    tikTekst(a, 'Hint');
    await wacht();
    check('een ander stuk redt de koning', onderZin(a).indexOf('Met het stuk dat nu oplicht, kun je je redden.') === 0);
  });

  await regel('[2.4] Koning ontsnapt: de uitleg zegt hoeveel goede zetten er zijn', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    const opdracht = function (fen) {
      a.ev('(function () { session.lastType = "stuk"; pickKoningTask = function () { var S = parseFEN(' + JSON.stringify(fen) + ');' +
        'return { S: S, type: "schaak", answers: legalMoves(S).map(function (m) { return { m: m, info: null }; }) }; };' +
        'setTask(null); buildKoning(); })()');
      return onderZin(a);
    };
    check('één', /Er is één goede zet\.$/.test(opdracht('6k1/8/8/8/8/8/3R1PPP/r5K1 w - - 0 1')));
    check('twee', /Er zijn twee goede zetten\.$/.test(opdracht('6k1/8/8/8/8/8/3R2PP/r5K1 w - - 0 1')));
  });

  /* ================= increment 3 ================= */

  const NU = new __EchteDate('2026-11-12T16:00:00').getTime();
  const dagenTerug = function (n) { return new __EchteDate(NU - n * 86400000).toISOString().slice(0, 10); };
  async function stap(a, ctx) {
    return a.get('nextStep(P, ' + JSON.stringify(Object.assign({ now: NU, potje: null, rondjes: null, samen: null, uitnodiging: null, moment: null }, ctx || {})) + ')');
  }
  /* nextStep met een profiel als JSON-tekst, los van het profiel van de app zelf */
  async function stapMet(a, profiel, ctx) {
    return a.get('nextStep(JSON.parse(' + JSON.stringify(profiel) + '), ' +
      JSON.stringify(Object.assign({ now: NU, potje: null, rondjes: null, samen: null, uitnodiging: null, moment: null }, ctx || {})) + ')');
  }
  const kaartVan = function (r) { return JSON.stringify([r.rule, r.title, r.text, r.button, r.action]); };

  await regel('[3.1] geval 1: nieuw, antwoord "nieuw": R6, Speurogen, "Nieuw voor jou."', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("start", "nieuw")');
    const r = await stap(a);
    check('R6 Speurogen', r.rule === 'R6' && /Speurogen/.test(r.title) && r.action.kind === 'scan');
    check('de reden', /Nieuw voor jou\./.test(r.text));
  });

  await regel('[3.1] geval 2: nieuw, antwoord "sterk": R7 tegen Turbo, niet Super Turbo', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("start", "sterk")');
    const r = await stap(a);
    check('R7 op niveau 2', r.rule === 'R7' && r.action.go === 'game' && r.action.level === 2);
    check('de zin', /Win je van Turbo, dan wacht Super Turbo\./.test(r.text) && !/Super Turbo/.test(r.button));
  });

  await regel('[3.1] geval 3: een bestaand profiel zonder start en twee keer Turbo verslagen: sterk, nooit gevraagd', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 1200); bump("wins", 2); bump("c.winsL2", 2); bump("c.gamesPlayed", 9)');
    const r = await stap(a);
    check('R7 bij Turbo (stadium sterk)', r.rule === 'R7' && r.action.level === 2);
    const b = herlaad(a);
    await wacht();
    check('geen vraag hoe goed je schaakt', !/Hoe goed ken je schaken/.test(b.modal()));
  });

  await regel('[3.1] geval 4: wat bezig is gaat voor, in de volgorde van de kaart', async function (check) {
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

  await regel('[3.1] geval 5: vier dagen weg: R3 met het level', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5)');
    a.ev('P.lastSeen = ' + JSON.stringify(dagenTerug(4)));
    const r = await stap(a);
    check('R3 met Loper; het welkom staat in de groet', r.rule === 'R3' && r.title === 'Speel een potje' && /Loper/.test(r.text));
  });

  await regel('[3.1] geval 6: weekdoel potjes 3, er staan er 2: R4 "Nog 1 potje tegen ..."', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); setPref("weekGoal", { kind: "potjes", n: 3, lvl: 2 }); bumpWeek("potjes2", 2)');
    const r = await stap(a);
    check('R4', r.rule === 'R4' && /Nog 1 potje tegen/.test(r.text));
  });

  await regel('[3.1] geval 7: na een potje zonder sleutelmoment: R6, niet de laatst geoefende', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); logResult("scan", 0.5, 20000, 3); P.lastKind = "game"');
    const r = await stap(a);
    check('R6, niet Speurogen', r.rule === 'R6' && r.action.kind !== 'scan');
  });

  await regel('[3.1] geval 8: na Speurogen: R7, nooit R6 Speurogen', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.gamesPlayed", 5); P.lastKind = "scan"');
    const r = await stap(a);
    check('R7', r.rule === 'R7');
  });

  await regel('[3.1] geval 9: genoeg XP voor Toren maar Turbo niet verslagen: R7 op niveau 2, "Win je, dan word je Toren"', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 950); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "scan"');
    const r = await stap(a);
    check('R7, niveau 2, de zin', r.rule === 'R7' && r.action.level === 2 && /Win je, dan word je Toren/.test(r.text));
  });

  await regel('[3.1] geval 10: twee oefeningen gelijk: de eerste in de leervolgorde', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game";' +
      '["scan", "koning", "opening"].forEach(function (k) { logResult(k, 0.5, 20000, 3); logResult(k, 0.5, 20000, 3); })');
    const r = await stap(a);
    check('De Beste Zet voor de Trucendoos', r.rule === 'R6' && r.action.kind === 'best3');
  });

  /* learning.md 1.7: zolang de poort "5 perfecte speurrondes" open is, kiest R6
     eerst Speurogen, ook als dat de laatst geoefende is; R7 speelt dan L* */
  await regel('[3.1] de poort "5 perfecte speurrondes" staat open: R6 kiest Speurogen, R7 speelt tegen Turbo', async function (check) {
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

  await regel('[3.1] de Verder-kaart met een potje als suggestie: één tik start het potje', async function (check) {
    const b = await kaartMetSuggestie(check, 'sterk');
    check('een potje tegen Turbo op niveau 2', opSpeelscherm(b) && b.get('session.kind') === 'game' && b.get('session.level') === 2);
  });

  await regel('[3.1] de Verder-kaart met een oefening als suggestie: één tik start Speurogen', async function (check) {
    const b = await kaartMetSuggestie(check, 'nieuw');
    check('Speurogen begint', opSpeelscherm(b) && b.get('session.kind') === 'scan' && /\b1 van 5/.test(tekstVan(b, 'roundChip')));
  });

  /* learning.md 1.4: lastKind wordt gezet als een rondje af is, of het kind de kaart volgde of niet */
  await regel('[3.2] na een rondje Speurogen stelt de kaart een potje voor, niet weer Speurogen', async function (check) {
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

  await regel('[3.2] alle vijf oefeningen en beide spelknoppen staan op Spelen, wat de kaart ook zegt', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'e7e5']) });
    const ids = ['spelTurbo', 'spelVriend', 'oefen-scan', 'oefen-best3', 'oefen-trucs', 'oefen-koning', 'oefen-opening'];
    check('elk een knop die werkt', ids.every(function (id) { return heeftKlik(a, id) && zichtbaar(a, id); }));
    a.tik('oefen-scan');
    await wacht();
    check('Speurogen begint', opSpeelscherm(a) && /\b1 van 5/.test(tekstVan(a, 'roundChip')));
  });

  await regel('[3.4] de levelchip in de kop opent Ik', async function (check) {
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

  await regel('[3.5] Ik: XP en de meesterproef als twee aparte controles (Mees)', async function (check) {
    const a = await kindUitDoc(docVan('Mees', { xp: 1800, stars: 69, wins: 6, 'c.winsL2': 2, 'c.perfectScans': 8, 'c.gamesPlayed': 25 },
      { max: { best: 10, goal: { '2026-W42': 60, '2026-W43': 60, '2026-W44': 60, '2026-W45': 60 } } }));
    a.tik('tabIk');
    const t = tekstVan(a, 'levelPath') + ' ' + tekstVan(a, 'lpNext');
    check('de XP is gehaald', /✔\s*1800 XP/.test(t));
    check('de proef staat nog open, 2 van 3', /Nog te doen[^]*versla Turbo[^]*2 van 3/.test(t));
  });

  await regel('[3.5] Ik: XP en de meesterproef als twee aparte controles (Lotte)', async function (check) {
    const a = await kindUitDoc(docVan('Lotte', { xp: 2565, stars: 230, wins: 1, 'c.perfectScans': 13, 'c.gamesPlayed': 7 }));
    a.tik('tabIk');
    const t = tekstVan(a, 'levelPath') + ' ' + tekstVan(a, 'lpNext');
    check('de XP is gehaald', /✔\s*900 XP/.test(t));
    check('de proef staat nog open, 0 van 1', /Nog te doen[^]*versla Turbo[^]*0 van 1/.test(t));
  });

  await regel('[3.5] Ik zegt wat er bewaard is en waar', async function (check) {
    const a = nieuwKind();
    a.tik('tabIk');
    check('de bewaard-regel', /bewaard|staat op deze/i.test(tekstVan(a, 'ikBewaard')) &&
      /Een potje blijft hier staan vanaf de eerste zet, een rondje vanaf het eerste antwoord\./.test(tekstVan(a, 'ikBewaard')));
  });

  await regel('[3.6] het getal dat het level bepaalt heet XP, zonder ster', async function (check) {
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

  await regel('[3.7] geen reeks in een rondje en geen reeksbonus meer: drie goede antwoorden geven 90 XP', async function (check) {
    const a = nieuwKind();
    const xp = a.get('P.xp');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 3);
    check('geen "op een rij"', !/op een rij/.test(tekstVan(a, 'drillStars')));
    check('geen vorm tijdens het rondje', !/Vorm/i.test(tekstVan(a, 'drillStars')));
    check('90 XP zonder bonus', a.get('P.xp') - xp === 90);
  });

  await regel('[3.7] Vuurpijl: 25 opdrachten met drie sterren, in de nieuwe teller c.drie', async function (check) {
    const a = nieuwKind();
    a.ev('bump("c.drie", 24)');
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('c.drie telt mee', a.get('P.c.drie') === 25);
    check('Vuurpijl verdiend', a.get('!!P.badges.vlam'));
    check('de tekst', /25 opdrachten met 3 sterren/.test(a.get('BADGES.find(function (b) { return b.id === "vlam"; }).d')));
  });

  await regel('[3.7] compat: een document van nu met best 6 houdt Vuurpijl', async function (check) {
    const a = await kindUitDoc(docVan('Daan', { xp: 2710, stars: 70, 'c.pat.penning': 3 },
      { set: { badges: { vlam: true } }, max: { best: 6, goal: {} }, loc: { streak: 4, lastLevel: 3, weekSeen: '2026-W46' } }));
    check('Vuurpijl blijft', a.get('!!P.badges.vlam') && a.get('P.best') === 6);
    check('en de nieuwe teller bestaat', a.get('P.c.drie') === 0);
  });

  await regel('[3.8] Instellingen: naam, bordkleur, geluid, de twee hulpjes, ander apparaat, en Alles wissen als laatste', async function (check) {
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

  await regel('[3.9] de kaart van een nieuwe week begint nooit met een nul', async function (check) {
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

  await regel('[3.9] een gehaald doel: "Vorige week: doel gehaald!"', async function (check) {
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

  await regel('[3.10] compat: een document van nu laadt met alles, krijgt geen vraag, en de nieuwe velden komen erbij', async function (check) {
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
    check('lastSeen per apparaat in het document', !!opgeslagen1.loc && 'lastSeen' in opgeslagen1.loc);
    check('de oude tellers staan er nog', !!opgeslagen1.cnt['c.pat.penning'] && !!opgeslagen1.cnt['c.winsL3']);
  });

  /* ---------- increment 3, na de review: spelen, herladen, de kaart lezen ---------- */

  const opgeslagenLoc = function (a) { const d = opgeslagen(a, 'schaakheld1'); return (d && d.loc) || {}; };

  await regel('[3.2] een rondje met minder dan 12 sterren: lastKind staat meteen in de opslag, en na herladen stelt de kaart een potje voor', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game"; saveP()');
    await startOefening(a, 'scan');
    for (let i = 0; i < 5; i++) {
      tikTekst(a, 'Klaar');
      await wacht();
      if (i < 4) await volgende(a);
    }
    check('testopzet: minder dan 12 sterren', a.get('session.earned') < 12);
    check('na het vijfde antwoord staat "scan" in de opslag', opgeslagenLoc(a).lastKind === 'scan');
    const b = herlaad(a);
    await wacht();
    const r = await stap(b);
    check('na herladen: een potje, geen oefening', b.get('P.lastKind') === 'scan' && r.rule === 'R7' &&
      tekstVan(b, 'verder').indexOf(r.title) >= 0);
  });

  await regel('[3.2] een openingsles: lastKind staat meteen in de opslag, en zonder les verandert er niets', async function (check) {
    const a = nieuwKind();
    a.ev('startOpening("coach", null)');
    await wacht();
    a.ev('openingEnd()');
    await wacht();
    check('"opening" in de opslag', opgeslagenLoc(a).lastKind === 'opening');
    const b = nieuwKind();
    b.ev('openingEnd()');
    check('openingEnd zonder les zet niets', b.get('P.lastKind') === null && !opgeslagenLoc(b).lastKind);
  });

  await regel('[3.2] een potje: lastKind "game" staat in de opslag, gewonnen of meteen opgegeven', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(1, ['e2e4', 'f7f6', 'd2d4', 'g7g5']) });
    a.ev('P.lastKind = "scan"; saveP()');
    a.tik('verderKaart');
    await wacht();
    await zetEnWacht(a, 'd1h5');
    await wacht(2000);
    check('testopzet: gewonnen', a.get('session.over') === true && a.get('P.wins') === 1);
    check('na een gewonnen potje "game" in de opslag', opgeslagenLoc(a).lastKind === 'game');
    const b = nieuwKind();
    b.ev('P.lastKind = "scan"; saveP()');
    await startPotje(b, 1);
    await geefOp(b);
    check('testopzet: opgegeven', b.get('session.over') === true);
    check('na meteen opgeven ook "game" in de opslag', opgeslagenLoc(b).lastKind === 'game');
  });

  await regel('[3.2] een potje beginnen zet lastSeen in de opslag', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('P.lastSeen = ' + JSON.stringify(dagenTerug(5)) + '; saveP()');
    await startPotje(a, 1);
    check('vandaag in de opslag', opgeslagenLoc(a).lastSeen === '2026-11-12');
  });

  await regel('[3.1] nextStep is puur: de meesterproeven komen uit het profiel dat het krijgt', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind(), leeg = nieuwKind();
    a.ev('bump("xp", 950); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "scan"');
    const p = a.get('JSON.stringify(P)');
    const zelf = await stap(a);
    check('testopzet: de app zelf zegt "Win je, dan word je Toren"', zelf.rule === 'R7' && /Win je, dan word je Toren/.test(zelf.text));
    check('hetzelfde profiel op een lege app geeft dezelfde kaart', kaartVan(await stapMet(leeg, p)) === kaartVan(zelf));
  });

  await regel('[3.1] nextStep is puur: de vorm en de dagen komen uit het profiel en ctx.now, niet uit de app en haar klok', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game";' +
      '["scan", "koning", "best3", "opening"].forEach(function (k) { logResult(k, 0.5, 20000, 3); }); logResult("trucs", 0.5, 20000, 0)');
    const p = a.get('JSON.stringify(P)');
    const zelf = await stap(a);
    check('testopzet: de app zelf kiest de Trucendoos, die gaat het minst goed', zelf.rule === 'R6' && zelf.action.kind === 'trucs');
    const leeg = nieuwKind();
    check('op een app zonder log dezelfde kaart', kaartVan(await stapMet(leeg, p)) === kaartVan(zelf));
    zetDatum('2026-12-02T16:00:00');
    check('en ook als de klok van de app drie weken verder staat', kaartVan(await stapMet(leeg, p)) === kaartVan(zelf));
  });

  await regel('[3.1] nextStep is puur: het weekdoel telt in de week van ctx.now, en gehaald is wat het profiel zegt', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "scan";' +
      'setPref("weekGoal", { kind: "potjes", n: 3, lvl: 1 }); bumpWeek("potjes1", 2)');
    const p = a.get('JSON.stringify(P)');
    const zelf = await stap(a);
    check('testopzet: R4, nog 1 potje', zelf.rule === 'R4' && /^Nog 1 potje /.test(zelf.text));
    const week = await stapMet(a, p, { now: NU + 8 * 86400000 });
    check('met ctx.now een week later telt die week, en daar staat nog niets', week.rule !== 'R4');
    zetDatum('2026-11-20T16:00:00');
    check('met de klok van de app een week later en ctx.now van nu: dezelfde kaart', kaartVan(await stapMet(a, p)) === kaartVan(zelf));
    zetDatum('2026-11-12T16:00:00');
    const b = nieuwKind();
    b.ev('setPref("weekGoal", { kind: "opdr", n: 1 }); bumpWeek("opdr", 1)');
    check('testopzet: de app zelf heeft haar weekdoel gehaald', b.get('goalDoneWeek(curWeek())') === true);
    check('het profiel zegt niet gehaald: dezelfde kaart', kaartVan(await stapMet(b, p)) === kaartVan(zelf));
  });

  await regel('[3.5] Ik: "Speel op een ander apparaat" openen en sluiten maakt nog geen ander apparaat', async function (check) {
    const a = nieuwKind();
    a.tik('tabIk');
    check('testopzet: alles staat op dit apparaat', /Alles staat op/.test(tekstVan(a, 'ikBewaard')));
    a.tik('ikKoppel');
    await wacht();
    check('testopzet: de koppelcode staat open', a.open() && /koppelen/i.test(a.scherm()));
    a.tik('linkDone');
    await wacht();
    const b = herlaad(a);
    await wacht();
    b.tik('tabIk');
    check('na sluiten en herladen nog steeds alleen dit apparaat', /Alles staat op/.test(tekstVan(b, 'ikBewaard')) &&
      !/andere apparaat/.test(tekstVan(b, 'ikBewaard')));
  });

  await regel('[3.10] compat: een gekoppeld apparaat van nu zegt na de update nog dat alles ook op het andere apparaat staat', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const o = maakOpslag();
    o.setItem('schaakheld-dev', '11112222-3333-4444-5555-666677778888');
    o.setItem('schaakheld1', JSON.stringify(docVan('Daan', { xp: 2710, stars: 70 })));
    o.setItem('schaakheld-acc', JSON.stringify({ id: 'abcdefgh12345678', secret: 'geheim-geheim-geheim' }));
    const a = maakApparaat(null, { opslag: o, herstart: true });
    await wacht();
    a.ev('closeModal()');
    a.tik('tabIk');
    check('het account en alles van vroeger blijft', a.get('ACC.id') === 'abcdefgh12345678' && a.get('P.xp') === 2710);
    check('Ik zegt: ook op het andere apparaat', /andere apparaat/.test(tekstVan(a, 'ikBewaard')));
  });

  await regel('[3.5] Ik: met XP te gaan "Nog N XP" met een balk, en die balk staat nooit vol', async function (check) {
    const a = nieuwKind();
    const balk = function () { return +((a.el('lpNext').innerHTML.match(/width:\s*([\d.]+)%/) || [])[1]); };
    a.ev('bump("xp", 300); renderHome()');
    a.tik('tabIk');
    check('300 XP: "Nog 100 XP" en de balk op 60%', /Nog 100 XP/.test(tekstVan(a, 'lpNext')) && balk() === 60);
    a.ev('bump("xp", 99); renderHome()');
    check('399 XP: "Nog 1 XP" en de balk niet vol', /Nog 1 XP/.test(tekstVan(a, 'lpNext')) && balk() <= 95);
  });

  await regel('[3.5] de balk in de kop staat nooit vol zolang er iets te doen is', async function (check) {
    const a = nieuwKind();
    const kop = function () { return parseFloat(a.get('$("xpFill").style.width')); };
    a.ev('bump("xp", 399); updateHud()');
    check('399 van 400 XP, de proef open: 95%', kop() === 95);
    a.ev('bump("xp", 551); bump("c.perfectScans", 5); updateHud()');
    check('genoeg XP voor Toren maar Turbo niet verslagen: 95%', a.get('P.xp') === 950 && kop() === 95);
  });

  await regel('[3.2] het weekdoel is de uitzondering: toprondes Speurogen, net een rondje Speurogen, de kaart zegt Speurogen', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 950); setPref("weekGoal", { kind: "top", n: 2, game: "scan" }); bumpWeek("top.scan", 1); P.lastKind = "scan"');
    const r = await stap(a);
    check('R4 met Speurogen', r.rule === 'R4' && r.action.kind === 'scan' && /Speurogen/.test(r.button));
  });

  await regel('[3.2] een weekdoel opdrachten stelt nooit de oefening voor die net af is', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "scan";' +
      'setPref("weekGoal", { kind: "opdr", n: 10 }); bumpWeek("opdr", 9)');
    const r = await stap(a);
    check('R4 met een andere oefening dan Speurogen', r.rule === 'R4' && r.action.go === 'oefening' && r.action.kind !== 'scan');
  });

  await regel('[3.1] het stadium "nieuw" eindigt bij 150 XP', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 149)');
    let r = await stap(a);
    check('149 XP: nog nieuw, een oefening', r.rule === 'R6');
    a.ev('bump("xp", 1)');
    r = await stap(a);
    check('150 XP: een potje', r.rule === 'R7');
  });

  await regel('[3.1] twee keer winnen op niveau 1 maakt het voorgestelde niveau 2', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 40); bump("wins", 1); bump("c.gamesPlayed", 1); P.lastKind = "scan"');
    let r = await stap(a);
    check('een keer gewonnen: niveau 1', r.rule === 'R7' && r.action.level === 1);
    a.ev('bump("xp", 40); bump("wins", 1); bump("c.gamesPlayed", 1)');
    r = await stap(a);
    check('twee keer: niveau 2', r.rule === 'R7' && r.action.level === 2);
  });

  /* de kaart voor een weekdoel, met `gedaan` al gehaald deze week */
  async function doelKaart(doel, sleutel, gedaan, extra) {
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game"; setPref("weekGoal", ' +
      JSON.stringify(doel) + ')' + (gedaan ? '; bumpWeek(' + JSON.stringify(sleutel) + ', ' + gedaan + ')' : '') + (extra || ''));
    return stap(a);
  }
  const VRIEND = '; setFriend("v1", { k: "' + 'a'.repeat(43) + '", naam: "Fien", since: 1 })';

  await regel('[3.11] "Bijna je weekdoel!" alleen met iets gedaan en precies één te gaan', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    let r = await doelKaart({ kind: 'potjes', n: 3, lvl: 2 }, 'potjes2', 2);
    check('2 van 3: Bijna', r.rule === 'R4' && r.title === 'Bijna je weekdoel!' && r.text === 'Nog 1 potje tegen Turbo en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'potjes', n: 2, lvl: 2 }, 'potjes2', 1);
    check('1 van 2: Bijna', r.rule === 'R4' && r.title === 'Bijna je weekdoel!');
    r = await doelKaart({ kind: 'potjes', n: 3, lvl: 2 }, 'potjes2', 1);
    check('1 van 3: het doel, zonder bijna', r.rule === 'R4' && r.title === 'Je weekdoel' && r.text === 'Nog 2 potjes tegen Turbo en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'wins', n: 1, lvl: 3 }, 'wins3', 0);
    check('0 van 1: het doel, zonder bijna', r.rule === 'R4' && r.title === 'Je weekdoel' &&
      r.text === 'Nog 1 keer winnen van Super Turbo en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'potjes', n: 5, lvl: 2 }, 'potjes2', 2);
    check('3 te gaan: geen weekdoelkaart', r.rule !== 'R4');
    r = await doelKaart({ kind: 'vriend', n: 2 }, 'online', 1);
    check('een vriendendoel zonder vriend: geen weekdoelkaart', r.rule !== 'R4');
    r = await doelKaart({ kind: 'vriend', n: 2 }, 'online', 1, VRIEND);
    check('met een vriend wel', r.rule === 'R4' && r.text === 'Nog 1 potje met een vriend en je weekdoel is gehaald.');
  });

  await regel('[3.11] op maandag staat achter de kaart van de nieuwe week de stand van de nieuwe week', async function (check) {
    /* zaterdag nog gespeeld: maandag is geen welkom terug, zodat de kaart het weekdoel laat zien */
    zetDatum('2026-11-14T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); bump("c.gamesPlayed", 5); P.lastKind = "game";' +
      'setPref("weekGoal", { kind: "top", n: 2, game: "scan" }); bumpWeek("top.scan", 1)');
    const a2 = herlaad(a);
    await wacht();
    zetDatum('2026-11-16T08:00:00');
    const b = herlaad(a2);
    await wacht();
    check('testopzet: de kaart van de nieuwe week staat open', b.open() && /Nieuwe week/.test(b.scherm()));
    const kaart = tekstVan(b, 'verder');
    check('erachter: het doel met 2 te gaan, zonder bijna', /Je weekdoel/.test(kaart) && /Nog 2 toprondes/.test(kaart) && !/Bijna/.test(kaart));
  });

  await regel('[3.9] wie terugkomt: de groet zegt "Welkom terug, Mees!", de kaart "Speel een potje", de naam staat er één keer', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); P.lastSeen = ' + JSON.stringify(dagenTerug(5)) + '; saveP()');
    const b = herlaad(a);
    await wacht();
    check('de groet', tekstVan(b, 'groet') === 'Welkom terug, Mees! 👋');
    check('de kaart', /^Speel een potje/.test(tekstVan(b, 'verder')) && /Je bent nog steeds Loper/.test(tekstVan(b, 'verder')));
    check('de naam één keer', (tekstVan(b, 'view-spelen').match(/Mees/g) || []).length === 1);
  });

  /* een document van voor lastSeen neemt de laatste dag met iets erop uit de dagtellers */
  await regel('[3.9] compat: een document van nu zonder lastSeen, laatst geteld vijf dagen geleden: welkom terug', async function (check) {
    const a = await kindUitDoc(docVan('Daan', { xp: 2710, stars: 70, 'wk.2026-W45.d5': 1, 'wk.2026-W45.opdr': 4, 'wk.2026-W44.d1': 2 }));
    check('testopzet: geen lastSeen', a.get('P.lastSeen') === null);
    const r = await stap(a);
    check('R3', r.rule === 'R3');
    check('de groet', tekstVan(a, 'groet') === 'Welkom terug, Daan! 👋');
  });

  await regel('[3.9] compat: een document van nu zonder lastSeen, laatst geteld gisteren: geen welkom terug', async function (check) {
    const a = await kindUitDoc(docVan('Daan', { xp: 2710, stars: 70, 'wk.2026-W45.d5': 1, 'wk.2026-W46.d2': 3, 'wk.2026-W46.opdr': 3 }));
    const r = await stap(a);
    check('geen R3', r.rule !== 'R3');
    check('de groet', tekstVan(a, 'groet') === 'Hoi Daan! 👋');
  });

  /* twee apparaten: lastSeen is van dit apparaat, de dagtellers komen ook van het andere; de laatste dag telt */
  for (const g of [['lastSeen vijf dagen oud, een dagteller van gisteren', dagenTerug(5), { 'wk.2026-W46.d2': 1 }],
    ['lastSeen van gisteren, een dagteller van vijf dagen geleden', dagenTerug(1), { 'wk.2026-W45.d5': 1 }]]) {
    await regel('[3.9] ' + g[0] + ': geen welkom terug', async function (check) {
      const a = await kindUitDoc(docVan('Daan', Object.assign({ xp: 2710, stars: 70 }, g[2]),
        { loc: { streak: 0, lastLevel: null, weekSeen: '2026-W46', lastSeen: g[1] } }));
      check('testopzet: lastSeen uit het document', a.get('P.lastSeen') === g[1]);
      const r = await stap(a);
      check('geen R3 (' + r.rule + ')', r.rule !== 'R3');
      check('de groet', tekstVan(a, 'groet') === 'Hoi Daan! 👋');
    });
  }

  /* twee getelde dagen in een week: de laatste telt, niet de eerste (maandag was drie dagen geleden) */
  await regel('[3.9] compat: zonder lastSeen, maandag en gisteren geteld in dezelfde week: geen welkom terug', async function (check) {
    const a = await kindUitDoc(docVan('Daan', { xp: 2710, stars: 70, 'wk.2026-W46.d0': 2, 'wk.2026-W46.d2': 1 }));
    check('testopzet: geen lastSeen', a.get('P.lastSeen') === null);
    const r = await stap(a);
    check('geen R3 (' + r.rule + ')', r.rule !== 'R3');
    check('de groet', tekstVan(a, 'groet') === 'Hoi Daan! 👋');
  });

  await regel('[3.9] de groet: "Hoi Mees! 👋", zonder naam "Hoi! 👋", en welkom terug zonder naam zonder komma', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('renderHome()');
    check('met naam', tekstVan(a, 'groet') === 'Hoi Mees! 👋');
    const b = maakApparaat(null);
    b.ev('renderHome()');
    check('zonder naam', tekstVan(b, 'groet') === 'Hoi! 👋');
    b.ev('P.lastSeen = ' + JSON.stringify(dagenTerug(5)) + '; renderHome()');
    check('welkom terug zonder naam', tekstVan(b, 'groet') === 'Welkom terug! 👋');
  });

  await regel('[3.1] een naam met opmaak staat als tekst op Spelen', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const a = nieuwKind();
    a.ev('setPref("name", "<b>Mees</b>"); P.lastSeen = ' + JSON.stringify(dagenTerug(5)) + '; renderHome()');
    const ontsnapt = function (t) { return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); };
    check('de groet toont de tekens', ontsnapt(a.get('$("groet").textContent')).indexOf('<b>Mees</b>') >= 0);
    check('de kaart maakt er geen opmaak van', a.el('verder').innerHTML.indexOf('<b>') < 0);
  });

  await regel('[3.9] maandag na vijf dagen weg: eerst de kaart van de nieuwe week, en erachter en erna zegt de groet welkom terug', async function (check) {
    zetDatum('2026-11-11T16:00:00');
    const a = nieuwKind();
    a.ev('bump("xp", 500); bump("c.perfectScans", 5); setPref("weekGoal", { kind: "potjes", n: 3, lvl: 2 }); bumpWeek("potjes2", 1);' +
      'P.lastSeen = "2026-11-11"; saveP()');
    const a2 = herlaad(a);
    await wacht();
    zetDatum('2026-11-16T08:00:00');
    const b = herlaad(a2);
    await wacht();
    check('eerst de kaart van de nieuwe week', b.open() && /Nieuwe week/.test(b.scherm()));
    check('erachter zegt de groet welkom terug', tekstVan(b, 'groet') === 'Welkom terug, Mees! 👋');
    tikTekst(b, 'Zelfde doel houden');
    await wacht();
    check('en erna ook, met een potje op de kaart', !b.open() && tekstVan(b, 'groet') === 'Welkom terug, Mees! 👋' &&
      /^Speel een potje/.test(tekstVan(b, 'verder')));
  });

  await regel('[3.11] Ik zegt onder het level wat XP en sterren zijn', async function (check) {
    const a = nieuwKind();
    a.tik('tabIk');
    check('de regel', tekstVan(a, 'xpUitleg') === 'Een level haal je met XP en soms een meesterproef. Sterren (0 tot 3) zeggen hoe goed een opdracht ging.');
  });

  await regel('[3.11] Instellingen: een nieuwe naam zegt "✔ bewaard", en het veld selecteert alles als je erop tikt', async function (check) {
    const a = nieuwKind();
    a.tik('setBtn');
    await wacht();
    const veld = a.el('setName');
    check('testopzet: nog geen teken', !/bewaard/.test(a.scherm()));
    fire(veld, 'focus', { target: veld });
    await wacht();
    check('alles geselecteerd', veld.selectionStart === 0 && veld.selectionEnd === 'Mees'.length);
    vulIn(a, veld, 'Mees de Grote');
    fire(veld, 'change', { target: veld });
    await wacht();
    check('bewaard en gezegd', a.get('P.name') === 'Mees de Grote' && /✔ bewaard/.test(a.scherm()));
  });

  await regel('[3.11] elke zin over wat er nog moet telt goed: "Nog 1 opdracht", "Nog 1 topronde", en een topronde zegt wat hij is', async function (check) {
    zetDatum('2026-11-12T16:00:00');
    const zin = function (r) { return r.rule === 'R4' ? r.text : '(geen R4) ' + r.rule; };
    let r = await doelKaart({ kind: 'opdr', n: 10 }, 'opdr', 9);
    check('opdrachten', zin(r) === 'Nog 1 opdracht en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'potjes', n: 2, lvl: 1 }, 'potjes1', 1);
    check('potjes', zin(r) === 'Nog 1 potje tegen Slaapkop Turbo en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'wins', n: 2, lvl: 2 }, 'wins2', 1);
    check('winnen', zin(r) === 'Nog 1 keer winnen van Turbo en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'vriend', n: 3 }, 'online', 2, VRIEND);
    check('vriend', zin(r) === 'Nog 1 potje met een vriend en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'top', n: 2, game: 'trucs' }, 'top.trucs', 1);
    check('toprondes', zin(r) === 'Nog 1 topronde bij Turbo’s Trucendoos (12 sterren of meer) en je weekdoel is gehaald.');
    r = await doelKaart({ kind: 'top', n: 3, game: 'scan' }, 'top.scan', 1);
    check('twee toprondes', zin(r) === 'Nog 2 toprondes bij Speurogen (12 sterren of meer) en je weekdoel is gehaald.');
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 1, game: "scan" }); renderHome()');
    check('de weekregel op Spelen kort', /^0 van 1 topronde bij Speurogen\s*›?$/.test(tekstVan(a, 'weekStrip')));
    a.tik('tabIk');
    check('het doel op Ik met wat een topronde is', /Mijn doel: 1 topronde bij Speurogen \(12 sterren of meer\)/.test(tekstVan(a, 'weekCard')));
  });

  await regel('tekst: de weekdoelkiezer begint bij 3 potjes tegen de Turbo die bij het kind past', async function (check) {
    const niveau = async function (extra) {
      const a = nieuwKind();
      a.ev(extra + '; goalFlow()');
      await wacht();
      const aan = a.el('goalSub').innerHTML.match(/chip on" data-lvl="(\d)"/);
      return [/chip on" data-kind="potjes"/.test(a.el('goalKinds').innerHTML), /chip on big" data-n="3"/.test(a.el('goalNs').innerHTML), aan ? +aan[1] : null];
    };
    check('een nieuw kind: Slaapkop Turbo', JSON.stringify(await niveau('setPref("start", "nieuw")')) === '[true,true,1]');
    check('wie Super Turbo versloeg: Super Turbo', JSON.stringify(await niveau('bump("wins", 1); bump("c.winsL3", 1)')) === '[true,true,3]');
  });

  await regel('[3.11] de weekregel zonder doel nodigt uit in één korte zin', async function (check) {
    const a = nieuwKind();
    a.ev('renderHome()');
    check('de zin', /^Kies een doel voor deze week\s*›?$/.test(tekstVan(a, 'weekStrip')));
  });

  await regel('[3.11] een tik op de weekregel opent Ik bij "Deze week"', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "opdr", n: 10 })');
    __scrolls.length = 0;
    a.tik('weekStrip');
    check('Ik staat open', zichtbaar(a, 'view-ik') && !zichtbaar(a, 'view-spelen'));
    check('bij het blok van de week', __scrolls.some(function (s) { return s.el === 'ikWeek'; }) && /Deze week/.test(tekstVan(a, 'ikWeek')));
  });

  await regel('[3.11] de trofeeën: verdiende eerst, de kop telt, een tegel op slot zegt wat hij vraagt, een tik vertelt het', async function (check) {
    const a = nieuwKind();
    a.ev('addBadge("vlam"); addBadge("raket"); renderHome()');
    a.tik('tabIk');
    check('de kop telt', /Trofeeën 2 van 14/.test(tekstVan(a, 'badgeKop')));
    const tegels = Array.prototype.slice.call(a.el('badgeGrid').querySelectorAll('[data-badge]'));
    check('veertien tegels, de verdiende eerst', tegels.length === 14 &&
      ['raket', 'vlam'].indexOf(tegels[0].dataset.badge) >= 0 && ['raket', 'vlam'].indexOf(tegels[1].dataset.badge) >= 0);
    check('een verdiende tegel is als verdiend te lezen, een tegel op slot niet', tegels[0].classList.contains('verdiend') &&
      !tegels[13].classList.contains('verdiend') && tegels[13].classList.contains('locked'));
    /* een naam mag een zacht afbreekstreepje hebben: dat ziet een kind niet zolang hij past */
    const lees = function (t) { return t.replace(/\u00ad/g, ''); };
    const speur = tegels.filter(function (t) { return t.dataset.badge === 'speurneus'; })[0];
    check('een tegel op slot zegt wat hij vraagt', !!speur && /10 perfecte speurrondes/.test(a.doc.__tekst(speur)) && !/Superspeurneus/.test(lees(a.doc.__tekst(speur))));
    tikEl(a, speur, 'de tegel Superspeurneus');
    check('een tik: de naam, en hoe je hem krijgt', a.open() && /Superspeurneus/.test(lees(a.scherm())) &&
      /Nog niet verdiend\. Zo krijg je hem: 10 perfecte speurrondes\./.test(a.scherm()));
    a.ev('closeModal()');
    tikEl(a, tegels.filter(function (t) { return t.dataset.badge === 'raket'; })[0], 'de tegel Raket-temmer');
    check('een verdiende: de opdracht met een kleine letter', /✔ Verdiend! De opdracht was: versla Super Turbo\./.test(a.scherm()));
  });

  await regel('[3.11] een bordkleur op slot zegt vanaf welk level, en een gekozen kleur zegt dat hij gekozen is', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 150); renderHome()');
    a.tik('tabIk');
    const knop = function (id) { return a.el('themeRow').querySelectorAll('[data-th="' + id + '"]')[0]; };
    check('Lava: vanaf Dame', /vanaf Dame/.test(a.doc.__tekst(knop('lava'))));
    a.tik('setBtn');
    await wacht();
    const oceaan = a.el('setThemes').querySelectorAll('[data-th="oceaan"]')[0];
    tikEl(a, oceaan, 'Oceaan in Instellingen');
    check('in Instellingen: "Oceaan gekozen" in het venster', a.get('P.theme') === 'oceaan' && /Oceaan gekozen/.test(a.scherm()));
  });

  /* ================= increment 4 (wat op een apparaat te zien is) ================= */

  const koppelInvoer = [
    ['met streepjes', 'lang-beloven-kaal-neer'],
    ['met spaties', 'lang beloven kaal neer'],
    ['geplakt, met komma\'s', 'lang, beloven, kaal, neer']
  ];
  for (const geval of koppelInvoer) {
    await regel('[4.8] koppelwoorden ' + geval[0] + ': vier genummerde woorden, ook het laatste, en Koppel! werkt', async function (check) {
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
  await regel('[4.8] koppelwoorden met Enter na elk woord: vier genummerde woorden, en Koppel! werkt', async function (check) {
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

  await regel('[4.8] een woord dat niet in de lijst staat, wordt genoemd', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    vulIn(a, a.el('wordInp'), 'lang beloven kaal lamq');
    await wacht();
    check('"\'lamq\' ken ik niet"', /'lamq' ken ik niet/.test(a.scherm()));
  });

  await regel('[4.8] het veld staat boven de knop en heeft geen lengtegrens', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    const h = a.modal();
    check('veld voor de knop', h.indexOf('id="wordInp"') >= 0 && h.indexOf('id="wordInp"') < h.indexOf('id="linkGo"'));
    check('geen maxlength', !/id="wordInp"[^>]*maxlength/.test(h));
  });

  await regel('[4.8] dezelfde woordinvoer voor vrienden: twee woorden in een keer', async function (check) {
    const a = nieuwKind();
    a.ev('mpWordFlow()');
    await wacht();
    vulIn(a, a.el('mpInp'), 'lang neer');
    await wacht();
    check('twee genummerde woorden', /1\s*lang[^]*2\s*neer/.test(tekstVan(a, 'mpChips')));
    check('Verbind! staat aan', heeftKlik(a, 'mpKoppel') && !a.el('mpKoppel').disabled && !tikbaar(a, a.el('mpKoppel')));
  });

  /* typen zoals een kind op een telefoon: letter voor letter */
  async function typLetters(a, veld, tekst) {
    for (const t of tekst) vulIn(a, veld, veld.value + t);
    await wacht();
  }

  await regel('[4.8] letter voor letter, met een fout woord in het midden: dat woord wordt genoemd en plakt niet aan wat volgt', async function (check) {
    const a = nieuwKind();
    a.ev('linkEntryFlow()');
    await wacht();
    await typLetters(a, a.el('wordInp'), 'lang belofen kaal neer');
    check('het foute woord wordt genoemd', /'belofen' ken ik niet/.test(a.scherm()));
    check('niet aan elkaar geplakt', !/belofenkaal/.test(a.el('wordInp').value) && !/belofenkaal/.test(a.scherm()));
  });

  /* 87 van de 1024 woorden beginnen met een ander lijstwoord, zoals adem en ademen */
  for (const laatste of ['ademen', 'adem']) {
    await regel('[4.8] letter voor letter, met als laatste woord "' + laatste + '": de code is wat het kind typte', async function (check) {
      const a = nieuwKind();
      globalThis.__gebruikteCode = null;
      a.ev('linkEntryFlow(); redeemWords = function (c) { globalThis.__gebruikteCode = c; return Promise.resolve(null); }');
      await wacht();
      check('testopzet: adem en ademen staan allebei in de lijst', a.get('WOORDEN.includes("adem") && WOORDEN.includes("ademen")'));
      await typLetters(a, a.el('wordInp'), 'lang beloven kaal ' + laatste);
      check('de knop staat aan', !a.el('linkGo').disabled);
      a.tik('linkGo');
      await wacht();
      check('de code die de app gebruikt', globalThis.__gebruikteCode === 'lang-beloven-kaal-' + laatste);
    });
  }


  /* regel 4.12: een vriend is een rij van twee regels; weghalen zit achter ⋯ */
  const metVriend = function (a, id, naam) {
    a.ev('setFriend(' + JSON.stringify(id) + ', { naam: ' + JSON.stringify(naam) + ', k: "geheimgeheimgeheimgeheimgeheim-' + id + '", since: Date.now(), host: true, weg: false })');
  };
  await regel('[4.12] een vriend weghalen gaat via ⋯ en een vraag; de rij heeft geen kruisje', async function (check) {
    const a = nieuwKind();
    metVriend(a, 'vriendvriend01', 'Mila');
    a.tik('tabVrienden');
    await wacht();
    const lijst = a.el('friendList');
    check('de rij: naam, vrienden sinds, Uitnodigen en ⋯, geen kruisje', /Mila/.test(a.doc.__tekst(lijst)) && /vrienden sinds/.test(a.doc.__tekst(lijst)) &&
      kanTikken(a, 'Uitnodigen') && lijst.querySelectorAll('[data-meer]').length === 1 && lijst.querySelectorAll('[data-remove]').length === 0 && !/✕/.test(a.doc.__tekst(lijst)));
    tikEl(a, lijst.querySelectorAll('[data-meer]')[0], '⋯');
    await wacht();
    check('⋯ opent Vriend weghalen', a.open() && kanTikken(a, 'Vriend weghalen'));
    tikTekst(a, 'Vriend weghalen');
    await wacht();
    check('eerst de vraag', a.ziet('Mila weghalen') && a.get('P.friends.vriendvriend01.weg') === false);
    a.tik('rmVrJa');
    await wacht();
    check('pas na ja is Mila weg', a.get('P.friends.vriendvriend01.weg') === true && /Nog geen vrienden/.test(a.doc.__tekst(lijst)));
  });

  await regel('[4.8] voor vrienden zegt een onbekend woord dat het kind het zijn maatje nog eens kan vragen', async function (check) {
    const a = nieuwKind();
    a.ev('mpWordFlow()');
    await wacht();
    vulIn(a, a.el('mpInp'), 'tafle vuur');
    await wacht();
    check('de zin voor vrienden', /'tafle' ken ik niet\. Vraag het je maatje nog eens\./.test(a.scherm()));
  });

  await regel('[4.8] een getypt woord laat zien dat een tik het weghaalt', async function (check) {
    const a = nieuwKind();
    a.ev('mpWordFlow()');
    await wacht(200);
    const w = a.get('WOORDEN[100]');
    vulIn(a, a.el('mpInp'), w + ' ');
    const chip = a.el('mpChips').querySelectorAll('.w-chip')[0];
    check('een kruisje en een label', !!chip && /×/.test(a.doc.__tekst(chip)) && !!chip._attrs && chip._attrs['aria-label'] === 'haal ' + w + ' weg');
  });

  await regel('[4.8] terwijl de app zoekt, gaat Verbind! niet weer aan, ook niet als het kind een woord vervangt', async function (check) {
    const a = nieuwKind();
    a.ev('mpWordFlow()');
    await wacht(200);
    const w = a.get('WOORDEN.slice(100, 103)');
    vulIn(a, a.el('mpInp'), w[0] + ' ' + w[1]);
    check('testopzet: met twee woorden mag het', a.el('mpKoppel').disabled === false);
    a.tik('mpKoppel');
    await wacht(6000);
    check('testopzet: de app zoekt', a.el('mpKoppel').disabled === true && zichtbaar(a, 'mpWachtRegel'));
    tikEl(a, a.el('mpChips').querySelectorAll('.w-chip')[1], 'woord 2');
    vulIn(a, a.el('mpInp'), w[2] + ' ');
    await wacht(200);
    check('testopzet: weer twee woorden', a.el('mpChips').querySelectorAll('.w-chip').length === 2);
    check('de knop blijft uit', a.el('mpKoppel').disabled === true);
  });

  /* rondjes achter elkaar zonder thuis: het level is een badge op één eindkaart */
  await regel('[2.5] een level staat als badge op één eindkaart, niet op elke tot het kind thuis is', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 140)');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    tikTekst(a, 'Volgende');
    await wacht();
    check('testopzet: de eerste kaart toont het level', /Level Paard/.test(a.scherm()));
    tikTekst(a, 'Nog een rondje');
    await wacht();
    /* het tweede rondje zonder punten: dan blijft het bij level Paard */
    for (let i = 0; i < 5; i++) { tikTekst(a, 'Klaar'); await wacht(); tikTekst(a, 'Volgende'); await wacht(); }
    check('de tweede kaart toont het niet nog eens', /Rondje klaar/.test(a.scherm()) && !/Level Paard/.test(a.scherm()));
    tikTekst(a, 'Naar huis');
    await wacht();
    check('thuis het venster, eenmaal', a.ziet('Level omhoog'));
  });

  await regel('[2.5] na een openingsles en "Iets anders kiezen" opent een wachtend venster niet over de volgende les', async function (check) {
    const a = nieuwKind();
    a.ev('bump("xp", 140)');
    await startOefening(a, 'opening');
    const pad = a.el('modalBox').querySelectorAll('[data-pad]')[0];
    if (pad) tikEl(a, pad, 'een openingspad');
    await wacht();
    a.ev('bump("xp", 20); checkBadges()');
    check('testopzet: het level wacht', a.get('levelIdx(P.xp) > P.lastLevel'));
    a.ev('openingEnd()');
    await wacht();
    check('testopzet: Iets anders kiezen staat er', kanTikken(a, 'Iets anders kiezen'));
    tikTekst(a, 'Iets anders kiezen');
    await wacht();
    const pad2 = a.el('modalBox').querySelectorAll('[data-pad]')[0];
    check('testopzet: de keuze van een les', !!pad2);
    if (pad2) tikEl(a, pad2, 'een openingspad');
    await wacht();
    check('in de nieuwe les, zonder levelvenster erover', opSpeelscherm(a) && !a.ziet('Level omhoog'));
  });

  await regel('[4.1] een vriendenpotje dat niet te lezen is: wie een nieuw vriendenpotje begint, hoort eerst dat dat het weghaalt', async function (check) {
    const o = maakOpslag();
    o.setItem(SAMEN_O, 'kapot{');
    const a = maakApparaat('Fien', { opslag: o });
    await a.ev('mpHostQR()');
    await wacht();
    check('het venster zegt het', /kan ik niet meer openen/.test(a.scherm()) && /nieuw potje haalt het weg/i.test(a.scherm()));
    check('het staat er nog', a.opslag.getItem(SAMEN_O) === 'kapot{');
  });

  await regel('[4.10] de koppelcode zegt in hele minuten hoe lang hij werkt, en biedt daarna een nieuwe', async function (check) {
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
    check('daarna werkt hij niet meer', /Deze code werkt niet meer/.test(a.scherm()));
    check('en de oude woorden en de uitleg erbij staan er niet meer', !/Typ daar deze vier woorden/.test(a.scherm()) && a.el('linkWoorden').style.display === 'none');
    const oud = a.scherm();
    tikTekst(a, 'Nieuwe code');
    await wacht();
    check('een nieuwe code, weer 10 minuten', /Werkt nog 10 minuten/.test(a.scherm()) && a.scherm() !== oud);
  });
}
