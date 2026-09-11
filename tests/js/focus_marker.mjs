// exercises indicateFocus against a dom stub with fake timers: only the element focused LAST may
// move the marker. before this, every call left a 400ms timer and a transitionend listener on its
// own target, so a fast run of arrow presses through a fan dragged the marker back to cards focus
// had already left - measured 100-200px off, 400ms after the earlier presses.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const timers = [];
const frames = [];
globalThis.setTimeout = (fn, ms) => { timers.push({fn, ms, cleared: false}); return timers.length - 1; };
globalThis.clearTimeout = id => { if (timers[id]) timers[id].cleared = true; };
globalThis.requestAnimationFrame = fn => { frames.push({fn, cancelled: false}); return frames.length - 1; };
globalThis.cancelAnimationFrame = id => { if (frames[id]) frames[id].cancelled = true; };
const runTimers = () => timers.forEach(t => { if (!t.cleared) { t.cleared = true; t.fn(); } });
const runFrames = () => frames.forEach(f => { if (!f.cancelled) { f.cancelled = true; f.fn(); } });

const docListeners = {};
function element(tag) {
  const listeners = {};
  return {
    tag, style: {}, className: '', children: [], rect: {left: 0, top: 0, width: 100, height: 30},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    fire(type) { (listeners[type] || []).slice().forEach(fn => fn({})); },
    listenerCount: type => (listeners[type] || []).length,
    appendChild(child) { this.children.push(child); return child; },
    getBoundingClientRect() { return {...this.rect}; },
  };
}
globalThis.document = {
  createElement: element, body: element('body'),
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
};
globalThis.getComputedStyle = () => ({transform: 'none'});

const src = readFileSync(new URL('../../ui_base/assets/indicate.js', import.meta.url), 'utf8');
const indicateFocus = new Function(`${src}; return indicateFocus;`)();
const marker = () => document.body.children.find(c => c.className === 'focus-marker');

const a = element('div'); a.rect = {left: 10, top: 100, width: 200, height: 40};
const b = element('div'); b.rect = {left: 10, top: 150, width: 200, height: 40};
const c = element('div'); c.rect = {left: 10, top: 200, width: 200, height: 40};

// ---- a fast run a -> b -> c: the marker ends on c, and nothing left behind by a or b moves it
indicateFocus(a);
indicateFocus(b);
indicateFocus(c);
assert.equal(marker().style.top, '200px', 'the marker is on the last target');
a.rect.top = 400; b.rect.top = 450; // the cards focus left slide away, as a fan's do
// a and b's leftovers come due BEFORE c's own - the window in which the marker used to jump
a.fire('transitionend');
assert.equal(marker().style.top, '200px', "an earlier target's transitionend never moves the marker");
b.fire('transitionend');
assert.equal(marker().style.top, '200px');
[0, 1].forEach(i => { if (timers[i] && !timers[i].cleared) { timers[i].cleared = true; timers[i].fn(); } });
assert.equal(marker().style.top, '200px', "an earlier target's 400ms timer never moves the marker back");
runTimers(); runFrames();
assert.equal(marker().style.top, '200px', 'and once everything has run it is still on c');
assert.equal(a.listenerCount('transitionend'), 0, 'a new focus drops the previous listener');
assert.equal(b.listenerCount('transitionend'), 0);

// ---- the current target still gets followed to where it comes to rest
indicateFocus(a);
a.rect.top = 120;
runFrames();
assert.equal(marker().style.top, '120px', 'the next frame re-measures the current target');
a.rect.top = 130;
a.fire('transitionend');
assert.equal(marker().style.top, '130px', 'and its own transitionend places it where it ends');
assert.equal(a.listenerCount('transitionend'), 0, 'which also drops the listener');

// ---- a list scrolling under the fixed marker takes it along
a.rect.top = 60;
(docListeners.scroll || []).forEach(fn => fn({}));
assert.equal(marker().style.top, '60px', 'a scroll re-places the marker on the current target');

console.log('ok');
