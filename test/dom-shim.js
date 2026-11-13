/* Minimal DOM shim so the UI script can run headless under jsc (or node via cat-pipe). */
if (typeof print === 'undefined') var print = console.log;
var elc = 0;
/* Een apparaat heeft zijn eigen DOM, opslag en adresbalk. De nep-server, de
   relay, de klok en de crypto zijn van de wereld en dus gedeeld: twee
   apparaten praten met dezelfde server, net als echt. */
var __LEEG = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
function __tags() { return /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g; }
function __attrs(s) {
  const attrs = {}, ar = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let a;
  while ((a = ar.exec(s || '')) !== null) attrs[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '';
  return attrs;
}
/* commentaar telt niet als opmaak; zelfde lengte, dus posities blijven kloppen */
function __zonderCommentaar(html) { return String(html).replace(/<!--[^]*?-->/g, function (m) { return ' '.repeat(m.length); }); }
/* de inhoud van het element waarvan de open-tag bij `vanaf` eindigt, tot zijn eigen sluittag */
function __binnenVan(html, tag, vanaf) {
  let diepte = 1, t;
  const re = new RegExp('<' + tag + '\\b|</' + tag + '\\s*>', 'gi');
  re.lastIndex = vanaf;
  while ((t = re.exec(html)) !== null) {
    diepte += t[0][1] === '/' ? -1 : 1;
    if (diepte === 0) return html.slice(vanaf, t.index);
  }
  return html.slice(vanaf);
}
function __ontsnap(t) {
  return t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&');
}
function maakDocument(vast) {
  const els = {};
  const body = makeEl('body');
  function verborgenAttrs(attrs) {
    return /(^|\s)hidden(\s|$)/.test(attrs.class || '') || 'hidden' in attrs || /display\s*:\s*none/.test(attrs.style || '');
  }
  function verborgenZelf(el) {
    return el._cls.has('hidden') || el.style.display === 'none' || !!(el._attrs && 'hidden' in el._attrs);
  }
  /* Een element in vers geschreven HTML is in een echte browser een nieuwe
     knoop: zonder luisteraars, met de klassen, data en inhoud uit de opmaak.
     Elk element met een id wordt dus opnieuw gemaakt; wie het oude nog vasthoudt,
     houdt een losse knoop vast, net als echt. */
  function bouw(html) {
    const schoon = __zonderCommentaar(html), re = __tags();
    let m;
    while ((m = re.exec(schoon)) !== null) {
      if (m[1]) continue;
      const tag = m[2].toLowerCase(), attrs = __attrs(m[3]);
      if (!attrs.id) continue;
      const k = makeEl(attrs.id);
      k._tag = tag;
      k._attrs = attrs;
      if (attrs.class) k.className = attrs.class;
      for (const n in attrs) {
        if (n.indexOf('data-') === 0) k.dataset[n.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = attrs[n];
      }
      if ('disabled' in attrs) k.disabled = true;
      if ('value' in attrs) k.value = attrs.value;
      if (!__LEEG.test(tag) && !m[4]) k._html = __binnenVan(html, tag, re.lastIndex);
      els[attrs.id] = k;
    }
  }
  function makeEl(id) {
  const el = { id, children: [], style: {}, dataset: {}, _ev: {}, _html: '', _text: '',
    _cls: new Set(), disabled: false, value: '' };
  el.classList = {
    add(...c) { c.forEach(x => el._cls.add(x)); },
    remove(...c) { c.forEach(x => el._cls.delete(x)); },
    toggle(c, f) {
      if (f === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); }
      else { f ? el._cls.add(c) : el._cls.delete(c); }
      return el._cls.has(c);
    },
    contains(c) { return el._cls.has(c); }
  };
  Object.defineProperty(el, 'className', {
    get: () => [...el._cls].join(' '),
    set: v => { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: v => { el._html = String(v); el._text = ''; el._qsa = null; el.children = []; bouw(el._html); }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._text || el._html.replace(/<[^>]*>/g, ''),
    set: v => { el._text = String(v); el._html = String(v); el._qsa = null; el.children = []; }
  });
  el.appendChild = c => {
    if (c._ouder) c._ouder.children = c._ouder.children.filter(x => x !== c);
    c._ouder = el;
    c._los = false;
    el.children.push(c);
    return c;
  };
  el.querySelectorAll = sel => zoekIn([el], sel);
  el.querySelector = sel => zoekIn([el], sel)[0] || null;
  el.addEventListener = (t, fn) => { (el._ev[t] || (el._ev[t] = [])).push(fn); };
  el.style.setProperty = function () {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 40, height: 40 });
  el.remove = () => {
    if (el._ouder) el._ouder.children = el._ouder.children.filter(x => x !== el);
    el._ouder = null;
    el._los = true;
  };
  el.closest = () => makeEl('closest' + (elc++));
  /* showToast vervangt de toast door een kloon; zonder dit las een test de oude */
  el.replaceWith = n => {
    if (n && n.id && els[n.id] === el) els[n.id] = n;
    if (el._ouder) { el._ouder.children = el._ouder.children.map(x => x === el ? n : x); n._ouder = el._ouder; el._ouder = null; }
    el._los = true;
  };
  el.scrollIntoView = () => { __scrolls.push({ el: id }); };
  el.focus = () => {};
  el.select = () => { el.selectionStart = 0; el.selectionEnd = String(el.value).length; };
  el.cloneNode = () => {
    const n = makeEl(id);
    n._tag = el._tag;
    n._attrs = el._attrs;
    n.className = el.className;
    return n;
  };
    el.getContext = () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} });
    return el;
  }
  /* querySelectorAll over wat de app als HTML schreef: de knoppen die ze daarna
     via een klasse of data-attribuut bindt (niveaus, opties, openingen) zijn zo
     dezelfde objecten die een test aantikt. Alleen enkelvoudige selectors
     (tag, #id, .klasse, [attr], [attr="v"], en lijsten met komma's). */
  /* Elk element zonder id hoort bij het binnenste element met een id om zich
     heen: daar wordt het een keer gemaakt, en elke zoekvraag (via dat element,
     een ouder of het document) geeft hetzelfde object. Een element met een id
     telt met zijn huidige inhoud, niet met wat zijn ouder ooit schreef. */
  function eigen(host) {
    if (host._qsa && host._qsa.html === host._html) return host._qsa.items;
    const items = [], schoon = __zonderCommentaar(host._html), re = __tags();
    let m, overslaan = null;
    while ((m = re.exec(schoon)) !== null) {
      const tag = m[2].toLowerCase(), leeg = __LEEG.test(tag) || !!m[4];
      if (overslaan) {
        if (tag === overslaan.tag && !leeg) overslaan.diepte += m[1] ? -1 : 1;
        if (overslaan.diepte === 0) overslaan = null;
        continue;
      }
      if (m[1]) continue;
      const attrs = __attrs(m[3]);
      if (attrs.id) {
        if (!els[attrs.id]) bouw(m[0]);
        items.push({ id: attrs.id, pos: m.index });
        if (!leeg) overslaan = { tag, diepte: 1 };
        continue;
      }
      const k = makeEl('_q' + (elc++));
      k._tag = tag;
      k._attrs = attrs;
      k._host = host;
      k._pos = m.index;
      if (attrs.class) k.className = attrs.class;
      for (const n in attrs) {
        if (n.indexOf('data-') === 0) k.dataset[n.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = attrs[n];
      }
      if ('disabled' in attrs) k.disabled = true;
      if ('value' in attrs) k.value = attrs.value;
      if (!leeg) k._html = __binnenVan(host._html, tag, re.lastIndex);
      k._eind = re.lastIndex + k._html.length;
      items.push({ k, pos: m.index });
    }
    host._qsa = { html: host._html, items };
    return items;
  }
  /* alle elementen in het element, in de volgorde van de pagina: wat de app
     met appendChild toevoegde, staat achter wat er al in stond */
  function knopen(host, diepte) {
    diepte = diepte || 0;
    const lijst = [];
    if (diepte > 40) return lijst;
    const open = [];
    const sluit = function (tot) {
      while (open.length && open[open.length - 1]._eind <= tot) aangehangen(open.pop(), lijst, diepte);
    };
    for (const it of eigen(host)) {
      sluit(it.pos);
      if (it.k) {
        lijst.push(it.k);
        if (it.k.children.length) open.push(it.k);
        continue;
      }
      const k = els[it.id];
      lijst.push(k);
      for (const x of knopen(k, diepte + 1)) lijst.push(x);
    }
    sluit(Infinity);
    aangehangen(host, lijst, diepte);
    return lijst;
  }
  function aangehangen(el, lijst, diepte) {
    for (const c of el.children || []) {
      lijst.push(c);
      for (const x of knopen(c, diepte + 1)) lijst.push(x);
    }
  }
  /* Waar een element hangt: de keten van ouders tot de pagina, en of iets op
     die weg verborgen is. Een element met een id hangt in het binnenste
     element waarvan de HTML het noemt; een element zonder id in het element
     waarin de app het schreef, en alleen als geen element met een id ertussen
     zit (dan is dat zijn echte ouder, en deze kopie oud). null: los. */
  function ouderVan(el) {
    if (el === body) return null;
    if (el._los) return { los: true };
    if (el._ouder) return { ouder: el._ouder, omhullend: [] };
    let host = null, pos = -1;
    if (el.id && els[el.id] === el) {
      const zoek = new RegExp('<[a-zA-Z][\\w-]*\\s[^>]*\\bid="' + el.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
      const naam = 'id="' + el.id + '"';
      const kandidaten = Object.keys(els).map(k => els[k]).concat([body])
        .filter(h => h !== el && h._html && h._html.indexOf(naam) >= 0 && zoek.test(schoonVan(h)));
      host = kandidaten.find(h => !kandidaten.some(g => g !== h && g !== body && els[g.id] === g &&
        h._html.indexOf('id="' + g.id + '"') >= 0)) || null;
      if (host) pos = schoonVan(host).search(zoek);
    } else if (el._host && el._host._qsa && el._host._qsa.html === el._host._html &&
      el._host._qsa.items.some(it => it.k === el)) {
      host = el._host;
      pos = el._pos;
    }
    if (!host) return { los: true };
    eigen(host);
    const stapel = [], schoon = schoonVan(host), re = __tags();
    let m;
    while ((m = re.exec(schoon)) !== null && m.index < pos) {
      const tag = m[2].toLowerCase();
      if (m[1]) {
        for (let i = stapel.length - 1; i >= 0; i--) if (stapel[i].tag === tag) { stapel.length = i; break; }
      } else if (!__LEEG.test(tag) && !m[4]) stapel.push({ tag, attrs: __attrs(m[3]), k: levend(host, m.index) });
    }
    /* staat er een element met een id tussen, dan is dat de echte ouder; noemt
       die het niet meer, dan is dit een oude kopie */
    if (stapel.some(t => t.attrs.id && els[t.attrs.id])) return { los: true };
    return { ouder: host, omhullend: stapel };
  }
  function schoonVan(h) {
    if (h._schoonVan !== h._html) { h._schoon = __zonderCommentaar(h._html); h._schoonVan = h._html; }
    return h._schoon;
  }
  /* het object van een element zonder id op die plek, als de app het al kent */
  function levend(host, pos) {
    if (!host._qsa || host._qsa.html !== host._html) return null;
    const it = host._qsa.items.find(x => x.k && x.k._pos === pos);
    return it ? it.k : null;
  }
  function tagVerborgen(t) {
    const live = t.attrs.id && els[t.attrs.id];
    if (live) return verborgenZelf(live);
    if (t.k) return verborgenZelf(t.k) || !!t.k._los;
    return verborgenAttrs(t.attrs);
  }
  /* de keten van ouders, binnenste eerst, of null als het element nergens meer hangt */
  function pad(el) {
    const keten = [], tags = [];
    let verborgen = verborgenZelf(el), nu = el;
    for (let i = 0; i < 60 && nu !== body; i++) {
      const o = ouderVan(nu);
      if (!o || o.los) return null;
      if (o.omhullend.some(tagVerborgen)) verborgen = true;
      for (const t of o.omhullend) tags.push(t.tag);
      for (let j = o.omhullend.length - 1; j >= 0; j--) if (o.omhullend[j].k) keten.push(o.omhullend[j].k);
      nu = o.ouder;
      keten.push(nu);
      if (nu !== body && verborgenZelf(nu)) verborgen = true;
    }
    return nu === body ? { keten, verborgen, tags } : null;
  }
  /* de tekst die een kind ziet: zonder tags, zonder verborgen delen, en met de
     huidige inhoud van elk element met een id (de app kan die later hebben
     veranderd) */
  function zichtbareTekst(el) {
    const delen = [];
    const html = el._html || el._text || '';
    if (el._html || !el._text) {
      const schoon = __zonderCommentaar(html), re = __tags();
      let m, vorig = 0, overslaan = null;
      while ((m = re.exec(schoon)) !== null) {
        const tag = m[2].toLowerCase();
        if (overslaan) {
          if (tag === overslaan.tag && !__LEEG.test(tag) && !m[4]) overslaan.diepte += m[1] ? -1 : 1;
          if (overslaan.diepte === 0) { overslaan = null; vorig = re.lastIndex; }
          continue;
        }
        delen.push(schoon.slice(vorig, m.index));
        vorig = re.lastIndex;
        if (m[1] || __LEEG.test(tag) || m[4]) continue;
        const attrs = __attrs(m[3]), live = (attrs.id && els[attrs.id]) || levend(el, m.index);
        if (live && !verborgenZelf(live) && !live._los) delen.push(' ' + zichtbareTekst(live) + ' ');
        if (live || verborgenAttrs(attrs)) overslaan = { tag, diepte: 1 };
      }
      if (!overslaan) delen.push(schoon.slice(vorig));
    } else delen.push(el._text);
    for (const c of el.children || []) if (!verborgenZelf(c)) delen.push(' ' + zichtbareTekst(c) + ' ');
    return __ontsnap(delen.join(' ')).replace(/\s+/g, ' ').trim();
  }
  /* een element dat de app zelf maakte, heeft geen opmaak: dan tellen zijn id
     en zijn data zoals de app ze zette */
  function attrVan(k, naam) {
    if (k._attrs && naam in k._attrs) return k._attrs[naam];
    if (!k._attrs && naam === 'id') return k.id;
    if (naam.indexOf('data-') === 0) {
      const d = naam.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase());
      if (d in k.dataset) return String(k.dataset[d]);
    }
    return undefined;
  }
  function past(k, enkel) {
    const t = enkel.match(/^[a-zA-Z][\w-]*/);
    if (t && k._tag !== t[0].toLowerCase()) return false;
    const id = enkel.match(/#([\w-]+)/);
    if (id && attrVan(k, 'id') !== id[1]) return false;
    for (const c of enkel.match(/\.[\w-]+/g) || []) if (!k._cls.has(c.slice(1))) return false;
    for (const a of enkel.match(/\[[^\]]+\]/g) || []) {
      const am = a.match(/^\[\s*([\w-]+)\s*(?:=\s*["']?([^"'\]]*)["']?)?\s*\]$/);
      if (!am) return false;
      const v = attrVan(k, am[1].toLowerCase());
      if (v === undefined) return false;
      if (am[2] !== undefined && v !== am[2]) return false;
    }
    return true;
  }
  function zoekIn(hosts, sel) {
    const delen = String(sel).split(',').map(x => x.trim());
    if (delen.some(d => /\s|>|\+|~|:/.test(d))) return [];
    const uit = [];
    for (const h of hosts) for (const k of knopen(h)) if (delen.some(d => past(k, d)) && uit.indexOf(k) < 0) uit.push(k);
    return uit;
  }
  /* De vaste opmaak van de pagina (src/head.html): elk element met een id
     krijgt zijn klassen, data en tekst van daar, zodat een test ziet en
     aantikt wat een kind ziet. Een ouder houdt de opmaak van toen. */
  if (vast == null && typeof __VASTE_OPMAAK === 'string') vast = __VASTE_OPMAAK;
  if (vast) {
    bouw(vast);
    body._html = vast;
  }
  /* de zichtbare tekst van het element direct om dit element heen */
  function ouderTekst(el) {
    const o = el && ouderVan(el);
    if (!o || o.los) return '';
    const t = o.omhullend[o.omhullend.length - 1];
    return t && t.k ? zichtbareTekst(t.k) : zichtbareTekst(o.ouder);
  }
  return {
    __els: els,
    __pad: pad,
    __tekst: zichtbareTekst,
    __ouderTekst: ouderTekst,
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    createElement(tag) { const e = makeEl('_c' + (elc++)); e._tag = String(tag || '').toLowerCase(); return e; },
    /* de pagina zoals hij nu is, vanaf body: wat weggehaald is telt niet mee */
    querySelectorAll(sel) { return zoekIn([body], sel); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    body,
    documentElement: makeEl('documentElement'),
    /* document-brede handlers echt bewaren, zodat fire(document, 'keydown', ...)
       in de flowtests de app-code raakt (Escape sluit een modal) */
    _ev: {},
    addEventListener(t, fn) { (this._ev[t] || (this._ev[t] = [])).push(fn); }
  };
}
/* in-memory localStorage so profile save/load and de CRDT-doc round-trip echt draaien */
function maakOpslag() {
  return {
    _m: {},
    getItem(k) { return k in this._m ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; }
  };
}
function maakLocatie() {
  const loc = { protocol: 'file:', origin: 'https://test.local', pathname: '/schaakheld/', search: '', hash: '' };
  loc.__history = { replaceState() { loc.hash = ''; } };
  return loc;
}
var document = maakDocument();
var __els = document.__els;
var window = globalThis;
var navigator = {};
var localStorage = maakOpslag();

/* TextEncoder/TextDecoder: jsc heeft ze niet; utf-8 via de escape-truc */
function TextEncoder() {}
TextEncoder.prototype.encode = function (s) {
  const e = unescape(encodeURIComponent(s)), out = new Uint8Array(e.length);
  for (let i = 0; i < e.length; i++) out[i] = e.charCodeAt(i);
  return out;
};
function TextDecoder() {}
TextDecoder.prototype.decode = function (bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
};

/* Nep-WebCrypto: deterministisch, rond-tript, en weigert een verkeerde
   sleutel; goed genoeg om alle koppel- en syncpaden headless te draaien.
   De echte AES-GCM/HKDF draait alleen in de browser. */
var __seed = 0x1234567;
function __ksBytes(s) { const b = []; for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return b; }
function __keyTag(k) { let t = 0; for (const b of __ksBytes(k)) t = (t * 31 + b) >>> 0; return t; }
/* Bytes uit een 32-bit sleutel via xorshift. Een LCG (h = h*a + c mod 2^32)
   geeft in zijn laagste byte alleen de laagste byte van de vorige stand door:
   alle uitvoer hing dan aan acht bits, en twee verschillende sleuteluitwisselingen
   leverden met kans 1/256 hetzelfde geheim. */
function __bytesUit(h, n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    out[i] = h & 255;
  }
  return out;
}
function __nepDigest(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return __bytesUit(h, 32);
}
var crypto = {
  getRandomValues(arr) {
    for (let i = 0; i < arr.length; i++) {
      __seed ^= __seed << 13; __seed ^= __seed >>> 17; __seed ^= __seed << 5;
      arr[i] = __seed & 255;
    }
    return arr;
  },
  subtle: {
    digest(alg, bytes) {
      return Promise.resolve(__nepDigest(bytes).buffer);
    },
    importKey(fmt, keyBytes, alg) {
      if (alg && alg.name === 'ECDH') return Promise.resolve({ ecdhPub: Array.from(keyBytes) });
      return Promise.resolve({ k: Array.from(keyBytes).join(',') });
    },
    deriveKey(params, key) { return Promise.resolve({ k: key.k + '|' + Array.from(params.info).join(',') }); },
    /* HKDF-bits: deterministisch uit sleutel plus info; ECDH-bits: symmetrisch
       (beide kanten leiden hetzelfde af), pub = priv in deze nep */
    deriveBits(params, key, bits) {
      let seed;
      if (params.name === 'ECDH') {
        const a = key.ecdhPriv.join(','), b = params.public.ecdhPub.join(',');
        seed = a < b ? a + '/' + b : b + '/' + a;
      } else seed = key.k + '|' + Array.from(params.info).join(',');
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
      return Promise.resolve(__bytesUit(h, bits / 8).buffer);
    },
    generateKey(alg) {
      const raw = new Uint8Array(32);
      crypto.getRandomValues(raw);
      const arr = Array.from(raw);
      return Promise.resolve({ publicKey: { ecdhPub: arr }, privateKey: { ecdhPriv: arr } });
    },
    exportKey(fmt, key) { return Promise.resolve(new Uint8Array(key.ecdhPub).buffer); },
    encrypt(params, key, data) {
      data = data instanceof Uint8Array ? data : new Uint8Array(data);
      const ks = __ksBytes(key.k), tag = __keyTag(key.k), out = new Uint8Array(data.length + 8);
      for (let i = 0; i < 8; i++) out[i] = (tag >> ((i % 4) * 8)) & 255;
      for (let i = 0; i < data.length; i++) out[i + 8] = data[i] ^ ks[i % ks.length] ^ 170;
      return Promise.resolve(out.buffer);
    },
    decrypt(params, key, data) {
      data = data instanceof Uint8Array ? data : new Uint8Array(data);
      const ks = __ksBytes(key.k), tag = __keyTag(key.k);
      for (let i = 0; i < 8; i++) {
        if (data[i] !== ((tag >> ((i % 4) * 8)) & 255)) return Promise.reject(new Error('verkeerde sleutel'));
      }
      const out = new Uint8Array(data.length - 8);
      for (let i = 0; i < out.length; i++) out[i] = data[i + 8] ^ ks[i % ks.length] ^ 170;
      return Promise.resolve(out.buffer);
    }
  }
};

/* Nep-fetch met dezelfde semantiek als de Go-server (koppelcodes eenmalig,
   profielblobs met bearer secret, kamers en wederzijdse paren), zodat de
   flows end-to-end testbaar zijn. */
var __server = { links: {}, profiles: {}, wsrooms: {}, pending: {}, buses: {}, potjes: {}, klok: 0, teller: 0 };
/* grenzen en TTL uit bus.go, room.go en server.go. De nep-server meet tijd op
   de klok van de wereld, zoals de Go-server op die van zijn eigen machine: de
   datum van de test als die vastgezet is (die loopt met de virtuele klok mee en
   kan dagen verspringen), anders de virtuele klok van de timers; __server.klok
   schuift hem vooruit zodat een test een bus, een kamer of een koppelcode kan
   laten verlopen */
var BUS_TTL = 10 * 60000, MAX_BUSES = 512, MAX_BUS_BLOB = 4 << 10, MAX_BUS_CHECK = 64;
var POTJE_TTL = 30 * 24 * 3600000, MAX_POTJES = 1024;
var LINK_TTL = 10 * 60000, MAX_LINKS = 8192;
var KAMER_STIL = 15 * 60000, KAMER_MAX = 3 * 3600000, POTJE_STIL = 12 * 3600000, POTJE_MAX = 48 * 3600000, MAX_KAMERS = 64, KAMER_RUST = 3000;
function __busNu() { return (typeof __datumBasis !== 'undefined' && __datumBasis !== null ? Date.now() : __klok) + __server.klok; }
function __veegBussen() {
  for (var id in __server.buses) if (__server.buses[id].tot <= __busNu()) delete __server.buses[id];
}
function __veegPotjes() {
  for (var id in __server.potjes) if (__server.potjes[id].tot <= __busNu()) delete __server.potjes[id];
}
function __hexVan(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += (bytes[i] >> 4).toString(16) + (bytes[i] & 15).toString(16);
  return hex;
}
function __sha256hex(tekst) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst)).then(function (d) {
    return __hexVan(new Uint8Array(d));
  });
}
/* zoals versie in bus.go, maar zonder belofte: vergelijken en opslaan horen in
   een stap, anders kan een tweede schrijver ertussen en winnen ze allebei */
function __versie(blob) { return __hexVan(__nepDigest(new TextEncoder().encode(blob))); }
/* zoals busGeldig na readJSON: de velden zijn tekst (null of weg telt als
   leeg) en de grens telt bytes, zoals len in Go */
function __busGeldig(body, hex) {
  const tekst = v => v == null || typeof v === 'string';
  return tekst(body.bus) && tekst(body.bewijs) && tekst(body.blob) &&
    /^[a-f0-9]{64}$/.test(body.bus) && hex === body.bus && /^[A-Za-z0-9_-]{8,64}$/.test(body.bewijs) &&
    new TextEncoder().encode(body.blob == null ? '' : body.blob).length <= MAX_BUS_BLOB;
}
/* een herstart van de server: alles wat alleen in het geheugen staat is weg
   en elke open lijn breekt; de profielen en potjesbussen op schijf blijven */
function __herstartServer() {
  for (const id in __server.wsrooms) {
    const rm = __server.wsrooms[id];
    for (const tok in rm.seats) if (rm.seats[tok] && rm.seats[tok].verbreek) rm.seats[tok].verbreek();
  }
  __server.links = {};
  __server.wsrooms = {};
  __server.pending = {};
  __server.buses = {};
  /* de potjesbussen staan op schijf, zoals in bus.go: wat niet verlopen is
     blijft */
  __veegPotjes();
}
/* alleen de potjesbussen kwijt, zoals een verloren map potjes: voor een
   apparaat dat zijn staat terug moet schrijven */
function __potjesKwijt() { __server.potjes = {}; }
/* zoals room.go: een kamer heeft een potje zodra beide stoeltjes ooit
   verbonden waren; stil is pas stil als er niemand verbonden is */
function __heeftPotje(rm) { return rm.order.every(tok => rm.joined[tok]); }
function __kamerBezet(rm) { return rm.order.some(tok => rm.seats[tok] && rm.seats[tok].readyState === 1); }
function __veegKamers() {
  const nu = __busNu();
  for (const id in __server.wsrooms) {
    const rm = __server.wsrooms[id];
    const potje = __heeftPotje(rm);
    if (nu - rm.created >= (potje ? POTJE_MAX : KAMER_MAX)) { delete __server.wsrooms[id]; continue; }
    if (nu - rm.touched < (potje ? POTJE_STIL : KAMER_STIL)) continue;
    if (!__kamerBezet(rm)) delete __server.wsrooms[id];
  }
}
/* zoals evictRoomLocked: alleen een kamer zonder iemand erin en ouder dan
   KAMER_RUST wijkt, eerst een zonder potje, dan de langst stille */
function __maakPlaats() {
  const nu = __busNu();
  let weg = null;
  for (const id in __server.wsrooms) {
    const rm = __server.wsrooms[id], w = weg && __server.wsrooms[weg];
    if (__kamerBezet(rm) || nu - rm.created < KAMER_RUST) continue;
    if (!w || (__heeftPotje(rm) !== __heeftPotje(w) ? !__heeftPotje(rm) : rm.touched < w.touched)) weg = id;
  }
  if (weg) delete __server.wsrooms[weg];
  return !!weg;
}
function __nieuwToken() { return 'tok' + (++__server.teller) + 'x'.repeat(16); }
function __nieuweKamer() {
  __veegKamers();
  if (Object.keys(__server.wsrooms).length >= MAX_KAMERS && !__maakPlaats()) return null;
  const id = 'kamer' + (++__server.teller) + 'k'.repeat(12);
  const host = __nieuwToken(), gast = __nieuwToken(), nu = __busNu();
  __server.wsrooms[id] = { seats: {}, order: [host, gast], joined: {}, created: nu, touched: nu };
  __server.wsrooms[id].seats[host] = null;
  __server.wsrooms[id].seats[gast] = null;
  return { id, host, gast };
}
var fetch = function (url, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const m = opts.method || 'GET';
    const path = url.replace(/^[a-z]+:\/\/[^\/]+/, '');
    const hdrs = opts.headers || {};
    const auth = hdrs.Authorization || hdrs.authorization || '';
    const secret = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
    const res = (status, data) => resolve({
      status,
      json: () => Promise.resolve(data),
      arrayBuffer: () => Promise.resolve(data instanceof Uint8Array ? data.buffer.slice(0) : new ArrayBuffer(0))
    });
    /* zoals readJSON: een json-body die niet parseert (ook tekst na het
       object) is 400; POST /v1/room leest geen body */
    let body = opts.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { if (!(m === 'POST' && path === '/v1/room')) { res(400); return; } }
    }
    if (m === 'POST' && path === '/v1/link') {
      /* zoals server.go: vol is vol, ook voor een code die er al staat */
      for (const c in __server.links) if (__server.links[c].tot <= __busNu()) delete __server.links[c];
      if (Object.keys(__server.links).length >= MAX_LINKS) { res(429); return; }
      __server.links[body.code] = { payload: body.payload, tot: __busNu() + LINK_TTL };
      res(204);
    }
    else if (m === 'POST' && path === '/v1/bus') {
      /* zelfde regels als bus.go: bus = sha256(bewijs), leeg blob wist, een
         bus houdt het briefje BUS_TTL lang, en vol is vol (een bestaande bus
         mag wel vervangen worden) */
      __sha256hex(body.bewijs).then(function (hex) {
        if (!__busGeldig(body, hex)) { res(400); return; }
        __veegBussen();
        if (body.blob === '') { delete __server.buses[body.bus]; res(204); return; }
        if (!(body.bus in __server.buses) && Object.keys(__server.buses).length >= MAX_BUSES) { res(429); return; }
        __server.buses[body.bus] = { blob: body.blob, tot: __busNu() + BUS_TTL };
        res(204);
      });
    }
    else if (m === 'POST' && path === '/v1/potje') {
      /* zoals handlePotjePost: de regels van een bus, maar dertig dagen na het
         laatste schrijven, een volle tabel laat de langst niet geschreven bus
         plaatsmaken, dezelfde bytes verlengen alleen, en alleen bus, bewijs,
         blob en als mogen erin staan; als moet de versie zijn van wat er
         staat ('' voor niets), anders verandert er niets en komt er 409 met
         wat er staat; een leeg briefje is 400, want geen schrijven haalt een
         staat weg */
      if (!body || typeof body !== 'object' ||
        Object.keys(body).some(function (k) { return ['bus', 'bewijs', 'blob', 'als'].indexOf(k) < 0; })) { res(400); return; }
      __sha256hex(body.bewijs).then(function (hex) {
        if (!__busGeldig(body, hex) || body.blob == null || body.blob === '' || typeof body.als !== 'string' ||
          !(body.als === '' || /^[a-f0-9]{64}$/.test(body.als))) { res(400); return; }
        __veegPotjes();
        const blob = body.blob, nu = __busNu();
        const oud = __server.potjes[body.bus];
        if (body.als !== (oud ? __versie(oud.blob) : '')) { res(409, { blob: oud ? oud.blob : '' }); return; }
        if (!oud && Object.keys(__server.potjes).length >= MAX_POTJES) {
          let weg = null;
          for (const id in __server.potjes) if (weg === null || __server.potjes[id].tot < __server.potjes[weg].tot) weg = id;
          delete __server.potjes[weg];
        }
        __server.potjes[body.bus] = { blob: blob, tot: nu + POTJE_TTL };
        res(204);
      });
    }
    else if (m === 'POST' && path === '/v1/bus/check') {
      var vraag = body.bussen || [];
      if (vraag.length > MAX_BUS_CHECK) { res(400); return; }
      __veegBussen();
      __veegPotjes();
      var blobs = {}, nuC = __busNu();
      vraag.forEach(function (id) {
        if (!/^[a-f0-9]{64}$/.test(id)) return;
        if (id in __server.buses) blobs[id] = __server.buses[id].blob;
        if (id in __server.potjes) blobs[id] = __server.potjes[id].blob;
      });
      res(200, { blobs: blobs, nu: Math.floor(nuC / 1000) });
    }
    else if (m === 'POST' && path === '/v1/room') {
      const k = __nieuweKamer();
      if (!k) { res(429); return; }
      res(200, { room: k.id, seat: k.host, guest: k.gast });
    }
    else if (m === 'POST' && path === '/v1/pair') {
      /* zelfde validatie als room.go: zelfde-code of rare tekens is 400 */
      if (body.mine === body.theirs || !/^[A-Za-z0-9_-]{8,64}$/.test(body.mine) ||
        !/^[A-Za-z0-9_-]{8,64}$/.test(body.theirs)) { res(400); return; }
      __veegKamers();
      const lo = body.mine < body.theirs ? body.mine : body.theirs;
      const hi = body.mine < body.theirs ? body.theirs : body.mine;
      const key = lo + '|' + hi;
      const p = __server.pending[key];
      if (!p) { __server.pending[key] = { dirA: body.mine }; res(204); }
      else if (p.room) {
        /* idempotent: elke kant haalt zijn eigen stoel op, net als room.go */
        if (body.mine === p.dirA) res(200, { room: p.room, seat: p.seatA, host: true });
        else res(200, { room: p.room, seat: p.seatB, host: false });
      }
      else if (p.dirA === body.mine) res(204);
      else {
        const k = __nieuweKamer();
        if (!k) { res(429); return; }
        p.room = k.id;
        p.seatA = k.host;
        p.seatB = k.gast;
        res(200, { room: k.id, seat: p.seatB, host: false });
      }
    }
    else if (m === 'POST' && path === '/v1/link/redeem') {
      const p = __server.links[body.code];
      delete __server.links[body.code];
      (p === undefined || p.tot <= __busNu()) ? res(404) : res(200, { payload: p.payload });
    } else if (m === 'GET' && path === '/healthz') {
      /* zoals server.go: de server leeft */
      res(200, 'ok\n');
    } else if (path.indexOf('/v1/profile/') === 0) {
      const id = path.slice('/v1/profile/'.length);
      const prof = __server.profiles[id];
      if (m === 'PUT') {
        /* zoals maxBlob in server.go: een profiel boven 64 KB krijgt 413 */
        if ((body == null ? 0 : body.byteLength != null ? body.byteLength : body.length) > 65536) return res(413);
        if (prof && prof.secret !== secret) return res(404);
        __server.profiles[id] = { secret, blob: new Uint8Array(body) };
        res(204);
      } else {
        (!prof || prof.secret !== secret) ? res(404) : res(200, prof.blob);
      }
    } else res(404);
  });
};
var location = maakLocatie();
var history = location.__history;
var innerWidth = 900, innerHeight = 700;
/* scrollen heeft hier geen opmaak; de shim onthoudt alleen wat er gevraagd werd */
var __scrolls = [];
var scrollTo = function (x, y) {
  const top = x && typeof x === 'object' ? x.top : y;
  __scrolls.push({ top: top == null ? null : top });
};
var addEventListener = function () {};
var matchMedia = function () { return { matches: true }; };
/* de looptijd van het apparaat loopt met de klok van de timers en niet met de datum: schuifKlok laat de datum
   springen terwijl de looptijd stilstaat, zoals een telefoon die sliep met de app open */
var performance = { now: () => __klok };
var requestAnimationFrame = function () { return 0; };
var cancelAnimationFrame = function () {};

/* Nep-WebSocket met dezelfde relay-semantiek als de Go-server: eerste
   bericht is de join {room, seat}, daarna gaan berichten naar het andere
   stoeltje; welkom- en peer-signalen zoals in room.go. Aflevering loopt
   via de timerwachtrij, dus drainTimers() drijft alles aan. */
function WebSocket(url) {
  const self = this;
  this.readyState = 0;
  this._room = null;
  this._seat = null;
  /* de kamer zelf, niet het id: zoals room.go gaan berichten tussen twee
     verbonden stoeltjes door, ook als de kamer om zijn leeftijd uit de tabel
     ging */
  this._rm = null;
  this.onopen = null; this.onmessage = null; this.onclose = null;
  setTimeout(() => {
    if (self.readyState !== 0) return;
    self.readyState = 1;
    if (self.onopen) self.onopen({});
  }, 0);
  /* __server.vertraging(sock, data) geeft een lijn die tijd kost (in ms); zoals een echte verbinding levert hij in
     volgorde af, ook als een later bericht minder lang onderweg is */
  const lever = (sock, data) => {
    const d = typeof __server.vertraging === 'function' ? __server.vertraging(sock, data) : 0;
    const op = Math.max(__klok + d, sock.__laatsteLevering || 0);
    sock.__laatsteLevering = op;
    setTimeout(() => {
      if (sock.readyState === 1 && sock.onmessage) sock.onmessage({ data });
    }, op - __klok);
  };
  const peer = () => {
    const rm = self._rm;
    if (!rm) return null;
    for (const tok in rm.seats) {
      const so = rm.seats[tok];
      if (tok !== self._seat && so && so.readyState === 1) return so;
    }
    return null;
  };
  this.send = function (data) {
    if (self.readyState !== 1) return;
    if (!self._room) {
      let join = null;
      try { join = JSON.parse(data); } catch (e) {}
      if (!join || typeof join !== 'object') { self._sluit(1008, 'eerst joinen', true); return; }
      __veegKamers();
      const rm = __server.wsrooms[join.room];
      /* room.go: een onbekende kamer en een fout token zijn hetzelfde antwoord */
      if (!rm || !(join.seat in rm.seats)) { self._sluit(1008, 'onbekend', true); return; }
      const oud = rm.seats[join.seat];
      self._room = join.room;
      self._rm = rm;
      self._seat = join.seat;
      rm.seats[join.seat] = self;
      rm.joined[join.seat] = true;
      /* zoals room.go: eerst zeggen dat het stoeltje is overgenomen, dan de
         lijn dicht zonder sluitbericht, zodat de oude kant weet dat
         herverbinden zinloos is */
      if (oud && oud !== self) {
        setTimeout(function () {
          if (oud.readyState === 1 && oud.onmessage) oud.onmessage({ data: '{"t":"stoel"}' });
          oud._sluit(1006, '', false);
        }, 0);
      }
      /* zoals room.go: het welkom zegt of de ander nu verbonden is */
      const p = peer();
      /* __server.welkomZonderAnder speelt een server die nog niet bijgewerkt is: zijn welkom zegt niets over de ander */
      lever(self, __server.welkomZonderAnder ? '{"t":"welkom"}' : '{"t":"welkom","peer":' + !!p + '}');
      if (p) lever(p, '{"t":"peer","aan":true}');
      return;
    }
    const p = peer();
    if (p) lever(p, data);
  };
  /* code en reden zoals de browser ze meldt: 1008 met een reden als de server
     de verbinding weigert (room.go), 1006 als de lijn wegvalt zonder
     sluitbericht (CloseNow in room.go, of het netwerk), 1005 als de app zelf
     sluit */
  this._sluit = function (code, reden, schoon) {
    if (self.readyState === 3) return;
    self.readyState = 3;
    if (self._rm) {
      const rm = self._rm;
      if (rm.seats[self._seat] === self) {
        rm.seats[self._seat] = null;
        rm.touched = __busNu();
        for (const tok in rm.seats) {
          const so = rm.seats[tok];
          if (so && so.readyState === 1) lever(so, '{"t":"peer","aan":false}');
        }
      }
    }
    setTimeout(() => {
      if (!schoon && self.onerror) self.onerror({});
      if (self.onclose) self.onclose({ code, reason: reden, wasClean: schoon });
    }, 0);
  };
  this.close = function () { self._sluit(1005, '', true); };
  /* het netwerk van dit apparaat valt weg */
  this.verbreek = function () { self._sluit(1006, '', false); };
}

/* Een socket zonder netwerk: hij gaat nooit open; de browser meldt een fout
   en sluit met 1006, zonder reden. De server merkt er niets van. */
function GeenNetSocket(url) {
  const self = this;
  this.url = url;
  this.readyState = 0;
  this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
  this.send = function () {};
  this.close = function () { self.readyState = 3; };
  this.verbreek = function () {};
  setTimeout(function () {
    if (self.readyState === 3) return;
    self.readyState = 3;
    if (self.onerror) self.onerror({});
    if (self.onclose) self.onclose({ code: 1006, reason: '', wasClean: false });
  }, 0);
}

/* Handmatige tijd. Een timer krijgt een moment op een virtuele klok en
   drainTimers loopt standaard vijf seconden vooruit: zo loopt een timer van
   een halve minuut (wachten op een maatje) niet mee in een drain die een
   animatie van 900 ms afhandelt. Geef een groter venster mee om hem wel te
   laten aflopen. */
var __timers = [], __tid = 1, __klok = 0;
var setTimeout = function (fn, ms) { __timers.push({ fn, at: __klok + (ms || 0), id: __tid }); return __tid++; };
var clearTimeout = function (id) { __timers = __timers.filter(t => t.id !== id); };
function drainTimers(max, venster) {
  return drainTot(max, __klok + (venster == null ? 5000 : venster));
}
function drainTot(max, grens) {
  max = max || 400;
  let n = 0;
  while (n < max) {
    __timers.sort((a, b) => a.at - b.at);
    const t = __timers[0];
    if (!t || t.at > grens) break;
    __timers.shift();
    if (t.at > __klok) __klok = t.at;
    n++;
    t.fn();
  }
  return n;
}
function fire(el, type, ev) {
  (el._ev[type] || []).forEach(f => f(Object.assign({ key: '', preventDefault() {} }, ev || {})));
}
