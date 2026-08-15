"use client";
import * as React from "react";
import {
  CheckCircle2,
  Hash,
  Building2,
  ClipboardList,
  Package,
  IndianRupee,
  Percent,
  CalendarDays,
  Printer,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { UploadWidget } from "@/components/shared/upload-widget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { InvoiceDocument, type InvoiceDocumentData } from "@/components/invoices/invoice-document";
import { invoices } from "@/lib/data";
import { formatCurrency, cn } from "@/lib/utils";

const extracted = {
  invoiceNumber: "INV-205",
  supplier: "MedSource Pharmaceuticals",
  poNumber: "PO-88231",
  quantity: 1200,
  amount: 8160,
  tax: 408,
  invoiceDate: "2026-08-14",
};

export default function InvoicesPage() {
  const [processing, setProcessing] = React.useState(false);
  const [showResult, setShowResult] = React.useState(false);
  const [confidence] = React.useState(97.8);
  const [sourceFile, setSourceFile] = React.useState<string | null>(null);

  function handleUpload(fileName: string) {
    setSourceFile(fileName);
    setShowResult(false);
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setShowResult(true);
    }, 1800);
  }

  function handlePrint() {
    window.print();
  }

  const fields = [
    { label: "Invoice Number", value: extracted.invoiceNumber, icon: Hash },
    { label: "Supplier", value: extracted.supplier, icon: Building2 },
    { label: "PO Number", value: extracted.poNumber, icon: ClipboardList },
    { label: "Quantity", value: extracted.quantity.toLocaleString(), icon: Package },
    { label: "Amount", value: formatCurrency(extracted.amount), icon: IndianRupee },
    { label: "Tax", value: formatCurrency(extracted.tax), icon: Percent },
    { label: "Invoice Date", value: extracted.invoiceDate, icon: CalendarDays },
  ];

  const invoiceDocData: InvoiceDocumentData = {
    invoiceNumber: extracted.invoiceNumber,
    poNumber: extracted.poNumber,
    supplier: extracted.supplier,
    supplierAddress: "Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 380015",
    billTo: "Cognizant Autonomous P2P — Delhi Central Warehouse",
    billToAddress: "Sector 18, Logistics Park, New Delhi, Delhi 110020",
    invoiceDate: extracted.invoiceDate,
    dueDate: "2026-08-28",
    sourceFile: sourceFile ?? undefined,
    items: [
      {
        description: "Paracetamol 500mg (Box of 1000)",
        sku: "MED-2201",
        quantity: extracted.quantity,
        unitPrice: Math.round((extracted.amount / extracted.quantity) * 100) / 100,
        amount: extracted.amount,
      },
    ],
    taxAmount: extracted.tax,
    notes: "Payment due within 14 days. Please reference the PO number on all remittances.",
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Invoice Processing (OCR)"
        description="Upload supplier invoices for automated field extraction and validation"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Upload Invoice</CardTitle>
            <CardDescription>AI document intelligence extracts key fields automatically</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadWidget processing={processing} onFileProcessed={handleUpload} />
          </CardContent>
        </Card>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Extracted Fields</CardTitle>
            <CardDescription>
              {showResult ? "Review OCR output before posting to matching engine" : "Upload an invoice to see extracted data"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showResult ? (
              <div className="animate-fade-in space-y-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <CheckCircle2 size={14} className="text-green-600" /> OCR Confidence
                    </span>
                    <span className="font-bold text-foreground">{confidence}%</span>
                  </div>
                  <Progress value={confidence} className="mt-2" indicatorClassName="bg-green-600" />
                </div>

                <dl className="divide-y divide-border rounded-lg border border-border">
                  {fields.map((f) => (
                    <div key={f.label} className="flex items-center justify-between px-4 py-2.5">
                      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                        <f.icon size={13} /> {f.label}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    Edit Fields
                  </Button>
                  <Button className="flex-1">Send to 3-Way Match</Button>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No invoice processed yet</p>
                <p className="mt-1 text-xs">Extracted fields will appear here once OCR completes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showResult && (
        <Card className="mt-4 animate-fade-in">
          <CardHeader className="flex-row items-center justify-between space-y-0 print:hidden">
            <div>
              <CardTitle>Printable Invoice</CardTitle>
              <CardDescription>Formatted, print-ready document generated from the extracted fields</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Download size={14} /> Download PDF
              </Button>
              <Button size="sm" onClick={handlePrint}>
                <Printer size={14} /> Print
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div id="invoice-print-area" className="rounded-lg border border-border p-3 sm:p-6 print:border-0 print:p-0">
              <InvoiceDocument data={invoiceDocData} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 print:hidden">
        <CardHeader>
          <CardTitle>Processed Invoices</CardTitle>
          <CardDescription>Recent invoice OCR history</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>PO</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>OCR Confidence</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium text-primary-700 dark:text-primary-400">{inv.id}</TableCell>
                <TableCell>{inv.supplier}</TableCell>
                <TableCell className="text-muted-foreground">{inv.poId}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(inv.amount)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          inv.ocrConfidence >= 95 ? "bg-green-600" : inv.ocrConfidence >= 90 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${inv.ocrConfidence}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{inv.ocrConfidence}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={inv.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}