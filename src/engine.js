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
  let s = 0, wMat = 0, bMat = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (!p) continue;
    const t = p.toLowerCase();
    const rank = sq >> 4, file = sq & 15;
    if (isWhitePiece(p)) { s += VAL[t] + PST[t][(7 - rank) * 8 + file]; if (t !== 'k') wMat += VAL[t]; }
    else { s -= VAL[t] + PST[t][rank * 8 + file]; if (t !== 'k') bMat += VAL[t]; }
  }
  /* Against a bare king, material alone shows no progress: without a push of
     the lone king to the edge and the kings together, the search shuffles
     until the fifty-move rule. */
  if ((bMat === 0 && wMat >= 400) || (wMat === 0 && bMat >= 400)) {
    const strong = wMat > 0 ? 'w' : 'b', lone = S.kings[other(strong)], own = S.kings[strong];
    if (lone >= 0 && own >= 0) {
      const lf = lone & 15, lr = lone >> 4;
      const fromCentre = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
      const between = Math.abs(lf - (own & 15)) + Math.abs(lr - (own >> 4));
      const bonus = 30 * fromCentre + 12 * (14 - between);
      s += strong === 'w' ? bonus : -bonus;
    }
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

/* Every position any search looks at, counted, so a test can bound the work
   of a generator by what it does and not by how busy the machine is. */
let NODES = 0;
function nodesSearched() { return NODES; }

/* tick: optional deadline probe from the timed search, so a capture storm at a
   leaf cannot run past the budget unnoticed */
function quiesce(S, alpha, beta, depth, evalFn, tick) {
  if (tick) { if (tick()) return alpha; } else NODES++;
  const stand = evalFn(S);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const caps = orderMoves(S, legalMoves(S).filter(m => isCapture(S, m)));
  for (const m of caps) {
    makeMove(S, m);
    const sc = -quiesce(S, -beta, -alpha, depth - 1, evalFn, tick);
    unmakeMove(S);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function search(S, depth, alpha, beta, ply) {
  if (depth === 0) return quiesce(S, alpha, beta, 6, evalSTM);
  NODES++;
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

/* --- opening book: a handful of sound, kid-friendly lines in coordinate notation.
   Turbo (level 2 and 3) plays from it while the game follows a line; the
   Openingsschool teaches three of them with the reasons per move. --- */
const BOOK_LINES = [
  /* Italiaans, rustig */
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8 b1d2 a7a6',
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 c2c3 d7d6 e1g1 e8g8 b1d2 a7a6',
  /* Vierpaardenspel */
  'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6 f1b5 f8b4 e1g1 e8g8 d2d3 d7d6 c1g5 c8g4',
  /* Spaans */
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3',
  /* Schots */
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 c1e3 d8f6 c2c3 g8e7 f1c4 e8g8',
  /* Weens en Loperspel */
  'e2e4 e7e5 b1c3 g8f6 f1c4 b8c6 d2d3 f8c5 f2f4 d7d6 g1f3',
  'e2e4 e7e5 f1c4 g8f6 d2d3 c7c6 g1f3 d7d5 c4b3 f8d6 b1c3',
  /* Philidor-achtig voor zwart */
  'e2e4 e7e5 g1f3 d7d6 d2d4 e5d4 f3d4 g8f6 b1c3 f8e7 f1e2 e8g8 e1g1',
  /* Scandinavisch, Caro-Kann, Frans */
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5 f1c4 e7e6 c1d2 c7c6',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h3 g8f6 g1f3 b8d7',
  'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6 a2a3',
  /* Londen */
  'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 b8c6 b1d2 f8d6 f4g3 e8g8 f1d3 b7b6 e1g1',
  'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5 c2c3 b8c6 f1d3 f8d6 b1d2 e8g8 e1g1',
  'd2d4 g8f6 c1f4 g7g6 e2e3 f8g7 g1f3 e8g8 f1e2 d7d6 h2h3 b8d7 e1g1',
  /* Damegambiet en Slavisch */
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6 g5h4 b7b6',
  'd2d4 d7d5 g1f3 g8f6 c2c4 e7e6 b1c3 f8e7 c1g5 e8g8 e2e3 h7h6 g5h4 b7b6',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5 e2e3 e7e6 f1c4 f8b4 e1g1 e8g8'
];
const BOOK = BOOK_LINES.map(l => l.split(' '));
function moveKey(m) { return alg(m.from) + alg(m.to) + (m.promo || ''); }
/* the book moves that continue the game so far, with how many lines play each */
function bookMoves(S) {
  const played = S.hist.map(u => moveKey(u.m));
  const out = new Map();
  for (const line of BOOK) {
    if (line.length <= played.length) continue;
    let ok = true;
    for (let i = 0; i < played.length; i++) if (line[i] !== played[i]) { ok = false; break; }
    if (!ok) continue;
    const k = line[played.length];
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}
function bookMove(S, rng) {
  rng = rng || Math.random;
  const cands = bookMoves(S);
  if (!cands.size) return null;
  const legal = legalMoves(S);
  const pool = [];
  for (const [k, n] of cands) {
    const m = legal.find(x => moveKey(x) === k);
    if (m) for (let i = 0; i < n; i++) pool.push(m);
  }
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/* --- Zobrist hashing and a small transposition table for the timed search --- */
const ZOB = (() => {
  let s = 0x9E3779B9 >>> 0;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const pcs = {};
  for (const p of 'PNBRQKpnbrqk') { pcs[p] = []; for (let sq = 0; sq < 128; sq++) pcs[p].push([next(), next()]); }
  const castle = { K: [next(), next()], Q: [next(), next()], k: [next(), next()], q: [next(), next()] };
  const ep = []; for (let f = 0; f < 8; f++) ep.push([next(), next()]);
  return { pcs, castle, ep, side: [next(), next()] };
})();
/* The 11 lowest bits of the second word do not fit in the 53-bit key. They
   stay here until the next hashOf call and go into the TT entry, so that a
   colliding position is recognised instead of read back as a score. */
let hashLow = 0;
function hashOf(S) {
  let a = 0, b = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (p) { const z = ZOB.pcs[p][sq]; a ^= z[0]; b ^= z[1]; }
  }
  if (S.turn === 'b') { a ^= ZOB.side[0]; b ^= ZOB.side[1]; }
  for (const c of 'KQkq') if (S.castle[c]) { a ^= ZOB.castle[c][0]; b ^= ZOB.castle[c][1]; }
  if (S.ep >= 0) { const z = ZOB.ep[S.ep & 15]; a ^= z[0]; b ^= z[1]; }
  hashLow = (b >>> 0) & 2047;
  return (a >>> 0) * 2097152 + ((b >>> 0) >>> 11);
}
const TT = new Map();
const TT_MAX = 150000;
function clearTT() { TT.clear(); }

/* The positions of the game before the current one that can still come back:
   only those after the last capture or pawn move, since those cannot be undone. */
function earlierPositions(S, keyOf) {
  const out = [], back = [];
  const n = Math.min(S.half, S.hist.length);
  for (let i = 0; i < n; i++) {
    back.push(S.hist[S.hist.length - 1].m);
    unmakeMove(S);
    out.push(keyOf(S));
  }
  for (let i = back.length - 1; i >= 0; i--) makeMove(S, back[i]);
  return out;
}
/* Board, side to move, castling and en passant, as the rules of chess count
   them: the en passant square only when a pawn can really capture there, so
   the position right after a double step equals the same board later. */
function positionKey(S) {
  const f = toFEN(S).split(' ');
  if (f[3] !== '-' && !legalMoves(S).some(m => m.flags === 'e')) f[3] = '-';
  return f.slice(0, 4).join(' ');
}
/* How often the current position stood on the board before in this game;
   2 means this is the third time, a draw by repetition. */
function repetitions(S) {
  const now = positionKey(S);
  return earlierPositions(S, positionKey).filter(k => k === now).length;
}

/* Iterative deepening alpha-beta with a time budget, and optionally a node
   budget (opts.nodes), which makes the result the same on every device:
   transposition table, killer and history ordering, check extension,
   quiescence at the leaves. A position from earlier in the game, or earlier
   on the line being searched, scores as a draw, so Turbo does not repeat
   when he is ahead. Returns the best move of the deepest fully searched
   iteration. */
function think(S, budgetMs, maxDepth, opts) {
  const t0 = Date.now(), deadline = t0 + (budgetMs || 1000);
  maxDepth = maxDepth || 8;
  const maxNodes = opts && opts.nodes ? opts.nodes : Infinity;
  let nodes = 0, aborted = false, finish = false;
  const killers = [], hist = new Map();
  if (TT.size > TT_MAX) TT.clear();
  const tick = () => {
    if (aborted) return true;
    NODES++;
    if ((++nodes & 255) === 0 && !finish && (nodes >= maxNodes || Date.now() > deadline)) aborted = true;
    return aborted;
  };
  const earlier = new Set(earlierPositions(S, hashOf)), path = new Set();
  /* mate scores are stored relative to the node, not the root, so a
     transposition reached at another ply reads back the right distance */
  const toTT = (s, ply) => s > MATE - 1000 ? s + ply : (s < -MATE + 1000 ? s - ply : s);
  const fromTT = (s, ply) => s > MATE - 1000 ? s - ply : (s < -MATE + 1000 ? s + ply : s);
  const order = (moves, ttMove, ply) => {
    const k = killers[ply] || [];
    return moves.map(m => {
      let key = mvvLva(S, m);
      if (ttMove && m.from === ttMove.from && m.to === ttMove.to && (m.promo || null) === (ttMove.promo || null)) key = 1e6;
      else if (!key) {
        if (k.some(x => x.from === m.from && x.to === m.to)) key = 900;
        else key = (hist.get(m.from * 128 + m.to) || 0) / 100;
      }
      return { m, key };
    }).sort((x, y) => y.key - x.key).map(x => x.m);
  };
  function ab(depth, alpha, beta, ply) {
    if (tick()) return 0;
    let key = -1, low = 0;
    /* a position can only come back after at least four reversible plies */
    if (S.half >= 4) {
      key = hashOf(S); low = hashLow;
      if (earlier.has(key) || path.has(key)) return 0;
    }
    const chk = inCheck(S);
    if (chk) depth++;
    if (depth <= 0) return quiesce(S, alpha, beta, 6, evalSTM, tick);
    if (S.half >= 100) return 0;
    if (key < 0) { key = hashOf(S); low = hashLow; }
    const e = TT.get(key);
    let ttMove = null;
    if (e && e.v === low) {
      ttMove = e.m;
      if (e.d >= depth) {
        const s = fromTT(e.s, ply);
        if (e.f === 0) return s;
        if (e.f === 1 && s >= beta) return s;
        if (e.f === 2 && s <= alpha) return s;
      }
    }
    const moves = legalMoves(S);
    if (!moves.length) return chk ? -MATE + ply : 0;
    const alpha0 = alpha;
    let best = -Infinity, bestM = null;
    path.add(key);
    for (const m of order(moves, ttMove, ply)) {
      makeMove(S, m);
      const sc = -ab(depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(S);
      if (aborted) { path.delete(key); return 0; }
      if (sc > best) { best = sc; bestM = m; }
      if (sc > alpha) {
        alpha = sc;
        if (alpha >= beta) {
          if (!isCapture(S, m)) {
            const k = killers[ply] || (killers[ply] = []);
            if (!k.some(x => x.from === m.from && x.to === m.to)) { k.unshift(m); if (k.length > 2) k.pop(); }
            hist.set(m.from * 128 + m.to, (hist.get(m.from * 128 + m.to) || 0) + depth * depth);
          }
          break;
        }
      }
    }
    path.delete(key);
    TT.set(key, { d: depth, s: toTT(best, ply), f: best <= alpha0 ? 2 : (best >= beta ? 1 : 0), m: bestM, v: low });
    return best;
  }
  /* opts.root limits the moves searched at the root: the best of a few moves,
     or of all moves but a few, with the same search as the whole position */
  const rootMoves = opts && opts.root ? opts.root : legalMoves(S);
  if (!rootMoves.length) return { m: null, score: 0, depth: 0, nodes: 0 };
  path.add(hashOf(S));
  let bestMove = null, bestScore = 0, done = 0;
  const iteration = d => {
    let alpha = -Infinity, rootBest = null, rootScore = -Infinity;
    for (const m of order(rootMoves, bestMove, 0)) {
      makeMove(S, m);
      const sc = -ab(d - 1, -Infinity, -alpha, 1);
      unmakeMove(S);
      if (aborted) return false;
      if (sc > rootScore) { rootScore = sc; rootBest = m; }
      if (sc > alpha) alpha = sc;
    }
    bestMove = rootBest; bestScore = rootScore; done = d;
    return true;
  };
  for (let d = 1; d <= maxDepth; d++) {
    if (Math.abs(bestScore) >= MATE - 100) break;
    if (!iteration(d)) break;
    if (Math.abs(bestScore) >= MATE - 100) break;
    if (Date.now() - t0 > budgetMs / 2 || nodes >= maxNodes / 2) break;
  }
  /* a budget too small for one iteration still gets a searched and counted
     move: depth 1 is finished whatever the budget */
  if (!done) { aborted = false; finish = true; iteration(1); }
  return { m: bestMove, score: bestScore, depth: done, nodes };
}

/* --- AI opponent --- */

/* Super Turbo's search counts nodes, not time, so he is equally strong on a
   slow phone and on a laptop and plays the same move in the same position.
   About 2 s on the slowest phone; the time cap is only a safety net. */
const SUPER_NODES = 100000, SUPER_CAP_MS = 4000;
/* Turbo's two-ply choice cannot drive a bare king to the edge, so against one
   he searches a little deeper and mates instead of drawing by fifty moves. */
const TURBO_BARE_NODES = 12000;
function bareKing(S, color) { return piecesOf(S, color).length === 1; }

/* Level 1 (Baby): mostly random. Level 2 (Turbo): book, then depth 2 with a
   margin, so it stays beatable. Level 3 (Super Turbo): book, then the search
   with its node budget. budgetMs only caps level 3 (tests pass a small one). */
function pickMove(S, level, rng, budgetMs) {
  rng = rng || Math.random;
  const legal = legalMoves(S);
  if (legal.length === 0) return null;
  if (level === 1 && rng() < 0.55) {
    /* Baby Turbo: mostly random, but grab a free queen/rook if one is hanging. */
    const scored = rootScores(S, 1);
    if (scored[0].score - scored[scored.length - 1].score > 600 && rng() < 0.5) return scored[0].m;
    return legal[Math.floor(rng() * legal.length)];
  }
  if (level >= 2) {
    const bm = bookMove(S, rng);
    if (bm) return bm;
  }
  if (level === 3) return think(S, budgetMs || SUPER_CAP_MS, 8, { nodes: SUPER_NODES }).m;
  if (level === 2 && bareKing(S, other(S.turn))) return think(S, budgetMs || SUPER_CAP_MS, 8, { nodes: TURBO_BARE_NODES }).m;
  const depth = level === 1 ? 1 : 2;
  const margin = level === 1 ? 250 : 80;
  const scored = rootScores(S, depth);
  const top = scored.filter(x => x.score >= scored[0].score - margin);
  return top[Math.floor(rng() * top.length)].m;
}

/* Blunder guard: does move m allow mate in one, or lose >=250cp of material by
   force while a clearly better option exists? Returns null or {loss, punish}
   (punish = opponent's reply), with mate: true when that reply mates. */
function blunderCheck(S, m) {
  makeMove(S, m);
  const mate = mateReply(S);
  const afterMine = mate ? 0 : forcedMaterial(S);
  unmakeMove(S);
  if (mate) return { loss: MATE, punish: mate, mate: true };
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

/* A reply that mates at once, or null. Only a reply that gives check can
   mate, so most replies skip the costly full move generation that
   matingMoves(S, 1) does for each of them. */
function mateReply(S) {
  for (const m of legalMoves(S)) {
    makeMove(S, m);
    const mate = inCheck(S) && legalMoves(S).length === 0;
    unmakeMove(S);
    if (mate) return m;
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

/* Enemy pieces the side to move can win material on, judged per square with the
   exchange value. Returns details: {sq, victim (cp), gain (cp won), move}. */
function winnableCaptures(S) {
  const out = [];
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
function freePiecesEx(S) { return S.turn === 'w' ? winnableCaptures(S) : []; }
function freePieces(S) { return freePiecesEx(S).map(x => x.sq); }

/* The same position with the other side to move (null move); ep rights vanish. */
function nullMoved(S) {
  const N = parseFEN(toFEN(S));
  N.turn = other(N.turn);
  N.ep = -1;
  return N;
}
/* White pieces black would win if it were black's move: what Turbo threatens. */
function threatDetails(S) {
  if (S.turn !== 'w' || inCheck(S)) return [];
  const N = nullMoved(S);
  if (inCheck(N)) return []; /* white king en prise is not a "threat", it is check */
  return winnableCaptures(N);
}

function genScanTask(type, rng) {
  rng = rng || Math.random;
  const wants = { attacked: [2, 5], capture: [1, 4], mobility: [3, 10], free: [1, 2], threat: [1, 2] };
  let relax = 0;
  for (let tries = 0; tries < 120; tries++) {
    if (tries > 0 && tries % 40 === 0) relax++;
    const noisy = type === 'free' || type === 'capture' || type === 'threat';
    const S = randomPosition({ noise: noisy ? 320 : 120, maxImbalance: noisy ? 900 : 450,
      minPlies: 8, maxPlies: 24 }, rng);
    if (inCheck(S)) continue;
    let targets = [], extra = null, details = null;
    if (type === 'attacked') targets = attackedPieces(S, 'w');
    else if (type === 'capture') targets = captureTargets(S);
    else if (type === 'free') { details = freePiecesEx(S); targets = details.map(x => x.sq); }
    else if (type === 'threat') { details = threatDetails(S); targets = details.map(x => x.sq); }
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

/* The checks when a task is picked look deeper than forcedMaterial, which
   sees captures only: a quiet fork or a mate threat counts too. */
const CHECK_NODES = 25000;
/* White's move m in S played out: Black's best reply and White's best reply
   at the budget, then the captures resolved. white is White's score after m
   (the value V of the chess coach's measures), material what White has won
   or lost along that line (L; a fork or a pin shows here, positional points
   do not), reply Black's reply, mateNext whether Black mates at once. */
function lineAfter(S, m, nodes) {
  const m0 = material(S), back = [m];
  makeMove(S, m);
  let st = gameStatus(S);
  const out = { white: st.over ? (st.reason === 'mat' ? MATE : 0) : 0, reply: null, material: 0, mateNext: false };
  if (!st.over) {
    out.mateNext = !!mateReply(S);
    const r = think(S, 60000, 8, { nodes });
    out.white = -r.score;
    out.reply = r.m;
    makeMove(S, r.m); back.push(r.m);
    st = gameStatus(S);
    if (!st.over) { const w = think(S, 60000, 8, { nodes }).m; makeMove(S, w); back.push(w); }
  }
  out.material = (gameStatus(S).over ? material(S) : forcedMaterial(S)) - m0;
  for (let i = back.length; i > 0; i--) unmakeMove(S);
  return out;
}
/* Veilig of valstrik (plan rule 5.3, decision D31). A "veilig" move loses no
   pawn along its line, allows no mate in one, and is at most 2 points below
   the best move; a "valstrik" loses 2.5 points or more along its line, is
   at least 2.5 points below the best move, and is punished by a capture,
   Black's first move of that line. A move on which the line and the score
   disagree is neither: a piece that is lost after every move is no trap set
   by this one. Returns the task or null. */
function checkSafeTask(task, nodes) {
  nodes = nodes || CHECK_NODES;
  clearTT();
  const S = task.S;
  const best = think(S, 60000, 8, { nodes }).score;
  const line = lineAfter(S, task.move, nodes);
  if (!task.trap) return line.material >= -90 && !line.mateNext && best - line.white <= 200 ? task : null;
  if (line.material > -250 || best - line.white < 250 || !line.reply || !isCaptureAfter(S, task.move, line.reply)) return null;
  return Object.assign({}, task, { punish: line.reply });
}
/* Red je stuk (plan rule 5.3): exactly one threat; the piece can be saved,
   best play losing at most a pawn against the position as it stands; every
   answer within half a pawn of the best and losing no pawn along its line;
   every other move at least 1.5 points below the lowest answer, so a move
   about as good is never called wrong; one to four answers. */
function checkPieceTask(task, nodes) {
  nodes = nodes || CHECK_NODES;
  clearTT();
  const S = task.S;
  if (task.answers.length < 1 || task.answers.length > 4) return null;
  if (threatDetails(S).filter(t => t.gain >= 90).length !== 1) return null;
  const v0 = think(S, 60000, 8, { nodes }).score;
  if (v0 < evalWhite(S) - 100) return null;
  let lowest = Infinity;
  for (const a of task.answers) {
    const line = lineAfter(S, a.m, nodes);
    if (line.white < v0 - 50 || line.material < -90) return null;
    lowest = Math.min(lowest, line.white);
  }
  const keys = task.answers.map(a => moveKey(a.m));
  const others = legalMoves(S).filter(m => keys.indexOf(moveKey(m)) < 0);
  if (others.length && think(S, 60000, 8, { nodes, root: others }).score > lowest - 150) return null;
  return task;
}

/* How move m saves White's hanging piece on hangSq, for the explanation of
   Red je stuk; first match wins. "Safe" means Black wins nothing by capturing
   on that square (the exchange, not only "a white piece defends it": a
   defended queen that a pawn attacks is still lost). Points are 1, 3, 5, 9. */
function saveKind(S, m, hangSq) {
  const moved = m.from === hangSq;
  const took = isCapture(S, m) ? (S.board[capturedSq(S, m)] || 'p').toLowerCase() : null;
  const tookOne = took ? { took: NAME_NL[took], a: POINTS[took] } : {};
  const hangVal = VAL[S.board[hangSq].toLowerCase()];
  const takerOfHang = took && pieceAttacksSq(S, m.to, hangSq);
  const sliders = piecesOf(S, 'b').filter(a => 'brq'.includes(S.board[a].toLowerCase()) && pieceAttacksSq(S, a, hangSq));
  makeMove(S, m);
  const at = moved ? m.to : hangSq;
  const check = inCheck(S), attackedNow = attacked(S, at, 'b');
  /* in check Black may not capture for one move, so seeSquare reads 0 for a
     piece that is not safe at all: in check only an unattacked piece is safe */
  const back = attackedNow ? seeSquare(S, at) : 0, safe = !attackedNow || (!check && back === 0);
  const blocked = !moved && sliders.some(a => S.board[a] && !pieceAttacksSq(S, a, hangSq) && between(a, hangSq, m.to));
  const threatens = piecesOf(S, 'b').some(t => S.board[t] !== 'k' && pieceAttacksSq(S, m.to, t) && VAL[S.board[t].toLowerCase()] >= hangVal);
  unmakeMove(S);
  const backPts = Math.round(back / 100) >= 9 ? 9 : Math.round(back / 100);
  const out = (kind, extra) => Object.assign({ kind, sq: alg(at) }, tookOne, extra || {});
  if (takerOfHang && safe) return out('aanvaller');
  if (moved && took && safe) return out('slaat');
  if (moved && !attackedNow) return out('weg');
  if (check && attackedNow) return out('schaak');
  if (moved) {
    if (safe) return out('weg-gedekt');
    if (took && VAL[took] >= back) return out('ruil', { b: backPts });
  } else if (safe) return out(blocked ? 'ertussen' : 'gedekt');
  else if (took && VAL[took] >= back) return out('ruil', { b: backPts });
  if (!took && threatens) return out('tegenaanval');
  return out('anders');
}
/* Is square c strictly on the straight line between a and b? */
function between(a, b, c) {
  const df = (b & 15) - (a & 15), dr = (b >> 4) - (a >> 4);
  const n = Math.max(Math.abs(df), Math.abs(dr));
  if (n < 2 || (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr))) return false;
  const step = Math.sign(dr) * 16 + Math.sign(df);
  for (let i = 1, s = a + step; i < n; i++, s += step) if (s === c) return true;
  return false;
}

/* Safe-or-trap: a quiet white move that either holds (loss<=60) or drops >=250
   by force, confirmed by checkSafeTask. After three candidates that the check
   rejects it gives up, so the child never waits long. A trap's punishment is
   a capture, so the explanation can say what is taken. */
/* About four seconds under the 6x slowdown (plan rule 5.9); when it is spent
   the generator gives nothing and the app gives another kind of task. */
const SAFE_NODES = 160000;
function genSafeTask(wantTrap, rng) {
  rng = rng || Math.random;
  let rejected = 0;
  const n0 = NODES;
  /* a check is three searches of CHECK_NODES plus its captures: start one only while it still fits */
  const ruimte = () => NODES - n0 <= SAFE_NODES - 3 * CHECK_NODES - 5000;
  const confirm = t => {
    const c = checkSafeTask(t);
    if (c && (!t.trap || isCaptureAfter(t.S, t.move, c.punish))) return c;
    rejected++;
    return null;
  };
  for (let tries = 0; tries < 90 && rejected < 3; tries++) {
    if (!ruimte()) return null;
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
        if (punish && isCaptureAfter(S, m, punish)) {
          if (!ruimte()) return null;
          const c = confirm({ S, move: m, trap: true, punish, loss });
          if (c) return c;
          break;
        }
        continue;
      }
      unmakeMove(S);
      if (!wantTrap && loss <= 60 && loss >= -60) {
        if (!ruimte()) return null;
        const c = confirm({ S, move: m, trap: false, loss });
        if (c) return c;
        break;
      }
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

/* --- tactical pattern detection: fork, pin, skewer, discovered attack --- */

const SLIDER_DIRS = { b: B_DIR, r: R_DIR, q: Q_DIR };

/* Juicy fork targets of the piece on sq: enemy pieces it attacks that are the
   king, worth more than the attacker, or undefended. */
function forkTargets(S, sq) {
  const p = S.board[sq];
  if (!p) return [];
  const by = colorOf(p), enemy = other(by), av = VAL[p.toLowerCase()];
  const out = [];
  for (const t of piecesOf(S, enemy)) {
    if (!pieceAttacksSq(S, sq, t)) continue;
    const tp = S.board[t].toLowerCase();
    if (tp === 'k' || VAL[tp] > av || findAttacker(S, t, enemy) < 0) out.push(t);
  }
  return out;
}

/* Pins and skewers along the rays of the slider on sq.
   Pin: cheaper enemy piece in front of a more valuable one (or the king).
   Skewer: the valuable piece (or king) stands in front and must move. */
function raysPinSkewer(S, sq) {
  const res = { pins: [], skewers: [] };
  const p = S.board[sq];
  if (!p) return res;
  const t = p.toLowerCase();
  if (!'brq'.includes(t)) return res;
  const by = colorOf(p);
  for (const d of SLIDER_DIRS[t]) {
    let f = sq + d, front = -1;
    while (!(f & 0x88)) {
      if (S.board[f]) {
        if (front < 0) {
          if (colorOf(S.board[f]) === by) break;
          front = f;
        } else {
          if (colorOf(S.board[f]) === by) break;
          const fv = S.board[front].toLowerCase(), bv = S.board[f].toLowerCase();
          if (bv === 'k' || VAL[bv] > VAL[fv]) res.pins.push({ front, back: f });
          else if (fv === 'k' || VAL[fv] > VAL[bv]) res.skewers.push({ front, back: f });
          break;
        }
      }
      f += d;
    }
  }
  return res;
}

/* Attacks by friendly sliders that got unveiled because fromSq was vacated.
   Call on the position AFTER the move. The piece that moved (now on movedTo)
   unveils nothing: sliding along its own line it attacks what it attacked. */
function discoveredFrom(S, fromSq, by, movedTo) {
  const out = [];
  for (const sq of piecesOf(S, by)) {
    if (sq === movedTo) continue;
    const pt = S.board[sq].toLowerCase();
    if (!'brq'.includes(pt)) continue;
    for (const d of SLIDER_DIRS[pt]) {
      let f = sq + d, seenFrom = false;
      while (!(f & 0x88)) {
        if (f === fromSq) { seenFrom = true; f += d; continue; }
        if (S.board[f]) {
          if (seenFrom && colorOf(S.board[f]) !== by) {
            const tp = S.board[f].toLowerCase();
            out.push({ from: sq, target: f, isKing: tp === 'k', val: VAL[tp] });
          }
          break;
        }
        f += d;
      }
    }
  }
  return out;
}

/* All patterns the move m (from position S, before the move) would create. */
function patternsAfterMove(S, m) {
  makeMove(S, m);
  const res = {
    safe: seeSquare(S, m.to) <= 0,
    fork: forkTargets(S, m.to),
    pin: null, skewer: null,
    discovered: discoveredFrom(S, m.from, other(S.turn), m.to).filter(x => x.isKing || x.val >= 300),
    mate: false
  };
  const ps = raysPinSkewer(S, m.to);
  res.pin = ps.pins[0] || null;
  res.skewer = ps.skewers[0] || null;
  if (legalMoves(S).length === 0 && inCheck(S)) res.mate = true;
  unmakeMove(S);
  return res;
}

/* Mate-in-N scores from the side to move's view: a mate delivered at ply p scores
   MATE - p. search() only sees "no legal moves" at depth >= 1, so mate at ply
   2n-1 needs depth 2n. */
function mateScore(S, n) { return search(S, 2 * n, -Infinity, Infinity, 0); }
/* Does m force mate in exactly n moves: within n, and not already within n-1? */
function matesIn(S, m, n) {
  if (n > 1 && matesIn(S, m, n - 1)) return false;
  makeMove(S, m);
  const st = gameStatus(S);
  let sc;
  if (st.over) sc = st.reason === 'mat' ? MATE - 1 : 0;
  else sc = -search(S, 2 * n - 1, -Infinity, Infinity, 1);
  unmakeMove(S);
  return sc >= MATE - (2 * n - 1);
}
/* Can the side to move force mate within n moves (any n' <= n)? */
function matesWithin(S, n) {
  return legalMoves(S).some(m => {
    makeMove(S, m);
    const st = gameStatus(S);
    const sc = st.over ? (st.reason === 'mat' ? MATE - 1 : 0) : -search(S, 2 * n - 1, -Infinity, Infinity, 1);
    unmakeMove(S);
    return sc >= MATE - (2 * n - 1);
  });
}
function matingMoves(S, n) {
  return legalMoves(S).filter(m => matesIn(S, m, n));
}

/* Does move m match the asked pattern type, convincingly enough for a drill? */
function patternMatches(S, m, type, info) {
  info = info || patternsAfterMove(S, m);
  if (type === 'mat1') return info.mate;
  if (type === 'mat2') return !info.mate && matesIn(S, m, 2);
  if (type === 'vork') return info.safe && info.fork.length >= 2;
  if (type === 'penning') {
    if (!info.safe || !info.pin) return false;
    makeMove(S, m);
    const bk = S.board[info.pin.back].toLowerCase();
    const fv = VAL[S.board[info.pin.front].toLowerCase()];
    const bv = bk === 'k' ? 100000 : VAL[bk];
    unmakeMove(S);
    return bk === 'k' || bv - fv >= 400;
  }
  if (type === 'spies') {
    if (!info.safe || !info.skewer) return false;
    makeMove(S, m);
    const ft = S.board[info.skewer.front].toLowerCase();
    unmakeMove(S);
    return ft === 'k' || ft === 'q';
  }
  if (type === 'aftrek')
    return info.discovered.length >= 1 && (info.safe || info.discovered.some(x => x.isKing));
  return false;
}

/* Drill generator: a position where white has a move that creates the pattern. */
function genPatternTask(type, rng) {
  rng = rng || Math.random;
  if (type === 'mat1') return genMate1Task(rng);
  if (type === 'mat2') return genMate2Task(rng);
  for (let tries = 0; tries < 150; tries++) {
    const S = randomPosition({ noise: 260, minPlies: 10, maxPlies: 26, maxImbalance: 700 }, rng);
    if (inCheck(S)) continue;
    const answers = [];
    for (const m of legalMoves(S)) {
      const info = patternsAfterMove(S, m);
      if (patternMatches(S, m, type, info)) answers.push({ m, info });
    }
    if (answers.length >= 1 && answers.length <= 3)
      return { S, type, answers };
  }
  return null;
}

/* Mate-in-1: noisy selfplay until white mates, then step one move back. */
function genMate1Task(rng) {
  rng = rng || Math.random;
  for (let att = 0; att < 25; att++) {
    const S = newGame();
    let found = false;
    for (let i = 0; i < 140; i++) {
      /* white plays stronger than black, so white mates in most games */
      const list = rootScores(S, S.turn === 'w' ? 2 : 1);
      if (!list.length) break;
      const margin = S.turn === 'w' ? 100 : 250;
      const top = list.filter(x => x.score >= list[0].score - margin).slice(0, S.turn === 'w' ? 3 : 5);
      makeMove(S, top[Math.floor(rng() * top.length)].m);
      const st = gameStatus(S);
      if (st.over) {
        if (st.reason === 'mat' && st.result === 'w') { unmakeMove(S); found = true; }
        break;
      }
    }
    if (!found) continue;
    const answers = [];
    for (const m of legalMoves(S)) {
      makeMove(S, m);
      const st = gameStatus(S);
      unmakeMove(S);
      if (st.over && st.reason === 'mat') answers.push({ m, info: null });
    }
    S.hist = [];
    if (answers.length) return { S, type: 'mat1', answers };
  }
  return null;
}

/* Mate-in-2: noisy selfplay until white mates, step back three plies, and keep
   the position only if the mate is forced from there and not already in one. */
function genMate2Task(rng) {
  rng = rng || Math.random;
  for (let att = 0; att < 40; att++) {
    const S = newGame();
    let found = false;
    for (let i = 0; i < 140; i++) {
      const list = rootScores(S, S.turn === 'w' ? 2 : 1);
      if (!list.length) break;
      const margin = S.turn === 'w' ? 100 : 250;
      const top = list.filter(x => x.score >= list[0].score - margin).slice(0, S.turn === 'w' ? 3 : 5);
      makeMove(S, top[Math.floor(rng() * top.length)].m);
      const st = gameStatus(S);
      if (st.over) {
        if (st.reason === 'mat' && st.result === 'w' && S.hist.length >= 3) {
          unmakeMove(S); unmakeMove(S); unmakeMove(S);
          found = true;
        }
        break;
      }
    }
    if (!found || inCheck(S)) continue;
    if (matingMoves(S, 1).length) continue;
    const answers = matingMoves(S, 2).map(m => ({ m, info: null }));
    if (!answers.length || answers.length > 2) continue;
    S.hist = [];
    return { S, type: 'mat2', answers };
  }
  return null;
}

/* --- defence drills: save the king, save the piece --- */

/* Positions where black (Turbo) threatens mate in `n` and white has one or two
   saving moves. Built from selfplay in which BLACK is the stronger side, stepping
   back to white's move just before the mating threat lands. A "save" must survive
   a real check: after it, black has no forced mate within two moves. The cheap
   depth-2 pass only prunes; the expensive pass decides. */
const SAVE_DEPTH = 4;
/* Is white really saved after its move (black to move)? Two conditions, via
   the TT-backed searcher (check extensions): black has no forced mate within
   SAVE_DEPTH/2 moves, and black is not clearly winning anyway: a "save" that
   only postpones a lost game teaches nothing, and forced mates just beyond
   the horizon come with a crushing score. Proving "no mate" at depth 6 costs
   seconds on a full board, so this is the honest bound. Check extensions have
   no bound of their own, hence the budget; only a search that reached
   SAVE_DEPTH proves anything, so anything shallower is dropped. */
const SAVE_MAX_EVAL = 300;
const SAVE_MS = 1200;
function saveHolds(S) {
  const r = think(S, SAVE_MS, SAVE_DEPTH);
  if (r.score <= -MATE + 100) return true; /* white mates: settled at any depth */
  if (r.depth < SAVE_DEPTH) return false;
  return r.score < Math.min(MATE - SAVE_DEPTH - 1, SAVE_MAX_EVAL);
}
/* The same position with the colours swapped and the board mirrored: the
   side that was mated becomes white, so the kid always defends. Castling
   and en passant rights are dropped (irrelevant near a mating attack). */
function colorFlipped(S) {
  const F = parseFEN('8/8/8/8/8/8/8/8 w - - 0 1');
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = S.board[sq];
    if (!p) continue;
    const to = (7 - (sq >> 4)) * 16 + (sq & 15);
    const q = isWhitePiece(p) ? p.toLowerCase() : p.toUpperCase();
    F.board[to] = q;
    if (q === 'K') F.kings.w = to;
    if (q === 'k') F.kings.b = to;
  }
  F.turn = other(S.turn);
  F.half = S.half;
  return F;
}

/* Positions where black (Turbo) threatens mate in one or two, or gives check,
   and white has one or two saving moves. Built from balanced noisy selfplay
   until either side mates: stepping back two or four plies lands on the move
   where the loser could still have saved himself (a white win is colour-
   flipped). Saves are verified with saveHolds; the cheap depth-2 pass only
   prunes candidates. */
function genKingTask(rng, attempts) {
  rng = rng || Math.random;
  for (let att = 0; att < (attempts || 40); att++) {
    let S = newGame();
    let found = false;
    for (let i = 0; i < 200; i++) {
      const list = rootScores(S, 2);
      if (!list.length) break;
      const top = list.filter(x => x.score >= list[0].score - 120).slice(0, 5);
      makeMove(S, top[Math.floor(rng() * top.length)].m);
      const st = gameStatus(S);
      if (st.over) {
        if (st.reason === 'mat' && S.hist.length >= 4) {
          const back = rng() < 0.5 ? 2 : 4;
          for (let k = 0; k < back; k++) unmakeMove(S);
          if (st.result === 'w') S = colorFlipped(S);
          found = true;
        }
        break;
      }
    }
    if (!found || S.turn !== 'w') continue;
    const threat = inCheck(S) ? 0 : (matingMoves(nullMoved(S), 1).length ? 1 : (matingMoves(nullMoved(S), 2).length ? 2 : 0));
    if (!inCheck(S) && !threat) continue;
    const cands = [];
    for (const m of legalMoves(S)) {
      makeMove(S, m);
      const st = gameStatus(S);
      const sc = st.over ? (st.reason === 'mat' ? -MATE : 0) : search(S, 2, -Infinity, Infinity, 1);
      unmakeMove(S);
      /* sc is black's view: black mates next move when sc >= MATE - 2 */
      if (sc < MATE - 3) cands.push(m);
      if (cands.length > 4) break;
    }
    if (!cands.length || cands.length > 4) continue;
    const saves = [];
    for (const m of cands) {
      makeMove(S, m);
      const st = gameStatus(S);
      /* the game ending after white's move means black is mated or it is a
         draw: either way white is out of danger */
      const holds = st.over ? true : saveHolds(S);
      unmakeMove(S);
      if (holds) saves.push(m);
      if (saves.length > 2) break;
    }
    if (!saves.length || saves.length > 2) continue;
    S.hist = [];
    return { S, type: inCheck(S) ? 'schaak' : 'mat' + threat, answers: saves.map(m => ({ m, info: null })) };
  }
  return null;
}

/* A white piece hangs (SEE loss) and white can save it: move it, defend it, or
   counter-attack. Every move after which black no longer wins material by force
   counts, as long as it does not hang something else, and checkPieceTask
   confirms that no accepted save is clearly worse than the best one. */
function genPieceTask(rng) {
  rng = rng || Math.random;
  let rejected = 0;
  for (let tries = 0; tries < 120 && rejected < 3; tries++) {
    const task = pieceTaskFrom(randomPosition({ noise: 260, minPlies: 8, maxPlies: 24, maxImbalance: 600 }, rng));
    if (!task) continue;
    if (checkPieceTask(task)) return task;
    rejected++;
  }
  return null;
}
/* The Red je stuk task in position S, before the check: one white piece
   hangs, and one to four moves keep the material. Null otherwise. The stock
   (STUK_POOL) is made from this too. */
function pieceTaskFrom(S) {
  if (S.turn !== 'w' || inCheck(S)) return null;
  /* one threat only, a pawn included: with two the child cannot save both */
  const threats = threatDetails(S).filter(t => t.gain >= 90), th = threats.filter(t => t.victim >= 300 && t.gain >= 250);
  if (threats.length !== 1 || th.length !== 1) return null;
  const base = forcedMaterial(S);
  const saves = [];
  for (const m of legalMoves(S)) {
    makeMove(S, m);
    const st = gameStatus(S);
    const after = st.over ? base : forcedMaterial(S);
    unmakeMove(S);
    if (after - base >= -60) saves.push({ m, info: null });
  }
  if (!saves.length || saves.length > 4) return null;
  return { S, type: 'stuk', hang: th[0], answers: saves };
}

/* --- the key moment of a game against Turbo (the child plays White) --- */

const POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function capturedSq(S, m) { return m.flags === 'e' ? m.to + (S.turn === 'w' ? -16 : 16) : m.to; }
function isPattern(info) { return info.fork.length >= 2 || !!info.pin || !!info.skewer || info.discovered.length > 0; }

/* What one move m of White meant, from the position before it: at most one
   moment, the first kind that applies, or null. A loss is in centipawns; 250
   is a minor piece minus a little, so a pawn lost in a trade never counts. */
function moveMoment(S, m) {
  const base = { moveNo: S.full, ply: S.hist.length, move: moveKey(m) };
  const bc = blunderCheck(S, m);
  if (bc && bc.mate) return Object.assign(base, { kind: 'mat', loss: MATE, punish: moveKey(bc.punish) });
  /* Turbo takes back on the square the child just captured on: the lesson is
     the defended piece that was taken, not a piece left hanging. */
  if (bc && bc.punish && isCapture(S, m) && bc.punish.to === m.to)
    return Object.assign(base, { kind: 'ruil', loss: bc.loss, sq: alg(m.to), punish: moveKey(bc.punish) });
  if (bc && bc.punish) {
    makeMove(S, m);
    const t = capturedSq(S, bc.punish), victim = isCapture(S, bc.punish) ? (S.board[t] || 'p') : null;
    const undefended = !!victim && findAttacker(S, t, 'w') < 0;
    const info = patternsAfterMove(S, bc.punish);
    unmakeMove(S);
    const taken = victim ? { sq: alg(t), piece: NAME_NL[victim.toLowerCase()], points: POINTS[victim.toLowerCase()] } : {};
    if (undefended) {
      /* taken where it went itself: no guard of that square went away */
      const d = t === m.to ? -1 : findAttacker(S, t, 'w');
      return Object.assign(base, { kind: 'hang', loss: bc.loss, punish: moveKey(bc.punish),
        defender: d >= 0 ? NAME_NL[S.board[d].toLowerCase()] : null, moved: d >= 0 && d === m.from }, taken);
    }
    if (isPattern(info)) return Object.assign(base, { kind: 'truc', loss: bc.loss, punish: moveKey(bc.punish) }, taken);
  }
  if (isCapture(S, m)) {
    const victim = S.board[capturedSq(S, m)] || 'p';
    makeMove(S, m);
    const back = seeSquare(S, m.to);
    unmakeMove(S);
    const net = VAL[victim.toLowerCase()] - back;
    if (net <= -200) return Object.assign(base, { kind: 'ruil', loss: -net, sq: alg(m.to) });
    if (net >= 250) return Object.assign(base, { kind: 'goed', gain: net, sq: alg(m.to) });
  }
  makeMove(S, m);
  const mated = inCheck(S) && legalMoves(S).length === 0;
  unmakeMove(S);
  if (mated) return null;
  const mate = mateReply(S);
  if (mate) return Object.assign(base, { kind: 'gemist', loss: 1000, mateWith: moveKey(mate) });
  /* a capture that would have cost more elsewhere (a queen that had to flee)
     was rightly left: it counts only when taking left White 2.5 points better */
  const resultOf = x => { makeMove(S, x); const v = forcedMaterial(S); unmakeMove(S); return v; };
  const afterM = resultOf(m);
  const wins = winnableCaptures(S).filter(x => x.gain >= 300 && resultOf(x.move) - afterM >= 250);
  if (wins.length && !wins.some(x => isCapture(S, m) && capturedSq(S, m) === x.sq)) {
    const w = wins.reduce((a, b) => b.gain > a.gain ? b : a);
    return Object.assign(base, { kind: 'gemist', loss: w.gain, sq: alg(w.sq), piece: NAME_NL[S.board[w.sq].toLowerCase()],
      points: POINTS[S.board[w.sq].toLowerCase()], with: moveKey(w.move) });
  }
  const info = patternsAfterMove(S, m);
  if (info.safe && isPattern(info)) return Object.assign(base, { kind: 'goed', pattern: true, gain: 0 });
  return null;
}
/* White's material when the game had `ply` half-moves. */
function materialAt(S, ply) {
  const back = [];
  while (S.hist.length > ply) { back.push(S.hist[S.hist.length - 1].m); unmakeMove(S); }
  const v = material(S);
  for (let i = back.length - 1; i >= 0; i--) makeMove(S, back[i]);
  return v;
}
/* The one moment for the end card: a mate first, otherwise the largest loss,
   otherwise the best good move; on a tie the earliest, since the first big
   mistake usually decided the game. A pattern move counts as good only when
   it worked: after the child's next move White is at least 2 points better
   than before it, because the detector also sees forks that win nothing. */
function chooseMoment(moments, S) {
  const ms = moments.filter(Boolean).map(x => {
    if (!x.pattern) return x;
    if (!S || S.hist.length < x.ply + 3) return null;
    const gain = materialAt(S, x.ply + 3) - materialAt(S, x.ply);
    return gain >= 200 ? Object.assign({}, x, { gain }) : null;
  }).filter(Boolean);
  const mate = ms.find(x => x.kind === 'mat');
  if (mate) return mate;
  const lost = ms.filter(x => x.kind !== 'goed');
  if (lost.length) return lost.reduce((a, b) => b.loss > a.loss ? b : a);
  const good = ms.filter(x => x.kind === 'goed');
  return good.length ? good.reduce((a, b) => b.gain > a.gain ? b : a) : null;
}
/* The key moment of the game so far, from its first move. The app can call
   moveMoment after each move instead, so nothing waits at the end. */
function keyMoment(S) {
  const moves = S.hist.map(u => u.m);
  for (let i = 0; i < moves.length; i++) unmakeMove(S);
  const moments = [];
  for (const m of moves) {
    if (S.turn === 'w') moments.push(moveMoment(S, m));
    makeMove(S, m);
  }
  return chooseMoment(moments, S);
}

/* --- the verified stock of tricks (src/trucs.js, made by tools/make-trucs.js) --- */

/* A type serves only with this many verified puzzles: fewer, and a child who
   plays daily recognises the positions within a week (decision D24). */
const TRUC_MIN = 15;
/* "<board> <side>": eight rows of eight squares and one king of each colour,
   so parseFEN never meets a board it cannot read */
function boardOk(s) {
  const m = /^([1-8pnbrqkPNBRQK]+(\/[1-8pnbrqkPNBRQK]+){7}) [wb]$/.exec(s);
  if (!m) return false;
  const rows = m[1].split('/');
  if (!rows.every(r => r.replace(/[1-8]/g, d => '.'.repeat(+d)).length === 8)) return false;
  return (m[1].match(/K/g) || []).length === 1 && (m[1].match(/k/g) || []).length === 1;
}
/* "<board> <side>|<type>|<answer>[,<answer>]" as a task, or null; a Red je
   stuk task (STUK_POOL) gets its hanging piece too. */
function trucTask(line) {
  const parts = String(line).split('|');
  if (parts.length !== 3 || !boardOk(parts[0])) return null;
  const S = parseFEN(parts[0] + ' - - 0 1');
  const legal = legalMoves(S);
  const answers = parts[2].split(',').map(k => legal.find(m => moveKey(m) === k));
  if (!answers.length || answers.some(m => !m)) return null;
  const task = { S, type: parts[1], answers: answers.map(m => ({ m, info: null })) };
  if (task.type === 'stuk') {
    task.hang = threatDetails(S).filter(t => t.victim >= 300 && t.gain >= 250)[0];
    if (!task.hang) return null;
  }
  return task;
}
/* The trick types the stock can serve. */
function trucTypes(pool) {
  const count = {};
  for (const line of pool || []) { const t = String(line).split('|')[1]; count[t] = (count[t] || 0) + 1; }
  return Object.keys(count).filter(t => count[t] >= TRUC_MIN);
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
  module.exports = { START_FEN, VAL, MATE, GLYPH, NAME_NL, parseFEN, toFEN, newGame, alg, sqFromAlg,
    colorOf, isWhitePiece, other, attacked, pseudoMoves, legalMoves, makeMove, unmakeMove,
    inCheck, isCapture, perft, material, evalWhite, search, rootScores, forcedMaterial, pickMove,
    blunderCheck, gameStatus, randomPosition, piecesOf, attackedPieces, captureTargets,
    freePieces, freePiecesEx, seeSquare, pieceAttacksSq, findAttacker, genScanTask,
    genSafeTask, genBest3, moveNameNL, forkTargets, raysPinSkewer, discoveredFrom,
    patternsAfterMove, patternMatches, genPatternTask, genMate1Task, genMate2Task,
    winnableCaptures, nullMoved, threatDetails, mateScore, matesIn, matesWithin, matingMoves, SAVE_DEPTH, SAVE_MAX_EVAL, SAVE_MS, saveHolds, colorFlipped,
    genKingTask, genPieceTask, BOOK_LINES, bookMoves, bookMove, moveKey, hashOf, think, clearTT,
    repetitions, positionKey, SUPER_NODES, CHECK_NODES, SAFE_NODES, checkSafeTask, checkPieceTask, lineAfter, nodesSearched,
    POINTS, moveMoment, chooseMoment, keyMoment, mateReply, TRUC_MIN, trucTask, trucTypes, saveKind, pieceTaskFrom };
}
