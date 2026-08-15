import os
import random
import sys
import uuid
from datetime import datetime, timezone

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from validate import within_tolerance  # src/validate.py — reused so this stays consistent with three_way_match()

GMP_REQUIRED_CATEGORIES = {"Active Ingredient", "Excipient"}
MAX_DEFECT_RATE_PCT = 0.05

DELIVERY_VARIANCE_RATE = 0.20
DELIVERY_VARIANCE_RANGE = (0.10, 0.20)  # 10-20%, clear of validate.py's 2% match tolerance


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


def simulate_delivery(po_id: str, quantity_ordered: float) -> dict:
    """
    Synthetic goods-receipt generator. ~80% of deliveries arrive exactly as
    ordered; the rest deliberately short- or over-deliver by 10-20% (chosen
    to sit well clear of validate.py's 2% three_way_match tolerance, so
    these cases reliably flag rather than landing in ambiguous territory).
    """
    variance_applied = random.random() < DELIVERY_VARIANCE_RATE
    if variance_applied:
        pct = random.uniform(*DELIVERY_VARIANCE_RANGE)
        sign = random.choice([-1, 1])
        quantity_received = round(quantity_ordered * (1 + sign * pct), 2)
    else:
        pct = 0.0
        sign = 0
        quantity_received = quantity_ordered

    return {
        "gr_id": f"GR-{uuid.uuid4().hex[:8].upper()}",
        "po_id": po_id,
        "quantity_received": quantity_received,
        "status": "Validated",
        # not persisted to goods_receipts (not part of its schema) — surfaced
        # in the API response only, for demo transparency
        "quantity_ordered": quantity_ordered,
        "variance_applied": variance_applied,
        "variance_pct": round(sign * pct * 100, 2),
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
    """
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

    return rows
