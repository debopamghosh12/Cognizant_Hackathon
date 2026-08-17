"use client";
import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ApprovalCard } from "@/components/shared/approval-card";
import { PaymentApprovedDialog } from "@/components/shared/payment-approved-dialog";
import { DecisionDialog, type DecisionKind } from "@/components/shared/decision-dialog";
import type { Approval, PurchaseOrder, PaymentConfirmation } from "@/lib/data";
import { getApprovals, getPurchaseOrders, approveInvoiceForPayment, postApprovalDecision } from "@/lib/api";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);
  const [paymentInfo, setPaymentInfo] = React.useState<PaymentConfirmation | null>(null);
  const [approveError, setApproveError] = React.useState<string | null>(null);

  const [decisionKind, setDecisionKind] = React.useState<DecisionKind | null>(null);
  const [decisionApproval, setDecisionApproval] = React.useState<Approval | null>(null);

  const loadApprovals = React.useCallback(() => getApprovals().then(setApprovals), []);

  React.useEffect(() => {
    Promise.all([loadApprovals(), getPurchaseOrders().then(setPurchaseOrders)]).finally(() => setIsLoading(false));
  }, [loadApprovals]);

  // Same action, same Approved_For_Payment status, same confirmation
  // dialog the 3-Way Matching page's "Approve for Payment" button uses --
  // see lib/api.ts::approveInvoiceForPayment(). The difference here is
  // context, not mechanism: this button only ever appears on an invoice
  // that's already Flagged_For_Review, so clicking it is a human
  // reviewing the real discrepancy (shown in the card's "View details")
  // and approving anyway.
  async function handleApprove(approval: Approval) {
    const po = purchaseOrders.find((p) => p.id === approval.poId);
    if (!po) {
      setApproveError(`Could not find purchase order ${approval.poId} for ${approval.invoiceId}.`);
      return;
    }
    setApproveError(null);
    try {
      const confirmation = await approveInvoiceForPayment(approval.invoiceId, po, approval.amount);
      await loadApprovals();
      setPaymentInfo(confirmation);
      setIsPaymentDialogOpen(true);
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : `Failed to approve ${approval.invoiceId} for payment.`);
    }
  }

  function handleRequestReject(approval: Approval) {
    setDecisionKind("reject");
    setDecisionApproval(approval);
  }

  function handleRequestEscalate(approval: Approval) {
    setDecisionKind("escalate");
    setDecisionApproval(approval);
  }

  // Reason is captured and shown in the confirmation, but there's no
  // dedicated column for it on the invoices table -- this is the same
  // approve/reject/escalate decision mechanism as before, not a new one,
  // so it isn't persisted server-side beyond that.
  async function handleConfirmDecision(invoiceId: string, _reason: string) {
    if (!decisionKind) return;
    await postApprovalDecision(invoiceId, decisionKind);
    // A decided invoice's match_status is no longer Flagged_For_Review, so
    // it naturally drops out of getApprovals()'s filter on refetch.
    await loadApprovals();
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Approvals"
        description="AI-scored invoice approvals awaiting your decision"
      />

      {approveError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30">
          {approveError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {approvals.map((a) => (
          <ApprovalCard
            key={a.id}
            approval={a}
            onApprove={handleApprove}
            onRequestReject={handleRequestReject}
            onRequestEscalate={handleRequestEscalate}
          />
        ))}
        {approvals.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading approvals..." : "No invoices awaiting review."}
          </p>
        )}
      </div>

      <PaymentApprovedDialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen} paymentInfo={paymentInfo} />

      {decisionKind && (
        <DecisionDialog
          kind={decisionKind}
          open={decisionApproval !== null}
          onOpenChange={(open) => {
            if (!open) setDecisionApproval(null);
          }}
          approval={decisionApproval}
          onConfirm={handleConfirmDecision}
        />
      )}
    </div>
  );
}
