import { NextResponse } from "next/server";

// Set this in .env.local (already gitignored via .env*) -- no localhost
// fallback makes sense for a secret key, unlike the other routes' service
// URLs, so a missing key is treated as a real, reportable error instead.
const GOOGLE_CLOUD_VISION_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // matches UploadWidget's stated "Max file size 10MB"

export interface ParsedInvoiceFields {
  quantityOrdered: number | null;
  quantityReceived: number | null;
  pricePerUnit: number | null;
  totalAmount: number | null;
  poReference: string | null;
}

// Label-proximity heuristics, same spirit as the legacy src/extract.py's
// LABEL_PATTERNS but reimplemented here in TS -- this route never touches
// the Python/TrOCR path, it only calls Google Cloud Vision directly.
const NUMBER_RE = /[\d][\d,]*\.?\d*/;

function extractNumberNear(lines: string[], labelPatterns: RegExp[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!labelPatterns.some((p) => p.test(line))) continue;

    // Try the rest of the same line first (common "Label: 123" layout),
    // then the next line (common label-on-its-own-line layout).
    for (const candidate of [line, lines[i + 1] ?? ""]) {
      const match = candidate.match(NUMBER_RE);
      if (match) {
        const value = parseFloat(match[0].replace(/,/g, ""));
        if (!Number.isNaN(value)) return value;
      }
    }
  }
  return null;
}

function extractPoReference(text: string): string | null {
  // Matches "PO-ABC123", "PO# 12345", "PO No: XYZ-789", "Purchase Order 4567", etc.
  const match = text.match(/\b(?:P\.?O\.?|Purchase\s*Order)\s*(?:No\.?|#|:)?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
  return match ? match[1].toUpperCase() : null;
}

function parseInvoiceText(rawText: string): ParsedInvoiceFields {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return {
    quantityOrdered: extractNumberNear(lines, [/order(ed)?\s*qty/i, /qty\s*order(ed)?/i, /quantity\s*order(ed)?/i]),
    quantityReceived: extractNumberNear(lines, [/received\s*qty/i, /qty\s*received/i, /quantity\s*received/i, /delivered/i]),
    pricePerUnit: extractNumberNear(lines, [/unit\s*price/i, /price\s*\/?\s*unit/i, /rate\s*per\s*unit/i, /\brate\b/i]),
    totalAmount: extractNumberNear(lines, [/grand\s*total/i, /total\s*amount/i, /amount\s*due/i, /\btotal\b/i]),
    poReference: extractPoReference(rawText),
  };
}

export async function POST(request: Request) {
  if (!GOOGLE_CLOUD_VISION_API_KEY) {
    return NextResponse.json(
      { error: "OCR is not configured. Add GOOGLE_CLOUD_VISION_API_KEY to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let file: File;
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    file = uploaded;
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }

  let base64: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    base64 = buffer.toString("base64");
  } catch {
    return NextResponse.json({ error: "Could not process the uploaded file." }, { status: 400 });
  }

  let visionJson: unknown;
  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              // DOCUMENT_TEXT_DETECTION explicitly supports handwriting,
              // unlike basic TEXT_DETECTION -- per the requirement.
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );
    visionJson = await visionRes.json();
    if (!visionRes.ok) {
      const detail = (visionJson as { error?: { message?: string } })?.error?.message ?? `status ${visionRes.status}`;
      return NextResponse.json({ error: `Google Cloud Vision request failed: ${detail}` }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `Could not reach Google Cloud Vision: ${e.message}` : "Could not reach Google Cloud Vision." },
      { status: 502 }
    );
  }

  const responses = (visionJson as { responses?: Array<Record<string, unknown>> })?.responses;
  const firstResponse = responses?.[0];
  if (firstResponse?.error) {
    const detail = (firstResponse.error as { message?: string })?.message ?? "unknown error";
    return NextResponse.json({ error: `Google Cloud Vision could not process this image: ${detail}` }, { status: 422 });
  }

  const rawText =
    (firstResponse?.fullTextAnnotation as { text?: string } | undefined)?.text ??
    (firstResponse?.textAnnotations as Array<{ description?: string }> | undefined)?.[0]?.description ??
    "";

  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "No readable text was detected in this image. Try a clearer photo or scan." },
      { status: 422 }
    );
  }

  return NextResponse.json({ rawText, parsed: parseInvoiceText(rawText) });
}
