# Changelog

What a consumer sees between two tags. Pins are `ui_base @ git+https://github.com/BalthazarFitzpatrick/smortui.git@<tag>`.
Only consumer-visible changes are listed: an api, a class, a dom shape, a behaviour. Internal
refactors, docs and tests are in `git log`.

## Unreleased

- `.toggle` (on `:focus-visible`) and `.menu-item` (on `:focus`) wear the card focus at the soft
  strength: the same rule as `.focus-glow:focus`, with `.focus-glow-soft`'s tokens. `.menu-item:focus`
  no longer turns its border cream; the inset ring marks it
- `.hazard-stripes.hazard-moving`: the placeholder's stripes drift while something is still coming
- `.working-dots`: a line's trailing dots count up while it waits
- under `prefers-reduced-motion` both hold still
- the global `:focus-visible { box-shadow: 0 0 0 2px cream }` ring is gone. Anything focusable that
  names no treatment (a link, a `<summary>`, a `.nav-tab`, a `tabindex` element, a bare input) now
  wears the soft card focus from a zero-specificity `:where(:focus-visible)` default: lift, inset
  ring, inner glow and light. A class that sets its own `box-shadow`, `transform` or `filter` wins.
  A host that restated the old ring, or relied on it, should drop or retune that rule
- `.panel-floating:focus` / `:focus-visible`: no outline, no ring, keeps its drop shadow (was a 4px
  cream frame on a focused drawer or expand panel). Replaces the `.menu-panel`-only exemption
- `.text-field:focus` wears the soft card focus; its border no longer turns cream (text still does)
- `.focus-glow.focus-glow-within`: lights the container on `:focus-within`, while a control inside it
  has focus. Combine with `.focus-glow-soft` for the quiet strength. The focus marker hides for it too
- `.toggle.on` carries `border-color: var(--cream)`; consumers can drop their own restatement
- `a { color: var(--link) }`, a new token pointing at `--kingfisher`, visited or not
- a class-less `a` or `summary` on `:focus-visible` gets `padding-inline: 4px; margin-inline: -4px`
  so the ring clears its glyphs; nothing around it moves
- `h1`-`h6`: `font-size: var(--font-size)`, `font-weight: normal`, `color: var(--cream)`
- slider and `.range-slider` axis line and ticks are 2px (were 1px)
- `.stepper .toggle` padding is `0 var(--inset-x)` (was `0 10px`), so stepper buttons are 8px wider
- elements matching `a[href], summary, button, input, select, textarea, [tabindex]` get the focus
  transition at zero specificity, so their focus eases in and out like a card's

## v0.2.5 - 2026-09-23

- `makeExpander` returns `fit(contentHeight)`: the open panel keeps its width and eases its height
  and top to the content plus its own padding and border, re-centred, never past the box it opened
  at. A fit before the grow paints retargets the grow; `close()` collapses from the fitted box

## v0.2.4 - 2026-09-23

- new asset `chart.js`: `timeChart(containerEl, opts)` draws an svg time-series chart - lines,
  an uncertainty band, split and origin markers, a hover rule with a readout - and returns
  `{update, destroy, nearest}`. Its styles are the `.chart-*` classes in `base.css`; series
  colours come from six palette tokens, each with a fallback
- the tooltip is built from text nodes, so a data label cannot inject markup
- an expander that closes on Escape calls `preventDefault()` on it, so a pinned help tip yields
  to it as it does to a menu
- `dirMenu`: a rejected `fetchDir` shows `could not read: <reason>` instead of the previous
  folder; a list whose only item is a heading shows its empty text
- `.drawer` also stops its slide by rule under reduced motion; `makeSlider` measures its end
  labels once, not on every input event

## v0.2.3 - 2026-09-21

- `indicateFocus(null)` hides the marker: the call for a host that re-renders its rows and knows
  the focused one is gone before any scroll does (it used to throw)
- `destroy()` on the drawer and the expander agree: teardown is not a close - no `onClose`, no
  focus moved, `isOpen()` false; `makeSelection.destroy()` drops a net in progress without firing
  `onChange`
- `--motion-duration` is `0ms` under `prefers-reduced-motion: reduce`, so the drawer's slide and
  the expander's grow both stop together
- a pinned help tip yields its Escape to an open menu: one press closes the menu, the next the tip

- `indicateFocus`: the marker hides while its target is out of the dom instead of collapsing to a
  0x0 box in the page's corner on the next scroll; `.focus-marker[hidden]` is `display: none`

## v0.2.2 - 2026-09-21

- `.fan-item` transitions `filter` and `box-shadow` as well as `transform`, so a fan card that
  also wears `.focus-glow` fades its ring and light in instead of snapping (its slide is unchanged
  at 140ms, now read from `--focus-glow-ms`)

- `content_type(name)` in `ui_base`: the header for an asset, stated (`text/css`,
  `application/javascript`) rather than guessed through `mimetypes`

- `Menu.close()` is a no-op on a menu that is not open, so `onDismiss` fires once per dismissal
  however many times `close()` is called (was: every call fired it)
- a pinned help tip lets go on Escape, like a menu
- `.count-badge` text is dark (`--accent-on-text`) on the deep lichen; it was cream, which the
  palette block itself rates at 3.00 contrast. It also no longer restates `font-size`, so it
  inherits its host's, which under the one-size rule is the same value

## v0.2.1 - 2026-09-21

- `Menu.openAt`: a menu opened and closed in the same tick no longer leaves two document listeners
  behind (2 per pair before, 0 after)
- `dirMenu` only draws the latest navigation; a slow earlier `fetchDir` can no longer overwrite the
  folder you moved on to. Contract unchanged: `fetchDir(path) -> {path, parent, dirs, files}`,
  `onPick(fullPath)`
- `makeSlider` builds its readout and end labels with `textContent`; a `format()` returning markup
  now shows as text
- `makePanZoom`, `makeSelection`, `makeDrawer`, `makeExpander` return `destroy()` (as `makeAligner`
  already did), dropping every listener they registered on `window` and their host
- `.drawer` is `position: fixed` with its slide on `--motion-duration`/`--motion-ease` in
  `base.css`; the script no longer sets either inline (220ms either way at the defaults)
- `.range-slider` and `makeSlider`'s input share one rule set; computed style unchanged
- `.menu-item .menu-action` is a 2px square border (was 1px with a 2px radius)
- `.nav-bar` class beside `#nav-bar`; `.toggle` gutter, `.menu-buttons` and `.stepper` gaps read
  `--inset-x` / `--gap` at the same pixel values
- `read_asset` and `asset_names` refuse dotfiles

## v0.2.0 - 2026-09-20

- `dirMenu(title, fetchDir, onPick, {start})` directory browser
- `.range-slider` for a bare `<input type=range>`; `.stepper` modifier on `.run-controls`
- `Menu.openAt`: a trigger near the bottom opens its panel above when below cannot hold it and
  above has more room
- `.focus-glow.focus-glow-soft` modifier; `.edge-pulse` with `--ambient-pulse-*` tokens
- `docs/recipes/` and `docs/recipes/index.json`, a manifest of composition recipes

## v0.1.10 - 2026-09-11

- menu and tree rows are built from text nodes, so a label can never become markup
- slider bar heights are set through the cssom, so a strict csp keeps them
- readme rewritten with screenshots
