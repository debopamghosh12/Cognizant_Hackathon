import os
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import database  # src/database.py — purchase_orders table lives here
from fastapi import FastAPI, HTTPException

from .generator import generate_po
from .schemas import GeneratePORequest, POResponse

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
