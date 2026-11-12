#!/usr/bin/env node
/* Layoutcontroles in een echte browser-engine (WebKit via playwright-cli), voor
   de regels van plan.md die op maten hangen. De DOM-shim van de flowtests
   heeft geen opmaak; hier staan de rechthoeken echt op een scherm.

   Draaien: node test/layout/run.mjs   (./test.sh doet dat als playwright-cli er is)
   Het bouwsel in de repo-root wordt geserveerd met tools/dev.sh op poort 8719;
   DEV_SH wijst desgewenst een ander dev.sh aan. De sessie heet fd-layout-*.

   Zoals in de flowsuite staat een regel die nog niet gebouwd is als nogNiet:
   zijn controles moeten falen; slagen ze, dan faalt de suite. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POORT = 8719;
const URL = 'http://127.0.0.1:' + POORT + '/';
const DEV = process.env.DEV_SH || path.join(ROOT, 'tools', 'dev.sh');
const SESSIE = 'fd-layout-webkit';

/* een kind met een naam en verder niets: geen naamvraag, geen weekkaart */
const DOC = JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
  max: { best: 0, goal: {} }, friends: {}, loc: {} });

/* Regelnummers die gebouwd zijn: hun controles zijn gewone controles. Een
   regel bouwen = zijn nummer hier toevoegen, in dezelfde commit. */
const GEBOUWD = new Set(['1.13']);

/* het oordeel over een controle: wat nog niet gebouwd is moet falen */
function oordeel(regel, fouten, gebouwd) {
  const nr = (regel.match(/^\[([\d.]+)\]/) || [])[1];
  if (gebouwd.has(nr)) return fouten.length ? 'FAIL' : 'PASS';
  return fouten.length ? 'NOG NIET GEBOUWD' : 'FAIL';
}

const MATEN = [[360, 640], [375, 553], [375, 647], [390, 667], [402, 874], [768, 1024], [1024, 768], [1194, 834], [1280, 720]];
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
      check(n, 'na een antwoord', gelijk(voor, await rect('#board')));`
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

  GEVALLEN.push({ regels: ['[3.3] ' + W + 'x' + H + ': de Verder-kaart, de weekregel en beide spelknoppen staan boven de tabbalk'],
    code: `
      const n = '[3.3] ${W}x${H}: de Verder-kaart, de weekregel en beide spelknoppen staan boven de tabbalk';
      await vers(${W}, ${H});
      const tab = await rect('.tabbar');
      for (const s of ['#verder', '#weekStrip', '#spelTurbo', '#spelVriend']) {
        const r = await rect(s);
        check(n, s + ' boven de tabbalk', !!r && !!tab && r.top >= 0 && r.bottom <= tab.top + 0.5);
      }`
  });
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
  const fouten = {};
  for (const regel of geval.regels) {
    fouten[regel] = uit ? (uit[regel] || ['geen meting']) : ['de browser gaf geen antwoord: ' + (r.stderr || r.stdout).trim().split('\n')[0]];
  }
  return fouten;
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
      const fouten = draai(geval);
      for (const regel of geval.regels) {
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
