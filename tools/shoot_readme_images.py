"""retakes the readme's screenshots against the demo page.

the demo is the only page these shots may point at - it is a fixed fixture with no real user data,
so a published image can never leak anything from a real board. run the server in one terminal,
this script in another:

    uv run python demo/serve.py --port 8770
    uv run python tools/shoot_readme_images.py --port 8770

each image keeps the name the readme already references, written into docs/images.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

OUT = Path(__file__).resolve().parent.parent / "docs" / "images"
WIDTH = 1500


def settle(page: Page, ms: int = 400) -> None:
    page.wait_for_timeout(ms)


def shoot(page: Page, name: str) -> None:
    page.screenshot(path=str(OUT / name))
    print("wrote", OUT / name)


def open_tab(page: Page, tab: str) -> None:
    page.click(f'.nav-tab[data-tab="{tab}"]')
    settle(page)


def shoot_controls(page: Page) -> None:
    open_tab(page, "controls")
    # the toggle row plus columns-and-dividers, which is what the caption describes
    box = page.eval_on_selector(
        ".tab-panel[data-panel='controls']",
        "el => { const r = el.getBoundingClientRect(); "
        "return {x: r.x, y: r.y, width: 900, height: 780}; }",
    )
    page.screenshot(path=str(OUT / "controls.png"), clip=box)
    print("wrote", OUT / "controls.png")


def shoot_menu(page: Page) -> None:
    open_tab(page, "menus")
    page.click("#open-rich")
    settle(page, 500)
    box = page.eval_on_selector(
        ".menu-panel:not(.panel-inline)",
        "el => { const r = el.getBoundingClientRect(); "
        "return {x: Math.max(r.x - 40, 0), y: Math.max(r.y - 40, 0), "
        "width: r.width + 400, height: r.height + 80}; }",
    )
    page.screenshot(path=str(OUT / "menu.png"), clip=box)
    page.keyboard.press("Escape")
    print("wrote", OUT / "menu.png")


def shoot_board_primitives(page: Page) -> None:
    open_tab(page, "primitives")
    # focus the second fan card so the covered ones slide and the focus glow shows
    page.eval_on_selector_all(".fan-item", "els => { if (els[1]) { els[1].focus(); } }")
    settle(page, 500)
    # buckets down through the pile, so all three primitives land in one shot
    box = page.eval_on_selector(
        ".tab-panel[data-panel='primitives']",
        "el => { const panel = el.getBoundingClientRect(); "
        "const pile = document.querySelector('.card-pile').getBoundingClientRect(); "
        "return {x: panel.x, y: panel.y, width: 1200, height: pile.bottom - panel.y + 30}; }",
    )
    page.screenshot(path=str(OUT / "board-primitives.png"), clip=box)
    print("wrote", OUT / "board-primitives.png")


def shoot_palette(page: Page) -> None:
    open_tab(page, "colour")
    settle(page, 300)
    shoot(page, "palette.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True, help="the demo server's port")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}/"
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": WIDTH, "height": 1550})
            page.goto(url)
            # makeDrawer parks a sliver at the right viewport edge on every tab - hide it so it
            # never bleeds into a shot of an unrelated component
            page.add_style_tag(content=".drawer { display: none !important; }")
            settle(page, 500)
            shoot_controls(page)
            shoot_menu(page)
            shoot_board_primitives(page)
            shoot_palette(page)
            page.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
