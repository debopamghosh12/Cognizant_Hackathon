import { NextResponse } from "next/server";

const PO_GENERATION_API_URL = process.env.PO_GENERATION_API_URL ?? "http://localhost:8001";

export async function POST(request: Request) {
  const body = await request.text();

  const res = await fetch(`${PO_GENERATION_API_URL}/generate-po`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
