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
var earnedB = session.earned, vorkB = (P.c.pat.vork || 0), trucsB = P.day.trucs || 0;
puzzleAttempt(fM);
drainTimers();
ok('trucs: vork goed = 3 sterren', session.earned - earnedB === 3 && session.phase === 'review');
ok('trucs: boekje en dagteller lopen', P.c.pat.vork === vorkB + 1 && P.day.trucs === trucsB + 1);
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
['wins', 'stars', 'perfectScans', 'predictHits', 'predictTries', 'safeCorrect',
  'best3Gold', 'patience', 'cloud', 'trucs']
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

/* ---------- profiel-CRDT: doc, migratie, merge en sync ---------- */
/* doc en weergave lopen gelijk (predictHits niet: die is hierboven met opzet
   rechtstreeks in P gezet en dus alleen weergave) */
ok('crdt: som van bijdragen = weergave', ['xp', 'stars', 'wins', 'c.gamesPlayed',
  'c.perfectScans', 'c.winsL2', 'c.winsL3'].every(function (k) {
  return cntSum(DOC.cnt[k] || {}) === +getPath(P, k);
}));
ok('crdt: alle bijdragen op dit apparaat', Object.keys(DOC.cnt.xp).length === 1 &&
  DOC.cnt.xp[DEV] === P.xp);
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
ok('reset: badges, tellers en dag ook gewist', Object.keys(P.badges).length === 0 &&
  P.c.gamesPlayed === 0 && P.theme === 'munt' &&
  P.day && P.day.date === todayStr() && P.day.stars === 0 && !P.day.allDone);
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
  for (i = 0; i < 80 && MP; i++) { drainTimers(); await null; await null; }
  ok('mp: geeft na te veel mislukte herverbindingen op en meldt het',
    MP === null && __els.modalBox.innerHTML.indexOf('verbinding is weg') >= 0);
  fire(__els.mpVwOk, 'click');
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
     de dagmissies of de gedeelde 'wins'-teller; alleen winsOnline. De rest
     van de suite zet alle missies vooraf op klaar, dus dit meten we op een
     verse dag waar de missies nog open staan. */
  P.day = { date: 'gisteren' };
  ensureDay();
  var xpVoor = P.xp, dagWinsVoor = P.day.wins || 0, pWinsVoor = P.wins, onlineVoor2 = P.c.winsOnline || 0;
  MP = { room: 'r', seat: 's', host: true, myColor: 'w', gameNo: 1, revMine: false,
    revTheirs: false, peerName: 'X', open: false, weg: false };
  session = { kind: 'game', online: true, myColor: 'w', over: false,
    S: parseFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1') };
  BD.mode = 'move';
  commitKid(legalMoves(session.S).find(function (x) { return alg(x.to) === 'a8'; }));
  drainTimers();
  for (i = 0; i < 20; i++) await null;
  ok('mp: online winst geeft geen XP en raakt de HUD-wins/missies niet',
    P.xp === xpVoor && (P.day.wins || 0) === dagWinsVoor && P.wins === pWinsVoor &&
    (P.c.winsOnline || 0) === onlineVoor2 + 1);
  closeModal();
  mpStop();

  print(fails === 0 ? '\nALL FLOW TESTS PASSED' : '\n' + fails + ' FLOW FAILURES');
})();
