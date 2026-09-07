#!/usr/bin/env node
/* Genereert en verifieert de voorraad "Koning ontsnapt"-puzzels (schaak,
   mat-in-1- en mat-in-2-dreigingen) met de echte engine, en schrijft ze als
   src/koning.js. Live genereren duurt tientallen seconden per puzzel (de
   soundness-controle is duur), dus dit gebeurt vooraf. Elke redding wordt
   hier nog eens dieper nagerekend (diepte 8, met tijdslimiet) dan in de
   generator zelf; puzzels met een lek worden weggegooid.
   Draaien: node tools/make-koning.js [aantal] [uitvoerbestand]; parallel: meerdere
   werkers met elk een eigen uitvoerbestand, daarna samenvoegen (zie merge onderaan).
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
/* samenvoegen: node tools/make-koning.js merge deel-*.json */
function mergeOnly() {
  const seen = new Set(), all = [];
  for (const f of process.argv.slice(3)) for (const p of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    if (!seen.has(p.fen)) { seen.add(p.fen); all.push(p); }
  }
  writePool(all);
  process.stderr.write('samengevoegd: ' + all.length + ' puzzels\n');
}
process.stderr.write('klaar: ' + pool.length + ' puzzels ' + JSON.stringify(counts) + ' in ' + Math.round((Date.now() - t0) / 1000) + 's\n');
