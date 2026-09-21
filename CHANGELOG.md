# Changelog

What a consumer sees between two tags. Pins are `ui_base @ git+https://github.com/BalthazarFitzpatrick/smortui.git@<tag>`.
Only consumer-visible changes are listed: an api, a class, a dom shape, a behaviour. Internal
refactors, docs and tests are in `git log`.

## Unreleased

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
  palette block itself rates at 3.00 contrast

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
