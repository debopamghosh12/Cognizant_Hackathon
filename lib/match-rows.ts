import type { MatchRow } from "@/lib/data";

// Both non-"—" sides of a row, labeled by source, so a real sentence can be
// built from whichever two of {PO, GR, Invoice} that row actually compares
// (differs per row: Quantity Ordered is PO vs Invoice, Quantity Received is
// GR vs Invoice, Goods Receipt vs PO Quantity is GR vs PO).
export function rowSides(row: MatchRow): { label: string; value: string }[] {
  const sides: { label: string; value: string }[] = [];
  if (row.po !== "—") sides.push({ label: "PO", value: row.po });
  if (row.gr !== "—") sides.push({ label: "GR", value: row.gr });
  if (row.invoice !== "—") sides.push({ label: "Invoice", value: row.invoice });
  return sides;
}

// States the actual rule and margin with the real numbers behind this row
// (row.variancePercent/tolerancePercent come straight from the same
// within_tolerance() call that decided match:true/false server-side --
// never re-derived here, so this can't drift from what actually happened).
export function describeViolation(row: MatchRow): string {
  const [a, b] = rowSides(row);
  if (!a || !b) return row.label;
  const variance = row.variancePercent;
  const varianceText = variance == null ? "" : ` — ${variance}% variance`;
  const toleranceText =
    row.tolerancePercent && row.tolerancePercent > 0
      ? `, outside the ${row.tolerancePercent}% auto-approve tolerance`
      : " (any overage fails this check)";
  return `${row.label}: ${a.label} ${a.value} vs ${b.label} ${b.value}${varianceText}${toleranceText}`;
}
