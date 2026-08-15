import type { Requisition, RequisitionStatus, Supplier, PurchaseOrder, POStatus, MatchRow, Delivery, DeliveryStatus, InvoiceRecord, InvoiceStatus, Approval } from "@/lib/data";

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
    requisitionId: raw.id,
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
    source: raw.source,
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
  sku_id: string;
  unit_price: string;
  minimum_order_quantity: string;
  lead_time_days: string;
  on_time_delivery_pct: string;
  quality_score: string;
  defect_rate_pct: string;
  max_capacity_units_per_month: string;
  current_utilization_pct: string;
  gmp_certified: string; // "True" | "False"
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
    skuId: raw.sku_id,
    minimumOrderQuantity: parseInt(raw.minimum_order_quantity, 10),
    maxCapacityUnitsPerMonth: parseInt(raw.max_capacity_units_per_month, 10),
    currentUtilizationPct: parseFloat(raw.current_utilization_pct),
    gmpCertified: raw.gmp_certified === "True",
    defectRatePct: parseFloat(raw.defect_rate_pct),
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

// Uncollapsed, one row per supplier-SKU pair for this specific SKU, sorted
// best-suitability-first server-side (see app/api/suppliers/route.ts's
// ?sku_id filter) -- deliberately NOT the same collapsed-per-company list
// getSuppliers() returns, since a supplier's row for THIS sku could be
// hidden there if they score higher on a different SKU they also carry.
export async function getSuppliersForSku(skuId: string): Promise<Supplier[]> {
  const res = await fetch(`/api/suppliers?sku_id=${encodeURIComponent(skuId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch suppliers for ${skuId}: ${res.status}`);
  }
  const raw: RawSupplier[] = await res.json();
  return raw.map(transformSupplier);
}

// "Run AI Sourcing" (app/requisitions/page.tsx): best candidate for a
// requisition's SKU, already ranked by suitability_score server-side --
// this just takes the top one, or null if the SKU has no supplier coverage
// (a real, known gap for 6 of the chatbot's 10 seeded SKUs).
export async function findBestSupplier(skuId: string): Promise<Supplier | null> {
  const candidates = await getSuppliersForSku(skuId);
  return candidates[0] ?? null;
}

export interface GeneratePOResult {
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
}

// po_generation's hard-filter rejections (422) come back as {"detail": "..."}
// with the specific reason (e.g. "quantity 500 is below supplier minimum
// order quantity 750") -- surfaced as the thrown Error's message so the UI
// can show the real reason, not a generic "failed" string.
export async function generatePO(requisition: Requisition, supplier: Supplier): Promise<GeneratePOResult> {
  const res = await fetch("/api/generate-po", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requisition: {
        requisition_id: requisition.requisitionId,
        sku_id: requisition.sku,
        quantity: requisition.quantity,
        destination_dc: requisition.destinationDC,
        urgency: requisition.priority,
        source: requisition.source,
      },
      supplier: {
        supplier_id: supplier.id,
        sku_id: supplier.skuId,
        unit_price: supplier.unitCost,
        minimum_order_quantity: supplier.minimumOrderQuantity,
        lead_time_days: supplier.leadTimeDays,
        max_capacity_units_per_month: supplier.maxCapacityUnitsPerMonth,
        current_utilization_pct: supplier.currentUtilizationPct,
        gmp_certified: supplier.gmpCertified,
        defect_rate_pct: supplier.defectRatePct,
        category: supplier.category,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Failed to generate PO: ${res.status}`);
  }
  return data;
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
  Sent: "Sent",
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

// Derived, not written back: chatbot has no endpoint to update a
// requisition's status, and po_generation already records requisition_id
// on every PO it creates -- so "has this requisition been converted" is
// computed fresh from po_generation's own data each time, rather than
// chatbot's requisition row ever being mutated. Same pattern as Delivery/
// Invoice status elsewhere in this file.
export async function getConvertedRequisitionIds(): Promise<Set<string>> {
  const purchaseOrders = await getPurchaseOrders();
  return new Set(purchaseOrders.map((po) => po.requisitionId).filter((id) => id !== "—"));
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

// Status is decided authoritatively server-side by src/database.py::
// record_delivery() (accumulated + capped at quantity_ordered) -- just a
// straight lookup here, no client-side tolerance inference.
const GR_STATUS_MAP: Record<string, DeliveryStatus> = {
  Pending: "Awaiting Receipt",
  "Partially Received": "Partially Received",
  "Fully Received": "Fully Received",
};

function transformDelivery(raw: RawPurchaseOrder): Delivery {
  const gr = raw.goods_receipt;
  const expectedDate = computeExpectedDate(raw.created_at, raw.lead_time_days);

  const status: DeliveryStatus = gr ? (GR_STATUS_MAP[gr.status] ?? "Awaiting Receipt") : "Awaiting Receipt";
  const variancePct = gr && raw.quantity_ordered !== 0
    ? ((gr.quantity_received - raw.quantity_ordered) / raw.quantity_ordered) * 100
    : null;

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
    poStatus: PO_STATUS_MAP[raw.status] ?? "Draft",
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

export async function sendPurchaseOrder(poId: string): Promise<void> {
  const res = await fetch(`/api/purchase-orders/${poId}/send`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to send PO ${poId}: ${res.status}`);
  }
}

// quantityReceived is THIS delivery's increment, added to whatever the PO
// has already received (src/database.py::record_delivery(), capped at
// quantity_ordered) -- not a running-total override. Omit it to deliver
// everything still outstanding in one call.
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
  match_status: "Flagged_For_Review" | "Approved" | "Approved_Manual" | "Rejected" | "Escalated" | "Awaiting_Goods_Receipt" | null;
  printable_path: string | null;
}

function deriveInvoiceStatus(raw: RawInvoice): InvoiceStatus {
  if (raw.extraction_status !== "Extracted") return "Needs Review";
  if (raw.match_status === "Approved") return "Matched";
  if (raw.match_status === "Approved_Manual") return "Manually Approved";
  if (raw.match_status === "Rejected") return "Rejected";
  if (raw.match_status === "Escalated") return "Escalated";
  if (raw.match_status === "Flagged_For_Review") return "Flagged";
  return "Awaiting Delivery"; // Awaiting_Goods_Receipt
}

export async function generateInvoice(poId: string): Promise<InvoiceRecord> {
  const res = await fetch(`/api/purchase-orders/${poId}/generate-invoice`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Failed to generate invoice: ${res.status}`);
  }
  return transformInvoice({ ...data, supplier_id: null });
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

// Approvals queue = invoices that failed auto-match (getInvoiceMatches()
// already returns the per-check pass/fail rows build_match_rows() computed
// server-side -- reused here for both the confidence score, same fraction-
// of-passing-rows formula the Matching page uses, and a plain-English
// reason built from the failed checks' own labels).
export async function getApprovals(): Promise<Approval[]> {
  const [matches, invoices] = await Promise.all([getInvoiceMatches(), getInvoices()]);
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));

  return matches
    .filter((m) => m.match_status === "Flagged_For_Review")
    .map((m) => {
      const invoice = invoiceById.get(m.invoice_id);
      const failedLabels = m.rows.filter((r) => !r.match).map((r) => r.label);
      const confidence = m.rows.length === 0
        ? 0
        : Math.round((m.rows.filter((r) => r.match).length / m.rows.length) * 100);
      return {
        id: m.invoice_id,
        invoiceId: m.invoice_id,
        supplier: invoice?.supplier ?? "—",
        amount: invoice?.amount ?? 0,
        confidence,
        reasoning: failedLabels.length > 0
          ? `${failedLabels.join(", ")} outside the 2% match tolerance.`
          : "Flagged for review.",
      };
    });
}

export async function postApprovalDecision(invoiceId: string, action: "approve" | "reject" | "escalate"): Promise<void> {
  const res = await fetch(`/api/invoices/${invoiceId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    throw new Error(`Failed to record decision for ${invoiceId}: ${res.status}`);
  }
}

// Shared by Dashboard and Analytics (previously two independent hardcoded
// "78%" literals that could never agree) -- auto-approved (touchless)
// share of all fully-processed invoices. Approved_Manual is deliberately
// excluded from the numerator: a human decision is not touchless.
export async function getAutomationRate(): Promise<number | null> {
  const invoices = await getInvoices();
  const processed = invoices.filter((inv) => inv.status !== "Needs Review");
  if (processed.length === 0) return null;
  const autoApproved = processed.filter((inv) => inv.status === "Matched").length;
  return Math.round((autoApproved / processed.length) * 1000) / 10;
}

// Average days between a requisition's creation and its PO's creation,
// joined client-side on requisitionId the same way
// getConvertedRequisitionIds() already does (chatbot and po_generation are
// separate services/DBs, so there's no single query that can join them).
export async function getAvgCycleTime(): Promise<number | null> {
  const [requisitions, purchaseOrders] = await Promise.all([getRequisitions(), getPurchaseOrders()]);
  const requisitionById = new Map(requisitions.map((r) => [r.id, r]));

  const cycleDays: number[] = [];
  for (const po of purchaseOrders) {
    const req = requisitionById.get(po.requisitionId);
    if (!req) continue;
    const days = (new Date(po.createdDate).getTime() - new Date(req.createdDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0) cycleDays.push(days);
  }

  if (cycleDays.length === 0) return null;
  return Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10;
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
