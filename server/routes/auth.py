"""Login, token verification and logout."""

import logging

from flask import Blueprint, request

from server import db
from server.api import fail, handle_errors, ok, public_user, roles_required
from server.security import verify_password

logger = logging.getLogger(__name__)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
@handle_errors
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return fail("Email and password are required", 400)

    # The password is checked against the scrambled (bcrypt) copy stored with
    # the account in the database; no password is kept anywhere else.
    user = db.users.find_one({"email": email})
    # The same message for both branches so the response cannot be used to
    # enumerate which staff emails exist.
    if not user or not verify_password(password, user.get("password")):
        logger.info("Failed login attempt for %s", email)
        return fail("Invalid credentials", 401)

    from flask_jwt_extended import create_access_token

    logger.info("Login: %s (%s)", user.get("username"), user.get("role"))
    return ok(
        {
            "message": "Login successful",
            "token": create_access_token(identity=str(user["_id"])),
            "user": public_user(user),
        }
    )


@bp.get("/verify")
@roles_required()
@handle_errors
def verify(user):
    return ok({"user": public_user(user)})


@bp.post("/logout")
@roles_required()
@handle_errors
def logout(user):
    """Acknowledge logout.

    Tokens are stateless, so the client discards it; this endpoint exists so
    the UI gets a clean 200 instead of a 404 in the console.
    """
    logger.info("Logout: %s", user.get("username"))
    return ok({"message": "Logged out"})
