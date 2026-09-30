"""Set staff passwords directly in the database.

Passwords live only in MongoDB, as bcrypt hashes - never in the code, the
README or ``.env``. Use this to set or reset them:

    python -m server.passwords set casher1@shamr.com
    python -m server.passwords set cook1@shamr.com cook2@shamr.com
    python -m server.passwords list

``set`` asks for the password without echoing it (or reads one line from
stdin with ``--stdin``, for scripting). A missing account is created when
``--role`` is given (``--username`` defaults to the part before the @).
"""

import argparse
import getpass
import sys

from server import db
from server.security import hash_password
from server.timeutil import utc_now

ROLES = ("admin", "cashier", "waiter", "cook")
MIN_LENGTH = 6


def set_password(email: str, password: str, *, role: str | None = None, username: str | None = None) -> str:
    """Store ``password`` (hashed) for ``email``; returns what happened."""
    email = email.strip().lower()
    existing = db.users.find_one({"email": email}, {"_id": 1})
    if not existing and not role:
        raise SystemExit(f"No account for {email}. Pass --role to create it.")

    update = {"password": hash_password(password), "passwordChangedAt": utc_now()}
    if role:
        update["role"] = role
    if username:
        update["username"] = username
    db.users.update_one(
        {"email": email},
        {
            "$set": update,
            "$setOnInsert": {
                "email": email,
                "createdAt": utc_now(),
                **({} if username else {"username": email.split("@")[0]}),
            },
        },
        upsert=True,
    )
    return "updated" if existing else "created"


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("New password: ")
        if getpass.getpass("Repeat it: ") != password:
            raise SystemExit("Passwords do not match.")
    if len(password) < MIN_LENGTH:
        raise SystemExit(f"Password must be at least {MIN_LENGTH} characters.")
    return password


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(prog="python -m server.passwords", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    set_cmd = sub.add_parser("set", help="set the password for one or more accounts")
    set_cmd.add_argument("emails", nargs="+")
    set_cmd.add_argument("--role", choices=ROLES, help="create the account with this role if it is missing")
    set_cmd.add_argument("--username", help="username for a single new account")
    set_cmd.add_argument("--stdin", action="store_true", help="read the password from stdin")

    sub.add_parser("list", help="list accounts (no passwords)")

    args = parser.parse_args(argv)
    if not db.connect():
        raise SystemExit("Cannot reach MongoDB")

    if args.command == "list":
        for user in db.users.find({}, {"password": 0}).sort([("role", 1), ("email", 1)]):
            has = "yes" if db.users.count_documents({"_id": user["_id"], "password": {"$type": "string"}}) else "NO"
            print(f"{user.get('role', '?'):8} {user.get('username', ''):10} {user.get('email', ''):24} password set: {has}")
        return

    if args.username and len(args.emails) > 1:
        raise SystemExit("--username only works with a single email.")
    password = _read_password(args.stdin)
    for email in args.emails:
        print(f"{email}: {set_password(email, password, role=args.role, username=args.username)}")


if __name__ == "__main__":
    main()
