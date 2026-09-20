# a preset list that fills sibling fields

A menu that offers a handful of settings, each with its own numbers to type, tends to grow the same
shape twice: a shortcut list at the top ("balanced", "fast", "careful") and the raw fields below it
for whoever wants to type their own. The two are not separate menus, and they should not be built as
one - a preset is a `list` row whose `onPick` writes into the same state the `field` sections below
it read from, and `menu.refresh(sections)` redraws the panel with the new values already filled in.

Nothing here is a new primitive. `list`, `field` and `buttons` already do the whole job (see the
[Menus](../../README.md#menus) section kind table) - this page is the recipe for composing them, not
a component.

## The shape

```js
let state = { speed: 'balanced', a: 0.5, b: 10, size: 'medium' };
let menu = null;

const PRESETS = [
  {id: 'fast', label: 'fast', why: 'fewer, quicker passes', a: 0.8, b: 4},
  {id: 'balanced', label: 'balanced', why: 'a sensible default', a: 0.5, b: 10},
  {id: 'careful', label: 'careful', why: 'slow, avoids overshooting', a: 0.2, b: 30},
];

// live per-row numbers, computed from real state rather than written into the page - the same
// reason a size option should show what it actually costs, not a guess that goes stale
function costFor(size) {
  return {small: 10, medium: 40, large: 90}[size] ?? null;
}

function sections() {
  const sizeItems = ['small', 'medium', 'large', 'custom'].map(name => ({
    id: name,
    label: costFor(name) == null ? name : `${name} (~${costFor(name)} units)`,
    on: state.size === name,
  }));
  return [
    {
      kind: 'list', label: 'presets', items: PRESETS.map(p => ({
        id: p.id, label: p.label, stats: p.why,
      })),
      onPick: item => {
        Object.assign(state, PRESETS.find(p => p.id === item.id));
        render();
      },
    },
    {kind: 'field', label: 'a', value: String(state.a), onInput: v => { state.a = v; }},
    {kind: 'field', label: 'b', value: String(state.b), onInput: v => { state.b = v; }},
    {
      kind: 'list', label: 'size', items: sizeItems,
      onPick: item => { state.size = item.id; render(); },
    },
    // a field that exists only for one choice - the list above decides, this section decides
    // whether to be in the array at all
    ...(state.size === 'custom'
      ? [{kind: 'field', label: 'custom value', onInput: v => { state.custom = v; }}]
      : []),
    {kind: 'buttons', buttons: [{label: 'apply', onClick: () => submit(state)}]},
  ];
}

function render() {
  if (menu) menu.refresh(sections());
}

document.getElementById('open-config').onclick = evt => {
  menu = new Menu({title: 'settings', persistent: true, sections: sections()});
  menu.openAt(evt.currentTarget);
};
```

## Why it holds together

- **State lives outside the menu, in one plain object.** `Menu` never remembers anything between
  builds - it draws whatever `sections()` returns, once, and forgets it. A preset picks by writing
  into that object and calling `render()`, exactly like a field's own `onInput` does; there is no
  second code path for "a preset changed this" versus "someone typed it".
- **A conditional field is a conditional array entry**, not a hidden-but-present section. Building
  the section only when it applies means `refresh` never has to un-draw a field nobody can see -
  there is nothing to un-draw.
- **A live number belongs on the row, not beside it.** `costFor` (or a server round trip, if the
  number needs one) runs every time `sections()` is called, so the figure a viewer reads is always
  the one the current choice would actually produce - never a string baked in when the page was
  written and left to drift.
- **`persistent: true`** because picking a preset or a size is not "the answer" the way picking a
  plain list row is - the menu stays open so the fields it just filled can be reviewed or overridden
  before `apply`.

## When this is the wrong shape

If a "preset" needs to be more than a handful of scalars - a whole sub-menu, a preview, a canvas -
reach for a `node` section instead (`menu.js`'s own advice: "reach for `node` last. If you find
yourself building a list by hand inside a `node`, use `list`" - the same rule in the other
direction: a genuinely rich section is a `node`, not a `list` row stretched to hold one).

See it live: `demo/index.html`, the **menus** tab, "a preset list that fills fields".
