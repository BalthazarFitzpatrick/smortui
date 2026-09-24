# ui_base — reference for an agent

read this before writing any interface code against this package. it is the precise contract; the
`README.md` beside it is prose for a human.

**what this is.** one stylesheet and a dozen plain scripts that a local python tool serves, giving
menus, dropdowns, a tab shell, sliders, pan/zoom, crop alignment, selection, an edge drawer, an
expanding strip, help tips, and the card/fan/pile board layout. no build step, no framework, no npm.
`README.md`'s components table is the one-line-per-file index; this file is the contract per api.

**what this is not.** it has no application logic, no persistence, and no opinion about your data.
every component owns interaction and rendering only. where a component could plausibly save
something, it deliberately does not — the host decides.

---

## serving it

```python
from ui_base import ASSETS, asset_names, content_type, read_asset, UiBaseError

read_asset(name)   -> bytes     # one asset; raises UiBaseError for anything outside ASSETS
asset_names()      -> list[str] # every file you may serve
content_type(name) -> str       # "text/css" / "application/javascript" / octet-stream
ASSETS             -> Path      # the directory itself
```

`read_asset` resolves the path then checks containment, rather than string-matching on `..`. do not
reimplement this check in your handler; call `read_asset` and map `UiBaseError` to a 404.

**serve your own files first, fall back to this package.** that lets a tool override a shared file by
dropping one of the same name beside its own, without editing the package other tools read.

```python
target = (YOUR_UI_DIR / name).resolve()
if YOUR_UI_DIR.resolve() in target.parents and target.is_file():
    data = target.read_bytes()
else:
    data = read_asset(name)  # UiBaseError -> 404
```

set `Content-Type` from `content_type(name)` rather than `mimetypes`, which answers
`text/javascript` on one python and `application/javascript` on another, and send
`Cache-Control: no-store` while developing, or an edit looks like it did nothing.

## loading it in the page

order is load-bearing.

```html
<link rel="stylesheet" href="/ui/base.css">     <!-- first: yours must be able to override it -->
<link rel="stylesheet" href="/ui/your-layout.css">
<script src="/ui/menu.js"></script>
<script src="/ui/shell.js"></script>            <!-- before the script that calls initShell -->
<!-- each of the rest only if you use it: align.js select.js buckets.js expand.js drawer.js
     indicate.js help.js entrytext.js pile.js -->
```

scripts define globals; there are no modules and no imports. every script is independent of the
others except that `menu.js` must come before anything that opens a `Menu`.

**teardown.** a component that listens on `window` or `document` returns `destroy()`:
`makeAligner`, `makePanZoom`, `makeSelection`, `makeDrawer`, `makeExpander`. a host that rebuilds
the element it mounted on must call it, or every rebuild leaves one more listener behind. a host that
mounts once for the page's life can ignore it. `Menu` cleans up on `close()` and `helpTip`,
`indicateFocus` and `initShell` are page-lifetime singletons by design.

---

## `shell.js`

```js
initShell({onEnter = () => {}, fallback = ''})
activateTab(name)
```

**markup contract.** `initShell` finds elements by class and reads `data-` attributes. get these
wrong and it silently does nothing.

- the bar: `class="nav-bar"` (the `#nav-bar` id still works, from before the class existed)
- every tab button: `class="nav-tab" data-tab="<name>"`
- every panel: `class="tab-panel" data-panel="<name>"`
- a hidden panel gets `class="hidden"`, which `base.css` defines as `display: none !important`

**behaviour.** click and arrow-key navigation (left/right wrap), enter/space activate, `aria-selected`
maintained, and only the active tab sits in the tab order. the active tab is remembered in
`localStorage` under `ui-base:tab`. a remembered tab whose button no longer exists falls through to
`fallback`, which is what makes deleting a tab safe for whoever was last on it.

`onEnter(name)` fires on every activation including the initial one. put per-tab loading there.

## `menu.js`

### `Menu`

```js
new Menu({title = '', sections = [], onDismiss = null, adopt = null, columns = false})
  .openAt(triggerElement)     // anchored below it
  .openAt({x, y})             // for a right-click
  .close()
```

one class for every popup: dropdowns, context menus, pickers. `columns: true` lays sections side by
side split by a vertical rule.

**`onDismiss` always fires**, on pick and on cancel alike. this is not optional politeness — a popup
that reports nothing on cancel leaves a stale selection alive, which the next interaction picks up
and applies to the wrong thing.

the class owns anchoring, viewport clamping, one-menu-at-a-time, dismissal on outside click and
escape, and arrow/enter/space keyboard navigation. **never reimplement any of that at a call site**, and
never add a global dismiss handler that names trigger ids — a shared selector string means every new
menu must be added to it or it closes on its own opening click.

**section kinds.** each section is an object with a `kind`:

| kind | for |
|---|---|
| `list` | rows, with optional `stats`, `on`, `disabled`, and a trailing `action` control |
| `columns` | two or more multi-select axes side by side, split by dividers |
| `add` | a "+ new" row: a text field plus a button |
| `field` | a single text input |
| `buttons` | a footer row of actions |
| `node` | escape hatch — content you built, placed and styled by the panel |

reach for `node` last. if you find yourself building a list by hand inside a `node`, use `list`.

### `listMenu(title, items, onPick, extra = {})`

the one-liner for the common case: a flat list of choices. use this rather than constructing a
`Menu` with a single `list` section. `extra.onDismiss` goes to the menu; anything else goes onto
the section.

### `dirMenu(title, fetchDir, onPick, {start = '', onDismiss = null})`

a persistent menu that walks a tree. the host supplies `fetchDir(path) -> {path, parent, dirs,
files}` (`parent` null at the root); folder rows drill in, `..` goes up, a file row calls
`onPick(fullPath)` and closes. only the latest navigation may draw, so a slow earlier fetch never
overwrites the folder you have moved on to. filtering what shows is the host's, in `fetchDir`.

### `renderTree(container, items, {itemClass = ''})`

nested rows with expand/collapse, for hierarchical pickers.

### `makeSlider(container, opts)`

```js
makeSlider(container, {
  id, label, min = 0, max = 1, step = 0.01, value = 0.5,
  format = v => v.toFixed(2),
  onChange = null,     // every movement
  onCommit = null,     // release - put expensive work here
  distribution = null, // array of bucket counts, drawn behind the axis
})
```

an axis with ticks rather than a number field, because a threshold is a position in a range.

**pass `distribution` whenever the value is a cut through data.** "no results" and "no results
because your cut sits above every value in the data" look identical until something draws the shape.
each bucket scales to its own peak so a handful of strong responses stays visible against a tall
noise floor.

the readout is painted by the slider itself and does not depend on `onChange` being supplied.

### `makePanZoom(wrap, stage, opts)`

```js
makePanZoom(wrap, stage, {
  onChange = null, maxZoom = 12, minZoom = 0.05, panModifier = 'shift', fit = 'width',
})
  -> {reset(naturalWidth, naturalHeight), apply, zoom(), set(z), destroy()}
```

wheel zoom anchored on the pointer, drag to pan (with the modifier held, or `panModifier: null`
for a plain drag), and `reset(width, height)` to fit **and centre** — resetting the scale without
recentring leaves the picture wherever it was dragged, which reads as a button that half works.
`fit: 'width'` fits the width and never grows past 1:1; `fit: 'contain'` fits both axes and may
grow.

two things it already handles, so do not add them: zooming about a corner walks the target off
screen, and with a modifier held the browser delivers wheel movement as `deltaX`, so reading `deltaY`
alone makes every modified scroll take the zoom-out branch.

## `chart.js`

```js
const chart = timeChart(containerEl, {height, yFormat, xFormat, onHover})
chart.update({
  x: [...],                // shared x values: ISO date strings or numbers, ascending
  series: [{id, label, values: [...], dashed: false}],   // null in values breaks the line
  bands: [{id, series: seriesId, lo: [...], hi: [...]}], // shaded area between lo and hi, same length as x
  markers: [{x, label}],   // vertical rule + small label
})
chart.destroy()
chart.nearest(clientX)     // index of the closest x to a pixel position - what drives the hover
```

one svg time-series primitive: a history line, a forecast line (draw it as its own series with
`dashed: true`), an 80% band, and vertical markers for train/val/test splits or the forecast origin.
breaking down by up to a few dimensions is just more entries in `series` — nothing here knows what
a dimension is.

**sizing.** sizes to the container's width and re-renders on a `ResizeObserver`, which is
disconnected in `destroy()`. `height` defaults to the container's own height; give it one
explicitly if the container has none yet (a hidden tab, for instance — same reason `makeSlider`
measures rather than trusts `offsetWidth`).

**a `null` in `values` (or in either half of a band) is a real break**, not a value to interpolate
across — it renders as two separate paths either side of the gap. a series with exactly one
non-null value draws as a point, not an invisible zero-length line. an empty `update()` and an
all-null series both render nothing and throw nothing.

**colour.** cycled from `base.css`'s own tokens (`--lichen`, `--kingfisher`, `--stone-red-lift`,
`--vanilla`, `--burnt-orange`, `--lichen-deep`), read live via `getComputedStyle` so a theme change
is picked up on the next render — never hardcoded, and never assuming dark. a band is drawn in its
series' colour at low opacity. each token carries a literal fallback for a page that forgot to load
`base.css`.

**axes.** a y axis with 4–6 "nice" ticks (rounded to 1/2/5 × 10^n). the x axis picks week/month/year
formatting from the data's own span when `x` holds dates, and spaces ticks by an approximate pixel
budget rather than by a fixed count, so a narrow panel does not run its labels into each other.
`xFormat`/`yFormat` override the label text; they never touch tick placement.

**hover.** a vertical rule snaps to the nearest x and a small readout lists every visible series'
value there, plus each band's range. `onHover({index, x, values})` fires on move and `onHover(null)`
on the pointer leaving; `chart.nearest(clientX)` is the same lookup exposed directly, which is what
a test drives instead of staging a real mouse event.

**what it deliberately does not do.** no zoom or pan, no legend toggling, no per-series colour
override, no drawing beyond the series/bands/markers it is given, and no data fetching or
resampling — the host decides what `x` and `series` are before calling `update()`.

## `align.js`

```js
makeAligner({viewport, rect, bounds, target, scale, preview = null, onChange = () => {}})
```

drag an image under a fixed guide, `wasd` for 1px steps, clamped to the crop, with an optional live
preview. `target` is the guide's own drawn width, which need not equal the rect's.

**it owns no persistence.** the host decides where a corrected rect goes. preserve that if you extend
it — it is what makes the component reusable.

---

## `base.css`

six rules carry the look. override by redefining tokens, never by fighting the rules.

1. **one row height app-wide** (`--row-height`) — every row and button, so nothing reads as a
   different size class.
2. **one clickable class**, `.toggle` — buttons, list rows, filter pills, dropdown heads.
3. **dividers never touch the container edge.** 15px inset, 2px thick, matching button borders — a
   1px rule beside 2px buttons reads as a different system.
4. **selection is bright, rejection is muted.** rejecting is a decision, not an achievement; giving
   it the accent makes a wall of rejections look like a wall of wins.
5. **text stays selectable.** `user-select: none` on controls also makes every name and readout
   uncopyable, which costs more than the stray drag-select it prevents.
6. **monospace throughout** — these tools show filenames, counts and coordinates, and those line up
   or they are not readable.

### focus and selected

**one focus look, drawn by one rule** (`.focus-glow:focus`'s). controls wear it at the soft
strength with no class: `.toggle` on `:focus-visible`, `.menu-item` and `.text-field` on `:focus`,
and everything else focusable (links, `<summary>`, `.nav-tab`, `tabindex` surfaces) through a
`:where(:focus-visible)` default at zero specificity. a bare `.focus-glow` - a card on a board - is
the loud strength; `.focus-glow.focus-glow-soft` a quieter surface; `.focus-glow-within` lights a
container on `:focus-within`. `.panel-floating` wears no focus frame and keeps its drop shadow.
**never add a second focus ring or restate the rule** - add a selector to the rule's list instead.

`.toggle.on` is accent fill plus a cream border; `a` is `--link`; headings are `--font-size`,
cream, normal weight. consumers do not restate any of these.

### theming

`.edge-pulse` adds a breathing ring and a drifting inner glow. it reserves `::before` and
`::after`, leaves focus transforms and filters alone, and ignores pointer input. override
`--ambient-pulse-*` tokens to tune the colour, periods, opacity, width, blur, spread and reach.
reduced motion keeps a static ring and glow. pair the effect with a text label in the host.

**the palette is dark, and there is one of it.** `base.css` carries no `prefers-color-scheme`
block and no `[data-theme]` rule today; a host wanting a light look redefines the tokens itself.
if a second palette is ever added here, these are the rules, and `tests/test_stylesheet.py` already
guards the first two:

- the bare `:root` block defines the **complete** palette
- a `@media (prefers-color-scheme: ...)` block redefines only tokens, guarded
  `:root:not([data-theme="..."])`, and `:root[data-theme="..."]` redefines them again so an
  explicit toggle wins over the system setting
- **never give a colour its only definition inside a media or `[data-theme]` block** — it will be
  undefined for everyone whose root carries no attribute, which is the default

style components through tokens, never with literals.

### the palette

neutrals do the work. **two hues only**, because a colour that appears everywhere stops meaning
anything. `--status-good`, `--status-warn` and `--attention` point at them, so repalette by moving
the pointer. **nothing uses `--attention` by default** — an always-on attention colour is not one.

`--lichen-deep` is a fill, **not a bed for cream text**: cream on it is 3.00, under the 4.5 text
needs.

---

## recipes

`docs/recipes/index.json` is a manifest of reusable *patterns* - compositions of the primitives
above, as opposed to `README.md`'s `## Components` table, which documents single files. read the
manifest alone to know what exists before reading anything else; it is small on purpose.

```json
[
  {
    "id": "kebab-case, stable - other files may link to it",
    "title": "a short human title",
    "summary": "one sentence, generic - no application vocabulary, same rule as every component",
    "primitives": ["menu.js:Menu"],
    "tags": ["menu", "list", "field"],
    "file": "docs/recipes/<id>.md",
    "demo": {"panel": "menus", "selector": "#open-x"},
    "added": "YYYY-MM-DD"
  }
]
```

`demo.selector` must exist in `demo/index.html`, or `null` if the recipe has no live demo yet.
`file` must exist under `docs/recipes/`. `tests/test_recipes.py` guards both against drift.

**adding a recipe**: write `docs/recipes/<id>.md` in the readme's own voice (why, one runnable
snippet, a note on when the shape is wrong), add one block to an existing `demo/index.html` panel
that exercises it live, and append one entry to `index.json`. a recipe never introduces a new
`menu.js` section kind - if the pattern needs one, it belongs in `menu.js` itself and in
`## Components`, not here.

## rules for extending this package

- **comments follow the global rule: lowercase, no capital letters, no period at the end, one to
  three lines per block.** keep the reason (the failure the code answers), drop the narrative. the
  older comments in these files were written in a longer capitalised style; convert one when you
  touch its block, never in a drive-by. decided 2026-09-22.

- **a component that could save something must not.** interaction and rendering only.
- **no component may know an application's vocabulary.** no domain nouns in class names, ids,
  storage keys or comments. storage keys are namespaced `ui-base:*`.
- **keep the reasons in the comments.** every behaviour here was paid for by a real failure; a
  comment saying only what the code does invites someone to "simplify" the fix away.
- **a component that listens on `window` returns `destroy()`.** see teardown above; `tests/js/
  listeners.mjs` proves each one lets go of everything it registered.
- **tests live in `tests/`**, one module per failure class: `test_serving.py` (serving what it
  should not, failing to serve what a consumer links), `test_scripts.py` (every script parses and
  every `tests/js/*.mjs` runner passes under node, discovered by glob; `RUNNER_FOR` there names
  which runner proves which script, and a new script must be added or excused) and
  `test_stylesheet.py` (every rule `base.css`'s header promises), plus `test_demo.py`, the
  whole-system test: the demo served by its own handler in headless chromium, every tab, every
  recipe trigger, zero console errors (needs `uv sync --group shots` and
  `uv run playwright install chromium`; skipped without them locally, required under ci).
  `tests/expected.py` is the named asset list. `uv run pytest` runs all of it. a runner that needs
  a dom imports `tests/js/_dom.mjs` (the one shared stub: `element()`, `installDom()`,
  `liveListeners()`); never hand-roll a second one.
- **`CHANGELOG.md` gets a line for every consumer-visible change** under `Unreleased`, moved
  under the tag when one is cut. a consumer reads it to bump a pin; `git log` is for us.

## lowercase

everything you produce is lowercase, in text and code: replies, docs and headings,
comments, commits, pr text, release notes, ui strings, log messages. case stays only where it
carries meaning — identifiers a language or tool dictates (class names, constants, env vars),
existing names quoted verbatim, text quoted from others.

## releases

once the human has merged into `main`, draft a release unasked: next tag (pre-1.0:
minor for features or a changed default, patch for fixes only), notes in their voice via
`write-like-fabs` — an upgrading section first (backup, migrations, changed defaults, rebuilds),
then changes by area, every pr since the last tag. `gh release create <tag> --draft --target main`
only; never publish, never push a tag. share the draft link.
