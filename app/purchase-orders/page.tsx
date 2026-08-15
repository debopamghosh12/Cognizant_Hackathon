"use client";
import * as React from "react";
import { Download, Send, FileText, Bot } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { PurchaseOrder, Supplier, Requisition } from "@/lib/data";
import { getPurchaseOrders, sendPurchaseOrder, getSupplierForPO, getRequisitions } from "@/lib/api";
import { getDeliveryRisk, type DeliveryRiskLevel } from "@/lib/anomaly-detection";
import { formatCurrency } from "@/lib/utils";
import { useGlobalSearch } from "@/components/layout/search-context";

const RISK_BADGE_VARIANT: Record<DeliveryRiskLevel, "success" | "warning" | "destructive"> = {
  Low: "success",
  Medium: "warning",
  High: "destructive",
};

// Status "stamp" colors for the printable PO document, mirroring
// components/shared/status-badge.tsx's variant choices for the same
// statuses (Completed=success, Sent/Acknowledged=info, Partially
// Received=warning, Cancelled=destructive, Draft=neutral) so the document
// reads consistently with the rest of the app.
const STAMP_COLOR: Record<string, string> = {
  Draft: "#64748b",
  Sent: "#2563eb",
  Acknowledged: "#2563eb",
  "Partially Received": "#d97706",
  Completed: "#16a34a",
  Cancelled: "#dc2626",
};

export default function PurchaseOrdersPage() {
  const { query } = useGlobalSearch();
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<PurchaseOrder | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null | undefined>(undefined);
  // requisitionId -> real item name (e.g. "Amoxicillin 250mg"), sourced
  // from chatbot's sku catalog via getRequisitions(). PurchaseOrder.items
  // only ever holds the sku_id (po_generation echoes requisition.sku_id
  // straight into item_name, never the human name) -- this is the fix for
  // the line-items table repeating the SKU code as its own "description".
  const [itemNameByReqId, setItemNameByReqId] = React.useState<Map<string, string>>(new Map());

  const loadPurchaseOrders = React.useCallback((preserveSelectedId?: string) => {
    return getPurchaseOrders().then((data) => {
      setPurchaseOrders(data);
      setSelected((prev) => data.find((p) => p.id === (preserveSelectedId ?? prev?.id)) ?? data[0] ?? null);
      return data;
    });
  }, []);

  React.useEffect(() => {
    loadPurchaseOrders().finally(() => setIsLoading(false));
    getRequisitions().then((reqs: Requisition[]) => {
      setItemNameByReqId(new Map(reqs.map((r) => [r.id, r.itemName])));
    });
  }, [loadPurchaseOrders]);

  function getItemDescription(po: PurchaseOrder): string {
    return itemNameByReqId.get(po.requisitionId) ?? po.items;
  }

  React.useEffect(() => {
    if (!selected) return;
    setSelectedSupplier(undefined);
    getSupplierForPO(selected).then(setSelectedSupplier);
  }, [selected]);

  // Same client-side Blob + anchor pattern already used for CSV export on
  // the Requisitions page -- no backend PDF pipeline exists for POs (only
  // invoices have one, via the legacy OCR script's ReportLab generator,
  // and even that's dormant for synthetic invoices). This builds a clean,
  // print-ready HTML document from the PO data already on this page and
  // downloads it directly; the browser's own Print -> Save as PDF turns it
  // into an actual PDF if that's specifically what's needed.
  // FIELD PROVENANCE (so this is easy to answer for if asked):
  // REAL data: PO #, PO Date, Expected Delivery Date, Status, Supplier
  // Name/ID/Category, Reliability Score, On-time Delivery %, Payment Date
  // (uses the supplier's actual negotiated payment_terms_days from
  // data/suppliers.csv), Destination DC, Requisition ID, Item Description
  // (via getItemDescription()'s requisition lookup), Quantity, Unit
  // Price, Amount/Total.
  // PLACEHOLDERS/DEFAULTS (no such field exists in our data model --
  // noted here and repeated inline below):
  //   - Company address ("Autonomous Procurement Division") -- suppliers
  //     and our own org have no address field anywhere.
  //   - Supplier GSTIN/contact/email -- not in data/suppliers.csv at all
  //     (only id, name, category, commercial/quality/logistics metrics).
  //   - "Bill To" reusing our own org name -- POs don't track a separate
  //     billing address distinct from the requisition's destination DC.
  //   - Payment Terms ("100% against invoice") -- no payment-schedule
  //     field exists (payment_terms_days only gives net-days, used above).
  //   - Line item "Units" label -- no unit-of-measure field is persisted
  //     anywhere (chatbot's parser sees a unit word in free text but
  //     discards it before saving the requisition).
  //   - Terms & Conditions -- generic standard procurement language, not
  //     legal-team-authored text.
  function handleDownloadPO() {
    if (!selected) return;

    const itemDescription = getItemDescription(selected);
    const unitPrice = selected.quantity > 0 ? selected.amount / selected.quantity : 0;
    const stampColor = STAMP_COLOR[selected.status] ?? STAMP_COLOR.Draft;
    const poDate = new Date(selected.createdDate).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const expectedDeliveryDate = new Date(selected.expectedDelivery).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const paymentDateLine = selectedSupplier
      ? `Net ${selectedSupplier.paymentTermsDays} days from date of delivery`
      : "Net 30 days from date of delivery"; // placeholder default when supplier row isn't resolved

    const riskCallout = selectedSupplier
      ? `<div class="risk-callout risk-${getDeliveryRisk(selectedSupplier.onTimeDelivery).toLowerCase()}">
          <span class="risk-label">System-Generated Insight — Not a Formal PO Field</span>
          <span class="risk-value">Predictive Delivery Risk: ${getDeliveryRisk(selectedSupplier.onTimeDelivery)} (${selectedSupplier.onTimeDelivery}% on-time history)</span>
        </div>`
      : "";

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${selected.id}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', Times, serif;
    color: #1a1a1a; margin: 0; padding: 0; font-size: 12.5px; line-height: 1.5;
  }
  .document { max-width: 800px; margin: 0 auto; }
  .sans { font-family: system-ui, sans-serif; }

  /* Header */
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
  .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 0.4em; margin: 0; }

  /* Supplier info block */
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

  /* Bill To / Ship To */
  .address-block { display: flex; gap: 16px; margin-bottom: 18px; }
  .address-box { flex: 1; border: 1px solid #d4d4d8; border-radius: 6px; overflow: hidden; }
  .address-box-header {
    background: #1e40af; color: #fff; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; font-weight: 700; padding: 7px 14px;
  }
  .address-box-body { padding: 12px 14px; font-size: 12px; }
  .address-box-body .placeholder-note { display: block; margin-top: 6px; font-size: 9.5px; color: #94a3b8; font-style: italic; }

  /* Payment terms */
  .payment-row {
    display: flex; gap: 16px; margin-bottom: 18px; font-size: 12px;
    border-top: 1px solid #e5e5e5; border-bottom: 1px solid #e5e5e5; padding: 10px 2px;
  }
  .payment-item { flex: 1; }
  .payment-item .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 2px; }
  .payment-item .value { font-weight: 600; }

  /* Line items */
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

  /* AI risk callout */
  .risk-callout {
    font-size: 10.5px; border-radius: 6px; padding: 9px 13px;
    border: 1px solid #d4d4d8; margin-bottom: 22px; display: inline-block;
  }
  .risk-callout .risk-label { display: block; color: #64748b; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .risk-callout .risk-value { font-weight: 700; }
  .risk-callout.risk-low { border-color: #16a34a; color: #15803d; background: #f0fdf4; }
  .risk-callout.risk-medium { border-color: #d97706; color: #b45309; background: #fffbeb; }
  .risk-callout.risk-high { border-color: #dc2626; color: #b91c1c; background: #fef2f2; }

  /* Terms & conditions */
  .terms-block {
    background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;
    padding: 14px 18px; margin-bottom: 26px;
  }
  .terms-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #1e40af; font-weight: 700; margin: 0 0 8px; }
  .terms-block ol { margin: 0; padding-left: 18px; font-size: 11px; color: #333; }
  .terms-block li { margin-bottom: 4px; }

  /* Signatory footer */
  .signatory { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .signatory-box { text-align: center; width: 220px; }
  .signatory-for { font-size: 11px; font-weight: 600; margin-bottom: 34px; }
  .signatory-line { border-top: 1px solid #1a1a1a; padding-top: 4px; font-size: 10px; color: #555; }

  .watermark {
    padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 9px;
    color: #a3a3a3; text-align: center; font-style: italic;
  }

  @media print {
    body { padding: 0; }
    .document { max-width: none; }
    table.items, .payment-row, .signatory { page-break-inside: avoid; }
  }
</style></head>
<body>
  <div class="document sans">
    <div class="letterhead">
      <div class="brand">
        <div class="brand-mark">CP</div>
        <div>
          <div class="brand-name">Cognizant P2P — Autonomous Procurement</div>
          <!-- Placeholder: no real company address field in the data model -->
          <div class="brand-address">Autonomous Procurement Division</div>
        </div>
      </div>
      <div class="letterhead-right">
        <div class="stamp sans" style="display:inline-block; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; border:2.5px solid ${stampColor}; color:${stampColor}; border-radius:6px; padding:6px 14px; transform:rotate(-3deg);">${selected.status}</div>
      </div>
    </div>

    <div class="doc-title-row">
      <p class="doc-title">PURCHASE ORDER</p>
    </div>

    <div class="supplier-block">
      <p class="supplier-block-title">Supplier Information</p>
      <div class="supplier-grid">
        <div class="supplier-col">
          <div class="kv"><span class="label">Supplier Name</span><span class="value">${selectedSupplier?.name ?? "—"}</span></div>
          <div class="kv"><span class="label">Supplier Code</span><span class="value">${selected.supplier}</span></div>
          <div class="kv"><span class="label">Category</span><span class="value">${selectedSupplier?.category ?? "—"}</span></div>
          <div class="kv"><span class="label">Reliability Score</span><span class="value">${selectedSupplier ? `${selectedSupplier.reliabilityScore}/100` : "—"}</span></div>
          <div class="kv"><span class="label">On-time Delivery</span><span class="value">${selectedSupplier ? `${selectedSupplier.onTimeDelivery}%` : "—"}</span></div>
        </div>
        <div class="supplier-col">
          <div class="kv"><span class="label">PO No.</span><span class="value">${selected.id}</span></div>
          <div class="kv"><span class="label">PO Date</span><span class="value">${poDate}</span></div>
          <div class="kv"><span class="label">Expected Delivery</span><span class="value">${expectedDeliveryDate}</span></div>
        </div>
      </div>
    </div>

    <div class="address-block">
      <div class="address-box">
        <div class="address-box-header">Bill To</div>
        <div class="address-box-body">
          Cognizant P2P — Autonomous Procurement<br>
          ${selected.destinationDC}
          <span class="placeholder-note">Placeholder: no separate billing address tracked</span>
        </div>
      </div>
      <div class="address-box">
        <div class="address-box-header">Ship To</div>
        <div class="address-box-body">
          ${selected.destinationDC}
          <span class="placeholder-note">Real field — requisition's destination DC</span>
        </div>
      </div>
    </div>

    <div class="payment-row">
      <div class="payment-item">
        <span class="label">Payment Date</span>
        <span class="value">${paymentDateLine}</span>
      </div>
      <div class="payment-item">
        <span class="label">Payment Terms</span>
        <span class="value">100% against invoice</span>
        <span class="placeholder-note" style="display:block;">Placeholder — no payment-schedule field tracked</span>
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
            <td>${selected.items}</td>
            <td>${itemDescription}</td>
            <td class="num">${selected.quantity.toLocaleString()}</td>
            <td class="num">units</td>
            <td class="num">${formatCurrency(unitPrice)}</td>
            <td class="num">${formatCurrency(selected.amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="totals">
      <table>
        <tr><td>Total</td><td>${formatCurrency(selected.amount)}</td></tr>
        <!-- No tax/discount data available in this system -- Total = Grand Total -->
        <tr class="grand"><td>Grand Total</td><td>${formatCurrency(selected.amount)}</td></tr>
      </table>
    </div>

    ${riskCallout}

    <div class="terms-block">
      <h3>Terms &amp; Conditions</h3>
      <ol>
        <li>Buyer reserves the right to cancel this Purchase Order at no cost prior to shipment confirmation by the Supplier.</li>
        <li>All invoices submitted against this order must reference PO #${selected.id}.</li>
        <li>Goods delivered must match the specifications, quantity, and SKU agreed in this Purchase Order.</li>
        <li>Delivery is expected within the window ending ${expectedDeliveryDate}; delays must be communicated in advance.</li>
      </ol>
    </div>

    <div class="signatory">
      <div class="signatory-box">
        <div class="signatory-for">For Cognizant P2P — Autonomous Procurement</div>
        <div class="signatory-line">Authorized Signatory</div>
      </div>
    </div>

    ${selected.autoGenerated ? '<p class="watermark">Auto-generated by AI Agent — Cognizant Autonomous Procure-to-Pay System</p>' : ""}
  </div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSendToSupplier() {
    if (!selected) return;
    setIsSending(true);
    try {
      await sendPurchaseOrder(selected.id);
      await loadPurchaseOrders(selected.id);
    } finally {
      setIsSending(false);
    }
  }

  const filteredPOs = purchaseOrders.filter((po) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return po.id.toLowerCase().includes(q) || po.supplier.toLowerCase().includes(q) || po.items.toLowerCase().includes(q);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Purchase Orders"
        description={`${purchaseOrders.length} purchase orders • ${purchaseOrders.filter((p) => p.autoGenerated).length} auto-generated by AI`}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO ID</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.map((po) => (
                <TableRow
                  key={po.id}
                  onClick={() => setSelected(po)}
                  className={
                    "cursor-pointer " + (selected?.id === po.id ? "bg-primary-50 dark:bg-primary-500/10" : "")
                  }
                >
                  <TableCell className="font-medium text-primary-700 dark:text-primary-400">
                    <div className="flex items-center gap-1.5">
                      {po.id}
                      {po.autoGenerated && (
                        <span title="Auto-generated by AI">
                          <Bot size={12} className="text-primary-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{po.supplier}</TableCell>
                  <TableCell className="text-muted-foreground">{po.items}</TableCell>
                  <TableCell>
                    <StatusBadge status={po.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(po.amount)}</TableCell>
                </TableRow>
              ))}
              {filteredPOs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {isLoading
                      ? "Loading purchase orders..."
                      : purchaseOrders.length > 0
                      ? "No purchase orders match your search."
                      : "No purchase orders yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {selected && (
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>PO Preview</CardTitle>
                <CardDescription>{selected.id}</CardDescription>
              </div>
              <StatusBadge status={selected.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <FileText className="text-primary-600" size={20} />
                <div>
                  <p className="text-sm font-bold text-foreground">Purchase Order — {selected.id}</p>
                  <p className="text-xs text-muted-foreground">Generated {selected.createdDate}</p>
                </div>
              </div>

              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Supplier</dt>
                  <dd className="font-medium text-foreground">{selected.supplier}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Linked requisition</dt>
                  <dd className="font-medium text-foreground">{selected.requisitionId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Line item</dt>
                  <dd className="font-medium text-foreground">{getItemDescription(selected)} ({selected.items})</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Quantity</dt>
                  <dd className="font-medium text-foreground">{selected.quantity.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Expected delivery</dt>
                  <dd className="font-medium text-foreground">{selected.expectedDelivery}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Predictive Delivery Risk</dt>
                  <dd>
                    {selectedSupplier === undefined ? (
                      <span className="text-foreground">…</span>
                    ) : selectedSupplier === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={RISK_BADGE_VARIANT[getDeliveryRisk(selectedSupplier.onTimeDelivery)]}>
                        {getDeliveryRisk(selectedSupplier.onTimeDelivery)} ({selectedSupplier.onTimeDelivery}% on-time)
                      </Badge>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-sm">
                  <dt className="font-semibold text-foreground">Total amount</dt>
                  <dd className="font-bold text-primary-700 dark:text-primary-400">{formatCurrency(selected.amount)}</dd>
                </div>
              </dl>

              {selected.autoGenerated && (
                <Badge variant="info" className="mt-3">
                  <Bot size={12} /> Auto-generated by AI Agent
                </Badge>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button className="flex-1" variant="outline" onClick={handleDownloadPO}>
                <Download size={15} /> Download PO
              </Button>
              <Button
                className="flex-1"
                onClick={handleSendToSupplier}
                disabled={selected.status !== "Draft" || isSending}
              >
                <Send size={15} /> {selected.status !== "Draft" ? "Sent" : isSending ? "Sending..." : "Send to Supplier"}
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
