import { PageHeader } from "@/components/shared/page-header";
import { ApprovalCard } from "@/components/shared/approval-card";
import { approvals } from "@/lib/data";

export default function ApprovalsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Approvals"
        description="AI-scored invoice approvals awaiting your decision"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} />
        ))}
      </div>
    </div>
  );
}
