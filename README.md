# ui_base

The shared web interface for these tools. One stylesheet and three scripts — menus, dropdowns, a tab
shell, sliders, pan/zoom and crop alignment — that a local Python tool serves to get an interface
that looks and behaves like one product.

**No build step, no framework, no npm.** A `<link>` and three `<script>` tags.

```bash
uv sync
uv run python demo/serve.py --port 8770     # every component, on one page
```

## Why this exists as a project rather than a copy

These grew inside one tool, and every behaviour here was paid for by a real failure there:

- a popup with no dismiss handler left a stale selection alive, which the *next* right-click swept
  up and applied — so `Menu` always fires `onDismiss`, even when cancelled
- a shared dismiss handler hardcoded its trigger ids in one selector string, so every new menu had
  to be added to it or it closed on its own opening click
- `reset view` set the scale back to 1 and left the pan alone, which reads as a button that half
  works — so reset centres too
- with shift held, a browser sends the wheel as `deltaX`; reading `deltaY` alone made every
  shift+scroll take the zoom-out branch, so the image only ever shrank

Copying the files into the next project copies the code and loses the reasons. The reasons are most
of the value, so they live in the comments here and travel with it.

## Using it

```python
from ui_base import ASSETS, read_asset, UiBaseError

# in a request handler, for a path like /ui/menu.js
try:
    body = read_asset(name)  # refuses anything outside ASSETS
except UiBaseError:
    ...  # 404
```

Then in the page. **Order matters**: `base.css` first so your own stylesheet can override it, and
`shell.js` before the script that calls `initShell`.

```html
<link rel="stylesheet" href="/ui/base.css">
<link rel="stylesheet" href="/ui/your-layout.css">
<script src="/ui/menu.js"></script>
<script src="/ui/shell.js"></script>
<script src="/ui/align.js"></script>   <!-- only if you need crop alignment -->
```

`read_asset` resolves the path and checks it is still inside `ASSETS`, rather than string-matching
on `..` — the only reliable test, and the classic hole in a route that concatenates a
caller-supplied name onto a directory.

## What is in it

| file | gives you |
|---|---|
| `base.css` | the tokens and the primitives: `.toggle`, dividers, columns, panels, the row height |
| `menu.js` | `Menu`, `listMenu`, `renderTree`, `makeSlider`, `makePanZoom` |
| `shell.js` | `initShell`, `activateTab` — tabs, keyboard nav, and remembering where you were |
| `align.js` | `makeAligner` — drag a crop under a fixed guide, `wasd` nudging, live preview |

### `Menu`

One class for every popup: dropdowns, right-click menus, pickers. Generic sections, so a new menu is
a data structure rather than new code.

```js
new Menu({
  title: 'open a thing',
  columns: false,              // true lays sections side by side, split by a vertical rule
  onDismiss: () => {},         // ALWAYS fires - this is what stops a stale selection surviving
  sections: [...],
}).openAt(triggerElement);     // or .openAt({x, y}) for a right-click
```

| section kind | for |
|---|---|
| `list` | rows with optional `stats`, `on`, `disabled`, `state`, and a trailing `action` control |
| `columns` | two or more axes side by side, split by dividers. Each column takes its own `label`, `items`, `empty`, `multi` and `onPick`, so "available" can sit beside "open" and behave differently |
| `add` | a "+ new" row: a text field and a button |
| `field` | a single text input |
| `buttons` | a footer row of actions |
| `node` | the escape hatch — content you built yourself, placed and styled by the panel |

`listMenu(title, items, onPick)` is the one-liner for the common case.

An item's `state` is an object of flags, and every truthy one becomes a class on the row — the same
convention `renderTree` uses. The caller keeps its own styling and the menu stays ignorant of what
any flag means:

```js
{id: 'spin', label: 'turn full circle in 20 taps', state: {done: true, current: false}}
// -> <div class="toggle menu-item done">
```

`menu.refresh(sections)` rebuilds an open menu in place, keeping its position — for columns that
move items between themselves as you pick, where closing and reopening would flicker.

Note `multi` defaults to **true** inside a `columns` section and **false** in a `list`. A
single-select pick closes the whole menu, including the other columns.

The class owns anchoring, viewport clamping, one-menu-at-a-time, dismissal on outside click and
Escape, and arrow/Enter keyboard navigation. Call sites never repeat any of that.

### `makeSlider`

An axis with ticks rather than a number field, because a threshold is a position in a range. Takes
an optional `distribution` drawn over the axis — the point being that *"no results"* and *"no
results because your cut sits above every value in the data"* look identical until something shows
the shape.

### `makePanZoom`

Wheel zoom anchored on the pointer, drag to pan, `reset(width, height)` to fit and centre. Zooming
about a corner walks whatever you are aiming at off screen, which is the thing zoom exists to
prevent.

### `makeAligner`

For last-pixel work: drag the image under a fixed guide, `wasd` for 1px steps, clamped to the crop,
with an optional live preview of the result. It owns the interaction and the clamping and **owns no
persistence** — the host decides where a corrected rect is saved, which is what makes it reusable.

### Spacing

Four tokens carry the vertical rhythm, named for what they space rather than how big they are:

| token | for |
|---|---|
| `--gap` | between rows inside a panel |
| `--inset` | a panel's own top and bottom |
| `--inset-x` | a panel's sides, and any row's own gutter |
| `--rule-gap` | above and below an `.h-divider` |

Use them instead of literals. A consumer that hardcodes `8px` looks identical until the day the
rhythm changes, and then it is the one tab that did not move.

`.h-divider` already carries `--rule-gap` above and below, so a rule between two rows needs nothing
added around it. Row primitives — `.field-label`, `.row-label`, `.field-value`, `.run-controls`,
`.filter-row`, `.stat`, `.spacer` — live here so two consumers cannot disagree about what a row of
controls looks like. `.row-label` is a caption that occupies a full `--row-height`, so a panel
opening with a label starts at the same height as one opening with buttons.

## The visual language

Six rules carry the whole look. They are in `base.css`'s header too, because that is where someone
about to override something will be looking.

1. **One row height, app-wide** (`--row-height`). Every row and button is that tall, so nothing
   reads as a different size class.
2. **One clickable class**, `.toggle` — buttons, list rows, filter pills, dropdown heads.
3. **Dividers never touch the container edge.** 15px inset, 2px thick — the same weight as a button
   border, because a 1px rule beside 2px buttons reads as a different system.
4. **Selection is bright, rejection is muted.** Rejecting something is a decision, not an
   achievement; giving it the accent makes a wall of rejections look like a wall of wins.
5. **Text stays selectable.** `user-select: none` on controls also makes every name and readout
   uncopyable, which costs more than the stray drag-select it prevents.
6. **Monospace throughout**, because these tools show filenames, counts and coordinates, and those
   line up or they are not readable.

Override by redefining the tokens, not by fighting the rules.

### The palette

Neutrals do the work: a charcoal ground, a cream for emphasis, and greys between. **Two hues, and
only two**, because a colour that appears everywhere stops meaning anything.

Both were sampled from photographs of lichen and stone. Each started
as the median of its photo filtered to that hue band above 22% saturation, so it is the lichen and
the stone themselves rather than their blend with grey.

| token | hex | what it is | contrast on the ground |
|---|---|---|---|
| `--lichen` | `#c7ed5f` | **corrected** from the measured median — see below | **13.37** — carries text |
| `--lichen-deep` | `#788f39` | the same lichen dark enough to be a fill | 4.93 — a fill, **not a bed for cream** |
| `--stone-red` | `#996b62` | median of 39k stone pixels | 3.94 — a pip or a fill, **not text** |
| `--stone-red-lift` | `#ad796f` | **derived**: the stone lifted in value, hue and saturation held | 4.89 |

The stone is genuinely dull, which is the point of it — so `--stone-red-lift` exists for the one case
that needs a highlight to carry text, and the CSS marks it as derived rather than sampled.

**The lichen is the interesting one, because sampling got it wrong.** The photo's median is
`#bcbf88`, and that value is faithful to the *photograph* rather than to the lichen. Overcast light
and phone processing flattened it: the most saturated pixel in the image is dark (`#6c6e3b`, value
0.43) and the brightest is washed out (`#fcfebb`, saturation 0.26), so no pixel is both vibrant and
pale. Balthazar Fitzpatrick, who was standing there: *"much more vibrant, like a pale lime, the photos dont do it
justice."* Saturation is therefore raised to 0.60 and the hue nudged 62° → 76°, judged by eye
against the real thing. **Measurement fixed the family; only the person who saw it could fix the
rest** — which is worth recording, because a palette that says "sampled" invites the next person to
trust the number over the witness.

`--lichen-deep` carries a correction of its own: its comment used to claim it was "a fill that
carries cream text". Cream on it is **3.00**, well under the 4.5 text needs. The 4.88 in that
comment was its contrast against the *ground*, mislabelled. It takes dark text, or none.

`--status-good`, `--status-warn` and `--attention` point at these. Repalette by moving the pointer;
the record of where the colour came from stays. **Nothing uses `--attention` by default** — an
attention colour that is always on stops being one.

Two more colours were sampled and deliberately left out: the deepest lichen (`#60622f`, 2.80) and the
deepest stone (`#96594d`, 3.26). Both are lovely and both are illegible on this ground. The demo's
colour tab shows contrast per swatch for exactly this reason — without the number, the next person
reaches for them.

## Status

Extracted from a review tool where all of this is in daily use, and consumed back by it as a package
rather than kept as a copy — which is what proved the seam was real rather than assumed. Every
behaviour here has been through a working application first.

## Licence

MIT - see [LICENSE](LICENSE).
