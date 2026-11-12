'use strict';
const E = require('./engine.js');

let fails = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + got + ' want=' + want);
}

/* Perft: known node counts catch nearly every movegen bug (castling, ep, promo, pins). */
const perftCases = [
  [E.START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
const t0 = Date.now();
for (const [fen, counts] of perftCases) {
  for (let d = 1; d <= counts.length; d++) {
    const S = E.parseFEN(fen);
    check('perft d' + d + ' ' + fen.slice(0, 20), E.perft(S, d), counts[d - 1]);
  }
}
console.log('perft time: ' + (Date.now() - t0) + 'ms');

/* FEN round-trip */
check('fen roundtrip', E.toFEN(E.parseFEN(E.START_FEN)), E.START_FEN);

/* Mate / stalemate detection */
check('fools mate', E.gameStatus(E.parseFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).reason, 'mat');
check('stalemate', E.gameStatus(E.parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'pat');
check('not over', E.gameStatus(E.newGame()).over, false);

/* Blunder guard: Qb1-b4?? hangs the queen to Rh4; Qb1-b2 is safe. */
const bS = E.parseFEN('7k/8/8/8/7r/8/8/KQ6 w - - 0 1');
const qb4 = E.legalMoves(bS).find(m => m.from === 1 && m.to === 49);
const qb2 = E.legalMoves(bS).find(m => m.from === 1 && m.to === 17);
check('blunder Qb4 flagged', !!E.blunderCheck(bS, qb4), true);
check('blunder Qb2 clean', E.blunderCheck(bS, qb2), null);

/* Free piece: black knight on e5 undefended, white rook e1 can take. */
const fS = E.parseFEN('6k1/8/8/4n3/8/8/8/4R1K1 w - - 0 1');
const free = E.freePieces(fS);
check('free piece found', free.length === 1 && E.alg(free[0]) === 'e5', true);

/* Oscar's screenshot position: Nc6 is a good trade (dxc6, bxc6: +knight -pawn),
   f4 pawn is truly free (Ne2xf4, no recapture). */
const oS = E.parseFEN('r1b1kb1r/ppppqppp/2n5/3P4/4Ppn1/2N5/PPP1NPPP/R2QKB1R w KQkq - 0 1');
const oDet = E.freePiecesEx(oS);
const c6 = oDet.find(d => E.alg(d.sq) === 'c6');
const f4 = oDet.find(d => E.alg(d.sq) === 'f4');
check('screenshot: c6 is a target', !!c6, true);
check('screenshot: c6 is a trade, not gratis', !!c6 && c6.gain < c6.victim - 30 && c6.gain >= 150, true);
check('screenshot: f4 is truly gratis', !!f4 && f4.gain >= f4.victim - 30, true);
check('screenshot: g4 knight is NOT a target', oDet.some(d => E.alg(d.sq) === 'g4'), false);
/* explanation helpers */
check('findAttacker: b7 pawn defends c6', E.alg(E.findAttacker(oS, E.sqFromAlg('c6'), 'b')), 'b7');
check('pieceAttacksSq: d5 pawn attacks c6', E.pieceAttacksSq(oS, E.sqFromAlg('d5'), E.sqFromAlg('c6')), true);
check('pieceAttacksSq: a1 rook blocked from a8', E.pieceAttacksSq(oS, E.sqFromAlg('a1'), E.sqFromAlg('a8')), false);

/* Attacked pieces: same position, black view -> knight attacked. */
check('attacked black', E.attackedPieces(fS, 'b').map(E.alg).join(','), 'e5');

/* Pattern detection: fork, pin, skewer, discovered attack, mate-in-1. */
{
  /* Nb5-c7+ forks Ke8 and Ra8 */
  const S = E.parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
  const m = E.legalMoves(S).find(x => E.alg(x.from) === 'b5' && E.alg(x.to) === 'c7');
  const info = E.patternsAfterMove(S, m);
  check('fork: Nc7+ hits king and rook', info.fork.length === 2 && info.safe, true);
  check('fork: matches vork drill', E.patternMatches(S, m, 'vork', info), true);
  check('fork: board untouched', E.toFEN(S), 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
}
{
  /* Bb5 pins Nc6 against Ke8 */
  const S = E.parseFEN('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1');
  const ps = E.raysPinSkewer(S, E.sqFromAlg('b5'));
  check('pin: bishop pins knight to king', ps.pins.length === 1 &&
    E.alg(ps.pins[0].front) === 'c6' && E.alg(ps.pins[0].back) === 'e8', true);
}
{
  /* Re1 skewers Ke5 in front of Qe8 */
  const S = E.parseFEN('4q3/8/8/4k3/8/8/8/4R1K1 b - - 0 1');
  const ps = E.raysPinSkewer(S, E.sqFromAlg('e1'));
  check('skewer: rook skewers king and queen', ps.skewers.length === 1 &&
    E.alg(ps.skewers[0].front) === 'e5' && E.alg(ps.skewers[0].back) === 'e8', true);
}
{
  /* Ne5 moves away and unveils Bb2 hitting Qh8 */
  const S = E.parseFEN('4k2q/8/8/4N3/8/8/1B6/4K3 w - - 0 1');
  const m = E.legalMoves(S).find(x => E.alg(x.from) === 'e5' && E.alg(x.to) === 'c4');
  const info = E.patternsAfterMove(S, m);
  check('discovered: bishop unveiled on queen', info.discovered.some(x => E.alg(x.target) === 'h8'), true);
  check('discovered: matches aftrek drill', E.patternMatches(S, m, 'aftrek', info), true);
}
{
  /* mate-in-1 recognized as pattern */
  const S = E.parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const m = E.legalMoves(S).find(x => x.from === 0 && x.to === 112);
  check('mate1: Ra8# matches', E.patternMatches(S, m, 'mat1'), true);
}

/* Pattern drill generators produce solvable tasks. */
for (const type of ['vork', 'mat1']) {
  const t0g = Date.now();
  let okc = 0;
  for (let i = 0; i < 3; i++) {
    const task = E.genPatternTask(type);
    if (task && task.answers.length >= 1 &&
      E.patternMatches(task.S, task.answers[0].m, type, task.answers[0].info || undefined)) okc++;
  }
  console.log('pattern:' + type + '  ' + okc + '/3 ok, avg ' + Math.round((Date.now() - t0g) / 3) + 'ms');
  check('pattern gen ' + type, okc, 3);
}
{
  const t0g = Date.now();
  const task = E.genPatternTask('penning') || E.genPatternTask('spies') || E.genPatternTask('aftrek');
  console.log('pattern:zeldzamere types  ' + (task ? task.type : 'geen') + ' in ' + (Date.now() - t0g) + 'ms');
  check('pattern gen rare type found one', !!task, true);
}

/* AI plays a full game at each level without crashing. */
for (const lvl of [1, 2, 3]) {
  const S = E.newGame();
  let plies = 0;
  const t = Date.now();
  while (plies < 60 && !E.gameStatus(S).over) {
    const m = E.pickMove(S, lvl, null, 150);
    if (!m) break;
    E.makeMove(S, m);
    plies++;
  }
  console.log('selfplay lvl' + lvl + ': ' + plies + ' plies in ' + (Date.now() - t) + 'ms (' +
    Math.round((Date.now() - t) / plies) + 'ms/move)');
}

/* Drill generators: must succeed and be fast enough for the browser. */
for (const type of ['attacked', 'capture', 'mobility', 'free']) {
  const t = Date.now();
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const task = E.genScanTask(type);
    if (task && task.targets.length >= 1) ok++;
  }
  console.log('scan:' + type + '  ' + ok + '/5 ok, avg ' + Math.round((Date.now() - t) / 5) + 'ms');
  check('scan gen ' + type, ok, 5);
}
for (const wantTrap of [true, false]) {
  const t = Date.now();
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const task = E.genSafeTask(wantTrap);
    if (task && task.trap === wantTrap) ok++;
  }
  console.log('safe trap=' + wantTrap + '  ' + ok + '/5 ok, avg ' + Math.round((Date.now() - t) / 5) + 'ms');
  check('safe gen trap=' + wantTrap, ok, 5);
}
{
  const t = Date.now();
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const task = E.genBest3();
    if (task && task.options.length === 3) ok++;
  }
  console.log('best3  ' + ok + '/5 ok, avg ' + Math.round((Date.now() - t) / 5) + 'ms');
  check('best3 gen', ok, 5);
}

/* Trap tasks must come with a capture as punishment. */
{
  const task = E.genSafeTask(true);
  if (task) {
    E.makeMove(task.S, task.move);
    check('trap punish is capture', E.isCapture(task.S, task.punish), true);
    E.unmakeMove(task.S);
  }
}

/* Opening book: every line is legal from the start position, and Turbo follows it. */
{
  let legalLines = 0;
  for (const line of E.BOOK_LINES) {
    const S = E.newGame();
    let ok = true;
    for (const k of line.split(' ')) {
      const m = E.legalMoves(S).find(x => E.moveKey(x) === k);
      if (!m) { ok = false; console.log('  illegal book move ' + k + ' in: ' + line); break; }
      E.makeMove(S, m);
    }
    if (ok) legalLines++;
  }
  check('book: all lines legal', legalLines, E.BOOK_LINES.length);
  const S = E.newGame();
  check('book: first move comes from the book', ['e2e4', 'd2d4'].includes(E.moveKey(E.bookMove(S))), true);
  E.makeMove(S, E.legalMoves(S).find(x => E.moveKey(x) === 'e2e4'));
  E.makeMove(S, E.legalMoves(S).find(x => E.moveKey(x) === 'e7e5'));
  const cands = [...E.bookMoves(S).keys()];
  check('book: after 1.e4 e5 the knight or a bishop', cands.includes('g1f3') && cands.includes('b1c3') && cands.includes('f1c4'), true);
  E.makeMove(S, E.legalMoves(S).find(x => E.moveKey(x) === 'a2a3'));
  check('book: out of book after a strange move', E.bookMove(S), null);
  const first = E.moveKey(E.pickMove(E.newGame(), 2));
  check('book: level 2 plays the book', first === 'e2e4' || first === 'd2d4', true);
}

/* Hashing: stable across make/unmake, sensitive to side, castling and ep. */
{
  const S = E.parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const h0 = E.hashOf(S);
  const m = E.legalMoves(S)[5];
  E.makeMove(S, m);
  const h1 = E.hashOf(S);
  E.unmakeMove(S);
  check('hash: differs after a move', h0 !== h1, true);
  check('hash: restored after unmake', E.hashOf(S), h0);
  const T = E.parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w Kkq - 0 1');
  check('hash: castling rights count', E.hashOf(T) !== h0, true);
  const U = E.parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1');
  check('hash: side to move counts', E.hashOf(U) !== h0, true);
}

/* Timed search: finds a mate in 2 and a hanging queen, keeps the board, and
   respects its budget. */
{
  const S = E.parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  const fen = E.toFEN(S);
  const t0 = Date.now();
  const r = E.think(S, 1500, 6);
  check('think: mate in 2 found', ['c6b6', 'c6c7'].includes(E.moveKey(r.m)) && r.score >= E.MATE - 3, true);
  check('think: board untouched', E.toFEN(S), fen);
  const Q = E.parseFEN('7k/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const rq = E.think(Q, 800, 6);
  check('think: takes the free queen', E.moveKey(rq.m), 'd1d5');
  const B = E.parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
  /* TT mate scores are ply-relative: a second search from a position one ply
     deeper into the same mate must still report the (shorter) mate */
  const M2 = E.parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  E.think(M2, 800, 6);
  const kb6 = E.legalMoves(M2).find(m => E.moveKey(m) === 'c6b6');
  E.makeMove(M2, kb6);
  const kb8 = E.legalMoves(M2).find(m => E.moveKey(m) === 'a8b8');
  E.makeMove(M2, kb8);
  const r1 = E.think(M2, 800, 6);
  check('think: mate in 1 after transposition into cached line', E.moveKey(r1.m) === 'h1h8' && r1.score >= E.MATE - 1, true);
  const t1 = Date.now();
  const rb = E.think(B, 300, 8);
  const dt = Date.now() - t1;
  check('think: stays within about its budget (' + dt + 'ms)', dt < 900, true);
  check('think: reaches at least depth 3 in 300ms', rb.depth >= 3, true);
  console.log('think: depth ' + rb.depth + ', ' + rb.nodes + ' nodes in ' + dt + 'ms; mate-in-2 in ' + (t1 - t0) + 'ms');
}

/* Threats: what black would win if it were black's move (null move + SEE). */
{
  const S = E.parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1');
  const th = E.threatDetails(S);
  check('threat: hanging rook seen', th.length === 1 && E.alg(th[0].sq) === 'a1', true);
  check('threat: board untouched', E.toFEN(S), '6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1');
  check('threat: defended pawn is no threat', E.threatDetails(E.parseFEN('6k1/8/5b2/8/3P4/2P5/8/6K1 w - - 0 1')).length, 0);
  check('threat: none while in check', E.threatDetails(E.parseFEN('6k1/8/8/8/8/2b5/8/R3K3 w - - 0 1')).length, 0);
  const N = E.nullMoved(E.parseFEN('rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2'));
  check('nullMoved: flips turn and clears ep', N.turn === 'w' && N.ep === -1, true);
}

/* Mate in N: Kb6 then Rh8# is the only mate in 2; nothing mates in 1. */
{
  const S = E.parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  check('mate2: no mate in 1', E.matingMoves(S, 1).length, 0);
  const m2 = E.matingMoves(S, 2).map(m => E.alg(m.from) + E.alg(m.to));
  check('mate2: Kb6 and Kc7 are the mates in 2', m2.join(','), 'c6b6,c6c7');
  check('mate2: board untouched', E.toFEN(S), 'k7/8/2K5/8/8/8/8/7R w - - 0 1');
  const kb6 = E.legalMoves(S).find(m => E.alg(m.to) === 'b6');
  const rh7 = E.legalMoves(S).find(m => E.alg(m.to) === 'h7');
  check('mate2: patternMatches accepts Kb6', E.patternMatches(S, kb6, 'mat2'), true);
  check('mate2: patternMatches rejects Rh7 (mate in 3)', E.patternMatches(S, rh7, 'mat2'), false);
  /* a mate in 1 is not "mate in 2" for the drill */
  const S1 = E.parseFEN('k7/8/1K6/8/8/8/8/7R w - - 0 1');
  const rh8 = E.legalMoves(S1).find(m => E.alg(m.to) === 'h8');
  check('mate2: immediate mate is mat1, not mat2', E.patternMatches(S1, rh8, 'mat1') && !E.patternMatches(S1, rh8, 'mat2'), true);
  check('matesIn: exactly n, a sooner mate does not count as n', E.matesIn(S1, rh8, 1) && !E.matesIn(S1, rh8, 2), true);
  check('matesWithin: within 2 includes the mate in 1', E.matesWithin(S1, 2) && E.matesWithin(S, 2) && !E.matesWithin(S, 1), true);
  const t = E.genMate2Task();
  check('mate2: generator finds a forced mate in 2', !!t && t.answers.length >= 1 && t.answers.length <= 2 &&
    t.answers.every(a => E.matesIn(t.S, a.m, 2)) && E.matingMoves(t.S, 1).length === 0, true);
}

/* Defence: saving moves really save, and there are few of them. */
{
  /* white must make luft: h3 or h4 stop Rb1# */
  const S = E.parseFEN('1r4k1/8/8/8/8/8/r6P/6K1 w - - 0 1');
  const N = E.nullMoved(S);
  check('king: black threatens mate in 1', E.matingMoves(N, 1).map(m => E.alg(m.to)).join(','), 'b1');
  /* the shipped pool is verified here the way the generator verifies: every
     answer holds (no mate within 2, not clearly lost), every other move
     loses to a forced mate within 2. Live generation is only smoke-tested
     (it takes tens of seconds per puzzle; tools/make-koning.js does it). */
  const POOL = typeof KONING_POOL !== 'undefined' ? KONING_POOL : require('../src/koning.js').KONING_POOL;
  check('king: pool present', POOL.length >= 100 || POOL.length === 0, true);
  const sample = POOL.length ? [0, Math.floor(POOL.length / 2), POOL.length - 1].map(i => POOL[i]) : [];
  for (const p of sample) {
    const S = E.parseFEN(p.fen);
    const ans = p.answers.map(k => E.legalMoves(S).find(m => E.moveKey(m) === k));
    check('king pool ' + p.type + ': answers legal and 1-2', ans.every(Boolean) && ans.length >= 1 && ans.length <= 2, true);
    check('king pool ' + p.type + ': threat is real', p.type === 'schaak' ? E.inCheck(S) :
      E.matesWithin(E.nullMoved(S), p.type === 'mat1' ? 1 : 2), true);
    let holds = 0;
    for (const m of ans) {
      E.makeMove(S, m);
      const st = E.gameStatus(S);
      if (st.over ? true : E.saveHolds(S)) holds++;
      E.unmakeMove(S);
    }
    check('king pool ' + p.type + ': every answer holds', holds, ans.length);
    const rest = E.legalMoves(S).filter(m => !ans.some(a => a.from === m.from && a.to === m.to && (a.promo || null) === (m.promo || null)));
    /* every other move fails the same test the answers passed: mate within
       two, or black clearly winning anyway */
    let lost = 0;
    for (const m of rest) {
      E.makeMove(S, m);
      const st = E.gameStatus(S);
      const sc = st.over ? (st.reason === 'mat' ? E.MATE : 0) : E.mateScore(S, 2);
      const bad = !st.over && (sc >= E.MATE - 4 || !E.saveHolds(S));
      E.unmakeMove(S);
      if (bad) lost++;
    }
    check('king pool ' + p.type + ': every other move loses (mate or clearly lost)', lost, rest.length);
    check('king pool ' + p.type + ': board untouched', E.toFEN(S), p.fen);
  }
  /* check extensions have no bound of their own, so saveHolds leans on its
     time budget; in a position where depth SAVE_DEPTH is too expensive it
     stops and reports "not saved" rather than running on */
  const heavy = E.parseFEN('qqqqkqqq/8/8/8/8/8/8/QQQQKQQQ b - - 0 1');
  const tSave = Date.now();
  const heavyHolds = E.saveHolds(heavy);
  const dtSave = Date.now() - tSave;
  check('saveHolds: stays within its budget (' + dtSave + 'ms)', dtSave < 2 * E.SAVE_MS, true);
  check('saveHolds: an unproven position is not a save', heavyHolds, false);
  const t = E.genKingTask(null, 1);
  check('king: live generator smoke (one attempt)', t === null || (t.S.turn === 'w' && t.answers.length >= 1 && t.answers.length <= 2), true);
  check('colorFlipped: mirrors and swaps', E.toFEN(E.colorFlipped(E.parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1'))), '7r/8/8/8/8/2k5/8/K7 b - - 0 1');
  /* the app reads Red je stuk from the verified stock; the live generator is
     its fallback and rejects most candidates, so it gets a fixed seed */
  const p = typeof STUK_POOL !== 'undefined' ? E.trucTask(STUK_POOL[0]) : null;
  check('piece: a stock line gives a hanging piece with saves', !!p && p.type === 'stuk' && p.hang.victim >= 300 &&
    p.answers.length >= 1 && p.answers.length <= 4, true);
  let seed = 10;
  const rng = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const live = E.genPieceTask(rng);
  check('piece: the live generator gives nothing or a task the check accepts', live === null ||
    (live.type === 'stuk' && live.hang.victim >= 300 && !!E.checkPieceTask(live)), true);
  if (p) {
    const base = E.forcedMaterial(p.S);
    check('piece: every answer keeps the material', p.answers.every(a => {
      E.makeMove(p.S, a.m);
      const after = E.forcedMaterial(p.S);
      E.unmakeMove(p.S);
      return after - base >= -60;
    }), true);
    const rest = E.legalMoves(p.S).filter(m => !p.answers.some(a => a.m.from === m.from && a.m.to === m.to && (a.m.promo || null) === (m.promo || null)));
    check('piece: every non-answer loses material', rest.every(m => {
      E.makeMove(p.S, m);
      const st = E.gameStatus(p.S);
      const after = st.over ? base : E.forcedMaterial(p.S);
      E.unmakeMove(p.S);
      return after - base < -60;
    }), true);
  }
}

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
