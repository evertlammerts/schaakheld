/* Minimal DOM shim so the UI script can run headless under jsc (or node via cat-pipe). */
if (typeof print === 'undefined') var print = console.log;
var elc = 0;
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
    set: v => { el._html = String(v); el.children = []; __versHtml(v); }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._text || el._html.replace(/<[^>]*>/g, ''),
    set: v => { el._text = String(v); el._html = String(v); }
  });
  el.appendChild = c => { el.children.push(c); return c; };
  el.querySelectorAll = () => [];
  el.querySelector = () => null;
  el.addEventListener = (t, fn) => { (el._ev[t] || (el._ev[t] = [])).push(fn); };
  el.style.setProperty = function () {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 40, height: 40 });
  el.remove = () => {};
  el.closest = () => makeEl('closest' + (elc++));
  el.replaceWith = () => {};
  el.focus = () => {};
  el.cloneNode = () => makeEl(id);
  el.getContext = () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} });
  return el;
}
var __els = {};
/* Een element met een id in vers geschreven HTML is in een echte browser een
   nieuwe knoop: zijn luisteraars zijn weg. De shim geeft hetzelfde gecachete
   object terug, dus wissen we ze hier. Het element waarin geschreven wordt
   blijft wel bestaan, dus daar stapelen luisteraars op, net als echt. */
function __versHtml(html) {
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) { const el = __els[m[1]]; if (el) el._ev = {}; }
}
var document = {
  getElementById(id) { return __els[id] || (__els[id] = makeEl(id)); },
  createElement() { return makeEl('_c' + (elc++)); },
  querySelectorAll() { return []; },
  querySelector() { return makeEl('_q' + (elc++)); },
  body: makeEl('body'),
  documentElement: makeEl('documentElement'),
  /* document-brede handlers echt bewaren, zodat fire(document, 'keydown', ...)
     in de flowtests de app-code raakt (Escape sluit een modal) */
  _ev: {},
  addEventListener(t, fn) { (this._ev[t] || (this._ev[t] = [])).push(fn); }
};
var window = globalThis;
var navigator = {};
/* in-memory localStorage so profile save/load and de CRDT-doc round-trip echt draaien */
var localStorage = {
  _m: {},
  getItem(k) { return k in this._m ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; }
};

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
      bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let h = 2166136261;
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
      return Promise.resolve(__bytesUit(h, 32).buffer);
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
var __server = { links: {}, profiles: {}, wsrooms: {}, pending: {}, buses: {}, klok: 0, teller: 0 };
/* grenzen en TTL uit bus.go; __server.klok schuift de nep-klok vooruit zodat
   een flowtest een bus kan laten verlopen */
var BUS_TTL = 10 * 60000, MAX_BUSES = 512, MAX_BUS_BLOB = 4 << 10, MAX_BUS_CHECK = 64;
function __busNu() { return Date.now() + __server.klok; }
function __veegBussen() {
  for (var id in __server.buses) if (__server.buses[id].tot <= __busNu()) delete __server.buses[id];
}
function __nieuwToken() { return 'tok' + (++__server.teller) + 'x'.repeat(16); }
function __nieuweKamer() {
  const id = 'kamer' + (++__server.teller) + 'k'.repeat(12);
  const host = __nieuwToken(), gast = __nieuwToken();
  __server.wsrooms[id] = { seats: {}, order: [host, gast] };
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
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    const res = (status, data) => resolve({
      status,
      json: () => Promise.resolve(data),
      arrayBuffer: () => Promise.resolve(data instanceof Uint8Array ? data.buffer.slice(0) : new ArrayBuffer(0))
    });
    if (m === 'POST' && path === '/v1/link') { __server.links[body.code] = body.payload; res(204); }
    else if (m === 'POST' && path === '/v1/bus') {
      /* zelfde regels als bus.go: bus = sha256(bewijs), leeg blob wist, een
         bus houdt het briefje BUS_TTL lang, en vol is vol (een bestaande bus
         mag wel vervangen worden) */
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.bewijs)).then(function (d) {
        var hex = '';
        var bytes = new Uint8Array(d);
        for (var i = 0; i < 32; i++) hex += (bytes[i] >> 4).toString(16) + (bytes[i] & 15).toString(16);
        if (!/^[a-f0-9]{64}$/.test(body.bus) || hex !== body.bus || !/^[A-Za-z0-9_-]{8,64}$/.test(body.bewijs) ||
          String(body.blob == null ? '' : body.blob).length > MAX_BUS_BLOB) { res(400); return; }
        __veegBussen();
        if (body.blob === '') { delete __server.buses[body.bus]; res(204); return; }
        if (!(body.bus in __server.buses) && Object.keys(__server.buses).length >= MAX_BUSES) { res(429); return; }
        __server.buses[body.bus] = { blob: body.blob, tot: __busNu() + BUS_TTL };
        res(204);
      });
    }
    else if (m === 'POST' && path === '/v1/bus/check') {
      var vraag = body.bussen || [];
      if (vraag.length > MAX_BUS_CHECK) { res(400); return; }
      __veegBussen();
      var blobs = {};
      vraag.forEach(function (id) {
        if (/^[a-f0-9]{64}$/.test(id) && (id in __server.buses)) blobs[id] = __server.buses[id].blob;
      });
      res(200, { blobs: blobs });
    }
    else if (m === 'POST' && path === '/v1/room') {
      const k = __nieuweKamer();
      res(200, { room: k.id, seat: k.host, guest: k.gast });
    }
    else if (m === 'POST' && path === '/v1/pair') {
      /* zelfde validatie als room.go: zelfde-code of rare tekens is 400 */
      if (body.mine === body.theirs || !/^[A-Za-z0-9_-]{8,64}$/.test(body.mine) ||
        !/^[A-Za-z0-9_-]{8,64}$/.test(body.theirs)) { res(400); return; }
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
        p.room = k.id;
        p.seatA = k.host;
        p.seatB = k.gast;
        res(200, { room: k.id, seat: p.seatB, host: false });
      }
    }
    else if (m === 'POST' && path === '/v1/link/redeem') {
      const p = __server.links[body.code];
      delete __server.links[body.code];
      p === undefined ? res(404) : res(200, { payload: p });
    } else if (path.indexOf('/v1/profile/') === 0) {
      const id = path.slice('/v1/profile/'.length);
      const prof = __server.profiles[id];
      if (m === 'PUT') {
        if (prof && prof.secret !== secret) return res(404);
        __server.profiles[id] = { secret, blob: new Uint8Array(body) };
        res(204);
      } else {
        (!prof || prof.secret !== secret) ? res(404) : res(200, prof.blob);
      }
    } else res(404);
  });
};
var location = { protocol: 'file:', origin: 'https://test.local', pathname: '/schaakheld/', search: '', hash: '' };
var history = { replaceState() { location.hash = ''; } };
var innerWidth = 900, innerHeight = 700;
var addEventListener = function () {};
var matchMedia = function () { return { matches: true }; };
var performance = { now: () => Date.now() };
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
  this.onopen = null; this.onmessage = null; this.onclose = null;
  setTimeout(() => {
    if (self.readyState !== 0) return;
    self.readyState = 1;
    if (self.onopen) self.onopen({});
  }, 0);
  const lever = (sock, data) => setTimeout(() => {
    if (sock.readyState === 1 && sock.onmessage) sock.onmessage({ data });
  }, 0);
  const peer = () => {
    const rm = __server.wsrooms[self._room];
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
      const rm = join && __server.wsrooms[join.room];
      if (!rm || !(join.seat in rm.seats)) { self.close(); return; }
      const oud = rm.seats[join.seat];
      self._room = join.room;
      self._seat = join.seat;
      rm.seats[join.seat] = self;
      if (oud && oud !== self) oud.close();
      lever(self, '{"t":"welkom"}');
      const p = peer();
      if (p) lever(p, '{"t":"peer","aan":true}');
      return;
    }
    const p = peer();
    if (p) lever(p, data);
  };
  this.close = function () {
    if (self.readyState === 3) return;
    self.readyState = 3;
    if (self._room) {
      const rm = __server.wsrooms[self._room];
      if (rm && rm.seats[self._seat] === self) {
        rm.seats[self._seat] = null;
        const zoek = __server.wsrooms[self._room];
        for (const tok in zoek.seats) {
          const so = zoek.seats[tok];
          if (so && so.readyState === 1) lever(so, '{"t":"peer","aan":false}');
        }
      }
    }
    if (self.onclose) setTimeout(() => { if (self.onclose) self.onclose({}); }, 0);
  };
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
  max = max || 400;
  const grens = __klok + (venster == null ? 5000 : venster);
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
