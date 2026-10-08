// exercises makeSegments against a dom stub: the lit segment moves only after onPick resolves true,
// a false or a throw leaves it, clicks during a pick are ignored, an unavailable segment never
// picks but stays focusable (no html disabled), an auto segment has no click handler and is lit by
// setLit, aria state follows the lit segment, and arrow keys move focus without picking.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom} from './_dom.mjs';

installDom();
const src = readFileSync(new URL('../../ui_base/assets/segments.js', import.meta.url), 'utf8');
const makeSegments = new Function(`${src}; return makeSegments;`)();

// a pick the test resolves by hand, so "in flight" is a state it can hold open
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}
const tick = () => new Promise(r => setTimeout(r, 0));
const lit = seg => seg.buttons.filter(b => b.classList.contains('on')).map(b => b.textContent);

const options = () => [
  {label: 'alpha', value: 'a'},
  {label: 'beta', value: 'b'},
  {label: 'gamma', value: 'c'},
];

// ---- structure and aria
{
  const seg = makeSegments({options: options(), value: 'a', onPick: () => true, label: 'a group'});
  assert.ok(seg.el.classList.contains('segments'));
  assert.equal(seg.el.getAttribute('role'), 'group');
  assert.equal(seg.el.getAttribute('aria-label'), 'a group');
  assert.equal(seg.buttons.length, 3);
  assert.deepEqual(seg.el.children, seg.buttons, 'buttons are the children, in option order');
  seg.buttons.forEach(b => {
    assert.equal(b.tag, 'button');
    assert.equal(b.type, 'button');
    assert.ok(b.classList.contains('toggle') && b.classList.contains('segment'));
  });
  assert.deepEqual(lit(seg), ['alpha']);
  assert.deepEqual(seg.buttons.map(b => b.getAttribute('aria-pressed')), ['true', 'false', 'false']);

  const none = makeSegments({options: options(), value: null, onPick: () => true, label: 'x'});
  assert.deepEqual(lit(none), [], 'a null value lights none');
  assert.deepEqual(none.buttons.map(b => b.getAttribute('aria-pressed')), ['false', 'false', 'false']);
}

// ---- the lit state moves only after onPick resolves true
{
  const pending = deferred();
  const calls = [];
  const seg = makeSegments({
    options: options(), value: 'a', label: 'x',
    onPick: value => { calls.push(value); return pending.promise; },
  });
  seg.buttons[1].fire('click');
  assert.deepEqual(calls, ['b']);
  assert.deepEqual(lit(seg), ['alpha'], 'still alpha while the pick is in flight');
  pending.resolve(true);
  await tick();
  assert.deepEqual(lit(seg), ['beta'], 'beta lights once it resolved true');
  assert.deepEqual(seg.buttons.map(b => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
}

// ---- a synchronous true moves it too
{
  const seg = makeSegments({options: options(), value: 'a', label: 'x', onPick: () => true});
  seg.buttons[2].fire('click');
  await tick();
  assert.deepEqual(lit(seg), ['gamma']);
}

// ---- false keeps the lit state, and so does a throw or anything that is not exactly true
{
  for (const answer of [false, undefined, 'yes']) {
    const seg = makeSegments({options: options(), value: 'a', label: 'x', onPick: async () => answer});
    seg.buttons[1].fire('click');
    await tick();
    assert.deepEqual(lit(seg), ['alpha'], `${String(answer)} must not move the lit state`);
  }
  const realError = console.error;
  const errors = [];
  console.error = e => errors.push(e);
  const seg = makeSegments({
    options: options(), value: 'a', label: 'x',
    onPick: async () => { throw new Error('boom'); },
  });
  seg.buttons[1].fire('click');
  await tick();
  assert.deepEqual(lit(seg), ['alpha'], 'a throwing pick leaves the lit state');
  assert.equal(errors.length, 1);
  // and the control is usable again afterwards: the next click reaches onPick
  seg.buttons[2].fire('click');
  await tick();
  assert.equal(errors.length, 2, 'the second click was handled, not swallowed by a stuck flag');
  console.error = realError;
}

// ---- clicks are ignored while a pick is in flight, and the control frees up afterwards
{
  const pending = deferred();
  const calls = [];
  const seg = makeSegments({
    options: options(), value: 'a', label: 'x',
    onPick: value => { calls.push(value); return pending.promise; },
  });
  seg.buttons[1].fire('click');
  assert.equal(seg.el.getAttribute('aria-busy'), 'true');
  seg.buttons[2].fire('click');
  seg.buttons[1].fire('click');
  assert.deepEqual(calls, ['b'], 'only the first click reached onPick');
  pending.resolve(false);
  await tick();
  assert.equal(seg.el.getAttribute('aria-busy'), null);
  seg.buttons[2].fire('click');
  assert.deepEqual(calls, ['b', 'c'], 'a click after it settled is handled');
}

// ---- a click on the lit segment does nothing
{
  const calls = [];
  const seg = makeSegments({options: options(), value: 'b', label: 'x', onPick: v => { calls.push(v); return true; }});
  seg.buttons[1].fire('click');
  await tick();
  assert.deepEqual(calls, []);
  assert.deepEqual(lit(seg), ['beta']);
}

// ---- unavailable: never picks, stays focusable, not the html disabled attribute
{
  const calls = [];
  const seg = makeSegments({
    options: [
      {label: 'alpha', value: 'a'},
      {label: 'beta', value: 'b', disabled: true, hint: 'not now: a reason'},
    ],
    value: 'a', label: 'x', onPick: v => { calls.push(v); return true; },
  });
  const [, beta] = seg.buttons;
  assert.ok(beta.classList.contains('unavailable'));
  assert.equal(beta.getAttribute('aria-disabled'), 'true');
  assert.equal(beta.title, 'not now: a reason');
  assert.equal(beta.getAttribute('disabled'), null, 'the html disabled attribute is not set');
  assert.notEqual(beta.disabled, true);
  assert.notEqual(beta.tabIndex, -1, 'stays in the tab order');
  beta.fire('click');
  await tick();
  assert.deepEqual(calls, [], 'a click never reaches onPick');
  assert.deepEqual(lit(seg), ['alpha']);
  beta.focus();
  assert.equal(beta.focused, true, 'focusable');

  // setDisabled flips it both ways
  seg.setDisabled('b', false);
  assert.ok(!beta.classList.contains('unavailable'));
  assert.equal(beta.getAttribute('aria-disabled'), 'false');
  beta.fire('click');
  await tick();
  assert.deepEqual(calls, ['b']);
  seg.setDisabled('a', true);
  assert.ok(seg.buttons[0].classList.contains('unavailable'));
  assert.equal(seg.buttons[0].getAttribute('aria-disabled'), 'true');
  seg.setDisabled('nobody', true);
}

// ---- auto: no click handler, aria-disabled, lit through setLit
{
  const calls = [];
  const seg = makeSegments({
    options: [{label: 'manual', value: 'm'}, {label: 'auto', value: 'auto', auto: true}],
    value: 'm', label: 'x', onPick: v => { calls.push(v); return true; },
  });
  const [manual, auto] = seg.buttons;
  assert.equal(auto.listenerCount('click'), 0, 'an auto segment has no click handler');
  assert.equal(manual.listenerCount('click'), 1);
  assert.equal(auto.getAttribute('aria-disabled'), 'true');
  assert.ok(auto.classList.contains('auto'));
  auto.fire('click');
  await tick();
  assert.deepEqual(calls, []);
  assert.deepEqual(lit(seg), ['manual']);

  seg.setLit('auto');
  assert.deepEqual(lit(seg), ['auto']);
  assert.equal(auto.getAttribute('aria-pressed'), 'true');
  assert.equal(manual.getAttribute('aria-pressed'), 'false');
  seg.setLit(null);
  assert.deepEqual(lit(seg), [], 'setLit(null) lights none');
  assert.deepEqual(calls, [], 'setLit never calls onPick');

  // the user can still pick a manual segment away from a lit auto one
  seg.setLit('auto');
  manual.fire('click');
  await tick();
  assert.deepEqual(lit(seg), ['manual']);
  assert.deepEqual(calls, ['m']);
}

// ---- set moves the lit segment without calling onPick
{
  const calls = [];
  const seg = makeSegments({options: options(), value: 'a', label: 'x', onPick: v => { calls.push(v); return true; }});
  seg.set('c');
  assert.deepEqual(lit(seg), ['gamma']);
  assert.deepEqual(calls, []);
}

// ---- arrow keys move focus between segments without picking
{
  const calls = [];
  const seg = makeSegments({
    options: [
      {label: 'alpha', value: 'a'},
      {label: 'beta', value: 'b', disabled: true, hint: 'why'},
      {label: 'gamma', value: 'c'},
    ],
    value: 'a', label: 'x', onPick: v => { calls.push(v); return true; },
  });
  const [alpha, beta, gamma] = seg.buttons;
  const key = (button, name) => {
    let prevented = false;
    button.fire('keydown', {key: name, preventDefault() { prevented = true; }});
    return prevented;
  };
  assert.equal(key(alpha, 'ArrowRight'), true);
  assert.equal(beta.focused, true, 'right lands on the unavailable segment too');
  assert.equal(key(beta, 'ArrowRight'), true);
  assert.equal(gamma.focused, true);
  gamma.focused = false;
  assert.equal(key(gamma, 'ArrowRight'), true);
  assert.equal(alpha.focused, true, 'right wraps from the last to the first');
  beta.focused = false;
  assert.equal(key(alpha, 'ArrowLeft'), true);
  assert.equal(gamma.focused, true, 'left wraps from the first to the last');
  assert.equal(key(alpha, 'Tab'), false, 'other keys are left alone');
  await tick();
  assert.deepEqual(calls, [], 'arrows never pick');
  assert.deepEqual(lit(seg), ['alpha']);
}

console.log('segments ok');
