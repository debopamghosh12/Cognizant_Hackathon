import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function PATCH(request: Request, { params }: { params: { invoiceId: string } }) {
  const body = await request.text();

  const res = await fetch(`${PO_GENERATION_API_URL}/invoices/${params.invoiceId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
