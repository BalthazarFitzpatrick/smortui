// exercises initShell/activateTab against a dom stub: the remembered tab wins when its button still
// exists, a remembered tab whose button is gone falls through to `fallback`, no fallback means the
// button marked .active (else the first), arrows wrap, and only the active tab sits in the tab order
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

function node(kind, name) {
  const classes = new Set();
  const attrs = {};
  const el = {
    kind, dataset: kind === 'tab' ? {tab: name} : {panel: name}, tabIndex: -1, focused: false,
    onclick: null, onkeydown: null,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle(c, on) { on ? classes.add(c) : classes.delete(c); return on; },
    },
    setAttribute(k, v) { attrs[k] = v; }, getAttribute: k => attrs[k],
    focus() { el.focused = true; },
  };
  return el;
}

let tabs = [], panels = [];
globalThis.document = {
  querySelectorAll: sel => sel === '.nav-tab' ? tabs : panels,
  querySelector: sel => {
    const m = sel.match(/data-tab="([^"]+)"/);
    return m ? tabs.find(t => t.dataset.tab === m[1]) || null : null;
  },
};
let store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

const src = readFileSync(new URL('../../ui_base/assets/shell.js', import.meta.url), 'utf8');
const {initShell, activateTab} = new Function(`${src}; return {initShell, activateTab};`)();

function page(names, marked = null) {
  tabs = names.map(n => node('tab', n));
  panels = names.map(n => node('panel', n));
  if (marked) tabs.find(t => t.dataset.tab === marked).classList.add('active');
}
const active = () => tabs.filter(t => t.classList.contains('active')).map(t => t.dataset.tab);
const shown = () => panels.filter(p => !p.classList.contains('hidden')).map(p => p.dataset.panel);

// ---- cold start: fallback wins, onEnter fires for it, aria and tabindex rove
{
  page(['a', 'b', 'c']); store = {};
  const entered = [];
  initShell({onEnter: n => entered.push(n), fallback: 'b'});
  assert.deepEqual(active(), ['b']);
  assert.deepEqual(shown(), ['b']);
  assert.deepEqual(entered, ['b'], 'onEnter fires on the initial activation too');
  assert.deepEqual(tabs.map(t => t.tabIndex), [-1, 0, -1], 'only the active tab is in the tab order');
  assert.deepEqual(tabs.map(t => t.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.equal(store['ui-base:tab'], 'b', 'the choice is remembered under the namespaced key');
}

// ---- a remembered tab that still exists beats the fallback
{
  page(['a', 'b', 'c']); store = {'ui-base:tab': 'c'};
  initShell({fallback: 'a'});
  assert.deepEqual(active(), ['c']);
}

// ---- a remembered tab whose button was deleted falls through to the fallback
{
  page(['a', 'b']); store = {'ui-base:tab': 'gone'};
  initShell({fallback: 'b'});
  assert.deepEqual(active(), ['b'], 'deleting a tab is safe for whoever was last on it');
}

// ---- no fallback and nothing remembered: the button marked .active, else the first
{
  page(['a', 'b', 'c'], 'c'); store = {};
  initShell({});
  assert.deepEqual(active(), ['c']);
  page(['a', 'b']); store = {};
  initShell({});
  assert.deepEqual(active(), ['a']);
}

// ---- arrows wrap both ways and move focus with the activation; enter/space activate the focused one
{
  page(['a', 'b', 'c']); store = {};
  initShell({fallback: 'a'});
  const key = (tab, k) => tab.onkeydown({key: k, preventDefault() {}});
  key(tabs[2], 'ArrowRight');
  assert.deepEqual(active(), ['a'], 'right from the last wraps to the first');
  assert.ok(tabs[0].focused);
  key(tabs[0], 'ArrowLeft');
  assert.deepEqual(active(), ['c'], 'left from the first wraps to the last');
  key(tabs[1], ' ');
  assert.deepEqual(active(), ['b']);
  tabs[2].onclick();
  assert.deepEqual(active(), ['c'], 'a click activates');
  activateTab('a');
  assert.deepEqual(shown(), ['a'], 'activateTab is the same path a click takes');
}

// ---- a private window with no storage does not break the shell
{
  page(['a', 'b']);
  globalThis.localStorage = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
  initShell({fallback: 'b'});
  assert.deepEqual(active(), ['b']);
}

console.log('ok');
