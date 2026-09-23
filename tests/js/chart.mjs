// exercises timeChart against a DOM/SVG stub, because none of node's built-ins know about
// createElementNS. the shim carries just enough to render and to answer nearest() - no jsdom,
// same choice made everywhere else in this suite.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

class StubNode {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.style = {};
    this._text = '';
    this._html = '';
    this.classList = {
      add: c => { const cur = this._classes(); if (!cur.includes(c)) cur.push(c); this._setClasses(cur); },
      remove: c => this._setClasses(this._classes().filter(x => x !== c)),
      contains: c => this._classes().includes(c),
    };
  }
  _classes() { return (this.attrs.class || this.className || '').split(' ').filter(Boolean); }
  _setClasses(list) { this.attrs.class = list.join(' '); this.className = this.attrs.class; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.children.push(c)); }
  remove() {}
  addEventListener(type, fn) { (this._listeners ??= {})[type] = fn; }
  removeEventListener() {}
  fire(type, evt) { this._listeners?.[type]?.(evt); }
  getBoundingClientRect() { return {left: 0, top: 0, width: this.width || 600, height: this.height || 240}; }
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html; }
}

function element(tag) { return new StubNode(tag); }

globalThis.document = {
  createElement: element,
  createElementNS: (_ns, tag) => element(tag),
  documentElement: element('html'),
};
globalThis.window = globalThis;
// no ResizeObserver / getComputedStyle - same absence the other stubs in this suite rely on, so
// the script's own typeof guards are what get exercised here
delete globalThis.ResizeObserver;
delete globalThis.getComputedStyle;

const target = process.argv[2] || new URL('../../ui_base/assets/chart.js', import.meta.url);
const src = readFileSync(target, 'utf8');
const timeChart = new Function(`${src}; return timeChart;`)();

const container = element('div');
container.clientWidth = 600;
container.clientHeight = 240;

const x = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22', '2024-01-29', '2024-02-05'];
const values = [10, 20, null, 40, 50, 60];
const chart = timeChart(container, {height: 240});
chart.update({
  x,
  series: [
    {id: 'total', label: 'total', values},
    {id: 'forecast', label: 'forecast', values: [5, 15, 25, 35, 45, 55], dashed: true},
    {id: 'flat', label: 'flat', values: [1, 2, 3, 4, 5, 6]},
  ],
  bands: [
    {id: 'total-band', series: 'total', lo: [8, 18, null, 38, 48, 58], hi: [12, 22, null, 42, 52, 62]},
  ],
  markers: [{x: '2024-01-08', label: 'origin'}, {x: '2024-01-29', label: 'split'}],
});

const svg = container.children.find(c => c.tag === 'div' && c._classes?.().includes?.('chart-wrap'))
  .children.find(c => c.tag === 'svg');

const walk = (node, out = []) => {
  out.push(node);
  (node.children || []).forEach(c => walk(c, out));
  return out;
};
const all = walk(svg);
const byClass = c => all.filter(n => n.attrs?.class === c);

// ---- three series, one with a null in the middle -> 4 line paths total (1 + 2 + 1)
const linePaths = byClass('chart-line');
assert.equal(linePaths.length, 4, `expected 4 line paths (null splits one series), got ${linePaths.length}`);
const totalSegments = linePaths.filter(p => p.attrs['data-series'] === 'total');
assert.equal(totalSegments.length, 2, 'a null in the middle of a series must break it into two paths');

// ---- one band, itself split by the same null -> 2 band paths
const bandPaths = byClass('chart-band');
assert.equal(bandPaths.length, 2, `expected the band split by the null too, got ${bandPaths.length}`);

// ---- two markers -> two vertical marker lines
const markerLines = byClass('chart-marker-line');
assert.equal(markerLines.length, 2, `expected 2 marker lines, got ${markerLines.length}`);

// ---- nearest() finds the closest index to a pixel position
const first = chart.nearest(0);
assert.equal(first, 0, `nearest(0) should land on the first point, got ${first}`);
const last = chart.nearest(10000);
assert.equal(last, x.length - 1, `nearest(far right) should land on the last point, got ${last}`);
const midish = chart.nearest(300);
assert.ok(midish > 0 && midish < x.length - 1, `nearest(middle) should land somewhere in between, got ${midish}`);

// ---- an empty update does not throw and clears the legend
chart.update({});
assert.equal(chart.nearest(100), -1, 'nearest() on empty data must report no point');

// ---- a single point renders as a dot, not a broken path
chart.update({x: ['2024-01-01'], series: [{id: 'solo', label: 'solo', values: [42]}]});
const solo = walk(container).filter(n => n.attrs?.class === 'chart-point');
assert.equal(solo.length, 1, 'a lone value must draw a point, not an empty path');

// ---- an all-null series draws nothing and does not throw
chart.update({x, series: [{id: 'blank', label: 'blank', values: [null, null, null, null, null, null]}]});
assert.equal(walk(container).filter(n => n.attrs?.class === 'chart-line').length, 0);

chart.destroy();

console.log('chart.mjs: ok');
