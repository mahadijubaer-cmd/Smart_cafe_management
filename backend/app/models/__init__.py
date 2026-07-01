# This file makes app/models a Python package.
# Importing the aggregator registers every ORM mapper (Order, MenuItem, Payment, …)
# so SQLAlchemy can resolve string-based relationships regardless of which
# module (app, routers, or a standalone seed script) triggers configuration.
from app.models import models  # noqa: F401
