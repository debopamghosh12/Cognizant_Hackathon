// Live, per-decision supplier scoring -- the actual "how did it pick this
// supplier" logic, used both to rank candidates for AI Sourcing
// (findBestSupplier in lib/api.ts) and to render the "Why this supplier?"
// breakdown on the PO Preview panel. One function, two call sites, so the
// UI can never show a different reason than the one that drove the pick.
//
// Weights and the GMP penalty mirror scripts/generate_suppliers.py's
// compute_labels() (the formula used to originally design this synthetic
// dataset's suitability_score column) -- reused here so the live score
// stays consistent with how the data was built, minus that script's
// injected Gaussian noise (which existed to simulate labeling messiness
// for ML training, not something a real-time decision should reproduce).
//
// Unlike the static suitability_score column, this also enforces the same
// hard constraints po_generation/generator.py::generate_po() checks
// (GMP certification, defect rate, minimum order quantity, available
// capacity) *before* ranking, using this requisition's actual quantity --
// so a disqualified supplier can never be the top pick here only to fail
// PO generation a moment later.
import type { Supplier } from "@/lib/data";

export const SCORE_WEIGHTS = {
  cost: 0.30,
  speed: 0.20,
  onTimeDelivery: 0.25,
  quality: 0.25,
} as const;

const GMP_PENALTY = 0.55;
const GMP_REQUIRED_CATEGORIES = new Set(["Active Ingredient", "Excipient"]);
const MAX_DEFECT_RATE_PCT = 0.05;

export interface SupplierScore {
  supplier: Supplier;
  costScore: number; // 0-1, higher = cheaper relative to other candidates for this SKU
  speedScore: number; // 0-1, higher = faster relative to other candidates for this SKU
  onTimeDeliveryScore: number; // 0-1, raw on-time-delivery rate
  qualityScore: number; // 0-1, raw quality score
  gmpPenaltyApplied: boolean;
  weightedScore: number; // 0-1 final score used for ranking
  disqualifiedReason: string | null;
}

function minMaxNormalizer(values: number[]): (v: number) => number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo;
  return (v) => (range === 0 ? 0.5 : (v - lo) / range);
}

// candidates must all be for the same SKU. quantity is the requisition's
// actual order quantity, needed to check MOQ/capacity fit for this PO.
export function scoreSuppliers(candidates: Supplier[], quantity: number): SupplierScore[] {
  if (candidates.length === 0) return [];

  const normalizePrice = minMaxNormalizer(candidates.map((c) => c.unitCost));
  const normalizeLeadTime = minMaxNormalizer(candidates.map((c) => c.leadTimeDays));

  const scores = candidates.map((c) => {
    const costScore = 1 - normalizePrice(c.unitCost);
    const speedScore = 1 - normalizeLeadTime(c.leadTimeDays);
    const onTimeDeliveryScore = c.onTimeDelivery / 100;
    const qualityScore = c.reliabilityScore / 100;

    let weightedScore =
      SCORE_WEIGHTS.cost * costScore +
      SCORE_WEIGHTS.speed * speedScore +
      SCORE_WEIGHTS.onTimeDelivery * onTimeDeliveryScore +
      SCORE_WEIGHTS.quality * qualityScore;

    const gmpNonCompliant = GMP_REQUIRED_CATEGORIES.has(c.category) && !c.gmpCertified;
    if (gmpNonCompliant) weightedScore *= GMP_PENALTY;

    const availableCapacity = c.maxCapacityUnitsPerMonth * (1 - c.currentUtilizationPct);

    // Same order hard filters generate_po() enforces, checked here up
    // front so ranking never surfaces a supplier that would fail PO
    // generation a moment later.
    let disqualifiedReason: string | null = null;
    if (gmpNonCompliant) {
      disqualifiedReason = `Not GMP certified for regulated category "${c.category}"`;
    } else if (c.defectRatePct > MAX_DEFECT_RATE_PCT) {
      disqualifiedReason = `Defect rate ${(c.defectRatePct * 100).toFixed(2)}% exceeds the ${(MAX_DEFECT_RATE_PCT * 100).toFixed(0)}% limit`;
    } else if (quantity < c.minimumOrderQuantity) {
      disqualifiedReason = `Order quantity ${quantity.toLocaleString()} is below this supplier's minimum order of ${c.minimumOrderQuantity.toLocaleString()}`;
    } else if (quantity > availableCapacity) {
      disqualifiedReason = `Order quantity ${quantity.toLocaleString()} exceeds available capacity (${Math.round(availableCapacity).toLocaleString()})`;
    }

    return {
      supplier: c,
      costScore: Math.round(costScore * 1000) / 1000,
      speedScore: Math.round(speedScore * 1000) / 1000,
      onTimeDeliveryScore: Math.round(onTimeDeliveryScore * 1000) / 1000,
      qualityScore: Math.round(qualityScore * 1000) / 1000,
      gmpPenaltyApplied: gmpNonCompliant,
      weightedScore: Math.round(weightedScore * 1000) / 1000,
      disqualifiedReason,
    };
  });

  // Qualified candidates first (ranked best score first), disqualified
  // ones after (also ranked by score, so the "how close did they come"
  // ordering among rejects is still meaningful).
  return scores.sort((a, b) => {
    if (!a.disqualifiedReason !== !b.disqualifiedReason) {
      return a.disqualifiedReason ? 1 : -1;
    }
    return b.weightedScore - a.weightedScore;
  });
}

export function bestQualifiedSupplier(candidates: Supplier[], quantity: number): Supplier | null {
  const ranked = scoreSuppliers(candidates, quantity);
  return ranked.find((s) => !s.disqualifiedReason)?.supplier ?? null;
}
