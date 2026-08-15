import { NextResponse } from "next/server";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const body = await request.text();

  const res = await fetch(`${CHATBOT_API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
