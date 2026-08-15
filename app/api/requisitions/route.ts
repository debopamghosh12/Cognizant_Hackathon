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
