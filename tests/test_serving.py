"""serving: hand a consumer an asset, and refuse everything else.

WHAT THESE GUARD. ui_base has no runtime of its own - it is files plus a reader - so the failures
available to it are: serving something it should not, failing to serve something a consumer links,
and shipping CSS or JS that is broken in a way no python test would ever notice. This file is the
first two; test_scripts.py and test_stylesheet.py are the third.
"""

from __future__ import annotations

import pytest

from ui_base import ASSETS, UiBaseError, asset_names, read_asset

from .expected import EXPECTED


def test_every_expected_asset_is_present_and_not_empty():
    assert set(asset_names()) >= EXPECTED
    for name in EXPECTED:
        assert read_asset(name).strip(), f"{name} is empty"


def test_asset_names_matches_what_is_on_disk():
    on_disk = {p.name for p in ASSETS.iterdir() if p.is_file() and not p.name.startswith(".")}
    assert set(asset_names()) == on_disk


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
