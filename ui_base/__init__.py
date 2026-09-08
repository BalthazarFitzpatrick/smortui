"""ui_base: the shared web interface for these tools.

WHAT THIS IS. A handful of plain files - one stylesheet and four scripts - that a local tool can
serve to get menus, dropdowns, tab shells, sliders, pan/zoom, crop alignment and grid selection
that all look and
behave like one product. No build step, no framework, no npm. A `<link>` and three `<script>` tags.

WHY IT IS A PROJECT RATHER THAN A COPY. These grew inside one tool and every one of them earned its
behaviour from a real failure there - a popup that never dismissed and swept a stale selection into
the next action, a slider whose shift+scroll only ever shrank, a reset that unzoomed without
centring. Copying the files into the next project copies the code and loses the reasons, and the
reasons are most of the value. Consuming them from here keeps both.

HOW A TOOL CONSUMES IT. Serve `ASSETS` under some route and link it:

    from ui_base import ASSETS, read_asset

    # in a request handler, for a path like /ui/menu.js
    body = read_asset(name)          # refuses anything outside ASSETS

Then in the page, in this order - base.css first so a tool's own stylesheet can override it, and
shell.js before the script that calls initShell:

    <link rel="stylesheet" href="/ui/base.css">
    <script src="/ui/menu.js"></script>
    <script src="/ui/shell.js"></script>
    <script src="/ui/align.js"></script>     <!-- only if you need crop alignment -->
    <script src="/ui/select.js"></script>    <!-- only if you need grid/list selection -->
    <script src="/ui/buckets.js"></script>   <!-- only if you need a bucket layout with 2D focus -->
    <script src="/ui/expand.js"></script>    <!-- only if you need a strip that expands to a panel -->
    <script src="/ui/indicate.js"></script>  <!-- only if you need the count badge or focus marker -->
"""

from __future__ import annotations

from pathlib import Path

__all__ = ["ASSETS", "UiBaseError", "asset_names", "read_asset"]

ASSETS = Path(__file__).resolve().parent / "assets"


class UiBaseError(Exception):
    pass


def asset_names() -> list[str]:
    """every file a tool may serve from here"""
    return sorted(p.name for p in ASSETS.iterdir() if p.is_file())


def read_asset(name: str) -> bytes:
    """one asset's bytes, refusing anything outside the assets directory.

    RESOLVE THEN CHECK, never string-matching on "..": a route that concatenates a user-supplied
    name onto a directory is the classic path traversal, and the only reliable test is whether the
    resolved path is still inside the directory it should be.
    """
    path = (ASSETS / name).resolve()
    if not path.is_file() or ASSETS not in path.parents:
        raise UiBaseError(f"no such asset: {name!r}")
    return path.read_bytes()
