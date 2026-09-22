// the one dom stub every runner builds on: twelve hand-rolled element() stubs had drifted into
// dialects, so a fix had to be made twelve times. enough of an element for the scripts' structure
// and arithmetic, nothing that makes it a browser. the underscore keeps the test glob off it

export class Element {}
globalThis.Element = Element;

// every element made, so a runner can count listeners left on live hosts after a destroy()
export const created = [];

// `.cls`, `.cls[data-key="value"]`, or a comma list of those - all the selectors the scripts use
// against their own containers
function matchesOne(el, selector) {
  const m = selector.trim().match(/^\.([\w-]+)(?:\[data-([\w-]+)="([^"]*)"\])?$/);
  if (!m) return false;
  if (!el.classList.contains(m[1])) return false;
  return m[2] === undefined || el.dataset[m[2]] === m[3];
}

export function element(tag = 'div', extra = {}) {
  const listeners = {};
  const classes = new Set();
  const attrs = {};
  const el = new Element();
  Object.assign(el, {
    tag, style: {}, children: [], parentNode: null, dataset: {}, tabIndex: 0, hidden: false,
    textContent: '', innerHTML: '', title: '', offsetWidth: 200, isConnected: true,
    focused: false, removed: false, onclick: null, onkeydown: null,
    rect: {left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0},
    _listeners: listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    listenerCount(type) { return (listeners[type] || []).length; },
    // handlers get a minimal event; a runner passes what its script reads
    fire(type, evt = {}) {
      (listeners[type] || []).slice().forEach(fn => fn({stopPropagation() {}, preventDefault() {}, ...evt}));
    },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    append(...kids) { kids.forEach(k => el.appendChild(k)); },
    remove() {
      el.removed = true;
      el.isConnected = false;
      if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(c => c !== el);
      el.parentNode = null;
      // a removed subtree goes with it, so nothing under it counts as a live host
      const drop = list => list.forEach(c => { c.removed = true; c.isConnected = false; drop(c.children || []); });
      drop(el.children);
    },
    replaceWith() {},
    focus() { el.focused = true; },
    blur() { el.focused = false; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    contains(n) { for (let cur = n; cur; cur = cur.parentNode) if (cur === el) return true; return false; },
    matches(selector) { return selector.split(',').some(s => matchesOne(el, s)); },
    closest(selector) { for (let cur = el; cur; cur = cur.parentNode) if (cur.matches?.(selector)) return cur; return null; },
    querySelectorAll(selector) {
      const out = [];
      const walk = list => list.forEach(c => { if (c.matches?.(selector)) out.push(c); walk(c.children || []); });
      walk(el.children);
      return out;
    },
    querySelector(selector) { return el.querySelectorAll(selector)[0] || null; },
    getBoundingClientRect() { return {...el.rect}; },
    classList: {
      add: (...names) => names.forEach(c => classes.add(c)),
      remove: (...names) => names.forEach(c => classes.delete(c)),
      contains: c => classes.has(c),
      toggle(c, on) {
        const next = on === undefined ? !classes.has(c) : Boolean(on);
        if (next) classes.add(c); else classes.delete(c);
        return next;
      },
    },
  });
  // className and classList are two views of one set, the way a browser keeps them
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: v => { classes.clear(); String(v).split(' ').filter(Boolean).forEach(c => classes.add(c)); },
    enumerable: true,
  });
  Object.assign(el, extra);
  created.push(el);
  return el;
}

// a listener registry with the same shape an element keeps, for document and window
function listening(target) {
  const listeners = {};
  return Object.assign(target, {
    _listeners: listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    listenerCount(type) { return (listeners[type] || []).length; },
    fire(type, evt = {}) {
      (listeners[type] || []).slice().forEach(fn => fn({stopPropagation() {}, preventDefault() {}, ...evt}));
    },
  });
}

export function makeDocument(extra = {}) {
  const body = element('body');
  const doc = listening({
    createElement: element, body, documentElement: element('html'), activeElement: null,
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector),
  });
  return Object.assign(doc, extra);
}

export function makeWindow(extra = {}) {
  return Object.assign(listening({innerWidth: 1200, innerHeight: 800}), extra);
}

// installs both as globals and returns them; a runner that needs a different window or document
// passes overrides
export function installDom({document: docExtra = {}, window: winExtra = {}} = {}) {
  const document = makeDocument(docExtra);
  const window = makeWindow(winExtra);
  Object.assign(globalThis, {document, window});
  return {document, window};
}

// how many listeners sit on window, on document, and on elements still in the page - the three
// numbers a destroy() test asserts go to zero. document is where menu.js and expand.js register
export function liveListeners(window, document = globalThis.document) {
  const count = target => Object.values(target?._listeners || {}).reduce((n, fns) => n + fns.length, 0);
  return {
    window: count(window),
    document: count(document),
    host: created.filter(el => !el.removed).reduce((n, el) => n + count(el), 0),
  };
}
