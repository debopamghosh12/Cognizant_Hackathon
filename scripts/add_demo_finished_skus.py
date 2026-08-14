"""
add_demo_finished_skus.py

Demo-scope overlay: appends supplier rows for 4 of chatbot's finished-product
SKU IDs (SKU-1001, SKU-1002, SKU-1007, SKU-1010) to data/suppliers.csv, using
existing supplier identities from the main synthetic catalog.

Why this exists: chatbot's requisition SKUs (SKU-1001..SKU-1010, finished
products like "Paracetamol 500mg") and the main supplier catalog's SKUs
(SKU-API-*/EXC-*/PKG-*, raw materials) are deliberately different lists — see
docs/SCHEMA.md "Demo scope" note. This script adds just enough overlap that a
demo requisition for e.g. paracetamol resolves to a real supplier and flows
through PO generation -> OCR/3-way-match end to end. It is NOT a bill-of-
materials resolver; a real system would source a finished product from
several raw-material suppliers, not one directly-orderable line.

This is separate from scripts/generate_suppliers.py on purpose: re-running
that script (even with these SKUs added to its SKUS list) would reshuffle
random draws for the entire 148-row dataset, since supplier archetypes and
SKU assignment share one seeded RNG stream. Appending fixed, hand-specified
rows here keeps the existing 148 rows byte-for-byte unchanged.

Run:
    python scripts/add_demo_finished_skus.py

Safe to re-run: skips any (supplier_id, sku_id) pair already present in the
CSV instead of duplicating it.
"""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "suppliers.csv"

# Same weights as scripts/generate_suppliers.py's suitability formula, so
# suitability_score here is computed the same way (cost/lead normalised
# within each SKU pair, no GMP penalty since "Finished Product" isn't a
# regulated category in this dataset).
W_COST, W_LEAD, W_OTD, W_QUALITY = 0.30, 0.20, 0.25, 0.25

FIELDNAMES = [
    "supplier_id", "supplier_name", "country", "gmp_certified", "risk_tier",
    "sku_id", "category", "unit_price", "currency", "minimum_order_quantity",
    "payment_terms_days", "lead_time_days", "on_time_delivery_pct",
    "fill_rate_pct", "quality_score", "defect_rate_pct",
    "max_capacity_units_per_month", "current_utilization_pct",
    "valid_from", "valid_to", "suitability_score", "is_preferred",
]

# Each entry: (sku_id, [ (supplier_id, unit_price, moq, lead_time_days,
#              otd, fill_rate, quality, defect_rate, capacity, payment_days) ])
# supplier_id/supplier_name/country/gmp_certified/current_utilization_pct are
# reused as-is from that supplier's existing rows in the CSV -- same company,
# an additional product line.
DEMO_SKUS = [
    ("SKU-1001", [
        ("SUP-001", 0.085, 200, 2, 0.96, 0.95, 0.93, 0.008, 25000, 30),
        ("SUP-002", 0.072, 250, 4, 0.90, 0.89, 0.88, 0.015, 30000, 45),
    ]),
    ("SKU-1002", [
        ("SUP-003", 0.16, 200, 3, 0.94, 0.93, 0.91, 0.010, 20000, 30),
        ("SUP-004", 0.14, 200, 5, 0.88, 0.86, 0.85, 0.020, 18000, 45),
    ]),
    ("SKU-1007", [
        ("SUP-005", 0.045, 500, 2, 0.97, 0.96, 0.94, 0.006, 40000, 30),
        ("SUP-006", 0.038, 500, 6, 0.85, 0.84, 0.80, 0.028, 15000, 60),
    ]),
    ("SKU-1010", [
        ("SUP-007", 3.80, 100, 3, 0.95, 0.94, 0.92, 0.009, 8000, 30),
        ("SUP-008", 3.20, 100, 5, 0.89, 0.87, 0.86, 0.018, 6000, 45),
    ]),
]

VALID_FROM = "2026-08-15"
CATEGORY = "Finished Product"


def _minmax(values, i):
    lo, hi = min(values), max(values)
    return (values[i] - lo) / (hi - lo) if hi != lo else 0.0


def build_rows(existing_identity: dict) -> list[dict]:
    rows = []
    for sku_id, suppliers in DEMO_SKUS:
        prices = [s[1] for s in suppliers]
        leads = [s[3] for s in suppliers]
        bases = []
        for i, (sid, price, moq, lead, otd, fill, quality, defect, cap, pay) in enumerate(suppliers):
            cost_score = 1.0 - _minmax(prices, i)
            speed_score = 1.0 - _minmax(leads, i)
            base = W_COST * cost_score + W_LEAD * speed_score + W_OTD * otd + W_QUALITY * quality
            bases.append(base)

        preferred_idx = bases.index(max(bases))

        for i, (sid, price, moq, lead, otd, fill, quality, defect, cap, pay) in enumerate(suppliers):
            identity = existing_identity[sid]
            rows.append({
                "supplier_id": sid,
                "supplier_name": identity["supplier_name"],
                "country": identity["country"],
                "gmp_certified": identity["gmp_certified"],
                "risk_tier": identity["risk_tier"],
                "sku_id": sku_id,
                "category": CATEGORY,
                "unit_price": price,
                "currency": "USD",
                "minimum_order_quantity": moq,
                "payment_terms_days": pay,
                "lead_time_days": lead,
                "on_time_delivery_pct": otd,
                "fill_rate_pct": fill,
                "quality_score": quality,
                "defect_rate_pct": defect,
                "max_capacity_units_per_month": cap,
                "current_utilization_pct": identity["current_utilization_pct"],
                "valid_from": VALID_FROM,
                "valid_to": "",
                "suitability_score": round(bases[i], 4),
                "is_preferred": (i == preferred_idx),
            })
    return rows


def main():
    with open(CSV_PATH, newline="") as f:
        existing_rows = list(csv.DictReader(f))

    existing_identity = {}
    existing_pairs = set()
    for r in existing_rows:
        existing_identity.setdefault(r["supplier_id"], r)
        existing_pairs.add((r["supplier_id"], r["sku_id"]))

    new_rows = build_rows(existing_identity)
    new_rows = [r for r in new_rows if (r["supplier_id"], r["sku_id"]) not in existing_pairs]

    if not new_rows:
        print("No new rows to add -- demo SKUs already present.")
        return

    with open(CSV_PATH, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        for row in new_rows:
            writer.writerow(row)

    print(f"Appended {len(new_rows)} demo finished-product rows to {CSV_PATH}")
    for r in new_rows:
        print(f"  {r['sku_id']}  {r['supplier_id']}  price={r['unit_price']}  "
              f"suitability={r['suitability_score']}  preferred={r['is_preferred']}")


if __name__ == "__main__":
    main()
