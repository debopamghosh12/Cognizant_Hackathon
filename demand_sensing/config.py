import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BASE_DIR, "data", "demand_sensing.db")
DEMAND_HISTORY_CSV = os.path.join(BASE_DIR, "data", "demand_sensing", "demand_history.csv")
SUPPLIERS_CSV = os.path.join(BASE_DIR, "data", "suppliers.csv")

# Scoped deliberately to the 5 finished-product SKUs that already have real
# supplier coverage in data/suppliers.csv (and exist in the chatbot's own
# `sku` table) -- anything a Replenishment Need proposes must be able to
# resolve through the existing, live AI Sourcing step, not dead-end there.
SKUS = {
    "SKU-1001": "Paracetamol 500mg",
    "SKU-1002": "Amoxicillin 250mg",
    "SKU-1003": "Ibuprofen 400mg",
    "SKU-1007": "ORS Sachets",
    "SKU-1010": "N95 Masks (box of 50)",
}

# Reused verbatim -- these exact strings already appear as real
# destination_dc values in chatbot/requisitions.db's requisition history,
# and there is no canonical DC table anywhere in the repo to join against.
DESTINATION_DCS = ["Pune DC", "Chennai DC", "Siliguri DC"]

# SKUs that get a deliberate historical demand spike (the "flu season +60%"
# scenario from the problem statement) -- Paracetamol (fever) and N95 masks
# (respiratory) both fit the narrative.
SEASONAL_SPIKE_SKUS = {"SKU-1001", "SKU-1010"}

HISTORY_DAYS = 90
SPIKE_WINDOW_DAYS = 21          # most recent N days of history carry the spike
SPIKE_MULTIPLIER = 1.6          # +60%, matching the problem statement
SEASONAL_FORECAST_MULTIPLIER = 1.15  # small additional forward adjustment for
                                      # "flu season is still active" -- kept
                                      # modest since the 14-day moving average
                                      # below already picks up most of the
                                      # historical spike on its own; this
                                      # avoids double-counting the same effect.

SAFETY_STOCK_DAYS = 7           # simple, explainable reorder-point buffer

# Deliberately simple, flat, synthetic logistics constants -- not an
# optimization model, just enough to make a defensible cost comparison.
TRANSFER_FLAT_FEE = 50.0
TRANSFER_PER_UNIT_COST = 0.15
SUPPLIER_SHIPPING_FLAT_FEE = 100.0

NEAR_EXPIRY_MIN_DAYS = 30
NEAR_EXPIRY_MAX_DAYS = 45

# --- Feature 1: Warehouse Capacity Check ---
# data/medcare_demand_dataset.csv has a warehouse_capacity column, but its
# region IDs (Region_Metro_1, etc.) and SKU IDs (SKU_001..015) don't match
# this module's real DC names or SKU catalog at all -- reusing it would
# mean inventing a mapping that doesn't exist in the data, so this is
# fresh synthetic capacity instead, keyed to the real (sku_id, DC) pairs
# this module actually uses. Per-SKU-per-DC rather than a single per-DC
# total, since compute_replenishment_needs() compares capacity against a
# specific SKU's current_stock at that DC, not the DC's combined stock
# across all SKUs -- treat it as "shelf space reserved for this SKU at
# this DC", not the DC's total footprint.
# (SKU-1010, "Pune DC") is deliberately tight relative to its typical
# shortage size, so the capping path is exercised by the existing demo
# seed data, not just reachable in theory.
WAREHOUSE_CAPACITY_UNITS: dict[tuple[str, str], float] = {
    ("SKU-1010", "Pune DC"): 250.0,
}
DEFAULT_WAREHOUSE_CAPACITY_UNITS = 5000.0  # generous fallback for every (sku, dc) not listed above

# --- Feature 2: Distributor Order Patterns ---
# No distributor-level data exists anywhere in the repo (confirmed by
# direct investigation), so this is a fresh synthetic dataset: periodic
# bulk orders per SKU (distributors sit above the DC tier and order ahead
# of DC-level sell-through, not daily like demand_history.csv), generated
# by demand_sensing/generate_data.py alongside the existing DC-level
# series -- that function is untouched, this is an additional one.
DISTRIBUTOR_ORDERS_CSV = os.path.join(BASE_DIR, "data", "demand_sensing", "distributor_orders.csv")
DISTRIBUTOR_ORDER_INTERVAL_DAYS = 10   # a distributor places one bulk order roughly every N days
DISTRIBUTOR_ORDER_BATCH_MULTIPLIER = 1.2  # distributors order a buffer above straight sell-through
# The seasonal spike shows up in a distributor's orders this many days
# BEFORE it shows up in demand_history.csv's DC-level sell-through -- this
# lead time is what makes the signal a genuine leading indicator rather
# than a duplicate of the DC-level trend.
DISTRIBUTOR_LEAD_DAYS = 7

# forecast_demand() compares the average of the most recent N orders
# against the N before that (same recent-vs-prior technique already used
# for the DC-level trend calculation, just applied to distributor orders).
# Window=3 and a 20% threshold (vs. the DC-level trend's 10%) are
# deliberately wider than the DC-level equivalents: with only ~9 orders
# per SKU total and +/-15% noise per order, a 2-order window at a 10%
# threshold was found (during verification) to flag "Rising" from pure
# noise on non-seasonal SKUs too -- these wider values were tuned so the
# signal only fires for the genuine, deliberately-engineered distributor
# uplift, not random noise.
DISTRIBUTOR_TREND_WINDOW_ORDERS = 3
DISTRIBUTOR_TREND_THRESHOLD_PCT = 0.20
# Deliberately smaller than SEASONAL_FORECAST_MULTIPLIER (1.15) -- this is
# a softer, secondary leading-indicator nudge, not a primary signal.
DISTRIBUTOR_LEADING_INDICATOR_MULTIPLIER = 1.05

# --- Feature 3: Promotional/Seasonal Calendar ---
# Applied as an ADDITIONAL, independent adjustment on top of the existing
# flat SEASONAL_FORECAST_MULTIPLIER above, not a replacement for it --
# "instead of" would mean overriding existing behavior for
# SEASONAL_SPIKE_SKUS, which risks changing a case that doesn't opt into
# this new feature. A SKU can have both a seasonal spike AND an active
# promo at once (they stack), or neither, or just one -- each is computed
# and applied independently.
PROMOTIONAL_CALENDAR_CSV = os.path.join(BASE_DIR, "data", "demand_sensing", "promotional_calendar.csv")

# --- Feature 4: Replenishment Frequency / Cadence ---
# Lead-time-based cadence, not full EOQ -- EOQ (sqrt(2*D*S/H)) needs a
# holding cost and an ordering cost, neither of which exists anywhere in
# this data model, so using it would mean inventing two business
# parameters out of thin air. Instead: a baseline review cycle, scaled by
# how volatile the SKU's recent demand is (reusing forecast_demand()'s
# existing `confidence` output rather than recomputing volatility again),
# floored at the SKU's own average supplier lead time -- reordering faster
# than you can receive goods isn't a meaningful cadence.
REORDER_CADENCE_BASE_DAYS = 14
REORDER_CADENCE_CONFIDENCE_FACTOR = {"High": 1.0, "Medium": 0.75, "Low": 0.5}

# --- Feature 5: Review Cadence / Escalation Process ---
# Lightweight timestamp-based approximation, not real-time tracking
# infrastructure (per the brief) -- the first time a SKU/DC is observed at
# Critical urgency, that moment is persisted in demand_sensing.db; if it's
# still Critical more than ESCALATION_THRESHOLD_HOURS after that first
# observation, it's flagged escalated. The clock resets (tracking row
# cleared) the instant urgency drops below Critical, so this measures
# continuous time-at-Critical, not cumulative/lifetime time.
ESCALATION_THRESHOLD_HOURS = 24
ESCALATION_TARGET = "Procurement Lead"

# --- Exploratory ML forecast (forecast_demand_ml(), demand_sensing/ml_forecast.py) ---
# An ADDITIONAL, optional forecast source -- forecast_demand() above (the
# real default every existing feature uses) is untouched by this. Trained
# from scratch on our own real demand_history.csv -- NOT a reuse/fix of
# models/demand_forecast_model.pkl, which is confirmed incompatible (wrong
# SKU/DC categories, wrong capacity scale, trained on a different dataset).
# Saved separately as models/demand_forecast_model_v2.pkl so the orphaned
# original is never touched.
ML_MODEL_PATH = os.path.join(BASE_DIR, "models", "demand_forecast_model_v2.pkl")
# Real, measured metrics from the last training run (MAE/WMAPE on the
# held-out test set, plus the naive baseline they were compared against) --
# saved alongside the model so anything that displays "accuracy" reads the
# actual last-measured numbers instead of a hardcoded claim that could
# drift out of sync with the model file.
ML_METRICS_PATH = os.path.join(BASE_DIR, "models", "demand_forecast_model_v2_metrics.json")
ML_LAG_DAYS = [1, 7, 14, 30]
ML_ROLLING_WINDOWS = [7, 14, 28]
# Same recent-vs-prior order count as DISTRIBUTOR_TREND_WINDOW_ORDERS above,
# kept as its own constant since the ML feature is a differently-encoded
# (numeric -1/0/1) version, not a call into forecasting.py.
ML_DISTRIBUTOR_TREND_ORDERS = 3
ML_TEST_DAYS_PER_SERIES = 14  # held-out test window per SKU/DC series, time-based split

# --- Extended-history experiment (demand_history_extended.csv) ---
# Entirely separate from the live 90-day DEMAND_HISTORY_CSV above -- a
# standalone experiment to test whether more synthetic history improves
# forecast_demand_ml()'s real held-out accuracy. Never read by
# forecasting.py, replenishment.py, ml_forecast.py, or any live endpoint.
DEMAND_HISTORY_EXTENDED_CSV = os.path.join(BASE_DIR, "data", "demand_sensing", "demand_history_extended.csv")
EXTENDED_HISTORY_DAYS = 730
# Flu season recurs every year in this window (unlike the live 90-day
# file's one-time "last 21 days" spike) -- December-January, a real,
# recognizable annual pattern, not an arbitrary window.
EXTENDED_FLU_SEASON_MONTHS = {12, 1}
