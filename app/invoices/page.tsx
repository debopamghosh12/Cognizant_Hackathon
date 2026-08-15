"use client";
import * as React from "react";
import { Info, Download, FileText, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { InvoiceRecord, Delivery } from "@/lib/data";
import { getInvoices, getDeliveries, generateInvoice } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function InvoicesPage() {
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState<string | null>(null);

  const loadAll = React.useCallback(async () => {
    const [inv, dels] = await Promise.all([getInvoices(), getDeliveries()]);
    setInvoices(inv);
    setDeliveries(dels);
  }, []);

  React.useEffect(() => {
    loadAll().finally(() => setIsLoading(false));
  }, [loadAll]);

  // A PO is eligible for invoice generation once it has received something
  // (Partially or Fully Received) and doesn't already have an invoice --
  // /purchase-orders/{po_id}/generate-invoice also enforces the latter
  // server-side (409 if one already exists).
  const invoicedPoIds = new Set(invoices.map((i) => i.poId));
  const eligiblePOs = deliveries.filter(
    (d) => (d.status === "Partially Received" || d.status === "Fully Received") && !invoicedPoIds.has(d.id)
  );

  async function handleGenerate(poId: string) {
    setIsGenerating(true);
    setGenError(null);
    try {
      await generateInvoice(poId);
      await loadAll();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Invoice Processing (OCR)"
        description="Real invoices extracted and validated by the OCR pipeline"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={eligiblePOs.length === 0 || isGenerating}>
                <FileText size={15} /> {isGenerating ? "Generating..." : "Generate Invoice"}
                {!isGenerating && <ChevronDown size={14} />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Generate invoice for PO</DropdownMenuLabel>
              {eligiblePOs.map((d) => (
                <DropdownMenuItem key={d.id} onClick={() => handleGenerate(d.id)}>
                  {d.id} — {d.item} ({d.supplier})
                </DropdownMenuItem>
              ))}
              {eligiblePOs.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No POs awaiting an invoice.</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {genError && (
        <Card className="mb-4 border-red-200 dark:border-red-900">
          <CardContent className="p-3 text-sm text-red-600">{genError}</CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <p>
            Use <strong>Generate Invoice</strong> above to create an invoice from a received PO&apos;s own
            numbers. The legacy OCR pipeline (<code className="text-xs">python src/main.py</code> against{" "}
            <code className="text-xs">data/sample_invoices/</code>) still exists separately and isn&apos;t
            wired into this flow.
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
