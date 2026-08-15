// Predictive Anomaly Detection -- rule-based, forward-looking risk signals.
//
// Deliberately kept separate from the rest of lib/api.ts's transform/derive
// functions, which are all REACTIVE (they describe what already happened:
// match_status from the fixed +/-2% tolerance check, delivery status from
// what's actually been received so far). Everything here is pure and
// side-effect-free -- lib/api.ts owns fetching and calls into these.

export type DeliveryRiskLevel = "Low" | "Medium" | "High";

// Thresholds as specified: >=95% on-time delivery -> Low, 85-94% -> Medium,
// <85% -> High. onTimeDeliveryPct is already 0-100 (see Supplier.onTimeDelivery
// in lib/api.ts's transformSupplier()), not a 0-1 fraction.
export function getDeliveryRisk(onTimeDeliveryPct: number): DeliveryRiskLevel {
  if (onTimeDeliveryPct >= 95) return "Low";
  if (onTimeDeliveryPct >= 85) return "Medium";
  return "High";
}

export function isAtRisk(level: DeliveryRiskLevel): boolean {
  return level !== "Low";
}

export interface ReliabilityTrend {
  warning: string;
}

// recentStatuses should be the supplier's most-recent-first delivery
// statuses (already excluding Draft/Cancelled POs), capped to a handful.
// Needs at least 2 data points to call anything a "trend" -- returns null
// below that, which is also exactly what keeps suppliers with no real PO
// history from showing any warning at all.
//
// "Partially Received" is used as the observable proxy for "late/partial"
// -- goods_receipts has no actual-vs-expected delivery timestamp to compute
// genuine lateness from, so "still not fully received" is the honest stand-in.
export function getReliabilityTrend(recentStatuses: string[]): ReliabilityTrend | null {
  if (recentStatuses.length < 2) return null;

  const problematic = recentStatuses.filter((s) => s === "Partially Received").length;
  if (problematic / recentStatuses.length < 0.5) return null;

  return {
    warning: `Declining reliability — ${problematic} of last ${recentStatuses.length} deliveries partial/incomplete`,
  };
}
