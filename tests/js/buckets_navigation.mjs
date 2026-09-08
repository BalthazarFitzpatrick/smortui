// exercises makeBuckets' 2D roving focus against a tiny dom stub - real querySelectorAll/closest
// semantics matter here since the navigation logic locates rows through them, so the stub earns
// its keep by implementing those rather than faking positions directly
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

function node(tag, className = '') {
  const n = {
    tag, className, children: [], parentNode: null, tabIndex: -1, focused: false,
    listeners: {},
    appendChild(child) { child.parentNode = n; n.children.push(child); return child; },
    addEventListener(type, fn) { (n.listeners[type] ||= []).push(fn); },
    focus() { n.focused = true; },
    matches(sel) { return sel.split(',').some(s => n.className.split(' ').includes(s.trim().slice(1))); },
    closest(sel) {
      let cur = n;
      while (cur) { if (cur.matches && cur.matches(sel)) return cur; cur = cur.parentNode; }
      return null;
    },
    contains(other) {
      let cur = other;
      while (cur) { if (cur === n) return true; cur = cur.parentNode; }
      return false;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = list => list.forEach(c => { if (c.matches(sel)) out.push(c); walk(c.children); });
      walk(n.children);
      return out;
    },
  };
  return n;
}

const container = node('div');
container.dispatchKeydown = (row, key) => {
  const evt = {key, target: row, preventDefault() {}};
  (container.listeners.keydown || []).forEach(fn => fn(evt));
};

// five buckets, three rows each - the shape the contract's verify cases are written against
const buckets = [];
for (let b = 0; b < 5; b++) {
  const bucket = node('div', 'bucket');
  container.appendChild(bucket);
  const rows = [];
  for (let r = 0; r < 3; r++) rows.push(bucket.appendChild(node('div', 'row')));
  buckets.push({bucket, rows});
}

const target = process.argv[2] || new URL('../../ui_base/assets/buckets.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const makeBuckets = new Function(`${src}; return makeBuckets;`)();

const events = [];
makeBuckets(container, {onFocus: (bi, ri) => events.push({bi, ri}), onExitTop: e => events.push(e)});

// ---- right from bucket 1 row 2 lands on bucket 2 row 2
container.dispatchKeydown(buckets[1].rows[2], 'ArrowRight');
assert.ok(buckets[2].rows[2].focused, 'focus should land on bucket 2, row 2');
assert.deepEqual(events.pop(), {bi: 2, ri: 2});

// ---- up from any row 0 emits exit-top rather than moving
const before = buckets[3].rows[0].focused;
container.dispatchKeydown(buckets[3].rows[0], 'ArrowUp');
assert.equal(buckets[3].rows[0].focused, before, 'row 0 must not move on ArrowUp');
assert.deepEqual(events.pop(), {type: 'exit-top', bucket: 3});

// ---- left from bucket 0 does not wrap
const seenBefore = events.length;
container.dispatchKeydown(buckets[0].rows[1], 'ArrowLeft');
assert.equal(events.length, seenBefore, 'moving left off the first bucket must not move focus or wrap');

// ---- moving into a shorter bucket clamps to its last row rather than losing focus
const uneven = node('div');
const wide = uneven.appendChild(node('div', 'bucket'));
const wideRows = [0, 1, 2].map(() => wide.appendChild(node('div', 'row')));
const narrow = uneven.appendChild(node('div', 'bucket'));
const narrowRow = narrow.appendChild(node('div', 'row'));
uneven.dispatchKeydown = (row, key) => {
  const evt = {key, target: row, preventDefault() {}};
  (uneven.listeners.keydown || []).forEach(fn => fn(evt));
};
makeBuckets(uneven, {});
uneven.dispatchKeydown(wideRows[2], 'ArrowRight');
assert.ok(narrowRow.focused, 'the only row of the shorter bucket should take focus');

console.log('ok');
