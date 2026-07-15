"""Device registry, pairing, and device-token auth (RFC-010 / ADR-013, Phase 25).

Covers the spec'd behaviour in specs/modules/devices.md:
DEV-1 (hash at rest, plaintext once), DEV-2 (single-use short-lived codes),
DEV-3 (immediate revocation), DEV-4 (re-pairing rotates), DEV-5 (tenant scope),
DEV-8 handled in kiosk/signage tests when those endpoints land.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import SLUG_ALPHA, SLUG_BETA, get_token

pytestmark = pytest.mark.asyncio


async def _admin_headers(client: AsyncClient, email="admin@alpha.com", slug=SLUG_ALPHA) -> dict:
    token = await get_token(client, email, slug)
    return {"Authorization": f"Bearer {token}"}


async def _create_device(client: AsyncClient, headers: dict, name="Front kiosk",
                         device_type="kiosk") -> dict:
    resp = await client.post(
        "/api/v1/devices", json={"name": name, "device_type": device_type}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _pair(client: AsyncClient, headers: dict, device_id: str) -> dict:
    code_resp = await client.post(f"/api/v1/devices/{device_id}/pairing-code", headers=headers)
    assert code_resp.status_code == 200, code_resp.text
    code = code_resp.json()["code"]
    pair_resp = await client.post("/api/v1/device/pair", json={"code": code})
    assert pair_resp.status_code == 201, pair_resp.text
    return pair_resp.json()


async def test_register_pair_and_authenticate_device(async_client, users):
    """Happy path: register → pairing code → pair → authenticated /device/me."""
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers)
    assert device["paired"] is False

    paired = await _pair(async_client, headers, device["device_id"])
    assert paired["device_token"].startswith("scmsd_k_")
    assert paired["tenant_slug"] == SLUG_ALPHA
    assert paired["device_type"] == "kiosk"
    assert paired["kiosk_config"]["idle_timeout_seconds"] == 60  # defaults resolved

    me = await async_client.get(
        "/api/v1/device/me", headers={"X-Device-Token": paired["device_token"]}
    )
    assert me.status_code == 200, me.text
    assert me.json()["device_id"] == device["device_id"]

    # Admin list now shows it as paired, with only a prefix (DEV-1)
    listing = await async_client.get("/api/v1/devices", headers=headers)
    row = next(d for d in listing.json() if d["device_id"] == device["device_id"])
    assert row["paired"] is True
    assert paired["device_token"].startswith(row["token_prefix"])
    assert row["token_prefix"] != paired["device_token"]


async def test_signage_device_gets_signage_token_and_no_kiosk_config(async_client, users):
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers, name="Wall display", device_type="signage")
    paired = await _pair(async_client, headers, device["device_id"])
    assert paired["device_token"].startswith("scmsd_s_")
    assert paired["kiosk_config"] is None


async def test_pairing_code_is_single_use(async_client, users):
    """DEV-2: a redeemed code cannot be redeemed again."""
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers)

    code_resp = await async_client.post(
        f"/api/v1/devices/{device['device_id']}/pairing-code", headers=headers
    )
    code = code_resp.json()["code"]

    first = await async_client.post("/api/v1/device/pair", json={"code": code})
    assert first.status_code == 201
    second = await async_client.post("/api/v1/device/pair", json={"code": code})
    assert second.status_code == 404


async def test_unknown_pairing_code_rejected(async_client, users):
    resp = await async_client.post("/api/v1/device/pair", json={"code": "000000"})
    assert resp.status_code == 404


async def test_repairing_rotates_the_old_token(async_client, users):
    """DEV-4: redeeming a new code invalidates the previous token."""
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers)

    first = await _pair(async_client, headers, device["device_id"])
    second = await _pair(async_client, headers, device["device_id"])
    assert first["device_token"] != second["device_token"]

    old = await async_client.get(
        "/api/v1/device/me", headers={"X-Device-Token": first["device_token"]}
    )
    assert old.status_code == 401
    new = await async_client.get(
        "/api/v1/device/me", headers={"X-Device-Token": second["device_token"]}
    )
    assert new.status_code == 200


async def test_revoke_kills_token_immediately(async_client, users):
    """DEV-3: revoked device token fails on the very next request."""
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers)
    paired = await _pair(async_client, headers, device["device_id"])

    revoke = await async_client.post(
        f"/api/v1/devices/{device['device_id']}/revoke", headers=headers
    )
    assert revoke.status_code == 200
    assert revoke.json()["paired"] is False

    me = await async_client.get(
        "/api/v1/device/me", headers={"X-Device-Token": paired["device_token"]}
    )
    assert me.status_code == 401


async def test_missing_or_garbage_token_rejected(async_client, users):
    no_header = await async_client.get("/api/v1/device/me")
    assert no_header.status_code == 401
    garbage = await async_client.get(
        "/api/v1/device/me", headers={"X-Device-Token": "scmsd_k_not-a-real-token"}
    )
    assert garbage.status_code == 401


async def test_cross_tenant_device_is_invisible(async_client, users):
    """DEV-5: beta's admin cannot see, code, or revoke alpha's device."""
    alpha_headers = await _admin_headers(async_client)
    beta_headers = await _admin_headers(async_client, "admin@beta.com", SLUG_BETA)
    device = await _create_device(async_client, alpha_headers)

    listing = await async_client.get("/api/v1/devices", headers=beta_headers)
    assert all(d["device_id"] != device["device_id"] for d in listing.json())

    for method, url in [
        ("post", f"/api/v1/devices/{device['device_id']}/pairing-code"),
        ("post", f"/api/v1/devices/{device['device_id']}/revoke"),
        ("delete", f"/api/v1/devices/{device['device_id']}"),
    ]:
        resp = await getattr(async_client, method)(url, headers=beta_headers)
        assert resp.status_code == 404, f"{method} {url} -> {resp.status_code}"


async def test_non_admin_cannot_manage_devices(async_client, users):
    token = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)
    headers = {"Authorization": f"Bearer {token}"}
    resp = await async_client.post(
        "/api/v1/devices", json={"name": "X", "device_type": "kiosk"}, headers=headers
    )
    assert resp.status_code == 403


async def test_device_token_is_not_a_user_credential(async_client, users):
    """DEV-7: a device token must not authenticate user-JWT endpoints."""
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers)
    paired = await _pair(async_client, headers, device["device_id"])

    resp = await async_client.get(
        "/api/v1/devices",
        headers={"Authorization": f"Bearer {paired['device_token']}"},
    )
    assert resp.status_code == 401


async def test_pair_rate_limit(async_client, users):
    """DEV-2: 6th bad attempt within a minute from one IP -> 429."""
    for _ in range(5):
        resp = await async_client.post("/api/v1/device/pair", json={"code": "999999"})
        assert resp.status_code == 404
    resp = await async_client.post("/api/v1/device/pair", json={"code": "999999"})
    assert resp.status_code == 429


# ── Kiosk ordering (KSK-1..KSK-5, specs/modules/kiosk.md) ─────────────────────

import uuid as _uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import Category, MenuItem
from app.models.tenant import Tenant


async def _seed_item(db: AsyncSession, tenant: Tenant, name="Burger", price=250,
                     allergens: list[str] | None = None) -> MenuItem:
    category = Category(tenant_id=tenant.tenant_id, name=f"{name}-cat", display_order=0)
    db.add(category)
    await db.flush()
    item = MenuItem(
        item_id=_uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        category_id=category.category_id,
        name=name,
        price=price,
        is_available=True,
        allergens=allergens or [],
    )
    db.add(item)
    await db.commit()
    return item


async def _paired_kiosk(async_client, headers) -> dict:
    device = await _create_device(async_client, headers)
    return await _pair(async_client, headers, device["device_id"])


async def test_kiosk_order_gets_pickup_number(async_client, users, tenants, db_session):
    """KSK-3/KSK-4: table-less kiosk order on a cafeteria-segment tenant (KSK-2
    bypass — alpha is `academic`, where anonymous guest checkout is blocked),
    pending_confirmation, with a daily pickup number."""
    headers = await _admin_headers(async_client)
    item = await _seed_item(db_session, tenants["alpha"])
    kiosk = await _paired_kiosk(async_client, headers)
    dev_headers = {"X-Device-Token": kiosk["device_token"]}

    resp = await async_client.post(
        "/api/v1/device/orders",
        json={"items": [{"item_id": str(item.item_id), "quantity": 2}]},
        headers=dev_headers,
    )
    assert resp.status_code == 201, resp.text
    group = resp.json()
    order = group["orders"][0]
    assert order["order_source"] == "kiosk"
    assert order["status"] == "pending_confirmation"
    assert order["payment_status"] == "pending"   # KSK-1 counter-pay
    assert order["table_id"] is None              # KSK-3
    assert order["pickup_number"] == 1            # KSK-4 daily counter
    assert order["guest_name"] == "Kiosk"

    # Second order increments the counter
    resp2 = await async_client.post(
        "/api/v1/device/orders",
        json={"items": [{"item_id": str(item.item_id), "quantity": 1}], "guest_name": "Rafi"},
        headers=dev_headers,
    )
    assert resp2.json()["orders"][0]["pickup_number"] == 2
    assert resp2.json()["orders"][0]["guest_name"] == "Rafi"


async def test_kiosk_order_tracking_scoped_to_device_tenant(async_client, users, tenants, db_session):
    """DEV-5: a kiosk can track its own tenant's sessions; beta's kiosk cannot."""
    alpha_headers = await _admin_headers(async_client)
    beta_headers = await _admin_headers(async_client, "admin@beta.com", SLUG_BETA)
    item = await _seed_item(db_session, tenants["alpha"])
    alpha_kiosk = await _paired_kiosk(async_client, alpha_headers)
    beta_kiosk = await _paired_kiosk(async_client, beta_headers)

    created = await async_client.post(
        "/api/v1/device/orders",
        json={"items": [{"item_id": str(item.item_id), "quantity": 1}]},
        headers={"X-Device-Token": alpha_kiosk["device_token"]},
    )
    token = created.json()["guest_token"]

    own = await async_client.get(
        f"/api/v1/device/orders/{token}", headers={"X-Device-Token": alpha_kiosk["device_token"]}
    )
    assert own.status_code == 200

    foreign = await async_client.get(
        f"/api/v1/device/orders/{token}", headers={"X-Device-Token": beta_kiosk["device_token"]}
    )
    assert foreign.status_code == 404


async def test_signage_device_cannot_place_orders(async_client, users, tenants, db_session):
    """DEV-8: order creation is kiosk-only."""
    headers = await _admin_headers(async_client)
    item = await _seed_item(db_session, tenants["alpha"])
    device = await _create_device(async_client, headers, name="Wall", device_type="signage")
    paired = await _pair(async_client, headers, device["device_id"])

    resp = await async_client.post(
        "/api/v1/device/orders",
        json={"items": [{"item_id": str(item.item_id), "quantity": 1}]},
        headers={"X-Device-Token": paired["device_token"]},
    )
    assert resp.status_code == 403


async def test_device_menu_includes_allergens(async_client, users, tenants, db_session):
    """BR-MENU-4/DEV-6: device menu carries allergen + dietary data, no public_menu_enabled gate."""
    headers = await _admin_headers(async_client)
    await _seed_item(db_session, tenants["alpha"], name="Peanut Curry", allergens=["peanuts", "milk"])
    kiosk = await _paired_kiosk(async_client, headers)

    resp = await async_client.get(
        "/api/v1/device/menu", headers={"X-Device-Token": kiosk["device_token"]}
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert any(sorted(i["allergens"]) == ["milk", "peanuts"] for i in items)


async def test_menu_item_rejects_unknown_allergen(async_client, users, tenants, db_session):
    """BR-MENU-4: closed vocabulary -> 422 on unknown codes."""
    headers = await _admin_headers(async_client)
    item = await _seed_item(db_session, tenants["alpha"])

    resp = await async_client.patch(
        f"/api/v1/menu/items/{item.item_id}",
        json={"allergens": ["peanuts", "gremlins"]},
        headers=headers,
    )
    assert resp.status_code == 422


# ── Signage playlists + kiosk config (SGN-1..6, KSK-7, specs/modules/signage.md, kiosk.md) ──

async def test_signage_playlist_resolution_and_device_fetch(async_client, users):
    """SGN-3: tenant default playlist reaches the paired signage device with slides in order."""
    headers = await _admin_headers(async_client)

    playlist = await async_client.post(
        "/api/v1/signage/playlists", json={"name": "Main hall", "is_default": True}, headers=headers
    )
    assert playlist.status_code == 201, playlist.text
    pid = playlist.json()["playlist_id"]

    s1 = await async_client.post(
        f"/api/v1/signage/playlists/{pid}/slides",
        json={"slide_type": "menu_board", "duration_seconds": 12},
        headers=headers,
    )
    s2 = await async_client.post(
        f"/api/v1/signage/playlists/{pid}/slides",
        json={"slide_type": "announcement", "config": {"title_en": "Eid hours", "title_bn": "ঈদের সময়সূচি"}},
        headers=headers,
    )
    assert s1.status_code == 201 and s2.status_code == 201

    device = await _create_device(async_client, headers, name="Wall", device_type="signage")
    paired = await _pair(async_client, headers, device["device_id"])
    fetched = await async_client.get(
        "/api/v1/device/playlist", headers={"X-Device-Token": paired["device_token"]}
    )
    assert fetched.status_code == 200, fetched.text
    body = fetched.json()
    assert body["playlist_id"] == pid
    assert [s["slide_type"] for s in body["slides"]] == ["menu_board", "announcement"]

    # Reorder pushes new positions
    reorder = await async_client.put(
        f"/api/v1/signage/playlists/{pid}/slides/reorder",
        json={"slide_ids": [s2.json()["slide_id"], s1.json()["slide_id"]]},
        headers=headers,
    )
    assert reorder.status_code == 200
    refetched = await async_client.get(
        "/api/v1/device/playlist", headers={"X-Device-Token": paired["device_token"]}
    )
    assert [s["slide_type"] for s in refetched.json()["slides"]] == ["announcement", "menu_board"]


async def test_slide_minimum_duration_enforced(async_client, users):
    """SGN-1: duration_seconds < 5 -> 422."""
    headers = await _admin_headers(async_client)
    playlist = await async_client.post(
        "/api/v1/signage/playlists", json={"name": "P"}, headers=headers
    )
    resp = await async_client.post(
        f"/api/v1/signage/playlists/{playlist.json()['playlist_id']}/slides",
        json={"slide_type": "promo_image", "duration_seconds": 3},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_new_default_clears_previous_default(async_client, users):
    """SGN-4: one default per scope."""
    headers = await _admin_headers(async_client)
    first = await async_client.post(
        "/api/v1/signage/playlists", json={"name": "A", "is_default": True}, headers=headers
    )
    second = await async_client.post(
        "/api/v1/signage/playlists", json={"name": "B"}, headers=headers
    )
    await async_client.patch(
        f"/api/v1/signage/playlists/{second.json()['playlist_id']}",
        json={"is_default": True},
        headers=headers,
    )
    listing = await async_client.get("/api/v1/signage/playlists", headers=headers)
    defaults = [p["name"] for p in listing.json() if p["is_default"]]
    assert defaults == ["B"]


async def test_unassigned_signage_gets_404_playlist(async_client, users):
    headers = await _admin_headers(async_client)
    device = await _create_device(async_client, headers, name="Bare wall", device_type="signage")
    paired = await _pair(async_client, headers, device["device_id"])
    resp = await async_client.get(
        "/api/v1/device/playlist", headers={"X-Device-Token": paired["device_token"]}
    )
    assert resp.status_code == 404


async def test_kiosk_config_upsert_and_device_resolution(async_client, users):
    """Kiosk config round-trip: admin PUT -> resolved on /device/me."""
    headers = await _admin_headers(async_client)
    put = await async_client.put(
        "/api/v1/kiosk-config",
        json={"welcome_text_en": "Order your lunch", "idle_timeout_seconds": 90},
        headers=headers,
    )
    assert put.status_code == 200, put.text
    assert put.json()["config"]["welcome_text_en"] == "Order your lunch"
    assert put.json()["config"]["idle_timeout_seconds"] == 90
    # Defaults still fill unset keys
    assert put.json()["config"]["allow_guest_name"] is True

    kiosk = await _paired_kiosk(async_client, headers)
    assert kiosk["kiosk_config"]["welcome_text_en"] == "Order your lunch"
    assert kiosk["kiosk_config"]["idle_timeout_seconds"] == 90


async def test_kiosk_config_rejects_low_contrast_accent(async_client, users):
    """KSK-7: accent colour must reach 4.5:1 against a kiosk text surface."""
    headers = await _admin_headers(async_client)
    resp = await async_client.put(
        "/api/v1/kiosk-config", json={"accent_color": "#9e9e9e"}, headers=headers
    )
    assert resp.status_code == 422
    ok = await async_client.put(
        "/api/v1/kiosk-config", json={"accent_color": "#1A4D2E"}, headers=headers
    )
    assert ok.status_code == 200


async def test_cross_tenant_playlist_invisible(async_client, users):
    """DEV-5 admin side for signage content."""
    alpha_headers = await _admin_headers(async_client)
    beta_headers = await _admin_headers(async_client, "admin@beta.com", SLUG_BETA)
    playlist = await async_client.post(
        "/api/v1/signage/playlists", json={"name": "Alpha only"}, headers=alpha_headers
    )
    pid = playlist.json()["playlist_id"]
    resp = await async_client.patch(
        f"/api/v1/signage/playlists/{pid}", json={"name": "hax"}, headers=beta_headers
    )
    assert resp.status_code == 404
