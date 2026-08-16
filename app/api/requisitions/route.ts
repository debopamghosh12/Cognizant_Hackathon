import { NextResponse } from "next/server";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL ?? "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${CHATBOT_API_URL}/requisitions`, { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json(
      { error: `chatbot backend returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

// Additive only -- proxies straight through to chatbot's POST /requisitions,
// the same documented shared-contract endpoint the chatbot itself uses to
// insert every requisition row. New requisitions from Demand Sensing land
// in the identical `requisition` table/status flow, so "Run AI Sourcing"
// treats them exactly like a chatbot-created one.
export async function POST(request: Request) {
  const body = await request.text();

  const res = await fetch(`${CHATBOT_API_URL}/requisitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
