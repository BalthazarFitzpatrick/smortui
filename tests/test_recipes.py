"""docs/recipes/index.json: the manifest guard, the same job test_stylesheet.py does for the
palette - this is what stops the index drifting from the docs and demo blocks it points at.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "docs" / "recipes" / "index.json"
DEMO = (ROOT / "demo" / "index.html").read_text()

REQUIRED_STRING_FIELDS = ("id", "title", "summary", "file", "added")


def _entries() -> list[dict]:
    return json.loads(INDEX.read_text())


def test_the_index_is_a_list_of_well_formed_entries():
    entries = _entries()
    assert entries, "the index must list at least the first recipe"
    seen_ids = set()
    for entry in entries:
        for field in REQUIRED_STRING_FIELDS:
            assert isinstance(entry.get(field), str) and entry[field], (
                f"{entry.get('id', '?')!r} is missing or has a blank {field!r}"
            )
        assert entry["id"] not in seen_ids, f"duplicate id {entry['id']!r}"
        seen_ids.add(entry["id"])
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", entry["id"]), (
            f"{entry['id']!r} must be kebab-case"
        )
        assert isinstance(entry.get("primitives"), list) and entry["primitives"], entry["id"]
        assert isinstance(entry.get("tags"), list) and entry["tags"], entry["id"]
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["added"]), entry["id"]


def test_every_indexed_file_exists():
    for entry in _entries():
        path = ROOT / entry["file"]
        assert path.is_file(), f"{entry['id']!r} points at a missing file: {entry['file']}"


def test_every_indexed_demo_selector_exists_in_the_gallery():
    """demo is either an object naming a live block, or null for a recipe with none yet"""
    for entry in _entries():
        demo = entry.get("demo")
        if demo is None:
            continue
        assert isinstance(demo, dict) and {"panel", "selector"} <= demo.keys(), entry["id"]
        selector_id = demo["selector"].removeprefix("#")
        assert f'id="{selector_id}"' in DEMO, (
            f"{entry['id']!r} names a demo selector not found in demo/index.html: {demo['selector']}"
        )
        assert f'data-panel="{demo["panel"]}"' in DEMO, (
            f"{entry['id']!r} names a demo panel that does not exist: {demo['panel']}"
        )


def test_every_recipe_doc_links_back_to_its_own_demo_block():
    """a recipe with a live demo should say where to find it, so the doc and the gallery stay
    findable from each other rather than drifting into two unrelated things"""
    for entry in _entries():
        if entry.get("demo") is None:
            continue
        text = (ROOT / entry["file"]).read_text()
        assert "demo/index.html" in text, f"{entry['id']!r} does not point back at the gallery"
