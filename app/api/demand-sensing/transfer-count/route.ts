import { NextResponse } from "next/server";

const DEMAND_SENSING_API_URL = process.env.DEMAND_SENSING_API_URL ?? "http://localhost:8003";

export async function GET() {
  let res: Response;
  try {
    res = await fetch(`${DEMAND_SENSING_API_URL}/transfer-count`, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      {
        error: `Could not reach the Demand Sensing service at ${DEMAND_SENSING_API_URL}. ` +
          "Make sure it's running: uvicorn demand_sensing.main:app --port 8003 (from the repo root).",
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `demand_sensing backend returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
