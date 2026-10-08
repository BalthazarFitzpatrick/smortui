// series styles must not fade axes or swatches, or change default rendering
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {element, installDom} from './_dom.mjs';

function makeElement(tag) {
  const node = element(tag);
  const attrs = {};
  const setAttribute = node.setAttribute;
  node.setAttribute = (key, value) => {
    attrs[key] = String(value);
    setAttribute(key, value);
    if (key === 'class') node.className = value;
    if (key.startsWith('data-')) node.dataset[key.slice(5)] = String(value);
  };
  node.attrs = attrs;
  Object.defineProperty(node, 'innerHTML', {
    set() { node.children = []; },
    get() { return ''; },
  });
  node.replaceChildren = (...children) => { node.children = []; node.append(...children); };
  return node;
}

installDom({document: {
  createElement: makeElement,
  createElementNS: (_ns, tag) => makeElement(tag),
}});
delete globalThis.ResizeObserver;
delete globalThis.getComputedStyle;
const source = readFileSync(process.argv[2] || new URL('../../ui_base/assets/chart.js', import.meta.url), 'utf8');
const timeChart = new Function(`${source}; return timeChart;`)();

function render(style = {}, {theme = false} = {}) {
  if (theme) globalThis.getComputedStyle = () => ({getPropertyValue: () => '#abcdef'});
  else delete globalThis.getComputedStyle;
  const host = makeElement('div');
  host.clientWidth = 600;
  const chart = timeChart(host, {height: 240});
  chart.update({
    x: [0, 1, 2, 3, 4],
    series: Array.from({length: 7}, (_, i) => ({
      id: `s${i}`, values: [1, 2, null, 3, null], dashed: i === 0,
      ...(i === 0 ? style : {}),
    })),
    bands: [{series: 's0', lo: [0, 1, null, null, null], hi: [2, 3, null, null, null]}],
    markers: [{x: 1, label: 'marker'}],
  });
  host.querySelector('.chart-overlay').fire('mousemove', {clientX: 48});
  return {host, chart};
}

function snapshot(node) {
  return {tag: node.tag, attrs: node.attrs, style: node.style, className: node.className,
    text: node.textContent, children: node.children.map(snapshot)};
}

const {host: baseline, chart} = render();
const baselineBytes = JSON.stringify(snapshot(baseline));
if (process.argv.includes('--baseline')) {
  console.log(createHash('sha256').update(baselineBytes).digest('hex'));
  process.exit(0);
}
// captured from the unmodified chart, including hover, gaps, bands and palette cycling
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'),
  'dd6df7948937fda1f3c5e68581cdafe2901f95e3d2745cb92b0741dbaff39c70');
assert.equal(baseline.querySelector('.chart-line[data-series="s0"]').getAttribute('stroke'), '#c7ed5f');
assert.equal(baseline.querySelector('.chart-line[data-series="s6"]').getAttribute('stroke'), '#c7ed5f');

// malformed values must fall back without coercion, exceptions or extra attributes
for (const color of [null, 12, true, {}, [], Symbol('color')]) {
  assert.equal(JSON.stringify(snapshot(render({color}).host)), baselineBytes);
}
for (const opacity of [null, '0.5', false, {}, [], NaN, Infinity, -Infinity, -0.1, 1.1, Symbol('opacity')]) {
  assert.equal(JSON.stringify(snapshot(render({opacity}).host)), baselineBytes);
}

for (const color of ['#123456', 'rebeccapurple', 'rgb(20, 40, 60)', 'var(--kingfisher)']) {
  for (const opacity of [0, 0.4, 1]) {
    const {host} = render({color, opacity}, {theme: true});
    const line = host.querySelector('.chart-line[data-series="s0"]');
    const point = host.querySelector('.chart-point[data-series="s0"]');
    assert.equal(line.getAttribute('stroke'), color);
    assert.equal(line.getAttribute('stroke-dasharray'), '6,4');
    assert.equal(point.getAttribute('fill'), color);
    for (const node of [line, point]) assert.equal(node.getAttribute('opacity'), String(opacity));
    assert.equal(host.querySelector('.chart-band').getAttribute('fill'), color);
    assert.equal(host.querySelector('.chart-band').getAttribute('fill-opacity'), '0.16');
    assert.equal(host.querySelector('.chart-legend-swatch').style.borderTopColor, color);
    assert.equal(host.querySelector('.chart-tooltip-swatch').style.background, color);
    const other = host.querySelector('.chart-line[data-series="s1"]');
    assert.equal(other.getAttribute('stroke'), '#abcdef');
    assert.equal(other.getAttribute('opacity'), null);
    // only the selected series' geometry gets the supplied opacity
    const walk = node => [node, ...node.children.flatMap(walk)];
    for (const node of walk(host)) {
      if (node === line || node === point) continue;
      assert.equal(node.getAttribute('opacity'), node.className === 'chart-gridline' ? '0.35' : null);
      assert.equal(node.style.opacity, undefined);
    }
  }
}

// each field works alone, and an update can remove a previous override
assert.equal(render({color: 'red'}).host.querySelector('.chart-line').getAttribute('opacity'), null);
assert.equal(render({opacity: 0.5}).host.querySelector('.chart-line').getAttribute('stroke'), '#c7ed5f');
chart.update({x: [0, 1], series: [{id: 's0', values: [1, 2], color: 'red', opacity: 0.2}]});
chart.update({x: [0, 1], series: [{id: 's0', values: [1, 2]}]});
assert.equal(baseline.querySelector('.chart-line').getAttribute('stroke'), '#c7ed5f');
assert.equal(baseline.querySelector('.chart-line').getAttribute('opacity'), null);
chart.destroy();
assert.equal(baseline.children.length, 0);
console.log('chart_series_style.mjs: ok');
