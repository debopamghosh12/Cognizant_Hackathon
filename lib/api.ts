import type { Requisition, RequisitionStatus, Supplier, PurchaseOrder, POStatus, MatchRow, Delivery, DeliveryStatus, InvoiceRecord, InvoiceStatus, Approval, ReplenishmentNeed, PaymentConfirmation } from "@/lib/data";
import { getDeliveryRisk, isAtRisk, getReliabilityTrend, type ReliabilityTrend } from "@/lib/anomaly-detection";
import { scoreSuppliers, bestQualifiedSupplier, type SupplierScore } from "@/lib/supplier-scoring";

interface RawRequisition {
  id: number;
  sku_id: string;
  sku_name: string | null;
  quantity: number;
  destination_dc: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: "AUTO_P1" | "MANUAL_CHATBOT" | "DEMAND_SENSING";
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
  DEMAND_SENSING: "Demand Sensing Alert",
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

// Posts to the exact same chatbot /requisitions endpoint the chatbot's own
// text-parsing flow uses (via app/api/requisitions/route.ts's POST proxy,
// added alongside its existing GET) -- a Demand Sensing requisition is
// created through the identical validated insert path, landing PENDING
// and ready for "Run AI Sourcing" exactly like a chatbot-created one.
export async function createRequisitionFromNeed(need: ReplenishmentNeed): Promise<Requisition> {
  const res = await fetch("/api/requisitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku_id: need.skuId,
      quantity: need.recommendedQty,
      destination_dc: need.destinationDC,
      urgency: need.urgency.toUpperCase(),
      source: "DEMAND_SENSING",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to create requisition: ${res.status}`);
  }
  // The chatbot endpoint returns 200 even on a validation failure (it just
  // lands the row as FLAGGED instead of PENDING) -- surface that instead of
  // silently reporting success on a row "Run AI Sourcing" won't pick up.
  if (Array.isArray(data.validation_errors) && data.validation_errors.length > 0) {
    throw new Error(`Requisition created but flagged: ${data.validation_errors.join("; ")}`);
  }
  return transformRequisition(data.requisition);
}

interface RawTransferOption {
  batch_id: string;
  from_dc: string;
  quantity: number;
  days_to_expiry: number;
  transfer_cost: number;
  supplier_cost: number;
}

interface RawReplenishmentNeed {
  id: string;
  sku_id: string;
  sku_name: string;
  destination_dc: string;
  current_stock: number;
  daily_forecast: number;
  trend: "Rising" | "Stable" | "Falling";
  confidence: "High" | "Medium" | "Low";
  reorder_point: number;
  recommended_qty: number;
  urgency: "Critical" | "High" | "Medium";
  reason: string;
  transfer: RawTransferOption | null;
  // Optional -- older/simpler backend responses may not include these.
  distributor_signal?: "Rising" | "Stable" | "Falling" | "No Data";
  promo_active?: boolean;
  promo_lift_pct?: number;
  recommended_reorder_frequency_days?: number;
  escalated?: boolean;
  escalation_target?: string | null;
}

function transformReplenishmentNeed(raw: RawReplenishmentNeed): ReplenishmentNeed {
  return {
    id: raw.id,
    skuId: raw.sku_id,
    skuName: raw.sku_name,
    destinationDC: raw.destination_dc,
    currentStock: raw.current_stock,
    dailyForecast: raw.daily_forecast,
    trend: raw.trend,
    confidence: raw.confidence,
    reorderPoint: raw.reorder_point,
    recommendedQty: raw.recommended_qty,
    urgency: raw.urgency,
    reason: raw.reason,
    transfer: raw.transfer && {
      batchId: raw.transfer.batch_id,
      fromDC: raw.transfer.from_dc,
      quantity: raw.transfer.quantity,
      daysToExpiry: raw.transfer.days_to_expiry,
      transferCost: raw.transfer.transfer_cost,
      supplierCost: raw.transfer.supplier_cost,
    },
    distributorSignal: raw.distributor_signal,
    promoActive: raw.promo_active,
    promoLiftPct: raw.promo_lift_pct,
    recommendedReorderFrequencyDays: raw.recommended_reorder_frequency_days,
    escalated: raw.escalated,
    escalationTarget: raw.escalation_target,
  };
}

export async function getReplenishmentNeeds(): Promise<ReplenishmentNeed[]> {
  const res = await fetch("/api/demand-sensing/replenishment-needs");
  if (!res.ok) {
    throw new Error(`Failed to fetch replenishment needs: ${res.status}`);
  }
  const raw: RawReplenishmentNeed[] = await res.json();
  return raw.map(transformReplenishmentNeed);
}

// Simulated only -- mutates synthetic demand_sensing inventory, never
// touches requisitions/POs. Returns the updated need for this SKU/DC, or
// null if the transfer fully covered the shortage.
export async function initiateTransfer(need: ReplenishmentNeed): Promise<ReplenishmentNeed | null> {
  if (!need.transfer) {
    throw new Error("No transfer option available for this need.");
  }
  const res = await fetch("/api/demand-sensing/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku_id: need.skuId,
      from_dc: need.transfer.fromDC,
      to_dc: need.destinationDC,
      quantity: need.transfer.quantity,
      batch_id: need.transfer.batchId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Failed to initiate transfer: ${res.status}`);
  }
  return data.remaining_need ? transformReplenishmentNeed(data.remaining_need) : null;
}

// Count of completed Initiate Transfer actions (demand_sensing's
// transfer_events log) -- for the Analytics "Inter-DC Transfers" KPI.
export async function getTransferEventCount(): Promise<number | null> {
  const res = await fetch("/api/demand-sensing/transfer-count");
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.count === "number" ? data.count : null;
}

// Opt-in only -- called when a user explicitly asks to compare a card's
// rule-based forecast against the experimental ML model. Never called
// automatically, never part of getReplenishmentNeeds(). ml_metrics is the
// model's real last-measured accuracy (train_ml_forecast.py's output),
// not a hardcoded claim -- report it exactly as returned, including if
// xgboost_beats_naive is false.
export interface MlForecastMetrics {
  trained_at: string;
  train_rows: number;
  test_rows: number;
  naive_mae: number;
  naive_wmape_pct: number;
  linear_regression_mae: number;
  linear_regression_wmape_pct: number;
  xgboost_mae: number;
  xgboost_wmape_pct: number;
  xgboost_beats_naive: boolean;
}

export interface MlForecastComparison {
  skuId: string;
  destinationDC: string;
  ruleBasedForecast: number;
  mlForecast: number | null;
  mlAvailable: boolean;
  mlUnavailableReason: string | null;
  metrics: MlForecastMetrics | null;
}

export async function getMlForecastComparison(skuId: string, destinationDC: string): Promise<MlForecastComparison> {
  const res = await fetch(
    `/api/demand-sensing/ml-comparison?${new URLSearchParams({ sku_id: skuId, destination_dc: destinationDC })}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to fetch ML comparison: ${res.status}`);
  }
  return {
    skuId: data.sku_id,
    destinationDC: data.destination_dc,
    ruleBasedForecast: data.rule_based.daily_forecast,
    mlForecast: data.ml.daily_forecast,
    mlAvailable: data.ml.available,
    mlUnavailableReason: data.ml.reason,
    metrics: data.ml_metrics,
  };
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
  payment_terms_days: string;
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
    paymentTermsDays: parseInt(raw.payment_terms_days, 10),
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
// requisition's SKU, scored live for this specific order quantity via
// lib/supplier-scoring.ts (price/lead-time/on-time-delivery/quality,
// weighted, with the same MOQ/capacity/GMP/defect-rate hard filters
// generate_po() enforces applied up front) -- returns null if the SKU has
// no supplier coverage at all, or no candidate clears those hard filters
// for this quantity.
export async function findBestSupplier(skuId: string, quantity: number): Promise<Supplier | null> {
  const candidates = await getSuppliersForSku(skuId);
  return bestQualifiedSupplier(candidates, quantity);
}

// "Why this supplier?" (app/purchase-orders/page.tsx): the same live
// scoring findBestSupplier() used to pick a supplier, returned in full so
// the UI can show the winning supplier's breakdown plus 1-2 runner-ups for
// contrast. Deliberately the exact same scoreSuppliers() call as
// findBestSupplier() -- never a separately-maintained "explanation" that
// could drift from what actually decided the pick.
export async function getSupplierSelectionBreakdown(skuId: string, quantity: number): Promise<SupplierScore[]> {
  const candidates = await getSuppliersForSku(skuId);
  return scoreSuppliers(candidates, quantity);
}

// Predictive Delivery Risk needs the exact supplier-SKU row a PO was
// actually placed against. Deliberately uses getSuppliersForSku(), NOT the
// collapsed getSuppliers() -- that endpoint picks one row per company by
// max suitability_score across ALL their SKUs, which can silently surface
// a different SKU's on_time_delivery_pct for the same supplier_id.
// po.items holds the sku_id (see transformPurchaseOrder() below).
export async function getSupplierForPO(po: PurchaseOrder): Promise<Supplier | null> {
  const candidates = await getSuppliersForSku(po.items);
  return candidates.find((s) => s.id === po.supplier) ?? null;
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
  // Both already stored as these exact raw values (update_po_status() /
  // update_invoice_decision()'s reject path) -- missing identity entries
  // here meant any PO actually "Cancelled" silently displayed as "Draft"
  // instead, since the ?? "Draft" fallback below caught every unmapped
  // raw status, not just genuinely unexpected ones.
  Cancelled: "Cancelled",
  Completed: "Completed",
  "Approved for Payment": "Approved for Payment",
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
    destinationDC: raw.destination_dc,
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
  // Predictive Anomaly Detection (po_generation/predictive.py) -- distinct
  // from match_status/rows above, which come from the reactive 3-way-match
  // tolerance check. No response_model on GET /matches, so these arrive as
  // raw SQLite 0/1, not real booleans -- coerce with Boolean(...), not ===.
  is_predictive_anomaly?: boolean | number;
  predictive_anomaly_reason?: string | null;
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
  "Over-Delivered": "Over-Delivered",
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
  match_status: "Flagged_For_Review" | "Approved" | "Approved_Manual" | "Rejected" | "Escalated" | "Approved_For_Payment" | "Awaiting_Goods_Receipt" | null;
  printable_path: string | null;
  // No response_model on GET /invoices, so this arrives as raw SQLite 0/1
  // (not a real boolean) -- coerce with Boolean(...) in transformInvoice.
  is_predictive_anomaly?: boolean | number;
  predictive_anomaly_reason?: string | null;
}

function deriveInvoiceStatus(raw: RawInvoice): InvoiceStatus {
  if (raw.extraction_status !== "Extracted") return "Needs Review";
  if (raw.match_status === "Approved") return "Matched";
  if (raw.match_status === "Approved_Manual") return "Manually Approved";
  if (raw.match_status === "Rejected") return "Rejected";
  if (raw.match_status === "Escalated") return "Escalated";
  if (raw.match_status === "Flagged_For_Review") return "Flagged";
  if (raw.match_status === "Approved_For_Payment") return "Approved for Payment";
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

// Upload Invoice (real OCR) -- the second, additional path alongside
// Generate Invoice above. Never touches that function.
export interface ParsedInvoiceFields {
  quantityOrdered: number | null;
  quantityReceived: number | null;
  pricePerUnit: number | null;
  totalAmount: number | null;
  poReference: string | null;
}

export interface OcrResult {
  rawText: string;
  parsed: ParsedInvoiceFields;
}

// Runs Google Cloud Vision DOCUMENT_TEXT_DETECTION on the uploaded file via
// app/api/invoices/ocr/route.ts (server-side only -- the API key never
// reaches the browser) and returns the raw text plus best-effort parsed
// fields. Any field the parser couldn't confidently find comes back null,
// never fabricated -- the review step is what lets a human fill those in.
export async function runInvoiceOcr(file: File): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/invoices/ocr", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `OCR failed: ${res.status}`);
  }
  return data;
}

export interface ConfirmedInvoiceFields {
  quantity_ordered: number;
  quantity_received: number;
  price_per_unit: number;
  total_amount: number;
}

// Submits the user-CONFIRMED (real-OCR-derived or manually corrected)
// fields for a specific PO -- backed by po_generation's
// /purchase-orders/{po_id}/submit-ocr-invoice, which reuses the exact same
// three_way_match()/insert_invoice() calls generate-invoice does. Never
// silently trusted the way Generate Invoice's synthetic numbers are.
export async function submitOcrInvoice(poId: string, confirmed: ConfirmedInvoiceFields): Promise<InvoiceRecord> {
  const res = await fetch(`/api/purchase-orders/${poId}/submit-ocr-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(confirmed),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Failed to submit invoice: ${res.status}`);
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
    isPredictiveAnomaly: Boolean(raw.is_predictive_anomaly),
    predictiveAnomalyReason: raw.predictive_anomaly_reason ?? null,
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
        poId: m.po_id,
        grId: m.gr_id,
        supplier: invoice?.supplier ?? "—",
        amount: invoice?.amount ?? 0,
        confidence,
        reasoning: failedLabels.length > 0
          ? `${failedLabels.join(", ")} outside the 2% match tolerance.`
          : "Flagged for review.",
        rows: m.rows,
      };
    });
}

export async function postApprovalDecision(
  invoiceId: string,
  action: "approve" | "reject" | "escalate" | "approve_for_payment"
): Promise<void> {
  const res = await fetch(`/api/invoices/${invoiceId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    // approve_for_payment's 400 (no real 3-way comparison to approve
    // against) is a real server-side guard a caller needs to see, not
    // just a generic failure -- surfaced the same way generatePO() does
    // for its own hard-filter rejections.
    const data = await res.json().catch(() => null);
    throw new Error(
      typeof data?.detail === "string" ? data.detail : `Failed to record decision for ${invoiceId}: ${res.status}`
    );
  }
}

// Shared by the 3-Way Matching page's "Approve for Payment" button (a
// clean auto-match) and the Approvals page's "Approve" button (a human
// reviewing a flagged invoice and deciding to approve it anyway) -- same
// action, same resulting Approved_For_Payment status either way, so both
// pages can render the identical PaymentApprovedDialog off this one call
// instead of each assembling its own confirmation data.
export async function approveInvoiceForPayment(
  invoiceId: string,
  po: PurchaseOrder,
  amount: number
): Promise<PaymentConfirmation> {
  await postApprovalDecision(invoiceId, "approve_for_payment");
  const supplier = await getSupplierForPO(po);
  return {
    poId: po.id,
    invoiceId,
    amount,
    paymentReference: `PAY-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    paymentTermsDays: supplier?.paymentTermsDays ?? null,
  };
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

export interface SupplierSpend {
  supplier: string;
  spend: number;
}

// Live replacement for lib/data.ts's mock spendBySupplier -- unlike the
// month-by-month trend charts on the Analytics page, "top suppliers by
// spend" is a snapshot ranking, not a time series, so it's honestly
// computable even from a handful of real POs (just a shorter bar chart).
export async function getSpendBySupplier(): Promise<SupplierSpend[]> {
  const purchaseOrders = await getPurchaseOrders();
  const bySupplier = new Map<string, number>();
  for (const po of purchaseOrders) {
    bySupplier.set(po.supplier, (bySupplier.get(po.supplier) ?? 0) + po.amount);
  }
  return Array.from(bySupplier.entries())
    .map(([supplier, spend]) => ({ supplier, spend }))
    .sort((a, b) => b.spend - a.spend);
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

const OPEN_PO_STATUSES: POStatus[] = ["Draft", "Sent", "Acknowledged", "Partially Received"];

// Dashboard "At-Risk POs" card (lib/anomaly-detection.ts::getDeliveryRisk()).
// Resolves each open PO to its real supplier via getSupplierForPO() (not
// the collapsed getSuppliers()) so risk reflects the SKU actually on that
// PO, not whichever SKU the supplier happens to score highest on elsewhere.
export async function getAtRiskPOCount(): Promise<number> {
  const purchaseOrders = await getPurchaseOrders();
  const openPOs = purchaseOrders.filter((po) => OPEN_PO_STATUSES.includes(po.status));
  const suppliers = await Promise.all(openPOs.map(getSupplierForPO));
  return suppliers.filter((s) => s != null && isAtRisk(getDeliveryRisk(s.onTimeDelivery))).length;
}

// A "completed procurement cycle" = an invoice whose 3-way match actually
// resolved (Approved either automatically or after manual review) --
// reuses the same match_status values the Dashboard's match-rate KPI and
// the Approvals page already key off, no new classification introduced.
export async function getCompletedCycleCount(): Promise<number> {
  const matches = await getInvoiceMatches();
  return matches.filter((m) => m.match_status === "Approved" || m.match_status === "Approved_Manual").length;
}

// Suppliers page reliability trend warning (lib/anomaly-detection.ts::
// getReliabilityTrend()). Only suppliers with >=2 real, non-cancelled POs
// get an entry in the returned map -- callers should treat "no entry" as
// "show nothing", not a placeholder.
export async function getSupplierReliabilityTrends(): Promise<Map<string, ReliabilityTrend>> {
  const [purchaseOrders, deliveries] = await Promise.all([getPurchaseOrders(), getDeliveries()]);
  const deliveryByPoId = new Map(deliveries.map((d) => [d.id, d]));

  const bySupplier = new Map<string, PurchaseOrder[]>();
  for (const po of purchaseOrders) {
    if (po.status === "Draft" || po.status === "Cancelled") continue;
    const group = bySupplier.get(po.supplier) ?? [];
    group.push(po);
    bySupplier.set(po.supplier, group);
  }

  const trends = new Map<string, ReliabilityTrend>();
  for (const [supplierId, pos] of bySupplier) {
    const recentStatuses = [...pos]
      .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
      .slice(0, 3)
      .map((po) => deliveryByPoId.get(po.id)?.status)
      .filter((s): s is DeliveryStatus => s != null);
    const trend = getReliabilityTrend(recentStatuses);
    if (trend) trends.set(supplierId, trend);
  }
  return trends;
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
