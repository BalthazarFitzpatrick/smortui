// ONE MENU, MANY SHAPES. every floating panel in the review tool used to carry its own open,
// position and dismiss code, and the differences were not cosmetic - they were bugs:
//
//   - some popups had NO dismiss handler at all; clicking away left them open
//   - the one global handler hardcoded its trigger ids in a shared selector string,
//     so every new trigger had to be added to that string or the panel closed on its own click
//   - only the right-click menu cleared its selection on dismiss, and it only learned to after a
//     cmd-click selection survived a cancelled popup and got swept into the next action:
//     "remove 2 dim warlocks, way more disappeared"
//
// Balthazar Fitzpatrick asked for "a class (right click menu) that can have different sections and elements. It
// can be a simple list, it can be several columns, it can have rows, it can have buttons." so the
// sections are generic and the class owns anchor/clamp/dismiss/keyboard for all of them.

const MENU_MARGIN = 6;   // gap between a trigger and the panel under it
const MENU_EDGE = 4;     // closest the panel may sit to the viewport edge

let openMenu = null;

class Menu {
  // `adopt` takes an element that ALREADY EXISTS in the page and manages it instead of building
  // one. the right-click label menu is laid out in markup - three aligned columns whose widths are
  // measured against each other, a button row, an editable slug - and rebuilding that from
  // sections would risk the layout for no behavioural gain. what it actually needed from this
  // class is anchor / clamp / dismiss / one-at-a-time, which is what it gets.
  constructor({title = '', sections = [], onDismiss = null, adopt = null, columns = false} = {}) {
    this.title = title;
    this.columns = columns;
    this.sections = sections;
    this.onDismiss = onDismiss;
    this.adopt = adopt;
    this.el = null;
    this._onDocDown = evt => {
      if (this.el && !this.el.contains(evt.target) && evt.target !== this._trigger) this.close();
    };
    this._onKey = evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); this.close(); }
      else if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') this._move(evt);
      else if (evt.key === 'Enter') this._activate(evt);
    };
  }

  // ---- building ------------------------------------------------------------------
  _row(item, section) {
    const row = document.createElement('div');
    // `state` is an object of flags, each truthy one becoming a class - the SAME convention
    // renderTree has always used, rather than a second dialect for the same idea. the caller keeps
    // its own styling and this stays ignorant of what any flag means
    const flags = Object.entries(item.state || {})
      .filter(([, on]) => on).map(([name]) => name).join(' ');
    row.className = ['toggle', 'menu-item', item.on ? 'on' : '', item.disabled ? 'disabled' : '',
      flags].filter(Boolean).join(' ');
    row.dataset.id = item.id ?? item.label;
    const label = `<span class="name">${item.label}</span>`;
    const stats = item.stats ? `<span class="stats">${item.stats}</span>` : '';
    row.innerHTML = label + stats;
    if (item.stats) row.title = `${item.label} - ${item.stats}`;
    if (item.action) {
      // a trailing control, which is how "sources" gets its per-row close without a bespoke panel
      const act = document.createElement('span');
      act.className = 'menu-action';
      act.textContent = item.action.label;
      act.onclick = evt => { evt.stopPropagation(); item.action.onPick(item, this); };
      row.appendChild(act);
    }
    if (!item.disabled) {
      row.onclick = () => {
        if (section.multi) {
          row.classList.toggle('on');
          section.onPick?.(item, row.classList.contains('on'), this);
        } else {
          section.onPick?.(item, true, this);
          this.close();          // a single-select menu has done its job
        }
      };
    }
    return row;
  }

  _section(section) {
    const wrap = document.createElement('div');
    wrap.className = `menu-section menu-${section.kind}`;
    if (section.label) {
      const head = document.createElement('div');
      head.className = 'field-label';
      head.textContent = section.label;
      wrap.appendChild(head);
    }
    if (section.kind === 'add') {
      const row = document.createElement('div');
      row.className = 'menu-add';
      const input = document.createElement('input');
      input.className = 'text-field';
      input.placeholder = section.placeholder || 'new name';
      const btn = document.createElement('div');
      btn.className = 'toggle';
      btn.textContent = section.button || 'add';
      const submit = () => {
        const value = input.value.trim();
        if (value) section.onAdd?.(value, this);
      };
      btn.onclick = submit;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      row.append(input, btn);
      wrap.appendChild(row);
    } else if (section.kind === 'list') {
      if (!section.items.length) {
        const empty = document.createElement('span');
        empty.className = 'none';
        empty.textContent = section.empty || 'nothing here';
        wrap.appendChild(empty);
      }
      section.items.forEach(item => wrap.appendChild(this._row(item, section)));
    } else if (section.kind === 'columns') {
      const cols = document.createElement('div');
      cols.className = 'label-columns';
      section.columns.forEach((column, i) => {
        if (i) {
          const divider = document.createElement('div');
          divider.className = 'divider';
          cols.appendChild(divider);
        }
        const col = document.createElement('div');
        col.className = 'col';
        // A COLUMN MAY NAME ITSELF. a section label can only say one thing about the whole row of
        // columns, which is no use when the columns mean different things - "available" beside
        // "open" is the point of having them side by side at all
        if (column.label) {
          const head = document.createElement('div');
          head.className = 'field-label';
          head.textContent = column.label;
          col.appendChild(head);
        }
        if (!column.items.length && column.empty) {
          const empty = document.createElement('span');
          empty.className = 'none';
          empty.textContent = column.empty;
          col.appendChild(empty);
        }
        column.items.forEach(item => col.appendChild(
          this._row(item, {multi: column.multi ?? true, onPick: column.onPick})));
        cols.appendChild(col);
      });
      wrap.appendChild(cols);
    } else if (section.kind === 'buttons') {
      const row = document.createElement('div');
      row.className = 'menu-buttons';
      section.buttons.forEach(spec => {
        const btn = document.createElement('div');
        // `tone` is 'adds' or 'removes' - the two verbs that get a colour, see app.css
        btn.className = ['toggle', spec.tone, spec.enabled === false ? 'disabled' : '']
          .filter(Boolean).join(' ');
        btn.textContent = spec.label;
        btn.dataset.id = spec.id || spec.label;
        // CHECKED AT CLICK, not at build. an apply button starts disabled and goes live as rows
        // are picked, and a handler attached only to the enabled version can never be given one
        btn.onclick = () => { if (!btn.classList.contains('disabled')) spec.onClick?.(this); };
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    } else if (section.kind === 'node') {
      // THE ESCAPE HATCH: a section whose content the caller built. for anything the kinds above
      // do not describe - a slider pair, a preview, a canvas - without growing a kind per case.
      // the caller owns its wiring; this only places it and lets it inherit the panel's styling.
      wrap.appendChild(section.node);
    } else if (section.kind === 'field') {
      const input = document.createElement('input');
      input.className = 'text-field';
      input.value = section.value || '';
      input.placeholder = section.placeholder || '';
      input.oninput = () => section.onInput?.(input.value, this);
      wrap.appendChild(input);
    }
    return wrap;
  }

  _build() {
    if (this.adopt) {
      this.adopt.classList.remove('hidden');
      return this.adopt;
    }
    const el = document.createElement('div');
    // SIDE BY SIDE when asked for. sections stack by default, which is right for a short list
    // plus a footer - but two lists of the same kind read as one long scroll rather than a
    // choice between them, and the vertical divider is what makes them two things
    el.className = 'panel-floating menu-panel' + (this.columns ? ' menu-columns' : '');
    if (this.title) {
      const head = document.createElement('div');
      head.className = 'popup-title';
      head.textContent = this.title;
      el.appendChild(head);
      const rule = document.createElement('div');
      rule.className = 'h-divider';
      el.appendChild(rule);
    }
    // THE BODY IS ALWAYS ITS OWN ELEMENT, columns or not. it used to be `el` itself for a stacked
    // menu, which meant the whole panel scrolled - title, list and buttons together - so a long
    // list pushed its own apply button off the bottom and scrolled the heading out of sight on the
    // way to reaching it. Balthazar Fitzpatrick: "if the dialogue is too long, it should be scrollable in the
    // middle". title and footer are pinned; only this scrolls (see .menu-body in app.css).
    const body = document.createElement('div');
    body.className = this.columns ? 'menu-column-row' : 'menu-body';
    el.appendChild(body);

    // a `buttons` section is a FOOTER wherever it is declared - it is the panel's verbs, and a verb
    // that scrolls away with the list is one you have to hunt for
    const stacked = this.sections.filter(s => s.kind !== 'buttons');
    const footer = this.sections.filter(s => s.kind === 'buttons');
    stacked.forEach((section, i) => {
      if (i && section.rule !== false) {
        const rule = document.createElement('div');
        // a column split gets the VERTICAL rule, the same 2px inset one used everywhere else
        rule.className = this.columns ? 'divider' : 'h-divider';
        body.appendChild(rule);
      }
      body.appendChild(this._section(section));
    });
    footer.forEach(section => {
      if (stacked.length || footer.indexOf(section)) {
        const rule = document.createElement('div');
        rule.className = 'h-divider';
        el.appendChild(rule);
      }
      el.appendChild(this._section(section));
    });
    return el;
  }

  // REBUILD IN PLACE, keeping the panel where it is. A menu whose columns MOVE items between
  // themselves - available on one side, open on the other - has to redraw when you pick, and the
  // alternatives are both wrong: close-and-reopen flickers and loses the scroll, while mutating
  // the two columns by hand puts the layout in the caller and lets it drift from _section.
  //
  // The position is kept deliberately. Re-anchoring would let the panel jump as its content grows
  // or shrinks, which is exactly the moment you are reading it.
  refresh(sections) {
    if (!this.el) return;
    if (sections) this.sections = sections;
    const {left, top} = this.el.style;
    const rebuilt = this._build();
    rebuilt.style.left = left;
    rebuilt.style.top = top;
    this.el.replaceWith(rebuilt);
    this.el = rebuilt;
  }

  // a multi-select menu's apply button lives or dies by what is ticked, and only the caller knows
  // when that changed - so it says so rather than the class re-deriving it
  setButtonEnabled(id, on) {
    const btn = this.el?.querySelector(`.menu-buttons .toggle[data-id="${id}"]`);
    btn?.classList.toggle('disabled', !on);
  }

  // ---- keyboard ------------------------------------------------------------------
  _items() {
    return [...this.el.querySelectorAll('.menu-item:not(.disabled)')];
  }

  _move(evt) {
    const items = this._items();
    if (!items.length) return;
    evt.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = evt.key === 'ArrowDown'
      ? Math.min(items.length - 1, at + 1)
      : Math.max(0, at <= 0 ? 0 : at - 1);
    items[next].tabIndex = -1;
    items[next].focus();
  }

  _activate(evt) {
    const focused = document.activeElement;
    if (focused && this.el?.contains(focused) && focused.classList.contains('menu-item')) {
      evt.preventDefault();
      focused.click();
    }
  }

  // ---- lifecycle -----------------------------------------------------------------
  openAt(where) {
    // ONE AT A TIME. opening a second menu while another is up used to leave both on screen,
    // because each panel only knew how to hide itself
    if (openMenu && openMenu !== this) openMenu.close();
    if (this.el) this.close();

    this.el = this._build();
    if (!this.adopt) document.body.appendChild(this.el);
    this._trigger = where instanceof Element ? where : null;

    const rect = this.el.getBoundingClientRect();
    let left, top;
    if (this._trigger) {
      const box = this._trigger.getBoundingClientRect();
      left = box.left;
      top = box.bottom + MENU_MARGIN;
    } else {
      left = where.x;
      top = where.y;
    }
    // clamped into the viewport - a menu opened near the right or bottom edge used to render
    // half off screen, and only the right-click popup got this right
    this.el.style.left =
      `${Math.max(MENU_EDGE, Math.min(left, window.innerWidth - rect.width - MENU_EDGE))}px`;
    this.el.style.top =
      `${Math.max(MENU_EDGE, Math.min(top, window.innerHeight - rect.height - MENU_EDGE))}px`;

    openMenu = this;
    // the head shows it is open, the way a dropdown does everywhere else
    this._trigger?.classList.add('open');
    // mousedown, not click: a click handler fires after the trigger's own, which reopens what it
    // just closed. deferred so the opening click does not immediately dismiss it
    setTimeout(() => {
      document.addEventListener('mousedown', this._onDocDown);
      document.addEventListener('keydown', this._onKey);
    }, 0);
    // FOCUS THE PANEL, NOT A ROW. this focused the first item so arrows worked immediately, and
    // that lit it up: :focus-visible matched a programmatic focus before any pointer interaction
    // and stopped matching after one, so row one wore a heavy cream glow on the page's first open
    // and a plain border every time after. Worse than the inconsistency, it highlighted a choice
    // nobody made. _move resolves indexOf(-1) to row one in both directions, so the first arrow
    // press still enters the list at the top.
    this.el.tabIndex = -1;
    this.el.focus();
    return this;
  }

  close() {
    document.removeEventListener('mousedown', this._onDocDown);
    document.removeEventListener('keydown', this._onKey);
    this._trigger?.classList.remove('open');
    // an adopted element belongs to the page, so it is hidden rather than destroyed
    if (this.el) {
      if (this.adopt) this.el.classList.add('hidden');
      else this.el.remove();
      this.el = null;
    }
    if (openMenu === this) openMenu = null;
    // ALWAYS, however it was dismissed. the caller uses this to drop a selection that would
    // otherwise ride along into the next action
    this.onDismiss?.();
  }

  get isOpen() { return this.el !== null; }
}

// convenience for the commonest shape by far: a titled single-select list
function listMenu(title, items, onPick, extra = {}) {
  return new Menu({
    title,
    sections: [{kind: 'list', items, onPick: item => onPick(item), ...extra}],
    onDismiss: extra.onDismiss,
  });
}

window.Menu = Menu;
window.listMenu = listMenu;

// ---- tree: a grouped list of items, with headings and per-row badges -------------------
// SHARED WITH AN INLINE LIST, not just menus. the interface tab renders the same shape directly
// into a panel rather than into a floating one, which is the whole reason this is a free function
// taking a container instead of a method on Menu. Balthazar Fitzpatrick asked for "the hierarchical item lists
// like the ones on the interface tab" to be one of the unified elements.
//
// an item is either {heading} or {id, label, badges: [], state: {}, title, onPick}. state carries
// the row's flags - the interface list uses marked / needed / on - and each becomes a class, so
// the caller keeps its own styling without this needing to know what any of them mean.
function renderTree(container, items, {itemClass = ''} = {}) {
  container.innerHTML = '';
  items.forEach(item => {
    if (item.heading) {
      const head = document.createElement('div');
      head.className = 'field-label tree-group';
      head.textContent = item.heading;
      container.appendChild(head);
      return;
    }
    const row = document.createElement('div');
    const flags = Object.entries(item.state || {})
      .filter(([, on]) => on).map(([name]) => name).join(' ');
    row.className = ['toggle', 'tree-item', itemClass, flags].filter(Boolean).join(' ');
    row.dataset.id = item.id ?? item.label;
    row.innerHTML = (item.dot === false ? '' : '<span class="dot"></span>')
      + `<span class="name">${item.label}</span>`
      + (item.badges || []).map(b => `<span class="coords">${b}</span>`).join('');
    if (item.title) row.title = item.title;
    if (item.onPick) row.onclick = () => item.onPick(item, row);
    container.appendChild(row);
    // a selected row can open rows of its own beneath it, which is how the interface tab puts an
    // element's states under the element rather than in a control at the far end of the panel
    (item.children || []).forEach(child => container.appendChild(child));
  });
}

window.renderTree = renderTree;

// ---- slider: a value on an axis, for anything continuous ------------------------------
// a threshold is a POSITION ON A RANGE, not one of seven listed numbers, and a dropdown of
// discrete choices hides that. the axis shows where the value sits between its ends, which is the
// thing you actually reason about when a model's peaks top out at 0.33 against a floor of 0.5.
function makeSlider(container, {
  id = '', label = '', min = 0, max = 1, step = 0.01, value = 0.5,
  format = v => v.toFixed(2), onChange = null, onCommit = null, distribution = null,
} = {}) {
  container.innerHTML = '';
  container.classList.add('slider');

  if (label) {
    const head = document.createElement('div');
    head.className = 'field-label slider-label';
    head.textContent = label;
    container.appendChild(head);
  }

  // the distribution sits OVER the axis as its own row: 2.5% buckets, one bar each, so the cut is
  // chosen against what the model actually answered rather than guessed
  const chart = document.createElement('div');
  chart.className = 'slider-dist';
  container.appendChild(chart);

  const axis = document.createElement('div');
  axis.className = 'slider-axis';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  if (id) input.id = id;
  axis.appendChild(input);
  container.appendChild(axis);

  const ends = document.createElement('div');
  ends.className = 'slider-ends';
  ends.innerHTML = `<span>${format(min)}</span><span class="slider-value">${format(value)}</span>`
    + `<span>${format(max)}</span>`;
  container.appendChild(ends);

  const readout = ends.querySelector('.slider-value');
  const minLabel = ends.firstElementChild;
  const maxLabel = ends.lastElementChild;
  // MONOSPACE, so a character count is a real width rather than a guess - app.css sets the page
  // font to SF Mono/Menlo throughout. ~0.62em per glyph at this weight; the end labels run 10.5px,
  // the readout 11.5px (see .slider-ends / .slider-ends .slider-value in app.css).
  const charWidth = text => text.length * 10.5 * 0.62;
  const readoutWidth = text => text.length * 11.5 * 0.62;
  const paint = () => {
    const v = Number(input.value);
    const text = format(v);
    readout.textContent = text;
    // the readout tracks the handle, CLAMPED away from the end labels it shares a row with.
    //
    // WHY NOT offsetWidth, tried first and still wrong: makeSlider runs at page load, for every
    // slider on the page, including ones on tabs that start `.hidden` (display:none) until
    // clicked - this one included, since only "find" is visible at load. offsetWidth inside a
    // display:none subtree reads 0, so the very first paint() baked in a near-zero margin and
    // nothing ever repainted it, because no input event fires on a slider nobody has touched yet.
    // A measurement doesn't have a display:none problem if it never asks the DOM to lay out.
    const pct = (v - min) / (max - min);
    const raw = pct * ends.clientWidth || pct * container.clientWidth || pct * 190;
    const gap = 6;
    const low = charWidth(minLabel.textContent) + gap + readoutWidth(text) / 2;
    const width = ends.clientWidth || container.clientWidth || 190;
    const high = width - charWidth(maxLabel.textContent) - gap - readoutWidth(text) / 2;
    const clamped = Math.max(low, Math.min(high, raw));
    readout.style.left = `${clamped}px`;
    return v;
  };
  // counts span orders of magnitude - hundreds of thousands of quiet cells against a handful of
  // loud ones - so the height is LOG scaled. a linear bar chart of this shows one spike and
  // nineteen invisible buckets, which answers nothing
  const drawDistribution = counts => {
    chart.innerHTML = '';
    if (!counts || !counts.length) { chart.classList.remove('has-data'); return; }
    chart.classList.add('has-data');
    const top = Math.log10(Math.max(...counts, 1) + 1) || 1;
    counts.forEach(n => {
      const cell = document.createElement('div');
      cell.className = 'slider-bin';
      const h = Math.round((Math.log10(n + 1) / top) * 100);
      cell.innerHTML = `<span style="height:${n ? Math.max(h, 3) : 0}%"></span>`;
      chart.appendChild(cell);
    });
  };
  drawDistribution(distribution);

  // PAINT FIRST, THEN NOTIFY. this was `onChange?.(paint(), input)` - and optional chaining does
  // not evaluate its arguments when the call short-circuits, so a slider given no onChange never
  // repainted and its readout sat at the initial value forever. the display is not the caller's
  // job to trigger.
  input.oninput = () => {
    const value = paint();
    onChange?.(value, input);
  };
  input.onchange = () => onCommit?.(Number(input.value), input);
  paint();
  return {
    input,
    value: () => Number(input.value),
    set: v => { input.value = String(v); paint(); },
    setDistribution: drawDistribution,
  };
}

window.makeSlider = makeSlider;

// ---- pan and zoom ---------------------------------------------------------------------
// EXTRACTED FROM THE INTERFACE TAB so the cnn's heatmap view can have the same one. Balthazar Fitzpatrick:
// "clicking into it to pan and zoom and reset would be nice, the way that we do with the
// interface. That tool could be reused here."
//
// the stage is transformed, not the image, so anything else inside it (an overlay canvas, marks)
// moves with the picture and no coordinate conversion has to be got right at every zoom level.
// `fit` decides what reset() means:
//   'width'   - fit the width, never past 1:1. the interface tab wants this: a rect is marked on a
//               3420-wide capture and blowing a small screenshot up past its own pixels would
//               invite marking against interpolated ones.
//   'contain' - fit BOTH axes and scale UP when the frame is smaller than the viewport, so the
//               picture is as large as it can be with all of it visible. Balthazar Fitzpatrick, on the find tab:
//               "fill width (or height) as far as it gets without the other one flowing over the
//               screen border" - a 768-wide frame in a 1900-wide panel sat letterboxed and small
//               under the 'width' rule, because that rule caps at 1:1 and never grows anything.
function makePanZoom(wrap, stage, {
  onChange = null, maxZoom = 12, minZoom = 0.05, panModifier = 'shift', fit = 'width',
} = {}) {
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  const apply = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    onChange?.(zoom);
  };

  // RESET MEANS CENTRED, not just unzoomed. setting the scale back to 1 and leaving the pan alone
  // left the picture wherever it had been dragged to, which reads as the button half working.
  const reset = (naturalWidth = 0, naturalHeight = 0) => {
    if (!naturalWidth) {
      zoom = 1;
    } else if (fit === 'contain' && naturalHeight) {
      // the binding axis wins and the picture may grow past 1:1 - see `fit` above. clamped to the
      // same bounds the wheel obeys so reset can never land somewhere zooming cannot return from
      const both = Math.min(wrap.clientWidth / naturalWidth, wrap.clientHeight / naturalHeight);
      zoom = Math.min(maxZoom, Math.max(minZoom, both));
    } else {
      zoom = Math.min(1, wrap.clientWidth / naturalWidth);
    }
    const width = (naturalWidth || stage.offsetWidth) * zoom;
    const height = (naturalHeight || stage.offsetHeight) * zoom;
    panX = (wrap.clientWidth - width) / 2;
    panY = (wrap.clientHeight - height) / 2;
    apply();
  };

  // plain wheel zooms, ANCHORED ON THE POINTER - zooming about the corner walks whatever you are
  // aiming at off screen, which is the thing zoom exists to prevent
  wrap.addEventListener('wheel', evt => {
    evt.preventDefault();
    const box = wrap.getBoundingClientRect();
    const mx = evt.clientX - box.left;
    const my = evt.clientY - box.top;
    // WITH SHIFT HELD A BROWSER SENDS THE WHEEL AS deltaX, NOT deltaY. reading deltaY alone made
    // it 0 in both directions, so every shift+scroll took the zoom-out branch and the image only
    // ever shrank. take whichever axis actually moved.
    const delta = evt.deltaY || evt.deltaX;
    if (!delta) return;
    const factor = delta < 0 ? 1.12 : 1 / 1.12;
    const next = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
    panX = mx - (mx - panX) * (next / zoom);
    panY = my - (my - panY) * (next / zoom);
    zoom = next;
    apply();
  }, {passive: false});

  // the modifier keeps a plain drag free for whatever the host uses it for - marking, on the
  // interface tab. pass panModifier: null where a plain drag should pan.
  let pan = null;
  wrap.addEventListener('mousedown', evt => {
    if (panModifier && !evt[`${panModifier}Key`]) return;
    evt.preventDefault();
    pan = {x: evt.clientX, y: evt.clientY, px: panX, py: panY};
  });
  window.addEventListener('mousemove', evt => {
    if (!pan) return;
    panX = pan.px + (evt.clientX - pan.x);
    panY = pan.py + (evt.clientY - pan.y);
    apply();
  });
  window.addEventListener('mouseup', () => { pan = null; });

  apply();
  return {reset, apply, zoom: () => zoom, set: z => { zoom = z; apply(); }};
}

window.makePanZoom = makePanZoom;
