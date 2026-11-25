#!/usr/bin/env node
/* Layoutcontroles in een echte browser-engine (WebKit via playwright-cli), voor
   wat op schermmaten hangt. De DOM-shim van de flowtests
   heeft geen opmaak; hier staan de rechthoeken echt op een scherm.

   Draaien: node test/layout/run.mjs   (./test.sh doet dat als playwright-cli er is)
   Het bouwsel in de repo-root wordt geserveerd met tools/dev.sh op poort 8719,
   of op LAYOUT_POORT, zodat twee bomen tegelijk kunnen draaien; DEV_SH wijst
   desgewenst een ander dev.sh aan. De sessie heet fd-layout-<poort>.

   Zoals in de flowsuite staat een regel die nog niet gebouwd is als nogNiet:
   zijn controles moeten falen; slagen ze, dan faalt de suite. Een geval
   waarop de browser geen antwoord geeft, faalt altijd: dan is niets gemeten. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POORT = Number(process.env.LAYOUT_POORT || 8719);
const URL = 'http://127.0.0.1:' + POORT + '/';
const DEV = process.env.DEV_SH || path.join(ROOT, 'tools', 'dev.sh');
const SESSIE = 'fd-layout-' + POORT;
/* desgewenst: alleen de regels die hierop passen, en een map voor foto's van de schermen die een geval meet */
const ALLEEN = process.env.LAYOUT_ALLEEN ? new RegExp(process.env.LAYOUT_ALLEEN) : null, FOTOS = process.env.LAYOUT_FOTOS || '';

/* een kind met een naam en verder niets: geen naamvraag, geen weekkaart */
const DOC = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
  max: { best: 0, goal: {} }, friends: {}, loc: {} });

/* Regelnummers die gebouwd zijn: hun controles zijn gewone controles. Een
   regel bouwen = zijn nummer hier toevoegen, in dezelfde commit. */
const GEBOUWD = new Set(['1.8', '1.13', '1.14', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.9', '2.10', '3.3', '3.4', '3.5', '3.11', '4.5', '4.7', '4.8', '4.12', '5.5', '5.6', '5.11', '6.3', '6.4', '6.5', '6.8', '6.9', 'V2', 'V9']);

/* het oordeel over een controle: wat nog niet gebouwd is moet falen */
function oordeel(regel, fouten, gebouwd) {
  const nr = (regel.match(/^\[([\dV.]+)\]/) || [])[1];
  if (gebouwd.has(nr)) return fouten.length ? 'FAIL' : 'PASS';
  return fouten.length ? 'NOG NIET GEBOUWD' : 'FAIL';
}

/* elke schermmaat waarop de app moet werken, zoals een kind hem ziet (met en zonder browserbalken): alles behalve de telefoon dwars */
const MATEN = [[360, 640], [375, 647], [375, 553], [390, 667], [402, 700], [360, 708], [390, 844], [402, 874],
  [768, 1004], [768, 904], [1024, 748], [1024, 648], [1024, 1346], [1024, 1246], [1366, 1004], [1366, 904],
  [834, 1170], [834, 1070], [1194, 810], [1194, 710], [1280, 720], [1280, 630], [1440, 900]];
const KLEIN = [[360, 640], [375, 553]];

function pw(...args) {
  return spawnSync('playwright-cli', ['-s=' + SESSIE, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
}

/* Helpers die in elke paginafunctie staan. Een kind tikt: de knoppen op wat
   er staat, het bord op zijn velden. */
const HELPERS = `
  const URL = ${JSON.stringify(URL)}, DOC = ${JSON.stringify(DOC)};
  const fouten = {};
  const check = (naam, wat, c) => { (fouten[naam] = fouten[naam] || []); if (!c) fouten[naam].push(wat); };
  const vers = async (W, H, extra) => {
    await page.setViewportSize({ width: W, height: H });
    await page.goto(URL);
    await page.evaluate(([d, x]) => { localStorage.clear(); localStorage.setItem('schaakheld1', d);
      for (const k in x) localStorage.setItem(k, x[k]); }, [DOC, extra || {}]);
    /* de staten van een paar verzegeld zoals een apparaat ze bewaart, met de functies van de app op de pagina */
    await page.evaluate(async () => {
      const t = localStorage.getItem('schaakheld-paar');
      if (!t) return;
      const paren = JSON.parse(t), vrienden = JSON.parse(localStorage.getItem('schaakheld1')).friends || {};
      for (const fid in paren) {
        const p = paren[fid];
        if (!p.staat || p.blob || !vrienden[fid]) continue;
        p.blob = await staatNaarBlob(vrienden[fid].k, p.staat);
        p.versie = await versieVan(p.blob);
      }
      localStorage.setItem('schaakheld-paar', JSON.stringify(paren));
    });
    await page.reload();
    await page.waitForTimeout(300);
  };
  const rect = (sel) => page.evaluate(s => { const e = document.querySelector(s);
    if (!e || !e.getClientRects().length) return null;
    const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, sel);
  const binnen = (r, W, H) => !!r && r.w > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= H + 0.5 && r.right <= W + 0.5;
  const gelijk = (a, b) => !!a && !!b && ['top', 'left', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.5);
  const klik = async (...sels) => {
    for (const s of sels) { const l = page.locator(s).first();
      if (await l.count() && await l.isVisible()) { await l.click({ timeout: 3000 }); return true; } }
    return false;
  };
  const klikTekst = async (t) => { const l = page.getByRole('button', { name: t }).first();
    if (await l.count()) { await l.click({ timeout: 3000 }); return true; } return false; };
  const veld = (a) => page.evaluate(a => { const f = 'abcdefgh'.indexOf(a[0]), r = +a[1] - 1;
    document.getElementById('board').children[(7 - r) * 8 + f].click(); }, a);
  const zet = async (k) => { await veld(k.slice(0, 2)); await veld(k.slice(2, 4)); await page.waitForTimeout(700); };
  const startPotje = async () => { await klik('#spelTurbo', '.mode-card[data-mode="game"]'); await page.waitForTimeout(200);
    await klik('[data-lvl="1"]'); await page.waitForTimeout(500); };
  const startOefening = async (k) => { await klik('#oefen-' + k, '.mode-card[data-mode="' + k + '"]'); await page.waitForTimeout(1200); };
  /* Turbo vraagt pas bij een zet die ertoe doet, vanaf zijn vijfde zet: in dit
     bewaarde potje speelt wit 5.Pxe5, en Turbo's d6xe5 krijgt de voorspelvraag; het blunderalarm
     staat uit, anders houdt dat 5.Pxe5 eerst tegen */
  const potjeVoorVraag = async (W, H) => {
    const zonderAlarm = JSON.parse(DOC);
    zonderAlarm.lww.guard = { v: false, t: 1 };
    await vers(W, H, { schaakheld1: JSON.stringify(zonderAlarm), 'schaakheld-potje': JSON.stringify({ v: 1, level: 2, moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5', 'd2d3', 'd7d6'],
      tips: 3, drawAsked: null, started: Date.now() - 600000, updated: Date.now() - 60000 }) });
    await klik('#verderKaart'); await page.waitForTimeout(500);
  };
  const foto = async (naam) => { if (${JSON.stringify(FOTOS)}) await page.screenshot({ path: ${JSON.stringify(FOTOS)} + '/' + naam + '.png' }); };
  const pagina = () => page.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth,
    H: innerHeight, W: innerWidth }));
  const laatsteOnder = () => page.evaluate(() => { const o = document.getElementById('onder'); if (!o) return null;
    const bs = [...o.querySelectorAll('button')].filter(b => b.getClientRects().length); const b = bs[bs.length - 1];
    if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });
`;

/* elk geval: een maat, een paginafunctie, en de regels die het meet */
const GEVALLEN = [];

for (const [W, H] of KLEIN) {
  GEVALLEN.push({ regels: ['[1.13] ' + W + 'x' + H + ': het weekdoelvenster met "Potjes met een vriend": bij elk aantal staat "Dat is mijn doel!" in beeld en is hij te tikken zonder te scrollen, en elke keuze erboven is met scrollen te bereiken'],
    code: `
      const n = '[1.13] ${W}x${H}: het weekdoelvenster met "Potjes met een vriend": bij elk aantal staat "Dat is mijn doel!" in beeld en is hij te tikken zonder te scrollen, en elke keuze erboven is met scrollen te bereiken';
      await vers(${W}, ${H});
      await klik('#weekStrip');
      await page.waitForTimeout(300);
      await klikTekst(/Potjes met een vriend/);
      await page.waitForTimeout(300);
      check(n, 'testopzet: het venster is hoger dan het scherm', await page.evaluate(() => { const o = document.getElementById('overlay'); return o.scrollHeight > o.clientHeight + 1; }));
      for (const aantal of [1, 2, 3]) {
        await page.evaluate(a => { const c = document.querySelector('#goalNs [data-n="' + a + '"]'); c.scrollIntoView({ block: 'center' }); }, aantal);
        await page.waitForTimeout(100);
        const keuze = await page.evaluate(a => { const c = document.querySelector('#goalNs [data-n="' + a + '"]'), r = c.getBoundingClientRect();
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && c.contains(e); }, aantal);
        check(n, 'het aantal ' + aantal + ' is met scrollen te bereiken en te tikken', keuze);
        await klik('#goalNs [data-n="' + aantal + '"]');
        await page.waitForTimeout(200);
        for (const plek of ['waar het venster na de keuze staat', 'bovenaan het venster']) {
          if (plek === 'bovenaan het venster') await page.evaluate(() => { document.getElementById('overlay').scrollTop = 0; });
          await page.waitForTimeout(100);
          const k = await page.evaluate(() => { const b = document.getElementById('goalOk'), r = b.getBoundingClientRect();
            const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { top: r.top, bottom: r.bottom, raak: !!e && b.contains(e) }; });
          check(n, 'aantal ' + aantal + ', ' + plek + ': de knop staat helemaal in beeld', k.top >= 0 && k.bottom <= ${H} + 0.5);
          check(n, 'aantal ' + aantal + ', ' + plek + ': en is daar te tikken', k.raak);
        }
      }
      const keuzes = await page.evaluate(() => [...document.querySelectorAll('#goalKinds .chip')].map(c => c.dataset.kind));
      for (const soort of keuzes) {
        const ok = await page.evaluate(s => { const c = document.querySelector('#goalKinds [data-kind="' + s + '"]'); c.scrollIntoView({ block: 'center' });
          const r = c.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && c.contains(e); }, soort);
        check(n, 'de keuze ' + soort + ' is met scrollen te bereiken en te tikken', ok);
      }
      await klikTekst(/Potjes met een vriend/);
      await klik('#goalNs [data-n="3"]');
      await page.evaluate(() => { document.getElementById('overlay').scrollTop = 0; });
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => { const b = document.getElementById('goalOk').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.mouse.click(r.x, r.y);
      await page.waitForTimeout(300);
      const doel = await page.evaluate(() => ({ dicht: document.getElementById('overlay').classList.contains('hidden'), doel: P.weekGoal }));
      check(n, 'een tik op de knop zonder te scrollen zet het doel: 3 potjes met een vriend', doel.dicht && !!doel.doel && doel.doel.kind === 'vriend' && doel.doel.n === 3);
      await page.evaluate(() => { P.weekGoal = null; goalFlow(); });
      await klikTekst(/Potjes met een vriend/);
      await page.evaluate(() => { document.getElementById('overlay').scrollTop = 0; });
      await page.waitForTimeout(150);
      await foto('weekdoel-${W}x${H}-boven');
      await page.evaluate(() => { const o = document.getElementById('overlay'); o.scrollTop = o.scrollHeight; });
      await page.waitForTimeout(150);
      await foto('weekdoel-${W}x${H}-onder');`
  });

  GEVALLEN.push({ regels: ['[1.13] ' + W + 'x' + H + ': het venster met je vorige weken: Klaar staat in beeld en is te tikken zonder te scrollen, en de bovenste week is met scrollen te bereiken'],
    code: `
      const n = '[1.13] ${W}x${H}: het venster met je vorige weken: Klaar staat in beeld en is te tikken zonder te scrollen, en de bovenste week is met scrollen te bereiken';
      await vers(${W}, ${H});
      await klik('#tabIk');
      await page.waitForTimeout(200);
      await klik('#weeksBtn');
      await page.waitForTimeout(300);
      check(n, 'testopzet: het venster is hoger dan het scherm', await page.evaluate(() => { const o = document.getElementById('overlay'); return o.scrollHeight > o.clientHeight + 1; }));
      const k = await page.evaluate(() => { const b = document.getElementById('weeksOk'), r = b.getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { top: r.top, bottom: r.bottom, raak: !!e && b.contains(e), scroll: document.getElementById('overlay').scrollTop }; });
      check(n, 'het venster staat bovenaan', k.scroll === 0);
      check(n, 'Klaar staat helemaal in beeld', k.top >= 0 && k.bottom <= ${H} + 0.5);
      check(n, 'en is daar te tikken', k.raak);
      const weken = await page.evaluate(() => [...document.querySelectorAll('#modalBox .goal')].map((w, i) => { w.scrollIntoView({ block: 'center' });
        const r = w.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && w.contains(e); }));
      check(n, 'elke week is met scrollen te bereiken (' + weken.length + ' weken)', weken.length >= 8 && weken.every(Boolean));
      await page.evaluate(() => { document.getElementById('overlay').scrollTop = 0; });
      await page.waitForTimeout(100);
      await foto('weken-${W}x${H}-boven');`
  });

  GEVALLEN.push({ regels: ['[1.14] ' + W + 'x' + H + ': de melding staat onderaan boven de tabbalk, bedekt de Verder-kaart niet en vangt geen tikken'],
    code: `
      const n = '[1.14] ${W}x${H}: de melding staat onderaan boven de tabbalk, bedekt de Verder-kaart niet en vangt geen tikken';
      await vers(${W}, ${H}, { 'schaakheld-potje': JSON.stringify({ v: 1, level: 1, moves: ['e2e4', 'e7e5'], tips: 3, drawAsked: null, started: 1, updated: 1 }) });
      await klik('#verderKaart');
      await page.waitForTimeout(400);
      await klik('#backBtn');
      await page.waitForTimeout(300);
      const t = await rect('#toast'), tab = await rect('.tabbar'), kaart = await rect('#verder');
      check(n, 'er staat een melding', !!t);
      check(n, 'boven de tabbalk, onderaan', !!t && !!tab && t.bottom <= tab.top + 0.5 && t.top > ${H} / 2);
      check(n, 'niet over de Verder-kaart', !!t && !!kaart && (t.top >= kaart.bottom || t.bottom <= kaart.top));
      check(n, 'vangt geen tikken', await page.evaluate(() => getComputedStyle(document.getElementById('toast')).pointerEvents === 'none'));`
  });

  GEVALLEN.push({ regels: ['[2.2] ' + W + 'x' + H + ': het bord blijft staan bij de voorspelvraag, een lange tip en een antwoord'],
    code: `
      const n = '[2.2] ${W}x${H}: het bord blijft staan bij de voorspelvraag, een lange tip en een antwoord';
      await potjeVoorVraag(${W}, ${H});
      let voor = await rect('#board');
      await klikTekst(/Speurbril/);
      await page.waitForTimeout(300);
      check(n, 'na een lange tip', gelijk(voor, await rect('#board')));
      await zet('f3e5');
      await page.waitForTimeout(1000);
      check(n, 'testopzet: de voorspelvraag staat er', await page.evaluate(() => /Welk stuk zet Turbo|Wat is Turbo van plan|Denk vooruit/.test(document.body.innerText)));
      check(n, 'bij de voorspelvraag', gelijk(voor, await rect('#board')));
      await klik('#backBtn');
      await page.waitForTimeout(300);
      await startOefening('scan');
      voor = await rect('#board');
      await klikTekst(/Klaar/);
      await page.waitForTimeout(500);
      check(n, 'na een antwoord', gelijk(voor, await rect('#board')));
      await vers(${W}, ${H});
      await startPotje();
      voor = await rect('#board');
      check(n, 'testopzet: de Denkwolk is aan te tikken', await klikTekst(/Denkwolk/));
      await page.waitForTimeout(400);
      check(n, 'bij de melding van de denkwolk', gelijk(voor, await rect('#board')));`
  });

  GEVALLEN.push({ regels: ['[3.4] ' + W + 'x' + H + ': de kop is één rij: de levelchip en ⚙ staan naast elkaar bovenin'],
    code: `
      const n = '[3.4] ${W}x${H}: de kop is één rij: de levelchip en ⚙ staan naast elkaar bovenin';
      await vers(${W}, ${H});
      const chip = await rect('#lvlChip'), gear = await rect('#setBtn');
      check(n, 'de levelchip en ⚙ staan er', !!chip && !!gear);
      check(n, 'naast elkaar, op één rij', !!chip && !!gear && chip.top < gear.bottom && gear.top < chip.bottom);
      check(n, 'in de bovenste 64 pixels (de bovenste rij is 56 hoog)', !!chip && !!gear && chip.bottom <= 64.5 && gear.bottom <= 64.5);`
  });

  GEVALLEN.push({ regels: ['[2.4] ' + W + 'x' + H + ': de uitleg staat onder het bord met Volgende in beeld, en het bord blijft waar het was'],
    code: `
      const n = '[2.4] ${W}x${H}: de uitleg staat onder het bord met Volgende in beeld, en het bord blijft waar het was';
      await vers(${W}, ${H});
      await startOefening('scan');
      const voor = await rect('#board');
      await klikTekst(/Klaar/);
      await page.waitForTimeout(500);
      const bord = await rect('#board');
      const volgende = await page.evaluate(() => { const o = document.getElementById('onder'); if (!o) return null;
        const b = [...o.querySelectorAll('button')].find(x => /Volgende/.test(x.textContent)); if (!b) return null;
        const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });
      check(n, 'het bord bewoog niet', gelijk(voor, bord));
      check(n, 'Volgende staat onder het bord, in beeld', !!volgende && !!bord && volgende.top >= bord.bottom - 0.5 && binnen(volgende, ${W}, ${H}));
      /* een vaste opdracht met een lange eerste reden: de toren op a1, aangevallen door de loper op c3, is gemist */
      await vers(${W}, ${H});
      await startOefening('scan');
      await page.evaluate(() => { const S = parseFEN('6k1/8/8/8/8/2b5/8/R5K1 w - - 0 1'); session.S = S;
        session.task = { S, type: 'attacked', targets: attackedPieces(S, 'w'), extra: null, details: null };
        session.phase = 'marking'; BD.marks.clear(); BD.mode = 'mark'; renderBoard(); });
      await klikTekst(/Klaar/);
      await page.waitForTimeout(500);
      const reden = await rect('#taskBox .e-body p, #taskBox .e-body li'), onder = await rect('#onder');
      check(n, 'de eerste reden staat helemaal in beeld', !!reden && !!onder && binnen(reden, ${W}, ${H}) &&
        reden.top >= onder.top - 0.5 && reden.bottom <= onder.bottom + 0.5);`
  });

  GEVALLEN.push({ regels: ['[2.4] ' + W + 'x' + H + ': elke vraag en elke uitleg van de opdrachten past, voor elke soort opdracht, en niets scrolt in de strook'],
    code: `
      const n = '[2.4] ${W}x${H}: elke vraag en elke uitleg van de opdrachten past, voor elke soort opdracht, en niets scrolt in de strook';
      for (const groep of ['scan', 'best3.best3', 'best3.safe', 'trucs', 'koning', 'opening.coach', 'opening.pad']) {
        await vers(${W}, ${H});
        const uit = await page.evaluate(async (groep) => {
          ({ scan: () => startDrill('scan'), 'best3.best3': () => startDrill('best3'), 'best3.safe': () => startDrill('best3'),
            trucs: () => startDrill('trucs'), koning: () => startDrill('koning'),
            'opening.coach': () => startOpening('coach', null), 'opening.pad': () => startOpening('pad', PADEN[0]) })[groep]();
          await new Promise(r => setTimeout(r, 1500));
          if (groep === 'best3.best3' || groep === 'best3.safe') {
            setTask(null); setOptions(null); BD.arrows = [];
            if (groep === 'best3.best3') buildBest3(); else buildSafe();
            await new Promise(r => setTimeout(r, 500));
          }
          if (typeof OPDRACHTEN === 'undefined') return ['er is geen tabel OPDRACHTEN'];
          const langsteHint = PADEN.map(p => p.hint).reduce((a, b) => a.concat(b), []).sort((a, b) => b.length - a.length)[0];
          const vul = t => (t || '').replace('{stuk}', 'koning').replace('{veld}', 'h8').replace('{zet}', 'Paard e4 → f6, slaat pion')
            .replace('{goed}', 'Er zijn twee goede zetten.').replace('{k}', '12').replace('{m}', '12').replace('{hint}', langsteHint);
          const fout = [];
          const r = e => e.getBoundingClientRect();
          for (const k of Object.keys(OPDRACHTEN).filter(k => k === groep || k.split('.')[0] === groep)) {
            opdracht(vul(OPDRACHTEN[k][0]), vul(OPDRACHTEN[k][1]));
            await new Promise(r => setTimeout(r, 30));
            const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble'), h = document.getElementById('hulpZin');
            if (st.scrollHeight > st.clientHeight + 1 || r(b).bottom > r(st).bottom + 0.5) fout.push(k + ': de vraag past niet in de strook');
            if (getComputedStyle(st).overflowY !== 'hidden') fout.push(k + ': de strook kan scrollen');
            if (OPDRACHTEN[k][1]) {
              if (!h || !h.getClientRects().length) fout.push(k + ': geen uitleg onder het bord');
              else if (h.scrollHeight > h.clientHeight + 1 || r(h).top < r(document.getElementById('board')).bottom - 0.5 || r(h).bottom > innerHeight + 0.5)
                fout.push(k + ': de uitleg staat niet helemaal in beeld onder het bord');
            }
            const knoppen = [...document.querySelectorAll('#onder button')].filter(x => x.getClientRects().length);
            const laatste = knoppen[knoppen.length - 1];
            if (laatste && r(laatste).bottom > innerHeight + 0.5) fout.push(k + ': de laatste knop onder het bord valt eraf');
          }
          return fout;
        }, groep);
        for (const f of uit) check(n, f, false);
        check(n, groep + ': gemeten', true);
      }`
  });


  const balk = '[3.11] ' + W + 'x' + H + ': de tabbalk is 64 hoog met drie gelijke tabs, elk woord op één regel, en de weekregel is een rij van 44';
  GEVALLEN.push({ regels: [balk], code: `
      const n = ${JSON.stringify(balk)};
      await vers(${W}, ${H});
      const tab = await rect('.tabbar');
      check(n, 'de tabbalk is 64 hoog', !!tab && Math.abs(tab.h - 64) < 0.5);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map(t => {
        const r = t.getBoundingClientRect(), z = document.createRange();
        z.selectNodeContents(t);
        const tops = new Set([...z.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
        return { w: r.width, h: r.height, woord: t.textContent.replace(/[^A-Za-z]/g, ''), regels: tops.size };
      }));
      check(n, 'drie tabs', tabs.length === 3);
      check(n, 'even breed', tabs.length === 3 && tabs.every(t => Math.abs(t.w - tabs[0].w) < 0.5));
      check(n, 'minstens 44 hoog', tabs.every(t => t.h >= 44));
      const woorden = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab .tab-woord')].map(w => {
        const z = document.createRange(); z.selectNodeContents(w);
        return new Set([...z.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
      }));
      check(n, 'elk woord op één regel', woorden.length === 3 && woorden.every(r => r === 1));
      const week = await rect('#weekStrip');
      check(n, 'de weekregel is 44 hoog', !!week && Math.abs(week.h - 44) < 0.5);
      check(n, 'zonder kaart eromheen', await page.evaluate(() => { const s = getComputedStyle(document.getElementById('weekStrip'));
        return s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopWidth === '0px' && s.boxShadow === 'none'; }));` });

  /* de langste tekst die de weekregel kan krijgen: winnen van Slaapkop Turbo of sterker, met het hoogste aantal */
  const lang = '[3.11] ' + W + 'x' + H + ': de weekregel blijft een rij van 44, ook met het langste weekdoel';
  GEVALLEN.push({ regels: [lang], code: `
      const n = ${JSON.stringify(lang)};
      const doc = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} },
        lww: { name: { v: 'Mees', t: 1 }, weekGoal: { v: { kind: 'wins', n: 3, lvl: 1 }, t: 1 } }, max: { best: 0, goal: {} }, friends: {}, loc: {} });
      await vers(${W}, ${H}, { schaakheld1: doc });
      const tekst = await page.evaluate(() => document.getElementById('weekStrip').textContent);
      check(n, 'testopzet: het langste doel staat erin', /van 3 keer winnen van .*Slaapkop Turbo of sterker/.test(tekst));
      const week = await rect('#weekStrip');
      check(n, 'de weekregel is 44 hoog', !!week && Math.abs(week.h - 44) < 0.5);` });
}

/* Ik met een grid van trofeeën, en elk label binnen zijn kaart */
for (const [W, H] of [[360, 640], [375, 553], [1024, 748]]) {
  const n = '[3.11] ' + W + 'x' + H + ': Ik: Grootmeester blijft in de levelkaart, en de trofeeën zijn tegels van minstens 88 breed die binnen hun kaart blijven';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await klik('#tabIk');
      await page.waitForTimeout(300);
      const kaart = await page.evaluate(() => { const r = document.getElementById('levelPath').closest('.home-card').getBoundingClientRect();
        return { left: r.left, right: r.right }; });
      const labels = await page.evaluate(() => [...document.querySelectorAll('#levelPath .lp-node')].map(e => {
        const z = document.createRange(); z.selectNodeContents(e); const rs = [...z.getClientRects()].filter(x => x.width > 0);
        return { links: Math.min(...rs.map(x => x.left)), rechts: Math.max(...rs.map(x => x.right)), tekst: e.textContent }; }));
      check(n, 'zeven levels', labels.length === 7);
      check(n, 'elk level binnen de kaart', labels.every(l => l.links >= kaart.left - 0.5 && l.rechts <= kaart.right + 0.5));
      const tegels = await page.evaluate(() => [...document.querySelectorAll('#badgeGrid > *')].map(e => {
        const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, w: r.width, sw: e.scrollWidth, cw: e.clientWidth }; }));
      const grid = await rect('#badgeGrid');
      check(n, 'veertien tegels', tegels.length === 14);
      check(n, 'elk minstens 88 breed', tegels.every(t => t.w >= 88 - 0.5));
      check(n, 'drie of meer naast elkaar', new Set(tegels.map(t => Math.round(t.top))).size <= 5);
      check(n, 'niets loopt eruit', !!grid && tegels.every(t => t.left >= grid.left - 0.5 && t.right <= grid.right + 0.5 && t.sw <= t.cw + 1));
      const p = await pagina();
      check(n, 'de pagina scrolt niet opzij', p.sw <= p.W + 1);` });
}

/* Spelen past, ook op 375x647 (de app met browserbalken, waar kinderen eerst twee keer moesten scrollen), en met
   een bewaard potje op de kaart; geen zin op Spelen wordt halverwege afgeknipt. Met een
   potje en een rondje bewaard is Spelen het krapst, en ook dan staan de spelknoppen boven de tabbalk. */
for (const [W, H] of [[360, 640], [375, 553], [375, 647]]) {
  const regels = ['[3.3] ' + W + 'x' + H + ': de Verder-kaart, de weekregel en beide spelknoppen staan boven de tabbalk',
    '[3.3] ' + W + 'x' + H + ': met een bewaard potje staan de kaart, de weekregel en beide spelknoppen ook boven de tabbalk, en niets is afgeknipt',
    '[3.11] ' + W + 'x' + H + ': met een bewaard potje en een bewaard rondje staan de kaart, de weekregel en beide spelknoppen boven de tabbalk, en niets is afgeknipt'];
  GEVALLEN.push({ regels, code: `
      const regels = ${JSON.stringify(regels)};
      const potje = JSON.stringify({ v: 1, level: 1, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], tips: 3, drawAsked: null, started: 1, updated: 1 });
      const rondje = JSON.stringify({ scan: { round: 2, earned: 6 } });
      const opslag = [{}, { 'schaakheld-potje': potje }, { 'schaakheld-potje': potje, 'schaakheld-rondjes': rondje }];
      for (let k = 0; k < 3; k++) {
        const n = regels[k];
        await vers(${W}, ${H}, opslag[k]);
        const tab = await rect('.tabbar');
        for (const s of ['#verder', '#weekStrip', '#spelTurbo', '#spelVriend']) {
          const r = await rect(s);
          check(n, s + ' boven de tabbalk', !!r && !!tab && r.top >= 0 && r.bottom <= tab.top + 0.5);
        }
        const t = {};
        for (const s of ['#verder', '#weekStrip', '#spelTurbo', '#spelVriend', '#oefen-scan', '#oefen-best3', '#oefen-trucs', '#oefen-koning', '#oefen-opening']) {
          const r = await rect(s);
          t[s] = r ? r.top : NaN;
        }
        check(n, 'van boven: de kaart, de weekregel, de twee spelknoppen, de vijf oefeningen onder elkaar',
          t['#verder'] < t['#weekStrip'] && t['#weekStrip'] < t['#spelTurbo'] && t['#spelTurbo'] <= t['#spelVriend'] &&
          t['#spelVriend'] < t['#oefen-scan'] && t['#oefen-scan'] < t['#oefen-best3'] && t['#oefen-best3'] < t['#oefen-trucs'] &&
          t['#oefen-trucs'] < t['#oefen-koning'] && t['#oefen-koning'] < t['#oefen-opening']);
        const geknipt = await page.evaluate(() => [...document.querySelectorAll('#view-spelen *')]
          .filter(e => e.getClientRects().length && e.children.length === 0 && e.textContent.trim() &&
            (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).overflow !== 'visible')
          .map(e => e.textContent.trim().slice(0, 30)));
        check(n, 'geen tekst afgeknipt' + (geknipt.length ? ': ' + geknipt.join(' | ') : ''), geknipt.length === 0);
      }` });
}

/* de hint is op elk veld te zien (de twee kleuren van een gekozen veld) en klopt hoogstens drie keer;
   een uitleg die verder gaat dan het vak, vervaagt aan de voet */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n6 = '[2.6] ' + W + 'x' + H + ': de hint is een tweekleurig teken op een licht veld, ook op een donker veld, en klopt hoogstens drie keer';
  const n4 = '[2.4] ' + W + 'x' + H + ': een uitleg die verder gaat dan het vak onder het bord, vervaagt aan de voet';
  GEVALLEN.push({ regels: [n6, n4], code: `
      const n6 = ${JSON.stringify(n6)}, n4 = ${JSON.stringify(n4)};
      const kleuren = new Set();
      for (const [fen, ans] of [['1k1r1b1r/1pp1ppp1/p1n4p/3pq1n1/8/P1NBP3/1PPPQPPP/R1B1R1K1 w - - 0 1', 'f2f4'], ['6k1/8/8/8/8/3N4/8/6K1 w - - 0 1', 'd3e5']]) {
        await vers(${W}, ${H});
        await startOefening('trucs');
        await page.evaluate(([fen, ans]) => { const S = parseFEN(fen);
          session.S = S; session.task = { S, type: 'vork', answers: [{ m: legalMoves(S).find(x => moveKey(x) === ans), info: null }], hintUsed: false };
          session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle'; renderBoard();
          setActions([{ label: '💡 Hint', cls: 'plain small hint', fn: trucHint, id: 'hint' }]); }, [fen, ans]);
        await klikTekst(/Hint/);
        await page.waitForTimeout(300);
        const h = await page.evaluate(() => { const c = document.querySelector('#board .cell.hero-pc'); if (!c) return null; const s = getComputedStyle(c);
          return { veld: c.classList.contains('dark') ? 'donker' : 'licht', bg: s.backgroundColor, schaduw: s.boxShadow, keer: s.animationIterationCount }; });
        check(n6, 'testopzet: een veld met de hint', !!h);
        if (h) kleuren.add(h.veld);
        if (h) check(n6, h.veld + ' veld: zacht geel, inkt en wit, drie keer (' + JSON.stringify(h) + ')',
          h.bg === 'rgb(255, 237, 184)' && h.schaduw.indexOf('rgb(23, 69, 111)') >= 0 && h.schaduw.indexOf('rgb(255, 255, 255)') >= 0 && h.keer === '3');
      }
      check(n6, 'testopzet: een licht en een donker veld', kleuren.size === 2);
      await vers(${W}, ${H});
      await startOefening('scan');
      await page.evaluate(() => { const S = parseFEN('6k1/8/8/p7/8/8/8/R2N2K1 w - - 0 1'), extra = sqFromAlg('a1');
        session.S = S; session.task = { S, type: 'mobility', targets: legalMoves(S).filter(m => m.from === extra).map(m => m.to), extra, details: null };
        session.phase = 'marking'; BD.marks.clear(); BD.glow.clear(); BD.glow.add(extra); BD.mode = 'mark'; renderBoard(); });
      for (const v of ['b2', 'f1', 'a7', 'd1', 'h8']) await veld(v);
      await klikTekst(/Klaar/);
      await page.waitForTimeout(1200);
      const u = await page.evaluate(() => { const e = document.querySelector('#taskBox .e-body'); if (!e) return null; const s = getComputedStyle(e);
        const eerste = e.querySelector('li, p');
        return { meer: e.scrollHeight > e.clientHeight + 1, masker: s.webkitMaskImage || s.maskImage || 'none', onder: s.paddingBottom,
          eersteOnder: eerste ? eerste.getBoundingClientRect().bottom : null, bodyOnder: e.getBoundingClientRect().bottom }; });
      check(n4, 'testopzet: een uitleg die verder gaat dan het vak', !!u && u.meer);
      if (u) check(n4, 'de voet vervaagt over 12 px, met 12 px ruimte eronder (' + u.masker + '; ' + u.onder + ')',
        u.masker !== 'none' && /gradient/.test(u.masker) && /100% - 12px/.test(u.masker) && u.onder === '12px');
      if (u) check(n4, 'de eerste reden blijft helemaal helder: hij eindigt boven de vervaging (' + u.eersteOnder + ' tegen ' + (u.bodyOnder - 12) + ')',
        u.eersteOnder != null && u.eersteOnder <= u.bodyOnder - 12 + 0.5);` });
}

/* een reden over een stuk is een punt in de lijst, ook met twee zinnen; de eerste zin
   past helemaal onder het bord, de tweede mag scrollen. De langste: een veld waar het paard niet heen kan, en een stuk dat niet gratis is. */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[5.5] ' + W + 'x' + H + ': de eerste zin van een reden over een stuk past onder het bord, ook als er een tweede zin volgt';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const gevallen = [
        ['een veld waar het paard niet heen kan', '6k1/8/8/8/3N4/8/8/6K1 w - - 0 1', 'mobility', 'd4', ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5', 'd6']],
        ['een stuk dat niet gratis is', '6k1/8/4p3/3n4/8/2N5/8/6K1 w - - 0 1', 'free', null, ['d5']]
      ];
      for (const [naam, fen, type, stuk, tikken] of gevallen) {
        await vers(${W}, ${H});
        await startOefening('scan');
        await page.evaluate(([fen, type, stuk]) => {
          const S = parseFEN(fen), extra = stuk ? sqFromAlg(stuk) : null, details = type === 'free' ? freePiecesEx(S) : null;
          const targets = type === 'mobility' ? legalMoves(S).filter(m => m.from === extra).map(m => m.to) : details.map(x => x.sq);
          session.S = S; session.task = { S, type, targets, extra, details };
          session.phase = 'marking'; BD.marks.clear(); BD.glow.clear(); if (extra != null) BD.glow.add(extra); BD.mode = 'mark'; renderBoard();
        }, [fen, type, stuk]);
        for (const v of tikken) await veld(v);
        await klikTekst(/Klaar/);
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => {
          const li = document.querySelector('#taskBox .e-body p, #taskBox .e-body li'), e = li && li.querySelector('.zin1'), o = document.getElementById('onder');
          if (!e || !o) return null;
          const a = e.getBoundingClientRect(), b = o.getBoundingClientRect();
          return { tekst: e.textContent, heel: li.textContent, top: a.top, bottom: a.bottom, left: a.left, right: a.right, w: a.width, h: a.height, onderTop: b.top, onderBottom: b.bottom };
        });
        check(n, naam + ': een reden met twee zinnen voorop (' + (r && r.heel) + ')', !!r && r.heel.length > r.tekst.length);
        if (r) check(n, naam + ': de eerste zin helemaal in beeld (' + r.tekst + ')', binnen(r, ${W}, ${H}) && r.top >= r.onderTop - 0.5 && r.bottom <= r.onderBottom + 0.5);
      }` });
}

/* de langste eerste reden na een antwoord van de Trucendoos, Red je stuk en Veilig of valstrik past helemaal onder het bord */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[5.5] ' + W + 'x' + H + ': de langste eerste reden van de Trucendoos, Red je stuk en Veilig of valstrik staat helemaal in beeld';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const zet1 = async (k) => { await veld(k.slice(0, 2)); await veld(k.slice(2, 4)); };
      const eersteReden = async () => page.evaluate(() => {
        const e = document.querySelector('#taskBox .e-body p, #taskBox .e-body li'), o = document.getElementById('onder');
        if (!e || !o) return null;
        const r = e.getBoundingClientRect(), ro = o.getBoundingClientRect();
        return { tekst: e.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
          over: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, onderTop: ro.top, onderBottom: ro.bottom };
      });
      const opdracht = (fen, type, ans, metHang) => page.evaluate(([fen, type, ans, metHang]) => {
        const S = parseFEN(fen), answers = ans.map(k => ({ m: legalMoves(S).find(x => moveKey(x) === k), info: null }));
        session.S = S;
        session.task = { S, type, answers, hintUsed: false };
        if (metHang) session.task.hang = threatDetails(S).filter(t => t.victim >= 300 && t.gain >= 250)[0];
        session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle'; renderBoard();
      }, [fen, type, ans, metHang]);
      const gevallen = [
        ['trucs', 'penning', '1r2kb1r/pp1qppp1/7p/n1pP4/2BN2n1/7P/PPPPQPP1/1RB1R1K1 w - - 0 1', 'c4b5', false],
        ['koning', 'stuk', '4k3/8/4b3/2n5/2B5/8/8/6K1 w - - 0 1', 'c4e6', true]
      ];
      for (const [soort, type, fen, k, metHang] of gevallen) {
        await vers(${W}, ${H});
        await startOefening(soort);
        await opdracht(fen, type, [k], metHang);
        await zet1(k);
        await page.waitForTimeout(3500);
        const r = await eersteReden();
        check(n, soort + ': een eerste reden (' + (r && r.tekst) + ')', !!r);
        if (r) check(n, soort + ': helemaal in beeld en niet afgeknipt', binnen(r, ${W}, ${H}) && !r.over && r.top >= r.onderTop - 0.5 && r.bottom <= r.onderBottom + 0.5);
      }
      /* Veilig of valstrik: een zet die mat toelaat, de langste eerste reden van die oefening */
      await vers(${W}, ${H});
      await startOefening('best3');
      await page.evaluate(async () => {
        const S = parseFEN('6k1/2b2ppp/3q4/8/8/5N2/PPP2PPP/3Q1RK1 w - - 0 1'), m = legalMoves(S).find(x => moveKey(x) === 'f3e1');
        makeMove(S, m); const mat = mateReply(S); unmakeMove(S);
        genSafeTask = () => ({ S, move: m, trap: true, punish: mat, mate: true, loss: 100 });
        setTask(null); setOptions(null); BD.arrows = [];
        buildSafe();
        await new Promise(r => setTimeout(r, 500));
      });
      await klikTekst(/Veilig/);
      await page.waitForTimeout(3500);
      const v = await eersteReden();
      check(n, 'veilig of valstrik: een eerste reden (' + (v && v.tekst) + ')', !!v);
      if (v) check(n, 'veilig of valstrik: helemaal in beeld en niet afgeknipt', binnen(v, ${W}, ${H}) && !v.over && v.top >= v.onderTop - 0.5 && v.bottom <= v.onderBottom + 0.5);` });
}

/* ook de langste eerste reden van Speurogen en van De Beste Zet (met de langste zetnaam) past helemaal onder het bord */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[5.5] ' + W + 'x' + H + ': de langste eerste reden van Speurogen en De Beste Zet staat helemaal in beeld';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const eersteReden = async () => page.evaluate(() => {
        const e = document.querySelector('#taskBox .e-body p, #taskBox .e-body li'), o = document.getElementById('onder');
        if (!e || !o) return null;
        const r = e.getBoundingClientRect(), ro = o.getBoundingClientRect();
        return { tekst: e.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
          over: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, onderTop: ro.top, onderBottom: ro.bottom };
      });
      const past = (soort, r) => {
        check(n, soort + ': een eerste reden (' + (r && r.tekst) + ')', !!r);
        if (r) check(n, soort + ': helemaal in beeld en niet afgeknipt', binnen(r, ${W}, ${H}) && !r.over && r.top >= r.onderTop - 0.5 && r.bottom <= r.onderBottom + 0.5);
      };
      await vers(${W}, ${H});
      await startOefening('scan');
      await page.evaluate(() => {
        const S = parseFEN('6k1/8/8/5n2/3R4/2P5/8/6K1 w - - 0 1'), details = threatDetails(S);
        session.S = S; session.task = { S, type: 'threat', targets: details.map(x => x.sq), extra: null, details };
        session.phase = 'marking'; BD.marks.clear(); BD.glow.clear(); BD.mode = 'mark'; renderBoard();
      });
      await veld('d4'); await veld('f5');
      await klikTekst(/Klaar/);
      await page.waitForTimeout(1200);
      past('speurogen', await eersteReden());
      await vers(${W}, ${H});
      await startOefening('best3');
      await page.evaluate(async () => {
        const S = parseFEN('r6k/1P6/8/8/8/8/8/6K1 w - - 0 1');
        const opts = ['g1f2', 'b7a8q', 'g1h2'].map(k => ({ m: legalMoves(S).find(x => moveKey(x) === k), deep: 0 }));
        genBest3 = () => ({ S, options: opts, best: opts[1] });
        setTask(null); setOptions(null); BD.arrows = [];
        buildBest3();
        await new Promise(r => setTimeout(r, 500));
      });
      await page.locator('.opt[data-i="1"]').click();
      await klikTekst(/Deze kies ik/);
      await page.waitForTimeout(3500);
      past('de beste zet', await eersteReden());` });
}

/* een lange naam in de groet breekt af in plaats van "…", en de rij blijft 40 tot 41 hoog */
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[3.11] ' + W + 'x' + H + ': de groet met een naam van veertien W\'s is heel, de rij is hoogstens 41 hoog en de spelknoppen staan boven de tabbalk';
  const doc = (loc) => JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'WWWWWWWWWWWWWW', t: 1 } },
    max: { best: 0, goal: {} }, friends: {}, loc });
  const docs = [['Hoi', doc({ weekSeen: '2026-W46' })], ['Welkom terug', doc({ weekSeen: '2026-W46', lastSeen: '2026-10-01' })]];
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      for (const [soort, d] of ${JSON.stringify(docs)}) {
        await vers(${W}, ${H}, { schaakheld1: d });
        const g = await page.evaluate(() => {
          const e = document.getElementById('groet'), rij = e.closest('.groet') || e.parentElement, s = getComputedStyle(e);
          return { tekst: e.textContent, over: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
            puntjes: s.textOverflow === 'ellipsis' && s.overflow === 'hidden' && s.whiteSpace === 'nowrap', h: rij.getBoundingClientRect().height };
        });
        check(n, soort + ': de groet met de hele naam (' + g.tekst + ')', g.tekst.indexOf(soort) === 0 && g.tekst.indexOf('WWWWWWWWWWWWWW') >= 0);
        check(n, soort + ': niet afgeknipt', !g.over && !g.puntjes);
        check(n, soort + ': de rij is hoogstens 41 hoog (' + g.h + ')', g.h <= 41.5);
        const tab = await rect('.tabbar');
        for (const s of ['#spelTurbo', '#spelVriend']) {
          const r = await rect(s);
          check(n, soort + ': ' + s + ' boven de tabbalk', !!r && !!tab && r.bottom <= tab.top + 0.5);
        }
      }` });
}

/* een tegel breekt een woord alleen bij een zacht afbreekstreepje, en niets loopt over */
{
  const n = '[3.11] 360x640: de trofeetegels, met alle namen en met alle opdrachten: niets loopt over en "meteen" blijft heel';
  const alles = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: { potje: true, winst: true, turbo2: true, raket: true, speurneus: true,
    detective: true, goudzoeker: true, orakel: true, zen: true, wolk: true, trucs: true, sterren: true, vlam: true, koning: true } },
    lww: { name: { v: 'Mees', t: 1 } }, max: { best: 0, goal: {} }, friends: {}, loc: {} });
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const meet = async () => page.evaluate(() => [...document.querySelectorAll('#badgeGrid .badge-tile')]
        .filter(t => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1).map(t => t.dataset.badge));
      await vers(360, 640, { schaakheld1: ${JSON.stringify(alles)} });
      await klik('#tabIk');
      await page.waitForTimeout(300);
      check(n, 'testopzet: alle veertien verdiend', await page.evaluate(() => document.querySelectorAll('#badgeGrid .badge-tile.verdiend').length) === 14);
      let over = await meet();
      check(n, 'met de namen loopt niets over' + (over.length ? ': ' + over.join(', ') : ''), over.length === 0);
      await vers(360, 640);
      await klik('#tabIk');
      await page.waitForTimeout(300);
      over = await meet();
      check(n, 'met de opdrachten loopt niets over' + (over.length ? ': ' + over.join(', ') : ''), over.length === 0);
      const heel = await page.evaluate(() => {
        const t = document.querySelector('#badgeGrid [data-badge="goudzoeker"]');
        const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
        for (let x = w.nextNode(); x; x = w.nextNode()) {
          const i = x.data.indexOf('meteen');
          if (i < 0) continue;
          const z = document.createRange(); z.setStart(x, i); z.setEnd(x, i + 6);
          return new Set([...z.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size === 1;
        }
        return false;
      });
      check(n, '"meteen" op één regel', heel);` });
}

/* een speelscherm opent met het hele bord in beeld, ook als het kind op Spelen
   eerst naar beneden scrolde (vroeger erfde het speelscherm die scroll). De
   andere maten meet de regel over het speelscherm van een oefening. */
for (const [W, H] of [[375, 553]]) {
  const n = '[1.8] ' + W + 'x' + H + ': een oefening die onderaan Spelen staat, opent met het hele bord in beeld';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      /* zoals een kind: naar beneden scrollen tot de rij onderaan in beeld staat,
         en dan tikken (een klik van playwright scrolt zelf, een tik niet) */
      const tikOnderaan = (...sels) => page.evaluate(ss => { for (const s of ss) { const e = document.querySelector(s);
        if (e && e.getClientRects().length) { e.scrollIntoView({ block: 'end' }); e.click(); return true; } } return false; }, sels);
      for (const k of ['scan', 'koning']) {
        await vers(${W}, ${H});
        check(n, 'testopzet: de rij ' + k + ' is aan te tikken', await tikOnderaan('#oefen-' + k, '.mode-card[data-mode="' + k + '"]'));
        await page.waitForTimeout(1200);
        check(n, k + ': het bord in beeld', binnen(await rect('#board'), ${W}, ${H}));
      }` });
}

for (const [W, H] of MATEN) {
  const potje = '[2.1] ' + W + 'x' + H + ': een potje: het bord en de laatste knop in beeld, de pagina scrolt niet';
  const oefening = '[2.1] ' + W + 'x' + H + ': een oefening: het bord en de laatste knop in beeld, de pagina scrolt niet';
  GEVALLEN.push({ regels: [potje, oefening], code: `
      const meet = async (n) => {
        const p = await pagina();
        check(n, 'het bord in beeld', binnen(await rect('#board'), ${W}, ${H}));
        check(n, 'de pagina is niet hoger of breder dan het venster', p.sh <= p.H + 1 && p.sw <= p.W + 1);
        check(n, 'de laatste knop onder het bord in beeld', binnen(await laatsteOnder(), ${W}, ${H}));
      };
      await vers(${W}, ${H});
      await startPotje();
      await meet(${JSON.stringify(potje)});
      await klik('#backBtn');
      await vers(${W}, ${H});
      await startOefening('scan');
      await meet(${JSON.stringify(oefening)});` });
}

/* de langste zinnen die in een potje in de strook kunnen staan: coach-tips, Turbo's
   trucs en de denkwolk; een zin die niet in twee regels past, staat een stap kleiner in drie */
const LANGE_ZINNEN = [
  'Coach-tip: haal je paarden en lopers van de achterste rij. Thuisblijvers doen niet mee! 🐎',
  'Kijk uit, een VORK! 🍴 Eén zet valt de koning, de dame en de toren tegelijk aan. Wat doe je hiertegen? 🐢',
  'Kijk uit, een SPIES! 🍢 De koning moet vluchten, en dan pak je wat erachter staat. Wat doe je hiertegen? 🐢',
  'De speurbril laat aangevallen stukken zien. Nu wordt er niks aangevallen, dus hij blijft op zak. 👓',
  'Oei, in deze droom ga jíj mat. 😅 Fijn dat je dat hier ontdekt: stapje terug en probeer wat anders!',
  'De verbinding met Sebastiaan1234 hapert… ⏳ Speel rustig door, zetten komen straks vanzelf goed.'
];
for (const [W, H] of KLEIN) {
  GEVALLEN.push({ regels: ['[2.2] ' + W + 'x' + H + ': de langste zinnen van een potje passen in de strook, zonder scrollen of afbreken, en het bord blijft staan'],
    code: `
      const n = '[2.2] ${W}x${H}: de langste zinnen van een potje passen in de strook, zonder scrollen of afbreken, en het bord blijft staan';
      await vers(${W}, ${H});
      await startPotje();
      const voor = await rect('#board');
      const fout = await page.evaluate(async (zinnen) => {
        const uit = [], st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
        for (const z of zinnen) {
          say(z);
          await new Promise(r => setTimeout(r, 30));
          if (getComputedStyle(st).overflowY !== 'hidden') uit.push('de strook kan scrollen');
          if (st.scrollHeight > st.clientHeight + 1 || b.getBoundingClientRect().bottom > st.getBoundingClientRect().bottom + 0.5)
            uit.push('past niet: ' + z.slice(0, 40));
        }
        return uit;
      }, ${JSON.stringify(LANGE_ZINNEN)});
      for (const f of fout) check(n, f, false);
      check(n, 'het bord bleef staan', gelijk(voor, await rect('#board')));`
  });

  GEVALLEN.push({ regels: ['[2.5] ' + W + 'x' + H + ': de eindkaart is dicht: geen veld of stuk schijnt erdoor'],
    code: `
      const n = '[2.5] ${W}x${H}: de eindkaart is dicht: geen veld of stuk schijnt erdoor';
      await vers(${W}, ${H});
      await startPotje();
      await klik('#meerBtn');
      await page.waitForTimeout(300);
      await klikTekst(/Opgeven/);
      await page.waitForTimeout(300);
      await klikTekst(/Ja, ik geef op/);
      await page.waitForTimeout(1500);
      const k = await page.evaluate(() => { const e = document.getElementById('eindkaart');
        if (!e || !e.getClientRects().length) return null; const c = getComputedStyle(e);
        return { bg: c.backgroundColor, op: c.opacity }; });
      check(n, 'testopzet: de eindkaart staat er', !!k);
      check(n, 'een witte, dichte achtergrond', !!k && k.bg === 'rgb(255, 255, 255)' && k.op === '1');`
  });

  GEVALLEN.push({ regels: ['[2.5] ' + W + 'x' + H + ': de kop van een oefening past op een regel: 1 van 5, de sterren en bewaard'],
    code: `
      const n = '[2.5] ${W}x${H}: de kop van een oefening past op een regel: 1 van 5, de sterren en bewaard';
      await vers(${W}, ${H});
      await startOefening('scan');
      await page.evaluate(() => { session.task.targets.forEach(sq => BD.marks.add(sq)); });
      await klikTekst(/Klaar/);
      await page.waitForTimeout(500);
      /* elk deel van de regel kort zichzelf in met "…", dus afgeknipt meet je per deel; de " · " ervoor houdt zijn spaties */
      const k = await page.evaluate(() => { const e = document.querySelector('.tegen-sub');
        const delen = [...e.children].filter(c => c.getClientRects().length && c.textContent);
        const tekst = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
        const ref = document.createElement('span'), cs = getComputedStyle(e);
        ref.style.cssText = 'position: fixed; left: 0; top: 0; white-space: pre; font-family: ' + cs.fontFamily + '; font-size: ' + cs.fontSize;
        ref.textContent = ' · '; document.body.appendChild(ref); const punt = ref.getBoundingClientRect().width; ref.remove();
        return { t: e.innerText, delen: delen.length, heel: delen.every(c => c.scrollWidth <= c.clientWidth + 1),
          gaten: delen.slice(1).map((c, i) => tekst(c).left - tekst(delen[i]).right), punt }; });
      check(n, 'testopzet: bewaard staat erin, met 1 van 5 en de sterren', /bewaard/.test(k.t) && k.delen === 3);
      check(n, 'niet afgeknipt', k.heel);
      check(n, 'tussen de delen " · " met een spatie aan beide kanten (' + k.gaten.map(Math.round) + ' voor ' + Math.round(k.punt) + ')',
        k.gaten.length === 2 && k.gaten.every(g => g >= k.punt - 1));`
  });
}

GEVALLEN.push({ regels: ['[2.6] 375x553: Turbo\'s stukken zijn donkergroen (#12402C)', '[2.4] 375x553: de hint laat ook de koning die schaak staat oplichten'],
  code: `
      const n1 = '[2.6] 375x553: Turbo\\'s stukken zijn donkergroen (#12402C)', n2 = '[2.4] 375x553: de hint laat ook de koning die schaak staat oplichten';
      await vers(375, 553);
      await startPotje();
      const kleur = await page.evaluate(() => { const e = document.querySelector('#board .pc.t'); return e ? getComputedStyle(e).color : null; });
      check(n1, 'de kleur van een stuk van Turbo', kleur === 'rgb(18, 64, 44)');
      await vers(375, 553);
      await startOefening('koning');
      /* de witte koning op g1 staat schaak van de toren op a1 en moet zelf weg, naar f2 */
      await page.evaluate(() => { const S = parseFEN('6k1/8/8/8/8/8/6PP/r5K1 w - - 0 1');
        const ans = legalMoves(S).filter(m => S.board[m.from] === 'K').map(m => ({ m, info: null }));
        session.S = S; session.task = { S, type: 'schaak', answers: ans, hintUsed: false };
        session.phase = 'puzzle'; session.tries = 0; BD.mode = 'puzzle'; BD.check = S.kings.w; renderBoard(); });
      await klikTekst(/Hint/);
      await page.waitForTimeout(300);
      const anim = await page.evaluate(() => { const c = document.getElementById('board').children; const f = 'abcdefgh'.indexOf('g');
        return getComputedStyle(c[7 * 8 + f]).animationName; });
      check(n2, 'het oplichten draait op de koning', /hero-glow/.test(anim || ''));`
});

/* elke soort opdracht, ook De Beste Zet met zijn keuzes, de
   openingsles met zijn meters en de denkwolk, op de maten waar het eerder misging */
/* een tweede tik op Volgende mag niet op een knop van de volgende opdracht landen (Hint, Klaar!, de keuzes) */
for (const [W, H] of KLEIN) {
  const regels = ['scan', 'best3', 'trucs', 'koning'].map(k => '[2.4] ' + W + 'x' + H + ': ' + k + ': waar Volgende stond, staat bij de volgende opdracht geen knop');
  GEVALLEN.push({ regels, code: `
      const regels = ${JSON.stringify(regels)};
      const soorten = ['scan', 'best3', 'trucs', 'koning'];
      for (let i = 0; i < soorten.length; i++) {
        const n = regels[i];
        await vers(${W}, ${H});
        await startOefening(soorten[i]);
        await page.evaluate(() => { session.phase = 'review'; BD.mode = 'off'; awardRound(0, 'Zo zit het', 'Een reden.'); });
        await page.waitForTimeout(300);
        const v = await page.evaluate(() => { const b = [...document.querySelectorAll('#onder button')].find(x => /Volgende/.test(x.textContent));
          if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
        check(n, 'testopzet: Volgende staat er', !!v);
        /* de valstrik-vraag heeft een zoekbudget en geeft soms niets, dan komt een keuze uit drie: een vaste reeks toevalsgetallen */
        if (soorten[i] === 'best3') await page.evaluate(() => { let s = 24; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0;
          let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        await klikTekst(/Volgende/);
        await page.waitForTimeout(1800);
        const raak = await page.evaluate(v => [...document.querySelectorAll('#onder button')].filter(b => b.getClientRects().length)
          .filter(b => { const r = b.getBoundingClientRect(); return r.left < v.right && r.right > v.left && r.top < v.bottom && r.bottom > v.top; })
          .map(b => b.textContent.trim()), v);
        check(n, 'geen knop op de plek van Volgende' + (raak.length ? ': ' + raak.join(', ') : ''), !!v && raak.length === 0);
        const hint = await page.evaluate(() => { const b = [...document.querySelectorAll('#onder button')].find(x => /Hint/.test(x.textContent) && x.getClientRects().length);
          if (!b) return null; const r = b.getBoundingClientRect(), o = document.getElementById('onder').getBoundingClientRect(); return { w: r.width, ow: o.width, left: r.left - o.left }; });
        if (hint) check(n, 'Hint houdt zijn eigen breedte, links', hint.w < hint.ow * 0.6 && hint.left < 24);
        if (soorten[i] !== 'best3') continue;
        /* van opdracht 2 (veilig of valstrik) naar 3: de drie keuzes vullen het vak en kunnen niet opzij, dus daar
           mag een keuze op de plek van Volgende staan; een tik in de eerste 350 ms telt dan niet */
        await page.evaluate(() => { session.phase = 'review'; BD.mode = 'off'; awardRound(0, 'Zo zit het', 'Een reden.'); });
        await page.waitForTimeout(300);
        const vroeg = await page.evaluate(async () => {
          const b = [...document.querySelectorAll('#onder button')].find(x => /Volgende/.test(x.textContent));
          if (!b) return null;
          const r = b.getBoundingClientRect(), v = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          b.click();
          const t0 = performance.now();
          while (!document.querySelector('.opt[data-i]') && performance.now() - t0 < 8000) await new Promise(k => requestAnimationFrame(k));
          const e = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2), knop = e && e.closest('button');
          if (knop) knop.click();
          return { v, ronde: session.round, gekozen: session.picked };
        });
        check(n, 'testopzet: van opdracht 2 naar 3, en dan De Beste Zet', !!vroeg && vroeg.ronde === 3);
        if (!vroeg) continue;
        check(n, 'van opdracht 2 naar 3: een tik op de plek van Volgende meteen daarna kiest niets', vroeg.gekozen == null);
        await page.waitForTimeout(1500);
        const raak3 = await page.evaluate(v => [...document.querySelectorAll('#onder button')].filter(b => b.getClientRects().length)
          .filter(b => { const r = b.getBoundingClientRect(); return r.left < v.right && r.right > v.left && r.top < v.bottom && r.bottom > v.top; })
          .map(b => (b.classList.contains('opt') ? 'keuze ' : '') + b.textContent.trim()), vroeg.v);
        check(n, 'van opdracht 2 naar 3: op de plek van Volgende staat hoogstens een keuze' + (raak3.length ? ': ' + raak3.join(', ') : ''),
          raak3.every(t => t.indexOf('keuze ') === 0));
      }`
  });

  GEVALLEN.push({ regels: ['[2.4] ' + W + 'x' + H + ': De Beste Zet: elke keuze is 56 hoog, ook met een zet van twee regels'],
    code: `
      const n = '[2.4] ${W}x${H}: De Beste Zet: elke keuze is 56 hoog, ook met een zet van twee regels';
      await vers(${W}, ${H});
      await startOefening('best3');
      await page.evaluate(() => { setTask(null); setOptions(null); BD.arrows = []; buildBest3();
        const z = document.querySelector('.opt .o-move'); if (z) z.textContent = 'Paard e4 → f6, slaat pion'; });
      await page.waitForTimeout(300);
      const h = await page.evaluate(() => [...document.querySelectorAll('.opt')].map(o => o.getBoundingClientRect().height));
      check(n, 'drie keuzes van 56: ' + h.map(x => Math.round(x)).join(', '), h.length === 3 && h.every(x => Math.abs(x - 56) < 1));
      check(n, 'Deze kies ik! in beeld', binnen(await laatsteOnder(), ${W}, ${H}));`
  });

  GEVALLEN.push({ regels: ['[2.4] ' + W + 'x' + H + ': na twee missers bij mat in twee staat de eerste reden helemaal in beeld'],
    code: `
      const n = '[2.4] ${W}x${H}: na twee missers bij mat in twee staat de eerste reden helemaal in beeld';
      await vers(${W}, ${H});
      await startOefening('trucs');
      await page.evaluate(() => { const S = parseFEN('k7/8/2K5/8/8/8/8/7R w - - 0 1');
        const ans = ['c6b6'].map(k => ({ m: legalMoves(S).find(x => moveKey(x) === k), info: null }));
        session.S = S; session.task = { S, type: 'mat2', answers: ans, hintUsed: false }; session.phase = 'puzzle'; session.tries = 0;
        BD.mode = 'puzzle'; renderBoard(); });
      /* na elke foute zet speelt Turbo eerst zijn antwoord, na de tweede volgt het voorspelen */
      for (const k of ['h1h2', 'h1h3']) {
        await page.evaluate(k => { const m = legalMoves(session.S).find(x => moveKey(x) === k); onCell(m.from); onCell(m.to); }, k);
        await page.waitForTimeout(7000);
      }
      const reden = await rect('#taskBox .e-body p, #taskBox .e-body li'), onder = await rect('#onder');
      check(n, 'testopzet: de uitleg staat er', !!reden);
      check(n, 'de eerste reden helemaal in beeld', !!reden && !!onder && binnen(reden, ${W}, ${H}) && reden.bottom <= onder.bottom + 0.5);`
  });

  GEVALLEN.push({ regels: ['[2.2] ' + W + 'x' + H + ': het schildpadje van de denkmeter loopt niet door een lange spelzin'],
    code: `
      const n = '[2.2] ${W}x${H}: het schildpadje van de denkmeter loopt niet door een lange spelzin';
      await vers(${W}, ${H});
      await startPotje();
      await page.evaluate(() => { say('Kijk uit, een SPIES! 🍢 De koning moet vluchten, en dan pak je wat erachter staat. Wat doe je hiertegen? 🐢');
        document.getElementById('patience').classList.remove('hidden'); });
      await page.waitForTimeout(200);
      const t = await rect('#bubble'), s = await rect('#patTurtle');
      check(n, 'testopzet: de zin en het schildpadje staan er', !!t && !!s);
      check(n, 'het schildpadje staat onder de tekst', !!t && !!s && s.top >= t.bottom - 0.5);`
  });

  GEVALLEN.push({ regels: ['[2.5] ' + W + 'x' + H + ': de eindkaart past op het bord: winst met trofeeën, verlies, remise en een potje dat niet telt'],
    code: `
      const n = '[2.5] ${W}x${H}: de eindkaart past op het bord: winst met trofeeën, verlies, remise en een potje dat niet telt';
      for (const [naam, uitslag, telt] of [['winst', { over: true, result: 'w', reason: 'mat' }, true], ['verlies', { over: true, result: 'b', reason: 'mat' }, true],
          ['remise', { over: true, result: 'd', reason: 'pat' }, true], ['telt niet', { over: true, result: 'b', reason: 'opgave' }, false]]) {
        await vers(${W}, ${H});
        await startPotje();
        await page.evaluate(([u, telt]) => { const S = session.S;
          for (let i = 0; telt && i < 24; i++) { const ms = legalMoves(S); makeMove(S, ms[i % ms.length]); }
          endGame(u); }, [uitslag, telt]);
        await page.waitForTimeout(1500);
        const k = await page.evaluate(() => { const e = document.getElementById('eindkaart');
          return e && e.getClientRects().length ? { sh: e.scrollHeight, ch: e.clientHeight, t: e.innerText } : null; });
        check(n, naam + ': testopzet, de eindkaart staat er', !!k);
        check(n, naam + ': alles past, niets scrolt in de kaart (' + (k ? k.sh + ' in ' + k.ch : '') + ')', !!k && k.sh <= k.ch + 1);
        if (naam === 'winst') check(n, 'winst: met een trofee', !!k && /Winnaar|Eerste potje/.test(k.t));
      }`
  });
}

/* een uitleg die langer is dan zijn vak, toont onderaan een pijltje, ook als de rand precies tussen twee redenen valt;
   het gaat weg als het kind tot het eind scrolt, en het komt niet als alles past */
const REDENEN_VIER = ['De beste was B: Paard b1 → c3.',
  'A: Paard f3 → e5, slaat pion. Turbo speelt dan Paard c6 → e5, slaat paard, en niemand kan terugpakken: je bent 2 punten kwijt.',
  'B: Paard b1 → c3. Veilig: daarna kan Turbo niets winnen.', 'C: Pion a2 → a3. Niet fout, maar de beste zet doet meer.'];
for (const [W, H] of [[768, 1024], [375, 553]]) {
  const n = '[2.4] ' + W + 'x' + H + ': een uitleg die langer is dan zijn vak, toont een pijltje tot het kind tot het eind scrolt';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const meer = () => page.evaluate(() => document.getElementById('onder').classList.contains('meer'));
      await vers(${W}, ${H});
      await startOefening('best3');
      await page.evaluate(r => { awardRound(0, 'Zo zit het', r); }, ${JSON.stringify(REDENEN_VIER)});
      await page.waitForTimeout(300);
      const u = await page.evaluate(() => { const e = document.querySelector('#onder .e-body'), o = document.getElementById('onder');
        const na = getComputedStyle(o, '::after');
        return e ? { meer: e.scrollHeight > e.clientHeight + 2, pijl: na.content !== 'none' && na.content !== 'normal', pijlOnder: parseFloat(na.bottom) } : null; });
      check(n, 'testopzet: de uitleg gaat verder dan het vak', !!u && u.meer);
      check(n, 'het pijltje staat er', await meer() && !!u && u.pijl);
      await page.evaluate(() => { const e = document.querySelector('#onder .e-body'); e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(200);
      check(n, 'tot het eind gescrold: geen pijltje', !(await meer()));
      await page.evaluate(() => { awardRound(0, 'Zo zit het', ['Een korte reden.']); });
      await page.waitForTimeout(300);
      check(n, 'past alles, dan geen pijltje', !(await meer()));` });
}

/* de lof en Turbo's zin passen samen in de drie regels van de strook tot de grens van 100 tekens: het langste paar dat
   mag, op het smalste scherm */
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[5.11] ' + W + 'x' + H + ': het langste paar van lof en zin dat de app samen toont, past in de strook';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await startPotje();
      const r = await page.evaluate(() => {
        const paren = ['Het was mijn paard. Kijk uit, een PENNING! 📌 De loper kan niet meer weg! Wat doe je hiertegen? 🐢',
          'Goed voorspeld! Ik pak je toren op d4 (5 punten). Pak je terug, dan krijg je maar 3 punten.'];
        const t = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble'), uit = [];
        for (const p of paren) { say(p); uit.push({ p, lang: Array.from(p).length, past: t.scrollHeight <= t.clientHeight + 1 && b.getBoundingClientRect().bottom <= t.getBoundingClientRect().bottom + 0.5 }); }
        return uit;
      });
      for (const x of r) {
        check(n, 'testopzet: hoogstens 100 tekens (' + x.lang + ')', x.lang <= 100);
        check(n, 'past heel in de strook: ' + x.p, x.past);
      }` });
}

/* de momenten met de langste zin en de langste regel voor de volgende keer; die zinnen zegt de strook bij de eerste en
   de laatste stap van het leermoment */
const LANGSTE_MOMENTEN = [['het langste moment', { kind: 'hang', moveNo: 23, stuk: 'loper', naar: 'f4', defender: 'loper', piece: 'paard', sq: 'e5', points: 3, used: true }],
  ['de langste regel voor de volgende keer', { kind: 'hang', moveNo: 23, piece: 'paard', sq: 'e5', points: 3, used: true }]];
/* de volste eindkaart van een potje tegen Turbo past op een klein bord: een winst op een niveau
   waar Turbo moe is, drie nieuwe trofeeën, een nieuw level en de knop naar het moment, met de langste tekst die hij
   kan hebben; de zin dat Turbo moe is staat in de strook, heel, en het bord blijft staan */
const KNOPPEN_NAAR_MOMENT = [['Leermoment', { kind: 'hang', moveNo: 23, piece: 'paard', sq: 'e5', points: 3, used: true }],
  ['Dit was een topzet', { kind: 'goed', moveNo: 23, piece: 'dame', winst: 900, gain: 950, used: true }]];
for (const [W, H] of [[375, 553], [360, 640], [375, 647]]) {
  const n = '[2.5] ' + W + 'x' + H + ': de volste eindkaart tegen Turbo past: titel, de knop naar het moment, trofeeën en beide knoppen in beeld, Turbo\'s moe-zin heel in de strook';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      for (const [wat, moment] of ${JSON.stringify(KNOPPEN_NAAR_MOMENT)}) {
      await vers(${W}, ${H});
      await startPotje();
      const voor = await rect('#board');
      await page.evaluate(moment => { const S = session.S;
        for (let i = 0; i < 24; i++) { const ms = legalMoves(S); makeMove(S, ms[i % ms.length]); }
        ensureDay(); P.day.winsByLvl[session.level] = 2;
        const lang = LEVELS.reduce((a, b, i) => b.n.length > LEVELS[a].n.length ? i : a, 1);
        /* het level met de langste naam als vierde ding op de kaart (een level met een poort haalt de proef niet echt) */
        P.lastLevel = levelIdx(P.xp + 15); bewaarVoorKaart({ e: LEVELS[lang].g, n: 'Level ' + LEVELS[lang].n });
        /* precies drie nieuwe trofeeën en een level: alle andere staan al getoond */
        BADGES.forEach(b => { P.badges[b.id] = true; if (!P.shownBadges.includes(b.id)) P.shownBadges.push(b.id); });
        BADGES.slice(0, 3).forEach(b => bewaarVoorKaart(b));
        sleutelMoment = () => moment;
        endGame({ over: true, result: 'w', reason: 'mat' }); }, moment);
      await page.waitForTimeout(1600);
      const k = await page.evaluate(wat => { const e = document.getElementById('eindkaart'); if (!e || !e.getClientRects().length) return null;
        const r = x => { const b = x.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
        const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
        const leer = [...e.querySelectorAll('.btn')].find(x => x.textContent.includes(wat));
        return { sh: e.scrollHeight, ch: e.clientHeight, kaart: r(e), titel: r(e.querySelector('h2')), knoppen: [...e.querySelectorAll('.ek-btns .btn')].map(r),
          leer: leer ? r(leer) : null, trofeeen: e.querySelectorAll('.ek-badge').length, tekst: e.innerText,
          strook: b.textContent, strookPast: st.scrollHeight <= st.clientHeight + 1 && b.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5 }; }, wat);
      check(n, wat + ', testopzet: de eindkaart met vier dingen erop en de knop', !!k && k.trofeeen === 4 && !!k.leer);
      if (!k) continue;
      const binnenKaart = x => x.top >= k.kaart.top - 0.5 && x.bottom <= k.kaart.bottom + 0.5;
      check(n, wat + ': niets scrolt in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, wat + ': de titel in beeld', binnen(k.titel, ${W}, ${H}) && binnenKaart(k.titel));
      check(n, wat + ': de knop in de kaart, in beeld en minstens 44 hoog', !!k.leer && binnen(k.leer, ${W}, ${H}) && binnenKaart(k.leer) && k.leer.h >= 44);
      check(n, wat + ': beide knoppen in de kaart, in beeld en minstens 44 hoog', k.knoppen.length === 2 && k.knoppen.every(x => binnen(x, ${W}, ${H}) && binnenKaart(x) && x.h >= 44));
      check(n, wat + ': de moe-zin staat niet op de kaart', k.tekst.indexOf('Ik ben moe') < 0);
      check(n, wat + ': de moe-zin staat heel in de strook (' + k.strook + ')', /^Ik ben moe van al dat verliezen/.test(k.strook) && k.strookPast);
      check(n, wat + ': het bord bleef staan', gelijk(voor, await rect('#board')));
      }` });
}

/* het bord bekijken na het einde: de knop onder het bord past zonder dat het scherm scrolt, met de kaart opzij staat het
   hele bord op zijn plek met Uitslag eronder, en het venster na een openingsles past met zijn vier knoppen */
for (const [W, H] of KLEIN) {
  const n = '[2.9] ' + W + 'x' + H + ': na het einde passen Bekijk het bord en Uitslag onder het bord, het bord staat heel in beeld, en het venster na een les past';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await startPotje();
      const voor = await rect('#board');
      await page.evaluate(() => endGame({ over: true, result: 'w', reason: 'mat' }));
      await page.waitForTimeout(1600);
      const knop = tekst => page.evaluate(t => { const b = [...document.querySelectorAll('#actionRow .btn')].find(x => x.textContent.includes(t));
        if (!b || !b.getClientRects().length) return null;
        const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, tekst);
      const scrolt = () => page.evaluate(() => { const p = document.getElementById('play');
        return p.scrollHeight > p.clientHeight + 0.5 || document.scrollingElement.scrollHeight > innerHeight + 0.5; });
      await foto('2.9-${W}x${H}-kaart');
      const bk = await knop('Bekijk het bord');
      check(n, 'Bekijk het bord onder het bord, in beeld en minstens 44 hoog', !!bk && binnen(bk, ${W}, ${H}) && bk.h >= 44);
      check(n, 'met de kaart scrolt er niets', !(await scrolt()));
      await page.evaluate(() => bekijkBord());
      await page.waitForTimeout(100);
      await foto('2.9-${W}x${H}-bord');
      check(n, 'de kaart ligt opzij', await page.evaluate(() => !document.getElementById('eindkaart').getClientRects().length));
      const bord = await rect('#board'), ui = await knop('Uitslag');
      check(n, 'het hele bord in beeld en op zijn plek', binnen(bord, ${W}, ${H}) && gelijk(voor, bord));
      check(n, 'Uitslag in beeld en minstens 44 hoog', !!ui && binnen(ui, ${W}, ${H}) && ui.h >= 44);
      check(n, 'met het bord scrolt er niets', !(await scrolt()));
      await page.evaluate(() => { goHome(); startOpening('coach'); });
      await page.waitForTimeout(300);
      await page.evaluate(() => openingEnd());
      await page.waitForTimeout(600);
      await foto('2.9-${W}x${H}-les');
      const v = await page.evaluate(() => [...document.querySelectorAll('#modalBox .m-btns .btn')].map(b => { const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }));
      check(n, 'het venster na een les: vier knoppen, allemaal in beeld en minstens 44 hoog', v.length === 4 && v.every(x => binnen(x, ${W}, ${H}) && x.h >= 44));
      await page.evaluate(() => document.getElementById('opBord').click());
      await page.waitForTimeout(200);
      await foto('2.9-${W}x${H}-lesbord');
      const onder = await page.evaluate(() => { const o = document.getElementById('onder'); return o.scrollHeight <= o.clientHeight + 0.5; });
      const ui2 = await knop('Uitslag'), bord2 = await rect('#board');
      check(n, 'na de les met het venster opzij: het bord heel in beeld, Uitslag in beeld, en niets scrolt', binnen(bord2, ${W}, ${H}) &&
        !!ui2 && binnen(ui2, ${W}, ${H}) && onder && !(await scrolt()));` });
}

/* het leermoment bekijken: de knop past op de kaart, en bij elke stap staat het hele bord op zijn plek, past de zin in de
   strook en staan de twee knoppen onder het bord in beeld; ook de langste samenvattingen, regels voor de volgende keer
   en zinnen van stap 2 passen. Hier loopt de animatie van een zet echt, dus ook een tweede tik op Verder en Uitslag
   midden in een zet. */
for (const [W, H] of KLEIN) {
  const n = '[2.10] ' + W + 'x' + H + ': het leermoment bekijken: de knop op de kaart en bij elke stap het bord, de zin en de knoppen in beeld, zonder scrollen';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await startPotje();
      const voor = await rect('#board');
      await page.evaluate(() => { const S = session.S;
        for (const k of ['e2e4', 'f7f6', 'f1a6', 'b7a6', 'd2d4', 'g7g5', 'd1h5']) makeMove(S, legalMoves(S).find(x => moveKey(x) === k));
        renderBoard();
        endGame({ over: true, result: 'w', reason: 'mat' }); });
      await page.waitForTimeout(1600);
      const knopIn = (sel, t) => page.evaluate(([sel, t]) => { const b = [...document.querySelectorAll(sel)].find(x => x.textContent.includes(t));
        if (!b || !b.getClientRects().length) return null;
        const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, [sel, t]);
      const tik = (sel, t) => page.evaluate(([sel, t]) => [...document.querySelectorAll(sel)].find(x => x.textContent.includes(t)).click(), [sel, t]);
      const scrolt = () => page.evaluate(() => { const p = document.getElementById('play');
        return p.scrollHeight > p.clientHeight + 0.5 || document.scrollingElement.scrollHeight > innerHeight + 0.5; });
      const strookPast = () => page.evaluate(() => { const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
        return st.scrollHeight <= st.clientHeight + 1 && b.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5; });
      await foto('2.10-${W}x${H}-kaart');
      const bz = await knopIn('#eindkaart .btn', 'Leermoment');
      check(n, 'Leermoment op de kaart, in beeld en minstens 44 hoog', !!bz && binnen(bz, ${W}, ${H}) && bz.h >= 44);
      check(n, 'niets scrolt in de kaart', await page.evaluate(() => { const e = document.getElementById('eindkaart'); return e.scrollHeight <= e.clientHeight + 1; }));
      await tik('#eindkaart .btn', 'Leermoment');
      for (let stap = 1; stap <= 3; stap++) {
        await page.waitForTimeout(stap === 1 ? 300 : 1500);
        await foto('2.10-${W}x${H}-stap' + stap);
        const bord = await rect('#board');
        check(n, 'stap ' + stap + ': het hele bord in beeld en op zijn plek', binnen(bord, ${W}, ${H}) && gelijk(voor, bord));
        check(n, 'stap ' + stap + ': de zin past heel in de strook', await strookPast());
        const eerste = await knopIn('#actionRow .btn', stap < 3 ? 'Verder' : 'Nog eens'), ui = await knopIn('#actionRow .btn', 'Uitslag');
        check(n, 'stap ' + stap + ': beide knoppen onder het bord in beeld en minstens 44 hoog', !!eerste && !!ui && [eerste, ui].every(x => binnen(x, ${W}, ${H}) && x.h >= 44));
        check(n, 'stap ' + stap + ': niets scrolt', !(await scrolt()));
        if (stap < 3) await tik('#actionRow .btn', 'Verder');
      }
      const lang = await page.evaluate(momenten => {
        const zinnen = ['Dit had ik kunnen spelen: <b>Pion b2 → a1, slaat toren, promotie</b>.',
          'Dit kon ook: <b>Pion b7 → a8, slaat toren, promotie</b>.',
          momentTekst({ kind: 'truc', moveNo: 23, truc: 'aftrekaanval', used: true }).tekst,
          momentTekst({ kind: 'truc', moveNo: 23, truc: 'vork', used: true, doelen: ['toren', 'dame'], stukTurbo: 'paard' }).tekst,
          momentTekst({ kind: 'slag', moveNo: 23, piece: 'dame', sq: 'e5', by: 'paard', verlies: 600, loss: 600, used: true, terug: false }).tekst,
          momentTekst({ kind: 'gemist', moveNo: 23, mateWith: 'b7a8', matNaam: 'Pion b7 → a8, slaat toren, promotie' }).tekst];
        for (const m of momenten) zinnen.push(momentTekst(m[1]).tekst, momentTekst(m[1]).volgende);
        const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
        return zinnen.map(p => { say(p); return { p, past: st.scrollHeight <= st.clientHeight + 1 && b.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5 }; });
      }, ${JSON.stringify(LANGSTE_MOMENTEN)});
      check(n, 'testopzet: tien zinnen', lang.length === 10);
      for (const x of lang) check(n, 'past heel in de strook: ' + x.p, x.past);
      const stand = () => page.evaluate(() => ({ zetten: session.S.hist.length, strook: document.getElementById('bubble').textContent, pijlen: BD.arrows.length,
        kaart: !!document.getElementById('eindkaart').getClientRects().length, geesten: document.querySelectorAll('.ghost').length }));
      await tik('#actionRow .btn', 'Uitslag');
      await page.waitForTimeout(300);
      const terug = await stand();
      check(n, 'Uitslag: de kaart op het bord zoals het eindigde, en de strook zegt weer Gewonnen!', terug.kaart && terug.zetten === 7 && terug.strook === 'Gewonnen!' && terug.pijlen === 0);
      await tik('#eindkaart .btn', 'Leermoment');
      await page.waitForTimeout(300);
      check(n, 'testopzet: de animatie loopt echt', await page.evaluate(() => !RM));
      const vliegend = await page.evaluate(() => { const b = () => [...document.querySelectorAll('#actionRow .btn')].find(x => x.textContent.includes('Verder'));
        b().click(); b().click(); return document.querySelectorAll('.ghost').length; });
      check(n, 'twee tikken op Verder: één stuk vliegt (' + vliegend + ')', vliegend === 1);
      await page.waitForTimeout(1500);
      const twee = await stand();
      check(n, 'en de zet staat één keer, bij stap 2 (' + twee.zetten + ', ' + twee.strook + ')', twee.zetten === 3 && /^Toen speelde ik /.test(twee.strook) && twee.geesten === 0);
      await page.evaluate(() => { [...document.querySelectorAll('#actionRow .btn')].find(x => x.textContent.includes('Verder')).click();
        [...document.querySelectorAll('#actionRow .btn')].find(x => x.textContent.includes('Uitslag')).click(); });
      await page.waitForTimeout(1500);
      const midden = await stand();
      check(n, 'Uitslag midden in een zet: de zet valt weg en de kaart staat op het bord zoals het eindigde (' + midden.zetten + ')',
        midden.kaart && midden.zetten === 7 && midden.strook === 'Gewonnen!' && midden.pijlen === 0 && midden.geesten === 0);` });
}

/* het speelscherm van een oefening is precies zo hoog als het venster, en het vak onder het bord past precies om
   een uitleg van drie regels met de knoppen eronder (op een kort scherm is dat vak 120 hoog) */
for (const [W, H] of KLEIN) {
  const n = '[2.1] ' + W + 'x' + H + ': een oefening: het speelscherm en het vak onder het bord passen precies, ook met drie regels uitleg';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await startOefening('scan');
      const uit = await page.evaluate(async () => {
        const fout = [], o = document.getElementById('onder'), p = document.getElementById('play'), h = document.getElementById('hulpZin');
        const zinnen = Object.keys(OPDRACHTEN).filter(k => k.startsWith('scan')).map(k => OPDRACHTEN[k]);
        zinnen.push([zinnen[0][0], 'Een zin van drie regels: tik elk stuk aan dat Turbo kan slaan, en kijk ook naar de stukken die al gedekt lijken.']);
        let drie = false;
        for (const [vraag, zin] of zinnen) {
          opdracht(vraag, zin);
          await new Promise(r => setTimeout(r, 30));
          const regels = Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight));
          drie = drie || regels >= 3;
          if (o.scrollHeight > o.clientHeight + 0.5) fout.push('het vak onder het bord: ' + o.scrollHeight + ' in ' + o.clientHeight + ' (' + regels + ' regels)');
          if (p.scrollHeight > p.clientHeight + 0.5) fout.push('het speelscherm: ' + p.scrollHeight + ' in ' + p.clientHeight);
        }
        return { fout, drie };
      });
      check(n, 'testopzet: een uitleg van drie regels gemeten', uit.drie);
      for (const f of uit.fout) check(n, f, false);` });
}

/* een vriendschapsvraag in de eindkaart past, met één hoofdknop en zonder dubbele knop */
for (const [W, H] of KLEIN) {
  const n = '[4.7] ' + W + 'x' + H + ': een vriendschapsvraag in de eindkaart: alles past, één hoofdknop, en Vrienden worden staat er niet nog eens';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      const k = await page.evaluate(async () => {
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: 'Fien', open: true, weg: false, gameId: 'potje-test-1', peerOn: true };
        Object.assign(MP, vrBegin(1));
        mpBeginGame();
        endGame({ over: true, result: 'b', reason: 'opgave' });
        await new Promise(r => setTimeout(r, 300));
        MP.anderKent = true; vrKrijg({ sessie: 1, pub: 'A'.repeat(87), wil: 1, nee: 0, zag: 0, voor: null });
        await new Promise(r => setTimeout(r, 300));
        const e = document.getElementById('eindkaart');
        const zichtbaar = [...e.querySelectorAll('button')].filter(b => b.getClientRects().length);
        return { sh: e.scrollHeight, ch: e.clientHeight, vraag: /wil vrienden worden/.test(e.innerText),
          hoofd: zichtbaar.filter(b => b.classList.contains('sun')).length,
          dubbel: zichtbaar.some(b => /Vrienden worden/.test(b.textContent)) };
      });
      check(n, 'testopzet: de vraag staat in de kaart', k.vraag);
      check(n, 'alles past in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, 'één hoofdknop (' + k.hoofd + ')', k.hoofd === 1);
      check(n, 'Vrienden worden staat er niet naast Ja', !k.dubbel);` });
}

/* de volle kaart van een potje tussen kinderen: een potje dat telt (dus met de regel over wat telde), de trofee van
   het eerste potje, de vriendschapsvraag en een naam van veertien letters, gewonnen of verloren; en het voller: het
   vierde potje van vandaag met dit kind dat ook het weekdoel haalt; de zin dat het vandaag nog 15 XP geeft, staat dan in
   de strook boven het bord, in hoogstens drie regels, en het bord blijft staan */
for (const [W, H, uitslag, vol] of [[360, 640, 'w'], [375, 553, 'w'], [375, 647, 'w'], [360, 780, 'w'], [360, 640, 'b'], [360, 780, 'b'],
  [360, 640, 'b', true], [375, 553, 'b', true], [375, 647, 'b', true], [360, 780, 'b', true]]) {
  const n = '[4.7] ' + W + 'x' + H + ': de volle eindkaart van een potje tussen kinderen, ' + (uitslag === 'w' ? 'gewonnen' : 'verloren') +
    (vol ? ', het vierde potje van vandaag dat ook het weekdoel haalt' : '') + ', met een trofee, de vriendschapsvraag en een lange naam: alles past';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      const k = await page.evaluate(async (vol) => {
        if (vol) { setPref('weekGoal', { kind: 'vriend', n: 1 }); ensureDay(); P.day.vriend = { 'naam:Maximiliaantje': 3 }; saveP(); }
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: 'Maximiliaantje', open: true, weg: false, gameId: 'potje-test-1', peerOn: true };
        Object.assign(MP, vrBegin(1));
        mpBeginGame();
        await new Promise(r => setTimeout(r, 300));
        const bord = () => { const r = document.getElementById('board').getBoundingClientRect(); return [r.top, r.left, r.width, r.height].map(Math.round).join(); };
        const bordVoor = bord();
        const S = session.S;
        for (let i = 0; i < 24; i++) { const ms = legalMoves(S); makeMove(S, ms[i % ms.length]); }
        endGame({ over: true, result: ${JSON.stringify(uitslag)}, reason: 'mat' });
        await new Promise(r => setTimeout(r, 300));
        MP.anderKent = true; vrKrijg({ sessie: 1, pub: 'A'.repeat(87), wil: 1, nee: 0, zag: 0, voor: null });
        await new Promise(r => setTimeout(r, 1200));
        const st = document.querySelector('#strook .s-txt'), bub = document.getElementById('bubble');
        const strook = { tekst: bub.textContent, regels: Math.round(bub.getBoundingClientRect().height / parseFloat(getComputedStyle(bub).lineHeight)),
          past: st.scrollHeight <= st.clientHeight + 1, bordStil: bord() === bordVoor };
        const e = document.getElementById('eindkaart'), er = e.getBoundingClientRect();
        const knoppen = [...e.querySelectorAll('button')].filter(b => b.getClientRects().length);
        return { sh: e.scrollHeight, ch: e.clientHeight, vraag: /Maximiliaantje wil vrienden worden/.test(e.innerText),
          trofee: e.querySelectorAll('.ek-badge').length, telde: [...e.querySelectorAll('p')].some(p => /XP|telt/.test(p.textContent)),
          vol: /nog 15 XP per potje/.test(strook.tekst) && !/nog 15 XP per potje/.test(e.innerText) && /Je weekdoel is gehaald/.test(e.innerText), strook,
          onder: Math.max(...knoppen.map(b => b.getBoundingClientRect().bottom)) - er.bottom };
      }, ${!!vol});
      check(n, 'testopzet: een potje dat telde, een trofee en de vraag met de lange naam', k.vraag && k.trofee >= 1 && k.telde);
      if (${!!vol}) {
        check(n, 'testopzet: de zin over 15 XP in de strook en niet op de kaart, het weekdoel op de kaart', k.vol);
        check(n, 'de zin in de strook: hoogstens drie regels (' + k.strook.regels + '), zonder scrollen', k.strook.regels <= 3 && k.strook.past);
        check(n, 'het bord blijft staan', k.strook.bordStil);
      }
      check(n, 'alles past in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, 'geen knop onder de rand van de kaart (' + Math.round(k.onder) + ' px)', k.onder <= 1);` });
}

/* [V9] de eindkaart van een potje tussen vrienden dat met de 500e halve zet remise werd, met de zin over de marathon */
for (const [W, H] of [[360, 640], [375, 553], [390, 844], [768, 1004]]) {
  const n = '[V9] ' + W + 'x' + H + ': de eindkaart van de remise na 250 zetten: de zin over de marathon staat erop, alles past, en geen knop valt eronder';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      const k = await page.evaluate(async () => {
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: 'Maximiliaantje', open: true, weg: false, gameId: 'potje-test-1', peerOn: true };
        mpBeginGame();
        await new Promise(r => setTimeout(r, 300));
        const S = session.S;
        for (let i = 0; i < 24; i++) { const ms = legalMoves(S); makeMove(S, ms[i % ms.length]); }
        endGame({ over: true, result: 'd', reason: 'lang' });
        await new Promise(r => setTimeout(r, 1200));
        const e = document.getElementById('eindkaart'), er = e.getBoundingClientRect();
        const knoppen = [...e.querySelectorAll('button')].filter(b => b.getClientRects().length);
        return { sh: e.scrollHeight, ch: e.clientHeight, tekst: e.innerText, onder: Math.max(...knoppen.map(b => b.getBoundingClientRect().bottom)) - er.bottom };
      });
      check(n, 'de zin over de marathon', /Remise: dit potje duurde 250 zetten, en langer kan niet\. Wat een marathon!/.test(k.tekst) && /Gelijkspel!/.test(k.tekst));
      check(n, 'alles past in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, 'geen knop onder de rand van de kaart (' + Math.round(k.onder) + ' px)', k.onder <= 1);` });
}

/* in een kleine eindkaart krimpen de knoppen niet: elke knop is minstens 44 hoog */
for (const [W, H] of KLEIN) {
  const n = '[2.5] ' + W + 'x' + H + ': elke knop van de eindkaart is minstens 44 hoog, ook met trofeeën of een vriendschapsvraag';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const meet = () => page.evaluate(() => [...document.getElementById('eindkaart').querySelectorAll('button')]
        .filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height * 10) / 10));
      /* een deel dat kleiner is dan wat erin staat, is ingekrompen */
      const gekrompen = () => page.evaluate(() => [...document.getElementById('eindkaart').children]
        .filter(c => c.getClientRects().length && c.getBoundingClientRect().height + 0.5 < c.scrollHeight).map(c => c.className || c.id));
      await vers(${W}, ${H});
      await startPotje();
      /* een volle kaart: winst, acht trofeeën en een level */
      await page.evaluate(() => { const S = session.S;
        for (let i = 0; i < 24; i++) { const ms = legalMoves(S); makeMove(S, ms[i % ms.length]); }
        ['wolk', 'vlam', 'orakel', 'zen', 'trucs', 'sterren', 'detective', 'goudzoeker'].forEach(addBadge); bump('xp', 140);
        endGame({ over: true, result: 'w', reason: 'mat' }); });
      await page.waitForTimeout(1500);
      const turbo = await meet();
      check(n, 'testopzet: een eindkaart tegen Turbo met knoppen', turbo.length >= 2);
      check(n, 'tegen Turbo: ' + turbo.join(', '), turbo.every(h => h >= 43.5));
      const krimp = await gekrompen();
      check(n, 'tegen Turbo is geen deel ingekrompen' + (krimp.length ? ': ' + krimp.join(', ') : ''), krimp.length === 0);
      await vers(${W}, ${H});
      await page.evaluate(async () => {
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: 'Fien', open: true, weg: false, gameId: 'potje-test-1', peerOn: true };
        Object.assign(MP, vrBegin(1));
        mpBeginGame();
        endGame({ over: true, result: 'b', reason: 'opgave' });
        await new Promise(r => setTimeout(r, 300));
        MP.anderKent = true; vrKrijg({ sessie: 1, pub: 'A'.repeat(87), wil: 1, nee: 0, zag: 0, voor: null });
        await new Promise(r => setTimeout(r, 300));
      });
      const vriend = await meet();
      check(n, 'testopzet: een eindkaart met een vriendschapsvraag', vriend.length >= 3);
      check(n, 'met een vriendschapsvraag: ' + vriend.join(', '), vriend.every(h => h >= 43.5));` });
}

/* met het toetsenbord open blijven de woordsuggesties in beeld, en de knop springt niet */
for (const [W, H, grens] of [[375, 553, 330], [375, 647, 380]]) {
  const n = '[4.8] ' + W + 'x' + H + ': het woordveld met focus: de suggesties staan boven het toetsenbord en de knop blijft staan';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      for (const [open, inp, sugg, knop] of [['linkEntryFlow()', '#wordInp', '#wordSugg', '#linkGo'], ['mpWordFlow()', '#mpInp', '#mpSugg', '#mpKoppel']]) {
        await vers(${W}, ${H});
        await page.evaluate(o => { eval(o); }, open);
        await page.waitForTimeout(300);
        await page.focus(inp);
        const knopVoor = await rect(knop);
        await page.type(inp, 'la');
        await page.waitForTimeout(200);
        const s = await rect(sugg), knopNa = await rect(knop);
        check(n, open + ': testopzet, er zijn suggesties', await page.evaluate(s => document.querySelectorAll(s + ' .w-sugg').length > 0, sugg));
        check(n, open + ': de suggesties eindigen boven ${grens} (' + (s ? Math.round(s.bottom) : '-') + ')', !!s && s.bottom <= ${grens} + 0.5);
        check(n, open + ': de knop sprong niet', !!knopVoor && !!knopNa && Math.abs(knopVoor.top - knopNa.top) < 0.5);
      }` });
}

/* naast "Speel maar" is de strook smaller; de zin bij een tik op een eigen stuk past daar ook, op de lage telefoons */
for (const [W, H] of [[360, 640], [375, 553], [375, 647]]) {
  const n = '[2.2] ' + W + 'x' + H + ': een tik op een eigen stuk bij de voorspelvraag: de zin past in de strook naast Speel maar';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await potjeVoorVraag(${W}, ${H});
      await zet('f3e5');
      await page.waitForTimeout(1500);
      check(n, 'testopzet: de voorspelvraag staat er', await page.evaluate(() => BD.mode === 'predict'));
      await veld('e4');
      await page.waitForTimeout(300);
      const uit = await page.evaluate(() => { const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
        return { t: b.textContent, knop: !document.getElementById('predictBar').classList.contains('hidden'),
          past: st.scrollHeight <= st.clientHeight + 1 && b.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5 }; });
      check(n, 'testopzet: de zin over het eigen stuk, met Speel maar ernaast', /Dat is jouw stuk/.test(uit.t) && uit.knop);
      check(n, 'de zin past: ' + uit.t, uit.past);` });
}

/* het rondje bouwt zijn eerste opdracht pas na een tik van de klok: de soort wordt daarna klaargezet */
const SOORTEN = [
  ['De Beste Zet met zijn keuzes', `startDrill('best3');`, `setTask(null); setOptions(null); BD.arrows = []; buildBest3();`],
  ['veilig of valstrik', `startDrill('best3');`, `setTask(null); setOptions(null); BD.arrows = []; buildSafe();`],
  ['de Trucendoos', `startDrill('trucs');`, ``],
  ['Koning ontsnapt', `startDrill('koning');`, ``],
  ['de openingsles met de coach', `startOpening('coach', null);`, ``],
  ['de openingsles met een pad', `startOpening('pad', PADEN[0]);`, ``]
];
for (const [W, H] of [[360, 640], [375, 553], [375, 647], [390, 667], [402, 700], [768, 904]]) {
  const regels = SOORTEN.map(s => '[2.1] ' + W + 'x' + H + ': ' + s[0] + ': het bord, de uitleg en de laatste knop in beeld, de pagina scrolt niet')
    .concat(['[2.1] ' + W + 'x' + H + ': de denkwolk: het bord en de laatste knop in beeld, de pagina scrolt niet']);
  GEVALLEN.push({ regels, code: `
      const regels = ${JSON.stringify(regels)};
      const meet = async (n) => {
        const p = await pagina();
        check(n, 'het bord in beeld', binnen(await rect('#board'), ${W}, ${H}));
        check(n, 'de pagina is niet hoger of breder dan het venster', p.sh <= p.H + 1 && p.sw <= p.W + 1);
        /* de coach heeft geen knop: dan telt alles wat onder het bord staat */
        const delen = await page.evaluate(() => [...document.getElementById('onder').children].filter(x => x.getClientRects().length)
          .map(x => { const r = x.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }));
        check(n, 'alles onder het bord in beeld', delen.length > 0 && delen.every(r => binnen(r, ${W}, ${H})));
        const h = await rect('#hulpZin');
        if (h) check(n, 'de uitleg onder het bord helemaal in beeld', binnen(h, ${W}, ${H}) &&
          await page.evaluate(() => { const e = document.getElementById('hulpZin'); return e.scrollHeight <= e.clientHeight + 1; }));
      };
      for (let i = 0; i < ${SOORTEN.length}; i++) {
        await vers(${W}, ${H});
        await page.evaluate(i => [${SOORTEN.map(s => '() => { ' + s[1] + ' }').join(', ')}][i](), i);
        await page.waitForTimeout(1500);
        await page.evaluate(i => [${SOORTEN.map(s => '() => { ' + s[2] + ' }').join(', ')}][i](), i);
        await page.waitForTimeout(800);
        await meet(regels[i]);
      }
      await vers(${W}, ${H});
      await startPotje();
      check(regels[regels.length - 1], 'testopzet: de Denkwolk is aan te tikken', await klikTekst(/Denkwolk/));
      await page.waitForTimeout(400);
      await meet(regels[regels.length - 1]);` });
}

/* Vrienden met drie vrienden, een met een naam van veertien letters en een met een lopend potje */
const VRIENDEN_DOC = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } }, max: { best: 0, goal: {} }, loc: {},
  friends: {
    vriendaaaaaa1: { k: 'sleutelsleutelsleutelsleutelsleutel1', naam: 'Maximiliaantje', t: 1, since: 1792000000000, host: true, weg: false },
    vriendaaaaaa2: { k: 'sleutelsleutelsleutelsleutelsleutel2', naam: 'Fien', t: 1, since: 1792100000000, host: true, weg: false },
    vriendaaaaaa3: { k: 'sleutelsleutelsleutelsleutelsleutel3', naam: 'Daan', t: 1, since: 1792200000000, host: false, weg: false } } });
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[4.12] ' + W + 'x' + H + ': Vrienden met drie vrienden: elke knop binnen zijn rij en het scherm, minstens 44 hoog, en de pagina scrolt niet opzij';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, { schaakheld1: ${JSON.stringify(VRIENDEN_DOC)} });
      await klik('#tabVrienden');
      await page.waitForTimeout(300);
      /* een lopend potje met Fien, waarin Mees aan zet is */
      await page.evaluate(() => { MP = { room: 'kamerkamer1', seat: 'stoelstoel1', host: true, open: true, weg: true, peerName: 'Fien', myColor: 'w', gameNo: 1,
        gameId: 'potjepotje12', S: newGame(), over: false, result: null, offer: null, viaFriend: 'vriendaaaaaa2' }; renderFriends(); });
      await page.waitForTimeout(200);
      const rijen = await page.evaluate(() => [...document.querySelectorAll('#friendList .friend')].map(r => {
        const b = r.getBoundingClientRect();
        return { rij: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, tekst: r.textContent,
          knoppen: [...r.querySelectorAll('button')].map(k => { const x = k.getBoundingClientRect(); return { left: x.left, right: x.right, top: x.top, bottom: x.bottom, h: x.height }; }) };
      }));
      check(n, 'drie rijen', rijen.length === 3);
      check(n, 'de rij van Fien zegt dat Mees aan zet is, met de knop die het potje opent', rijen.some(r => /Fien/.test(r.tekst) && /Jij bent aan zet\. *Jij bent aan zet/.test(r.tekst)));
      check(n, 'elke rij heeft ⋯ en één knop, en geen kruisje', rijen.every(r => r.knoppen.length === 2 && !/✕/.test(r.tekst)));
      check(n, 'elke knop binnen zijn rij en het scherm', rijen.every(r => r.knoppen.every(k => k.left >= r.rij.left - 0.5 && k.right <= r.rij.right + 0.5 &&
        k.top >= r.rij.top - 0.5 && k.bottom <= r.rij.bottom + 0.5 && k.left >= 0 && k.right <= ${W} + 0.5)));
      check(n, 'elke knop minstens 44 hoog', rijen.every(r => r.knoppen.every(k => k.h >= 44 - 0.5)));
      const p = await pagina();
      check(n, 'de pagina scrolt niet opzij', p.sw <= p.W + 1);` });
}

/* hoogstens één regel Ook nog, zodat de spelknoppen boven de tabbalk blijven */
const POTJES_TWEE = JSON.stringify({ v: 2, games: {
  1: { level: 1, moves: ['e2e4', 'e7e5'], tips: 3, drawAsked: null, started: 1, updated: 2, patXP: 0 },
  2: { level: 2, moves: ['d2d4', 'd7d5'], tips: 3, drawAsked: null, started: 1, updated: 1, patXP: 0 } } });
const RONDJES_TWEE = JSON.stringify({ scan: { round: 2, earned: 6 }, best3: { round: 1, earned: 3 } });
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[3.3] ' + W + 'x' + H + ': met een uitnodiging, twee potjes tegen Turbo en twee rondjes: één regel Ook nog, en beide spelknoppen boven de tabbalk';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, { schaakheld1: ${JSON.stringify(VRIENDEN_DOC)}, 'schaakheld-potje': ${JSON.stringify(POTJES_TWEE)},
        'schaakheld-rondjes': ${JSON.stringify(RONDJES_TWEE)} });
      await page.evaluate(() => { uitnodigingWacht = { fid: 'vriendaaaaaa2', inv: { id: 'uitnodiging01', room: 'kamerkamer1', seat: 'stoelstoel1',
        naam: 'Fien', ts: Date.now() } }; renderVerder(); });
      await page.waitForTimeout(300);
      check(n, 'testopzet: de uitnodiging is de kaart', await page.evaluate(() => /Fien wil spelen/.test(document.getElementById('verder').textContent)));
      check(n, 'één regel Ook nog', await page.evaluate(() => document.querySelectorAll('#verder .verder-ook').length) === 1);
      const tab = await rect('.tabbar'), t = await rect('#spelTurbo'), v = await rect('#spelVriend');
      check(n, 'beide spelknoppen boven de tabbalk', !!tab && !!t && !!v && t.bottom <= tab.top + 0.5 && v.bottom <= tab.top + 0.5);` });
}

/* het venster "Je potje met ... loopt nog": het kruisje ligt over geen tekst */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[4.5] ' + W + 'x' + H + ': in het venster dat zegt dat een vriendenpotje nog loopt, ligt het kruisje over geen tekst';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, { schaakheld1: ${JSON.stringify(VRIENDEN_DOC)} });
      await page.evaluate(() => {
        MP = { room: 'kamerkamer1', seat: 'stoelstoel1', host: true, open: true, weg: true, peerOn: true, peerName: 'Maximiliaantje', myColor: 'w',
          gameNo: 1, gameId: 'potjepotje12', S: newGame(), over: false, result: null, offer: null, viaFriend: null };
        uitnodigingWacht = { fid: 'vriendaaaaaa2', inv: { id: 'uitnodiging01', room: 'kamerkamer2', seat: 'stoelstoel2', naam: 'Fien', ts: Date.now() } };
        uitnodigingJa(uitnodigingWacht.fid, uitnodigingWacht.inv);
      });
      await page.waitForTimeout(500);
      const x = await rect('#mClose');
      const teksten = await page.evaluate(() => [...document.querySelectorAll('#modalBox p, #modalBox h2')].map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      check(n, 'testopzet: het venster met het kruisje', !!x && teksten.length > 0 && await page.evaluate(() => /loopt nog/.test(document.getElementById('modalBox').textContent)));
      check(n, 'het kruisje ligt over geen tekst', !!x && teksten.every(t => x.right <= t.left || x.left >= t.right || x.bottom <= t.top || x.top >= t.bottom));` });
}

/* de Openingsschool: de naam van een opening en de regel eronder staan op twee regels */
for (const [W, H] of [[375, 553], [360, 640]]) {
  const n = '[2.1] ' + W + 'x' + H + ': in de Openingsschool staan de naam van een opening en de regel eronder op eigen regels';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await page.evaluate(() => openingChooser());
      await page.waitForTimeout(500);
      /* gemeten tegen de onderkant van de naam zelf: een regel die achter een naam van twee regels doorloopt, staat ook lager dan de bovenkant */
      const r = await page.evaluate(() => { const s = document.querySelector('.opt-btn .o-sub'); if (!s) return null;
        const naam = document.createRange(); naam.selectNodeContents(s.parentElement.firstChild);
        return { naam: naam.getBoundingClientRect().bottom, q: s.getBoundingClientRect().top }; });
      check(n, 'testopzet: een keuze met een regel eronder', !!r);
      check(n, 'de regel begint onder de naam (' + (r && Math.round(r.q)) + ' tegen ' + (r && Math.round(r.naam)) + ')', !!r && r.q >= r.naam - 0.5);` });
}

/* de regel die van het level omhoog zweeft, blijft binnen het scherm */
for (const [W, H] of [[375, 667], [360, 640]]) {
  const n = '[3.11] ' + W + 'x' + H + ': de zwevende regel "+60 XP Weekdoel gehaald!" blijft binnen het scherm';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      await page.evaluate(() => floatXP('+60 XP Weekdoel gehaald! 🎯'));
      await page.waitForTimeout(50);
      const f = await rect('.xp-float');
      check(n, 'binnen het scherm', !!f && f.left >= 0 && f.right <= ${W} + 0.5);` });
}

GEVALLEN.push({ regels: ['[3.5] 390x844: Ik begint met het level, dan bewaard, trofeeën, bordkleuren, de week, vorm en het trucboek'],
  code: `
      const n = '[3.5] 390x844: Ik begint met het level, dan bewaard, trofeeën, bordkleuren, de week, vorm en het trucboek';
      await vers(390, 844);
      await klik('#tabIk');
      await page.waitForTimeout(300);
      const ids = ['#levelPath', '#ikBewaard', '#badgeGrid', '#themeRow', '#weekCard', '#vormList', '#patBook'];
      const tops = [];
      for (const s of ids) { const r = await rect(s); check(n, s + ' staat er', !!r); tops.push(r ? r.top : NaN); }
      check(n, 'in deze volgorde', tops.every((t, i) => i === 0 || t > tops[i - 1]));` });

/* Spelen met vier dingen bezig, het eerste een remise-aanbod van een vriend met een lange naam, en Spelen
   met een regel "Ook nog" die twee regels neemt: de kaart, één regel eronder, de weekregel en beide spelknoppen
   staan boven de tabbalk. Een vriendenpotje staat in de staat van het paar zoals dit apparaat die bewaart; de vriend
   is host, dus het kind heeft rol a. Elke stand heeft eigen geheimen: de server houdt wat eerdere gevallen schreven. */
const profielMet = (stand, vrienden) => JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
  max: { best: 0, goal: {} }, loc: {}, friends: Object.fromEntries(vrienden.map(([fid, naam], i) => [fid,
    { k: ('sleutel' + stand + fid).padEnd(36, 'x').slice(0, 36), naam, t: 1, since: 1792000000000 + i * 100000000, host: true, weg: false }])) });
const paarStaat = (id, r) => {
  const kleur = r.kleur || 'w', rolVan = c => c === kleur ? 'a' : 'b', t = Math.floor((r.t || 1794700000000) / 1000), zetten = r.zetten || [];
  return { staat: { v: 2, seq: 3, vorige: [], spel: { id, wit: rolVan('w'), door: r.uitdaging ? 'b' : 'a',
    fase: r.uitdaging ? 'uitdaging' : r.uitslag ? 'klaar' : 'potje', zetten, bod: r.aanbod ? { door: 'b', ply: zetten.length, t } : null,
    uitslag: r.uitslag || null, weet: r.weet || { a: null, b: null }, bekeken: r.bekeken || { a: false, b: false }, t } },
    hoogste: 3, merk: 'merkvandittoest1', rij: [] };
};
const MAXI_BIEDT = { zetten: ['d2d4', 'd7d5'], aanbod: true };
const VIER_BEZIG = { schaakheld1: profielMet('vier', [['vriendmaxi01', 'Maximiliaantje'], ['vriendsem001', 'Sem']]),
  'schaakheld-paar': JSON.stringify({ vriendmaxi01: paarStaat('potjemaxi001', MAXI_BIEDT), vriendsem001: paarStaat('potjesem0001', { zetten: ['c2c4'] }) }),
  'schaakheld-potje': JSON.stringify({ v: 2, games: { 1: { level: 1, moves: ['e2e4', 'e7e5'], tips: 3, drawAsked: null, started: 1, updated: 1, patXP: 0 } } }),
  'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 } }) };
const OOK_LANG = { schaakheld1: profielMet('vier', [['vriendmaxi01', 'Maximiliaantje']]),
  'schaakheld-paar': JSON.stringify({ vriendmaxi01: paarStaat('potjemaxi001', MAXI_BIEDT) }),
  'schaakheld-rondjes': JSON.stringify({ trucs: { round: 2, earned: 6 } }) };
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[6.9] ' + W + 'x' + H + ': met vier dingen bezig en met een regel Ook nog van twee regels staan de kaart (een remise-aanbod), één regel, de weekregel en beide spelknoppen boven de tabbalk';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      for (const [soort, extra] of [['vier dingen bezig', ${JSON.stringify(VIER_BEZIG)}], ['Ook nog in twee regels', ${JSON.stringify(OOK_LANG)}]]) {
        await vers(${W}, ${H}, extra);
        await page.waitForTimeout(2500);
        const tab = await rect('.tabbar');
        for (const s of ['#verder', '#weekStrip', '#spelTurbo', '#spelVriend']) {
          const r = await rect(s);
          check(n, soort + ': ' + s + ' boven de tabbalk', !!r && !!tab && r.top >= 0 && r.bottom <= tab.top + 0.5);
        }
        const v = await page.evaluate(() => { const e = document.getElementById('verder'); return {
          tekst: e ? e.textContent : '', ook: e ? [...e.querySelectorAll('button')].filter(b => /^\\s*Ook nog/.test(b.textContent))
            .map(b => b.getBoundingClientRect().height) : [] }; });
        check(n, soort + ': de kaart is het remise-aanbod van Maximiliaantje', /Maximiliaantje biedt remise aan/.test(v.tekst));
        check(n, soort + ': precies één regel Ook nog', v.ook.length === 1);
        if (soort === 'Ook nog in twee regels') check(n, 'testopzet: de regel Ook nog neemt twee regels', v.ook.length === 1 && v.ook[0] > 46);
      }` });
}

/* een stil potje als kaart, met de uitweg eronder, en een tweede stil potje in de regel Ook nog */
const STIL_LANG = { schaakheld1: profielMet('stil', [['vriendmaxi01', 'Maximiliaantje'], ['vriendsem001', 'Sem']]),
  'schaakheld-paar': JSON.stringify({ vriendmaxi01: paarStaat('potjemaxi001', { zetten: ['d2d4', 'd7d5', 'c2c4'], t: Date.now() - 8 * 86400000 }),
    vriendsem001: paarStaat('potjesem0001', { zetten: ['c2c4', 'e7e5', 'g1f3'], t: Date.now() - 12 * 86400000 }) }) };
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[6.8] ' + W + 'x' + H + ': twee stille potjes, de kaart met de uitweg eronder en een regel Ook nog: de kaart, de regels, de weekregel en beide spelknoppen boven de tabbalk';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(STIL_LANG)});
      await page.waitForTimeout(2500);
      const tab = await rect('.tabbar');
      for (const s of ['#verder', '#weekStrip', '#spelTurbo', '#spelVriend']) {
        const r = await rect(s);
        check(n, s + ' boven de tabbalk', !!r && !!tab && r.top >= 0 && r.bottom <= tab.top + 0.5);
      }
      const v = await page.evaluate(() => (document.getElementById('verder') || {}).textContent || '');
      check(n, 'de kaart is het stille potje met de uitweg', /heeft al een week niet gezet/.test(v) && /Klaar met wachten/.test(v));` });
}

/* het venster als het paar bezet is: het plaatje bovenaan, de zin eronder, één Oké en geen kruisje */
const BEZET = { schaakheld1: profielMet('bezet', [['vriendmaxi01', 'Maximiliaantje']]),
  'schaakheld-paar': JSON.stringify({ vriendmaxi01: paarStaat('potjemaxi001', { zetten: ['d2d4', 'd7d5'], uitslag: { soort: 'opgave', door: 'a', ply: 2 },
    weet: { a: 'merkvandittoest1', b: null }, bekeken: { a: true, b: false } }) }) };
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[6.4] ' + W + 'x' + H + ': het venster als het paar bezet is: het plaatje boven de zin, één Oké, geen kruisje, en alles in beeld';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(BEZET)});
      await page.waitForTimeout(1500);
      await page.evaluate(() => inviteFriend('vriendmaxi01'));
      await page.waitForTimeout(500);
      const plaatje = await rect('#modalBox .m-emoji'), zin = await rect('#modalBox p'), doos = await rect('#modalBox'), ok = await rect('#bezetOk');
      check(n, 'het venster met de zin', !!zin && /weet nog niet hoe jullie potje afliep/.test(await page.evaluate(() => document.getElementById('modalBox').textContent)));
      check(n, 'het plaatje boven de zin', !!plaatje && !!zin && plaatje.bottom <= zin.top + 0.5);
      check(n, 'geen kruisje', !(await rect('#mClose')));
      check(n, 'de doos en Oké in beeld', binnen(doos, ${W}, ${H}) && binnen(ok, ${W}, ${H}));` });
}

/* het blad: elke rij is minstens 56 hoog, de titel staat boven waar het ding staat, en niets is breder dan het scherm */
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[6.9] ' + W + 'x' + H + ': het blad Wat nog bezig is heeft per ding een rij van minstens 56 hoog, met de titel boven de plek';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(VIER_BEZIG)});
      await page.waitForTimeout(2500);
      await klik('#ookNog');
      await page.waitForTimeout(500);
      const rijen = await page.evaluate(() => [...document.querySelectorAll('.lopend')].map(r => {
        const b = r.getBoundingClientRect(), t = r.querySelector('.l-titel'), p = r.querySelector('.l-plek');
        const tr = t && t.getBoundingClientRect(), pr = p && p.getBoundingClientRect();
        return { h: b.height, left: b.left, right: b.right, titel: t ? t.textContent : '', onder: !!tr && !!pr && pr.top >= tr.bottom - 0.5 };
      }));
      check(n, 'vier rijen: Maximiliaantje, Sem, Turbo en het rondje', rijen.length === 4);
      check(n, 'elke rij minstens 56 hoog', rijen.length > 0 && rijen.every(r => r.h >= 55.5));
      check(n, 'de plek staat onder de titel', rijen.length > 0 && rijen.every(r => r.titel && r.onder));
      check(n, 'binnen het scherm', rijen.every(r => r.left >= -0.5 && r.right <= ${W} + 0.5));
      check(n, 'geen zijwaarts scrollen', (await pagina()).sw <= ${W});` });
}

/* een uitdaging van een vriend met een lange naam: de rij op Vrienden noemt onder de naam alleen dat hij
   uitdaagt en welke kleur het kind heeft, in hoogstens twee regels; de kaart houdt de hele zin en blijft binnen het scherm */
const UITDAGING = { schaakheld1: profielMet('uitdaging', [['vriendmaxi02', 'Maximiliaantje']]),
  'schaakheld-paar': JSON.stringify({ vriendmaxi02: paarStaat('potjemaxi002', { kleur: 'b', uitdaging: true, t: Date.now() }) }) };
for (const [W, H] of [[360, 640], [375, 553]]) {
  const n = '[6.9] ' + W + 'x' + H + ': een uitdaging van een vriend met een lange naam: de rij zegt in hoogstens twee regels dat hij uitdaagt en welke kleur het kind heeft, en de kaart past';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(UITDAGING)});
      await page.waitForTimeout(1500);
      const kaart = await rect('#verder'), ja = await rect('#verderJa'), nee = await rect('#verderNee');
      const kaartTekst = await page.evaluate(() => (document.getElementById('verder') || {}).textContent || '');
      check(n, 'de kaart houdt de hele zin', /Maximiliaantje daagt je uit/.test(kaartTekst) && /Jij speelt met zwart: Maximiliaantje begint\./.test(kaartTekst));
      check(n, 'de kaart en haar knoppen binnen het scherm', binnen(kaart, ${W}, ${H}) && binnen(ja, ${W}, ${H}) && binnen(nee, ${W}, ${H}));
      await klik('#tabVrienden');
      await page.waitForTimeout(500);
      const rij = await page.evaluate(() => {
        const r = document.querySelector('.friend[data-fid="vriendmaxi02"]'), s = r && r.querySelector('.f-sub');
        if (!s) return null;
        const z = document.createRange(); z.selectNodeContents(s);
        const b = r.getBoundingClientRect();
        return { tekst: s.textContent, regels: new Set([...z.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size, left: b.left, right: b.right };
      });
      check(n, 'de rij: Daagt je uit · Jij hebt zwart.', !!rij && rij.tekst === 'Daagt je uit · Jij hebt zwart.');
      check(n, 'in hoogstens twee regels', !!rij && rij.regels <= 2);
      check(n, 'de rij binnen het scherm', !!rij && rij.left >= -0.5 && rij.right <= ${W} + 0.5);
      check(n, 'geen zijwaarts scrollen', (await pagina()).sw <= ${W});` });
}

/* De zinnen van een potje op de staat (de vraag bij opgeven, een begin zonder antwoord, de regel over herhaling en
   de eindkaarten), op de kleinste maten en een tablet, met de langste naam die de app toelaat (veertien tekens). Een
   potje met een vriend staat in de staat van het paar zoals dit apparaat die bewaart; het kind heeft rol a en wit. */
const LANG = 'Maximiliaantje', MAXI = 'vriendmaxi01';
const metPaar = (stand, staat, extra) => Object.assign({ schaakheld1: profielMet(stand, [[MAXI, LANG]]),
  'schaakheld-paar': JSON.stringify(staat ? { [MAXI]: staat } : {}) }, extra || {});
const AF_MATEN = [[360, 640], [375, 553], [768, 1004]];

/* het puntenverschil in de balk ziet eruit als een knopje, want een tik erop laat de geslagen stukken zien; met
   de langste naam van een vriend en "✔ bewaard" ervoor staat het knopje nog heel in de regel */
const PIL = `(() => { const e = document.getElementById('verschil'); if (!e || !e.textContent || !e.getClientRects().length) return null;
  const r = e.getBoundingClientRect(), s = e.parentElement.getBoundingClientRect(), cs = getComputedStyle(e);
  return { tekst: e.textContent, na: getComputedStyle(e, '::after').content, bg: cs.backgroundColor, rond: parseFloat(cs.borderTopLeftRadius) || 0,
    x: r.left + r.width / 2, y: r.top + r.height / 2, heel: e.scrollWidth <= e.clientWidth + 1,
    inRegel: r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5,
    delen: [...e.children].map(c => ({ naam: c.classList.contains('kn-wie'), w: c.getBoundingClientRect().width, heel: c.scrollWidth <= c.clientWidth + 1 })) }; })()`;
for (const [W, H] of [[360, 640], [375, 553], [390, 844], [768, 1004], [1024, 748]]) {
  const n = '[2.3] ' + W + 'x' + H + ': het puntenverschil in de balk is een knopje met ›, heel in beeld ook met de langste naam, en een tik erop laat de geslagen stukken zien; het bord blijft staan';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      const pil = () => page.evaluate(${JSON.stringify(PIL)});
      const knopje = p => !!p && !/^(transparent|rgba\\(0, 0, 0, 0\\))$/.test(p.bg) && p.rond >= 8 && /›/.test(p.na);
      /* het stukje en het getal blijven heel; de naam mag korter, maar er blijven een paar letters van over */
      const delenHeel = (p, naamMagKorter) => !!p && p.delen.length === 3 && p.delen.every(d => (d.naam && naamMagKorter) ? d.w > 20 : (d.w > 0 && d.heel));
      const potje = zetten => ({ 'schaakheld-potje': JSON.stringify({ v: 2, games: { 1: { level: 1, moves: zetten, tips: 3, drawAsked: null, started: 1, updated: 1, patXP: 0 } } }) });
      await vers(${W}, ${H}, potje(['e2e4', 'e7e5']));
      await klik('#verderKaart'); await page.waitForTimeout(800);
      const bord = await rect('#board'), balk = await rect('.play-bar');
      check(n, 'bij gelijke stand geen knopje', !(await pil()));
      await vers(${W}, ${H}, potje(['e2e4', 'd7d5', 'e4d5', 'g8f6']));
      await klik('#verderKaart'); await page.waitForTimeout(800);
      const p = await pil();
      check(n, 'Jij +1 is een knopje met › (' + JSON.stringify(p) + ')', knopje(p) && /♟ Jij \\+1/.test(p.tekst));
      check(n, 'het knopje staat heel in de regel, en niets erin is afgeknipt', !!p && p.inRegel && p.heel && delenHeel(p, false));
      check(n, 'het bord en de balk staan waar ze stonden', gelijk(bord, await rect('#board')) && gelijk(balk, await rect('.play-bar')));
      if (p) await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(400);
      check(n, 'een tik op het knopje laat de geslagen stukken zien', /Jij pakte:/.test(await page.evaluate(() => document.getElementById('modalBox').textContent)));
      await klik('#matOk');
      await vers(${W}, ${H}, ${JSON.stringify(metPaar('knopje', paarStaat('potjemaxi001', { zetten: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7'] })))});
      await klik('#verderKaart'); await page.waitForTimeout(1500);
      const v = await pil(), bewaard = await page.evaluate(() => { const b = document.getElementById('bewaard');
        return { te_zien: b.getClientRects().length > 0, heel: b.scrollWidth <= b.clientWidth + 1 }; });
      check(n, 'testopzet: het potje met ${LANG} staat bewaard', bewaard.te_zien);
      check(n, '✔ bewaard staat heel naast het knopje', bewaard.heel);
      check(n, '${LANG} +8 is een knopje met › dat heel in de regel staat (' + JSON.stringify(v) + ')', knopje(v) && /♟ ${LANG} \\+8/.test(v.tekst) && v.inRegel && v.heel);
      check(n, 'met ${LANG}: het stukje en +8 heel, en van de naam een paar letters', delenHeel(v, true));
      await foto('knopje-${W}x${H}');` });
}
/* het blad met de geslagen stukken na een potje met veel slagen: een potje dat elke halve zet slaat als dat kan, met
   een vast zaad, zodat van elke kant bijna alles geslagen is. De rij Oké blijft onderaan het venster staan met een
   zachte rand erboven; geen stuk mag daaronder vallen. */
const VEEL_SLAGEN = `(() => { let z = 7; const r = n => { z = (z * 16807) % 2147483647; return z % n; };
  const S = newGame(), uit = [], eindigt = m => { makeMove(S, m); const o = gameStatus(S).over; unmakeMove(S); return o; };
  for (let i = 0; i < 160; i++) {
    const ms = legalMoves(S).filter(m => !m.promo && !eindigt(m)); if (!ms.length) break;
    const slagen = ms.filter(m => isCapture(S, m)), lijst = slagen.length ? slagen : ms, m = lijst[r(lijst.length)];
    makeMove(S, m); uit.push(moveKey(m));
  }
  return uit; })()`;
for (const [W, H] of [[375, 553], [360, 640], [390, 844], [768, 1004], [1024, 748]]) {
  const n = '[2.3] ' + W + 'x' + H + ': het blad met de geslagen stukken na een potje met veel slagen: elk stuk heel, groot genoeg, boven de rij met Oké, zonder scrollen';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      const zetten = await page.evaluate(${JSON.stringify(VEEL_SLAGEN)});
      await vers(${W}, ${H}, { 'schaakheld-potje': JSON.stringify({ v: 2, games: { 1: { level: 1, moves: zetten, tips: 3, drawAsked: null, started: 1, updated: 1, patXP: 0 } } }) });
      await klik('#verderKaart'); await page.waitForTimeout(800);
      await klik('#materiaal'); await page.waitForTimeout(600);
      const b = await page.evaluate(() => { const box = document.getElementById('modalBox'), ov = document.getElementById('overlay');
        /* het vak binnen de opvulling van het venster, en de zachte rand zo hoog als de opmaak hem maakt */
        const m = box.getBoundingClientRect(), cs = getComputedStyle(box), rij = box.querySelector('.m-btns:last-child');
        const links = m.left + parseFloat(cs.paddingLeft), rechts = m.right - parseFloat(cs.paddingRight);
        const rand = parseFloat(getComputedStyle(rij, '::before').height) || 0, knoppen = rij.getBoundingClientRect();
        const rijen = [...box.querySelectorAll('.tray-pcs')].map(t => t.querySelectorAll('.pc').length);
        const stukken = [...box.querySelectorAll('.tray-pcs .pc')].map(p => { const r = p.getBoundingClientRect();
          return { binnen: r.left >= links - 0.5 && r.right <= rechts + 0.5 && r.top >= m.top - 0.5, boven: r.bottom <= knoppen.top - rand + 0.5,
            px: parseFloat(getComputedStyle(p).fontSize) }; });
        return { rijen, stukken, rand, scrolt: ov.scrollHeight > ov.clientHeight + 1, ok: (() => { const r = document.getElementById('matOk').getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight + 0.5; })() }; });
      check(n, 'testopzet: van elke kant minstens twaalf stukken geslagen (' + b.rijen + '), en de rij met Oké heeft een zachte rand (' + b.rand + ')',
        b.rijen.length === 2 && b.rijen.every(x => x >= 12) && b.rand > 0);
      check(n, 'elk stuk binnen de opvulling van het venster', b.stukken.every(s => s.binnen));
      check(n, 'geen stuk onder de rij met Oké of de zachte rand erboven (' + b.stukken.filter(s => !s.boven).length + ' wel)', b.stukken.every(s => s.boven));
      check(n, 'de stukken zijn minstens 24 px (' + (b.stukken[0] && b.stukken[0].px) + ')', b.stukken.length > 0 && b.stukken.every(s => s.px >= 24));
      check(n, 'het venster past zonder scrollen, met Oké in beeld', !b.scrolt && b.ok);
      await foto('blad-${W}x${H}');` });
}
/* het vak van de strook: past de zin, zonder scrollen, en in hoeveel regels */
const STROOK = `(() => { const st = document.querySelector('#strook .s-txt'), b = document.getElementById('bubble');
  const lh = parseFloat(getComputedStyle(b).lineHeight) || 20;
  return { tekst: b.innerText, past: getComputedStyle(st).overflowY === 'hidden' && st.scrollHeight <= st.clientHeight + 1 &&
    b.getBoundingClientRect().bottom <= st.getBoundingClientRect().bottom + 0.5, regels: Math.round(b.getBoundingClientRect().height / lh) }; })()`;
/* de eindkaart: alles in de kaart, elke knop in de kaart en minstens 44 hoog */
const EINDKAART = `(() => { const e = document.getElementById('eindkaart'), er = e.getBoundingClientRect();
  const knoppen = [...e.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect());
  return { tekst: e.innerText, sh: e.scrollHeight, ch: e.clientHeight, onder: Math.max(...knoppen.map(r => r.bottom)) - er.bottom,
    laag: knoppen.filter(r => r.height < 43.5).length, knoppen: knoppen.length }; })()`;
for (const [W, H] of AF_MATEN) {
  const n = '[6.3] ' + W + 'x' + H + ': de vraag bij opgeven in een potje op de staat, met dat wachten mag: beide knoppen in beeld, niets scrolt';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(metPaar('opgeven', paarStaat('potjemaxi001', { zetten: ['d2d4', 'd7d5'] })))});
      await klik('#verderKaart');
      await page.waitForTimeout(1500);
      await page.evaluate(() => resignAsk());
      await page.waitForTimeout(400);
      const v = await page.evaluate(() => { const box = document.getElementById('modalBox'), r = id => { const e = document.getElementById(id);
        if (!e) return null; const x = e.getBoundingClientRect(); return { top: x.top, bottom: x.bottom, left: x.left, right: x.right, w: x.width, h: x.height }; };
        return { tekst: box.innerText, sh: box.scrollHeight, ch: box.clientHeight, nee: r('rsNee'), ja: r('rsJa'), psh: document.documentElement.scrollHeight }; });
      check(n, 'testopzet: de vraag met de zin', /Opgeven\\?/.test(v.tekst) && /Je mag ook gewoon wachten: dit potje stopt nooit vanzelf\\./.test(v.tekst) && /${LANG}/.test(v.tekst));
      check(n, 'beide knoppen in beeld', binnen(v.nee, ${W}, ${H}) && binnen(v.ja, ${W}, ${H}));
      check(n, 'het venster scrolt niet (' + v.sh + ' in ' + v.ch + ')', v.sh <= v.ch + 1);
      check(n, 'de pagina scrolt niet', v.psh <= ${H} + 1);
      await foto('af-opgeven-vraag-${W}x${H}');` });
}
for (const [W, H] of AF_MATEN) {
  const n = '[6.5] ' + W + 'x' + H + ': een begin zonder antwoord: na de zet de strook dat de zet klaarstaat, geen bewaard, en het bord blijft staan; naar huis de melding boven de tabbalk, niet over de knop van de kaart';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(metPaar('begin', null, { 'schaakheld-potje': JSON.stringify({ v: 2, games: { 1: { level: 1, moves: ['e2e4', 'e7e5'], tips: 3, drawAsked: null, started: 1, updated: 1, patXP: 0 } } }) }))});
      await page.evaluate(() => {
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: ${JSON.stringify(LANG)}, open: true, weg: false, gameId: 'potjebegin01', peerOn: false, paar: ${JSON.stringify(MAXI)},
          viaFriend: ${JSON.stringify(MAXI)} };
        Object.assign(MP, vrBegin(1));
        MP.startBericht = { t: 'start', id: 'potjebegin01' };
        mpBeginGame();
      });
      await page.waitForTimeout(500);
      const voor = await rect('#board');
      await zet('e2e4');
      await page.waitForTimeout(800);
      const st = await page.evaluate(${JSON.stringify(STROOK)});
      check(n, 'testopzet: het begin heeft geen antwoord', await page.evaluate(() => !potjeOpStaat()));
      check(n, 'de strook: de zet staat klaar (' + st.tekst + ')', /Je zet staat klaar\\. Het potje begint als ${LANG} meedoet\\./.test(st.tekst) && st.past);
      check(n, 'geen bewaard', await page.evaluate(() => { const b = document.getElementById('bewaard'); return !b.getClientRects().length || !/bewaard/.test(b.textContent); }));
      check(n, 'het bord bleef staan', gelijk(voor, await rect('#board')));
      await foto('af-zet-staat-klaar-${W}x${H}');
      await klik('#backBtn');
      await page.waitForTimeout(500);
      const t = await rect('#toast'), tab = await rect('.tabbar'), knop = await rect('#verderKaart .vk-knop');
      check(n, 'de melding (' + await page.evaluate(() => document.getElementById('toast').textContent) + ')',
        await page.evaluate(() => /Het potje is niet begonnen: Maximiliaantje deed nog niet mee\\./.test(document.getElementById('toast').textContent)) && !!t);
      check(n, 'boven de tabbalk', !!t && !!tab && t.bottom <= tab.top + 0.5);
      check(n, 'niet over de knop van de kaart', !!t && !!knop && (t.top >= knop.bottom || t.bottom <= knop.top));
      check(n, 'testopzet: de kaart is het potje tegen Turbo, niet het begin', await page.evaluate(() => !/je potje met Maximiliaantje/i.test(document.getElementById('verder').textContent)));
      await foto('af-niet-begonnen-${W}x${H}');` });
}
/* stelling na vier halve zetten: de beginstelling voor de tweede keer, het kind aan zet */
const TWEEDE_KEER = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
for (const [W, H] of AF_MATEN) {
  const n = '[5.6] ' + W + 'x' + H + ': in een potje op de staat de regel over herhaling op de beurt van het kind: hoogstens drie regels, en het bord blijft staan';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(metPaar('herhaal', paarStaat('potjemaxi001', { zetten: TWEEDE_KEER })))});
      await klik('#verderKaart');
      await page.waitForTimeout(1500);
      const st = await page.evaluate(${JSON.stringify(STROOK)});
      check(n, 'de regel (' + st.tekst + ')', /Deze stelling stond er al eens\\. Bij de derde keer is het remise\\./.test(st.tekst));
      check(n, 'past, in hoogstens drie regels (' + st.regels + ')', st.past && st.regels <= 3);
      const met = await rect('#board');
      await page.evaluate(() => say('Jij bent aan zet! 💭'));
      await page.waitForTimeout(200);
      check(n, 'het bord staat waar het met een korte zin staat', gelijk(met, await rect('#board')));
      await page.evaluate(() => zegInPotje(''));
      await page.waitForTimeout(200);
      await foto('af-herhaling-strook-${W}x${H}');` });
}
for (const [W, H] of AF_MATEN) for (const [soort, telt] of [['geteld', true], ['te kort', false]]) {
  const n = '[5.6] ' + W + 'x' + H + ': de eindkaart van remise door drie keer dezelfde stelling op de staat, ' + soort + ': de zin, ' +
    (telt ? 'de XP' : 'dat het niet meetelt') + ', alles past en geen knop valt eronder';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify(metPaar(telt ? 'drieja' : 'driekort', paarStaat('potjemaxi001', { zetten: ['d2d4', 'd7d5'] })))});
      await klik('#verderKaart');
      await page.waitForTimeout(1500);
      await page.evaluate((telt) => {
        const p = paarVan(${JSON.stringify(MAXI)});
        p.telKaart = { [MP.gameId]: { xp: telt ? 30 : 0, doelGehaald: false, uitslag: { soort: 'herhaling', door: 'a' } } };
        bewaarPaar(${JSON.stringify(MAXI)}, p);
        endGame({ over: true, result: 'd', reason: 'herhaling' });
      }, ${telt});
      await page.waitForTimeout(1200);
      const k = await page.evaluate(${JSON.stringify(EINDKAART)});
      check(n, 'de zin', /Remise: drie keer dezelfde stelling\\. Niemand wint, niemand verliest\\./.test(k.tekst));
      check(n, ${JSON.stringify(telt ? 'de XP' : 'dat het niet meetelt')}, ${telt ? "/\\+30\\s*XP/.test(k.tekst)" : "/Dit potje telt niet mee: het was korter dan tien zetten\\./.test(k.tekst)"});
      check(n, 'alles past in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, 'geen knop onder de rand (' + Math.round(k.onder) + ' px), en elke knop 44 hoog', k.knoppen >= 1 && k.onder <= 1 && k.laag === 0);
      await foto('af-herhaling-eindkaart-${telt ? 'geteld' : 'kort'}-${W}x${H}');` });
}
for (const [W, H] of AF_MATEN) {
  const n = '[6.3] ' + W + 'x' + H + ': de eindkaart van een potje dat afliep terwijl het kind weg was, met de XP uit het paar na een herlading: alles past en geen knop valt eronder';
  const staat = paarStaat('potjemaxi001', { zetten: ['d2d4', 'd7d5', 'c2c4', 'e7e6'], uitslag: { soort: 'opgave', door: 'b', ply: 4 },
    weet: { a: 'merkvandittoest1', b: 'merk-b----------' } });
  staat.telKaart = { potjemaxi001: { xp: 30, doelGehaald: false, uitslag: { soort: 'opgave', door: 'b' } } };
  const profiel = JSON.parse(profielMet('weg', [[MAXI, LANG]]));
  profiel.loc.geteld = { [MAXI]: ['potjemaxi001'] };
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H}, ${JSON.stringify({ schaakheld1: JSON.stringify(profiel), 'schaakheld-paar': JSON.stringify({ [MAXI]: staat }) })});
      await page.waitForTimeout(1000);
      check(n, 'testopzet: de kaart noemt het einde', await page.evaluate(() => /Maximiliaantje gaf op/.test(document.getElementById('verder').textContent)));
      await klik('#verderKaart');
      await page.waitForTimeout(1500);
      const k = await page.evaluate(${JSON.stringify(EINDKAART)});
      check(n, 'de kaart: Jij wint, met de XP (' + k.tekst.replace(/\\s+/g, ' ').slice(0, 80) + ')', /Jij wint dit potje!/.test(k.tekst) && /\\+30\\s*XP/.test(k.tekst));
      check(n, 'alles past in de kaart (' + k.sh + ' in ' + k.ch + ')', k.sh <= k.ch + 1);
      check(n, 'geen knop onder de rand (' + Math.round(k.onder) + ' px), en elke knop 44 hoog', k.knoppen >= 2 && k.onder <= 1 && k.laag === 0);
      await foto('af-weg-eindkaart-xp-${W}x${H}');` });
}

/* In een echte browser is de versie een echte SHA-256: alleen hier moet de versie die de app uitrekent, die van de echte
   server zijn. De app schrijft een staat en dan nog een die de eerste versie noemt. */
const versieRegel = '[V2] de app schrijft een staat en dan nog een met de versie die zij zelf uitrekende, en de echte server neemt allebei aan';
GEVALLEN.push({ regels: [versieRegel], code: `
    const n = ${JSON.stringify(versieRegel)};
    await vers(360, 640);
    const uit = await page.evaluate(async () => {
      const fid = 'vriendversie1';
      setFriend(fid, { k: 'geheimvoordeversietest-' + Math.random().toString(36).slice(2) + '-xxxxxxxxxx', naam: 'Fien', t: Date.now(), weg: false,
        host: true, since: Date.now() });
      await pasToe(fid, { soort: 'uitdaging', id: 'potjeeen0001', wit: 'a', op: null });
      const p1 = paarVan(fid);
      await pasToe(fid, { soort: 'intrekken', id: 'potjeeen0001' });
      const p2 = paarVan(fid);
      return { eerste: p1.versie, toont1: p1.toont, seq1: p1.staat && p1.staat.seq, tweede: p2.versie, toont2: p2.toont, rij: p2.rij.length,
        seq2: p2.staat && p2.staat.seq, spel: p2.staat ? p2.staat.spel : 'geen', onbekend: versiesOnbekend };
    });
    check(n, 'de server kent versies', uit.onbekend === false);
    check(n, 'de eerste staat erop, met de versie van de app', /^[0-9a-f]{64}$/.test(uit.eerste) && uit.toont1 === uit.eerste && uit.seq1 === 1);
    check(n, 'de tweede noemde die versie en staat er ook: seq 2, en niets wacht', uit.seq2 === 2 && uit.rij === 0 && uit.toont2 === uit.tweede &&
      uit.spel === null);` });

function draai(geval) {
  const code = 'async page => {' + HELPERS + '\ntry {' + geval.code + '\n} catch (e) { for (const r of ' +
    JSON.stringify(geval.regels) + ') check(r, "uitzondering: " + (e && e.message ? e.message.split("\\n")[0] : e), false); }\n' +
    'return JSON.stringify(fouten); }';
  const r = pw('--raw', 'run-code', code);
  let uit = null;
  try { uit = JSON.parse(JSON.parse(r.stdout.trim())); } catch (e) { uit = null; }
  /* zonder antwoord of zonder een enkele controle is er niets gemeten: dat is
     een fout van de meting, ook voor een regel die nog niet gebouwd is */
  const fouten = {}, kapot = {};
  for (const regel of geval.regels) {
    if (!uit) { kapot[regel] = 'de browser gaf geen antwoord: ' + (r.stderr || r.stdout || '').trim().split('\n')[0]; continue; }
    if (!uit[regel]) { kapot[regel] = 'geen enkele controle gedaan'; continue; }
    fouten[regel] = uit[regel];
  }
  return { fouten, kapot };
}

function zelftest() {
  const leeg = new Set(), af = new Set(['9.9']);
  return oordeel('[9.9] proef', ['faalt'], leeg) === 'NOG NIET GEBOUWD' &&
    oordeel('[9.9] proef', [], leeg) === 'FAIL' &&
    oordeel('[9.9] proef', ['faalt'], af) === 'FAIL' &&
    oordeel('[9.9] proef', [], af) === 'PASS';
}

function main() {
  let fails = 0, nogNiet = 0, gebouwd = 0;
  if (!zelftest()) { console.log('FAIL layout: het oordeel over nog niet gebouwde regels klopt niet'); process.exit(1); }
  console.log('PASS  layout: wat nog niet gebouwd is moet falen, en slaagt het toch, dan faalt de suite');
  const start = spawnSync('sh', [DEV, 'start', ROOT, String(POORT)], { encoding: 'utf8' });
  if (start.status !== 0) {
    console.log('FAIL layout: tools/dev.sh start op poort ' + POORT + ' lukte niet\n' + start.stdout + start.stderr);
    process.exit(1);
  }
  /* elke run begint met een lege server: een staat van een eerdere run is ouder dan wat een regel klaarzet, en wint dan */
  const leeg = spawnSync('sh', [DEV, 'reset', String(POORT)], { encoding: 'utf8' });
  if (leeg.status !== 0) {
    console.log('FAIL layout: tools/dev.sh reset op poort ' + POORT + ' lukte niet\n' + leeg.stdout + leeg.stderr);
    process.exit(1);
  }
  try {
    const open = pw('open', URL);
    if (open.status !== 0) throw new Error('playwright-cli open lukte niet: ' + open.stderr);
    for (const geval of GEVALLEN) {
      if (ALLEEN && !geval.regels.some(r => ALLEEN.test(r))) continue;
      const { fouten, kapot } = draai(geval);
      for (const regel of geval.regels) {
        if (kapot[regel]) { fails++; console.log('FAIL  ' + regel + '  (meting mislukt: ' + kapot[regel] + ')'); continue; }
        const f = fouten[regel], o = oordeel(regel, f, GEBOUWD);
        if (o === 'NOG NIET GEBOUWD') { nogNiet++; console.log('NOG NIET GEBOUWD  ' + regel + '  (' + f[0] + ')'); }
        else if (o === 'PASS') { gebouwd++; console.log('PASS  ' + regel); }
        else { fails++; console.log('FAIL  ' + regel + '  (' + (f.length ? f.join('; ') : 'staat als nog niet gebouwd, maar slaagt al: zet zijn nummer in GEBOUWD') + ')'); }
      }
    }
  } finally {
    pw('close');
    spawnSync('sh', [DEV, 'stop', String(POORT)], { encoding: 'utf8' });
  }
  console.log('\nlayout-orakel: ' + nogNiet + ' nog niet gebouwd, ' + gebouwd + ' gebouwd');
  console.log(fails === 0 ? 'ALL LAYOUT CHECKS PASSED' : fails + ' LAYOUT CHECKS FAILED');
  process.exit(fails === 0 ? 0 : 1);
}

main();
