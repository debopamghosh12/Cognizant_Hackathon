import os
import uuid
from database import get_connection, init_db, insert_dummy_po_and_gr
from extract import extract_invoice_data
from validate import has_missing_fields, three_way_match
from generate_invoice import generate_printable_invoice
from config import SAMPLE_INVOICE_DIR

def get_po_and_gr(po_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT quantity_ordered, price_per_unit, total_budget FROM purchase_orders WHERE po_id=?", (po_id,))
    po_row = cur.fetchone()
    cur.execute("SELECT quantity_received FROM goods_receipts WHERE po_id=?", (po_id,))
    gr_row = cur.fetchone()
    conn.close()

    po_record = {"quantity_ordered": po_row[0], "price_per_unit": po_row[1], "total_budget": po_row[2]}
    gr_record = {"quantity_received": gr_row[0]}
    return po_record, gr_record

def save_invoice_record(invoice_id, po_id, extracted_data, extraction_status, match_status, printable_path):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO invoices (invoice_id, po_id, item_name, quantity_ordered, quantity_received,
                               price_per_unit, total_amount, extraction_status, match_status, printable_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (invoice_id, po_id, extracted_data.get("item_name"), extracted_data.get("quantity_ordered"),
          extracted_data.get("quantity_received"), extracted_data.get("price_per_unit"),
          extracted_data.get("total_amount"), extraction_status, match_status, printable_path))
    conn.commit()
    conn.close()

def process_invoice(image_path, po_id):
    invoice_id = f"INV-{uuid.uuid4().hex[:8].upper()}"
    print(f"\nProcessing {image_path} -> {invoice_id}")

    extracted_data = extract_invoice_data(image_path)
    if extracted_data is None:
        print("Extraction failed completely — flagging for manual review.")
        save_invoice_record(invoice_id, po_id, {}, "Failed", "Flagged_For_Review", None)
        return

    if has_missing_fields(extracted_data):
        print("Missing/illegible fields detected — flagging for manual review.")
        save_invoice_record(invoice_id, po_id, extracted_data, "Incomplete", "Flagged_For_Review", None)
        return

    po_record, gr_record = get_po_and_gr(po_id)
    match_status, issues = three_way_match(extracted_data, po_record, gr_record)

    if match_status == "Flagged_For_Review":
        print(f"3-way match failed: {issues}")
        save_invoice_record(invoice_id, po_id, extracted_data, "Extracted", match_status, None)
        return

    printable_path = generate_printable_invoice(invoice_id, extracted_data)
    print(f"Match approved. Printable invoice generated at {printable_path}")
    save_invoice_record(invoice_id, po_id, extracted_data, "Extracted", match_status, printable_path)

if __name__ == "__main__":
    init_db()
    insert_dummy_po_and_gr()   # remove once merged with B1/B3's real PO/GR data

    for filename in os.listdir(SAMPLE_INVOICE_DIR):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            process_invoice(os.path.join(SAMPLE_INVOICE_DIR, filename), po_id="PO001")