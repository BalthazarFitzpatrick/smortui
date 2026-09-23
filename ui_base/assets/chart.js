// timeChart: svg time-series primitive - lines, uncertainty bands, split/origin markers, hover
// x/y map straight onto the svg's own pixels (no viewbox), so nearest() and the hover rule read
// the same numbers the browser laid out

const CHART_NS = 'http://www.w3.org/2000/svg';
const CHART_MARGIN = {top: 12, right: 16, bottom: 26, left: 48};

// six tokens, cycled for a seventh series and beyond - a fallback ships alongside each one so a
// page that forgot base.css still gets a legible chart rather than black-on-black
const CHART_PALETTE_TOKENS = [
  ['--lichen', '#c7ed5f'],
  ['--kingfisher', '#52bed9'],
  ['--stone-red-lift', '#ad796f'],
  ['--vanilla', '#edd780'],
  ['--burnt-orange', '#e06f2d'],
  ['--lichen-deep', '#788f39'],
];

function chartCssVar(name, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function chartSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(CHART_NS, tag);
  for (const key of Object.keys(attrs)) el.setAttribute(key, attrs[key]);
  return el;
}

// a date string parses to its epoch ms; a plain number is already the axis value
function chartParseX(v) {
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

// "nice" round tick values across [min, max] - the step rounds to 1/2/5 * 10^n so the axis reads
// 0, 20, 40... rather than whatever the data's own extremes happen to be
function chartNiceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// contiguous runs of non-null indices - a null is a real break in the line, not a gap to
// interpolate across, so each run becomes its own path
function chartSegments(values) {
  const segs = [];
  let run = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) {
      if (run.length) segs.push(run);
      run = [];
    } else {
      run.push(i);
    }
  });
  if (run.length) segs.push(run);
  return segs;
}

function chartBandSegments(lo, hi, n) {
  const segs = [];
  let run = [];
  for (let i = 0; i < n; i++) {
    const l = lo[i], h = hi[i];
    const missing = l === null || l === undefined || h === null || h === undefined
      || Number.isNaN(l) || Number.isNaN(h);
    if (missing) {
      if (run.length) segs.push(run);
      run = [];
    } else {
      run.push(i);
    }
  }
  if (run.length) segs.push(run);
  return segs;
}

function chartXGranularity(spanMs) {
  const day = 86400000;
  if (spanMs <= 90 * day) return 'week';
  if (spanMs <= 3 * 365 * day) return 'month';
  return 'year';
}

function chartDefaultXFormat(dateish, granularity) {
  if (!dateish) return v => String(v);
  return v => {
    const d = new Date(chartParseX(v));
    if (Number.isNaN(d.getTime())) return String(v);
    if (granularity === 'year') return String(d.getFullYear());
    if (granularity === 'month') {
      return d.toLocaleDateString(undefined, {month: 'short', year: '2-digit'});
    }
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  };
}

function timeChart(containerEl, opts = {}) {
  const {
    height = 0,
    yFormat = v => String(Math.round(v * 100) / 100),
    xFormat = null,
    onHover = null,
  } = opts;

  containerEl.innerHTML = '';
  containerEl.classList.add('chart');

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  containerEl.appendChild(wrap);

  const svg = chartSvgEl('svg', {class: 'chart-svg'});
  wrap.appendChild(svg);

  // persistent nodes: recreated content is cleared and rebuilt into svg on every render, but the
  // hover rule and the overlay that drives it keep their listeners across renders
  const hoverRule = chartSvgEl('line', {class: 'chart-hover-rule'});
  const overlay = chartSvgEl('rect', {class: 'chart-overlay', fill: 'transparent'});

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip hidden';
  wrap.appendChild(tooltip);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  containerEl.appendChild(legend);

  let data = {x: [], series: [], bands: [], markers: []};
  let xPixels = [];
  const plot = {left: CHART_MARGIN.left, top: CHART_MARGIN.top, w: 0, h: 0};

  function seriesColor(id, index) {
    const [token, fallback] = CHART_PALETTE_TOKENS[index % CHART_PALETTE_TOKENS.length];
    return chartCssVar(token, fallback);
  }

  function seriesIndexOf(id) {
    const i = data.series.findIndex(s => s.id === id);
    return i < 0 ? 0 : i;
  }

  function render() {
    const width = containerEl.clientWidth || 480;
    const h = height || containerEl.clientHeight || 220;
    svg.setAttribute('width', width);
    svg.setAttribute('height', h);
    svg.innerHTML = '';

    plot.left = CHART_MARGIN.left;
    plot.top = CHART_MARGIN.top;
    plot.w = Math.max(0, width - CHART_MARGIN.left - CHART_MARGIN.right);
    plot.h = Math.max(0, h - CHART_MARGIN.top - CHART_MARGIN.bottom);

    const n = data.x.length;
    xPixels = [];
    renderLegend();
    if (!n) return;

    const dateish = typeof data.x[0] === 'string';
    const xVals = data.x.map(chartParseX);
    const xMin = xVals[0];
    const xMax = xVals[n - 1];
    const xSpan = xMax - xMin || 1;
    const xScale = v => plot.left + ((v - xMin) / xSpan) * plot.w;
    for (let i = 0; i < n; i++) xPixels.push(n === 1 ? plot.left + plot.w / 2 : xScale(xVals[i]));

    // y domain across every series value and every band edge that survives - a null anywhere in
    // there must not collapse the range to [0, 0]
    let yMin = Infinity;
    let yMax = -Infinity;
    const noteY = v => {
      if (v === null || v === undefined || Number.isNaN(v)) return;
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    };
    data.series.forEach(s => (s.values || []).forEach(noteY));
    data.bands.forEach(b => { (b.lo || []).forEach(noteY); (b.hi || []).forEach(noteY); });
    if (yMin === Infinity) { yMin = 0; yMax = 1; }

    const yTicks = chartNiceTicks(yMin, yMax, 5);
    const yLo = yTicks[0];
    const yHi = yTicks[yTicks.length - 1];
    const yScale = v => plot.top + plot.h - ((v - yLo) / (yHi - yLo || 1)) * plot.h;

    const gridColor = chartCssVar('--grey-border', '#4a4a52');
    const textColor = chartCssVar('--text-dim', '#8b8b90');

    const axesGroup = chartSvgEl('g', {class: 'chart-axes'});
    yTicks.forEach(t => {
      const y = yScale(t);
      axesGroup.appendChild(chartSvgEl('line', {
        class: 'chart-gridline', x1: plot.left, x2: plot.left + plot.w, y1: y, y2: y,
        stroke: gridColor, 'stroke-width': 1, opacity: 0.35,
      }));
      const label = chartSvgEl('text', {
        class: 'chart-y-label', x: plot.left - 8, y: y + 4, 'text-anchor': 'end', fill: textColor,
      });
      label.textContent = yFormat(t);
      axesGroup.appendChild(label);
    });

    const granularity = dateish ? chartXGranularity(xMax - xMin) : null;
    const formatX = xFormat || chartDefaultXFormat(dateish, granularity);
    // ~90px per label, so a narrow panel does not run its dates into each other
    const targetTicks = Math.max(2, Math.min(8, Math.round(plot.w / 90)));
    const step = Math.max(1, Math.round((n - 1) / targetTicks) || 1);
    const xTickIdx = [];
    for (let i = 0; i < n; i += step) xTickIdx.push(i);
    if (xTickIdx[xTickIdx.length - 1] !== n - 1) xTickIdx.push(n - 1);
    xTickIdx.forEach(i => {
      const label = chartSvgEl('text', {
        class: 'chart-x-label', x: xPixels[i], y: plot.top + plot.h + 18,
        'text-anchor': 'middle', fill: textColor,
      });
      label.textContent = formatX(data.x[i]);
      axesGroup.appendChild(label);
    });
    svg.appendChild(axesGroup);

    // draw order: bands under lines, lines under markers, markers under the hover rule/overlay
    const bandsGroup = chartSvgEl('g', {class: 'chart-bands'});
    data.bands.forEach(band => {
      const color = seriesColor(band.series, seriesIndexOf(band.series));
      chartBandSegments(band.lo || [], band.hi || [], n).forEach(seg => {
        if (seg.length < 2) return;
        const top = seg.map(i => `${xPixels[i]},${yScale(band.hi[i])}`).join(' L ');
        const bottomIdx = seg.slice().reverse();
        const bottom = bottomIdx.map(i => `${xPixels[i]},${yScale(band.lo[i])}`).join(' L ');
        bandsGroup.appendChild(chartSvgEl('path', {
          class: 'chart-band', 'data-series': band.series, d: `M ${top} L ${bottom} Z`,
          fill: color, 'fill-opacity': 0.16, stroke: 'none',
        }));
      });
    });
    svg.appendChild(bandsGroup);

    const linesGroup = chartSvgEl('g', {class: 'chart-lines'});
    data.series.forEach((s, index) => {
      const color = seriesColor(s.id, index);
      chartSegments(s.values || []).forEach(seg => {
        if (seg.length === 1) {
          const i = seg[0];
          linesGroup.appendChild(chartSvgEl('circle', {
            class: 'chart-point', 'data-series': s.id,
            cx: xPixels[i], cy: yScale(s.values[i]), r: 3, fill: color,
          }));
          return;
        }
        const d = seg.map(i => `${xPixels[i]},${yScale(s.values[i])}`).join(' L ');
        const path = chartSvgEl('path', {
          class: 'chart-line', 'data-series': s.id, d: `M ${d}`,
          fill: 'none', stroke: color, 'stroke-width': 2,
        });
        if (s.dashed) path.setAttribute('stroke-dasharray', '6,4');
        linesGroup.appendChild(path);
      });
    });
    svg.appendChild(linesGroup);

    const markersGroup = chartSvgEl('g', {class: 'chart-markers'});
    (data.markers || []).forEach(m => {
      const mx = plot.left + ((chartParseX(m.x) - xMin) / xSpan) * plot.w;
      markersGroup.appendChild(chartSvgEl('line', {
        class: 'chart-marker-line', x1: mx, x2: mx, y1: plot.top, y2: plot.top + plot.h,
        stroke: textColor, 'stroke-width': 1, 'stroke-dasharray': '3,3',
      }));
      const label = chartSvgEl('text', {
        class: 'chart-marker-label', x: mx + 4, y: plot.top + 10, fill: textColor,
      });
      label.textContent = m.label || '';
      markersGroup.appendChild(label);
    });
    svg.appendChild(markersGroup);

    hoverRule.setAttribute('class', 'chart-hover-rule');
    hoverRule.setAttribute('y1', plot.top);
    hoverRule.setAttribute('y2', plot.top + plot.h);
    hoverRule.setAttribute('stroke', chartCssVar('--cream', '#e8ddc3'));
    hoverRule.setAttribute('stroke-width', 1);
    hoverRule.style.display = 'none';
    svg.appendChild(hoverRule);

    overlay.setAttribute('x', plot.left);
    overlay.setAttribute('y', plot.top);
    overlay.setAttribute('width', plot.w);
    overlay.setAttribute('height', plot.h);
    svg.appendChild(overlay);
  }

  function renderLegend() {
    legend.innerHTML = '';
    data.series.forEach((s, index) => {
      const item = document.createElement('div');
      item.className = 'chart-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'chart-legend-swatch';
      swatch.style.borderTopColor = seriesColor(s.id, index);
      swatch.style.borderTopStyle = s.dashed ? 'dashed' : 'solid';
      item.appendChild(swatch);
      const label = document.createElement('span');
      label.textContent = s.label || s.id;
      item.appendChild(label);
      legend.appendChild(item);
    });
  }

  // the readout at a hovered index - every visible series' value plus each band's range there.
  // index -1 (nothing hovered, or the pointer left) hides it rather than drawing an empty box
  function paintHover(index) {
    if (index < 0 || index >= xPixels.length) {
      hoverRule.style.display = 'none';
      tooltip.classList.add('hidden');
      return;
    }
    hoverRule.style.display = '';
    hoverRule.setAttribute('x1', xPixels[index]);
    hoverRule.setAttribute('x2', xPixels[index]);

    // labels and x values come from the host's data, so text nodes only - never innerHTML
    const values = {};
    tooltip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'chart-tooltip-head';
    head.textContent = String(data.x[index] ?? '');
    tooltip.appendChild(head);
    const addRow = (color, label, text) => {
      const swatch = document.createElement('span');
      swatch.className = 'chart-tooltip-swatch';
      if (color) swatch.style.background = color;
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('span');
      value.className = 'chart-tooltip-value';
      value.textContent = text;
      tooltip.append(swatch, name, value);
    };
    data.series.forEach((s, i) => {
      const v = (s.values || [])[index];
      values[s.id] = v === undefined ? null : v;
      addRow(seriesColor(s.id, i), s.label || s.id, v == null ? '-' : yFormat(v));
    });
    data.bands.forEach(band => {
      const lo = (band.lo || [])[index];
      const hi = (band.hi || [])[index];
      if (lo == null || hi == null) return;
      addRow('', 'range', `${yFormat(lo)} - ${yFormat(hi)}`);
    });
    tooltip.classList.remove('hidden');

    const left = xPixels[index] + 10;
    const wrapWidth = wrap.clientWidth || plot.left + plot.w + CHART_MARGIN.right;
    tooltip.style.left = `${left + 170 > wrapWidth ? Math.max(4, xPixels[index] - 178) : left}px`;
    tooltip.style.top = `${plot.top}px`;

    onHover?.({index, x: data.x[index], values});
  }

  overlay.addEventListener('mousemove', evt => paintHover(nearest(evt.clientX)));
  overlay.addEventListener('mouseleave', () => { paintHover(-1); onHover?.(null); });

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => render());
    resizeObserver.observe(containerEl);
  }

  function update(next = {}) {
    data = {
      x: next.x || [],
      series: next.series || [],
      bands: next.bands || [],
      markers: next.markers || [],
    };
    render();
  }

  function destroy() {
    if (resizeObserver) resizeObserver.disconnect();
    containerEl.innerHTML = '';
  }

  // exposed so a test (or a host wanting its own readout) can ask "which point is this pixel
  // closest to" without staging a real mouse event
  function nearest(clientX) {
    if (!xPixels.length) return -1;
    const rect = svg.getBoundingClientRect();
    const local = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xPixels.length; i++) {
      const dist = Math.abs(xPixels[i] - local);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  render();
  return {update, destroy, nearest};
}

window.timeChart = timeChart;
