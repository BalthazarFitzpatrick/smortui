# aside follows focus

A help box beside a floating panel that shows what the focused row means and slides to the next row
as focus moves. `makeAside` does the placement and the motion; the panel decides what to say.

```js
const aside = makeAside({host: panelEl});
rows.forEach(row => {
  row.addEventListener('focus', () => aside.show(row, {title: row.dataset.name, lines: ['what it does']}));
  row.addEventListener('mouseenter', () => aside.show(row, {title: row.dataset.name, lines: ['what it does']}));
  row.addEventListener('blur', () => aside.hide());
});
```

The host owns the wiring, because only it knows when a row counts as current: the aside tracks no
focus and keeps no content. Hover and focus can share one handler. It sits right of the panel when
there is room, else left, else under it, and it never takes focus.

Wrong shape when the text is long-form or needs a link or a button - the aside ignores the pointer.
Use a `helpTip` or a menu panel there.

Live example: the aside block in `demo/index.html`, primitives panel.
