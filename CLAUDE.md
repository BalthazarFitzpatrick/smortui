# ui_base — reference for an agent

Read this before writing any interface code against this package. It is the precise contract; the
`README.md` beside it is prose for a human.

**What this is.** One stylesheet and three scripts that a local Python tool serves, giving menus,
dropdowns, a tab shell, sliders, pan/zoom and crop alignment. No build step, no framework, no npm.

**What this is not.** It has no application logic, no persistence, and no opinion about your data.
Every component owns interaction and rendering only. Where a component could plausibly save
something, it deliberately does not — the host decides.

---

## Serving it

```python
from ui_base import ASSETS, asset_names, read_asset, UiBaseError

read_asset(name) -> bytes     # one asset; raises UiBaseError for anything outside ASSETS
asset_names()    -> list[str] # every file you may serve
ASSETS           -> Path      # the directory itself
```

`read_asset` resolves the path then checks containment, rather than string-matching on `..`. Do not
reimplement this check in your handler; call `read_asset` and map `UiBaseError` to a 404.

**Serve your own files first, fall back to this package.** That lets a tool override a shared file by
dropping one of the same name beside its own, without editing the package other tools read.

```python
target = (YOUR_UI_DIR / name).resolve()
if YOUR_UI_DIR.resolve() in target.parents and target.is_file():
    data = target.read_bytes()
else:
    data = read_asset(name)  # UiBaseError -> 404
```

Set `Content-Type` from the extension (`.css` → `text/css`, `.js` → `application/javascript`) and
send `Cache-Control: no-store` while developing, or an edit looks like it did nothing.

## Loading it in the page

Order is load-bearing.

```html
<link rel="stylesheet" href="/ui/base.css">     <!-- FIRST: yours must be able to override it -->
<link rel="stylesheet" href="/ui/your-layout.css">
<script src="/ui/menu.js"></script>
<script src="/ui/shell.js"></script>            <!-- BEFORE the script that calls initShell -->
<script src="/ui/align.js"></script>            <!-- only if you need crop alignment -->
```

Scripts define globals; there are no modules and no imports.

---

## `shell.js`

```js
initShell({onEnter = () => {}, fallback = ''})
activateTab(name)
```

**Markup contract.** `initShell` finds elements by class and reads `data-` attributes. Get these
wrong and it silently does nothing.

- every tab button: `class="nav-tab" data-tab="<name>"`
- every panel: `class="tab-panel" data-panel="<name>"`
- a hidden panel gets `class="hidden"` — your stylesheet must define `.hidden { display: none }`

**Behaviour.** Click and arrow-key navigation (left/right wrap), Enter/Space activate, `aria-selected`
maintained, and only the active tab sits in the tab order. The active tab is remembered in
`localStorage` under `ui-base:tab`. A remembered tab whose button no longer exists falls through to
`fallback`, which is what makes deleting a tab safe for whoever was last on it.

`onEnter(name)` fires on every activation including the initial one. Put per-tab loading there.

## `menu.js`

### `Menu`

```js
new Menu({title = '', sections = [], onDismiss = null, adopt = null, columns = false})
  .openAt(triggerElement)     // anchored below it
  .openAt({x, y})             // for a right-click
  .close()
```

One class for every popup: dropdowns, context menus, pickers. `columns: true` lays sections side by
side split by a vertical rule.

**`onDismiss` ALWAYS fires**, on pick and on cancel alike. This is not optional politeness — a popup
that reports nothing on cancel leaves a stale selection alive, which the next interaction picks up
and applies to the wrong thing.

The class owns anchoring, viewport clamping, one-menu-at-a-time, dismissal on outside click and
Escape, and arrow/Enter keyboard navigation. **Never reimplement any of that at a call site**, and
never add a global dismiss handler that names trigger ids — a shared selector string means every new
menu must be added to it or it closes on its own opening click.

**Section kinds.** Each section is an object with a `kind`:

| kind | for |
|---|---|
| `list` | rows, with optional `stats`, `on`, `disabled`, and a trailing `action` control |
| `columns` | two or more multi-select axes side by side, split by dividers |
| `add` | a "+ new" row: a text field plus a button |
| `field` | a single text input |
| `buttons` | a footer row of actions |
| `node` | escape hatch — content you built, placed and styled by the panel |

Reach for `node` last. If you find yourself building a list by hand inside a `node`, use `list`.

### `listMenu(title, items, onPick, extra = {})`

The one-liner for the common case: a flat list of choices. Use this rather than constructing a
`Menu` with a single `list` section.

### `renderTree(container, items, {itemClass = ''})`

Nested rows with expand/collapse, for hierarchical pickers.

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

An axis with ticks rather than a number field, because a threshold is a position in a range.

**Pass `distribution` whenever the value is a cut through data.** "No results" and "no results
because your cut sits above every value in the data" look identical until something draws the shape.
Each bucket scales to its own peak so a handful of strong responses stays visible against a tall
noise floor.

The readout is painted by the slider itself and does not depend on `onChange` being supplied.

### `makePanZoom(wrap, stage, opts)`

```js
makePanZoom(wrap, stage, {onChange = null, maxZoom = 12, minZoom = 0.05, panModifier = 'shift'})
```

Wheel zoom anchored on the pointer, drag to pan, and `reset(width, height)` to fit **and centre** —
resetting the scale without recentring leaves the picture wherever it was dragged, which reads as a
button that half works.

Two things it already handles, so do not add them: zooming about a corner walks the target off
screen, and with a modifier held the browser delivers wheel movement as `deltaX`, so reading `deltaY`
alone makes every modified scroll take the zoom-out branch.

## `align.js`

```js
makeAligner({viewport, rect, bounds, target, scale, preview = null, onChange = () => {}})
```

Drag an image under a fixed guide, `wasd` for 1px steps, clamped to the crop, with an optional live
preview. `target` is the guide's own drawn width, which need not equal the rect's.

**It owns no persistence.** The host decides where a corrected rect goes. Preserve that if you extend
it — it is what makes the component reusable.

---

## `base.css`

Six rules carry the look. Override by redefining tokens, never by fighting the rules.

1. **One row height app-wide** (`--row-height`) — every row and button, so nothing reads as a
   different size class.
2. **One clickable class**, `.toggle` — buttons, list rows, filter pills, dropdown heads.
3. **Dividers never touch the container edge.** 15px inset, 2px thick, matching button borders — a
   1px rule beside 2px buttons reads as a different system.
4. **Selection is bright, rejection is muted.** Rejecting is a decision, not an achievement; giving
   it the accent makes a wall of rejections look like a wall of wins.
5. **Text stays selectable.** `user-select: none` on controls also makes every name and readout
   uncopyable, which costs more than the stray drag-select it prevents.
6. **Monospace throughout** — these tools show filenames, counts and coordinates, and those line up
   or they are not readable.

### Theming

Three states, not two. An explicit choice stamps `data-theme="dark"`/`"light"` on the root; the
default "system" setting stamps **nothing**, so only `prefers-color-scheme` separates light from dark.

- the bare `:root` block defines the **complete** palette
- `@media (prefers-color-scheme: dark)` redefines only tokens, guarded `:root:not([data-theme="light"])`
- `:root[data-theme="dark"]` redefines them again so an explicit toggle wins

**Never give a colour its only definition inside a media or `[data-theme]` block** — it will be
undefined for most viewers. Style components through tokens, never with literals.

### The palette

Neutrals do the work. **Two hues only**, because a colour that appears everywhere stops meaning
anything. `--status-good`, `--status-warn` and `--attention` point at them, so repalette by moving
the pointer. **Nothing uses `--attention` by default** — an always-on attention colour is not one.

`--lichen-deep` is a fill, **not a bed for cream text**: cream on it is 3.00, under the 4.5 text
needs.

---

## Rules for extending this package

- **A component that could save something must not.** Interaction and rendering only.
- **No component may know an application's vocabulary.** No domain nouns in class names, ids,
  storage keys or comments. Storage keys are namespaced `ui-base:*`.
- **Keep the reasons in the comments.** Every behaviour here was paid for by a real failure; a
  comment saying only what the code does invites someone to "simplify" the fix away.
- **Tests live in `tests/`** and cover three things: serving what it should not, failing to serve
  what a consumer links, and shipping broken CSS or JS. Run `uv run pytest`.
