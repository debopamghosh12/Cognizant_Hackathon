import os
import random
import sys
import uuid
from datetime import datetime, timezone

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from validate import within_tolerance, three_way_match  # src/validate.py — reused so this stays consistent

GMP_REQUIRED_CATEGORIES = {"Active Ingredient", "Excipient"}
MAX_DEFECT_RATE_PCT = 0.05


def _available_capacity(supplier: dict) -> float:
    return supplier["max_capacity_units_per_month"] * (1 - supplier["current_utilization_pct"])


def generate_po(requisition: dict, supplier: dict) -> dict:
    """
    requisition: {requisition_id?: int, sku_id: str, quantity: int,
                  destination_dc: str, urgency: str, source: str}
    supplier: {supplier_id: str, sku_id: str, unit_price: float,
               minimum_order_quantity: int, lead_time_days: int,
               max_capacity_units_per_month: int, current_utilization_pct: float,
               gmp_certified: bool, defect_rate_pct: float, category: str}

    Raises ValueError with a specific reason if the requisition/supplier pair
    fails one of the hard filters documented in docs/SCHEMA.md. Returns a dict
    matching the extended purchase_orders row otherwise.
    """
    if supplier["sku_id"] != requisition["sku_id"]:
        raise ValueError(
            f"supplier sku_id '{supplier['sku_id']}' does not match "
            f"requisition sku_id '{requisition['sku_id']}'"
        )

    quantity = requisition["quantity"]

    if supplier["category"] in GMP_REQUIRED_CATEGORIES and not supplier["gmp_certified"]:
        raise ValueError(
            f"supplier '{supplier['supplier_id']}' is not GMP certified for "
            f"category '{supplier['category']}'"
        )

    if supplier["defect_rate_pct"] > MAX_DEFECT_RATE_PCT:
        raise ValueError(
            f"supplier '{supplier['supplier_id']}' defect rate "
            f"{supplier['defect_rate_pct']} exceeds {MAX_DEFECT_RATE_PCT}"
        )

    if quantity < supplier["minimum_order_quantity"]:
        raise ValueError(
            f"quantity {quantity} is below supplier minimum order quantity "
            f"{supplier['minimum_order_quantity']}"
        )

    available = _available_capacity(supplier)
    if quantity > available:
        raise ValueError(
            f"quantity {quantity} exceeds available capacity {available}"
        )

    unit_price = supplier["unit_price"]
    total_budget = round(quantity * unit_price, 2)
    po_id = f"PO-{uuid.uuid4().hex[:8].upper()}"

    return {
        "po_id": po_id,
        "item_name": requisition["sku_id"],
        "quantity_ordered": quantity,
        "price_per_unit": unit_price,
        "total_budget": total_budget,
        "status": "Open",
        "supplier_id": supplier["supplier_id"],
        "sku_id": requisition["sku_id"],
        "requisition_id": requisition.get("requisition_id"),
        "lead_time_days": supplier["lead_time_days"],
        "destination_dc": requisition["destination_dc"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


# Goods-receipt recording moved to src/database.py::record_delivery() --
# accumulating received quantity per PO (capped at quantity_ordered) is
# inherently stateful, so it lives with persistence rather than as a pure
# function here. po_generation/main.py calls it directly.


INVOICE_LARGE_VARIANCE_RATE = 0.25  # fraction of invoices that get a tolerance-breaking variance
INVOICE_SMALL_VARIANCE_RANGE = (0.0, 0.015)   # comfortably inside MATCH_TOLERANCE_PERCENT (2%)
INVOICE_LARGE_VARIANCE_RANGE = (0.05, 0.15)   # e.g. a real freight surcharge or short-ship dispute


def _jittered(value: float, variance_range: tuple[float, float]) -> float:
    pct = random.uniform(*variance_range)
    sign = random.choice([-1, 1])
    return round(value * (1 + sign * pct), 2)


def generate_synthetic_invoice(po: dict, gr: dict) -> dict:
    """
    Builds an invoice's numbers FROM the PO's and GR's own real values, with
    a small controlled variance, instead of from OCR run against unrelated
    sample images (which is how invoice amounts previously ended up in a
    completely different numeric universe than their PO, e.g. 500,000 vs
    600). 75% of invoices stay inside MATCH_TOLERANCE_PERCENT so they land
    "Approved"; 25% get a larger jitter so they land "Flagged_For_Review" --
    same reused three_way_match() the Matching page already relies on, so
    match_status here can never drift from what that page displays.
    """
    variance_range = (
        INVOICE_LARGE_VARIANCE_RANGE if random.random() < INVOICE_LARGE_VARIANCE_RATE
        else INVOICE_SMALL_VARIANCE_RANGE
    )

    quantity_ordered = _jittered(po["quantity_ordered"], variance_range)
    quantity_received = _jittered(gr["quantity_received"], variance_range)
    expected_total = po["price_per_unit"] * quantity_received
    total_amount = _jittered(expected_total, variance_range)

    extracted_data = {
        "quantity_ordered": quantity_ordered,
        "quantity_received": quantity_received,
        "total_amount": total_amount,
    }
    match_status, issues = three_way_match(extracted_data, po, gr)

    return {
        "invoice_id": f"INV-{uuid.uuid4().hex[:8].upper()}",
        "po_id": po["po_id"],
        "gr_id": gr["gr_id"],
        "item_name": po["item_name"],
        "quantity_ordered": quantity_ordered,
        "quantity_received": quantity_received,
        "price_per_unit": po["price_per_unit"],
        "total_amount": total_amount,
        "extraction_status": "Extracted",
        "match_status": match_status,
        "printable_path": None,
        "issues": issues,  # not persisted (not an invoices column) — surfaced in the API response only
    }


def build_invoice_from_ocr(po: dict, gr: dict, confirmed: dict) -> dict:
    """
    Same invoice-dict shape and same three_way_match() call as
    generate_synthetic_invoice() above -- the only difference is where the
    numbers come from: user-confirmed values from the Upload Invoice review
    step (real OCR, corrected by a human) instead of jittered synthetic
    ones. Kept as a separate function so the tested Generate Invoice path
    (generate_synthetic_invoice) is never touched by this one.

    confirmed: {quantity_ordered, quantity_received, price_per_unit, total_amount}
    """
    extracted_data = {
        "quantity_ordered": confirmed["quantity_ordered"],
        "quantity_received": confirmed["quantity_received"],
        "total_amount": confirmed["total_amount"],
    }
    match_status, issues = three_way_match(extracted_data, po, gr)

    return {
        "invoice_id": f"INV-{uuid.uuid4().hex[:8].upper()}",
        "po_id": po["po_id"],
        "gr_id": gr["gr_id"],
        "item_name": po["item_name"],
        "quantity_ordered": confirmed["quantity_ordered"],
        "quantity_received": confirmed["quantity_received"],
        "price_per_unit": confirmed["price_per_unit"],
        "total_amount": confirmed["total_amount"],
        "extraction_status": "Extracted",
        "match_status": match_status,
        "printable_path": None,
        "issues": issues,
    }


def build_match_rows(invoice: dict, po: dict, gr: dict | None) -> list[dict]:
    """
    Recomputes the same 3 checks three_way_match() (src/validate.py)
    performs, via the same within_tolerance(), so this page can never
    silently drift from what actually decided the invoice's match_status.
    A row is included only when both sides of the comparison are
    available -- an Incomplete/Failed extraction has no invoice
    quantities, and a missing GR means there's nothing to compare
    quantity_received against.

    No GR at all means match_status is "Awaiting_Goods_Receipt" -- no
    match was ever attempted, so returning a partial (Quantity Ordered /
    Total Amount) comparison here would misleadingly imply one was, with
    a fabricated match score. Return no rows in that case.
    """
    if gr is None:
        return []

    rows = []

    if invoice.get("quantity_ordered") is not None:
        po_qty = po["quantity_ordered"]
        inv_qty = invoice["quantity_ordered"]
        rows.append({
            "label": "Quantity Ordered",
            "po": f"{po_qty:g} units",
            "gr": "—",
            "invoice": f"{inv_qty:g} units",
            "match": within_tolerance(po_qty, inv_qty),
        })

    if gr is not None and invoice.get("quantity_received") is not None:
        gr_qty = gr["quantity_received"]
        inv_qty = invoice["quantity_received"]
        rows.append({
            "label": "Quantity Received",
            "po": "—",
            "gr": f"{gr_qty:g} units",
            "invoice": f"{inv_qty:g} units",
            "match": within_tolerance(gr_qty, inv_qty),
        })

    if invoice.get("quantity_received") is not None and invoice.get("total_amount") is not None:
        expected_total = po["price_per_unit"] * invoice["quantity_received"]
        inv_total = invoice["total_amount"]
        rows.append({
            "label": "Total Amount Reconciliation",
            "po": f"${expected_total:.2f}",
            "gr": "—",
            "invoice": f"${inv_total:.2f}",
            "match": within_tolerance(expected_total, inv_total),
        })

    # Mirrors three_way_match()'s 4th check (src/validate.py) -- a strict
    # excess comparison, not within_tolerance(), so it never flags a normal
    # in-progress partial delivery.
    po_qty_ordered = po["quantity_ordered"]
    gr_qty_received = gr["quantity_received"]
    rows.append({
        "label": "Goods Receipt vs PO Quantity",
        "po": f"{po_qty_ordered:g} units",
        "gr": f"{gr_qty_received:g} units",
        "invoice": "—",
        "match": gr_qty_received <= po_qty_ordered,
    })

    return rows
