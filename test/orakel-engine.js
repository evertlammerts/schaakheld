/* Orakel, engine: de regels over schaken die in de engine wonen: de
   opdrachten, Turbo's zinnen en het belangrijkste moment. Zoals in de flowsuite staat een
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

  /* het verlies telt tegen het materiaal dat nu op het bord staat, vanaf
     anderhalf punt; een kans die het kind laat liggen, is geen gevaar. */
  regel('[5.4] het alarm meet tegen het bord nu en vanaf 1,5 punt: een gemiste kans is geen gevaar', function (check) {
    const S = E.parseFEN('rnbqkb1r/pppp1ppp/8/4n3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3');
    check('a2-a3 laat het vrije paard op e5 staan maar verliest niets: geen alarm', E.blunderCheck(S, zet(S, 'a2a3')) === null);
    const T = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const r = E.blunderCheck(T, zet(T, 'f3e5'));
    check('3.Pxe5 geeft een paard voor een pion: alarm, verlies 220', !!r && r.loss === 220 && !r.mate);
    check('met Pc6xe5 als de zet van Turbo die het verlies begint', !!r && !!r.take && E.moveKey(r.take) === 'c6e5');
    const U = E.parseFEN('6k1/2p5/3b4/8/8/8/5PPP/3R2K1 w - - 0 1');
    const k = E.blunderCheck(U, zet(U, 'd1d6'));
    check('Txd6 geeft een toren voor een loper (170): alarm', !!k && k.loss === 170);
    check('met c7xd6 als de zet van Turbo die het verlies begint', !!k && !!k.take && E.moveKey(k.take) === 'c7d6');
    /* de lijn van de coach: na 4.f3?? is Dh4+ Turbo's beste zet, maar die slaat niets */
    const W = speel(E.newGame(), ['g1h3', 'e7e6', 'e2e3', 'b8a6', 'f1c4', 'd7d5']);
    const f = E.blunderCheck(W, zet(W, 'f2f3'));
    check('4.f3 laat de loper op c4 staan: alarm, verlies 330', !!f && f.loss === 330);
    check('Turbo\'s beste zet is Dh4+ (' + (f && f.punish ? E.moveKey(f.punish) : '-') + ')', !!f && !!f.punish && E.moveKey(f.punish) === 'd8h4');
    check('de zet die het verlies begint slaat: d5xc4 (' + (f && f.take ? E.moveKey(f.take) : '-') + ')', !!f && !!f.take && E.moveKey(f.take) === 'd5c4');
    const V = speel(E.newGame(), ['e2e4', 'd7d5']);
    check('2.a3 laat alleen een pion hangen (100): geen alarm', E.blunderCheck(V, zet(V, 'a2a3')) === null);
    const fen = E.toFEN(T);
    E.blunderCheck(T, zet(T, 'f3e5'));
    check('de stand blijft onaangeroerd', E.toFEN(T) === fen);
  });

  /* ---------- 5.4 en 5.8: geen waarschuwing en geen moment als elke zet even veel kost ---------- */

  regel('[5.4] het alarm alleen als een andere zet minstens een pion minder kost', function (check) {
    /* Pf3+ valt koning en dame aan: elke zet kost de dame */
    const V = E.parseFEN('7k/8/8/8/8/5n2/3Q4/6K1 w - - 0 1');
    check('een vork: geen alarm op een koningszet', E.legalMoves(V).every(function (m) { return E.blunderCheck(V, m) === null; }));
    const W = E.parseFEN('6k1/8/8/8/2R5/8/6PP/r6K w - - 0 1');
    check('de enige zet: geen alarm', E.legalMoves(W).length === 1 && E.blunderCheck(W, E.legalMoves(W)[0]) === null);
    const M = E.parseFEN('7r/8/8/8/7P/8/2k5/K7 w - - 0 1');
    check('elke zet laat mat toe: geen alarm', E.legalMoves(M).every(function (m) { return E.blunderCheck(M, m) === null; }));
    const T = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const r = E.blunderCheck(T, zet(T, 'f3e5'));
    check('een andere zet is een pion beter: het alarm blijft, zonder "kost minder"', !!r && r.anyway === false);
    /* Kh1 en Kg2 laten de dame vallen voor niets, Kf1 dekt haar */
    const K = E.parseFEN('7k/8/8/8/8/5n2/8/4Q1K1 w - - 0 1');
    const h = E.blunderCheck(K, zet(K, 'g1h1'));
    check('alles kost iets, een andere zet minder: het alarm blijft met "kost minder"', !!h && h.anyway === true && E.blunderCheck(K, zet(K, 'g1f1')) === null);
  });

  /* Turbo's beste zet slaat niets: de slag die het verlies begint is de grootste van zijn slagen */
  regel('[5.4] het alarm noemt van twee slagen die winnen de grootste', function (check) {
    const S = E.parseFEN('6k1/1b6/8/8/8/2n2N2/R7/6K1 b - - 0 1');
    const t = E.lossStart(S, zet(S, 'g8f7'));
    check('Pxa2, de toren (' + (t && E.moveKey(t)) + ')', !!t && E.moveKey(t) === 'c3a2');
  });

  /* Red je stuk: een regel van de voorraad noemt ook de zetten die het stuk ook redden ("<zet>:<punten>:<antwoord>") */
  regel('[5.5] Red je stuk: een regel kan de zetten noemen die het stuk ook redden, en alleen een Red je stuk-regel', function (check) {
    const t = E.trucTask('1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w|stuk|f3g5|f4g3:300:f3g5,f4h2:50:f3g5');
    check('twee zetten die ook goed zijn', !!t && t.ook.length === 2 && E.moveKey(t.ook[0].m) === 'f4g3' && t.ook[0].n === 300 && E.moveKey(t.ook[0].ans) === 'f3g5' && t.ook[1].n === 50);
    check('zonder vierde veld: geen', E.trucTask('1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w|stuk|f3g5').ook.length === 0);
    check('een zet die er niet is: de regel telt niet', E.trucTask('1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w|stuk|f3g5|a1a8:300:f3g5') === null);
    check('een vierde veld bij een vork: de regel telt niet', E.trucTask('6k1/8/8/8/8/8/8/R5K1 w|vork|a1a8|a1a2:1:a1a8') === null);
  });
  /* wat de voorraad ook goed rekent: nooit een antwoord, altijd een echte redding, geen mat in een erna */
  regel('[5.5] Red je stuk: een zet die ook goed is, is geen antwoord, redt het stuk echt en laat geen mat in een toe', function (check) {
    if (!check('er is een voorraad STUK_POOL', typeof STUK_POOL !== 'undefined' && STUK_POOL.length > 0)) return;
    let ook = 0;
    for (const r of STUK_POOL) {
      const t = E.trucTask(r);
      if (!check('te lezen: ' + r.slice(0, 40), !!t)) continue;
      for (const o of t.ook) {
        ook++;
        const k = E.saveKind(t.S, o.m, t.hang.sq).kind;
        E.makeMove(t.S, o.m); const mat = !!E.mateReply(t.S); E.unmakeMove(t.S);
        if (t.answers.some(function (a) { return E.moveKey(a.m) === E.moveKey(o.m); }) || k === 'anders' || k === 'ruil' || mat)
          check(r.slice(0, 40) + ' ' + E.moveKey(o.m) + ' (' + k + (mat ? ', mat' : '') + ')', false);
      }
    }
    check('testopzet: de voorraad heeft zulke zetten (' + ook + ')', ook >= 50);
    const S = E.parseFEN('1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w - - 0 1'), l = E.lineAfter(S, zet(S, 'f3g5'), E.CHECK_NODES);
    check('de lijn telt ook in punten van de tabel (' + l.punten + ')', typeof l.punten === 'number' && l.punten % 100 === 0);
  });

  /* het alarm komt voor de zet op het bord staat: met een grens aan posities wacht het kind nooit lang; is de grens op,
     dan geen alarm voor die zet */
  regel('[5.4] het alarm kijkt naar hoogstens ALARM_NODES posities, en is de grens op, dan is er geen alarm', function (check) {
    if (!check('er is een grens', typeof E.ALARM_NODES === 'number' && E.ALARM_NODES > 0)) return;
    const S = E.parseFEN('1nb1kb1r/r2p3p/5p1n/pP2pPp1/PPpPq2P/N5P1/1B2N2R/1R1QKB2 w - - 0 1'), m = zet(S, 'h2h1');
    check('zonder grens: het alarm', !!E.blunderCheck(S, m));
    const n0 = E.nodesSearched(), r = E.blunderCheck(S, m, E.ALARM_NODES), n = E.nodesSearched() - n0;
    check('met de grens: geen alarm', r === null);
    check('en hoogstens de grens en wat de laatste stap nog telt (' + n + ')', n <= E.ALARM_NODES * 1.1);
    check('de stand blijft onaangeroerd', E.toFEN(S) === '1nb1kb1r/r2p3p/5p1n/pP2pPp1/PPpPq2P/N5P1/1B2N2R/1R1QKB2 w - - 0 1');
    const T = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    check('een gewone fout: het alarm blijft met de grens', !!E.blunderCheck(T, zet(T, 'f3e5'), E.ALARM_NODES));
    check('en daarna zoekt de engine weer zonder grens', E.rootScores(S, 2).length > 0 && !!E.blunderCheck(S, m));
  });

  /* het alarm: remise is geen betere zet, mat wel; en "kost minder" alleen als echt elke zet iets kost */
  regel('[5.4] het alarm: een zet die pat geeft telt niet als beter, een zet die mat geeft wel', function (check) {
    const P = E.parseFEN('8/8/1P6/8/8/2p1K3/2nQ4/k7 w - - 0 1');
    check('testopzet: een andere zet geeft pat', E.legalMoves(P).some(function (x) { E.makeMove(P, x); const st = E.gameStatus(P); E.unmakeMove(P); return st.over && st.reason !== 'mat'; }));
    check('Ke3-d3: alleen pat zou beter zijn, dus geen alarm', E.blunderCheck(P, zet(P, 'e3d3')) === null);
    const M = E.parseFEN('7r/8/8/6n1/5R2/3p1Q2/6p1/5K1k w - - 0 1');
    check('testopzet: een andere zet geeft mat', E.legalMoves(M).some(function (x) { E.makeMove(M, x); const st = E.gameStatus(M); E.unmakeMove(M); return st.reason === 'mat'; }));
    const r = E.blunderCheck(M, zet(M, 'f1e1'));
    check('Kf1-e1: mat is beter, dus het alarm (' + JSON.stringify(r && r.loss) + ')', !!r && r.anyway === false);
  });
  regel('[5.4] het alarm: "kost minder" niet als een latere zet niets kost, ook al kost de eerste betere zet wel iets', function (check) {
    const S = E.parseFEN('2Q4r/5k1q/8/p3Pppp/PbPP3P/4n3/RP1NK1P1/2B2BNR w - - 4 31');
    const r = E.blunderCheck(S, zet(S, 'h1h2'));
    check('het alarm, zonder "kost minder" (' + JSON.stringify(r && { loss: r.loss, anyway: r.anyway }) + ')', !!r && r.anyway === false);
  });

  /* punten uit de tabel van de kinderen, ook op een veld en bij een goede of gemiste slag */
  regel('[5.8] de punten van een slag komen uit de tabel: een loper is 3, ook als de engine 3,3 rekent', function (check) {
    const S = E.parseFEN('6k1/8/8/3b4/8/2N5/8/6K1 w - - 0 1');
    check('de ruil op d5 in de tabel (' + E.seeSquare(S, E.sqFromAlg('d5'), E.TABEL) + ')', E.seeSquare(S, E.sqFromAlg('d5'), E.TABEL) === 300);
    const g = E.moveMoment(S, zet(S, 'c3d5'));
    check('Pxd5 wint 3 punten (' + JSON.stringify(g) + ')', !!g && g.kind === 'goed' && g.winst === 300 && g.piece === 'loper');
    const T = E.parseFEN('6k1/8/8/3b4/8/2N5/7P/6K1 w - - 0 1');
    const m = E.moveMoment(T, zet(T, 'h2h3'));
    check('h3 laat 3 punten liggen (' + JSON.stringify(m) + ')', !!m && m.kind === 'gemist' && m.winst === 300);
  });
  /* "je pakte mijn {stuk}" alleen als Turbo niet terugpakt */
  regel('[5.8] sleutelmoment: een goede slag die Turbo terugpakt noemt geen stuk', function (check) {
    const S = E.parseFEN('6k1/8/4p3/3q4/8/2N5/8/6K1 w - - 0 1');
    const g = E.moveMoment(S, zet(S, 'c3d5'));
    check('Pxd5 exd5: goed, 6 punten, geen stuk (' + JSON.stringify(g) + ')', !!g && g.kind === 'goed' && g.winst === 600 && g.piece === null);
  });
  /* een straf die slaat is alleen "een slag" als de winst op dat veld ligt */
  regel('[5.8] sleutelmoment: een straf die slaat maar elders wint is een truc, geen slag', function (check) {
    const S = E.parseFEN('2r4k/8/3P4/p4p1p/PbP3pP/R7/1PKNB1PR/2B3N1 w - - 7 41');
    const k = E.moveMoment(S, zet(S, 'e2f3'));
    check('Le2-f3, Lxa3 (' + JSON.stringify(k) + ')', !!k && k.kind === 'truc' && k.punish === 'b4a3');
  });
  /* "gemist" niet als het kind dat stuk zelf sloeg, ook als een ander stuk het beter had kunnen slaan */
  regel('[5.8] sleutelmoment: wie de toren zelf slaat, heeft hem niet gemist', function (check) {
    const S = E.parseFEN('6k1/8/1p6/2r5/3P4/8/8/2R3K1 w - - 0 1');
    check('testopzet: d4xc5 wint de toren', E.winnableCaptures(S).some(function (x) { return E.alg(x.sq) === 'c5' && x.gain >= 300; }));
    const k = E.moveMoment(S, zet(S, 'c1c5'));
    check('Txc5 bxc5: geen "gemist" (' + JSON.stringify(k) + ')', !k || k.kind !== 'gemist');
  });
  /* een stuk dat hing is ook gebruikt als Turbo het met een ander stuk sloeg dan de straf */
  regel('[5.8] sleutelmoment: een stuk dat hing is gebruikt als Turbo het op dat veld sloeg, ook met een ander stuk', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'd7d5', 'e4d5', 'd8d5']);
    const k = E.chooseMoment([{ kind: 'hang', loss: 100, ply: 2, moveNo: 2, sq: 'd5', punish: 'g8f6' }], S);
    check('Dxd5 op het veld van het stuk: gebruikt (' + JSON.stringify(k) + ')', !!k && k.used === true);
  });

  /* Turbo's beste antwoord is zelf een slag: dan begint het verlies met die slag, ook als een andere slag meer wint */
  regel('[5.4] is Turbo\'s beste antwoord een slag, dan begint het verlies daar, ook als een andere slag meer wint', function (check) {
    const S = E.parseFEN('6k1/1b6/8/8/8/2n2N2/R7/6K1 b - - 0 1');
    const t = E.lossStart(S, zet(S, 'b7f3'));
    check('Lxf3, niet Pxa2 (' + (t && E.moveKey(t)) + ')', !!t && E.moveKey(t) === 'b7f3');
  });

  /* een promotie heet "..., promotie": zonder uitroepteken, zodat een zin die op de zetnaam eindigt een gewone punt krijgt */
  regel('[5.5] een promotie heet "Pion b7 → a8, slaat toren, promotie", zonder uitroepteken', function (check) {
    const S = E.parseFEN('r6k/1P6/8/8/8/8/8/6K1 w - - 0 1');
    const n = E.moveNameNL(S, zet(S, 'b7a8q'));
    check('de naam (' + n + ')', n === 'Pion b7 → a8, slaat toren, promotie');
  });

  /* en passant is ook een slag die wint: de pion op d5 is gratis; wordt de slag teruggepakt, dan is hij geen winst */
  regel('[5.5] met winst slaan telt en passant mee: gratis is een doel, teruggepakt niet', function (check) {
    const vrij = E.winnableCaptures(E.parseFEN('4k3/8/8/n2pP3/8/8/8/R3K3 w - d6 0 1'));
    const d5 = vrij.find(function (x) { return x.sq === E.sqFromAlg('d5'); });
    check('de pion op d5, met e5xd6 en passant, 1 pion winst (' + JSON.stringify(d5) + ')', !!d5 && d5.gain === 100 && d5.move.flags === 'e' && E.moveKey(d5.move) === 'e5d6');
    const terug = E.winnableCaptures(E.parseFEN('r1bq1rk1/ppp1bppp/2n1pn2/3pP3/3P4/3B1N2/PPPN1PPP/R1BQK2R w KQ d6 0 1'));
    check('teruggepakt: d5 is geen doel, f6 wel (' + terug.map(function (x) { return E.alg(x.sq); }).join(',') + ')',
      !terug.some(function (x) { return x.sq === E.sqFromAlg('d5'); }) && terug.some(function (x) { return x.sq === E.sqFromAlg('f6'); }));
  });

  regel('[5.4] de punten die een kind leest komen uit de tabel van de kinderen', function (check) {
    for (const g of [['twee lopers voor een toren', '3r2k1/3r1ppp/8/8/8/8/2B2PPP/5BK1 w - - 0 1', 'f1d3', 100],
      ['een toren voor een loper', '6k1/2p5/3b4/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d6', 200],
      ['een toren voor een paard', '6k1/2p5/3n4/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d6', 200],
      ['een dame voor een toren', '6k1/2p5/3r4/8/8/8/5PPP/3Q2K1 w - - 0 1', 'd1d6', 400],
      ['een paard voor een pion', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'f3e5', 200]]) {
      const S = E.parseFEN(g[1]), b = E.blunderCheck(S, zet(S, g[2]));
      check(g[0] + ': ' + (g[3] / 100) + ' (' + (b && b.points) + ')', !!b && b.points === g[3]);
    }
  });

  regel('[5.8] sleutelmoment: geen moment voor een zet als elke zet even veel kost', function (check) {
    const A = E.parseFEN('r7/1ppk4/6Pp/8/1p2p1R1/PP2Kq2/2P5/8 w - - 0 1');
    check('Ke3-d4: de toren is met elke zet weg', E.moveMoment(A, zet(A, 'e3d4')) === null);
    const B = E.parseFEN('rnb2b1r/p1p1k1pp/1p2p2n/3p1Bq1/7N/N3PQ2/PPPP1P1P/R1B1K2R w KQ - 0 1');
    check('Lf5xe6: de loper is toch weg', E.moveMoment(B, zet(B, 'f5e6')) === null);
  });

  regel('[5.8] sleutelmoment: een slag die op zijn eigen veld wint is een slag, geen truc', function (check) {
    /* Dd1-d3: Lxd3 cxd3 kost de dame voor een loper */
    const S = E.parseFEN('6k1/8/b7/8/8/8/2P5/3Q2K1 w - - 0 1');
    const k = E.moveMoment(S, zet(S, 'd1d3'));
    check('een slag met de loper (' + JSON.stringify(k) + ')', !!k && k.kind === 'slag' && k.by === 'loper' && k.piece === 'dame' && k.sq === 'd3' && k.verlies === 600);
  });

  regel('[5.8] sleutelmoment: een stuk dat zelf naar een onbeschermd veld ging', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'd7d6']);
    const k = E.moveMoment(S, zet(S, 'f3g5'));
    check('Pg5: het paard zelf (' + JSON.stringify(k) + ')', !!k && k.kind === 'hang' && k.self === true && k.piece === 'paard' && k.sq === 'g5');
  });

  regel('[5.8] sleutelmoment: een verlies dat Turbo gebruikte gaat voor een groter verlies dat hij liet liggen', function (check) {
    /* 2.La6? Pc6 (de loper blijft staan), 4.Pg5? Dxg5 (het paard gaat) */
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'f1a6', 'b8c6', 'g1f3', 'd7d6', 'f3g5', 'd8g5']);
    const ms = [{ kind: 'hang', loss: 330, ply: 2, moveNo: 2, sq: 'a6', punish: 'b7a6' }, { kind: 'hang', loss: 320, ply: 6, moveNo: 4, sq: 'g5', punish: 'd8g5' }];
    const k = E.chooseMoment(ms, S);
    check('zet 4, gebruikt (' + JSON.stringify(k) + ')', !!k && k.moveNo === 4 && k.used === true);
    const alleenGemist = E.chooseMoment([ms[0]], S);
    check('alleen de loper: gekozen, maar niet gebruikt', !!alleenGemist && alleenGemist.moveNo === 2 && alleenGemist.used === false);
  });

  regel('[5.8] sleutelmoment: van wat Turbo liet liggen eerst een mat, dan het grootste verlies; een verlies voor een goede zet; de grootste winst', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b1c3', 'g8f6']);
    const kies = function (ms) { const k = E.chooseMoment(ms.map(function (x, i) { return Object.assign({ ply: 2 * i, moveNo: i + 1, sq: 'h8', punish: 'h8h8' }, x); }), S); return k && k.moveNo; };
    check('mat gaat voor een groot verlies', kies([{ kind: 'hang', loss: 900 }, { kind: 'mat', loss: E.MATE }]) === 2);
    check('het grootste verlies', kies([{ kind: 'hang', loss: 300 }, { kind: 'hang', loss: 500 }]) === 2);
    check('een verlies gaat voor een goede zet', kies([{ kind: 'goed', gain: 900 }, { kind: 'hang', loss: 300 }]) === 2);
    check('van twee goede zetten de grootste winst', kies([{ kind: 'goed', gain: 300 }, { kind: 'goed', gain: 500 }]) === 2);
  });

  /* wat Turbo echt deed gaat voor wat hij had kunnen doen: eerst een verlies dat hij gebruikte (het grootste), dan een mat
     die hij liet liggen, dan een verlies dat hij liet liggen, dan een goede zet */
  regel('[5.8] sleutelmoment: de volgorde: een gebruikt verlies, een gemiste mat, een gemist verlies, een goede zet', function (check) {
    /* na elke zet van wit speelt zwart de zet in ANTWOORD; een moment is gebruikt als zijn straf die zet is */
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b1c3', 'g8f6']);
    const ANTWOORD = ['e7e5', 'b8c6', 'f8c5', 'g8f6'];
    const kies = function (ms) {
      const k = E.chooseMoment(ms.map(function (x, i) { return Object.assign({ ply: 2 * i, moveNo: i + 1, sq: 'h8', punish: x.gebruikt ? ANTWOORD[i] : 'h8h8' }, x); }), S);
      return k && k.moveNo;
    };
    check('een gebruikt verlies gaat voor een gemiste mat', kies([{ kind: 'mat', loss: E.MATE }, { kind: 'hang', loss: 300, gebruikt: true }]) === 2);
    check('een gemiste mat gaat voor een groter gemist verlies', kies([{ kind: 'hang', loss: 900 }, { kind: 'mat', loss: E.MATE }]) === 2);
    check('een gemist verlies gaat voor een goede zet', kies([{ kind: 'goed', gain: 900 }, { kind: 'hang', loss: 300 }]) === 2);
    check('van de gebruikte verliezen het grootste, ook als een gemist verlies groter is',
      kies([{ kind: 'hang', loss: 300, gebruikt: true }, { kind: 'hang', loss: 900 }, { kind: 'hang', loss: 500, gebruikt: true }]) === 3);
    check('een mat die Turbo gaf, gaat voor elk ander gebruikt verlies', kies([{ kind: 'hang', loss: 900, gebruikt: true }, { kind: 'mat', loss: E.MATE, gebruikt: true }]) === 2);
  });

  /* een truc telt als gebruikt alleen als Turbo de zet van de truc speelde; slaat hij met een ander stuk, dan liet hij hem liggen */
  regel('[5.8] sleutelmoment: een truc is alleen gebruikt als Turbo de zet van de truc speelde', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'd7d5', 'e4d5', 'd8d5']);
    const k = E.chooseMoment([{ kind: 'truc', truc: 'vork', loss: 300, ply: 2, moveNo: 2, sq: 'd5', punish: 'g8f6' }], S);
    check('Dxd5 slaat op het veld, maar is niet de truc: niet gebruikt (' + JSON.stringify(k) + ')', !!k && k.used === false);
    const j = E.chooseMoment([{ kind: 'truc', truc: 'vork', loss: 300, ply: 2, moveNo: 2, sq: 'd5', punish: 'd8d5' }], S);
    check('Dxd5 als de zet van de truc: gebruikt', !!j && j.used === true);
  });

  /* "na het terugslaan" alleen als het kind terugsloeg */
  regel('[5.8] sleutelmoment: bij een slag weet het moment of het kind terugsloeg', function (check) {
    const ja = E.keyMoment(speel(E.parseFEN('6k1/8/b7/8/8/8/2P5/3Q2K1 w - - 0 1'), ['d1d3', 'a6d3', 'c2d3']));
    check('Dd3, Lxd3, cxd3: teruggeslagen (' + JSON.stringify(ja) + ')', !!ja && ja.kind === 'slag' && ja.used === true && ja.terug === true);
    const nee = E.keyMoment(speel(E.parseFEN('6k1/8/b7/8/8/8/2P5/3Q2K1 w - - 0 1'), ['d1d3', 'a6d3', 'g1f2']));
    check('Dd3, Lxd3, Kf2: niet teruggeslagen (' + JSON.stringify(nee) + ')', !!nee && nee.kind === 'slag' && nee.used === true && nee.terug === false);
  });

  regel('[5.8] sleutelmoment: in een potje dat het kind won met mat is de matzet geen gemiste mat', function (check) {
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
    const k = E.keyMoment(S);
    check('geen moment over de matzet (' + JSON.stringify(k) + ')', !k || !(k.kind === 'gemist' && k.mateWith === 'h5f7') && k.moveNo !== 4);
  });

  regel('[5.8] sleutelmoment: alleen de zetten van wit tellen, en de app kan zijn eigen momenten meegeven', function (check) {
    /* zwart laat zijn dame staan en wit pakt haar: dat is het moment, geen zet van Turbo */
    const S = speel(E.newGame(), ['e2e4', 'e7e5', 'g1f3', 'd8g5', 'f3g5', 'f8e7']);
    const k = E.keyMoment(S);
    check('de dame van zet 3 (' + JSON.stringify(k) + ')', !!k && k.kind === 'goed' && k.moveNo === 3);
    let n = 0;
    const eigen = E.keyMoment(S, function (T, m) { n++; return E.moveMoment(T, m); });
    check('de eigen functie draait voor elke zet van wit', n === 3 && !!eigen && eigen.moveNo === 3);
  });

  regel('[5.8] sleutelmoment: gemist, met de grootste winst, en niet wat het kind wel pakte', function (check) {
    /* het kind kan mat zetten met Te8 maar speelt h3 */
    const M = E.parseFEN('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
    const g = E.moveMoment(M, zet(M, 'h2h3'));
    check('een gemiste mat (' + JSON.stringify(g) + ')', !!g && g.kind === 'gemist' && g.mateWith === 'e1e8');
    /* een vrije toren en een vrij paard: het moment noemt de toren */
    const T = E.parseFEN('8/5ppp/4k3/6r1/1n6/8/3Q1PPP/6K1 w - - 0 1');
    const t = E.moveMoment(T, zet(T, 'h2h3'));
    check('de grootste van twee (' + JSON.stringify(t) + ')', !!t && t.kind === 'gemist' && t.piece === 'toren');
    const zelf = E.moveMoment(T, zet(T, 'd2g5'));
    check('het kind pakt de toren zelf: niets gemist (' + JSON.stringify(zelf) + ')', !zelf || zelf.kind !== 'gemist');
  });

  regel('[5.8] sleutelmoment: een vork op een veld waar Turbo het stuk gewoon pakt is geen goede zet', function (check) {
    /* Pc7+ vorkt koning en toren, maar de dame op d8 pakt het paard */
    const S = E.parseFEN('r2qk3/8/8/1N6/8/8/8/4K3 w - - 0 1');
    const k = E.moveMoment(S, zet(S, 'b5c7'));
    check('geen goede zet (' + JSON.stringify(k) + ')', !k || k.kind !== 'goed');
  });

  /* ---------- 5.3: veilig of valstrik, gecontroleerd bij het kiezen ---------- */

  /* de generator stelt ook een valstrik voor die mat in één toelaat, en de keuze houdt hem, ook als de matzet niets slaat */
  regel('[5.3] Veilig of valstrik: de generator geeft een valstrik met een stille matzet als straf (zaad 228)', function (check) {
    if (!knoopbudget(check)) return;
    const t = E.genSafeTask(true, vast(228));
    check('een valstrik met mat', !!t && t.trap === true && t.mate === true);
    if (!t || !t.mate) return;
    E.makeMove(t.S, t.move);
    const slag = E.isCapture(t.S, t.punish), mat = (function () { E.makeMove(t.S, t.punish); const st = E.gameStatus(t.S); E.unmakeMove(t.S); return st.reason === 'mat'; })();
    E.unmakeMove(t.S);
    check('de straf is mat en slaat niets (' + E.moveKey(t.punish) + ')', mat && !slag);
  });

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
    /* alleen de materiaaltoets keurt hem af: langs twee halve zetten kost hij een pion, al wint een langere lijn er een */
    check('met alleen Pc3-b5: afgekeurd', E.checkPieceTask(taak(['c3b5'])) === null);
    check('de stand blijft onaangeroerd', E.toFEN(S) === fen);
    const t = E.trucTask(STUK_GOED);
    check(STUK_GOED + ': staat in de voorraad', typeof STUK_POOL !== 'undefined' && STUK_POOL.some(function (r) { return r.split('|').slice(0, 3).join('|') === STUK_GOED; }));
    check(STUK_GOED + ': goed', !!t && !!E.checkPieceTask(t));
    check('dezelfde stand zonder redding: afgekeurd', !!t && E.checkPieceTask(Object.assign({}, t, { answers: [] })) === null);
  });

  /* veilig verliest geen pion langs de lijn */
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

  /* fix list item 18 (de schaakcoach): een zet die mat in één toelaat is de duidelijkste valstrik; de straf is de matzet */
  regel('[5.3] Valstrik: een zet die mat in één toelaat is een valstrik, met de matzet als straf', function (check) {
    /* na Pf3-e1 is Dxh2 mat: langs de lijn gaat alleen de pion op h2 */
    const S = E.parseFEN('6k1/2b2ppp/3q4/8/8/5N2/PPP2PPP/3Q1RK1 w - - 0 1');
    E.clearTT();
    const l = E.lineAfter(S, zet(S, 'f3e1'), E.CHECK_NODES);
    check('testopzet: Dxh2 zet mat (' + l.material + ', ' + (l.reply && E.moveKey(l.reply)) + ')', l.material === -100 && l.mateNext);
    const t = E.checkSafeTask({ S: S, move: zet(S, 'f3e1'), trap: true });
    check('Pf3-e1 als valstrik: goed, met Dxh2 als straf (' + (t && t.punish && E.moveKey(t.punish)) + ')', !!t && !!t.punish && E.moveKey(t.punish) === 'd6h2' && t.mate === true);
    check('en als veilig afgekeurd', E.checkSafeTask({ S: S, move: zet(S, 'f3e1'), trap: false }) === null);
  });

  regel('[5.3] Veilig: een zet die mat in één toelaat is nooit veilig, ook als elke andere zet ook verliest', function (check) {
    /* de dame op f2 zet hoe dan ook mat: alleen de mat-in-één-toets houdt a2-a3 tegen */
    const S = E.parseFEN('4r1k1/8/8/8/8/8/P4q1P/7K w - - 0 1');
    check('a2-a3: niet veilig', E.checkSafeTask({ S: S, move: zet(S, 'a2a3'), trap: false }) === null);
    /* elke zet laat mat toe, ook de beste: dan is a2-a3 ook geen valstrik */
    check('a2-a3: ook geen valstrik', E.checkSafeTask({ S: S, move: zet(S, 'a2a3'), trap: true }) === null);
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
    /* de dame op d6 valt de toren op h2 aan, en een stuk zet zich ertussen */
    r = soort('6k1/8/3q4/8/7B/8/5P1R/5K2 w - - 0 1', 'h2', 'h4g3');
    check('Lg3 tussen dame en toren (' + JSON.stringify(r) + ')', r.kind === 'ertussen');
    r = soort('4r1k1/8/8/8/4N3/8/3P4/6K1 w - - 0 1', 'e4', 'd2d3');
    check('d3 dekt het paard: Txe4 kost Turbo de toren (' + JSON.stringify(r) + ')', r.kind === 'gedekt');
    r = soort('6k1/8/8/3p4/2P1N3/8/8/6K1 w - - 0 1', 'e4', 'c4d5');
    check('cxd5 slaat de aanvaller van het paard (' + JSON.stringify(r) + ')', r.kind === 'aanvaller' && r.took === 'pion');
  });

  /* goed is een antwoord of een zet die het potje meteen beëindigt, zoals de app oordeelt */
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

  /* remise als redding gooit een gewonnen stelling weg; ook een zet die
     geen antwoord is, want de app rekent een zet die het potje beëindigt goed */
  regel('[5.5] Koning ontsnapt: geen zet is remise terwijl wit een stuk of meer voor staat', function (check) {
    if (!check('er is een voorraad KONING_POOL', typeof KONING_POOL !== 'undefined' && KONING_POOL.length > 0)) return;
    const fout = KONING_POOL.filter(function (p) {
      const S = E.parseFEN(p.fen);
      if (E.material(S) < 300) return false;
      return E.legalMoves(S).some(function (m) {
        E.makeMove(S, m);
        const st = E.gameStatus(S);
        E.unmakeMove(S);
        return st.over && st.reason !== 'mat';
      });
    });
    check('geen (' + fout.length + (fout.length ? ', zoals ' + fout[0].fen : '') + ')', fout.length === 0);
  });

  /* de coach (K3): in deze zes scoort een foute zet ongeveer even goed als een antwoord; de tool houdt ze nu tegen */
  regel('[5.5] Koning ontsnapt: de zes puzzels waarin een foute zet bijna even goed is als het antwoord, staan niet in de voorraad', function (check) {
    if (!check('er is een voorraad KONING_POOL', typeof KONING_POOL !== 'undefined' && KONING_POOL.length > 0)) return;
    const borden = KONING_POOL.map(function (p) { return p.fen.split(' ')[0]; });
    for (const b of ['2k1r3/1r4p1/3bb2p/B2p1p2/P7/2p1PP1P/2P1RPB1/RK6', 'r1b1r1k1/pp3ppp/3p1n2/qNp5/5P2/4pQ2/PPP1B1PP/R3K2R',
      'r4rk1/p1p1nppp/1p6/3P1q2/1B2p3/3nPP1P/PP4BP/2RQK2R', '3r1rk1/p5pp/2bb4/2ppPpq1/3p4/P4BP1/1PPKPB1P/2RQR3',
      'r3k1nr/ppp2ppp/2nbb3/3p4/7q/2NPPP2/PPP2PBP/R1BQ1RK1', '2kr1b1r/pppb1ppp/2n5/3pp3/3Pn1Pq/2P1P2P/PPNBNP2/R2QKB1R']) {
      check(b + ' niet in de voorraad', borden.indexOf(b) < 0);
    }
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

  /* een type telt mee vanaf 15 geverifieerde puzzels */
  /* het stuk dat de vork of penning maakt, wordt meteen geslagen en iets anders wint */
  regel('[5.1] een vork of penning waarvan het stuk meteen geslagen wordt, staat niet als vork of penning in de voorraad', function (check) {
    if (!check('er is een voorraad TRUC_POOL', typeof TRUC_POOL !== 'undefined' && Array.isArray(TRUC_POOL))) return;
    const typeVan = function (bord) { const r = TRUC_POOL.find(function (x) { return x.split('|')[0] === bord; }); return r ? r.split('|')[1] : null; };
    /* r1b1k2r/1ppp1ppp/p1nbq2n/3NN3/... stond hier ook; die regel is weg, zie de test hieronder */
    for (const b of ['1rb1k2r/1pp1bpp1/p2pn2p/3n1q2/3PN3/3BPN2/PPP1QPPP/3RR1K1 w', '2kr3r/ppp2pRp/2qbb3/3Nn3/8/4PB2/PPP1QP1P/1RB1K3 w',
      'r1b2rk1/ppp2ppp/6n1/2nqp1B1/3pN3/3P1Q2/PPP1PNPP/3RKB1R w',
      'r1b2rk1/ppp2ppp/n2bp3/7q/3BpnN1/3P4/PPPNBPPP/2RQ1K1R w']) {
      check(b + ': een aftrekaanval (' + typeVan(b) + ')', typeVan(b) === 'aftrek');
    }
    for (const b of ['3rk2r/1ppq1ppp/p3b3/4bn1Q/2B1P3/2N1B2P/PPP2PPn/1R2K1NR w', '4r1kr/1ppbqppp/p1nn4/3pN3/1b1P1P2/4PB2/PPPQ2PP/R1B1R1K1 w',
      '1rb2qkr/1pp2ppp/p1Nb1n2/Q1nP4/5B2/N2P4/PPP2PPP/1K2RB1R w', '3q1k1r/rpp1bppp/4bn2/3Pp3/1n6/1B1Q1N2/PPPPKPPP/R1B4R w',
      'r1b1kb1r/p1pq1ppp/4pn2/1Q1p1n2/1p1PP3/1B3N2/PPP1NPPP/R1B1K2R w']) {
      check(b + ': niet in de voorraad (' + typeVan(b) + ')', typeVan(b) === null);
    }
  });

  /* de schaakcoach na het eerste deel: de truc die de uitleg noemt is niet wat wint, of een andere zet
     die ook de truc is, staat binnen anderhalf punt van het antwoord */
  regel('[5.1] een truc die niet wint, of waar een andere zet met dezelfde truc bijna even goed is, staat niet in de voorraad', function (check) {
    if (!check('er is een voorraad TRUC_POOL', typeof TRUC_POOL !== 'undefined' && Array.isArray(TRUC_POOL))) return;
    const typeVan = function (bord) { const r = TRUC_POOL.find(function (x) { return x.split('|')[0] === bord; }); return r ? r.split('|')[1] : null; };
    for (const b of ['r1bqk1r1/pppp2p1/n6p/3Qbp2/5B2/2P1P3/P1P2PPP/R3KB1R w', 'r1b1k2r/p1p2p1p/2pbqp2/8/3p1B2/2P2Q2/PP2NPPP/R3K2R w',
      '2kr3r/ppp1bppp/3pqn2/4p1B1/3nP1b1/2N2N2/PPP1BPPP/R2Q2KR w', '1r2k1nr/1pp1bpp1/p1bqp2p/3pN3/3PP3/2N2Q2/PPPB1PPP/2R1R1K1 w',
      'r1b1k2r/1ppp1ppp/p1nbq2n/3NN3/2BPPP2/4B3/PPP3PP/2RQK2R w', 'r1b1kb1r/pppn1pp1/3p1q1p/n2Pp3/2B5/2NQPN2/PPPB1PPP/R3K2R w',
      /* twee vorken die echt zijn, maar het materiaal valt op een veld dat de vork niet raakt; en een aftrekaanval
         die gewoon een paard slaat dat hangt */
      'r1b1k2r/pppp1ppp/2nb1q2/3P4/4p3/2P1PN2/PP1NP1PP/R2QKB1R w', '1r1qkb1r/1pp1ppp1/p1n1bn1p/1N6/3pPB2/3P1N2/PPPQBPPP/R3K2R w',
      '2kr1b1r/ppp1qppp/3p4/4pb2/3nn3/P2P1N2/1PPQPPPP/1RBK1BR1 w']) {
      check(b + ': niet in de voorraad (' + typeVan(b) + ')', typeVan(b) === null);
    }
    const per = {};
    TRUC_POOL.forEach(function (r) { const t = r.split('|')[1]; per[t] = (per[t] || 0) + 1; });
    check('vork 139, penning 57, spies 31, aftrekaanval 31 (' + JSON.stringify(per) + ')', per.vork === 139 && per.penning === 57 && per.spies === 31 && per.aftrek === 31);
  });

  /* een vork die ook mat is, heet in de app "Dit was mat": in de voorraad heeft geen truc een mat in een */
  regel('[5.1] geen vork, penning, spies of aftrekaanval in de voorraad staat ook mat in een', function (check) {
    if (!check('er is een voorraad TRUC_POOL', typeof TRUC_POOL !== 'undefined' && Array.isArray(TRUC_POOL))) return;
    const met = TRUC_POOL.filter(function (r) {
      if (['vork', 'penning', 'spies', 'aftrek'].indexOf(r.split('|')[1]) < 0) return false;
      const t = E.trucTask(r);
      return !t || E.matingMoves(t.S, 1).length > 0;
    });
    check('geen enkele (' + met.slice(0, 3).join(' / ') + ')', met.length === 0);
  });

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

  /* de coach (R2): Dg5-h4 redt de dame, maar na ...g5 en ...g4 is het paard op h3 weg; voorbij de lijn van twee halve zetten */
  regel('[5.9] Red je stuk: de opdracht waarin een redding drie zetten later het paard kost, staat niet in de voorraad', function (check) {
    if (!check('er is een voorraad STUK_POOL', typeof STUK_POOL !== 'undefined' && Array.isArray(STUK_POOL))) return;
    check('niet in de voorraad', !STUK_POOL.some(function (r) { return r.split('|')[0] === '1rbqk1r1/1ppp1ppp/p2bnn2/4p1Q1/4P3/2NB3N/PPPP1PPP/R1B1R1K1 w'; }));
  });

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

  /* de vijf toetsen van de coach met het budget van de voorraad; bij een ander budget valt een goede regel soms net buiten de marge van 50 */
  regel('[5.9] een steekproef van twee uit de Red je stuk-voorraad: de vijf toetsen houden bij 300.000 knopen, ook het stuk is te redden en elke redding verliest geen pion', function (check) {
    if (!check('er is een voorraad STUK_POOL', typeof STUK_POOL !== 'undefined' && Array.isArray(STUK_POOL))) return;
    if (!knoopbudget(check)) return;
    const rng = vast(20261113), van = STUK_POOL.slice();
    for (let i = 0; i < 2 && van.length; i++) {
      const regel = van.splice(Math.floor(rng() * van.length), 1)[0];
      const t = E.trucTask(regel);
      check(regel + ': de vijf toetsen bij 300.000 knopen', !!t && !!E.checkPieceTask(t, 300000));
    }
  });

  /* De generatoren die live blijven, op vaste zaden. Op deze Mac onder een
     seconde per opdracht; de echte maat is een paar seconden onder de 6x
     vertraging in Chromium (gemeten in de review, ux-run/reviews/inc5/snelheid.md). */
  /* Geteld in knopen, niet in milliseconden: zo meet de test de code en niet
     hoe druk de machine is. Onder de 6x vertraging zoekt Chromium ongeveer
     40.000 knopen per seconde (snelheid.md: 50.000 knopen in 1,2 s), dus
     120.000 knopen is zo'n drie seconden. */
  /* fix list item 27: de negen zaden die bij 200 per soort meer dan 160.000 posities zochten (snelheid.md); onder de 6x vertraging is 160.000 zo'n vier seconden */
  regel('[5.9] Veilig of valstrik zoekt per opdracht hoogstens 160.000 posities, ook bij de zwaarste zaden', function (check) {
    for (const [trap, zaad] of [[false, 182137], [false, 665196], [true, 1227446], [true, 182138], [false, 1393744], [true, 997795],
      [false, 871090], [false, 688953], [true, 237571]]) {
      const n0 = E.nodesSearched(), t = E.genSafeTask(trap, vast(zaad)), n = E.nodesSearched() - n0;
      check((trap ? 'valstrik' : 'veilig') + ' zaad ' + zaad + ': ' + n + ' posities', n <= 160000);
      check((trap ? 'valstrik' : 'veilig') + ' zaad ' + zaad + ': niets, of een opdracht van de gevraagde soort', t === null || t.trap === trap);
    }
  });

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

  /* drie beginstellingen met zwart aan zet */
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

  /* de reviewer, ronde 2 op 5a832a6 (bevindingen 9 en 10) */
  regel('[5.8] sleutelmoment: wie zelf naar een ongedekt veld gaat, liet geen verdediger weggaan; een verdediger die bleef staan ging niet weg; terugslaan elders is geen ruil; 2 punten minder is niets gemist', function (check) {
    const moment = function (fen, k) { const S = E.parseFEN(fen); return E.moveMoment(S, zet(S, k)); };
    for (const [fen, k, stuk, het] of [['4k3/8/8/3p4/8/2N5/8/4K3 w - - 0 1', 'c3e4', 'paard', 'het'],
      ['4r1k1/8/8/8/8/8/3B4/6K1 w - - 0 1', 'd2e3', 'loper', 'de'], ['4k3/8/2p5/8/8/8/8/3QK3 w - - 0 1', 'd1d5', 'dame', 'de']]) {
      const m = moment(fen, k);
      check(k + ': ' + het + ' ' + stuk + ' hangt, zonder verdediger (' + JSON.stringify(m) + ')',
        !!m && m.kind === 'hang' && m.piece === stuk && m.defender === null && m.moved === false);
    }
    const j = E.keyMoment(speel(E.newGame(), ['g1f3', 'e7e6', 'f3g5', 'd8g5', 'd2d4']));
    check('1.Pf3 e6 2.Pg5 Dxg5: zonder verdediger (' + JSON.stringify(j) + ')', !!j && j.kind === 'hang' && j.defender === null && j.moved === false);
    /* de loper zet zich op e3 tussen de toren op e1 en het paard op e5 */
    let m = moment('4r1k1/8/8/4N3/8/8/8/2B1R1K1 w - - 0 1', 'c1e3');
    check('Le3: de toren dekte het paard en bleef staan (' + JSON.stringify(m) + ')',
      !!m && m.kind === 'hang' && m.piece === 'paard' && m.defender === 'toren' && m.moved === false);
    /* Dxd5 laat de toren op a1 alleen; Txa1+ is voor Turbo beter dan cxd5 */
    m = moment('r3k3/8/2p5/3p4/8/8/8/R2QK3 w - - 0 1', 'd1d5');
    check('Dxd5, Txa1+: geen ruil maar de toren die de dame dekte (' + JSON.stringify(m) + ')',
      !!m && m.kind === 'hang' && m.sq === 'a1' && m.piece === 'toren' && m.defender === 'dame' && m.moved === true);
    /* een pion slaan terwijl een paard vrij staat: 2 punten minder, onder de grens van 2,5 */
    m = moment('1k6/8/8/7p/n7/8/8/3Q2K1 w - - 0 1', 'd1h5');
    check('Dxh5 naast het vrije paard op a4: geen moment (' + JSON.stringify(m) + ')', m === null);
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
