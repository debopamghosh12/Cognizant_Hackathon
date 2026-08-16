"""
Run once to produce data/demand_sensing/demand_history.csv -- a synthetic
~90-day daily demand history per SKU x destination DC. Committed as a
static file so forecasts stay stable/reproducible across restarts rather
than being regenerated on every server start.

Not a real-world dataset -- base daily rates and noise are hand-picked to
be plausible for a mid-size regional DC, with a deliberate seasonal spike
baked into the most recent SPIKE_WINDOW_DAYS for SEASONAL_SPIKE_SKUS (the
"flu season +60%" scenario). A fixed random seed per SKU/DC makes the
output fully deterministic -- rerunning this script reproduces the same
file byte-for-byte.
"""
import csv
import os
import random
from datetime import datetime, timedelta, timezone

from config import (
    DEMAND_HISTORY_CSV, SKUS, DESTINATION_DCS, SEASONAL_SPIKE_SKUS,
    HISTORY_DAYS, SPIKE_WINDOW_DAYS, SPIKE_MULTIPLIER,
    DISTRIBUTOR_ORDERS_CSV, DISTRIBUTOR_ORDER_INTERVAL_DAYS,
    DISTRIBUTOR_ORDER_BATCH_MULTIPLIER, DISTRIBUTOR_LEAD_DAYS,
    PROMOTIONAL_CALENDAR_CSV,
)

# Base average units/day per SKU, before per-DC variance -- roughly
# proportional to how commonly each item is dispensed (paracetamol moves
# far more units/day than N95 mask boxes).
BASE_DAILY_DEMAND = {
    "SKU-1001": 40,
    "SKU-1002": 20,
    "SKU-1003": 25,
    "SKU-1007": 30,
    "SKU-1010": 15,
}

# Each DC gets a fixed multiplier on the SKU base rate, so DCs aren't
# identical -- purely for realistic variance, not a real population model.
DC_SIZE_FACTOR = {"Pune DC": 1.2, "Chennai DC": 1.0, "Siliguri DC": 0.7}


def generate() -> None:
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=HISTORY_DAYS - 1)
    spike_start = end_date - timedelta(days=SPIKE_WINDOW_DAYS - 1)

    rows = []
    for sku_id in SKUS:
        base = BASE_DAILY_DEMAND[sku_id]
        for dc in DESTINATION_DCS:
            rng = random.Random(f"{sku_id}|{dc}")  # deterministic per series
            dc_base = base * DC_SIZE_FACTOR[dc]
            for offset in range(HISTORY_DAYS):
                day = start_date + timedelta(days=offset)
                daily_mean = dc_base
                if sku_id in SEASONAL_SPIKE_SKUS and day >= spike_start:
                    daily_mean *= SPIKE_MULTIPLIER
                # +/-15% noise around the day's mean, floored at 0.
                units = max(0, round(daily_mean * (1 + rng.uniform(-0.15, 0.15))))
                rows.append({
                    "date": day.isoformat(),
                    "sku_id": sku_id,
                    "destination_dc": dc,
                    "units_sold": units,
                })

    os.makedirs(os.path.dirname(DEMAND_HISTORY_CSV), exist_ok=True)
    with open(DEMAND_HISTORY_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "sku_id", "destination_dc", "units_sold"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {DEMAND_HISTORY_CSV}")


def generate_distributor_orders() -> None:
    """Feature 2: synthetic distributor-level order history, separate from
    demand_history.csv's daily DC-level sell-through. A distributor places
    one bulk order roughly every DISTRIBUTOR_ORDER_INTERVAL_DAYS (not
    daily), sized around combined demand across all DCs plus a buffer
    (DISTRIBUTOR_ORDER_BATCH_MULTIPLIER). For the seasonal-spike SKUs, the
    order-size uplift starts DISTRIBUTOR_LEAD_DAYS before the DC-level
    spike does in generate() above -- a distributor stocking up ahead of
    an anticipated surge is what makes this a genuine leading indicator
    rather than a copy of the DC-level trend."""
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=HISTORY_DAYS - 1)
    # Starts earlier than demand_history.csv's own spike_start -- the
    # distributor orders ahead of the DC-level surge, not alongside it.
    distributor_spike_start = end_date - timedelta(days=SPIKE_WINDOW_DAYS - 1 + DISTRIBUTOR_LEAD_DAYS)

    rows = []
    for sku_id in SKUS:
        combined_daily_rate = BASE_DAILY_DEMAND[sku_id] * sum(DC_SIZE_FACTOR.values())
        rng = random.Random(f"distributor|{sku_id}")  # deterministic per SKU

        order_day = start_date
        while order_day <= end_date:
            order_mean = combined_daily_rate * DISTRIBUTOR_ORDER_INTERVAL_DAYS * DISTRIBUTOR_ORDER_BATCH_MULTIPLIER
            if sku_id in SEASONAL_SPIKE_SKUS and order_day >= distributor_spike_start:
                order_mean *= SPIKE_MULTIPLIER
            quantity = max(0, round(order_mean * (1 + rng.uniform(-0.15, 0.15))))
            rows.append({
                "date": order_day.isoformat(),
                "sku_id": sku_id,
                "quantity_ordered": quantity,
            })
            order_day += timedelta(days=DISTRIBUTOR_ORDER_INTERVAL_DAYS)

    os.makedirs(os.path.dirname(DISTRIBUTOR_ORDERS_CSV), exist_ok=True)
    with open(DISTRIBUTOR_ORDERS_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "sku_id", "quantity_ordered"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {DISTRIBUTOR_ORDERS_CSV}")


def generate_promotional_calendar() -> None:
    """Feature 3: a small, realistic spread of promo windows -- not every
    SKU has one, some overlap with a seasonal-spike SKU (to demonstrate
    stacking with the existing seasonal multiplier) and some don't (to
    demonstrate an independent promo signal), and one is deliberately
    outside today's date so forecast_demand()'s date-window check has a
    real "not active" case to prove it isn't just always-on."""
    today = datetime.now(timezone.utc).date()
    rows = [
        # SKU-1010 (N95 masks) is also a seasonal-spike SKU -- this promo
        # window deliberately overlaps today, so the promo and seasonal
        # adjustments visibly stack in the API response.
        {
            "sku": "SKU-1010",
            "start_date": (today - timedelta(days=3)).isoformat(),
            "end_date": (today + timedelta(days=7)).isoformat(),
            "expected_lift_pct": 25,
        },
        # SKU-1003 (Ibuprofen) is NOT a seasonal-spike SKU -- an
        # independent, standalone promo, active today.
        {
            "sku": "SKU-1003",
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": (today + timedelta(days=10)).isoformat(),
            "expected_lift_pct": 15,
        },
        # SKU-1002 (Amoxicillin) had a promo, but it already ended --
        # proves the date check correctly treats this as NOT active today.
        {
            "sku": "SKU-1002",
            "start_date": (today - timedelta(days=40)).isoformat(),
            "end_date": (today - timedelta(days=20)).isoformat(),
            "expected_lift_pct": 20,
        },
        # SKU-1001, SKU-1007 intentionally have no promo entries at all --
        # not every SKU is always running a promotion.
    ]

    os.makedirs(os.path.dirname(PROMOTIONAL_CALENDAR_CSV), exist_ok=True)
    with open(PROMOTIONAL_CALENDAR_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["sku", "start_date", "end_date", "expected_lift_pct"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {PROMOTIONAL_CALENDAR_CSV}")


if __name__ == "__main__":
    generate()
    generate_distributor_orders()
    generate_promotional_calendar()
