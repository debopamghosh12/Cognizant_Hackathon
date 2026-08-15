import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function POST(_request: Request, { params }: { params: { poId: string } }) {
  const res = await fetch(`${PO_GENERATION_API_URL}/purchase-orders/${params.poId}/send`, {
    method: "POST",
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
