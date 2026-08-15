import uuid
from datetime import datetime, timezone

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
