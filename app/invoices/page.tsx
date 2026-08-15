"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Download, FileText, ChevronDown, Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { UploadWidget } from "@/components/shared/upload-widget";
import { InvoiceDocument, type InvoiceDocumentData } from "@/components/invoices/invoice-document";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { InvoiceRecord, Delivery } from "@/lib/data";
import {
  getInvoices,
  getDeliveries,
  generateInvoice,
  runInvoiceOcr,
  submitOcrInvoice,
  type ParsedInvoiceFields,
  type ConfirmedInvoiceFields,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useGlobalSearch } from "@/components/layout/search-context";

type OcrFieldKey = "quantityOrdered" | "quantityReceived" | "pricePerUnit" | "totalAmount";
const OCR_FIELD_LABELS: Record<OcrFieldKey, string> = {
  quantityOrdered: "Quantity Ordered",
  quantityReceived: "Quantity Received",
  pricePerUnit: "Price Per Unit",
  totalAmount: "Total Amount",
};

// No tax/address/due-date fields exist anywhere in this app's data model
// (purchase_orders/goods_receipts/invoices tables), so those go in as
// honest "not tracked" placeholders rather than invented values -- same
// convention already used for the PO document's blank supplier fields.
const NOT_TRACKED = "Not tracked in current data model";

function buildInvoiceDocumentData(
  invoice: InvoiceRecord,
  po: Delivery | null,
  confirmed: ConfirmedInvoiceFields,
  sourceFile: File | null
): InvoiceDocumentData {
  return {
    invoiceNumber: invoice.id,
    poNumber: invoice.poId,
    supplier: po?.supplier ?? invoice.supplier,
    supplierAddress: NOT_TRACKED,
    billTo: "Cognizant P2P",
    billToAddress: po?.destinationDC ? `Destination DC: ${po.destinationDC}` : NOT_TRACKED,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: NOT_TRACKED,
    sourceFile: sourceFile?.name,
    items: [
      {
        description: po?.item ?? "Item",
        sku: po?.id,
        quantity: confirmed.quantity_received,
        unitPrice: confirmed.price_per_unit,
        amount: confirmed.total_amount,
      },
    ],
    taxAmount: 0,
  };
}

export default function InvoicesPage() {
  const router = useRouter();
  const { query } = useGlobalSearch();
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState<string | null>(null);

  // Upload Invoice (real OCR) -- a second, additional path alongside
  // Generate Invoice above. None of this state touches isGenerating/genError.
  const [showUpload, setShowUpload] = React.useState(false);
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [isRunningOcr, setIsRunningOcr] = React.useState(false);
  const [ocrError, setOcrError] = React.useState<string | null>(null);
  const [ocrResult, setOcrResult] = React.useState<{ rawText: string; parsed: ParsedInvoiceFields } | null>(null);
  const [ocrFields, setOcrFields] = React.useState<Record<OcrFieldKey, string>>({
    quantityOrdered: "",
    quantityReceived: "",
    pricePerUnit: "",
    totalAmount: "",
  });
  const [selectedPoId, setSelectedPoId] = React.useState("");
  const [isSubmittingOcr, setIsSubmittingOcr] = React.useState(false);
  const [ocrSubmitError, setOcrSubmitError] = React.useState<string | null>(null);
  const [ocrOutcome, setOcrOutcome] = React.useState<
    { invoice: InvoiceRecord; po: Delivery | null; confirmed: ConfirmedInvoiceFields } | null
  >(null);

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

  const filteredInvoices = invoices.filter((inv) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.id.toLowerCase().includes(q) ||
      inv.poId.toLowerCase().includes(q) ||
      inv.supplier.toLowerCase().includes(q)
    );
  });

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

  function resetUploadPanel() {
    setUploadedFile(null);
    setOcrError(null);
    setOcrResult(null);
    setOcrFields({ quantityOrdered: "", quantityReceived: "", pricePerUnit: "", totalAmount: "" });
    setSelectedPoId("");
    setOcrSubmitError(null);
    setOcrOutcome(null);
  }

  async function handleFileProcessed(file: File) {
    setUploadedFile(file);
    setIsRunningOcr(true);
    setOcrError(null);
    setOcrResult(null);
    setOcrSubmitError(null);
    setOcrOutcome(null);

    try {
      const result = await runInvoiceOcr(file);
      setOcrResult(result);
      setOcrFields({
        quantityOrdered: result.parsed.quantityOrdered != null ? String(result.parsed.quantityOrdered) : "",
        quantityReceived: result.parsed.quantityReceived != null ? String(result.parsed.quantityReceived) : "",
        pricePerUnit: result.parsed.pricePerUnit != null ? String(result.parsed.pricePerUnit) : "",
        totalAmount: result.parsed.totalAmount != null ? String(result.parsed.totalAmount) : "",
      });

      // Auto-match the OCR'd PO reference against the same eligible-PO list
      // Generate Invoice uses; falls back to manual selection if no match.
      if (result.parsed.poReference) {
        const normalized = result.parsed.poReference.trim().toLowerCase();
        const matched = eligiblePOs.find((d) => d.id.trim().toLowerCase() === normalized);
        setSelectedPoId(matched ? matched.id : "");
      } else {
        setSelectedPoId("");
      }
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "OCR extraction failed");
    } finally {
      setIsRunningOcr(false);
    }
  }

  async function handleConfirmMatch() {
    setOcrSubmitError(null);

    if (!selectedPoId) {
      setOcrSubmitError("Select a purchase order to match this invoice against.");
      return;
    }

    const confirmed = {
      quantity_ordered: parseFloat(ocrFields.quantityOrdered),
      quantity_received: parseFloat(ocrFields.quantityReceived),
      price_per_unit: parseFloat(ocrFields.pricePerUnit),
      total_amount: parseFloat(ocrFields.totalAmount),
    };
    if (Object.values(confirmed).some((v) => Number.isNaN(v))) {
      setOcrSubmitError("All four fields must be filled in with valid numbers before confirming.");
      return;
    }

    setIsSubmittingOcr(true);
    try {
      const invoice = await submitOcrInvoice(selectedPoId, confirmed);
      const matchedPo = eligiblePOs.find((d) => d.id === selectedPoId) ?? null;
      setOcrOutcome({ invoice, po: matchedPo, confirmed });
      await loadAll();
    } catch (e) {
      setOcrSubmitError(e instanceof Error ? e.message : "Failed to submit invoice");
    } finally {
      setIsSubmittingOcr(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Invoice Processing (OCR)"
        description="Real invoices extracted and validated by the OCR pipeline"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowUpload((v) => !v);
                if (showUpload) resetUploadPanel();
              }}
            >
              {showUpload ? <X size={15} /> : <Upload size={15} />}
              {showUpload ? "Close" : "Upload Invoice"}
            </Button>
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
          </div>
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
            Use <strong>Generate Invoice</strong> to create an invoice from a received PO&apos;s own numbers, or{" "}
            <strong>Upload Invoice</strong> to run a real invoice photo/scan through OCR and match it to a PO
            yourself. The legacy OCR pipeline (<code className="text-xs">python src/main.py</code> against{" "}
            <code className="text-xs">data/sample_invoices/</code>) still exists separately and isn&apos;t
            wired into this flow.
          </p>
        </CardContent>
      </Card>

      {showUpload && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Upload Invoice</CardTitle>
            <CardDescription>
              Real OCR extraction via Google Cloud Vision — review and correct every field before it&apos;s
              matched against a PO.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!ocrResult && (
              <UploadWidget onFileProcessed={handleFileProcessed} processing={isRunningOcr} />
            )}

            {ocrError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p>{ocrError}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={resetUploadPanel}>
                    Try another file
                  </Button>
                </div>
              </div>
            )}

            {ocrOutcome && (
              <div className="space-y-3">
                {ocrOutcome.invoice.status === "Matched" ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Invoice <strong>{ocrOutcome.invoice.id}</strong> matched and approved. Printable document
                      below.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Invoice <strong>{ocrOutcome.invoice.id}</strong> was flagged for review (discrepancy
                      against the PO/goods receipt) — see it in{" "}
                      <a href="/approvals" className="font-medium underline">
                        Approvals
                      </a>
                      .
                    </p>
                  </div>
                )}

                {ocrOutcome.invoice.status === "Matched" && (
                  <InvoiceDocument
                    data={buildInvoiceDocumentData(ocrOutcome.invoice, ocrOutcome.po, ocrOutcome.confirmed, uploadedFile)}
                  />
                )}

                <Button size="sm" variant="outline" onClick={resetUploadPanel}>
                  Upload another invoice
                </Button>
              </div>
            )}

            {ocrResult && !ocrOutcome && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Raw OCR Text
                  </p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 text-xs">
                    {ocrResult.rawText}
                  </pre>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Extracted Fields — review &amp; correct
                  </p>
                  {(Object.keys(OCR_FIELD_LABELS) as OcrFieldKey[]).map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-muted-foreground">{OCR_FIELD_LABELS[key]}</label>
                      <Input
                        type="number"
                        value={ocrFields[key]}
                        placeholder={ocrResult.parsed[key] == null ? "Not confidently extracted — enter manually" : undefined}
                        onChange={(e) => setOcrFields((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Purchase Order {ocrResult.parsed.poReference && `(OCR read "${ocrResult.parsed.poReference}")`}
                    </label>
                    <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a PO to match against" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligiblePOs.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.id} — {d.item} ({d.supplier})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {eligiblePOs.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">No POs awaiting an invoice.</p>
                    )}
                  </div>

                  {ocrSubmitError && <p className="text-sm text-red-600">{ocrSubmitError}</p>}

                  <Button size="sm" onClick={handleConfirmMatch} disabled={isSubmittingOcr}>
                    {isSubmittingOcr ? "Matching..." : "Confirm & Match"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            {filteredInvoices.map((inv) => (
              <TableRow
                key={inv.id}
                onClick={() => router.push(`/matching?invoice=${inv.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium text-primary-700 dark:text-primary-400">{inv.id}</TableCell>
                <TableCell>{inv.supplier}</TableCell>
                <TableCell className="text-muted-foreground">{inv.poId}</TableCell>
                <TableCell>{inv.quantity !== null ? inv.quantity.toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right font-medium">
                  {inv.amount !== null ? formatCurrency(inv.amount) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={inv.status} />
                    {inv.isPredictiveAnomaly && (
                      <span title={inv.predictiveAnomalyReason ?? undefined}>
                        <StatusBadge status="Predictive Anomaly" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
            {filteredInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {isLoading ? "Loading invoices..." : query ? "No invoices match your search." : "No invoices processed yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
