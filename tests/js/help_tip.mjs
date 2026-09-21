// exercises helpTip against a dom stub: the tip is a separate element on <body> (never the ?
// itself, which is the bug that left a fixed ? floating over the demo), hover peeks, click pins,
// a click elsewhere or a scroll lets go, and only one tip is pinned at a time.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element} from './_dom.mjs';

const {document, window} = installDom();
const body = document.body;
const fire = (target, type) => target.fire(type);

const src = readFileSync(new URL('../../ui_base/assets/help.js', import.meta.url), 'utf8');
const helpTip = new Function(`${src}; return helpTip;`)();

const button = element('div', {className: 'toggle help', rect: {left: 40, top: 100, bottom: 130, right: 70}});
const tip = helpTip(button, ['first line', 'second line']);

// ---- the tip is its own element on <body>, hidden, and the ? is left alone
assert.notEqual(tip, button, 'the tip must never be the trigger');
assert.ok(body.children.includes(tip), 'the tip appends itself to <body>');
assert.ok(tip.classList.contains('help-tip'));
assert.ok(!button.classList.contains('help-tip'), 'the trigger must not carry the fixed tip class');
assert.equal(tip.hidden, true);
assert.deepEqual(tip.children.map(c => c.textContent), ['first line', 'second line']);

// ---- hover peeks, placed under the ?, and leaving hides it
button.fire('mouseenter');
assert.equal(tip.hidden, false);
assert.equal(tip.style.top, '136px');
assert.equal(tip.style.left, '40px');
button.fire('mouseleave');
assert.equal(tip.hidden, true);

// ---- click pins, and a pinned tip survives the pointer leaving
button.fire('click');
assert.ok(tip.classList.contains('pinned') && button.classList.contains('on'));
button.fire('mouseleave');
assert.equal(tip.hidden, false, 'a pinned tip stays while you read it');

// ---- a click elsewhere lets go
fire(document, 'click');
assert.equal(tip.hidden, true);
assert.ok(!tip.classList.contains('pinned') && !button.classList.contains('on'));

// ---- so does a scroll: a fixed tip must not float away from its ?
button.fire('click');
fire(window, 'scroll');
assert.equal(tip.hidden, true, 'scrolling unpins');

// ---- and escape, the same key that shuts a menu
button.fire('click');
assert.equal(tip.hidden, false);
document.fire('keydown', {key: 'Escape'});
assert.equal(tip.hidden, true, 'escape unpins');
document.fire('keydown', {key: 'a'});

// ---- pinning a second tip releases the first
const other = element('div');
const otherTip = helpTip(other, ['other']);
button.fire('click');
other.fire('click');
assert.equal(tip.hidden, true, 'only one tip is pinned at a time');
assert.equal(otherTip.hidden, false);

// ---- clamped to the window at the right-hand edge
const edge = element('div');
edge.getBoundingClientRect = () => ({left: 1150, top: 0, bottom: 30, right: 1180});
const edgeTip = helpTip(edge, ['edge']);
edge.fire('mouseenter');
assert.equal(edgeTip.style.left, `${1200 - 200 - 8}px`);

console.log('ok');
