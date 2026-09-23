// exercises makeAligner's geometry against a dom stub: the rect is clamped to the crop, wasd nudges
// one pixel through the same clamp, resize keeps the centre, the image moves and the guide does not,
// onChange fires per move and never on mount, and destroy drops the window listeners
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element, liveListeners} from './_dom.mjs';

const {window} = installDom();
globalThis.requestAnimationFrame = fn => { fn(); return 1; };
const img = element(), guide = element();
const viewport = element('div', {
  querySelector: sel => (sel === '.drag-image' ? img : sel === '.guide-overlay' ? guide : null),
});

const src = readFileSync(new URL('../../ui_base/assets/align.js', import.meta.url), 'utf8');
const makeAligner = new Function(`${src}; return makeAligner;`)();

const changes = [];
const rect = {left: 10, top: 10, width: 50, height: 40};
const target = {left: 30, top: 30, width: 50, height: 40};
const aligner = makeAligner({
  viewport, rect, bounds: {width: 200, height: 100}, target, scale: 2,
  onChange: r => changes.push({...r}),
});

// ---- mount paints but does not announce
assert.equal(changes.length, 0, 'onChange is not called on mount');
assert.equal(img.style.transform, 'translate(40px, 40px)', 'the image slides by (target - rect) * scale');
assert.equal(guide.style.left, '60px', 'the guide sits at the target, scaled');
assert.equal(guide.style.width, '100px');

// ---- wasd nudges one crop pixel through the clamp
aligner.nudge('d');
assert.deepEqual([rect.left, rect.top], [11, 10]);
aligner.nudge('w');
assert.deepEqual([rect.left, rect.top], [11, 9]);
assert.equal(changes.length, 2, 'one onChange per nudge');
for (let i = 0; i < 20; i++) aligner.nudge('w');
assert.equal(rect.top, 0, 'clamped at the crop edge');
for (let i = 0; i < 500; i++) aligner.nudge('d');
assert.equal(rect.left, 200 - rect.width, 'clamped so the rect stays inside the crop');
assert.equal(img.style.transform, `translate(${(target.left - rect.left) * 2}px, ${(target.top - rect.top) * 2}px)`);
assert.equal(guide.style.left, '60px', 'the guide never moves');

// ---- a drag moves the rect against the scale, from wherever it started
const down = viewport._listeners.mousedown[0];
const move = window._listeners.mousemove[0];
const up = window._listeners.mouseup[0];
rect.left = 100; rect.top = 50;
down({clientX: 0, clientY: 0});
move({clientX: 20, clientY: -10});
assert.deepEqual([rect.left, rect.top], [90, 55], 'dragging the picture right moves the rect left, by screen px / scale');
up();
move({clientX: 999, clientY: 999});
assert.deepEqual([rect.left, rect.top], [90, 55], 'no drag after mouseup');

// ---- resize keeps the centre where it was
const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
aligner.resize(30, 20, {width: 30, height: 20});
assert.deepEqual([rect.width, rect.height], [30, 20]);
assert.deepEqual([rect.left + 15, rect.top + 10], [cx, cy], 'the centre survives a resize');
assert.equal(guide.style.width, '60px', 'the guide took its new drawn size');

// ---- destroy drops the window pair and the viewport's mousedown
aligner.destroy();
assert.equal(liveListeners(window).window, 0);
assert.equal(viewport.listenerCount('mousedown'), 0);

console.log('ok');
