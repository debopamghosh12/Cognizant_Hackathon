from typing import Optional
from pydantic import BaseModel


class RequisitionIn(BaseModel):
    requisition_id: Optional[int] = None
    sku_id: str
    quantity: int
    destination_dc: str
    urgency: str = "MEDIUM"
    source: str


class SupplierIn(BaseModel):
    supplier_id: str
    sku_id: str
    unit_price: float
    minimum_order_quantity: int
    lead_time_days: int
    max_capacity_units_per_month: int
    current_utilization_pct: float
    gmp_certified: bool
    defect_rate_pct: float
    category: str


class GeneratePORequest(BaseModel):
    requisition: RequisitionIn
    supplier: SupplierIn


class POResponse(BaseModel):
    po_id: str
    item_name: str
    quantity_ordered: int
    price_per_unit: float
    total_budget: float
    status: str
    supplier_id: str
    sku_id: str
    requisition_id: Optional[int] = None
    lead_time_days: int
    destination_dc: str
    created_at: str


class GoodsReceiptResponse(BaseModel):
    gr_id: str
    po_id: str
    quantity_received: float
    status: str
    quantity_ordered: float
    variance_applied: bool
    variance_pct: float
