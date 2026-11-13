#!/usr/bin/env node
/* Genereert en verifieert de voorraad "Koning ontsnapt"-puzzels (schaak,
   mat-in-1- en mat-in-2-dreigingen) met de echte engine, en schrijft ze als
   src/koning.js. Live genereren duurt tientallen seconden per puzzel (de
   soundness-controle is duur), dus dit gebeurt vooraf. Elke redding wordt
   hier nog eens dieper nagerekend (diepte 8, met tijdslimiet) dan in de
   generator zelf; puzzels met een lek worden weggegooid.
   Een puzzel heeft minstens een zet die fout is: goed is een
   antwoord of een zet die het potje meteen beëindigt, zoals de app oordeelt.
   Zonder foute zet krijgt een kind drie sterren voor de enige zet die er is.
   Ook weg (na een diepere controle): een zet die remise
   maakt terwijl wit een stuk of meer voor staat, want dan gooit "Gered!" een
   gewonnen stelling weg; en een foute zet die minder dan 1,5 punt slechter
   scoort dan het slechtste antwoord, want dan hoort een kind dat een even
   goede zet fout is. Die laatste toets zoekt elke zet apart, dus loopt hij
   los: node tools/make-koning.js toets <uitvoer.json> <bron> [deel/aantal],
   en daarna merge van de uitvoer.
   Draaien: node tools/make-koning.js [aantal] [uitvoerbestand]; parallel: meerdere
   werkers met elk een eigen uitvoerbestand, daarna samenvoegen (zie merge onderaan).
   Samenvoegen houdt ook de regel van de foute zet, dus de bestaande voorraad
   opnieuw nalopen is: node tools/make-koning.js merge src/koning.js
   Op de devbox: nix shell nixpkgs#nodejs_22 -c node tools/make-koning.js 20 deel-1.json */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const DIEP = 400000;
if (process.argv[2] === 'merge') { mergeOnly(); process.exit(0); }
if (process.argv[2] === 'toets') { toetsOnly(); process.exit(0); }
const want = +(process.argv[2] || 150);
const outFile = process.argv[3] || null;
const perType = Math.ceil(want / 3) + 10;
const pool = [], counts = {};
const seen = new Set();
const t0 = Date.now();
let att = 0, leaks = 0;
while (pool.length < want) {
  att++;
  const k = E.genKingTask();
  if (!k) continue;
  if ((counts[k.type] || 0) >= perType) continue;
  const fen = E.toFEN(k.S);
  if (seen.has(fen)) continue;
  const keys = k.answers.map(a => E.moveKey(a.m));
  if (!heeftFouteZet(fen, keys) || remiseTerwijlVoor(fen) || fouteZetBijna(fen, keys)) continue;
  let leak = false;
  for (const a of k.answers) {
    E.makeMove(k.S, a.m);
    const st = E.gameStatus(k.S);
    const r = st.over ? { score: 0 } : E.think(k.S, 6000, 8);
    E.unmakeMove(k.S);
    if (r.score >= E.MATE - 9 || r.score >= E.SAVE_MAX_EVAL) leak = true;
  }
  if (leak) { leaks++; continue; }
  seen.add(fen);
  counts[k.type] = (counts[k.type] || 0) + 1;
  pool.push({ fen, type: k.type, answers: k.answers.map(a => E.moveKey(a.m)) });
  process.stderr.write('[' + pool.length + '/' + want + '] ' + k.type + ' na ' + att + ' pogingen, ' +
    Math.round((Date.now() - t0) / 1000) + 's, lekken ' + leaks + '\n');
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(pool));
else writePool(pool);
function writePool(pool) {
  const out = "'use strict';\n/* Gegenereerd door tools/make-koning.js; niet met de hand bewerken. " +
    pool.length + ' geverifieerde puzzels. */\nconst KONING_POOL = ' + JSON.stringify(pool) + ';\n' +
    "if (typeof module !== 'undefined') module.exports = { KONING_POOL };\n";
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'koning.js'), out);
}
function heeftFouteZet(fen, answers) {
  const S = E.parseFEN(fen);
  return E.legalMoves(S).some(m => {
    if (answers.indexOf(E.moveKey(m)) >= 0) return false;
    E.makeMove(S, m);
    const eindigt = E.gameStatus(S).over;
    E.unmakeMove(S);
    return !eindigt;
  });
}
/* elke zet die remise maakt telt, ook een die geen antwoord is: de app rekent
   een zet die het potje beëindigt goed */
function remiseTerwijlVoor(fen) {
  const S = E.parseFEN(fen);
  if (E.material(S) < 300) return false;
  return E.legalMoves(S).some(m => {
    E.makeMove(S, m);
    const st = E.gameStatus(S);
    E.unmakeMove(S);
    return st.over && st.reason !== 'mat';
  });
}
/* Wits score na zet m, elke zet met een lege tabel en hetzelfde knoopbudget. */
function waardeNa(S, m) {
  E.makeMove(S, m);
  const st = E.gameStatus(S);
  let v;
  if (st.over) v = st.reason === 'mat' ? E.MATE : 0;
  else { E.clearTT(); v = -E.think(S, 600000, 10, { nodes: DIEP }).score; }
  E.unmakeMove(S);
  return v;
}
function fouteZetBijna(fen, answers) {
  const S = E.parseFEN(fen), zetten = E.legalMoves(S);
  const isAntwoord = m => answers.indexOf(E.moveKey(m)) >= 0;
  const eindigt = m => { E.makeMove(S, m); const o = E.gameStatus(S).over; E.unmakeMove(S); return o; };
  const slechtste = Math.min(...zetten.filter(isAntwoord).map(m => waardeNa(S, m)));
  return zetten.some(m => !isAntwoord(m) && !eindigt(m) && waardeNa(S, m) > slechtste - 150);
}
function leesBron(f) { return /\.js$/.test(f) ? require(path.resolve(f)).KONING_POOL : JSON.parse(fs.readFileSync(f, 'utf8')); }
/* samenvoegen: node tools/make-koning.js merge <bron> ...; een bron is een
   deel.json van een werker of src/koning.js zelf. De goedkope regels hier;
   de diepe toets van de foute zet doet toets. */
function mergeOnly() {
  const seen = new Set(), all = [];
  let zonder = 0, remise = 0;
  for (const f of process.argv.slice(3)) {
    for (const p of leesBron(f)) {
      if (seen.has(p.fen)) continue;
      seen.add(p.fen);
      if (!heeftFouteZet(p.fen, p.answers)) zonder++;
      else if (remiseTerwijlVoor(p.fen)) remise++;
      else all.push(p);
    }
  }
  writePool(all);
  process.stderr.write('samengevoegd: ' + all.length + ' puzzels, ' + zonder + ' weg zonder foute zet, ' + remise + ' weg om remise terwijl wit voor staat\n');
}
/* toets <uitvoer.json> <bron> [deel/aantal]: de puzzels die de diepe toets
   doorstaan; een deel is een aaneengesloten stuk, zodat de delen samen de
   volgorde van de bron houden */
function toetsOnly() {
  const [uitvoer, bron, deel] = process.argv.slice(3);
  const lijst = leesBron(bron), [i, n] = (deel || '0/1').split('/').map(Number);
  const van = Math.floor(lijst.length * i / n), tot = Math.floor(lijst.length * (i + 1) / n);
  const goed = [];
  for (let j = van; j < tot; j++) {
    const p = lijst[j];
    if (fouteZetBijna(p.fen, p.answers)) process.stderr.write('weg: ' + j + ' ' + p.fen + ' ' + p.answers + '\n');
    else goed.push(p);
    fs.writeFileSync(uitvoer, JSON.stringify(goed));
  }
  process.stderr.write('getoetst: ' + goed.length + ' van ' + (tot - van) + ' blijven\n');
}
process.stderr.write('klaar: ' + pool.length + ' puzzels ' + JSON.stringify(counts) + ' in ' + Math.round((Date.now() - t0) / 1000) + 's\n');
