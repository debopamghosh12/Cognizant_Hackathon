import { Badge } from "@/components/ui/badge";

const statusMap: Record<string, { variant: "success" | "warning" | "destructive" | "info" | "neutral"; label?: string }> = {
  "Pending Approval": { variant: "warning" },
  "Approved": { variant: "info" },
  "Auto-Approved": { variant: "success" },
  "Rejected": { variant: "destructive" },
  "Converted to PO": { variant: "neutral" },
  "Draft": { variant: "neutral" },
  "Sent": { variant: "info" },
  "Acknowledged": { variant: "info" },
  "Partially Received": { variant: "warning" },
  "Completed": { variant: "success" },
  "Cancelled": { variant: "destructive" },
  "Awaiting Receipt": { variant: "neutral" },
  "Fully Received": { variant: "success" },
  "Delayed": { variant: "destructive" },
  "Awaiting Delivery": { variant: "info" },
  "Needs Review": { variant: "warning" },
  "Matched": { variant: "success" },
  "Flagged": { variant: "destructive" },
  "Manually Approved": { variant: "info" },
  "Escalated": { variant: "warning" },
  "Preferred": { variant: "success" },
  "Watchlist": { variant: "warning" },
  "Under Review": { variant: "destructive" },
  "Low": { variant: "neutral" },
  "Medium": { variant: "info" },
  "High": { variant: "warning" },
  "Critical": { variant: "destructive" },
  "PENDING": { variant: "warning" },
  "APPROVED": { variant: "info" },
  "AUTO_APPROVED": { variant: "success" },
  "REJECTED": { variant: "destructive" },
  "CONVERTED_TO_PO": { variant: "neutral" },
  "LOW": { variant: "neutral" },
  "MEDIUM": { variant: "info" },
  "HIGH": { variant: "warning" },
  "CRITICAL": { variant: "destructive" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusMap[status] ?? { variant: "neutral" as const };
  return <Badge variant={config.variant}>{config.label ?? status}</Badge>;
}
