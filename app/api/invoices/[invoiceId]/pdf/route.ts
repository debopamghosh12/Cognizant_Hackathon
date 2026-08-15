import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function GET(_request: Request, { params }: { params: { invoiceId: string } }) {
  const res = await fetch(`${PO_GENERATION_API_URL}/invoices/${params.invoiceId}/pdf`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `po_generation backend returned ${res.status}` }));
    return NextResponse.json(data, { status: res.status });
  }

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${params.invoiceId}.pdf"`,
    },
  });
}
