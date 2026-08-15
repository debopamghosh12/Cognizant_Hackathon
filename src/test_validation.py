from extract import extract_invoice_data
from validate import has_missing_fields, three_way_match

# Simulated PO/GR records (stand-ins for B1's and B3's real data, until Day 2 merge)
test_po_record = {
    "item_name": "Paracetamol 500mg",
    "quantity_ordered": 6000,
    "price_per_unit": 210,
    "total_budget": 1260000,
}

test_gr_record = {
    "quantity_received": 6100,
}

image_path = "../data/sample_invoices/sample6.jpeg"  # change per test run

extracted_data = extract_invoice_data(image_path)
extracted_data["item_name"] = test_po_record["item_name"]  # pulled from PO, not OCR

print("\n--- Extracted Invoice Data (with item_name from PO) ---")
print(extracted_data)

if has_missing_fields(extracted_data):
    print("\nResult: FLAGGED — missing or illegible fields detected.")
else:
    match_status, issues = three_way_match(extracted_data, test_po_record, test_gr_record)
    print(f"\n--- 3-Way Match Result ---")
    print(f"Status: {match_status}")
    if issues:
        print("Issues found:")
        for issue in issues:
            print(f"  - {issue}")


# --- Synthetic-invoice generator sanity checks (po_generation/generator.py::
# generate_synthetic_invoice) -- confirms in-tolerance jitter always lands
# "Approved" and out-of-tolerance jitter always lands "Flagged_For_Review",
# via the same three_way_match() the live /generate-invoice endpoint calls.
_gen_po_record = {"po_id": "PO-TEST", "item_name": "Paracetamol 500mg", "quantity_ordered": 600, "price_per_unit": 0.072}
_gen_gr_record = {"gr_id": "GR-TEST", "po_id": "PO-TEST", "quantity_received": 600}

_in_tolerance_invoice = {
    "quantity_ordered": 601,       # +0.17%, well inside MATCH_TOLERANCE_PERCENT (2%)
    "quantity_received": 600,
    "total_amount": round(_gen_po_record["price_per_unit"] * 600 * 1.01, 2),  # +1%
}
_out_of_tolerance_invoice = {
    "quantity_ordered": 660,       # +10%, clear of the 2% tolerance
    "quantity_received": 600,
    "total_amount": round(_gen_po_record["price_per_unit"] * 600 * 1.10, 2),  # +10%
}

_status_in, _ = three_way_match(_in_tolerance_invoice, _gen_po_record, _gen_gr_record)
_status_out, _issues_out = three_way_match(_out_of_tolerance_invoice, _gen_po_record, _gen_gr_record)

assert _status_in == "Approved", f"expected in-tolerance invoice to be Approved, got {_status_in}"
assert _status_out == "Flagged_For_Review", f"expected out-of-tolerance invoice to be Flagged_For_Review, got {_status_out}"
assert _issues_out, "expected issues to be populated for a flagged match"

print("\n--- Synthetic-invoice tolerance checks ---")
print(f"In-tolerance invoice -> {_status_in} (expected Approved)")
print(f"Out-of-tolerance invoice -> {_status_out} (expected Flagged_For_Review): {_issues_out}")