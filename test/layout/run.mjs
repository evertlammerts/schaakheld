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
const GEBOUWD = new Set(['1.8', '1.13', '1.14', '2.1', '2.2', '2.4', '3.3', '3.4', '3.5', '3.11']);

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
      check(n, 'testopzet: de voorspelvraag staat er', await page.evaluate(() => /Wat is Turbo van plan|Denk vooruit/.test(document.body.innerText)));
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
      check(n, 'Volgende staat onder het bord, in beeld', !!volgende && !!bord && volgende.top >= bord.bottom - 0.5 && binnen(volgende, ${W}, ${H}));`
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

/* visual.md 11.6: Ik met een grid van trofeeën, en elk label binnen zijn kaart */
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

/* plan.md 3.3, ook op 375x647 (de app met browserbalken, waar het panel twee keer moest scrollen) en met
   een bewaard potje op de kaart; en geen zin op Spelen die halverwege wordt afgeknipt. Plan 3.11: met een
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
