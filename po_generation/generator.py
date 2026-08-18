import os
import sys
import uuid
from datetime import datetime, timezone

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from validate import within_tolerance, three_way_match  # src/validate.py — reused so this stays consistent
from config import MATCH_TOLERANCE_PERCENT

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


def generate_synthetic_invoice(po: dict, gr: dict) -> dict:
    """
    Builds an invoice's numbers directly FROM the PO's and GR's own real
    values -- no variance, every field an exact echo of the record it came
    from. (Previously applied a small deliberate jitter, sized to land most
    invoices inside MATCH_TOLERANCE_PERCENT and a fraction outside it, as a
    demo of the tolerance/review logic -- removed by explicit request in
    favor of clean, unambiguous 3-way matches with no unexplained variance.
    A demo of the tolerance logic, if wanted later, should be one
    deliberately-flagged example, not baked into every synthetic invoice.)

    total_amount is price_per_unit x quantity_received (what was actually
    delivered), not po["total_budget"] (price x quantity ORDERED) -- these
    only differ when a GR's received quantity doesn't match the PO's
    ordered quantity (a partial or over-delivery), and using the received
    quantity keeps this exactly equal to what three_way_match()'s own
    reconciliation check compares against, so the match is trivially exact
    in every case, not just the common one.
    """
    quantity_ordered = po["quantity_ordered"]
    quantity_received = gr["quantity_received"]
    total_amount = round(po["price_per_unit"] * quantity_received, 2)

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


def _variance_pct(baseline: float, other: float) -> float | None:
    """Same formula within_tolerance() (src/validate.py) uses internally to
    decide pass/fail -- exposed here too so a UI can show the real percent
    that drove the decision instead of re-deriving (and risking drifting
    from) it separately."""
    if baseline == 0:
        return None if other == 0 else float("inf")
    return round(abs(baseline - other) / baseline * 100, 2)


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

    Each row also carries variancePercent/tolerancePercent (numeric, not
    just the display strings) -- added for the Approvals page's expandable
    detail view, so it can state the actual rule and margin ("X% variance,
    outside the 2% tolerance") with real numbers instead of the generic
    sentence it previously showed.
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
            "variancePercent": _variance_pct(po_qty, inv_qty),
            "tolerancePercent": MATCH_TOLERANCE_PERCENT,
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
            "variancePercent": _variance_pct(gr_qty, inv_qty),
            "tolerancePercent": MATCH_TOLERANCE_PERCENT,
        })

    if invoice.get("quantity_received") is not None and invoice.get("total_amount") is not None:
        # expected_total is a CALCULATED figure (PO's price_per_unit x the
        # invoice's own claimed quantity_received) -- what the invoice
        # SHOULD total if billed at the agreed rate for what it says was
        # received. It is genuinely what decides match/no-match here (via
        # within_tolerance() below), same as before. What changed: it used
        # to be returned under the "po" key, which reads as "the PO's real
        # total" -- misleading whenever invoice quantity differs from the
        # PO's, since the PO's real total_budget is a different number
        # entirely (e.g. PO total_budget=19.50 vs this calculated
        # expected_total=26.00 when the invoice over-claims quantity).
        # "po" below is now always the PO's real total_budget, matching
        # every other row's "po" meaning "real PO data"; the calculated
        # figure moves to its own "expected" key so a UI can label it
        # explicitly instead of presenting it as source data.
        expected_total = po["price_per_unit"] * invoice["quantity_received"]
        inv_total = invoice["total_amount"]
        rows.append({
            "label": "Total Amount Reconciliation",
            "po": f"₹{po['total_budget']:.2f}",
            "gr": "—",
            "invoice": f"₹{inv_total:.2f}",
            "expected": f"₹{expected_total:.2f}",
            "match": within_tolerance(expected_total, inv_total),
            "variancePercent": _variance_pct(expected_total, inv_total),
            "tolerancePercent": MATCH_TOLERANCE_PERCENT,
        })

    # Mirrors three_way_match()'s 4th check (src/validate.py) -- a strict
    # excess comparison, not within_tolerance(), so it never flags a normal
    # in-progress partial delivery. variancePercent is signed here (positive
    # = over-delivery amount); tolerancePercent is 0 since ANY overage fails
    # this check, unlike the 2%-band checks above.
    po_qty_ordered = po["quantity_ordered"]
    gr_qty_received = gr["quantity_received"]
    over_pct = (
        round((gr_qty_received - po_qty_ordered) / po_qty_ordered * 100, 2)
        if po_qty_ordered else None
    )
    rows.append({
        "label": "Goods Receipt vs PO Quantity",
        "po": f"{po_qty_ordered:g} units",
        "gr": f"{gr_qty_received:g} units",
        "invoice": "—",
        "match": gr_qty_received <= po_qty_ordered,
        "variancePercent": over_pct,
        "tolerancePercent": 0,
    })

    return rows
