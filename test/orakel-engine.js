/* Orakel, engine: de regels van plan.md voor increment 5 die in de engine
   wonen (de schaakinhoud, learning.md 6.8). Zoals in de flowsuite staat een
   regel die nog niet gebouwd is als nogNiet(naam, blok): het blok moet
   falen (een controle die mislukt of een uitzondering), dan blijft de suite
   groen; slaagt het, dan wordt de suite rood. Een gebouwde regel heet
   regel(naam, blok), met hetzelfde blok. Duur werk in een blok staat achter
   een goedkope controle, zodat een regel die nog niet gebouwd is snel faalt. */
(function () {
  const E = module.exports;
  let fouten = 0, nogNietN = 0, gebouwdN = 0;
  let uit = function (t) { console.log(t); };

  function blok(naam, f, gebouwd) {
    const mis = [];
    const check = function (wat, c) { if (!c) mis.push(wat); return !!c; };
    try { f(check); } catch (e) { mis.push('uitzondering: ' + (e && e.message ? e.message : e)); }
    if (gebouwd) {
      if (mis.length) { fouten++; uit('FAIL  ' + naam + '  (' + mis.join('; ') + ')'); }
      else { gebouwdN++; uit('PASS  ' + naam); }
    } else if (mis.length) { nogNietN++; uit('NOG NIET GEBOUWD  ' + naam + '  (' + mis[0] + ')'); }
    else { fouten++; uit('FAIL  ' + naam + '  (staat als nog niet gebouwd, maar slaagt al: maak er regel() van)'); }
  }
  const nogNiet = function (naam, f) { blok(naam, f, false); };
  const regel = function (naam, f) { blok(naam, f, true); };

  /* het mechanisme bewijst zichzelf, met de uitvoer van de proefblokken weg */
  {
    const f0 = fouten, n0 = nogNietN, g0 = gebouwdN, echt = uit, regels = [];
    uit = function (t) { regels.push(t); };
    nogNiet('[proef] een controle faalt', function (check) { check('nog niet', false); });
    nogNiet('[proef] een uitzondering', function () { throw new Error('bestaat nog niet'); });
    const naVerwacht = fouten;
    nogNiet('[proef] slaagt al', function (check) { check('werkt', true); });
    const naOnverwacht = fouten;
    regel('[proef] gebouwd en kapot', function (check) { check('kapot', false); });
    const naKapot = fouten;
    uit = echt;
    fouten = f0; nogNietN = n0; gebouwdN = g0;
    const goed = naVerwacht === f0 && regels[0].indexOf('NOG NIET GEBOUWD') === 0 && regels[1].indexOf('bestaat nog niet') >= 0 &&
      naOnverwacht === f0 + 1 && regels[2].indexOf('FAIL') === 0 && naKapot === f0 + 2;
    uit((goed ? 'PASS' : 'FAIL') + '  engine-orakel: wat nog niet gebouwd is moet falen, en slaagt het toch, dan faalt de suite');
    if (!goed) fouten++;
  }

  const zet = function (S, k) {
    const m = E.legalMoves(S).find(function (x) { return E.moveKey(x) === k; });
    if (!m) throw new Error('testopzet: ' + k + ' is geen zet in ' + E.toFEN(S));
    return m;
  };
  const speel = function (S, zetten) { for (const k of zetten) E.makeMove(S, zet(S, k)); return S; };
  /* een rustige zet die 95 minder scoort dan de beste en niets verliest (reviewer, v7) */
  const STIL_FEN = 'r2qkb1r/ppp1bppp/B1bp1n2/4p3/4P3/5P1N/PPPPQ1PP/R1B2K1R w kq - 1 10', STIL_ZET = 'a6b5';
  /* een regel uit de voorraad, die de tool met de vijf toetsen van de coach bij 300.000 knopen controleerde */
  const STUK_GOED = 'r1b1kb1r/pppp1pp1/4pq1p/4N3/1n1P4/P1n1B3/1PPQPPPP/1R2KB1R w|stuk|b2c3,d2c3';
  /* een middenspel buiten het boek waarin een zoektocht op tijd een andere zet kiest dan het knoopbudget */
  const SUPER_FEN = 'r1bq1k1r/p1p3pp/2p1pp2/4p3/1bNP2n1/5N2/PPP2PPP/R1BQ1RK1 w - - 0 11';
  /* een vaste reeks toevalsgetallen, zodat een steekproef elke keer dezelfde is */
  const vast = function (seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* goedkoop vooraf: houdt think zich aan een knoopbudget? Zonder dat zou een
     blok hieronder minutenlang zoeken voordat het faalt. */
  /* een stelling die geen andere test doorzoekt: zonder budget kost diepte 4
     hier zo'n 20.000 knopen. Een keer meten: daarna staat de stelling in de
     tabel en is een tweede zoektocht goedkoop, met of zonder budget. */
  let budgetMeting = null;
  const knoopbudget = function (check) {
    if (!budgetMeting) {
      const S = E.parseFEN('r1bqk2r/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQK2R w KQkq - 0 7');
      budgetMeting = E.think(S, 20000, 4, { nodes: 2000 });
    }
    return check('think houdt zich aan een knoopbudget (2000 gevraagd, ' + budgetMeting.nodes + ' gezocht)', budgetMeting.nodes <= 2000 + 256);
  };

  /* ---------- 5.2: geen aftrekaanval van het stuk dat zelf zet ---------- */

  regel('[5.2] een stuk dat langs zijn eigen lijn gaat, maakt geen aftrekaanval; d4xe5 wel', function (check) {
    const S = E.parseFEN('r1bq1rk1/pppp1ppp/2Bb3n/4p3/3PP3/4BN2/PPP2PPP/RN1QK2R w KQ - 1 7');
    for (const k of ['e3d2', 'e3c1']) {
      const info = E.patternsAfterMove(S, zet(S, k));
      check(k + ' is geen aftrekaanval', info.discovered.length === 0 && !E.patternMatches(S, zet(S, k), 'aftrek', info));
    }
    const d = E.patternsAfterMove(S, zet(S, 'd4e5')).discovered;
    check('d4xe5 wel: de dame op d1 valt de loper op d6 aan',
      d.some(function (x) { return E.alg(x.from) === 'd1' && E.alg(x.target) === 'd6'; }));
  });

  /* ---------- 5.4: het blunderalarm ziet mat in één ---------- */

  regel('[5.4] het blunderalarm ziet een zet die mat in één toelaat (1.f3 e5 2.g4)', function (check) {
    const S = speel(E.newGame(), ['f2f3', 'e7e5']);
    const r = E.blunderCheck(S, zet(S, 'g2g4'));
    check('2.g4 geeft alarm', !!r);
    check('het alarm zegt dat het mat is', !!r && r.mate === true);
    check('met Dh4 als de zet van Turbo', !!r && !!r.punish && E.moveKey(r.punish) === 'd8h4');
    check('2.d4 geeft geen alarm', E.blunderCheck(S, zet(S, 'd2d4')) === null);
  });

  /* ---------- 5.3: veilig of valstrik, gecontroleerd bij het kiezen ---------- */

  regel('[5.3] Veilig of valstrik: een "veilige" zet die een stuk verliest, wordt bij het kiezen afgekeurd', function (check) {
    /* Coach 3: na Dd3-c3 geeft Pf6-e4+ een vork op koning en dame */
    const S = E.parseFEN('r2qkb1r/pppb1ppp/4pn2/3p4/1n1P1B2/3QP3/PPPKNPPP/RN3B1R w kq - 2 7');
    const fen = E.toFEN(S);
    check('Dd3-c3 als "veilig": afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'd3c3'), trap: false }) === null);
    check('de stand blijft onaangeroerd', E.toFEN(S) === fen);
    const T = E.parseFEN('7k/8/8/8/7r/8/8/KQ6 w - - 0 1');
    const val = E.checkSafeTask({ S: T, move: zet(T, 'b1b4'), trap: true });
    check('Db1-b4 laat de dame hangen: als valstrik goed, met Txb4 als straf',
      !!val && !!val.punish && E.moveKey(val.punish) === 'h4b4');
    check('en als "veilig" afgekeurd', E.checkSafeTask({ S: T, move: zet(T, 'b1b4'), trap: false }) === null);
    const B = E.newGame();
    check('Pg1-f3 aan het begin: veilig', !!E.checkSafeTask({ S: B, move: zet(B, 'g1f3'), trap: false }));
    check('maar geen valstrik', E.checkSafeTask({ S: B, move: zet(B, 'g1f3'), trap: true }) === null);
  });

  regel('[5.3] Red je stuk: een redding die bij dieper kijken veel slechter is dan de beste, wordt bij het kiezen afgekeurd', function (check) {
    /* vandaag gemaakt door genPieceTask: c3b5 houdt alles, e4xd5 kost ruim 3 punten */
    const S = E.parseFEN('1r2k2r/ppp1n1bp/2nq1pp1/3pp1N1/4P3/2NP1Q2/PP1P1PPP/1RB3KR w k - 0 12');
    const fen = E.toFEN(S);
    const taak = function (zetten) {
      return { S: S, type: 'stuk', hang: E.threatDetails(S)[0], answers: zetten.map(function (k) { return { m: zet(S, k), info: null }; }) };
    };
    check('met e4xd5 als redding: afgekeurd', E.checkPieceTask(taak(['c3b5', 'e4d5'])) === null);
    /* alleen de materiaaltoets keurt hem af: langs twee halve zetten kost hij een pion, al wint een langere lijn er een (de aanvulling van de coach, D14) */
    check('met alleen Pc3-b5: afgekeurd', E.checkPieceTask(taak(['c3b5'])) === null);
    check('de stand blijft onaangeroerd', E.toFEN(S) === fen);
    const t = E.trucTask(STUK_GOED);
    check(STUK_GOED + ': staat in de voorraad', typeof STUK_POOL !== 'undefined' && STUK_POOL.indexOf(STUK_GOED) >= 0);
    check(STUK_GOED + ': goed', !!t && !!E.checkPieceTask(t));
    check('dezelfde stand zonder redding: afgekeurd', !!t && E.checkPieceTask(Object.assign({}, t, { answers: [] })) === null);
  });

  /* de maten van de coach (schaak.md, "Measures for the fix list"; D31): veilig verliest geen pion langs de lijn */
  regel('[5.3] Veilig: een zet waarna zwart een pion slaat is niet veilig; een rustige zet die alleen iets minder scoort wel', function (check) {
    const S = E.parseFEN('6k1/8/8/5n2/8/4P3/8/R4K2 w - - 0 1');
    check('Kf1-g1: Pf5xe3 pakt de pion, dus niet veilig', E.checkSafeTask({ S: S, move: zet(S, 'f1g1'), trap: false }) === null);
    const T = E.parseFEN(STIL_FEN);
    check(STIL_ZET + ' scoort wat minder maar verliest niets: veilig', !!E.checkSafeTask({ S: T, move: zet(T, STIL_ZET), trap: false }));
  });

  regel('[5.3] Veilig: een zet die ruim 2 punten minder scoort dan de beste is niet veilig, ook als er langs de lijn niets verloren gaat', function (check) {
    const S = E.parseFEN('r1b1kb1r/pppn1ppp/2npq3/1B2p3/3PP3/2N2N2/PPP2PPP/R1BQ1K1R w kq - 7 8');
    E.clearTT();
    const l = E.lineAfter(S, zet(S, 'd1d2'), E.CHECK_NODES);
    check('testopzet: Dd2 verliest langs de lijn niets (' + l.material + ')', l.material >= -90 && !l.mateNext);
    E.clearTT();
    check('Dd2: niet veilig', E.checkSafeTask({ S: S, move: zet(S, 'd1d2'), trap: false }) === null);
  });

  regel('[5.3] Valstrik: de straf is een slag, zodat de uitleg kan zeggen wat er gepakt wordt', function (check) {
    /* na Dd3-c3 wint Pf6-e4+ de dame met een vork, maar die zet slaat niets */
    const S = E.parseFEN('r2qkb1r/pppb1ppp/4pn2/3p4/1n1P1B2/3QP3/PPPKNPPP/RN3B1R w kq - 2 7');
    check('Dd3-c3 als valstrik: afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'd3c3'), trap: true }) === null);
  });

  /* de aanvulling van de coach: L en V moeten het eens zijn, anders is de zet geen van beide */
  regel('[5.3] Valstrik: een zet waarna een stuk valt dat bij elke zet valt, is geen valstrik en ook niet veilig', function (check) {
    /* de loper op e2 is gepend en aangevallen: na elke zet slaat Txe2+ hem */
    const S = E.parseFEN('4r1k1/pp4pp/8/8/8/3p4/PP2B1PP/4K3 w - - 0 1');
    E.clearTT();
    const l = E.lineAfter(S, zet(S, 'a2a3'), E.CHECK_NODES);
    check('testopzet: langs de lijn gaat de loper verloren (' + l.material + ')', l.material <= -250);
    check('a2-a3 als valstrik: afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'a2a3'), trap: true }) === null);
    check('a2-a3 als veilig: afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'a2a3'), trap: false }) === null);
  });

  regel('[5.3] Valstrik: alleen een zet die langs zijn lijn 2,5 punten of meer verliest; een slag op een pion met mat is dat niet', function (check) {
    /* na Pf3-e1 is Dxh2 mat: veel slechter in de score, maar langs de lijn gaat alleen de pion op h2 */
    const S = E.parseFEN('6k1/2b2ppp/3q4/8/8/5N2/PPP2PPP/3Q1RK1 w - - 0 1');
    E.clearTT();
    const l = E.lineAfter(S, zet(S, 'f3e1'), E.CHECK_NODES);
    check('testopzet: Dxh2 slaat een pion en zet mat (' + l.material + ', ' + (l.reply && E.moveKey(l.reply)) + ')', l.material === -100 && l.mateNext);
    check('Pf3-e1 als valstrik: afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'f3e1'), trap: true }) === null);
    check('en als veilig ook', E.checkSafeTask({ S: S, move: zet(S, 'f3e1'), trap: false }) === null);
  });

  regel('[5.3] Veilig: een zet die mat in één toelaat is nooit veilig, ook als elke andere zet ook verliest', function (check) {
    /* de dame op f2 zet hoe dan ook mat: alleen de mat-in-één-toets houdt a2-a3 tegen */
    const S = E.parseFEN('4r1k1/8/8/8/8/8/P4q1P/7K w - - 0 1');
    check('a2-a3: niet veilig', E.checkSafeTask({ S: S, move: zet(S, 'a2a3'), trap: false }) === null);
  });

  /* de drie voorraadregels van de reviewer en de regel van de coach (R1) */
  regel('[5.3] Red je stuk: een redding die materiaal verliest, of een opdracht met andere zetten even goed, wordt afgekeurd', function (check) {
    for (const [r, waarom] of [['r2qkb1r/pppb1ppp/3p1n2/4p3/1n1NPB2/3P1Q2/PPP1KPPP/RN3B1R w|stuk|a2a3,c2c3', 'twee dreigingen, niet te redden'],
      ['r2qkb1r/ppp2ppp/2n2n2/1B1p4/3Pp1b1/2N1PN2/PPPB1P1P/R2QK2R w|stuk|b5c6', 'niet te redden, de redding verliest'],
      ['r1b2rk1/ppp2ppp/3qp3/3Nn1nQ/3b1N2/8/PPP2PPP/R1BK1BR1 w|stuk|d1e1,d1e2,d5c7,h5g5', 'ook de pion op f2 hangt'],
      ['1r1qkb1r/ppp1nppp/3p4/1b4B1/PnNpP3/5Q2/1PP2PPP/2KR2NR w|stuk|a4b5,g5e7', 'alleen: een tweede dreiging'],
      ['r1bqk2r/ppp2ppp/n2bpn2/3pN3/8/P1N5/1PPPPPPP/1RBQKB1R w|stuk|d2d4,f2f4,e5f3,e5d3', 'alleen: een redding ver onder de beste'],
      ['1r3k1r/ppp2pp1/3p1q1B/2bnp3/2BnP1b1/3P1P2/PPP1N1PP/2RQ1K1R w|stuk|h6g7', 'alleen: een andere zet even goed'],
      ['6k1/7p/4p3/6p1/4p2N/1p6/5P2/6K1 w|stuk|h4g2', 'alleen: niet te redden, want de pion op b3 wordt hoe dan ook een dame']]) {
      const t = E.trucTask(r);
      check(r + ' (' + waarom + '): afgekeurd', !!t && E.checkPieceTask(t) === null);
    }
  });

  /* ---------- 5.5: de uitleg bij Red je stuk zegt wat waar is ---------- */

  regel('[5.5] Red je stuk: het hangende stuk dat zelf slaat heet "slaat", een schaak met het stuk nog onder vuur "schaak", en een slag is nooit een tegenaanval', function (check) {
    const soort = function (fen, hang, k) { const S = E.parseFEN(fen); return E.saveKind(S, zet(S, k), E.sqFromAlg(hang)); };
    let r = soort('3rk3/8/8/8/1n6/8/3Q4/6K1 w - - 0 1', 'd2', 'd2b4');
    check('Dxb4: slaat (' + JSON.stringify(r) + ')', r.kind === 'slaat' && r.took === 'paard' && r.a === 3 && r.sq === 'b4');
    r = soort('2kr1b1r/ppp2ppp/n2q1n2/3pp3/3N1QbP/3BP3/PPPP1PP1/RNB3KR w - - 0 1', 'f4', 'd3f5');
    check('Lf5+: schaak, de dame staat nog onder vuur (' + JSON.stringify(r) + ')', r.kind === 'schaak');
    r = soort('4r1k1/p5q1/8/8/4N3/8/8/R6K w - - 0 1', 'e4', 'a1a7');
    check('Txa7 valt de dame aan maar redt het paard niet: geen tegenaanval (' + JSON.stringify(r) + ')', r.kind !== 'tegenaanval' && r.kind === 'anders');
    /* dubbelschaak: zwart mag de dame op c6 een zet niet slaan, maar daarna wel */
    r = soort('4k3/1p6/2p5/8/r3Q3/8/8/4R1K1 w - - 0 1', 'e4', 'e4c6');
    check('Dxc6++ staat daarna nog onder vuur van b7: schaak, niet slaat (' + JSON.stringify(r) + ')', r.kind === 'schaak');
  });

  regel('[5.5] Red je stuk: een slag is nooit "weggezet"; wegzetten alleen naar een veld dat Turbo niet aanvalt', function (check) {
    const soort = function (fen, hang, k) {
      const S = E.parseFEN(fen), voor = E.toFEN(S);
      const r = E.saveKind(S, zet(S, k), E.sqFromAlg(hang));
      check(k + ': het bord blijft zoals het was', E.toFEN(S) === voor);
      return r;
    };
    /* zoals bij Daan: de loper slaat op e6, en het paard op c5 slaat terug */
    const daan = '4k3/8/4b3/2n5/2B5/8/8/6K1 w - - 0 1';
    let r = soort(daan, 'c4', 'c4e6');
    check('Lxe6, Pxe6: een ruil, loper tegen loper (' + JSON.stringify(r) + ')', r.kind === 'ruil' && r.took === 'loper' && r.a === 3 && r.b === 3);
    r = soort(daan, 'c4', 'c4e2');
    check('Le2: weg, daar valt Turbo niets aan (' + JSON.stringify(r) + ')', r.kind === 'weg');
    r = soort(daan, 'c4', 'c4b3');
    check('Lb3 staat nog steeds onder vuur: niet weg (' + JSON.stringify(r) + ')', r.kind !== 'weg' && r.kind !== 'weg-gedekt');
    r = soort('4r1k1/8/8/b7/4N3/8/1P6/6K1 w - - 0 1', 'e4', 'e4c3');
    check('Pc3: aangevallen door de loper maar gedekt door de pion (' + JSON.stringify(r) + ')', r.kind === 'weg-gedekt' && r.sq === 'c3');
    /* zoals K6 bij increment 1: de dame op d6 valt de toren op h2 aan, en een stuk zet zich ertussen */
    r = soort('6k1/8/3q4/8/7B/8/5P1R/5K2 w - - 0 1', 'h2', 'h4g3');
    check('Lg3 tussen dame en toren (' + JSON.stringify(r) + ')', r.kind === 'ertussen');
    r = soort('4r1k1/8/8/8/4N3/8/3P4/6K1 w - - 0 1', 'e4', 'd2d3');
    check('d3 dekt het paard: Txe4 kost Turbo de toren (' + JSON.stringify(r) + ')', r.kind === 'gedekt');
    r = soort('6k1/8/8/3p4/2P1N3/8/8/6K1 w - - 0 1', 'e4', 'c4d5');
    check('cxd5 slaat de aanvaller van het paard (' + JSON.stringify(r) + ')', r.kind === 'aanvaller' && r.took === 'pion');
  });

  /* de coach (schaak.md, de laatste sectie): goed is een antwoord of een zet die het potje meteen beëindigt, zoals de app oordeelt */
  regel('[5.5] Koning ontsnapt: elke puzzel in de voorraad heeft een zet die fout is, dus "Er is één goede zet" betekent nooit "er is maar één zet"', function (check) {
    if (!check('er is een voorraad KONING_POOL', typeof KONING_POOL !== 'undefined' && KONING_POOL.length > 0)) return;
    const zonder = KONING_POOL.filter(function (p) {
      const S = E.parseFEN(p.fen);
      return !E.legalMoves(S).some(function (m) {
        if (p.answers.indexOf(E.moveKey(m)) >= 0) return false;
        E.makeMove(S, m);
        const eindigt = E.gameStatus(S).over;
        E.unmakeMove(S);
        return !eindigt;
      });
    });
    check('geen puzzel zonder foute zet (' + zonder.length + ' van ' + KONING_POOL.length + (zonder.length ? ', zoals ' + zonder[0].fen : '') + ')', zonder.length === 0);
  });

  /* ---------- 5.1: de voorraad trucs ---------- */

  const TYPES = ['vork', 'penning', 'spies', 'aftrek', 'mat1', 'mat2'];
  const leesTruc = function (regel) {
    const delen = String(regel).split('|');
    if (delen.length !== 3) throw new Error('geen drie delen: ' + regel);
    const S = E.parseFEN(delen[0] + ' - - 0 1');
    return { S: S, kant: delen[0].split(' ')[1], type: delen[1], antwoorden: delen[2].split(',').map(function (k) { return zet(S, k); }) };
  };
  const herkend = function (t) {
    const m = t.antwoorden[0];
    if (t.type === 'mat2') return E.matesIn(t.S, m, 2);
    if (t.type === 'mat1') return E.patternsAfterMove(t.S, m).mate;
    const info = E.patternsAfterMove(t.S, m);
    if (t.type === 'vork') return info.fork.length >= 2;
    if (t.type === 'penning') return !!info.pin;
    if (t.type === 'spies') return !!info.skewer;
    if (t.type === 'aftrek') return info.discovered.length >= 1;
    return false;
  };

  regel('[5.1] elke truc in de voorraad: leesbaar, wit aan zet, legale antwoorden, het type herkend, en genoeg per type', function (check) {
    check('er is een voorraad TRUC_POOL', typeof TRUC_POOL !== 'undefined' && Array.isArray(TRUC_POOL) && TRUC_POOL.length > 0);
    if (typeof TRUC_POOL === 'undefined') return;
    const perType = {}, gezien = new Set(), slecht = [];
    for (const regel of TRUC_POOL) {
      let t = null;
      try { t = leesTruc(regel); } catch (e) { slecht.push(regel + ': ' + e.message); continue; }
      const goed = t.kant === 'w' && TYPES.indexOf(t.type) >= 0 && !E.inCheck(t.S) && !E.gameStatus(t.S).over &&
        t.antwoorden.length >= 1 && t.antwoorden.length <= 2 && herkend(t);
      if (!goed) slecht.push(regel);
      perType[t.type] = (perType[t.type] || 0) + 1;
      if (gezien.has(regel.split('|')[0])) slecht.push('dubbel: ' + regel);
      gezien.add(regel.split('|')[0]);
    }
    check('elke regel klopt' + (slecht.length ? ' (niet: ' + slecht.slice(0, 3).join('; ') + ')' : ''), slecht.length === 0);
    check('elk type dat erin staat heeft er minstens 15 (' + JSON.stringify(perType) + ')',
      Object.keys(perType).every(function (k) { return perType[k] >= 15; }));
    check('vork en mat in twee staan erin, met het doel van 40', (perType.vork || 0) >= 40 && (perType.mat2 || 0) >= 40);
  });

  /* D24: een type telt mee vanaf 15 geverifieerde puzzels */
  regel('[5.1] een type met 14 trucs blijft uit de Trucendoos, met 15 doet het mee', function (check) {
    const regels = function (type, n) { const r = []; for (let i = 0; i < n; i++) r.push('8/8/8/8/8/8/8/K6k w|' + type + '|a1a2'); return r; };
    const types = E.trucTypes(regels('penning', 14).concat(regels('spies', 15), regels('vork', 150)));
    check('penning met 14: uit', types.indexOf('penning') < 0);
    check('spies met 15: in', types.indexOf('spies') >= 0);
    check('vork met 150: in', types.indexOf('vork') >= 0);
    check('een lege voorraad: niets', E.trucTypes([]).length === 0);
  });

  regel('[5.1] een regel uit de voorraad wordt een opdracht met de stand, het type en de antwoorden', function (check) {
    const t = E.trucTask('6k1/5ppp/8/8/8/8/5PPP/R5K1 w|mat1|a1a8');
    check('de stand, wit aan zet', !!t && E.toFEN(t.S) === '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    check('het type en het antwoord', !!t && t.type === 'mat1' && t.answers.length === 1 && E.moveKey(t.answers[0].m) === 'a1a8');
    check('een antwoord dat geen zet is: geen opdracht', E.trucTask('6k1/5ppp/8/8/8/8/5PPP/R5K1 w|mat1|a1a9') === null);
    check('kapot: geen opdracht', E.trucTask('kapot') === null);
    check('een bord dat geen bord is: geen opdracht', E.trucTask('xyz w|vork|e2e4') === null);
    check('zeven rijen: geen opdracht', E.trucTask('6k1/5ppp/8/8/8/5PPP/R5K1 w|mat1|a1a8') === null);
    check('een rij van negen velden: geen opdracht', E.trucTask('6k1/5ppp/9/8/8/8/5PPP/R5K1 w|mat1|a1a8') === null);
    check('zonder zwarte koning: geen opdracht', E.trucTask('8/5ppp/8/8/8/8/5PPP/R5K1 w|mat1|a1a8') === null);
  });

  regel('[5.1] een steekproef van vijf per type: elk antwoord wint ook bij diep nadenken minstens 1,5 punt, en geen andere zet is een punt beter', function (check) {
    if (!check('er is een voorraad TRUC_POOL', typeof TRUC_POOL !== 'undefined' && Array.isArray(TRUC_POOL))) return;
    if (!knoopbudget(check)) return;
    const rng = vast(20261112);
    for (const type of TYPES) {
      const van = TRUC_POOL.filter(function (r) { return r.split('|')[1] === type; });
      for (let i = 0; i < 5 && van.length; i++) {
        const regel = van.splice(Math.floor(rng() * van.length), 1)[0];
        const t = leesTruc(regel), basis = E.evalWhite(t.S);
        for (const m of t.antwoorden) {
          E.makeMove(t.S, m);
          const st = E.gameStatus(t.S);
          const wit = st.over ? (st.reason === 'mat' ? E.MATE : 0) : -E.think(t.S, 20000, 10, { nodes: 60000 }).score;
          E.unmakeMove(t.S);
          check(type + ' ' + regel + ': ' + E.moveKey(m) + ' wint minstens 150 (' + (wit - basis) + ')', wit - basis >= 150);
        }
        if (type === 'mat1' || type === 'mat2') continue;
        const anders = E.legalMoves(t.S).filter(function (m) { return !t.antwoorden.some(function (a) { return E.moveKey(a) === E.moveKey(m); }); });
        const goed = E.think(t.S, 20000, 10, { nodes: 60000, root: t.antwoorden }).score;
        const beste = E.think(t.S, 20000, 10, { nodes: 60000, root: anders }).score;
        check(type + ' ' + regel + ': geen andere zet 100 beter (' + goed + ' tegen ' + beste + ')', beste - goed < 100);
      }
    }
  });

  /* ---------- 5.9: Red je stuk uit een geverifieerde voorraad ---------- */

  regel('[5.9] elke Red je stuk-opdracht in de voorraad: er hangt een stuk, elke redding houdt het materiaal, elke andere zet niet', function (check) {
    check('er is een voorraad STUK_POOL met minstens 15', typeof STUK_POOL !== 'undefined' && Array.isArray(STUK_POOL) && STUK_POOL.length >= 15);
    if (typeof STUK_POOL === 'undefined') return;
    const slecht = [];
    for (const regel of STUK_POOL) {
      const t = E.trucTask(regel);
      if (!t || t.type !== 'stuk' || !t.hang || t.S.turn !== 'w' || E.inCheck(t.S) || t.answers.length > 4) { slecht.push(regel); continue; }
      const basis = E.forcedMaterial(t.S);
      const houdt = function (m) {
        E.makeMove(t.S, m);
        const st = E.gameStatus(t.S);
        const na = st.over ? basis : E.forcedMaterial(t.S);
        E.unmakeMove(t.S);
        return na - basis >= -60;
      };
      const antwoord = function (m) { return t.answers.some(function (a) { return E.moveKey(a.m) === E.moveKey(m); }); };
      if (!t.answers.every(function (a) { return houdt(a.m); }) || E.legalMoves(t.S).some(function (m) { return !antwoord(m) && houdt(m); })) slecht.push(regel);
    }
    check('elke regel klopt' + (slecht.length ? ' (niet: ' + slecht.slice(0, 3).join('; ') + ')' : ''), slecht.length === 0);
  });

  /* de toetsen 2 en 3 van de coach: tegen de stand zelf en de beste zet, niet de reddingen onderling */
  regel('[5.9] een steekproef van vijf uit de Red je stuk-voorraad: het stuk is te redden, en elke redding is bijna de beste en verliest geen pion', function (check) {
    if (!check('er is een voorraad STUK_POOL', typeof STUK_POOL !== 'undefined' && Array.isArray(STUK_POOL))) return;
    if (!knoopbudget(check)) return;
    const rng = vast(20261113), van = STUK_POOL.slice();
    for (let i = 0; i < 5 && van.length; i++) {
      const regel = van.splice(Math.floor(rng() * van.length), 1)[0];
      const t = E.trucTask(regel);
      const v0 = E.think(t.S, 20000, 10, { nodes: 60000 }).score, stil = E.evalWhite(t.S);
      check(regel + ': te redden (' + v0 + ' tegen ' + stil + ')', v0 >= stil - 100);
      for (const a of t.answers) {
        const l = E.lineAfter(t.S, a.m, 60000);
        check(regel + ': ' + E.moveKey(a.m) + ' bijna de beste en geen pion kwijt (' + l.white + ', ' + l.material + ')',
          l.white >= v0 - 50 && l.material >= -90);
      }
    }
  });

  /* De generatoren die live blijven, op vaste zaden. Op deze Mac onder een
     seconde per opdracht; de echte maat is een paar seconden onder de 6x
     vertraging in Chromium (gemeten in de review, ux-run/reviews/inc5/snelheid.md). */
  /* Geteld in knopen, niet in milliseconden: zo meet de test de code en niet
     hoe druk de machine is. Onder de 6x vertraging zoekt Chromium ongeveer
     40.000 knopen per seconde (snelheid.md: 50.000 knopen in 1,2 s), dus
     120.000 knopen is zo'n drie seconden. */
  const LIVE_MAX = 120000;
  regel('[5.9] de generatoren die live blijven en het lezen van een voorraadregel zoeken niet te veel', function (check) {
    const meeste = {};
    const meet = function (naam, f) {
      for (let i = 1; i <= 3; i++) {
        const rng = vast(i * 7919), n0 = E.nodesSearched();
        f(rng);
        meeste[naam] = Math.max(meeste[naam] || 0, E.nodesSearched() - n0);
      }
    };
    for (const type of ['attacked', 'capture', 'mobility', 'free', 'threat']) meet('speurogen ' + type, function (rng) { E.genScanTask(type, rng); });
    meet('veilig of valstrik', function (rng) { E.genSafeTask(rng() < 0.5, rng); });
    meet('de beste zet', function (rng) { E.genBest3(rng); });
    const n0 = E.nodesSearched();
    if (typeof TRUC_POOL !== 'undefined') for (const r of TRUC_POOL.slice(0, 50)) E.trucTask(r);
    meeste['50 voorraadregels lezen'] = E.nodesSearched() - n0;
    for (const naam in meeste) check(naam + ': ' + meeste[naam] + ' knopen', meeste[naam] <= LIVE_MAX);
    console.log('  live generatoren, meeste knopen van 3: ' + JSON.stringify(meeste));
  });

  /* ---------- 5.6: drie keer dezelfde stelling ---------- */

  regel('[5.6] de engine telt hoe vaak de stelling al eerder op het bord stond', function (check) {
    const S = E.newGame();
    check('aan het begin nog nooit', E.repetitions(S) === 0);
    speel(S, ['g1f3', 'g8f6', 'f3g1', 'f6g8']);
    check('na een rondje paarden: de beginstand voor de tweede keer', E.repetitions(S) === 1);
    speel(S, ['g1f3', 'g8f6', 'f3g1', 'f6g8']);
    check('na nog een rondje: de derde keer', E.repetitions(S) === 2);
    /* hetzelfde bord zonder rokaderecht is een andere stelling */
    const R = E.parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    speel(R, ['e1f1', 'e8f8', 'f1e1', 'f8e8']);
    check('zelfde bord, maar de rokade is weg: geen herhaling', E.repetitions(R) === 0);
    speel(R, ['e1f1', 'e8f8', 'f1e1', 'f8e8']);
    check('daarna wel', E.repetitions(R) === 1);
  });

  regel('[5.6] na een dubbele pionzet telt de stelling mee zolang niemand en passant kan slaan', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'g8f6', 'g1f3', 'f6g8', 'f3g1', 'g8f6', 'g1f3', 'f6g8', 'f3g1']);
    check('na 5.Pg1 de derde keer de stand na 1.e4 (' + E.repetitions(S) + ')', E.repetitions(S) === 2);
    /* wel een slag en passant mogelijk: dan is het een andere stelling dan hetzelfde bord zonder */
    const T = speel(E.parseFEN('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1'), ['d7d5', 'e1e2', 'e8e7', 'e2e1', 'e7e8']);
    check('met en passant mogelijk: geen herhaling (' + E.repetitions(T) + ')', E.repetitions(T) === 0);
  });

  /* ---------- 5.7: het knoopbudget, matzetten en niet herhalen ---------- */

  regel('[5.7] het knoopbudget geldt ook binnen een iteratie, en wie te weinig budget geeft krijgt een getelde zet', function (check) {
    const S = E.parseFEN('r2qkb1r/pppb1ppp/4pn2/3p4/1n1P1B2/3QP3/PPPKNPPP/RN3B1R w kq - 2 7');
    for (const b of [2000, 3000]) {
      E.clearTT();
      const r = E.think(S, 60000, 30, { nodes: b });
      check('budget ' + b + ': ' + r.nodes + ' knopen', r.nodes <= b + 256);
    }
    const T = E.parseFEN('1k2r2r/1pp1nppp/p2b1q2/P1Np1n2/3Pp1b1/2Q1P3/1PPBNPPP/R3KB1R w - - 0 1');
    E.clearTT();
    const een = E.think(T, 60000, 1).nodes;
    E.clearTT();
    const r = E.think(T, 60000, 8, { nodes: 1 });
    check('budget 1: een zet van diepte 1, met de knopen van die diepte geteld (' + r.depth + ', ' + r.nodes + ' van ' + een + ')',
      !!r.m && r.depth === 1 && r.nodes >= een);
  });

  regel('[5.7] think met root zoekt alleen die zetten, en elke knoop telt mee in de teller van alle zoektochten', function (check) {
    const S = E.parseFEN('r2qkb1r/pppb1ppp/4pn2/3p4/1n1P1B2/3QP3/PPPKNPPP/RN3B1R w kq - 2 7');
    E.clearTT();
    const heel = E.think(S, 60000, 8, { nodes: 5000 });
    const ander = E.legalMoves(S).find(function (m) { return E.moveKey(m) !== E.moveKey(heel.m); });
    E.clearTT();
    const een = E.think(S, 60000, 8, { nodes: 5000, root: [ander] });
    check('met één zet: die zet (' + E.moveKey(een.m) + ')', E.moveKey(een.m) === E.moveKey(ander));
    E.clearTT();
    const n0 = E.nodesSearched(), r = E.think(S, 60000, 8, { nodes: 5000 });
    check('de teller loopt precies zo ver als think telt (' + (E.nodesSearched() - n0) + ', ' + r.nodes + ')', E.nodesSearched() - n0 === r.nodes);
    const n1 = E.nodesSearched();
    E.rootScores(S, 2);
    check('ook de zoektocht van rootScores telt', E.nodesSearched() > n1);
  });

  regel('[5.7] Super Turbo zoekt op knopen: twee keer dezelfde stelling geeft de zet van het knoopbudget', function (check) {
    if (!knoopbudget(check)) return;
    const S = E.parseFEN(SUPER_FEN);
    E.clearTT();
    const verwacht = E.moveKey(E.think(S, 60000, 8, { nodes: E.SUPER_NODES }).m);
    for (let i = 0; i < 2; i++) {
      E.clearTT();
      check('keer ' + (i + 1) + ': ' + verwacht, E.moveKey(E.pickMove(S, 3)) === verwacht);
    }
  });

  regel('[5.7] think met een knoopbudget stopt binnen het budget plus 256 en geeft met een lege tabel twee keer dezelfde zet', function (check) {
    if (!knoopbudget(check)) return;
    const S = E.parseFEN('r2qkb1r/pppb1ppp/4pn2/3p4/1n1P1B2/3QP3/PPPKNPPP/RN3B1R w kq - 2 7');
    E.clearTT();
    const a = E.think(S, 60000, 30, { nodes: 30000 });
    E.clearTT();
    const b = E.think(S, 60000, 30, { nodes: 30000 });
    check('binnen het budget (' + a.nodes + ', ' + b.nodes + ')', a.nodes <= 30256 && b.nodes <= 30256);
    check('dezelfde zet', !!a.m && !!b.m && E.moveKey(a.m) === E.moveKey(b.m));
  });

  /* de drie beginstellingen van de coach (learning.md 6.5), zwart aan zet */
  const EINDSPEL = [['dame', '8/8/8/4k3/8/8/8/3QK3 b - - 0 1'], ['toren', '8/8/8/4k3/8/8/8/R3K3 b - - 0 1'],
    ['toren', '8/8/3k4/8/8/2K5/8/7R b - - 0 1']];
  regel('[5.7] de sterkste Turbo zet mat met dame of toren tegen een kale koning, binnen 50 zetten en zonder herhaling', function (check) {
    if (!knoopbudget(check)) return;
    for (const [stuk, fen] of EINDSPEL) {
      const S = E.parseFEN(fen);
      let st = E.gameStatus(S), drie = false;
      for (let ply = 0; ply < 100 && !st.over; ply++) {
        E.makeMove(S, E.pickMove(S, 3));
        if (E.repetitions(S) >= 2) drie = true;
        st = E.gameStatus(S);
      }
      check('met een ' + stuk + ' vanuit ' + fen + ': mat (' + (st.reason || 'na 50 zetten nog niet') + ')', st.over && st.reason === 'mat' && st.result === 'w');
      check('met een ' + stuk + ': nooit drie keer dezelfde stelling', !drie);
    }
  });

  /* ---------- 5.8: het sleutelmoment van een potje ---------- */

  regel('[5.8] sleutelmoment: wie een paard laat hangen, krijgt "hang" bij die zet', function (check) {
    /* 1.Pf3 e6 2.Pg5? Dxg5: het paard op g5 heeft geen dekking */
    const S = speel(E.newGame(), ['g1f3', 'e7e6', 'f3g5', 'd8g5', 'd2d4']);
    const k = E.keyMoment(S);
    check('er is een moment', !!k);
    check('van de soort hang, bij zet 2 (' + JSON.stringify(k) + ')', !!k && k.kind === 'hang' && k.moveNo === 2);
  });

  regel('[5.8] sleutelmoment: wie mat in één toelaat, krijgt "mat" bij die zet', function (check) {
    const S = speel(E.newGame(), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const k = E.keyMoment(S);
    check('van de soort mat, bij zet 2 (' + JSON.stringify(k) + ')', !!k && k.kind === 'mat' && k.moveNo === 2);
  });

  regel('[5.8] sleutelmoment: een verloren ruil, een gemiste dame, een gewonnen dame, en een rustig potje zonder moment', function (check) {
    const soort = function (fen, zetten) {
      const S = speel(E.parseFEN(fen), zetten), voor = E.toFEN(S), k = E.keyMoment(S);
      check('het bord blijft zoals het was', E.toFEN(S) === voor);
      return k;
    };
    /* Dxd4 slaat een paard dat de pion e5 dekt; de dame is zelf gedekt, dus geen hangend stuk */
    let k = soort('4k3/8/8/4p3/3n4/5N2/8/3QK3 w - - 0 1', ['d1d4', 'e5d4', 'f3d4']);
    check('een ruil die ruim 2 punten kost (' + JSON.stringify(k) + ')', !!k && k.kind === 'ruil' && k.moveNo === 1 && k.loss >= 200);
    k = soort(E.START_FEN, ['e2e4', 'e7e5', 'g1f3', 'd8g5', 'd2d3', 'g5g6']);
    check('de dame op g5 stond gratis en d3 liet haar staan (' + JSON.stringify(k) + ')', !!k && k.kind === 'gemist' && k.moveNo === 3 && k.sq === 'g5');
    k = soort(E.START_FEN, ['e2e4', 'e7e5', 'g1f3', 'd8g5', 'f3g5']);
    check('Pxg5 wint de dame (' + JSON.stringify(k) + ')', !!k && k.kind === 'goed' && k.moveNo === 3);
    k = soort(E.START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    check('een rustig begin heeft geen moment', k === null);
  });

  regel('[5.8] sleutelmoment: een gedekte pion slaan is een ruil, een vluchtende dame mist niets, en de verdediger die wegging krijgt een naam', function (check) {
    /* de coach: Dxd5 slaat een pion die c6 dekt; de les is de gedekte pion, niet een hangend stuk */
    let k = E.keyMoment(speel(E.parseFEN('4k3/8/2p5/3p4/8/8/8/3QK3 w - - 0 1'), ['d1d5', 'c6d5']));
    check('Dxd5, cxd5: een ruil (' + JSON.stringify(k) + ')', !!k && k.kind === 'ruil' && k.moveNo === 1);
    /* de dame vlucht voor het paard; Txa8 zou de dame kosten, dus niets gemist */
    k = E.keyMoment(speel(E.parseFEN('b7/8/7k/4n3/8/3Q4/8/R3K3 w - - 0 1'), ['d3d1']));
    check('Dd1 terecht: geen gemiste loper (' + JSON.stringify(k) + ')', k === null || k.kind !== 'gemist');
    /* met de koning op e8 geeft Txa8 schaak: dan moet zwart eerst de koning redden, en wint wit de loper wel */
    k = E.keyMoment(speel(E.parseFEN('b3k3/8/8/4n3/8/3Q4/8/R3K3 w - - 0 1'), ['d3d1']));
    check('Dd1 naast Txa8+: wel een gemiste loper (' + JSON.stringify(k) + ')', !!k && k.kind === 'gemist' && k.sq === 'a8');
    /* de loper op f4 dekte het paard op e5 en ging weg; de toren pakt het paard */
    k = E.keyMoment(speel(E.parseFEN('4r1k1/8/8/4N3/5B2/8/8/6K1 w - - 0 1'), ['f4c1', 'e8e5']));
    check('Lc1: hang, en de loper die dekte heeft een naam (' + JSON.stringify(k) + ')',
      !!k && k.kind === 'hang' && k.defender === 'loper' && k.moved === true && k.piece === 'paard');
  });

  regel('[5.8] sleutelmoment: Turbo zet een vork na je zet; een vork van jou telt pas als hij iets opleverde', function (check) {
    /* de lijn van de coach: 4.f3?? Dh4+ valt koning en loper tegelijk aan */
    const S = speel(E.newGame(), ['g1h3', 'e7e6', 'e2e3', 'b8a6', 'f1c4', 'd7d5', 'f2f3', 'd8h4']);
    let k = E.keyMoment(S);
    check('truc bij zet 4 (' + JSON.stringify(k) + ')', !!k && k.kind === 'truc' && k.moveNo === 4 && k.punish === 'd8h4');
    /* Pc7+ vorkt koning en toren; daarna pakt het paard de toren */
    k = E.keyMoment(speel(E.parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'), ['b5c7', 'e8d7', 'c7a8']));
    check('een vork die de toren oplevert is goed (' + JSON.stringify(k) + ')', !!k && k.kind === 'goed' && k.moveNo === 1);
    k = E.keyMoment(speel(E.parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'), ['b5c7', 'e8d7', 'c7b5']));
    check('dezelfde vork, maar het paard laat de toren staan: het moment is de gemiste toren, niet de vork (' + JSON.stringify(k) + ')',
      !!k && k.kind === 'gemist' && k.moveNo === 2 && k.sq === 'a8');
  });

  regel('[5.8] sleutelmoment: een vork die niets oplevert is geen goed moment, en van twee even grote verliezen telt het eerste', function (check) {
    /* Pc7+ vorkt koning en loper, maar de loper op a6 is gedekt: slaan levert niets op */
    for (const lijn of [['d5c7', 'e8f7', 'e1d1'], ['d5c7', 'e8f8', 'e1d2']]) {
      const k = E.keyMoment(speel(E.parseFEN('4k3/1p6/b7/3N4/8/8/8/4K3 w - - 0 1'), lijn));
      check(lijn.join(' ') + ': geen moment (' + JSON.stringify(k) + ')', k === null);
    }
    const k = E.chooseMoment([{ kind: 'hang', loss: 300, ply: 2, moveNo: 2 }, { kind: 'hang', loss: 300, ply: 6, moveNo: 4 }], null);
    check('twee keer 3 punten: het eerste (' + JSON.stringify(k) + ')', !!k && k.moveNo === 2);
  });

  regel('[5.7] Turbo zet mat tegen een kale koning in plaats van remise door vijftig zetten', function (check) {
    if (!knoopbudget(check)) return;
    /* zwart is Turbo met dame en koning, wit heeft alleen zijn koning */
    const S = E.parseFEN('3qk3/8/8/8/4K3/8/8/8 w - - 0 1');
    let st = E.gameStatus(S);
    for (let ply = 0; ply < 100 && !st.over; ply++) {
      E.makeMove(S, S.turn === 'b' ? E.pickMove(S, 2) : E.pickMove(S, 3));
      st = E.gameStatus(S);
    }
    check('mat binnen 50 zetten (' + (st.reason || 'niet') + ')', st.over && st.reason === 'mat' && st.result === 'b');
  });

  console.log('\nengine-orakel: ' + nogNietN + ' nog niet gebouwd, ' + gebouwdN + ' gebouwd');
  if (fouten) { console.log(fouten + ' ENGINE ORACLE FAILURES'); throw new Error('engine-orakel: ' + fouten + ' fouten'); }
  console.log('ALL ENGINE ORACLE TESTS PASSED');
})();
