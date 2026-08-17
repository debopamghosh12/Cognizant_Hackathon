from typing import Literal, Optional
from pydantic import BaseModel, Field


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


class SimulateDeliveryRequest(BaseModel):
    quantity_received: Optional[float] = Field(default=None, ge=0)


class GoodsReceiptResponse(BaseModel):
    gr_id: str
    po_id: str
    quantity_received: float
    status: str
    quantity_ordered: float
    variance_applied: bool
    variance_pct: float


class InvoiceDecisionRequest(BaseModel):
    action: Literal["approve", "reject", "escalate", "approve_for_payment"]


class OCRInvoiceRequest(BaseModel):
    # User-confirmed fields from the Upload Invoice review step -- never
    # auto-trusted the way generate_synthetic_invoice()'s jittered numbers
    # are, hence no defaults here; the review step's "Confirm & Match"
    # action is what fills these in, real OCR values or manual corrections.
    quantity_ordered: float
    quantity_received: float
    price_per_unit: float
    total_amount: float


class InvoiceResponse(BaseModel):
    invoice_id: str
    po_id: str
    gr_id: Optional[str] = None
    # item_name and the numeric fields can be NULL on rows produced by the
    # legacy OCR pipeline (src/main.py) when extraction was Incomplete/
    # Failed -- this endpoint serves any existing invoice, not just ones
    # generate_synthetic_invoice() creates, so it must tolerate that shape.
    item_name: Optional[str] = None
    quantity_ordered: Optional[float] = None
    quantity_received: Optional[float] = None
    price_per_unit: Optional[float] = None
    total_amount: Optional[float] = None
    extraction_status: str
    match_status: str
    printable_path: Optional[str] = None
    is_predictive_anomaly: bool = False
    predictive_anomaly_reason: Optional[str] = None
