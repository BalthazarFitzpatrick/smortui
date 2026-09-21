// drives dirMenu against the same DOM stub style as menu_sections: drill into a fake tree and back
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

class Element {}
globalThis.Element = Element;

function element(tag) {
  const el = Object.assign(new globalThis.Element(), {
    tag, className: '', textContent: '', innerHTML: '', title: '',
    dataset: {}, children: [], onclick: null, style: {}, tabIndex: 0,
    replaceWith() {}, focus() {}, remove() {}, setAttribute() {}, removeAttribute() {},
    contains(n) { return n === el || el.children.some(c => c.contains && c.contains(n)); },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0}),
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { kids.forEach(k => this.children.push(k)); },
    classList: {
      contains: name => el.className.split(' ').includes(name),
      toggle() {}, add() {}, remove() {},
    },
  });
  return el;
}

globalThis.document = {
  createElement: element, addEventListener() {}, removeEventListener() {},
  body: element('body'), activeElement: null,
};
globalThis.window = {addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800};

const src = readFileSync(new URL('../../ui_base/assets/menu.js', import.meta.url), 'utf8');
new Function(`${src}`)();
const {dirMenu} = globalThis.window;

const tree = {
  '/': {dirs: ['docs'], files: ['top.txt']},
  '/docs': {dirs: [], files: ['a.md']},
};
const fetchDir = async path => ({
  path, parent: path === '/' ? null : '/', ...tree[path],
});

const picked = [];
const menu = dirMenu('pick', fetchDir, p => picked.push(p), {start: '/'});
menu.openAt({x: 0, y: 0});
const settle = () => new Promise(r => setTimeout(r, 0));
await settle();

const rows = () => {
  const out = [];
  const walk = n => { out.push(n); (n.children || []).forEach(walk); };
  walk(menu.el);
  return out.filter(n => n.className.includes('menu-item'));
};
const labels = () => rows().map(r => r.children[0].textContent);
const heading = () => {
  const out = [];
  const walk = n => { out.push(n); (n.children || []).forEach(walk); };
  walk(menu.el);
  return out.find(n => n.className.includes('menu-heading')).textContent;
};

assert.equal(heading(), '/');
assert.deepEqual(labels(), ['docs/', 'top.txt'], 'no .. at the root');

rows()[0].onclick();
await settle();
assert.equal(heading(), '/docs');
assert.deepEqual(labels(), ['..', 'a.md'], '.. comes first below the root');

rows()[0].onclick();
await settle();
assert.equal(heading(), '/', '.. goes back up');

rows()[1].onclick();
assert.deepEqual(picked, ['/top.txt'], 'a file calls onPick with its full path');
assert.equal(menu.isOpen, false);
