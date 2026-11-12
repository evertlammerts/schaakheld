#!/usr/bin/env node
/* Genereert en verifieert de voorraad "Koning ontsnapt"-puzzels (schaak,
   mat-in-1- en mat-in-2-dreigingen) met de echte engine, en schrijft ze als
   src/koning.js. Live genereren duurt tientallen seconden per puzzel (de
   soundness-controle is duur), dus dit gebeurt vooraf. Elke redding wordt
   hier nog eens dieper nagerekend (diepte 8, met tijdslimiet) dan in de
   generator zelf; puzzels met een lek worden weggegooid.
   Een puzzel heeft minstens een zet die fout is (de schaakcoach): goed is een
   antwoord of een zet die het potje meteen beëindigt, zoals de app oordeelt.
   Zonder foute zet krijgt een kind drie sterren voor de enige zet die er is.
   Draaien: node tools/make-koning.js [aantal] [uitvoerbestand]; parallel: meerdere
   werkers met elk een eigen uitvoerbestand, daarna samenvoegen (zie merge onderaan).
   Samenvoegen houdt ook de regel van de foute zet, dus de bestaande voorraad
   opnieuw nalopen is: node tools/make-koning.js merge src/koning.js
   Op de devbox: nix shell nixpkgs#nodejs_22 -c node tools/make-koning.js 20 deel-1.json */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
if (process.argv[2] === 'merge') { mergeOnly(); process.exit(0); }
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
  if (!heeftFouteZet(fen, k.answers.map(a => E.moveKey(a.m)))) continue;
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
/* samenvoegen: node tools/make-koning.js merge <bron> ...; een bron is een
   deel.json van een werker of src/koning.js zelf */
function mergeOnly() {
  const seen = new Set(), all = [];
  let zonder = 0;
  for (const f of process.argv.slice(3)) {
    const lijst = /\.js$/.test(f) ? require(path.resolve(f)).KONING_POOL : JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const p of lijst) {
      if (seen.has(p.fen)) continue;
      seen.add(p.fen);
      if (heeftFouteZet(p.fen, p.answers)) all.push(p);
      else zonder++;
    }
  }
  writePool(all);
  process.stderr.write('samengevoegd: ' + all.length + ' puzzels, ' + zonder + ' weg zonder foute zet\n');
}
process.stderr.write('klaar: ' + pool.length + ' puzzels ' + JSON.stringify(counts) + ' in ' + Math.round((Date.now() - t0) / 1000) + 's\n');
