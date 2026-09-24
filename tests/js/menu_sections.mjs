// exercises Menu's section building against a DOM stub, because the two things worth testing here
// are pure structure: does a column carry its own heading, and does an item's state reach the row
// as classes. a full jsdom would test the browser as much as the code.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element} from './_dom.mjs';

const {document} = installDom();

// the path is an argument so the suite can prove these tests FAIL against an older menu.js -
// a guard that cannot fail is not a guard
const target = process.argv[2] || new URL('../../ui_base/assets/menu.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const Menu = new Function(`${src}; return Menu;`)();
const renderTree = globalThis.window.renderTree;

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
const names = walk(live.el).filter(n => n.className === 'name').map(n => n.textContent);
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

// ---- onDismiss fires once per dismissal: a second close() on a shut menu is a no-op
{
  let dismissed = 0;
  const once = new Menu({sections: [{kind: 'list', items: []}], onDismiss: () => dismissed++});
  once.close();
  assert.equal(dismissed, 0, 'closing a menu that never opened dismisses nothing');
  once.openAt({x: 0, y: 0});
  once.close();
  once.close();
  assert.equal(dismissed, 1, 'one dismissal, one onDismiss, however many times close() is called');
}

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

// ---- a class added after opening survives refresh, which swaps in a freshly built panel
const placed = new Menu({title: 'placed', sections: [{kind: 'list', items: []}]});
placed.openAt({x: 10, y: 10});
placed.el.classList.add('menu-centered');
placed.refresh([{kind: 'list', items: [{id: 'a', label: 'a'}]}]);
assert.ok(placed.el.classList.contains('menu-centered'), 'a refresh dropped a caller-added class');
placed.close();

// ---- an anchored menu opens below its trigger while the panel fits there
const belowPanel = element('div');
belowPanel.getBoundingClientRect = () => ({width: 180, height: 120});
const belowTrigger = element('div');
belowTrigger.getBoundingClientRect = () => ({left: 200, top: 100, bottom: 130, right: 260});
const belowMenu = new Menu({adopt: belowPanel});
belowMenu.openAt(belowTrigger);
assert.equal(belowMenu.el.style.top, '136px', 'a menu with room below should drop down');
assert.equal(belowMenu.el.style.left, '200px');
belowMenu.close();

// ---- a low trigger opens the panel above when below would clip and above has more room
const abovePanel = element('div');
abovePanel.getBoundingClientRect = () => ({width: 180, height: 160});
const aboveTrigger = element('div');
aboveTrigger.getBoundingClientRect = () => ({left: 200, top: 700, bottom: 730, right: 260});
const aboveMenu = new Menu({adopt: abovePanel});
aboveMenu.openAt(aboveTrigger);
assert.equal(aboveMenu.el.style.top, '534px', 'a menu near the bottom should drop up');
aboveMenu.close();

// ---- a panel larger than its available side still stays within the top and right edges
const edgePanel = element('div');
edgePanel.getBoundingClientRect = () => ({width: 200, height: 900});
const edgeTrigger = element('div');
edgeTrigger.getBoundingClientRect = () => ({left: 1190, top: 760, bottom: 790, right: 1200});
const edgeMenu = new Menu({adopt: edgePanel});
edgeMenu.openAt(edgeTrigger);
assert.equal(edgeMenu.el.style.top, '4px', 'a tall drop-up should clamp to the viewport top');
assert.equal(edgeMenu.el.style.left, '996px', 'an edge menu should clamp inside the viewport right');
edgeMenu.close();

// ---- label and stats are text, never markup: an agent's bash command can land in either
const payload = '<img src=x onerror=globalThis.pwned=1>';
const hostile = menu._section({kind: 'list', items: [{id: 'h', label: payload, stats: payload}]});
const hostileNodes = walk(hostile);
assert.ok(!hostileNodes.some(n => n.innerHTML.includes('<img')), 'a label must not become markup');
assert.equal(hostileNodes.find(n => n.className === 'name').textContent, payload);
assert.equal(hostileNodes.find(n => n.className === 'stats').textContent, payload);

// ---- and the same holds for a tree row's label and badges
const tree = element('div');
renderTree(tree, [{id: 't', label: payload, badges: [payload]}]);
const treeNodes = walk(tree);
assert.ok(!treeNodes.some(n => n.innerHTML.includes('<img')), 'a tree row must not become markup');
assert.equal(treeNodes.find(n => n.className === 'name').textContent, payload);
assert.equal(treeNodes.find(n => n.className === 'coords').textContent, payload);



// ---- open-and-close in one tick leaves no document listener behind. registration is deferred a
// tick so the opening click cannot dismiss the menu; the deferred half used to run unconditionally,
// so a menu shut before it fired left 2 listeners on document that nothing ever removed - and the
// next menu's first mousedown hit the stale handler. measured: 2 leaked per same-tick pair before,
// 0 after; an ordinary open, wait, close pair was 0 both before and after
{
  const live = new Map();
  const counting = {
    addEventListener: (type, fn) => live.set(fn, type),
    removeEventListener: (type, fn) => live.delete(fn),
  };
  const {addEventListener, removeEventListener} = globalThis.document;
  Object.assign(globalThis.document, counting);
  const sameTick = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
  sameTick.openAt({x: 0, y: 0});
  sameTick.close();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(live.size, 0, `a same-tick open/close must leave nothing on document, left ${live.size}`);
  const ordinary = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
  ordinary.openAt({x: 0, y: 0});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(live.size, 2, 'an open menu listens for mousedown and keydown');
  ordinary.close();
  assert.equal(live.size, 0, 'and close drops both');
  Object.assign(globalThis.document, {addEventListener, removeEventListener});
}

// ---- space activates a focused row like enter does, and leaves a focused field alone. enter only
// meant stepping into a dir picker's folder needed enter while every button answered to space
{
  const keyed = new Menu({});
  keyed.el = element('div');
  const row = keyed.el.appendChild(element('div'));
  row.classList.add('menu-item');
  let clicks = 0;
  row.click = () => { clicks += 1; };
  const field = keyed.el.appendChild(element('input'));
  const press = key => {
    let prevented = false;
    keyed._onKey({key, preventDefault() { prevented = true; }});
    return prevented;
  };
  globalThis.document.activeElement = row;
  assert.ok(press(' '), 'space on a focused row is consumed, so the panel does not scroll');
  assert.ok(press('Enter'), 'enter still activates');
  assert.equal(clicks, 2, `space and enter should each click the row, clicked ${clicks}`);
  globalThis.document.activeElement = field;
  assert.ok(!press(' '), 'space in a focused field must reach the field');
  assert.equal(clicks, 2, 'and must not click anything');
  globalThis.document.activeElement = null;
}
console.log('ok');
