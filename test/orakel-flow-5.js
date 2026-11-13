/* Orakel, flowtests: de schaakinhoud zoals een kind hem ziet, in de
   oefeningen, Turbo's zinnen en de eindkaart. Een eigen bestand naast
   test/orakel-flow.js, met dezelfde helpers en hetzelfde nogNiet en regel. */

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

  /* ---------- de plek in de voorraad: ook als bewaren misgaat, elke truc eenmaal ---------- */

  const bordVan5 = function (r) { return r.split('|')[0]; };
  const volgendeTruc5 = function (a) { return a.get('(function () { var t = trucUitVoorraad(); return t ? toFEN(t.S).split(" ").slice(0, 2).join(" ") : null; })()'); };
  for (const [naam, waarde] of [['een getal', '5'], ['een lijst', '[1,2]'], ['een tekst', '"vork"'], ['een breuk', '{"vork":1.5}'], ['geen json', 'kapot{']]) {
    await regel('[5.1] een bewaarde plek die ' + naam + ' is: de Trucendoos begint bij de eerste truc en gaat daarna door', async function (check) {
      const vork = vanType5('vork', 15);
      await metVoorraad5(TRUC_POOL, vork, async function () {
        const a = nieuwKind();
        a.opslag.setItem('schaakheld-trucplek', waarde);
        await startOefening(a, 'trucs');
        check('de eerste truc (' + opdracht5(a).bord + ')', isPuzzel5(a) && opdracht5(a).bord === bordVan5(vork[0]));
        check('daarna de tweede en de derde', volgendeTruc5(a) === bordVan5(vork[1]) && volgendeTruc5(a) === bordVan5(vork[2]));
        check('de plek is weer heel (' + a.opslag.getItem('schaakheld-trucplek') + ')', a.opslag.getItem('schaakheld-trucplek') === '{"vork":3}');
      });
    });
  }

  await regel('[5.1] lukt bewaren van de plek niet, dan onthoudt de app hem zolang hij open is: geen truc komt terug', async function (check) {
    const vork = vanType5('vork', 15);
    await metVoorraad5(TRUC_POOL, vork, async function () {
      const a = nieuwKind();
      const echt = a.opslag.setItem;
      a.opslag.setItem = function (k, v) { if (k === 'schaakheld-trucplek') throw new Error('vol'); return echt.call(this, k, v); };
      try {
        await startOefening(a, 'trucs');
        const gezien = [opdracht5(a).bord, volgendeTruc5(a), volgendeTruc5(a), volgendeTruc5(a)];
        check('vier verschillende trucs, in de volgorde van de voorraad (' + gezien.join(' / ') + ')',
          gezien.every(function (b, i) { return b === bordVan5(vork[i]); }));
      } finally { a.opslag.setItem = echt; }
    });
  });

  await regel('[5.1] een regel uit de voorraad die niet te lezen is, slaat de app over: de volgende regel, nooit een opdracht die niet gecontroleerd is', async function (check) {
    const vork = vanType5('vork', 15);
    await metVoorraad5(TRUC_POOL, ['kapot w|vork|e2e4'].concat(vork), async function () {
      const a = nieuwKind();
      await startOefening(a, 'trucs');
      check('de truc van de tweede regel (' + opdracht5(a).bord + ')', isPuzzel5(a) && opdracht5(a).bord === bordVan5(vork[0]));
      check('daarna gewoon door', volgendeTruc5(a) === bordVan5(vork[1]));
    });
  });

  await regel('[5.1] Alles wissen begint ook de plek in de voorraad opnieuw', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    if (!check('testopzet: de plek is bewaard', !!a.opslag.getItem('schaakheld-trucplek'))) return;
    await naarHuis(a);
    a.ev('confirmReset()');
    await wacht();
    a.tik('rstGo');
    await wacht();
    check('de plek is weg', a.opslag.getItem('schaakheld-trucplek') === null && a.get('trucPlekNu') === null);
  });

  /* de Trucendoos wisselt van soort: de soort van de vorige truc komt niet meteen terug */
  await regel('[5.1] de Trucendoos geeft niet twee keer achter elkaar dezelfde soort truc', async function (check) {
    await metVoorraad5(TRUC_POOL, vanType5('vork', 15).concat(vanType5('penning', 15)), async function () {
      const echt = Math.random;
      Math.random = vasteKans5(38);
      try {
        const a = nieuwKind();
        await startOefening(a, 'trucs');
        const soorten = a.get('(function () { var s = [session.task.type]; for (var i = 0; i < 9; i++) { buildTrucs(); s.push(session.task.type); } return s; })()');
        check('tien trucs, nooit twee keer dezelfde soort na elkaar (' + soorten.join(' ') + ')',
          soorten.length === 10 && soorten.every(function (t, i) { return i === 0 || t !== soorten[i - 1]; }));
      } finally { Math.random = echt; }
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
    ['een kind dat net begint, tegen Slaapkop Turbo', 1, null, 'Na deze zet kan Turbo je paard op g5 pakken.', 'g5'],
    ['een kind dat net begint, tegen Turbo', 2, null, 'Na deze zet kan Turbo je paard op g5 pakken.', 'g5'],
    ['tegen Super Turbo', 3, null, 'Na deze zet kan Turbo iets van je pakken. Kijk welke stukken van jou aangevallen worden.', null],
    ['een kind dat al sterk is', 1, 'sterk', 'Na deze zet kan Turbo iets van je pakken. Kijk welke stukken van jou aangevallen worden.', null]
  ];
  for (const g of ALARM) {
    await regel('[5.4] het blunderalarm, ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(g[1], ['e2e4', 'e7e5', 'g1f3', 'd7d6']) });
      a.ev('setPref("guard", true)');
      if (g[2]) a.ev('setPref("start", ' + JSON.stringify(g[2]) + ')');
      a.tik('verderKaart');
      await wacht();
      if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === 4'))) return;
      zet(a, 'f3g5');
      await wacht(500);
      check('het alarm staat open', a.open() && /Wacht even/.test(a.scherm()));
      check('met de zin (' + a.scherm() + ')', a.scherm().indexOf(g[3]) >= 0);
      /* "Ik kijk nog even" licht het genoemde stuk op, het paard dat nog op f3 staat; zonder naam licht niets op */
      a.tik('gLook');
      const licht = a.get('[...BD.glow].map(function (x) { return alg(x); }).join(",")');
      check('opgelicht (' + licht + ')', g[4] ? licht === 'f3' : licht === '');
    });
  }

  for (const g of [['tegen Slaapkop Turbo', 1, null], ['tegen Super Turbo voor een kind dat al sterk is', 3, 'sterk']]) {
    await regel('[5.4] het blunderalarm voor mat in één, ' + g[0] + ': "Na deze zet kan Turbo je schaakmat zetten."', async function (check) {
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

  await regel('[5.8] Turbo pakt een stuk dat niemand kan terugpakken: "Ik pak je paard op g5 (3 punten). Niemand kan terugpakken."', async function (check) {
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
  for (const g of [['het paard dat onbeschermd stond', MOMENT, 'Het belangrijkste moment', 'Zet 3: je paard ging naar g5. Daar stond het onbeschermd, en ik pakte het (3 punten).'],
    ['een potje zonder moment', STIL, null, 'Netjes gespeeld: je gaf geen stuk weg.'],
    /* 3.Dxe5+? Pxe5: de pion was gedekt */
    ['een verloren ruil', ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5e5', 'c6e5'], 'Het belangrijkste moment', 'Zet 3: je sloeg de pion op e5, maar die was gedekt. Na het terugslaan was je 8 punten kwijt.'],
    /* 2...Dg5?? 3.d3: Pxg5 won de dame */
    ['een gemiste dame', ['e2e4', 'e7e5', 'g1f3', 'd8g5', 'd2d3', 'g5g6'], 'Het belangrijkste moment', 'Zet 3: je kon mijn dame op g5 pakken. Dat had je 9 punten opgeleverd.'],
    ['een gewonnen dame', ['e2e4', 'e7e5', 'g1f3', 'd8g5', 'f3g5', 'f8e7'], 'Jouw beste zet', 'Zet 3: je pakte mijn dame (9 punten). Goed gezien!']]) {
    await regel('[5.8] de eindkaart na opgeven noemt ' + g[0] + ': "' + g[3] + '"', async function (check) {
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

  /* 1.f3 e5 2.g4?? Dh4 mat: het einde zelf noemt de zet */
  await regel('[5.8] de eindkaart na mat noemt het moment: "Zet 2: na je zet kon ik mat zetten, met Dame d8 → h4."', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(3, ['f2f3', 'e7e5', 'g2g4']) });
    a.tik('verderKaart');
    await wacht();
    const uit = await totDat5(function () { return a.get('!!session && session.over'); }, 30000);
    await wacht(2000);
    if (!check('testopzet: Turbo zette mat', uit && a.get('gameStatus(session.S).reason') === 'mat')) return;
    const kaart = tekstVan(a, 'eindkaart');
    check('de kop', kaart.indexOf('Het belangrijkste moment') >= 0);
    check('de zin (' + kaart + ')', norm5(kaart).indexOf('Zet 2: na je zet kon ik mat zetten, met Dame d8 → h4.') >= 0);
  });

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

  /* ---------- 5.6: drie keer dezelfde stelling is remise, tegen Turbo ---------- */

  /* 1.e3, daarna heen en weer met de paarden: na de laatste e3 staat de stelling
     met zwart aan zet bij zet 1, 5 en 9; die van wit aan zet pas bij zet 10 voor de derde keer */
  const HERHAAL_KIND = ['e2e3', 'b8c6', 'g1f3', 'c6b8', 'f3g1', 'b8c6', 'g1f3', 'c6b8'];
  await regel('[5.6] tegen Turbo: zet het kind dezelfde stelling voor de derde keer neer, dan is het remise: "Remise: drie keer dezelfde stelling. Niemand wint, niemand verliest."', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, HERHAAL_KIND) });
    a.tik('verderKaart');
    await wacht();
    if (!check('testopzet: het potje loopt, met stellingen die er al twee keer stonden', a.get('!!session && session.kind === "game" && !session.over && session.S.hist.length === 8'))) return;
    const xp = a.get('P.xp');
    zet(a, 'f3g1');
    await wacht(2500);
    check('het potje is uit na de zet van het kind, en Turbo zet niet meer', a.get('session.over') === true && a.get('session.S.hist.length') === 9);
    const kaart = norm5(tekstVan(a, 'eindkaart'));
    check('de eindkaart (' + kaart + ')', zichtbaar(a, 'eindkaart') && kaart.indexOf('Remise: drie keer dezelfde stelling. Niemand wint, niemand verliest.') >= 0);
    check('een einde dat de spelers kiezen, telt pas vanaf twintig halve zetten: geen XP (' + (a.get('P.xp') - xp) + ')', a.get('P.xp') - xp === 0 &&
      kaart.indexOf('Dit potje telt niet mee: het was korter dan tien zetten.') >= 0);
    check('het potje staat niet meer bewaard', a.opslag.getItem(POTJE) === null);
  });

  /* 1.Pf3 e6, daarna heen en weer: Turbo's Pc6-b8 zet de stelling van zet 2 voor de derde keer neer */
  const HERHAAL_TURBO = ['g1f3', 'e7e6', 'f3g1', 'b8c6', 'g1f3', 'c6b8', 'f3g1', 'b8c6', 'g1f3'];
  await regel('[5.6] tegen Turbo: zet Turbo dezelfde stelling voor de derde keer neer, dan is het ook remise', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { return legalMoves(S).find(function (m) { return moveKey(m) === 'c6b8'; }); };
    try {
      const a = nieuwKind({ opslag: opslagMetPotje(2, HERHAAL_TURBO) });
      a.tik('verderKaart');
      const uit = await totDat5(function () { return a.get('!!session && session.over'); }, 8000);
      await wacht(1500);
      check('het potje is uit na Turbo\'s zet', uit && a.get('session.S.hist.length') === 10 && a.get('moveKey(session.S.hist[9].m)') === 'c6b8');
      check('de eindkaart (' + norm5(tekstVan(a, 'eindkaart')) + ')', norm5(tekstVan(a, 'eindkaart')).indexOf('Remise: drie keer dezelfde stelling.') >= 0);
    } finally { pickMove = echt; }
  });


  /* de tweede keer dezelfde stelling is nog geen remise, en Turbo zegt het: na zijn eigen zet en na die van het kind,
     de eerste keer niet */
  const HERHAAL_ZIN5 = 'Deze stelling stond er al eens. Bij de derde keer is het remise. Wil je dat niet? Kies een andere zet.';
  await regel('[5.6] de tweede keer dezelfde stelling: nog geen remise, en Turbo zegt het in de strook, na zijn zet en na die van het kind', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { const k = S.board[sqFromAlg('g8')] === 'n' ? 'g8f6' : 'f6g8'; return legalMoves(S).find(function (m) { return moveKey(m) === k; }); };
    try {
      const a = nieuwKind();
      await startPotje(a, 2);
      zet(a, 'g1f3');
      check('de eerste keer na de zet van het kind geen regel (' + strook5(a) + ')', strook5(a) !== HERHAAL_ZIN5);
      await wacht(3000);
      check('de eerste keer na Turbo\'s zet geen regel (' + strook5(a) + ')', strook5(a) !== HERHAAL_ZIN5);
      zet(a, 'f3g1');
      await wacht(3000);
      check('testopzet: de beginstelling staat er weer', a.get('session.S.hist.length') === 4);
      check('de tweede keer is geen remise: het kind is aan zet', a.get('session.over') !== true && a.get('BD.mode') === 'move');
      check('na Turbo\'s zet de regel (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
      zet(a, 'g1f3');
      check('na de zet van het kind de regel (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
    } finally { pickMove = echt; }
  });
  /* staat het kind de tweede keer schaak, dan gaat de regel over het bord voor; het schaak blijft op het bord */
  await regel('[5.6] de tweede keer dezelfde stelling met het kind in schaak: de regel over het bord, en ook bij de volgende tweede keer', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { const k = S.board[sqFromAlg('a2')] === 'r' ? 'a2a1' : 'a1a2'; return legalMoves(S).find(function (m) { return moveKey(m) === k; }); };
    try {
      const a = nieuwKind();
      await startPotje(a, 2);
      a.ev('session.S = parseFEN("6k1/8/8/P7/8/8/r7/7K b - - 0 30"); BD.mode = "off"; renderBoard(); turboTurn()');
      await wacht(3000);
      zet(a, 'h1h2');
      await wacht(3000);
      zet(a, 'h2h1');
      check('de beginstelling de tweede keer, na de zet van het kind: de regel (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
      await wacht(3000);
      check('testopzet: Turbo gaf weer schaak', a.get('session.S.hist.length') === 5 && a.get('inCheck(session.S)'));
      check('de tweede keer in schaak: de regel over het bord (' + strook5(a) + '), en het schaak op het bord', strook5(a) === HERHAAL_ZIN5 && a.get('BD.check === session.S.kings.w'));
      zet(a, 'h1h2');
      check('daarna de volgende tweede keer: de regel (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
      check('en het potje loopt', a.get('session.over') !== true);
    } finally { pickMove = echt; }
  });

  /* ---------- 5.11: de voorspelvraag alleen als Turbo's zet ertoe doet ---------- */

  /* Over een heel potje, wat Turbo ook zet: de vraag komt precies als zijn zet
     slaat, schaak geeft of een nieuwe dreiging maakt, vanaf zijn vijfde zet,
     en niet in de drie zetten na een vraag. */
  await regel('[5.11] de voorspelvraag komt alleen bij een zet die ertoe doet, vanaf Turbo\'s vijfde zet, en hoogstens eens in vier zetten', async function (check) {
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

  /* ---------- na de voorspelvraag: de strook zegt één ding ---------- */

  /* een stelling met Turbo aan zet en de zet die hij doet; de vraag staat open */
  function vraagOpen5(a, fen, zet) {
    return a.get('(function () { var S = parseFEN(' + JSON.stringify(fen) + '); var m = legalMoves(S).find(function (x) { return moveKey(x) === ' +
      JSON.stringify(zet) + '; }); session.S = S; BD.last = null; BD.check = null; BD.arrows = []; renderBoard(); askPredict(m);' +
      ' return { van: m.from, koning: S.kings.b }; })()');
  }
  /* goed voorspeld: "Goed voorspeld! " en dan Turbo's zin, als dat samen in de strook past (100 tekens, gemeten op 360
     breed); anders alleen zijn zin, want die is de uitleg; verkeerd voorspeld: "Het was mijn {stuk}. " en zijn zin,
     ook als het past. Schaak gaat voor een truc, een truc voor wat hij pakt of dreigt. */
  const NA_VRAAG5 = [
    ['een slag', 'rnbqkbnr/ppp2ppp/3p4/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 3', 'd8g5', false, 'Ik pak je paard op g5 (3 punten). Niemand kan terugpakken.', true, 'dame'],
    ['schaak', '1r5k/8/8/8/8/8/P7/4K3 b - - 0 10', 'b8b1', false, 'Je staat schaak! Red je koning! 👑', true, 'toren'],
    ['een slag die schaak geeft', '1r5k/8/8/8/8/8/P7/1N2K3 b - - 0 10', 'b8b1', false, 'Je staat schaak! Red je koning! 👑', true, 'toren'],
    ['een nieuwe dreiging', '6k1/r7/8/8/4N3/8/8/6K1 b - - 0 10', 'a7a4', true, 'Mijn toren op a4 valt je paard op e4 aan.', true, 'toren'],
    ['een truc die met de lof net te lang is', '7k/8/8/8/6n1/8/8/3Q1RK1 b - - 0 10', 'g4e3', true, 'Kijk uit, een VORK! 🍴 Eén zet valt dame en toren tegelijk aan. Wat doe je hiertegen? 🐢', false, 'paard'],
    ['een truc die met de lof te lang is', '7k/8/8/3R4/6n1/8/2Q4K/3R1B2 b - - 0 10', 'g4e3', true,
      'Kijk uit, een VORK! 🍴 Eén zet valt toren, loper, dame en toren tegelijk aan. Wat doe je hiertegen? 🐢', false, 'paard']];
  for (const [wat, fen, zet, hulp, zin, past, stuk] of NA_VRAAG5) {
    await regel('[5.11] na de voorspelvraag bij ' + wat + ': goed voorspeld zegt ' + (past ? '"Goed voorspeld!" en' : 'alleen') + ' Turbo\'s zin, verkeerd voorspeld "Het was mijn ' + stuk + '." ervoor als het past', async function (check) {
      check('testopzet: de lof en de zin samen ' + (past ? 'passen' : 'passen niet'), (Array.from('Goed voorspeld! ' + zin).length <= 100) === past);
      for (const goed of [true, false]) {
        const a = nieuwKind();
        a.ev('setPref("guard", ' + hulp + ')');
        await startPotje(a, 2);
        const v = vraagOpen5(a, fen, zet);
        tikVeld(a, goed ? v.van : v.koning);
        await wacht(2000);
        const fout = 'Het was mijn ' + stuk + '. ' + zin, verwacht = goed ? (past ? 'Goed voorspeld! ' + zin : zin) : Array.from(fout).length <= 100 ? fout : zin;
        check((goed ? 'goed' : 'verkeerd') + ' voorspeld: de strook (' + strook5(a) + ')', strook5(a) === norm5(verwacht));
      }
    });
  }
  /* zonder zin van Turbo: de lof blijft staan, of na een verkeerde voorspelling komt de coach */
  await regel('[5.11] na de voorspelvraag bij een stille zet: goed voorspeld laat "Goed voorspeld! +15 XP" staan, verkeerd voorspeld geeft de coach', async function (check) {
    for (const goed of [true, false]) {
      const a = nieuwKind();
      await startPotje(a, 2);
      const v = vraagOpen5(a, '7k/8/8/8/8/8/P7/6K1 b - - 0 10', 'h8g8');
      tikVeld(a, goed ? v.van : sqFromAlg('a2'));
      await wacht(2000);
      const s = strook5(a);
      if (goed) check('goed voorspeld: de lof blijft (' + s + ')', s === 'Goed voorspeld! +15 XP 🔮');
      else check('verkeerd voorspeld: een zin van de coach (' + s + ')', s !== '' && !/Goed voorspeld|Goede gok|Turbo zet/.test(s));
    }
  });

  /* de vraag komt niet al bij Turbo's vierde zet, wel bij zijn vijfde; ook een schaak zonder slag of nieuwe dreiging telt */
  await regel('[5.11] de voorspelvraag: niet bij Turbo\'s vierde zet, wel bij zijn vijfde, en ook bij een schaak zonder slag', async function (check) {
    const echt = pickMove;
    try {
      for (const [wat, fen, zet, vraag] of [
        ['een slag bij zijn vierde zet', 'rnbqkbnr/ppp2ppp/3p4/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 4', 'd8g5', false],
        ['dezelfde slag bij zijn vijfde zet', 'rnbqkbnr/ppp2ppp/3p4/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 5', 'd8g5', true],
        ['een schaak zonder slag en zonder nieuwe dreiging', '1r5k/8/8/8/8/8/P7/4K3 b - - 0 10', 'b8b1', true]]) {
        pickMove = function (S) { return legalMoves(S).find(function (m) { return moveKey(m) === zet; }); };
        const a = nieuwKind();
        a.ev('setPref("predict", true)');
        await startPotje(a, 2);
        a.ev('session.S = parseFEN(' + JSON.stringify(fen) + '); BD.mode = "off"; renderBoard(); turboTurn()');
        await wacht(1000);
        check(wat + ': ' + (vraag ? 'de vraag' : 'geen vraag'), (a.get('BD.mode') === 'predict') === vraag);
      }
    } finally { pickMove = echt; }
  });

  /* wanneer Turbo het laatst vroeg, volgt uit de zetten van het potje: na herladen komt de vraag niet een zet later
     opnieuw, en wie met Zet terug voor de vraag teruggaat, krijgt hem bij die zet weer */
  await regel('[5.11] na herladen komt de voorspelvraag niet al een zet na de vorige; zonder vorige vraag wel', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { return legalMoves(S).find(function (m) { return moveKey(m) === 'e8f7'; }); };
    try {
      /* 5...Pxd5 was een slag bij Turbo's vijfde zet, dus toen kwam de vraag; 5...a6 was stil */
      for (const [wat, zetten, vraag] of [
        ['na een vraag bij zijn vijfde zet', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5', 'g5f7'], false],
        ['zonder vraag bij zijn vijfde zet', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'a7a6', 'g5f7'], true]]) {
        const a = nieuwKind({ opslag: opslagMetPotje(2, zetten) });
        a.ev('setPref("predict", true); doeActie({ go: "game", level: 2 })');
        await wacht(1500);
        check(wat + ': ' + (vraag ? 'de vraag bij Kxf7' : 'geen vraag bij Kxf7'), (a.get('BD.mode') === 'predict') === vraag);
      }
    } finally { pickMove = echt; }
  });
  await regel('[5.11] wie met Zet terug voor de vraag teruggaat, krijgt de vraag bij die zet weer', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { const ms = legalMoves(S); return ms.find(function (m) { return moveKey(m) === 'f6d5'; }) || ms.find(function (m) { return moveKey(m) === 'a7a6'; }) || ms[0]; };
    try {
      const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5']) });
      a.ev('setPref("predict", true); doeActie({ go: "game", level: 2 })');
      await wacht(1500);
      if (!check('testopzet: de vraag bij Turbo\'s vijfde zet', a.get('BD.mode') === 'predict')) return;
      tikTekst(a, 'Speel maar');
      await wacht(1500);
      zet(a, 'h2h3');
      await wacht(3000);
      if (!check('testopzet: na Pxd5, h3 en a6 is het kind aan zet', a.get('session.S.hist.length') === 12 && a.get('BD.mode') === 'move')) return;
      tikTekst(a, 'Zet terug'); await wacht(500);
      tikTekst(a, 'Zet terug'); await wacht(500);
      if (!check('testopzet: terug voor exd5 (' + a.get('session.S.hist.length') + ')', a.get('session.S.hist.length') === 8)) return;
      zet(a, 'e4d5');
      await wacht(1500);
      check('de vraag komt bij dezelfde zet weer', a.get('BD.mode') === 'predict');
    } finally { pickMove = echt; }
  });

  /* ---------- 5.8: Turbo's zin na zijn zet noemt een nieuwe dreiging ---------- */

  /* Bij een rustige zet van Turbo (geen slag, geen schaak) komt eerst de
     dreigregel: met naam als er een nieuwe dreiging is, de grootste, en
     anders geen dreiging die er niet is. */
  for (const g of [['tegen Turbo, een kind dat net begint', 2, null, true], ['tegen Super Turbo', 3, null, false], ['voor een kind dat al sterk is', 2, 'sterk', false]]) {
    await regel('[5.8] na Turbo\'s rustige zet ' + g[0] + ': ' + (g[3] ? '"Mijn {stuk} op {veld} valt je {stuk} op {veld} aan."' : '"Ik dreig iets. Zie je wat?"'), async function (check) {
      const echt = Math.random;
      Math.random = vasteKans5(58);
      try {
        const a = nieuwKind();
        /* de dreigregel is hulp: hij volgt de schakelaar van het blunderalarm */
        a.ev('setPref("guard", true)');
        if (g[2]) a.ev('setPref("start", ' + JSON.stringify(g[2]) + ')');
        await startPotje(a, g[1]);
        let dreig = 0, stil = 0;
        await speelZelf5(a, g[1] === 3 ? 12 : 24, function (z) {
          const t = zetTelt5(z.voor, z.zet);
          if (t.slag || t.schaak) return;
          /* een truc van Turbo gaat voor de dreigregel */
          if (/Kijk uit/.test(z.strook)) return;
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
          /* "je dekt" alleen als het kind na de slag echt kan terugslaan */
          const gedekt = t.nieuw.filter(function (x) {
            if (x.gain !== max) return false;
            const N = nullMoved(na), slag = legalMoves(N).find(function (y) { return y.from === x.move.from && y.to === x.move.to; });
            if (!slag) return false;
            makeMove(N, slag);
            const terug = legalMoves(N).some(function (y) { return y.to === x.sq && N.board[y.to]; });
            unmakeMove(N);
            return terug;
          }).map(function (x) { return na.board[x.sq].toLowerCase() === 'n' ? 'het' : 'hem'; });
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

  /* ook in Koning ontsnapt speelt Turbo zijn antwoord op de tweede poging, en dan pas komt het antwoord */
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

  await regel('[5.5] Trucendoos, mat in één: een zet zonder schaak zegt "Dat is geen schaak: Turbo speelt dan {zet}. Zoek een zet die schaak geeft.", en na twee missers "Dit was mat: {zet}."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT1T5[0], 'mat1', [MAT1T5[1]]);
    const S = parseFEN(MAT1T5[0]);
    const mat = 'Dit was mat: ' + moveNameNL(S, legalMoves(S).find(function (m) { return moveKey(m) === MAT1T5[1]; })) + '.';
    zet(a, MAT1T5[2]);
    await wacht(5000);
    const pijl = a.get('(function () { var p = BD.arrows.find(function (x) { return x.cls === "a-coral"; }); return p ? moveKey(p) : null; })()');
    const z = /^Dat is geen schaak: Turbo speelt dan (.+)\. Zoek een zet die schaak geeft\./.exec(onder5(a));
    check('de eerste poging (' + onder5(a) + ')', !!z);
    check('de zet in de zin is Turbo\'s pijl op het bord (' + pijl + ')', !!z && !!pijl && a.get('(function () { var S = parseFEN(' + JSON.stringify(MAT1T5[0]) + ');' +
      ' makeMove(S, legalMoves(S).find(function (x) { return moveKey(x) === ' + JSON.stringify(MAT1T5[2]) + '; })); return moveNameNL(S, legalMoves(S).find(function (x) { return moveKey(x) === ' + JSON.stringify(pijl) + '; })); })()') === z[1]);
    if (isPuzzel5(a)) { zet(a, 'g1h1'); await wacht(6000); }
    check('na twee missers de matzet (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf(mat) >= 0);
  });

  /* ---------- 5.5: een foute poging in de Trucendoos ---------- */

  /* elke foute poging krijgt Turbo's antwoord op het bord, ook de laatste voor het antwoord */
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

  await regel('[5.4] de openingscoach: een zet die een stuk kost zegt "Pas op: na deze zet wint Turbo 3 punten." en wat Turbo dan speelt', async function (check) {
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
    const tweede = 'Turbo speelt dan ' + moveNameNL(S, bc.take) + '.';
    zet(a, 'f1a6');
    await wacht(400);
    check('de waarschuwing (' + onder5(a) + ')', onder5(a).indexOf('Pas op: na deze zet wint Turbo 3 punten.') === 0);
    check('en wat Turbo dan speelt', onder5(a).indexOf(tweede) >= 0);
  });

  /* na 1.e4 e5 2.Pf3 Dg5 staat Turbo's dame gratis. 3.a3 laat haar staan,
     maar verliest zelf niets: dat is een gemiste kans, geen gevaar. */
  const DG5 = ['e2e4', 'e7e5', 'g1f3', 'd8g5'];
  await regel('[5.4] de openingscoach: een gemiste kans is geen "Pas op", maar "Er was een sterkere zet." met 1 ster', async function (check) {
    const a = nieuwKind();
    a.ev('startOpening("coach", null)');
    const r = a.ev('(function () { var S = newGame(); ' + JSON.stringify(DG5) + '.forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); });' +
      ' var e = coachEval(S, legalMoves(S).find(function (m) { return moveKey(m) === "a2a3"; })); return JSON.stringify(e); })()');
    const e = JSON.parse(r);
    check('geen waarschuwing (' + e.msg + ')', e.msg.indexOf('Pas op') < 0);
    check('wel de sterkere zet, met 1 ster (' + e.stars + ')', e.msg === 'Er was een sterkere zet.' && e.stars === 1);
  });

  for (const g of [['3.a3 laat Turbo\'s dame staan: geen alarm', DG5, 'a2a3', null],
    ['3.Pxe5 geeft een paard voor een pion: "Na deze zet kan Turbo je paard op e5 pakken."', ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 'f3e5', 'Na deze zet kan Turbo je paard op e5 pakken.']]) {
    await regel('[5.4] het blunderalarm meet tegen het bord nu, ' + g[0], async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(1, g[1]) });
      a.ev('setPref("guard", true)');
      a.tik('verderKaart');
      await wacht();
      if (!check('testopzet: het potje loopt', a.get('!!session && session.kind === "game" && session.S.hist.length === 4'))) return;
      zet(a, g[2]);
      await wacht(500);
      if (g[3]) check('het alarm met de zin (' + a.scherm() + ')', a.open() && a.scherm().indexOf(g[3]) >= 0);
      else check('geen alarm, de zet staat (' + a.get('session.S.hist.length') + ')', !a.open() && a.get('session.S.hist.length') >= 5);
    });
  }

  /* ---------- 5.5: Veilig of valstrik zegt waarom ---------- */

  /* Db1-b4: Txb4, de dame zelf staat onbeschermd; Lf4-c1: de loper dekte het paard op e5 */
  const VALSTRIK5 = [
    ['de dame die zelf onbeschermd staat', '7k/8/8/8/7r/8/8/KQ6 w - - 0 1', 'b1b4', 'Je dame op b4 staat daar onbeschermd.'],
    ['de loper die het paard dekte', '4r1k1/8/8/4N3/5B2/8/8/6K1 w - - 0 1', 'f4c1', 'Je loper dekte je paard op e5. Nu niet meer.'],
    /* Dd1-d2: de loper op c1 en de koning dekken d2, maar het paard op c4 is minder waard dan de dame */
    ['de dame die gedekt is maar meer waard dan wat slaat', 'r1bqkbnr/pppp1ppp/8/3Pp3/2n5/2N2N2/PPP1PPPP/R1BQKB1R w KQkq - 0 1', 'd1d2',
      'Je dame op d2 is wel gedekt, maar Turbo slaat met het paard: dat kost jou meer.'],
    /* a2-a3 laat de loper op g5 staan, die de pion op h6 al aanviel */
    ['de loper die al aangevallen stond', '6k1/8/7p/6B1/8/8/P7/6K1 w - - 0 1', 'a2a3', 'Je loper op g5 stond al aangevallen door de pion op h6.']
  ];
  for (const g of VALSTRIK5) {
    for (const zei of ['Valstrik', 'Veilig']) {
      await regel('[5.5] Veilig of valstrik, ' + g[0] + ', het kind zei ' + zei + ': "Turbo speelt dan {zet}." en "' + g[3] + '"', async function (check) {
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
          else check('na een goed antwoord geen les', !/Kijk eerst/.test(r.join(' ')));
        } finally { genSafeTask = echt; }
      });
    }
  }

  /* fix list item 18: Pf3-e1 laat Dxh2 mat toe; het paard dekte h2 */
  for (const zei of ['Valstrik', 'Veilig']) {
    await regel('[5.5] Veilig of valstrik, een zet die mat toelaat, het kind zei ' + zei + ': "Turbo speelt dan {zet}: schaakmat." en "Je paard dekte h2. Nu niet meer."', async function (check) {
      const S = parseFEN('6k1/2b2ppp/3q4/8/8/5N2/PPP2PPP/3Q1RK1 w - - 0 1');
      const m = legalMoves(S).find(function (x) { return moveKey(x) === 'f3e1'; });
      makeMove(S, m);
      const mat = mateReply(S), eerste = 'Turbo speelt dan ' + moveNameNL(S, mat) + ': schaakmat.';
      unmakeMove(S);
      const taak = { S: S, move: m, trap: true, punish: mat, mate: true, loss: 100 };
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
        check('de eerste reden (' + r.join(' / ') + ')', r[0] === eerste);
        check('het paard dekte het matveld', r.join(' ').indexOf('Je paard dekte h2. Nu niet meer.') >= 0);
        if (zei === 'Veilig') check('en waar je de volgende keer naar kijkt', /Kijk eerst wat Turbo terug kan doen\.$/.test(r.join(' ')));
      } finally { genSafeTask = echt; }
    });
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

  await regel('[5.5] Speurogen, een stuk van Turbo aangetikt: "De loper op c3 is van Turbo. Tik jouw eigen stukken aan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev(SPEUR5);
    tikVeld(a, a.get('sqFromAlg("a1")'));
    tikVeld(a, a.get('sqFromAlg("c3")'));
    tikTekst(a, 'Klaar');
    await wacht();
    check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('De loper op c3 is van Turbo. Tik jouw eigen stukken aan.') >= 0);
  });

  /* ---------- 5.5: Speurogen, alle redenen (SG1 tot SG22) ---------- */

  /* Een Speurogen-opdracht op een vaste stelling, met de doelen zoals genScanTask ze maakt. */
  function speurOpdracht5(fen, type, stuk) {
    return '(function () { var S = parseFEN(' + JSON.stringify(fen) + '); session.S = S; var type = ' + JSON.stringify(type) + ';' +
      ' var extra = ' + (stuk ? 'sqFromAlg(' + JSON.stringify(stuk) + ')' : 'null') + ';' +
      ' var details = type === "free" ? freePiecesEx(S) : type === "threat" ? threatDetails(S) : null;' +
      ' var targets = type === "attacked" ? attackedPieces(S, "w") : type === "capture" ? captureTargets(S) :' +
      '   type === "mobility" ? legalMoves(S).filter(function (m) { return m.from === extra; }).map(function (m) { return m.to; }) :' +
      '   details.map(function (x) { return x.sq; });' +
      ' session.task = { S: S, type: type, targets: targets, extra: extra, details: details };' +
      ' session.phase = "marking"; BD.marks.clear(); BD.glow.clear(); if (extra != null) BD.glow.add(extra); BD.mode = "mark"; renderBoard(); })()';
  }
  const TOREN5 = '6k1/8/8/p7/8/8/8/R2N2K1 w - - 0 1';
  const SPEUR = [
    ['SG1, het paard valt aan', '6k1/8/8/8/8/1n6/8/R5K1 w - - 0 1', 'attacked', null, [], ['Gemist: jouw toren op a1 wordt aangevallen door het paard op b3.']],
    ['SG3', '6k1/8/8/8/8/2b5/7N/R5K1 w - - 0 1', 'attacked', null, ['a1', 'h2'], ['Jouw paard op h2 wordt door niemand aangevallen.', 'Die staat veilig.']],
    ['SG4', '6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1', 'attacked', null, ['a1', 'e4'], ['Op e4 staat geen stuk.']],
    ['SG5', '6k1/8/8/3p4/8/8/8/3R2K1 w - - 0 1', 'capture', null, [], ['Gemist: jouw toren op d1 kan de pion op d5 slaan.']],
    ['SG6', '6k1/8/8/3p4/8/8/8/3R2K1 w - - 0 1', 'capture', null, ['d5', 'd1'], ['De toren op d1 is van jou. Tik de groene stukken aan.']],
    ['SG7', '6k1/8/8/n2p4/8/8/8/3R2K1 w - - 0 1', 'capture', null, ['d5', 'a5'], ['Geen enkel wit stuk kan het paard op a5 nu slaan.']],
    ['SG8', TOREN5, 'mobility', 'a1', ['a2'], ['De omrande velden: daar kon je toren ook naartoe.', 'Tel ze eens na.']],
    ['SG9, de toren', TOREN5, 'mobility', 'a1', ['a1'], ['Dat is je toren zelf. Tik de velden aan waar hij heen kan.']],
    ['SG9, het paard', '6k1/8/8/8/3N4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['d4'], ['Dat is je paard zelf. Tik de velden aan waar het heen kan.']],
    ['SG10', TOREN5, 'mobility', 'a1', ['d1'], ['Op d1 staat je eigen paard. Daar kan je toren niet heen.']],
    ['SG11', '4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1', 'mobility', 'e2', ['d2'], ['Naar d2 mag niet: dan staat je eigen koning schaak.']],
    ['SG12, een eigen stuk', TOREN5, 'mobility', 'a1', ['f1'], ['Naar f1 kan je toren niet: het paard op d1 staat in de weg.']],
    ['SG12, een stuk van Turbo', TOREN5, 'mobility', 'a1', ['a7'], ['Naar a7 kan je toren niet: de pion op a5 staat in de weg.']],
    ['SG13, de toren', TOREN5, 'mobility', 'a1', ['b2'], ['Zo beweegt een toren niet.', 'De toren gaat rechtdoor: vooruit, achteruit, opzij.']],
    ['SG13, het paard, ook op een lijn', '6k1/8/8/8/3N4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['d6'],
      ['Zo beweegt een paard niet.', 'Het paard springt in een L: twee stappen rechtdoor en één opzij. Het springt over andere stukken heen.']],
    ['SG13, de loper', '6k1/8/8/8/3B4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['d5'], ['Zo beweegt een loper niet.', 'De loper gaat alleen schuin, en blijft altijd op dezelfde kleur.']],
    ['SG13, de dame', '6k1/8/8/8/3Q4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['e6'], ['Zo beweegt een dame niet.', 'De dame gaat rechtdoor en schuin, zo ver als ze wil.']],
    ['SG14', '6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1', 'threat', null, [], ['Gemist: Turbo\'s loper op c3 kan jouw toren op a1 pakken.', 'Niemand kan terugpakken.']],
    ['SG15', '6k1/8/8/5n2/3R4/2P5/8/6K1 w - - 0 1', 'threat', null, [], ['Gemist: Turbo\'s paard op f5 slaat jouw toren op d4 (5 punten).', 'Jij slaat terug en pakt maar 3 punten. Winst voor Turbo.']],
    ['SG16', '6k1/8/8/5n2/3R4/2P5/8/6K1 w - - 0 1', 'threat', null, ['d4', 'f5'], ['Het paard op f5 is van Turbo. Tik jouw stukken aan die in gevaar zijn.']],
    ['SG3, bij wat dreigt', '6k1/8/8/5n2/3R4/2P5/8/6K1 w - - 0 1', 'threat', null, ['d4', 'c3'], ['Jouw pion op c3 wordt door niemand aangevallen.', 'Die staat veilig.']],
    ['SG17', '6k1/8/8/5n2/3N4/2P5/8/6K1 w - - 0 1', 'threat', null, ['d4'], ['Jouw paard op d4 is gedekt door je pion op c3.', 'Slaat Turbo, dan pak jij terug: dat levert hem niets op.']],
    ['SG18', '6k1/8/8/3n4/8/8/8/3R2K1 w - - 0 1', 'free', null, [], ['Gemist: het paard op d5 stond gratis: niemand kan terugpakken.', 'Jouw toren op d1 kon het pakken.']],
    ['SG19', '6k1/8/4p3/3r4/8/2N5/8/6K1 w - - 0 1', 'free', null, [], ['Gemist: jouw paard op c3 kan de toren op d5 slaan (5 punten).', 'Turbo pakt terug (3 punten). Winst voor jou: 2 punten.']],
    ['SG20', '6k1/8/4p3/3n4/8/2N5/8/6K1 w - - 0 1', 'free', null, ['d5'], ['Het paard op d5 is gedekt door de pion op e6.', 'Paard slaat paard, pion slaat terug: 3 tegen 3 punten. Eerlijk, maar geen winst.']],
    ['SG21', '6k1/8/4p3/3n4/8/8/8/3R2K1 w - - 0 1', 'free', null, ['d5'], ['Het paard op d5 is gedekt door de pion op e6.', 'Sla je het paard, dan pakt Turbo terug en verlies jij meer.']],
    ['SG22', '6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1', 'threat', null, ['a1'], ['Alles gevonden.']],
    /* een stuk van Turbo dat aanvalt maar niet mag slaan: een penning, of de koning die een gedekt stuk niet mag slaan */
    ['SG23, een stuk in een penning', 'r1bqk1nr/ppp2ppp/2nbp3/1B1p4/3PPB2/2N5/PPP2PPP/R2QK1NR w KQkq - 0 1', 'threat', null, ['d4'],
      ['Het paard op c6 valt je pion aan, maar mag niet slaan.', 'Het staat in een penning: slaat het, dan staat Turbo\'s eigen koning schaak.']],
    ['SG23, de koning', '8/6k1/7N/8/8/8/8/6KR w - - 0 1', 'threat', null, ['h6'], ['De koning op g7 valt je paard aan, maar mag niet slaan.', 'Je paard is gedekt: slaat de koning, dan staat hij schaak.']],
    /* de dame is "ze" en "haar" */
    ['SG9, de dame', '6k1/8/8/8/3Q4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['d4'], ['Dat is je dame zelf. Tik de velden aan waar ze heen kan.']],
    ['SG18, de dame', '6k1/8/8/3q4/8/8/8/3R2K1 w - - 0 1', 'free', null, [], ['Gemist: de dame op d5 stond gratis: niemand kan terugpakken.', 'Jouw toren op d1 kon haar pakken.']],
    /* en passant: slaan, gratis met winst, en teruggepakt */
    ['SG5, en passant', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'capture', null, [], ['Gemist: jouw pion op e5 kan de pion op d5 slaan.']],
    ['SG18, en passant', '4k3/8/8/n2pP3/8/8/8/R3K3 w - d6 0 1', 'free', null, ['a5'], ['Gemist: de pion op d5 stond gratis: niemand kan terugpakken.', 'Jouw pion op e5 kon hem pakken.']],
    ['SG20, en passant en teruggepakt', 'r1bq1rk1/ppp1bppp/2n1pn2/3pP3/3P4/3B1N2/PPPN1PPP/R1BQK2R w KQ d6 0 1', 'free', null, ['d5', 'f6'],
      ['Je pion op e5 kan de pion op d5 en passant slaan: je pion komt dan op d6.', 'De pion op c7 pakt terug op d6.',
        'Pion slaat pion, pion slaat terug: 1 tegen 1 punt. Eerlijk, maar geen winst.']],
    /* "staat in de weg" alleen op een lijn waar het stuk over kan: niet voor een paard, niet schuin voor een toren */
    ['SG13, het paard met een stuk ertussen', '6k1/8/8/3p4/3N4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['d6'],
      ['Zo beweegt een paard niet.', 'Het paard springt in een L: twee stappen rechtdoor en één opzij. Het springt over andere stukken heen.']],
    ['SG13, de toren schuin met een stuk ertussen', '6k1/8/8/8/8/8/1P6/R5K1 w - - 0 1', 'mobility', 'a1', ['c3'], ['Zo beweegt een toren niet.', 'De toren gaat rechtdoor: vooruit, achteruit, opzij.']]
  ];
  for (const g of SPEUR) {
    await regel('[5.5] Speurogen, ' + g[0] + ': "' + g[5].join(' ') + '"', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'scan');
      a.ev(speurOpdracht5(g[1], g[2], g[3]));
      for (const v of g[4]) tikVeld(a, a.get('sqFromAlg(' + JSON.stringify(v) + ')'));
      tikTekst(a, 'Klaar');
      await wacht();
      /* een stuk is een reden in de lijst, ook als die twee zinnen heeft */
      const r = redenen5(a);
      check('de redenen (' + r.join(' / ') + ')', r.indexOf(g[5].join(' ')) >= 0);
      if (g[0] === 'SG22') check('en niets anders', r.length === 1);
    });
  }

  /* De som van een ruil staat er alleen bij slaan en een keer terugslaan. Pxd5 exd5 Txd5: de ruil gaat
     door, en "Turbo pakt terug (2 punten)" zou niet kloppen. Pxd4 Dxd4 Txd4: terugslaan kost meer. */
  for (const g of [['met winst, de ruil gaat verder', '6k1/8/4p3/3r4/8/2N5/8/3R2K1 w - - 0 1', 'free', 'Gemist: jouw paard op c3 kan de toren op d5 slaan (5 punten).'],
    ['wat dreigt, terugslaan kost meer', '3r2k1/8/2n5/8/3B4/8/8/3Q2K1 w - - 0 1', 'threat', 'Gemist: Turbo\'s paard op c6 slaat jouw loper op d4 (3 punten).']]) {
    await regel('[5.5] Speurogen, ' + g[0] + ': alleen "' + g[3] + '", zonder som', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'scan');
      a.ev(speurOpdracht5(g[1], g[2], null));
      tikTekst(a, 'Klaar');
      await wacht();
      const r = redenen5(a);
      check('de redenen (' + r.join(' / ') + ')', r.indexOf(g[3]) >= 0);
    });
  }

  /* ---------- 5.5: De Beste Zet, B1 en B2 ---------- */

  /* De uitleg bij drie keuzes op een vaste stelling; deep zoals genBest3 hem rekent. */
  function besteUitleg5(a, fen, zetten, beste) {
    return a.get('(function () { var S = parseFEN(' + JSON.stringify(fen) + ');' +
      ' var opts = ' + JSON.stringify(zetten) + '.map(function (k) { var m = legalMoves(S).find(function (x) { return moveKey(x) === k; });' +
      '   makeMove(S, m); var deep = -search(S, 2, -Infinity, Infinity, 1); unmakeMove(S); return { m: m, deep: deep }; });' +
      ' var r = best3Explanations({ S: S, options: opts, best: opts[' + beste + '] });' +
      ' return { regels: r.map(function (x) { return x.replace(/<[^>]+>/g, ""); }), bord: toFEN(S) === ' + JSON.stringify(fen) + ' }; })()');
  }
  const BESTE = [
    ['schaakmat, en twee rustige zetten die niets weggeven', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8', 'a1a2', 'g1f1'], 0,
      ['De beste was A: Toren a1 → a8.', 'A: Toren a1 → a8. Schaakmat, meteen gewonnen.',
        'B: Toren a1 → a2. Niet fout, maar de beste zet doet meer.', 'C: Koning g1 → f1. Niet fout, maar de beste zet doet meer.']],
    ['een zet die mat toelaat, en de rustige beste', '4r1k1/8/8/8/8/8/5PPP/R5K1 w - - 0 1', ['a1a7', 'h2h3', 'g1f1'], 1,
      ['De beste was B: Pion h2 → h3.', 'A: Toren a1 → a7. Daarna kan Turbo je mat zetten.',
        'B: Pion h2 → h3. Veilig: daarna kan Turbo niets winnen.']],
    ['een stuk winnen, en twee zetten die het laten staan', '6k1/8/8/3n4/8/8/8/3R2K1 w - - 0 1', ['g1f2', 'd1d5', 'd1d2'], 1,
      ['De beste was B: Toren d1 → d5, slaat paard.', 'A: Koning g1 → f2. Niet fout, maar de beste zet doet meer.',
        'B: Toren d1 → d5, slaat paard. Die levert je 3 punten op.', 'C: Toren d1 → d2. Niet fout, maar de beste zet doet meer.']],
    ['een stuk winnen met schaak', '3n2k1/8/8/8/8/8/8/3R2K1 w - - 0 1', ['d1d8', 'g1f2', 'd1d2'], 0,
      ['De beste was A: Toren d1 → d8, slaat paard.', 'A: Toren d1 → d8, slaat paard. Die levert je 3 punten op, met schaak.']],
    ['een stuk verliezen, en de rustige beste', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['f3e5', 'b1c3', 'a2a3'], 1,
      ['De beste was B: Paard b1 → c3.', 'A: Paard f3 → e5, slaat pion. Turbo speelt dan Paard c6 → e5, slaat paard, en niemand kan terugpakken: je bent 2 punten kwijt.',
        'B: Paard b1 → c3. Dit is de sterkste van de drie.']],
    ['een aangevallen stuk redden', '6k1/8/8/3p4/4N3/8/P6P/6K1 w - - 0 1', ['h2h3', 'e4c3', 'a2a3'], 1,
      ['De beste was B: Paard e4 → c3.', 'A: Pion h2 → h3. Turbo speelt dan Pion d5 → e4, slaat paard, en niemand kan terugpakken: je bent 3 punten kwijt.',
        'B: Paard e4 → c3. Die redt je paard: die stond aangevallen.']],
    ['schaak als beste, een vork later, en een rustige zet', '6k1/8/6n1/8/8/8/6K1/3Q4 w - - 0 1', ['d1d8', 'd1e2', 'g2h3'], 0,
      ['De beste was A: Dame d1 → d8.', 'A: Dame d1 → d8. Veilig, en schaak: Turbo moet eerst zijn koning redden.',
        'B: Dame d1 → e2. Een paar zetten later kost deze je toch iets.', 'C: Koning g2 → h3. Niet fout, maar de beste zet doet meer.']],
    /* "kost je toch iets" alleen als de lijn en de zoektocht het allebei zeggen: Pf3-e1 kost langs de korte lijn
       6,3 punten, maar de zoektocht ziet geen verlies (de lijn stopt midden in een ruil); Le2-a6 kost maar een pion */
    ['een zet waarvan alleen de korte lijn een verlies ziet', 'r3kb1r/ppp2ppp/2n1qn2/3pPbB1/8/2N1QN2/PPP1PPPP/2KR1B1R w kq - 0 1', ['f3e1', 'e5f6', 'h2h3'], 1,
      ['De beste was B: Pion e5 → f6, slaat paard.', 'A: Paard f3 → e1. Niet fout, maar de beste zet doet meer.']],
    ['een zet die later maar een pion kost', 'r2qk2r/ppp2ppp/2n2n2/3ppb2/3P4/b3P2N/PPP1BPPP/R1BQK2R w KQkq - 0 1', ['e2a6', 'b2a3', 'g2g3'], 1,
      ['De beste was B: Pion b2 → a3, slaat loper.', 'A: Loper e2 → a6. Niet fout, maar de beste zet doet meer.']],
    ['de beste is een vork', 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7', 'e1d2', 'b5d4'], 0,
      ['De beste was A: Paard b5 → c7.', 'A: Paard b5 → c7. Een vork! Veilig, en schaak: Turbo moet eerst zijn koning redden.']],
    /* "na het slaan en terugslaan" alleen als er iets terug kan slaan */
    ['een loper die niemand terugpakt', 'r1b1r1k1/ppppqppp/3b2n1/1Bn1p1N1/4P3/2NPB3/PPP2PPP/R2Q2KR w - - 0 1', ['b5c6', 'h2h3', 'a2a3'], 1,
      ['De beste was B: Pion h2 → h3.', 'A: Loper b5 → c6. Turbo speelt dan Pion d7 → c6, slaat loper, en niemand kan terugpakken: je bent 3 punten kwijt.']],
    ['een dame die wel teruggepakt wordt', '6k1/8/4p3/3p4/8/2N5/8/3Q2K1 w - - 0 1', ['d1d5', 'g1f2', 'd1d2'], 1,
      ['De beste was B: Koning g1 → f2.', 'A: Dame d1 → d5, slaat pion. Turbo speelt dan Pion e6 → d5, slaat dame: na het slaan en terugslaan ben je 7 punten kwijt.']],
    /* geen truc voor een zet die verliest */
    ['een penning die een toren laat staan', '3q3k/8/5n2/b7/8/2R5/3B4/6K1 w - - 0 1', ['d2g5', 'g1f2', 'c3c1'], 0,
      ['De beste was A: Loper d2 → g5.', 'A: Loper d2 → g5. Turbo speelt dan Loper a5 → c3, slaat toren, en niemand kan terugpakken: je bent 5 punten kwijt.']],
    /* Turbo's beste antwoord is een stil schaak: "Turbo speelt dan" noemt de slag die het verlies begint, de grootste */
    ['een zet waarna Turbo\'s beste antwoord niet slaat', 'rn1qkb1r/ppp2p1p/3p2p1/1N1b1Q2/3P4/2nB4/PPP2PPP/R1B2RK1 w kq - 0 11', ['h2h4', 'f1e1', 'd3c4'], 1,
      ['De beste was B: Toren f1 → e1.', 'A: Pion h2 → h4. Turbo speelt dan Pion g6 → f5, slaat dame: na het slaan en terugslaan ben je 6 punten kwijt.',
        'C: Loper d3 → c4. Turbo speelt dan Pion g6 → f5, slaat dame, en niemand kan terugpakken: je bent 9 punten kwijt.']],
    /* punten uit de tabel van de kinderen: twee lopers voor een toren is 1 punt, niet de 1,6 van de engine afgerond */
    ['twee lopers voor een toren', '3r2k1/3r1ppp/8/8/8/8/2B2PPP/5BK1 w - - 0 1', ['f1d3', 'g2g3', 'h2h3'], 1,
      ['De beste was B: Pion g2 → g3.', 'A: Loper f1 → d3. Turbo speelt dan Toren d7 → d3, slaat loper: na het slaan en terugslaan ben je 1 punt kwijt.']],
    /* de beste keuze: veilig als beide maten geen verlies zien, "kost iets" als beide een verlies zien, en anders
       niets over veilig */
    ['de beste kost langs lijn en zoektocht 2 punten, de andere twee meer', 'rnbqkb1r/ppp2ppp/3p4/1N2p1n1/2B5/4PQ2/PPPP1PPP/R1B1K1NR w - - 0 1', ['f3d5', 'a2a3', 'h2h3'], 0,
      ['De beste was A: Dame f3 → d5.', 'A: Dame f3 → d5. Ook deze kost iets, maar de andere twee kosten meer.']],
    ['de beste kost langs lijn en zoektocht iets, de andere twee evenveel', 'r1bqkb1r/ppp1nppp/3p4/3Pp3/3NP3/2NQ4/PPP2PPP/R1B1KB1R w - - 0 1', ['d3b5', 'a2a3', 'h2h3'], 0,
      ['De beste was A: Dame d3 → b5.', 'A: Dame d3 → b5. Ook deze kost iets, maar het is de beste van de drie.']],
    ['de beste, waar lijn en zoektocht allebei geen verlies zien', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'a2a3', 'h2h4'], 0,
      ['De beste was A: Pion e2 → e4.', 'A: Pion e2 → e4. Veilig: daarna kan Turbo niets winnen.']],
    ['de beste, waar alleen de korte lijn een verlies ziet', 'r1bqkbr1/ppppnpp1/2n1p2p/8/2N1P3/3B1N2/PPPP1PPP/R1BQ1RK1 w - - 0 1', ['f3e5', 'd1e2', 'a2a3'], 0,
      ['De beste was A: Paard f3 → e5.', 'A: Paard f3 → e5. Dit is de sterkste van de drie.']],
    ['een zet die later anderhalf punt kost', 'r2qk2r/p1p2ppp/2N1pn2/3p4/1pbP1b2/1Q2P3/PPP2PPP/RN3RK1 w kq - 0 13', ['c2c3', 'b3c4', 'a2a3'], 1,
      ['De beste was B: Dame b3 → c4, slaat loper.', 'C: Pion a2 → a3. Een paar zetten later kost deze je toch iets.']],
    ['de beste is een aftrekschaak', '4k3/p7/8/8/4N3/8/8/4R1K1 w - - 0 1', ['e4c3', 'g1f2', 'e1e2'], 0,
      ['De beste was A: Paard e4 → c3.', 'A: Paard e4 → c3. Een aftrekschaak! Veilig, en schaak: Turbo moet eerst zijn koning redden.']]
  ];
  for (const g of BESTE) {
    await regel('[5.5] De Beste Zet, ' + g[0] + ': "' + g[4][0] + '" en per keuze waarom', async function (check) {
      const a = nieuwKind();
      const u = besteUitleg5(a, g[1], g[2], g[3]);
      check('de eerste reden (' + u.regels[0] + ')', u.regels[0] === g[4][0]);
      for (const z of g[4].slice(1)) check(z.slice(0, 2) + ' (' + u.regels.join(' / ') + ')', u.regels.indexOf(z) >= 1);
      check('drie keuzes, elk een regel', u.regels.length === 4);
      check('het bord blijft staan', u.bord);
    });
  }

  await regel('[5.5] De Beste Zet: na de goede keuze (Goud) geen "De beste was": de eerste reden is die van de keuze zelf', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('(function () { var S = parseFEN("6k1/8/8/3n4/8/8/8/3R2K1 w - - 0 1");' +
      ' var opts = ["g1f2", "d1d5", "d1d2"].map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });' +
      ' session.task = { S: S, options: opts, best: opts[1] }; session.S = S; session.phase = "choose"; session.tries = 0; session.picked = null; session.keuzeOpen = true; renderBoard(); })()');
    a.ev('pickOption(1); best3Confirm()');
    await wacht(3000);
    const r = redenen5(a);
    check('de eerste reden (' + r.join(' / ') + ')', r[0] === 'A: Koning g1 → f2. Niet fout, maar de beste zet doet meer.' && r[1] === 'B: Toren d1 → d5, slaat paard. Die levert je 3 punten op.');
    check('alleen de keuzes, zonder emoji', r.length === 3 && r.every(function (z) { return !/[\u{1F300}-\u{1FAFF}]/u.test(z); }));
  });


  /* je eigen foute tikken (de rode kruisjes) eerst, dan wat je miste */
  await regel('[5.5] Speurogen, met winst: eerst de reden bij je foute tik, dan wat je miste', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev(speurOpdracht5('6k1/8/8/3n4/8/8/1p6/3R2K1 w - - 0 1', 'free', null));
    tikVeld(a, a.get('sqFromAlg("b2")'));
    tikTekst(a, 'Klaar');
    await wacht();
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', r[0] === 'Geen enkel wit stuk kan de pion op b2 nu slaan.' && /^Gemist: het paard op d5/.test(r[1] || ''));
  });
  /* hoogstens vijf redenen, en dan die bij je eigen tikken */
  await regel('[5.5] Speurogen: hoogstens vijf redenen, de foute tikken voorop', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'scan');
    a.ev(speurOpdracht5(TOREN5, 'mobility', 'a1'));
    for (const v of ['b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'b3']) tikVeld(a, a.get('sqFromAlg(' + JSON.stringify(v) + ')'));
    tikTekst(a, 'Klaar');
    await wacht();
    const r = redenen5(a);
    check('vijf redenen, alle bij een foute tik (' + r.join(' / ') + ')', r.length === 5 && r.every(function (z) { return /^Zo beweegt een toren niet/.test(z); }));
  });

  /* De Beste Zet: de goede keuze zegt zelf wat ze doet; "De beste was" alleen als het kind hem niet koos */
  function besteKeuze5(a) {
    a.ev('(function () { var S = parseFEN("6k1/8/8/3n4/8/8/8/3R2K1 w - - 0 1");' +
      ' var opts = ["g1f2", "d1d5", "d1d2"].map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });' +
      ' session.task = { S: S, options: opts, best: opts[1] }; session.S = S; session.phase = "choose"; session.tries = 0; session.picked = null; session.keuzeOpen = true; renderBoard(); })()');
  }
  await regel('[5.5] De Beste Zet: na twee missers is de eerste reden "De beste was {B}: {zet}."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    besteKeuze5(a);
    a.ev('pickOption(0); best3Confirm()');
    await wacht(5000);
    a.ev('pickOption(2); best3Confirm()');
    await wacht(5000);
    const r = redenen5(a);
    check('de kop (' + tekstVan(a, 'taskBox').slice(0, 20) + ')', /Zo zit het/.test(tekstVan(a, 'taskBox')));
    check('de eerste reden (' + r.join(' / ') + ')', r[0] === 'De beste was B: Toren d1 → d5, slaat paard.' && r.length === 4);
  });
  /* De lijnen van de keuzes rekent de app terwijl het kind naar het bord kijkt, niet voor de opdracht er staat;
     komt het antwoord eerder, dan rekent hij ze dan */
  await regel('[5.9] De Beste Zet: de opdracht staat er voor de lijnen van de keuzes zijn uitgerekend, en een snel antwoord krijgt ze toch', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('buildBest3()');
    check('meteen na het maken: nog geen lijn', a.get('session.task.options.every(function (o) { return o.lijn === undefined; })'));
    await wacht();
    check('even later: elke lijn', a.get('session.task.options.every(function (o) { return o.lijn !== undefined; })'));
    a.ev('buildBest3(); session.keuzeOpen = true; pickOption(session.task.options.indexOf(session.task.best)); best3Confirm()');
    check('bij een antwoord meteen: elke lijn', a.get('session.task.options.every(function (o) { return o.lijn !== undefined; })'));
    await wacht(3000);
    check('en drie redenen', redenen5(a).length === 3);
  });

  /* de dame is "ze" en "haar", ook in Turbo's zin en op de eindkaart */
  await regel('[5.8] Turbo\'s dreigregel over een gedekte dame: "Je dekt haar, maar de ruil is goed voor mij."', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 2);
    const v = vraagOpen5(a, '7k/8/8/8/6n1/8/8/R2Q3K b - - 0 10', 'g4e3');
    tikVeld(a, v.koning);
    await wacht(2000);
    check('de strook (' + strook5(a) + ')', strook5(a) === 'Mijn paard op e3 valt je dame op d1 aan. Je dekt haar, maar de ruil is goed voor mij.');
  });
  await regel('[5.8] de eindkaart over een dame die onbeschermd stond: "Daar stond ze onbeschermd, en ik pakte haar"', async function (check) {
    const a = nieuwKind();
    const t = a.get('momentTekst({ kind: "hang", self: true, moveNo: 5, piece: "dame", sq: "g5", points: 9, used: true }).tekst');
    check('de zin (' + t + ')', t === 'Zet 5: je dame ging naar g5. Daar stond ze onbeschermd, en ik pakte haar (9 punten).');
  });

  /* na Turbo's matzet: waarom de koning het stuk dat schaak geeft niet slaat (de regel van de schaakcoach) */
  const MATUITLEG5 = [
    ['dubbelschaak', '1k1rr3/ppp2ppp/5q2/2b1p3/2Q1P3/N2P3P/PP2n1BP/R5KR w - - 0 1',
      'Dubbelschaak: het paard op e2 en de loper op c5 geven allebei schaak.'],
    ['een dame naast de koning, gedekt', '6k1/8/8/8/8/7b/5PqP/6K1 w - - 0 1',
      'De dame op g2 geeft schaak, en f1 en h1 zijn gedekt. Je koning mag haar niet slaan: ze wordt gedekt door de loper op h3.'],
    ['een toren naast de koning, gedekt', '6k1/8/8/2b5/6n1/8/7r/7K w - - 0 1',
      'De toren op h2 geeft schaak, en g1 en g2 zijn gedekt. Je koning mag hem niet slaan: hij wordt gedekt door het paard op g4.'],
    ['verder weg, en een stuk dat slaat staat in een penning', '1k5r/1p3ppp/p6n/1qp1p1B1/4P3/P7/RPP1QPPP/3r1K1R w - - 0 1',
      'De toren op d1 geeft schaak. Je dame op e2 mag de toren niet slaan: ze staat in een penning.'],
    ['verder weg en niets kan slaan', '6k1/8/8/8/8/8/5nPP/6RK w - - 0 1', 'Het paard op f2 geeft schaak.']];
  for (const [wat, fen, zin] of MATUITLEG5) {
    await regel('[5.5] na Turbo\'s matzet, ' + wat + ': "' + zin + '"', async function (check) {
      const a = nieuwKind();
      const z = norm5(a.get('matUitleg(parseFEN(' + JSON.stringify(fen) + '))'));
      check('testopzet: wit staat mat', a.get('gameStatus(parseFEN(' + JSON.stringify(fen) + ')).reason') === 'mat');
      check('de zin (' + z + ')', z === zin);
    });
  }

  /* een valstrik: het stuk dat zette stond tussen Turbo's stuk en iets dat meer waard is (V9) */
  await regel('[5.5] Veilig of valstrik: "Je paard stond tussen de loper op g4 en je dame. Nu niet meer: dat kost je 6 punten."', async function (check) {
    const a = nieuwKind();
    const z = a.get('(function () { var S = parseFEN("rn1qkb1r/ppp2ppp/4pn2/3p4/4P1b1/2NB1N2/PPPP1PPP/R1BQK2R w KQkq - 0 1");' +
      ' var m = legalMoves(S).find(function (x) { return moveKey(x) === "f3g5"; }); makeMove(S, m);' +
      ' var straf = legalMoves(S).find(function (x) { return moveKey(x) === "g4d1"; }); unmakeMove(S); return valstrikWaarom(S, m, straf, false); })()');
    check('de reden (' + z + ')', z === 'Je paard stond tussen de loper op g4 en je dame. Nu niet meer: dat kost je 6 punten.');
  });
  /* een fout krijgt altijd uitleg: een valstrik zonder reden komt niet op het bord */
  await regel('[5.5] Veilig of valstrik: elke valstrik die op het bord komt, heeft een reden', async function (check) {
    const echt = Math.random;
    Math.random = vasteKans5(2121);
    try {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      let vallen = 0;
      for (let i = 0; i < 60; i++) {
        if (!a.get('buildSafe()')) continue;
        if (!a.get('session.task.trap')) continue;
        vallen++;
        const z = a.get('(function () { var t = session.task; return valstrikWaarom(t.S, t.move, t.punish, t.mate); })()');
        if (!z) check('een valstrik zonder reden: ' + a.get('toFEN(session.task.S) + " " + moveKey(session.task.move)'), false);
      }
      check('testopzet: valstrikken (' + vallen + ')', vallen >= 10);
    } finally { Math.random = echt; }
  });

  /* mat in één: een pion die en passant de schaakgever slaat, slaat hem; geen stuk ertussen */
  await regel('[5.5] Trucendoos, mat in één: Turbo die de schaakgever en passant slaat: "Na Pion b2 → b4 kan Turbo je pion slaan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '4r3/1Q2N1p1/2p4p/k3PP2/p3P3/7P/PPP3P1/4R1K1 w - - 0 1', 'mat1', ['e7c6']);
    zet(a, 'b2b4');
    await wacht(4000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Na Pion b2 → b4 kan Turbo je pion slaan. Probeer nog een zet.');
  });
  /* een pion die promoveert en dan wordt geslagen, is een dame die wordt geslagen */
  await regel('[5.5] Trucendoos: een promotie op een veld waar Turbo slaat: "Dan pakt Turbo je dame op f8."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'r1bq3r/ppp1kPpp/1b5n/7Q/3n1B2/2NP3N/PPP1BPPP/RK5R w - - 0 1', 'spies', ['f4g5']);
    zet(a, 'f7f8q');
    await wacht(4000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Dan pakt Turbo je dame op f8. Zoek een veilig veld.');
  });

  /* een slag die Turbo gebruikte: "na het terugslaan" alleen als het kind terugsloeg */
  await regel('[5.8] de eindkaart, een slag: "Na het terugslaan was je ... kwijt." als het kind terugsloeg, anders "Ook met terugslaan was je ... kwijt."', async function (check) {
    const a = nieuwKind();
    for (const [terug, zin] of [[true, 'Zet 1: je dame op d3 kon ik slaan met mijn loper. Na het terugslaan was je 6 punten kwijt.'],
      [false, 'Zet 1: je dame op d3 kon ik slaan met mijn loper. Ook met terugslaan was je 6 punten kwijt.']]) {
      const t = a.get('momentTekst({ kind: "slag", moveNo: 1, piece: "dame", sq: "d3", by: "loper", verlies: 600, loss: 600, used: true, terug: ' + terug + ' }).tekst');
      check((terug ? 'teruggeslagen' : 'niet teruggeslagen') + ' (' + t + ')', t === zin);
    }
  });
  /* een stuk dat al onbeschermd stond, krijgt zijn eigen regel voor de volgende keer */
  await regel('[5.8] de eindkaart, een stuk dat al onbeschermd stond: "Volgende keer: kijk voor elke zet welke stukken van jou aangevallen worden."', async function (check) {
    const a = nieuwKind();
    const v = a.get('momentTekst({ kind: "hang", moveNo: 5, piece: "paard", sq: "e5", points: 3, used: true }).volgende');
    check('de regel (' + v + ')', v === 'Volgende keer: kijk voor elke zet welke stukken van jou aangevallen worden.');
    const z = a.get('momentTekst({ kind: "hang", self: true, moveNo: 5, piece: "paard", sq: "g5", points: 3, used: true }).volgende');
    check('een stuk dat er zelf heen ging houdt zijn regel (' + z + ')', z === 'Volgende keer: kijk of je stuk daar gedekt is.');
  });
  /* Turbo pakt met een pion die promoveert: wie terugpakt, pakt de dame die er dan staat */
  await regel('[5.8] Turbo pakt met een promotie: "Pak je terug, dan pak ik nog eens.", niet "maar 1 punt"', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    const v = vraagOpen5(a, '2r3k1/8/8/8/8/8/1p5K/2RQ4 b - - 0 30', 'b2c1q');
    tikVeld(a, v.koning);
    await wacht(2000);
    check('de strook (' + strook5(a) + ')', strook5(a) === 'Het was mijn pion. Ik pak je toren op c1 (5 punten). Pak je terug, dan pak ik nog eens.');
  });

  /* het alarm in een potje gebruikt de grens: bij de zwaarste zet van de reviewer geen alarm, de zet gaat gewoon door */
  await regel('[5.4] het alarm in een potje heeft een grens aan posities: is die op, dan gaat de zet door zonder alarm', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 2);
    a.ev('session.S = parseFEN("1nb1kb1r/r2p3p/5p1n/pP2pPp1/PPpPq2P/N5P1/1B2N2R/1R1QKB2 w - - 0 1"); BD.mode = "move"; renderBoard()');
    zet(a, 'h2h1');
    await wacht(300);
    check('geen alarm', !a.ziet('Wacht even!'));
    check('de zet staat op het bord', a.get('session.S.hist.length') >= 1 && a.get('moveKey(session.S.hist[0].m)') === 'h2h1');
  });

  /* "Een andere zet kost minder." alleen als elke zet iets kost: in "Pas op" en in het alarm */
  await regel('[5.4] "Pas op" van de openingscoach zegt "Een andere zet kost minder." als elke zet iets kost', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    const t = a.get('(function () { session.movedTo = new Set(); session.kidMoves = 9; var S = parseFEN("7k/8/8/8/8/5n2/8/4Q1K1 w - - 0 1");' +
      ' return coachEval(S, legalMoves(S).find(function (x) { return moveKey(x) === "g1h1"; })).msg; })()');
    check('de zin (' + t + ')', /^Pas op: na deze zet wint Turbo 9 punten\./.test(t || '') && / Een andere zet kost minder\.$/.test(t || ''));
  });
  await regel('[5.4] het alarm zonder "Een andere zet kost minder." als een andere zet niets kost', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 2);
    a.ev('session.S = parseFEN("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"); BD.mode = "move"; renderBoard()');
    zet(a, 'f3e5');
    await wacht(300);
    check('het alarm', a.ziet('Wacht even!'));
    check('zonder "kost minder" (' + a.scherm() + ')', !a.ziet('Een andere zet kost minder.'));
  });
  /* punten op de eindkaart uit de tabel: twee lopers voor een toren is 1 punt */
  await regel('[5.8] de eindkaart rekent met de tabel van de kinderen: "1 punt", niet de 1,6 van de engine', async function (check) {
    const a = nieuwKind();
    const s = a.get('momentTekst({ kind: "slag", moveNo: 7, piece: "loper", sq: "d3", by: "toren", verlies: 100, loss: 160, used: true, terug: true }).tekst');
    check('een slag (' + s + ')', s === 'Zet 7: je loper op d3 kon ik slaan met mijn toren. Na het terugslaan was je 1 punt kwijt.');
    const g = a.get('momentTekst({ kind: "gemist", moveNo: 7, piece: "loper", sq: "d5", winst: 100, loss: 160 }).tekst');
    check('gemist (' + g + ')', g === 'Zet 7: je kon mijn loper op d5 pakken. Dat had je 1 punt opgeleverd.');
  });
  /* een truc die Turbo speelde, met de twee stukken die hij aanviel */
  await regel('[5.8] de eindkaart, een truc die Turbo speelde: "Mijn paard viel je dame en je toren tegelijk aan."', async function (check) {
    const a = nieuwKind();
    const t = a.get('momentTekst({ kind: "truc", moveNo: 4, truc: "vork", used: true, doelen: ["dame", "toren"], stukTurbo: "paard" }).tekst');
    check('de zin (' + t + ')', t === 'Zet 4: na je zet kon ik een vork zetten. Mijn paard viel je dame en je toren tegelijk aan.');
  });
  /* elke slag van Turbo krijgt een zin, ook een gelijke ruil; "Jij kunt terugpakken." valt weg tegen Super Turbo, zoals de dreigregel */
  for (const [niveau, zin] of [[2, 'Ik pak je paard op d4 (3 punten). Jij kunt terugpakken.'], [3, 'Ik pak je paard op d4 (3 punten).']]) {
    await regel('[5.8] Turbo ruilt gelijk' + (niveau === 3 ? ', Super Turbo' : '') + ': "' + zin + '"', async function (check) {
      const a = nieuwKind();
      await startPotje(a, niveau);
      const v = vraagOpen5(a, '6k1/8/8/5n2/3N4/2P5/8/6K1 b - - 0 10', 'f5d4');
      tikVeld(a, v.van);
      await wacht(2000);
      check('de strook (' + strook5(a) + ')', strook5(a) === 'Goed voorspeld! ' + zin);
    });
  }
  /* na opgeven: kort en zonder oordeel */
  await regel('[5.8] de eindkaart na opgeven: "Je gaf op. Dit potje is klaar."', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    a.ev('endGame({ over: true, result: "b", reason: "opgave" })');
    await wacht(2000);
    const k = norm5(tekstVan(a, 'eindkaart'));
    check('de kaart (' + k.slice(0, 80) + ')', k.indexOf('Je gaf op. Dit potje is klaar.') >= 0 && k.indexOf('Prima') < 0);
  });

  /* mat in twee: na twee foute pogingen staat de laatste onder "Zo zit het", ook bij de matzet */
  await regel('[5.5] Trucendoos, mat in twee, de eerste zet twee keer fout: de eerste reden is "Jouw zet: nog geen mat in twee."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    zet(a, 'h1h2');
    await wacht(5000);
    zet(a, 'h1h3');
    await wacht(8000);
    const r = redenen5(a);
    check('de eerste reden (' + r.join(' / ') + ')', r[0] === 'Jouw zet: nog geen mat in twee.');
  });
  await regel('[5.5] Trucendoos, mat in twee, de matzet twee keer fout: de eerste reden is "Jouw zet: nog geen mat. Turbo kan zich dan nog redden."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'k7/8/2K5/8/8/8/8/7R w - - 0 1', 'mat2', ['c6b6']);
    zet(a, 'c6b6');
    await wacht(3000);
    zet(a, 'h1h2');
    await wacht(5000);
    zet(a, 'h1h3');
    await wacht(8000);
    const r = redenen5(a);
    check('de eerste reden (' + r.join(' / ') + ')', r[0] === 'Jouw zet: nog geen mat. Turbo kan zich dan nog redden.');
  });
  /* na een gevonden truc: Turbo's antwoord uit de diepe zoektocht, en "Nu kun jij ... pakken" alleen bij een slag die wint */
  await regel('[5.5] Trucendoos, gevonden: Turbo antwoordt met de zet van de diepe zoektocht', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '1k1r1b1r/1p1q1p1p/p1pp1p2/6B1/2nPP1b1/3Q2N1/PPP2PPP/1R2KBR1 w - - 0 1', 'vork', ['g5f6']);
    zet(a, 'g5f6');
    await wacht(6000);
    check('Turbo speelde Lf8-h6 (' + a.get('session.S.hist.length > 1 ? moveKey(session.S.hist[1].m) : null') + ')', a.get('session.S.hist.length > 1 && moveKey(session.S.hist[1].m) === "f8h6"'));
  });
  await regel('[5.5] Trucendoos, gevonden: geen "Nu kun jij ... pakken" als die slag niets wint', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '1k1r1bnr/ppp1pppp/4b3/q1np2N1/4P3/2PPBN2/PP3PPP/R2QKB1R w - - 0 1', 'vork', ['b2b4']);
    zet(a, 'b2b4');
    await wacht(6000);
    const r = redenen5(a), laatste = r[r.length - 1] || '';
    check('testopzet: Turbo zette (' + laatste + ')', a.get('session.S.hist.length') === 2 && /^Turbo speelt /.test(laatste));
    check('geen "Nu kun jij"', !/Nu kun jij/.test(laatste) && a.get('BD.arrows.length') === 0);
  });
  /* mat in één: loopt de koning weg, dan zegt de zin dat */
  await regel('[5.5] Trucendoos, mat in één: een schaak waarna de koning wegloopt: "Na {zet} kan de koning naar {veld}."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '1N5R/4k3/2R5/1p1B1pp1/1P1P4/4B2P/1P3P1P/6K1 w - - 0 1', 'mat1', ['e3g5']);
    zet(a, 'c6e6');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Na Toren c6 → e6 kan de koning naar [a-h][1-8]\. Probeer nog een zet\.$/.test(onder5(a)));
  });
  /* Red je stuk: wie het stuk dat hing wegzet naar een veld waar Turbo het slaat, hoort dat het nog steeds aangevallen stond */
  await regel('[5.5] Red je stuk: het stuk dat hing gaat naar een veld waar Turbo het slaat: "je dame stond nog steeds aangevallen"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '1r1qkb1r/1pp2pp1/p1np3p/3np3/3Pb3/3QBN2/PPPKPPPP/2R2B1R w - - 0 1', 'stuk', ['d3e4'], HANG5);
    check('testopzet: de dame hangt', a.get('session.task.hang && alg(session.task.hang.sq)') === 'd3');
    zet(a, 'd3b5');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt .+, slaat dame: je dame stond nog steeds aangevallen\. Probeer nog een zet\.$/.test(onder5(a)));
  });

  /* Red je stuk: een echte redding die niets verliest is goed, met alle sterren en wat nog sterker was; een foute poging
     met een rustig antwoord zegt wat de zet van het kind deed */
  function stukUitVoorraad5(a, bord) {
    a.ev('(function () { var t = trucTask(STUK_POOL.find(function (r) { return r.indexOf(' + JSON.stringify(bord) + ') === 0; }));' +
      ' t.hintUsed = false; session.task = t; session.S = t.S; session.phase = "puzzle"; session.tries = 0; BD.mode = "puzzle"; renderBoard(); })()');
  }
  await regel('[5.5] Red je stuk: een zet die het stuk ook redt is goed, met alle sterren en "Nog sterker was {zet}: die levert je {n} meer op."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, '1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w');
    check('testopzet: Dg3 staat bij de zetten die ook goed zijn', a.get('session.task.ook.some(function (o) { return moveKey(o.m) === "f4g3"; })'));
    const voor = a.get('session.earned');
    zet(a, 'f4g3');
    await wacht(3000);
    const r = redenen5(a);
    check('Gered! (' + tekstVan(a, 'taskBox').slice(0, 30) + ')', /Gered!/.test(tekstVan(a, 'taskBox')));
    check('alle sterren', a.get('session.earned') === voor + 3);
    check('de redenen (' + r.join(' / ') + ')', r.length === 2 && r[1] === 'Nog sterker was Paard f3 → g5, slaat loper: die levert je 3 punten meer op.');
  });
  await regel('[5.5] Red je stuk: scheelt het minder dan een punt, dan alleen "Nog sterker was {zet}."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '1rbqr1k1/pppn1ppp/4p3/2npP1b1/3N1Q1P/3P1N2/PPP2PP1/R3KB1R w - - 0 1', 'stuk', ['f3g5'],
      '{ hang: threatDetails(S).filter(function (t) { return t.victim >= 300 && t.gain >= 250; })[0], ook: [{ m: legalMoves(S).find(function (x) { return moveKey(x) === "f4g3"; }), n: 50,' +
      ' ans: legalMoves(S).find(function (x) { return moveKey(x) === "f3g5"; }) }] }');
    zet(a, 'f4g3');
    await wacht(3000);
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', r[r.length - 1] === 'Nog sterker was Paard f3 → g5, slaat loper.');
  });
  await regel('[5.5] Red je stuk: een zet waarna het stuk nog hangt en Turbo rustig speelt: "Turbo speelt {zet}. Je {stuk} op {veld} is nog niet veilig."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, '1r1qkb1r/ppp2pp1/4b1np/3p4/3pPQ2/3P3N/PPP2PPP/RN2KB1R w');
    zet(a, 'b1a3');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt .+\. Je dame op f4 is nog niet veilig\. Probeer nog een zet\.$/.test(onder5(a)));
  });
  /* een tegenaanval laat het stuk aangevallen staan: is hij niet goed, dan zegt de zin dat het stuk nog niet veilig is */
  await regel('[5.5] Red je stuk: een tegenaanval die niet goed is en Turbo rustig speelt: "Je {stuk} op {veld} is nog niet veilig."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, '3rkb1r/1pp1pppp/p1nqbn2/8/3Pp3/2NQB3/PPP1NPPP/3RKB1R w');
    check('testopzet: Pb5 is een tegenaanval en niet ook goed', a.get('saveKind(session.S, legalMoves(session.S).find(function (x) { return moveKey(x) === "c3b5"; }), session.task.hang.sq).kind') === 'tegenaanval' &&
      !a.get('session.task.ook.some(function (o) { return moveKey(o.m) === "c3b5"; })'));
    zet(a, 'c3b5');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt .+\. Je dame op d3 is nog niet veilig\. Probeer nog een zet\.$/.test(onder5(a)));
  });
  await regel('[5.5] Red je stuk: een redding die later toch iets kost en Turbo rustig speelt: "Turbo speelt {zet}. Een paar zetten later verlies je toch iets."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, 'r1bqkb1r/1pp2pp1/p3p2p/4n3/2NpP3/3Q4/PPPP1PPP/R1B1K2R w');
    check('testopzet: De2 zet de dame weg en is geen zet die ook goed is', !a.get('session.task.ook.some(function (o) { return moveKey(o.m) === "d3e2"; })') &&
      a.get('saveKind(session.S, legalMoves(session.S).find(function (x) { return moveKey(x) === "d3e2"; }), session.task.hang.sq).kind') === 'weg');
    zet(a, 'd3e2');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt .+\. Een paar zetten later verlies je toch iets\. Probeer nog een zet\.$/.test(onder5(a)));
  });
  /* de zin volgt uit het bord na Turbo's antwoord: valt Turbo het weggezette stuk weer aan, dan is het nog niet veilig */
  await regel('[5.5] Red je stuk: een redding waarna Turbo het stuk weer aanvalt: "Je {stuk} op {veld} is nog niet veilig."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, '3rkb1r/pppqppp1/2n2n1p/3p4/3P2b1/3BPQ1N/PPPN1PPP/R1B2K1R w');
    check('testopzet: Df4 is geen zet die ook goed is', !a.get('session.task.ook.some(function (o) { return moveKey(o.m) === "f3f4"; })'));
    zet(a, 'f3f4');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt Paard f6 → h5\. Je dame op f4 is nog niet veilig\. Probeer nog een zet\.$/.test(onder5(a)));
  });
  /* niet geslagen, niet meer aangevallen, en geen redding: de zin zegt dat er een betere zet is, nooit dat het stuk nog
     aangevallen staat (Turbo trok hier zijn paard weg met schaak) */
  await regel('[5.5] Red je stuk: een tegenaanval waarna het stuk niet meer aangevallen staat: "Turbo speelt {zet}. Er is een betere zet om je {stuk} te redden."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    stukUitVoorraad5(a, 'r1bq3r/ppppk1pp/2n5/4p2B/1b6/3PPN2/PPPn1PPP/R2QK2R w');
    zet(a, 'd1c1');
    await wacht(5000);
    check('de zin (' + onder5(a) + ')', /^Turbo speelt Paard d2 → b3.*\. Er is een betere zet om je paard te redden\. Probeer nog een zet\.$/.test(onder5(a)));
  });

  /* De Beste Zet: de lijnen worden op een kopie van de stelling uitgerekend; een snel antwoord zet een andere zet op
     het bord, en een timer mag daar niet op rekenen */
  for (const [wat, fen, zetten, beste, fout] of [
    ['een fout antwoord in de eerste halve seconde', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['f3e5', 'b1c3', 'a2a3'], 1, 0],
    ['een rokade als fout antwoord in de eerste halve seconde', 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', ['e1g1', 'c2c3', 'd2d3'], 1, 0]]) {
    await regel('[5.9] De Beste Zet, ' + wat + ': de lijnen en het bord blijven die van de opdracht', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      const opzet = 'var S = parseFEN(' + JSON.stringify(fen) + '); var opts = ' + JSON.stringify(zetten) + '.map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });';
      a.ev('(function () { ' + opzet + ' session.task = { S: S, options: opts, best: opts[' + beste + '] }; session.S = S; session.phase = "choose"; session.tries = 0;' +
        ' session.picked = null; session.keuzeOpen = true; renderBoard(); lijnenLater(session.task); pickOption(' + fout + '); best3Confirm(); })()');
      await wacht(8000);
      check('het bord is weer de stelling van de opdracht (' + a.get('toFEN(session.S)') + ')', a.get('toFEN(session.S)') === a.get('toFEN(parseFEN(' + JSON.stringify(fen) + '))'));
      const lijnen = a.get('JSON.stringify(session.task.options.map(function (o) { return o.lijn; }))');
      const schoon = a.get('(function () { ' + opzet + ' var t = { S: S, options: opts, best: opts[' + beste + '] }; return JSON.stringify(opts.map(function (o) { return lijnVerlies(t, o); })); })()');
      check('de lijnen zijn die van een schoon bord (' + lijnen + ' tegen ' + schoon + ')', lijnen === schoon);
    });
  }

  /* De Beste Zet, na een foute keuze: jouw keuze en Turbo's antwoord blijven als pijlen staan zolang de zin erover staat;
     heeft Turbo geen antwoord dat het laten zien waard is, dan zegt de zin niet "kijk wat Turbo dan doet" */
  await regel('[5.5] De Beste Zet, een foute keuze: de zin zegt "kijk wat Turbo dan doet" en het bord laat jouw keuze en Turbo\'s antwoord zien', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('(function () { var S = parseFEN("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");' +
      ' var opts = ["f3e5", "b1c3", "a2a3"].map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });' +
      ' session.task = { S: S, options: opts, best: opts[1] }; session.S = S; session.phase = "choose"; session.tries = 0; session.picked = null; session.keuzeOpen = true; renderBoard();' +
      ' pickOption(0); best3Confirm(); })()');
    await wacht(6000);
    check('de zin (' + strook5(a) + ')', strook5(a) === 'Niet de beste: kijk wat Turbo dan doet. Kies een andere.');
    check('jouw keuze in geel en Turbo\'s slag in koraal', a.get('BD.arrows.length === 2 && BD.arrows[0].cls === "a-sun" && moveKey(BD.arrows[0]) === "f3e5" && BD.arrows[1].cls === "a-coral" && moveKey(BD.arrows[1]) === "c6e5"'));
  });
  await regel('[5.5] De Beste Zet, een foute keuze waarop Turbo niets laat zien: "Niet de beste. Kies een andere." en alleen jouw keuze', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'best3');
    a.ev('(function () { var S = parseFEN("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");' +
      ' var opts = ["f3e5", "b1c3", "a2a3"].map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });' +
      ' session.task = { S: S, options: opts, best: opts[1] }; session.S = S; session.phase = "choose"; session.tries = 0; session.picked = null; session.keuzeOpen = true; renderBoard();' +
      ' pickOption(2); best3Confirm(); })()');
    await wacht(6000);
    check('de zin (' + strook5(a) + ')', strook5(a) === 'Niet de beste. Kies een andere.');
    check('alleen jouw keuze in geel', a.get('BD.arrows.length === 1 && BD.arrows[0].cls === "a-sun" && moveKey(BD.arrows[0]) === "a2a3"'));
  });
  /* Turbo's antwoord is het laten zien waard als het slaat, ook als de ruil gelijk opgaat, en als het schaak geeft, ook als
     dat niets kost */
  for (const [wat, fen, zetten, antwoord] of [
    ['een slag in een gelijke ruil', 'rnb2k1r/1pppqpp1/p2bp2p/4Nn2/3PN3/3BP3/PPP1QPPP/R1B2RK1 w - - 0 11', ['e4d6', 'e2f3', 'a2a3'], 'c7d6'],
    ['een schaak dat niets kost', 'r1b1kbnr/ppp2ppp/8/4p3/3qp3/3P3N/PPP2PPP/R1BQKB1R w KQkq - 0 7', ['c1e3', 'c2c3', 'a2a3'], 'f8b4']]) {
    await regel('[5.5] De Beste Zet, een foute keuze waarop Turbo antwoordt met ' + wat + ': "kijk wat Turbo dan doet" en beide pijlen', async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      a.ev('(function () { var S = parseFEN(' + JSON.stringify(fen) + ');' +
        ' var opts = ' + JSON.stringify(zetten) + '.map(function (k) { return { m: legalMoves(S).find(function (x) { return moveKey(x) === k; }), deep: 0 }; });' +
        ' session.task = { S: S, options: opts, best: opts[1] }; session.S = S; session.phase = "choose"; session.tries = 0; session.picked = null; session.keuzeOpen = true; renderBoard();' +
        ' pickOption(0); best3Confirm(); })()');
      await wacht(6000);
      check('de zin (' + strook5(a) + ')', strook5(a) === 'Niet de beste: kijk wat Turbo dan doet. Kies een andere.');
      check('jouw keuze in geel en Turbo\'s antwoord ' + antwoord + ' in koraal', a.get('BD.arrows.length === 2 && BD.arrows[0].cls === "a-sun" && moveKey(BD.arrows[0]) === ' + JSON.stringify(zetten[0]) +
        ' && BD.arrows[1].cls === "a-coral" && moveKey(BD.arrows[1]) === ' + JSON.stringify(antwoord)));
    });
  }

  /* De regel over herhaling wordt gevraagd op de beurt van het kind en gaat dan voor alles wat de strook anders zou zeggen.
     Hij telt alleen als gezegd als hij op de beurt van het kind stond; staat er sinds de tweede keer een stelling die nog
     terug kan komen en stond de regel er sindsdien niet op een beurt van het kind, dan is hij beloofd. */
  const HERHAAL_SCHULD5 = 'Een stelling stond er net voor de tweede keer. De derde keer is het remise. Liever niet? Speel anders.';
  const geenHerhaling5 = function (z) { return z !== HERHAAL_SCHULD5 && z !== HERHAAL_ZIN5; };
  const turboVolgt5 = function (turbo, echt) {
    return function (S) { const k = turbo[S.hist.length]; return legalMoves(S).find(function (m) { return moveKey(m) === k; }) || echt(S, 2); };
  };
  async function potjeVanaf5(fen) {
    const a = nieuwKind();
    await startPotje(a, 2);
    a.ev('session.S = parseFEN(' + JSON.stringify(fen) + '); BD.mode = "off"; renderBoard(); if (session.S.turn === "b") turboTurn(); else { BD.mode = "move"; renderBoard(); }');
    await wacht(3000);
    return a;
  }

  /* zet Turbo een stelling voor de tweede keer neer terwijl hij schaak geeft of een truc doet, dan gaat de regel over het
     bord voor; daarna komt hij niet nog eens */
  for (const [wat, fen, turbo, kind, na] of [
    ['met schaak', '3q2k1/8/8/P7/8/8/8/6K1 b - - 0 30', { 0: 'd8d4', 2: 'd4d5', 4: 'd5d4', 6: 'd4d5' }, ['g1h1', 'h1g1', 'g1f1'], null],
    ['met schaak, en zijn volgende zet is weer schaak', '3q2k1/8/8/P7/8/8/8/6K1 b - - 0 30', { 0: 'd8d4', 2: 'd4d5', 4: 'd5d4', 6: 'd4d3' }, ['g1h1', 'h1g1', 'g1f1'], 'Je staat schaak! Red je koning! 👑'],
    ['met een truc', '7k/8/8/8/6n1/8/8/3Q1RK1 b - - 0 30', { 0: 'g4e3', 2: 'e3g4', 4: 'g4e3', 6: 'e3c4' }, ['g1h2', 'h2g1', 'g1h1'], null]]) {
    await regel('[5.6] Turbo zet een stelling voor de tweede keer neer ' + wat + ': de regel over het bord gaat voor, en daarna komt hij niet nog eens', async function (check) {
      const echt = pickMove;
      pickMove = turboVolgt5(turbo, echt);
      try {
        const a = await potjeVanaf5(fen);
        const stroken = [];
        let koning = false;
        for (let i = 0; i < kind.length; i++) {
          zet(a, kind[i]);
          stroken.push(strook5(a));
          await wacht(3000);
          stroken.push(strook5(a));
          if (i === 1) koning = !a.get('inCheck(session.S)') || a.get('BD.check === session.S.kings.w');
        }
        check('bij de tweede keer de regel over het bord (' + stroken[3] + '), en een schaak blijft op het bord', stroken[3] === HERHAAL_ZIN5 && koning);
        check('na de volgende zet van het kind (' + stroken[4] + ') en van Turbo (' + stroken[5] + ') niet nog eens',
          geenHerhaling5(stroken[4]) && geenHerhaling5(stroken[5]) && (!na || stroken[5] === na));
      } finally { pickMove = echt; }
    });
  }

  /* zet het kind de tweede keer neer, dan stond de regel er op de beurt van Turbo: hij telt niet als gezegd. Op de
     volgende beurt van het kind is hij beloofd en blijft staan tot het kind zet, ook voor de lof of de waarschuwing voor
     een truc; na een slag of een pionzet van Turbo kan de stelling niet meer terugkomen, en dan is er niets */
  await regel('[5.6] had de lof voor een truc van het kind de strook toen het een stelling voor de tweede keer neerzette: na Turbo\'s volgende zet de beloofde regel', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 1: 'h8g8', 3: 'g8h8', 5: 'd8d7' }, echt);
    try {
      const a = await potjeVanaf5('3q1r1k/8/8/6N1/8/8/8/6K1 w - - 0 30');
      const stroken = [];
      for (const k of ['g5e6', 'e6g5', 'g5e6']) { zet(a, k); stroken.push(strook5(a)); await wacht(3000); stroken.push(strook5(a)); }
      check('testopzet: de lof voor de truc stond in de strook bij de tweede keer', /^Dat is een VORK/.test(stroken[4] || ''));
      check('na Turbo\'s volgende zet de regel (' + stroken[5] + ')', stroken[5] === HERHAAL_SCHULD5);
    } finally { pickMove = echt; }
  });
  for (const [wat, turbo, zin] of [['een rustige zet', 'd2d3', true], ['een slag', 'd2h2', false], ['een pionzet', 'a7a6', false]]) {
    await regel('[5.6] het kind zet een stelling voor de tweede keer neer en Turbo antwoordt met ' + wat + ': ' + (zin ? 'op de beurt van het kind de beloofde regel, tot het kind zet' : 'geen regel'), async function (check) {
      const echt = pickMove;
      pickMove = turboVolgt5({ 1: 'h8g8', 3: 'g8h8', 5: turbo }, echt);
      try {
        const a = await potjeVanaf5('7k/p7/8/8/8/8/3r3P/1R4K1 w - - 0 1');
        for (const k of ['b1a1', 'a1b1']) { zet(a, k); await wacht(3000); }
        check('testopzet: de regel over het bord op de beurt van het kind (' + strook5(a) + ')', a.get('session.S.hist.length') === 4 && strook5(a) === HERHAAL_ZIN5);
        zet(a, 'b1a1');
        check('na de eigen zet van het kind de regel over het bord (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
        await wacht(3000);
        check('testopzet: Turbo speelde ' + turbo, a.get('session.S.hist.length') === 6 && a.get('moveKey(session.S.hist[5].m)') === turbo);
        if (zin) {
          check('de beloofde regel (' + strook5(a) + ')', strook5(a) === HERHAAL_SCHULD5);
          await wacht(30000);
          check('hij blijft staan tot het kind zet (' + strook5(a) + ')', strook5(a) === HERHAAL_SCHULD5);
        } else check('geen regel over herhaling (' + strook5(a) + ')', geenHerhaling5(strook5(a)));
      } finally { pickMove = echt; }
    });
  }
  await regel('[5.6] de beloofde regel na de eigen zet van het kind gaat voor de waarschuwing voor een truc van Turbo', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 1: 'h8g8', 3: 'g8h8', 5: 'd4c2' }, echt);
    try {
      const a = await potjeVanaf5('7k/8/8/8/3n4/8/8/1R2Q1K1 w - - 0 1');
      for (const k of ['b1a1', 'a1b1', 'b1a1']) { zet(a, k); await wacht(3000); }
      check('testopzet: Turbo\'s Pd4-c2 is een truc', a.get('session.S.hist.length') === 6 &&
        !!a.get('(function () { var S = session.S, u = S.hist[S.hist.length - 1]; unmakeMove(S); var c = patternCallout(S, u.m); makeMove(S, u.m); return c && c.key; })()'));
      check('de beloofde regel (' + strook5(a) + ')', strook5(a) === HERHAAL_SCHULD5);
    } finally { pickMove = echt; }
  });

  /* vanaf de beginstelling, zodat het bewaarde potje terugkomt: de beloofde regel blijft over een herlading op die beurt,
     komt daarna niet nog eens, en het bewaarde getal ligt nooit voorbij het potje */
  await regel('[5.6] de beloofde regel na de eigen zet van het kind blijft over een herlading, komt één keer, en het bewaarde getal ligt nooit voorbij het potje', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 1: 'g8f6', 3: 'f6g8', 5: 'b8c6', 7: 'c6b8' }, echt);
    try {
      let a = nieuwKind();
      await startPotje(a, 2);
      for (const k of ['g1f3', 'f3g1', 'g1f3']) { zet(a, k); await wacht(3000); }
      check('de beloofde regel (' + strook5(a) + ')', a.get('session.S.hist.length') === 6 && strook5(a) === HERHAAL_SCHULD5);
      a = herlaad(a);
      await wacht(1000);
      a.tik('verderKaart');
      await wacht(1500);
      check('na een herlading op die beurt staat hij er weer (' + strook5(a) + ')', a.get('!!session && session.S.hist.length === 6') && strook5(a) === HERHAAL_SCHULD5);
      zet(a, 'b1c3');
      await wacht(3000);
      check('na de volgende zetten niet nog eens (' + strook5(a) + ')', a.get('session.S.hist.length') === 8 && geenHerhaling5(strook5(a)));
      check('het potje bewaart bij welke halve zet de regel er stond', JSON.parse(a.opslag.getItem(POTJE)).games[2].herhaalGezegd === 6);
      for (let i = 0; i < 2; i++) { tikTekst(a, 'Zet terug'); await wacht(); }
      const terug = JSON.parse(a.opslag.getItem(POTJE)).games[2];
      check('na Zet terug ligt het getal nooit voorbij het potje (' + terug.herhaalGezegd + ' bij ' + terug.moves.length + ' halve zetten)', terug.moves.length === 4 && terug.herhaalGezegd === 4);
    } finally { pickMove = echt; }
  });

  /* dat de regel er op deze beurt stond, gaat meteen met het potje mee: wie de app sluit zodra hij er staat, vindt bij het
     openen het getal van deze beurt en dezelfde regel */
  await regel('[5.6] de regel over herhaling wordt meteen met het potje bewaard: wie de app sluit zodra hij er staat, vindt hem terug als gezegd op die beurt', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 1: 'g8f6', 3: 'f6g8' }, echt);
    try {
      let a = nieuwKind();
      await startPotje(a, 2);
      for (const k of ['g1f3', 'f3g1']) { zet(a, k); await wacht(3000); }
      check('testopzet: de regel over het bord bij halve zet 4 (' + strook5(a) + ')', a.get('session.S.hist.length') === 4 && strook5(a) === HERHAAL_ZIN5);
      const bewaard = JSON.parse(a.opslag.getItem(POTJE)).games[2];
      check('het bewaarde potje heeft meteen het getal van deze beurt (' + JSON.stringify(bewaard.herhaalGezegd) + ')', bewaard.herhaalGezegd === 4);
      a = herlaad(a);
      await wacht(1000);
      a.tik('verderKaart');
      await wacht(1500);
      check('na het openen staat dezelfde regel er (' + strook5(a) + ')', a.get('session.S.hist.length') === 4 && strook5(a) === HERHAAL_ZIN5);
      check('en het getal is nog dat van deze beurt', JSON.parse(a.opslag.getItem(POTJE)).games[2].herhaalGezegd === 4);
    } finally { pickMove = echt; }
  });

  /* de reeks met schaak bij de tweede keer, vanaf de beginstelling: de regel over het bord staat er op die beurt, ook na een
     herlading, en de derde keer is remise */
  const HERHAAL_R = { 1: 'e7e6', 3: 'd8g5', 5: 'g5a5', 7: 'a5b6', 9: 'b6a5', 11: 'a5a6', 13: 'a6a5' };
  for (const herladen of [false, true]) {
    await regel('[5.6] Turbo zet de tweede keer neer met schaak' + (herladen ? ' en de app herlaadt op die beurt' : '') + ': de regel over het bord staat er, niet nog eens na de volgende zetten, en de derde keer is remise', async function (check) {
      const echt = pickMove;
      pickMove = function (S) { const k = HERHAAL_R[S.hist.length]; return legalMoves(S).find(function (m) { return moveKey(m) === k; }) || echt.apply(null, arguments); };
      try {
        let a = nieuwKind();
        await startPotje(a, 2);
        for (const k of ['d2d4', 'e1d2', 'd2e1', 'c1d2', 'd2c1']) { zet(a, k); await wacht(3000); }
        check('de tweede keer, met het kind in schaak: de regel over het bord (' + strook5(a) + ')', a.get('session.S.hist.length') === 10 && a.get('inCheck(session.S)') && strook5(a) === HERHAAL_ZIN5);
        if (herladen) {
          a = herlaad(a);
          await wacht(1000);
          a.tik('verderKaart');
          await wacht(1500);
          check('na een herlading op die beurt staat hij er weer (' + strook5(a) + ')', a.get('!!session && session.kind === "game" && session.S.hist.length === 10') && strook5(a) === HERHAAL_ZIN5);
        }
        zet(a, 'b1c3');
        const naKind = strook5(a);
        await wacht(3000);
        check('na de zet van het kind (' + naKind + ') en van Turbo (' + strook5(a) + ') niet nog eens', geenHerhaling5(naKind) && geenHerhaling5(strook5(a)));
        zet(a, 'c3b1');
        await wacht(3000);
        check('de derde keer is remise', a.get('session.over') === true && norm5(tekstVan(a, 'eindkaart')).indexOf('Remise: drie keer dezelfde stelling.') >= 0);
      } finally { pickMove = echt; }
    });
  }

  /* geeft Turbo elke zet schaak, dan staat de regel er toch voor de derde keer, en het schaak blijft op het bord */
  await regel('[5.6] Turbo geeft elke zet schaak: de regel staat in de strook voor de derde keer, en het schaak blijft op het bord', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 0: 'd8d4', 2: 'd4d5', 4: 'd5d4', 6: 'd4d3', 8: 'd3d4' }, echt);
    try {
      const a = await potjeVanaf5('3q2k1/8/8/P7/8/8/8/6K1 b - - 0 30');
      const gelezen = [];
      for (const k of ['g1h1', 'h1g1', 'g1f1', 'f1g1']) {
        zet(a, k);
        await wacht(3000);
        if (a.get('session.over')) break;
        gelezen.push(strook5(a));
        if (a.get('session.S.hist.length') === 5) {
          check('bij de tweede keer de regel (' + strook5(a) + ')', strook5(a) === HERHAAL_ZIN5);
          check('het schaak blijft op het bord: het veld van de koning is gemarkeerd', a.get('inCheck(session.S) && BD.check === session.S.kings.w') &&
            a.get('/\\bcheck\\b/.test(cellEls[session.S.kings.w].className)'));
        }
      }
      check('de derde keer is remise', a.get('session.over') === true && norm5(tekstVan(a, 'eindkaart')).indexOf('Remise: drie keer dezelfde stelling.') >= 0);
      check('de regel stond in de strook voor het remise (' + gelezen.join(' / ') + ')', gelezen.indexOf(HERHAAL_ZIN5) >= 0);
    } finally { pickMove = echt; }
  });

  /* na Zet terug en een herlading: staat er in het potje zoals het nu is geen stelling twee keer, dan zegt de strook niets
     over herhaling, ook niet als het bewaarde getal nu precies de lengte van het potje is */
  await regel('[5.6] de regel stond er, dan twee keer Zet terug en een herlading: geen regel over herhaling', async function (check) {
    const echt = pickMove;
    pickMove = function (S) { const k = HERHAAL_R[S.hist.length]; return legalMoves(S).find(function (m) { return moveKey(m) === k; }) || echt.apply(null, arguments); };
    try {
      let a = nieuwKind();
      await startPotje(a, 2);
      for (const k of ['d2d4', 'e1d2', 'd2e1', 'c1d2', 'd2c1']) { zet(a, k); await wacht(3000); }
      check('testopzet: de regel staat er (' + strook5(a) + ')', a.get('session.S.hist.length') === 10 && strook5(a) === HERHAAL_ZIN5);
      zet(a, 'b1c3');
      await wacht(3000);
      for (let i = 0; i < 2; i++) { tikTekst(a, 'Zet terug'); await wacht(); }
      check('testopzet: acht halve zetten, en geen stelling staat er twee keer', a.get('session.S.hist.length') === 8 && a.get('repetitions(session.S)') === 0);
      a = herlaad(a);
      await wacht(1000);
      a.tik('verderKaart');
      await wacht(1500);
      check('testopzet: het potje is terug', a.get('!!session && session.kind === "game" && session.S.hist.length === 8'));
      check('geen regel over herhaling (' + strook5(a) + ')', geenHerhaling5(strook5(a)));
    } finally { pickMove = echt; }
  });

  /* Zet terug neemt de tweede keer mee: staat er in het potje zoals het nu is geen stelling twee keer, dan is er niets */
  await regel('[5.6] Zet terug neemt de tweede keer terug: daarna zegt de strook niets over herhaling', async function (check) {
    const echt = pickMove;
    pickMove = turboVolgt5({ 0: 'd8d4', 2: 'd4d5', 4: 'd5d4' }, echt);
    try {
      const a = await potjeVanaf5('3q2k1/8/8/P7/8/8/8/6K1 b - - 0 30');
      for (const k of ['g1h1', 'h1g1']) { zet(a, k); await wacht(3000); }
      check('testopzet: de tweede keer (' + strook5(a) + ')', a.get('repetitions(session.S)') === 1 && strook5(a) === HERHAAL_ZIN5);
      tikTekst(a, 'Zet terug');
      await wacht();
      check('testopzet: twee halve zetten terug', a.get('session.S.hist.length') === 3);
      zet(a, 'h1h2');
      const naKind = strook5(a);
      await wacht(3000);
      check('testopzet: Turbo zette', a.get('session.S.hist.length') === 5);
      check('geen regel over herhaling na de zet van het kind (' + naKind + ') en na die van Turbo (' + strook5(a) + ')', geenHerhaling5(naKind) && geenHerhaling5(strook5(a)));
    } finally { pickMove = echt; }
  });

  /* een bewaard potje met een stelling die er al twee keer stond: wat het potje onthoudt, beslist of de regel nog komt;
     een potje zonder dat getal (van een eerdere versie) of met een getal voorbij zijn lengte krijgt de regel */
  for (const [wat, extra, zin] of [['zonder het getal, van een eerdere versie', {}, true], ['met het getal van een eerdere beurt van het kind sinds de tweede keer', { herhaalGezegd: 5 }, false],
    ['met een getal voorbij het potje', { herhaalGezegd: 99 }, true],
    ['met het getal van deze beurt: de regel stond er al, en het kind zette nog niet', { herhaalGezegd: 6 }, true]]) {
    await regel('[5.6] een bewaard potje ' + wat + ': ' + (zin ? 'terug in het potje staat de beloofde regel in de strook' : 'geen regel, maar het welkom'), async function (check) {
      const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e3', 'b8c6', 'g1f3', 'c6b8', 'f3g1', 'g8f6'], extra) });
      a.tik('verderKaart');
      await wacht(1500);
      check('testopzet: het potje is terug en het kind is aan zet', a.get('!!session && session.kind === "game" && session.S.hist.length === 6 && session.S.turn === "w"'));
      check('de strook (' + strook5(a) + ')', zin ? strook5(a) === HERHAAL_SCHULD5 : /^Welkom terug!/.test(strook5(a)));
    });
  }
  /* terug in het potje: staat het bord zelf er voor de tweede keer, dan de regel over het bord */
  await regel('[5.6] een bewaard potje met een eerdere tweede keer en het bord nu ook voor de tweede keer: terug in het potje de regel over het bord', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, HERHAAL_KIND) });
    a.tik('verderKaart');
    await wacht(1500);
    check('de strook (' + strook5(a) + ')', a.get('session.S.hist.length') === 8 && strook5(a) === HERHAAL_ZIN5);
  });
  await regel('[5.6] een bewaard potje met een beloofde regel waarin het kind schaak staat: terug in het potje gaat de beloofde regel voor, en het schaak blijft op het bord', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['f2f3', 'e7e6', 'g1h3', 'g8h6', 'h3g1', 'h6g8', 'g1h3', 'd8h4']) });
    a.tik('verderKaart');
    await wacht(1500);
    check('testopzet: het potje is terug en het kind staat schaak', a.get('!!session && session.S.hist.length === 8 && inCheck(session.S)'));
    check('de strook (' + strook5(a) + ')', strook5(a) === HERHAAL_SCHULD5);
    check('het veld van de koning is gemarkeerd', a.get('BD.check === session.S.kings.w'));
  });
  await regel('[5.6] een bewaard potje waarvan alleen de stelling van nu er voor de tweede keer staat: terug in het potje staat de regel over het bord', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['g1f3', 'g8f6', 'f3g1', 'f6g8']) });
    a.tik('verderKaart');
    await wacht(1500);
    check('de strook (' + strook5(a) + ')', a.get('session.S.hist.length') === 4 && strook5(a) === HERHAAL_ZIN5);
  });

  /* wat bij een stelling hoort, gaat weg als de stelling verandert: het licht van "Ik kijk nog even" staat op het stuk dat
     het alarm noemt, en gaat uit bij Zet terug, bij een nieuw alarm en na een herlading */
  async function alarmPotje5(niveau) {
    const a = nieuwKind({ opslag: opslagMetPotje(niveau, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f3e5', 'a7a6']) });
    a.ev('setPref("guard", true)');
    a.tik('verderKaart');
    await wacht();
    zet(a, 'd2d3');
    await wacht(500);
    return a;
  }
  const opgelicht5 = function (a) { return a.get('Array.from(BD.glow).map(alg).sort().join(",")'); };
  for (const niveau of [1, 2]) {
    await regel('[5.4] niveau ' + niveau + ': "Ik kijk nog even" licht het stuk op dat het alarm noemt, ook als het kind een ander stuk zette, en Zet terug doet het licht uit', async function (check) {
      const a = await alarmPotje5(niveau);
      check('testopzet: het alarm noemt het paard op e5 (' + a.scherm().slice(0, 80) + ')', a.open() && a.ziet('Na deze zet kan Turbo je paard op e5 pakken.'));
      a.tik('gLook');
      check('opgelicht: het paard op e5, niet de pion die het kind zette (' + opgelicht5(a) + ')', opgelicht5(a) === 'e5');
      tikTekst(a, 'Zet terug');
      await wacht(500);
      check('testopzet: twee halve zetten terug', a.get('session.S.hist.length') === 4);
      check('na Zet terug is niets opgelicht (' + opgelicht5(a) + ')', opgelicht5(a) === '' &&
        !a.get('Object.keys(cellEls).some(function (k) { return cellEls[k] && /hero-pc/.test(cellEls[k].className); })'));
    });
  }
  await regel('[5.4] na een herlading is niets opgelicht van een alarm van voor de herlading', async function (check) {
    let a = await alarmPotje5(2);
    a.tik('gLook');
    check('testopzet: e5 is opgelicht', opgelicht5(a) === 'e5');
    a = herlaad(a);
    await wacht();
    a.tik('verderKaart');
    await wacht();
    check('na een herlading is niets opgelicht (' + opgelicht5(a) + ')', a.get('!!session && session.kind === "game"') && opgelicht5(a) === '');
  });
  await regel('[5.4] een nieuw alarm doet het licht van het vorige uit', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 2);
    a.ev('session.S = parseFEN("6k1/8/1p2n3/8/8/1N6/8/3Q2K1 w - - 0 1"); BD.mode = "move"; renderBoard()');
    zet(a, 'd1d4');
    await wacht(500);
    check('testopzet: het eerste alarm noemt de dame (' + a.scherm().slice(0, 80) + ')', a.open() && a.ziet('Na deze zet kan Turbo je dame op d4 pakken.'));
    a.tik('gLook');
    check('testopzet: d1 is opgelicht', opgelicht5(a) === 'd1');
    zet(a, 'b3c5');
    await wacht(500);
    check('testopzet: het tweede alarm noemt het paard (' + a.scherm().slice(0, 80) + ')', a.open() && a.ziet('Na deze zet kan Turbo je paard op c5 pakken.'));
    a.tik('gLook');
    check('alleen het stuk van het tweede alarm is opgelicht (' + opgelicht5(a) + ')', opgelicht5(a) === 'b3');
  });

  /* Turbo's zin bij een slag: terugpakken is alleen slaan op het veld waar het kind net sloeg, een dame uit een promotie
     telt als de pion die ze was, en een kind dat al sterk is hoort niet dat het kan terugpakken */
  for (const [wat, fen, kind, turbo, zin, sterk] of [
    ['Turbo slaat ergens anders na een slag van het kind', '6k1/8/4p3/3n4/8/b1N5/1R6/6K1 w - - 0 1', 'c3d5', 'a3b2', 'Ik pak je toren op b2 (5 punten). Niemand kan terugpakken.', false],
    ['Turbo pakt een dame terug die net uit een promotie kwam', '3r1rk1/2P5/8/8/8/8/8/6K1 w - - 0 1', 'c7d8q', 'f8d8', 'Ik pak terug op d8: jij nam mijn toren, ik jouw dame. Winst voor jou: 4 punten.', false],
    ['een kind dat al sterk is, tegen Turbo, en het kan terugpakken', '6k1/8/8/3n4/8/8/5P2/3N2K1 w - - 0 1', 'd1e3', 'd5e3', 'Ik pak je paard op e3 (3 punten).', true]]) {
    await regel('[5.8] ' + wat + ': "' + zin + '"', async function (check) {
      const echt = pickMove;
      pickMove = function (S) { return legalMoves(S).find(function (m) { return moveKey(m) === turbo; }) || echt(S, 2); };
      try {
        const a = nieuwKind();
        if (sterk) a.ev('setPref("start", "sterk")');
        await startPotje(a, 2);
        a.ev('session.S = parseFEN(' + JSON.stringify(fen) + '); BD.mode = "move"; renderBoard()');
        zet(a, kind);
        await wacht(3000);
        check('testopzet: Turbo speelde ' + turbo, a.get('moveKey(session.S.hist[session.S.hist.length - 1].m)') === turbo);
        check('de strook (' + strook5(a) + ')', strook5(a) === zin);
      } finally { pickMove = echt; }
    });
  }

  /* na een verkeerde voorspelling zonder zin van Turbo blijft "Goede gok" niet staan: het kind hoort wat het nu kan doen */
  await regel('[5.11] een verkeerde voorspelling en Turbo heeft geen zin: daarna staat "Goede gok!" niet meer in de strook', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    a.ev('session.S = parseFEN("r1bqkbnr/pppppppp/2n5/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2"); BD.mode = "off"; renderBoard();' +
      ' askPredict(legalMoves(session.S).find(function (m) { return moveKey(m) === "g8f6"; }))');
    tikVeld(a, a.get('sqFromAlg("a7")'));
    await wacht(3000);
    check('testopzet: de voorspelling was fout en Turbo speelde Pg8-f6', a.get('P.c.predictHits || 0') === 0 &&
      a.get('moveKey(session.S.hist[session.S.hist.length - 1].m)') === 'g8f6' && a.get('BD.mode') === 'move');
    check('daarna niet meer "Goede gok!" (' + strook5(a) + ')', !/Goede gok/.test(strook5(a)));
  });

  /* Koning ontsnapt: "gaat wel verloren" alleen bij een verlies van twee en een half punt of meer, niet bij een pion */
  await regel('[5.5] Koning ontsnapt: een redding die een pion kost, zegt niet dat er iets verloren gaat', async function (check) {
    const a = nieuwKind();
    const r = a.get('(function () { var S = parseFEN("r4rk1/2p3pp/2p1p3/p1P5/2N1p1q1/2R1Q3/6PP/5K1R w - - 0 1"); return koningRedenen(S, { type: "schaak" }, legalMoves(S).find(function (x) { return moveKey(x) === "f1e1"; })); })()');
    check('de redenen (' + r.join(' / ') + ')', r.length > 0 && !r.some(function (z) { return /gaat wel verloren/.test(z); }));
  });

  /* Turbo pakt terug op het veld waar het kind net sloeg: de zin noemt de ruil van twee kanten */
  for (const [wat, fen, kind, turbo, zin] of [
    ['een eerlijke ruil', '6k1/8/4p3/3n4/8/2N5/8/6K1 w - - 0 1', 'c3d5', 'e6d5', 'Ik pak terug op d5: jij nam mijn paard, ik jouw paard. Een eerlijke ruil.'],
    ['winst voor het kind', '6k1/8/4p3/3r4/8/2N5/8/6K1 w - - 0 1', 'c3d5', 'e6d5', 'Ik pak terug op d5: jij nam mijn toren, ik jouw paard. Winst voor jou: 2 punten.'],
    ['verlies voor het kind', '6k1/8/4p3/3p4/8/2N5/8/6K1 w - - 0 1', 'c3d5', 'e6d5', 'Ik pak terug op d5: jij nam mijn pion, ik jouw paard. Dat kost jou 2 punten.'],
    ['het kind kan opnieuw slaan', '6k1/8/4p3/3n4/8/2N5/8/3R2K1 w - - 0 1', 'c3d5', 'e6d5', 'Ik pak terug op d5: jij nam mijn paard, ik jouw paard. Pak je terug, dan krijg je maar 1 punt.']]) {
    await regel('[5.8] Turbo pakt terug, ' + wat + ': "' + zin + '"', async function (check) {
      const echt = pickMove;
      pickMove = function (S) { return legalMoves(S).find(function (m) { return moveKey(m) === turbo; }) || echt(S, 2); };
      try {
        const a = nieuwKind();
        await startPotje(a, 2);
        a.ev('session.S = parseFEN(' + JSON.stringify(fen) + '); BD.mode = "move"; renderBoard()');
        zet(a, kind);
        await wacht(3000);
        check('de strook (' + strook5(a) + ')', strook5(a) === zin);
      } finally { pickMove = echt; }
    });
  }

  /* Koning ontsnapt: kost elke redding een stuk, dan zegt de kaart dat de koning toch veilig is */
  await regel('[5.5] Koning ontsnapt: een redding die een stuk kost: "Je toren op a1 gaat wel verloren, maar je koning is veilig."', async function (check) {
    const a = nieuwKind();
    const fen = 'N1bk3r/p2p2pp/5q2/1B2b3/2pnP3/2N5/PPn2PPP/R1BQK2R w - - 0 1';
    const r = a.get('(function () { var S = parseFEN(' + JSON.stringify(fen) + '); return koningRedenen(S, { type: "schaak" }, legalMoves(S).find(function (x) { return moveKey(x) === "e1f1"; })); })()');
    check('de redenen (' + r.join(' / ') + ')', r.indexOf('Je toren op a1 gaat wel verloren, maar je koning is veilig.') >= 0);
    const g = a.get('(function () { var S = parseFEN("r2qk2r/pp1nnppp/8/3p1b2/1p1K4/5N1P/PBP1PPP1/R2Q1B1R w - - 1 1"); return koningRedenen(S, { type: "mat1" }, legalMoves(S).find(function (x) { return moveKey(x) === "d4e3"; })); })()');
    check('een redding die niets kost, zegt het niet (' + g.join(' / ') + ')', !g.some(function (z) { return /gaat wel verloren/.test(z); }));
  });

  /* de lof aan het eind van een rondje past bij elke oefening */
  await regel('[5.5] een rondje met twaalf sterren of meer: "Wauw! Wat heb jij goed gekeken!"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    a.ev('session.earned = 13; drillSummary()');
    await wacht(500);
    check('de kaart (' + a.scherm().slice(0, 90) + ')', a.ziet('Wauw! Wat heb jij goed gekeken!') && !/speurogen/i.test(a.scherm()));
  });

  /* het paard is "het", ook in de openingslessen */
  await regel('[5.5] de openingslessen noemen een paard "het", nooit "hij"', async function (check) {
    const a = nieuwKind();
    const fout = a.get('JSON.stringify(PADEN).match(/[^"]*[Pp]aard[^".]*\\bhij\\b[^"]*/g) || []');
    check('geen "hij" voor een paard (' + fout.join(' / ') + ')', fout.length === 0);
  });

  /* "Pas op" van de openingscoach heeft dezelfde grens aan posities als het alarm */
  await regel('[5.4] "Pas op" van de openingscoach heeft de grens van het alarm', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    const t = a.get('(function () { session.movedTo = new Set(); session.kidMoves = 9; var S = parseFEN("1nb1kb1r/r2p3p/5p1n/pP2pPp1/PPpPq2P/N5P1/1B2N2R/1R1QKB2 w - - 0 1");' +
      ' return coachEval(S, legalMoves(S).find(function (x) { return moveKey(x) === "h2h1"; })).msg; })()');
    check('geen "Pas op" als de grens op is (' + t + ')', !/Pas op/.test(t || ''));
  });

  /* een valstrik zonder reden komt niet op het bord: de app probeert een paar opdrachten tot er een met een reden is */
  await regel('[5.5] Veilig of valstrik: na drie valstrikken zonder reden komt de vierde, met een reden, op het bord', async function (check) {
    const echt = genSafeTask;
    let n = 0;
    genSafeTask = function () {
      n++;
      const S = parseFEN(n < 4 ? '6k1/8/8/8/8/8/5PPP/R5K1 w - - 0 1' : 'rn1qkb1r/ppp2ppp/4pn2/3p4/4P1b1/2NB1N2/PPPP1PPP/R1BQK2R w KQkq - 0 1');
      const m = legalMoves(S).find(function (x) { return moveKey(x) === (n < 4 ? 'a1a2' : 'f3g5'); });
      makeMove(S, m); const p = legalMoves(S).find(function (x) { return moveKey(x) === (n < 4 ? 'g8f8' : 'g4d1'); }); unmakeMove(S);
      return { S: S, move: m, punish: p, trap: true, mate: false, loss: 600 };
    };
    try {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      n = 0;
      const gelukt = a.get('buildSafe()');
      check('de vierde opdracht staat er (' + n + ' geprobeerd)', gelukt === true && n === 4 && a.get('moveKey(session.task.move)') === 'f3g5');
    } finally { genSafeTask = echt; }
  });

  /* ---------- 5.5: Trucendoos, mat in twee (T9 tot T11) ---------- */

  const MAT2_5 = 'k7/8/2K5/8/8/8/8/7R w - - 0 1';
  await regel('[5.5] Trucendoos, mat in twee gevonden: "Na je eerste zet kon Turbo de mat niet meer tegenhouden." en "Dat is een plan in twee stappen."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT2_5, 'mat2', ['c6b6']);
    zet(a, 'c6b6');
    await wacht();
    zet(a, 'h1h8');
    await wacht(3000);
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', r[0] === 'Na je eerste zet kon Turbo de mat niet meer tegenhouden.' && r[1] === 'Dat is een plan in twee stappen.');
  });
  await regel('[5.5] Trucendoos, mat in twee, de matzet twee keer gemist: "Dit was mat: {zet}." en "Je eerste zet was al goed!"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT2_5, 'mat2', ['c6b6']);
    zet(a, 'c6b6');
    await wacht();
    zet(a, 'h1h2');
    await wacht(3000);
    zet(a, 'h1h2');
    await wacht(3000);
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', /^Jouw zet: /.test(r[0] || '') && r[1] === 'Dit was mat: Toren h1 → h8.' && r[2] === 'Je eerste zet was al goed!');
  });
  await regel('[5.5] Trucendoos, mat in twee, de eerste zet twee keer gemist: "De eerste zet was {zet}." en "Daarna kon Turbo de mat niet meer tegenhouden."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, MAT2_5, 'mat2', ['c6b6']);
    zet(a, 'h1h7');
    await wacht(4000);
    zet(a, 'h1h7');
    await wacht(8000);
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', /^Jouw zet: /.test(r[0] || '') && r[1] === 'De eerste zet was Koning c6 → b6.' && r[2] === 'Daarna kon Turbo de mat niet meer tegenhouden.');
  });

  /* ---------- 5.5: de reden bij een veilige zet past bij de stelling, niet bij het antwoord ---------- */

  /* Kg1-f1: daarna kan Turbo niets slaan. h2-h3: Turbo kan Pxd4, maar c3xd4 slaat terug. */
  const VEILIG5 = [
    ['Turbo kan niets slaan', '6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'g1f1', 'Veilig: Turbo kan niets van je slaan.'],
    ['elke slag wordt teruggeslagen', '6k1/8/8/5n2/3N4/2P5/5PPP/6K1 w - - 0 1', 'h2h3', 'Veilig: elk stuk dat Turbo pakt, pak jij terug.'],
    /* na h3 kan Lxa2 een pion winnen, maar dan zet Te8 mat: de lijn kost niets */
    ['een slag die op zijn veld wint, maar de lijn kost niets', '6k1/5ppp/8/8/8/1b6/P4PPP/4R1K1 w - - 0 1', 'h2h3', 'Veilig: daarna kan Turbo niets winnen.']
  ];
  for (const g of VEILIG5) {
    for (const zei of ['Veilig', 'Valstrik']) {
      await regel('[5.5] Veilig of valstrik, ' + g[0] + ', het kind zei ' + zei + ': "' + g[3] + '"', async function (check) {
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
  /* de zetnaam zegt al wat Turbo slaat ("slaat dame"); de zin zegt het niet nog eens */
  await regel('[5.5] Red je stuk, een foute poging: pakt Turbo het stuk dat hing, dan "Turbo speelt {zet}: je {stuk} stond nog steeds aangevallen."; slaat hij iets anders, dan "Turbo speelt {zet}."; anders wat de zet van het kind deed', async function (check) {
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
    const hing = threatDetails(parseFEN(fen)).filter(function (t) { return t.victim >= 300 && t.gain >= 250; })[0].sq;
    if (isCapture(S, m) && m.to === hing) {
      const stuk = NAME_NL[S.board[m.to].toLowerCase()];
      check('Turbo pakt het stuk dat hing (' + onder5(a) + ')', onder5(a) === 'Turbo speelt ' + naam + ': je ' + stuk + ' stond nog steeds aangevallen. Probeer nog een zet.');
    } else if (isCapture(S, m)) {
      check('Turbo slaat iets anders (' + onder5(a) + ')', onder5(a) === 'Turbo speelt ' + naam + '. Probeer nog een zet.');
    } else {
      /* de volgorde van de schaakcoach: nog aangevallen en niet veilig, anders een echte redding, anders een betere zet */
      const k = saveKind(parseFEN(fen), legalMoves(parseFEN(fen)).find(function (x) { return moveKey(x) === 'b1a1'; }), hing);
      const stuk = NAME_NL[parseFEN(fen).board[hing].toLowerCase()], at = sqFromAlg(k.sq);
      makeMove(S, m);
      const aangevallen = attacked(S, at, 'b') && (inCheck(S) || seeSquare(nullMoved(S), at) > 0);
      const zin = aangevallen ? 'Je ' + stuk + ' op ' + k.sq + ' is nog niet veilig.' :
        ['anders', 'ruil', 'tegenaanval', 'schaak'].indexOf(k.kind) < 0 ? 'Een paar zetten later verlies je toch iets.' : 'Er is een betere zet om je ' + stuk + ' te redden.';
      check('Turbo slaat niets (' + onder5(a) + ')', onder5(a) === 'Turbo speelt ' + naam + '. ' + zin + ' Probeer nog een zet.');
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

  /* ---------- Red je stuk en Koning ontsnapt: wat er staat is waar ---------- */

  await regel('[5.5] Red je stuk, een redding zonder eigen zin: "Gered!" met "Turbo wint nu niets meer.", nooit "undefined"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '2k1r2r/1ppb1ppp/p2bp1qn/1B1pn1B1/3P4/2N2N2/PPP2PPP/R2Q1K1R w - - 0 1', 'stuk', ['d4e5'], HANG5);
    zet(a, 'd4e5');
    await wacht(3000);
    const r = redenen5(a);
    check('de reden (' + r.join(' / ') + ')', r.length === 1 && r[0] === 'Turbo wint nu niets meer.' && !/undefined/.test(tekstVan(a, 'taskBox')));
  });

  /* Wat een goed antwoord tegenhield, het eerste dat past. "Je dekt het veld" alleen als er een stuk
     bij komt dat het matveld nog niet dekte: de koning dekte een veld naast zich al. */
  const HOE5 = [
    ['een schaak', '2r3k1/3R2p1/3R3p/3pPP2/3p4/P7/r7/6K1', 'd7d8', 'Schaak! Turbo moet eerst zijn koning redden.'],
    ['de loper terug naar d1', '8/5p1k/1Q6/2P2n2/P7/3P1P1P/4BP1q/5K2', 'e2d1', 'Daarna kan Turbo niet meer mat zetten.'],
    ['een ander stuk slaan', '8/pp6/P7/1P2B1pk/5nr1/8/3P1b2/1R5K', 'e5f4', 'Daarna kan Turbo niet meer mat zetten.'],
    ['ruimte maken voor de koning', 'r7/5p1k/1P1R1P2/4Pb2/P1p2B2/7p/1P6/K7', 'b2b4', 'Daarna kan Turbo niet meer mat zetten.'],
    ['ruimte op d1, dat de koning al dekte', 'rnb1k2r/pppp1ppp/8/2q1P3/1b2n3/5N2/PPPBPPPP/RN1QKB1R', 'd1c1', 'Daarna kan Turbo niet meer mat zetten.'],
    ['het paard slaan dat de mat steunt', 'r2r2k1/1pp2ppp/p3p3/3p4/2nP1P2/P1P2Q2/2q2PPP/K2R1B1R', 'f1c4', 'Daarna kan Turbo niet meer mat zetten.'],
    ['de koning slaat de pion die schaak geeft', '6k1/P7/8/6p1/2N1p3/6p1/4r1PK/8', 'h2g3', 'Je slaat de aanvaller.'],
    ['de koning slaat de pion op h4', '8/5p1k/5Pb1/1PB5/7p/1NQ3KP/2P1r3/5r2', 'g3h4', 'Je slaat de aanvaller.'],
    ['de loper dekt g2', '2rn1k1r/Q1p2ppp/3p4/1B6/4P3/5qBb/P1P2P1P/R2R2K1', 'b5f1', 'Je dekt het veld g2.']
  ];
  for (const g of HOE5) {
    await regel('[5.5] Koning ontsnapt, ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const p = KONING_POOL.find(function (x) { return x.fen.indexOf(g[1] + ' ') === 0; });
      if (!check('testopzet: de puzzel staat in de voorraad, met dit antwoord', !!p && p.answers.indexOf(g[2]) >= 0)) return;
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, p.fen, p.type, p.answers);
      zet(a, g[2]);
      await wacht(3000);
      const r = redenen5(a);
      check('de redenen (' + r.join(' / ') + ')', r.indexOf(g[3]) >= 0 && !r.some(function (z) { return /Je dekt het veld/.test(z) && z !== g[3]; }));
    });
  }

  /* na een foute zet die geen mat toelaat: Turbo's stille zet, en het gevaar is er nog */
  await regel('[5.5] Koning ontsnapt, een foute zet zonder mat: "Turbo speelt {zet}, en het gevaar is er nog."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, '1r2k1r1/2pq1p2/3p1b2/1p2pp1p/4P3/3QB3/PPP2PKP/R6R w - - 2 1', 'schaak', ['g2f1']);
    zet(a, 'g2f3');
    await wacht(4000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Turbo speelt Pion f5 → f4, en het gevaar is er nog. Probeer nog een zet.');
  });

  /* na een foute zet die mat in twee toelaat: Turbo speelt de eerste zet ervan */
  await regel('[5.5] Koning ontsnapt, een foute zet die mat in twee toelaat: "Turbo speelt {zet}. Mat is niet meer te stoppen."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, 'r2qk2r/pp1nnppp/8/3p1b2/1p1K4/5N1P/PBP1PPP1/R2Q1B1R w - - 1 1', 'mat1', ['d4e3']);
    zet(a, 'c2c4');
    await wacht(4000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Turbo speelt Dame d8 → b6. Mat is niet meer te stoppen. Probeer nog een zet.');
  });

  /* de laatste foute poging: de zin van de eerste blijft niet staan, en die van de laatste komt onderaan "Zo zit het" */
  await regel('[5.5] Koning ontsnapt, de laatste foute poging: de strook onder het bord is leeg zolang Turbo antwoordt, daarna "Jouw zet: ..." als eerste reden', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'koning');
    zetOpdracht(a, 'r2qk2r/pp1nnppp/8/3p1b2/1p1K4/5N1P/PBP1PPP1/R2Q1B1R w - - 1 1', 'mat1', ['d4e3']);
    zet(a, 'c2c4');
    await wacht(4000);
    if (!check('testopzet: de eerste poging heeft een zin', onder5(a) !== '')) return;
    zet(a, 'c2c3');
    check('tijdens het antwoord geen oude zin (' + onder5(a) + ')', onder5(a) === '');
    await wacht(6000);
    const r = redenen5(a);
    check('eerst je eigen poging (' + r.join(' / ') + ')', /^Jouw zet: Turbo speelt /.test(r[0] || '') && !/Probeer nog een zet/.test(r[0]) && /^De redding was /.test(r[1] || ''));
  });

  /* een promotie in een zin: de zetnaam heeft geen uitroepteken, dus de zin eindigt op een gewone punt */
  await regel('[5.5] een promotie aan het eind van een zin: "De beste was B: Pion b7 → a8, slaat toren, promotie."', async function (check) {
    const a = nieuwKind();
    const u = besteUitleg5(a, 'r6k/1P6/8/8/8/8/8/6K1 w - - 0 1', ['g1f2', 'b7a8q', 'g1h2'], 1);
    check('de eerste reden (' + u.regels[0] + ')', u.regels[0] === 'De beste was B: Pion b7 → a8, slaat toren, promotie.');
  });

  /* ---------- Trucendoos: wat er staat is waar op het bord dat er staat ---------- */

  /* de truc staat op het bord waar hij over gaat: eerst de zin en de tekens, dan pas Turbo's antwoord;
     daarna zegt de uitleg wat Turbo deed en, met een pijl, wat het kind nu kan pakken */
  await regel('[5.5] Trucendoos, gevonden: de zin en de tekens bij de stand na jouw zet, dan Turbo\'s antwoord en "Turbo speelt {zet}. Nu kun jij {het-x} op {veld} pakken."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    zet(a, VORK5[1]);
    await wacht(700);
    check('eerst: Turbo heeft nog niet gezet, de zin en drie tekens', a.get('session.S.hist.length') === 1 && a.get('BD.spy.size') === 3 &&
      redenen5(a)[0] === 'Vork! Je pion valt de dame en het paard tegelijk aan.');
    await wacht(5000);
    const r = redenen5(a), laatste = r[r.length - 1] || '';
    check('daarna: Turbo zette en de tekens zijn weg', a.get('session.S.hist.length') === 2 && a.get('BD.spy.size') === 0);
    const m = /^Turbo speelt (.+?)\.? Nu kun jij (het|de) (\S+) op ([a-h][1-8]) pakken\.$/.exec(laatste);
    check('de nieuwe reden (' + laatste + ')', !!m);
    if (!m) return;
    const S = parseFEN(a.fen()), sq = sqFromAlg(m[4]);
    check('dat stuk staat daar en is met winst te slaan', !!S.board[sq] && NAME_NL[S.board[sq].toLowerCase()] === m[3] && seeSquare(S, sq) > 0);
    check('met een groene pijl naar dat veld', a.get('BD.arrows.length === 1 && BD.arrows[0].cls === "a-leaf" && BD.arrows[0].to === ' + sq));
  });

  /* wat nog moest gebeuren na een truc (Turbo's antwoord, zijn tekens en zijn zin) hoort bij die truc: na Volgende
     loopt of tekent er niets meer van, ook niet midden in Turbo's zet of na de laatste opdracht */
  await regel('[5.5] Trucendoos: een tik op Volgende terwijl Turbo nog antwoordt, laat niets van de vorige truc zien en geeft geen fout', async function (check) {
    const verder = async function (ms) {
      const eind = __klok + ms;
      while (__klok < eind) { const stap = Math.min(eind, __klok + 10); drainTot(400, stap); if (__klok < stap) __klok = stap; for (let j = 0; j < 40; j++) await null; }
    };
    const tot = async function (vraag, ms) { const eind = __klok + ms; while (!vraag() && __klok < eind) await verder(10); return !!vraag(); };
    const gevallen = [['vlak voor Turbo\'s zet', 2, false, 1150], ['als Turbo\'s stuk gaat schuiven', 2, true, 0],
      ['als Turbo\'s stuk bijna staat', 2, true, 200], ['op de vijfde opdracht', 5, false, 600]];
    for (const [wanneer, ronde, naSchuiven, ms] of gevallen) {
      const a = nieuwKind({ beweging: true });
      const schuift = function () { return a.doc.querySelectorAll('.ghost').length > 0; };
      await startOefening(a, 'trucs');
      a.ev('session.round = ' + ronde);
      zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
      zet(a, VORK5[1]);
      if (!check(wanneer + ': testopzet, de truc is gevonden', await tot(function () { return kanTikken(a, 'Volgende'); }, 2000))) continue;
      if (naSchuiven && !check(wanneer + ': testopzet, Turbo\'s stuk schuift', await tot(schuift, 3000))) continue;
      await verder(ms);
      if (!check(wanneer + ': testopzet, Turbo\'s zet staat nog niet', a.get('session.S.hist.length') === 1)) continue;
      let schoof = null;
      try { tikTekst(a, 'Volgende'); schoof = schuift(); await wacht(5000); } catch (e) { check(wanneer + ': geen fout (' + (e && e.message) + ')', false); continue; }
      check(wanneer + ': Turbo\'s stuk schuift niet door over de volgende opdracht', !schoof);
      const bord = a.get('(function () { return { laatste: BD.last, pijlen: BD.arrows.length, tekens: BD.spy.size }; })()');
      check(wanneer + ': geen teken van Turbo\'s zet of de truc op het bord (' + JSON.stringify(bord) + ')', !bord.laatste && bord.pijlen === 0 && bord.tekens === 0);
      check(wanneer + ': geen uitleg van de vorige truc (' + norm5(tekstVan(a, 'taskBox')) + ')', !zichtbaar(a, 'taskBox') || !/Gevonden|Turbo speelt/.test(tekstVan(a, 'taskBox')));
      if (ronde === 5) check(wanneer + ': het rondje is klaar', a.ziet('Rondje klaar'));
      else check(wanneer + ': een nieuwe opdracht', isPuzzel5(a) && a.get('session.S.hist.length') === 0 && a.get('session.round') === ronde + 1);
    }
  });

  /* de laatste foute poging: geen oude zin naast de nieuwe zet, en wat die zet deed onderaan "Zo zit het" */
  await regel('[5.5] Trucendoos, de laatste foute poging: de strook onder het bord is leeg zolang Turbo antwoordt, daarna "Jouw zet: ..." als eerste reden', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, VORK5[0], 'vork', [VORK5[1]]);
    zet(a, 'a3a4');
    await wacht(4000);
    if (!check('testopzet: de eerste poging heeft een zin', onder5(a) !== '')) return;
    zet(a, 'h2h3');
    check('tijdens het antwoord geen oude zin (' + onder5(a) + ')', onder5(a) === '');
    await wacht(8000);
    const r = redenen5(a);
    check('eerst je eigen poging (' + r.join(' / ') + ')', /^Jouw zet: nog niet de vork: Turbo speelt dan .+\.$/.test(r[0] || '') && !/Probeer/.test(r[0]) &&
      /^De truc was /.test(r[1] || ''));
  });

  /* "valt maar één stuk aan" alleen als de zet echt één stuk van Turbo aanvalt: De2 valt c4 en g4 aan */
  await regel('[5.5] Trucendoos, vork: een zet die twee stukken aanvalt hoort niet "valt maar één stuk aan"', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '1k1r1b1r/1p1q1p1p/p1pp1p2/6B1/2nPP1b1/3Q2N1/PPP2PPP/1R2KBR1 w - - 0 1', 'vork', ['g5f6']);
    zet(a, 'd3e2');
    await wacht(4000);
    const pijl = a.get('(function () { var p = BD.arrows.find(function (x) { return x.cls === "a-coral"; }); return p ? moveKey(p) : null; })()');
    const m = /^Nog niet de vork: Turbo speelt dan (.+)\. Probeer nog een zet\.$/.exec(onder5(a));
    check('de zin (' + onder5(a) + ')', !!m);
    check('de zet in de zin is de pijl op het bord (' + pijl + ')', !!m && !!pijl && a.get('(function () { var S = parseFEN(' + JSON.stringify('1k1r1b1r/1p1q1p1p/p1pp1p2/6B1/2nPP1b1/3Q2N1/PPP2PPP/1R2KBR1 w - - 0 1') + ');' +
      ' makeMove(S, legalMoves(S).find(function (x) { return moveKey(x) === "d3e2"; })); return moveNameNL(S, legalMoves(S).find(function (x) { return moveKey(x) === ' + JSON.stringify(pijl) + '; })); })()') === m[1]);
  });

  /* "Dan pakt Turbo je {stuk} op {veld}." en het bord laat precies die slag zien */
  await regel('[5.5] Trucendoos, een truc op een veld waar Turbo slaat: het bord laat die slag zien, met het goedkoopste stuk', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    const fen = '1r2k1nr/1pp1bpp1/p1bqp2p/3pN3/3PP3/2N2Q2/PPPB1PPP/2R1R1K1 w - - 0 1';
    zetOpdracht(a, fen, 'vork', ['e5f7']);
    let antwoord = null;
    zet(a, 'e5c6');
    await zagOoit(function () {
      if (!antwoord && a.get('session.S.hist.length') === 2) antwoord = a.get('moveKey(session.S.hist[1].m)');
      return !!antwoord;
    }, 6000);
    await wacht(4000);
    const S = parseFEN(fen);
    makeMove(S, legalMoves(S).find(function (x) { return moveKey(x) === 'e5c6'; }));
    const slagen = legalMoves(S).filter(function (x) { return x.to === sqFromAlg('c6') && S.board[x.to]; })
      .sort(function (x, y) { return VAL[S.board[x.from].toLowerCase()] - VAL[S.board[y.from].toLowerCase()]; });
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Dan pakt Turbo je paard op c6. Zoek een veilig veld.');
    check('het antwoord op het bord (' + antwoord + ')', !!slagen.length && antwoord === moveKey(slagen[0]));
  });

  /* een zet die ook de truc is, maar niet de sterkste: geen "Nog niet de vork" */
  await regel('[5.5] Trucendoos, een andere vork die minder oplevert: "Ook een vork! Er is nog een sterkere. Probeer nog een zet."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '2kr3r/pp3ppp/2qbbn2/1N1p4/3pp3/4P3/PPP2PPP/1RB1QKNR w - - 0 1', 'vork', ['b5a7']);
    zet(a, 'b5d4');
    await wacht(4000);
    check('de zin (' + onder5(a) + ')', onder5(a) === 'Ook een vork! Er is nog een sterkere. Probeer nog een zet.');
  });

  /* ---------- welke stukken een zin noemt, en wanneer ---------- */

  /* Pc7: koning, dame en toren; de zin noemt de twee meest waardevolle */
  await regel('[5.5] Trucendoos, een vork op drie stukken noemt de twee meest waardevolle: "Vork! Je paard valt de koning en de dame tegelijk aan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'r3k3/8/8/1N1q4/8/8/8/4K3 w - - 0 1', 'vork', ['b5c7']);
    zet(a, 'b5c7');
    await wacht(700);
    check('de zin (' + redenen5(a)[0] + ')', redenen5(a)[0] === 'Vork! Je paard valt de koning en de dame tegelijk aan.');
  });

  /* Lb3-d5 pent het paard op e6 tegen de koning en de loper op c6 tegen de toren: de zin noemt de koning */
  await regel('[5.5] Trucendoos, twee penningen: de zin noemt het meest waardevolle stuk erachter', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'r5k1/8/2b1n3/8/8/1B6/8/6K1 w - - 0 1', 'penning', ['b3d5']);
    zet(a, 'b3d5');
    await wacht(700);
    check('de zin (' + redenen5(a)[0] + ')', redenen5(a)[0] === 'Penning! Het paard op e6 staat vast: erachter staat de koning.');
  });

  /* Pa4-c3 valt zelf niets aan en geeft geen schaak: alleen de zin over de toren */
  await regel('[5.5] Trucendoos, een aftrekaanval waarbij het stuk zelf niets aanvalt: geen "Je {stuk} valt zelf ook iets aan."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, 'q6k/8/8/8/N7/8/8/R5K1 w - - 0 1', 'aftrek', ['a4c3']);
    zet(a, 'a4c3');
    await wacht(700);
    const r = redenen5(a);
    check('de zin (' + r.join(' / ') + ')', r.length === 1 && r[0] === 'Aftrekaanval! Nu valt je toren op a1 de dame aan.');
  });

  /* mat in één, na twee missers: de matzet en twee gedekte velden naast de koning (Dg7, gedekt door de loper) */
  await regel('[5.5] Trucendoos, mat in één na twee missers: "Dit was mat: {zet}." en "h7 en g8 zijn ook gedekt."', async function (check) {
    const a = nieuwKind();
    await startOefening(a, 'trucs');
    zetOpdracht(a, '7k/8/8/8/3B4/8/6Q1/6K1 w - - 0 1', 'mat1', ['g2g7']);
    zet(a, 'g2g3');
    await wacht(4000);
    zet(a, 'g2g4');
    await wacht(8000);
    const r = redenen5(a);
    check('de redenen (' + r.join(' / ') + ')', /^Jouw zet: /.test(r[0] || '') && r[1] === 'Dit was mat: Dame g2 → g7.' && r[2] === 'h7 en g8 zijn ook gedekt.');
  });

  /* rood betekent schaak: na een foute poging is de koning alleen rood als hij schaak staat */
  for (const [naam, fen, type, antwoorden, rood] of [['een matdreiging', 'r2qk2r/pp1nnppp/8/3p1b2/1p1K4/5N1P/PBP1PPP1/R2Q1B1R w - - 1 1', 'mat1', ['d4e3'], false],
    ['schaak', '3k4/1p5p/p2pr3/P7/4p1r1/8/2P2P2/2R1R1K1 w - - 0 41', 'schaak', ['g1f1'], true]]) {
    await regel('[5.5] Koning ontsnapt, ' + naam + ': na een foute poging is de koning ' + (rood ? 'rood' : 'niet rood'), async function (check) {
      const a = nieuwKind();
      await startOefening(a, 'koning');
      zetOpdracht(a, fen, type, antwoorden);
      const fout = a.get('(function () { var S = session.S; var m = legalMoves(S).find(function (x) { if (' + JSON.stringify(antwoorden) + '.indexOf(moveKey(x)) >= 0 || x.promo) return false;' +
        ' makeMove(S, x); var o = gameStatus(S).over; unmakeMove(S); return !o; }); return m ? moveKey(m) : null; })()');
      if (!check('testopzet: een foute zet', !!fout)) return;
      zet(a, fout);
      await wacht(5000);
      check('testopzet: de opdracht staat weer klaar', isPuzzel5(a));
      check('de koning (' + a.get('BD.check') + ')', rood ? a.get('BD.check === session.S.kings.w') : a.get('BD.check') === null);
    });
  }

  /* Pf3+ valt koning en dame aan: de reden noemt de truc van Turbo */
  await regel('[5.5] Veilig of valstrik, een vork van Turbo: "Dan zet Turbo een vork."', async function (check) {
    const S = parseFEN('6k1/8/8/4n3/8/8/6PP/R3Q1K1 w - - 0 1');
    const m = legalMoves(S).find(function (x) { return moveKey(x) === 'g2g3'; });
    makeMove(S, m);
    const straf = legalMoves(S).find(function (x) { return moveKey(x) === 'e5f3'; });
    unmakeMove(S);
    const taak = { S: S, move: m, trap: true, punish: straf, loss: 950 };
    const echt = genSafeTask;
    genSafeTask = function () { return taak; };
    try {
      const a = nieuwKind();
      await startOefening(a, 'best3');
      await naarValstrikVraag5(a);
      if (!check('testopzet: de valstrik-vraag staat klaar', a.get('!!session.task && !!session.task.move') && kanTikken(a, 'Valstrik'))) return;
      tikTekst(a, 'Valstrik');
      await wacht(6000);
      check('de reden (' + redenen5(a).join(' / ') + ')', redenen5(a).indexOf('Dan zet Turbo een vork.') >= 0);
    } finally { genSafeTask = echt; }
  });


  /* na een foute poging staat Turbo's antwoord als pijl op het bord zolang de zin erover staat, tot de volgende tik */
  for (const [soort, fen, type, antwoorden, fout] of [['koning', '6k1/8/8/8/8/2b5/6P1/R5K1 w - - 0 1', 'stuk', ['a1a2', 'a1b1'], 'g1h1'],
    ['trucs', '1k1r1b1r/1pp1ppp1/p1n4p/3pq1n1/8/P1NBP3/1PPPQPPP/R1B1R1K1 w - - 0 1', 'vork', ['f2f4'], 'a3a4']]) {
    await regel('[5.5] ' + (soort === 'koning' ? 'Red je stuk' : 'Trucendoos') + ', een foute poging: Turbo\'s antwoord blijft als pijl staan tot de volgende tik', async function (check) {
      const a = nieuwKind();
      await startOefening(a, soort);
      zetOpdracht(a, fen, type, antwoorden, type === 'stuk' ? HANG5 : undefined);
      zet(a, fout);
      await wacht(5000);
      check(soort === 'trucs' ? 'jouw poging in geel en Turbo\'s antwoord in koraal' : 'een pijl in de kleur van Turbo\'s antwoord', isPuzzel5(a) && (soort === 'trucs' ?
        a.get('BD.arrows.length === 2 && BD.arrows[0].cls === "a-sun" && moveKey(BD.arrows[0]) === ' + JSON.stringify(fout) + ' && BD.arrows[1].cls === "a-coral"') :
        a.get('BD.arrows.length === 1 && BD.arrows[0].cls === "a-coral"')));
      tikVeld(a, a.get('sqFromAlg("g1")'));
      check('na de volgende tik is de pijl weg', a.get('BD.arrows.length') === 0);
    });
  }

  /* ---------- Turbo's zin en het sleutelmoment: wat er staat is waar ---------- */

  const zinVan5 = function (a, fen, k) {
    return a.get('(function () { var S = parseFEN(' + JSON.stringify(fen) + '), m = legalMoves(S).find(function (x) { return moveKey(x) === ' + JSON.stringify(k) + '; }); return turboZin(S, m); })()');
  };
  const TURBOZIN5 = [
    ['Turbo pakt een dame die niemand terugpakt: de punten uit de tabel', '6k1/8/8/8/3q4/8/3Q4/6K1 b - - 0 1', 'd4d2', 'Ik pak je dame op d2 (9 punten). Niemand kan terugpakken.'],
    ['Turbo wint de ruil: wat het kind krijgt door terug te pakken', '6k1/8/8/5n2/3R4/2P5/8/6K1 b - - 0 1', 'f5d4', 'Ik pak je toren op d4 (5 punten). Pak je terug, dan krijg je maar 3 punten.'],
    ['Turbo slaat met een stuk dat evenveel waard is en pakt daarna nog eens', '3r2k1/8/8/3r4/3R4/2P5/8/6K1 b - - 0 1', 'd5d4', 'Ik pak je toren op d4 (5 punten). Pak je terug, dan pak ik nog eens.'],
    ['en passant: het veld waar de pion stond', '6k1/8/8/8/3pP3/8/8/6K1 b - e3 0 1', 'd4e3', 'Ik pak je pion op e4 (1 punt). Niemand kan terugpakken.'],
    /* Pg4 valt f2 aan; alleen de koning "dekt" f2, en die mag daar niet slaan (de loper op c5) */
    ['een dreiging op een stuk dat alleen de koning dekt, die er niet mag slaan', 'r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 0 1', 'f6g4', 'Mijn paard op g4 valt je pion op f2 aan.'],
    /* Pc3 valt de toren en de loper aan, op een veld waar b2 slaat: geen vork, de grootste dreiging is de loper */
    ['twee nieuwe dreigingen: de grootste', '6k1/8/8/3n4/8/8/1P2R3/3B2K1 b - - 0 1', 'd5c3', 'Mijn paard op c3 valt je loper op d1 aan.']
  ];
  for (const g of TURBOZIN5) {
    await regel('[5.8] Turbo\'s zin, ' + g[0] + ': "' + g[3] + '"', async function (check) {
      const a = nieuwKind();
      a.ev('setPref("guard", true)');
      await startPotje(a, 2);
      const z = zinVan5(a, g[1], g[2]);
      check('de zin (' + z + ')', z === g[3]);
    });
  }

  await regel('[5.8] met het blunderalarm uit noemt Turbo geen dreiging, wel wat hij pakt', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 2);
    check('het alarm staat uit', a.get('P.guard') === false);
    check('geen dreiging', zinVan5(a, '6k1/8/8/3n4/8/8/1P2R3/3B2K1 b - - 0 1', 'd5c3') === null);
    check('wel de slag', zinVan5(a, '6k1/8/8/8/3q4/8/3Q4/6K1 b - - 0 1', 'd4d2') === 'Ik pak je dame op d2 (9 punten). Niemand kan terugpakken.');
  });

  await regel('[5.8] een vork van Turbo: de waarschuwing voor de truc, niet de dreigregel', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 2);
    a.ev('(function () { var S = parseFEN("6k1/8/8/3n4/8/8/4R3/3B2K1 b - - 0 1"); session.S = S; renderBoard(); doTurboMove(legalMoves(S).find(function (m) { return moveKey(m) === "d5c3"; })); })()');
    await wacht(2500);
    check('de strook (' + strook5(a) + ')', /Kijk uit/.test(strook5(a)) && !/Mijn paard/.test(strook5(a)));
  });

  /* ---------- het blunderalarm en Pas op: alleen als een andere zet beter is, met de punten van de tabel ---------- */

  await regel('[5.4] het blunderalarm: kost elke zet iets en een andere minder, dan "Een andere zet kost minder."', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 1);
    a.ev('(function () { var S = parseFEN("7k/8/8/8/8/5n2/8/4Q1K1 w - - 0 1"); session.S = S; BD.mode = "move"; renderBoard();' +
      ' onKidMove(legalMoves(S).find(function (m) { return moveKey(m) === "g1h1"; })); })()');
    await wacht();
    check('het alarm, met de tweede regel (' + a.scherm() + ')', a.open() && a.scherm().indexOf('Na deze zet kan Turbo je dame op e1 pakken.') >= 0 && a.scherm().indexOf('Een andere zet kost minder.') >= 0);
  });

  const coach5 = function (a, fen, k) {
    return a.get('(function () { var S = parseFEN(' + JSON.stringify(fen) + '); session.movedTo = new Set(); session.kidMoves = 8;' +
      ' return coachEval(S, legalMoves(S).find(function (m) { return moveKey(m) === ' + JSON.stringify(k) + '; })).msg; })()');
  };
  await regel('[5.4] Pas op: de punten uit de tabel, Turbo\'s zet die slaat, en de matzin', async function (check) {
    const a = nieuwKind();
    a.ev('startOpening("coach", null)');
    check('twee lopers voor een toren is 1 punt', coach5(a, '3r2k1/3r1ppp/8/8/8/8/2B2PPP/5BK1 w - - 0 1', 'f1d3').indexOf('Pas op: na deze zet wint Turbo 1 punt.') === 0);
    /* na 4.f3 is Dh4+ Turbo's beste zet, maar die slaat niets: "Turbo speelt dan" noemt d5xc4 */
    const lijn = '(function () { var S = newGame(); ["g1h3", "e7e6", "e2e3", "b8a6", "f1c4", "d7d5"].forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); }); return toFEN(S); })()';
    const f = coach5(a, a.get(lijn), 'f2f3');
    check('Turbo speelt dan een slag (' + f + ')', f.indexOf('Turbo speelt dan <b>Pion d5 → c4, slaat loper</b>.') >= 0);
    const mat = a.get('(function () { var S = newGame(); ["f2f3", "e7e5"].forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); }); return toFEN(S); })()');
    check('mat in een: de matzin', coach5(a, mat, 'g2g4').indexOf('Pas op: na deze zet kan Turbo je schaakmat zetten. Turbo speelt dan <b>Dame d8 → h4</b>.') === 0);
    check('de enige zet: geen Pas op', coach5(a, '6k1/8/8/8/2R5/8/6PP/r6K w - - 0 1', 'c4c1').indexOf('Pas op') < 0);
  });

  await regel('[5.4] het blunderalarm noemt bij en passant het veld waar de pion stond', async function (check) {
    const a = nieuwKind();
    await startPotje(a, 1);
    const z = a.get('(function () { var S = parseFEN("6k1/8/8/8/3p4/8/4P3/6K1 w - - 0 1"), m = legalMoves(S).find(function (x) { return moveKey(x) === "e2e4"; });' +
      ' makeMove(S, m); var ep = legalMoves(S).find(function (x) { return x.flags === "e"; }); unmakeMove(S); return alarmZin(S, m, { take: ep, punish: ep, loss: 300 }).tekst; })()');
    check('de zin (' + z + ')', z === 'Na deze zet kan Turbo je pion op e4 pakken.');
  });

  await regel('[5.4] in een vriendenpotje geen blunderalarm', async function (check) {
    const a = nieuwKind();
    a.ev('setPref("guard", true)');
    await startPotje(a, 1);
    a.ev('window.__gezet = false; commitKid = function () { window.__gezet = true; }; session.online = true;' +
      ' (function () { var S = parseFEN("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"); session.S = S; BD.mode = "move";' +
      ' onKidMove(legalMoves(S).find(function (m) { return moveKey(m) === "f3e5"; })); })()');
    await wacht();
    check('geen alarm, de zet gaat door', !a.open() && a.get('window.__gezet') === true);
  });

  /* ---------- het sleutelmoment: per soort de zin en wat je de volgende keer nakijkt ---------- */

  const MOMENTEN5 = [
    ['een stuk dat zelf naar een onbeschermd veld ging, gebruikt', 'start', ['e2e4', 'e7e5', 'g1f3', 'd7d6'], 'f3g5', true,
      'Zet 3: je paard ging naar g5. Daar stond het onbeschermd, en ik pakte het (3 punten).', 'Volgende keer: kijk of je stuk daar gedekt is.'],
    ['hetzelfde, niet gebruikt', 'start', ['e2e4', 'e7e5', 'g1f3', 'd7d6'], 'f3g5', false,
      'Zet 3: je paard ging naar g5. Daar stond het onbeschermd. Ik had het kunnen pakken (3 punten).', 'Volgende keer: kijk of je stuk daar gedekt is.'],
    ['een stuk dat zijn dekking kwijtraakte', '4r1k1/8/8/4N3/5B2/8/8/6K1 w - - 0 1', [], 'f4c1', true,
      'Zet 1: je loper ging naar c1. Toen dekte niemand je paard op e5 meer, en ik pakte het (3 punten).', 'Volgende keer: kijk wat je stuk nog dekte, voor je het wegzet.'],
    ['een truc die Turbo liet liggen', 'start', ['g1h3', 'e7e6', 'e2e3', 'b8a6', 'f1c4', 'd7d5'], 'f2f3', false,
      'Zet 4: na je zet kon ik een vork zetten. Ik zag het niet.', 'Volgende keer: kijk wat ik na je zet kan aanvallen.'],
    ['een gedekt stuk dat een goedkoper stuk slaat, gebruikt en teruggeslagen', '6k1/8/b7/8/8/8/2P5/3Q2K1 w - - 0 1', [], 'd1d3', true,
      'Zet 1: je dame op d3 kon ik slaan met mijn loper. Na het terugslaan was je 6 punten kwijt.', 'Volgende keer: tel eerst wie er terug kan slaan.', { terug: true }],
    ['hetzelfde, niet gebruikt', '6k1/8/b7/8/8/8/2P5/3Q2K1 w - - 0 1', [], 'd1d3', false,
      'Zet 1: je dame op d3 kon ik slaan met mijn loper. Dat had je 6 punten gekost.', 'Volgende keer: tel eerst wie er terug kan slaan.'],
    ['een verloren ruil die Turbo liet liggen: het paard, niet de pion', '6k1/8/4p3/3n4/8/8/8/3R2K1 w - - 0 1', [], 'd1d5', false,
      'Zet 1: je sloeg het paard op d5, maar die was gedekt. Ik had kunnen terugslaan.', 'Volgende keer: tel eerst wie er terug kan slaan.'],
    ['een zet die mat toelaat', 'start', ['f2f3', 'e7e5'], 'g2g4', true,
      'Zet 2: na je zet kon ik mat zetten, met Dame d8 → h4.', 'Volgende keer: kijk eerst of ik schaak kan geven.'],
    ['een gemiste mat', '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', [], 'h2h3', true,
      'Zet 1: je kon mij schaakmat zetten met Toren e1 → e8.', 'Volgende keer: kijk eerst of jij schaak kunt geven.']
  ];
  for (const g of MOMENTEN5) {
    await regel('[5.8] het sleutelmoment, ' + g[0] + ': "' + g[5] + '" en "' + g[6] + '"', async function (check) {
      const a = nieuwKind();
      const u = a.get('(function () { var S = ' + (g[1] === 'start' ? 'newGame()' : 'parseFEN(' + JSON.stringify(g[1]) + ')') + ';' +
        JSON.stringify(g[2]) + '.forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); });' +
        ' var k = momentVan(S, legalMoves(S).find(function (m) { return moveKey(m) === ' + JSON.stringify(g[3]) + '; }));' +
        ' if (!k) return null; k.used = ' + g[4] + '; Object.assign(k, ' + JSON.stringify(g[7] || {}) + '); var t = momentTekst(k); return t.tekst + "|" + t.volgende; })()');
      check('de zin en de regel (' + u + ')', u === g[5] + '|' + g[6]);
    });
  }

  await regel('[5.8] het sleutelmoment van een vork van het kind: "Een echte vork!"', async function (check) {
    const a = nieuwKind();
    const t = a.get('(function () { var S = parseFEN("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1"); ["b5c7", "e8d7", "c7a8"].forEach(function (k) { makeMove(S, legalMoves(S).find(function (m) { return moveKey(m) === k; })); });' +
      ' return momentTekst(keyMoment(S, momentVan)).tekst; })()');
    check('de zin (' + t + ')', /^Zet 1: je paard viel mijn (koning en mijn toren|toren en mijn koning) tegelijk aan\. Een echte vork!$/.test(t));
  });

  /* twee keer Zet terug en dan dezelfde zet op hetzelfde nummer in een andere stelling: het oude moment telt niet meer */
  await regel('[5.8] na Zet terug hoort het moment niet meer bij een zet die er niet meer staat', async function (check) {
    const a = nieuwKind({ opslag: opslagMetPotje(2, ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'a2a3', 'a7a6']) });
    const echt = pickMove;
    const rij = ['e8f7', 'a6a5'];
    pickMove = function (S) { const k = rij.shift(); return legalMoves(S).find(function (m) { return moveKey(m) === k; }) || legalMoves(S)[0]; };
    try {
      a.tik('verderKaart');
      await wacht();
      zet(a, 'h5f7');
      await wacht(3000);
      if (!check('testopzet: 4.Dxf7+ en Turbo antwoordt', a.get('session.S.hist.length') === 8)) return;
      tikTekst(a, 'Zet terug');
      await wacht(300);
      tikTekst(a, 'Zet terug');
      await wacht(300);
      zet(a, 'f1c4');
      await wacht(3000);
      zet(a, 'h5f7');
      await wacht(4000);
      check('testopzet: 4.Dxf7 is mat', a.get('!!session.over') && a.get('gameStatus(session.S).reason') === 'mat');
      const kaart = norm5(tekstVan(a, 'eindkaart'));
      check('de eindkaart zegt niets over een gedekte pion op f7 (' + kaart + ')', kaart.indexOf('maar die was gedekt') < 0);
    } finally { pickMove = echt; }
  });
}
function witAanZet5(a) { return a.get('session.S.turn === "w"'); }
