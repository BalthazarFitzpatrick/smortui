// exercises makeDrawer's park/open/close lifecycle against a dom stub, in the same style as
// expander.mjs - the things worth testing are geometry (parked shows only the sliver, open sits
// inside the viewport) and the dismissal guarantees (toggle, no double-fire), not the animation.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

class Element {}
globalThis.Element = Element;

function element(tag) {
  const listeners = {};
  const el = Object.assign(new Element(), {
    tag, style: {}, children: [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    _listeners: listeners,
    appendChild(child) { el.children.push(child); return child; },
    classList: {
      _set: new Set(),
      add(name) { this._set.add(name); },
      remove(name) { this._set.delete(name); },
      contains(name) { return this._set.has(name); },
    },
  });
  return el;
}

// the stub grows a body because the drawer appends itself to it - and asserting that it lands
// there is the point: the component computed correct geometry while invisible before it did
const body = element('body');
globalThis.document = {createElement: element, body};
globalThis.window = {innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {}};

const target = process.argv[2] || new URL('../../ui_base/assets/drawer.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const makeDrawer = new Function(`${src}; return makeDrawer;`)();

const vw = window.innerWidth;

const planted = makeDrawer({edge: 'right'});
assert.ok(body.children.includes(planted.el), 'a drawer must append itself to document.body');

// ---- edge is required
assert.throws(() => makeDrawer({}), /edge/);

// ---- a right-edge drawer parks with only its own left sliver on screen
let opens = 0, closes = 0;
const right = makeDrawer({edge: 'right', onOpen: () => opens++, onClose: () => closes++});
const width = parseFloat(right.el.style.width);
const parkedLeft = parseFloat(right.el.style.left);
assert.ok(parkedLeft > vw - width, 'parked right-edge drawer should sit mostly off the right edge');
assert.ok(parkedLeft < vw, 'a sliver should remain visible on screen');
assert.ok(!right.isOpen());

// ---- open() moves it inside the viewport, centred in its own half
right.open();
assert.equal(opens, 1, 'open should fire onOpen once');
assert.ok(right.isOpen());
const openLeft = parseFloat(right.el.style.left);
assert.ok(openLeft >= vw / 2, 'a right-edge drawer opens within the right half');
assert.ok(openLeft + width <= vw, 'an open drawer must sit fully inside the viewport');

// ---- opening again is a no-op
right.open();
assert.equal(opens, 1, 'opening an already-open drawer must not fire onOpen again');

// ---- close() returns it to the parked position
right.close();
assert.equal(closes, 1, 'close should fire onClose once');
assert.ok(!right.isOpen());
assert.equal(parseFloat(right.el.style.left), parkedLeft, 'closing should return to the parked spot');

// ---- closing again is a no-op
right.close();
assert.equal(closes, 1, 'closing an already-closed drawer must not fire onClose again');

// ---- toggle alternates
right.toggle();
assert.equal(opens, 2);
assert.ok(right.isOpen());
right.toggle();
assert.equal(closes, 2);
assert.ok(!right.isOpen());

// ---- clicking the parked drawer opens it; clicking the body while open does not close it;
// clicking the border (the element itself) while open does
right.el._listeners.click[0]({target: right.el});
assert.equal(opens, 3, 'a click while parked should open it');
right.el._listeners.click[0]({target: right.body});
assert.equal(closes, 2, 'a click on the body while open must not close it');
right.el._listeners.click[0]({target: right.el});
assert.equal(closes, 3, 'a click on the border while open should close it');

// ---- a left-edge drawer parks with only its own right sliver on screen, and opens in the left half
const left = makeDrawer({edge: 'left'});
const leftWidth = parseFloat(left.el.style.width);
const leftParked = parseFloat(left.el.style.left);
assert.ok(leftParked < 0, 'parked left-edge drawer should sit mostly off the left edge');
assert.ok(leftParked + leftWidth > 0, 'a sliver should remain visible on screen');
left.open();
const leftOpenLeft = parseFloat(left.el.style.left);
assert.ok(leftOpenLeft >= 0 && leftOpenLeft + leftWidth <= vw / 2, 'a left-edge drawer opens within the left half');

console.log('ok');
