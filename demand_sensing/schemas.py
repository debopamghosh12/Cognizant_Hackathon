from typing import Optional
from pydantic import BaseModel, Field


class TransferOption(BaseModel):
    batch_id: str
    from_dc: str
    quantity: float
    days_to_expiry: int
    transfer_cost: float
    supplier_cost: float


class ReplenishmentNeed(BaseModel):
    id: str
    sku_id: str
    sku_name: str
    destination_dc: str
    current_stock: float
    daily_forecast: float
    trend: str
    confidence: str
    reorder_point: float
    recommended_qty: int
    urgency: str
    reason: str
    transfer: Optional[TransferOption] = None
    capped_by_capacity: bool = False
    distributor_signal: str = "No Data"
    promo_active: bool = False
    promo_lift_pct: float = 0.0
    recommended_reorder_frequency_days: int = 0
    escalated: bool = False
    escalation_target: Optional[str] = None


class TransferRequest(BaseModel):
    sku_id: str
    from_dc: str
    to_dc: str
    quantity: float = Field(gt=0)
    batch_id: str
