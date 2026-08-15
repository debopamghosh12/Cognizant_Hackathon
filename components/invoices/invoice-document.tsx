import { Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface InvoiceLineItem {
  description: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceDocumentData {
  invoiceNumber: string;
  poNumber: string;
  supplier: string;
  supplierAddress: string;
  billTo: string;
  billToAddress: string;
  invoiceDate: string;
  dueDate: string;
  sourceFile?: string;
  items: InvoiceLineItem[];
  taxAmount: number;
  notes?: string;
}

export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const subtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
  const total = subtotal + data.taxAmount;

  return (
    <div className="mx-auto w-full max-w-2xl bg-white p-8 text-slate-900 print:max-w-none print:p-0 print:shadow-none">
      {/* Letterhead */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Boxes size={20} />
          </div>
          <div>
            <p className="text-base font-bold leading-tight">Cognizant P2P</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Autonomous Procurement Platform
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-tight text-slate-900">Invoice</p>
          <p className="mt-0.5 text-sm font-medium text-slate-600">{data.invoiceNumber}</p>
        </div>
      </div>

      {/* Meta + parties */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bill From</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{data.supplier}</p>
          <p className="text-xs leading-relaxed text-slate-500">{data.supplierAddress}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{data.billTo}</p>
          <p className="text-xs leading-relaxed text-slate-500">{data.billToAddress}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-xs">
        <div>
          <p className="text-slate-400">Invoice Date</p>
          <p className="font-medium text-slate-900">{data.invoiceDate}</p>
        </div>
        <div>
          <p className="text-slate-400">Due Date</p>
          <p className="font-medium text-slate-900">{data.dueDate}</p>
        </div>
        <div>
          <p className="text-slate-400">Reference PO</p>
          <p className="font-medium text-slate-900">{data.poNumber}</p>
        </div>
      </div>

      {/* Line items */}
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-400">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Unit Price</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2.5">
                <p className="font-medium text-slate-900">{item.description}</p>
                {item.sku && <p className="text-[11px] text-slate-400">{item.sku}</p>}
              </td>
              <td className="py-2.5 text-right text-slate-700">{item.quantity.toLocaleString()}</td>
              <td className="py-2.5 text-right text-slate-700">{formatCurrency(item.unitPrice)}</td>
              <td className="py-2.5 text-right font-medium text-slate-900">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="ml-auto mt-4 w-56 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Tax</span>
          <span>{formatCurrency(data.taxAmount)}</span>
        </div>
        <div className="flex justify-between border-t-2 border-slate-900 pt-1.5 text-base font-bold text-slate-900">
          <span>Total Due</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 border-t border-slate-200 pt-4">
        {data.notes && <p className="text-xs leading-relaxed text-slate-500">{data.notes}</p>}
        {data.sourceFile && (
          <p className="mt-2 text-[10px] text-slate-400">
            Extracted via OCR from source file: {data.sourceFile}
          </p>
        )}
        <p className="mt-2 text-[10px] text-slate-400">
          This document was generated automatically by the Cognizant Autonomous P2P platform.
        </p>
      </div>
    </div>
  );
}