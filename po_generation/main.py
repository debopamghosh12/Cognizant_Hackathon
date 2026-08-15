import os
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import database  # src/database.py — purchase_orders table lives here
from fastapi import FastAPI, HTTPException

from .generator import generate_po, simulate_delivery
from .schemas import GeneratePORequest, POResponse, GoodsReceiptResponse

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
    return database.list_purchase_orders()


@app.post("/simulate-delivery/{po_id}", response_model=GoodsReceiptResponse, status_code=201)
def simulate_delivery_endpoint(po_id: str):
    po = database.get_purchase_order(po_id)
    if po is None:
        raise HTTPException(status_code=404, detail=f"purchase order '{po_id}' not found")

    gr = simulate_delivery(po_id, po["quantity_ordered"])
    database.insert_goods_receipt(gr)
    return gr
