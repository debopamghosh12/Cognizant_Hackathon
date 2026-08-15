# Supplier Selection Model

**Status: a working, demonstrated ML capability — not wired into the live
demo pipeline.** The live PO-generation path (`po_generation/generator.py`)
uses rule-based hard filters against `data/suppliers.csv`, not this model.
See "Why it isn't wired in" below before connecting the two.

## Files

| File | Role |
|---|---|
| `supplier_selection_model.pkl` | The trained classifier (~9.2MB). Loading it requires `xgboost` — attempting to unpickle without that package installed fails with `No module named 'xgboost'`, which is how this was confirmed; it is an XGBoost-based model. |
| `preprocessor.pkl` | A scikit-learn preprocessing pipeline applied to the raw order features before they reach the model — partial introspection surfaced `OneHotEncoder` and `StandardScaler` components (scikit-learn 1.6.1; this environment has 1.7.2, which triggers `InconsistentVersionWarning` on load). |
| `supplier_encoder.pkl` | Encodes/decodes the 18 named suppliers (see below) the model was trained to choose between. |

No training script is checked into the repo, so the exact hyperparameters
and training procedure aren't reproducible from source — only the artifacts
themselves are available.

## What it was trained on

`data/procurement_supplier_selection_v2.csv` — 5,000 historical **orders**,
one row per order:

```
order_id, medicine_type, order_quantity, urgency_level, unit_quote_price_usd,
lead_time_days, supplier_reliability, on_time_delivery_rate, defect_rate_pct,
cold_chain_compliance_pct, selected_supplier
```

`selected_supplier` is the training target: one of 18 named companies
(`OmniHealth Labs`, `Apex BioPharma`, `Beacon Pharmaceuticals`, `Bharat
BioLogics`, `BioMatrix International`, `CryoSafe LifeSciences`, `GlobalRx
Supply Chain`, `MediCore Labs`, `NovaCure Therapeutics`, `PharmaTrust
Global`, `Pulse Generic Pharma`, `Quantum Health Sciences`, `Serum Horizon
Global`, `Summit BioSolutions`, `Vanguard Pharma`, `VitalCare
Pharmaceuticals`, `Zenith LifeSciences`, and others). Given an order's
features, the model predicts which of these 18 suppliers would have been
selected.

## Why it isn't wired into the live pipeline

The live demo's supplier catalog, `data/suppliers.csv`, is a **different
schema on a different entity model** — not just differently named columns,
but a different grain and a different supplier universe:

| | Training data (`procurement_supplier_selection_v2.csv`) | Live catalog (`data/suppliers.csv`) |
|---|---|---|
| Row = one | historical order | supplier × SKU pair |
| Product field | `medicine_type` (10 free-text drug classes, e.g. "Vaccine", "Insulin") | `sku_id` (`SKU-API-001`, etc.) — no `medicine_type` field exists |
| Supplier identity | `selected_supplier` — 18 named companies | `supplier_id` (`SUP-001`..`SUP-120`) + `supplier_name` — 120 generated companies |
| Overlap | | **None of the 18 training-data supplier names appear in `suppliers.csv`, and vice versa.** |

Because `supplier_encoder.pkl`'s label space is those 18 names, the model
can only ever predict a supplier that doesn't exist in the live catalog.
Connecting it today would require either:

1. Retraining on `data/suppliers.csv`'s schema (`sku_id` in place of
   `medicine_type`, `supplier_id` as the encoded label space, 120 classes
   instead of 18), or
2. Building a mapping between the two supplier universes — not attempted,
   since the 18 named suppliers have no known correspondence to any of the
   120 generated `SUP-*` entities.

Until one of those happens, this model is a demonstrated capability (proof
that a classifier can be trained to predict supplier choice from order
features) rather than a component of the working PO-generation flow. The
live flow's supplier ranking is the rule-based hard-filter logic in
`po_generation/generator.py` plus `suitability_score` in `data/
suppliers.csv`, documented in `docs/SCHEMA.md`.
