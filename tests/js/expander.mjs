// exercises makeExpander's open/close lifecycle against a dom stub in the same style as
// menu_sections.mjs - what's worth testing here is the dismissal guarantees (backdrop click,
// escape, no double-fire), not the animation's own numbers
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element} from './_dom.mjs';

const {document} = installDom();
const docListeners = document._listeners;
// run the raf callback synchronously - determinism matters more than realism in this stub
globalThis.requestAnimationFrame = fn => fn();

const strip = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});

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
docListeners.keydown[0]({key: 'Escape', preventDefault() {}});
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
assert.equal(openBackdrop.removed, false, 'the backdrop is not removed synchronously - it collapses first');

// ---- a new open() while the old backdrop is still collapsing must not be blocked by it
strip._listeners.click[0]();
assert.equal(document.body.children[document.body.children.length - 1].removed, false, 'a fresh expander opened normally');

// ---- the dying backdrop is removed after the fallback timeout (no transitionend in this stub)
await new Promise(resolve => setTimeout(resolve, 280));
assert.ok(openBackdrop.removed, 'the closing backdrop is removed once the fallback timer fires');

// ---- destroy is not a close: the open panel goes at once, no onClose, no focus moved
let destroyedCloses = 0;
const strip3 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
const expander3 = makeExpander(strip3, {onClose: () => destroyedCloses++});
// relative, because an earlier case above leaves an expander open on purpose
const keydownsBefore = (docListeners.keydown || []).length;
strip3._listeners.click[0]();
assert.equal(docListeners.keydown.length, keydownsBefore + 1, 'open listens for escape on document');
const openBackdrop3 = document.body.children[document.body.children.length - 1];
expander3.destroy();
assert.equal(destroyedCloses, 0, 'teardown fires no onClose');
assert.ok(openBackdrop3.removed, 'the backdrop is removed at once');
assert.equal(strip3.focused, false, 'focus is not moved to the strip');
assert.equal(strip3._listeners.click.length, 0, 'the strip click is gone');
assert.equal(docListeners.keydown.length, keydownsBefore, 'and so is its document keydown');

// ---- escape on an open expander is preventDefault-ed, the signal a pinned help tip yields to
const strip4 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
makeExpander(strip4);
strip4._listeners.click[0]();
let prevented = false;
docListeners.keydown[0]({key: 'Escape', preventDefault() { prevented = true; }});
assert.equal(prevented, true, 'an expander that closes on escape says so');

// ---- fit: the open panel hugs its content - same width, eased height and top, re-centred on the
// box it opened at, never past it. the stub viewport is 1200x800, so the default 1:3 box is 720 tall
// at top 40; a computed style gives the panel 14px padding and a 2px border, 32px top and bottom
const chrome = {paddingTop: '14px', paddingBottom: '14px', borderTopWidth: '2px', borderBottomWidth: '2px'};
let boxSizing = 'border-box';
globalThis.getComputedStyle = el => (el.className.includes('expand-panel')
  ? {...chrome, boxSizing, getPropertyValue: () => ''}
  : {getPropertyValue: () => ''});

const strip5 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
const expander5 = makeExpander(strip5);
strip5._listeners.click[0]();
const panel5 = document.body.children[document.body.children.length - 1].children[0];
const openWidth = panel5.style.width;
assert.equal(panel5.style.height, '720px', 'it opens at the full box, as before');
assert.ok(panel5.style.transition.includes('height 220ms') && panel5.style.transition.includes('top 220ms'),
  'once shown, height and top ease rather than jump');

expander5.fit(200);
assert.equal(panel5.style.height, '232px', 'content height plus the panel\'s own padding and border');
assert.equal(panel5.style.top, '284px', 're-centred on the box it opened at: 40 + (720 - 232) / 2');
assert.equal(panel5.style.width, openWidth, 'the width does not move');

expander5.fit(5000);
assert.equal(panel5.style.height, '720px', 'content taller than the box is capped at it and keeps its scroll');
assert.equal(panel5.style.top, '40px', 'and sits back where it opened');

expander5.fit(200);
const heightBefore = panel5.style.height;
expander5.fit(NaN);
expander5.fit(-5);
expander5.fit();
assert.equal(panel5.style.height, heightBefore, 'a missing, negative or nan height changes nothing');

// ---- close collapses from the fitted box, not the one it opened at
expander5.close();
const fitted = {left: parseFloat(panel5.style.left), top: 284, width: parseFloat(openWidth), height: 232};
// origin center: the strip's own size, centred in the viewport - where a grow starts and a collapse ends
const centred = {left: (1200 - 300) / 2, top: (800 - 100) / 2, width: 300, height: 100};
assert.equal(panel5.style.transform,
  `translate(${centred.left - fitted.left}px, ${centred.top - fitted.top}px) ` +
  `scale(${centred.width / fitted.width}, ${centred.height / fitted.height})`,
  'the collapse transform is built from the fitted box');
assert.ok(!panel5.style.transition.includes('height'), 'a fit still easing lands at once, so the collapse math holds');
expander5.fit(100);
assert.equal(panel5.style.height, '232px', 'fit on a closed expander is a no-op');

// ---- a fit before the grow has painted retargets the start transform instead of easing after it
const frames = [];
globalThis.requestAnimationFrame = fn => frames.push(fn);
const strip6 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
const expander6 = makeExpander(strip6);
strip6._listeners.click[0]();
const panel6 = document.body.children[document.body.children.length - 1].children[0];
expander6.fit(100);
assert.equal(panel6.style.height, '132px', 'the fitted height lands before the first paint');
assert.equal(panel6.style.transition, 'none', 'with nothing to ease from yet');
const start = {left: parseFloat(panel6.style.left), top: 40 + (720 - 132) / 2, width: parseFloat(panel6.style.width), height: 132};
assert.equal(panel6.style.transform,
  `translate(${centred.left - start.left}px, ${centred.top - start.top}px) ` +
  `scale(${centred.width / start.width}, ${centred.height / start.height})`,
  'the grow starts from the strip and lands straight on the fitted box');
while (frames.length) frames.shift()();
assert.equal(panel6.style.transform, 'none', 'the grow still runs');
assert.ok(panel6.style.transition.includes('height 220ms'), 'and later fits ease again');
expander6.destroy();
globalThis.requestAnimationFrame = fn => fn();

// ---- content-box: height is already the content's, so nothing is added around it
boxSizing = 'content-box';
const strip7 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
const expander7 = makeExpander(strip7);
strip7._listeners.click[0]();
const panel7 = document.body.children[document.body.children.length - 1].children[0];
expander7.fit(200);
assert.equal(panel7.style.height, '200px', 'content-box sizing adds no padding or border');
expander7.destroy();

// ---- reduced motion: the fit lands at once
boxSizing = 'border-box';
globalThis.matchMedia = () => ({matches: true});
const strip8 = element('div', {rect: {left: 10, top: 10, width: 300, height: 100}});
const expander8 = makeExpander(strip8);
strip8._listeners.click[0]();
const panel8 = document.body.children[document.body.children.length - 1].children[0];
expander8.fit(200);
assert.equal(panel8.style.transition, 'none', 'reduced motion eases nothing');
assert.equal(panel8.style.height, '232px', 'but still fits');
expander8.destroy();
delete globalThis.matchMedia;
delete globalThis.getComputedStyle;

console.log('ok');
