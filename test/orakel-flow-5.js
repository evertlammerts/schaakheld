/* Orakel, flowtests voor de app-stap van increment 5 (plan.md, regels 5.1,
   5.4, 5.5, 5.8, 5.9 en 5.11): de schaakinhoud zoals een kind hem ziet. Een
   eigen bestand naast test/orakel-flow.js, met dezelfde helpers en hetzelfde
   nogNiet en regel. De teksten zijn die van schaak.md, "Reasons that fit", en
   learning.md 2.1 en 2.3. */

/* De zin onder het bord, de strook en de redenen na een antwoord. De shim
   zet een spatie tussen elementen, ook voor een leesteken na een vet woord. */
function norm5(t) { return t.replace(/\s+/g, ' ').replace(/ ([.,:;!?])/g, '$1').trim(); }
function onder5(a) { return zichtbaar(a, 'hulpZin') ? norm5(tekstVan(a, 'hulpZin')) : ''; }
function strook5(a) { return norm5(tekstVan(a, 'bubble')); }
function redenen5(a) {
  const box = a.el('taskBox');
  if (!box) return [];
  return box.querySelectorAll('p').concat(box.querySelectorAll('li')).map(function (e) { return norm5(a.doc.__tekst(e)); });
}
function isPuzzel5(a) { return a.get('!!session && session.phase === "puzzle"'); }
/* de opdracht zoals hij klaarstaat, voor er een zet op het bord is gedaan */
function opdracht5(a) {
  return a.get('(function () { var t = session.task; return { bord: toFEN(t.S).split(" ").slice(0, 2).join(" "), type: t.type,' +
    ' antwoorden: t.answers.map(function (x) { return moveKey(x.m); }) }; })()');
}
/* f4 valt de dame op e5 en het paard op g5 aan; een regel uit de voorraad */
const VORK5 = ['1k1r1b1r/1pp1ppp1/p1n4p/3pq1n1/8/P1NBP3/1PPPQPPP/R1B1R1K1 w - - 0 1', 'f2f4'];
const HANG5 = '{ hang: threatDetails(S).filter(function (t) { return t.victim >= 300 && t.gain >= 250; })[0] }';

/* foute zetten tot het antwoord er staat: een zet die geen antwoord is en het potje niet beëindigt */
async function foutTotAntwoord5(a) {
  for (let i = 0; i < 3 && isPuzzel5(a); i++) {
    const k = a.get('(function () { var t = session.task, S = session.S; var m = legalMoves(S).find(function (x) {' +
      ' if (x.promo || t.answers.some(function (y) { return moveKey(y.m) === moveKey(x); })) return false;' +
      ' makeMove(S, x); var o = gameStatus(S).over; unmakeMove(S); return !o; }); return m ? moveKey(m) : null; })()');
    if (!k) return;
    zet(a, k);
    await wacht(8000);
  }
}

/* naar de volgende opdracht van dezelfde oefening, ook als het rondje net klaar is */
async function naarVolgende5(a, soort) {
  for (let i = 0; i < 8 && a.ziet('Level omhoog'); i++) { a.tik('lvlOk'); await wacht(); }
  if (kanTikken(a, 'Volgende')) { tikTekst(a, 'Volgende'); await wacht(); }
  for (let i = 0; i < 8 && a.ziet('Level omhoog'); i++) { a.tik('lvlOk'); await wacht(); }
  if (isPuzzel5(a)) return;
  if (kanTikken(a, 'Nog een rondje')) { tikTekst(a, 'Nog een rondje'); await wacht(); }
  if (isPuzzel5(a)) return;
  if (a.open()) a.ev('closeModal()');
  await naarHuis(a);
  await startOefening(a, soort);
}

/* De Beste Zet wisselt een keuze uit drie af met de valstrik-vraag: kies tot de
   keuze klaar is (een verkeerde keuze laat de opdracht open), dan Volgende */
async function keuzeUitDrie5(a) {
  for (let k = 0; k < 3 && a.get('!!session && !!session.task && !!session.task.options && session.phase !== "review"'); k++) {
    const keuzes = a.el('optionsBox').querySelectorAll('button');
    if (!keuzes[k]) break;
    await wacht(1000);
    tikEl(a, keuzes[k]);
    await wacht();
    if (kanTikken(a, 'Deze kies ik')) { tikTekst(a, 'Deze kies ik'); await wacht(6000); }
  }
}
async function naarValstrikVraag5(a) {
  for (let i = 0; i < 4 && !a.get('!!session.task && !!session.task.move'); i++) {
    await keuzeUitDrie5(a);
    await naarVolgende5(a, 'best3');
  }
}
/* een voorraad tijdelijk vervangen; de app leest hem pas als hij hem nodig heeft */
async function metVoorraad5(pool, regels, blok) {
  const bewaar = pool.slice();
  pool.splice(0, pool.length);
  regels.forEach(function (r) { pool.push(r); });
  try { return await blok(); } finally {
    pool.splice(0, pool.length);
    bewaar.forEach(function (r) { pool.push(r); });
  }
}
function vanType5(type, n) { return TRUC_POOL.filter(function (r) { return r.split('|')[1] === type; }).slice(0, n); }
function alleSleutels5(a) { return Object.assign({}, a.opslag._m); }
/* een vaste reeks toevalsgetallen: de app kan er stellingen mee maken, en elke run is dezelfde */
function vasteKans5(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* de klok vooruit tot iets waar is, en dan meteen terug */
async function totDat5(vraag, venster) {
  const tot = __klok + venster;
  while (__klok < tot) {
    if (vraag()) return true;
    const stap = Math.min(tot, __klok + 50);
    drainTot(400, stap);
    if (__klok < stap) __klok = stap;
    for (let j = 0; j < 40; j++) await null;
  }
  return !!vraag();
}

/* Een kind dat zelf speelt: elke zet de beste op diepte 2, geen promotie
   (die vraagt een keuze). Na elke zet van Turbo krijgt perZet de stand voor
   zijn zet, zijn zet, of de voorspelvraag kwam, en de strook daarna. */
async function speelZelf5(a, maxZetten, perZet, check5) {
  for (let n = 0; n < maxZetten; n++) {
    if (a.get('!session || session.over || session.S.turn !== "w"')) return;
    const fen = a.fen(), h0 = a.get('session.S.hist.length');
    const k = a.get('(function () { var r = rootScores(session.S, 2).filter(function (x) { return !x.m.promo; });' +
      ' return r.length ? moveKey(r[0].m) : null; })()');
    if (!k || !zet(a, k)) return;
    let gevraagd = false;
    await totDat5(function () {
      if (a.get('BD.mode === "predict"')) gevraagd = true;
      return gevraagd || a.get('session.over || session.S.hist.length >= ' + (h0 + 2));
    }, 30000);
    if (gevraagd) {
      check5('"Speel maar" staat in beeld', kanTikken(a, 'Speel maar'));
      tikTekst(a, 'Speel maar');
      await totDat5(function () { return a.get('session.over || session.S.hist.length >= ' + (h0 + 2)); }, 30000);
    }
    await wacht(1500);
    if (a.get('session.S.hist.length') < h0 + 2) return;
    const voor = parseFEN(fen);
    makeMove(voor, legalMoves(voor).find(function (x) { return moveKey(x) === k; }));
    const turbo = a.get('moveKey(session.S.hist[' + (h0 + 1) + '].m)');
    perZet({ voor: voor, zet: legalMoves(voor).find(function (x) { return moveKey(x) === turbo; }), gevraagd: gevraagd, strook: strook5(a) });
  }
}
/* Telt Turbo's zet m in stand S (zwart aan zet): slaat hij, geeft hij schaak,
   of maakt hij een nieuwe dreiging? Nieuw: na de zet kan Turbo een stuk van
   het kind winnen (threatDetails) dat hij voor de zet niet kon winnen. */
function zetTelt5(S, m) {
  const voor = winnableCaptures(S).map(function (t) { return t.sq; });
  const slag = isCapture(S, m);
  makeMove(S, m);
  const schaak = inCheck(S);
  const nieuw = schaak ? [] : threatDetails(S).filter(function (t) { return voor.indexOf(t.sq) < 0; });
  unmakeMove(S);
  return { slag: slag, schaak: schaak, nieuw: nieuw };
}

async function orakelFlow5() {
  /* ================= increment 5 ================= */

  /* ---------- 5.1: de Trucendoos uit de voorraad ---------- */

  await regel('[5.1] de Trucendoos haalt elke truc uit de voorraad, met de antwoorden van die regel', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    for (let i = 0; i < 3; i++) {
      if (!check('testopzet: truc ' + (i + 1) + ' staat klaar', isPuzzel5(a))) return;
      const t = opdracht5(a);
      const r = TRUC_POOL.find(function (x) { const d = x.split('|'); return d[0] === t.bord && d[1] === t.type; });
      check('truc ' + (i + 1) + ' (' + t.bord + ', ' + t.type + ') staat in de voorraad', !!r);
      check('met de antwoorden van die regel', !!r && r.split('|')[2].split(',').sort().join() === t.antwoorden.slice().sort().join());
      await foutTotAntwoord5(a);
      await naarVolgende5(a, 'trucs');
    }
  });

  await regel('[5.1] elke truc van een type komt eenmaal voor er een terugkomt, ook na herladen, en de plek staat buiten het profiel', async function (check) {
    const vork = vanType5('vork', 15);
    await metVoorraad5(TRUC_POOL, vork, async function () {
      let a = nieuwKind();
      const gezien = [];
      for (let ronde = 0; ronde < 3; ronde++) {
        const voor = alleSleutels5(a);
        await startOefening(a, 'trucs');
        for (let i = 0; i < 5; i++) {
          if (!check('testopzet: truc ' + (gezien.length + 1) + ' staat klaar', isPuzzel5(a))) return;
          const t = opdracht5(a);
          gezien.push(t.bord);
          zet(a, t.antwoorden[0]);
          await wacht(8000);
          if (i < 4) await naarVolgende5(a, 'trucs');
        }
        if (ronde === 0) {
          const na = alleSleutels5(a), eigen = Object.keys(na).filter(function (s) {
            return ['schaakheld1', POTJE, RONDJES].indexOf(s) < 0 && na[s] !== voor[s];
          });
          check('de plek staat in een eigen sleutel, niet in het profiel', eigen.length > 0);
        }
        if (a.open()) a.ev('closeModal()');
        await naarHuis(a);
        a = herlaad(a);
        await wacht();
      }
      check('vijftien verschillende trucs (' + new Set(gezien).size + ')', new Set(gezien).size === 15);
      check('precies de vijftien van de voorraad', gezien.every(function (b) { return vork.some(function (r) { return r.split('|')[0] === b; }); }));
      await startOefening(a, 'trucs');
      check('de zestiende is er weer een van de vijftien', isPuzzel5(a) && vork.some(function (r) { return r.split('|')[0] === opdracht5(a).bord; }));
    });
  });

  await regel('[5.1] na een opgeloste truc antwoordt Turbo op het bord, zodat het kind ziet wat het won', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    const h0 = a.get('session.S.hist.length');
    zet(a, VORK5[1]);
    const antwoord = await zagOoit(function () { return a.get('session.S.hist.length') === h0 + 2; }, 8000);
    check('na de vork zet Turbo', antwoord);
    check('de opdracht is goed', a.get('session.phase') === 'review' && /Vork/.test(tekstVan(a, 'taskBox')));
  });

  await regel('[5.1] een type met minder dan 15 trucs komt niet in de Trucendoos', async function (check) {
    await metVoorraad5(TRUC_POOL, vanType5('vork', 15).concat(vanType5('spies', 14)), async function () {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      const types = [];
      for (let i = 0; i < 5; i++) {
        if (!check('testopzet: truc ' + (i + 1) + ' staat klaar', isPuzzel5(a))) return;
        const t = opdracht5(a);
        types.push(t.type);
        check('truc ' + (i + 1) + ' komt uit de voorraad', TRUC_POOL.some(function (r) { return r.split('|')[0] === t.bord; }));
        zet(a, t.antwoorden[0]);
        await wacht(8000);
        if (i < 4) await naarVolgende5(a, 'trucs');
      }
      check('alleen vorken (' + types.join(', ') + ')', types.every(function (x) { return x === 'vork'; }));
    });
  });

  /* Regels uit de voorraad die de herkenning van vandaag (patternMatches) afwijst (22 van de 35 aftrekaanvallen):
     het antwoord van de regel telt, want de tool heeft het geverifieerd. */
  for (const r of ['1rb1k2r/1pp1bpp1/p2pn2p/3n1q2/3PN3/3BPN2/PPP1QPPP/3RR1K1 w|aftrek|e4d6',
    '1k1r3r/ppp2ppp/3bpqbn/1Bnp4/3N4/N1BPP3/PPP1QPPP/R3R1K1 w|aftrek|d4c6']) {
    const d = r.split('|');
    await regel('[5.1] Trucendoos, ' + d[1] + ': het antwoord uit de voorraad is goed (' + d[2] + ')', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      zetOpdracht(a, d[0] + ' - - 0 1', d[1], d[2].split(','));
      const voor = a.get('session.earned');
      zet(a, d[2].split(',')[0]);
      await wacht(6000);
      check('goed in een keer: drie sterren (' + (a.get('session.earned') - voor) + ')', a.get('session.phase') === 'review' && a.get('session.earned') - voor === 3);
    });
  }

  /* ---------- 5.4: het blunderalarm noemt wat in gevaar is ---------- */

  /* 3.Pg5? Dxg5: het paard op g5 heeft geen dekking */
  const ALARM = [
    ['een kind dat net begint, tegen Slaapkop Turbo', 1, null, 'Na deze zet kan Turbo je paard op g5 pakken.'],
    ['tegen Super Turbo', 3, null, 'Na deze zet kan Turbo iets van je pakken.'],
    ['een kind dat al sterk is', 1, 'sterk', 'Na deze zet kan Turbo iets van je pakken.']
  ];
  for (const g of ALARM) {
    await nogNiet('[5.4] het blunderalarm, ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(g[1], ['e2e4', 'e7e5', 'g1f3', 'd7d6']) });
      a.ev('setPref("guard", true)');
      if (g[2]) a.ev('setPref("start", ' + JSON.stringify(g[2]) + ')');
      a.tik('verderKaart');
      await wacht();
      if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === 4'))) return;
      zet(a, 'f3g5');
      await wacht(500);
      check('het alarm staat open', a.open() && /Wacht even/.test(a.scherm()));
      check('met de zin', a.scherm().indexOf(g[3]) >= 0);
    });
  }

  for (const g of [['tegen Slaapkop Turbo', 1, null], ['tegen Super Turbo voor een kind dat al sterk is', 3, 'sterk']]) {
    await nogNiet('[5.4] het blunderalarm voor mat in één, ' + g[0] + ': "Na deze zet kan Turbo je schaakmat zetten."', async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(g[1], ['f2f3', 'e7e5']) });
      a.ev('setPref("guard", true)');
      if (g[2]) a.ev('setPref("start", ' + JSON.stringify(g[2]) + ')');
      a.tik('verderKaart');
      await wacht();
      if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === 2'))) return;
      zet(a, 'g2g4');
      await wacht(500);
      check('het alarm zegt mat', a.open() && a.scherm().indexOf('Na deze zet kan Turbo je schaakmat zetten.') >= 0);
    });
  }

  /* ---------- 5.5: Red je stuk zegt hoe het stuk gered is ---------- */

  const RED = [
    ['weg', '4k3/8/4b3/2n5/2B5/8/8/6K1 w - - 0 1', 'c4e2', 'Weggezet: daar kan Turbo hem niet pakken.'],
    ['weg naar een gedekt veld', 'r1b1kb1r/1pppqppp/p1n5/3np3/4NB2/3P1N2/PPP1PPPP/1RQ1KB1R w - - 0 1', 'f4g5', 'Weggezet naar g5: daar is hij gedekt.'],
    ['ruil na een zet', '4k3/8/4b3/2n5/2B5/8/8/6K1 w - - 0 1', 'c4e6', 'Ruil: je loper slaat de loper (3 punten); Turbo slaat terug (3 punten).'],
    ['de aanvaller slaan', '6k1/8/8/3p4/2P1N3/8/8/6K1 w - - 0 1', 'c4d5', 'Je slaat de aanvaller.'],
    ['ertussen', '6k1/8/3q4/8/7B/8/5P1R/5K2 w - - 0 1', 'h4g3', 'Ertussen: je loper staat nu tussen de dame en je toren.'],
    ['gedekt', '4r1k1/8/8/8/4N3/8/3P4/6K1 w - - 0 1', 'd2d3', 'Gedekt: slaat Turbo, dan pak jij terug.'],
    ['het stuk slaat zelf', '3rk3/8/8/8/1n6/8/3Q4/6K1 w - - 0 1', 'd2b4', 'Je dame slaat het paard (3 punten) en staat daar veilig.'],
    ['het stuk slaat zelf een pion', 'r1b1kb1r/1pp2ppp/p1npq3/3N4/3PpQ2/2P5/PP2PPPP/1R2KBNR w - - 0 1', 'd5c7', 'Je paard slaat de pion (1 punt) en staat daar veilig.'],
    ['tegenaanval', '1r2k1nr/ppp1pp1N/4q1p1/8/4n3/N4Q2/PPPP1PPP/R1B2K1R w - - 0 1', 'd2d3', 'Tegenaanval: Turbo heeft nu zelf iets te redden.'],
    ['schaak', '2kr1b1r/ppp2ppp/n2q1n2/3pp3/3N1QbP/3BP3/PPPP1PP1/RNB3KR w - - 0 1', 'd3f5', 'Schaak! Daarmee win je tijd: Turbo moet eerst zijn koning redden.']
  ];
  for (const g of RED) {
    await regel('[5.5] Red je stuk, ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, g[1], 'stuk', [g[2]], HANG5);
      if (!check('testopzet: een hangend stuk', a.get('!!session.task.hang'))) return;
      zet(a, g[2]);
      await wacht(5000);
      check('gered', /Gered/.test(tekstVan(a, 'taskBox')));
      check('met de reden als eigen regel, zonder emoji', redenen5(a).indexOf(g[3]) >= 0);
    });
  }

  await regel('[5.5] Red je stuk: de hint noemt het stuk en wie het aanvalt', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '4k3/8/4b3/2n5/2B5/8/8/6K1 w - - 0 1', 'stuk', ['c4e2'], HANG5);
    tikTekst(a, 'Hint');
    await wacht();
    check('de hint', onder5(a) === 'Je loper op c4 wordt aangevallen door de loper op e6. Met deze hint is de opdracht nog 2 sterren waard.');
  });

  await regel('[5.5] Koning ontsnapt: de koning is alleen rood als hij schaak staat', async function (check) {
    const mat = KONING_POOL.filter(function (p) { return p.type === 'mat1'; })[0];
    const schaak = KONING_POOL.filter(function (p) { return p.type === 'schaak'; })[0];
    if (!check('testopzet: in de voorraad staat een matdreiging zonder schaak', !!mat && !inCheck(parseFEN(mat.fen)))) return;
    const echt = Math.random;
    Math.random = vasteKans5(51);
    try {
      await metVoorraad5(KONING_POOL, [mat, schaak], async function () {
        const a = nieuwKind();
        await startOefening(a, 'koning');
        const gezien = {};
        for (let i = 0; i < 6; i++) {
          if (!isPuzzel5(a)) break;
          const type = a.get('session.task.type'), rood = a.get('BD.check'), koning = a.get('session.S.kings.w');
          if (type === 'mat1') { gezien.mat1 = true; check('matdreiging: geen rode koning (' + rood + ')', rood == null || rood < 0); }
          if (type === 'schaak') { gezien.schaak = true; check('schaak: de koning is rood', rood === koning); }
          await foutTotAntwoord5(a);
          await naarVolgende5(a, 'koning');
        }
        check('testopzet: een matdreiging kwam voorbij', !!gezien.mat1);
      });
    } finally { Math.random = echt; }
  });

  /* ---------- 5.8: Turbo zegt wie aanviel, en de eindkaart noemt het moment ---------- */

  await nogNiet('[5.8] Turbo pakt een stuk dat niemand kan terugpakken: "Ik pak je paard op g5 (3 punten). Niemand kan terugpakken."', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(3, ['e2e4', 'e7e5', 'g1f3', 'd7d6']) });
    a.tik('verderKaart');
    await wacht();
    if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === 4'))) return;
    zet(a, 'f3g5');
    const genomen = await totDat5(function () { return a.get('session.S.hist.length') === 6; }, 30000);
    await wacht(1500);
    if (!check('testopzet: Turbo slaat het paard', genomen && a.get('moveKey(session.S.hist[5].m)') === 'd8g5')) return;
    check('de strook (' + strook5(a) + ')', strook5(a).indexOf('Ik pak je paard op g5 (3 punten). Niemand kan terugpakken.') >= 0);
  });

  /* 3.Pg5? Dxg5, daarna rustige zetten tot elf zetten: het moment is het paard */
  const MOMENT = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f3g5', 'd8g5', 'a2a3', 'a7a6', 'b2b3', 'b7b6', 'c2c3', 'c7c6',
    'a3a4', 'a6a5', 'c3c4', 'c6c5', 'b1c3', 'b8c6', 'a1b1', 'a8b8', 'b1a1', 'b8a8'];
  const STIL = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'a2a3', 'a7a6', 'b2b3', 'b7b6', 'c2c3', 'c7c6',
    'a3a4', 'a6a5', 'c3c4', 'c6c5', 'b1c3', 'b8c6', 'a1b1', 'a8b8', 'b1a1', 'b8a8', 'h2h3', 'h7h6'];
  for (const g of [['het paard dat onbeschermd stond', MOMENT, 'Het belangrijkste moment', 'Zet 3: je paard op g5 stond onbeschermd, en ik pakte het (3 punten).'],
    ['een potje zonder moment', STIL, null, 'Netjes gespeeld: je gaf geen stuk weg.']]) {
    await nogNiet('[5.8] de eindkaart na opgeven noemt ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(2, g[1]) });
      a.tik('verderKaart');
      await wacht();
      if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === ' + g[1].length))) return;
      await geefOp(a);
      const kaart = tekstVan(a, 'eindkaart');
      check('testopzet: de eindkaart staat er', zichtbaar(a, 'eindkaart') && /opgegeven|gaf op/i.test(kaart));
      if (g[2]) check('de kop van het moment', kaart.indexOf(g[2]) >= 0);
      check('de zin (' + kaart + ')', kaart.indexOf(g[3]) >= 0);
    });
  }

  /* ---------- 5.9: Red je stuk uit de voorraad, zonder te zoeken ---------- */

  await regel('[5.9] een Red je stuk-opdracht komt uit de voorraad en wordt gekozen zonder te zoeken', async function (check) {
    const echt = Math.random;
    Math.random = vasteKans5(59);
    try {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      let stuk = 0;
      for (let i = 0; i < 10 && stuk < 2; i++) {
        if (!isPuzzel5(a)) break;
        if (a.get('session.task.type') === 'stuk') {
          stuk++;
          const t = opdracht5(a);
          const r = STUK_POOL.find(function (x) { return x.split('|')[0] === t.bord; });
          check('Red je stuk ' + stuk + ' staat in de voorraad (' + t.bord + ')', !!r);
          check('met de antwoorden van die regel', !!r && r.split('|')[2].split(',').sort().join() === t.antwoorden.slice().sort().join());
        }
        await foutTotAntwoord5(a);
        await wacht(3000);
        const n0 = nodesSearched();
        await naarVolgende5(a, 'koning');
        if (isPuzzel5(a) && a.get('session.task.type') === 'stuk') check('gekozen zonder te zoeken (' + (nodesSearched() - n0) + ' knopen)', nodesSearched() === n0);
      }
      check('testopzet: er kwamen Red je stuk-opdrachten (' + stuk + ')', stuk >= 1);
    } finally { Math.random = echt; }
  });

  /* een bron die niets vindt, geeft een andere opdracht en nooit "Oeps, dat lukte even niet" */
  await regel('[5.9] Koning ontsnapt: zonder Red je stuk-opdracht komt er een andere opdracht', async function (check) {
    const echt = Math.random, echtGen = genPieceTask;
    Math.random = vasteKans5(26);
    genPieceTask = function () { return null; };
    try {
      await metVoorraad5(STUK_POOL, [], async function () {
        const a = nieuwKind();
        for (let i = 0; i < 4; i++) {
          await startOefening(a, 'koning');
          check('poging ' + (i + 1) + ': een opdracht staat klaar', isPuzzel5(a) && !/Oeps/.test(norm5(tekstVan(a, 'bubble'))));
          await naarHuis(a);
        }
      });
    } finally { Math.random = echt; genPieceTask = echtGen; }
  });

  await regel('[5.9] De Beste Zet: vindt de valstrik-vraag niets, dan komt een keuze uit drie', async function (check) {
    const echt = genSafeTask;
    genSafeTask = function () { return null; };
    try {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      for (let i = 0; i < 3; i++) {
        check('opdracht ' + (i + 1) + ' staat klaar, zonder Oeps', a.get('!!session.task && !!session.task.options') && !/Oeps/.test(norm5(tekstVan(a, 'bubble'))));
        await keuzeUitDrie5(a);
        await naarVolgende5(a, 'best3');
      }
    } finally { genSafeTask = echt; }
  });

  /* ---------- 5.11: de voorspelvraag alleen als Turbo's zet ertoe doet ---------- */

  /* Over een heel potje, wat Turbo ook zet: de vraag komt precies als zijn zet
     slaat, schaak geeft of een nieuwe dreiging maakt, vanaf zijn vijfde zet,
     en niet in de drie zetten na een vraag. */
  await nogNiet('[5.11] de voorspelvraag komt alleen bij een zet die ertoe doet, vanaf Turbo\'s vijfde zet, en hoogstens eens in vier zetten', async function (check) {
    const echt = Math.random;
    Math.random = vasteKans5(511);
    try {
      const a = maakApparaat('Mees');
      a.ev('setPref("guard", false); setPref("predict", true)');
      await startPotje(a, 2);
      let laatste = -10, vragen = 0, stilNaVijf = 0, slagKortNaVraag = 0;
      await speelZelf5(a, 30, function (z) {
        const nr = z.voor.full, t = zetTelt5(z.voor, z.zet);
        const telt = t.slag || t.schaak || t.nieuw.length > 0;
        const moet = telt && nr >= 5 && nr - laatste >= 4;
        check('zet ' + nr + ' van Turbo (' + moveKey(z.zet) + (telt ? ', telt' : ', rustig') + '): ' + (moet ? 'een vraag' : 'geen vraag') +
          ' verwacht, ' + (z.gevraagd ? 'wel' : 'niet') + ' gevraagd', z.gevraagd === moet);
        if (nr >= 5 && !telt) stilNaVijf++;
        if (telt && nr >= 5 && nr - laatste < 4) slagKortNaVraag++;
        if (z.gevraagd) { laatste = nr; vragen++; }
      }, check);
      check('testopzet: de vraag kwam (' + vragen + ' keer)', vragen >= 1);
      check('testopzet: een rustige zet na de vijfde (' + stilNaVijf + ')', stilNaVijf >= 1);
      check('testopzet: een zet die telt vlak na een vraag (' + slagKortNaVraag + ')', slagKortNaVraag >= 1);
    } finally { Math.random = echt; }
  });

  /* ---------- 5.8: Turbo's zin na zijn zet noemt een nieuwe dreiging ---------- */

  /* Bij een rustige zet van Turbo (geen slag, geen schaak) komt eerst de
     dreigregel: met naam als er een nieuwe dreiging is, de grootste, en
     anders geen dreiging die er niet is. */
  for (const g of [['tegen Turbo, een kind dat net begint', 2, null, true], ['tegen Super Turbo', 3, null, false], ['voor een kind dat al sterk is', 2, 'sterk', false]]) {
    await nogNiet('[5.8] na Turbo\'s rustige zet ' + g[0] + ': ' + (g[3] ? '"Mijn {stuk} op {veld} valt je {stuk} op {veld} aan."' : '"Ik dreig iets. Zie je wat?"'), async function (check) {
      const echt = Math.random;
      Math.random = vasteKans5(58);
      try {
        const a = nieuwKind();
        if (g[2]) a.ev('setPref("start", ' + JSON.stringify(g[2]) + ')');
        await startPotje(a, g[1]);
        let dreig = 0, stil = 0;
        await speelZelf5(a, g[1] === 3 ? 12 : 24, function (z) {
          const t = zetTelt5(z.voor, z.zet);
          if (t.slag || t.schaak) return;
          const genoemd = /Mijn \S+ op [a-h][1-8] valt je \S+ op [a-h][1-8] aan\./.test(z.strook);
          if (!t.nieuw.length) {
            stil++;
            check('zet ' + z.voor.full + ' van Turbo (' + moveKey(z.zet) + ') dreigt niets nieuws: geen dreiging in de strook (' + z.strook + ')',
              !genoemd && z.strook.indexOf('Ik dreig iets') < 0);
            return;
          }
          dreig++;
          if (!g[3]) {
            check('zet ' + z.voor.full + ': de vraag zonder naam (' + z.strook + ')', z.strook.indexOf('Ik dreig iets. Zie je wat?') >= 0 && !genoemd);
            return;
          }
          const na = z.voor; makeMove(na, z.zet);
          const max = Math.max.apply(null, t.nieuw.map(function (x) { return x.gain; }));
          const zinnen = t.nieuw.filter(function (x) { return x.gain === max; }).map(function (x) {
            return 'Mijn ' + NAME_NL[na.board[x.move.from].toLowerCase()] + ' op ' + alg(x.move.from) + ' valt je ' + NAME_NL[na.board[x.sq].toLowerCase()] + ' op ' + alg(x.sq) + ' aan.';
          });
          const gedekt = t.nieuw.filter(function (x) { return x.gain === max && attacked(na, x.sq, 'w'); })
            .map(function (x) { return na.board[x.sq].toLowerCase() === 'n' ? 'het' : 'hem'; });
          unmakeMove(na);
          check('zet ' + z.voor.full + ' van Turbo (' + moveKey(z.zet) + '): ' + zinnen.join(' of ') + ' (' + z.strook + ')',
            zinnen.some(function (zin) { return z.strook.indexOf(zin) >= 0; }));
          if (gedekt.length) check('zet ' + z.voor.full + ': gedekt, maar de ruil is goed voor Turbo', gedekt.some(function (hem) {
            return z.strook.indexOf('Je dekt ' + hem + ', maar de ruil is goed voor mij.') >= 0; }));
        });
        check('testopzet: Turbo maakte een nieuwe dreiging (' + dreig + ') en zette rustig zonder (' + stil + ')', dreig >= 1 && stil >= 1);
      } finally { Math.random = echt; }
    });
  }

  /* ---------- 5.5: Koning ontsnapt zegt wat het kind tegenhield ---------- */

  /* de toren op g4 geeft schaak; de koning loopt naar f1 */
  const SCHAAK5 = ['3k4/1p5p/p2pr3/P7/4p1r1/8/2P2P2/2R1R1K1 w - - 0 41', 'g1f1'];
  /* zwart dreigt Dd8-b6 mat; de koning loopt naar e3 */
  const MAT5 = ['r2qk2r/pp1nnppp/8/3p1b2/1p1K4/5N1P/PBP1PPP1/R2Q1B1R w - - 1 1', 'd4e3'];
  for (const g of [['uit schaak', 'schaak', SCHAAK5, ['Je stond schaak van de toren op g4.', 'Je koning loopt weg.']],
    ['een matdreiging', 'mat1', MAT5, ['Turbo dreigde mat met ' + moveNameNL(nullMoved(parseFEN(MAT5[0])), matingMoves(nullMoved(parseFEN(MAT5[0])), 1)[0]) + '.', 'Je koning loopt weg.']]]) {
    await regel('[5.5] Koning ontsnapt, gered ' + g[0] + ': "' + g[3].join(' ') + '"', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, g[2][0], g[1], [g[2][1]]);
      zet(a, g[2][1]);
      await wacht(5000);
      check('gered', /Gered/.test(tekstVan(a, 'taskBox')));
      check('de redenen (' + redenen5(a).join(' / ') + ')', redenen5(a).join(' ').indexOf(g[3].join(' ')) >= 0);
    });
  }

  /* D21: ook in Koning ontsnapt speelt Turbo zijn antwoord op de tweede poging, en dan pas komt het antwoord */
  await regel('[5.5] Koning ontsnapt: ook de tweede foute poging krijgt Turbo\'s antwoord op het bord, en dan de redding', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, MAT5[0], 'mat1', [MAT5[1]]);
    const h0 = a.get('session.S.hist.length');
    for (const [i, k] of [[1, 'a1b1'], [2, 'a2a3']]) {
      zet(a, k);
      const gezien = await zagOoit(function () {
        return a.get('session.S.hist.length') === h0 + 2 && a.get('moveKey(session.S.hist[' + h0 + '].m)') === k;
      }, 6000);
      check('poging ' + i + ': Turbo antwoordt op het bord', gezien);
      await wacht(6000);
    }
    check('daarna de redding', a.get('session.phase') === 'review' && redenen5(a).some(function (r) { return /^De redding was /.test(r); }));
  });

  await regel('[5.5] Koning ontsnapt, een poging die in mat loopt: "Turbo speelt {zet}: schaakmat." en wie schaak geeft', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, MAT5[0], 'mat1', [MAT5[1]]);
    const S = parseFEN(MAT5[0]);
    makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === 'a1b1'; }));
    const mat = mateReply(S);
    if (!check('testopzet: na Ta1-b1 zet Turbo mat', !!mat)) return;
    const eerste = 'Turbo speelt ' + moveNameNL(S, mat) + ': schaakmat.';
    zet(a, 'a1b1');
    await wacht(5000);
    check('de eerste zin (' + onder5(a) + ')', onder5(a).indexOf(eerste) === 0);
    check('de tweede zin noemt wie schaak geeft', /De dame op b6 geeft schaak/.test(onder5(a) + ' ' + redenen5(a).join(' ')));
  });

  /* ---------- 5.5: de Trucendoos zegt wat de truc doet ---------- */

  await regel('[5.5] Trucendoos, een vork gevonden: "Vork! Je pion valt de dame en het paard tegelijk aan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    zet(a, VORK5[1]);
    await wacht(5000);
    const tekst = redenen5(a).join(' ') + ' ' + norm5(tekstVan(a, 'taskBox'));
    check('de vork met beide stukken (' + tekst + ')', tekst.indexOf('Vork! Je pion valt de dame en het paard tegelijk aan.') >= 0 ||
      tekst.indexOf('Vork! Je pion valt het paard en de dame tegelijk aan.') >= 0);
  });

  /* drie regels uit de voorraad, met de stukken die de truc noemt */
  const TRUC5 = [
    ['penning', '1r2kb1r/pp1qppp1/7p/n1pP4/2BN2n1/7P/PPPPQPP1/1RB1R1K1 w - - 0 1', 'c4b5', ['Penning! De dame op d7 staat vast: erachter staat de koning.']],
    ['spies', '1k1r1b1r/1pnb1ppp/p1pp1q2/4p3/2BPP1n1/2N2N2/PPPB1PPP/R2Q1RK1 w - - 0 1', 'd2g5', ['Spies! De dame moet weg, en dan pak je de toren op d8.']],
    ['aftrek', '1k1r3r/ppp2ppp/3bpqbn/1Bnp4/3N4/N1BPP3/PPP1QPPP/R3R1K1 w - - 0 1', 'd4c6', ['Aftrekaanval! Nu valt je loper op c3 de dame aan.', 'Je paard valt zelf ook iets aan.']]
  ];
  for (const g of TRUC5) {
    await regel('[5.5] Trucendoos, ' + g[0] + ' gevonden: "' + g[3].join(' ') + '"', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      zetOpdracht(a, g[1], g[0], [g[2]]);
      zet(a, g[2]);
      await wacht(5000);
      const tekst = redenen5(a).join(' ');
      check('de truc met zijn stukken (' + tekst + ')', tekst.indexOf(g[3].join(' ')) >= 0);
    });
  }

  /* Lf5-d7 is mat; Td1-e1 geeft geen schaak */
  const MAT1T5 = ['1N2kq1r/1pp2ppp/p2b4/3p1BQ1/3P4/4B3/PPP2PPP/3R1RK1 w - - 0 1', 'f5d7', 'd1e1'];
  await regel('[5.5] Trucendoos, mat in één gevonden: "Turbo\'s koning kan zich niet meer redden."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT1T5[0], 'mat1', [MAT1T5[1]]);
    zet(a, MAT1T5[1]);
    await wacht(5000);
    check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('Turbo\'s koning kan zich niet meer redden.') >= 0);
  });

  await regel('[5.5] Trucendoos, mat in één: een zet zonder schaak zegt "Dat is geen schaak. Zoek een zet die schaak geeft.", en na twee missers "Dit was mat: {zet}."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT1T5[0], 'mat1', [MAT1T5[1]]);
    const S = parseFEN(MAT1T5[0]);
    const mat = 'Dit was mat: ' + moveNameNL(S, legalMoves(S).find(function (m) { return moveKey(m) === MAT1T5[1]; })) + '.';
    zet(a, MAT1T5[2]);
    await wacht(5000);
    check('de eerste poging (' + onder5(a) + ')', onder5(a).indexOf('Dat is geen schaak. Zoek een zet die schaak geeft.') === 0);
    if (isPuzzel5(a)) { zet(a, 'g1h1'); await wacht(6000); }
    check('na twee missers de matzet (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf(mat) >= 0);
  });

  /* ---------- 5.5: een foute poging in de Trucendoos ---------- */

  /* D21: elke foute poging krijgt Turbo's antwoord op het bord, ook de laatste voor het antwoord */
  await regel('[5.5] Trucendoos: elke foute poging krijgt Turbo\'s antwoord op het bord, ook de tweede, en dan het antwoord', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    const h0 = a.get('session.S.hist.length');
    for (const [i, k] of [[1, 'a3a4'], [2, 'h2h3']]) {
      zet(a, k);
      const gezien = await zagOoit(function () {
        return a.get('session.S.hist.length') === h0 + 2 && a.get('moveKey(session.S.hist[' + h0 + '].m)') === k;
      }, 6000);
      check('poging ' + i + ': Turbo antwoordt op het bord', gezien);
      await wacht(6000);
      if (i === 1) check('daarna weer de opdracht', isPuzzel5(a) && a.get('session.S.hist.length') === h0);
    }
    check('na de tweede poging het antwoord', a.get('session.phase') === 'review' && redenen5(a).some(function (r) { return /^De truc was /.test(r); }));
  });

  await regel('[5.5] Trucendoos, mat in één: een schaak waarop Turbo zich redt, zegt hoe: "Na Dame g5 → d8 kan Turbo je dame slaan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT1T5[0], 'mat1', [MAT1T5[1]]);
    zet(a, 'g5d8');
    await wacht(6000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Na Dame g5 → d8 kan Turbo je dame slaan. Probeer nog een zet.');
  });

  /* Pc3-d5 valt dame en toren aan, maar de pion op e6 slaat het paard; h2-h4 valt alleen het paard op g5 aan */
  await regel('[5.5] Trucendoos, vork: een vork op een veld waar Turbo slaat, zegt "Dan pakt Turbo je paard op d5. Zoek een veilig veld."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '6k1/2q1rppp/4p3/8/8/2N5/5PPP/6K1 w - - 0 1', 'vork', ['c3b5']);
    zet(a, 'c3d5');
    await wacht(6000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Dan pakt Turbo je paard op d5. Zoek een veilig veld.');
  });

  await regel('[5.5] Trucendoos, vork: een zet die één stuk aanvalt, zegt "Je pion valt maar één stuk aan. Zoek een zet die twee stukken aanvalt."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    zet(a, 'h2h4');
    await wacht(6000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Je pion valt maar één stuk aan. Zoek een zet die twee stukken aanvalt.');
  });

  /* ---------- 5.4: de openingscoach waarschuwt alleen voor een zet die iets kost ---------- */

  await nogNiet('[5.4] de openingscoach: een zet die een stuk kost zegt "Pas op: na deze zet wint Turbo 3 punten." en wat Turbo dan speelt', async function (check) {
    const a = nieuwKind();
    a.ev('startOpening("coach", null)');
    await wacht();
    zet(a, 'e2e4');
    await totDat5(function () { return a.get('session.S.hist.length') === 2 && witAanZet5(a); }, 8000);
    await wacht(1000);
    const S = parseFEN(a.fen());
    const m = legalMoves(S).find(function (x) { return moveKey(x) === 'f1a6'; });
    const bc = m ? blunderCheck(S, m) : null;
    if (!check('testopzet: Lf1-a6 kost de loper', !!bc && !bc.mate && bc.loss >= 250)) return;
    makeMove(S, m);
    const tweede = 'Turbo speelt dan ' + moveNameNL(S, bc.punish) + '.';
    zet(a, 'f1a6');
    await wacht(400);
    check('de waarschuwing (' + onder5(a) + ')', onder5(a).indexOf('Pas op: na deze zet wint Turbo 3 punten.') === 0);
    check('en wat Turbo dan speelt', onder5(a).indexOf(tweede) >= 0);
  });

  /* ---------- 5.5: Veilig of valstrik zegt waarom ---------- */

  /* Db1-b4: Txb4, de dame zelf staat onbeschermd; Lf4-c1: de loper dekte het paard op e5 */
  const VALSTRIK5 = [
    ['de dame die zelf onbeschermd staat', '7k/8/8/8/7r/8/8/KQ6 w - - 0 1', 'b1b4', 'Je dame op b4 staat daar onbeschermd.'],
    ['de loper die het paard dekte', '4r1k1/8/8/4N3/5B2/8/8/6K1 w - - 0 1', 'f4c1', 'Je loper dekte je paard op e5. Nu niet meer.']
  ];
  for (const g of VALSTRIK5) {
    for (const zei of ['Valstrik', 'Veilig']) {
      await nogNiet('[5.5] Veilig of valstrik, ' + g[0] + ', het kind zei ' + zei + ': "Turbo speelt dan {zet}." en "' + g[3] + '"', async function (check) {
        const S = parseFEN(g[1]);
        const m = legalMoves(S).find(function (x) { return moveKey(x) === g[2]; });
        const bc = blunderCheck(S, m);
        if (!check('testopzet: de zet kost iets', !!bc && !!bc.punish)) return;
        makeMove(S, m);
        const eerste = 'Turbo speelt dan ' + moveNameNL(S, bc.punish) + '.';
        unmakeMove(S);
        const taak = { S: S, move: m, trap: true, punish: bc.punish, loss: bc.loss };
        const echt = genSafeTask;
        genSafeTask = function () { return taak; };
        try {
          const a = nieuwKind();
          await startOefening(a, 'best3');
          await naarValstrikVraag5(a);
          if (!check('testopzet: de valstrik-vraag staat klaar', a.get('!!session.task && !!session.task.move') && kanTikken(a, zei))) return;
          tikTekst(a, zei);
          await wacht(6000);
          const r = redenen5(a);
          check('de eerste reden (' + r.join(' / ') + ')', r[0] === eerste || (r.length === 1 && r[0].indexOf(eerste) === 0));
          check('waarom', r.join(' ').indexOf(g[3]) >= 0);
          if (zei === 'Veilig') check('en waar je de volgende keer naar kijkt', /Kijk eerst wat Turbo terug kan doen\.$/.test(r.join(' ')));
        } finally { genSafeTask = echt; }
      });
    }
  }

  /* ---------- 5.5: Speurogen noemt de aanvaller en het lidwoord ---------- */

  const SPEUR5 = '(function () { var S = parseFEN("6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1"); session.S = S;' +
    'session.task = { S: S, type: "attacked", targets: attackedPieces(S, "w"), extra: null, details: null };' +
    'session.phase = "marking"; BD.marks.clear(); BD.mode = "mark"; renderBoard(); })()';
  await regel('[5.5] Speurogen, gemist: "Gemist: jouw toren op a1 wordt aangevallen door de loper op c3."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev(SPEUR5);
    tikTekst(a, 'Klaar');
    await wacht();
    check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('Gemist: jouw toren op a1 wordt aangevallen door de loper op c3.') >= 0);
  });

  await nogNiet('[5.5] Speurogen, een stuk van Turbo aangetikt: "De loper op c3 is van Turbo. Tik jouw eigen stukken aan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev(SPEUR5);
    tikVeld(a, a.get('sqFromAlg("a1")'));
    tikVeld(a, a.get('sqFromAlg("c3")'));
    tikTekst(a, 'Klaar');
    await wacht();
    check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('De loper op c3 is van Turbo. Tik jouw eigen stukken aan.') >= 0);
  });

  /* ---------- 5.5: de reden bij een veilige zet past bij de stelling, niet bij het antwoord ---------- */

  /* Kg1-f1: daarna kan Turbo niets slaan. h2-h3: Turbo kan Pxd4, maar c3xd4 slaat terug. */
  const VEILIG5 = [
    ['Turbo kan niets slaan', '6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'g1f1', 'Veilig: Turbo kan niets van je slaan.'],
    ['elke slag wordt teruggeslagen', '6k1/8/8/5n2/3N4/2P5/5PPP/6K1 w - - 0 1', 'h2h3', 'Veilig: elk stuk dat Turbo pakt, pak jij terug.']
  ];
  for (const g of VEILIG5) {
    for (const zei of ['Veilig', 'Valstrik']) {
      await nogNiet('[5.5] Veilig of valstrik, ' + g[0] + ', het kind zei ' + zei + ': "' + g[3] + '"', async function (check) {
        const S = parseFEN(g[1]);
        const taak = { S: S, move: legalMoves(S).find(function (x) { return moveKey(x) === g[2]; }), trap: false, loss: 0 };
        const echt = genSafeTask;
        genSafeTask = function () { return taak; };
        try {
          const a = nieuwKind();
          await startOefening(a, 'best3');
          await naarValstrikVraag5(a);
          if (!check('testopzet: de valstrik-vraag staat klaar', a.get('!!session.task && !!session.task.move') && kanTikken(a, zei))) return;
          tikTekst(a, zei);
          await wacht(6000);
          check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf(g[3]) >= 0);
        } finally { genSafeTask = echt; }
      });
    }
  }

  /* ---------- 5.5: Red je stuk, de stukken ruilen terwijl het stuk verloren is ---------- */

  await regel('[5.5] Red je stuk, het stuk is niet te redden maar het kind pakt evenveel: "Je loper is niet te redden, maar jij pakt de loper (3 tegen 3 punten)."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, 'r2q1k1r/ppp2ppp/2nb1n2/3pp3/4PBb1/3P2Q1/PPPNBPPP/2R2K1R w - - 0 1', 'stuk', ['e2g4'], HANG5);
    zet(a, 'e2g4');
    await wacht(5000);
    check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('Je loper is niet te redden, maar jij pakt de loper (3 tegen 3 punten).') >= 0);
  });

  /* ---------- 5.5: na een foute poging zegt de zin wat Turbo's antwoord doet ---------- */

  /* de coach: na Tb1-a1 antwoordt Turbo vaak rustig (Lf5-g4 pent de dame); wat hij ook speelt, de zin past erbij */
  await regel('[5.5] Red je stuk, een foute poging: slaat Turbo, dan "Turbo speelt {zet} en pakt je {stuk} op {veld}."; anders "Turbo speelt {zet}, en het gevaar is er nog."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    const fen = '2kr3r/ppp2ppp/n2qp3/3p1b2/1b1P4/P2BPQ2/1PPNKnPP/1RB3NR w - - 0 1';
    zetOpdracht(a, fen, 'stuk', ['e2f2', 'f3f2'], HANG5);
    const h0 = a.get('session.S.hist.length');
    let antwoord = null;
    zet(a, 'b1a1');
    await zagOoit(function () {
      if (!antwoord && a.get('session.S.hist.length') === h0 + 2) antwoord = a.get('moveKey(session.S.hist[' + (h0 + 1) + '].m)');
      return !!antwoord;
    }, 6000);
    await wacht(4000);
    if (!check('testopzet: Turbo antwoordde', !!antwoord)) return;
    const S = parseFEN(fen);
    makeMove(S, legalMoves(S).find(function (x) { return moveKey(x) === 'b1a1'; }));
    const m = legalMoves(S).find(function (x) { return moveKey(x) === antwoord; });
    const naam = moveNameNL(S, m);
    if (isCapture(S, m)) {
      const stuk = NAME_NL[S.board[m.to].toLowerCase()];
      check('Turbo slaat (' + onder5(a) + ')', onder5(a).indexOf('Turbo speelt ' + naam + ' en pakt') === 0 && onder5(a).indexOf(stuk + ' op ' + alg(m.to)) >= 0);
    } else {
      check('Turbo slaat niets (' + onder5(a) + ')', onder5(a) === 'Turbo speelt ' + naam + ', en het gevaar is er nog. Probeer nog een zet.');
    }
  });

  /* ---------- 5.5: na twee missers zegt de app wat de redding of de truc was ---------- */

  await regel('[5.5] Koning ontsnapt, na twee missers: "De redding was {zet}." en hoe', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, SCHAAK5[0], 'schaak', [SCHAAK5[1]]);
    const S = parseFEN(SCHAAK5[0]);
    const zin = 'De redding was ' + moveNameNL(S, legalMoves(S).find(function (x) { return moveKey(x) === SCHAAK5[1]; })) + '.';
    await foutTotAntwoord5(a);
    check('de redding en hoe (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf(zin) >= 0 && redenen5(a).indexOf('Je koning loopt weg.') >= 0);
  });

  await regel('[5.5] Trucendoos, na twee missers: "De truc was {zet}." en wat de vork doet', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    const S = parseFEN(VORK5[0]);
    const zin = 'De truc was ' + moveNameNL(S, legalMoves(S).find(function (x) { return moveKey(x) === VORK5[1]; })) + '.';
    await foutTotAntwoord5(a);
    const r = redenen5(a);
    check('de truc (' + r.join(' / ') + ')', r.indexOf(zin) >= 0);
    check('en wat hij doet', r.indexOf('Vork! Je pion valt de dame en het paard tegelijk aan.') >= 0 || r.indexOf('Vork! Je pion valt het paard en de dame tegelijk aan.') >= 0);
  });
}
function witAanZet5(a) { return a.get('session.S.turn === "w"'); }
