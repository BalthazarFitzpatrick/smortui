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
from playwright.sync_api import expect, sync_playwright  # noqa: E402


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


def test_chart_series_styles_resolve_tokens_without_fading_swatches(page):
    page.click('.nav-tab[data-tab="chart"]')
    line = '#chart-demo .chart-line[data-series="forecast"]'
    expect(page.locator(line)).to_have_css("stroke", "rgb(224, 111, 45)")
    expect(page.locator(line)).to_have_css("opacity", "0.5")
    swatch = "#chart-demo .chart-legend-item:nth-child(2) .chart-legend-swatch"
    expect(page.locator(swatch)).to_have_css("border-top-color", "rgb(224, 111, 45)")
    expect(page.locator(swatch)).to_have_css("opacity", "1")
    page.locator("#chart-demo .chart-overlay").hover()
    swatch = "#chart-demo .chart-tooltip-swatch:nth-of-type(4)"
    expect(page.locator(swatch)).to_have_css("background-color", "rgb(224, 111, 45)")
    expect(page.locator(swatch)).to_have_css("opacity", "1")
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


def test_segments_share_borders_and_unavailable_is_dashed_but_focusable(page):
    page.click('.nav-tab[data-tab="controls"]')
    boxes = page.eval_on_selector_all(
        "#segments-lit .segment", "els => els.map(e => e.getBoundingClientRect())"
    )
    assert len(boxes) == 3
    for left, right in zip(boxes, boxes[1:], strict=False):
        assert right["left"] == pytest.approx(left["right"] - 2, abs=0.5), "borders must overlap"
    beta = "#segments-unavailable .segment.unavailable"
    assert _style(page, beta, "borderTopStyle") == "dashed"
    assert page.get_attribute(beta, "aria-disabled") == "true"
    assert page.get_attribute(beta, "disabled") is None
    assert page.get_attribute(beta, "title")
    assert _style(page, "#segments-lit .segment", "borderRadius") == "0px"
    assert page.errors == [], page.errors


def test_segments_move_only_after_the_host_accepts(page):
    page.click('.nav-tab[data-tab="controls"]')
    refuse = "#segments-refuse .segment"
    page.locator(refuse).nth(1).click()
    page.wait_for_timeout(50)
    assert page.eval_on_selector_all(f"{refuse}.on", "els => els.map(e => e.textContent)") == [
        "alpha"
    ]
    page.locator(refuse).nth(2).click()
    page.wait_for_timeout(50)
    assert page.eval_on_selector_all(f"{refuse}.on", "els => els.map(e => e.textContent)") == [
        "gamma"
    ]
    assert page.errors == [], page.errors


def test_the_focused_disclosure_lights_its_frame_and_its_header_stays_put(page):
    """the wide header must not lift (a 1.01 scale on a wide button reads as a bounce); the item frames"""
    page.click('.nav-tab[data-tab="controls"]')
    item = "#disclosure-demo .disclosure:nth-child(1)"
    head = f"{item} .disclosure-head"
    before = page.eval_on_selector(head, "e => e.getBoundingClientRect().toJSON()")
    _focus_by_keyboard(page, head)
    assert _style(page, head, "transform") == "none"
    assert _style(page, head, "filter") == "none"
    assert _style(page, head, "boxShadow") == "none"
    assert page.eval_on_selector(head, "e => e.getBoundingClientRect().toJSON()") == before
    frame = _style(page, item, "boxShadow")
    assert "inset" in frame and "2px" in frame, frame
    # a scale(1) and a saturate(1) brightness(1) are identities, which the browser reports as such
    assert _style(page, item, "transform") in ("none", "matrix(1, 0, 0, 1, 0, 0)"), "no lift"
    assert _style(page, item, "filter") in ("none", "saturate(1) brightness(1)"), "no filter"
    assert page.errors == [], page.errors


def test_a_closed_disclosure_hides_its_body_and_opens_on_click(page):
    page.click('.nav-tab[data-tab="controls"]')
    item = "#disclosure-demo .disclosure:nth-child(1)"
    expect(page.locator(f"{item} .disclosure-body")).to_be_hidden()
    expect(page.locator(f"{item} .disclosure-summary")).to_be_visible()
    page.click(f"{item} .disclosure-head")
    expect(page.locator(f"{item} .disclosure-body")).to_be_visible()
    expect(page.locator(f"{item} .disclosure-summary")).to_be_visible()
    assert page.get_attribute(f"{item} .disclosure-head", "aria-expanded") == "true"
    # the second item started open and stays open: items are independent
    expect(
        page.locator("#disclosure-demo .disclosure:nth-child(2) .disclosure-body")
    ).to_be_visible()
    page.click(f"{item} .disclosure-head")
    assert page.errors == [], page.errors


def test_the_aside_follows_the_focused_row_beside_its_host(page):
    """a focused row shows the box beside the host at the row's height; the next row moves it, it
    never takes focus, and nothing is logged
    """
    page.click('.nav-tab[data-tab="primitives"]')
    page.eval_on_selector("#aside-demo", "e => e.scrollIntoView({block: 'center'})")
    rows = ".aside-demo-row"
    page.eval_on_selector(f"{rows}:nth-child(1)", "e => e.focus()")
    page.wait_for_timeout(450)  # past the fade
    aside = page.locator(".aside")
    expect(aside).to_be_visible()

    def boxes():
        return page.evaluate(
            """() => {
              const r = s => document.querySelector(s).getBoundingClientRect();
              const a = r('.aside'), h = r('#aside-demo'), row = document.activeElement.getBoundingClientRect();
              return {aside: a.toJSON(), host: h.toJSON(), row: row.toJSON()};
            }"""
        )

    first = boxes()
    centre = lambda b: b["top"] + b["height"] / 2  # noqa: E731
    assert abs(centre(first["aside"]) - centre(first["row"])) <= 2, first
    assert first["aside"]["left"] >= first["host"]["right"], "to the right of the host"
    assert page.eval_on_selector(".aside", "e => e.getAttribute('role')") == "note"
    assert page.eval_on_selector(".aside", "e => e.tabIndex") == -1, "never focusable"
    page.keyboard.press("Tab")
    page.wait_for_timeout(450)  # past the slide
    second = boxes()
    assert second["aside"]["top"] != first["aside"]["top"], "moving focus moved the box"
    assert abs(centre(second["aside"]) - centre(second["row"])) <= 2, second
    focused = page.evaluate("document.activeElement.className")
    assert "aside-demo-row" in focused, "focus stayed on the row"
    assert not page.evaluate("document.querySelector('.aside').contains(document.activeElement)")
    # the long row: tall, wrapped, still inside the viewport and clear of the host
    page.keyboard.press("Tab")
    page.wait_for_timeout(450)
    long_box = boxes()["aside"]
    viewport_height = page.evaluate("window.innerHeight")
    assert long_box["bottom"] <= viewport_height and long_box["top"] >= 0, long_box
    assert long_box["width"] <= 281, long_box
    page.eval_on_selector(f"{rows}:nth-child(3)", "e => e.blur()")
    page.wait_for_timeout(450)
    expect(aside).to_be_hidden()
    assert page.errors == [], page.errors


# the chained-columns demo: north > alpha/beta/gamma/delta > levels, south > epsilon/zeta > levels
def _open_chain(page, trigger):
    page.keyboard.press("Escape")
    page.click('.nav-tab[data-tab="menus"]')
    page.click(trigger)
    page.wait_for_timeout(100)


def _press(page, *keys):
    for key in keys:
        page.keyboard.press(key)


def _rows(page, column):
    return page.eval_on_selector_all(
        f'.menu-panel .col[data-column="{column}"] .menu-item',
        "els => els.map(e => [...e.children].map(c => c.textContent).filter(Boolean).join(' '))",
    )


def _cursor(page):
    return page.evaluate(
        "(() => { const a = document.activeElement;"
        " return a.closest('.col')?.dataset.column + ':' + a.dataset.id; })()"
    )


def _picked(page, column):
    return page.eval_on_selector_all(
        f'.menu-panel .col[data-column="{column}"] .menu-item.on',
        "els => els.map(e => e.dataset.id)",
    )


def test_the_worked_keystrokes_pick_three_paths_in_the_real_menu(page):
    """multi > multi > single: space toggles, right and left move without picking, the next column
    follows the cursor, the host counts and the path marker show, enter confirms"""
    _open_chain(page, "#open-chain-mixed")
    _press(page, "ArrowDown")
    assert _cursor(page) == "0:north"
    assert _rows(page, 1) == [], "no children before a pick"
    _press(page, "ArrowRight")
    assert _cursor(page) == "0:north", "right with no children stays put"
    _press(page, "Space")
    assert _rows(page, 1) == ["alpha", "beta", "gamma", "delta"]
    assert _cursor(page) == "0:north", "the cursor stays on the item"
    _press(page, "ArrowRight")
    assert _cursor(page) == "1:alpha"
    assert _picked(page, 1) == [], "right picks nothing"
    _press(page, "ArrowDown", "ArrowDown", "Space")
    assert _cursor(page) == "1:gamma"
    assert len(_rows(page, 2)) == 5
    _press(page, "ArrowRight", "ArrowDown", "Space")
    assert _cursor(page) == "2:medium"
    assert _rows(page, 1)[2] == "gamma >", "gamma now carries the path marker"
    _press(page, "ArrowLeft")
    assert _cursor(page) == "1:gamma"
    _press(page, "ArrowUp", "Space", "ArrowRight", "ArrowDown", "ArrowDown", "Space")
    assert _cursor(page) == "2:high"
    _press(page, "ArrowLeft", "ArrowLeft", "ArrowDown")
    assert _cursor(page) == "0:south"
    _press(page, "Space", "ArrowRight", "Space", "ArrowRight", "ArrowDown", "ArrowDown", "Space")
    assert _cursor(page) == "2:high"
    assert _picked(page, 2) == ["high"]
    _press(page, "ArrowLeft", "ArrowLeft")
    assert _rows(page, 0) == ["north 2", "south 1 >", "west"]
    _press(page, "Enter")
    page.wait_for_timeout(50)
    assert page.text_content("#chain-said") == (
        "confirmed north/beta/high, north/gamma/medium, south/epsilon/high"
    )
    assert page.query_selector(".menu-panel:not(.panel-inline)") is None, "enter closed it"
    assert page.errors == [], page.errors


def test_unpicking_a_parent_clears_what_hung_below_it_and_a_repick_starts_empty(page):
    _open_chain(page, "#open-chain-mixed")
    _press(page, "ArrowDown", "Space", "ArrowRight", "Space", "ArrowRight", "ArrowDown", "Space")
    _press(page, "ArrowLeft", "ArrowLeft")
    assert _rows(page, 0)[0] == "north 1 >"
    _press(page, "Space")
    assert _rows(page, 0)[0] == "north", "the count goes with the picks"
    _press(page, "Space")
    assert _picked(page, 1) == [], "re-picking starts the parent empty"
    _press(page, "ArrowRight", "ArrowRight")
    assert _picked(page, 2) == []
    page.keyboard.press("Escape")
    assert page.query_selector(".menu-panel:not(.panel-inline)") is None, "escape closes"


def test_a_single_select_column_replaces_its_pick_and_space_on_the_pick_unpicks(page):
    _open_chain(page, "#open-chain-single")
    _press(page, "ArrowDown", "Space", "ArrowRight", "Space", "ArrowRight", "ArrowDown", "Space")
    assert _picked(page, 2) == ["medium"]
    _press(page, "ArrowDown", "Space")
    assert _picked(page, 2) == ["high"], "picking another replaces the pick"
    _press(page, "Space")
    assert _picked(page, 2) == [], "space on the picked row unpicks it"
    # single select all the way: another group replaces the first
    _press(page, "ArrowLeft", "ArrowLeft", "ArrowDown", "Space")
    assert _picked(page, 0) == ["south"]
    _press(page, "ArrowUp")
    assert _rows(page, 1) == [], "north is no longer picked, so it shows no children"
    page.keyboard.press("Escape")


def test_all_multi_counts_sit_on_every_parent_whose_children_are_multi(page):
    _open_chain(page, "#open-chain-multi")
    _press(page, "ArrowDown", "Space", "ArrowRight", "Space", "ArrowRight", "ArrowDown", "Space")
    _press(page, "ArrowDown", "Space", "ArrowLeft")
    assert _rows(page, 1)[0] == "alpha 2 >"
    assert _rows(page, 0)[0] == "north 2 >"
    page.keyboard.press("Escape")


def test_an_unavailable_row_is_dashed_focusable_and_inert(page):
    _open_chain(page, "#open-chain-mixed")
    _press(page, "ArrowDown", "ArrowDown", "ArrowDown")
    assert _cursor(page) == "0:west", "the arrow order still reaches it"
    row = ".menu-panel .menu-item[data-id='west']"
    assert page.get_attribute(row, "aria-disabled") == "true"
    assert page.get_attribute(row, "title") == "not connected"
    assert _style(page, row, "borderTopStyle") == "dashed"
    assert float(_style(page, row, "opacity")) == 1.0
    _press(page, "Space")
    page.click(row)
    assert _picked(page, 0) == []
    page.keyboard.press("Escape")


def test_enter_confirms_without_toggling_and_the_dividers_keep_their_margins(page):
    _open_chain(page, "#open-chain-mixed")
    _press(page, "ArrowDown")
    assert _style(page, ".menu-panel .divider", "marginTop") == "15px"
    assert _style(page, ".menu-panel .divider", "marginBottom") == "15px"
    _press(page, "Enter")
    page.wait_for_timeout(50)
    assert page.text_content("#chain-said") == "confirmed nothing", "enter picked nothing"
    assert page.query_selector(".menu-panel:not(.panel-inline)") is None
    assert page.errors == [], page.errors
