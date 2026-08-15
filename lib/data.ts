// Centralized mock/dummy data for the Autonomous P2P demo.
// All data below is synthetic and used purely for UI demonstration.

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RequisitionStatus =
  | "PENDING"
  | "APPROVED"
  | "AUTO_APPROVED"
  | "REJECTED"
  | "CONVERTED_TO_PO";
export type POStatus = "Draft" | "Sent" | "Acknowledged" | "Partially Received" | "Completed" | "Cancelled";

export interface Requisition {
  id: string;
  requester: string;
  sku: string;
  itemName: string;
  quantity: number;
  sourceWarehouse: string;
  destinationDC: string;
  priority: Priority;
  status: RequisitionStatus;
  createdDate: string;
  estimatedCost: number;
}

export const requisitions: Requisition[] = [
  { id: "REQ-2041", requester: "Ananya Sharma", sku: "MED-2201", itemName: "Paracetamol 500mg", quantity: 500, sourceWarehouse: "Kolkata Central Warehouse", destinationDC: "Siliguri DC", priority: "HIGH", status: "PENDING", createdDate: "2026-08-14", estimatedCost: 42500 },
  { id: "REQ-2042", requester: "Anjali Mehta", sku: "MED-2201", itemName: "Paracetamol 500mg (Box of 1000)", quantity: 1200, sourceWarehouse: "Delhi Central Warehouse", destinationDC: "Gurugram DC", priority: "HIGH", status: "AUTO_APPROVED", createdDate: "2026-08-12", estimatedCost: 84000 },
  { id: "REQ-2043", requester: "Rohan Kapoor", sku: "PPE-1042", itemName: "Nitrile Gloves (Case)", quantity: 450, sourceWarehouse: "Mumbai Port Warehouse", destinationDC: "Pune DC", priority: "MEDIUM", status: "PENDING", createdDate: "2026-08-12", estimatedCost: 56200 },
  { id: "REQ-2044", requester: "Sara Iyer", sku: "PKG-3305", itemName: "Corrugated Shipping Boxes (L)", quantity: 3000, sourceWarehouse: "Bengaluru Central Hub", destinationDC: "Mysuru DC", priority: "LOW", status: "APPROVED", createdDate: "2026-08-11", estimatedCost: 39000 },
  { id: "REQ-2045", requester: "Vikram Nair", sku: "MED-2214", itemName: "Insulin Vials 10ml", quantity: 600, sourceWarehouse: "Chennai Cold Chain Warehouse", destinationDC: "Coimbatore DC", priority: "CRITICAL", status: "AUTO_APPROVED", createdDate: "2026-08-11", estimatedCost: 215000 },
  { id: "REQ-2046", requester: "Neha Gupta", sku: "MED-2278", itemName: "Amoxicillin 250mg Capsules", quantity: 900, sourceWarehouse: "Pune Fulfilment Center", destinationDC: "Nagpur DC", priority: "MEDIUM", status: "CONVERTED_TO_PO", createdDate: "2026-08-10", estimatedCost: 63000 },
  { id: "REQ-2047", requester: "Arjun Rao", sku: "MED-2305", itemName: "Ibuprofen 400mg Tablets", quantity: 700, sourceWarehouse: "Hyderabad Plant Warehouse", destinationDC: "Warangal DC", priority: "LOW", status: "REJECTED", createdDate: "2026-08-09", estimatedCost: 45500 },
  { id: "REQ-2048", requester: "Divya Menon", sku: "MED-2201", itemName: "Paracetamol 500mg (Box of 1000)", quantity: 800, sourceWarehouse: "Kolkata Central Warehouse", destinationDC: "Durgapur DC", priority: "HIGH", status: "PENDING", createdDate: "2026-08-09", estimatedCost: 56000 },
  { id: "REQ-2049", requester: "Karan Malhotra", sku: "MED-2340", itemName: "Cetirizine 10mg Tablets", quantity: 1000, sourceWarehouse: "Delhi Central Warehouse", destinationDC: "Jaipur DC", priority: "LOW", status: "APPROVED", createdDate: "2026-08-08", estimatedCost: 38000 },
  { id: "REQ-2050", requester: "Ishita Bose", sku: "MED-2390", itemName: "Azithromycin 500mg Tablets", quantity: 350, sourceWarehouse: "Mumbai Port Warehouse", destinationDC: "Nashik DC", priority: "MEDIUM", status: "AUTO_APPROVED", createdDate: "2026-08-07", estimatedCost: 61250 },
  { id: "REQ-2051", requester: "Manish Trivedi", sku: "MED-2230", itemName: "Surgical Masks (Carton)", quantity: 1500, sourceWarehouse: "Chennai Cold Chain Warehouse", destinationDC: "Madurai DC", priority: "CRITICAL", status: "CONVERTED_TO_PO", createdDate: "2026-08-06", estimatedCost: 97500 },
];

export interface Supplier {
  id: string;
  name: string;
  category: string;
  reliabilityScore: number;
  leadTimeDays: number;
  unitCost: number;
  performance: "Preferred" | "Approved" | "Watchlist" | "Under Review";
  onTimeDelivery: number;
  location: string;
  contracts: number;
}

export const suppliers: Supplier[] = [
  { id: "SUP-001", name: "MedSource Pharmaceuticals", category: "Pharma & Medical", reliabilityScore: 96, leadTimeDays: 3, unitCost: 6.8, performance: "Preferred", onTimeDelivery: 98, location: "Ahmedabad, IN", contracts: 4 },
  { id: "SUP-002", name: "Apex Industrial Supplies", category: "Industrial & MRO", reliabilityScore: 89, leadTimeDays: 5, unitCost: 42.1, performance: "Approved", onTimeDelivery: 91, location: "Pune, IN", contracts: 2 },
  { id: "SUP-003", name: "Global PackTech Ltd.", category: "Packaging", reliabilityScore: 82, leadTimeDays: 6, unitCost: 1.3, performance: "Approved", onTimeDelivery: 87, location: "Chennai, IN", contracts: 3 },
  { id: "SUP-004", name: "NovaMed Distribution", category: "Pharma & Medical", reliabilityScore: 74, leadTimeDays: 8, unitCost: 6.2, performance: "Watchlist", onTimeDelivery: 76, location: "Nagpur, IN", contracts: 1 },
  { id: "SUP-005", name: "Sunrise Electronics Co.", category: "Electronics", reliabilityScore: 91, leadTimeDays: 4, unitCost: 210.0, performance: "Preferred", onTimeDelivery: 95, location: "Bengaluru, IN", contracts: 5 },
  { id: "SUP-006", name: "Vertex Chemicals & Lubes", category: "Industrial & MRO", reliabilityScore: 65, leadTimeDays: 11, unitCost: 88.5, performance: "Under Review", onTimeDelivery: 68, location: "Vadodara, IN", contracts: 1 },
];

export interface PurchaseOrder {
  id: string;
  supplier: string;
  requisitionId: string;
  items: string;
  quantity: number;
  amount: number;
  status: POStatus;
  createdDate: string;
  expectedDelivery: string;
  autoGenerated: boolean;
}

export const purchaseOrders: PurchaseOrder[] = [
  { id: "PO-88231", supplier: "MedSource Pharmaceuticals", requisitionId: "REQ-10231", items: "Paracetamol 500mg", quantity: 1200, amount: 8160, status: "Acknowledged", createdDate: "2026-08-12", expectedDelivery: "2026-08-16", autoGenerated: true },
  { id: "PO-88230", supplier: "Sunrise Electronics Co.", requisitionId: "REQ-10235", items: "Barcode Scanners", quantity: 40, amount: 8400, status: "Sent", createdDate: "2026-08-11", expectedDelivery: "2026-08-15", autoGenerated: true },
  { id: "PO-88229", supplier: "MedSource Pharmaceuticals", requisitionId: "REQ-10234", items: "Insulin Vials 10ml", quantity: 600, amount: 20880, status: "Partially Received", createdDate: "2026-08-11", expectedDelivery: "2026-08-14", autoGenerated: true },
  { id: "PO-88228", supplier: "Global PackTech Ltd.", requisitionId: "REQ-10233", items: "Shipping Boxes (L)", quantity: 3000, amount: 3750, status: "Completed", createdDate: "2026-08-09", expectedDelivery: "2026-08-13", autoGenerated: false },
  { id: "PO-88227", supplier: "Apex Industrial Supplies", requisitionId: "REQ-10238", items: "Pallet Wrap Rolls", quantity: 220, amount: 1870, status: "Completed", createdDate: "2026-08-08", expectedDelivery: "2026-08-12", autoGenerated: false },
  { id: "PO-88226", supplier: "MedSource Pharmaceuticals", requisitionId: "REQ-10240", items: "Surgical Masks", quantity: 1500, amount: 9450, status: "Draft", createdDate: "2026-08-06", expectedDelivery: "2026-08-11", autoGenerated: true },
];

export interface Shipment {
  id: string;
  poId: string;
  supplier: string;
  warehouse: string;
  orderedQty: number;
  receivedQty: number;
  status: "Awaiting Receipt" | "Partially Received" | "Fully Received" | "Delayed";
  expectedDate: string;
}

export const shipments: Shipment[] = [
  { id: "SHP-4471", poId: "PO-88231", supplier: "MedSource Pharmaceuticals", warehouse: "Delhi Central WH", orderedQty: 1200, receivedQty: 0, status: "Awaiting Receipt", expectedDate: "2026-08-16" },
  { id: "SHP-4470", poId: "PO-88229", supplier: "MedSource Pharmaceuticals", warehouse: "Chennai Cold Chain WH", orderedQty: 600, receivedQty: 420, status: "Partially Received", expectedDate: "2026-08-14" },
  { id: "SHP-4469", poId: "PO-88228", supplier: "Global PackTech Ltd.", warehouse: "Bengaluru Hub", orderedQty: 3000, receivedQty: 3000, status: "Fully Received", expectedDate: "2026-08-13" },
  { id: "SHP-4468", poId: "PO-88227", supplier: "Apex Industrial Supplies", warehouse: "Delhi Central WH", orderedQty: 220, receivedQty: 220, status: "Fully Received", expectedDate: "2026-08-12" },
  { id: "SHP-4467", poId: "PO-88230", supplier: "Sunrise Electronics Co.", warehouse: "Pune Fulfilment Center", orderedQty: 40, receivedQty: 0, status: "Delayed", expectedDate: "2026-08-13" },
];

export interface InvoiceRecord {
  id: string;
  supplier: string;
  poId: string;
  amount: number;
  tax: number;
  quantity: number;
  invoiceDate: string;
  ocrConfidence: number;
  status: "Processed" | "Needs Review" | "Matched" | "Flagged";
}

export const invoices: InvoiceRecord[] = [
  { id: "INV-204", supplier: "MedSource Pharmaceuticals", poId: "PO-88231", amount: 8160, tax: 408, quantity: 1200, invoiceDate: "2026-08-13", ocrConfidence: 98.4, status: "Matched" },
  { id: "INV-198", supplier: "Sunrise Electronics Co.", poId: "PO-88230", amount: 8400, tax: 420, quantity: 40, invoiceDate: "2026-08-12", ocrConfidence: 95.1, status: "Processed" },
  { id: "INV-191", supplier: "Global PackTech Ltd.", poId: "PO-88228", amount: 3810, tax: 190, quantity: 3000, invoiceDate: "2026-08-10", ocrConfidence: 88.7, status: "Flagged" },
  { id: "INV-187", supplier: "Apex Industrial Supplies", poId: "PO-88227", amount: 1870, tax: 93, quantity: 220, invoiceDate: "2026-08-09", ocrConfidence: 99.2, status: "Matched" },
  { id: "INV-180", supplier: "MedSource Pharmaceuticals", poId: "PO-88229", amount: 20880, tax: 1044, quantity: 600, invoiceDate: "2026-08-12", ocrConfidence: 91.5, status: "Needs Review" },
];

export interface Approval {
  id: string;
  invoiceId: string;
  supplier: string;
  amount: number;
  confidence: number;
  reasoning: string;
}

export const approvals: Approval[] = [
  { id: "APR-501", invoiceId: "INV-204", supplier: "MedSource Pharmaceuticals", amount: 8160, confidence: 97, reasoning: "PO quantity, goods receipt and invoice amount align within 0.2% tolerance. Supplier has a 98% on-time and defect-free history over the last 12 months." },
  { id: "APR-502", invoiceId: "INV-180", supplier: "MedSource Pharmaceuticals", amount: 20880, confidence: 74, reasoning: "Invoice amount is 3.1% higher than PO value due to a freight surcharge line not present on the original PO. Recommend manual verification of surcharge terms." },
  { id: "APR-503", invoiceId: "INV-191", supplier: "Global PackTech Ltd.", amount: 3810, confidence: 58, reasoning: "OCR confidence on tax line is below threshold (88.7%) and received quantity has not yet been confirmed in the WMS. Escalation suggested." },
  { id: "APR-504", invoiceId: "INV-198", supplier: "Sunrise Electronics Co.", amount: 8400, confidence: 93, reasoning: "3-way match successful. Minor 1-day delivery variance is within contractual SLA and does not affect payment terms." },
];

export const kpis = {
  pendingRequisitions: 18,
  autoGeneratedPOs: 132,
  ocrSuccessRate: 96.4,
  matchSuccessRate: 91.8,
};

export const procurementTrend = [
  { month: "Feb", requisitions: 210, orders: 178 },
  { month: "Mar", requisitions: 245, orders: 205 },
  { month: "Apr", requisitions: 260, orders: 231 },
  { month: "May", requisitions: 298, orders: 260 },
  { month: "Jun", requisitions: 312, orders: 289 },
  { month: "Jul", requisitions: 356, orders: 320 },
  { month: "Aug", requisitions: 340, orders: 312 },
];

export const poStatusDistribution = [
  { name: "Completed", value: 412, color: "#16a34a" },
  { name: "Sent", value: 96, color: "#2563eb" },
  { name: "Partially Received", value: 58, color: "#d97706" },
  { name: "Draft", value: 24, color: "#94a3b8" },
  { name: "Cancelled", value: 9, color: "#dc2626" },
];

export const spendBySupplier = [
  { supplier: "MedSource", spend: 412000 },
  { supplier: "Sunrise Elec.", spend: 268000 },
  { supplier: "Apex Ind.", spend: 194000 },
  { supplier: "Global PackTech", spend: 152000 },
  { supplier: "NovaMed", spend: 96000 },
  { supplier: "Vertex Chem.", spend: 61000 },
];

export const cycleTimeTrend = [
  { month: "Feb", requisitionToPO: 3.4, invoiceProcessing: 2.1 },
  { month: "Mar", requisitionToPO: 3.1, invoiceProcessing: 2.0 },
  { month: "Apr", requisitionToPO: 2.8, invoiceProcessing: 1.8 },
  { month: "May", requisitionToPO: 2.5, invoiceProcessing: 1.6 },
  { month: "Jun", requisitionToPO: 2.1, invoiceProcessing: 1.3 },
  { month: "Jul", requisitionToPO: 1.8, invoiceProcessing: 1.1 },
  { month: "Aug", requisitionToPO: 1.6, invoiceProcessing: 0.9 },
];

export const touchlessTrend = [
  { month: "Feb", touchless: 48 },
  { month: "Mar", touchless: 54 },
  { month: "Apr", touchless: 58 },
  { month: "May", touchless: 64 },
  { month: "Jun", touchless: 69 },
  { month: "Jul", touchless: 74 },
  { month: "Aug", touchless: 78 },
];

export const monthlyPOVolume = [
  { month: "Feb", volume: 178 },
  { month: "Mar", volume: 205 },
  { month: "Apr", volume: 231 },
  { month: "May", volume: 260 },
  { month: "Jun", volume: 289 },
  { month: "Jul", volume: 320 },
  { month: "Aug", volume: 312 },
];

export const recentActivity = [
  { id: 1, type: "PO Created", detail: "PO-88231 auto-generated for MedSource Pharmaceuticals", time: "8 min ago", status: "success" as const },
  { id: 2, type: "Invoice OCR", detail: "INV-204 extracted with 98.4% confidence", time: "22 min ago", status: "success" as const },
  { id: 3, type: "3-Way Match", detail: "INV-191 flagged — tax line mismatch detected", time: "41 min ago", status: "warning" as const },
  { id: 4, type: "Requisition", detail: "REQ-10232 awaiting manager approval", time: "1 hr ago", status: "neutral" as const },
  { id: 5, type: "Goods Receipt", detail: "SHP-4467 delayed at Pune Fulfilment Center", time: "2 hr ago", status: "danger" as const },
  { id: 6, type: "Approval", detail: "APR-504 auto-approved by AI agent", time: "3 hr ago", status: "success" as const },
];

export const aiRecommendations = [
  {
    id: 1,
    title: "Consolidate Paracetamol orders across 3 warehouses",
    detail: "Delhi, Kolkata and Chennai have overlapping requisitions for MED-2201. Consolidating into a single PO could save an estimated ₹1,03,000 via volume pricing.",
    impact: "High",
  },
  {
    id: 2,
    title: "Switch backup supplier for Industrial Lubricant",
    detail: "Vertex Chemicals & Lubes reliability has dropped to 65%. Apex Industrial Supplies offers a comparable price with 91% on-time delivery.",
    impact: "Medium",
  },
  {
    id: 3,
    title: "Re-negotiate lead time with NovaMed Distribution",
    detail: "Average lead time has grown from 6 to 8 days over the last quarter, risking stockouts for cold-chain SKUs.",
    impact: "Medium",
  },
];
