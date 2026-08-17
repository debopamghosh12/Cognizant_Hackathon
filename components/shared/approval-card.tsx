"use client";
import * as React from "react";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, ChevronDown, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, cn } from "@/lib/utils";
import { describeViolation } from "@/lib/match-rows";
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

  const failingRows = approval.rows.filter((r) => !r.match);
  const passingCount = approval.rows.length - failingRows.length;

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
            {/* Real PO / GR / Invoice numbers side by side, same rows and
                pass/fail coloring the 3-Way Matching page shows for this
                invoice -- not re-fetched, the same data. */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                PO {approval.poId} · GR {approval.grId ?? "—"} · Invoice {approval.invoiceId}
              </p>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="pb-1 text-left font-medium">Check</th>
                      <th className="pb-1 text-right font-medium">PO</th>
                      <th className="pb-1 text-right font-medium">GR</th>
                      <th className="pb-1 text-right font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approval.rows.map((r) => (
                      <tr
                        key={r.label}
                        className={cn(
                          "border-t border-border",
                          !r.match && "bg-red-50 dark:bg-red-500/10"
                        )}
                      >
                        <td className="py-1.5 pr-2 text-foreground">
                          <span className="flex items-center gap-1">
                            {r.match ? (
                              <CheckCircle2 size={11} className="shrink-0 text-green-600" />
                            ) : (
                              <XCircle size={11} className="shrink-0 text-red-600" />
                            )}
                            {r.label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">{r.po}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{r.gr}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-medium",
                            r.match ? "text-foreground" : "text-red-700 dark:text-red-400"
                          )}
                        >
                          {r.invoice}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* The specific rule violated and by how much -- real computed
                numbers, not the generic summary sentence above. */}
            {failingRows.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rule violated</p>
                <ul className="mt-1 space-y-1">
                  {failingRows.map((r) => (
                    <li key={r.label} className="flex items-start gap-1.5 text-red-700 dark:text-red-400">
                      <XCircle size={11} className="mt-0.5 shrink-0" />
                      <span>{describeViolation(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Confidence Score breakdown -- honest about what it is:
                the fraction of these same pass/fail checks, identical to
                the 3-Way Matching page's Match Score, not a separately
                computed ML confidence estimate. */}
            <div className="border-t border-border pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                AI Confidence Score breakdown
              </p>
              <ul className="mt-1 space-y-1">
                {approval.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {r.match ? (
                        <CheckCircle2 size={11} className="text-green-600" />
                      ) : (
                        <XCircle size={11} className="text-red-600" />
                      )}
                      {r.label}
                    </span>
                    <span className={r.match ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                      {r.match ? "Pass" : "Fail"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 font-medium text-foreground">
                {passingCount} of {approval.rows.length} checks passed = {approval.confidence}%
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                This score is the fraction of the checks above that passed — the same figure the 3-Way
                Matching page calls "Match Score," not a separate machine-learning confidence estimate.
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
