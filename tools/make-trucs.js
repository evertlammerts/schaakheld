#!/usr/bin/env node
/* Maakt en controleert de voorraad trucs voor de Trucendoos (vork, penning,
   spies, aftrekaanval, mat in twee) met de echte engine, en schrijft ze als
   src/trucs.js. Een truc goed controleren kost seconden per stelling, op een
   trage telefoon tientallen; daarom gebeurt het vooraf.

   Een werker zoekt een vaste tijd en schrijft wat hij vindt naar zijn eigen
   bestand; samenvoegen schrijft src/trucs.js:
     node tools/make-trucs.js zoek <seconden> <zaad> <uitvoer.json> [types, of mat2]
     node tools/make-trucs.js merge <deel.json> ...
   Elk zoeken met hetzelfde zaad vindt dezelfde stellingen: alle zoektochten
   in de engine tellen knopen, geen tijd.

   Een stelling is een truc als (ux-run/design/learning.md 6.3.1):
   1. de beste zet op diepte 3 minstens 2 punten beter is dan de tweede;
   2. hij minstens 2 punten wint, ook als de engine dieper rekent;
   3. hij geen gewone slag is (een stuk dat je zo kunt pakken is Speurogen);
   4. de winst bij het patroon hoort: na de truc, zwarts beste antwoord en
      wits beste antwoord slaat wit op een veld van de vork, de penning, de
      spies of de aftrekaanval.
   Mat in twee komt van genMate2Task, dat exact is. */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));

const TYPES = ['vork', 'penning', 'spies', 'aftrek', 'mat2'];
const DOEL = { vork: 150, penning: 80, spies: 40, aftrek: 60, mat2: 120 };
const LIJN_KNOPEN = 150000, DIEP_KNOPEN = 600000;

function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Een truc wordt bewaard zonder rokade- en en-passantrecht, dus wordt hij ook
   zonder die rechten gecontroleerd. */
function zonderRechten(S) {
  return E.parseFEN(E.toFEN(S).split(' ').slice(0, 2).join(' ') + ' - - 0 1');
}
const bord = S => E.toFEN(S).split(' ').slice(0, 2).join(' ');
const bijzonder = m => m.flags === 'K' || m.flags === 'Q' || m.flags === 'e';

/* Het veld waarop wit slaat na de truc en zwarts beste antwoord: met wits
   tweede zet, of anders met zijn derde (een penning betaalt vaak een zet
   later uit). -1 als wit dan niet slaat. */
function winstVeld(S, m) {
  const gezet = [m];
  E.makeMove(S, m);
  let veld = -1;
  for (let ronde = 0; ronde < 2 && veld < 0 && !E.gameStatus(S).over; ronde++) {
    const zwart = E.think(S, 60000, 8, { nodes: LIJN_KNOPEN }).m;
    if (!zwart) break;
    E.makeMove(S, zwart); gezet.push(zwart);
    if (E.gameStatus(S).over) break;
    const wit = E.think(S, 60000, 8, { nodes: LIJN_KNOPEN }).m;
    if (!wit) break;
    if (E.isCapture(S, wit)) veld = wit.flags === 'e' ? wit.to - 16 : wit.to;
    else { E.makeMove(S, wit); gezet.push(wit); }
  }
  for (let i = 0; i < gezet.length; i++) E.unmakeMove(S);
  return veld;
}

/* Een zet die een penning, een spies of een aftrekaanval kan zijn; zonder
   zo'n vorm hoeft de dure toets 4 niet als alleen die types gezocht worden. */
function vorm(S, m) {
  const info = E.patternsAfterMove(S, m);
  E.makeMove(S, m);
  const ps = E.raysPinSkewer(S, m.to);
  E.unmakeMove(S);
  return { fork: info.fork, pins: ps.pins, skewers: ps.skewers, discovered: info.discovered };
}

/* Het type van de truc m, beslist door waar de winst valt (toets 4), of null;
   met het veld erbij. Alle penningen en spiesen van de zet tellen. */
function typeVan(S, m) {
  const info = vorm(S, m);
  const veld = winstVeld(S, m);
  if (veld < 0) return null;
  const met = type => ({ type, veld });
  if (info.fork.length >= 2 && info.fork.indexOf(veld) >= 0) return met('vork');
  if (info.pins.some(p => p.front === veld || p.back === veld)) return met('penning');
  if (info.skewers.some(p => p.back === veld)) return met('spies');
  if (info.discovered.some(x => x.target === veld)) return met('aftrek');
  return null;
}

/* Een stelling uit een rustige partij met ruis, wit aan zet, met een truc
   van een van de gevraagde types. */
function zoekPatroon(rng, types) {
  const ruw = E.randomPosition({ noise: 260, minPlies: 10, maxPlies: 30, maxImbalance: 500 }, rng);
  const S = zonderRechten(ruw);
  if (S.turn !== 'w' || E.inCheck(S) || E.gameStatus(S).over) return null;
  const scores = E.rootScores(S, 3);
  if (scores.length < 2) return null;
  const best = scores[0], basis = E.evalWhite(S);
  if (best.score - basis < 150) return null;
  /* De tweede beste is de beste zet die geen antwoord is: twee zetten die
     dezelfde truc doen (binnen 50) zijn allebei goed. */
  if (best.score - scores[1].score > 50 && best.score - scores[1].score < 150) return null;
  if (types.indexOf('vork') < 0) {
    const v = vorm(S, best.m);
    if (!v.pins.length && !v.skewers.length && !v.discovered.length) return null;
  }
  /* Een slag die zelf al 2 punten of meer wint, is een truc alleen als de
     winst ergens anders valt en de lijn nog 1,5 punt meer oplevert. */
  const slag = m => E.isCapture(S, m) ? E.seeSquare(S, m.to) : 0;
  const goedType = (m, t) => !!t && (slag(m) < 200 || t.veld !== m.to);
  if (bijzonder(best.m)) return null;
  const t0 = typeVan(S, best.m);
  if (!goedType(best.m, t0) || types.indexOf(t0.type) < 0) return null;
  const type = t0.type, antwoorden = [best.m];
  for (const x of scores.slice(1)) {
    if (best.score - x.score > 50) {
      if (best.score - x.score < 150) return null;
      break;
    }
    const t = bijzonder(x.m) ? null : typeVan(S, x.m);
    if (!goedType(x.m, t) || t.type !== type) return null;
    antwoorden.push(x.m);
  }
  if (antwoorden.length > 2) return null;
  for (const m of antwoorden) {
    E.makeMove(S, m);
    const r = E.think(S, 60000, 10, { nodes: DIEP_KNOPEN });
    E.unmakeMove(S);
    const extra = slag(m) >= 200 ? slag(m) : 0;
    if (r.depth < 5 || -r.score - extra < basis + 150) return null;
  }
  return { bord: bord(S), type, antwoorden: antwoorden.map(E.moveKey) };
}

function zoekMat2(rng) {
  const t = E.genMate2Task(rng);
  if (!t) return null;
  const S = zonderRechten(t.S);
  if (E.inCheck(S) || E.matingMoves(S, 1).length) return null;
  const antwoorden = E.matingMoves(S, 2);
  if (!antwoorden.length || antwoorden.length > 2 || antwoorden.some(bijzonder)) return null;
  return { bord: bord(S), type: 'mat2', antwoorden: antwoorden.map(E.moveKey) };
}

function zoek(seconden, zaad, uitvoer, soorten) {
  const alleenMat2 = soorten[0] === 'mat2';
  const rng = mulberry32(zaad >>> 0);
  const t0 = Date.now(), gevonden = [], gezien = new Set(), telling = {};
  let pogingen = 0;
  while (Date.now() - t0 < seconden * 1000) {
    pogingen++;
    const p = alleenMat2 ? zoekMat2(rng) : zoekPatroon(rng, soorten);
    if (!p || gezien.has(p.bord)) continue;
    gezien.add(p.bord);
    gevonden.push(p);
    telling[p.type] = (telling[p.type] || 0) + 1;
    fs.writeFileSync(uitvoer, JSON.stringify(gevonden));
    process.stderr.write(zaad + ': ' + p.type + ' ' + p.bord + ' ' + p.antwoorden + ' na ' + pogingen + ' pogingen, ' +
      Math.round((Date.now() - t0) / 1000) + 's ' + JSON.stringify(telling) + '\n');
  }
  fs.writeFileSync(uitvoer, JSON.stringify(gevonden));
  process.stderr.write(zaad + ' klaar: ' + JSON.stringify(telling) + ' in ' + pogingen + ' pogingen\n');
}

function merge(bestanden) {
  const perType = {}, gezien = new Set();
  for (const f of bestanden) {
    for (const p of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      if (gezien.has(p.bord)) continue;
      gezien.add(p.bord);
      (perType[p.type] = perType[p.type] || []).push(p);
    }
  }
  const pool = [], telling = {}, weg = [];
  for (const type of TYPES) {
    const lijst = (perType[type] || []).sort((a, b) => a.bord < b.bord ? -1 : 1).slice(0, DOEL[type]);
    if (lijst.length < E.TRUC_MIN) { if (lijst.length) weg.push(type + ' (' + lijst.length + ')'); continue; }
    telling[type] = lijst.length;
    for (const p of lijst) pool.push(p.bord + '|' + p.type + '|' + p.antwoorden.join(','));
  }
  const uit = "'use strict';\n/* Gegenereerd door tools/make-trucs.js; niet met de hand bewerken. " + pool.length +
    ' geverifieerde trucs: ' + Object.keys(telling).map(k => k + ' ' + telling[k]).join(', ') + '. */\n' +
    'const TRUC_POOL = ' + JSON.stringify(pool) + ';\n' +
    "if (typeof module !== 'undefined') module.exports = { TRUC_POOL };\n";
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'trucs.js'), uit);
  process.stderr.write('samengevoegd: ' + JSON.stringify(telling) + (weg.length ? '; te weinig, weggelaten: ' + weg.join(', ') : '') + '\n');
}

const [opdracht, ...rest] = process.argv.slice(2);
if (opdracht === 'zoek') zoek(+rest[0], +rest[1], rest[2], (rest[3] || 'vork,penning,spies,aftrek').split(','));
else if (opdracht === 'merge') merge(rest);
else { process.stderr.write('gebruik: zoek <seconden> <zaad> <uitvoer.json> [types, of mat2] | merge <deel.json> ...\n'); process.exit(1); }
