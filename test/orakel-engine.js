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
    check('met alleen Pc3-b5: goed', !!E.checkPieceTask(taak(['c3b5'])));
    check('de stand blijft onaangeroerd', E.toFEN(S) === fen);
  });

  /* ---------- 5.1: de voorraad trucs ---------- */

  const TYPES = ['vork', 'penning', 'spies', 'aftrek', 'mat2'];
  const leesTruc = function (regel) {
    const delen = String(regel).split('|');
    if (delen.length !== 3) throw new Error('geen drie delen: ' + regel);
    const S = E.parseFEN(delen[0] + ' - - 0 1');
    return { S: S, kant: delen[0].split(' ')[1], type: delen[1], antwoorden: delen[2].split(',').map(function (k) { return zet(S, k); }) };
  };
  const herkend = function (t) {
    const m = t.antwoorden[0];
    if (t.type === 'mat2') return E.matesIn(t.S, m, 2);
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
  });

  regel('[5.1] een steekproef van vijf per type: elk antwoord wint ook bij diep nadenken minstens 1,5 punt', function (check) {
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
      }
    }
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

  /* ---------- 5.7: het knoopbudget, matzetten en niet herhalen ---------- */

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
