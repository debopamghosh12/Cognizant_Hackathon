"use client";
import * as React from "react";
import { XCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { describeCheck } from "@/lib/match-rows";
import type { Approval } from "@/lib/data";

export type DecisionKind = "reject" | "escalate";

const CONFIG: Record<
  DecisionKind,
  {
    icon: typeof XCircle;
    color: string;
    title: string;
    confirmLabel: string;
    confirmingLabel: string;
    confirmVariant: "destructive" | "default";
    reasons: string[];
    successTitle: string;
    successMessage: string;
  }
> = {
  reject: {
    icon: XCircle,
    color: "text-red-700 dark:text-red-400",
    title: "Reject Invoice",
    confirmLabel: "Confirm Rejection",
    confirmingLabel: "Rejecting...",
    confirmVariant: "destructive",
    reasons: ["Quantity mismatch too large", "Amount discrepancy", "Duplicate invoice suspected", "Other"],
    successTitle: "Invoice Rejected",
    successMessage: "Invoice rejected, sent back to supplier.",
  },
  escalate: {
    icon: AlertTriangle,
    color: "text-amber-700 dark:text-amber-400",
    title: "Escalate Invoice",
    confirmLabel: "Confirm Escalation",
    confirmingLabel: "Escalating...",
    confirmVariant: "default",
    reasons: ["Amount discrepancy too large", "Suspected data error", "Needs senior approval", "Other"],
    successTitle: "Escalated",
    successMessage: "Escalated to Finance Controller for review.",
  },
};

export function DecisionDialog({
  kind,
  open,
  onOpenChange,
  approval,
  onConfirm,
}: {
  kind: DecisionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approval: Approval | null;
  onConfirm: (invoiceId: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDone, setIsDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset to a fresh reason-selection step each time the dialog opens for
  // a (possibly different) invoice, rather than carrying over the last
  // one's state.
  React.useEffect(() => {
    if (open) {
      setReason("");
      setIsDone(false);
      setError(null);
    }
  }, [open]);

  const config = CONFIG[kind];
  const Icon = config.icon;
  const failingRows = approval?.rows.filter((r) => !r.match) ?? [];

  async function handleConfirm() {
    if (!approval || !reason) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(approval.invoiceId, reason);
      setIsDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record decision");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {isDone ? (
          <>
            <DialogHeader>
              <DialogTitle className={config.color}>
                <CheckCircle2 size={20} /> {config.successTitle}
              </DialogTitle>
              <DialogDescription>{config.successMessage}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className={config.color}>
                <Icon size={20} /> {config.title}
              </DialogTitle>
              <DialogDescription>
                {approval?.invoiceId} · {approval?.supplier}
              </DialogDescription>
            </DialogHeader>

            {failingRows.length > 0 && (
              <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Rule(s) violated
                </p>
                <ul className="mt-1 space-y-1">
                  {failingRows.map((r) => (
                    <li key={r.label} className="flex items-start gap-1.5 text-red-700 dark:text-red-400">
                      <XCircle size={11} className="mt-0.5 shrink-0" />
                      <span>{describeCheck(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-medium text-foreground">Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {config.reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant={config.confirmVariant} onClick={handleConfirm} disabled={!reason || isSubmitting}>
                {isSubmitting ? config.confirmingLabel : config.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
