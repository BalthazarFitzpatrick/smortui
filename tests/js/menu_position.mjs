import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {element, installDom} from './_dom.mjs';

const {window} = installDom();
const observers = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
};
const source = readFileSync(new URL('../../ui_base/assets/menu.js', import.meta.url), 'utf8');
const Menu = new Function(`${source}; return Menu;`)();
const trigger = element('button', {rect: {left: 1000, top: 650, bottom: 680}});
const menu = new Menu();
const panel = element('div', {rect: {width: 200, height: 40}});
menu._build = () => panel;
menu.openAt(trigger);
assert.equal(panel.style.top, '686px');
assert.equal(observers[0].target, panel);
panel.rect.height = 480;
observers[0].callback();
assert.equal(panel.style.top, '164px', 'growth flips the menu above its trigger');
window.innerHeight = 400;
window.innerWidth = 900;
panel.rect.height = 280;
window.fire('resize');
assert.equal(panel.style.top, '116px');
assert.equal(panel.style.left, '696px');
menu.close();
assert.ok(observers[0].disconnected);
assert.equal(window.listenerCount('resize'), 0);
const position = {...panel.style};
observers[0].callback();
window.fire('resize');
assert.deepEqual(panel.style, position, 'a queued callback after close does nothing');

menu.openAt({x: 890, y: 390});
assert.equal(panel.style.left, '696px');
assert.equal(panel.style.top, '116px');
window.innerHeight = 350;
window.fire('resize');
assert.equal(panel.style.top, '66px', 'point anchors re-clamp too');
menu.close();
assert.ok(observers[1].disconnected);
console.log('ok');
