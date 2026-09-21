"""the package's one job: hand a consumer an asset, and refuse everything else.

WHAT THESE GUARD. ui_base has no runtime of its own - it is files plus a reader - so the failures
available to it are: serving something it should not, failing to serve something a consumer links,
and shipping CSS or JS that is broken in a way no python test would ever notice. One test each.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ui_base import ASSETS, UiBaseError, asset_names, read_asset

# what a consumer's page links. named explicitly rather than globbed: a test that reads the
# directory it is checking passes just as happily when the directory is empty
EXPECTED = {
    "base.css",
    "menu.js",
    "shell.js",
    "align.js",
    "select.js",
    "buckets.js",
    "expand.js",
    "indicate.js",
    "drawer.js",
    "help.js",
    "entrytext.js",
    "pile.js",
}


def test_every_expected_asset_is_present_and_not_empty():
    assert EXPECTED <= set(asset_names())
    for name in EXPECTED:
        assert read_asset(name).strip(), f"{name} is empty"


def test_asset_names_matches_what_is_on_disk():
    assert set(asset_names()) == {p.name for p in ASSETS.iterdir() if p.is_file()}


@pytest.mark.parametrize(
    "name",
    [
        "../pyproject.toml",
        "../../etc/passwd",
        "..%2Fpyproject.toml",
        "subdir/../../pyproject.toml",
        "",
        ".",
        "no-such-file.js",
        ".DS_Store",
    ],
)
def test_nothing_outside_the_assets_directory_can_be_read(name):
    """RESOLVE THEN CONTAIN, not a blocklist on "..". A route that concatenates a caller-supplied
    name onto a directory is the classic traversal, and a consumer serves this over http.
    """
    with pytest.raises(UiBaseError):
        read_asset(name)


def test_a_dotfile_planted_in_the_directory_is_neither_listed_nor_served():
    """macos drops .DS_Store into any folder it looks at; a listing that includes it hands a consumer
    a name that 404s from everyone else's checkout, and serving it leaks nothing useful but is
    still serving what was never an asset
    """
    planted = ASSETS / ".planted"
    planted.write_text("not an asset")
    try:
        assert ".planted" not in asset_names()
        with pytest.raises(UiBaseError):
            read_asset(".planted")
    finally:
        planted.unlink(missing_ok=True)


def test_a_symlink_out_of_the_directory_is_refused(tmp_path):
    """resolve() follows symlinks, so containment is checked on the real path - a link planted in
    assets/ cannot become a way to read the rest of the disk
    """
    outside = tmp_path / "secret.txt"
    outside.write_text("nope")
    link = ASSETS / "_test_link.css"
    try:
        link.symlink_to(outside)
        with pytest.raises(UiBaseError):
            read_asset("_test_link.css")
    finally:
        link.unlink(missing_ok=True)


# ---------------------------------------------------------------- the assets themselves


# node runs the scripts' behaviour tests. locally a missing node skips them; under CI it is a
# failure, because a runner that quietly skipped half the suite would report green for nothing
_NO_NODE = shutil.which("node") is None
needs_node = pytest.mark.skipif(
    _NO_NODE and not os.environ.get("CI"),
    reason="node is not installed",
)
JS_TESTS = sorted((Path(__file__).parent / "js").glob("*.mjs"))


@needs_node
@pytest.mark.parametrize("name", sorted(n for n in EXPECTED if n.endswith(".js")))
def test_the_scripts_parse(name):
    """a syntax error ships silently: the browser drops the whole file and the page goes inert"""
    assert not _NO_NODE, "CI must have node"
    result = subprocess.run(
        ["node", "--check", str(ASSETS / name)], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, f"{name} does not parse:\n{result.stderr}"


# which runner proves which script. a script with no entry is only proven to load, so this is the
# list of who is excused and why - a new script cannot slip in untested by omission
RUNNER_FOR = {
    "menu.js": "menu_sections.mjs",
    "buckets.js": "buckets_navigation.mjs",
    "drawer.js": "drawer.mjs",
    "entrytext.js": "entrytext.mjs",
    "expand.js": "expander.mjs",
    "help.js": "help_tip.mjs",
    "indicate.js": "focus_marker.mjs",
    "pile.js": "pile_layout.mjs",
    "select.js": "listeners.mjs",  # teardown only; the gestures need a real pointer
    "shell.js": None,  # tab switching against real focus and localStorage - the demo covers it
    "align.js": None,  # drag geometry against real mouse events - its consumer covers it
}


def test_every_script_has_a_named_behaviour_runner_or_an_excuse():
    scripts = sorted(n for n in EXPECTED if n.endswith(".js"))
    assert set(RUNNER_FOR) == set(scripts), "every script is in the map, with a runner or None"
    runners = {p.name for p in JS_TESTS}
    for script, runner in RUNNER_FOR.items():
        assert runner is None or runner in runners, f"{script}: {runner} does not exist"


@needs_node
@pytest.mark.parametrize("script", JS_TESTS, ids=[p.stem for p in JS_TESTS])
def test_the_scripts_behave(script):
    """PARSING IS NOT BEHAVIOUR. `node --check` proves a file loads, which says nothing about
    whether a column carries its own heading, a drawer parks its sliver, or a focus marker ignores
    the element focus already left. each runner under tests/js is one script's contract exercised
    against a dom stub or against plain values - the two things under test are structure and
    arithmetic, so a full jsdom would be testing the browser as much as the code. DISCOVERED BY
    GLOB on purpose: dir_menu.mjs sat here for a release with no case naming it, and nothing ran it.
    """
    assert not _NO_NODE, "CI must have node"
    result = subprocess.run(["node", str(script)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, f"{script.name} fails:\n{result.stdout}{result.stderr}"


def _css() -> str:
    return read_asset("base.css").decode()


def test_every_token_the_stylesheet_uses_is_one_it_defines():
    """a var() with no definition and no fallback renders as nothing - an invisible border, a
    transparent background - and no tool reports it. --divider was exactly this.
    """
    css = _css()
    defined = set(re.findall(r"^\s*(--[\w-]+)\s*:", css, re.MULTILINE))
    used = set(re.findall(r"var\(\s*(--[\w-]+)\s*(?:,|\))", css))
    assert used <= defined, f"used but never defined: {sorted(used - defined)}"


def test_the_light_palette_is_complete_on_bare_root():
    """THE THREE THEME STATES. an explicit choice stamps data-theme; the default "system" setting
    stamps nothing, so a token whose only definition sits inside a media or [data-theme] block is
    undefined for most viewers. every token must therefore exist on bare :root.
    """
    css = _css()
    base = re.search(r":root\s*\{(.*?)\}", css, re.DOTALL)
    assert base, "no bare :root block"
    on_root = set(re.findall(r"(--[\w-]+)\s*:", base.group(1)))
    everywhere = set(re.findall(r"^\s*(--[\w-]+)\s*:", css, re.MULTILINE))
    missing = everywhere - on_root
    assert not missing, f"defined only under a theme condition: {sorted(missing)}"


def test_the_spacing_tokens_exist_and_are_used_rather_than_repeated():
    """A TOKEN NOBODY USES IS WORSE THAN NO TOKEN - it reads as a standard while the literals it was
    meant to replace go on drifting. So this asserts both halves: the four exist, and the rules that
    set the rhythm reference them rather than restating the number.
    """
    css = _css()
    root = re.search(r":root\s*\{(.*?)\}", css, re.DOTALL).group(1)
    tokens = set(re.findall(r"(--(?:gap|inset|inset-x))\s*:", root))
    assert tokens == {"--gap", "--inset", "--inset-x"}, sorted(tokens)

    rule = re.search(r"\.h-divider\s*\{(.*?)\}", css, re.DOTALL).group(1)
    assert "var(--inset-x)" in rule, "the rule's side inset must come from the token"


def test_the_focus_highlight_keeps_its_four_parts_separately_tunable():
    """ONE TREATMENT, FOUR KNOBS. The look is only right with all four together - the lift, the
    element's own ring, the inner glow and the coloured light over the whole face - which is exactly
    why it ships as one class. But a host retuning one of them must not have to restate the other
    three, so every part reads its own token and none of them is a literal in the rule.
    """
    css = _css()
    rule = re.search(r"\.focus-glow:focus\s*\{(.*?)\}", css, re.DOTALL)
    assert rule, "the treatment must exist as one named class"
    body = rule.group(1)
    for part in (
        "var(--focus-lift)",  # the lift
        "var(--focus-ring-width)",  # its own ring, inset
        "var(--focus-inner-glow-blur)",  # the ring bleeding inward
        "var(--focus-light-saturate)",  # the coloured light over the face
    ):
        assert part in body, f"{part} must stay tunable on its own"
    assert "inset 0 0 0 var(--focus-ring-width)" in body, (
        "THE RING IS INSET, not an outline: an outline sits outside the box unscaled, so it does "
        "not ride the lift and it draws over whatever is lying on top of the element"
    )


def test_the_soft_variant_only_retunes_the_loud_one_rather_than_redrawing_it():
    """ONE TREATMENT AT TWO STRENGTHS. The soft variant exists for a surface inside another surface -
    a card's section, a tab in a bar - and the way it must NOT be built is as a second rule that
    draws its own lift, ring, glow and light: two rules restating the same four parts drift the
    moment either is retuned, and then the board has two focus looks nobody chose. So this asserts
    the shape, not the numbers: the modifier sets tokens only, every part it sets is one the loud
    rule already reads, and it draws nothing itself.
    """
    css = _css()
    rule = re.search(r"\.focus-glow\.focus-glow-soft\s*\{(.*?)\}", css, re.DOTALL)
    assert rule, "the soft variant must exist as a modifier on the loud class"
    body = rule.group(1)

    declarations = [d.strip() for d in body.split(";") if d.strip()]
    assert declarations, "the modifier must restate something"
    assert all(d.startswith("--focus-") for d in declarations), (
        f"the modifier may only restate the treatment's own tokens, never redraw it: {declarations}"
    )

    # every part the loud rule reads, quieter - and quieter is checked, not assumed
    root = re.search(r":root\s*\{(.*?)\}", css, re.DOTALL).group(1)

    def _value(block: str, token: str) -> str:
        return re.search(rf"{token}\s*:\s*([^;]+);", block).group(1).strip()

    for token in ("--focus-lift", "--focus-light-saturate", "--focus-light-brightness"):
        loud, soft = float(_value(root, token)), float(_value(body, token))
        assert 1.0 <= soft < loud, f"{token}: {soft} must sit between neutral and the loud {loud}"
    for token in ("--focus-ring-width", "--focus-inner-glow-blur", "--focus-inner-glow-spread"):
        loud = float(_value(root, token).removesuffix("px"))
        soft = float(_value(body, token).removesuffix("px"))
        assert 0 < soft < loud, f"{token}: {soft}px must be thinner than the loud {loud}px"

    # the colour and the timing are what keep it the SAME treatment rather than another one
    for shared in ("--focus-ring-color", "--focus-inner-glow-color", "--focus-glow-ms"):
        assert shared not in body, f"{shared} is what makes the two one treatment - leave it alone"


def test_a_rule_does_not_add_to_the_gap_it_sits_in():
    """MEASURED, and it is why this assertion is the opposite of what it first said. Giving the rule
    its own vertical margin STACKED it on the gap the parent already puts between children: a ruled
    row gap came out at 34px (8 gap + 8 margin + 2 border + 8 margin + 8 gap) against 8px for a
    plain one, so a separator cost four times a space. The parent spaces; the rule only draws.
    """
    rule = re.search(r"\.h-divider\s*\{(.*?)\}", _css(), re.DOTALL).group(1)
    margin = re.search(r"margin:\s*([^;]+);", rule).group(1)
    assert margin.strip().startswith("0 "), f"the rule must add no vertical space: {margin}"


def test_a_strip_centres_its_cells_and_shares_the_width():
    """`align-items: baseline` is the obvious choice for a label-and-value pair and the wrong one:
    a short cell pinned its text to the first baseline, flush against the top of a 31px box
    """
    cell = re.search(r"\.strip > \.cell\s*\{(.*?)\}", _css(), re.DOTALL)
    assert cell, "a strip must define its cell"
    assert "align-items: center" in cell.group(1)
    assert "flex: 1 1 0" in cell.group(1) and "min-width: 0" in cell.group(1)


def test_a_column_can_shrink_so_columns_never_overflow_their_panel():
    """.col children are flex:0 0 auto, so without this the column cannot go below its widest pill
    and a multi-column menu runs off the panel - clipped, not scrolled, with nothing to indicate it
    """
    col = re.search(r"\.label-columns \.col\s*\{(.*?)\}", _css(), re.DOTALL).group(1)
    assert "min-width: 0" in col
    assert "flex: 1 1 0" in col


def test_the_row_primitives_are_defined_here_rather_than_downstream():
    """a design system that does not own "a row of controls" cannot keep two consumers agreeing on
    what one looks like - these four lived in a consumer's stylesheet, which is exactly why its
    tabs each grew their own spacing
    """
    css = _css()
    for selector in (".field-label", ".field-value", ".run-controls", ".spacer", ".stat"):
        assert re.search(rf"^{re.escape(selector)}[\s,{{]", css, re.MULTILINE), selector


def test_text_in_a_control_row_cannot_wrap_it():
    """the failure this prevents: a five-word stat in a nowrap flex row shrank to its longest word
    and took the row to three lines, moving everything below it down the page
    """
    css = _css()
    block = re.search(r"\.stat, \.field-value\s*\{(.*?)\}", css, re.DOTALL)
    assert block, ".stat and .field-value must be protected from wrapping"
    assert "white-space: nowrap" in block.group(1)
    assert "text-overflow: ellipsis" in block.group(1)


def test_there_is_exactly_one_font_size():
    """THREE CHANNELS SAID THE SAME THING. emphasis is carried by colour here - dim, text, cream -
    and by the row a thing sits in. Size was a third, set locally nine times between 10px and 13px,
    each a judgement nobody could see the whole of; a caption and the button beside it ended up
    looking like parts of different applications.
    """
    css = _css()
    local = [
        line.strip()
        for line in css.splitlines()
        if "font-size" in line and "--font-size" not in line
    ]
    # body may reference the token; nothing else may set a size at all
    local = [line for line in local if "var(--font-size)" not in line]
    assert not local, f"font-size set locally: {local}"
    assert re.search(r"--font-size\s*:", css), "the one size must be a token"


def test_a_split_gutters_both_panes_the_same():
    """THE FAILURE THIS PREVENTS, and every consumer hit it: the outer edges inherit the panel's
    inset while the inner ones inherit nothing, so the second pane sits flush against the rule and
    the whole right-hand side reads as shoved sideways.
    """
    css = _css()
    pane = re.search(r"\.split > \.pane\s*\{(.*?)\}", css, re.DOTALL)
    assert pane, "a split must define its pane"
    assert "var(--inset-x)" in pane.group(1), "the gutter comes from the token, not a literal"
    # only the outermost edges are removed, which is what makes the inner ones equal
    assert re.search(r"\.split > \.pane:first-child\s*\{[^}]*padding-left:\s*0", css)
    assert re.search(r"\.split > \.pane:last-child\s*\{[^}]*padding-right:\s*0", css)


def test_a_control_row_stays_one_row_high_even_holding_a_slider():
    """a slider stacks a caption over its axis, so a row holding one grew to ~50px while the row
    beside it stayed at 31 - two panes that mirror each other then start at different heights
    """
    css = _css()
    row = re.search(r"\.run-controls\s*\{[^}]*\}", css)
    assert row and "min-height: var(--row-height)" in row.group(0)
    inner = re.search(r"\.run-controls \.slider\s*\{([^}]*)\}", css)
    assert inner and "height: var(--row-height)" in inner.group(1)


# every token in :root that is a literal colour rather than a pointer. neutrals and decision
# colours are greys and creams; anything else here is a HUE and has to be accounted for by name
_NEUTRALS = {
    "--bg",
    "--panel-row",
    "--grey-border",
    "--text",
    "--text-dim",
    "--cream",
    "--accent-on",
    "--accent-on-text",
    "--muted-on",
    "--text-on-accent-dim",
    "--text-on-fill-dim",
}
_HUES = {
    # sampled from photographs: two families, one of which has a deep and a milky member
    "--lichen",
    "--lichen-deep",
    "--lichen-milk",
    "--stone-red",
    "--stone-red-lift",
    # derived, belonging to no photograph. the vanilla because attention had nowhere honest to sit,
    # the kingfisher because green against red collapses under red-green colour blindness and the
    # working plate had to stop being green, and the burnt orange as the loud one held in reserve
    "--vanilla",
    "--kingfisher",
    "--kingfisher-milk",
    "--burnt-orange",
    "--burnt-orange-milk",
}


def test_every_hue_in_the_palette_is_accounted_for_by_name():
    """the palette's rule is not "two hues" any more, it is "no hue arrives unnamed".

    the previous version of this guard matched only tokens containing "lichen" or "stone", so
    --vanilla - the actual third hue - walked straight past it. a guard that cannot see the thing
    it exists to catch is worse than none, because it reads as coverage.
    """
    css = _css()
    root = re.search(r":root\s*\{(.*?)\}", css, re.DOTALL).group(1)
    literals = set(re.findall(r"(--[\w-]+)\s*:\s*#", root))
    unaccounted = literals - _NEUTRALS - _HUES
    assert not unaccounted, (
        f"a colour arrived without being named in this test: {sorted(unaccounted)}"
    )
    missing = _HUES - literals
    assert not missing, f"a hue this test guards no longer exists: {sorted(missing)}"


def test_the_slider_measures_its_own_text_rather_than_counting_characters():
    """the readout and the end labels share a row, so an underestimate makes them touch.

    the counts were pinned to 10.5px and 11.5px, which the one-font-size rule then invalidated -
    both render at var(--font-size). measuring leaves nothing to go stale.
    """
    menu = (ASSETS / "menu.js").read_text()
    assert "_textRuler.measureText(text).width" in menu, "widths must be measured"
    for stale in ("10.5 * 0.62", "11.5 * 0.62"):
        assert stale not in menu, f"{stale} is the guess that went stale"
    # the fallback exists for a canvas-less environment and must read the token, not a literal
    assert "getPropertyValue('--font-size')" in menu


def test_a_menu_holding_columns_is_allowed_more_width_than_one_holding_a_list():
    """two columns of file names inside a 560px panel truncate the names they exist to show.

    the cap is a share of the viewport as well as a pixel ceiling, so a wide screen gets the
    doubling and a narrow one is held to 45% rather than covering the page.
    """
    css = (ASSETS / "base.css").read_text()
    rule = ".menu-panel:has(.label-columns)"
    assert rule in css, "column menus need their own width cap"
    line = next(ln for ln in css.splitlines() if ln.startswith(rule))
    assert "45vw" in line, "the viewport share is the half that protects a narrow window"
    assert "min(" in line, "a pixel ceiling and a viewport share, whichever binds first"


def test_the_drawer_slides_on_the_shared_motion_tokens():
    """drawer.js carried its own 220ms while base.css declared --motion-duration THE one timing
    every animated thing reads; a host retuning motion moved the expander and not the drawer
    """
    rule = re.search(r"\.drawer\s*\{(.*?)\}", _css(), re.DOTALL).group(1)
    assert "transition: left var(--motion-duration) var(--motion-ease)" in rule
    assert "position: fixed" in rule, "the drawer's placement is the stylesheet's, not inline"
    drawer = (ASSETS / "drawer.js").read_text()
    assert "220" not in drawer, "no second timing source"
    assert "style.position" not in drawer


def test_the_range_look_is_one_rule_set_under_two_selectors():
    """.range-slider and makeSlider's input used to be a verbatim copy of each other - a retune of
    the pipe that reached one and not the other would ship two sliders that no longer match
    """
    css = _css()
    thumb = re.findall(r"::-webkit-slider-thumb\s*\{", css)
    assert len(thumb) == 2, f"one thumb rule and one focus rule, found {len(thumb)}"
    assert re.search(
        r"\.slider-axis input\[type=\"range\"\]::-webkit-slider-thumb,\s*\n\s*\.range-slider::-webkit-slider-thumb",
        css,
    ), "both selectors share the one thumb rule"


def test_the_nav_bar_is_reachable_by_class():
    """every other primitive is a class; the bar was an id, which means a page cannot carry two
    and a consumer's markup must use that exact id or get an unstyled strip
    """
    assert re.search(r"^\.nav-bar, #nav-bar\s*\{", _css(), re.MULTILINE)


def test_edge_pulse_keeps_focus_and_reduced_motion_visible():
    css = _css()
    pulse = css[css.index(".edge-pulse {") : css.index("/* ---- column grouping")]
    assert "transform:" not in pulse
    assert "filter:" not in pulse
    assert "pointer-events: none" in pulse
    assert "@keyframes edge-pulse-breathe" in pulse
    assert "@keyframes edge-pulse-drift" in pulse
    reduced = pulse.split("@media (prefers-reduced-motion: reduce)")[1]
    assert "animation: none" in reduced
    assert "box-shadow: inset" in reduced
    assert "var(--ambient-pulse-min) + var(--ambient-pulse-max)" in reduced
