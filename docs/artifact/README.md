# the design-system page

`smortui.html` is the source of the claude.ai artifact that shows this package as one page: the six
rules, the tokens, the palette with live contrasts, every component drawn by the real `base.css` and
scripts, the recipes, the api and the changelog. Published 2026-09-21 at
https://claude.ai/artifact/2pHCBvRKdt1Bfsd6p63zMx (private until shared).

It is an artifact page, not a served page: no doctype or html wrapper (the publisher adds them), and
it links `ui/base.css` and `ui/<script>.js` as supporting files. To republish after a change to an
asset or to this file, copy the current assets next to it and publish with the artifact's url:

    mkdir -p /tmp/artifact/ui && cp ui_base/assets/*.css ui_base/assets/*.js /tmp/artifact/ui/
    cp docs/artifact/smortui.html /tmp/artifact/
    # Artifact tool: file_path /tmp/artifact/smortui.html, root /tmp/artifact,
    #   files {"ui/base.css": "ui/base.css", "ui/menu.js": "ui/menu.js", ...}, url <the link above>

`tests/test_serving.py` checks the page links only assets this package ships, so a renamed script
cannot leave the artifact pointing at nothing.
