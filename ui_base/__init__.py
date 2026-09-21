"""ui_base: the shared web interface for these tools.

WHAT THIS IS. A handful of plain files - one stylesheet and a dozen scripts - that a local tool
can serve to get menus, dropdowns, tab shells, sliders, pan/zoom, crop alignment, grid selection
and a keyboard-first board layout that all look and behave like one product. No build step, no
framework, no npm. A `<link>` and a few `<script>` tags.

WHY IT IS A PROJECT RATHER THAN A COPY. These grew inside one tool and every one of them earned its
behaviour from a real failure there - a popup that never dismissed and swept a stale selection into
the next action, a slider whose shift+scroll only ever shrank, a reset that unzoomed without
centring. Copying the files into the next project copies the code and loses the reasons, and the
reasons are most of the value. Consuming them from here keeps both.

HOW A TOOL CONSUMES IT. Serve `ASSETS` under some route and link it:

    from ui_base import ASSETS, content_type, read_asset

    # in a request handler, for a path like /ui/menu.js
    body = read_asset(name)          # refuses anything outside ASSETS
    header = content_type(name)      # "application/javascript" - no mimetypes guessing

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
    <script src="/ui/drawer.js"></script>    <!-- only if you need an edge drawer -->
    <script src="/ui/help.js"></script>      <!-- only if you need the round ? tip -->
    <script src="/ui/entrytext.js"></script> <!-- only if you need header/paragraph text helpers -->
    <script src="/ui/pile.js"></script>      <!-- only if you need the pile/fan geometry -->

The full list is `asset_names()`; the README's Components table says what each one gives you.
"""

from __future__ import annotations

from pathlib import Path

__all__ = ["ASSETS", "UiBaseError", "asset_names", "content_type", "read_asset"]

ASSETS = Path(__file__).resolve().parent / "assets"


class UiBaseError(Exception):
    pass


# the two types this package ships, stated rather than guessed: mimetypes answers text/javascript on
# one python and application/javascript on another, and a consumer's handler should not have to
# know that. anything else is a bytestream
_CONTENT_TYPES = {".css": "text/css", ".js": "application/javascript"}


def content_type(name: str) -> str:
    """the Content-Type header for an asset name: menu.js -> application/javascript"""
    return _CONTENT_TYPES.get(Path(name).suffix, "application/octet-stream")


def _is_asset(path: Path) -> bool:
    # a dotfile in the directory (.DS_Store lands there on macos) is never something to serve
    return path.is_file() and not path.name.startswith(".")


def asset_names() -> list[str]:
    """every file a tool may serve from here"""
    return sorted(p.name for p in ASSETS.iterdir() if _is_asset(p))


def read_asset(name: str) -> bytes:
    """one asset's bytes, refusing anything outside the assets directory.

    RESOLVE THEN CHECK, never string-matching on "..": a route that concatenates a user-supplied
    name onto a directory is the classic path traversal, and the only reliable test is whether the
    resolved path is still inside the directory it should be.
    """
    path = (ASSETS / name).resolve()
    if not _is_asset(path) or ASSETS not in path.parents:
        raise UiBaseError(f"no such asset: {name!r}")
    return path.read_bytes()
