# MedCare Pharma — Demand Sensing & Autonomous Procure-to-Pay

Built for the **Cognizant NPN Hackathon**, for a fictional pharma company, MedCare Pharma. The
project combines two use cases into one working pipeline:

- **P1 — Demand Sensing & Replenishment Planning**: forecasts near-term demand per SKU/DC,
  decides whether a shortage should be resolved by transferring near-expiry stock from another
  DC or by sourcing from a supplier, and raises a real requisition when it can't.
- **PR2 — Autonomous Procure-to-Pay**: a conversational requisition intake, AI-scored supplier
  selection and PO generation, simulated goods receipt, OCR invoice processing, and 3-way match
  auto-approval — with an Approvals queue for anything that doesn't clear automatically.

The two are wired together: a Demand Sensing shortage that can't be covered by an inter-DC
transfer creates a real requisition through the exact same code path the chatbot uses, so it
flows through AI Sourcing → PO → Goods Receipt → Invoice → 3-Way Match without any special-casing.

---

## Architecture

Four independent backend processes plus the Next.js app. The frontend never calls a Python
service directly — every page goes through a Next.js API route (`app/api/*/route.ts`) that
proxies server-side to the relevant service, using a `*_API_URL` env var with a hardcoded
fallback.

```
┌─────────────────────────┐
│   Next.js 14 (App Router)│  localhost:3000
│   app/*, app/api/*/route.ts (proxy layer)
└─────────┬───────┬───────┬┘
          │        │       │
   ┌──────▼──┐ ┌───▼────┐ ┌▼─────────────┐
   │ chatbot │ │po_gen- │ │demand_sensing│
   │ (Flask) │ │eration │ │  (FastAPI)   │
   │ :8000   │ │(FastAPI)│ │   :8001      │
   │         │ │ :8002   │ │              │
   └────┬────┘ └───┬─────┘ └──────┬───────┘
        │           │              │
   requisitions.db  scm_project.db │ demand_sensing.db +
   (SQLite)         (SQLite)       │ demand_history.csv /
                                    │ distributor_orders.csv /
                                    │ promotional_calendar.csv
```

| Service | Framework | Port | Entry point | Owns |
|---|---|---|---|---|
| `chatbot` | Flask | `8000` | `chatbot/app.py` | Requisition NLP intake, PO PDF generation |
| `po_generation` | FastAPI | `8002` | `po_generation/main.py` | Supplier scoring, PO generation, goods receipt, invoices, 3-way match |
| `demand_sensing` | FastAPI | `8001` | `demand_sensing/main.py` | Forecasting, replenishment alerts, inter-DC transfer, escalation |

A fourth, standalone Python script — `src/main.py` — is a **legacy** TrOCR-based invoice OCR
pipeline that predates `po_generation`'s invoice flow. It still runs against
`data/sample_invoices/` but is not wired into any live page; the Invoice Processing page's own
banner says so.

Each service persists to its own SQLite file (`chatbot/requisitions.db`,
`data/scm_project.db`, `data/demand_sensing.db`) — none are shared, and none are checked into
git (auto-created on first run via each service's `init_db()`).

---

## Features (what's actually implemented)

**Demand Sensing**
- Forecasts daily demand per SKU/DC from 90 days of synthetic history (14-day moving average +
  seasonal, promo, and distributor-order signals — see "The ML component" below).
- Computes a reorder point (forecast × lead time + safety buffer) and flags Critical/High/Medium
  shortages, capped so a recommendation never exceeds a SKU/DC's configured warehouse capacity.
- Before recommending a supplier order, checks every other DC for near-expiry surplus stock and
  compares the real cost of transferring it against sourcing from the cheapest supplier
  (`data/suppliers.csv`); if a transfer is cheaper, the card offers **Initiate Transfer**
  (simulated inventory mutation) instead of a requisition.
- If no transfer is viable, **Create Requisition** posts to the same `chatbot` endpoint the
  chatbot itself uses, so the new requisition is indistinguishable from a manually-typed one.
- A shortage that stays Critical for more than 24 continuous hours (tracked via a real
  timestamp, not a hardcoded flag) is marked **escalated** to a Procurement Lead.

**Requisition (conversational NLP)** — `chatbot/`
- Free text → structured requisition via real rule-based extraction: regex quantity parsing,
  SKU resolution against an alias table with fuzzy fallback, and keyword-based urgency inference
  ("ASAP" → CRITICAL, a weekday mention → HIGH). An LLM extraction path exists
  (`EXTRACTION_MODE=llm` + `ANTHROPIC_API_KEY`) but isn't the default.
- Unresolved fields (e.g. no DC mentioned) fall back to a flagged default rather than a silent
  guess — surfaced via an `assumed_fields` list on the row, not hidden.

**Sourcing & PO** — `po_generation/`
- `data/suppliers.csv`'s `suitability_score` is a real weighted score (cost, lead time, on-time
  delivery, quality, GMP-compliance penalty) computed offline by `scripts/generate_suppliers.py`
  — not cost-only, not random.
- "Run AI Sourcing" queries suppliers for the requisition's SKU, sorts by that score descending,
  and takes the top result. Hard filters (GMP certification, defect-rate ceiling, MOQ, available
  capacity) can and do reject a candidate outright.

**Receiving** — `app/goods-receipt/page.tsx`
- A manual quantity entry framed as a sensor confirmation, with a fixed 1.4s "Scanning..."
  delay — **this is a cosmetic animation, not a simulated sensor/CV pipeline**; the delay has no
  backend call behind it. Over- and under-delivery both work: the entered quantity is recorded
  as-is (never capped at the ordered quantity), and an over-delivery is flagged rather than
  silently marked "Fully Received."

**Invoicing — OCR + 3-way match**
- Two paths into the same match logic: **Generate Invoice** (synthetic numbers jittered from
  the real PO/GR, 75% land in-tolerance / 25% deliberately don't, for a repeatable demo), and
  **Upload Invoice** (real Google Cloud Vision `DOCUMENT_TEXT_DETECTION` OCR on an uploaded
  photo/scan, with a human review-and-correct step before anything is submitted).
- Both feed the same `three_way_match()` (`src/validate.py`): ±2% tolerance on quantity ordered,
  quantity received, and total-amount reconciliation, plus a strict over-delivery check. A
  mismatch on any check lands the invoice in **Approvals** for a manual Approve/Reject/Escalate
  decision; a clean match auto-approves.

**Dashboard / Analytics**
- Automation rate, average cycle time, and spend-by-supplier are computed live from real
  requisition/PO/invoice data. Several dashboard/analytics charts are explicitly synthetic —
  see "Known limitations" below.

---

## The ML component — described honestly

Demand Sensing's **default, primary forecast is deliberately rule-based**, not ML: a 14-day
moving average with small, named multiplicative adjustments for seasonality
(`SEASONAL_FORECAST_MULTIPLIER`), an active promotion (`promotional_calendar.csv`), and a
distributor-order leading indicator (`distributor_orders.csv`). This is a design choice, not a
placeholder — every number is traceable to one line of arithmetic, which matters for
explainability and for judges asking "why did it recommend that."

Separately, **a real XGBoost model was trained and evaluated**, on our own real
`demand_history.csv` (never the orphaned `models/demand_forecast_model.pkl` — confirmed
incompatible: different SKU/DC categories, different capacity scale, trained on a different
dataset entirely). Methodology:

- Features engineered only from data we actually have: lags (1/7/14/30 days), rolling mean/std
  (7/14/28 days), day-of-week, month, a re-derived seasonal flag, promo-active, and a
  distributor-order trend signal.
- A genuine **time-based** train/test split (last 14 days per SKU/DC series held out) — not a
  random shuffle, which would leak future values into training.
- Compared against a naive "yesterday's value" baseline on the same held-out set.

**Real, measured result** (`models/demand_forecast_model_v2_metrics.json`, 690 train / 210 test
rows): XGBoost scores **MAE 3.80 / WMAPE 12.0%**, against the naive baseline's **MAE 3.15 /
WMAPE 10.0%**. **The trained model does not currently beat the naive baseline** on the real
90-day dataset — it's exposed on the Demand Sensing page as an opt-in **"Compare ML forecast
(experimental)"** toggle per card, showing both numbers and this exact result, not a rounded-up
claim. A separate experiment (`demand_sensing/train_ml_forecast_extended.py`) found that a
longer, 2-year *synthetic* history does let the model beat naive — but that's evidence the
model can learn a hand-engineered recurring pattern, not evidence it would perform this well on
real MedCare demand data, which doesn't exist yet.

**What to say out loud to judges:** *"Our default forecast is rule-based and fully explainable.
We also trained and honestly evaluated a real XGBoost model with a proper time-based holdout —
it's available as an opt-in comparison, and we're showing its real accuracy, including that it
doesn't yet beat a naive baseline on our current 90-day dataset. More historical data, not a
different algorithm, is the actual lever here."*

---

## Tech stack

Pulled directly from `package.json` and `requirements.txt` — nothing assumed.

**Frontend**
- Next.js 14.2 (App Router), React 18.3, TypeScript 5.5
- Tailwind CSS 3.4 + `tailwindcss-animate`, Radix UI primitives (avatar, dialog, dropdown-menu,
  progress, select, separator, slot, tabs, tooltip) wrapped as a hand-rolled shadcn/ui-style
  component library in `components/ui`
- `recharts` for all charts, `lucide-react` for icons, `class-variance-authority` + `clsx` +
  `tailwind-merge` for styling utilities

**Backend**
- Python — `flask` (chatbot), `fastapi` + `uvicorn` (po_generation, demand_sensing)
- `xgboost` + `scikit-learn` for the ML forecast comparison (see above)
- `opencv-python`, `torch`, `transformers==4.46.0`, `sentencepiece`, `pillow` — the legacy TrOCR
  pipeline (`src/`)
- `reportlab` — PDF generation (chatbot PO downloads)
- SQLite for all persistence, plain CSV for synthetic demand/supplier/promo data

---

## Setup / running locally

Requires Python 3.10+ and Node 18+.

### 1. Install dependencies

```bash
# from the repo root
pip install -r requirements.txt
pip install xgboost scikit-learn   # for the ML forecast comparison

npm install
```

### 2. Create `.env.local` (gitignored — not checked in)

```bash
PO_GENERATION_API_URL=http://localhost:8002
DEMAND_SENSING_API_URL=http://localhost:8001
GOOGLE_CLOUD_VISION_API_KEY=your-own-key-here   # only needed for real Upload Invoice OCR
```

### 3. Start the three backend services (separate terminals, from the repo root)

```bash
cd chatbot && python app.py                                  # :8000

uvicorn po_generation.main:app --port 8002                   # :8002

uvicorn demand_sensing.main:app --port 8001                  # :8001
```

**Known issue on Windows:** a stale `demand_sensing`/`po_generation` process can squat on its
port after a crash or an old terminal is left open, so a fresh `uvicorn` start silently fails or
the frontend gets 404s from outdated code. Check and clear it first:

```powershell
netstat -ano | findstr :8001
taskkill /PID <pid> /F
```

(Swap `:8001` for whichever port is stuck.)

### 4. Start the frontend

```bash
npm run dev
```

Open **http://localhost:3000**.

### One-time data generation (only needed if `data/demand_sensing/*.csv` are missing)

```bash
cd demand_sensing && python generate_data.py
```

Everything else (SQLite tables, seeded inventory) is created automatically on first request via
each service's `init_db()`.

---

## Project structure

```
app/                        Next.js pages (App Router) + app/api/*/route.ts proxy layer
  page.tsx                  Dashboard
  demand-sensing/           P1 — replenishment alerts, transfer, ML comparison toggle
  requisitions/              Purchase Requisitions
  assistant/                 Conversational chatbot UI
  suppliers/                 Supplier catalog + reliability trends
  purchase-orders/           PO list, send, download
  goods-receipt/             Simulated receiving
  invoices/                  Generate/Upload Invoice, OCR
  matching/                  3-way match detail view
  approvals/                 Manual decision queue
  analytics/, settings/

components/
  ui/            Radix-based primitives (Button, Card, Badge, Table, Select, ...)
  layout/        Sidebar, Topbar, AppShell, ThemeProvider
  dashboard/     KpiCard, AI recommendation panel
  shared/        PageHeader, StatusBadge, ReplenishmentCard, ApprovalCard, UploadWidget
  invoices/      Printable invoice document template

lib/
  api.ts         All frontend↔backend fetch functions + raw→UI type transforms
  data.ts        TypeScript interfaces + a handful of explicitly-illustrative mock series
  anomaly-detection.ts   Predictive delivery-risk / supplier reliability helpers

chatbot/         Flask service — requisition NLP intake (see chatbot/README.md)
po_generation/   FastAPI service — supplier scoring, PO gen, goods receipt, invoices, matching
demand_sensing/  FastAPI service — forecasting, replenishment, transfer, escalation, ML comparison
src/             Legacy standalone OCR pipeline (TrOCR) — not wired into any live page
scripts/         Offline data-generation scripts (supplier catalog, demo SKU overlay)

data/            CSVs + SQLite files (suppliers, demand history, promo calendar, distributor orders)
models/          Trained model artifacts + models/README.md (per-model status/compatibility notes)
docs/SCHEMA.md   Supplier catalog schema reference
```

---

## Known limitations / what's experimental

Being upfront about this on purpose — it's a strength for this submission, not a weakness.

- **The ML forecast does not beat the naive baseline** on the real dataset (see above). It's
  opt-in and clearly labeled "experimental" in the UI for exactly this reason.
- **Goods Receipt's "simulated IoT/CV"** is a manual quantity entry with a cosmetic scan
  animation — there is no actual sensor or computer-vision simulation behind it.
- **Two other trained model artifacts in `models/` are orphaned, not wired into anything live**:
  `demand_forecast_model.pkl` (an earlier XGBoost model trained on an incompatible synthetic
  dataset — wrong SKU/region categories, wrong capacity scale) and `supplier_selection_model.pkl`
  (a real, working classifier, but trained on a supplier universe with zero overlap with the
  live `data/suppliers.csv` catalog). Both are documented in `models/README.md` with the exact
  reason they aren't connected.
- **"Fully autonomous" is not literal** — every stage (Run AI Sourcing, Send to Supplier, Record
  Delivery, Generate/Upload Invoice, Approve/Reject) requires an explicit human click, by
  design, so the demo stays controllable.
- **Settings page** is mostly a static UI mock (toggles aren't backed by real state) except the
  dark/light theme switch, which is real.
- Several Dashboard/Analytics charts are explicitly synthetic and labeled "Illustrative data" in
  the UI (Procurement Cycle Time, Touchless Processing Trend, Monthly PO Volume) — this dataset
  has only a handful of records from demo sessions, not real month-over-month history to plot.
- Chatbot's SKU catalog (`SKU-1001`..`SKU-1010`, finished products) and the supplier catalog's
  raw-material SKUs (`SKU-API-*`, `SKU-EXC-*`, `SKU-PKG-*`) are intentionally separate lists —
  5 finished-product SKUs have a demo supplier overlay so they can flow end-to-end; a real BOM
  resolver is out of scope here (see `docs/SCHEMA.md`).
- The GitHub default branch (`supplier-selection`) is an older snapshot with only
  `data/`/`docs/`/`scripts/` — this README describes the current state of `main`, not the
  GitHub-default branch. Worth changing the repo's default branch to `main` before sharing the link.

---

## Team / contributors

Debopam Ghosh, Chandana Jana, Dipti Choubey, Harshvardhan Rajgarhia — Cognizant NPN Hackathon.
