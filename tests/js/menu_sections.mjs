// exercises Menu's section building against a DOM stub, because the two things worth testing here
// are pure structure: does a column carry its own heading, and does an item's state reach the row
// as classes. a full jsdom would test the browser as much as the code.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// openAt asks `where instanceof Element` to tell a trigger from an {x, y} point, so the stub's
// nodes have to be instances of something by that name
class Element {}
globalThis.Element = Element;

function element(tag) {
  const el = Object.assign(new globalThis.Element(), {
    tag, className: '', textContent: '', innerHTML: '', title: '',
    dataset: {}, children: [], onclick: null, style: {}, tabIndex: 0,
    replaceWith() {},
    focus() {}, remove() {}, setAttribute() {}, removeAttribute() {},
    // real containment, so a click inside the panel is told from one outside it
    contains(n) { return n === el || (el.children || []).some(c => c.contains && c.contains(n)); },
    insertAdjacentHTML() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0}),
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { kids.forEach(k => this.children.push(k)); },
    classList: {
      _of: () => el.className.split(' ').filter(Boolean),
      contains: name => el.className.split(' ').includes(name),
      toggle(name) {
        const has = el.className.split(' ').includes(name);
        el.className = has
          ? el.className.split(' ').filter(c => c && c !== name).join(' ')
          : `${el.className} ${name}`.trim();
        return !has;
      },
      add(name) { if (!this.contains(name)) el.className = `${el.className} ${name}`.trim(); },
      remove(name) { el.className = el.className.split(' ').filter(c => c && c !== name).join(' '); },
    },
  });
  return el;
}

const docBody = element('body');
globalThis.document = {
  createElement: element, addEventListener() {}, removeEventListener() {},
  body: docBody, activeElement: null,
};
globalThis.window = {addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

// the path is an argument so the suite can prove these tests FAIL against an older menu.js -
// a guard that cannot fail is not a guard
const target = process.argv[2] || new URL('../../ui_base/assets/menu.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const Menu = new Function(`${src}; return Menu;`)();

const walk = (node, out = []) => {
  out.push(node);
  (node.children || []).forEach(c => walk(c, out));
  return out;
};
const menu = new Menu({});

// ---- a column names itself
const withLabels = menu._section({
  kind: 'columns',
  columns: [
    {label: 'available', items: [{id: 'a', label: 'a'}]},
    {label: 'open', items: [{id: 'b', label: 'b'}]},
  ],
});
const headings = walk(withLabels).filter(n => n.className === 'field-label').map(n => n.textContent);
assert.deepEqual(headings, ['available', 'open'], 'each column should carry its own heading');

// ---- an empty column says so rather than being blank
const empty = menu._section({
  kind: 'columns',
  columns: [
    {label: 'available', items: [{id: 'a', label: 'a'}]},
    {label: 'open', items: [], empty: 'no dataset opened'},
  ],
});
const nones = walk(empty).filter(n => n.className === 'none').map(n => n.textContent);
assert.deepEqual(nones, ['no dataset opened'], 'an empty column should show its helper text');

// ---- a column with items shows no helper text
const filled = menu._section({
  kind: 'columns',
  columns: [{label: 'open', items: [{id: 'a', label: 'a'}], empty: 'no dataset opened'}],
});
assert.equal(walk(filled).filter(n => n.className === 'none').length, 0);

// ---- item.state becomes classes, the same convention renderTree uses
const stated = menu._section({
  kind: 'list',
  items: [{id: 'x', label: 'x', state: {done: true, current: false, failed: true}}],
});
const row = walk(stated).find(n => n.className.includes('menu-item'));
assert.ok(row.classList.contains('done'), 'a truthy state flag should become a class');
assert.ok(row.classList.contains('failed'));
assert.ok(!row.classList.contains('current'), 'a falsy state flag should not');

// ---- state coexists with on/disabled rather than replacing them
const both = menu._section({
  kind: 'list',
  items: [{id: 'y', label: 'y', on: true, state: {current: true}}],
});
const onRow = walk(both).find(n => n.className.includes('menu-item'));
assert.ok(onRow.classList.contains('on') && onRow.classList.contains('current'));

// ---- columns still get independent handlers, which is what they were already for
let leftPicked = null, rightPicked = null;
const handlers = menu._section({
  kind: 'columns',
  columns: [
    {label: 'l', items: [{id: 'l1', label: 'l1'}], multi: false, onPick: i => { leftPicked = i.id; }},
    {label: 'r', items: [{id: 'r1', label: 'r1'}], onPick: i => { rightPicked = i.id; }},
  ],
});
const rows = walk(handlers).filter(n => n.className.includes('menu-item'));
rows[0].onclick();
rows[1].onclick();
assert.equal(leftPicked, 'l1');
assert.equal(rightPicked, 'r1');

// ---- refresh swaps the panel's content without moving it
const live = new Menu({title: 't', sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
live.el = live._build();
live.el.style = {left: '120px', top: '40px'};
let replacedWith = null;
live.el.replaceWith = node => { replacedWith = node; };
live.refresh([{kind: 'list', items: [{id: 'b', label: 'b'}]}]);
assert.ok(replacedWith, 'refresh should replace the panel element');
assert.equal(live.el, replacedWith, 'and adopt the rebuilt one');
assert.equal(live.el.style.left, '120px', 'a refresh must not move the panel');
assert.equal(live.el.style.top, '40px');
const names = walk(live.el).filter(n => n.className.includes('menu-item'))
  .map(n => n.innerHTML.match(/>([^<]*)</)[1]);
assert.deepEqual(names, ['b'], 'refresh should render the sections it was given');

// ---- refresh on a menu that was never opened is a no-op rather than a crash
const unopened = new Menu({sections: []});
unopened.refresh([{kind: 'list', items: []}]);

// ---- a column can be divided into sections by a heading item
const sectioned = menu._section({
  kind: 'columns',
  columns: [{label: 'recordings', items: [
    {heading: 'open'}, {id: 'a', label: 'a', on: true},
    {heading: 'everything else'}, {id: 'b', label: 'b'},
  ]}],
});
const inner = walk(sectioned).filter(n => n.className.includes('menu-heading'))
  .map(n => n.textContent);
assert.deepEqual(inner, ['open', 'everything else'], 'a heading item should divide a column');
const picks = walk(sectioned).filter(n => n.className.includes('menu-item'));
assert.equal(picks.length, 2, 'a heading is not a pickable row');
assert.ok(!picks.some(p => p.onclick === null), 'the real rows keep their handlers');

// ---- a persistent menu stays open when you pick, and grows its own way out
let closed = 0;
const worked = new Menu({
  persistent: true,
  sections: [{kind: 'list', multi: false, items: [{id: 'a', label: 'a'}], onPick: () => {}}],
});
worked.el = worked._build();
worked.close = () => { closed += 1; };
const only = walk(worked.el).filter(n => n.className.includes('menu-item'))[0];
only.onclick();
assert.equal(closed, 0, 'a persistent menu must not close when a single-select row is picked');

// the section wrapper and the row inside it both carry the class; the row is the one with rows
const buttons = walk(worked.el).filter(n => n.className === 'menu-buttons');
assert.equal(buttons.length, 1, 'it should grow a footer with a way out');
const labels = walk(buttons[0]).filter(n => n.dataset && n.dataset.id).map(n => n.dataset.id);
assert.ok(labels.includes('menu-close'), `expected a close button, got ${labels}`);

// ---- a non-persistent single-select still closes, which is the common case
let alsoClosed = 0;
const quick = new Menu({
  sections: [{kind: 'list', multi: false, items: [{id: 'a', label: 'a'}], onPick: () => {}}],
});
quick.el = quick._build();
quick.close = () => { alsoClosed += 1; };
walk(quick.el).filter(n => n.className.includes('menu-item'))[0].onclick();
assert.equal(alsoClosed, 1, 'an ordinary single-select menu still closes on pick');

// ---- the caller's own verbs survive beside the close button
const withVerb = new Menu({
  persistent: true,
  sections: [
    {kind: 'list', items: [{id: 'a', label: 'a'}]},
    {kind: 'buttons', buttons: [{id: 'open', label: 'open'}]},
  ],
});
withVerb.el = withVerb._build();
const verbRow = walk(withVerb.el).filter(n => n.className === 'menu-buttons')[0];
const ids = walk(verbRow).filter(n => n.dataset && n.dataset.id).map(n => n.dataset.id);
assert.deepEqual(ids, ['open', 'menu-close'], `close goes last, got ${ids}`);

// ---- a head toggles its own menu shut
const trigger = element('div');
trigger.contains = n => n === trigger;
const toggling = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
toggling.openAt(trigger);
assert.ok(toggling.el, 'first click opens');
toggling.openAt(trigger);
assert.equal(toggling.el, null, 'clicking the same head again must shut it, not reopen it');

// ---- and a FRESH menu on the same head toggles too, which is how every dropdown is written:
// the onclick handler builds a new Menu each time, so instance identity says nothing
const first = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
first.openAt(trigger);
assert.ok(first.el, 'a fresh menu opens on the head');
const second = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
second.openAt(trigger);
assert.equal(first.el, null, 'the panel already on that head is shut');
assert.equal(second.el, null, 'and no replacement is opened in its place');

// ---- and a mousedown inside the trigger does not close it out from under that click
const held = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
held.openAt(trigger);
const childOfHead = element('span');
trigger.contains = n => n === trigger || n === childOfHead;
held._onDocDown({target: childOfHead});
assert.ok(held.el, 'a click on the head\u2019s own child is the head\u2019s to handle');
held._onDocDown({target: element('div')});
assert.equal(held.el, null, 'a click anywhere else still closes it');

console.log('ok');
