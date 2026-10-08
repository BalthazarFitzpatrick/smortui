# chained columns that follow the cursor

A pick that has children wants a second column, and a pick in that one a third: group, item, level.
`Menu` already draws the columns and moves the cursor; the host owns the picks and says what each
column shows. nothing here is a new primitive. the full contract is in `CLAUDE.md`, under menu
columns.

## the shape

```js
const picks = new Set();            // path keys: 'north', 'north/gamma', 'north/gamma/medium'
let shown = ['north'];              // the parent whose children each later column lists
let menu = null;

const column = c => ({
  multi: c < 2,                     // the last column is single-select
  items: itemsFor(c).map(id => ({
    id, label: id, on: picks.has(keyOf(c, id)),
    path: shown[c] === id && picks.has(keyOf(c, id)),   // a > on the row whose children show
    count: c < 2 && multiBelow(c) ? completePathsUnder(keyOf(c, id)) : 0,
  })),
  onFocus: item => { shown = [...shown.slice(0, c), item.id]; menu.refresh(build()); },
  onPick: (item, on) => { update(picks, c, item, on); menu.refresh(build()); },
});
const build = () => [{kind: 'columns', columns: [0, 1, 2].map(column)}];

menu = new Menu({sections: build(), persistent: true, onConfirm: m => { save(picks); m.close(); }});
```

Keys: up and down inside a column, right into the child column and left back, space to pick or
unpick, enter to confirm, escape to close. Right never picks.

Two rules the host keeps. Unpicking a parent clears every pick under it, so a re-pick starts empty:
the menu keeps no model of picks, `onPick(item, false)` is the notice. A `count` is passed only when
the row's child column is multi-select; under a single-select column the number is at most one and
says nothing.

An `unavailable: true` row with a `hint` is dashed, focusable and inert, for a choice that exists
but cannot be made now.

Wrong shape for a flat list of independent choices (use a `list` section) or a tree of unbounded
depth (use `renderTree`).

Live example: the chained columns block in `demo/index.html`, menus panel.
