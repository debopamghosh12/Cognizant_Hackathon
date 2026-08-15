import type { Requisition, RequisitionStatus, Supplier, PurchaseOrder, POStatus, MatchRow, Delivery, DeliveryStatus, InvoiceRecord, InvoiceStatus } from "@/lib/data";

interface RawRequisition {
  id: number;
  sku_id: string;
  sku_name: string | null;
  quantity: number;
  destination_dc: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: "AUTO_P1" | "MANUAL_CHATBOT";
  status: "PENDING" | "VALIDATED" | "FLAGGED" | "REJECTED";
  raw_input: string | null;
  assumed_fields: string;
  created_at: string;
}

const REQUISITION_STATUS_MAP: Record<string, RequisitionStatus> = {
  PENDING: "PENDING",
  VALIDATED: "APPROVED",
  FLAGGED: "PENDING",
  REJECTED: "REJECTED",
};

const REQUESTER_LABEL: Record<string, string> = {
  AUTO_P1: "P1 Auto-Alert",
  MANUAL_CHATBOT: "Chatbot Submission",
};

function transformRequisition(raw: RawRequisition): Requisition {
  return {
    id: `REQ-${raw.id}`,
    requester: REQUESTER_LABEL[raw.source] ?? raw.source,
    sku: raw.sku_id,
    itemName: raw.sku_name ?? raw.sku_id,
    quantity: raw.quantity,
    sourceWarehouse: "—",
    destinationDC: raw.destination_dc,
    priority: raw.urgency,
    status: REQUISITION_STATUS_MAP[raw.status] ?? "PENDING",
    createdDate: raw.created_at,
    estimatedCost: 0,
  };
}

export async function getRequisitions(): Promise<Requisition[]> {
  const res = await fetch("/api/requisitions");
  if (!res.ok) {
    throw new Error(`Failed to fetch requisitions: ${res.status}`);
  }
  const raw: RawRequisition[] = await res.json();
  return raw.map(transformRequisition);
}

// One row per supplier, already collapsed from the supplier x SKU catalog
// server-side by app/api/suppliers/route.ts (best row per supplier_id by
// suitability_score, plus a `contracts` count computed across all of that
// supplier's rows). See docs/SCHEMA.md and the plan for why: unit_price
// isn't comparable across different SKUs, so this transform never blends
// fields from more than one row per supplier (except `contracts`).
interface RawSupplier {
  supplier_id: string;
  supplier_name: string;
  country: string;
  category: string;
  unit_price: string;
  lead_time_days: string;
  on_time_delivery_pct: string;
  quality_score: string;
  risk_tier: "LOW" | "MEDIUM" | "HIGH";
  is_preferred: string; // "True" | "False"
  contracts: number;
}

function transformSupplier(raw: RawSupplier): Supplier {
  const isPreferred = raw.is_preferred === "True";
  let performance: Supplier["performance"];
  if (isPreferred) {
    performance = "Preferred";
  } else if (raw.risk_tier === "LOW") {
    performance = "Approved";
  } else if (raw.risk_tier === "MEDIUM") {
    performance = "Watchlist";
  } else {
    performance = "Under Review";
  }

  return {
    id: raw.supplier_id,
    name: raw.supplier_name,
    category: raw.category,
    reliabilityScore: Math.round(parseFloat(raw.quality_score) * 100),
    leadTimeDays: parseInt(raw.lead_time_days, 10),
    unitCost: parseFloat(raw.unit_price),
    performance,
    onTimeDelivery: Math.round(parseFloat(raw.on_time_delivery_pct) * 100),
    location: raw.country,
    contracts: raw.contracts,
  };
}

export async function getSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers");
  if (!res.ok) {
    throw new Error(`Failed to fetch suppliers: ${res.status}`);
  }
  const raw: RawSupplier[] = await res.json();
  return raw.map(transformSupplier);
}

interface RawGoodsReceipt {
  gr_id: string;
  po_id: string;
  quantity_received: number;
  status: string;
}

interface RawPurchaseOrder {
  po_id: string;
  item_name: string;
  quantity_ordered: number;
  price_per_unit: number;
  total_budget: number;
  status: string;
  supplier_id: string;
  sku_id: string;
  requisition_id: number | null;
  lead_time_days: number;
  destination_dc: string;
  created_at: string;
  goods_receipt: RawGoodsReceipt | null;
}

// generate_po() (po_generation/generator.py) never sets anything but "Open";
// "Validated" only ever appears on the OCR module's own dummy test fixture
// (src/database.py's insert_dummy_po_and_gr). Neither matches the frontend's
// enum, so both need an explicit map -- see the plan for why Draft/
// Acknowledged were chosen over Sent/Completed.
const PO_STATUS_MAP: Record<string, POStatus> = {
  Open: "Draft",
  Validated: "Acknowledged",
};

function computeExpectedDate(createdAt: string, leadTimeDays: number): Date {
  const expected = new Date(createdAt);
  expected.setDate(expected.getDate() + (leadTimeDays ?? 0));
  return expected;
}

function transformPurchaseOrder(raw: RawPurchaseOrder): PurchaseOrder {
  const expectedDelivery = computeExpectedDate(raw.created_at, raw.lead_time_days);

  return {
    id: raw.po_id,
    supplier: raw.supplier_id,
    requisitionId: raw.requisition_id != null ? `REQ-${raw.requisition_id}` : "—",
    items: raw.item_name,
    quantity: raw.quantity_ordered,
    amount: raw.total_budget,
    status: PO_STATUS_MAP[raw.status] ?? "Draft",
    createdDate: raw.created_at,
    expectedDelivery: expectedDelivery.toISOString(),
    autoGenerated: true,
  };
}

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const res = await fetch("/api/purchase-orders");
  if (!res.ok) {
    throw new Error(`Failed to fetch purchase orders: ${res.status}`);
  }
  const raw: RawPurchaseOrder[] = await res.json();
  return raw.map(transformPurchaseOrder);
}

// The 3-way match comparison itself is computed server-side (po_generation's
// build_match_rows(), reusing src/validate.py's within_tolerance() directly)
// so this stays a thin pass-through rather than a second, potentially
// drifting reimplementation of the match logic in TypeScript.
export interface InvoiceMatch {
  invoice_id: string;
  po_id: string;
  gr_id: string | null;
  match_status: string | null;
  extraction_status: string;
  rows: MatchRow[];
}

export async function getInvoiceMatches(): Promise<InvoiceMatch[]> {
  const res = await fetch("/api/matches");
  if (!res.ok) {
    throw new Error(`Failed to fetch invoice matches: ${res.status}`);
  }
  return res.json();
}

// GET /api/purchase-orders is the same endpoint the Purchase Orders page
// uses -- po_generation/main.py enriches each row with its goods_receipt
// (or null), so this is one more consumer of that one endpoint rather
// than a duplicate "list POs" route.
const MATCH_TOLERANCE_PERCENT = 2; // mirrors src/validate.py's MATCH_TOLERANCE_PERCENT

function transformDelivery(raw: RawPurchaseOrder): Delivery {
  const gr = raw.goods_receipt;
  const expectedDate = computeExpectedDate(raw.created_at, raw.lead_time_days);

  let status: DeliveryStatus = "Awaiting Receipt";
  let variancePct: number | null = null;
  if (gr) {
    variancePct = raw.quantity_ordered === 0 ? 0 : ((gr.quantity_received - raw.quantity_ordered) / raw.quantity_ordered) * 100;
    status = Math.abs(variancePct) <= MATCH_TOLERANCE_PERCENT ? "Fully Received" : "Partially Received";
  }

  return {
    id: raw.po_id,
    item: raw.item_name,
    supplier: raw.supplier_id,
    destinationDC: raw.destination_dc,
    orderedQty: raw.quantity_ordered,
    receivedQty: gr ? gr.quantity_received : null,
    status,
    expectedDate: expectedDate.toISOString(),
    variancePct,
  };
}

export async function getDeliveries(): Promise<Delivery[]> {
  const res = await fetch("/api/purchase-orders");
  if (!res.ok) {
    throw new Error(`Failed to fetch deliveries: ${res.status}`);
  }
  const raw: RawPurchaseOrder[] = await res.json();
  return raw.map(transformDelivery);
}

export interface ReceiveDeliveryResult {
  gr_id: string;
  po_id: string;
  quantity_received: number;
  status: string;
  quantity_ordered: number;
  variance_applied: boolean;
  variance_pct: number;
}

export async function receiveDelivery(poId: string, quantityReceived?: number): Promise<ReceiveDeliveryResult> {
  const res = await fetch(`/api/simulate-delivery/${poId}`, {
    method: "POST",
    ...(quantityReceived != null
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity_received: quantityReceived }),
        }
      : {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to record delivery for ${poId}: ${res.status}`);
  }
  return res.json();
}

interface RawInvoice {
  invoice_id: string;
  po_id: string;
  supplier_id: string | null;
  item_name: string | null;
  quantity_ordered: number | null;
  quantity_received: number | null;
  price_per_unit: number | null;
  total_amount: number | null;
  extraction_status: "Failed" | "Incomplete" | "Extracted";
  match_status: "Flagged_For_Review" | "Approved" | "Awaiting_Goods_Receipt" | null;
  printable_path: string | null;
}

function deriveInvoiceStatus(raw: RawInvoice): InvoiceStatus {
  if (raw.extraction_status !== "Extracted") return "Needs Review";
  if (raw.match_status === "Approved") return "Matched";
  if (raw.match_status === "Flagged_For_Review") return "Flagged";
  return "Awaiting Delivery"; // Awaiting_Goods_Receipt
}

function transformInvoice(raw: RawInvoice): InvoiceRecord {
  return {
    id: raw.invoice_id,
    supplier: raw.supplier_id ?? "—",
    poId: raw.po_id,
    quantity: raw.quantity_ordered,
    amount: raw.total_amount,
    status: deriveInvoiceStatus(raw),
    printablePath: raw.printable_path,
  };
}

export async function getInvoices(): Promise<InvoiceRecord[]> {
  const res = await fetch("/api/invoices");
  if (!res.ok) {
    throw new Error(`Failed to fetch invoices: ${res.status}`);
  }
  const raw: RawInvoice[] = await res.json();
  return raw.map(transformInvoice);
}

// chatbot's real /chat response, unwrapped as-is -- a one-off reply, not a
// list to normalize, so no transform layer needed here unlike the
// dashboard pages.
export interface ChatRequisition {
  id: number;
  sku_id: string;
  sku_name: string | null;
  quantity: number;
  destination_dc: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: "AUTO_P1" | "MANUAL_CHATBOT";
  status: "PENDING" | "VALIDATED" | "FLAGGED" | "REJECTED";
  raw_input: string | null;
  assumed_fields: string;
  created_at: string;
}

export interface ChatResult {
  requisition: ChatRequisition;
  validation_errors: string[];
  matched_product_phrase: string | null;
}

export async function sendChatMessage(text: string): Promise<ChatResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  return res.json();
}
