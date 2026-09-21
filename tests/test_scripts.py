"""the scripts: every one parses, and every one with behaviour has a runner under tests/js.

PARSING IS NOT BEHAVIOUR. `node --check` proves a file loads, which says nothing about whether a
column carries its own heading, a drawer parks its sliver, or a focus marker ignores the element
focus already left. Each runner under tests/js is one script's contract exercised against a dom
stub or against plain values - the things under test are structure and arithmetic, so a full jsdom
would be testing the browser as much as the code.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from ui_base import ASSETS

from .expected import EXPECTED

# node runs the scripts' behaviour tests. locally a missing node skips them; under CI it is a
# failure, because a runner that quietly skipped half the suite would report green for nothing
_NO_NODE = shutil.which("node") is None
needs_node = pytest.mark.skipif(
    _NO_NODE and not os.environ.get("CI"),
    reason="node is not installed",
)
# an underscore-prefixed file is a helper the runners import (tests/js/_dom.mjs), not a runner
JS_TESTS = sorted(
    p for p in (Path(__file__).parent / "js").glob("*.mjs") if not p.name.startswith("_")
)


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
    "shell.js": "shell_tabs.mjs",
    "align.js": "aligner.mjs",
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
    """one runner, one script's contract (see the module docstring). DISCOVERED BY GLOB on
    purpose: dir_menu.mjs sat here for a release with no case naming it, and nothing ran it.
    """
    assert not _NO_NODE, "CI must have node"
    result = subprocess.run(["node", str(script)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, f"{script.name} fails:\n{result.stdout}{result.stderr}"
