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
    set: v => { el._html = String(v); el.children = []; }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._text || el._html.replace(/<[^>]*>/g, ''),
    set: v => { el._text = String(v); el._html = String(v); }
  });
  el.appendChild = c => { el.children.push(c); return c; };
  el.querySelectorAll = () => [];
  el.querySelector = () => null;
  /* keep only the latest handler per type: real DOM nodes are recreated per
     innerHTML write, the shim caches them, so accumulation is a shim artifact */
  el.addEventListener = (t, fn) => { el._ev[t] = [fn]; };
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
var document = {
  getElementById(id) { return __els[id] || (__els[id] = makeEl(id)); },
  createElement() { return makeEl('_c' + (elc++)); },
  querySelectorAll() { return []; },
  querySelector() { return makeEl('_q' + (elc++)); },
  body: makeEl('body'),
  documentElement: makeEl('documentElement'),
  addEventListener() {}
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
      const out = new Uint8Array(32);
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
      for (let i = 0; i < 32; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; out[i] = h & 255; }
      return Promise.resolve(out.buffer);
    },
    importKey(fmt, keyBytes) { return Promise.resolve({ k: Array.from(keyBytes).join(',') }); },
    deriveKey(params, key) { return Promise.resolve({ k: key.k + '|' + Array.from(params.info).join(',') }); },
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
var __server = { links: {}, profiles: {}, wsrooms: {}, pending: {}, teller: 0 };
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

/* manual timer queue */
var __timers = [], __tid = 1;
var setTimeout = function (fn, ms) { __timers.push({ fn, ms: ms || 0, id: __tid }); return __tid++; };
var clearTimeout = function (id) { __timers = __timers.filter(t => t.id !== id); };
function drainTimers(max) {
  max = max || 400;
  let n = 0;
  while (__timers.length && n < max) {
    __timers.sort((a, b) => a.ms - b.ms);
    const t = __timers.shift();
    n++;
    t.fn();
  }
  return n;
}
function fire(el, type, ev) {
  (el._ev[type] || []).forEach(f => f(Object.assign({ key: '', preventDefault() {} }, ev || {})));
}
