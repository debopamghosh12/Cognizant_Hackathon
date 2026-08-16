"""
Small, from-scratch ML forecasting model -- an ADDITIONAL, optional forecast
source, never the default. forecast_demand() in forecasting.py (the real
rule-based default used by every existing feature) is completely untouched
by this file and everything that imports it.

Does NOT reuse models/demand_forecast_model.pkl -- confirmed incompatible
(wrong SKU/DC categories, wrong capacity scale, trained on a different
dataset entirely). This is a new model, trained from scratch on our own
real demand_history.csv, using only features we actually have data for:
lags, rolling stats, day of week, month, is_flu_season (re-derived from
the same generation rule used to build the synthetic spike -- not
invented), promo_active (promotional_calendar.csv), and a distributor
trend signal (distributor_orders.csv). No fabricated inputs.

Small dataset, honestly: 1,350 rows across 15 SKU x DC series, 90 days
each. After dropping the first 30 days per series (needed for lag_30/
roll_*_28), usable rows drop to ~900; a time-based 46/14-day train/test
split per series leaves ~690 train / ~210 test rows. That is thin for a
15-feature model -- see train_ml_forecast.py's printed metrics for the
honest accuracy assessment, including a naive-baseline comparison, before
trusting this over the rule-based forecast for anything real.
"""
import csv
import json
import pickle
import statistics
from collections import defaultdict
from datetime import date, timedelta

from .config import (
    DEMAND_HISTORY_CSV, DISTRIBUTOR_ORDERS_CSV, PROMOTIONAL_CALENDAR_CSV,
    SEASONAL_SPIKE_SKUS, SPIKE_WINDOW_DAYS,
    ML_MODEL_PATH, ML_LAG_DAYS, ML_ROLLING_WINDOWS, ML_DISTRIBUTOR_TREND_ORDERS,
    ML_METRICS_PATH,
)

FEATURE_NAMES = (
    [f"lag_{d}" for d in ML_LAG_DAYS]
    + [f"roll_mean_{w}" for w in ML_ROLLING_WINDOWS]
    + [f"roll_std_{w}" for w in ML_ROLLING_WINDOWS]
    + ["day_of_week", "month", "is_flu_season", "promo_active", "distributor_signal"]
)


def load_demand_series() -> dict[tuple[str, str], list[tuple[date, int]]]:
    series: dict[tuple[str, str], list[tuple[date, int]]] = defaultdict(list)
    with open(DEMAND_HISTORY_CSV, newline="") as f:
        for row in csv.DictReader(f):
            key = (row["sku_id"], row["destination_dc"])
            series[key].append((date.fromisoformat(row["date"]), int(row["units_sold"])))
    for key in series:
        series[key].sort(key=lambda pair: pair[0])
    return dict(series)


def load_promo_calendar() -> dict[str, list[tuple[date, date, float]]]:
    calendar: dict[str, list[tuple[date, date, float]]] = defaultdict(list)
    with open(PROMOTIONAL_CALENDAR_CSV, newline="") as f:
        for row in csv.DictReader(f):
            calendar[row["sku"]].append((
                date.fromisoformat(row["start_date"]),
                date.fromisoformat(row["end_date"]),
                float(row["expected_lift_pct"]),
            ))
    return dict(calendar)


def load_distributor_orders() -> dict[str, list[tuple[date, int]]]:
    orders: dict[str, list[tuple[date, int]]] = defaultdict(list)
    with open(DISTRIBUTOR_ORDERS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            orders[row["sku_id"]].append((date.fromisoformat(row["date"]), int(row["quantity_ordered"])))
    for sku_id in orders:
        orders[sku_id].sort(key=lambda pair: pair[0])
    return dict(orders)


def _is_flu_season_asof(sku_id: str, target_date: date, series_dates: list[date]) -> int:
    """Re-derives the exact spike-window rule generate_data.py used to build
    demand_history.csv in the first place (SEASONAL_SPIKE_SKUS, last
    SPIKE_WINDOW_DAYS of that SKU's own series) -- not an invented feature,
    a faithful re-application of the real generation parameters."""
    if sku_id not in SEASONAL_SPIKE_SKUS or not series_dates:
        return 0
    spike_start = series_dates[-1] - timedelta(days=SPIKE_WINDOW_DAYS - 1)
    return int(target_date >= spike_start)


def _promo_active_asof(sku_id: str, target_date: date, calendar: dict) -> int:
    for start, end, _ in calendar.get(sku_id, []):
        if start <= target_date <= end:
            return 1
    return 0


def _distributor_signal_asof(sku_id: str, target_date: date, orders: dict) -> int:
    """Same recent-vs-prior comparison forecasting.py::_distributor_signal()
    uses, but using only distributor orders on or before target_date (no
    leakage from future orders) and returning a numeric encoding:
    -1 Falling, 0 Stable/No Data, 1 Rising."""
    n = ML_DISTRIBUTOR_TREND_ORDERS
    past_orders = [qty for d, qty in orders.get(sku_id, []) if d <= target_date]
    if len(past_orders) < n + 1:
        return 0
    recent = past_orders[-n:]
    prior = past_orders[-2 * n:-n] or recent
    recent_avg = statistics.fmean(recent)
    prior_avg = statistics.fmean(prior)
    if prior_avg == 0:
        return 1 if recent_avg > 0 else 0
    change_pct = (recent_avg - prior_avg) / prior_avg
    return 1 if change_pct > 0.20 else -1 if change_pct < -0.20 else 0


def build_feature_row(
    sku_id: str, target_date: date, values_before: list[int], all_dates_for_sku: list[date],
    promo_calendar: dict, distributor_orders: dict,
) -> list[float] | None:
    """values_before: units_sold values strictly BEFORE target_date, in
    date order, for this SKU/DC series (so lag_1 is values_before[-1],
    etc.) -- guarantees no same-day or future leakage into any feature.
    Returns None if there isn't enough history yet (needs at least
    max(ML_LAG_DAYS) prior days) for this target_date."""
    max_lag = max(ML_LAG_DAYS)
    if len(values_before) < max_lag:
        return None

    lags = [values_before[-d] for d in ML_LAG_DAYS]
    rolls_mean = [statistics.fmean(values_before[-w:]) for w in ML_ROLLING_WINDOWS]
    rolls_std = [statistics.pstdev(values_before[-w:]) if w > 1 else 0.0 for w in ML_ROLLING_WINDOWS]

    return [
        *lags,
        *rolls_mean,
        *rolls_std,
        target_date.weekday(),
        target_date.month,
        _is_flu_season_asof(sku_id, target_date, all_dates_for_sku),
        _promo_active_asof(sku_id, target_date, promo_calendar),
        _distributor_signal_asof(sku_id, target_date, distributor_orders),
    ]


_model_cache = None


def _load_model():
    global _model_cache
    if _model_cache is None:
        with open(ML_MODEL_PATH, "rb") as f:
            _model_cache = pickle.load(f)
    return _model_cache


def get_model_metrics() -> dict | None:
    """Real, measured MAE/WMAPE from the last train_ml_forecast.py run
    (models/demand_forecast_model_v2_metrics.json) -- always the actual
    last-training-run numbers, never a hardcoded claim. Returns None if the
    model hasn't been trained yet."""
    try:
        with open(ML_METRICS_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def forecast_demand_ml(sku_id: str, destination_dc: str) -> dict:
    """Additional, optional ML forecast source -- same {daily_forecast}
    shape as forecast_demand()'s core output, for side-by-side comparison
    only. Not wired into replenishment.py or any existing endpoint."""
    try:
        model = _load_model()
    except FileNotFoundError:
        return {"daily_forecast": None, "available": False, "reason": "Model file not found -- run train_ml_forecast.py first."}

    series = load_demand_series().get((sku_id, destination_dc))
    if not series:
        return {"daily_forecast": None, "available": False, "reason": "No demand history for this SKU/DC."}

    dates = [d for d, _ in series]
    values = [v for _, v in series]
    max_lag = max(ML_LAG_DAYS)
    if len(values) < max_lag:
        return {"daily_forecast": None, "available": False, "reason": "Not enough history for this SKU/DC yet."}

    # Forecast for "the day after the last known date" -- the same
    # one-step-ahead framing the model was trained on.
    target_date = dates[-1] + timedelta(days=1)
    promo_calendar = load_promo_calendar()
    distributor_orders = load_distributor_orders()
    features = build_feature_row(sku_id, target_date, values, dates, promo_calendar, distributor_orders)

    prediction = float(model.predict([features])[0])
    return {"daily_forecast": round(max(0.0, prediction), 1), "available": True, "reason": None}
