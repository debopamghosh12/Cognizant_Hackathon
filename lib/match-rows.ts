import type { MatchRow } from "@/lib/data";

// Both sides of the comparison that actually decided this row's `match`,
// labeled by source. Usually two of {PO, GR, Invoice} (differs per row:
// Quantity Ordered is PO vs Invoice, Quantity Received is GR vs Invoice,
// Goods Receipt vs PO Quantity is GR vs PO) -- except Total Amount
// Reconciliation, where `expected` (a CALCULATED figure: PO rate x
// invoice's claimed quantity, not the PO's real total) is what `match`
// was actually decided against, so it's used here instead of `po` and
// labeled "Expected" -- never presented as if it were real PO data.
export function rowSides(row: MatchRow): { label: string; value: string }[] {
  const sides: { label: string; value: string }[] = [];
  if (row.expected) {
    sides.push({ label: "Expected", value: row.expected });
  } else if (row.po !== "—") {
    sides.push({ label: "PO", value: row.po });
  }
  if (row.gr !== "—") sides.push({ label: "GR", value: row.gr });
  if (row.invoice !== "—") sides.push({ label: "Invoice", value: row.invoice });
  return sides;
}

// States the actual rule and margin with the real numbers behind this row
// (row.variancePercent/tolerancePercent come straight from the same
// within_tolerance() call that decided match:true/false server-side --
// never re-derived here, so this can't drift from what actually happened).
// Correct for both outcomes -- callers use this for passing rows too (the
// Approvals detail panel's Reconciliation section shows every check, not
// just failures), so the tolerance clause has to say "within"/"outside"
// based on row.match, not always assume a failure.
export function describeCheck(row: MatchRow): string {
  const [a, b] = rowSides(row);
  if (!a || !b) return row.label;
  const variance = row.variancePercent;
  const varianceText = variance == null ? "" : ` — ${variance}% variance`;
  const toleranceText =
    row.tolerancePercent && row.tolerancePercent > 0
      ? `, ${row.match ? "within" : "outside"} the ${row.tolerancePercent}% auto-approve tolerance`
      : row.match
        ? " (no overage)"
        : " (any overage fails this check)";
  return `${row.label}: ${a.label} ${a.value} vs ${b.label} ${b.value}${varianceText}${toleranceText}`;
}
