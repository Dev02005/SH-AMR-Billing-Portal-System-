"""Entrypoint for the S&H Arabian Mandi POS backend.

    python app.py

The application itself lives in the ``server`` package; this file only builds
it and starts the development server.
"""

import logging

from server import create_app
from server.config import config

app = create_app()
logger = logging.getLogger(__name__)


if __name__ == "__main__":
    logger.info("Starting API on http://localhost:%s (debug=%s)", config.PORT, config.DEBUG)
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, use_reloader=False)
