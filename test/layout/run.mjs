#!/usr/bin/env node
/* Layoutcontroles in een echte browser-engine (WebKit via playwright-cli), voor
   de regels van plan.md die op maten hangen. De DOM-shim van de flowtests
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

/* een kind met een naam en verder niets: geen naamvraag, geen weekkaart */
const DOC = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
  max: { best: 0, goal: {} }, friends: {}, loc: {} });

/* Regelnummers die gebouwd zijn: hun controles zijn gewone controles. Een
   regel bouwen = zijn nummer hier toevoegen, in dezelfde commit. */
const GEBOUWD = new Set(['1.8', '1.13', '1.14', '2.1', '2.2', '2.4', '2.5', '2.6', '4.7', '4.8']);

/* het oordeel over een controle: wat nog niet gebouwd is moet falen */
function oordeel(regel, fouten, gebouwd) {
  const nr = (regel.match(/^\[([\d.]+)\]/) || [])[1];
  if (gebouwd.has(nr)) return fouten.length ? 'FAIL' : 'PASS';
  return fouten.length ? 'NOG NIET GEBOUWD' : 'FAIL';
}

/* elke maat uit de tabel van visual.md 8.3 die een doel is: alles behalve de telefoon dwars */
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
  const pagina = () => page.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth,
    H: innerHeight, W: innerWidth }));
  const laatsteOnder = () => page.evaluate(() => { const o = document.getElementById('onder'); if (!o) return null;
    const bs = [...o.querySelectorAll('button')].filter(b => b.getClientRects().length); const b = bs[bs.length - 1];
    if (!b) return null; const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });
`;

/* elk geval: een maat, een paginafunctie, en de regels die het meet */
const GEVALLEN = [];

for (const [W, H] of KLEIN) {
  GEVALLEN.push({ regels: ['[1.13] ' + W + 'x' + H + ': het weekdoelvenster met "Potjes met een vriend" scrollt tot de laatste knop, en die werkt'],
    code: `
      const n = '[1.13] ${W}x${H}: het weekdoelvenster met "Potjes met een vriend" scrollt tot de laatste knop, en die werkt';
      await vers(${W}, ${H});
      await klik('#weekStrip');
      await page.waitForTimeout(300);
      await klikTekst(/Potjes met een vriend/);
      await page.waitForTimeout(300);
      const knop = page.getByRole('button', { name: /Dat is mijn doel/ }).first();
      check(n, 'de knop bestaat', await knop.count() > 0);
      if (await knop.count()) {
        await knop.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        const r = await knop.boundingBox();
        const raak = r && await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y);
          return !!e && !!e.closest('button') && /Dat is mijn doel/.test(e.closest('button').textContent); }, [r.x + r.width / 2, r.y + r.height / 2]);
        check(n, 'de knop is in beeld te brengen', !!r && r.y >= 0 && r.y + r.height <= ${H} + 0.5);
        check(n, 'en daar te tikken', !!raak);
      }`
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
      await vers(${W}, ${H});
      await page.evaluate(() => { Math.random = () => 0.1; });
      await startPotje();
      let voor = await rect('#board');
      await klikTekst(/Speurbril/);
      await page.waitForTimeout(300);
      check(n, 'na een lange tip', gelijk(voor, await rect('#board')));
      await zet('e2e4');
      await page.waitForTimeout(400);
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
      check(n, 'in de bovenste 64 pixels (visual.md 11.1: een rij van 56)', !!chip && !!gear && chip.bottom <= 64.5 && gear.bottom <= 64.5);`
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
      const reden = await rect('#taskBox .e-body > :first-child'), onder = await rect('#onder');
      check(n, 'de eerste reden staat helemaal in beeld', !!reden && !!onder && binnen(reden, ${W}, ${H}) &&
        reden.top >= onder.top - 0.5 && reden.bottom <= onder.bottom + 0.5);`
  });

  GEVALLEN.push({ regels: ['[2.4] ' + W + 'x' + H + ': elke vraag en elke uitleg uit tekst.md past, voor elke soort opdracht, en niets scrolt in de strook'],
    code: `
      const n = '[2.4] ${W}x${H}: elke vraag en elke uitleg uit tekst.md past, voor elke soort opdracht, en niets scrolt in de strook';
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

  GEVALLEN.push({ regels: ['[3.3] ' + W + 'x' + H + ': de Verder-kaart, de weekregel en beide spelknoppen staan boven de tabbalk'],
    code: `
      const n = '[3.3] ${W}x${H}: de Verder-kaart, de weekregel en beide spelknoppen staan boven de tabbalk';
      await vers(${W}, ${H});
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
        t['#oefen-trucs'] < t['#oefen-koning'] && t['#oefen-koning'] < t['#oefen-opening']);`
  });
}

/* plan.md 1.8: een speelscherm opent met het hele bord in beeld, ook als het
   kind op Spelen eerst naar beneden scrolde (B03: het speelscherm erfde die
   scroll); tot increment 2 mag dat door het bord in beeld te scrollen. Op
   360x640 en 390x667 staat het bord vandaag al in beeld; vanaf increment 2
   meet 2.1 elke maat. */
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

/* de langste zinnen in een potje (ux-run/reviews/inc2/strook-te-lang.md, na het inkorten): coach-tips, Turbo's
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
      const k = await page.evaluate(() => { const e = document.querySelector('.tegen-sub'); return { sw: e.scrollWidth, cw: e.clientWidth, t: e.innerText }; });
      check(n, 'testopzet: bewaard staat erin', /bewaard/.test(k.t));
      check(n, 'niet afgeknipt', k.sw <= k.cw + 1);`
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

/* plan.md 2.1 en de review van increment 2: elke soort opdracht, ook De Beste Zet met zijn keuzes, de
   openingsles met zijn meters en de denkwolk, op de maten waar het misging */
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
           mag een keuze op de plek van Volgende staan; een tik in de eerste 350 ms telt dan niet (D34) */
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
      for (const k of ['h1h2', 'h1h3']) {
        await page.evaluate(k => { const m = legalMoves(session.S).find(x => moveKey(x) === k); onCell(m.from); onCell(m.to); }, k);
        await page.waitForTimeout(3500);
      }
      const reden = await rect('#taskBox .e-body > :first-child'), onder = await rect('#onder');
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

/* het speelscherm van een oefening is precies zo hoog als het venster, en het vak onder het bord past precies om
   een uitleg van drie regels met de knoppen eronder (visual.md 8.6: op een kort scherm 120) */
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

/* visual.md K2: een vriendschapsvraag in de eindkaart past, met één hoofdknop en zonder dubbele knop */
for (const [W, H] of KLEIN) {
  const n = '[4.7] ' + W + 'x' + H + ': een vriendschapsvraag in de eindkaart: alles past, één hoofdknop, en Vrienden worden staat er niet nog eens';
  GEVALLEN.push({ regels: [n], code: `
      const n = ${JSON.stringify(n)};
      await vers(${W}, ${H});
      const k = await page.evaluate(async () => {
        MP = { room: 'kamer-test-1', seat: 'stoel-test-1', host: true, myColor: 'w', gameNo: 1, revMine: false, revTheirs: false,
          peerName: 'Fien', open: false, weg: false, gameId: 'potje-test-1', peerOn: true };
        mpBeginGame();
        endGame({ over: true, result: 'b', reason: 'opgave' });
        await new Promise(r => setTimeout(r, 300));
        mpOnVriendVraag({ t: 'vriend?', pub: 'A'.repeat(88) });
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
          peerName: 'Fien', open: false, weg: false, gameId: 'potje-test-1', peerOn: true };
        mpBeginGame();
        endGame({ over: true, result: 'b', reason: 'opgave' });
        await new Promise(r => setTimeout(r, 300));
        mpOnVriendVraag({ t: 'vriend?', pub: 'A'.repeat(88) });
        await new Promise(r => setTimeout(r, 300));
      });
      const vriend = await meet();
      check(n, 'testopzet: een eindkaart met een vriendschapsvraag', vriend.length >= 3);
      check(n, 'met een vriendschapsvraag: ' + vriend.join(', '), vriend.every(h => h >= 43.5));` });
}

/* visual.md K1: met het toetsenbord open blijven de woordsuggesties in beeld, en de knop springt niet */
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
      await vers(${W}, ${H});
      await page.evaluate(() => { Math.random = () => 0.1; });
      await startPotje();
      await zet('e2e4');
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
  try {
    const open = pw('open', URL);
    if (open.status !== 0) throw new Error('playwright-cli open lukte niet: ' + open.stderr);
    for (const geval of GEVALLEN) {
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
