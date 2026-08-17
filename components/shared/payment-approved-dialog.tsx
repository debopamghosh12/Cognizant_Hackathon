"use client";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { PaymentConfirmation } from "@/lib/data";

// Shared by the 3-Way Matching page's "Approve for Payment" button and the
// Approvals page's "Approve" button -- one confirmation UI for the one
// Approved_For_Payment status change, regardless of which page triggered it.
export function PaymentApprovedDialog({
  open,
  onOpenChange,
  paymentInfo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentInfo: PaymentConfirmation | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-green-700 dark:text-green-400">
            <CheckCircle2 size={20} className="text-green-600" /> Payment Approved
          </DialogTitle>
          <DialogDescription>This invoice has been approved for payment.</DialogDescription>
        </DialogHeader>

        {paymentInfo && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Purchase Order</dt>
              <dd className="font-medium text-foreground">{paymentInfo.poId}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Invoice</dt>
              <dd className="font-medium text-foreground">{paymentInfo.invoiceId}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-bold text-primary-700 dark:text-primary-400">
                {formatCurrency(paymentInfo.amount)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Payment Terms</dt>
              <dd className="font-medium text-foreground">
                Net {paymentInfo.paymentTermsDays ?? 30} days from date of delivery
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Payment Reference</dt>
              <dd className="font-mono font-medium text-foreground">{paymentInfo.paymentReference}</dd>
            </div>
          </dl>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
