# a two-by-two button grid

Four buttons that must read as one set need one size. A flex row sized by content gives each its
own width; a grid with `repeat(2, 1fr)` gives every cell the same width, and `.toggle` already fixes
the height at `--row-height`, so all four match.

```html
<div id="grid-2x2" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--gap);">
  <button type="button" class="toggle" id="btn-alpha">alpha</button>
  <button type="button" class="toggle" id="btn-beta">beta</button>
  <button type="button" class="toggle" id="btn-gamma">gamma</button>
  <button type="button" class="toggle" id="btn-delta">delta</button>
</div>
```

Each is a `<button>`, not a `<div>`: a button is reachable with the keyboard, and `base.css` draws
the soft card focus on it with no rule of your own.

Bind handlers by id, never by position: `document.getElementById('btn-beta').onclick = ...`. The
layout can then become one column or four without touching a handler.

Wrong shape when the buttons carry very different label lengths or a count grows past four - a
grid of unequal content wants a wrapping `.run-controls` row instead.

Live example: the two-by-two block in `demo/index.html`, menus panel.
