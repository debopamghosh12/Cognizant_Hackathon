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
import type { InvoiceRecord, Delivery, PurchaseOrder, Supplier } from "@/lib/data";
import {
  getInvoices,
  getDeliveries,
  getPurchaseOrders,
  getInvoiceMatches,
  getRequisitions,
  getSupplierForPO,
  generateInvoice,
  runInvoiceOcr,
  submitOcrInvoice,
  type ParsedInvoiceFields,
  type ConfirmedInvoiceFields,
  type InvoiceMatch,
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

// Reuses the PO PDF's exact visual system (handleDownloadPO() in
// app/purchase-orders/page.tsx -- same letterhead/fonts/table CSS, same
// Blob+anchor download technique, not a second PDF pipeline) so the two
// documents read as belonging to the same system. Framed as a "Matched
// Invoice Record" rather than "the invoice" -- the real invoice document
// comes from the supplier; this is this system's own record confirming
// the 3-way match that cleared it for payment, built from the invoice's
// own recorded quantity/amount (not silently substituted with the PO's),
// so a legitimate partial/adjusted match still shows what was actually
// verified.
function buildMatchedRecordHtml(
  invoice: InvoiceRecord,
  po: PurchaseOrder,
  match: InvoiceMatch | null,
  supplier: Supplier | null,
  itemDescription: string
): string {
  const rows = match?.rows ?? [];
  const matchScore = rows.length > 0 ? Math.round((rows.filter((r) => r.match).length / rows.length) * 100) : 0;
  const stampColor = "#16a34a"; // only ever generated for Matched / Approved for Payment

  // Real recorded values from the invoice itself, not re-derived from the
  // PO -- price_per_unit/quantity_received were previously fetched but
  // dropped by transformInvoice() (see lib/data.ts), exposed now for
  // exactly this document.
  const quantity = invoice.quantityReceived ?? invoice.quantity ?? 0;
  const unitPrice = invoice.pricePerUnit ?? (quantity > 0 ? (invoice.amount ?? 0) / quantity : 0);
  const formattedUnitPrice = formatCurrency(unitPrice, "INR", 4);
  const formattedTotal = formatCurrency(invoice.amount ?? 0);
  const verifiedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const matchRowsHtml = rows
    .map((r) => {
      const mainRow = `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.po}</td>
            <td class="num">${r.gr}</td>
            <td class="num">${r.invoice}</td>
            <td class="num" style="font-weight:700; color:${r.match ? "#16a34a" : "#dc2626"};">${r.match ? "PASS" : "FAIL"}</td>
          </tr>`;
      // r.expected only exists on Total Amount Reconciliation -- a
      // CALCULATED figure (PO's unit price x the invoice's own claimed
      // quantity received), not the PO's real total shown in the row
      // above. Shown as its own labeled sub-row so it's never mistaken
      // for source data.
      const expectedRow = r.expected
        ? `
          <tr>
            <td colspan="4" style="font-style:italic; color:#64748b; font-size:11px; border-top:none;">Expected at PO rate (calculated): ${r.expected}</td>
            <td style="border-top:none;"></td>
          </tr>`
        : "";
      return mainRow + expectedRow;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${invoice.id}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  * { box-sizing: border-box; }
  .document {
    font-family: Georgia, 'Times New Roman', Times, serif;
    color: #1a1a1a; margin: 0 auto; padding: 0; font-size: 12.5px; line-height: 1.5;
    max-width: 800px;
  }
  .sans { font-family: system-ui, sans-serif; }

  .letterhead {
    display: flex; align-items: flex-start; justify-content: space-between;
    border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 18px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark {
    width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
    background: linear-gradient(135deg, #2563eb, #1e40af); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 15px;
  }
  .brand-name { font-size: 15px; font-weight: 700; color: #1e40af; }
  .brand-address { font-size: 10.5px; color: #64748b; margin-top: 1px; }
  .letterhead-right { text-align: right; font-size: 10px; color: #64748b; }

  .doc-title-row { text-align: center; margin: 6px 0 20px; }
  .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 0.3em; margin: 0; }

  .supplier-block {
    background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;
    padding: 14px 18px; margin-bottom: 18px;
  }
  .supplier-block-title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    color: #1e40af; font-weight: 700; margin: 0 0 10px;
  }
  .supplier-grid { display: flex; gap: 24px; }
  .supplier-col { flex: 1; }
  .kv { display: flex; justify-content: space-between; padding: 2px 0; }
  .kv .label { color: #555; }
  .kv .value { font-weight: 600; text-align: right; }

  .address-block { display: flex; gap: 16px; margin-bottom: 18px; }
  .address-box { flex: 1; border: 1px solid #d4d4d8; border-radius: 6px; overflow: hidden; }
  .address-box-header {
    background: #1e40af; color: #fff; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; font-weight: 700; padding: 7px 14px;
  }
  .address-box-body { padding: 12px 14px; font-size: 12px; }
  .address-box-body .placeholder-note { display: block; margin-top: 6px; font-size: 9.5px; color: #94a3b8; font-style: italic; }

  .line-items { margin-bottom: 4px; }
  table.items { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.items th {
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em;
    text-align: left; color: #fff; background: #1e40af; padding: 8px 9px;
    border: 1px solid #1e40af;
  }
  table.items th.num, table.items td.num { text-align: right; }
  table.items td { padding: 9px; border: 1px solid #d4d4d8; }

  .totals { display: flex; justify-content: flex-end; margin: 10px 0 22px; }
  .totals table { border-collapse: collapse; font-size: 12.5px; min-width: 240px; }
  .totals td { padding: 4px 10px; }
  .totals td:first-child { color: #555; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .totals tr.grand td { border-top: 2px solid #1a1a1a; font-size: 16px; font-weight: 700; padding-top: 8px; }

  .match-summary {
    display: flex; justify-content: space-between; font-size: 11.5px; color: #333;
    border-top: 1px solid #bfdbfe; padding-top: 8px; margin-top: 10px;
  }
  .match-summary strong { color: #1a1a1a; }

  .watermark {
    padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 9px;
    color: #a3a3a3; text-align: center; font-style: italic;
  }

  table.items, .supplier-block { page-break-inside: avoid; }

  @media print {
    body { padding: 0; }
    .document { max-width: none; }
  }
</style></head>
<body>
  <div class="document sans">
    <div class="letterhead">
      <div class="brand">
        <div class="brand-mark">CP</div>
        <div>
          <div class="brand-name">Cognizant P2P — Autonomous Procurement</div>
          <div class="brand-address">Autonomous Procurement Division</div>
        </div>
      </div>
      <div class="letterhead-right">
        <div class="stamp sans" style="display:inline-block; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; border:2.5px solid ${stampColor}; color:${stampColor}; border-radius:6px; padding:6px 14px; transform:rotate(-3deg);">${invoice.status}</div>
      </div>
    </div>

    <div class="doc-title-row">
      <p class="doc-title">MATCHED INVOICE RECORD</p>
    </div>

    <div class="supplier-block">
      <p class="supplier-block-title">Supplier Information</p>
      <div class="supplier-grid">
        <div class="supplier-col">
          <div class="kv"><span class="label">Supplier Name</span><span class="value">${supplier?.name ?? "—"}</span></div>
          <div class="kv"><span class="label">Supplier Code</span><span class="value">${po.supplier}</span></div>
          <div class="kv"><span class="label">Category</span><span class="value">${supplier?.category ?? "—"}</span></div>
          <!-- Address/Email/GSTIN don't exist in our supplier data model --
               left blank on purpose, not a fabricated placeholder. -->
          <div class="kv"><span class="label">Address</span><span class="value"></span></div>
          <div class="kv"><span class="label">Email</span><span class="value"></span></div>
          <div class="kv"><span class="label">GSTIN</span><span class="value"></span></div>
        </div>
        <div class="supplier-col">
          <div class="kv"><span class="label">Invoice No.</span><span class="value">${invoice.id}</span></div>
          <div class="kv"><span class="label">Linked PO</span><span class="value">${po.id}</span></div>
          <div class="kv"><span class="label">Linked GR</span><span class="value">${match?.gr_id ?? "—"}</span></div>
        </div>
      </div>
    </div>

    <div class="address-block">
      <div class="address-box">
        <div class="address-box-header">Bill To</div>
        <div class="address-box-body">
          Cognizant P2P — Autonomous Procurement<br>
          Accounts Payable Department
          <span class="placeholder-note">Placeholder — no billing address tracked in current data model</span>
        </div>
      </div>
      <div class="address-box">
        <div class="address-box-header">Ship To</div>
        <div class="address-box-body">
          ${po.destinationDC}
          <span class="placeholder-note">Real field — requisition's destination DC</span>
        </div>
      </div>
    </div>

    <div class="line-items">
      <table class="items">
        <thead>
          <tr>
            <th>S.No</th>
            <th>SKU</th>
            <th>Item Description</th>
            <th class="num">Quantity</th>
            <th class="num">Units</th>
            <th class="num">Unit Price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>${po.items}</td>
            <td>${itemDescription}</td>
            <td class="num">${quantity.toLocaleString()}</td>
            <td class="num">units</td>
            <td class="num">${formattedUnitPrice}</td>
            <td class="num">${formattedTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="supplier-block">
      <p class="supplier-block-title">3-Way Match Verification</p>
      ${
        rows.length > 0
          ? `<table class="items" style="margin-bottom:10px;">
        <thead>
          <tr>
            <th>Check</th>
            <th class="num">PO</th>
            <th class="num">GR</th>
            <th class="num">Invoice</th>
            <th class="num">Result</th>
          </tr>
        </thead>
        <tbody>${matchRowsHtml}
        </tbody>
      </table>`
          : `<p style="font-size:11px; color:#64748b;">No comparable match data available.</p>`
      }
      <div class="match-summary">
        <span>Match Score: <strong>${matchScore}%</strong></span>
        <span>Verified on ${verifiedDate}</span>
      </div>
    </div>

    <div class="totals">
      <table>
        <tr><td>Total</td><td>${formattedTotal}</td></tr>
        <tr class="grand"><td>Grand Total</td><td>${formattedTotal}</td></tr>
      </table>
    </div>

    <p class="watermark">This is a system-generated verification record confirming a completed 3-way match between the Purchase Order, Goods Receipt, and Supplier Invoice — it is not the original invoice document issued by the supplier.</p>
  </div>
</body></html>`;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { query } = useGlobalSearch();
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState<string | null>(null);

  // Data for the Matched Invoice Record download -- same lookups
  // app/purchase-orders/page.tsx's PO PDF already does (full PO record,
  // requisition-based item description) plus the invoice's own match rows
  // (same data the 3-Way Matching page shows).
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [matches, setMatches] = React.useState<InvoiceMatch[]>([]);
  const [itemNameByReqId, setItemNameByReqId] = React.useState<Map<string, string>>(new Map());
  const [downloadingRecordId, setDownloadingRecordId] = React.useState<string | null>(null);
  const [downloadRecordError, setDownloadRecordError] = React.useState<string | null>(null);

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
    getPurchaseOrders().then(setPurchaseOrders);
    getInvoiceMatches().then(setMatches);
    getRequisitions().then((reqs) => setItemNameByReqId(new Map(reqs.map((r) => [r.id, r.itemName]))));
  }, [loadAll]);

  // Supplier is resolved lazily per-download (not preloaded for every
  // invoice's PO up front) -- same on-demand pattern the PO page's "Why
  // this supplier?" panel uses.
  async function handleDownloadMatchedRecord(invoice: InvoiceRecord) {
    const po = purchaseOrders.find((p) => p.id === invoice.poId);
    if (!po) {
      setDownloadRecordError(`Could not find purchase order ${invoice.poId} for ${invoice.id}.`);
      return;
    }
    const match = matches.find((m) => m.invoice_id === invoice.id) ?? null;

    setDownloadingRecordId(invoice.id);
    setDownloadRecordError(null);
    try {
      const supplier = await getSupplierForPO(po);
      const itemDescription = itemNameByReqId.get(po.requisitionId) ?? po.items;
      const html = buildMatchedRecordHtml(invoice, po, match, supplier, itemDescription);

      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.id}-matched-record.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadRecordError(e instanceof Error ? e.message : `Failed to build the matched record for ${invoice.id}.`);
    } finally {
      setDownloadingRecordId(null);
    }
  }

  // A PO is eligible for invoice generation once it has received something
  // (Partially/Fully Received, or Over-Delivered -- still a real receipt,
  // just one 3-way matching should flag) and doesn't already have an
  // invoice -- /purchase-orders/{po_id}/generate-invoice also enforces the
  // latter server-side (409 if one already exists).
  const invoicedPoIds = new Set(invoices.map((i) => i.poId));
  const eligiblePOs = deliveries.filter(
    (d) =>
      (d.status === "Partially Received" || d.status === "Fully Received" || d.status === "Over-Delivered") &&
      !invoicedPoIds.has(d.id)
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

      {downloadRecordError && (
        <Card className="mb-4 border-red-200 dark:border-red-900">
          <CardContent className="p-3 text-sm text-red-600">{downloadRecordError}</CardContent>
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
                  <div className="flex flex-col items-start gap-1">
                    {inv.printablePath && (
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                      >
                        <Download size={12} /> PDF
                      </a>
                    )}
                    {(inv.status === "Matched" || inv.status === "Approved for Payment") && (
                      <button
                        onClick={() => handleDownloadMatchedRecord(inv)}
                        disabled={downloadingRecordId === inv.id}
                        title="Download Matched Invoice Record"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
                      >
                        <FileText size={12} /> {downloadingRecordId === inv.id ? "Preparing..." : "Matched Record"}
                      </button>
                    )}
                  </div>
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
