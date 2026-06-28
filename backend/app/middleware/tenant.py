"""TenantContextMiddleware

Decodes the Bearer JWT on every request and injects a TenantContext into
request.state.tenant_ctx.  This is a *convenience* injection — it is NOT
the security gate (that is get_current_user / require_role in dependencies.py).

Unauthenticated requests (no token / invalid token) simply get tenant_ctx=None;
protected routes that Depend on get_tenant_context() will raise 401 as expected.
"""
from __future__ import annotations

from uuid import UUID

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.dependencies import TenantContext
from app.models.tenant import TenantType


class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.tenant_ctx = None

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                )
                tenant_id_raw = payload.get("tenant_id")
                tenant_type_raw = payload.get("tenant_type")
                tenant_slug = payload.get("tenant_slug")
                outlet_id_raw = payload.get("outlet_id")

                if tenant_id_raw and tenant_type_raw and tenant_slug:
                    request.state.tenant_ctx = TenantContext(
                        tenant_id=UUID(tenant_id_raw),
                        tenant_type=TenantType(tenant_type_raw),
                        tenant_slug=tenant_slug,
                        outlet_id=UUID(outlet_id_raw) if outlet_id_raw else None,
                    )
            except (JWTError, ValueError, KeyError):
                pass  # Invalid token — let auth dependencies handle the 401

        return await call_next(request)
