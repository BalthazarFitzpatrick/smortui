// exercises helpTip against a dom stub: the tip is a separate element on <body> (never the ?
// itself, which is the bug that left a fixed ? floating over the demo), hover peeks, click pins,
// a click elsewhere or a scroll lets go, and only one tip is pinned at a time.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

function element(tag) {
  const listeners = {};
  const classes = new Set();
  const el = {
    tag, style: {}, children: [], hidden: false, textContent: '', offsetWidth: 200,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    _fire(type, evt = {}) { (listeners[type] || []).forEach(fn => fn({stopPropagation() {}, ...evt})); },
    appendChild(child) { el.children.push(child); return child; },
    getBoundingClientRect: () => ({left: 40, top: 100, bottom: 130, right: 70}),
    classList: {
      add: n => classes.add(n), remove: n => classes.delete(n), contains: n => classes.has(n),
    },
  };
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: v => { classes.clear(); v.split(' ').filter(Boolean).forEach(n => classes.add(n)); },
  });
  return el;
}

const docListeners = {};
const winListeners = {};
const body = element('body');
globalThis.document = {
  createElement: element, body,
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
};
globalThis.window = {
  innerWidth: 1200,
  addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
};
const fire = (listeners, type) => (listeners[type] || []).forEach(fn => fn({}));

const src = readFileSync(new URL('../../ui_base/assets/help.js', import.meta.url), 'utf8');
const helpTip = new Function(`${src}; return helpTip;`)();

const button = element('div');
button.className = 'toggle help';
const tip = helpTip(button, ['first line', 'second line']);

// ---- the tip is its own element on <body>, hidden, and the ? is left alone
assert.notEqual(tip, button, 'the tip must never be the trigger');
assert.ok(body.children.includes(tip), 'the tip appends itself to <body>');
assert.ok(tip.classList.contains('help-tip'));
assert.ok(!button.classList.contains('help-tip'), 'the trigger must not carry the fixed tip class');
assert.equal(tip.hidden, true);
assert.deepEqual(tip.children.map(c => c.textContent), ['first line', 'second line']);

// ---- hover peeks, placed under the ?, and leaving hides it
button._fire('mouseenter');
assert.equal(tip.hidden, false);
assert.equal(tip.style.top, '136px');
assert.equal(tip.style.left, '40px');
button._fire('mouseleave');
assert.equal(tip.hidden, true);

// ---- click pins, and a pinned tip survives the pointer leaving
button._fire('click');
assert.ok(tip.classList.contains('pinned') && button.classList.contains('on'));
button._fire('mouseleave');
assert.equal(tip.hidden, false, 'a pinned tip stays while you read it');

// ---- a click elsewhere lets go
fire(docListeners, 'click');
assert.equal(tip.hidden, true);
assert.ok(!tip.classList.contains('pinned') && !button.classList.contains('on'));

// ---- so does a scroll: a fixed tip must not float away from its ?
button._fire('click');
fire(winListeners, 'scroll');
assert.equal(tip.hidden, true, 'scrolling unpins');

// ---- pinning a second tip releases the first
const other = element('div');
const otherTip = helpTip(other, ['other']);
button._fire('click');
other._fire('click');
assert.equal(tip.hidden, true, 'only one tip is pinned at a time');
assert.equal(otherTip.hidden, false);

// ---- clamped to the window at the right-hand edge
const edge = element('div');
edge.getBoundingClientRect = () => ({left: 1150, top: 0, bottom: 30, right: 1180});
const edgeTip = helpTip(edge, ['edge']);
edge._fire('mouseenter');
assert.equal(edgeTip.style.left, `${1200 - 200 - 8}px`);

console.log('ok');
