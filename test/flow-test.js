/* End-to-end UI flow tests, headless. Loaded after dom-shim + engine + ui-only. */
var fails = 0;
function ok(name, cond) {
  if (!cond) fails++;
  print((cond ? 'PASS' : 'FAIL') + '  ' + name);
}

/* init already ran at load; name modal should be open (no stored name) */
ok('init: name modal open', !__els.overlay.classList.contains('hidden'));
P.name = 'Testkind'; closeModal();

/* ---------- scan drill: 5 perfect rounds ---------- */
var xp0 = P.xp, stars0 = P.stars;
startDrill('scan');
drainTimers();
ok('scan: task built', !!(session && session.task && session.task.targets.length >= 1));
var rounds = 0;
while (session && session.kind === 'scan' && session.round <= 5 && rounds < 10) {
  rounds++;
  ok('scan r' + session.round + ': marking phase', session.phase === 'marking');
  session.task.targets.forEach(sq => BD.marks.add(sq));
  scanCheck();
  ok('scan r' + session.round + ': 3 stars awarded', session.phase === 'review');
  nextRound();
  drainTimers();
}
ok('scan: summary modal', __els.modalBox.innerHTML.indexOf('Rondje klaar') >= 0);
ok('scan: 15 stars earned', P.stars - stars0 === 15);
ok('scan: xp increased 150', P.xp - xp0 === 150);
closeModal();

/* ---------- scan explanations: Oscar's screenshot scenario ---------- */
startDrill('scan');
drainTimers();
var oFen = 'r1b1kb1r/ppppqppp/2n5/3P4/4Ppn1/2N5/PPP1NPPP/R2QKB1R w KQkq - 0 1';
var oS = parseFEN(oFen);
var oDet = freePiecesEx(oS);
session.S = oS;
session.task = { S: oS, type: 'free', targets: oDet.map(function (d) { return d.sq; }),
  extra: null, details: oDet };
session.phase = 'marking';
BD.marks.clear();
BD.marks.add(sqFromAlg('f4'));   /* found the free pawn */
BD.marks.add(sqFromAlg('g4'));   /* wrong: knight nobody can capture */
/* c6 (good trade) is missed */
scanCheck();
var explHtml = __els.taskBox.innerHTML;
ok('expl: missed c6 explained as trade', explHtml.indexOf('goede ruil') >= 0);
ok('expl: mentions capturing pawn d5', explHtml.indexOf('pion op d5') >= 0);
ok('expl: wrong g4 explained (not capturable)', explHtml.indexOf('geen enkel wit stuk') >= 0);
ok('expl: points math 3 vs 1', explHtml.indexOf('3 punten') >= 0 && explHtml.indexOf('1 punt') >= 0);

/* attacked-type explanations */
var aS = parseFEN('6k1/6b1/8/8/8/8/1P6/R5K1 w - - 0 1'); /* Bg7 attacks Ra1 via long diagonal? b2 blocks: no. Use rook attacked by bishop directly */
aS = parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1'); /* Bc3 attacks a1 rook */
session.S = aS;
session.task = { S: aS, type: 'attacked', targets: attackedPieces(aS, 'w'), extra: null, details: null };
session.phase = 'marking';
BD.marks.clear(); /* miss everything */
scanCheck();
explHtml = __els.taskBox.innerHTML;
ok('expl: attacked names attacker', explHtml.indexOf('loper op c3') >= 0);

/* ---------- safe drill: one correct, one wrong ---------- */
startDrill('safe');
drainTimers();
ok('safe: task built', !!(session.task && typeof session.task.trap === 'boolean'));
var earnedBefore = session.earned;
safeAnswer(session.task.trap);
drainTimers();
ok('safe: correct scores 3', session.earned - earnedBefore === 3);
ok('safe: review phase', session.phase === 'review');
nextRound();
drainTimers();
earnedBefore = session.earned;
safeAnswer(!session.task.trap);
drainTimers();
ok('safe: wrong scores 0', session.earned === earnedBefore);
ok('safe: review phase after wrong', session.phase === 'review');

/* ---------- best3 drill ---------- */
startDrill('best3');
drainTimers();
ok('best3: task built', !!(session.task && session.task.options.length === 3));
var bi = session.task.options.indexOf(session.task.best);
var wi = (bi + 1) % 3;
pickOption(wi);
ok('best3: option picked', session.picked === wi);
best3Confirm();
drainTimers();
ok('best3: back to choose after wrong', session.phase === 'choose');
ok('best3: board restored', session.S.hist.length === 0);
pickOption(bi);
best3Confirm();
drainTimers();
ok('best3: correct on 2nd try = 1 star', session.earned === 1 && session.phase === 'review');
/* wrong-wrong -> auto reveal */
nextRound();
drainTimers();
bi = session.task.options.indexOf(session.task.best);
var w1 = (bi + 1) % 3, w2 = (bi + 2) % 3;
earnedBefore = session.earned;
pickOption(w1); best3Confirm(); drainTimers();
pickOption(w2); best3Confirm(); drainTimers();
ok('best3: auto-reveal after 2 wrong', session.phase === 'review' && session.earned === earnedBefore);

/* ---------- game: predict, guard, mate ---------- */
startGame(2);
ok('game: started, white to move', session.kind === 'game' && session.S.turn === 'w');
P.guard = false; P.predict = false;
/* kid plays e2-e4 via board clicks; no predict, Turbo replies by himself */
onCell(20); /* e2 */
ok('game: pawn selected', BD.sel === 20 && BD.dots.has(52));
onCell(52); /* e4 */
drainTimers();
ok('game: turbo replied', session.S.hist.length === 2 && session.S.turn === 'w');
/* predict window, driven directly: correct guess pays out */
var pm = pickMove(session.S, 2);
askPredict(pm);
ok('predict: bar shown, timer armed', BD.mode === 'predict' &&
  !!session.pending && !!session.predictTimer);
var xpBefore = P.xp;
resolvePredict(pm.from); /* correct prediction */
ok('predict: bonus +15', P.xp - xpBefore >= 15);
ok('predict: bar hidden again', __els.predictBar.classList.contains('hidden'));
/* predict timeout: no tap needed, the move plays by itself, no bonus */
var pm2 = pickMove(session.S, 2);
var hBefore = session.S.hist.length;
var xpB2 = P.xp;
askPredict(pm2);
drainTimers(); /* fires the window timeout -> auto-resolve */
ok('predict: timeout auto-plays, no bonus', session.S.hist.length === hBefore + 1 && P.xp === xpB2);
/* double-resolve is harmless */
resolvePredict(0);
ok('predict: double resolve is a no-op', session.S.hist.length === hBefore + 1);
/* several more plies without predict/guard */
P.predict = false;
var crashed = false;
try {
  for (var i = 0; i < 6 && !session.over; i++) {
    if (session.S.turn !== 'w') { drainTimers(); continue; }
    var m = pickMove(session.S, 2);
    if (!m) break;
    BD.mode = 'move';
    onKidMove(m);
    drainTimers();
  }
} catch (e) { crashed = true; print('  game loop error: ' + e); }
ok('game: 6 more plies clean', !crashed && (session.over || session.S.hist.length >= 10));
/* undo and speurbril on a controlled fresh game: 1. e4 + reply, then undo */
drainTimers(); /* flush stale timers from the previous game first */
startGame(1);
onCell(20); onCell(52);
drainTimers();
var h = session.S.hist.length;
ok('game: kid to move after reply', session.S.turn === 'w' && h === 2 && !session.over);
undoMove();
ok('game: undo removes 2 plies', session.S.hist.length === h - 2);
var tipsBefore = session.tips;
useTip();
ok('game: tip consumed, spy set', session.tips === tipsBefore - 1 && BD.spy.size >= 0);
drainTimers();
/* blunder guard */
P.guard = true;
session.S = parseFEN('7k/8/8/8/7r/8/8/KQ6 w - - 0 1');
BD.mode = 'move';
var qb4 = legalMoves(session.S).find(m => m.from === 1 && m.to === 49);
onKidMove(qb4);
ok('guard: modal shown', __els.modalBox.innerHTML.indexOf('Wacht even') >= 0 &&
  !__els.overlay.classList.contains('hidden'));
fire(__els.gLook, 'click');
ok('guard: look-again restores turn', BD.mode === 'move' &&
  __els.overlay.classList.contains('hidden'));
/* mate in 1 */
P.guard = false;
session.S = parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
var winsBefore = P.wins;
var ra8 = legalMoves(session.S).find(m => m.from === 0 && m.to === 112);
onKidMove(ra8);
drainTimers();
ok('mate: game over, kid wins', session.over === true && P.wins === winsBefore + 1);
ok('mate: victory modal', __els.modalBox.innerHTML.indexOf('GEWONNEN') >= 0);

print(fails === 0 ? '\nALL FLOW TESTS PASSED' : '\n' + fails + ' FLOW FAILURES');
