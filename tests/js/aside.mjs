// proves makeAside against the dom stub: show/hide state, textContent-only rendering, aria, the
// listeners it holds only while shown, and placeAside's pure geometry (side choice, centring,
// clamping). the slide itself is css and is proved in the stylesheet and demo tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {element, installDom} from './_dom.mjs';

const {document, window} = installDom();

const target = process.argv[2] || new URL('../../ui_base/assets/aside.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const {makeAside, placeAside} = new Function(`${src}; return {makeAside, placeAside};`)();

const box = (left, top, width, height) => ({left, top, width, height, right: left + width, bottom: top + height});

// ---- placement: right when it fits
const viewport = {width: 1000, height: 800};
const size = {width: 280, height: 100};
const host = box(100, 100, 300, 400);
let spot = placeAside({host, anchor: box(110, 200, 280, 40), size, viewport});
assert.equal(spot.side, 'right');
assert.equal(spot.left, host.right + 12, 'gap from the host edge');
assert.equal(spot.top, 220 - 50, 'vertical centre equals the anchor centre');

// ---- left when the right has no room
const farRight = box(650, 100, 300, 400);
spot = placeAside({host: farRight, anchor: box(660, 300, 280, 40), size, viewport});
assert.equal(spot.side, 'left');
assert.equal(spot.left, 650 - 12 - 280);
assert.ok(spot.left + size.width <= farRight.left, 'never covers the host');

// ---- below when neither side fits
const wide = box(20, 100, 960, 300);
spot = placeAside({host: wide, anchor: box(30, 150, 940, 40), size, viewport});
assert.equal(spot.side, 'below');
assert.equal(spot.top, wide.bottom + 12, 'docked directly under the host');
assert.ok(spot.left >= 8 && spot.left + size.width <= viewport.width - 8, 'inside the viewport');

// ---- exact fit counts as room, one pixel less does not
const fits = box(100, 0, 500, 100);  // right edge 600 + 12 + 280 = 892 <= 992
assert.equal(placeAside({host: fits, anchor: box(0, 0, 10, 10), size, viewport}).side, 'right');
const tight = box(100, 0, 601, 100);  // 701 + 12 + 280 = 993 > 992
assert.notEqual(placeAside({host: tight, anchor: box(0, 0, 10, 10), size, viewport}).side, 'right');

// ---- vertical clamp at both ends
spot = placeAside({host, anchor: box(110, 0, 280, 20), size, viewport});
assert.equal(spot.top, 8, 'clamped to the top margin');
spot = placeAside({host, anchor: box(110, 780, 280, 20), size, viewport});
assert.equal(spot.top, 800 - 100 - 8, 'clamped to the bottom margin');
spot = placeAside({host, anchor: box(110, 400, 280, 20), size: {width: 280, height: 900}, viewport});
assert.equal(spot.top, 8, 'a box taller than the viewport starts at the margin');

// ---- the element
const hostEl = element('div');
hostEl.rect = box(100, 100, 300, 400);
const aside = makeAside({host: hostEl});
assert.ok(document.body.children.includes(aside.el), 'it appends itself to document.body');
assert.equal(aside.el.getAttribute('role'), 'note');
assert.equal(aside.el.getAttribute('aria-live'), 'polite');
assert.equal(aside.el.getAttribute('tabindex'), null, 'never focusable');
assert.equal(aside.el.style.position, 'fixed');
assert.ok(aside.el.classList.contains('aside') && aside.el.classList.contains('panel-floating'));
assert.ok(!aside.isShown());

const row = element('button');
row.rect = box(110, 200, 280, 40);
aside.el.offsetHeight = 100;
aside.el.offsetWidth = 280;
aside.show(row, {title: '<b>t</b>', lines: ['one', {strong: 'key', text: '<i>x</i>'}]});
assert.ok(aside.isShown());
assert.ok(aside.el.classList.contains('shown'));
assert.equal(aside.el.style.left, '412px');
assert.equal(aside.el.style.top, '170px');
assert.equal(aside.el.innerHTML, '', 'no innerHTML is ever written');
const title = aside.el.querySelector('.aside-title');
assert.equal(title.textContent, '<b>t</b>', 'markup in a title stays text');
const lines = aside.el.querySelectorAll('.aside-line');
assert.equal(lines.length, 2);
assert.equal(lines[0].textContent, 'one');
assert.equal(aside.el.querySelector('.aside-strong').textContent, 'key');
assert.equal(aside.el.querySelector('.aside-text').textContent, '<i>x</i>', 'pair text stays text');

// ---- a second show replaces the content and moves the box
const row2 = element('button');
row2.rect = box(110, 300, 280, 40);
aside.show(row2, {title: 'next', lines: []});
assert.equal(aside.el.querySelectorAll('.aside-title').length, 1, 'one body at a time');
assert.equal(aside.el.querySelector('.aside-title').textContent, 'next');
assert.equal(aside.el.style.top, '270px');

// ---- listeners exist only while shown
assert.equal(window.listenerCount('resize'), 1);
assert.equal(document.listenerCount('scroll'), 1);
aside.hide();
assert.ok(!aside.isShown());
assert.ok(!aside.el.classList.contains('shown'));
assert.equal(window.listenerCount('resize'), 0);
assert.equal(document.listenerCount('scroll'), 0);
aside.hide();  // a second hide is a no-op

// ---- a scroll re-places it (no rAF in the stub, so it runs at once)
aside.show(row, {title: 't', lines: []});
row.rect = box(110, 400, 280, 40);
document.fire('scroll');
assert.equal(aside.el.style.top, '370px', 'follows the anchor after a scroll');
assert.ok(!aside.el.classList.contains('snap'), 'the snap class does not stay');

// ---- an anchor removed from the document hides it
row.remove();
window.fire('resize');
assert.ok(!aside.isShown(), 'a removed anchor hides the aside');

// ---- show with no anchor hides; destroy removes
aside.show(row2, {title: 't', lines: []});
aside.show(null, {title: 't', lines: []});
assert.ok(!aside.isShown());
aside.show(row2, {title: 't', lines: []});
aside.destroy();
assert.ok(aside.el.removed);
assert.equal(window.listenerCount('resize'), 0);

console.log('aside ok');
