"""
Experiment ONLY -- tests whether 2 years of synthetic history (vs. the
original 90 days) improves forecast_demand_ml()'s real held-out accuracy.

Completely separate from the live system: reads demand_history_extended.csv
(never demand_history.csv), and does NOT touch forecasting.py,
replenishment.py, ml_forecast.py, models/demand_forecast_model_v2.pkl, or
any live endpoint. Run standalone; nothing here is imported by main.py.

Reuses ml_forecast.py's promo/distributor loaders and helpers as-is (pure
CSV readers + pure functions, unrelated to which demand-history file is in
use) via import -- ml_forecast.py itself is not modified. The one thing
that MUST differ from ml_forecast.py is is_flu_season: the extended
dataset's spike recurs every year by calendar month
(EXTENDED_FLU_SEASON_MONTHS), not "last N days of a 90-day window" --
reusing ml_forecast.py's own deriver unchanged would silently apply the
wrong rule and only catch the last ~3 weeks of 2 years of data.

Run: python -m demand_sensing.train_ml_forecast_extended (from repo root).
"""
import csv
import pickle
import statistics
from datetime import date

from .config import (
    DEMAND_HISTORY_EXTENDED_CSV, ML_LAG_DAYS, ML_ROLLING_WINDOWS,
    ML_TEST_DAYS_PER_SERIES, SEASONAL_SPIKE_SKUS, EXTENDED_FLU_SEASON_MONTHS,
)
from . import ml_forecast as mlf
from .train_ml_forecast import mae, wmape


def load_extended_series() -> dict[tuple[str, str], list[tuple[date, int]]]:
    from collections import defaultdict
    series: dict[tuple[str, str], list[tuple[date, int]]] = defaultdict(list)
    with open(DEMAND_HISTORY_EXTENDED_CSV, newline="") as f:
        for row in csv.DictReader(f):
            key = (row["sku_id"], row["destination_dc"])
            series[key].append((date.fromisoformat(row["date"]), int(row["units_sold"])))
    for key in series:
        series[key].sort(key=lambda pair: pair[0])
    return dict(series)


def _is_flu_season_extended(sku_id: str, target_date: date) -> int:
    """Matches generate_extended()'s actual rule (recurring by calendar
    month), unlike ml_forecast.py's "last N days of the series" rule which
    only fits the live 90-day file's one-time spike."""
    return int(sku_id in SEASONAL_SPIKE_SKUS and target_date.month in EXTENDED_FLU_SEASON_MONTHS)


def build_feature_row_extended(
    sku_id: str, target_date: date, values_before: list[int], promo_calendar: dict, distributor_orders: dict,
) -> list[float] | None:
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
        _is_flu_season_extended(sku_id, target_date),
        mlf._promo_active_asof(sku_id, target_date, promo_calendar),
        mlf._distributor_signal_asof(sku_id, target_date, distributor_orders),
    ]


def build_dataset():
    series_data = load_extended_series()
    # Reused as-is -- promo/distributor CSVs aren't part of this
    # experiment, only the demand-history window is being extended.
    promo_calendar = mlf.load_promo_calendar()
    distributor_orders = mlf.load_distributor_orders()
    max_lag = max(ML_LAG_DAYS)

    train_X, train_y, test_X, test_y = [], [], [], []
    naive_test_actuals, naive_test_preds = [], []

    for (sku_id, dc), series in series_data.items():
        dates = [d for d, _ in series]
        values = [v for _, v in series]
        n = len(values)
        valid_indices = list(range(max_lag, n))
        test_indices = set(valid_indices[-ML_TEST_DAYS_PER_SERIES:])

        for i in valid_indices:
            target_date = dates[i]
            values_before = values[:i]
            row = build_feature_row_extended(sku_id, target_date, values_before, promo_calendar, distributor_orders)
            target = values[i]

            if i in test_indices:
                test_X.append(row)
                test_y.append(target)
                naive_test_actuals.append(target)
                naive_test_preds.append(values_before[-1])
            else:
                train_X.append(row)
                train_y.append(target)

    return train_X, train_y, test_X, test_y, naive_test_actuals, naive_test_preds


def main():
    train_X, train_y, test_X, test_y, naive_actuals, naive_preds = build_dataset()

    print(f"[EXTENDED 730-day experiment] Train rows: {len(train_X)}  |  Test rows: {len(test_X)}")
    print()

    naive_mae = mae(naive_actuals, naive_preds)
    naive_wmape = wmape(naive_actuals, naive_preds)
    print(f"Naive baseline (yesterday's value) -- MAE: {naive_mae:.2f}  WMAPE: {naive_wmape:.1f}%")

    from sklearn.linear_model import LinearRegression
    lr = LinearRegression()
    lr.fit(train_X, train_y)
    lr_preds = [max(0.0, p) for p in lr.predict(test_X)]
    print(f"Linear Regression (baseline model)  -- MAE: {mae(test_y, lr_preds):.2f}  WMAPE: {wmape(test_y, lr_preds):.1f}%")

    from xgboost import XGBRegressor
    model = XGBRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8, random_state=42,
    )
    model.fit(train_X, train_y)
    train_preds = [max(0.0, p) for p in model.predict(train_X)]
    test_preds = [max(0.0, p) for p in model.predict(test_X)]
    print(f"XGBoost (small, max_depth=3) TRAIN  -- MAE: {mae(train_y, train_preds):.2f}  WMAPE: {wmape(train_y, train_preds):.1f}%")
    print(f"XGBoost (small, max_depth=3) TEST   -- MAE: {mae(test_y, test_preds):.2f}  WMAPE: {wmape(test_y, test_preds):.1f}%")

    print()
    print("This experiment does NOT save a model file -- it's a comparison only.")
    print("models/demand_forecast_model_v2.pkl, demand_history.csv, forecasting.py were NOT touched.")


if __name__ == "__main__":
    main()
