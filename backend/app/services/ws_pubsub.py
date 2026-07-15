"""WebSocket Pub/Sub bridge — Redis fan-out for multi-instance deployments.

Channel layout:
  ws:channel:{tenant_id}              → all events for a tenant (broadcast)
  ws:channel:{tenant_id}:{outlet_id}  → outlet-scoped events (franchise)

For personal events (ORDER_CONFIRMED, ORDER_READY), embed "target_user_id"
in the payload. `ConnectionManager.broadcast_to_tenant()` delivers it only
to that user's WebSocket connection.

Ref-counted, one Redis subscription + one listener Task per unique channel,
shared across every local WebSocket connection interested in it — `subscribe()`
starts the listener on the first caller and increments a refcount on every
later one; `unsubscribe()` decrements it and tears the listener down at zero.

Previously each connection ran its own `subscribe_and_forward` Task with its
own Redis subscription to the same channel; Redis fans a publish out to every
subscriber, so N connections on one tenant each received every event N times
(discovered testing RFC-010, where a paired kiosk + signage display are two
simultaneous connections on the same tenant channel by design). One listener
per channel means exactly one `broadcast_to_tenant()` call per published
event, regardless of how many connections are listening.
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


class _ChannelListener:
    __slots__ = ("task", "tenant_id", "refcount")

    def __init__(self, task: asyncio.Task, tenant_id: str):
        self.task = task
        self.tenant_id = tenant_id
        self.refcount = 0


_listeners: dict[str, _ChannelListener] = {}
_lock = asyncio.Lock()


async def _run_channel_listener(channel: str, tenant_id: str, ws_manager) -> None:
    """One long-lived Task per channel: subscribes once, forwards every
    message to the local `ws_manager` exactly once, regardless of how many
    connections are interested in this channel (see module docstring)."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(channel)
        logger.debug("Channel listener started: %s", channel)
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                event = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                logger.warning("Malformed pub/sub message on %s: %r", channel, message["data"])
                continue
            await ws_manager.broadcast_to_tenant(tenant_id, event)
    except asyncio.CancelledError:
        logger.debug("Channel listener cancelled: %s", channel)
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            pass


async def subscribe(
    tenant_ids: list[str | UUID],
    ws_manager,
    outlet_id: str | UUID | None = None,
) -> list[str]:
    """Ensure a shared listener is running for each tenant's channel and bump
    its refcount. Returns the channel names — pass them to `unsubscribe()` on
    disconnect. Safe to call with a single tenant_id (the common case) or
    several (food-court devices, multi-vendor guest sessions)."""
    channels: list[str] = []
    async with _lock:
        for tid in tenant_ids:
            channel = _channel(tid, outlet_id)
            channels.append(channel)
            listener = _listeners.get(channel)
            if listener is None:
                task = asyncio.create_task(_run_channel_listener(channel, str(tid), ws_manager))
                listener = _ChannelListener(task, str(tid))
                _listeners[channel] = listener
            listener.refcount += 1
    return channels


async def unsubscribe(channels: list[str]) -> None:
    """Release channels obtained from `subscribe()`. Tears down the listener
    (Redis unsubscribe + Task cancel) once its refcount reaches zero."""
    to_await: list[asyncio.Task] = []
    async with _lock:
        for channel in channels:
            listener = _listeners.get(channel)
            if listener is None:
                continue
            listener.refcount -= 1
            if listener.refcount <= 0:
                listener.task.cancel()
                to_await.append(listener.task)
                del _listeners[channel]
    for task in to_await:
        try:
            await task
        except asyncio.CancelledError:
            pass
