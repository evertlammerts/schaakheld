#!/usr/bin/env node
/* Bewijst dat de compatibiliteitspoort de valkuilen vindt: kopieert src/ en
   build.sh naar een tijdelijke map, zet er per geval een regel in, bouwt, en
   eist dat de poort op precies die bronregel precies de verwachte kenmerken
   meldt. Gevallen met [] mogen niets opleveren: dat bewaakt tegen
   overmelden en tegen vastlopen.
   Draaien: node tools/compat/selftest.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkBuild, exemptionProblems, esExemptionProblems } from './gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const JS = [
  ['const t1 = /(?<=a)b/;', ['regexp-lookbehind-assertions']],
  ["const t1b = '\u2028', t1c = 1;", []],
  ['const t1d = xs => xs.at(0);', ['array-prototype-at']],
  ['const t1e = 1;\rconst t1f = xs => xs.at(0);', ['array-prototype-at']],
  ['const t1g = xs => xs.at(0);', ['array-prototype-at']],
  ["const t2 = new RegExp('(?<!a)b');", ['regexp-lookbehind-assertions']],
  ['const t3 = /(?<=a)[\\p{L}--[a-z]]/v;', ['regexp-lookbehind-assertions', 'regexp-v-flag']],
  ['class T4 { static { this.x = 1; } }', ['class-static-block']],
  ['class T5 { #p = 1; }', ['class-instance-fields']],
  ['class T6 { static s = 2; #m() { return #m in this; } }', []],
  ['const t7 = xs => xs.toSorted();', ['array-prototype-tosorted']],
  ['const t8 = xs => xs.toReversed();', ['array-prototype-toreversed']],
  ['const t9 = xs => xs.with(0, 1);', ['array-prototype-with']],
  ['const t10 = xs => xs.at(-1);', ['array-prototype-at']],
  ['const t11 = xs => xs.findLast(Boolean);', ['array-prototype-findlast-findlastindex']],
  ['const t12 = xs => xs.at.call(xs, 0);', ['array-prototype-at']],
  ['const t13 = it => it.chunks(2);', ['iterator-prototype-chunks']],
  ['const t14 = v => v.chunks.length;', []],
  ['const t15 = xs => xs.map(x => x).filter(Boolean).find(Boolean);', []],
  ['const t16 = Promise.withResolvers();', ['promise-withresolvers']],
  ["const t17 = o => Object.hasOwn(o, 'k');", ['object-hasown']],
  ['const t18 = xs => Object.groupBy(xs, String);', ['object-groupby']],
  ['const t19 = () => Temporal.Now.instant();', ['temporal']],
  ['const t20 = () => new DisposableStack();', ['disposablestack']],
  ["const t21 = () => Intl.supportedValuesOf('calendar');", ['intl-supportedvaluesof']],
  ['const t22 = () => new Intl.Segmenter();', []],
  ["const t23 = () => new Error('x', { cause: 1 });", []],
  ['const t24 = /a/d;', []],
  ['let t25; t25 ??= 1;', []],
  ["const t26 = s => s.replaceAll('a', 'b');", []],
  ['const t27 = o => structuredClone(o);', ['structuredClone']],
  ['const t28 = o => { if (window.structuredClone) return structuredClone(o); };', ['structuredClone']],
  ['const t29 = () => crypto.randomUUID();', ['Crypto.randomUUID']],
  ['const t30 = () => window.crypto.randomUUID();', ['api.Crypto.randomUUID']],
  ['const t31 = () => self.crypto.randomUUID();', ['api.Crypto.randomUUID']],
  ['const t32 = () => AbortSignal.timeout(10);', ['api.AbortSignal.timeout_static']],
  ['const t33 = u => URL.canParse(u);', ['api.URL.canParse_static']],
  ["function t34(URL) { return URL.canParse('x'); }", []],
  ["const t35 = () => new CompressionStream('gzip');", ['CompressionStream']],
  ['const t36 = () => window.BarcodeDetector;', ['BarcodeDetector']],
  ['const t36b = () => window.CloseWatcher;', ['api.CloseWatcher']],
  ['const t37 = () => document.startViewTransition(() => {});', ['api.Document.startViewTransition']],
  ['const t37b = { startViewTransition() {} }, t37c = () => document.startViewTransition(() => {});', ['api.Document.startViewTransition']],
  ['const t37d = () => window.cookieStore;', ['api.Window.cookieStore']],
  ["const t37e = JSON.parse('1', (k, v, ctx) => ctx.source);", ['json-parse-reviver-context-parameter']],
  ['const t38 = el => { el.inert = true; };', ['api.HTMLElement.inert']],
  ['const t38b = el => { el.style.transition = el.dataset.to; };', []],
  ['const t38c = el => el.setHTMLUnsafe(1);', ['api.Element.setHTMLUnsafe']],
  ['const t38d = { getHTML() { return 1; } }, t38e = t38d.getHTML();', []],
  ["const t38f = el => el.moveBefore(el, null);", ['api.Document.moveBefore']],
  ['const t38g = () => new SharedArrayBuffer(8);', ['shared-array-buffer']],
  ['const t38h = () => Atomics.add;', ['atomics']],
  ['const t38i = xs => [xs.flat(), Object.fromEntries(xs), Promise.allSettled(xs)];', []],
  ['const t38j = () => globalThis.AbortSignal.timeout(1);', ['api.AbortSignal.timeout_static']],
  ['const t38k = () => window.URL.canParse(1);', ['api.URL.canParse_static']],
  ['const t39 = d => d.showModal();', ['api.HTMLDialogElement.showModal']],
  ['const t40 = d => d.requestClose();', ['api.CloseWatcher.requestClose']],
  ['const t41 = el => el.popover;', ['api.HTMLElement.popover']],
  ['const t42 = el => el.showPopover();', ['api.HTMLElement.showPopover']],
  ['const t43 = el => el.hidePopover();', ['api.HTMLElement.hidePopover']],
  ['const t44 = el => el.togglePopover();', ['api.HTMLElement.togglePopover']],
  ['const t45 = el => el.checkVisibility();', ['api.Element.checkVisibility']],
  ['const t46 = i => i.showPicker();', ['api.HTMLInputElement.showPicker']],
  ['const t47 = f => f.requestSubmit();', ['api.HTMLFormElement.requestSubmit']],
  ['const t48 = el => el.computedStyleMap();', ['api.Element.computedStyleMap']],
  ["const t49 = () => document.createElement('dialog');", ['html.elements.dialog']],
  ["const t50 = el => el.setAttribute('inert', '');", ['html.global_attributes.inert']],
  ["const t51 = el => el.toggleAttribute('inert');", ['html.global_attributes.inert']],
  ["const t52 = '<dialog open>Hoi</dialog>';", ['html.elements.dialog']],
  ["const t53 = '<div inert>x</div>';", ['html.global_attributes.inert']],
  ["const t54 = '<b inert><p>x</b>y</p>';", ['html.global_attributes.inert']],
  ["const t55 = '<constructor></constructor><table><tr><td>x</td></tr></table>';", []],
  ['const t56 = n => `<p style="height:50svh">${n}</p>`;', ['viewport-unit-variants']],
  ["const t57 = '<style>.a { backdrop-filter: blur(1px); }</style>';", ['css.properties.backdrop-filter']],
  ["const t58 = '<button onclick=\"xs.toSorted()\">x</button>';", ['array-prototype-tosorted']],
  ["const t59 = () => document.querySelector('a:has(b)');", ['css.selectors.has']],
  ["const t60 = el => el.matches(':focus-visible');", ['css.selectors.focus-visible']],
  ["const t61 = el => el.matches('dialog:modal');", ['css.selectors.modal']],
  ["const t62 = el => el.closest('.a:has(b), .c');", ['css.selectors.has', 'css-selector-list']],
  ["const t63 = el => { el.style.height = '100dvh'; };", ['viewport-unit-variants']],
  ['const t64 = (el, n) => { el.style.height = `${n}dvh`; };', ['viewport-unit-variants']],
  ["const t65 = n => n + 'dvh';", ['viewport-unit-variants']],
  ["const t66 = '100DVH';", ['viewport-unit-variants']],
  ["const t67 = el => { el.style.color = 'color-mix(in srgb, red, blue)'; };", ['css.types.color.color-mix']],
  ["const t68 = el => { el.style.color = 'oklch(70% 0.1 200)'; };", ['css.types.color.oklch']],
  ["const t69 = el => { el.style.cssText = 'backdrop-filter: blur(1px)'; };", ['css.properties.backdrop-filter']],
  ["const t70 = el => { el.style.backdropFilter = 'blur(1px)'; };", ['css.properties.backdrop-filter']],
  ["const t71 = el => { el.style.cssText = '-webkit-backdrop-filter: blur(1px); backdrop-filter: blur(1px)'; };", []],
  ["const t72 = el => el.style.setProperty('container-type', 'size');", ['css.properties.container-type']],
  ["const t73 = el => el.setAttribute('style', 'width: 5cqi');", ['css-container-query-units']],
  ["const t74 = el => { el.textContent = '@container (min-width: 1px) {}'; };", ['css-container-queries']],
  ["const t75 = 'container-name: kaart';", ['css.properties.container-name']],
  ["const t76 = ':HAS(a)';", ['css-has']],
  ['const t77 = n => `${n}:has(b)`;', ['css-has']],
  ['const t78 = /(?<=a)b/; // compat-allow regexp-lookbehind-assertions: alleen na een feature-test gebruikt', []],
  ['const t79 = /(?<=c)d/; // compat-allow regexp-lookbehind-assertions', ['regexp-lookbehind-assertions', 'allow-without-reason']],
  ['const t80 = /(?<=e)f/; // compat-allow regexp-lookbehind-assertions: prima', ['regexp-lookbehind-assertions', 'allow-without-reason']],
  ['const t81 = /(?<=k)l/; // compat-allow', ['regexp-lookbehind-assertions', 'allow-malformed']],
  ['const t82 = 1; // compat-allow css-has: deze regel heeft geen bevinding', ['allow-unused']],
  ['const t83 = /(?<=g)h/; // compat-allow css-has: verkeerd kenmerk voor deze regel', ['regexp-lookbehind-assertions', 'allow-unused']],
  ['const t84 = xs => xs.at(-1).findLast(Boolean); /* compat-allow array-prototype-at: een twee drie */ /* compat-allow x: een twee drie */',
    ['array-prototype-at', 'array-prototype-findlast-findlastindex', 'allow-malformed']],
  ["const t85 = 'x // compat-allow array-prototype-at: een twee drie', t85b = xs => xs.at(0);", ['array-prototype-at']],
  ['const t86 = /(?<=i)j/; // eslint-disable-line', ['regexp-lookbehind-assertions', 'eslint-comment']],
  ['const t87 = 1; // eslint-disable-line compat-allow eslint-comment: een twee drie', ['eslint-comment', 'allow-malformed']],
];

const CSS = [
  ['.t:has(b) { color: red; }', ['css-has']],
  ['@container (min-width: 10px) { .t { color: red; } }', ['css-container-queries']],
  ['.t { container-type: inline-size; }', ['css.properties.container-type']],
  ['.t { height: 100dvh; }', ['viewport-unit-variants']],
  ['.t { min-height: 50svh; }', ['viewport-unit-variants']],
  ['.t { color: color-mix(in srgb, red 50%, blue); }', ['css.types.color.color-mix']],
  ['.t { color: red; & .u { color: blue; } }', ['css-nesting']],
  ['.t { .u { color: blue; } }', ['css-nesting']],
  ['@layer basis { .t { color: red; } }', ['css-cascade-layers']],
  ['.t { width: 10cqw; }', ['css-container-query-units']],
  ['.t { overflow: clip; }', ['css.properties.overflow.clip']],
  ["@property --t { syntax: '<length>'; inherits: false; initial-value: 0px; }", ['css.at-rules.property']],
  ['@media (scripting: enabled) { .t { color: red; } }', ['css-media-scripting']],
  ['@media (update: fast) { .t { color: red; } }', ['css.at-rules.media.update']],
  ['.t:modal { color: red; }', ['css.selectors.modal']],
  ['.t { backdrop-filter: blur(2px); }', ['css.properties.backdrop-filter']],
  ['.t { -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }', []],
  ['.t { -webkit-backdrop-filter: blur(2px); } .u { backdrop-filter: blur(2px); }', ['css.properties.backdrop-filter']],
  ['.t { user-select: none; }', ['css.properties.user-select']],
  ['.t { -webkit-user-select: none; user-select: none; }', []],
  ['.t { -webkit-user-select: none; } .u { user-select: none; }', ['css.properties.user-select']],
  ['.t:focus-visible { outline: 0; } /* compat-allow css-focus-visible: Safari 15.0 tot 15.3 toont de gewone focusrand */', []],
  ['.t:focus-visible, .u:hover { outline: 0; } /* compat-allow css-focus-visible: Safari 15.0 tot 15.3 toont de gewone focusrand */', ['css-selector-list']],
  ['.t:has(b), .u:popover-open { color: red; }', ['css-has', 'css.selectors.popover-open', 'css-selector-list']],
  ['.u, :is(.t, :focus-visible) { color: red; }', ['css-focus-visible']],
  ['.t { width: round(100dvh, 1px); }', ['viewport-unit-variants', 'css.types.round']],
  ['.t { cursor: pointer; touch-action: none; }', []],
  ['.t { inset: 0; aspect-ratio: 1; gap: 4px; }', []],
  ['@media (prefers-color-scheme: dark) and (display-mode: standalone) { .t { color: red; } }', []],
  ['.t { height: 100dvh; } /* compat-allow viewport-unit-variants: terugval met 100vh ervoor */', []],
  ['/* doiuse-disable css-has */ .t:has(i) { color: red; }', ['doiuse-comment', 'css-has']],
];

const MARKUP = [
  ['<dialog id="t1"></dialog>', ['html.elements.dialog']],
  ['<div inert></div>', ['html.global_attributes.inert']],
  ['<div popover></div>', ['html.global_attributes.popover']],
  ['<div style="height: 100svh"></div>', ['viewport-unit-variants']],
  ['<div style="color: color-mix(in srgb, red, blue)"></div>', ['css.types.color.color-mix']],
  ['<div style="font-family:&quot;A&quot;; height: 10dvh"></div>', ['viewport-unit-variants']],
  ['<svg><rect style="height: 10dvh"/></svg>', ['viewport-unit-variants']],
  ['<input enterkeyhint="go"><video playsinline></video>', []],
  ['<table><tr><td>x</td></tr></table><b><p>x</b>y</p><constructor></constructor>', []],
  ['<button onclick="xs.toSorted()">x</button>', ['array-prototype-tosorted']],
  ['<a href="javascript:xs.toSorted()">x</a>', ['array-prototype-tosorted']],
  ['<script type=" Module ">const m1 = xs => xs.toSorted();</script>', ['array-prototype-tosorted']],
  ['<script type="text/ecmascript">const m2 = xs => xs.toSorted();</script>', ['array-prototype-tosorted']],
  ['<script type="application/json">{"a": "xs.toSorted()"}</script>', []],
  ['<script src="ergens.js"></script>', ['script-src']],
  ['<style><!-- .t:has(a) { color: red; } --></style>', ['css-has']],
  ['<dialog id="t2"></dialog> <!-- compat-allow html.elements.dialog: terugval getest in de flowtest -->', []],
];

const SW = [
  ['const t = xs => xs.toSorted();', ['array-prototype-tosorted']],
];

function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-selftest-'));
  fs.cpSync(path.join(REPO, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'build.sh'), path.join(dir, 'build.sh'));
  return dir;
}

function readLines(dir, file) {
  return fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
}

function insert(dir, file, index, cases) {
  if (index < 0) throw new Error(`invoegpunt niet gevonden in ${file}`);
  const lines = readLines(dir, file);
  lines.splice(index, 0, ...cases.map(c => c[0]));
  fs.writeFileSync(path.join(dir, file), lines.join('\n'));
  return cases.map((c, i) => ({ file, line: index + i + 1, text: c[0], want: c[1] }));
}

const firstLine = (dir, file, pred) => readLines(dir, file).findIndex(pred);
const lastLine = (dir, file, pred) => readLines(dir, file).findLastIndex(pred);
const build = dir => execFileSync('sh', ['build.sh'], { cwd: dir, stdio: 'pipe' });

let failures = 0;
let passed = 0;
const check = (cond, what) => {
  if (cond) passed++;
  else { failures++; console.log(`FOUT ${what}`); }
};

function expectOnLines(findings, placed) {
  for (const c of placed) {
    const prefix = `${c.file}:${c.line}:`;
    const got = findings.filter(f => f.at.startsWith(prefix)).map(f => f.id).sort();
    const want = [...c.want].sort();
    check(JSON.stringify(got) === JSON.stringify(want),
      `${prefix} ${c.text}\n  verwacht: ${want.join(', ') || 'niets'}\n  gekregen: ${got.join(', ') || 'niets'}`);
  }
}

function expectAt(findings, c, column, id) {
  const at = `${c.file}:${c.line}:${column}`;
  check(findings.some(f => f.at === at && f.id === id), `verwacht ${id} precies op ${at}; gekregen ${findings.filter(f => f.at.startsWith(`${c.file}:${c.line}:`)).map(f => f.at + ' ' + f.id).join(', ')}`);
}

const cli = dir => spawnSync(process.execPath, [path.join(HERE, 'gate.mjs'), dir], { encoding: 'utf8' });

check(exemptionProblems().length === 0, `de uitzonderingstabel klopt niet met de gegevens: ${exemptionProblems().join('; ')}`);
check(exemptionProblems([{ feature: 'css.properties.color', browsers: ['safari_ios'], reason: 'een twee drie' }]).length === 1,
  'een uitzondering voor iets dat overal werkt valt niet op');
check(exemptionProblems([{ feature: 'css-has', browsers: ['chrome'], reason: 'een twee drie' }]).length === 1,
  'een caniuse-uitzondering voor een browser die het wel kan valt niet op');
check(esExemptionProblems().length === 0, `de es-x-uitzonderingen kloppen niet: ${esExemptionProblems().join('; ')}`);
check(esExemptionProblems({ 'no-class-static-block': 'javascript.classes.static.initialization_blocks' }).length === 1,
  'een es-x-uitzondering voor iets dat de ondergrens mist valt niet op');
check(esExemptionProblems({ 'no-class-instance-fields': 'javascript.classes.public_class_fields' }).length === 1,
  'een es-x-uitzondering voor iets dat de ondergrens maar half draait valt niet op');

const dir = copyRepo();
try {
  build(dir);
  const clean = cli(dir);
  check(clean.status === 0 && /compat ok/.test(clean.stdout), `de poort op de schone build gaf status ${clean.status}\n${clean.stdout}${clean.stderr}`);

  const placed = [];
  placed.push(...insert(dir, 'src/tail.html', lastLine(dir, 'src/tail.html', l => l.trim() === '</script>'), JS));
  placed.push(...insert(dir, 'src/head.html', lastLine(dir, 'src/head.html', l => l.trim() === '<script>'), MARKUP));
  const markup = placed.filter(c => c.file === 'src/head.html');
  placed.push(...insert(dir, 'src/head.html', firstLine(dir, 'src/head.html', l => l.trim() === '</style>'), CSS));
  for (const c of markup) c.line += CSS.length;
  placed.push(...insert(dir, 'src/sw.js', firstLine(dir, 'src/sw.js', l => /addEventListener/.test(l)), SW));
  build(dir);
  const findings = await checkBuild(dir);
  expectOnLines(findings, placed);

  const at = text => placed.find(c => c.text === text);
  expectAt(findings, at(JS[0][0]), JS[0][0].indexOf('/(?') + 1, 'regexp-lookbehind-assertions');
  const tpl = JS.find(c => c[0].startsWith('const t77'))[0];
  expectAt(findings, at(tpl), tpl.indexOf(':has') + 1, 'css-has');
  const lit = JS.find(c => c[0].startsWith('const t53'))[0];
  expectAt(findings, at(lit), lit.indexOf('inert') + 1, 'html.global_attributes.inert');
  expectAt(findings, at(MARKUP[1][0]), 6, 'html.global_attributes.inert');
  expectAt(findings, at(MARKUP[3][0]), MARKUP[3][0].indexOf('height') + 1, 'viewport-unit-variants');
  expectAt(findings, at(CSS[3][0]), 6, 'viewport-unit-variants');

  const failing = cli(dir);
  check(failing.status === 1 && failing.stdout.includes(`${at(JS[0][0]).file}:${at(JS[0][0]).line}:`) && /FAIL compat/.test(failing.stdout),
    `de poort-CLI gaf status ${failing.status} zonder de verwachte melding`);

  fs.appendFileSync(path.join(dir, 'src/tail.html'), '\n');
  check((await checkBuild(dir)).some(f => f.id === 'build-stale' && f.at === 'index.html'), 'een index.html die niet uit src/ komt valt niet op');

  fs.rmSync(path.join(dir, 'src'), { recursive: true });
  fs.cpSync(path.join(REPO, 'src'), path.join(dir, 'src'), { recursive: true });
  const broken = insert(dir, 'src/tail.html', lastLine(dir, 'src/tail.html', l => l.trim() === '</script>'),
    [['const = ; // compat-allow syntax: een twee drie', ['syntax']], ['@zoet class T {}', []]]);
  build(dir);
  expectOnLines(await checkBuild(dir), broken);

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-leeg-'));
  const crash = cli(empty);
  fs.rmSync(empty, { recursive: true, force: true });
  check(crash.status === 2 && /liep vast/.test(crash.stderr), `een poort die vastloopt gaf status ${crash.status} in plaats van 2`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failures) {
  console.log(`FAIL compat-selftest: ${failures} van ${failures + passed} controles fout`);
  process.exit(1);
}
console.log(`compat-selftest ok: ${passed} controles`);
