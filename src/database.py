import sqlite3
import os
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