# PR2 — Requisition Chatbot

Type a plain-English purchase request → get a structured requisition row →
download it as a PDF purchase order. Feeds the same queue table P1's
auto-alerts write to.

## Run it

From the repo root:

```bash
pip install -r requirements.txt
cd chatbot
python app.py
```
Open http://localhost:8000

## Files

| File | What it does |
|---|---|
| `db.py` | SQLite schema. `sku` table (product lookup) + `requisition` table (**the shared queue**). |
| `extractor.py` | Free text -> `{sku_id, quantity, destination_dc, urgency}`. Regex-based by default; set `EXTRACTION_MODE=llm` env var + `pip install anthropic` + `ANTHROPIC_API_KEY` to use an LLM call instead. |
| `pdf_gen.py` | Renders one requisition row as a Purchase Order PDF (reportlab). |
| `app.py` | Flask routes — see below. |
| `static/index.html` | The chat UI. |

## Routes

- `POST /requisitions` — **the shared endpoint.** Give your P1 teammate this URL
  and this exact payload shape for their auto-alert path:
  ```json
  {"sku_id": "SKU-1001", "quantity": 500, "destination_dc": "Siliguri DC",
   "urgency": "HIGH", "source": "AUTO_P1"}
  ```
  `source` should be `"AUTO_P1"` for their path, `"MANUAL_CHATBOT"` is set
  automatically by `/chat`.
- `POST /chat` — `{"text": "..."}` → runs extraction, validates, inserts into
  the same table, returns the structured row.
- `GET /requisitions` — the whole queue (both sources mixed together — this is
  what your dashboard/front-end teammate should hit to show `AUTO_P1` and
  `MANUAL_CHATBOT` rows side by side).
- `GET /requisitions/<id>/pdf` — downloads the PO as a PDF.

## Integration with the team

- **Friend 2 (backend / P1 auto-alerts):** point their alert-generation code
  at `POST /requisitions` with `source: "AUTO_P1"`. If they already have their
  own database/service, either (a) have them call this endpoint over HTTP, or
  (b) swap `db.py`'s `insert_requisition` for whatever their shared table
  actually is — the important thing is *one table, one shape*, not that this
  specific SQLite file is the source of truth.
- **Friend 1 (front end):** `GET /requisitions` gives the full queue as JSON
  for the dashboard. Filter/sort by `source` client-side to show the two
  origins distinctly.

## Demo script (for judges)

1. Open the chat UI, type: `we need 500 units of paracetamol at the Siliguri DC by Friday`
2. Point out: text → structured row (SKU resolved, urgency inferred HIGH from "by Friday") in ~1 second.
3. Type something with no DC mentioned, e.g. `order 200 boxes of amoxicillin ASAP` — point out
   the "assumed" flag on destination_dc instead of a silent guess, and urgency correctly reads CRITICAL from "ASAP".
4. Hit "Download Purchase Order PDF" on one of them.
5. Show `GET /requisitions` (or the dashboard) with a mix of `MANUAL_CHATBOT` and
   `AUTO_P1` rows in the same table — that's the actual acceptance check.

## Known limits (intentional, per the brief)

- No multi-turn conversation memory — one-shot only, as specced.
- Regex extraction is deliberately simple; swap to `EXTRACTION_MODE=llm` if
  you want more robust phrasing handling and have API access + time.
- SKU/DC lists in `db.py` are seeded stand-ins — replace with the real
  MedCare master lists if you have them before the demo.
