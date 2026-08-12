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
    const m = E.pickMove(S, lvl);
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

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
