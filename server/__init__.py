"""S&H Arabian Mandi POS backend.

``create_app()`` wires configuration, the database, JWT auth and the route
blueprints together. ``app.py`` at the project root is the entrypoint.
"""

import logging

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from server import db
from server.config import config

logger = logging.getLogger(__name__)

LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.DEBUG if config.DEBUG else logging.INFO,
        format=LOG_FORMAT,
        datefmt="%H:%M:%S",
    )
    # PyMongo's heartbeat chatter drowns out the application log in debug mode.
    logging.getLogger("pymongo").setLevel(logging.WARNING)


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"success": False, "error": "Not found", "path": request.path}), 404

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify({"success": False, "error": "Method not allowed"}), 405

    @app.errorhandler(413)
    def payload_too_large(_error):
        limit_mb = config.MAX_CONTENT_LENGTH // (1024 * 1024)
        return jsonify({"success": False, "error": f"File too large (max {limit_mb} MB)"}), 413

    @app.errorhandler(500)
    def internal_error(error):
        logger.error("Internal server error: %s", error)
        return jsonify({"success": False, "error": "Internal server error"}), 500


def _register_jwt_handlers(jwt: JWTManager) -> None:
    """Return JSON (never an HTML page) when a token is missing or stale."""

    @jwt.expired_token_loader
    def expired(_header, _payload):
        return jsonify({"success": False, "error": "Session expired. Please log in again."}), 401

    @jwt.invalid_token_loader
    def invalid(reason):
        return jsonify({"success": False, "error": f"Invalid token: {reason}"}), 401

    @jwt.unauthorized_loader
    def missing(reason):
        return jsonify({"success": False, "error": reason}), 401


def create_app() -> Flask:
    configure_logging()

    app = Flask(__name__)
    app.config.update(
        JWT_SECRET_KEY=config.JWT_SECRET_KEY,
        JWT_ACCESS_TOKEN_EXPIRES=config.JWT_ACCESS_TOKEN_EXPIRES,
        MAX_CONTENT_LENGTH=config.MAX_CONTENT_LENGTH,
        JSON_SORT_KEYS=False,
    )

    if config.DEBUG:
        logger.warning("DEBUG is on - never run like this where the internet can reach the server.")
    if "*" in config.CORS_ORIGINS:
        logger.info(
            "CORS_ORIGINS is * (any site may call this API). Once the API is on the internet at a "
            "different address from the pages, set CORS_ORIGINS to the pages' address."
        )

    if config.JWT_SECRET_IS_EPHEMERAL:
        logger.warning(
            "JWT_SECRET_KEY is not set - a random key was generated. "
            "Everyone will be logged out on the next restart. Set it in .env."
        )

    CORS(
        app,
        resources={r"/api/*": {"origins": config.CORS_ORIGINS}, r"/uploads/*": {"origins": config.CORS_ORIGINS}},
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    jwt = JWTManager(app)
    _register_jwt_handlers(jwt)
    _register_error_handlers(app)

    if db.connect():
        from server import bootstrap, retention

        bootstrap.run()
        retention.start()
    else:
        logger.error("Starting without a database connection - API calls will return 503.")

    from server.routes import register_blueprints

    register_blueprints(app)

    config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

    @app.before_request
    def _log_request():
        if request.path.startswith("/api/"):
            logger.debug("%s %s", request.method, request.path)

    return app
