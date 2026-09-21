// drives dirMenu against the same DOM stub style as menu_sections: drill into a fake tree and back
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {installDom} from './_dom.mjs';

installDom();

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
// ---- an empty folder says so, its heading notwithstanding
const bare = dirMenu('pick', async path => ({path, parent: null, dirs: [], files: []}), () => {}, {start: '/x'});
bare.openAt({x: 0, y: 0});
await settle();
const walkBare = n => [n, ...(n.children || []).flatMap(walkBare)];
assert.equal(walkBare(bare.el).find(n => n.className === 'none')?.textContent, 'empty folder');
bare.close();

// ---- a fetchDir that rejects shows a folder that could not be read, never the previous listing
const failing = dirMenu('pick', async () => { throw new Error('boom'); }, () => {}, {start: '/'});
failing.openAt({x: 0, y: 0});
await settle();
const walkAll = n => [n, ...(n.children || []).flatMap(walkAll)];
const notice = walkAll(failing.el).find(n => n.className === 'none');
assert.ok(notice && notice.textContent.includes('boom'), `expected the error shown, got ${notice?.textContent}`);
failing.close();

console.log('ok');
