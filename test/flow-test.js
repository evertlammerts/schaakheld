/* End-to-end UI flow tests, headless. Loaded after dom-shim + engine + ui-only. */
var fails = 0;
function ok(name, cond) {
  if (!cond) fails++;
  print((cond ? 'PASS' : 'FAIL') + '  ' + name);
}

/* init already ran at load; name modal should be open (no stored name) */
ok('init: name modal open', !__els.overlay.classList.contains('hidden'));
P.name = 'Testkind'; closeModal();

/* close any queued LEVEL OMHOOG modals so later modal assertions see past them */
function closeLevelUps() {
  var guard = 0;
  while (guard++ < 8 && !__els.overlay.classList.contains('hidden') &&
    __els.modalBox.innerHTML.indexOf('LEVEL OMHOOG') >= 0) fire(__els.lvlOk, 'click');
}
/* mark today's missions done up front so mission XP never skews exact XP checks */
ensureDay();
dayMissions().forEach(function (m) { P.day.done[m.id] = true; });
P.day.allDone = true;

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
closeLevelUps();
ok('scan: summary modal', __els.modalBox.innerHTML.indexOf('Rondje klaar') >= 0);
ok('scan: 15 stars earned', P.stars - stars0 === 15);
ok('scan: xp 150 + streak bonuses 15', P.xp - xp0 === 165);
ok('scan: perfect rounds counted', P.c.perfectScans === 5);
ok('badge: vuurpijl bij 5 op een rij', !!P.badges.vlam);
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
ok('best3: explanation shown on correct', __els.taskBox.innerHTML.indexOf('Zo zit het') >= 0 &&
  __els.taskBox.innerHTML.indexOf('🥇') >= 0);
/* wrong-wrong -> auto reveal */
nextRound();
drainTimers();
bi = session.task.options.indexOf(session.task.best);
var w1 = (bi + 1) % 3, w2 = (bi + 2) % 3;
earnedBefore = session.earned;
pickOption(w1); best3Confirm(); drainTimers();
pickOption(w2); best3Confirm(); drainTimers();
ok('best3: auto-reveal after 2 wrong', session.phase === 'review' && session.earned === earnedBefore);
ok('best3: explanation shown on reveal', __els.taskBox.innerHTML.indexOf('🥇') >= 0);
/* deterministic explanation content: Qb4?? hangs the queen, Qb2+ is safe with check */
var eS = parseFEN('7k/8/8/8/7r/8/8/KQ6 w - - 0 1');
var eMoves = legalMoves(eS);
var eBad = eMoves.find(function (m) { return m.from === 1 && m.to === 49; });
var eGood = eMoves.find(function (m) { return m.from === 1 && m.to === 17; });
var eTask = { S: eS, options: [{ m: eBad, score: 0 }, { m: eGood, score: 0 }], best: null };
eTask.best = eTask.options[1];
var eLines = best3Explanations(eTask);
ok('best3 expl: hanging queen costs 9 points', eLines[0].indexOf('kost je') >= 0 &&
  eLines[0].indexOf('9 punten') >= 0);
ok('best3 expl: best line marked gold', eLines[1].indexOf('🥇') === 0);
ok('best3 expl: board untouched', eS.hist.length === 0 && toFEN(eS) === '7k/8/8/8/7r/8/8/KQ6 w - - 0 1');

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
ensureDay();
var ptBefore = P.day.predictTries;
resolvePredict(pm.from); /* correct prediction */
ok('predict: bonus +15', P.xp - xpBefore >= 15);
ok('predict: poging geteld voor missie', P.day.predictTries === ptBefore + 1);
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
/* speurbril on the start position: nothing is attacked, so no tip is spent */
var tipsBefore = session.tips;
useTip();
ok('tip: nothing attacked keeps the tip and explains', session.tips === tipsBefore &&
  __els.bubble.innerHTML.indexOf('speurbril') >= 0);
onCell(20); onCell(52);
drainTimers();
var h = session.S.hist.length;
ok('game: kid to move after reply', session.S.turn === 'w' && h === 2 && !session.over);
undoMove();
ok('game: undo removes 2 plies', session.S.hist.length === h - 2);
/* speurbril with real attacks: e4 and d5 pawns attack each other */
session.S = parseFEN('6k1/8/8/3p4/4P3/8/8/6K1 w - - 0 1');
BD.mode = 'move';
tipsBefore = session.tips;
useTip();
ok('tip: consumed with both pawns glowing', session.tips === tipsBefore - 1 && BD.spy.size === 2);
drainTimers();
/* denkwolk: vrij vooruitdenken op een droomkopie, echt bord blijft onaangeraakt */
var realS = session.S;
var realFen = toFEN(realS);
enterCloud();
ok('wolk: sandbox actief op kopie', !!session.cloud && session.S !== realS &&
  toFEN(session.S) === realFen && BD.mode === 'cloud');
onCell(sqFromAlg('e4'));
ok('wolk: wit stuk selecteerbaar', BD.sel === sqFromAlg('e4'));
onCell(sqFromAlg('d5')); /* exd5 */
drainTimers();
ok('wolk: witte zet gespeeld', session.S.hist.length === 1);
onCell(sqFromAlg('g8'));
ok('wolk: ook Turbo-stuk schuifbaar', BD.sel === sqFromAlg('g8'));
onCell(sqFromAlg('f7')); /* Kf7 */
drainTimers();
ok('wolk: zwarte zet gespeeld', session.S.hist.length === 2);
var cloudPlies = session.S.hist.length;
cloudTurbo();
drainTimers();
ok('wolk: turbo-hulp speelt een zet', session.S.hist.length === cloudPlies + 1);
cloudUndo();
ok('wolk: stapje terug', session.S.hist.length === cloudPlies);
ok('wolk: teller en dagmissie lopen', P.c.cloudUsed >= 1 && P.day.cloud >= 1);
ok('wolk: dromer-trofee', !!P.badges.wolk);
exitCloud();
ok('wolk: terug naar echt, bord intact', session.S === realS && toFEN(session.S) === realFen &&
  BD.mode === 'move' && !session.cloud && realS.hist.length === 0);
/* blunder guard */
closeLevelUps();
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
closeLevelUps();
ok('mate: game over, kid wins', session.over === true && P.wins === winsBefore + 1);
ok('mate: victory modal', __els.modalBox.innerHTML.indexOf('GEWONNEN') >= 0);
ok('badge: eerste potje en winnaar', !!P.badges.potje && !!P.badges.winst);

/* ---------- gamification: badges, missions, themes, modal queue ---------- */
P.c.predictHits = 5;
checkBadges();
ok('badge: orakel via teller', !!P.badges.orakel);
/* fresh day: three missions complete plus the day bonus */
P.day = { date: 'gisteren' };
ensureDay();
ok('missions: nieuwe dag reset', P.day.date === todayStr() && !P.day.allDone &&
  dayMissions().length === 3);
var xpM = P.xp;
['wins', 'stars', 'perfectScans', 'predictHits', 'safeCorrect', 'best3Gold', 'patience']
  .forEach(function (k) { bumpDay(k, 99); });
ok('missions: 3 klaar + dagbonus', P.day.allDone === true && P.xp - xpM === 3 * 40 + 50);
/* gates: meesterproeven remmen pure XP-farm */
var gSave = { xp: P.xp, ps: P.c.perfectScans, w2: P.c.winsL2, w3: P.c.winsL3 };
P.xp = 10000; P.c.perfectScans = 0; P.c.winsL2 = 0; P.c.winsL3 = 0;
ok('gate: zonder proeven blijf je Paard', levelIdx(P.xp) === 1);
P.c.perfectScans = 5;
ok('gate: Loper na 5 perfecte rondes', levelIdx(P.xp) === 2);
P.c.winsL2 = 1;
ok('gate: Toren na winst op Turbo', levelIdx(P.xp) === 3);
P.c.winsL2 = 3;
ok('gate: Dame na 3 keer Turbo', levelIdx(P.xp) === 4);
P.c.winsL3 = 5;
ok('gate: Grootmeester na 5 keer Super Turbo', levelIdx(P.xp) === 6);
P.xp = 700;
ok('gate: xp-drempel telt ook nog', levelIdx(P.xp) === 2);
P.xp = gSave.xp; P.c.perfectScans = gSave.ps; P.c.winsL2 = gSave.w2; P.c.winsL3 = gSave.w3;

/* afnemende winst-xp per dag per sterkte */
ensureDay();
P.day.winsByLvl = { 1: 0, 2: 0, 3: 0 };
ok('winxp: eerste winst betaalt vol', gameWinXP(1) === 40 && gameWinXP(2) === 100 && gameWinXP(3) === 180);
P.day.winsByLvl[1] = 2;
ok('winxp: derde babywinst is een fooi', gameWinXP(1) === 15 && gameWinXP(2) === 100);

/* missies: echte variatie tussen opeenvolgende dagen */
var sigs = {};
['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
  .forEach(function (d) {
    sigs[missionsFor(d).map(function (m) { return m.id; }).sort().join('+')] = 1;
  });
ok('missies: gevarieerde sets over 6 dagen', Object.keys(sigs).length >= 4);

/* coach ziet de basisprincipes */
var cT = coachTips(parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1'));
ok('coach: ziet rokade-kans', cT.some(function (t) { return t.indexOf('rokeren') >= 0; }));
ok('coach: ziet centrum-tip', cT.some(function (t) { return t.indexOf('centrum') >= 0; }));
var hT = coachTips(parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1'));
ok('coach: ziet onverdedigd stuk', hT.some(function (t) { return t.indexOf('aangevallen') >= 0; }));

/* themes lock on level */
var xpSave = P.xp;
P.xp = 0; P.theme = 'munt';
pickTheme('oceaan');
ok('theme: op slot onder level Paard', P.theme === 'munt');
P.xp = 200;
pickTheme('oceaan');
ok('theme: ontgrendeld vanaf Paard', P.theme === 'oceaan');
P.xp = xpSave;
/* modal queue keeps order */
modalQueue = []; modalOpen = false;
__els.overlay.classList.add('hidden');
showModal('<p>EEN</p>');
showModal('<p>TWEE</p>');
ok('modal queue: eerste zichtbaar, tweede wacht', __els.modalBox.innerHTML.indexOf('EEN') >= 0 &&
  modalQueue.length === 1);
closeModal();
ok('modal queue: tweede komt daarna', __els.modalBox.innerHTML.indexOf('TWEE') >= 0);
closeModal();
ok('modal queue: leeg en dicht', modalOpen === false && __els.overlay.classList.contains('hidden'));

/* ---------- reset flow (last: it wipes the profile) ---------- */
goHome();
fire(__els.resetBtn, 'click');
ok('reset: confirm modal shown', __els.modalBox.innerHTML.indexOf('Alles wissen') >= 0);
fire(__els.rstNo, 'click');
ok('reset: cancel keeps profile', P.wins > 0 && __els.overlay.classList.contains('hidden'));
fire(__els.resetBtn, 'click');
fire(__els.rstGo, 'click');
ok('reset: profile wiped and name asked again', P.xp === 0 && P.stars === 0 &&
  P.name === '' && P.wins === 0 && __els.modalBox.innerHTML.indexOf('Hoi! Ik ben Turbo') >= 0);
ok('reset: badges, tellers en dag ook gewist', Object.keys(P.badges).length === 0 &&
  P.c.gamesPlayed === 0 && P.theme === 'munt' &&
  P.day && P.day.date === todayStr() && P.day.stars === 0 && !P.day.allDone);

print(fails === 0 ? '\nALL FLOW TESTS PASSED' : '\n' + fails + ' FLOW FAILURES');
