import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Without this, Next.js statically pre-renders this route at build time
// (no request-dependent input to signal otherwise), baking in a stale
// snapshot of data/suppliers.csv instead of reading it fresh each request.
export const dynamic = "force-dynamic";

interface SupplierRow {
  supplier_id: string;
  supplier_name: string;
  country: string;
  gmp_certified: string;
  risk_tier: string;
  sku_id: string;
  category: string;
  unit_price: string;
  currency: string;
  minimum_order_quantity: string;
  payment_terms_days: string;
  lead_time_days: string;
  on_time_delivery_pct: string;
  fill_rate_pct: string;
  quality_score: string;
  defect_rate_pct: string;
  max_capacity_units_per_month: string;
  current_utilization_pct: string;
  valid_from: string;
  valid_to: string;
  suitability_score: string;
  is_preferred: string;
}

// data/suppliers.csv has no quoted or embedded-comma fields, so a plain
// split is sufficient -- no need for a CSV parser dependency.
function parseCsv(text: string): SupplierRow[] {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i]?.trim() ?? "";
    });
    return row as unknown as SupplierRow;
  });
}

export interface CollapsedSupplier extends SupplierRow {
  contracts: number;
}

export async function GET() {
  const csvPath = path.join(process.cwd(), "data", "suppliers.csv");
  const text = await readFile(csvPath, "utf-8");
  const rows = parseCsv(text);

  const bySupplier = new Map<string, SupplierRow[]>();
  for (const row of rows) {
    const group = bySupplier.get(row.supplier_id) ?? [];
    group.push(row);
    bySupplier.set(row.supplier_id, group);
  }

  const collapsed: CollapsedSupplier[] = Array.from(bySupplier.values()).map((group) => {
    const best = group.reduce((a, b) =>
      parseFloat(b.suitability_score) > parseFloat(a.suitability_score) ? b : a
    );
    const contracts = new Set(group.map((r) => r.sku_id)).size;
    return { ...best, contracts };
  });

  return NextResponse.json(collapsed);
}
