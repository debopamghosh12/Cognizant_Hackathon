"use client";
import * as React from "react";
import { Info, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import type { InvoiceRecord } from "@/lib/data";
import { getInvoices } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function InvoicesPage() {
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    getInvoices()
      .then(setInvoices)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Invoice Processing (OCR)"
        description="Real invoices extracted and validated by the OCR pipeline"
      />

      <Card className="mb-4">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <p>
            Invoice processing runs via the OCR pipeline (<code className="text-xs">python src/main.py</code>{" "}
            against <code className="text-xs">data/sample_invoices/</code>) — there's no upload flow in this UI.
            The table below shows real, already-processed results.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processed Invoices</CardTitle>
          <CardDescription>Invoice OCR and 3-way match history</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium text-primary-700 dark:text-primary-400">{inv.id}</TableCell>
                <TableCell>{inv.supplier}</TableCell>
                <TableCell className="text-muted-foreground">{inv.poId}</TableCell>
                <TableCell>{inv.quantity !== null ? inv.quantity.toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right font-medium">
                  {inv.amount !== null ? formatCurrency(inv.amount) : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={inv.status} />
                </TableCell>
                <TableCell>
                  {inv.printablePath && (
                    <a
                      href={`/api/invoices/${inv.id}/pdf`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      <Download size={12} /> PDF
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {isLoading ? "Loading invoices..." : "No invoices processed yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
