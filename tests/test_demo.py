"""the whole-system test: the demo page, served the way a consumer serves this package, in a real
browser, with no console error and every interactive block answering.

WHY THIS EXISTS. The README says "if the demo works, the integration instructions are right", and
until now nothing proved the demo works - a script that parses and a runner that passes against a
dom stub can still add up to a page that throws on load. This is the one test that sees the seams
between the assets: base.css loaded before the scripts, menu.js before anything that opens a Menu,
the recipes' demo selectors actually present and clickable.

Needs playwright (`uv sync --group shots` and `uv run playwright install chromium`); skipped without
it locally, a failure under CI like the node tests.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "demo"))

playwright = pytest.importorskip(
    "playwright.sync_api", reason="playwright is not installed (uv sync --group shots)"
)
# after the importorskip on purpose: a missing playwright must skip before this line runs
from playwright.sync_api import sync_playwright  # noqa: E402

# demo/serve.py, put on sys.path above - the demo's own handler is the thing under test
from serve import Handler  # noqa: E402


@pytest.fixture(scope="module")
def demo_url():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/"
    finally:
        server.shutdown()


@pytest.fixture(scope="module")
def page(demo_url):
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception as err:  # the package is installed but no browser is
            if os.environ.get("CI"):
                raise
            pytest.skip(f"no chromium for playwright: {err}")
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.errors = errors  # type: ignore[attr-defined]
        page.goto(demo_url)
        page.wait_for_timeout(200)
        yield page
        browser.close()


def test_the_demo_loads_without_a_single_error(page):
    assert page.errors == [], page.errors


def test_every_tab_opens_and_shows_its_panel(page):
    names = page.eval_on_selector_all(".nav-tab", "els => els.map(e => e.dataset.tab)")
    assert len(names) >= 4
    for name in names:
        page.click(f'.nav-tab[data-tab="{name}"]')
        shown = page.eval_on_selector_all(
            ".tab-panel:not(.hidden)", "els => els.map(e => e.dataset.panel)"
        )
        assert shown == [name], f"after clicking {name}: {shown}"
    assert page.errors == [], page.errors


def test_every_recipe_trigger_exists_and_a_menu_trigger_opens_one_panel(page):
    """the recipes index names a selector per live block; each must be present, and the ones that
    are menu heads must open exactly one floating panel and close on escape"""
    entries = json.loads((ROOT / "docs" / "recipes" / "index.json").read_text())
    for entry in entries:
        demo = entry.get("demo")
        if demo is None:
            continue
        page.click(f'.nav-tab[data-tab="{demo["panel"]}"]')
        assert page.query_selector(demo["selector"]), f"{entry['id']}: {demo['selector']} missing"
        is_head = page.eval_on_selector(
            demo["selector"], "e => e.classList.contains('dropdown-head')"
        )
        if not is_head:
            continue
        page.click(demo["selector"])
        page.wait_for_timeout(100)
        panels = page.eval_on_selector_all(".menu-panel:not(.panel-inline)", "els => els.length")
        assert panels == 1, f"{entry['id']}: {panels} floating panels open"
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)
        panels = page.eval_on_selector_all(".menu-panel:not(.panel-inline)", "els => els.length")
        assert panels == 0, f"{entry['id']}: escape did not close it"
    assert page.errors == [], page.errors


def test_the_directory_browser_drills_and_picks(page):
    page.click('.nav-tab[data-tab="menus"]')
    page.click("#open-dirs")
    page.wait_for_timeout(100)
    page.click(".menu-panel .menu-item:has-text('docs/')")
    page.wait_for_timeout(100)
    page.click(".menu-panel .menu-item:has-text('a.md')")
    page.wait_for_timeout(50)
    assert page.text_content("#dirs-said") == "picked /docs/a.md"
    assert page.errors == [], page.errors


def test_assets_are_served_with_the_stated_content_types(demo_url):
    import urllib.error
    import urllib.request

    for name, expected in (("base.css", "text/css"), ("menu.js", "application/javascript")):
        with urllib.request.urlopen(f"{demo_url}ui/{name}?v=1") as resp:
            assert resp.headers["Content-Type"] == expected
            assert resp.headers["Cache-Control"] == "no-store"
    with pytest.raises(urllib.error.HTTPError) as err:
        urllib.request.urlopen(f"{demo_url}ui/../pyproject.toml")
    assert err.value.code == 404
