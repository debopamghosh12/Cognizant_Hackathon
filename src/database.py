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
    print("Database initialized.")

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