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