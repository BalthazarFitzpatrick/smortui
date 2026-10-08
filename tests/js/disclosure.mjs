// exercises makeDisclosure and makeDisclosureGroup against a dom stub: the header is a button with
// aria-expanded and aria-controls, the body carries the hidden attribute while closed, the summary
// shows only while closed, the count badge reuses indicateBadge and hides at zero, items open
// independently, and a group's openIds round-trips through setOpenIds.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element} from './_dom.mjs';

installDom();
const read = name => readFileSync(new URL(`../../ui_base/assets/${name}`, import.meta.url), 'utf8');
const {makeDisclosure, makeDisclosureGroup} = new Function(
  `${read('indicate.js')}; ${read('disclosure.js')}; return {makeDisclosure, makeDisclosureGroup};`,
)();
// the same script without indicate.js, to prove the fallback badge
const standalone = new Function(`${read('disclosure.js')}; return makeDisclosure;`)();

const head = d => d.el.children[0];
const summary = d => d.el.querySelector('.disclosure-summary');
const badge = d => d.el.querySelector('.count-badge');
const content = () => element('p', {textContent: 'inside'});

// ---- structure: a real button, wired to the body, closed by default
{
  const inner = content();
  const d = makeDisclosure({title: 'a title', summary: 'a line', count: 3, body: inner});
  assert.ok(d.el.classList.contains('disclosure'));
  assert.equal(head(d).tag, 'button');
  assert.equal(head(d).type, 'button');
  assert.equal(head(d).getAttribute('aria-expanded'), 'false');
  assert.equal(head(d).getAttribute('aria-controls'), d.body.id);
  assert.ok(d.body.id, 'the body has an id to be controlled by');
  assert.ok(d.body.classList.contains('disclosure-body'));
  assert.equal(d.body.hidden, true, 'hidden while closed');
  assert.ok(d.body.children.includes(inner), 'the passed node sits in the body container');
  assert.equal(d.isOpen(), false);
  assert.equal(d.el.querySelector('.disclosure-name').textContent, 'a title');
  const chevron = d.el.querySelector('.disclosure-chevron');
  assert.equal(chevron.textContent, '>');
  assert.equal(chevron.getAttribute('aria-hidden'), 'true');
  assert.equal(summary(d).textContent, 'a line');
  assert.equal(summary(d).hidden, false, 'the summary shows while closed');
  assert.equal(badge(d).textContent, '3');
}

// ---- ids differ between items
{
  const a = makeDisclosure({title: 'a', body: content()});
  const b = makeDisclosure({title: 'b', body: content()});
  assert.notEqual(a.body.id, b.body.id);
}

// ---- open and close: aria, hidden, chevron, summary, and no onToggle for programmatic calls
{
  const toggles = [];
  const d = makeDisclosure({title: 't', summary: 'line', body: content(), onToggle: o => toggles.push(o)});
  const chevron = d.el.querySelector('.disclosure-chevron');
  d.open();
  assert.equal(d.isOpen(), true);
  assert.equal(head(d).getAttribute('aria-expanded'), 'true');
  assert.equal(d.body.hidden, false);
  assert.equal(chevron.textContent, 'v');
  assert.ok(d.el.classList.contains('open'));
  assert.equal(summary(d).hidden, true, 'the summary hides while open');
  d.close();
  assert.equal(d.isOpen(), false);
  assert.equal(head(d).getAttribute('aria-expanded'), 'false');
  assert.equal(d.body.hidden, true);
  assert.equal(chevron.textContent, '>');
  assert.ok(!d.el.classList.contains('open'));
  assert.equal(summary(d).hidden, false);
  assert.deepEqual(toggles, [], 'open() and close() are silent');
}

// ---- a header click toggles and fires onToggle
{
  const toggles = [];
  const d = makeDisclosure({title: 't', body: content(), onToggle: o => toggles.push(o)});
  head(d).fire('click');
  assert.equal(d.isOpen(), true);
  assert.equal(d.body.hidden, false);
  head(d).fire('click');
  assert.equal(d.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
  // no onToggle is fine
  const quiet = makeDisclosure({title: 't', body: content()});
  head(quiet).fire('click');
  assert.equal(quiet.isOpen(), true);
}

// ---- open at creation
{
  const d = makeDisclosure({title: 't', summary: 'line', open: true, body: content()});
  assert.equal(d.isOpen(), true);
  assert.equal(d.body.hidden, false);
  assert.equal(head(d).getAttribute('aria-expanded'), 'true');
  assert.equal(summary(d).hidden, true);
}

// ---- setSummary: an empty summary draws nothing, and it never shows while open
{
  const d = makeDisclosure({title: 't', body: content()});
  assert.equal(summary(d).hidden, true, 'no summary, nothing to show');
  d.setSummary('now there is one');
  assert.equal(summary(d).textContent, 'now there is one');
  assert.equal(summary(d).hidden, false);
  d.open();
  d.setSummary('changed while open');
  assert.equal(summary(d).hidden, true, 'still hidden while open');
  d.close();
  assert.equal(summary(d).textContent, 'changed while open');
  assert.equal(summary(d).hidden, false);
  d.setSummary('');
  assert.equal(summary(d).hidden, true);
}

// ---- setCount reuses the count badge, updates it, and removes it at zero
{
  const d = makeDisclosure({title: 't', body: content()});
  assert.equal(badge(d), null, 'no badge at zero');
  d.setCount(5);
  assert.equal(badge(d).textContent, '5');
  assert.ok(badge(d).classList.contains('count-badge'));
  d.setCount(7);
  assert.equal(d.el.querySelectorAll('.count-badge').length, 1, 'updated in place, not duplicated');
  assert.equal(badge(d).textContent, '7');
  d.setCount(0);
  assert.equal(badge(d), null);
}

// ---- without indicate.js the same badge is drawn
{
  const d = standalone({title: 't', count: 2, body: content()});
  assert.equal(badge(d).textContent, '2');
  d.setCount(4);
  assert.equal(badge(d).textContent, '4');
  d.setCount(0);
  assert.equal(badge(d), null);
}

// ---- items are independent: opening one never closes another
{
  const a = makeDisclosure({title: 'a', body: content()});
  const b = makeDisclosure({title: 'b', body: content()});
  const group = makeDisclosureGroup([{id: 'a', disclosure: a}, {id: 'b', disclosure: b}]);
  assert.ok(group.el.classList.contains('disclosure-group'));
  assert.deepEqual(group.el.children, [a.el, b.el]);
  head(a).fire('click');
  head(b).fire('click');
  assert.deepEqual([a.isOpen(), b.isOpen()], [true, true]);
  head(a).fire('click');
  assert.deepEqual([a.isOpen(), b.isOpen()], [false, true]);
}

// ---- openIds and setOpenIds round-trip, also with items made by the group
{
  const group = makeDisclosureGroup([
    {id: 'one', title: 'one', body: content()},
    {id: 'two', title: 'two', open: true, body: content()},
    {id: 'three', title: 'three', body: content()},
  ]);
  assert.deepEqual(group.openIds(), ['two']);
  group.setOpenIds(['one', 'three']);
  assert.deepEqual(group.openIds(), ['one', 'three'], 'exactly the listed ids, in item order');
  group.setOpenIds(['three', 'one']);
  assert.deepEqual(group.openIds(), ['one', 'three']);
  const saved = group.openIds();
  group.setOpenIds([]);
  assert.deepEqual(group.openIds(), []);
  group.setOpenIds(['ghost', ...saved]);
  assert.deepEqual(group.openIds(), saved, 'an unknown id is ignored and the rest restore');
}

console.log('disclosure ok');
