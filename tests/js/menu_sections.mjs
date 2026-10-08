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
  assert.equal(live.size, 3, 'an open menu listens for mousedown, keydown and a captured escape');
  ordinary.close();
  assert.equal(live.size, 0, 'and close drops all three');
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

// ---- right enters the child column without picking, left comes back to the path row. right used to
// pick a single-select row first, which made "look at the models" and "choose this lab" one key
{
  const models = {a: ['a1', 'a2'], b: ['b1', 'b2']};
  let lab = 'a';
  let menu = null;
  const picked = [];
  const build = () => [{kind: 'columns', columns: [
    {multi: false, items: ['a', 'b'].map(id => ({id, label: id, on: id === lab, path: id === lab})),
      onPick: item => { picked.push(item.id); lab = item.id; menu.refresh(build()); }},
    {multi: false, items: models[lab].map(id => ({id, label: id}))},
  ]}];
  menu = new Menu({persistent: true, sections: build()});
  menu.el = menu._build();
  // the stub parses no :not(), has no click(), and its focus never moves document.activeElement
  menu._items = () => menu.el.querySelectorAll('.menu-item')
    .map(r => Object.assign(r, {click: () => r.onclick?.()}));
  menu._focus = el => { globalThis.document.activeElement = el; };
  const row = (column, id) => menu._items().find(r => r.dataset.id === id
    && r.closest('.col').dataset.column === String(column));
  const press = key => menu._onKey({key, preventDefault() {}});

  globalThis.document.activeElement = row(0, 'b');
  press('ArrowRight');
  assert.deepEqual(picked, [], 'right must not pick an unpicked single-select row');
  assert.equal(globalThis.document.activeElement, row(1, 'a1'), 'right lands on the first row');
  press('ArrowLeft');
  assert.equal(globalThis.document.activeElement, row(0, 'a'), 'left returns to the path row');

  // a picked child row is where right lands
  globalThis.document.activeElement = row(0, 'a');
  menu.el.querySelectorAll('.menu-item').find(r => r.dataset.id === 'a2').classList.add('on');
  press('ArrowRight');
  assert.equal(globalThis.document.activeElement, row(1, 'a2'), 'right lands on the picked row');

  // enter no longer toggles: nothing is picked, and without onConfirm it does nothing
  globalThis.document.activeElement = row(0, 'b');
  press('Enter');
  assert.deepEqual(picked, [], 'enter must not toggle');
  // space does
  press(' ');
  assert.deepEqual(picked, ['b'], 'space picks the focused row');
  globalThis.document.activeElement = null;
}

// ---- enter confirms: onConfirm, then the primary footer button; the menu is not closed for it
{
  const log = [];
  const menu = new Menu({
    persistent: true,
    onConfirm: m => log.push(['confirm', m === menu]),
    sections: [
      {kind: 'columns', columns: [{multi: true, items: [{id: 'a', label: 'a'}],
        onPick: item => log.push(['pick', item.id])}]},
      {kind: 'buttons', buttons: [
        {id: 'ok', label: 'ok', primary: true, onClick: () => log.push(['ok'])},
        {id: 'other', label: 'other', onClick: () => log.push(['other'])}]},
    ],
  });
  menu.el = menu._build();
  menu._items = () => walk(menu.el).filter(n => String(n.className).includes('menu-item'));
  menu._buttons = () => walk(menu.el).filter(n => n.parentNode?.className === 'menu-buttons')
    .map(b => Object.assign(b, {click: () => b.onclick?.()}));
  globalThis.document.activeElement = menu._items()[0];
  menu._onKey({key: 'Enter', preventDefault() {}});
  assert.deepEqual(log, [['confirm', true], ['ok']], 'enter confirms, then presses the primary');
  assert.ok(menu.el, 'confirming does not close the menu');
  menu._onKey({key: ' ', preventDefault() {}});
  assert.deepEqual(log.slice(2), [['pick', 'a']], 'space toggles instead');
  globalThis.document.activeElement = null;
}

// ---- space toggles: a multi row on and off, a single row replaces its sibling and unpicks itself
{
  const log = [];
  const menu = new Menu({persistent: true, sections: [{kind: 'columns', columns: [
    {multi: true, items: [{id: 'm', label: 'm'}], onPick: (i, on) => log.push(['m', on])},
    {multi: false, items: [{id: 's', label: 's'}, {id: 't', label: 't', on: true}],
      onPick: (i, on) => log.push([i.id, on])},
  ]}]});
  menu.el = menu._build();
  const rowOf = id => walk(menu.el).find(n => n.dataset?.id === id);
  const space = id => {
    globalThis.document.activeElement = rowOf(id);
    menu._onKey({key: ' ', preventDefault() {}});
  };
  space('m');
  space('m');
  space('s');
  space('t');
  assert.deepEqual(log, [['m', true], ['m', false], ['s', true], ['t', false]],
    'multi toggles; an idle single row picks; a lit one unpicks');
  // t was lit by the data; space on it unpicks it
  const lit = new Menu({persistent: true, sections: [{kind: 'columns', columns: [
    {multi: false, items: [{id: 't', label: 't', on: true}], onPick: (i, on) => log.push([i.id, on])},
  ]}]});
  lit.el = lit._build();
  globalThis.document.activeElement = walk(lit.el).find(n => n.dataset?.id === 't');
  lit._onKey({key: ' ', preventDefault() {}});
  assert.deepEqual(log.at(-1), ['t', false], 'space on a picked single row unpicks it');
  assert.ok(!globalThis.document.activeElement.classList.contains('on'));
  globalThis.document.activeElement = null;
}

// ---- unavailable: dashed state class, hint title, aria-disabled, focusable, inert
{
  const log = [];
  const menu = new Menu({persistent: true, sections: [{kind: 'columns', columns: [
    {multi: true, onPick: i => log.push(i.id), items: [
      {id: 'u', label: 'u', unavailable: true, hint: 'needs a key'},
      {id: 'd', label: 'd', disabled: true}]},
  ]}]});
  menu.el = menu._build();
  const rowOf = id => walk(menu.el).find(n => n.dataset?.id === id);
  const u = rowOf('u');
  assert.ok(u.classList.contains('unavailable'));
  assert.equal(u.title, 'needs a key', 'the hint is the title');
  assert.equal(u.getAttribute('aria-disabled'), 'true');
  assert.equal(u.onclick, null, 'a click does nothing');
  globalThis.document.activeElement = u;
  let prevented = false;
  menu._onKey({key: ' ', preventDefault() { prevented = true; }});
  assert.deepEqual(log, [], 'space does nothing');
  assert.ok(prevented, 'and does not scroll the panel');
  assert.ok(!u.classList.contains('on'));
  assert.ok(!rowOf('d').classList.contains('unavailable'), 'disabled stays as it was');
  assert.equal(rowOf('d').getAttribute('aria-disabled'), null);
  // the real selector for the arrow order excludes .disabled only, so an unavailable row stays in it
  assert.ok(!u.classList.contains('disabled'), 'unavailable stays in the arrow order');
  globalThis.document.activeElement = null;
}

// ---- the path marker and the count: `name count >`, one marker per column, none in the last
{
  const menu = new Menu({});
  const cols = menu._section({kind: 'columns', columns: [
    {items: [{id: 'a', label: 'a', count: 2, path: true}, {id: 'b', label: 'b', path: true},
      {id: 'z', label: 'z', count: 0}]},
    {items: [{id: 'm', label: 'm', path: true, count: 1}]},
  ]});
  const first = walk(cols).filter(n => n.dataset?.column === '0')[0];
  const rowsOf = col => col.children.filter(n => String(n.className).includes('menu-item'));
  const [a, b, z] = rowsOf(first);
  const kinds = r => r.children.map(c => c.className);
  assert.deepEqual(kinds(a), ['name', 'count', 'path-mark'], 'order is name, count, marker');
  assert.equal(a.children[1].textContent, '2');
  assert.equal(a.children[2].textContent, '>');
  // one marker per column: the second host-set marker is dropped, its slot stays empty
  assert.deepEqual(kinds(b), ['name', 'path-mark'], 'no count, no count node');
  assert.equal(b.children[1].textContent, '');
  assert.equal(b.classList.contains('path'), false);
  assert.ok(a.classList.contains('path'));
  assert.equal(z.children.find(c => c.className === 'count'), undefined, 'a zero count shows nothing');
  assert.equal(z.children.at(-1).textContent, '', 'a row without the marker keeps an empty slot');
  const second = walk(cols).filter(n => n.dataset?.column === '1')[0];
  const [m] = rowsOf(second);
  assert.deepEqual(kinds(m), ['name', 'count'], 'the last column never carries the marker');
}

// ---- picking a row reports it as the described one, so the next column shows its children even
// when the pick came by pointer. once only: an arrow focus already reported it
{
  const heard = [];
  const menu = new Menu({persistent: true, sections: [{kind: 'columns', columns: [
    {multi: true, items: [{id: 'a', label: 'a'}],
      onFocus: item => heard.push(['focus', item.id]), onPick: item => heard.push(['pick', item.id])},
  ]}]});
  menu.el = menu._build();
  const r = walk(menu.el).find(n => n.dataset?.id === 'a');
  r.onclick();
  assert.deepEqual(heard, [['focus', 'a'], ['pick', 'a']], 'a pick reports focus first');
  r.onclick();
  r.onclick();
  assert.deepEqual(heard.slice(2), [['pick', 'a'], ['pick', 'a']], 'focus is not reported twice');
}

// ---- the worked case: lab (multi) > model (multi) > effort (single), driven by keys alone. the
// host owns the picks and tells the menu what to show; the menu moves the cursor and toggles
{
  const tree = {
    'claude code': {'fable 5.1': ['low', 'medium', 'high', 'xhigh', 'max'],
      'opus 5.5': ['low', 'medium', 'high', 'xhigh', 'max'],
      'sonnet 5.5': ['low', 'medium', 'high', 'xhigh', 'max'], 'haiku 5.5': []},
    codex: {'gpt-6.1 sol': ['low', 'medium', 'high', 'xhigh', 'max'],
      'gpt-5.6 luna': ['low', 'medium', 'high']},
  };
  const labs = Object.keys(tree);
  const labPicks = new Set();
  const modelPicks = new Set();       // 'lab/model'
  const effortPick = new Map();       // 'lab/model' -> effort
  let parentLab = 'claude code';
  let parentModel = null;
  let menu = null;
  const pathsBelow = lab => [...effortPick.keys()].filter(k => k.startsWith(`${lab}/`)).length;
  const build = () => {
    const models = labPicks.has(parentLab) ? Object.keys(tree[parentLab]) : [];
    const efforts = parentModel && modelPicks.has(`${parentLab}/${parentModel}`)
      ? tree[parentLab][parentModel] : [];
    return [{kind: 'columns', columns: [
      {multi: true,
        items: labs.map(id => ({id, label: id, on: labPicks.has(id), path: id === parentLab
          && labPicks.has(id), count: pathsBelow(id)})),
        onFocus: item => { parentLab = item.id; parentModel = null; menu.refresh(build()); },
        onPick: (item, on) => {
          if (on) labPicks.add(item.id);
          else {
            labPicks.delete(item.id);
            [...modelPicks].filter(k => k.startsWith(`${item.id}/`)).forEach(k => {
              modelPicks.delete(k);
              effortPick.delete(k);
            });
          }
          menu.refresh(build());
        }},
      {multi: true,
        items: models.map(id => ({id, label: id, on: modelPicks.has(`${parentLab}/${id}`),
          path: id === parentModel && modelPicks.has(`${parentLab}/${id}`)})),
        onFocus: item => { parentModel = item.id; menu.refresh(build()); },
        onPick: (item, on) => {
          const k = `${parentLab}/${item.id}`;
          if (on) modelPicks.add(k);
          else { modelPicks.delete(k); effortPick.delete(k); }
          menu.refresh(build());
        }},
      {multi: false,
        items: efforts.map(id => ({id, label: id,
          on: effortPick.get(`${parentLab}/${parentModel}`) === id})),
        onPick: (item, on) => {
          const k = `${parentLab}/${parentModel}`;
          if (on) effortPick.set(k, item.id); else effortPick.delete(k);
          menu.refresh(build());
        }},
    ]}];
  };
  menu = new Menu({persistent: true, sections: build()});
  menu.el = menu._build();
  menu.refresh = sections => {
    // the stub has no focus tracking, so a refresh keeps the cursor by column and id
    const at = globalThis.document.activeElement;
    const was = at && {column: at.closest('.col').dataset.column, id: at.dataset.id};
    menu.sections = sections;
    menu.el = menu._build();
    if (was) globalThis.document.activeElement = items().find(r => r.dataset.id === was.id
      && r.closest('.col').dataset.column === was.column);
  };
  const items = () => menu.el.querySelectorAll('.menu-item');
  menu._items = items;
  menu._focus = el => {
    globalThis.document.activeElement = el;
    el.fire('focus');
  };
  menu._buttons = () => [];
  const press = (...keys) => keys.forEach(key => menu._onKey({key, preventDefault() {}}));
  const cursor = () => {
    const at = globalThis.document.activeElement;
    return `${at.closest('.col').dataset.column}:${at.dataset.id}`;
  };
  const text = (column, id) => {
    const r = items().find(x => x.dataset.id === id && x.closest('.col').dataset.column === column);
    return r.children.map(c => c.textContent).filter(Boolean).join(' ');
  };
  const down = 'ArrowDown', up = 'ArrowUp', left = 'ArrowLeft', right = 'ArrowRight';

  menu._focus(items()[0]);
  assert.equal(cursor(), '0:claude code');
  assert.equal(menu.el.querySelectorAll('.col')[1].children.length, 0, 'no models before a pick');
  press(' ');
  assert.deepEqual([...labPicks], ['claude code']);
  assert.equal(items().filter(r => r.closest('.col').dataset.column === '1').length, 4);
  assert.equal(cursor(), '0:claude code', 'the cursor stays on the item');
  press(right, down, down);
  assert.equal(cursor(), '1:sonnet 5.5');
  press(' ');
  assert.equal(items().filter(r => r.closest('.col').dataset.column === '2').length, 5);
  press(right, down);
  assert.equal(cursor(), '2:medium');
  press(' ');
  assert.equal(effortPick.get('claude code/sonnet 5.5'), 'medium');
  assert.equal(text('1', 'sonnet 5.5'), 'sonnet 5.5 >', 'sonnet carries the path marker');
  press(left);
  assert.equal(cursor(), '1:sonnet 5.5', 'left goes back to the path row');
  press(up);
  assert.equal(cursor(), '1:opus 5.5');
  press(' ', right, down, down);
  assert.equal(cursor(), '2:high');
  press(' ');
  assert.equal(effortPick.get('claude code/opus 5.5'), 'high');
  press(left, left, down);
  assert.equal(cursor(), '0:codex');
  press(' ');
  assert.deepEqual([...labPicks], ['claude code', 'codex']);
  press(right);
  assert.equal(cursor(), '1:gpt-6.1 sol');
  press(' ', right, down, down);
  assert.equal(cursor(), '2:high');
  press(' ');

  assert.deepEqual([...effortPick].sort(), [
    ['claude code/opus 5.5', 'high'], ['claude code/sonnet 5.5', 'medium'],
    ['codex/gpt-6.1 sol', 'high']]);
  assert.equal(text('0', 'claude code'), 'claude code 2', 'the host counts, the menu shows');
  assert.equal(text('0', 'codex'), 'codex 1 >');

  // single-select effort: picking another replaces, space on the picked one unpicks
  press(down);
  press(' ');
  assert.equal(effortPick.get('codex/gpt-6.1 sol'), 'xhigh');
  press(' ');
  assert.equal(effortPick.has('codex/gpt-6.1 sol'), false);
  press(' ');
  // unpicking a parent clears the picks under it, and the counts vanish
  press(left, left, up);
  assert.equal(cursor(), '0:claude code');
  press(' ');
  assert.equal(labPicks.has('claude code'), false);
  assert.equal([...modelPicks].filter(k => k.startsWith('claude code/')).length, 0);
  assert.equal(text('0', 'claude code'), 'claude code', 'the count vanishes with the picks');
  // repicking starts empty
  press(' ');
  assert.equal(items().filter(r => r.closest('.col').dataset.column === '1')
    .filter(r => r.classList.contains('on')).length, 0, 're-picking starts the parent empty');
  globalThis.document.activeElement = null;
}

// ---- down and up stay in their own column, left and right cross columns, down past a column's last
// row lands on the footer buttons, up returns to the row they were reached from, and enter presses a
// focused button. one flat list had down cycle lab, model, effort and never reach the buttons
{
  const pressed = [];
  const menu = new Menu({persistent: true, sections: [
    {kind: 'columns', columns: [
      {multi: false, items: [{id: 'a', label: 'a'}, {id: 'b', label: 'b'}]},
      {multi: false, items: [{id: 'm1', label: 'm1'}, {id: 'm2', label: 'm2'}]},
      {multi: false, items: [{id: 'low', label: 'low'}, {id: 'high', label: 'high'}]},
    ]},
    {kind: 'buttons', buttons: ['save', 'default', 'discard'].map(id => ({
      id, label: id, onClick: () => pressed.push(id)}))},
  ]});
  menu.el = menu._build();
  menu._items = () => walk(menu.el).filter(n => String(n.className).includes('menu-item'))
    .map(r => Object.assign(r, {click: () => r.onclick?.()}));
  menu._buttons = () => walk(menu.el).filter(n => String(n.className).includes('toggle')
    && n.parentNode?.className === 'menu-buttons')
    .map(b => Object.assign(b, {click: () => b.onclick?.()}));
  menu._focus = el => { globalThis.document.activeElement = el; };
  const row = (column, id) => menu._items().find(r => r.dataset.id === id
    && r.closest('.col').dataset.column === String(column));
  const button = id => menu._buttons().find(b => b.dataset.id === id);
  const press = key => menu._onKey({key, preventDefault() {}});
  const focused = () => globalThis.document.activeElement;

  globalThis.document.activeElement = row(0, 'a');
  press('ArrowDown');
  assert.equal(focused(), row(0, 'b'), 'down moves within the lab column');
  press('ArrowDown');
  assert.equal(focused(), button('save'), 'down past the last lab lands on the first button');
  press('ArrowUp');
  assert.equal(focused(), row(0, 'b'), 'up from the buttons returns to the column we came from');
  press('ArrowUp');
  assert.equal(focused(), row(0, 'a'), 'up walks the lab column, never into another');
  press('ArrowUp');
  assert.equal(focused(), row(0, 'a'), 'up at the top of a column stays put');

  globalThis.document.activeElement = row(1, 'm2');
  press('ArrowDown');
  assert.equal(focused(), button('save'), 'down from the last model also reaches the buttons');
  press('ArrowUp');
  assert.equal(focused(), row(1, 'm2'), 'and up returns to the model column, not the lab');

  globalThis.document.activeElement = row(2, 'low');
  press('ArrowDown');
  assert.equal(focused(), row(2, 'high'), 'down stays in the effort column');
  press('ArrowDown');
  press('ArrowRight');
  assert.equal(focused(), button('default'), 'right on a button walks the buttons');
  press('ArrowRight');
  press('ArrowRight');
  press('ArrowRight');
  assert.equal(focused(), button('menu-close'), 'the panel\'s own close button ends the row');
  press('ArrowLeft');
  press('ArrowLeft');
  assert.equal(focused(), button('default'), 'left walks back');
  press('ArrowDown');
  assert.equal(focused(), button('default'), 'down on a button stays on it');
  press('Enter');
  assert.deepEqual(pressed, ['default'], 'enter presses the focused button');
  press('ArrowUp');
  assert.equal(focused(), row(2, 'high'), 'up goes back to the effort column it came from');
  globalThis.document.activeElement = null;
}

// ---- a column can hear which of its rows has focus - a multi-select column has no single pick to
// hang a neighbouring column on, so the focused row is what the next column describes
{
  const heard = [];
  const menu = new Menu({persistent: true, sections: []});
  const build = () => [{kind: 'columns', columns: [
    {multi: true, items: [{id: 'b1', label: 'b1'}, {id: 'b2', label: 'b2'}],
      onFocus: item => { heard.push(item.id); menu.refresh(build()); }},
  ]}];
  menu.sections = build();
  menu.el = menu._build();
  const rowOf = id => menu.el.querySelectorAll('.menu-item').find(r => r.dataset.id === id);
  assert.equal(rowOf('b1').tabIndex, 0, 'a click must not focus the row - a redraw would eat it');
  rowOf('b1').fire('focus');
  assert.deepEqual(heard, ['b1'], 'focusing b1 should report it once');
  // refresh built a new panel whose b1 now takes focus back: the same row, not a new focus
  menu.el = menu._build();
  rowOf('b1').fire('focus');
  assert.deepEqual(heard, ['b1'], 'a restored focus must not report again');
  rowOf('b2').fire('focus');
  assert.deepEqual(heard, ['b1', 'b2']);
}

// ---- escape closes the menu and stops there, so the panel it was opened from stays open
{
  const menu = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
  menu.openAt({x: 0, y: 0});
  let stopped = false;
  menu._onEscape({key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; }});
  assert.ok(stopped, 'escape should not reach the host panel');
  assert.ok(!menu.isOpen, 'and should close the menu');
  let other = false;
  menu._onEscape({key: 'a', preventDefault() {}, stopPropagation() { other = true; }});
  assert.ok(!other, 'any other key passes through');
}

// ---- a host closing its panel takes the menu opened from it along
{
  const menu = new Menu({sections: [{kind: 'list', items: [{id: 'a', label: 'a'}]}]});
  menu.openAt({x: 0, y: 0});
  Menu.closeOpen();
  assert.ok(!menu.isOpen, 'closeOpen should close the open menu');
  Menu.closeOpen();
}
console.log('ok');
