import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function GET() {
  const res = await fetch(`${PO_GENERATION_API_URL}/invoices`, { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json(
      { error: `po_generation backend returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
