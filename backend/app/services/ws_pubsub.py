"""WebSocket Pub/Sub bridge — Redis fan-out for multi-instance deployments.

Channel layout:
  ws:channel:{tenant_id}              → all events for a tenant (broadcast)
  ws:channel:{tenant_id}:{outlet_id}  → outlet-scoped events (franchise)

For personal events (ORDER_CONFIRMED, ORDER_READY), embed "target_user_id"
in the payload. `ConnectionManager.broadcast_to_tenant()` delivers it only
to that user's WebSocket connection.

Each active WebSocket connection runs subscribe_and_forward() as an asyncio
Task so it receives events published by any API instance.  The task is
cancelled on disconnect, which triggers the finally block to clean up the
pub/sub object.
"""
import asyncio
import json
import logging
from uuid import UUID

from app.core.redis import get_redis

logger = logging.getLogger(__name__)


def _channel(tenant_id: str | UUID, outlet_id: str | UUID | None = None) -> str:
    base = f"ws:channel:{tenant_id}"
    return f"{base}:{outlet_id}" if outlet_id else base


async def publish_event(
    tenant_id: str | UUID,
    event: dict,
    outlet_id: str | UUID | None = None,
) -> None:
    """Publish a WebSocket event to the tenant's Redis channel.

    All API instances subscribed to this channel will forward the event to
    their locally connected WebSocket clients for this tenant.
    """
    channel = _channel(tenant_id, outlet_id)
    try:
        redis = await get_redis()
        await redis.publish(channel, json.dumps(event, default=str))
        logger.debug("Published %s to %s", event.get("type"), channel)
    except Exception:
        logger.exception("Failed to publish event %s to channel %s", event.get("type"), channel)


async def subscribe_and_forward(
    tenant_id: str | UUID,
    ws_manager,
    outlet_id: str | UUID | None = None,
) -> None:
    """Subscribe to the tenant's Redis channel and forward messages to local WS clients.

    Runs as a long-lived asyncio Task per WebSocket connection.  Cancelled
    automatically when the WebSocket disconnects.
    """
    await subscribe_and_forward_many([tenant_id], ws_manager, outlet_id=outlet_id)


async def subscribe_and_forward_many(
    tenant_ids: list[str | UUID],
    ws_manager,
    outlet_id: str | UUID | None = None,
) -> None:
    """Like subscribe_and_forward, but for multiple tenant channels at once.

    Used by the food-court guest tracking WS (RFC-007 Phase D): a guest session
    can contain sibling orders across several vendor tenants, each publishing to
    its own channel, but the guest has exactly one WebSocket connection.
    """
    channels = [_channel(tid, outlet_id) for tid in tenant_ids]
    redis = await get_redis()
    pubsub = redis.pubsub()

    try:
        await pubsub.subscribe(*channels)
        logger.debug("Subscribed to Redis channels %s", channels)
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                event = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                logger.warning("Malformed pub/sub message on %s: %r", message.get("channel"), message["data"])
                continue
            channel_bytes = message.get("channel")
            channel_name = channel_bytes.decode() if isinstance(channel_bytes, bytes) else channel_bytes
            # Recover which tenant this channel belongs to for broadcast_to_tenant's filtering.
            source_tenant_id = str(tenant_ids[channels.index(channel_name)]) if channel_name in channels else str(tenant_ids[0])
            await ws_manager.broadcast_to_tenant(source_tenant_id, event)
    except asyncio.CancelledError:
        logger.debug("subscribe_and_forward_many cancelled for channels %s", channels)
    finally:
        try:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()
        except Exception:
            pass
