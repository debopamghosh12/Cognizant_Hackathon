import os
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import database  # src/database.py — purchase_orders table lives here
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from .generator import generate_po, generate_synthetic_invoice, build_invoice_from_ocr, build_match_rows
from . import predictive
from .schemas import (
    GeneratePORequest, POResponse, GoodsReceiptResponse, SimulateDeliveryRequest,
    InvoiceResponse, InvoiceDecisionRequest, OCRInvoiceRequest,
)

app = FastAPI(title="PO Generation")


@app.on_event("startup")
def on_startup():
    database.init_db()


@app.post("/generate-po", response_model=POResponse, status_code=201)
def generate_po_endpoint(body: GeneratePORequest):
    try:
        po = generate_po(body.requisition.model_dump(), body.supplier.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    database.insert_purchase_order(po)
    return po


@app.get("/purchase-orders")
def list_purchase_orders_endpoint():
    pos = database.list_purchase_orders()
    for po in pos:
        po["goods_receipt"] = database.get_goods_receipt_by_po(po["po_id"])
    return pos


@app.post("/simulate-delivery/{po_id}", response_model=GoodsReceiptResponse, status_code=201)
def simulate_delivery_endpoint(po_id: str, body: SimulateDeliveryRequest = SimulateDeliveryRequest()):
    # body.quantity_received is this delivery's increment (not a running
    # total) -- omitting it delivers everything still outstanding.
    try:
        return database.record_delivery(po_id, body.quantity_received)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/purchase-orders/{po_id}/send", response_model=POResponse)
def send_purchase_order_endpoint(po_id: str):
    po = database.get_purchase_order(po_id)
    if po is None:
        raise HTTPException(status_code=404, detail=f"purchase order '{po_id}' not found")

    database.update_po_status(po_id, "Sent")
    return database.get_purchase_order(po_id)


@app.post("/purchase-orders/{po_id}/generate-invoice", response_model=InvoiceResponse, status_code=201)
def generate_invoice_endpoint(po_id: str):
    po = database.get_purchase_order(po_id)
    if po is None:
        raise HTTPException(status_code=404, detail=f"purchase order '{po_id}' not found")

    if database.get_invoice_by_po(po_id) is not None:
        raise HTTPException(status_code=409, detail=f"an invoice already exists for purchase order '{po_id}'")

    gr = database.get_goods_receipt_by_po(po_id)
    if gr is None:
        raise HTTPException(status_code=400, detail=f"purchase order '{po_id}' has no goods receipt yet")

    invoice = generate_synthetic_invoice(po, gr)
    anomaly = predictive.compute_invoice_anomaly(invoice, po["supplier_id"])
    invoice["is_predictive_anomaly"] = anomaly["is_predictive_anomaly"]
    invoice["predictive_anomaly_reason"] = anomaly["predictive_anomaly_reason"]
    database.insert_invoice(invoice)
    return invoice


@app.post("/purchase-orders/{po_id}/submit-ocr-invoice", response_model=InvoiceResponse, status_code=201)
def submit_ocr_invoice_endpoint(po_id: str, body: OCRInvoiceRequest):
    # Mirrors generate_invoice_endpoint's exact guard/flow above -- only
    # build_invoice_from_ocr() differs (user-confirmed OCR numbers instead
    # of jittered synthetic ones); three_way_match, the anomaly check, and
    # persistence are the identical calls, not reimplemented.
    po = database.get_purchase_order(po_id)
    if po is None:
        raise HTTPException(status_code=404, detail=f"purchase order '{po_id}' not found")

    if database.get_invoice_by_po(po_id) is not None:
        raise HTTPException(status_code=409, detail=f"an invoice already exists for purchase order '{po_id}'")

    gr = database.get_goods_receipt_by_po(po_id)
    if gr is None:
        raise HTTPException(status_code=400, detail=f"purchase order '{po_id}' has no goods receipt yet")

    invoice = build_invoice_from_ocr(po, gr, body.model_dump())
    anomaly = predictive.compute_invoice_anomaly(invoice, po["supplier_id"])
    invoice["is_predictive_anomaly"] = anomaly["is_predictive_anomaly"]
    invoice["predictive_anomaly_reason"] = anomaly["predictive_anomaly_reason"]
    database.insert_invoice(invoice)
    return invoice


@app.patch("/invoices/{invoice_id}/decision", response_model=InvoiceResponse)
def invoice_decision_endpoint(invoice_id: str, body: InvoiceDecisionRequest):
    invoice = database.get_invoice(invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail=f"invoice '{invoice_id}' not found")

    decision_map = {
        "approve": ("Approved_Manual", None),
        "reject": ("Rejected", "Cancelled"),
        "escalate": ("Escalated", None),
    }
    match_status, po_status = decision_map[body.action]
    return database.update_invoice_decision(invoice_id, match_status, po_status)


@app.get("/matches")
def list_matches_endpoint():
    results = []
    for invoice in database.list_invoices():
        po = database.get_purchase_order(invoice["po_id"])
        if po is None:
            continue  # shouldn't happen (po_id is a real FK), but don't 500 on stale data

        gr = None
        if invoice.get("gr_id"):
            gr = database.get_goods_receipt(invoice["gr_id"])
        if gr is None:
            gr = database.get_goods_receipt_by_po(invoice["po_id"])  # fallback for pre-fix rows

        results.append({
            "invoice_id": invoice["invoice_id"],
            "po_id": invoice["po_id"],
            "gr_id": gr["gr_id"] if gr else None,
            "match_status": invoice["match_status"],
            "extraction_status": invoice["extraction_status"],
            "rows": build_match_rows(invoice, po, gr),
            "is_predictive_anomaly": invoice.get("is_predictive_anomaly"),
            "predictive_anomaly_reason": invoice.get("predictive_anomaly_reason"),
        })
    return results


@app.get("/invoices")
def list_invoices_endpoint():
    invoices = database.list_invoices()
    for invoice in invoices:
        po = database.get_purchase_order(invoice["po_id"])
        invoice["supplier_id"] = po["supplier_id"] if po else None
    return invoices


@app.get("/invoices/{invoice_id}/pdf")
def get_invoice_pdf_endpoint(invoice_id: str):
    invoice = database.get_invoice(invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail=f"invoice '{invoice_id}' not found")

    path = invoice.get("printable_path")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"no printable PDF available for '{invoice_id}'")

    return FileResponse(path, media_type="application/pdf", filename=f"{invoice_id}.pdf")
