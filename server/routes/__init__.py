"""Blueprint registration."""

from flask import Flask

from server.routes import auth, bills, menu, notifications, orders, print_queue, reports, system

BLUEPRINTS = (
    auth.bp,
    bills.bp,
    menu.bp,
    notifications.bp,
    orders.bp,
    print_queue.bp,
    reports.bp,
    system.bp,
)


def register_blueprints(app: Flask) -> None:
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)
