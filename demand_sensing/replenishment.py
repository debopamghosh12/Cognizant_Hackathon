"""
Replenishment decision logic (reorder-point) and the inter-DC transfer
check. Both are deliberately simple, explainable formulas over synthetic
data -- not an optimization model.
"""
import csv
import math
from datetime import date, datetime, timezone
from functools import lru_cache

from . import database
from .config import (
    SKUS, DESTINATION_DCS, SUPPLIERS_CSV, SAFETY_STOCK_DAYS,
    TRANSFER_FLAT_FEE, TRANSFER_PER_UNIT_COST, SUPPLIER_SHIPPING_FLAT_FEE,
    NEAR_EXPIRY_MIN_DAYS, NEAR_EXPIRY_MAX_DAYS,
    WAREHOUSE_CAPACITY_UNITS, DEFAULT_WAREHOUSE_CAPACITY_UNITS,
    REORDER_CADENCE_BASE_DAYS, REORDER_CADENCE_CONFIDENCE_FACTOR,
    ESCALATION_THRESHOLD_HOURS, ESCALATION_TARGET,
)
from .forecasting import forecast_demand


def _warehouse_capacity(sku_id: str, destination_dc: str) -> float:
    return WAREHOUSE_CAPACITY_UNITS.get((sku_id, destination_dc), DEFAULT_WAREHOUSE_CAPACITY_UNITS)


def _reorder_cadence_days(sku_id: str, confidence: str) -> int:
    """Feature 4: REORDER_CADENCE_BASE_DAYS scaled by how volatile this
    SKU's recent demand is (High confidence = full baseline cadence, Low
    confidence = review twice as often), floored at the SKU's own average
    supplier lead time -- a cadence shorter than lead time isn't
    actionable, you can't receive an order faster than it ships."""
    factor = REORDER_CADENCE_CONFIDENCE_FACTOR.get(confidence, 1.0)
    lead_time = _supplier_stats()[sku_id]["avg_lead_time_days"]
    return max(round(lead_time), round(REORDER_CADENCE_BASE_DAYS * factor))


@lru_cache(maxsize=1)
def _supplier_stats() -> dict[str, dict]:
    """Per-SKU avg lead time and cheapest unit price, read straight from
    the live supplier catalog (data/suppliers.csv) -- the same file AI
    Sourcing already uses -- so reorder points and the transfer cost
    comparison stay consistent with what a real order would actually
    cost/take."""
    stats: dict[str, dict] = {}
    leads: dict[str, list[float]] = {}
    prices: dict[str, list[float]] = {}
    with open(SUPPLIERS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            sku_id = row["sku_id"]
            if sku_id not in SKUS:
                continue
            leads.setdefault(sku_id, []).append(float(row["lead_time_days"]))
            prices.setdefault(sku_id, []).append(float(row["unit_price"]))

    for sku_id in SKUS:
        sku_leads = leads.get(sku_id, [7.0])
        sku_prices = prices.get(sku_id, [1.0])
        stats[sku_id] = {
            "avg_lead_time_days": sum(sku_leads) / len(sku_leads),
            "cheapest_unit_price": min(sku_prices),
        }
    return stats


def _reorder_point(sku_id: str, destination_dc: str) -> tuple[float, dict]:
    forecast = forecast_demand(sku_id, destination_dc)
    lead_time = _supplier_stats()[sku_id]["avg_lead_time_days"]
    reorder_point = forecast["daily_forecast"] * (lead_time + SAFETY_STOCK_DAYS)
    return reorder_point, forecast


def _urgency(current_stock: float, reorder_point: float) -> str | None:
    if reorder_point <= 0 or current_stock >= reorder_point:
        return None
    ratio = current_stock / reorder_point
    if ratio < 0.30:
        return "Critical"
    if ratio < 0.60:
        return "High"
    if ratio < 0.90:
        return "Medium"
    return None  # within 10% of the reorder point -- not worth alerting on yet


def find_transfer_option(sku_id: str, needy_dc: str, needed_qty: float) -> dict | None:
    """Looks at every OTHER DC's batches for this SKU. A batch only counts
    as available if it's within the near-expiry window AND that DC has
    genuine surplus -- its own stock minus its OWN reorder point -- so a
    transfer never robs a DC that needs its own stock. Recommends the
    single best (soonest-expiring, sufficient) batch, then compares flat
    transfer cost against ordering the same quantity from the cheapest
    supplier plus flat shipping. Returns None if no batch is both
    available and cheaper than sourcing."""
    candidates = []
    for other_dc in DESTINATION_DCS:
        if other_dc == needy_dc:
            continue

        other_reorder_point, _ = _reorder_point(sku_id, other_dc)
        other_stock = database.get_current_stock(sku_id, other_dc)
        other_surplus = other_stock - other_reorder_point
        if other_surplus <= 0:
            continue

        for batch in database.get_batches_for(sku_id, other_dc):
            days_to_expiry = (date.fromisoformat(batch["expiry_date"]) - date.today()).days
            if not (NEAR_EXPIRY_MIN_DAYS <= days_to_expiry <= NEAR_EXPIRY_MAX_DAYS):
                continue
            available_qty = min(batch["quantity"], other_surplus)
            if available_qty <= 0:
                continue
            candidates.append({
                "batch_id": batch["batch_id"],
                "from_dc": other_dc,
                "available_qty": available_qty,
                "days_to_expiry": days_to_expiry,
            })

    if not candidates:
        return None

    # Soonest-expiring first -- use the stock most at risk of being wasted.
    candidates.sort(key=lambda c: c["days_to_expiry"])
    best = candidates[0]
    transfer_qty = min(needed_qty, best["available_qty"])

    transfer_cost = TRANSFER_FLAT_FEE + TRANSFER_PER_UNIT_COST * transfer_qty
    supplier_unit_price = _supplier_stats()[sku_id]["cheapest_unit_price"]
    supplier_cost = supplier_unit_price * transfer_qty + SUPPLIER_SHIPPING_FLAT_FEE

    if transfer_cost >= supplier_cost:
        return None

    return {
        "batch_id": best["batch_id"],
        "from_dc": best["from_dc"],
        "quantity": round(transfer_qty, 1),
        "days_to_expiry": best["days_to_expiry"],
        "transfer_cost": round(transfer_cost, 2),
        "supplier_cost": round(supplier_cost, 2),
    }


def _escalation_status(sku_id: str, dc: str, urgency: str | None) -> dict:
    """Feature 5: not Critical -> clear any tracking (the clock resets,
    doesn't accumulate across separate incidents). Critical -> get/set the
    first-seen timestamp and check whether it's been Critical longer than
    ESCALATION_THRESHOLD_HOURS."""
    if urgency != "Critical":
        database.clear_escalation_tracking(sku_id, dc)
        return {"escalated": False, "escalation_target": None}

    first_seen = database.get_or_set_first_seen_critical(sku_id, dc)
    hours_critical = (datetime.now(timezone.utc) - datetime.fromisoformat(first_seen)).total_seconds() / 3600
    escalated = hours_critical > ESCALATION_THRESHOLD_HOURS
    return {"escalated": escalated, "escalation_target": ESCALATION_TARGET if escalated else None}


def compute_replenishment_needs() -> list[dict]:
    needs = []
    for sku_id, sku_name in SKUS.items():
        for dc in DESTINATION_DCS:
            reorder_point, forecast = _reorder_point(sku_id, dc)
            current_stock = database.get_current_stock(sku_id, dc)
            urgency = _urgency(current_stock, reorder_point)
            escalation = _escalation_status(sku_id, dc, urgency)
            if urgency is None:
                continue

            recommended_qty = max(0, math.ceil(reorder_point - current_stock))

            # Feature 1: Warehouse Capacity Check -- never recommend more
            # than the DC physically has free shelf space for. Only ever
            # lowers recommended_qty, never raises it, and only engages
            # when the cap actually binds -- every SKU/DC pair not listed
            # in WAREHOUSE_CAPACITY_UNITS uses a capacity generous enough
            # that this is a no-op, so existing behavior is unchanged
            # unless the new capacity data actually constrains the DC.
            capacity = _warehouse_capacity(sku_id, dc)
            available_space = max(0, math.floor(capacity - current_stock))
            capped_by_capacity = recommended_qty > available_space
            if capped_by_capacity:
                recommended_qty = available_space

            transfer = find_transfer_option(sku_id, dc, recommended_qty)
            reorder_frequency_days = _reorder_cadence_days(sku_id, forecast["confidence"])

            needs.append({
                "id": f"{sku_id}|{dc}",
                "sku_id": sku_id,
                "sku_name": sku_name,
                "destination_dc": dc,
                "current_stock": round(current_stock, 1),
                "daily_forecast": forecast["daily_forecast"],
                "trend": forecast["trend"],
                "confidence": forecast["confidence"],
                "reorder_point": round(reorder_point, 1),
                "recommended_qty": recommended_qty,
                "urgency": urgency,
                "reason": (
                    f"Forecasted demand of {forecast['daily_forecast']:g} units/day "
                    f"({forecast['trend'].lower()} trend) puts stock below the "
                    f"{round(reorder_point):g}-unit reorder point (lead time + "
                    f"{SAFETY_STOCK_DAYS}-day safety buffer)."
                    + (
                        f" Capped at {available_space:g} units by available warehouse space."
                        if capped_by_capacity else ""
                    )
                ),
                "transfer": transfer,
                "capped_by_capacity": capped_by_capacity,
                "distributor_signal": forecast["distributor_signal"],
                "promo_active": forecast["promo_active"],
                "promo_lift_pct": forecast["promo_lift_pct"],
                "recommended_reorder_frequency_days": reorder_frequency_days,
                "escalated": escalation["escalated"],
                "escalation_target": escalation["escalation_target"],
            })

    urgency_rank = {"Critical": 0, "High": 1, "Medium": 2}
    needs.sort(key=lambda n: urgency_rank[n["urgency"]])
    return needs
