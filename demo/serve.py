"""the demo page, so every component can be seen and clicked.

    uv run python demo/serve.py --port 8770

Serves demo/index.html at / and ui_base's assets under /ui/, which is exactly the wiring a real
tool does - so if the demo works, the integration instructions in the README are correct.
"""

from __future__ import annotations

import argparse
import contextlib
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ui_base import UiBaseError, read_asset

DEMO = Path(__file__).resolve().parent / "index.html"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(DEMO.read_bytes(), "text/html")
            return
        if self.path.startswith("/ui/"):
            # a cache-busting ?v= is the host's business, not the asset's name
            name = self.path[len("/ui/") :].split("?", 1)[0]
            try:
                body = read_asset(name)
            except UiBaseError:
                self.send_response(404)
                self.end_headers()
                return
            self._send(body, mimetypes.guess_type(name)[0] or "application/octet-stream")
            return
        self.send_response(404)
        self.end_headers()

    def _send(self, body: bytes, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        # a demo is edited and reloaded constantly; a cached asset makes an edit look like it did
        # nothing, which is the single most confusing failure while working on one
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8770)
    args = parser.parse_args(argv)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"http://127.0.0.1:{args.port}")
    with contextlib.suppress(KeyboardInterrupt):
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
