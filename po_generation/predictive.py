"""
Predictive Anomaly Detection -- rule-based, forward-looking risk signals.

Deliberately kept separate from generator.py (PO/invoice/delivery
generation) and src/validate.py (the REACTIVE 3-way-match tolerance check
against a fixed global +/-2%). Everything in this module compares a new
invoice against a specific supplier's own historical pattern instead --
that's the "predictive" property: it only ever looks at data that existed
before the invoice being evaluated.
"""
import os
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import database  # src/database.py

# A new invoice is flagged when its own deviation exceeds double this
# supplier's historical average -- with a floor, so a supplier whose past
# invoices happened to be near-perfect doesn't get a trivial 0.5% wobble
# flagged as "2x their average".
ANOMALY_MULTIPLIER = 2.0
ANOMALY_MIN_ABSOLUTE_PCT = 3.0


def _invoice_variance_pct(invoice: dict) -> float:
    """How far this invoice's total_amount sits from what price_per_unit *
    quantity_received would predict, as a percentage. Same "expected total"
    formula src/validate.py::three_way_match() already reconciles against,
    reused here as the single scalar deviation measure for history."""
    expected_total = invoice["price_per_unit"] * invoice["quantity_received"]
    if expected_total == 0:
        return 0.0
    return abs(invoice["total_amount"] - expected_total) / expected_total * 100


def compute_invoice_anomaly(invoice: dict, supplier_id: str) -> dict:
    """Returns {is_predictive_anomaly, predictive_anomaly_reason,
    supplier_historical_avg_variance_pct}. Only ever looks at invoices
    that already existed for this supplier before `invoice` -- call this
    before persisting `invoice` itself."""
    prior_invoices = database.list_invoices_by_supplier(supplier_id)
    # Incomplete/Failed-extraction invoices (e.g. src/main.py's legacy OCR
    # pipeline, or a deliberately-incomplete demo row) have no real
    # price_per_unit/quantity_received/total_amount -- nothing to compute a
    # variance from, so they're excluded from history rather than crashing
    # on None * None.
    prior_invoices = [
        inv for inv in prior_invoices
        if inv.get("price_per_unit") is not None
        and inv.get("quantity_received") is not None
        and inv.get("total_amount") is not None
    ]

    if not prior_invoices:
        return {
            "is_predictive_anomaly": False,
            "predictive_anomaly_reason": None,
            "supplier_historical_avg_variance_pct": None,
        }

    historical_variances = [_invoice_variance_pct(inv) for inv in prior_invoices]
    historical_avg = sum(historical_variances) / len(historical_variances)
    this_variance = _invoice_variance_pct(invoice)
    threshold = max(historical_avg * ANOMALY_MULTIPLIER, ANOMALY_MIN_ABSOLUTE_PCT)
    is_anomaly = this_variance > threshold

    reason = None
    if is_anomaly:
        reason = (
            f"Amount deviates {this_variance:.1f}% from expected vs. this supplier's "
            f"historical average of {historical_avg:.1f}% across {len(prior_invoices)} invoice(s)."
        )

    return {
        "is_predictive_anomaly": is_anomaly,
        "predictive_anomaly_reason": reason,
        "supplier_historical_avg_variance_pct": round(historical_avg, 2),
    }
