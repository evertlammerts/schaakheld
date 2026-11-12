#!/usr/bin/env node
/* Compatibiliteitspoort: controleert de gebouwde index.html en sw.js tegen de
   oudste browsers die de app moet draaien (FLOOR hieronder). Een stukje
   onbekende syntax stopt het hele script op de oudste iPhone, en een
   Playwright-emulatie draait altijd een nieuwe engine; alleen deze poort
   bewaakt de ondergrens. Wat de poort ziet en wat niet: README.md hiernaast.

   Draaien: node tools/compat/gate.mjs [map met index.html, sw.js, src/ en build.sh]

   Een bewaakt gebruik (feature-test met een geteste terugval) of een gebruik
   dat op een doelbrowser onschuldig anders werkt, mag per regel:
     code  // compat-allow <kenmerk>: <reden van minstens drie woorden>
   Het kenmerk staat tussen haken achter de melding. */
process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Linter } from 'eslint';
import esx from 'eslint-plugin-es-x';
import compat from 'eslint-plugin-compat';
import { parse, parseFragment } from 'parse5';
import postcss from 'postcss';
import doiuse from 'doiuse';
import BrowserSelection from 'doiuse/lib/BrowserSelection.js';
import valueParser from 'postcss-value-parser';
import selectorParser from 'postcss-selector-parser';

const require = createRequire(import.meta.url);
const bcd = require('@mdn/browser-compat-data');

const FLOOR = [
  { name: 'iOS Safari 15.0', bcd: 'safari_ios', caniuse: 'ios_saf', version: '15.0' },
  { name: 'Safari 15', bcd: 'safari', caniuse: 'safari', version: '15' },
  { name: 'Chrome voor Android 120', bcd: 'chrome_android', caniuse: 'and_chr', version: '120' },
  { name: 'Samsung Internet 24', bcd: 'samsunginternet_android', caniuse: 'samsung', version: '24' },
  { name: 'Chrome (nieuwste)', bcd: 'chrome', caniuse: 'chrome', version: null },
  { name: 'Safari (nieuwste)', bcd: 'safari', caniuse: 'safari', version: null },
  { name: 'Firefox (nieuwste)', bcd: 'firefox', caniuse: 'firefox', version: null },
];

// Een regel hier is alleen voor een kenmerk dat op die browsers geen betekenis heeft.
export const NOT_APPLICABLE = [
  { feature: 'css.properties.cursor.pointer', browsers: ['safari_ios'], reason: 'een aanraakscherm heeft geen muisaanwijzer, en iOS toont met een trackpad altijd de gewone pijl' },
  { feature: 'css.properties.cursor.default', browsers: ['safari_ios'], reason: 'een aanraakscherm heeft geen muisaanwijzer, en iOS toont met een trackpad altijd de gewone pijl' },
  { feature: 'html.elements.video.playsinline', browsers: ['firefox'], reason: 'alleen iOS speelt video zonder dit attribuut schermvullend af; Firefox speelt video altijd in de pagina' },
  { feature: 'css-touch-action', browsers: ['safari'], reason: 'Safari op de desktop heeft geen aanraakscherm' },
];

// ES2022-onderdelen en later die de hele ondergrens volledig draait; es-x zou
// ze anders verbieden. Volledig: een gat in JavaScript gooit een fout.
export const ES_ON_FLOOR = {
  'no-class-private-fields': 'javascript.classes.private_class_fields',
  'no-class-private-methods': 'javascript.classes.private_class_methods',
  'no-class-static-fields': 'javascript.classes.static.class_fields',
  'no-private-in': 'javascript.classes.private_class_fields_in',
  'no-error-cause': 'javascript.builtins.Error.Error.options_cause_parameter',
  'no-regexp-d-flag': 'javascript.builtins.RegExp.hasIndices',
  'no-intl-segmenter': 'javascript.builtins.Intl.Segmenter',
};

// es-x-regels van ES2021 en ouder staan alleen aan als hun onderdeel volgens
// de MDN-gegevens ergens op de ondergrens ontbreekt; dit zijn de regels die
// hun onderdeel niet in hun beschrijving noemen.
const ESX_OLDER_DATA = {
  'no-regexp-lookbehind-assertions': 'javascript.regular_expressions.lookbehind_assertion',
};

const GLOBAL_OBJECTS = new Set(['window', 'self', 'globalThis']);
const GLOBAL_INSTANCES = {
  window: 'Window', self: 'Window', globalThis: 'Window', document: 'Document', navigator: 'Navigator',
  screen: 'Screen', location: 'Location', history: 'History', performance: 'Performance', crypto: 'Crypto',
  localStorage: 'Storage', sessionStorage: 'Storage', caches: 'CacheStorage', clients: 'Clients', console: 'console',
};

const UNALLOWABLE = new Set(['syntax', 'css-syntax', 'build-stale', 'script-src', 'eslint-comment', 'doiuse-comment',
  'allow-malformed', 'allow-without-reason', 'allow-unused']);

const BCD_PATH = /^(?:api|css|html|javascript|svg)\./;
const VENDOR = /^-(?:webkit|moz|ms|o)-/;
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const JS_TYPES = new Set(['', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript',
  'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

const own = (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined);
const names = fs => [...new Set(fs.map(f => f.name))].join(', ');

function cmpVersion(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

for (const f of FLOOR) {
  const releases = bcd.browsers[f.bcd].releases;
  f.release = Object.keys(releases).find(v => f.version === null ? releases[v].status === 'current' : cmpVersion(v, f.version) === 0);
  if (!f.release) throw new Error(`geen release ${f.version} van ${f.bcd} in de MDN-gegevens`);
  f.engine = releases[f.release];
}

// eslint-plugin-compat koppelt de Android-namen van browserslist niet aan de
// MDN-gegevens, en caniuse-lite kent alleen de nieuwste Chrome voor Android;
// daarom staat de desktop-Chrome met dezelfde Blink-versie voor elk van beide.
const QUERY = [...FLOOR.map(f => f.version ? `${f.caniuse} ${f.version}` : `last 1 ${f.caniuse} version`),
  ...FLOOR.filter(f => f.version && f.engine.engine === 'Blink').map(f => 'chrome ' + f.engine.engine_version)];

function bcdAt(p) {
  const node = p.split('.').reduce((o, k) => own(o, k), bcd);
  if (!node || !node.__compat) throw new Error(`${p} staat niet in de MDN-gegevens`);
  return node.__compat;
}

export function supportsAt(statements, release, prefix, strict) {
  return [].concat(statements || []).some(s => {
    if (s.flags || s.alternative_name || (strict && s.partial_implementation)) return false;
    if ((s.prefix || '') !== prefix) return false;
    if (s.version_added === true) return true;
    const added = typeof s.version_added === 'string' ? s.version_added.replace('≤', '') : null;
    if (!added || added === 'preview' || cmpVersion(added, release) > 0) return false;
    const removed = typeof s.version_removed === 'string' ? s.version_removed.replace('≤', '') : null;
    return !removed || removed === 'preview' || cmpVersion(removed, release) > 0;
  });
}

function lacking(c, prefix = '', strict = false) {
  return FLOOR.filter(f => !supportsAt(c.support[f.bcd], f.release, prefix, strict));
}

function applicable(feature, floorEntries) {
  const skip = new Set(NOT_APPLICABLE.filter(e => e.feature === feature).flatMap(e => e.browsers));
  return floorEntries.filter(f => !skip.has(f.bcd));
}

const missing = (feature, c) => applicable(feature, lacking(c));

export function esExemptionProblems(table = ES_ON_FLOOR) {
  const problems = [];
  for (const [rule, p] of Object.entries(table)) {
    if (!own(esx.rules, rule)) problems.push(`${rule}: geen regel van es-x`);
    else if (lacking(bcdAt(p), '', true).length) problems.push(`${rule}: ${p} draait niet volledig op ${names(lacking(bcdAt(p), '', true))}`);
  }
  return problems;
}

export function exemptionProblems(table = NOT_APPLICABLE) {
  const { features } = BrowserSelection.missingSupport(QUERY);
  const problems = [];
  for (const e of table) {
    if (!e.reason || !e.browsers.length) problems.push(`${e.feature}: geen reden of geen browsers`);
    for (const b of e.browsers) {
      const floor = FLOOR.filter(f => f.bcd === b);
      const feature = own(features, e.feature);
      const flagged = !floor.length ? false : BCD_PATH.test(e.feature)
        ? lacking(bcdAt(e.feature)).some(f => f.bcd === b)
        : !!(feature && feature.missingData && own(feature.missingData, floor[0].caniuse));
      if (!flagged) problems.push(`${e.feature} op ${b}: de gegevens melden dit niet (meer); de regel kan weg`);
    }
  }
  return problems;
}

{
  const problems = esExemptionProblems();
  if (problems.length) throw new Error(`es-x-uitzonderingen kloppen niet: ${problems.join('; ')}`);
}

// CSS die JavaScript aan de browser geeft buiten een bekende plek (selectors,
// stijl); het kenmerk is hetzelfde als dat van de CSS-controles.
const STRING_TRAPS = [
  [/:has\(/gi, 'css-has', ':has()', 'css.selectors.has'],
  [/@container\b/gi, 'css-container-queries', '@container', 'css.at-rules.container'],
  [/\bcontainer-type\s*:/gi, 'css.properties.container-type', 'container-type', 'css.properties.container-type'],
  [/\bcontainer-name\s*:/gi, 'css.properties.container-name', 'container-name', 'css.properties.container-name'],
  [/(?:^|[\d.])[sl]v(?:h|w|i|b|min|max)\b/gi, 'viewport-unit-variants', 'de eenheden svh, lvh en verwanten', 'css.types.length.viewport_percentage_units_small'],
  [/(?:^|[\d.])dv(?:h|w|i|b|min|max)\b/gi, 'viewport-unit-variants', 'de eenheden dvh en verwanten', 'css.types.length.viewport_percentage_units_dynamic'],
  [/(?:^|[\d.])cq(?:w|h|i|b|min|max)\b/gi, 'css-container-query-units', 'de eenheden cqw, cqh en verwanten', 'css.types.length.container_query_length_units'],
  [/\bcolor-mix\(/gi, 'css.types.color.color-mix', 'color-mix()', 'css.types.color.color-mix'],
].map(([re, id, what, p]) => ({ re, id, what, miss: applicable(id, lacking(bcdAt(p))) }));

const SUPPORTED_BUILTIN_MEMBERS = new Set();
const BUILTIN_MEMBERS = new Set();
for (const cls of Object.values(bcd.javascript.builtins)) {
  for (const [name, entry] of Object.entries(cls)) {
    if (name === '__compat' || !entry.__compat) continue;
    BUILTIN_MEMBERS.add(name);
    if (!lacking(entry.__compat).length) SUPPORTED_BUILTIN_MEMBERS.add(name);
  }
}

// Leden van web-API's waarvan geen linter het type ziet (`el.inert`): een naam
// telt als hij in de gegevens alleen bestaat op interfaces die ergens op de
// ondergrens ontbreken. Namen van ingebouwde JS-functies zijn voor es-x.
const NEW_MEMBERS = new Map();
{
  const defs = new Map();
  for (const [iface, members] of Object.entries(bcd.api)) {
    for (const [name, entry] of Object.entries(members)) {
      if (!/^[A-Za-z$][A-Za-z0-9$]*$/.test(name) || name === iface || !entry || !entry.__compat) continue;
      if (!defs.has(name)) defs.set(name, []);
      defs.get(name).push({ path: `api.${iface}.${name}`, compat: entry.__compat });
    }
  }
  for (const [name, list] of defs) {
    if (BUILTIN_MEMBERS.has(name)) continue;
    const miss = list.map(d => missing(d.path, d.compat));
    if (miss.every(m => m.length)) NEW_MEMBERS.set(name, { paths: list.map(d => d.path).sort(), miss: [...new Set(miss.flat())] });
  }
}

const CSS_FUNCTIONS = new Map();
(function indexTypes(node, p) {
  for (const [k, v] of Object.entries(node)) {
    if (k === '__compat' || !v || typeof v !== 'object') continue;
    const fn = v.__compat && ((v.__compat.description || '').match(/^<code>([\w-]+)\(\)<\/code>/) || [])[1];
    if (fn) {
      if (!CSS_FUNCTIONS.has(fn)) CSS_FUNCTIONS.set(fn, []);
      CSS_FUNCTIONS.get(fn).push({ path: `${p}.${k}`, compat: v.__compat });
    }
    indexTypes(v, `${p}.${k}`);
  }
})(bcd.css.types, 'css.types');

function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return node && node.type === 'Identifier' ? node.name : null;
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  return node.property.type === 'Literal' ? String(node.property.value) : null;
}

function isCalled(node) {
  const p = node.parent;
  if (p.type === 'CallExpression' && p.callee === node) return true;
  return p.type === 'MemberExpression' && p.object === node && ['call', 'apply', 'bind'].includes(memberName(p));
}

// De agressieve stand meldt elke `x.at()` zonder te weten wat x is. Een naam
// die ook een oudere ingebouwde functie heeft (map, find, forEach) zegt dan
// niets, en een methode telt pas als hij aangeroepen wordt (jsQR leest een
// eigen veld `chunks`, geen Iterator-methode).
function withoutOldNames(rule) {
  return {
    meta: rule.meta,
    create(context) {
      const quiet = Object.create(context, {
        report: {
          value: d => {
            if (SUPPORTED_BUILTIN_MEMBERS.has(memberName(d.node))) return;
            const method = /\bmethod\b/.test(rule.meta.messages[d.messageId] || '');
            if (method && d.node.type === 'MemberExpression' && !isCalled(d.node)) return;
            context.report(d);
          },
        },
      });
      return rule.create(quiet);
    },
  };
}

/* Nieuwe syntax stopt het hele script al bij het inlezen op een browser die
   hem niet kent; daar helpt geen feature-test, dus compat-allow mag hem nooit
   doorlaten. Een gebruik van een functie of object (ook een RegExp uit een
   string) gooit pas bij het draaien en kan wel bewaakt worden. */
const API_KNOPEN = new Set(['Identifier', 'MemberExpression', 'CallExpression', 'NewExpression', 'ChainExpression']);
/* klassevelden leest de ondergrens wel; het gat zit pas in het draaien */
const LEESBARE_SYNTAX = new Set(['no-class-instance-fields']);
let SYNTAX_KNOPEN = [];
function isSyntax(node, rule) {
  if (LEESBARE_SYNTAX.has(rule)) return false;
  if (node.type === 'Literal') return !!node.regex || !/^(?:New|Call)Expression$/.test(node.parent && node.parent.type);
  return !API_KNOPEN.has(node.type);
}
function markeerSyntax(rule, name) {
  return {
    meta: rule.meta,
    create(context) {
      const merk = Object.create(context, {
        report: { value: d => { if (d.node && isSyntax(d.node, name)) SYNTAX_KNOPEN.push(d.node.range); context.report(d); } },
      });
      return rule.create(merk);
    },
  };
}

// De onderdelen die een es-x-regel in zijn beschrijving noemt
// (`Array.prototype.{flat,flatMap}`), als paden in de MDN-gegevens.
function esxPaths(rule) {
  if (own(ESX_OLDER_DATA, rule)) return [ESX_OLDER_DATA[rule]];
  return [...esx.rules[rule].meta.docs.description.matchAll(/`([^`]+)`/g)]
    .flatMap(m => {
      const n = m[1].replace(/\(\)$/, '');
      const b = n.match(/^(.*)\.\{(.*)\}$/);
      return b ? b[2].split(',').map(x => `${b[1]}.${x}`) : [n];
    })
    .map(n => `javascript.builtins.${n.replace('.prototype', '')}`)
    .filter(p => own(p.split('.').reduce((o, k) => own(o, k), bcd), '__compat'));
}

// ES2022 en later: elke regel, behalve wat ES_ON_FLOOR met de gegevens
// vrijgeeft. ES2021 en ouder draait de ondergrens, op wat de gegevens anders
// zeggen na (Atomics, SharedArrayBuffer, lookbehind). Nieuwe edities van es-x
// komen zo vanzelf mee.
const ESX_PLUGIN = { meta: esx.meta, rules: { ...esx.rules } };
const ESX_RULES = {};
for (const cfg of Object.keys(esx.configs)) {
  const m = cfg.match(/^flat\/no-new-in-es(5|20\d\d|next)(?:-intl-api)?$/);
  if (!m) continue;
  const newer = m[1] === 'next' || +m[1] >= 2022;
  for (const id of Object.keys(esx.configs[cfg].rules)) {
    const rule = id.slice('es-x/'.length);
    if (newer ? !own(ES_ON_FLOOR, rule) : esxPaths(rule).some(p => lacking(bcdAt(p), '', true).length)) ESX_RULES[id] = 'error';
  }
}
for (const id of Object.keys(ESX_RULES)) {
  const name = id.slice('es-x/'.length);
  if (esx.rules[name].meta.schema?.[0]?.properties?.aggressive) {
    ESX_PLUGIN.rules[name] = markeerSyntax(withoutOldNames(esx.rules[name]), name);
    ESX_RULES[id] = ['error', { aggressive: true }];
  } else {
    ESX_PLUGIN.rules[name] = markeerSyntax(esx.rules[name], name);
  }
}

const shifted = (rep, base) => ({ find: (o, id, msg, vast) => rep.find(base + o, id, msg, vast), comment: () => {} });
const pinned = (rep, at) => ({ find: (o, id, msg, vast) => rep.find(at, id, msg, vast), comment: () => {} });

function offsetOf(text, line, column) {
  let o = 0;
  for (let l = 1; l < line; l++) o = text.indexOf('\n', o) + 1;
  return o + column - 1;
}

/* ---------- HTML ---------- */

function checkElement(el, rep, inString) {
  const loc = el.sourceCodeLocation;
  if (!loc) return;
  const html = el.namespaceURI === HTML_NS;
  const tag = el.tagName;
  const ec = html ? own(bcd.html.elements, tag) : undefined;
  /* een onbekende tag in een string is tekst, geen opmaak ("1 < 2 en <dit is geen tag>") */
  if (inString && html && !ec && tag.indexOf('-') < 0) return;
  if (ec && ec.__compat) {
    const miss = missing(`html.elements.${tag}`, ec.__compat);
    if (miss.length) return rep.find(loc.startOffset, `html.elements.${tag}`, `<${tag}> ontbreekt in ${names(miss)}`);
  }
  for (const a of el.attrs) {
    const at = loc.attrs && loc.attrs[a.name];
    if (!at) continue;
    const ownEntry = own(own(ec, a.name), '__compat');
    const c = ownEntry || (html && own(own(bcd.html.global_attributes, a.name), '__compat'));
    if (c) {
      const id = ownEntry ? `html.elements.${tag}.${a.name}` : `html.global_attributes.${a.name}`;
      const miss = missing(id, c);
      if (miss.length) rep.find(at.startOffset, id, `attribuut ${a.name} ontbreekt in ${names(miss)}`);
      /* ook de waarde: <input type="date">, hidden="until-found"; niet bij meta
         en link, hints die een browser zonder ze stil overslaat */
      const waarde = /^(?:meta|link)$/.test(tag) ? '' : a.value.trim().toLowerCase();
      const wid = own(own(ec, `${a.name}_${waarde}`), '__compat') ? `html.elements.${tag}.${a.name}_${waarde}` : `${id}.${waarde}`;
      const wc = own(own(ec, `${a.name}_${waarde}`), '__compat') || own(own(ownEntry ? own(ec, a.name) : own(bcd.html.global_attributes, a.name), waarde), '__compat');
      const wmiss = waarde && !miss.length && wc ? missing(wid, wc) : [];
      if (wmiss.length) rep.find(at.startOffset, wid, `${a.name}="${waarde}" ontbreekt in ${names(wmiss)}`);
    }
    const sub = pinned(rep, at.startOffset);
    if (a.name === 'style') {
      const m = rep.source.slice(at.startOffset, at.endOffset).match(/^[^=]*=\s*(["']?)([^]*?)\1$/);
      const exact = m && m[2] === a.value;
      checkCssText(a.value, 'decls', exact ? shifted(rep, at.endOffset - m[1].length - m[2].length) : sub);
    } else if (a.name.startsWith('on')) {
      checkScript(inString ? unescapeJs(a.value) : a.value, { globalReturn: true, rep: sub });
    } else if (URL_ATTRS.has(a.name) && /^\s*javascript:/i.test(a.value)) {
      checkScript(a.value.replace(/^\s*javascript:/i, ''), { rep: sub });
    }
  }
  if (inString && html && tag === 'style') {
    checkCssText(unescapeJs(el.childNodes.map(n => n.value || '').join('')), 'sheet', pinned(rep, loc.startOffset));
  }
}

function unescapeJs(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[^])/g, (m, e) =>
    e[0] === 'u' || e[0] === 'x' ? String.fromCodePoint(parseInt(e.replace(/^u\{?|^x|\}$/g, ''), 16))
      : ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' })[e] ?? e);
}

function walkNodes(node, fn) {
  for (const child of node.childNodes || []) {
    fn(child);
    walkNodes(child, fn);
  }
  if (node.content) walkNodes(node.content, fn);
}

function checkMarkupString(raw, rep) {
  const exact = shifted(rep, 0);
  exact.source = raw;
  const frag = parseFragment(raw, { sourceCodeLocationInfo: true });
  walkNodes(frag, n => { if (n.tagName) checkElement(n, exact, true); });
}

/* ---------- CSS ---------- */

const probeCache = new Map();
function probe(css) {
  if (!probeCache.has(css)) {
    const found = new Set();
    try {
      postcss([doiuse({ browsers: QUERY, onFeatureUsage: u => found.add(u.feature) })]).process(css, { from: 'probe.css' }).css;
    } catch { /* een onleesbaar proefstuk bewijst niets */ }
    probeCache.set(css, found);
  }
  return probeCache.get(css);
}

function checkSelector(selector, rep, at, skip, metGaten) {
  let root;
  try {
    root = selectorParser().astSync(selector);
  } catch (e) {
    if (metGaten) return;
    return rep.find(at(0), 'css-syntax', `selector niet te lezen: ${selector}`);
  }
  const bad = [];
  root.walkPseudos(p => {
    const name = p.value.replace(/^:+/, '').toLowerCase();
    const entry = own(bcd.css.selectors, name);
    if (!entry || !entry.__compat) return;
    const miss = missing(`css.selectors.${name}`, entry.__compat);
    if (!miss.length) return;
    let forgiving = false;
    for (let q = p.parent; q; q = q.parent) if (q.type === 'pseudo' && /^:(?:is|where)$/i.test(q.value)) forgiving = true;
    if (!forgiving) bad.push({ name, miss });
    if (!VENDOR.test(name) && !(skip && skip(p))) rep.find(at(p.sourceIndex), `css.selectors.${name}`, `:${name} ontbreekt in ${names(miss)}`);
  });
  if (root.nodes.length > 1 && bad.length) {
    rep.find(at(0), 'css-selector-list', `${bad.map(b => ':' + b.name).join(', ')} in een selectorlijst laat de hele regel vallen op ${names(bad.flatMap(b => b.miss))}`);
  }
}

/* Een gat in een template (`${base};color:red`) kan van alles zijn. Eerst met
   een 1 erin; leest dat niet, dan alleen de vaste declaraties. Een gat zelf
   is nooit een syntaxfout. */
const GAT = '\u0001';
const leestCss = (t, kind) => { try { postcss.parse(kind === 'decls' ? `*{${t}}` : t); return true; } catch (e) { return false; } };
function checkCssMetGaten(text, kind, rep) {
  if (text.indexOf(GAT) < 0) return checkCssText(text, kind, rep);
  const met1 = text.split(GAT).join('1');
  if (leestCss(met1, kind)) return checkCssText(met1, kind, rep);
  const vast = text.split(/[;{}]/).filter(x => x.indexOf(GAT) < 0).join(';');
  if (kind === 'decls' && leestCss(vast, kind)) checkCssText(vast, kind, rep);
}

/* Een veld style of cssText kan ook van een eigen object zijn (`knop.style =
   'zon'`), en stijltekst die geen CSS is, negeert een browser. Alleen wat als
   declaratie te lezen is, telt dus. */
function checkStijlTekst(text, rep) {
  if (leestCss(text.split(GAT).join('1'), 'decls')) return checkCssMetGaten(text, 'decls', rep);
  const delen = text.split(/[;{}]/).filter(d => d.indexOf(GAT) < 0 && d.trim() && leestCss(d, 'decls'));
  if (delen.length) checkCssText(delen.join(';'), 'decls', pinned(rep, 0));
}

function checkCssText(text, kind, rep, top = false) {
  const css = kind === 'decls' ? `*{${text}}` : text.replace(/<!--|-->/g, m => ' '.repeat(m.length));
  const r = kind === 'decls' ? { find: (o, id, msg) => rep.find(Math.max(o - 2, 0), id, msg), comment: () => {} } : rep;
  let root;
  try {
    root = postcss.parse(css);
  } catch (e) {
    return r.find(offsetOf(css, e.line || 1, e.column || 1), 'css-syntax', `CSS niet te lezen: ${e.reason || e.message}`);
  }
  checkCss(root, r, top);
}

function checkCss(root, rep, top) {
  root.walkComments(c => {
    const start = c.source.start.offset;
    if (top) rep.comment(start, start + c.toString().length);
    if (/doiuse-/.test(c.text)) {
      rep.find(start, 'doiuse-comment', 'doiuse-opmerkingen werken hier niet; gebruik compat-allow');
      c.remove();
    }
  });
  const reported = new Map();
  postcss([doiuse({
    browsers: QUERY,
    onFeatureUsage: u => {
      const skip = new Set(NOT_APPLICABLE.filter(e => e.feature === u.feature)
        .flatMap(e => FLOOR.filter(f => e.browsers.includes(f.bcd)).map(f => f.caniuse)));
      const where = Object.entries(u.featureData.missingData || {}).filter(([b]) => !skip.has(b))
        .map(([b, versions]) => `${b} ${Object.keys(versions).join(', ')}`);
      if (!where.length) return;
      if (!reported.has(u.usage)) reported.set(u.usage, new Set());
      reported.get(u.usage).add(u.feature);
      rep.find(u.usage.source.start.offset, u.feature, `${u.featureData.title} ontbreekt in ${where.join('; ')}`);
    },
  })]).process(root, { from: 'index.html' }).css;

  // Een eigen bevinding vervalt alleen als doiuse op dezelfde knoop hetzelfde
  // onderdeel al meldt; welk kenmerk dat is, zegt doiuse zelf op een proefstuk.
  const report = (node, offset, id, what, miss, probeCss) => {
    const seen = reported.get(node);
    if (seen && [...probe(probeCss)].some(f => seen.has(f))) return;
    rep.find(offset, id, `${what} ontbreekt in ${names(miss)}`);
  };
  root.walkDecls(d => {
    const prop = d.prop.toLowerCase();
    if (VENDOR.test(prop)) return;
    const at = d.source.start.offset;
    /* een eigen variabele heeft geen eigen gegevens, maar zijn waarde (een kleur
       met color-mix() of oklch()) komt overal terecht waar hij gebruikt wordt */
    const entry = prop.startsWith('--') ? null : own(bcd.css.properties, prop);
    if (entry && entry.__compat) {
      const prefixed = d.parent.nodes.filter(s => s.type === 'decl' && VENDOR.test(s.prop) && s.prop.toLowerCase().replace(VENDOR, '') === prop);
      const miss = missing(`css.properties.${prop}`, entry.__compat).filter(f => !prefixed.some(s =>
        supportsAt(entry.__compat.support[f.bcd], f.release, s.prop.toLowerCase().match(VENDOR)[0], false)));
      if (miss.length) return report(d, at, `css.properties.${prop}`, `eigenschap ${prop}`, miss, `.x{${prop}:inherit}`);
    }
    valueParser(d.value).walk(v => {
      const word = v.value.toLowerCase();
      if (VENDOR.test(word)) return;
      const sub = own(own(entry, word), '__compat');
      if (v.type === 'word' && sub) {
        const id = `css.properties.${prop}.${word}`;
        const miss = missing(id, sub);
        if (miss.length) report(d, at, id, `waarde ${word} van ${prop}`, miss, `.x{${prop}:${word}}`);
      }
      if (v.type === 'function' && CSS_FUNCTIONS.has(word)) {
        const defs = CSS_FUNCTIONS.get(word);
        const miss = defs.map(x => missing(x.path, x.compat));
        if (miss.every(m => m.length)) report(d, at, defs[0].path, `${word}()`, miss[0], `.x{${prop}:${word}(1)}`);
      }
      const maat = v.type === 'word' && valueParser.unit(v.value);
      const eenheid = maat && maat.unit && own(own(bcd.css.types.length, maat.unit.toLowerCase()), '__compat');
      if (eenheid) {
        const id = `css.types.length.${maat.unit.toLowerCase()}`;
        const miss = missing(id, eenheid);
        if (miss.length) report(d, at, id, `de eenheid ${maat.unit}`, miss, `.x{width:1${maat.unit}}`);
      }
    });
  });
  root.walkRules(r => {
    if (r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
    const at = r.source.start.offset;
    checkSelector(r.selector, rep, i => at + i, p => {
      const seen = reported.get(r);
      return !!seen && [...probe(`*${p.value}${p.nodes.length ? '(*)' : ''}{}`)].some(f => seen.has(f));
    });
  });
  root.walkAtRules(a => {
    const name = a.name.toLowerCase();
    if (VENDOR.test(name)) return;
    const entry = own(bcd.css['at-rules'], name);
    if (!entry || !entry.__compat) return;
    const at = a.source.start.offset;
    const miss = missing(`css.at-rules.${name}`, entry.__compat);
    if (miss.length) report(a, at, `css.at-rules.${name}`, `@${name}`, miss, `@${name} x{}`);
    if (name !== 'media') return;
    for (const m of a.params.matchAll(/\(\s*([a-z-]+)\s*[:)]/gi)) {
      const feature = m[1].toLowerCase();
      const f = own(own(entry, feature), '__compat');
      const id = `css.at-rules.media.${feature}`;
      const fm = f ? missing(id, f) : [];
      if (fm.length) report(a, at, id, `mediavoorwaarde ${feature}`, fm, `@media (${feature}){}`);
    }
  });
}

/* ---------- JavaScript ---------- */

function isGlobal(id, context) {
  for (let s = context.sourceCode.getScope(id); s; s = s.upper) {
    const v = s.set.get(id.name);
    if (v) return s.type === 'global' && v.defs.length === 0;
  }
  return true;
}

function stringOf(node, rep) {
  if (node && node.type === 'Literal' && typeof node.value === 'string') {
    const raw = node.raw.slice(1, -1);
    return { text: node.value, rep: raw === node.value ? shifted(rep, node.range[0] + 1) : pinned(rep, node.range[0]) };
  }
  if (node && node.type === 'TemplateLiteral') {
    const text = node.quasis.map(q => q.value.cooked ?? q.value.raw).join(GAT);
    const exact = node.expressions.length === 0 && node.quasis[0].value.raw === text;
    return { text, rep: exact ? shifted(rep, node.range[0] + 1) : pinned(rep, node.range[0]) };
  }
  return null;
}

const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).replace(/^(webkit|moz|ms)-/, '-$1-');

function localPlugin(rep, apiFindings) {
  const api = (offset, p, miss, what = p.replace(/^(api|javascript\.builtins)\./, '').replace(/_static$/, '')) => apiFindings.push({ offset, id: p, msg: `${what} ontbreekt in ${names(miss)}` });
  const apiMembers = {
    create: context => {
      /* Een naam die de app zelf definieert, is van de app (`snd.move()`): een
         eigen methode verklaart een aanroep, een eigen veld alleen het lezen.
         Een destructurering leest een lid en definieert niets. */
      const eigenVelden = new Set(), eigenMethoden = new Set();
      const candidates = [];
      const keyName = k => k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : null;
      const isFn = v => !!v && /Function|Class/.test(v.type);
      const define = n => {
        if (n.computed || (n.parent && n.parent.type === 'ObjectPattern') || n.kind === 'constructor') return;
        ((n.type === 'MethodDefinition' ? n.kind === 'method' : n.method || isFn(n.value)) ? eigenMethoden : eigenVelden).add(keyName(n.key));
      };
      return {
      Property: define,
      MethodDefinition: define,
      PropertyDefinition: define,
      AssignmentExpression(n) {
        if (n.left.type === 'MemberExpression' && isFn(n.right)) eigenMethoden.add(memberName(n.left));
      },
      'Program:exit'() {
        for (const c of candidates) {
          const eigen = eigenMethoden.has(c.name) || (!c.aanroep && eigenVelden.has(c.name));
          if (!eigen) api(c.offset, c.member.paths[0], c.member.miss, `${c.name} (alleen in ${c.member.paths.slice(0, 3).join(', ')})`);
        }
      },
      MemberExpression(n) {
        const name = memberName(n);
        if (!name) return;
        const obj = n.object;
        if (/^on[a-z]+$/.test(name)) {
          const g = gebeurtenis(name.slice(2));
          if (g) api(n.property.range[0], g.path, g.miss, `de gebeurtenis ${name.slice(2)}`);
        }
        if (obj.type === 'Identifier' && GLOBAL_OBJECTS.has(obj.name) && isGlobal(obj, context)) {
          const c = own(own(bcd.api, name), '__compat');
          if (c && /^[A-Za-z]/.test(name) && !own(bcd.api.Window, name)) {
            const miss = missing(`api.${name}`, c);
            if (miss.length) api(n.range[0], `api.${name}`, miss);
          }
        }
        let g = null;
        if (obj.type === 'Identifier' && isGlobal(obj, context)) g = obj.name;
        else if (obj.type === 'MemberExpression' && !obj.computed && obj.object.type === 'Identifier'
          && GLOBAL_OBJECTS.has(obj.object.name) && isGlobal(obj.object, context)) g = obj.property.name;
        /* statische leden van ingebouwde JavaScript-functies waar es-x geen regel voor heeft */
        if (g && obj.type === 'Identifier' && own(bcd.javascript.builtins, g)) {
          const c = own(own(bcd.javascript.builtins[g], name), '__compat');
          const miss = c ? missing(`javascript.builtins.${g}.${name}`, c) : [];
          if (miss.length) api(n.range[0], `javascript.builtins.${g}.${name}`, miss);
          if (c) return;
        }
        if (g) {
          const isInterface = !!own(bcd.api, g) && /^[A-Z]/.test(g);
          const iface = isInterface ? g : own(GLOBAL_INSTANCES, g);
          const key = isInterface ? `${name}_static` : name;
          const c = own(own(own(bcd.api, iface), key), '__compat');
          if (c) {
            const p = `api.${iface}.${key}`;
            const miss = missing(p, c);
            if (miss.length) api(n.range[0], p, miss);
            return;
          }
        }
        // Leden van `style` zijn CSS-eigenschappen en die van `dataset` kiest de app zelf.
        if (['style', 'dataset'].includes(memberName(obj))) return;
        const member = NEW_MEMBERS.get(name);
        if (member) candidates.push({ offset: n.property.range[0], name, member, aanroep: isCalled(n) });
      },
      Identifier(n) {
        const parent = n.parent;
        if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
        if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === n && !parent.computed) return;
        if (!isGlobal(n, context)) return;
        const c = own(own(bcd.api, n.name), '__compat');
        /* zonder window. ervoor is een lid van Window net zo goed een lid van Window */
        const p = c ? `api.${n.name}` : `api.Window.${n.name}`;
        const cc = c || own(own(bcd.api.Window, n.name), '__compat');
        const miss = cc ? missing(p, cc) : [];
        if (miss.length) api(n.range[0], p, miss);
      },
      };
    },
  };

  const strings = {
    create: context => {
      const text = context.sourceCode.text;
      const consumed = new Set();
      const sinkArg = (node, fn) => {
        const s = stringOf(node, rep);
        if (!s) return;
        consumed.add(node);
        if (node.type === 'TemplateLiteral') node.quasis.forEach(q => consumed.add(q));
        fn(s);
      };
      return {
        CallExpression(n) {
          const m = memberName(n.callee);
          const [a0, a1] = n.arguments;
          if (m === 'createElement') {
            sinkArg(a0, s => checkElement({ namespaceURI: HTML_NS, tagName: s.text.toLowerCase(), attrs: [], sourceCodeLocation: { startOffset: 0 } }, s.rep, false));
          } else if (m === 'setAttribute' || m === 'toggleAttribute') {
            sinkArg(a0, s => {
              const name = s.text.toLowerCase();
              const c = own(own(bcd.html.global_attributes, name), '__compat');
              const id = `html.global_attributes.${name}`;
              const miss = c ? missing(id, c) : [];
              if (miss.length) s.rep.find(0, id, `attribuut ${name} ontbreekt in ${names(miss)}`);
              if (m === 'setAttribute' && name === 'style') sinkArg(a1, v => checkCssMetGaten(v.text, 'decls', v.rep));
              /* een gat wordt een 1; leest de handler dan nog niet, dan ligt dat aan het gat */
              if (m === 'setAttribute' && name.startsWith('on')) {
                sinkArg(a1, v => checkScript(v.text.split(GAT).join('1'), { globalReturn: true, rep: pinned(v.rep, 0), gaten: v.text.indexOf(GAT) >= 0 }));
              }
            });
          } else if (['querySelector', 'querySelectorAll', 'matches', 'closest', 'webkitMatchesSelector'].includes(m)) {
            sinkArg(a0, s => { if (s.text.indexOf(GAT) < 0) checkSelector(s.text, s.rep, i => i); else checkSelector(s.text.split(GAT).join('x'), s.rep, i => i, null, true); });
          } else if (m === 'setProperty') {
            sinkArg(a0, p => {
              if (!stringOf(a1, rep)) return checkCssText(`${p.text}:inherit`, 'decls', p.rep);
              sinkArg(a1, v => checkCssMetGaten(`${p.text}:${v.text}`, 'decls', pinned(v.rep, 0)));
            });
          } else if (m === 'insertRule') {
            sinkArg(a0, s => checkCssMetGaten(s.text, 'sheet', s.rep));
          } else if (m === 'matchMedia') {
            sinkArg(a0, s => checkCssMetGaten(`@media ${s.text}{}`, 'sheet', pinned(s.rep, 0)));
          } else if (m === 'addEventListener') {
            sinkArg(a0, s => {
              const g = gebeurtenis(s.text.toLowerCase());
              if (g) s.rep.find(0, g.path, `de gebeurtenis ${s.text} ontbreekt in ${names(g.miss)}`);
            });
          }
        },
        AssignmentExpression(n) {
          const left = n.left;
          if (left.type !== 'MemberExpression') return;
          const m = memberName(left);
          if (m === 'cssText' || (m === 'style' && stringOf(n.right, rep))) sinkArg(n.right, s => checkStijlTekst(s.text, s.rep));
          else if (memberName(left.object) === 'style' && m) {
            if (stringOf(n.right, rep)) sinkArg(n.right, s => checkCssMetGaten(`${kebab(m)}:${s.text}`, 'decls', pinned(s.rep, 0)));
            else checkCssText(`${kebab(m)}:inherit`, 'decls', pinned(rep, left.range[0]));
          }
        },
        Literal(n) {
          if (typeof n.value !== 'string' || consumed.has(n)) return;
          scanString(n.raw.slice(1, -1), shifted(rep, n.range[0] + 1));
        },
        TemplateElement(n) {
          if (consumed.has(n)) return;
          const open = text[n.range[0]] === '`' || text[n.range[0]] === '}' ? 1 : 0;
          scanString(n.value.raw, shifted(rep, n.range[0] + open));
        },
      };
    },
  };
  return { rules: { 'api-leden': apiMembers, 'strings': strings } };
}

/* een gebeurtenis die alleen bestaat op interfaces die ergens op de ondergrens ontbreken */
function gebeurtenis(naam) {
  const defs = [];
  for (const [iface, leden] of Object.entries(bcd.api)) {
    const c = own(own(leden, naam + '_event'), '__compat');
    if (c) defs.push({ path: `api.${iface}.${naam}_event`, miss: missing(`api.${iface}.${naam}_event`, c) });
  }
  defs.sort((x, y) => (x.path < y.path ? -1 : 1));
  return defs.length && defs.every(x => x.miss.length) ? defs[0] : null;
}

function scanString(raw, rep) {
  for (const { re, id, what, miss } of STRING_TRAPS) {
    if (!miss.length) continue;
    for (const m of raw.matchAll(re)) rep.find(m.index, id, `${what} in een string ontbreekt in ${names(miss)}`);
  }
  if (/<[a-zA-Z]/.test(raw)) checkMarkupString(raw, rep);
}

function jsLineStarts(text) {
  const starts = [0];
  for (const m of text.matchAll(/\r\n|[\r\n\u2028\u2029]/g)) starts.push(m.index + m[0].length);
  return starts;
}

function lineIndex(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const apiKey = s => s.replace(/^api\.(?:Window\.)?/, '').replace(/_static$/, '').replace(/\(\)$/, '');

/* Een handler in een string wordt midden in een scriptcontrole zelf
   gecontroleerd; elke controle heeft daarom een eigen lijst syntaxknopen. */
function verifyMetSyntax(text, config) {
  const buiten = SYNTAX_KNOPEN;
  SYNTAX_KNOPEN = [];
  try {
    const linter = new Linter({ configType: 'flat' });
    const messages = linter.verify(text, config, { filename: 'script.js' });
    return { messages, syntax: SYNTAX_KNOPEN, source: linter.getSourceCode() };
  } finally {
    SYNTAX_KNOPEN = buiten;
  }
}

function checkScript(text, { sourceType = 'script', globalReturn = false, rep, top = false, gaten = false }) {
  const apiFindings = [];
  const { messages, syntax, source } = verifyMetSyntax(text, [{
    files: ['**/*.js'],
    plugins: { 'es-x': ESX_PLUGIN, compat, poort: localPlugin(rep, apiFindings) },
    languageOptions: { ecmaVersion: 'latest', sourceType, parserOptions: { ecmaFeatures: { globalReturn } } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    // Ingebouwde ES-functies en reguliere expressies zijn voor es-x; compat
    // laat ze alleen liggen als ze 'gepolyfild' heten.
    settings: { browsers: QUERY, ignoreConditionalChecks: true, polyfills: ['es:all', 'RegExp'] },
    rules: { ...ESX_RULES, 'compat/compat': 'error', 'poort/api-leden': 'error', 'poort/strings': 'error' },
  }]);
  const starts = jsLineStarts(text);
  const offset = m => starts[m.line - 1] + m.column - 1;
  const done = new Set();
  const compatSeen = new Set();
  /* es-x meldt een regex-onderdeel soms binnen de literal: dan telt de knoop eromheen */
  const inSyntax = (van, tot) => syntax.some(r => r[0] <= van && tot <= r[1]);
  const esxAt = new Set();
  for (const m of messages) {
    const at = offset(m);
    if (m.fatal) {
      if (!gaten) rep.find(at, 'syntax', `syntaxfout: ${m.message}`);
    } else if (!m.ruleId) {
      rep.find(at, 'eslint-comment', 'eslint-opmerkingen werken hier niet; gebruik compat-allow');
    } else if (m.ruleId.startsWith('es-x/')) {
      // Zonder typen meldt `xs.at()` zowel de Array- als de String-regel op dezelfde knoop.
      const method = (m.message.match(/'[\w.]+\.prototype\.(\w+)'/) || [])[1] || m.ruleId;
      const key = `${at}:${m.endLine}:${m.endColumn}:${method}`;
      if (done.has(key)) continue;
      done.add(key);
      esxAt.add(at);
      const eind = m.endLine ? starts[m.endLine - 1] + m.endColumn - 1 : at;
      rep.find(at, m.ruleId.slice('es-x/no-'.length), m.message, inSyntax(at, eind));
    } else if (m.ruleId === 'compat/compat') {
      const name = m.message.replace(/ is not supported in [^]*$/, '').replace(/\(\)$/, '');
      compatSeen.add(`${m.line}:${apiKey(name)}`);
      rep.find(at, name, m.message);
    } else {
      throw new Error(`onverwachte melding ${m.ruleId}: ${m.message}`);
    }
  }
  for (const f of apiFindings) {
    if (f.id.startsWith('javascript.') && esxAt.has(f.offset)) continue;
    if (!compatSeen.has(`${lineIndex(starts, f.offset) + 1}:${apiKey(f.id)}`)) rep.find(f.offset, f.id, f.msg);
  }
  if (top && source) for (const c of source.getAllComments()) rep.comment(c.range[0], c.range[1]);
}

/* ---------- bestand, bronregels en toestemmingen ---------- */

function blankExcept(text, ranges) {
  let out = text.replace(/[^\n]/g, ' ');
  for (const [s, e] of ranges) out = out.slice(0, s) + text.slice(s, e) + out.slice(e);
  return out;
}

// Elk bronbestand staat letterlijk in de build, hooguit opgesplitst door
// regels van build.sh, dus elke gebouwde regel is op inhoud terug te vinden.
function traceLines(builtLines, sources) {
  const origin = new Array(builtLines.length).fill(null);
  const where = new Map();
  builtLines.forEach((l, i) => { if (!where.has(l)) where.set(l, []); where.get(l).push(i); });
  for (const src of [...sources].sort((a, b) => b.lines.length - a.lines.length)) {
    let i = 0;
    while (i < src.lines.length) {
      let best = null;
      for (const p of where.get(src.lines[i]) || []) {
        let k = 0;
        while (i + k < src.lines.length && p + k < builtLines.length && !origin[p + k] && builtLines[p + k] === src.lines[i + k]) k++;
        if (k && (!best || k > best.k)) best = { p, k };
      }
      if (!best) { i++; continue; }
      for (let j = 0; j < best.k; j++) origin[best.p + j] = { file: src.file, line: i + j + 1 };
      i += best.k;
    }
  }
  return origin;
}

function applyAllows(findings, text, comments, lineOf) {
  const allows = new Map();
  for (const [s, e] of comments) {
    const body = text.slice(s, e);
    for (const m of body.matchAll(/compat-allow\b/g)) {
      const line = lineOf(s + m.index);
      const rest = body.slice(m.index + m[0].length).split('\n')[0].replace(/(?:\*\/|-->)[^]*$/, '');
      if (!allows.has(line)) allows.set(line, []);
      allows.get(line).push({ col: s + m.index, rest });
    }
  }
  const byLine = new Map();
  for (const f of findings) {
    if (!byLine.has(f.line)) byLine.set(f.line, []);
    byLine.get(f.line).push(f);
  }
  const out = findings.filter(f => !allows.has(f.line));
  for (const [line, list] of allows) {
    const here = byLine.get(line) || [];
    const at = { line, offset: list[0].col };
    const keep = (id, msg) => out.push(...here, { ...at, id, msg });
    if (list.length > 1) { keep('allow-malformed', 'hoogstens een compat-allow per regel'); continue; }
    const m = list[0].rest.match(/^\s+([^\s:]+)\s*(?::\s*(.*?))?\s*$/);
    if (!m) { keep('allow-malformed', 'schrijf: compat-allow <kenmerk>: <reden>'); continue; }
    const [, id, reason = ''] = m;
    if (UNALLOWABLE.has(id) || here.some(f => f.id === id && f.vast)) keep('allow-malformed', `${id} is syntax die een oude browser niet kan lezen, of een fout die het hele bestand raakt: dat kan niet met compat-allow weg`);
    else if (reason.split(/\s+/).filter(Boolean).length < 3) keep('allow-without-reason', `compat-allow ${id} heeft een reden van minstens drie woorden nodig`);
    else if (!here.some(f => f.id === id)) keep('allow-unused', `compat-allow ${id}: geen bevinding met dit kenmerk op deze regel`);
    else out.push(...here.filter(f => f.id !== id));
  }
  return out;
}

function staleFiles(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-build-'));
  try {
    execFileSync('sh', [path.join(root, 'build.sh'), dir], { stdio: 'pipe' });
    return ['index.html', 'sw.js'].filter(f => !fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(root, f))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function checkBuild(root) {
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const sources = fs.readdirSync(path.join(root, 'src')).filter(f => /\.(js|html)$/.test(f))
    .map(f => ({ file: `src/${f}`, lines: read(`src/${f}`).split('\n') }));
  const results = staleFiles(root).map(f => ({ at: f, id: 'build-stale', msg: `${f} is niet gebouwd uit de huidige src/; draai ./build.sh` }));

  function checkFile(builtName, srcs, kind) {
    const text = read(builtName);
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    const lineOf = o => lineIndex(starts, o);
    const raw = [];
    const comments = [];
    const rep = { find: (o, id, msg, vast) => raw.push({ offset: o, line: lineOf(o), id, msg, vast: !!vast }), comment: (s, e) => comments.push([s, e]), source: text };
    if (kind === 'script') {
      checkScript(text, { rep, top: true });
    } else {
      const doc = parse(text, { sourceCodeLocationInfo: true });
      const styles = [];
      walkNodes(doc, n => {
        const loc = n.sourceCodeLocation;
        if (n.nodeName === '#comment' && loc) comments.push([loc.startOffset, loc.endOffset]);
        if (!n.tagName || !loc) return;
        checkElement(n, rep, false);
        const body = n.childNodes && n.childNodes[0] && n.childNodes[0].sourceCodeLocation;
        if (n.tagName === 'script') {
          const type = ((n.attrs.find(a => a.name === 'type') || {}).value || '').trim().toLowerCase();
          if (n.attrs.some(a => a.name === 'src')) rep.find(loc.startOffset, 'script-src', 'een extern script kan de poort niet controleren; de app is een enkel bestand');
          if (body && (type === 'module' || JS_TYPES.has(type.split(';')[0].trim()))) {
            checkScript(blankExcept(text, [[body.startOffset, body.endOffset]]), { sourceType: type === 'module' ? 'module' : 'script', rep, top: true });
          }
        }
        if (n.tagName === 'style' && body) styles.push([body.startOffset, body.endOffset]);
      });
      if (styles.length) checkCssText(blankExcept(text, styles), 'sheet', rep, true);
    }
    const seen = new Map();
    const unique = [];
    for (const f of raw) {
      const k = `${f.line}\u0000${f.id}`;
      if (seen.has(k)) { seen.get(k).vast = seen.get(k).vast || f.vast; continue; }
      seen.set(k, f);
      unique.push(f);
    }
    const origin = traceLines(text.split('\n'), srcs);
    for (const f of applyAllows(unique, text, comments, lineOf)) {
      const o = origin[f.line];
      const col = f.offset - starts[f.line] + 1;
      results.push({ at: o ? `${o.file}:${o.line}:${col}` : `${builtName}:${f.line + 1}:${col} (door build.sh gemaakt)`, id: f.id, msg: f.msg });
    }
  }

  checkFile('index.html', sources.filter(s => s.file !== 'src/sw.js'), 'html');
  checkFile('sw.js', sources.filter(s => s.file === 'src/sw.js'), 'script');
  return results;
}

async function main() {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const findings = await checkBuild(root);
  for (const f of findings) console.log(`${f.at}: ${f.msg} [${f.id}]`);
  if (findings.length) {
    console.log(`FAIL compat: ${findings.length} bevinding(en) tegen de ondergrens (${names(FLOOR)})`);
    process.exit(1);
  }
  console.log(`compat ok: index.html en sw.js werken op ${names(FLOOR)}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`FAIL compat: de poort zelf liep vast: ${e.stack || e}`); process.exit(2); });
}
