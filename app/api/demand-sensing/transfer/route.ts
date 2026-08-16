import { NextResponse } from "next/server";

const DEMAND_SENSING_API_URL = process.env.DEMAND_SENSING_API_URL ?? "http://localhost:8003";

export async function POST(request: Request) {
  const body = await request.text();

  let res: Response;
  try {
    res = await fetch(`${DEMAND_SENSING_API_URL}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        error: `Could not reach the Demand Sensing service at ${DEMAND_SENSING_API_URL}. ` +
          "Make sure it's running: uvicorn demand_sensing.main:app --port 8003 (from the repo root).",
      },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
