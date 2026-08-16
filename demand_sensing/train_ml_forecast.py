"""
Run once to train and save models/demand_forecast_model_v2.pkl -- a small,
from-scratch ML forecaster trained on our own real demand_history.csv (plus
promotional_calendar.csv and distributor_orders.csv for two of the
features). Does NOT touch or reuse models/demand_forecast_model.pkl.

Honest framing before you trust these numbers: 1,350 rows across 15 SKU x
DC series, 90 days each. After dropping the first ML_LAG_DAYS max (30) days
per series (needed to compute lag_30/roll_*_28), and holding out the last
ML_TEST_DAYS_PER_SERIES (14) days per series as a time-based test set (not
a random split -- this is a forecasting problem, random splitting would
leak future values into training), usable data is thin. Printed metrics
include a naive "yesterday's value" baseline specifically so you can judge
whether the trained model is actually adding anything over doing nothing.

Run: python -m demand_sensing.train_ml_forecast (from the repo root -- this
needs to run as a package, not a loose script, since ml_forecast.py also
gets imported by demand_sensing/main.py and uses relative imports for that).
"""
import json
import os
import pickle
import statistics
from datetime import datetime, timezone

from .config import ML_LAG_DAYS, ML_TEST_DAYS_PER_SERIES, ML_MODEL_PATH, ML_METRICS_PATH
from . import ml_forecast as mlf


def wmape(actuals: list[float], preds: list[float]) -> float:
    total_actual = sum(actuals)
    if total_actual == 0:
        return 0.0
    return sum(abs(a - p) for a, p in zip(actuals, preds)) / total_actual * 100


def mae(actuals: list[float], preds: list[float]) -> float:
    return statistics.fmean(abs(a - p) for a, p in zip(actuals, preds))


def build_dataset():
    series_data = mlf.load_demand_series()
    promo_calendar = mlf.load_promo_calendar()
    distributor_orders = mlf.load_distributor_orders()
    max_lag = max(ML_LAG_DAYS)

    train_X, train_y, test_X, test_y = [], [], [], []
    naive_test_actuals, naive_test_preds = [], []

    for (sku_id, dc), series in series_data.items():
        dates = [d for d, _ in series]
        values = [v for _, v in series]
        n = len(values)
        valid_indices = list(range(max_lag, n))  # need >= max_lag prior days
        test_indices = set(valid_indices[-ML_TEST_DAYS_PER_SERIES:])

        for i in valid_indices:
            target_date = dates[i]
            values_before = values[:i]
            row = mlf.build_feature_row(sku_id, target_date, values_before, dates, promo_calendar, distributor_orders)
            target = values[i]

            if i in test_indices:
                test_X.append(row)
                test_y.append(target)
                naive_test_actuals.append(target)
                naive_test_preds.append(values_before[-1])  # naive: yesterday's value
            else:
                train_X.append(row)
                train_y.append(target)

    return train_X, train_y, test_X, test_y, naive_test_actuals, naive_test_preds


def main():
    train_X, train_y, test_X, test_y, naive_actuals, naive_preds = build_dataset()

    print(f"Train rows: {len(train_X)}  |  Test rows: {len(test_X)}  |  Features: {len(mlf.FEATURE_NAMES)}")
    print(f"Features: {mlf.FEATURE_NAMES}")
    print()

    # Naive baseline: "tomorrow = today" -- the single most important
    # honesty check. If the trained model can't beat this, it isn't adding
    # real value over doing nothing.
    naive_mae = mae(naive_actuals, naive_preds)
    naive_wmape = wmape(naive_actuals, naive_preds)
    print(f"Naive baseline (yesterday's value) -- MAE: {naive_mae:.2f}  WMAPE: {naive_wmape:.1f}%")

    from sklearn.linear_model import LinearRegression
    lr = LinearRegression()
    lr.fit(train_X, train_y)
    lr_preds = [max(0.0, p) for p in lr.predict(test_X)]
    lr_mae = mae(test_y, lr_preds)
    lr_wmape = wmape(test_y, lr_preds)
    print(f"Linear Regression (baseline model)  -- MAE: {lr_mae:.2f}  WMAPE: {lr_wmape:.1f}%")

    from xgboost import XGBRegressor
    model = XGBRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8, random_state=42,
    )
    model.fit(train_X, train_y)
    xgb_preds = [max(0.0, p) for p in model.predict(test_X)]
    xgb_mae = mae(test_y, xgb_preds)
    xgb_wmape = wmape(test_y, xgb_preds)
    print(f"XGBoost (small, max_depth=3)        -- MAE: {xgb_mae:.2f}  WMAPE: {xgb_wmape:.1f}%")

    os.makedirs(os.path.dirname(ML_MODEL_PATH), exist_ok=True)
    with open(ML_MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    # Real, measured numbers only -- whatever this run actually produced,
    # including the honest "beats_naive" bool. Never hand-edit this file;
    # it's meant to always reflect the last real training run.
    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "train_rows": len(train_X),
        "test_rows": len(test_X),
        "naive_mae": round(float(naive_mae), 2),
        "naive_wmape_pct": round(float(naive_wmape), 1),
        "linear_regression_mae": round(float(lr_mae), 2),
        "linear_regression_wmape_pct": round(float(lr_wmape), 1),
        "xgboost_mae": round(float(xgb_mae), 2),
        "xgboost_wmape_pct": round(float(xgb_wmape), 1),
        "xgboost_beats_naive": bool(xgb_wmape < naive_wmape),
    }
    with open(ML_METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print()
    print(f"Saved XGBoost model to {ML_MODEL_PATH}")
    print(f"Saved metrics to {ML_METRICS_PATH}")
    print(f"models/demand_forecast_model.pkl was NOT touched.")


if __name__ == "__main__":
    main()
