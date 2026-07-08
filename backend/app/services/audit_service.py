"""Platform admin audit trail (RFC-009, PA-1).

Every mutating platform-admin action on a tenant writes exactly one row via record_audit()
before the response is returned. Callers pass the already-loaded actor/target ORM objects;
this module only handles serialization and the INSERT.
"""
from __future__ import annotations

import enum
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import PlatformAuditLog
from app.models.tenant import Tenant
from app.models.user import User


class AuditAction(str, enum.Enum):
    tenant_created = "tenant_created"
    tenant_updated = "tenant_updated"
    tenant_tier_changed = "tenant_tier_changed"
    tenant_activated = "tenant_activated"
    tenant_suspended = "tenant_suspended"
    tenant_deleted = "tenant_deleted"
    impersonation_started = "impersonation_started"


async def record_audit(
    db: AsyncSession,
    actor: User,
    action: AuditAction,
    target_tenant: Tenant | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Insert one audit log row. Does not commit — caller's existing transaction covers it,
    so a rolled-back request never leaves behind an audit entry for an action that didn't happen.
    """
    log = PlatformAuditLog(
        actor_id=actor.user_id,
        actor_email=actor.email,
        action=action.value,
        target_tenant_id=target_tenant.tenant_id if target_tenant else None,
        target_tenant_name=target_tenant.name if target_tenant else None,
        target_tenant_slug=target_tenant.slug if target_tenant else None,
        details=json.dumps(details) if details is not None else None,
    )
    db.add(log)
