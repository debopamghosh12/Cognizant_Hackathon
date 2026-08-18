"use client";
import * as React from "react";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, ChevronDown, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, cn } from "@/lib/utils";
import { describeCheck } from "@/lib/match-rows";
import type { Approval } from "@/lib/data";

export function ApprovalCard({
  approval,
  onApprove,
  onRequestReject,
  onRequestEscalate,
}: {
  approval: Approval;
  // Approve performs the approve-for-payment action immediately (same
  // click -> action -> outcome-dialog pattern the 3-Way Matching page's
  // "Approve for Payment" button already uses) -- the card just needs to
  // show a pending state while that's in flight.
  onApprove: (approval: Approval) => Promise<void> | void;
  // Reject/Escalate open a confirmation dialog (reason required) owned by
  // the parent page -- the card itself does nothing async for these.
  onRequestReject: (approval: Approval) => void;
  onRequestEscalate: (approval: Approval) => void;
}) {
  const [isApproving, setIsApproving] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  async function handleApproveClick() {
    setIsApproving(true);
    try {
      await onApprove(approval);
    } finally {
      setIsApproving(false);
    }
  }

  const level = approval.confidence >= 90 ? "high" : approval.confidence >= 70 ? "medium" : "low";
  const levelConfig = {
    high: { color: "bg-green-600", badge: "success" as const, label: "High Confidence" },
    medium: { color: "bg-amber-500", badge: "warning" as const, label: "Medium Confidence" },
    low: { color: "bg-red-500", badge: "destructive" as const, label: "Low Confidence" },
  }[level];

  const passingCount = approval.rows.filter((r) => r.match).length;

  // Pulled straight from the labeled rows -- each of these is already a
  // real value from its source (see MatchRow's doc comment in lib/data.ts),
  // never the calculated "expected" figure.
  const rowByLabel = (label: string) => approval.rows.find((r) => r.label === label);
  const poOrderedQty = rowByLabel("Quantity Ordered")?.po ?? "—";
  const poAmount = rowByLabel("Total Amount Reconciliation")?.po ?? "—";
  const grReceivedQty = rowByLabel("Quantity Received")?.gr ?? "—";
  const invQtyOrdered = rowByLabel("Quantity Ordered")?.invoice ?? "—";
  const invQtyReceived = rowByLabel("Quantity Received")?.invoice ?? "—";
  const invAmount = rowByLabel("Total Amount Reconciliation")?.invoice ?? "—";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground">{approval.invoiceId}</p>
              <Badge variant={levelConfig.badge}>{levelConfig.label}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{approval.supplier}</p>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(approval.amount)}</p>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Sparkles size={12} className="text-primary-600" /> AI Confidence Score
            </span>
            <span className="font-semibold text-foreground">{approval.confidence}%</span>
          </div>
          <Progress value={approval.confidence} className="mt-1.5" indicatorClassName={levelConfig.color} />
        </div>

        <div className="mt-3 flex gap-2 rounded-lg bg-secondary/60 p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{approval.reasoning}</p>
        </div>

        {approval.rows.length > 0 && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="mt-3 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ListChecks size={11} />
            {showDetails ? "Hide details" : "View details"}
            <ChevronDown size={12} className={cn("transition-transform", showDetails && "rotate-180")} />
          </button>
        )}

        {showDetails && (
          <div className="mt-2 space-y-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-xs">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              PO {approval.poId} · GR {approval.grId ?? "—"} · Invoice {approval.invoiceId}
            </p>

            {/* Source Data -- only real, actual values from each source,
                never a calculated comparison figure. Total Amount here is
                the PO's real total_budget / the invoice's real
                total_amount, not the "expected at PO rate" figure used to
                decide the amount check below (that's clearly a separate,
                labeled calculation in Reconciliation). */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Source data</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border bg-card p-2">
                  <p className="text-[10px] font-semibold text-foreground">Purchase Order</p>
                  <dl className="mt-1 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Ordered qty</dt>
                      <dd className="font-medium text-foreground">{poOrderedQty}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">PO amount</dt>
                      <dd className="font-medium text-foreground">{poAmount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Unit price</dt>
                      <dd className="font-medium text-foreground">{formatCurrency(approval.poUnitPrice, "INR", 4)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-md border border-border bg-card p-2">
                  <p className="text-[10px] font-semibold text-foreground">Goods Receipt</p>
                  <dl className="mt-1 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Received qty</dt>
                      <dd className="font-medium text-foreground">{grReceivedQty}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-md border border-border bg-card p-2">
                  <p className="text-[10px] font-semibold text-foreground">Invoice</p>
                  <dl className="mt-1 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Qty ordered</dt>
                      <dd className="font-medium text-foreground">{invQtyOrdered}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Qty received</dt>
                      <dd className="font-medium text-foreground">{invQtyReceived}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Invoice amount</dt>
                      <dd className="font-medium text-foreground">{invAmount}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Reconciliation -- calculated comparisons only, clearly
                separated from the real source data above. Total Amount
                Reconciliation compares "Expected" (PO's unit price x the
                invoice's own claimed quantity received -- a calculation,
                never the PO's real total) against the invoice's real
                amount; describeCheck() picks "Expected" over "PO" for
                this row automatically (see lib/match-rows.ts). */}
            <div className="border-t border-border pt-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Reconciliation (calculated)
              </p>
              <ul className="mt-1 space-y-1.5">
                {approval.rows.map((r) => (
                  <li key={r.label} className="flex items-start gap-1.5">
                    {r.match ? (
                      <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle size={11} className="mt-0.5 shrink-0 text-red-600" />
                    )}
                    <span className={r.match ? "text-muted-foreground" : "text-red-700 dark:text-red-400"}>
                      {describeCheck(r)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-medium text-foreground">
                {passingCount} of {approval.rows.length} checks passed = {approval.confidence}%
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                The AI Confidence Score above is this same fraction of passing checks — the same figure
                the 3-Way Matching page calls "Match Score," not a separate machine-learning estimate.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="success"
            className="flex-1"
            disabled={isApproving}
            onClick={handleApproveClick}
          >
            <CheckCircle2 size={14} /> {isApproving ? "Approving..." : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            disabled={isApproving}
            onClick={() => onRequestReject(approval)}
          >
            <XCircle size={14} /> Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={isApproving}
            onClick={() => onRequestEscalate(approval)}
          >
            <AlertTriangle size={14} /> Escalate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
