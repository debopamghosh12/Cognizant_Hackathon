# Autonomous Procure-to-Pay (P2P) System

An enterprise-grade frontend for a Cognizant Supply Chain hackathon, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and a hand-rolled shadcn/ui-style component library. All data is mocked — no backend is required.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To build for production:

```bash
npm run build
npm run start
```

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** with a light/dark theme token system (`app/globals.css`, `tailwind.config.ts`)
- **Radix UI primitives** wrapped as shadcn/ui-style components in `components/ui`
- **Lucide React** icons
- **Recharts** for all charts (area, bar, line, pie)

## Project structure

```
app/
  page.tsx                 Dashboard
  assistant/page.tsx        AI Procurement Assistant (chat)
  requisitions/page.tsx     Purchase Requisitions
  suppliers/page.tsx        Suppliers
  purchase-orders/page.tsx  Purchase Orders
  goods-receipt/page.tsx    Goods Receipt
  invoices/page.tsx         Invoice Processing (OCR)
  matching/page.tsx         3-Way Matching
  approvals/page.tsx        Approvals
  analytics/page.tsx        Analytics
  settings/page.tsx         Settings
components/
  ui/            Reusable primitives (Button, Card, Badge, Table, Tabs, Select, ...)
  layout/        Sidebar, Topbar, AppShell, ThemeProvider (dark mode)
  dashboard/     KpiCard, AIRecommendationPanel
  assistant/     ChatBubble, AIResponseCard
  shared/        PageHeader, StatusBadge, ChartCard, UploadWidget, ApprovalCard
lib/
  data.ts        All mock/dummy data (requisitions, suppliers, POs, invoices, KPIs, chart series)
  utils.ts       cn(), formatCurrency(), formatNumber()
```

## Notes

- Every page uses realistic, synthetic enterprise data defined centrally in `lib/data.ts` — swap this for real API calls when wiring up a backend.
- Dark mode is toggled from the top bar and persisted to `localStorage`.
- The AI Assistant page matches keywords in the user's message (e.g. "paracetamol", "invoice", "compare", "forecast") to return a relevant mocked response card — replace `buildAssistantReply()` in `app/assistant/page.tsx` with a real LLM/agent call for production use.
