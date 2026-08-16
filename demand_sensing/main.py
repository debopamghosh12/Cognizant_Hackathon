from fastapi import FastAPI, HTTPException

from . import database, replenishment, ml_forecast
from .forecasting import forecast_demand
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


@app.get("/replenishment-needs-ml-comparison")
def compare_forecasts(sku_id: str, destination_dc: str):
    """Opt-in comparison only -- does NOT touch /replenishment-needs or
    anything it depends on. Returns the real rule-based forecast_demand()
    output side by side with the optional forecast_demand_ml() output for
    one SKU/DC, plus the ML model's real last-measured accuracy (never
    hardcoded -- always whatever train_ml_forecast.py actually produced).
    Not wired into replenishment.py or the default /replenishment-needs
    response; the frontend calls this only when a user explicitly opts in
    to viewing it for a specific card."""
    rule_based = forecast_demand(sku_id, destination_dc)
    ml = ml_forecast.forecast_demand_ml(sku_id, destination_dc)
    return {
        "sku_id": sku_id,
        "destination_dc": destination_dc,
        "rule_based": rule_based,
        "ml": ml,
        "ml_metrics": ml_forecast.get_model_metrics(),
    }
