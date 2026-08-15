import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function POST(request: Request, { params }: { params: { poId: string } }) {
  const body = await request.text();

  const res = await fetch(`${PO_GENERATION_API_URL}/purchase-orders/${params.poId}/submit-ocr-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
