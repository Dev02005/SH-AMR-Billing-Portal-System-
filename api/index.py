"""Vercel entry point: the whole API as one Python function.

vercel.json sends every /api/... request here; Flask sees the original path
and routes it as usual. On a computer the same app runs with ``python app.py``.
"""

import sys
from pathlib import Path
from urllib.parse import unquote_to_bytes

# Vercel runs this file from the project root; make the ``server`` package
# importable however the runtime sets up the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import create_app  # noqa: E402


class DecodedPath:
    """Hand Flask the request path decoded, as every WSGI server does.

    Vercel's Python runtime passes PATH_INFO still percent-encoded, so
    ``PUT /api/custom-items/barbequ%20mandi`` looked for an item literally
    named "barbequ%20mandi" and every item or category with a space in its
    name answered "not found" - only on Vercel. WSGI (PEP 3333) wants the
    decoded bytes as a latin-1 string, which Werkzeug then reads as UTF-8.
    """

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if "%" in path:
            environ["PATH_INFO"] = unquote_to_bytes(path).decode("latin-1")
        return self.wsgi_app(environ, start_response)


app = create_app()
app.wsgi_app = DecodedPath(app.wsgi_app)
