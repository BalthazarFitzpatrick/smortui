// every component that listens on window must be able to let go. align.js documented the leak
// first: "a re-render that only replaced the dom left the old pair behind, one more on every
// render". this proves destroy() drops what each one registered, on window and on its host, for
// the components that did not have one before - makePanZoom, makeSelection, makeDrawer, makeExpander
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom, element, liveListeners} from './_dom.mjs';

const {window} = installDom();
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const load = (file, name) => {
  const src = readFileSync(new URL(`../../ui_base/assets/${file}`, import.meta.url), 'utf8');
  return new Function(`${src}; return ${name};`)();
};

// a listener on an element that was itself removed goes with it - only live hosts count
const settled = () => liveListeners(window);
const clean = {window: 0, host: 0};

{
  const makePanZoom = load('menu.js', 'makePanZoom');
  const wrap = element('div');
  const view = makePanZoom(wrap, element('div'));
  assert.equal(settled().window, 2, 'pan/zoom listens for move and up on window');
  view.destroy();
  assert.deepEqual(settled(), clean, 'makePanZoom.destroy drops every listener it added');
}
{
  const makeSelection = load('select.js', 'makeSelection');
  const grid = element('div');
  const sel = makeSelection(grid);
  assert.equal(settled().window, 2, 'the net listens for move and up on window');
  sel.destroy();
  assert.deepEqual(settled(), clean, 'makeSelection.destroy drops every listener it added');
}
{
  const makeDrawer = load('drawer.js', 'makeDrawer');
  const drawer = makeDrawer({edge: 'left'});
  assert.equal(settled().window, 1, 'a drawer listens for resize');
  drawer.destroy();
  assert.deepEqual(settled(), clean, 'makeDrawer.destroy drops the resize listener');
  assert.ok(drawer.el.removed, 'and takes its element with it');
}
{
  const makeExpander = load('expand.js', 'makeExpander');
  const strip = element('div');
  const exp = makeExpander(strip);
  assert.equal(settled().host, 1, 'an expander listens for the strip click');
  exp.destroy();
  assert.deepEqual(settled(), clean, 'makeExpander.destroy drops the strip click');
}

console.log('ok');
