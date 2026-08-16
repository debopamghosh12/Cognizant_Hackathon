"""
Rule-based/statistical demand forecasting -- deliberately NOT machine
learning, given the time constraints for this build (same honesty
convention already used for this app's supplier scoring formula: a
transparent, defensible formula over a black-box model).

Method: a 14-day trailing moving average as the trend estimate, with a
small additional forward multiplier applied only to the designated
seasonal-spike SKUs. The moving average alone already picks up most of a
real historical uptick (that's what it's for), so the seasonal multiplier
here is kept modest (SEASONAL_FORECAST_MULTIPLIER) rather than re-applying
the full historical spike size -- otherwise the two would double-count the
same effect.
"""
import csv
import statistics
from collections import defaultdict
from datetime import date

from .config import (
    DEMAND_HISTORY_CSV, SEASONAL_SPIKE_SKUS, SEASONAL_FORECAST_MULTIPLIER,
    DISTRIBUTOR_ORDERS_CSV, DISTRIBUTOR_TREND_WINDOW_ORDERS,
    DISTRIBUTOR_TREND_THRESHOLD_PCT, DISTRIBUTOR_LEADING_INDICATOR_MULTIPLIER,
    PROMOTIONAL_CALENDAR_CSV,
)

TREND_WINDOW_DAYS = 14

_history_cache: dict[tuple[str, str], list[tuple[date, int]]] | None = None
_distributor_cache: dict[str, list[tuple[date, int]]] | None = None
_promo_cache: dict[str, list[tuple[date, date, float]]] | None = None


def _load_history() -> dict[tuple[str, str], list[tuple[date, int]]]:
    global _history_cache
    if _history_cache is not None:
        return _history_cache

    series: dict[tuple[str, str], list[tuple[date, int]]] = defaultdict(list)
    with open(DEMAND_HISTORY_CSV, newline="") as f:
        for row in csv.DictReader(f):
            key = (row["sku_id"], row["destination_dc"])
            series[key].append((date.fromisoformat(row["date"]), int(row["units_sold"])))

    for key in series:
        series[key].sort(key=lambda pair: pair[0])

    _history_cache = dict(series)
    return _history_cache


def _load_distributor_orders() -> dict[str, list[tuple[date, int]]]:
    """Feature 2: distributor-level order history, per SKU only (no DC
    dimension -- a distributor sits above the DC tier and supplies
    multiple DCs). Loaded the same way as _load_history() above, just a
    separate file and cache."""
    global _distributor_cache
    if _distributor_cache is not None:
        return _distributor_cache

    orders: dict[str, list[tuple[date, int]]] = defaultdict(list)
    with open(DISTRIBUTOR_ORDERS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            orders[row["sku_id"]].append((date.fromisoformat(row["date"]), int(row["quantity_ordered"])))

    for sku_id in orders:
        orders[sku_id].sort(key=lambda pair: pair[0])

    _distributor_cache = dict(orders)
    return _distributor_cache


def _distributor_signal(sku_id: str) -> dict:
    """Feature 2 leading indicator: compares the average of the most
    recent DISTRIBUTOR_TREND_WINDOW_ORDERS distributor orders against the
    same number of orders before that -- the identical recent-vs-prior
    technique forecast_demand() already uses for the DC-level trend below,
    just applied to distributor orders instead. A distributor consistently
    ordering more than usual, ahead of when DC-level sell-through actually
    moves, is treated as an early signal that real demand is about to rise."""
    orders = _load_distributor_orders().get(sku_id, [])
    n = DISTRIBUTOR_TREND_WINDOW_ORDERS
    if len(orders) < n + 1:
        return {"signal": "No Data", "multiplier": 1.0}

    quantities = [qty for _, qty in orders]
    recent = quantities[-n:]
    prior = quantities[-2 * n:-n] or recent

    recent_avg = statistics.fmean(recent)
    prior_avg = statistics.fmean(prior)

    if prior_avg == 0:
        signal = "Rising" if recent_avg > 0 else "Stable"
    else:
        change_pct = (recent_avg - prior_avg) / prior_avg
        signal = (
            "Rising" if change_pct > DISTRIBUTOR_TREND_THRESHOLD_PCT
            else "Falling" if change_pct < -DISTRIBUTOR_TREND_THRESHOLD_PCT
            else "Stable"
        )

    multiplier = DISTRIBUTOR_LEADING_INDICATOR_MULTIPLIER if signal == "Rising" else 1.0
    return {"signal": signal, "multiplier": multiplier}


def _load_promotional_calendar() -> dict[str, list[tuple[date, date, float]]]:
    """Feature 3: per-SKU list of (start_date, end_date, expected_lift_pct)
    promo windows. Not every SKU has an entry -- that's the honest default
    (no promo data == no promo adjustment), not an error."""
    global _promo_cache
    if _promo_cache is not None:
        return _promo_cache

    calendar: dict[str, list[tuple[date, date, float]]] = defaultdict(list)
    with open(PROMOTIONAL_CALENDAR_CSV, newline="") as f:
        for row in csv.DictReader(f):
            calendar[row["sku"]].append((
                date.fromisoformat(row["start_date"]),
                date.fromisoformat(row["end_date"]),
                float(row["expected_lift_pct"]),
            ))

    _promo_cache = dict(calendar)
    return _promo_cache


def _promo_signal(sku_id: str) -> dict:
    """Feature 3: checks whether today falls inside any promo window for
    this SKU (same date.today() convention replenishment.py's near-expiry
    check already uses). If more than one window somehow overlaps today,
    the first match wins -- promo windows aren't expected to overlap in
    this dataset, so this is just a defined tie-break, not a real case."""
    today = date.today()
    for start, end, lift_pct in _load_promotional_calendar().get(sku_id, []):
        if start <= today <= end:
            return {"active": True, "lift_pct": lift_pct}
    return {"active": False, "lift_pct": 0.0}


def forecast_demand(sku_id: str, destination_dc: str) -> dict:
    """Returns {daily_forecast, trend, confidence, distributor_signal,
    promo_active, promo_lift_pct} for one SKU/DC pair. daily_forecast is
    units/day, ready to multiply by a lead-time window in replenishment.py."""
    history = _load_history().get((sku_id, destination_dc), [])
    if not history:
        return {
            "daily_forecast": 0.0, "trend": "Stable", "confidence": "Low",
            "distributor_signal": "No Data", "promo_active": False, "promo_lift_pct": 0.0,
        }

    values = [units for _, units in history]
    recent = values[-TREND_WINDOW_DAYS:]
    prior = values[-2 * TREND_WINDOW_DAYS:-TREND_WINDOW_DAYS] or recent

    recent_avg = statistics.fmean(recent)
    prior_avg = statistics.fmean(prior)

    daily_forecast = recent_avg
    if sku_id in SEASONAL_SPIKE_SKUS:
        daily_forecast *= SEASONAL_FORECAST_MULTIPLIER

    # Feature 2: distributor leading indicator -- a small additional nudge
    # on top of the existing seasonal step above, only when distributor
    # orders are themselves trending up. Multiplier is 1.0 (no change at
    # all to daily_forecast) for every SKU whose distributor signal isn't
    # "Rising", so this never alters behavior for cases that don't use it.
    distributor = _distributor_signal(sku_id)
    daily_forecast *= distributor["multiplier"]

    # Feature 3: promotional calendar -- another independent, additional
    # adjustment (stacks with both the seasonal multiplier and the
    # distributor nudge above, never replaces them). No-op (multiplier of
    # exactly 1.0) whenever this SKU has no active promo today.
    promo = _promo_signal(sku_id)
    daily_forecast *= (1 + promo["lift_pct"] / 100)

    if prior_avg == 0:
        trend = "Rising" if recent_avg > 0 else "Stable"
    else:
        change_pct = (recent_avg - prior_avg) / prior_avg
        trend = "Rising" if change_pct > 0.10 else "Falling" if change_pct < -0.10 else "Stable"

    if recent_avg == 0:
        confidence = "Low"
    else:
        coeff_of_variation = statistics.pstdev(recent) / recent_avg
        confidence = "High" if coeff_of_variation < 0.15 else "Medium" if coeff_of_variation < 0.35 else "Low"

    return {
        "daily_forecast": round(daily_forecast, 1),
        "trend": trend,
        "confidence": confidence,
        "distributor_signal": distributor["signal"],
        "promo_active": promo["active"],
        "promo_lift_pct": promo["lift_pct"],
    }
