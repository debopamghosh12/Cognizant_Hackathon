import sqlite3
import os
import uuid
from config import DB_PATH

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)  # ensure folder exists first
    return sqlite3.connect(DB_PATH)

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS purchase_orders (
            po_id TEXT PRIMARY KEY,
            item_name TEXT,
            quantity_ordered REAL,
            price_per_unit REAL,
            total_budget REAL,
            status TEXT DEFAULT 'Open'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_receipts (
            gr_id TEXT PRIMARY KEY,
            po_id TEXT,
            quantity_received REAL,
            status TEXT DEFAULT 'Pending',
            FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            invoice_id TEXT PRIMARY KEY,
            po_id TEXT,
            gr_id TEXT,
            item_name TEXT,
            quantity_ordered REAL,
            quantity_received REAL,
            price_per_unit REAL,
            total_amount REAL,
            extraction_status TEXT,
            match_status TEXT,
            printable_path TEXT,
            FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id),
            FOREIGN KEY (gr_id) REFERENCES goods_receipts(gr_id)
        )
    """)

    conn.commit()
    conn.close()

    _ensure_po_columns()
    _ensure_invoice_columns()
    print("Database initialized.")

def _ensure_po_columns():
    """Additive migration: adds PO-generation traceability columns to an
    already-existing purchase_orders table if they aren't there yet."""
    conn = get_connection()
    cur = conn.cursor()
    existing = {row[1] for row in cur.execute("PRAGMA table_info(purchase_orders)")}
    new_columns = {
        "supplier_id": "TEXT",
        "sku_id": "TEXT",
        "requisition_id": "INTEGER",
        "lead_time_days": "INTEGER",
        "destination_dc": "TEXT",
        "created_at": "TEXT",
    }
    for name, col_type in new_columns.items():
        if name not in existing:
            cur.execute(f"ALTER TABLE purchase_orders ADD COLUMN {name} {col_type}")
    conn.commit()
    conn.close()

def _ensure_invoice_columns():
    """Additive migration: adds Predictive Anomaly columns to an
    already-existing invoices table if they aren't there yet."""
    conn = get_connection()
    cur = conn.cursor()
    existing = {row[1] for row in cur.execute("PRAGMA table_info(invoices)")}
    new_columns = {
        "is_predictive_anomaly": "INTEGER DEFAULT 0",
        "predictive_anomaly_reason": "TEXT",
    }
    for name, col_type in new_columns.items():
        if name not in existing:
            cur.execute(f"ALTER TABLE invoices ADD COLUMN {name} {col_type}")
    conn.commit()
    conn.close()

def insert_purchase_order(po: dict) -> str:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO purchase_orders
            (po_id, item_name, quantity_ordered, price_per_unit, total_budget, status,
             supplier_id, sku_id, requisition_id, lead_time_days, destination_dc, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        po["po_id"], po["item_name"], po["quantity_ordered"], po["price_per_unit"],
        po["total_budget"], po["status"], po["supplier_id"], po["sku_id"],
        po.get("requisition_id"), po["lead_time_days"], po["destination_dc"], po["created_at"],
    ))
    conn.commit()
    conn.close()
    return po["po_id"]

def list_purchase_orders() -> list[dict]:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM purchase_orders ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_purchase_order(po_id: str) -> dict | None:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM purchase_orders WHERE po_id=?", (po_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_goods_receipt(gr_id: str) -> dict | None:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM goods_receipts WHERE gr_id=?", (gr_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_goods_receipt_by_po(po_id: str) -> dict | None:
    """Fallback for invoice rows saved before gr_id was populated."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM goods_receipts WHERE po_id=?", (po_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def list_invoices() -> list[dict]:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    # invoices has no timestamp column -- rowid (insertion order) is the
    # available proxy for "most recent".
    rows = cur.execute("SELECT * FROM invoices ORDER BY rowid DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_invoice(invoice_id: str) -> dict | None:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM invoices WHERE invoice_id=?", (invoice_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def insert_goods_receipt(gr: dict) -> str:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO goods_receipts (gr_id, po_id, quantity_received, status)
        VALUES (?, ?, ?, ?)
    """, (gr["gr_id"], gr["po_id"], gr["quantity_received"], gr["status"]))
    conn.commit()
    conn.close()
    return gr["gr_id"]

def record_delivery(po_id: str, additional_qty: float | None = None) -> dict:
    """Adds additional_qty to the PO's single goods_receipts row (creating it
    on first delivery). Status is derived and stored here -- authoritative,
    not inferred client-side. additional_qty=None delivers everything still
    outstanding (a one-click full delivery) -- that formula can never itself
    exceed quantity_ordered, so over-delivery only ever comes from an
    explicit typed quantity, never a blank "receive the rest" click.

    An explicit quantity that pushes the total past quantity_ordered is
    recorded as-is (no cap) and lands status "Over-Delivered" instead of
    "Fully Received", so a real over-shipment is never silently hidden.
    Returns the row plus quantity_ordered/variance_applied/variance_pct so
    callers can build a GoodsReceiptResponse directly."""
    po = get_purchase_order(po_id)
    if po is None:
        raise ValueError(f"purchase order '{po_id}' not found")

    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    existing = cur.execute("SELECT * FROM goods_receipts WHERE po_id=?", (po_id,)).fetchone()

    ordered = po["quantity_ordered"]
    current_received = existing["quantity_received"] if existing else 0
    if additional_qty is None:
        additional_qty = max(ordered - current_received, 0)
    new_received = current_received + additional_qty
    status = (
        "Pending" if new_received <= 0
        else "Over-Delivered" if new_received > ordered
        else "Fully Received" if new_received >= ordered
        else "Partially Received"
    )

    if existing:
        cur.execute(
            "UPDATE goods_receipts SET quantity_received=?, status=? WHERE gr_id=?",
            (new_received, status, existing["gr_id"]),
        )
        gr_id = existing["gr_id"]
    else:
        gr_id = f"GR-{uuid.uuid4().hex[:8].upper()}"
        cur.execute(
            "INSERT INTO goods_receipts (gr_id, po_id, quantity_received, status) VALUES (?, ?, ?, ?)",
            (gr_id, po_id, new_received, status),
        )

    conn.commit()
    row = dict(cur.execute("SELECT * FROM goods_receipts WHERE gr_id=?", (gr_id,)).fetchone())
    conn.close()

    row["quantity_ordered"] = ordered
    row["variance_applied"] = new_received != ordered
    row["variance_pct"] = round((new_received - ordered) / ordered * 100, 2) if ordered else 0.0
    return row

def update_po_status(po_id: str, status: str) -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE purchase_orders SET status=? WHERE po_id=?", (status, po_id))
    conn.commit()
    conn.close()

def insert_invoice(invoice: dict) -> str:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO invoices
            (invoice_id, po_id, gr_id, item_name, quantity_ordered, quantity_received,
             price_per_unit, total_amount, extraction_status, match_status, printable_path,
             is_predictive_anomaly, predictive_anomaly_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        invoice["invoice_id"], invoice["po_id"], invoice.get("gr_id"), invoice["item_name"],
        invoice["quantity_ordered"], invoice["quantity_received"], invoice["price_per_unit"],
        invoice["total_amount"], invoice["extraction_status"], invoice["match_status"],
        invoice.get("printable_path"),
        int(bool(invoice.get("is_predictive_anomaly", False))),
        invoice.get("predictive_anomaly_reason"),
    ))
    conn.commit()
    conn.close()
    return invoice["invoice_id"]

def get_invoice_by_po(po_id: str) -> dict | None:
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM invoices WHERE po_id=?", (po_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def list_invoices_by_supplier(supplier_id: str) -> list[dict]:
    """The only path to a supplier's invoice history -- invoices has no
    supplier_id column of its own, only po_id, so this joins through
    purchase_orders."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute("""
        SELECT invoices.* FROM invoices
        JOIN purchase_orders ON invoices.po_id = purchase_orders.po_id
        WHERE purchase_orders.supplier_id = ?
    """, (supplier_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_invoice_decision(invoice_id: str, match_status: str, po_status: str | None = None) -> dict | None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE invoices SET match_status=? WHERE invoice_id=?", (match_status, invoice_id))
    if po_status is not None:
        invoice_po_id = cur.execute("SELECT po_id FROM invoices WHERE invoice_id=?", (invoice_id,)).fetchone()
        if invoice_po_id:
            cur.execute("UPDATE purchase_orders SET status=? WHERE po_id=?", (po_status, invoice_po_id[0]))
    conn.commit()
    conn.close()
    return get_invoice(invoice_id)

def insert_dummy_po_and_gr():
    """For standalone testing before B1/B3's modules are merged in."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""INSERT OR REPLACE INTO purchase_orders 
        (po_id, item_name, quantity_ordered, price_per_unit, total_budget, status)
        VALUES ('PO001', 'Paracetamol 500mg', 100, 5.0, 500.0, 'Validated')""")
    cur.execute("""INSERT OR REPLACE INTO goods_receipts 
        (gr_id, po_id, quantity_received, status)
        VALUES ('GR001', 'PO001', 100, 'Validated')""")
    conn.commit()
    conn.close()
    print("Dummy PO and GR inserted for testing.")

if __name__ == "__main__":
    init_db()
    insert_dummy_po_and_gr()