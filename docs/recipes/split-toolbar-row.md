# a split toolbar row

One row, two ends. Controls sit left in the order written, a `.spacer` takes all the slack, and the
primary action or two sit alone on the far right, so the eye finds the commit button without
reading the row.

```html
<div class="run-controls">
  <button type="button" class="toggle" id="tb-alpha">alpha</button>
  <button type="button" class="toggle" id="tb-beta">beta</button>
  <button type="button" class="toggle" id="tb-gamma">gamma</button>
  <span class="spacer"></span>
  <button type="button" class="toggle" id="tb-save">save</button>
  <button type="button" class="toggle" id="tb-apply">apply</button>
</div>
```

DOM order is visual order, so reordering the left group is reordering elements. Keep the primary
actions after the spacer and no more than two; a third belongs in a menu.

Wrong shape on a narrow panel: `.run-controls` wraps, and a wrapped spacer stops pushing. Give the
row room, or split it into two rows.

Live example: the split toolbar block in `demo/index.html`, menus panel.
