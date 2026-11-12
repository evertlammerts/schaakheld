/* End-to-end UI flow tests, headless. Loaded after dom-shim + engine + ui-only. */
var fails = 0;
function ok(name, cond) {
  if (!cond) fails++;
  print((cond ? 'PASS' : 'FAIL') + '  ' + name);
}

/* init already ran at load; name modal should be open (no stored name) */
ok('init: name modal open', !__els.overlay.classList.contains('hidden'));
P.name = 'Testkind'; closeModal();

/* iOS 15.0 kent crypto.randomUUID niet (de shim ook niet): dan maakt de terugval het apparaat-id */
ok('apparaat-id: zonder randomUUID 32 hex-tekens', typeof crypto.randomUUID === 'undefined' && /^[0-9a-f]{32}$/.test(DEV));

/* close any queued LEVEL OMHOOG modals so later modal assertions see past them */
function closeLevelUps() {
  var guard = 0;
  while (guard++ < 8 && !__els.overlay.classList.contains('hidden') &&
    __els.modalBox.innerHTML.indexOf('LEVEL OMHOOG') >= 0) fire(__els.lvlOk, 'click');
}
/* geen weekdoel gezet: zo kan doel-XP de exacte XP-checks hieronder niet vertroebelen */
ok('init: geen weekdoel bij een vers profiel', P.weekGoal === null);

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

/* ---------- trucendoos: mat in twee is een plan van twee stappen ---------- */
startDrill('trucs');
drainTimers();
var m2S = parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
var m2Kb6 = legalMoves(m2S).find(function (m) { return alg(m.to) === 'b6'; });
var m2Rh7 = legalMoves(m2S).find(function (m) { return alg(m.to) === 'h7'; });
session.S = m2S;
session.task = { S: m2S, type: 'mat2', answers: [{ m: m2Kb6, info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle';
var m2Earned = session.earned;
puzzleAttempt(m2Kb6);
drainTimers();
ok('mat2: na de dwingende zet antwoordt Turbo en is het jouw matzet', session.phase === 'puzzle2' &&
  session.S.hist.length === 2 && session.mate2Answers.length >= 1 &&
  __els.bubble.innerHTML.indexOf('SCHAAKMAT') >= 0);
var m2Wrong = legalMoves(session.S).find(function (m) { return !session.mate2Answers.some(function (a) { return sameMove(a, m); }); });
puzzleAttempt(m2Wrong);
drainTimers();
ok('mat2: geen mat = uitleg en nog een kans', session.phase === 'puzzle2' && session.tries === 1 &&
  __els.bubble.innerHTML.indexOf('Nog geen mat') >= 0);
puzzleAttempt(session.mate2Answers[0]);
drainTimers();
ok('mat2: matzet na één misser = 1 ster, boekje telt', session.phase === 'review' &&
  session.earned - m2Earned === 1 && (P.c.pat.mat2 || 0) >= 1);
/* twee keer mis op de eerste zet: de hele matvoering wordt voorgespeeld */
nextRound();
drainTimers();
var m2S2 = parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
session.S = m2S2;
session.task = { S: m2S2, type: 'mat2', answers: [{ m: legalMoves(m2S2).find(function (m) { return alg(m.to) === 'b6'; }), info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle';
m2Earned = session.earned;
puzzleAttempt(legalMoves(m2S2).find(function (m) { return alg(m.to) === 'h7'; }));
ok('mat2: eerste misser = nog een poging', session.phase === 'puzzle' && session.tries === 1);
puzzleAttempt(legalMoves(m2S2).find(function (m) { return alg(m.to) === 'h7'; }));
drainTimers();
ok('mat2: tweede misser = voorgespeeld tot mat, 0 sterren', session.phase === 'review' &&
  session.earned === m2Earned && gameStatus(session.S).reason === 'mat' &&
  __els.bubble.innerHTML.indexOf('plan in twee stappen') >= 0);

/* ---------- koning ontsnapt ---------- */
startDrill('koning');
drainTimers();
ok('koning: opdracht gebouwd met 1-4 reddingen', !!(session.task && session.task.answers.length >= 1 &&
  session.task.answers.length <= 4) && session.phase === 'puzzle' && session.diff > 0);
/* deterministisch: alleen h3 of h4 voorkomt Rb1-mat */
var kS = parseFEN('1r4k1/8/8/8/8/8/r6P/6K1 w - - 0 1');
var kH3 = legalMoves(kS).find(function (m) { return alg(m.to) === 'h3'; });
var kH4 = legalMoves(kS).find(function (m) { return alg(m.to) === 'h4'; });
var kKf1 = legalMoves(kS).find(function (m) { return alg(m.to) === 'f1'; });
session.S = kS;
session.task = { S: kS, type: 'mat1', answers: [{ m: kH3, info: null }, { m: kH4, info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle'; BD.check = kS.kings.w;
var kEarned = session.earned;
puzzleAttempt(kKf1);
ok('koning: fout = Turbo laat het mat zien', session.phase === 'busy');
drainTimers();
ok('koning: bord hersteld, nog een poging', session.phase === 'puzzle' && session.S.hist.length === 0 &&
  session.tries === 1 && __els.bubble.innerHTML.indexOf('Nog één poging') >= 0);
koningHint();
ok('koning: hint laat het reddende stuk glimmen', session.task.hintUsed && BD.glow.has(kH3.from));
puzzleAttempt(kH4);
drainTimers();
ok('koning: redding na een misser = 1 ster', session.phase === 'review' && session.earned - kEarned === 1 &&
  __els.bubble.innerHTML.indexOf('Gered') >= 0);
/* twee missers: de redding wordt voorgedaan */
nextRound();
drainTimers();
var kS2 = parseFEN('1r4k1/8/8/8/8/8/r6P/6K1 w - - 0 1');
session.S = kS2;
session.task = { S: kS2, type: 'mat1', answers: [{ m: legalMoves(kS2).find(function (m) { return alg(m.to) === 'h3'; }), info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle';
kEarned = session.earned;
puzzleAttempt(legalMoves(kS2).find(function (m) { return alg(m.to) === 'f1'; }));
drainTimers();
puzzleAttempt(legalMoves(kS2).find(function (m) { return alg(m.to) === 'h1'; }));
drainTimers();
ok('koning: tweede misser = redding voorgedaan, 0 sterren', session.phase === 'review' &&
  session.earned === kEarned && __els.bubble.innerHTML.indexOf('Dit was de redding') >= 0);
/* een zet die het potje meteen uitmaakt is altijd een ontsnapping, ook als
   de voorraad hem niet als antwoord noemt */
nextRound();
drainTimers();
var eS = parseFEN('k7/8/1K6/8/8/8/r7/7R w - - 0 1');
session.S = eS;
session.task = { S: eS, type: 'mat1', answers: [{ m: legalMoves(eS).find(function (m) { return alg(m.to) === 'c6'; }), info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle';
kEarned = session.earned;
puzzleAttempt(legalMoves(eS).find(function (m) { return alg(m.from) === 'h1' && alg(m.to) === 'h8'; }));
drainTimers();
ok('koning: matzet telt als ontsnapping', session.phase === 'review' && session.earned - kEarned === 3 &&
  gameStatus(session.S).reason === 'mat');
/* red je stuk: de uitleg benoemt hoe (weg, gedekt, tegenaanval) */
nextRound();
drainTimers();
var pS = parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1'); /* Bc3 valt Ra1 aan; weglopen redt */
var pRa2 = legalMoves(pS).find(function (m) { return alg(m.from) === 'a1' && alg(m.to) === 'a2'; });
session.S = pS;
session.task = { S: pS, type: 'stuk', hang: threatDetails(pS)[0], answers: [{ m: pRa2, info: null }], hintUsed: false };
session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle';
kEarned = session.earned;
puzzleAttempt(pRa2);
drainTimers();
ok('stuk: weggezet = 3 sterren met uitleg', session.phase === 'review' && session.earned - kEarned === 3 &&
  __els.bubble.innerHTML.indexOf('Weggezet') >= 0);
ok('stuk: dekken wordt herkend', stukHow(parseFEN('6k1/8/8/8/8/2b5/8/R4RK1 w - - 0 1'),
  legalMoves(parseFEN('6k1/8/8/8/8/2b5/8/R4RK1 w - - 0 1')).find(function (m) { return alg(m.from) === 'f1' && alg(m.to) === 'b1'; }),
  { sq: sqFromAlg('a1') }).indexOf('Gedekt') >= 0);

/* ---------- openingsschool ---------- */
var pS0 = newGame();
ok('principes: startstand heeft niks', principles(pS0, 'w').centrum === 0 && principles(pS0, 'w').dev === 0);
makeMove(pS0, legalMoves(pS0).find(function (m) { return moveKey(m) === 'e2e4'; }));
ok('principes: e4 = pion in het midden plus een aanval op d5', principles(pS0, 'w').centrum === 3);
makeMove(pS0, legalMoves(pS0).find(function (m) { return moveKey(m) === 'e7e5'; }));
makeMove(pS0, legalMoves(pS0).find(function (m) { return moveKey(m) === 'g1f3'; }));
ok('principes: paard naar buiten telt als ontwikkeling', principles(pS0, 'w').dev === 1);
/* een geslagen paard staat niet buiten: het lege beginveld telt niet mee */
var pS1 = parseFEN('4k3/8/8/8/8/8/b7/1N2K3 b - - 0 1');
var devVoor = principles(pS1, 'w').dev;
makeMove(pS1, legalMoves(pS1).find(function (m) { return moveKey(m) === 'a2b1'; }));
ok('principes: een geslagen paard op zijn beginveld telt niet als ontwikkeling',
  devVoor === 0 && principles(pS1, 'w').dev === 0);

goHome();
startDrill('opening');
ok('opening: kiezer met coach en drie paden', __els.modalBox.innerHTML.indexOf('Openingsschool') >= 0 &&
  __els.modalBox.innerHTML.indexOf('coach') >= 0 && __els.modalBox.innerHTML.indexOf('Italiaans') >= 0 &&
  __els.modalBox.innerHTML.indexOf('Londen') >= 0 && __els.modalBox.innerHTML.indexOf('zwart') >= 0);
closeModal();
/* pad Italiaans: fout, goed, hint, en uitspelen */
var opdrO = wkGet(curWeek(), 'opdr');
startOpening('pad', PADEN[0]);
ok('pad: gestart als wit, zet 1 van 6', session.kind === 'opening' && session.mode === 'pad' && session.color === 'w' &&
  session.maxMoves === 6 && BD.mode === 'opening' && __els.roundChip.textContent === 'Zet 1 van 6');
var opM = function (k) { return legalMoves(session.S).find(function (m) { return moveKey(m) === k; }); };
onOpeningMove(opM('a2a3'));
ok('pad: verkeerde zet = tip en nog een kans', session.tries === 1 && session.S.hist.length === 0 &&
  __els.bubble.innerHTML.indexOf('Niet die') >= 0);
onOpeningMove(opM('e2e4'));
drainTimers();
ok('pad: goede zet na een misser = 2 sterren, uitleg, Turbo antwoordt uit het pad', session.kidMoves === 1 &&
  session.earned === 2 && session.S.hist.length === 2 && moveKey(session.S.hist[1].m) === 'e7e5' &&
  __els.bubble.innerHTML.indexOf('midden') >= 0 && BD.mode === 'opening');
openingHint();
ok('pad: hint toont een pijl', BD.arrows.length === 1 && session.hintUsed === true);
onOpeningMove(opM('g1f3'));
drainTimers();
ok('pad: met hint 2 sterren', session.earned === 4 && session.kidMoves === 2);
onOpeningMove(opM('a2a3'));
onOpeningMove(opM('a2a3'));
ok('pad: twee missers = de zet wordt aangewezen', BD.arrows.length === 1 && __els.bubble.innerHTML.indexOf('Deze bedoel ik') >= 0);
onOpeningMove(opM('f1c4'));
drainTimers();
ok('pad: aangewezen zet = 1 ster', session.earned === 5 && session.kidMoves === 3);
while (session && session.kind === 'opening' && BD.mode === 'opening') {
  onOpeningMove(opM(session.pad.moves[session.S.hist.length]));
  drainTimers();
}
closeLevelUps();
ok('pad: uitgespeeld met rokade en eindscherm', !!session && session.castled === true &&
  __els.modalBox.innerHTML.indexOf('Pad uitgespeeld') >= 0 && P.c.pad.italiaans === 1 &&
  session.earned === 5 + 9 && wkGet(curWeek(), 'opdr') === opdrO + 6);
fire(__els.mHome, 'click');
/* pad met zwart: Turbo begint, het kind speelt de zwarte zetten */
startOpening('pad', PADEN[2]);
ok('pad zwart: Turbo is eerst aan zet', session.color === 'b' && BD.mode === 'off');
drainTimers();
ok('pad zwart: na 1.e4 is het kind aan zet', session.S.hist.length === 1 && BD.mode === 'opening' && session.S.turn === 'b');
onOpeningMove(opM('e7e5'));
drainTimers();
ok('pad zwart: e5 goed, wit antwoordt uit het pad', session.earned === 3 && session.S.hist.length === 3 && session.S.turn === 'b');
goHome();
/* coach: boekzet, matige zet, dame te vroeg, valstrik */
startOpening('coach', null);
ok('coach: meters zichtbaar', !__els.meters.classList.contains('hidden') && __els.meters.innerHTML.indexOf('Centrum') >= 0);
var cS = session.S;
ok('coach: boekzet e4 = 3 sterren', coachEval(cS, opM('e2e4')).stars === 3 && coachEval(cS, opM('e2e4')).msg.indexOf('boekzet') >= 0);
ok('coach: a3 = 1 ster met tip', coachEval(cS, opM('a2a3')).stars === 1 && coachEval(cS, opM('a2a3')).msg.indexOf('sterker') >= 0);
ok('coach: bord onaangeraakt door de beoordeling', cS.hist.length === 0);
onOpeningMove(opM('e2e4'));
drainTimers();
ok('coach: na e4 antwoordt Turbo en tellen de sterren', session.kidMoves === 1 && session.earned === 3 && session.S.hist.length === 2);
ok('coach: dame te vroeg = 0 sterren met uitleg', coachEval(session.S, opM('d1h5')).stars === 0 &&
  coachEval(session.S, opM('d1h5')).msg.indexOf('dame') >= 0);
/* valstrik: na 1.e4 e5 2.Pf3 Pc6 is Pxe5 een stuk weggeven */
var bS = parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
var bEv = coachEval(bS, legalMoves(bS).find(function (m) { return moveKey(m) === 'f3e5'; }));
ok('coach: Pxe5 is een valstrik, 0 sterren', bEv.stars === 0 && bEv.msg.indexOf('valstrik') >= 0);
ok('coach: rokade = 3 sterren', (function () {
  var rS = parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4');
  var ev = coachEval(rS, legalMoves(rS).find(function (m) { return m.flags === 'K'; }));
  return ev.stars === 3 && ev.castled === true && ev.msg.indexOf('Rokade') >= 0;
})());
/* zelfde stuk twee keer: tempo */
session.movedTo.add(sqFromAlg('a2'));
ok('coach: zelfde stuk nog eens = tip over tempo', coachEval(session.S, opM('a2a3')).msg.indexOf('zette je al') >= 0);
session.movedTo.clear();
/* de rest met boekzetten: acht zetten, eindscherm */
while (session && session.kind === 'opening' && BD.mode === 'opening') {
  onOpeningMove(bookMove(session.S) || pickMove(session.S, 2));
  drainTimers();
}
closeLevelUps();
ok('coach: na acht zetten het eindscherm', !!session && session.kidMoves === 8 &&
  __els.modalBox.innerHTML.indexOf('Opening klaar') >= 0 && __els.modalBox.innerHTML.indexOf('Centrum') >= 0);
fire(__els.mHome, 'click');
ok('opening: naar huis ruimt de meters op', session === null && __els.meters.classList.contains('hidden'));

/* ---------- speurogen: wat dreigt Turbo? ---------- */
startDrill('scan');
drainTimers();
var thS = parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1'); /* Bc3 valt de toren aan, niets dekt hem */
var thDet = threatDetails(thS);
ok('dreiging: toren op a1 hangt voor Turbo', thDet.length === 1 && alg(thDet[0].sq) === 'a1' && thDet[0].gain >= 400);
session.S = thS;
session.task = { S: thS, type: 'threat', targets: thDet.map(function (d) { return d.sq; }), extra: null, details: thDet };
session.phase = 'marking';
BD.marks.clear();
BD.marks.add(sqFromAlg('g1')); /* fout: de koning telt niet */
scanCheck();
ok('dreiging: gemiste toren uitgelegd met de aanvaller', __els.taskBox.innerHTML.indexOf('loper op c3') >= 0 &&
  __els.taskBox.innerHTML.indexOf('toren op a1') >= 0);
/* een gedekt stuk is geen dreiging */
var thS2 = parseFEN('6k1/8/5b2/8/3P4/2P5/8/6K1 w - - 0 1'); /* Bxd4 cxd4: slechte ruil voor Turbo */
ok('dreiging: gedekte pion is geen winst voor Turbo', threatDetails(thS2).length === 0);
ok('dreiging: in schaak geen dreigingsopdracht', threatDetails(parseFEN('6k1/8/8/8/8/2b5/8/R3K3 w - - 0 1')).length === 0);

/* ---------- De Beste Zet: even rondes zijn de valstrik-vraag ---------- */
startDrill('best3');
drainTimers();
ok('best3 r1: kiezen uit drie', session.round === 1 && !!(session.task && session.task.options));
nextRound();
drainTimers();
ok('best3 r2: valstrik-vraag', session.round === 2 && typeof session.task.trap === 'boolean' &&
  __els.optionsBox.innerHTML.indexOf('Valstrik') >= 0);
var earnedBefore = session.earned;
safeAnswer(session.task.trap);
drainTimers();
ok('safe: correct scores 3', session.earned - earnedBefore === 3);
ok('safe: review phase', session.phase === 'review');
nextRound(); drainTimers(); /* r3: kiezen */
nextRound(); drainTimers(); /* r4: valstrik */
ok('best3 r4: weer valstrik', session.round === 4 && typeof session.task.trap === 'boolean');
earnedBefore = session.earned;
safeAnswer(!session.task.trap);
drainTimers();
ok('safe: wrong scores 0', session.earned === earnedBefore);
ok('safe: review phase after wrong', session.phase === 'review');

/* ---------- best3 drill ---------- */
wisRondje('best3'); /* [1.6] het rondje hierboven is bewaard; deze test wil een vers rondje */
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
/* wrong-wrong -> auto reveal (ronde 2 is de valstrik-vraag, die eerst beantwoorden) */
nextRound();
drainTimers();
safeAnswer(session.task.trap);
drainTimers();
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

/* ---------- trucendrills ---------- */
startDrill('trucs');
drainTimers();
ok('trucs: taak gegenereerd', !!(session.task && session.task.answers.length >= 1 &&
  session.phase === 'puzzle'));
/* deterministische succes-ronde: vork-stelling injecteren */
var fS = parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
var fM = legalMoves(fS).find(function (m) { return alg(m.from) === 'b5' && alg(m.to) === 'c7'; });
session.S = fS;
session.task = { S: fS, type: 'vork', answers: [{ m: fM, info: null }], hintUsed: false };
session.phase = 'puzzle';
session.tries = 0;
BD.mode = 'puzzle';
var earnedB = session.earned, vorkB = (P.c.pat.vork || 0), opdrB = wkGet(curWeek(), 'opdr');
puzzleAttempt(fM);
drainTimers();
ok('trucs: vork goed = 3 sterren', session.earned - earnedB === 3 && session.phase === 'review');
ok('trucs: boekje en weekteller lopen', P.c.pat.vork === vorkB + 1 && wkGet(curWeek(), 'opdr') === opdrB + 1);
/* fout-fout = onthulling met 0 sterren, bord blijft intact tot de onthulling */
var fS2 = parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
var fM2 = legalMoves(fS2).find(function (m) { return alg(m.from) === 'b5' && alg(m.to) === 'c7'; });
var badM = legalMoves(fS2).find(function (m) { return m.from === 4; });
session.S = fS2;
session.task = { S: fS2, type: 'vork', answers: [{ m: fM2, info: null }], hintUsed: false };
session.phase = 'puzzle';
session.tries = 0;
BD.mode = 'puzzle';
earnedB = session.earned;
puzzleAttempt(badM);
ok('trucs: fout telt poging, bord intact', session.tries === 1 && fS2.hist.length === 0);
puzzleAttempt(badM);
drainTimers();
ok('trucs: na 2 fouten onthulling', session.phase === 'review' && session.earned === earnedB &&
  fS2.hist.length === 1);

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
ok('wolk: teller loopt', P.c.cloudUsed >= 1);
ok('wolk: dromer-trofee', !!P.badges.wolk);
exitCloud();
ok('wolk: terug naar echt, bord intact', session.S === realS && toFEN(session.S) === realFen &&
  BD.mode === 'move' && !session.cloud && realS.hist.length === 0);
/* Pauze in de wolk: eerst het echte bord terug, dan naar huis zonder vraag; het droombord blijft niet bewaard */
startGame(1);
drainTimers();
onCell(sqFromAlg('e2')); onCell(sqFromAlg('e4'));
drainTimers();
var echteZetten = session.S.hist.length;
enterCloud();
onCell(sqFromAlg('d2')); onCell(sqFromAlg('d4'));
drainTimers();
var droomZetten = session.S.hist.length;
fire(__els.backBtn, 'click');
ok('[1.2] wolk: Pauze vraagt niets, gaat naar huis en bewaart het echte bord, niet het droombord',
  echteZetten === 2 && droomZetten === 1 && session === null && __els.overlay.classList.contains('hidden') &&
  !!leesPotje() && leesPotje().r.moves.length === echteZetten);
fire(document.getElementById('verderKaart'), 'click');
ok('[1.2] wolk: verder spelen geeft het echte bord terug en het potje loopt door', !!session &&
  session.kind === 'game' && !session.cloud && !session.over && BD.mode === 'move' && session.S.hist.length === echteZetten);
/* patroon-duiding in de partij: kid speelt een vork, Turbo benoemt hem */
P.guard = false; P.predict = false;
session.S = parseFEN('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
BD.mode = 'move';
var vorkG = P.c.pat.vork || 0;
commitKid(legalMoves(session.S).find(function (m) {
  return alg(m.from) === 'b5' && alg(m.to) === 'c7';
}));
ok('duiding: vork benoemd in partij', P.c.pat.vork === vorkG + 1 &&
  __els.bubble.innerHTML.indexOf('VORK') >= 0);
drainTimers();

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

/* ---------- gamification: badges, weekdoel, vorm, themes, modal queue ---------- */
P.c.predictHits = 5;
checkBadges();
ok('badge: orakel via teller', !!P.badges.orakel);

/* weekdoel: kiezen via de chips, voortgang uit de weektellers, XP bij halen */
goHome();
showHomeTab('ik');
fire(__els.goalBtn, 'click');
ok('weekdoel: kiezer open met sjablonen en aantallen', __els.modalBox.innerHTML.indexOf('Wat wordt je doel') >= 0 &&
  __els.goalKinds.innerHTML.indexOf('Opdrachten') >= 0 && __els.goalNs.innerHTML.indexOf('data-n="20"') >= 0);
fire(__els.goalKinds, 'click', { target: { dataset: { kind: 'potjes' } } });
ok('weekdoel: potjes-sjabloon toont de drie Turbo\'s', __els.goalSub.innerHTML.indexOf('Super Turbo') >= 0);
fire(__els.goalSub, 'click', { target: { dataset: { lvl: '1' } } });
fire(__els.goalNs, 'click', { target: { dataset: { n: '2' } } });
ok('weekdoel: voorbeeldzin klopt', __els.goalPreview.innerHTML.indexOf('2 potjes tegen 😴 Slaapkop Turbo of sterker') >= 0);
/* eerdere potjes in deze suite tellen al mee: de weektellers zijn echt.
   Daarom eerst het aantal dat het doel nodig heeft boven de huidige stand
   zetten, via de kiezer kan dat niet (vaste aantallen), dus direct. */
var potjesNu = wkGet(curWeek(), 'potjes1') + wkGet(curWeek(), 'potjes2') + wkGet(curWeek(), 'potjes3');
var xpG = P.xp;
fire(__els.goalOk, 'click');
ok('weekdoel: opgeslagen als voorkeur', P.weekGoal && P.weekGoal.kind === 'potjes' && P.weekGoal.n === 2 &&
  P.weekGoal.lvl === 1 && DOC.lww.weekGoal.v.n === 2);
ok('weekdoel: voortgang telt de potjes van deze week', goalProgress(P.weekGoal) === potjesNu);
setPref('weekGoal', { kind: 'potjes', n: potjesNu + 2, lvl: 1 });
renderHome();
ok('weekdoel: kaart toont doel en stand', __els.weekCard.innerHTML.indexOf('Mijn doel: ' + (potjesNu + 2) + ' potjes') >= 0 &&
  __els.weekCard.innerHTML.indexOf(potjesNu + ' / ' + (potjesNu + 2)) >= 0);
ok('weekstrip: op Spelen zichtbaar', __els.weekStrip.innerHTML.indexOf(potjesNu + ' van ' + (potjesNu + 2)) >= 0);
/* een potje op Super Turbo telt mee voor "Slaapkop Turbo of sterker" */
bumpWeek('potjes3', 1);
ok('weekdoel: sterkere Turbo telt mee', goalProgress(P.weekGoal) === potjesNu + 1 && P.xp === xpG);
bumpWeek('potjes1', 1);
ok('weekdoel: gehaald geeft eenmalig ' + GOAL_XP + ' XP', goalProgress(P.weekGoal) === potjesNu + 2 &&
  P.xp - xpG === GOAL_XP && goalDoneWeek(curWeek()) && DOC.max.goal[curWeek()] === GOAL_XP);
bumpWeek('potjes1', 1);
ok('weekdoel: niet nog eens XP', P.xp - xpG === GOAL_XP);
ok('weekdoel: bonus zit in de weergave na herladen', viewFromDoc(normDoc(JSON.parse(JSON.stringify(DOC)))).xp === P.xp);
/* twee apparaten die allebei het doel zien halen: na de merge één bonus */
ok('weekdoel: twee apparaten, één bonus', (function () {
  var a = normDoc(JSON.parse(JSON.stringify(DOC)));
  var b = normDoc(JSON.parse(JSON.stringify(DOC)));
  /* b heeft de bonus zelf óók toegekend (max-register) plus eigen potjes */
  b.cnt['wk.' + curWeek() + '.potjes1'] = { anderapparaat: 2 };
  var m = mergeDoc(a, b);
  var v = viewFromDoc(m);
  return m.max.goal[curWeek()] === GOAL_XP && v.xp === viewFromDoc(a).xp;
})());
ok('weekdoel: normDoc saneert de bonus-registers', (function () {
  var d = JSON.parse(JSON.stringify(DOC));
  d.max.goal['geen-week'] = 60; d.max.goal['2026-W01'] = 99999; d.max.goal['2026-W02'] = -5;
  var n = normDoc(d);
  return !n.max.goal['geen-week'] && n.max.goal['2026-W01'] === 1000 && !n.max.goal['2026-W02'];
})());
renderWeek();
ok('weekdoel: kaart zegt gehaald en dag gekleurd', __els.weekCard.innerHTML.indexOf('Gehaald!') >= 0 &&
  __els.weekCard.innerHTML.indexOf('day on today') >= 0);
/* het doel is een LWW-voorkeur: normDoc weigert onzin en houdt geldige doelen */
ok('weekdoel: normGoal saneert', normGoal({ kind: 'onzin', n: 3 }) === null && normGoal({ kind: 'opdr', n: 0 }) === null &&
  normGoal({ kind: 'top', n: 2, game: 'x' }).game === 'scan' && normGoal({ kind: 'wins', n: 1, lvl: 9 }).lvl === 2);
var docG = normDoc(JSON.parse(JSON.stringify(DOC)));
ok('weekdoel: overleeft normDoc en de wk-tellers ook', docG.lww.weekGoal.v.n === potjesNu + 2 &&
  cntSum(docG.cnt['wk.' + curWeek() + '.potjes1']) === wkGet(curWeek(), 'potjes1'));
ok('weekdoel: oude weken worden opgeruimd', (function () {
  var d = JSON.parse(JSON.stringify(DOC));
  d.cnt['wk.2020-W05.opdr'] = { a: 3 };
  d.cnt['wk.' + curWeek() + '.rare sleutel!'] = { a: 3 };
  var n = normDoc(d);
  return !n.cnt['wk.2020-W05.opdr'] && !n.cnt['wk.' + curWeek() + '.rare sleutel!'];
})());
/* nieuwe week: vriendelijk terugkijken, doel blijft standaard staan */
closeLevelUps();
closeModal();
P.weekSeen = '2020-W01';
checkNewWeek();
ok('nieuwe week: terugblik met vorige stand', __els.modalBox.innerHTML.indexOf('Nieuwe week') >= 0 &&
  __els.modalBox.innerHTML.indexOf('0 van ' + (potjesNu + 2)) >= 0 && P.weekSeen === curWeek());
fire(__els.wkKeep, 'click');
ok('nieuwe week: doel blijft', P.weekGoal && P.weekGoal.n === potjesNu + 2);
checkNewWeek();
ok('nieuwe week: maar één keer per week', __els.overlay.classList.contains('hidden'));
/* vorige weken: overzicht zonder verwijt */
fire(__els.weeksBtn, 'click');
ok('weken: overzicht toont deze week met potjes', __els.modalBox.innerHTML.indexOf('Deze week') >= 0 &&
  __els.modalBox.innerHTML.indexOf((potjesNu + 3) + ' potjes') >= 0 && __els.modalBox.innerHTML.indexOf('gehaald') >= 0);
closeModal();
/* doel weghalen */
fire(__els.goalBtn, 'click');
fire(__els.goalNone, 'click');
ok('weekdoel: weggehaald', P.weekGoal === null && __els.weekCard.innerHTML.indexOf('Nog geen doel') >= 0);

/* vorm-score: trefkans, moeilijkheid, tempo en volume over 14 dagen, met
   een vergelijking met de 14 dagen ervoor */
DOC.log = {}; P.log = DOC.log;
ok('vorm: zonder log geen vorm', vormInfo('opening') === null);
var nu = Date.now();
DOC.log.koning = {};
for (var vi = 0; vi < 10; vi++) DOC.log.koning['a' + vi] = [nu - vi * 3600000, 0.8, 20000, 3];
for (vi = 0; vi < 10; vi++) DOC.log.koning['b' + vi] = [nu - 20 * 86400000 - vi * 3600000, 0.4, 90000, 1];
P.log = DOC.log;
var vk = vormInfo('koning');
ok('vorm: sterk recent venster scoort hoog', vk && vk.n === 10 && vk.score >= 75 && vk.score <= 100);
ok('vorm: stijging t.o.v. vorige 14 dagen', vk.delta > 20);
ok('vorm: tekst met pijl', vormTxt('koning').indexOf('↑') >= 0);
DOC.log.koning = {};
for (vi = 0; vi < 10; vi++) DOC.log.koning['c' + vi] = [nu - vi * 3600000, 0.8, 200000, 0];
var vk0 = vormInfo('koning');
ok('vorm: alles fout en traag scoort laag', vk0.score < 25);
ok('vorm: normDoc gooit oude en kapotte regels weg', (function () {
  var d = JSON.parse(JSON.stringify(DOC));
  d.log.koning.oud = [nu - 40 * 86400000, 0.5, 1000, 3];
  d.log.koning.kapot = 'x';
  d.log.koning['rare id!'] = [nu, 0.5, 1000, 3];
  d.log.nep = { a: [nu, 0.5, 1000, 3] };
  var n = normDoc(d);
  return !n.log.koning.oud && !n.log.koning.kapot && !n.log.koning['rare id!'] && !n.log.nep && !!n.log.koning.c0;
})());
ok('vorm: merge is vereniging', (function () {
  var a = JSON.parse(JSON.stringify(DOC)), b = JSON.parse(JSON.stringify(DOC));
  b.log.koning = { z1: [nu, 0.5, 1000, 3] };
  var m = mergeDoc(normDoc(a), normDoc(b));
  return !!m.log.koning.c0 && !!m.log.koning.z1;
})());
ok('vorm: merge houdt zich aan de grenzen (MAX_LOG)', (function () {
  var a = normDoc(JSON.parse(JSON.stringify(DOC))), b = normDoc(JSON.parse(JSON.stringify(DOC)));
  a.log.koning = {}; b.log.koning = {};
  for (var q = 0; q < MAX_LOG - 5; q++) a.log.koning['a' + q] = [nu - q, 0.5, 1000, 3];
  for (q = 0; q < MAX_LOG - 5; q++) b.log.koning['b' + q] = [nu - q, 0.5, 1000, 3];
  return Object.keys(mergeDoc(a, b).log.koning).length === MAX_LOG;
})());
DOC.log = {}; P.log = DOC.log;
/* een afgeronde opdracht komt in de log terecht */
startDrill('scan');
drainTimers();
session.task.targets.forEach(function (sq) { BD.marks.add(sq); });
scanCheck();
ok('vorm: opdracht gelogd na awardRound', Object.keys(DOC.log.scan || {}).length === 1 &&
  Object.values(DOC.log.scan)[0][3] === 3 && !!vormInfo('scan'));
ok('vorm: zichtbaar in de sterrenbalk', __els.drillStars.innerHTML.indexOf('Vorm') >= 0);
goHome();
renderVorm();
ok('vorm: kaart op Ik toont Speurogen met score', __els.vormList.innerHTML.indexOf('Speurogen') >= 0 &&
  __els.vormList.innerHTML.indexOf('vorm-s') >= 0 && __els.vormList.innerHTML.indexOf('nog geen vorm') >= 0);
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

/* ISO-weken: maandag begint de week, jaarwissel klopt */
ok('isoweek: bekende data', isoWeek(new Date(2026, 8, 6)) === '2026-W36' && isoWeek(new Date(2026, 0, 1)) === '2026-W01' &&
  isoWeek(new Date(2027, 0, 3)) === '2026-W53' && isoWeek(new Date(2024, 11, 30)) === '2025-W01');

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
/* modal queue keeps order; de cancelable-vlag reist mee de wachtrij door */
modalQueue = []; modalOpen = false;
__els.overlay.classList.add('hidden');
showModal('<p>EEN</p>');
showModal('<p>TWEE</p>', null, true);
ok('modal queue: eerste zichtbaar, tweede wacht', __els.modalBox.innerHTML.indexOf('EEN') >= 0 &&
  __els.modalBox.innerHTML.indexOf('m-close') < 0 && modalQueue.length === 1);
closeModal();
ok('modal queue: tweede komt daarna', __els.modalBox.innerHTML.indexOf('TWEE') >= 0);
ok('modal queue: cancelable komt mee uit de wachtrij', modalCancelable === true &&
  __els.modalBox.innerHTML.indexOf('m-close') >= 0);
fire(__els.overlay, 'click', { target: __els.overlay });
ok('modal queue: leeg en dicht', modalOpen === false && __els.overlay.classList.contains('hidden'));

/* kies-je-turbo is te annuleren: via ✕, via een tik op de achtergrond,
   maar niet via een tik in de kaart zelf */
var sessVoor = session;
startGameFlow();
ok('kies-turbo: open met sluitknop', !__els.overlay.classList.contains('hidden') &&
  __els.modalBox.innerHTML.indexOf('Tegen wie speel je?') >= 0 &&
  __els.modalBox.innerHTML.indexOf('m-close') >= 0);
fire(__els.mClose, 'click');
ok('kies-turbo: ✕ sluit zonder potje', modalOpen === false &&
  __els.overlay.classList.contains('hidden') && session === sessVoor);
startGameFlow();
fire(__els.overlay, 'click', { target: __els.modalBox });
ok('kies-turbo: tik in de kaart sluit niet', modalOpen === true &&
  !__els.overlay.classList.contains('hidden'));
fire(__els.overlay, 'click', { target: __els.overlay });
ok('kies-turbo: achtergrond-tik sluit wel', modalOpen === false &&
  __els.overlay.classList.contains('hidden') && session === sessVoor);
startGameFlow();
fire(document, 'keydown', { key: 'a' });
ok('kies-turbo: een andere toets sluit niet', modalOpen === true &&
  !__els.overlay.classList.contains('hidden'));
fire(document, 'keydown', { key: 'Escape' });
ok('kies-turbo: Escape sluit wel', modalOpen === false &&
  __els.overlay.classList.contains('hidden') && session === sessVoor);
/* zonder cancelable-vlag: geen ✕, en achtergrond en Escape doen niks */
showModal('<p>VAST</p>');
fire(__els.overlay, 'click', { target: __els.overlay });
ok('modal zonder cancel: blijft staan', modalOpen === true &&
  __els.modalBox.innerHTML.indexOf('m-close') < 0);
fire(document, 'keydown', { key: 'Escape' });
ok('modal zonder cancel: Escape doet niks', modalOpen === true &&
  __els.modalBox.innerHTML.indexOf('VAST') >= 0);
closeModal();
ok('modal zonder cancel: eigen knop sluit', modalOpen === false &&
  __els.overlay.classList.contains('hidden'));

/* ---------- profiel-CRDT: doc, migratie, merge en sync ---------- */
/* een doc uit de vorige release (met dagmissies, zonder wk/log/friends)
   verliest bij het laden geen enkel punt, ster, trofee of teller */
(function () {
  var oud = { v: 2, epoch: 0,
    cnt: { xp: { d1: 500, d2: 20 }, stars: { d1: 40 }, wins: { d1: 3 }, 'c.winsL2': { d1: 1 },
      'c.safeCorrect': { d1: 7 }, 'c.pat.vork': { d1: 4 } },
    set: { badges: { winst: true, detective: true } },
    lww: { name: { v: 'Oscar', t: 1 }, theme: { v: 'oceaan', t: 1 } },
    max: { best: 6 },
    loc: { streak: 2, lastLevel: 1, day: { date: '2026-09-01', wins: 1, stars: 5, done: { win1: true },
      allDone: false, winsByLvl: { 1: 1, 2: 0, 3: 0 } } } };
  var v = viewFromDoc(normDoc(JSON.parse(JSON.stringify(oud))));
  ok('compat: punten en tellers uit de vorige release blijven staan', v.xp === 520 && v.stars === 40 &&
    v.wins === 3 && v.c.winsL2 === 1 && v.c.safeCorrect === 7 && v.c.pat.vork === 4 &&
    v.badges.winst === true && v.badges.detective === true && v.name === 'Oscar' && v.theme === 'oceaan' &&
    v.best === 6 && v.streak === 2 && v.weekGoal === null && v.day.winsByLvl[1] === 1);
})();
/* doc en weergave lopen gelijk (predictHits niet: die is hierboven met opzet
   rechtstreeks in P gezet en dus alleen weergave) */
var goalBonus = Object.values(DOC.max.goal).reduce(function (a, b) { return a + b; }, 0);
ok('crdt: som van bijdragen = weergave (xp plus de weekdoel-bonus)', ['xp', 'stars', 'wins', 'c.gamesPlayed',
  'c.perfectScans', 'c.winsL2', 'c.winsL3'].every(function (k) {
  return cntSum(DOC.cnt[k] || {}) + (k === 'xp' ? goalBonus : 0) === +getPath(P, k);
}));
ok('crdt: alle bijdragen op dit apparaat', Object.keys(DOC.cnt.xp).length === 1 &&
  DOC.cnt.xp[DEV] + goalBonus === P.xp);
ok('crdt: trofeeen in het doc', Object.keys(P.badges).every(function (b) {
  return DOC.set.badges[b] === true;
}));

/* round-trip door localStorage: herladen verliest niets */
saveP();
var stored = JSON.parse(localStorage.getItem('schaakheld1'));
ok('crdt: opgeslagen doc is v2', stored.v === 2 && !!stored.cnt && !!stored.set);
var rt = { xp: P.xp, stars: P.stars, wins: P.wins, badges: Object.keys(P.badges).length,
  theme: P.theme, best: P.best, streak: P.streak };
loadProfile();
ok('crdt: herladen verliest niets', P.xp === rt.xp && P.stars === rt.stars &&
  P.wins === rt.wins && Object.keys(P.badges).length === rt.badges &&
  P.theme === rt.theme && P.best === rt.best && P.streak === rt.streak);

/* migratie via loadProfile: een oud plat profiel in localStorage wordt bij de
   eerste start na de update een v2-doc, zonder verlies */
var docSave = JSON.stringify(DOC);
localStorage.setItem('schaakheld1', JSON.stringify({ name: 'Oscar', xp: 120, stars: 7,
  badges: { winst: true }, c: { gamesPlayed: 3, pat: { vork: 2 } } }));
loadProfile();
ok('migratie: oud profiel geladen', P.xp === 120 && P.stars === 7 && P.name === 'Oscar' &&
  P.c.gamesPlayed === 3 && P.c.pat.vork === 2 && P.badges.winst === true);
ok('migratie: bijdragen op dit apparaat, doc is v2', DOC.v === 2 && DOC.cnt.xp[DEV] === 120);
/* loadProfile legt de migratie zelf vast; anders zou elke start opnieuw
   migreren met een steeds nieuwere timestamp op de voorkeuren */
ok('migratie: meteen als v2 opgeslagen', JSON.parse(localStorage.getItem('schaakheld1')).v === 2);
localStorage.setItem('schaakheld1', docSave);
loadProfile(); /* terug naar het testprofiel van hierboven */

/* migratie: oud plat profiel wordt de bijdrage van het opgegeven apparaat */
var legacy = { name: 'Oscar', xp: 120, stars: 7, wins: 2, best: 4, streak: 2,
  theme: 'oceaan', badges: { winst: true },
  c: { gamesPlayed: 3, winsL2: 1, pat: { vork: 2 } } };
var mig = migrateLegacy(legacy, 'ipadA');
var mv = viewFromDoc(mig);
ok('migratie: tellers, trofeeen en voorkeuren mee', mv.xp === 120 && mv.stars === 7 &&
  mv.wins === 2 && mv.c.gamesPlayed === 3 && mv.c.winsL2 === 1 && mv.c.pat.vork === 2 &&
  mv.badges.winst === true && mv.name === 'Oscar' && mv.theme === 'oceaan' &&
  mv.best === 4 && mv.streak === 2);
ok('migratie: bijdrage op het opgegeven apparaat', mig.cnt.xp.ipadA === 120);

/* merge: het memo-voorbeeld, +50 op A en +30 op B moet +80 zijn */
var dA = migrateLegacy({ xp: 50, best: 3, name: 'Oscar', badges: { vlam: true } }, 'ipadA');
var dB = migrateLegacy({ xp: 30, best: 5, name: 'Oskar', badges: { raket: true } }, 'ipadB');
dB.lww.name.t = dA.lww.name.t + 1000; /* B is later aangepast */
var dM = viewFromDoc(mergeDoc(dA, dB));
ok('merge: tellers tellen op', dM.xp === 80);
ok('merge: trofeeen verenigd', dM.badges.vlam === true && dM.badges.raket === true);
ok('merge: nieuwste naam wint', dM.name === 'Oskar');
ok('merge: beste reeks is max', dM.best === 5);
var dBA = viewFromDoc(mergeDoc(dB, dA));
ok('merge: commutatief', dBA.xp === dM.xp && dBA.name === dM.name && dBA.best === dM.best &&
  JSON.stringify(Object.keys(dBA.badges).sort()) === JSON.stringify(Object.keys(dM.badges).sort()));
ok('merge: idempotent', viewFromDoc(mergeDoc(dA, dA)).xp === 50);
/* heen en weer blijven dragen convergeert en verliest nooit iets */
var dA2 = mergeDoc(dA, dB), dB2 = mergeDoc(dB, dA2), dA3 = mergeDoc(dA2, dB2);
ok('merge: heen en weer stabiel', viewFromDoc(dA3).xp === 80 &&
  JSON.stringify(dA3.cnt) === JSON.stringify(mergeDoc(dA3, dB2).cnt));
/* per apparaat wint de hoogste stand, dubbel gezien wordt niet dubbel geteld */
var dup = mergeDoc(dA2, dB);
ok('merge: per apparaat max, geen dubbeltelling', viewFromDoc(dup).xp === 80);

/* sync op het live profiel: alleen andermans bijdragen komen erbij */
var xpNow = P.xp;
var remote = emptyDoc();
remote.cnt.xp = { andereipad: 100 };
remote.set.badges.raket = true;
ok('sync: remote doc toegepast', applyRemoteDoc(remote) === true);
ok('sync: xp van het andere apparaat erbij', P.xp === xpNow + 100);
ok('sync: trofee van het andere apparaat erbij', P.badges.raket === true);
ok('sync: lastLevel herberekend, geen feestmodal', P.lastLevel === levelIdx(P.xp) &&
  __els.overlay.classList.contains('hidden'));
applyRemoteDoc(remote);
ok('sync: dubbel toepassen verandert niets', P.xp === xpNow + 100);
ok('sync: kapot doc geweigerd', applyRemoteDoc({ hoi: 1 }) === false &&
  applyRemoteDoc(null) === false && P.xp === xpNow + 100);

/* ---------- sanering en epoch (reviewbevindingen) ---------- */
saveP();
var schoonSave = localStorage.getItem('schaakheld1');
var gif = { v: 2, cnt: { xp: '100', stars: { evil: 1e12 }, 'c.pat.vork': [7], hack: 5 },
  lww: { name: { v: 'GRIEFED', t: 1e18 }, sound: { v: 'nee', t: 5 } },
  set: { badges: { nep: 1, echt: true } }, max: { best: 1e12 }, epoch: 'x' };
var schoon = normDoc(gif);
ok('sanering: string-tellermap geeft geen fantoomapparaten', !schoon.cnt.xp);
ok('sanering: array- en niet-object-paden genegeerd', !schoon.cnt['c.pat.vork'] && !schoon.cnt.hack);
ok('sanering: absurde bijdrage geklemd', schoon.cnt.stars.evil === 1e7);
ok('sanering: toekomst-timestamp geklemd', schoon.lww.name.t <= Date.now() + 86400000);
ok('sanering: voorkeur met verkeerd type genegeerd', !schoon.lww.sound);
ok('sanering: alleen echte trofeeen', !schoon.set.badges.nep && schoon.set.badges.echt === true);
ok('sanering: best geklemd, kapotte epoch hersteld', schoon.max.best === 1e6 && schoon.epoch === 0);
/* een kapot eigen doc geneest bij het laden en bump blijft werken */
localStorage.setItem('schaakheld1', JSON.stringify({ v: 2, cnt: { xp: 7 } }));
loadProfile();
var bumpOk = true;
try { bump('xp', 3); } catch (e) { bumpOk = false; }
ok('sanering: kapot doc geneest, bump werkt weer', bumpOk && P.xp === 3);
localStorage.setItem('schaakheld1', schoonSave);
loadProfile();

/* epoch: "Alles wissen" moet een merge met oude staat overleven */
var oudDoc = migrateLegacy({ xp: 300, best: 9, badges: { vlam: true } }, 'ipadB');
var wisDoc = emptyDoc();
wisDoc.epoch = 1;
var naWis1 = viewFromDoc(mergeDoc(wisDoc, oudDoc));
ok('epoch: wis wint van oude tellers en trofeeen', naWis1.xp === 0 && !naWis1.badges.vlam &&
  naWis1.best === 0);
ok('epoch: ook andersom (commutatief)', viewFromDoc(mergeDoc(oudDoc, wisDoc)).xp === 0);
var naWis2 = mergeDoc(wisDoc, oudDoc);
naWis2.cnt.xp = { ipadA: 25 };
ok('epoch: nieuwe voortgang na wis blijft staan', viewFromDoc(mergeDoc(naWis2, oudDoc)).xp === 25);

/* migratie-gezag: een latere migratie met defaults verliest van een
   eerdere echte keuze */
var mOscar = migrateLegacy({ name: 'Oscar', theme: 'oceaan', xp: 10 }, 'a');
var mLeeg = migrateLegacy({ xp: 5 }, 'b');
ok('migratie: defaults krijgen geen gezag (t=0)', mLeeg.lww.name.t === 0 &&
  mLeeg.lww.theme.t === 0 && mOscar.lww.name.t > 0);
var mSamen = viewFromDoc(mergeDoc(mLeeg, mOscar));
ok('migratie: echte keuze wint van latere default', mSamen.name === 'Oscar' &&
  mSamen.theme === 'oceaan' && mSamen.xp === 15);

/* ---------- startscherm-tabs (Spelen / Ik) ---------- */
goHome();
ok('tabs: start op Spelen', !__els['view-spelen'].classList.contains('hidden') &&
  __els['view-ik'].classList.contains('hidden') && __els.tabSpelen.classList.contains('on'));
showHomeTab('ik');
ok('tabs: Ik toont voortgang, Spelen verborgen', __els['view-spelen'].classList.contains('hidden') &&
  !__els['view-ik'].classList.contains('hidden') && __els.tabIk.classList.contains('on'));
showHomeTab('vrienden');
ok('tabs: Vrienden toont de lijst en de drie routes', !__els['view-vrienden'].classList.contains('hidden') &&
  __els['view-ik'].classList.contains('hidden') && __els.tabVrienden.classList.contains('on') &&
  __els.friendList.innerHTML.indexOf('Nog geen vrienden') >= 0);
showHomeTab('spelen');
ok('tabs: terug op Spelen', !__els['view-spelen'].classList.contains('hidden') &&
  __els.tabSpelen.classList.contains('on'));

/* ---------- reset flow (wipes the profile) ---------- */
goHome();
ACC = { id: 'testaccountid123', secret: 'testsecret-1234567890' };
saveAcc();
saveP();
var preResetDoc = localStorage.getItem('schaakheld1');
/* wissen zit nu achter het tandwiel (⚙️ Instellingen) */
fire(__els.setBtn, 'click');
ok('instellingen: koppelen en wissen achter het tandwiel',
  __els.modalBox.innerHTML.indexOf('Instellingen') >= 0 && !!__els.setReset);
fire(__els.setReset, 'click');
ok('reset: confirm modal shown', __els.modalBox.innerHTML.indexOf('Alles wissen') >= 0);
fire(__els.rstNo, 'click');
ok('reset: cancel keeps profile', P.wins > 0 && __els.overlay.classList.contains('hidden'));
fire(__els.setBtn, 'click');
fire(__els.setReset, 'click');
fire(__els.rstGo, 'click');
ok('reset: profile wiped and name asked again', P.xp === 0 && P.stars === 0 &&
  P.name === '' && P.wins === 0 && __els.modalBox.innerHTML.indexOf('Hoi! Ik ben Turbo') >= 0);
ok('reset: badges, tellers, weken en vorm ook gewist', Object.keys(P.badges).length === 0 &&
  P.c.gamesPlayed === 0 && P.theme === 'munt' && P.weekGoal === null &&
  Object.keys(P.wk).length === 0 && Object.keys(P.log).length === 0);
/* wissen ontkoppelt: andere apparaten en de server houden het profiel,
   dus een vergissing is herstelbaar en een nieuw kind op dit apparaat
   speelt niet stiekem in het oude account verder */
ok('reset: ontkoppeld van het account', ACC === null &&
  localStorage.getItem('schaakheld-acc') === null);
applyRemoteDoc(JSON.parse(preResetDoc));
ok('reset: oude profiel terugkoppelen brengt alles terug (epoch bleef 0)',
  P.xp > 0 && DOC.epoch === 0);

/* ---------- woorden, QR en koppelen: end-to-end op de fake server ---------- */
(async function () {
  closeModal(); /* het naamvenster uit de reset-flow */
  ok('woorden: 1024 uniek geladen', WOORDEN.length === 1024 && new Set(WOORDEN).size === 1024);
  var qm = QR.qrMatrix('test');
  ok('qr: matrix met zoek- en timingpatronen', qm.length === 21 && qm[0][0] === 1 &&
    qm[20][0] === 1 && qm[0][20] === 1 && qm[9][6] === 0 && qm[6][9] === 0 && qm[6][8] === 1);

  /* de in-app scanner: onze eigen encoder moet door de gevendorde jsQR-
     decoder heen te lezen zijn (rond-trip), zodat scannen echt werkt */
  var toRGBA = function (m, scale, quiet) {
    var n = m.length, size = (n + 2 * quiet) * scale;
    var data = new Uint8ClampedArray(size * size * 4);
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
      var dark = mx >= 0 && my >= 0 && mx < n && my < n && m[my][mx];
      var v = dark ? 0 : 255, idx = (y * size + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = v; data[idx + 3] = 255;
    }
    return { data: data, width: size, height: size };
  };
  var linkUrl = 'https://x/schaakheld/#SHLINK1:A1b2C3d4E5f6G7h8.z9Y8x7W6v5U4t3S2r1Q0';
  var img = toRGBA(QR.qrMatrix(linkUrl), 4, 4);
  var dec = jsQR(img.data, img.width, img.height);
  ok('scan: jsQR leest onze eigen koppel-QR terug', !!dec && dec.data === linkUrl);

  /* de payload-verwerkers dispatchen los van het URL-fragment (dat is wat de
     scanner ze voert): geldig -> true (opent de bevestiging via een fetch),
     kapot -> false */
  ACC = null;
  ok('scan: geldige koppel-payload geaccepteerd', handleLinkString('A1b2C3d4E5f6G7h8.z9Y8x7W6v5U4t3S2r1Q0') === true);
  for (var sq = 0; sq < 12; sq++) await null; /* confirmLinkFlow-fetch + modal laten draaien */
  closeModal();
  ok('scan: kapotte payload geweigerd', handleLinkString('geen-punt-hierin') === false);
  ok('scan: speel-payload opent "Meespelen?"', handlePlayString('zW_Mn7fF3mkK0q-UYDaVbw.G2brQ9_TwApaNNOCYGMTIw') === true &&
    __els.modalBox.innerHTML.indexOf('Meespelen') >= 0);
  fire(__els.mpNee, 'click');

  /* zonder camera (geen navigator.mediaDevices in de shim) valt de scanner
     netjes terug op een uitleg in plaats van te crashen */
  openScanner('play');
  ok('scan: zonder camera nette terugval', $('scanHint').textContent.indexOf('camera niet toe') >= 0 &&
    __els.modalBox.innerHTML.indexOf('scanVid') >= 0);
  fire(__els.scanTerug, 'click');
  closeModal();

  /* apparaat A: voortgang plus delen */
  ok('link: nog geen account', ACC === null);
  setPref('name', 'Oscar');
  bump('xp', 120);
  addBadge('vlam');
  var xpA = P.xp;
  await linkShareFlow();
  ok('link A: account aangemaakt', !!ACC && geldigAcc(ACC));
  var mHtml = __els.modalBox.innerHTML;
  ok('link A: QR en woordcode getoond', mHtml.indexOf('<svg') >= 0 &&
    /[a-z]+-[a-z]+-[a-z]+-[a-z]+/.test(mHtml));
  var code = mHtml.match(/([a-z]+-[a-z]+-[a-z]+-[a-z]+)/)[1];
  var urlA = linkURL();
  var accA = ACC;
  fire(__els.linkDone, 'click');
  for (var i = 0; i < 20; i++) await null; /* de ongewachte syncNow afmaken */
  ok('link A: profiel versleuteld op de server', !!__server.profiles[ACC.id] &&
    String.fromCharCode.apply(null, __server.profiles[ACC.id].blob).indexOf('Oscar') < 0);

  /* apparaat B: schoon, wisselt de vier woorden in */
  localStorage.removeItem('schaakheld1');
  clearAcc();
  loadProfile();
  ok('link B: begint leeg', P.xp === 0 && P.name === '');
  var accB = await redeemWords(code);
  ok('link B: woorden leveren credentials', !!accB && geldigAcc(accB) && accB.id === accA.id);
  ok('link B: code is eenmalig', (await redeemWords(code)) === null);
  ok('link B: verkeerde woorden falen stil', (await redeemWords('aap-aap-aap-aap')) === null);
  var remote = await fetchRemoteProfile(accB);
  ok('link B: profiel opgehaald en ontsleuteld', !!remote && remote.v === 2);
  finishLink(accB, remote);
  for (i = 0; i < 20; i++) await null;
  ok('link B: gekoppeld en gemerged', P.name === 'Oscar' && P.xp === xpA &&
    !!P.badges.vlam && !!ACC);
  ok('sync: fout secret krijgt niets', await (async function () {
    var r = await fetch(SYNC_URL + '/v1/profile/' + ACC.id,
      { headers: { Authorization: 'Bearer fout-secret-1234567890' } });
    return r.status === 404;
  })());

  /* QR-route op nog een vers apparaat: fragment binnen, bevestigen */
  localStorage.removeItem('schaakheld1');
  clearAcc();
  loadProfile();
  location.hash = urlA.slice(urlA.indexOf('#'));
  ok('link QR: fragment herkend en meteen gewist', checkLinkFragment() === true &&
    location.hash === '');
  for (i = 0; i < 20; i++) await null;
  ok('link QR: bevestiging noemt de naam', __els.modalBox.innerHTML.indexOf('Oscar') >= 0);
  fire(__els.linkYes, 'click');
  for (i = 0; i < 20; i++) await null;
  ok('link QR: gekoppeld na bevestiging', P.name === 'Oscar' && P.xp === xpA && !!ACC);

  /* de woordkiezer: suggesties uit de lijst, vier woorden, nette fout */
  localStorage.removeItem('schaakheld1');
  clearAcc();
  loadProfile();
  linkEntryFlow();
  $('wordInp').value = WOORDEN[0].slice(0, 3);
  fire(__els.wordInp, 'input');
  ok('kiezer: suggesties uit de lijst', __els.wordSugg.innerHTML.indexOf(WOORDEN[0]) >= 0);
  fire(__els.wordSugg, 'click', { target: { dataset: { w: WOORDEN[0] } } });
  fire(__els.wordSugg, 'click', { target: { dataset: { w: WOORDEN[1] } } });
  fire(__els.wordSugg, 'click', { target: { dataset: { w: WOORDEN[2] } } });
  ok('kiezer: pas bij vier woorden mag je door', __els.linkGo.disabled === true);
  fire(__els.wordSugg, 'click', { target: { dataset: { w: WOORDEN[3] } } });
  ok('kiezer: vier woorden gekozen', __els.linkGo.disabled === false &&
    __els.wordChips.textContent.indexOf(WOORDEN[3]) >= 0);
  fire(__els.linkGo, 'click');
  for (i = 0; i < 20; i++) await null;
  /* onbekende code: geen koppeling, kiezer leeg voor een nieuwe poging */
  ok('kiezer: onbekende code koppelt niet en maakt de kiezer leeg', ACC === null &&
    __els.wordChips.textContent === '' && !__els.overlay.classList.contains('hidden'));
  closeModal();

  /* sync na het spelen: de debounce duwt de nieuwe stand naar de server */
  finishLink(accB, null);
  for (i = 0; i < 20; i++) await null;
  bump('stars', 5);
  drainTimers();
  for (i = 0; i < 20; i++) await null;
  var opServer = await openJSON(ACC.secret, 'profiel', __server.profiles[ACC.id].blob);
  ok('sync: laatste stand versleuteld op de server', cntSum(opServer.cnt.stars || {}) >= 5);

  /* ---------- samen spelen: QR-route, potje, revanche, weg ---------- */
  var tikje = async function () { drainTimers(); for (var j = 0; j < 30; j++) await null; drainTimers(); };
  await mpHostQR();
  await tikje();
  ok('mp: kamer gemaakt en QR-wachtscherm', !!MP && MP.host === true &&
    __els.modalBox.innerHTML.indexOf('<svg') >= 0 &&
    __els.modalBox.innerHTML.indexOf('Wachten') >= 0);

  var gastTok = __server.wsrooms[MP.room].order[1];
  var maat = new WebSocket('ws://nep');
  maat.inbox = [];
  maat.onmessage = function (e) { maat.inbox.push(JSON.parse(e.data)); };
  await tikje();
  maat.send(JSON.stringify({ room: MP.room, seat: gastTok }));
  await tikje();
  maat.send(JSON.stringify({ t: 'hallo', naam: 'Fien' }));
  await tikje();
  ok('mp: verbonden-scherm met emoji-trio', __els.modalBox.innerHTML.indexOf('Fien') >= 0 &&
    __els.modalBox.innerHTML.indexOf(mpEmojiTrio(MP.room)) >= 0);
  ok('mp: maatje kreeg ons hallo', maat.inbox.some(function (m) { return m.t === 'hallo'; }));

  fire(__els.mpGo, 'click');
  await tikje();
  var startMsg = maat.inbox.filter(function (m) { return m.t === 'start'; })[0];
  ok('mp: potje gestart met complementaire kleuren', !!session && session.online === true &&
    MP.gameNo === 1 && !!startMsg && ((MP.myColor === 'w') === (startMsg.jij === 'b')));
  ok('mp: beurt volgt de kleur', (BD.mode === 'move') === (MP.myColor === 'w'));

  var maatZet = function (n) {
    var zm = legalMoves(session.S)[0];
    maat.send(JSON.stringify({ t: 'zet', from: zm.from, to: zm.to,
      promo: zm.promo || null, n: n, gameNo: MP.gameNo }));
  };
  if (MP.myColor === 'w') {
    commitKid(legalMoves(session.S).find(function (x) {
      return alg(x.from) === 'e2' && alg(x.to) === 'e4';
    }));
    await tikje();
    ok('mp: eigen zet verstuurd, beurt voorbij', BD.mode === 'off' &&
      maat.inbox.some(function (m) { return m.t === 'zet' && m.n === 1; }));
    maatZet(2);
    await tikje();
    ok('mp: zet van maatje toegepast', session.S.hist.length === 2 && BD.mode === 'move');
  } else {
    maatZet(1);
    await tikje();
    ok('mp: zet van maatje toegepast', session.S.hist.length === 1 && BD.mode === 'move');
    commitKid(legalMoves(session.S)[0]);
    await tikje();
    ok('mp: eigen zet verstuurd, beurt voorbij', BD.mode === 'off' &&
      maat.inbox.some(function (m) { return m.t === 'zet' && m.n === 2; }));
  }

  /* hersync: het maatje levert de zettenlijst, de client speelt na. Dit
     is de regressie voor de bug waar parseFEN de zetteller op 0 zette. */
  maat.inbox.length = 0;
  maat.send(JSON.stringify({ t: 'sync?' }));
  await tikje();
  var syncMsg = maat.inbox.filter(function (m) { return m.t === 'sync'; })[0];
  ok('mp: sync levert de zettenlijst', !!syncMsg && Array.isArray(syncMsg.moves) &&
    syncMsg.moves.length === session.S.hist.length && syncMsg.jij !== MP.myColor);
  /* de client vraagt na een gat zelf om sync; simuleer dat en lever een
     lijst met een extra zet van het maatje erin */
  var plyVoor = session.S.hist.length;
  var lijst = session.S.hist.map(function (u) { return { from: u.m.from, to: u.m.to, promo: u.m.promo || null }; });
  if (session.S.turn !== MP.myColor) {
    var extra = legalMoves(session.S)[0];
    lijst.push({ from: extra.from, to: extra.to, promo: extra.promo || null });
  }
  MP.syncWanted = true;
  maat.send(JSON.stringify({ t: 'sync', moves: lijst, jij: MP.myColor === 'w' ? 'b' : 'w', gameNo: 1, over: false }));
  await tikje();
  ok('mp: hersync herstelt zetteller (geen reset naar 0)',
    session.S.hist.length === lijst.length && session.S.hist.length >= plyVoor &&
    BD.mode === (session.S.turn === MP.myColor ? 'move' : 'off'));
  /* na de hersync loopt het tellen door: de volgende in-orde zet past nog */
  if (session.S.turn === MP.myColor) {
    var n0 = session.S.hist.length;
    commitKid(legalMoves(session.S)[0]);
    await tikje();
    ok('mp: eigen zet na hersync verstuurd met juist volgnummer',
      maat.inbox.some(function (m) { return m.t === 'zet' && m.n === n0 + 1; }));
  }

  /* vals spel: het maatje probeert onze eigen kleur te zetten -> geweigerd */
  session.S = MP.myColor === 'w' ? parseFEN('8/8/8/8/8/8/4P3/4K1k1 w - - 0 1')
    : parseFEN('4k1K1/4p3/8/8/8/8/8/8 b - - 0 1');
  BD.mode = 'move';
  var histVals = session.S.hist.length;
  maat.send(JSON.stringify({ t: 'zet', from: sqFromAlg('e2'), to: sqFromAlg('e4'),
    promo: null, n: histVals + 1, gameNo: MP.gameNo }));
  await tikje();
  ok('mp: maatje mag onze kleur niet zetten', session.S.hist.length === histVals);

  /* mat vanuit de eigen kleur: winst NIET in de gedeelde teller (anti-farm),
     wel in winsOnline; revanche aangeboden */
  session.S = MP.myColor === 'w'
    ? parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    : parseFEN('r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
  BD.mode = 'move';
  var winsVoor = P.wins, onlineVoor = P.c.winsOnline || 0;
  commitKid(legalMoves(session.S).find(function (x) {
    return alg(x.to) === (MP.myColor === 'w' ? 'a8' : 'a1');
  }));
  await tikje();
  ok('mp: winst alleen in winsOnline, niet in P.wins', session.over === true &&
    P.wins === winsVoor && (P.c.winsOnline || 0) === onlineVoor + 1 &&
    __els.modalBox.innerHTML.indexOf('JIJ WINT') >= 0 &&
    __els.modalBox.innerHTML.indexOf('Revanche') >= 0);

  var kleurVoor = MP.myColor;
  fire(__els.mpRev, 'click');
  await tikje();
  maat.send(JSON.stringify({ t: 'revanche' }));
  await tikje();
  ok('mp: revanche wisselt kleur en start opnieuw', MP.gameNo === 2 &&
    MP.myColor !== kleurVoor && session.S.hist.length === 0 && session.over === false &&
    maat.inbox.some(function (m) { return m.t === 'start' && m.n === 2; }));

  /* vals spel: de gast (het maatje) probeert met een 'start' het potje te
     resetten; de host deelt de kleuren uit, dus dit hoort genegeerd te
     worden */
  var kleurNu = MP.myColor, gnNu = MP.gameNo;
  commitKid(legalMoves(session.S).find(function (x) { return alg(x.from) === 'e2' && alg(x.to) === 'e4'; }));
  await tikje();
  maat.send(JSON.stringify({ t: 'start', jij: MP.myColor === 'w' ? 'w' : 'b', n: 99 }));
  await tikje();
  ok('mp: host negeert een start van de gast', MP.myColor === kleurNu &&
    MP.gameNo === gnNu && session.S.hist.length === 1);

  /* het maatje stopt ermee */
  maat.send(JSON.stringify({ t: 'weg' }));
  await tikje();
  ok('mp: afscheid als het maatje stopt', MP === null &&
    __els.modalBox.innerHTML.indexOf('gestopt') >= 0);
  fire(__els.mpWegOk, 'click');
  await tikje();

  /* ---------- samen spelen: gast via de speel-QR ---------- */
  var r2 = await (await fetch(SYNC_URL + '/v1/room', { method: 'POST' })).json();
  var hostSock = new WebSocket('ws://nep');
  hostSock.inbox = [];
  hostSock.onmessage = function (e) { hostSock.inbox.push(JSON.parse(e.data)); };
  await tikje();
  hostSock.send(JSON.stringify({ room: r2.room, seat: r2.seat }));
  await tikje();
  location.hash = '#SHPLAY1:' + r2.room + '.' + r2.guest;
  ok('mp gast: speelfragment herkend en gewist', checkPlayFragment() === true &&
    location.hash === '');
  fire(__els.mpJa, 'click');
  await tikje();
  hostSock.send(JSON.stringify({ t: 'hallo', naam: 'Mo' }));
  await tikje();
  ok('mp gast: wachten tot de host start', __els.modalBox.innerHTML.indexOf('Mo') >= 0 &&
    __els.modalBox.innerHTML.indexOf('start drukt') >= 0);
  hostSock.send(JSON.stringify({ t: 'start', jij: 'b', n: 1 }));
  await tikje();
  ok('mp gast: potje als zwart, wit is aan zet', !!session && session.online === true &&
    MP.myColor === 'b' && BD.mode === 'off');
  var wz = legalMoves(session.S)[0];
  hostSock.send(JSON.stringify({ t: 'zet', from: wz.from, to: wz.to, promo: null, n: 1, gameNo: 1 }));
  await tikje();
  ok('mp gast: zet van de host toegepast', session.S.hist.length === 1 && BD.mode === 'move');
  ok('mp gast: hallo en hersync-vraag verstuurd', hostSock.inbox.some(function (m) {
    return m.t === 'hallo';
  }));
  /* de zwartspeler moet zijn eigen stukken via het bord kunnen aanraken en
     zetten (regressie: onCell was op wit vastgezet) */
  hostSock.inbox.length = 0;
  var zwZet = legalMoves(session.S).find(function (x) { return colorOf(session.S.board[x.from]) === 'b'; });
  onCell(zwZet.from);
  ok('mp gast: zwart stuk selecteerbaar via het bord', BD.sel === zwZet.from && BD.dots.has(zwZet.to));
  onCell(zwZet.to);
  await tikje();
  ok('mp gast: zwarte zet via het bord gespeeld en verstuurd',
    session.S.hist.length === 2 && hostSock.inbox.some(function (m) { return m.t === 'zet' && m.n === 2; }));
  mpVerlaat();
  await tikje();
  ok('mp gast: netjes weggegaan', MP === null &&
    hostSock.inbox.some(function (m) { return m.t === 'weg'; }));

  /* herverbinden geeft na een budget op en zegt het eerlijk: de kamer
     bestaat niet (meer), dus de socket opent wel maar wordt meteen gesloten
     zonder welkom. Zonder de onopen->welkom-fix zou dit eeuwig stil door
     reconnecten. */
  session = { kind: 'game', online: true, over: false, myColor: 'w', S: newGame() };
  showScreen('play');
  mpStart('kamerdiENIETbestaat', 'stoeltokendatNIETbestaat', true);
  /* de wachttijd loopt op tot tien seconden; het venster moet daaroverheen */
  for (i = 0; i < 80 && MP; i++) { drainTimers(400, 12000); await null; await null; }
  ok('mp: geeft na te veel mislukte herverbindingen op en meldt het',
    MP === null && __els.modalBox.innerHTML.indexOf('verbinding is weg') >= 0);
  fire(__els.meldOk, 'click');
  await tikje();

  /* het opgeef-budget gaat pas op nul als een verbinding ook blijft staan:
     een stoeltje dat telkens binnen een seconde weer dichtgaat telt niet,
     en de wachttijd tussen pogingen loopt daarbij op in plaats van elke
     keer terug naar een seconde */
  var kFlap = await (await fetch(SYNC_URL + '/v1/room', { method: 'POST' })).json();
  var welkoms = 0, maxBackoff = 0, oMsg = mpMsg;
  mpMsg = function (m) {
    if (m && m.t === 'welkom') {
      welkoms++;
      maxBackoff = Math.max(maxBackoff, MP.backoff);
      setTimeout(function () { if (MP && MP.ws) MP.ws.close(); }, 1000);
    }
    return oMsg(m);
  };
  session = { kind: 'game', online: true, over: false, myColor: 'w', S: newGame() };
  showScreen('play');
  mpStart(kFlap.room, kFlap.seat, true);
  for (i = 0; i < 80 && MP; i++) { drainTimers(400, 12000); await null; await null; }
  ok('mp: een verbinding die telkens meteen wegvalt telt niet als geslaagd en wacht steeds langer',
    MP === null && welkoms === 9 && maxBackoff === 10000 &&
    __els.modalBox.innerHTML.indexOf('verbinding is weg') >= 0);
  mpMsg = oMsg;
  fire(__els.meldOk, 'click');
  await tikje();

  var kVast = await (await fetch(SYNC_URL + '/v1/room', { method: 'POST' })).json();
  mpStart(kVast.room, kVast.seat, true);
  drainTimers(400, 1000);
  for (i = 0; i < 30; i++) await null;
  MP.ws.close(); /* één hik */
  drainTimers(400, 3000);
  for (i = 0; i < 30; i++) await null;
  ok('mp: na een hik is het herverbinden nog niet meteen een geslaagde verbinding',
    !!MP && MP.open === true && MP.pogingen === 1);
  drainTimers(400, 6000);
  for (i = 0; i < 30; i++) await null;
  ok('mp: na vijf seconden blijven staan is het budget weer vol',
    !!MP && MP.pogingen === 0 && MP.backoff === 1000);
  mpStop();
  await tikje();

  /* ---------- wederzijdse woordcodes tegen de nep-server ---------- */
  var hA = await lookupCode('SHPLAY1-zoek:', 'boom-vis');
  var hB = await lookupCode('SHPLAY1-zoek:', 'roos-kat');
  var pb = function (mine, theirs) {
    return fetch(SYNC_URL + '/v1/pair', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mine: mine, theirs: theirs }) });
  };
  ok('pair: eerste kant wacht', (await pb(hA, hB)).status === 204);
  var p2 = await pb(hB, hA);
  var d2 = await p2.json();
  var p3 = await pb(hA, hB);
  var d3 = await p3.json();
  ok('pair: wederzijds aanwijzen koppelt, eerste kant is host', p2.status === 200 &&
    p3.status === 200 && d3.room === d2.room && d3.seat !== d2.seat &&
    d3.host === true && d2.host === false);

  /* anti-farm (memo): een online winst geeft NOOIT XP en telt niet mee voor
     de gedeelde 'wins'-teller of de week-wins; wel winsOnline en het
     weekdoel "potjes met een vriend". */
  var xpVoor = P.xp, pWinsVoor = P.wins, onlineVoor2 = P.c.winsOnline || 0;
  var wkWinsVoor = wkGet(curWeek(), 'wins1') + wkGet(curWeek(), 'wins2') + wkGet(curWeek(), 'wins3');
  var wkOnlineVoor = wkGet(curWeek(), 'online');
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'X', open: false, weg: false };
  session = { kind: 'game', online: true, myColor: 'w', over: false,
    S: parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1') };
  BD.mode = 'move';
  commitKid(legalMoves(session.S).find(function (x) { return alg(x.to) === 'a8'; }));
  drainTimers();
  for (i = 0; i < 20; i++) await null;
  ok('mp: online winst geeft geen XP en raakt de HUD-wins niet',
    P.xp === xpVoor && P.wins === pWinsVoor && (P.c.winsOnline || 0) === onlineVoor2 + 1);
  ok('mp: online potje telt voor de week als "met een vriend", niet als Turbo-winst',
    wkGet(curWeek(), 'online') === wkOnlineVoor + 1 &&
    wkGet(curWeek(), 'wins1') + wkGet(curWeek(), 'wins2') + wkGet(curWeek(), 'wins3') === wkWinsVoor);
  closeModal();
  mpStop();

  /* remise online: BEIDE spelers horen 'Gelijkspel' te zien. Regressie voor
     de bug waar gameStatus altijd result 'd' teruggaf, zodat de remise-tak
     nooit aansloeg en allebei de kinderen te horen kregen dat ze verloren
     hadden van de ander. We spelen dezelfde patstelling een keer als wit en
     een keer als zwart. */
  var remiseTest = async function (kleur) {
    MP = { room: 'r', seat: 's', host: true, myColor: kleur, gameNo: 1, revMine: false,
      revTheirs: false, peerName: 'Fien', open: false, weg: false };
    session = { kind: 'game', online: true, myColor: kleur, over: false,
      S: parseFEN(kleur === 'w' ? '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1'
        : '5q2/8/8/8/8/6k1/8/7K b - - 0 1') };
    BD.mode = 'move';
    commitKid(legalMoves(session.S).find(function (x) {
      return alg(x.from) === (kleur === 'w' ? 'f1' : 'f8') &&
        alg(x.to) === (kleur === 'w' ? 'f7' : 'f2');
    }));
    drainTimers();
    for (var k = 0; k < 20; k++) await null;
    var html = __els.modalBox.innerHTML;
    closeModal();
    mpStop();
    return html;
  };
  var remiseW = await remiseTest('w');
  ok('mp: remise als wit heet gelijkspel, niet verloren',
    remiseW.indexOf('Gelijkspel') >= 0 && remiseW.indexOf('wint dit potje') < 0 &&
    remiseW.indexOf('Schaakmat') < 0 && remiseW.indexOf('Pat!') >= 0);
  var remiseB = await remiseTest('b');
  ok('mp: remise als zwart heet gelijkspel, niet verloren',
    remiseB.indexOf('Gelijkspel') >= 0 && remiseB.indexOf('wint dit potje') < 0 &&
    remiseB.indexOf('Schaakmat') < 0 && remiseB.indexOf('Pat!') >= 0);

  /* stoppen vraagt eerst: de knop zit vlak genoeg bij het bord om per
     ongeluk aangetikt te worden, dus een enkele tik mag nooit een potje
     kosten. En hij hoort onderaan de kolom te staan, niet tegen het bord. */
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'Fien', open: false, weg: false };
  mpBeginGame();
  ok('mp: stopknop staat onderaan, niet tegen het bord',
    __els.actionRow.classList.contains('onderaan'));
  /* een potje verlaat je niet zomaar: de knop is opgeven, en die vraagt eerst */
  fire(actionBtns.mpStopBtn, 'click');
  ok('mp: opgeven vraagt eerst om bevestiging',
    __els.modalBox.innerHTML.indexOf('Opgeven?') >= 0 && __els.modalBox.innerHTML.indexOf('Fien') >= 0 &&
    !!MP && !!session && session.over !== true);
  fire(__els.rsNee, 'click');
  ok('mp: doorspelen laat het potje staan',
    !!MP && !!session && session.online === true && session.over !== true &&
    __els.overlay.classList.contains('hidden'));
  /* opgeven: het potje is voorbij, het maatje wint, de kamer blijft voor revanche */
  var gpVoor = P.c.gamesPlayed;
  fire(actionBtns.mpStopBtn, 'click');
  fire(__els.rsJa, 'click');
  await tikje();
  ok('mp: na ja is het potje afgelopen en wint het maatje', !!MP && !!session && session.over === true &&
    __els.modalBox.innerHTML.indexOf('Fien wint dit potje') >= 0 && __els.modalBox.innerHTML.indexOf('Je gaf op') >= 0 &&
    __els.modalBox.innerHTML.indexOf('Revanche') >= 0);
  ok('mp: vroeg opgeven telt niet als gespeeld potje', P.c.gamesPlayed === gpVoor);
  closeModal();
  mpStop();

  /* ← Home midden in een potje is ook opgeven en vraagt dus ook */
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'Fien', open: false, weg: false };
  mpBeginGame();
  fire(__els.backBtn, 'click');
  ok('mp: ← Home vraagt ook eerst',
    __els.modalBox.innerHTML.indexOf('Opgeven?') >= 0 && !!MP && session.over !== true);
  fire(__els.rsJa, 'click');
  await tikje();
  ok('mp: ← Home geeft na ja op', session.over === true);
  closeModal();
  fire(__els.backBtn, 'click');
  ok('mp: na afloop gaat ← Home gewoon naar huis', MP === null && session === null);

  /* het maatje geeft op: wij winnen, zonder XP en zonder gedeelde wins */
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'Fien', open: false, weg: false };
  mpBeginGame();
  var xpO = P.xp, winsO = P.wins;
  mpMsg({ t: 'opgave', gameNo: 1 });
  ok('mp: opgave van het maatje = jij wint', session.over === true && P.xp === xpO && P.wins === winsO &&
    __els.modalBox.innerHTML.indexOf('JIJ WINT') >= 0 && __els.modalBox.innerHTML.indexOf('geeft op') >= 0);
  closeModal();
  mpStop();

  /* remise aanbieden en aannemen, over de relay */
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'Fien', open: false, weg: false };
  mpBeginGame();
  mpMsg({ t: 'remise?', gameNo: 1 });
  ok('mp: remise-aanbod van het maatje vraagt jou', __els.modalBox.innerHTML.indexOf('Fien biedt remise aan') >= 0);
  fire(__els.rmNee, 'click');
  ok('mp: nee = doorspelen', session.over !== true && __els.overlay.classList.contains('hidden'));
  mpMsg({ t: 'remise?', gameNo: 1 });
  fire(__els.rmJa, 'click');
  await tikje();
  ok('mp: ja = gelijkspel', session.over === true && __els.modalBox.innerHTML.indexOf('Gelijkspel') >= 0);
  closeModal();
  mpStop();
  /* ons eigen aanbod: alleen een antwoord op een echt aanbod telt */
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'Fien', open: false, weg: false };
  mpBeginGame();
  mpMsg({ t: 'remise', ok: true, gameNo: 1 });
  ok('mp: een ongevraagd "remise ok" eindigt niets', session.over !== true);
  offerDraw();
  ok('mp: aanbod gedaan, wachten', session.drawAsked === 0 && __els.bubble.innerHTML.indexOf('remise aan') >= 0);
  mpMsg({ t: 'remise', ok: false, gameNo: 1 });
  ok('mp: afgewezen aanbod = doorspelen', session.over !== true && __els.bubble.innerHTML.indexOf('doorspelen') >= 0);
  offerDraw();
  ok('mp: niet meteen nog eens vragen', __els.bubble.innerHTML.indexOf('net al') >= 0);
  mpMsg({ t: 'remise', ok: true, gameNo: 1 });
  ok('mp: aangenomen aanbod = gelijkspel', session.over === true && __els.modalBox.innerHTML.indexOf('Gelijkspel') >= 0);
  closeModal();
  mpStop();

  /* ---------- vrienden: worden (ECDH over de relay), uitnodigen (brievenbus), weghalen ---------- */
  goHome();
  DOC.friends = {}; P.friends = DOC.friends;
  /* de nep-crypto moet verschillende uitwisselingen ook echt verschillende
     geheimen geven, anders lopen twee vriendschappen in de tests stil in
     elkaar over */
  var proefGeheim = {};
  for (i = 0; i < 40; i++) {
    var pA = await ecdhStart(), pB = await ecdhStart();
    proefGeheim[await ecdhFinish(pA.kp, pB.pub)] = 1;
  }
  ok('nep-crypto: veertig uitwisselingen geven veertig verschillende geheimen',
    Object.keys(proefGeheim).length === 40);
  var vk = __nieuweKamer();
  mpStart(vk.id, vk.host, true);
  var vmaat = new WebSocket('ws://nep');
  vmaat.inbox = [];
  vmaat.onmessage = function (e) { vmaat.inbox.push(JSON.parse(e.data)); };
  await tikje();
  vmaat.send(JSON.stringify({ room: vk.id, seat: vk.gast }));
  await tikje();
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila' }));
  await tikje();
  closeModal();
  /* een afgelopen online potje biedt "vrienden worden" aan, tenzij je al vrienden bent */
  session = { kind: 'game', online: true, myColor: 'w', over: false, S: parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1') };
  BD.mode = 'move';
  commitKid(legalMoves(session.S).find(function (x) { return alg(x.to) === 'a8'; }));
  await tikje();
  ok('vriend: eindscherm biedt vrienden worden aan', __els.modalBox.innerHTML.indexOf('Vrienden worden') >= 0);
  fire(__els.mpVriend, 'click');
  await tikje();
  var vraag = vmaat.inbox.filter(function (m) { return m.t === 'vriend?'; })[0];
  ok('vriend: vraag met publieke sleutel over de relay, K zelf niet', !!vraag && geldigePub(vraag.pub) && !vraag.k && !!MP.ecdh);
  /* het maatje zegt ja: eigen sleutelpaar, antwoord met zijn publieke sleutel */
  var mKp = await ecdhStart();
  var mK = await ecdhFinish(mKp.kp, vraag.pub);
  vmaat.send(JSON.stringify({ t: 'vriend', pub: mKp.pub }));
  await tikje();
  var fids = Object.keys(P.friends);
  ok('vriend: opgeslagen in de CRDT met hetzelfde geheim als het maatje', fids.length === 1 &&
    P.friends[fids[0]].k === mK && P.friends[fids[0]].host === true && P.friends[fids[0]].naam === 'Mila' &&
    fids[0] === (await sha256hex(mK)).slice(0, 16) && !!DOC.friends[fids[0]]);
  ok('vriend: bevestiging met dezelfde drie plaatjes', __els.modalBox.innerHTML.indexOf('nu vrienden') >= 0 &&
    __els.modalBox.innerHTML.indexOf(friendTrio(mK)) >= 0 && MP.viaFriend === fids[0]);
  ok('vriend: bevestiging biedt revanche en stoppen', !!__els.vrOk && __els.modalBox.innerHTML.indexOf('Revanche') >= 0);
  fire(__els.vrEind, 'click');
  await tikje();
  var fid = fids[0];
  /* later nog eens samen spelen via een verse kamer: het hallo draagt per
     vriend een bewijs uit K en het kamernummer, dus herkennen de twee
     elkaar en wordt "vrienden worden" niet nog eens aangeboden - dat zou
     een tweede geheim met dezelfde persoon maken */
  mpStart(vk.id, vk.host, true);
  await tikje();
  var onsHallo = vmaat.inbox.filter(function (m) { return m.t === 'hallo'; }).pop();
  var bewijsMila = b64url(await hkdfBits(mK, 'hallo-' + vk.id, 12));
  ok('bewijs: ons hallo draagt het bewijs dat alleen Mila kan narekenen, tussen willekeur die niets zegt',
    !!onsHallo && Array.isArray(onsHallo.bewijzen) && onsHallo.bewijzen.length === MAX_FRIENDS &&
    onsHallo.bewijzen.indexOf(bewijsMila) >= 0 && onsHallo.bewijzen.indexOf(mK) < 0 &&
    onsHallo.bewijzen.every(function (b) { return /^[A-Za-z0-9_-]{16}$/.test(b); }));
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila', bewijzen: [bewijsMila] }));
  await tikje();
  ok('bewijs: wij herkennen Mila aan haar bewijs', MP.viaFriend === fid);
  closeModal();
  session = { kind: 'game', online: true, myColor: 'w', over: false, S: parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1') };
  BD.mode = 'move';
  commitKid(legalMoves(session.S).find(function (x) { return alg(x.to) === 'a8'; }));
  await tikje();
  ok('bewijs: het eindscherm biedt geen tweede vriendschap aan',
    __els.modalBox.innerHTML.indexOf('JIJ WINT') >= 0 && __els.modalBox.innerHTML.indexOf('Vrienden worden') < 0);
  closeModal();
  session = null;
  /* een bewijs uit een andere kamer telt niet, en rommel evenmin */
  mpStop();
  mpStart(vk.id, vk.host, true);
  await tikje();
  var bewijsElders = b64url(await hkdfBits(mK, 'hallo-andere-kamer', 12));
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila', bewijzen: [bewijsElders] }));
  await tikje();
  ok('bewijs: een bewijs uit een andere kamer herkent niets', MP.viaFriend == null);
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila', bewijzen: 'geen lijst' }));
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila', bewijzen: [1, null, {}, 'kort', 'x'.repeat(400)] }));
  await tikje();
  ok('bewijs: rommel in het hallo doet niets en breekt niets', MP.viaFriend == null && !!MP && MP.peerOn === true);
  modalQueue.length = 0;
  closeModal();
  /* de relay leest hoogstens 4 KB per bericht (maxWsBytes in room.go), dus
     ook het hallo van een kind met een volle vriendenlijst moet passen */
  var echteVrienden = P.friends;
  P.friends = {};
  for (i = 0; i < MAX_FRIENDS + 5; i++) {
    P.friends['vriendje' + i] = { k: 'geheim-nummer-' + i + '-abcdefghij', naam: 'V' + i, host: true, weg: false, since: 1 };
  }
  mpStop();
  mpStart(vk.id, vk.host, true);
  await tikje();
  var volHallo = vmaat.inbox.filter(function (m) { return m.t === 'hallo'; }).pop();
  ok('bewijs: ook met een volle vriendenlijst blijft het hallo even lang en onder de 4 KB van de relay',
    !!volHallo && volHallo.bewijzen.length === MAX_FRIENDS && JSON.stringify(volHallo).length < 4096 &&
    volHallo.bewijzen.length === onsHallo.bewijzen.length);
  P.friends = echteVrienden;
  vmaat.send(JSON.stringify({ t: 'hallo', naam: 'Mila' })); /* haar naam terug op de verse verbinding */
  await tikje();
  modalQueue.length = 0;
  closeModal();
  /* andersom: het maatje vraagt, wij zeggen nee en daarna ja */
  MP.viaFriend = null;
  var mKp2 = await ecdhStart();
  vmaat.send(JSON.stringify({ t: 'vriend?', pub: mKp2.pub }));
  await tikje();
  ok('vriend: vraag van het maatje = modal', __els.modalBox.innerHTML.indexOf('Mila wil vrienden worden') >= 0);
  fire(__els.vrNee, 'click');
  await tikje();
  ok('vriend: nee gaat terug', vmaat.inbox.some(function (m) { return m.t === 'vriend' && m.nee === true; }));
  vmaat.send(JSON.stringify({ t: 'vriend?', pub: mKp2.pub }));
  await tikje();
  fire(__els.vrJa, 'click');
  await tikje();
  var antw = vmaat.inbox.filter(function (m) { return m.t === 'vriend' && m.pub; })[0];
  var mK2 = await ecdhFinish(mKp2.kp, antw.pub);
  var fid2 = (await sha256hex(mK2)).slice(0, 16);
  ok('vriend: als ja-zegger opgeslagen met rol b', !!P.friends[fid2] && P.friends[fid2].host === false && P.friends[fid2].k === mK2);
  closeModal();
  ok('vriend: kapotte sleutel wordt genegeerd', (function () { mpOnVriendVraag({ t: 'vriend?', pub: 'x<script>' }); return __els.overlay.classList.contains('hidden'); })());
  /* zijn vraag komt binnen terwijl het eindscherm nog open staat: dan wacht
     hij in de rij en zien wij hem niet. Tikken wij dan zelf op "vrienden
     worden", dan is dat ja zeggen op zijn vraag. Twee losse vragen zouden
     twee geheimen maken, waarvan de ander er maar een kent. */
  MP.viaFriend = null;
  MP.hunVraag = null;
  var voorDub = Object.keys(P.friends).length;
  vmaat.inbox.length = 0;
  showModal('<div class="m-emoji">🏆</div><h2>JIJ WINT!</h2>', function () {});
  var dubKp = await ecdhStart();
  vmaat.send(JSON.stringify({ t: 'vriend?', pub: dubKp.pub }));
  await tikje();
  ok('vriend: zijn vraag wacht achter het eindscherm', modalQueue.length === 1 &&
    __els.modalBox.innerHTML.indexOf('JIJ WINT') >= 0);
  await vriendVragen();
  for (i = 0; i < 30; i++) await null;
  await tikje();
  var dubAntw = vmaat.inbox.filter(function (m) { return m.t === 'vriend' && m.pub; })[0];
  var dubK = dubAntw ? await ecdhFinish(dubKp.kp, dubAntw.pub) : null;
  var dubFid = dubK ? (await sha256hex(dubK)).slice(0, 16) : null;
  ok('vriend: zelf vragen is dan ja zeggen, één vriendschap met hetzelfde geheim',
    !vmaat.inbox.some(function (m) { return m.t === 'vriend?'; }) &&
    Object.keys(P.friends).length === voorDub + 1 && !!dubFid && !!P.friends[dubFid] &&
    P.friends[dubFid].k === dubK && P.friends[dubFid].host === false);
  ok('vriend: de wachtende vraag is weg en kan niet alsnog beantwoord worden',
    modalQueue.length === 0 && __els.modalBox.innerHTML.indexOf('wil vrienden worden') < 0 &&
    MP.hunVraag === null);
  /* en andersom: is de vraag wel op tijd te zien, dan blijft ja zeggen ja zeggen */
  setFriend(dubFid, Object.assign({}, P.friends[dubFid], { weg: true }));
  closeModal();
  await tikje();
  /* allebei tegelijk gevraagd: één K aan beide kanten, geen dubbele vrienden */
  MP.viaFriend = null;
  var voorKruis = Object.keys(P.friends).length;
  await vriendVragen();
  await tikje();
  var onzePub = MP.ecdh.pub;
  var kruisKp = await ecdhStart();
  vmaat.send(JSON.stringify({ t: 'vriend?', pub: kruisKp.pub }));
  await tikje();
  var wijKleiner = onzePub < kruisKp.pub;
  var kruisAntw = vmaat.inbox.filter(function (m) { return m.t === 'vriend' && m.pub === onzePub; }).length;
  ok('vriend: gekruiste vraag, de kant met de kleinste sleutel antwoordt', wijKleiner ? (kruisAntw === 1 && MP.ecdh === null) : (kruisAntw === 0 && !!MP.ecdh));
  if (!wijKleiner) {
    /* het maatje is de kleinste: die antwoordt met zijn eigen sleutel op onze vraag */
    vmaat.send(JSON.stringify({ t: 'vriend', pub: kruisKp.pub }));
    await tikje();
  }
  var kKruis = await ecdhFinish(kruisKp.kp, onzePub);
  var fidKruis = (await sha256hex(kKruis)).slice(0, 16);
  ok('vriend: gekruist levert aan beide kanten hetzelfde geheim, precies één nieuwe vriend',
    !!P.friends[fidKruis] && P.friends[fidKruis].k === kKruis && Object.keys(P.friends).length === voorKruis + 1 &&
    P.friends[fidKruis].host === !wijKleiner);
  closeModal();
  setFriend(fidKruis, Object.assign({}, P.friends[fidKruis], { weg: true }));
  mpStop();
  setFriend(fid2, Object.assign({}, P.friends[fid2], { weg: true }));
  goHome();
  showHomeTab('vrienden');
  ok('vriend: lijst toont Mila met uitnodigen', __els.friendList.innerHTML.indexOf('Mila') >= 0 &&
    __els.friendList.innerHTML.indexOf('data-invite="' + fid + '"') >= 0 && __els.friendList.innerHTML.indexOf(fid2) < 0);

  /* uitnodigen: briefje in de bus van Mila, kamer als host, wachten */
  await inviteFriend(fid);
  for (i = 0; i < 20; i++) await null;
  var bussen = Object.keys(__server.buses);
  ok('uitnodiging: briefje ligt in precies één bus en wij wachten als host', bussen.length === 1 && !!INV && INV.bus === bussen[0] &&
    !!MP && MP.host === true && MP.viaFriend === fid && __els.modalBox.innerHTML.indexOf('Wachten op Mila') >= 0);
  var theirBus = await busFor(P.friends[fid], theirRole(P.friends[fid]));
  ok('uitnodiging: de bus is die van Mila (rol b) en het briefje is versleuteld', bussen[0] === theirBus.bus &&
    __server.buses[bussen[0]].blob.indexOf(MP.room) < 0);
  ok('uitnodiging: zonder K is het briefje niet te lezen', await (async function () {
    try { await openJSON('verkeerd-geheim-12345678901234567890', 'uitnodiging', b64urlBytes(__server.buses[bussen[0]].blob)); return false; }
    catch (e) { return true; }
  })());
  renderFriends();
  ok('uitnodiging: lijst toont het wachten', __els.friendList.innerHTML.indexOf('Wachten tot Mila') >= 0 &&
    __els.friendList.innerHTML.indexOf('data-cancel') >= 0);
  var kamerInv = MP.room;
  /* nu de kant van Mila: zelfde geheim, andere rol. Haar app vraagt haar bus op. */
  var mijnInv = INV; INV = null;
  closeModal();
  mpStop(); session = null;
  setFriend(fid, Object.assign({}, P.friends[fid], { host: false }));
  seenInv = [];
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('uitnodiging: Mila ziet "wil een potje spelen"', __els.modalBox.innerHTML.indexOf('wil een potje spelen') >= 0);
  fire(__els.invJa, 'click');
  await tikje();
  ok('uitnodiging: ja = gast in dezelfde kamer via het gasttoken', !!MP && MP.host === false && MP.room === kamerInv &&
    MP.seat === __server.wsrooms[kamerInv].order[1] && MP.viaFriend === fid);
  closeModal();
  mpStop(); session = null;
  /* hetzelfde briefje komt niet nog eens omhoog */
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('uitnodiging: een gezien briefje komt niet terug', __els.overlay.classList.contains('hidden'));
  /* een briefje dat niet getoond kon worden (kind was net iets anders begonnen)
     is niet 'gezien' en komt de volgende ronde terug */
  seenInv = [];
  session = { kind: 'scan' };
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  session = null;
  ok('uitnodiging: druk = niet gemarkeerd, later opnieuw', seenInv.length === 0);
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('uitnodiging: en dan wel getoond', __els.modalBox.innerHTML.indexOf('wil een potje spelen') >= 0 && seenInv.length === 1);
  fire(__els.invNee, 'click');
  /* twee vrienden nodigen elkaar tegelijk uit: rol b (wij, host=false) krijgt
     de vraag te zien en houdt zijn eigen uitnodiging tot het kind ja zegt */
  seenInv = [];
  INV = { fid: fid, bus: 'x'.repeat(64), bewijs: 'y'.repeat(20) };
  MP = { room: 'r', seat: 's', host: true, myColor: null, gameNo: 0, open: false, weg: false, ws: null };
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('uitnodiging: gekruist, rol b krijgt de vraag en houdt zolang zijn eigen uitnodiging',
    INV !== null && __els.modalBox.innerHTML.indexOf('wil een potje spelen') >= 0);
  fire(__els.invNee, 'click');
  ok('uitnodiging: nu niet = ons eigen wachtscherm komt terug',
    INV !== null && __els.modalBox.innerHTML.indexOf('Wachten op Mila') >= 0);
  closeModal();
  /* wel ja zeggen: dan pas gaat onze eigen uitnodiging eraan */
  seenInv = [];
  INV = { fid: fid, bus: 'x'.repeat(64), bewijs: 'y'.repeat(20) };
  MP = { room: 'r', seat: 's', host: true, myColor: null, gameNo: 0, open: false, weg: false, ws: null };
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  fire(__els.invJa, 'click');
  for (i = 0; i < 30; i++) await null;
  await tikje();
  ok('uitnodiging: ja = eigen uitnodiging weg, wij zijn gast in zijn kamer',
    INV === null && !!MP && MP.host === false && MP.viaFriend === fid);
  mpStop(); MP = null;
  closeModal();
  /* rol a laat de eigen uitnodiging staan en negeert de gekruiste */
  seenInv = [];
  setFriend(fid, Object.assign({}, P.friends[fid], { host: true }));
  INV = { fid: fid, bus: 'x'.repeat(64), bewijs: 'y'.repeat(20) };
  MP = { room: 'r', seat: 's', host: true, myColor: null, gameNo: 0, open: false, weg: false, ws: null };
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('uitnodiging: gekruist, rol a wacht op de ander', INV !== null && __els.overlay.classList.contains('hidden') && seenInv.length === 0);
  INV = null; MP = null;
  setFriend(fid, Object.assign({}, P.friends[fid], { host: false }));
  clearTimeout(friendPollTimer);
  /* terug naar onze kant: intrekken wist het briefje */
  setFriend(fid, Object.assign({}, P.friends[fid], { host: true }));
  INV = mijnInv;
  await inviteClear();
  for (i = 0; i < 20; i++) await null;
  ok('uitnodiging: intrekken wist de bus', Object.keys(__server.buses).length === 0 && INV === null);
  /* een bus-briefje van een vreemde (fout bewijs) komt er niet in */
  var r400 = await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {}, body: JSON.stringify({ bus: theirBus.bus, bewijs: 'ander-bewijs-1234567890', blob: 'x' }) });
  ok('uitnodiging: zonder het juiste bewijs weigert de server', r400.status === 400);

  /* de rest van de bus-semantiek uit bus.go: een briefje blijft tien minuten
     liggen, een te groot briefje mag niet, meer dan 64 bussen tegelijk
     opvragen ook niet, en vol is vol */
  INV = null; MP = null; session = null;
  setFriend(fid, Object.assign({}, P.friends[fid], { host: false })); /* onze eigen bus is rol b */
  var mijnBus = await busFor(P.friends[fid], myRole(P.friends[fid]));
  var briefje = b64url(await sealJSON(P.friends[fid].k, 'uitnodiging',
    { id: 'oudbriefje', room: 'kamer-oud-12345', seat: 'stoel-oud-12345', naam: 'Mila', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bus: mijnBus.bus, bewijs: mijnBus.bewijs, blob: briefje }) });
  for (i = 0; i < 20; i++) await null;
  __server.klok += BUS_TTL + 60000;
  seenInv = [];
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('bus: een briefje ouder dan tien minuten is verlopen en komt niet meer omhoog',
    __els.overlay.classList.contains('hidden') && Object.keys(__server.buses).length === 0 && seenInv.length === 0);
  __server.klok = 0;
  clearTimeout(friendPollTimer);
  var rGroot = await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: mijnBus.bus, bewijs: mijnBus.bewijs, blob: 'x'.repeat(MAX_BUS_BLOB + 1) }) });
  ok('bus: een te groot briefje weigert de server', rGroot.status === 400 && Object.keys(__server.buses).length === 0);
  var teveel = [];
  for (i = 0; i < MAX_BUS_CHECK + 1; i++) teveel.push(i.toString(16).padStart(64, '0'));
  var rVeel = await fetch(SYNC_URL + '/v1/bus/check', { method: 'POST', headers: {}, body: JSON.stringify({ bussen: teveel }) });
  ok('bus: meer dan 64 bussen in een keer opvragen weigert de server', rVeel.status === 400);
  for (i = 0; i < MAX_BUSES; i++) __server.buses[i.toString(16).padStart(64, '0')] = { blob: 'x', tot: __busNu() + BUS_TTL };
  var rVol = await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: mijnBus.bus, bewijs: mijnBus.bewijs, blob: briefje }) });
  ok('bus: vol is vol, een nieuwe bus komt er niet meer bij', rVol.status === 429 && !(mijnBus.bus in __server.buses));
  __server.buses[mijnBus.bus] = { blob: 'oud', tot: __busNu() + BUS_TTL };
  var rVerv = await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: mijnBus.bus, bewijs: mijnBus.bewijs, blob: briefje }) });
  ok('bus: een bestaande bus mag ook bij een volle server vervangen worden',
    rVerv.status === 204 && __server.buses[mijnBus.bus].blob === briefje);
  __server.buses = {};

  /* de kamertabel uit room.go: een volle tabel maakt plaats met een kamer
     zonder iemand erin, eerst een zonder potje, dan het langst stille potje;
     zit er in elke kamer iemand, dan weigert de server */
  var kamersVoor = __server.wsrooms, nuK = __busNu();
  __server.wsrooms = {};
  var nepKamer = function (id, potje, bezet, stil) {
    var rm = { seats: {}, order: [id + '-a', id + '-b'], joined: {}, created: nuK, touched: nuK - stil };
    rm.seats[id + '-a'] = bezet ? { readyState: 1 } : null;
    rm.seats[id + '-b'] = null;
    if (potje) { rm.joined[id + '-a'] = true; rm.joined[id + '-b'] = true; }
    __server.wsrooms[id] = rm;
  };
  var nieuwBezet = async function () {
    var r = await fetch(SYNC_URL + '/v1/room', { method: 'POST', headers: {} });
    if (r.status === 200) {
      var k = __server.wsrooms[(await r.json()).room];
      k.seats[k.order[0]] = { readyState: 1 };
    }
    return r.status;
  };
  nepKamer('wacht', true, true, 9000);
  nepKamer('oudPotje', true, false, 3000);
  nepKamer('leeg', false, false, 2000);
  nepKamer('jongPotje', true, false, 1000);
  for (var j = 0; Object.keys(__server.wsrooms).length < MAX_KAMERS; j++) nepKamer('vol' + j, false, true, 0);
  var stK1 = await nieuwBezet();
  ok('kamers: vol, dan wijkt eerst de kamer zonder potje, ook voor een ouder potje',
    stK1 === 200 && !('leeg' in __server.wsrooms) && ('oudPotje' in __server.wsrooms));
  var stK2 = await nieuwBezet();
  ok('kamers: daarna het potje dat het langst stil ligt',
    stK2 === 200 && !('oudPotje' in __server.wsrooms) && ('jongPotje' in __server.wsrooms));
  var stK3 = await nieuwBezet();
  ok('kamers: een kamer waar iemand in zit wijkt nooit, ook de stilste niet',
    stK3 === 200 && !('jongPotje' in __server.wsrooms) && ('wacht' in __server.wsrooms));
  var stK4 = await nieuwBezet();
  ok('kamers: in elke kamer iemand, dan weigert de server en blijft het bij de grens',
    stK4 === 429 && Object.keys(__server.wsrooms).length === MAX_KAMERS);
  __server.wsrooms = kamersVoor;

  /* wie zelf op iemand wacht moet een uitnodiging van een ander nog steeds
     te zien krijgen: met twee vermeldingen van hetzelfde kind (een kapotte
     en een goede) bleven anders allebei de kanten eeuwig wachten */
  seenInv = [];
  INV = null; MP = null; session = null;
  closeModal();
  setFriend(fid2, { k: mK2, naam: 'Bo', host: false, weg: false, since: Date.now() });
  await inviteFriend(fid);
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: wij wachten op Mila',
    !!INV && INV.fid === fid && __els.modalBox.innerHTML.indexOf('Wachten op Mila') >= 0);
  var busBo = await busFor(P.friends[fid2], myRole(P.friends[fid2]));
  var kamerBo = __nieuweKamer();
  var briefBo = b64url(await sealJSON(mK2, 'uitnodiging',
    { id: 'bobriefje', room: kamerBo.id, seat: kamerBo.gast, naam: 'Bo', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: busBo.bus, bewijs: busBo.bewijs, blob: briefBo }) });
  for (i = 0; i < 20; i++) await null;
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: de uitnodiging van Bo komt langs ons eigen wachtscherm heen',
    __els.modalBox.innerHTML.indexOf('Bo wil een potje spelen') >= 0 && !!INV && INV.fid === fid);
  fire(__els.invNee, 'click');
  ok('twee kanten: nu niet = ons wachtscherm terug en onze uitnodiging staat nog',
    !!INV && INV.fid === fid && __els.modalBox.innerHTML.indexOf('Wachten op Mila') >= 0);
  /* een tweede briefje van Bo staat op het scherm als onze eigen uitnodiging
     verloopt: dat briefje is al als gezien gemerkt en komt niet terug, dus de
     melding mag het niet van het scherm vegen */
  var briefBo2 = b64url(await sealJSON(mK2, 'uitnodiging',
    { id: 'bobriefje2', room: kamerBo.id, seat: kamerBo.gast, naam: 'Bo', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: busBo.bus, bewijs: busBo.bewijs, blob: briefBo2 }) });
  for (i = 0; i < 20; i++) await null;
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: Bo vraagt het nog eens', __els.modalBox.innerHTML.indexOf('Bo wil een potje spelen') >= 0);
  /* na tien minuten is het briefje uit de bus en houdt het wachten op */
  drainTimers(400, INVITE_TTL + 60000);
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: onze uitnodiging verloopt, maar de vraag van Bo blijft staan',
    INV === null && MP === null && __els.modalBox.innerHTML.indexOf('Bo wil een potje spelen') >= 0 &&
    modalQueue.length === 1);
  fire(__els.invNee, 'click');
  for (i = 0; i < 20; i++) await null;
  ok('twee kanten: een verlopen uitnodiging stopt met wachten en zegt het',
    INV === null && MP === null && __els.modalBox.innerHTML.indexOf('heeft niet gekeken') >= 0);
  fire(__els.meldOk, 'click');
  for (i = 0; i < 20; i++) await null;

  /* zegt het kind ja op zo'n blijvende vraag, dan hoort de melding over de
     verlopen uitnodiging niet alsnog boven het verbinden te komen */
  await inviteFriend(fid);
  for (i = 0; i < 30; i++) await null;
  var briefBo3 = b64url(await sealJSON(mK2, 'uitnodiging',
    { id: 'bobriefje3', room: kamerBo.id, seat: kamerBo.gast, naam: 'Bo', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: busBo.bus, bewijs: busBo.bewijs, blob: briefBo3 }) });
  for (i = 0; i < 20; i++) await null;
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  drainTimers(400, INVITE_TTL + 60000);
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: ook nu blijft de vraag van Bo staan',
    INV === null && MP === null && __els.modalBox.innerHTML.indexOf('Bo wil een potje spelen') >= 0);
  fire(__els.invJa, 'click');
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: ja op Bo = verbinden met Bo, zonder oude melding ertussen',
    !!MP && MP.room === kamerBo.id && MP.viaFriend === fid2 && modalQueue.length === 0 &&
    __els.modalBox.innerHTML.indexOf('Verbinden') >= 0);
  mpStop();
  closeModal();
  for (i = 0; i < 20; i++) await null;

  /* ja zeggen op Bo terwijl onze eigen uitnodiging aan Mila nog naar de
     server onderweg is: die eigen uitnodiging vervalt dan, en overschrijft
     niet het potje met Bo */
  var briefBo4 = b64url(await sealJSON(mK2, 'uitnodiging',
    { id: 'bobriefje4', room: kamerBo.id, seat: kamerBo.gast, naam: 'Bo', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: busBo.bus, bewijs: busBo.bewijs, blob: briefBo4 }) });
  for (i = 0; i < 20; i++) await null;
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  var busMila = await busFor(P.friends[fid], theirRole(P.friends[fid]));
  var pInv = inviteFriend(fid);
  fire(__els.invJa, 'click');
  await pInv;
  for (i = 0; i < 30; i++) await null;
  ok('twee kanten: ja op Bo terwijl de eigen uitnodiging nog onderweg is = potje met Bo',
    !!MP && MP.room === kamerBo.id && INV === null && modalQueue.length === 0 &&
    !(busMila.bus in __server.buses));
  mpStop();
  closeModal();
  for (i = 0; i < 20; i++) await null;
  setFriend(fid2, Object.assign({}, P.friends[fid2], { weg: true }));
  __server.buses = {};

  /* een uitnodiging aannemen van een kamer waar niemand (meer) zit - zijn app
     ging dicht - laat "Verbinden…" niet eeuwig draaien */
  seenInv = [];
  INV = null; MP = null; session = null;
  closeModal();
  var stil = __nieuweKamer();
  var stilBrief = b64url(await sealJSON(P.friends[fid].k, 'uitnodiging',
    { id: 'stilbriefje', room: stil.id, seat: stil.gast, naam: 'Mila', ts: Date.now() }));
  await fetch(SYNC_URL + '/v1/bus', { method: 'POST', headers: {},
    body: JSON.stringify({ bus: mijnBus.bus, bewijs: mijnBus.bewijs, blob: stilBrief }) });
  for (i = 0; i < 20; i++) await null;
  await friendPoll();
  for (i = 0; i < 30; i++) await null;
  ok('stille kamer: de vraag komt gewoon op het scherm', __els.modalBox.innerHTML.indexOf('wil een potje spelen') >= 0);
  fire(__els.invJa, 'click');
  for (i = 0; i < 30; i++) await null;
  drainTimers();
  ok('stille kamer: eerst verbinden', !!MP && MP.host === false &&
    __els.modalBox.innerHTML.indexOf('Verbinden') >= 0);
  drainTimers(400, MAATJE_WACHT + 5000);
  for (i = 0; i < 30; i++) await null;
  ok('stille kamer: daarna een eerlijke melding in plaats van eeuwig wachten',
    MP === null && __els.modalBox.innerHTML.indexOf('is er nu even niet') >= 0);
  fire(__els.meldOk, 'click');
  for (i = 0; i < 20; i++) await null;
  __server.buses = {};
  setFriend(fid, Object.assign({}, P.friends[fid], { host: true }));

  /* weghalen: tombstone in de CRDT, lijst leeg. De lijst wordt bij elk bezoek
     opnieuw getekend, dus een tik mag maar een keer aankomen */
  showHomeTab('vrienden');
  showHomeTab('spelen');
  showHomeTab('vrienden');
  renderFriends();
  fire(__els.friendList, 'click', { target: { dataset: { remove: fid } } });
  ok('vriend: weghalen vraagt eerst, en na vier keer tekenen nog steeds maar een keer',
    __els.modalBox.innerHTML.indexOf('Mila weghalen') >= 0 && modalQueue.length === 0);
  fire(__els.rmVrJa, 'click');
  ok('vriend: weg = tombstone, lijst leeg', P.friends[fid].weg === true && DOC.friends[fid].weg === true &&
    __els.friendList.innerHTML.indexOf('Nog geen vrienden') >= 0);
  /* normDoc en merge: geldige vrienden blijven, onzin gaat weg, nieuwste wint */
  ok('vriend: normDoc saneert', (function () {
    var d = JSON.parse(JSON.stringify(DOC));
    d.friends['rare id!'] = { k: mK, naam: 'x', t: 1 };
    d.friends.goedid12 = { k: 'kort', naam: 'x', t: 1 };
    d.friends.goedid13 = { k: mK, naam: '<b>Mila</b>', t: Date.now(), host: true };
    var n = normDoc(d);
    return !n.friends['rare id!'] && !n.friends.goedid12 && n.friends.goedid13 && n.friends.goedid13.naam === 'bMila/b' &&
      n.friends.goedid13.weg === false;
  })());
  ok('vriend: merge kiest de nieuwste', (function () {
    var a = normDoc(JSON.parse(JSON.stringify(DOC))), b = normDoc(JSON.parse(JSON.stringify(DOC)));
    b.friends[fid] = Object.assign({}, b.friends[fid], { weg: false, t: b.friends[fid].t + 1000 });
    return mergeDoc(a, b).friends[fid].weg === false && mergeDoc(b, a).friends[fid].weg === false;
  })());

  /* tegen Turbo: opgeven vraagt, weglopen is opgeven, remise alleen bij een echt gelijke stand */
  startGame(2);
  drainTimers();
  ok('offline: knoppenrij staat weer onder het bord en heeft opgeven en remise',
    !__els.actionRow.classList.contains('onderaan') && !!actionBtns.resignBtn && !!actionBtns.drawBtn);
  offerDraw();
  ok('turbo: remise meteen aan het begin wordt afgewimpeld', session.over !== true &&
    __els.bubble.innerHTML.indexOf('net begonnen') >= 0);
  fire(__els.backBtn, 'click');
  ok('[1.1] turbo: Pauze voor de eerste zet vraagt niets, bewaart niets en zegt dat het potje nog niet begonnen was',
    session === null && __els.overlay.classList.contains('hidden') && leesPotje() === null &&
    document.getElementById('toast').textContent.indexOf('nog niet begonnen') >= 0);
  startGame(2);
  drainTimers();
  ok('[1.1] turbo: daarna begint een nieuw potje zonder vraag', session !== null && session.over !== true &&
    __els.overlay.classList.contains('hidden'));
  var gpT = P.c.gamesPlayed, xpT = P.xp;
  fire(actionBtns.resignBtn, 'click');
  fire(__els.rsJa, 'click');
  drainTimers();
  ok('turbo: opgeven aan het begin = Turbo wint, telt niet, geen XP', session.over === true &&
    P.c.gamesPlayed === gpT && P.xp === xpT && __els.modalBox.innerHTML.indexOf('Je gaf op') >= 0);
  closeModal();
  /* na twintig zetten telt opgeven wel als gespeeld potje (en betaalt de troost-XP) */
  startGame(2);
  drainTimers();
  session.S = parseFEN('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
  for (var pl = 0; pl < 20; pl++) session.S.hist.push({ m: { from: 0, to: 0 }, cap: null });
  gpT = P.c.gamesPlayed; xpT = P.xp;
  var potjesT = wkGet(curWeek(), 'potjes2');
  resignNow();
  drainTimers();
  ok('turbo: opgeven na twintig zetten telt wel', P.c.gamesPlayed === gpT + 1 && P.xp - xpT === 15 &&
    wkGet(curWeek(), 'potjes2') === potjesT + 1);
  closeModal();
  /* remise: Turbo zegt nee als hij beter staat, ja bij gelijk na twintig zetten */
  startGame(2);
  drainTimers();
  session.S = parseFEN('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
  for (pl = 0; pl < 20; pl++) session.S.hist.push({ m: { from: 0, to: 0 }, cap: null });
  BD.mode = 'move';
  offerDraw();
  ok('turbo: remise geweigerd als jij beter staat', session.over !== true && __els.bubble.innerHTML.indexOf('jij staat beter') >= 0);
  session.S = parseFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  for (pl = 0; pl < 20; pl++) session.S.hist.push({ m: { from: 0, to: 0 }, cap: null });
  session.drawAsked = null;
  xpT = P.xp;
  offerDraw();
  drainTimers();
  ok('turbo: remise aangenomen bij gelijke stand', session.over === true && P.xp - xpT === 30 &&
    __els.modalBox.innerHTML.indexOf('Remise afgesproken') >= 0);
  closeModal();
  goHome();
  ok('offline: na afloop gaat ← Home gewoon naar huis', session === null && __els.overlay.classList.contains('hidden'));

  await orakelZelftest();
  await orakelFlow();
  print('\norakel: ' + ORAKEL.nogNiet + ' nog niet gebouwd, ' + ORAKEL.gebouwd + ' gebouwd');
  print(fails === 0 ? '\nALL FLOW TESTS PASSED' : '\n' + fails + ' FLOW FAILURES');
})().catch(function (e) { print('ASYNC EXCEPTION: ' + e + '\n' + (e && e.stack)); print('\nFLOW SUITE ABORTED'); });
