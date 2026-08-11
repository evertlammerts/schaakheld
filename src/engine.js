'use strict';
/* SchaakHeld engine - 0x88 board, legal move gen, small alpha-beta AI, drill generators.
   Board: index = rank*16 + file. a1=0, h1=7, a8=112, h8=119. White moves +16. */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const N_OFF = [31, 33, 14, 18, -31, -33, -14, -18];
const K_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
const B_DIR = [15, 17, -15, -17];
const R_DIR = [1, -1, 16, -16];
const Q_DIR = B_DIR.concat(R_DIR);
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 950, k: 20000 };
const MATE = 100000;

/* Piece-square tables, written rank8 (top) -> rank1 (bottom), from white's view. */
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
      -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
      -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
      -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
      -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
      -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
      -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
      20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
};

function isWhitePiece(p) { return p >= 'A' && p <= 'Z'; }
function colorOf(p) { return isWhitePiece(p) ? 'w' : 'b'; }
function other(c) { return c === 'w' ? 'b' : 'w'; }
function alg(sq) { return 'abcdefgh'[sq & 15] + (1 + (sq >> 4)); }
function sqFromAlg(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }

function parseFEN(fen) {
  const S = { board: new Array(128).fill(null), turn: 'w',
    castle: { K: false, Q: false, k: false, q: false }, ep: -1, half: 0, full: 1,
    kings: { w: -1, b: -1 }, hist: [] };
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') { file += +ch; }
      else {
        const sq = rank * 16 + file;
        S.board[sq] = ch;
        if (ch === 'K') S.kings.w = sq;
        if (ch === 'k') S.kings.b = sq;
        file++;
      }
    }
  }
  S.turn = parts[1] || 'w';
  const c = parts[2] || '-';
  S.castle = { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') };
  S.ep = (parts[3] && parts[3] !== '-') ? sqFromAlg(parts[3]) : -1;
  S.half = +(parts[4] || 0);
  S.full = +(parts[5] || 1);
  return S;
}

function toFEN(S) {
  let rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '', empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = S.board[rank * 16 + file];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const c = (S.castle.K ? 'K' : '') + (S.castle.Q ? 'Q' : '') + (S.castle.k ? 'k' : '') + (S.castle.q ? 'q' : '');
  return rows.join('/') + ' ' + S.turn + ' ' + (c || '-') + ' ' +
    (S.ep >= 0 ? alg(S.ep) : '-') + ' ' + S.half + ' ' + S.full;
}

function newGame(fen) { return parseFEN(fen || START_FEN); }

/* Is square sq attacked by any piece of color `by`? */
function attacked(S, sq, by) {
  const B = S.board;
  if (by === 'w') {
    for (const d of [-15, -17]) { const f = sq + d; if (!(f & 0x88) && B[f] === 'P') return true; }
  } else {
    for (const d of [15, 17]) { const f = sq + d; if (!(f & 0x88) && B[f] === 'p') return true; }
  }
  for (const d of N_OFF) {
    const f = sq + d;
    if (!(f & 0x88)) { const p = B[f]; if (p && (p === 'N' || p === 'n') && colorOf(p) === by) return true; }
  }
  for (const d of K_OFF) {
    const f = sq + d;
    if (!(f & 0x88)) { const p = B[f]; if (p && (p === 'K' || p === 'k') && colorOf(p) === by) return true; }
  }
  for (const d of B_DIR) {
    let f = sq + d;
    while (!(f & 0x88)) {
      const p = B[f];
      if (p) { if (colorOf(p) === by && (p === 'B' || p === 'b' || p === 'Q' || p === 'q')) return true; break; }
      f += d;
    }
  }
  for (const d of R_DIR) {
    let f = sq + d;
    while (!(f & 0x88)) {
      const p = B[f];
      if (p) { if (colorOf(p) === by && (p === 'R' || p === 'r' || p === 'Q' || p === 'q')) return true; break; }
      f += d;
    }
  }
  return false;
}

function pushPawnMove(ms, from, to, turn) {
  const promoRank = turn === 'w' ? 7 : 0;
  if ((to >> 4) === promoRank) {
    for (const pr of ['q', 'r', 'b', 'n']) ms.push({ from, to, promo: pr });
  } else ms.push({ from, to });
}

function pseudoMoves(S) {
  const ms = [], turn = S.turn, B = S.board;
  const fwd = turn === 'w' ? 16 : -16;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = B[sq];
    if (!p || colorOf(p) !== turn) continue;
    const t = p.toLowerCase();
    if (t === 'p') {
      const one = sq + fwd;
      if (!(one & 0x88) && !B[one]) {
        pushPawnMove(ms, sq, one, turn);
        const startRank = turn === 'w' ? 1 : 6;
        if ((sq >> 4) === startRank && !B[one + fwd]) ms.push({ from: sq, to: one + fwd, flags: '2' });
      }
      for (const d of (turn === 'w' ? [15, 17] : [-15, -17])) {
        const c = sq + d;
        if (c & 0x88) continue;
        const q = B[c];
        if (q && colorOf(q) !== turn) pushPawnMove(ms, sq, c, turn);
        else if (c === S.ep && !q) ms.push({ from: sq, to: c, flags: 'e' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const d of (t === 'n' ? N_OFF : K_OFF)) {
        const f = sq + d;
        if (f & 0x88) continue;
        const q = B[f];
        if (!q || colorOf(q) !== turn) ms.push({ from: sq, to: f });
      }
      if (t === 'k') {
        if (turn === 'w' && sq === 4) {
          if (S.castle.K && !B[5] && !B[6] && B[7] === 'R' &&
            !attacked(S, 4, 'b') && !attacked(S, 5, 'b') && !attacked(S, 6, 'b'))
            ms.push({ from: 4, to: 6, flags: 'K' });
          if (S.castle.Q && !B[3] && !B[2] && !B[1] && B[0] === 'R' &&
            !attacked(S, 4, 'b') && !attacked(S, 3, 'b') && !attacked(S, 2, 'b'))
            ms.push({ from: 4, to: 2, flags: 'Q' });
        } else if (turn === 'b' && sq === 116) {
          if (S.castle.k && !B[117] && !B[118] && B[119] === 'r' &&
            !attacked(S, 116, 'w') && !attacked(S, 117, 'w') && !attacked(S, 118, 'w'))
            ms.push({ from: 116, to: 118, flags: 'K' });
          if (S.castle.q && !B[115] && !B[114] && !B[113] && B[112] === 'r' &&
            !attacked(S, 116, 'w') && !attacked(S, 115, 'w') && !attacked(S, 114, 'w'))
            ms.push({ from: 116, to: 114, flags: 'Q' });
        }
      }
    } else {
      const dirs = t === 'b' ? B_DIR : (t === 'r' ? R_DIR : Q_DIR);
      for (const d of dirs) {
        let f = sq + d;
        while (!(f & 0x88)) {
          const q = B[f];
          if (!q) ms.push({ from: sq, to: f });
          else { if (colorOf(q) !== turn) ms.push({ from: sq, to: f }); break; }
          f += d;
        }
      }
    }
  }
  return ms;
}

function makeMove(S, m) {
  const turn = S.turn;
  const p = S.board[m.from];
  const u = { m, piece: p, cap: null, capSq: -1, castle: { ...S.castle }, ep: S.ep,
    half: S.half, kings: { ...S.kings } };
  let capSq = m.to;
  if (m.flags === 'e') capSq = m.to + (turn === 'w' ? -16 : 16);
  u.cap = S.board[capSq] || null;
  u.capSq = capSq;
  if (u.cap) S.board[capSq] = null;
  S.board[m.from] = null;
  S.board[m.to] = m.promo ? (turn === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  if (p === 'K' || p === 'k') {
    S.kings[turn] = m.to;
    if (turn === 'w') { S.castle.K = false; S.castle.Q = false; }
    else { S.castle.k = false; S.castle.q = false; }
    if (m.flags === 'K') {
      if (turn === 'w') { S.board[7] = null; S.board[5] = 'R'; }
      else { S.board[119] = null; S.board[117] = 'r'; }
    } else if (m.flags === 'Q') {
      if (turn === 'w') { S.board[0] = null; S.board[3] = 'R'; }
      else { S.board[112] = null; S.board[115] = 'r'; }
    }
  }
  for (const sq of [m.from, m.to]) {
    if (sq === 0) S.castle.Q = false;
    else if (sq === 7) S.castle.K = false;
    else if (sq === 112) S.castle.q = false;
    else if (sq === 119) S.castle.k = false;
  }
  S.ep = m.flags === '2' ? m.from + (turn === 'w' ? 16 : -16) : -1;
  S.half = (p === 'P' || p === 'p' || u.cap) ? 0 : S.half + 1;
  if (turn === 'b') S.full++;
  S.turn = other(turn);
  S.hist.push(u);
}

function unmakeMove(S) {
  const u = S.hist.pop();
  const m = u.m;
  S.turn = other(S.turn);
  const turn = S.turn;
  if (turn === 'b') S.full--;
  S.castle = u.castle;
  S.ep = u.ep;
  S.half = u.half;
  S.kings = u.kings;
  S.board[m.to] = null;
  S.board[m.from] = u.piece;
  if (u.cap) S.board[u.capSq] = u.cap;
  if (m.flags === 'K') {
    if (turn === 'w') { S.board[5] = null; S.board[7] = 'R'; }
    else { S.board[117] = null; S.board[119] = 'r'; }
  } else if (m.flags === 'Q') {
    if (turn === 'w') { S.board[3] = null; S.board[0] = 'R'; }
    else { S.board[115] = null; S.board[112] = 'r'; }
  }
}

function legalMoves(S) {
  const out = [];
  const mover = S.turn;
  for (const m of pseudoMoves(S)) {
    makeMove(S, m);
    if (!attacked(S, S.kings[mover], S.turn)) out.push(m);
    unmakeMove(S);
  }
  return out;
}

function inCheck(S) { return attacked(S, S.kings[S.turn], other(S.turn)); }
function isCapture(S, m) { return m.flags === 'e' || !!S.board[m.to]; }

function perft(S, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of legalMoves(S)) { makeMove(S, m); n += perft(S, d - 1); unmakeMove(S); }
  return n;
}

/* --- evaluation --- */

function material(S) {
  let s = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (!p || p === 'K' || p === 'k') continue;
    const v = VAL[p.toLowerCase()];
    s += isWhitePiece(p) ? v : -v;
  }
  return s;
}

function evalWhite(S) {
  let s = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (!p) continue;
    const t = p.toLowerCase();
    const rank = sq >> 4, file = sq & 15;
    if (isWhitePiece(p)) s += VAL[t] + PST[t][(7 - rank) * 8 + file];
    else s -= VAL[t] + PST[t][rank * 8 + file];
  }
  return s;
}

function evalSTM(S) { return S.turn === 'w' ? evalWhite(S) : -evalWhite(S); }
function evalMatSTM(S) { return S.turn === 'w' ? material(S) : -material(S); }

function mvvLva(S, m) {
  const victim = m.flags === 'e' ? 'p' : (S.board[m.to] ? S.board[m.to].toLowerCase() : null);
  if (!victim) return m.promo ? 800 : 0;
  return 1000 + VAL[victim] - VAL[S.board[m.from].toLowerCase()] / 100;
}

function orderMoves(S, moves) {
  return moves.map(m => ({ m, k: mvvLva(S, m) })).sort((a, b) => b.k - a.k).map(x => x.m);
}

function quiesce(S, alpha, beta, depth, evalFn) {
  const stand = evalFn(S);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const caps = orderMoves(S, legalMoves(S).filter(m => isCapture(S, m)));
  for (const m of caps) {
    makeMove(S, m);
    const sc = -quiesce(S, -beta, -alpha, depth - 1, evalFn);
    unmakeMove(S);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function search(S, depth, alpha, beta, ply) {
  if (depth === 0) return quiesce(S, alpha, beta, 6, evalSTM);
  const moves = orderMoves(S, legalMoves(S));
  if (moves.length === 0) return inCheck(S) ? -MATE + ply : 0;
  if (S.half >= 100) return 0;
  let best = -Infinity;
  for (const m of moves) {
    makeMove(S, m);
    const sc = -search(S, depth - 1, -beta, -alpha, ply + 1);
    unmakeMove(S);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

/* Score every legal move for the side to move. Returns [{m, score}] sorted best-first. */
function rootScores(S, depth) {
  const out = [];
  let alpha = -Infinity;
  for (const m of orderMoves(S, legalMoves(S))) {
    makeMove(S, m);
    const sc = -search(S, depth - 1, -Infinity, -alpha + 500, 1);
    unmakeMove(S);
    out.push({ m, score: sc });
    if (sc > alpha) alpha = sc;
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/* Resolve forced capture sequences, material-only. White-perspective result. */
function forcedMaterial(S) {
  const v = quiesce(S, -Infinity, Infinity, 8, evalMatSTM);
  return S.turn === 'w' ? v : -v;
}

/* --- AI opponent --- */

function pickMove(S, level, rng) {
  rng = rng || Math.random;
  const legal = legalMoves(S);
  if (legal.length === 0) return null;
  if (level === 1 && rng() < 0.55) {
    /* Baby Turbo: mostly random, but grab a free queen/rook if one is hanging. */
    const scored = rootScores(S, 1);
    if (scored[0].score - scored[scored.length - 1].score > 600 && rng() < 0.5) return scored[0].m;
    return legal[Math.floor(rng() * legal.length)];
  }
  const depth = level === 1 ? 1 : (level === 2 ? 2 : 3);
  const margin = level === 1 ? 250 : (level === 2 ? 80 : 25);
  const scored = rootScores(S, depth);
  const top = scored.filter(x => x.score >= scored[0].score - margin);
  return top[Math.floor(rng() * top.length)].m;
}

/* Blunder guard: does move m lose >=250cp of material by force, while a clearly
   better option exists? Returns null or {loss, punish} (punish = opponent's reply). */
function blunderCheck(S, m) {
  makeMove(S, m);
  const afterMine = forcedMaterial(S);
  unmakeMove(S);
  const mySign = S.turn === 'w' ? 1 : -1;
  let bestAlt = -Infinity;
  for (const alt of legalMoves(S)) {
    makeMove(S, alt);
    const v = forcedMaterial(S) * mySign;
    unmakeMove(S);
    if (v > bestAlt) bestAlt = v;
  }
  const loss = bestAlt - afterMine * mySign;
  if (loss >= 250) {
    makeMove(S, m);
    const reply = rootScores(S, 2);
    unmakeMove(S);
    const punish = reply.length ? reply[0].m : null;
    return { loss, punish };
  }
  return null;
}

/* --- game status --- */

function gameStatus(S) {
  if (legalMoves(S).length === 0) {
    if (inCheck(S)) return { over: true, result: S.turn === 'w' ? 'b' : 'w', reason: 'mat' };
    return { over: true, result: 'd', reason: 'pat' };
  }
  if (S.half >= 100) return { over: true, result: 'd', reason: '50' };
  const pieces = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (p && p !== 'K' && p !== 'k') pieces.push(p.toLowerCase());
  }
  if (pieces.length === 0 || (pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')))
    return { over: true, result: 'd', reason: 'materiaal' };
  return { over: false };
}

/* --- random position generator: noisy self-play from the start position --- */

function randomPosition(opts, rng) {
  rng = rng || Math.random;
  opts = opts || {};
  const minPlies = opts.minPlies || 10, maxPlies = opts.maxPlies || 26;
  const noise = opts.noise || 120;
  const maxImbalance = opts.maxImbalance == null ? 450 : opts.maxImbalance;
  for (let attempt = 0; attempt < 30; attempt++) {
    const S = newGame();
    let plies = minPlies + Math.floor(rng() * (maxPlies - minPlies + 1));
    if (plies % 2 === 1) plies++;
    let ok = true;
    for (let i = 0; i < plies; i++) {
      const scored = rootScores(S, 1);
      if (scored.length === 0) { ok = false; break; }
      const top = scored.filter(x => x.score >= scored[0].score - noise).slice(0, 6);
      makeMove(S, top[Math.floor(rng() * top.length)].m);
    }
    if (!ok) continue;
    if (gameStatus(S).over) continue;
    if (maxImbalance != null && Math.abs(material(S)) > maxImbalance) continue;
    S.hist = [];
    return S;
  }
  return newGame();
}

/* --- drill helpers --- */

function piecesOf(S, color) {
  const out = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (p && colorOf(p) === color) out.push(sq);
  }
  return out;
}

/* Squares of `color` pieces (king excluded) attacked by the enemy. */
function attackedPieces(S, color) {
  return piecesOf(S, color).filter(sq => {
    const p = S.board[sq];
    return p !== 'K' && p !== 'k' && attacked(S, sq, other(color));
  });
}

/* Enemy piece squares the side to move can capture right now (legal captures). */
function captureTargets(S) {
  const set = new Set();
  for (const m of legalMoves(S)) {
    if (m.flags === 'e') set.add(m.to + (S.turn === 'w' ? -16 : 16));
    else if (S.board[m.to]) set.add(m.to);
  }
  return [...set];
}

/* Does the piece on square a attack square t (ignoring whose turn it is)? */
function pieceAttacksSq(S, a, t) {
  const p = S.board[a];
  if (!p || a === t) return false;
  const ty = p.toLowerCase();
  const d = t - a;
  if (ty === 'p') return (colorOf(p) === 'w' ? [15, 17] : [-15, -17]).includes(d);
  if (ty === 'n') return N_OFF.includes(d);
  if (ty === 'k') return K_OFF.includes(d);
  const dirs = ty === 'b' ? B_DIR : (ty === 'r' ? R_DIR : Q_DIR);
  for (const dir of dirs) {
    let f = a + dir;
    while (!(f & 0x88)) {
      if (f === t) return true;
      if (S.board[f]) break;
      f += dir;
    }
  }
  return false;
}

/* First piece of color `by` that attacks (or defends) square t, or -1. */
function findAttacker(S, t, by) {
  for (const a of piecesOf(S, by)) if (pieceAttacksSq(S, a, t)) return a;
  return -1;
}

/* Static exchange on square t: net material the side to move can win by capturing
   there (capturing with the cheapest attacker first; 0 when declining is better). */
function seeSquare(S, t) {
  const p = S.board[t];
  if (!p) return 0;
  const caps = legalMoves(S).filter(m => m.to === t && S.board[m.to]);
  if (!caps.length) return 0;
  caps.sort((a, b) => VAL[S.board[a.from].toLowerCase()] - VAL[S.board[b.from].toLowerCase()]);
  const victim = VAL[p.toLowerCase()];
  makeMove(S, caps[0]);
  const net = victim - seeSquare(S, t);
  unmakeMove(S);
  return Math.max(0, net);
}

/* Black pieces white can win material on, judged per square with the exchange value.
   Returns details: {sq, victim (cp), gain (cp won in the exchange), move}. */
function freePiecesEx(S) {
  const out = [];
  if (S.turn !== 'w') return out;
  const caps = legalMoves(S).filter(m => S.board[m.to] && m.flags !== 'e');
  const byTarget = new Map();
  for (const m of caps) {
    if (!byTarget.has(m.to)) byTarget.set(m.to, []);
    byTarget.get(m.to).push(m);
  }
  for (const [sq, moves] of byTarget) {
    const victim = VAL[S.board[sq].toLowerCase()];
    const gain = seeSquare(S, sq);
    moves.sort((a, b) => VAL[S.board[a.from].toLowerCase()] - VAL[S.board[b.from].toLowerCase()]);
    if (gain >= Math.min(victim, 90)) out.push({ sq, victim, gain, move: moves[0] });
  }
  return out;
}
function freePieces(S) { return freePiecesEx(S).map(x => x.sq); }

function genScanTask(type, rng) {
  rng = rng || Math.random;
  const wants = { attacked: [2, 5], capture: [1, 4], mobility: [3, 10], free: [1, 2] };
  let relax = 0;
  for (let tries = 0; tries < 120; tries++) {
    if (tries > 0 && tries % 40 === 0) relax++;
    const noisy = type === 'free' || type === 'capture';
    const S = randomPosition({ noise: noisy ? 320 : 120, maxImbalance: noisy ? 900 : 450,
      minPlies: 8, maxPlies: 24 }, rng);
    if (inCheck(S)) continue;
    let targets = [], extra = null, details = null;
    if (type === 'attacked') targets = attackedPieces(S, 'w');
    else if (type === 'capture') targets = captureTargets(S);
    else if (type === 'free') { details = freePiecesEx(S); targets = details.map(x => x.sq); }
    else if (type === 'mobility') {
      const cands = piecesOf(S, 'w').filter(sq => 'NBRQ'.includes(S.board[sq]));
      if (cands.length === 0) continue;
      const sq = cands[Math.floor(rng() * cands.length)];
      targets = legalMoves(S).filter(m => m.from === sq).map(m => m.to);
      extra = sq;
    }
    const [lo, hi] = wants[type];
    if (targets.length >= Math.max(1, lo - relax) && targets.length <= hi + relax * 2)
      return { S, type, targets, extra, details };
  }
  return null;
}

/* Safe-or-trap: a quiet white move that either holds (loss<=60) or drops >=250 by force. */
function genSafeTask(wantTrap, rng) {
  rng = rng || Math.random;
  for (let tries = 0; tries < 90; tries++) {
    const S = randomPosition({ noise: 150, minPlies: 8, maxPlies: 22 }, rng);
    if (inCheck(S)) continue;
    const base = forcedMaterial(S);
    const quiet = legalMoves(S).filter(m => !isCapture(S, m) && !m.promo);
    for (let i = quiet.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [quiet[i], quiet[j]] = [quiet[j], quiet[i]];
    }
    for (const m of quiet.slice(0, 14)) {
      makeMove(S, m);
      const after = forcedMaterial(S);
      const loss = base - after;
      if (wantTrap && loss >= 250) {
        const reply = rootScores(S, 2);
        unmakeMove(S);
        const punish = reply.length ? reply[0].m : null;
        if (punish && isCaptureAfter(S, m, punish))
          return { S, move: m, trap: true, punish, loss };
        continue;
      }
      unmakeMove(S);
      if (!wantTrap && loss <= 60 && loss >= -60) return { S, move: m, trap: false, loss };
    }
  }
  return null;
}

function isCaptureAfter(S, m, punish) {
  makeMove(S, m);
  const cap = isCapture(S, punish);
  unmakeMove(S);
  return cap;
}

/* Best-of-three: the engine's best move plus two clearly worse options. */
function genBest3(rng) {
  rng = rng || Math.random;
  for (let tries = 0; tries < 90; tries++) {
    const S = randomPosition({ noise: 200, minPlies: 8, maxPlies: 24, maxImbalance: 600 }, rng);
    if (inCheck(S)) continue;
    const scored = rootScores(S, 2);
    if (scored.length < 6) continue;
    const best = scored[0];
    if (best.score < -250) continue;
    const worse = scored.filter(x => best.score - x.score >= 220 && best.score - x.score <= 1400);
    if (worse.length < 2) continue;
    const picks = [];
    const pool = worse.slice();
    while (picks.length < 2 && pool.length) {
      const i = Math.floor(rng() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    const options = [best, picks[0], picks[1]];
    /* Herkeuring op diepte 3: de "beste" moet ook dieper bekeken duidelijk
       beter zijn, anders mist de opdracht een truc die pas later komt. */
    for (const o of options) {
      makeMove(S, o.m);
      o.deep = -search(S, 2, -Infinity, Infinity, 1);
      unmakeMove(S);
    }
    if (!(best.deep >= -250 && options.slice(1).every(o => best.deep - o.deep >= 180))) continue;
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { S, options, best };
  }
  return null;
}

/* --- Dutch names --- */

const NAME_NL = { p: 'pion', n: 'paard', b: 'loper', r: 'toren', q: 'dame', k: 'koning' };
const GLYPH = { p: '♟︎', n: '♞︎', b: '♝︎', r: '♜︎', q: '♛︎', k: '♚︎' };

function moveNameNL(S, m) {
  if (m.flags === 'K') return 'korte rokade (O-O)';
  if (m.flags === 'Q') return 'lange rokade (O-O-O)';
  const p = S.board[m.from];
  const t = p.toLowerCase();
  let s = NAME_NL[t].charAt(0).toUpperCase() + NAME_NL[t].slice(1) + ' ' + alg(m.from) + ' → ' + alg(m.to);
  const capPiece = m.flags === 'e' ? 'p' : (S.board[m.to] ? S.board[m.to].toLowerCase() : null);
  if (capPiece) s += ', slaat ' + NAME_NL[capPiece];
  if (m.promo) s += ', promotie!';
  return s;
}

if (typeof module !== 'undefined') {
  module.exports = { START_FEN, VAL, GLYPH, NAME_NL, parseFEN, toFEN, newGame, alg, sqFromAlg,
    colorOf, isWhitePiece, other, attacked, pseudoMoves, legalMoves, makeMove, unmakeMove,
    inCheck, isCapture, perft, material, evalWhite, rootScores, forcedMaterial, pickMove,
    blunderCheck, gameStatus, randomPosition, piecesOf, attackedPieces, captureTargets,
    freePieces, freePiecesEx, seeSquare, pieceAttacksSq, findAttacker, genScanTask,
    genSafeTask, genBest3, moveNameNL };
}
