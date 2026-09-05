"""the package's one job: hand a consumer an asset, and refuse everything else.

WHAT THESE GUARD. ui_base has no runtime of its own - it is files plus a reader - so the failures
available to it are: serving something it should not, failing to serve something a consumer links,
and shipping CSS or JS that is broken in a way no python test would ever notice. One test each.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ui_base import ASSETS, UiBaseError, asset_names, read_asset

# what a consumer's page links. named explicitly rather than globbed: a test that reads the
# directory it is checking passes just as happily when the directory is empty
EXPECTED = {"base.css", "menu.js", "shell.js", "align.js"}


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
    ],
)
def test_nothing_outside_the_assets_directory_can_be_read(name):
    """RESOLVE THEN CONTAIN, not a blocklist on "..". A route that concatenates a caller-supplied
    name onto a directory is the classic traversal, and a consumer serves this over http.
    """
    with pytest.raises(UiBaseError):
        read_asset(name)


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


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
@pytest.mark.parametrize("name", sorted(n for n in EXPECTED if n.endswith(".js")))
def test_the_scripts_parse(name):
    """a syntax error ships silently: the browser drops the whole file and the page goes inert"""
    result = subprocess.run(
        ["node", "--check", str(ASSETS / name)], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, f"{name} does not parse:\n{result.stderr}"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_the_menu_builds_the_sections_it_promises():
    """PARSING IS NOT BEHAVIOUR. `node --check` proves the file loads, which says nothing about
    whether a column carries its own heading or an item's state reaches the row. This runs the real
    class against a DOM stub - the two things under test are pure structure, so a full jsdom would
    be testing the browser as much as the code.
    """
    script = Path(__file__).parent / "js" / "menu_sections.mjs"
    result = subprocess.run(["node", str(script)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, f"menu sections misbehave:\n{result.stdout}{result.stderr}"


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
    tokens = set(re.findall(r"(--(?:gap|inset|inset-x|rule-gap))\s*:", root))
    assert tokens == {"--gap", "--inset", "--inset-x", "--rule-gap"}, sorted(tokens)

    rule = re.search(r"\.h-divider\s*\{(.*?)\}", css, re.DOTALL).group(1)
    assert "var(--rule-gap)" in rule, "the rule's own breathing room must come from the token"


def test_a_horizontal_rule_has_room_above_and_below_it():
    """it was `margin: 0 15px`, so every consumer that wanted space around a rule added its own -
    and one of them named only four selectors, giving that tab two different rhythms
    """
    rule = re.search(r"\.h-divider\s*\{(.*?)\}", _css(), re.DOTALL).group(1)
    margin = re.search(r"margin:\s*([^;]+);", rule).group(1)
    assert not margin.strip().startswith("0 "), f"no vertical margin on the rule: {margin}"


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


def test_the_two_sampled_hues_are_still_the_only_ones():
    """ "two hues, and only two" is the palette's stated rule - the README, the CSS header and the
    demo's colour board all say so, so a third arriving quietly makes all three wrong
    """
    css = _css()
    root = re.search(r":root\s*\{(.*?)\}", css, re.DOTALL).group(1)
    hues = {
        name
        for name in re.findall(r"(--[\w-]+)\s*:\s*#", root)
        if "lichen" in name or "stone" in name
    }
    assert hues == {"--lichen", "--lichen-deep", "--stone-red", "--stone-red-lift"}, sorted(hues)
