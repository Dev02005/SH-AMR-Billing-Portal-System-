"""Health check and uploaded-image serving."""

import logging

from flask import Blueprint, send_from_directory

from server import db
from server.config import config

logger = logging.getLogger(__name__)

bp = Blueprint("system", __name__)


@bp.get("/api/health")
def health():
    connected = db.healthy()
    payload = {
        "success": connected,
        "status": "healthy" if connected else "unhealthy",
        "database": "connected" if connected else "disconnected",
    }
    return payload, 200 if connected else 503


@bp.get("/uploads/<path:filename>")
def uploaded_file(filename):
    """Serve a stored menu image.

    ``send_from_directory`` rejects paths that escape the upload folder, so a
    traversal attempt in ``filename`` cannot reach the rest of the disk.
    """
    return send_from_directory(config.UPLOAD_FOLDER, filename)
