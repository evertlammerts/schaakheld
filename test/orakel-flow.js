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

async function zetEnWacht(app, key) {
  const gelukt = zet(app, key);
  await wacht();
  return gelukt;
}

/* opgeven zoals een kind: de knop Opgeven (in de rij of achter ⋯), dan ja */
async function geefOp(app) {
  if (!tikTekst(app, 'Opgeven')) { app.tik('meerBtn'); await wacht(); tikTekst(app, 'Opgeven'); }
  await wacht();
  tikTekst(app, 'Ja');
  await wacht();
}

async function biedRemise(app) {
  if (!tikTekst(app, 'Remise')) { app.tik('meerBtn'); await wacht(); tikTekst(app, 'Remise'); }
  await wacht();
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

async function rondjeGoed(app, n) {
  for (let i = 0; i < n; i++) {
    await scanGoed(app);
    if (i < n - 1) { tikTekst(app, 'Volgende'); await wacht(); }
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
    const a = nieuwKind();
    await startPotje(a, 2);
    tikTekst(a, 'Speurbril');
    await wacht();
    await zetEnWacht(a, 'd2d4');
    const fen = a.fen();
    const b = herlaad(a);
    await wacht();
    b.tik('verderKaart');
    await wacht();
    check('zelfde stand en wie er aan zet is', b.fen() === fen);
    check('zelfde niveau', b.get('session && session.level') === 2);
    check('de Speurbril heeft er nog 2', knoppen(b).some(function (k) { return /Speurbril\D*2/.test(k.textContent || ''); }));
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
    const a = nieuwKind();
    await startPotje(a, 1);
    await zetEnWacht(a, 'e2e4');
    check('in een potje', zichtbaar(a, 'bewaard') && tekstVan(a, 'bewaard').indexOf('✔ bewaard') >= 0);
    a.tik('backBtn');
    await wacht();
    await startOefening(a, 'scan');
    await scanGoed(a);
    check('in een rondje', zichtbaar(a, 'bewaard') && tekstVan(a, 'bewaard').indexOf('✔ bewaard') >= 0);
  });

  await nogNiet('[1.2] een rondje zonder antwoord zegt bij Pauze dat het nog niet begonnen was', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.tik('backBtn');
    await wacht(500);
    check('melding "nog niet begonnen"', toastTekst(a).indexOf('Dit rondje was nog niet begonnen') >= 0);
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
    check('de vraag noemt opgeven', a.open() && /opgeven/i.test(a.scherm()) && a.ziet('Nee, verder spelen'));
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
    check('het bewaarde potje is het nieuwe', !!opgeslagen(a, POTJE) && opgeslagen(a, POTJE).level === 3 &&
      opgeslagen(a, POTJE).moves.length === 0);
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
    check('de vraag noemt het potje dat bezig is', /potje dat bezig is/.test(a.scherm()));
    a.tik('rstGo');
    await wacht();
    check('het potje is weg', opgeslagen(a, POTJE) === null);
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
    tikTekst(b, 'Volgende');
    await wacht();
    await rondjeGoed(b, 3);
    tikTekst(b, 'Volgende');
    await wacht();
    b.ev('closeModal()');
    check('telt in de nieuwe week: 1 van 2', /1\s*(\/|van)\s*2/.test(wekelijks(b)));
  });

  await nogNiet('[1.6] een openingsles bewaart alleen de sterren en zegt dat', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'opening');
    const pad = a.el('modalBox').querySelectorAll('[data-pad]')[0];
    if (pad) fire(pad, 'click', { target: pad });
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
    check('"Bewaard op deze ..."', /Bewaard op deze/.test(tekstVan(a, 'verder')));
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
    if (knop) fire(knop, 'click', { target: knop });
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
    if (knop) fire(knop, 'click', { target: knop });
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
  const koningGevallen = [
    /* hier noemt de app Turbo's zet nadat hij al gespeeld is: B01 */
    ['een schaak-opdracht, Turbo antwoordt rustig', 'schaak', schaakTaak.fen, schaakTaak.answers, fouteZetZonderMat(schaakTaak.fen, schaakTaak.answers), null],
    ['een matdreiging, Turbo geeft mat', 'mat1', matTaak.fen, matTaak.answers,
      moveKey(legalMoves(parseFEN(matTaak.fen)).find(function (m) { return matTaak.answers.indexOf(moveKey(m)) < 0; })), null],
    ['een hangend stuk, Turbo slaat', 'stuk', STUK_FEN, STUK_REDDING, 'g1h1', '{ hang: threatDetails(S)[0] }']
  ];
  for (const geval of koningGevallen) {
    await nogNiet('[1.11] Koning ontsnapt, ' + geval[0] + ': niets bevriest en Turbo zegt welke zet hij speelt', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, geval[2], geval[1], geval[3], geval[5]);
      zet(a, geval[4]);
      await wacht();
      check('de opdracht gaat door: weer jouw beurt', a.get('session.phase') === 'puzzle' && a.get('BD.mode') === 'puzzle');
      check('Turbo zegt welke zet hij speelt', /Turbo/.test(tekstVan(a, 'bubble')) && /[a-h][1-8]/.test(tekstVan(a, 'bubble')));
      zet(a, geval[3][0]);
      await wacht();
      check('de tweede poging gaat met tikken', a.get('session.phase') === 'review');
    });
  }

  await nogNiet('[1.12] een topronde telt voor het weekdoel toprondes', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("weekGoal", { kind: "top", n: 2, game: "scan" })');
    await startOefening(a, 'scan');
    await rondjeGoed(a, 5);
    tikTekst(a, 'Volgende');
    await wacht();
    a.ev('closeModal()');
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
}
