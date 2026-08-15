import type { Requisition, RequisitionStatus } from "@/lib/data";

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
