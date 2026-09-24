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

import importlib.util
import json
import os
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

if os.environ.get("CI"):
    # under CI a missing playwright is a failure, the same rule test_scripts.py keeps for node
    import playwright.sync_api  # noqa: F401
else:
    pytest.importorskip(
        "playwright.sync_api", reason="playwright is not installed (uv sync --group shots)"
    )
# after the importorskip on purpose: a missing playwright must skip before this line runs
from playwright.sync_api import sync_playwright  # noqa: E402


def _demo_handler():
    # loaded from its path under a private name: `serve` is too generic to put on sys.path
    spec = importlib.util.spec_from_file_location("ui_base_demo_serve", ROOT / "demo" / "serve.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Handler


Handler = _demo_handler()


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


def _focus_by_keyboard(page, selector):
    """a key press first, so a programmatic focus counts as keyboard focus for :focus-visible"""
    page.keyboard.press("Shift")
    page.eval_on_selector(selector, "e => e.focus()")
    page.wait_for_timeout(250)  # past --focus-glow-ms


def _style(page, selector, prop):
    return page.eval_on_selector(selector, f"e => getComputedStyle(e).{prop}")


def test_controls_fields_and_links_wear_the_soft_card_focus(page):
    """one look: an inset ring, no outline, and the light, on a button, a field and a link"""
    page.click('.nav-tab[data-tab="controls"]')
    for selector in ("#focus-demo .toggle", "#field-demo", "#focus-demo a", "details summary"):
        _focus_by_keyboard(page, selector)
        shadow = _style(page, selector, "boxShadow")
        assert "inset" in shadow and "2px" in shadow, f"{selector}: {shadow}"
        assert _style(page, selector, "outlineStyle") == "none", selector
        assert "saturate(1.23)" in _style(page, selector, "filter"), selector
    assert _style(page, "#field-demo", "borderTopColor") == "rgb(74, 74, 82)", "no cream border"
    page.eval_on_selector("#field-demo", "e => e.blur()")


def test_a_container_lights_while_its_field_has_focus(page):
    page.click('.nav-tab[data-tab="controls"]')
    page.click("#within-demo .text-field")
    page.wait_for_timeout(250)
    assert "inset" in _style(page, "#within-demo", "boxShadow")
    page.eval_on_selector("#within-demo .text-field", "e => e.blur()")


def test_a_focused_floating_panel_keeps_its_shadow_and_has_no_ring(page):
    page.click('.nav-tab[data-tab="primitives"]')
    page.eval_on_selector(".drawer", "e => { e.tabIndex = -1; }")  # as a menu makes its panel
    _focus_by_keyboard(page, ".drawer")
    assert page.eval_on_selector(".drawer", "e => e.matches(':focus-visible')")
    shadow = _style(page, ".drawer", "boxShadow")
    assert "inset" not in shadow and "20px" in shadow, shadow
    assert _style(page, ".drawer", "transform") == "none"


def test_a_selected_toggle_carries_the_cream_border(page):
    page.click('.nav-tab[data-tab="controls"]')
    assert _style(page, "#focus-demo .toggle.on", "borderTopColor") == "rgb(232, 221, 195)"
    assert _style(page, "#focus-demo a", "color") == "rgb(82, 190, 217)"
