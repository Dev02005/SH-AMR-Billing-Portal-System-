"""Vercel entry point: the whole API as one Python function.

vercel.json sends every /api/... request here; Flask sees the original path
and routes it as usual. On a computer the same app runs with ``python app.py``.
"""

import sys
from pathlib import Path

# Vercel runs this file from the project root; make the ``server`` package
# importable however the runtime sets up the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import create_app  # noqa: E402

app = create_app()
