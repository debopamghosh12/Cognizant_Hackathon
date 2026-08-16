import os
import sqlite3
import uuid

from .config import DB_PATH, SKUS, DESTINATION_DCS


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH)


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS inventory_batches (
            batch_id TEXT PRIMARY KEY,
            sku_id TEXT NOT NULL,
            destination_dc TEXT NOT NULL,
            quantity REAL NOT NULL,
            expiry_date TEXT NOT NULL
        )
    """)
    # Pure event log -- one row per completed Initiate Transfer, so
    # Analytics has a real, persisted count to show instead of nothing.
    # Not a decision/calculation of any kind, just a record that an
    # already-decided transfer happened.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transfer_events (
            event_id TEXT PRIMARY KEY,
            sku_id TEXT NOT NULL,
            from_dc TEXT NOT NULL,
            to_dc TEXT NOT NULL,
            quantity REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    # Feature 5: lightweight timestamp approximation for "how long has
    # this SKU/DC been continuously Critical" -- one row per SKU/DC pair
    # currently at Critical urgency, cleared the moment it drops below
    # Critical. Not a full audit history, just "when did this start."
    cur.execute("""
        CREATE TABLE IF NOT EXISTS alert_escalation_tracking (
            sku_id TEXT NOT NULL,
            destination_dc TEXT NOT NULL,
            first_seen_critical_at TEXT NOT NULL,
            PRIMARY KEY (sku_id, destination_dc)
        )
    """)
    conn.commit()

    seeded = cur.execute("SELECT COUNT(*) FROM inventory_batches").fetchone()[0]
    if seeded == 0:
        _seed_inventory(conn)

    escalation_seeded = cur.execute("SELECT COUNT(*) FROM alert_escalation_tracking").fetchone()[0]
    if escalation_seeded == 0:
        _seed_escalation_demo(conn)

    conn.close()


# Hand-picked so the demo reliably produces at least one clear shortage per
# path: SKU-1010 (N95 masks) is low everywhere -> no transfer available ->
# Create Requisition. SKU-1001 (Paracetamol, also a seasonal-spike SKU) is
# low at Siliguri DC, while Chennai DC holds a near-expiry surplus batch
# well above its own need -> Transfer recommended. Everything else is
# comfortably stocked so the alert list stays focused for the demo.
# (sku_id, destination_dc, quantity, days_until_expiry)
_SEED_BATCHES = [
    ("SKU-1001", "Pune DC", 700, 240),
    ("SKU-1001", "Chennai DC", 600, 300),
    ("SKU-1001", "Chennai DC", 450, 35),      # near-expiry surplus -> transfer candidate
    ("SKU-1001", "Siliguri DC", 120, 200),    # shortage
    ("SKU-1002", "Pune DC", 350, 250),
    ("SKU-1002", "Chennai DC", 90, 220),      # mild shortage
    ("SKU-1002", "Siliguri DC", 200, 260),
    ("SKU-1003", "Pune DC", 400, 230),
    ("SKU-1003", "Chennai DC", 320, 240),
    ("SKU-1003", "Siliguri DC", 260, 250),
    ("SKU-1007", "Pune DC", 450, 260),
    ("SKU-1007", "Chennai DC", 380, 270),
    ("SKU-1007", "Siliguri DC", 300, 280),
    ("SKU-1010", "Pune DC", 60, 300),         # shortage, no viable transfer
    ("SKU-1010", "Chennai DC", 80, 310),      # shortage
    ("SKU-1010", "Siliguri DC", 50, 290),     # shortage
]


def _seed_inventory(conn: sqlite3.Connection) -> None:
    from datetime import datetime, timedelta, timezone

    cur = conn.cursor()
    today = datetime.now(timezone.utc).date()
    for sku_id, dc, qty, days_out in _SEED_BATCHES:
        expiry = (today + timedelta(days=days_out)).isoformat()
        cur.execute(
            "INSERT INTO inventory_batches (batch_id, sku_id, destination_dc, quantity, expiry_date) VALUES (?, ?, ?, ?, ?)",
            (f"BATCH-{uuid.uuid4().hex[:8].upper()}", sku_id, dc, qty, expiry),
        )
    conn.commit()


# Demo seeding only, exactly like _seed_inventory() above -- backdates one
# already-Critical SKU/DC pair (SKU-1010 / Pune DC, which the inventory
# seed above already makes Critical) past ESCALATION_THRESHOLD_HOURS so
# the escalation feature is immediately demonstrable without waiting real
# hours for the clock to actually run out. Clearly a synthetic seed value,
# not a fabricated "real" incident.
def _seed_escalation_demo(conn: sqlite3.Connection) -> None:
    from datetime import datetime, timedelta, timezone

    backdated = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    conn.execute(
        "INSERT INTO alert_escalation_tracking (sku_id, destination_dc, first_seen_critical_at) VALUES (?, ?, ?)",
        ("SKU-1010", "Pune DC", backdated),
    )
    conn.commit()


def get_or_set_first_seen_critical(sku_id: str, destination_dc: str) -> str:
    """Returns the ISO timestamp this SKU/DC pair was first observed at
    Critical urgency, inserting the current time if this is the first
    time it's been seen."""
    from datetime import datetime, timezone

    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        "SELECT first_seen_critical_at FROM alert_escalation_tracking WHERE sku_id=? AND destination_dc=?",
        (sku_id, destination_dc),
    ).fetchone()
    if row is not None:
        conn.close()
        return row["first_seen_critical_at"]

    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        "INSERT INTO alert_escalation_tracking (sku_id, destination_dc, first_seen_critical_at) VALUES (?, ?, ?)",
        (sku_id, destination_dc, now),
    )
    conn.commit()
    conn.close()
    return now


def clear_escalation_tracking(sku_id: str, destination_dc: str) -> None:
    """Resets the clock once a SKU/DC pair is no longer Critical -- the
    next time it becomes Critical (if ever) starts counting from zero
    again, rather than accumulating across separate incidents."""
    conn = get_connection()
    conn.execute(
        "DELETE FROM alert_escalation_tracking WHERE sku_id=? AND destination_dc=?",
        (sku_id, destination_dc),
    )
    conn.commit()
    conn.close()


def get_batches_for(sku_id: str, destination_dc: str | None = None) -> list[dict]:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    if destination_dc is None:
        rows = cur.execute("SELECT * FROM inventory_batches WHERE sku_id=?", (sku_id,)).fetchall()
    else:
        rows = cur.execute(
            "SELECT * FROM inventory_batches WHERE sku_id=? AND destination_dc=?", (sku_id, destination_dc)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_current_stock(sku_id: str, destination_dc: str) -> float:
    return sum(b["quantity"] for b in get_batches_for(sku_id, destination_dc))


def all_sku_dc_pairs() -> list[tuple[str, str]]:
    return [(sku_id, dc) for sku_id in SKUS for dc in DESTINATION_DCS]


def apply_transfer(sku_id: str, from_dc: str, to_dc: str, quantity: float, batch_id: str) -> None:
    """Simulated only -- decrements the named source batch (never below 0,
    deleting it if fully consumed) and adds the same quantity as a new
    batch at the destination, carrying the source batch's own expiry
    forward since it's the same physical stock. Never touches
    requisitions/purchase_orders/goods_receipts -- this is the alternative
    to ordering, not a step in that pipeline. Also records a transfer_events
    row purely so this shows up as a real data point on Analytics."""
    from datetime import datetime, timezone

    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    batch = cur.execute("SELECT * FROM inventory_batches WHERE batch_id=?", (batch_id,)).fetchone()
    if batch is None:
        conn.close()
        raise ValueError(f"batch '{batch_id}' not found")

    remaining = batch["quantity"] - quantity
    if remaining <= 0:
        cur.execute("DELETE FROM inventory_batches WHERE batch_id=?", (batch_id,))
    else:
        cur.execute("UPDATE inventory_batches SET quantity=? WHERE batch_id=?", (remaining, batch_id))

    cur.execute(
        "INSERT INTO inventory_batches (batch_id, sku_id, destination_dc, quantity, expiry_date) VALUES (?, ?, ?, ?, ?)",
        (f"BATCH-{uuid.uuid4().hex[:8].upper()}", sku_id, to_dc, quantity, batch["expiry_date"]),
    )
    cur.execute(
        "INSERT INTO transfer_events (event_id, sku_id, from_dc, to_dc, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (f"XFER-{uuid.uuid4().hex[:8].upper()}", sku_id, from_dc, to_dc, quantity, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def count_transfer_events() -> int:
    conn = get_connection()
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) FROM transfer_events").fetchone()[0]
    conn.close()
    return count
