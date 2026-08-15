from config import MATCH_TOLERANCE_PERCENT


def has_missing_fields(extracted_data):
    # item_name is intentionally excluded — populated from the linked PO record, not OCR.
    required_fields = ["quantity_ordered", "quantity_received", "price_per_unit", "total_amount"]
    return any(extracted_data.get(f) is None for f in required_fields)


def within_tolerance(value_a, value_b, tolerance_percent=MATCH_TOLERANCE_PERCENT):
    if value_a == 0:
        return value_b == 0
    diff_percent = abs(value_a - value_b) / value_a * 100
    return diff_percent <= tolerance_percent


def three_way_match(extracted_data, po_record, gr_record):
    issues = []

    if not within_tolerance(po_record["quantity_ordered"], extracted_data["quantity_ordered"]):
        issues.append("Invoice quantity ordered does not match PO.")

    if not within_tolerance(gr_record["quantity_received"], extracted_data["quantity_received"]):
        issues.append("Invoice quantity received does not match GR.")

    expected_total = po_record["price_per_unit"] * extracted_data["quantity_received"]
    if not within_tolerance(expected_total, extracted_data["total_amount"]):
        issues.append("Invoice total amount does not reconcile with price x quantity received.")

    # Strict excess check, not within_tolerance() -- a normal in-progress
    # partial delivery (received < ordered) must never trip this.
    if gr_record["quantity_received"] > po_record["quantity_ordered"]:
        issues.append("Goods receipt quantity received exceeds PO quantity ordered (over-delivery).")

    if issues:
        return "Flagged_For_Review", issues
    return "Approved", []