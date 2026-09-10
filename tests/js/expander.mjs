// exercises makeExpander's open/close lifecycle against a dom stub in the same style as
// menu_sections.mjs - what's worth testing here is the dismissal guarantees (backdrop click,
// escape, no double-fire), not the animation's own numbers
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

class Element {}
globalThis.Element = Element;

function element(tag) {
  const el = Object.assign(new Element(), {
    tag, className: '', style: {}, children: [], parentNode: null,
    addEventListener(type, fn) { (el._listeners ||= {})[type] = (el._listeners[type] || []); el._listeners[type].push(fn); },
    removeEventListener() {},
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    remove() { el.removed = true; },
    getBoundingClientRect: () => ({left: 10, top: 10, width: 300, height: 100}),
    classList: {
      _list: () => el.className.split(' ').filter(Boolean),
      contains: name => el.className.split(' ').includes(name),
    },
  });
  return el;
}

const docListeners = {};
globalThis.document = {
  createElement: element,
  body: element('body'),
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) {
    docListeners[type] = (docListeners[type] || []).filter(f => f !== fn);
  },
};
globalThis.window = {innerWidth: 1200, innerHeight: 800};
// run the raf callback synchronously - determinism matters more than realism in this stub
globalThis.requestAnimationFrame = fn => fn();

const strip = element('div');

const target = process.argv[2] || new URL('../../ui_base/assets/expand.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const makeExpander = new Function(`${src}; return makeExpander;`)();

let opens = 0, closes = 0;
const expander = makeExpander(strip, {onOpen: () => opens++, onClose: () => closes++});

// ---- opening builds a backdrop + panel and appends it to body
strip._listeners.click[0]();
assert.equal(opens, 1, 'opening should fire onOpen once');
assert.equal(document.body.children.length, 1, 'the backdrop should be appended to body');
const backdrop = document.body.children[0];
assert.ok(backdrop.classList.contains('modal-backdrop'), 'reuses the existing backdrop convention');

// ---- a click on the backdrop itself closes it
backdrop._listeners.mousedown[0]({target: backdrop});
assert.equal(closes, 1, 'a backdrop click should close once');

// ---- escape closes, and neither fires twice for one dismissal
strip._listeners.click[0]();
assert.equal(opens, 2);
docListeners.keydown[0]({key: 'Escape'});
assert.equal(closes, 2, 'escape should close');
expander.close();
assert.equal(closes, 2, 'closing an already-closed expander must not fire onClose again');

// ---- a click on the panel itself (not the backdrop) must not close it
strip._listeners.click[0]();
const panel2 = document.body.children[document.body.children.length - 1].children[0];
document.body.children[document.body.children.length - 1]._listeners.mousedown[0]({target: panel2});
assert.equal(closes, 2, 'a click that lands on the panel, not the backdrop, must not dismiss it');

// ---- the stub has no getComputedStyle: motion must fall back cleanly, at the 220ms default
assert.ok(panel2.style.transition.includes('220ms'), 'missing getComputedStyle should fall back to 220ms');

// ---- open sets FINAL geometry synchronously (a transform does the visual growing, not width/height,
// so text lays out once rather than reflowing every animation frame)
assert.ok(Math.abs(parseFloat(panel2.style.width) - 800 / 3) < 0.01, 'panel width is set to its final size immediately on open');
// this stub runs requestAnimationFrame synchronously, so by the time open() returns the two rAFs
// have already landed the panel at its rest transform - real browsers paint the scaled start first

// ---- close marks expand-closing and calls onClose synchronously, before the collapse animation lands
let closes2 = 0;
const expander2 = makeExpander(strip, {onOpen: () => {}, onClose: () => { closes2++; }});
strip._listeners.click[strip._listeners.click.length - 1]();
const openBackdrop = document.body.children[document.body.children.length - 1];
expander2.close();
assert.equal(closes2, 1, 'onClose fires synchronously inside close()');
assert.ok(openBackdrop.className.includes('expand-closing'), 'expand-closing is added synchronously on close');
assert.equal(openBackdrop.style.pointerEvents, 'none', 'a closing backdrop stops taking clicks immediately');
assert.equal(openBackdrop.removed, undefined, 'the backdrop is not removed synchronously - it collapses first');

// ---- a new open() while the old backdrop is still collapsing must not be blocked by it
strip._listeners.click[0]();
assert.equal(document.body.children[document.body.children.length - 1].removed, undefined, 'a fresh expander opened normally');

// ---- the dying backdrop is removed after the fallback timeout (no transitionend in this stub)
await new Promise(resolve => setTimeout(resolve, 280));
assert.ok(openBackdrop.removed, 'the closing backdrop is removed once the fallback timer fires');

console.log('ok');
