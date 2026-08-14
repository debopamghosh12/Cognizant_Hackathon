import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "requisitions.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(seed=True):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sku (
            sku_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aliases TEXT DEFAULT ''   -- comma-separated alternate names, lowercase
        )
    """)

    # This is the shared requisition queue table. Keep the shape identical
    # to whatever P1's auto-alert path writes — that's the whole point.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS requisition (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku_id TEXT NOT NULL,
            sku_name TEXT,
            quantity INTEGER NOT NULL,
            destination_dc TEXT NOT NULL,
            urgency TEXT NOT NULL DEFAULT 'MEDIUM',   -- LOW / MEDIUM / HIGH / CRITICAL
            source TEXT NOT NULL,                     -- AUTO_P1 / MANUAL_CHATBOT
            status TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING / VALIDATED / FLAGGED / REJECTED
            raw_input TEXT,                            -- original free text, null for AUTO_P1
            assumed_fields TEXT DEFAULT '',             -- comma-separated field names that were defaulted, not stated
            created_at TEXT NOT NULL
        )
    """)

    if seed:
        cur.execute("SELECT COUNT(*) FROM sku")
        if cur.fetchone()[0] == 0:
            seed_skus = [
                ("SKU-1001", "Paracetamol 500mg", "paracetamol,acetaminophen,paracetamol 500mg"),
                ("SKU-1002", "Amoxicillin 250mg", "amoxicillin,amoxicillin 250mg,amox"),
                ("SKU-1003", "Ibuprofen 400mg", "ibuprofen,ibuprofen 400mg,brufen"),
                ("SKU-1004", "Azithromycin 500mg", "azithromycin,azithro,zithromax"),
                ("SKU-1005", "Insulin Glargine 100IU", "insulin,insulin glargine,lantus"),
                ("SKU-1006", "Cough Syrup 100ml", "cough syrup,coughsyrup,cough medicine"),
                ("SKU-1007", "ORS Sachets", "ors,ors sachets,oral rehydration salts"),
                ("SKU-1008", "Metformin 500mg", "metformin,metformin 500mg,glucophage"),
                ("SKU-1009", "Vitamin C Tablets", "vitamin c,vitamin c tablets,ascorbic acid"),
                ("SKU-1010", "N95 Masks (box of 50)", "n95,n95 masks,masks"),
            ]
            cur.executemany(
                "INSERT INTO sku (sku_id, name, aliases) VALUES (?, ?, ?)", seed_skus
            )

    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def insert_requisition(payload: dict) -> int:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO requisition
           (sku_id, sku_name, quantity, destination_dc, urgency, source, status, raw_input, assumed_fields, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload["sku_id"],
            payload.get("sku_name"),
            payload["quantity"],
            payload["destination_dc"],
            payload.get("urgency", "MEDIUM"),
            payload["source"],
            payload.get("status", "PENDING"),
            payload.get("raw_input"),
            ",".join(payload.get("assumed_fields", [])),
            now_iso(),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def get_requisition(req_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM requisition WHERE id = ?", (req_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_requisitions(limit: int = 100):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM requisition ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def find_sku(name_guess: str):
    """Look up a SKU by name/alias, case-insensitive substring match."""
    if not name_guess:
        return None
    conn = get_conn()
    rows = conn.execute("SELECT * FROM sku").fetchall()
    conn.close()
    needle = name_guess.strip().lower()
    # exact alias/name match first
    for r in rows:
        names = [r["name"].lower()] + [a.strip() for a in r["aliases"].lower().split(",") if a.strip()]
        if needle in names:
            return dict(r)
    # fallback: substring match either direction — guard against short/common
    # words (e.g. "of", "at") spuriously matching inside a longer alias
    if len(needle) < 4:
        return None
    for r in rows:
        names = [r["name"].lower()] + [a.strip() for a in r["aliases"].lower().split(",") if a.strip()]
        for n in names:
            if n and len(n) >= 4 and (n in needle or needle in n):
                return dict(r)
    return None


def list_dcs():
    # Stand-in DC master list. Swap for a real table/lookup if the team has one.
    return [
        "Siliguri DC", "Kolkata DC", "Delhi DC", "Mumbai DC",
        "Chennai DC", "Hyderabad DC", "Pune DC", "Guwahati DC",
    ]
