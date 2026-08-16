from fastapi import FastAPI, HTTPException

from . import database, replenishment
from .schemas import ReplenishmentNeed, TransferRequest

app = FastAPI(title="Demand Sensing")


@app.on_event("startup")
def on_startup():
    database.init_db()


@app.get("/replenishment-needs", response_model=list[ReplenishmentNeed])
def list_replenishment_needs():
    return replenishment.compute_replenishment_needs()


@app.post("/transfer")
def initiate_transfer(body: TransferRequest):
    """Simulated inter-DC transfer only -- mutates synthetic inventory and
    returns the updated need for that SKU/DC (if any remains). Never
    touches requisitions/purchase_orders/goods_receipts; this is the
    alternative to sourcing from a supplier, not a step toward it."""
    try:
        database.apply_transfer(body.sku_id, body.from_dc, body.to_dc, body.quantity, body.batch_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    remaining_need = next(
        (n for n in replenishment.compute_replenishment_needs() if n["id"] == f"{body.sku_id}|{body.to_dc}"),
        None,
    )
    return {"status": "transferred", "remaining_need": remaining_need}


@app.get("/transfer-count")
def get_transfer_count():
    return {"count": database.count_transfer_events()}
