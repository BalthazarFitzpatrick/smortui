# ui_base worklog

## 2026-09-02 — extracted from a consumer project's review tool

One stylesheet and three scripts, lifted out of the consumer project's review-tool directory where
they are in daily use. The code was already generic — the only project-specific content was
**comments**, so those were rewritten to carry the principle rather than one project's nouns.

**Renamed on the way out:** `--keep-on` / `--discard-on` became `--accent-on` / `--muted-on`. Keep
and discard are one review tool's verbs; "the selecting colour" and "the rejecting colour" are the
general idea, and a framework should not make every consumer inherit someone else's vocabulary.

**Added:** `Menu` gained a `node` section kind earlier the same day — an escape hatch for
caller-built content, so a slider pair inside a menu did not need a bespoke section type. That is
the sort of generic primitive this package exists to hold.

**The demo serves assets exactly the way a real tool does** (`/` plus `/ui/`), which means the
README's integration instructions cannot drift from reality without the demo breaking.

**`read_asset` resolves then checks containment** rather than string-matching on `..` — the only
reliable test, and the classic hole in any route that concatenates a caller-supplied name onto a
directory. Verified by hand: `../pyproject.toml` and a url-encoded traversal both 404.

**Deliberately not done:** migrating the consumer project onto this package. It had just been heavily
refactored and was in daily use; changing it again the same day would confuse a regression with the
migration. That is task 1, and it is what will prove the seam is real rather than assumed.

## 2026-09-02 — first consumer, and the lichen corrected

**The consumer project now consumes this package** (task 1). It takes `ui-base` as an editable path
dependency and serves `/ui/` local-first: its own `review_ui/` wins, ui_base fills in the rest.
`menu.js`, `shell.js` and `align.js` are deleted from the consumer project.

**The extraction held.** The three copies differed only in *comments* — the consumer's domain-specific
names where ui_base's are generalised — and every line of code was identical. Nothing had to be
reconciled, which is the outcome task 1 existed to test. The only friction was `requires-python`:
this package said 3.12 for no reason and the consumer supports 3.11, so a floor above a consumer's
made it uninstallable there. Lowered.

CSS is deliberately not merged. The consumer has `app.css` + `tabs.css` where this has `base.css`;
unifying them is a visual change nobody asked for.

**The lichen is now a correction, not a sample.** The operator, on the sampled `#bcbf88`: *"much more
vibrant, like a pale lime, the photos dont do it justice."* The operator was right and the median was wrong —
faithful to the photograph rather than to the lichen. Overcast light and phone processing meant no
pixel in the image was both vibrant and pale: the most saturated is dark (`#6c6e3b`, value 0.43),
the brightest washed out (`#fcfebb`, saturation 0.26). Nine candidates went on the colour board; the
operator picked at hue 76. `--lichen` is `#c7ed5f`, `--lichen-deep` followed it to `#788f39`.

The README now says the hue was measured and the saturation corrected by the person who was there,
because a palette that says "sampled" invites the next person to trust the number over the witness.

**A false claim found while doing it:** `--lichen-deep`'s comment said it was "a fill that carries
cream text". Cream on it is **3.00**, well under the 4.5 text needs — the 4.88 it cited was contrast
against the *ground*, mislabelled. Anyone trusting it would have shipped unreadable text.

**Test suite added** (task 3): 16 tests over the three failures this package can have — serving what
it should not, failing to serve what a consumer links, and shipping broken CSS or JS.

## 2026-09-04 - published, and the consumer's components merged back up

Published under MIT and made **public**, squashed to one commit. The stylesheet had drifted from its
consumer in BOTH directions and needed a real merge: ui_base held the six-rules header, the fuller
palette and the tree components, while the consumer had grown scrollbars, `.help-tip`, the
`adds`/`removes` verbs, `.rubber-band`, the modal set and a newer Menu section. It had also renamed
`--keep-on`/`--discard-on` to `--accent-on`/`--muted-on` - domain vocabulary becoming design
vocabulary, the same move as plate -> object.

**Why it drifted at all is the part worth keeping:** the drift test covered menu.js, shell.js and
align.js and NOT the css, so the shared visual language - the thing this package exists to be - was
the one part nothing guarded. Publishing removes the need for that test entirely; the copies and the
test are gone from the consumer.

New: `select.js`, the selection gestures - click picks, cmd+click adds, shift+drag draws a net with
edge autoscroll, and right-click targets what you pointed at rather than a stale selection. That
last one was a real bug downstream: acting on "the selection" when the user pointed elsewhere
silently re-cut the wrong tile. Fixed once here rather than per tool. The demo now uses the shared
component rather than its own copy, which is the only honest way to demonstrate it.

The photographs the palette was sampled from are gone - folded into the squashed commit rather than
deleted afterwards, so a clone never downloads 25 MB it does not need. A fresh clone is 168 KB.

## 2026-09-10 (night) — smoother expander, collapse on close, one motion token

Built by a delegated agent on `feature/smooth-expand-motion` (d9f8cca) and reviewed against its diff.
The expander used to animate left/top/width/height, which reflowed the content every frame; it now
sets the final box at once and animates a transform, and closing collapses back into the strip
instead of vanishing. `--motion-duration: 220ms` and `--motion-ease` in base.css are the single timing
source, read at call time and falling back cleanly where computed style is unavailable. A closing
backdrop is marked `expand-closing` synchronously, so hosts can tell it from an open one.
smortboard is pinned to this commit, so this pull request merges first.

## 2026-09-11 — renamed smortui, and fixes found using smortboard

The repo is `smortui` now; the Python package is still `ui_base`, so consumers pin
`ui_base @ git+https://github.com/BalthazarFitzpatrick/smortui.git@<sha>`. Lichen milk came back as a
token (#21), and the README was rewritten with screenshots and a palette sheet (#22).

From using smortboard: `help.js`, because the demo's `?` carried the fixed tooltip class and floated
over everything that scrolled past (#23); textareas centre their first line the way inputs do (#24);
and the focus marker no longer jumps back to elements focus had left - every call used to leave a
400 ms timer and a transitionend listener on its own target (#25, samples off the focused card
measured 11/11/14 before and none after). Main is protected by a ruleset.
