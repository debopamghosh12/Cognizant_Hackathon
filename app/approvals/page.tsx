"use client";
import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ApprovalCard } from "@/components/shared/approval-card";
import type { Approval } from "@/lib/data";
import { getApprovals, postApprovalDecision } from "@/lib/api";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadApprovals = React.useCallback(() => getApprovals().then(setApprovals), []);

  React.useEffect(() => {
    loadApprovals().finally(() => setIsLoading(false));
  }, [loadApprovals]);

  async function handleDecision(invoiceId: string, action: "approve" | "reject" | "escalate") {
    await postApprovalDecision(invoiceId, action);
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} onDecision={handleDecision} />
        ))}
        {approvals.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading approvals..." : "No invoices awaiting review."}
          </p>
        )}
      </div>
    </div>
  );
}
