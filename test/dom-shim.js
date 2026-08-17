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
var location = { protocol: 'file:' };
var innerWidth = 900, innerHeight = 700;
var addEventListener = function () {};
var matchMedia = function () { return { matches: true }; };
var performance = { now: () => Date.now() };
var requestAnimationFrame = function () { return 0; };
var cancelAnimationFrame = function () {};

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
function fire(el, type) { (el._ev[type] || []).forEach(f => f({ key: '', preventDefault() {} })); }
