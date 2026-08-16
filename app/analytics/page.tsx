"use client";
import * as React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { ChartCard } from "@/components/shared/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, ScanText, ShoppingCart, CheckCircle2, ArrowLeftRight } from "lucide-react";
import {
  cycleTimeTrend,
  touchlessTrend,
  monthlyPOVolume,
} from "@/lib/data";
import {
  getAutomationRate,
  getAvgCycleTime,
  getPurchaseOrders,
  getSpendBySupplier,
  getCompletedCycleCount,
  getTransferEventCount,
  type SupplierSpend,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  fontSize: 12,
  background: "hsl(var(--card))",
};

// This dataset has only a handful of records created in one demo session
// -- there's no real month-by-month history to plot, so these charts stay
// illustrative rather than showing a single real data point stretched
// across a fake "Feb-Aug" axis. IllustrativeBadge makes that explicit on
// the page itself instead of leaving a viewer to guess which numbers are
// live.
function IllustrativeBadge() {
  return <Badge variant="neutral">Illustrative data</Badge>;
}

export default function AnalyticsPage() {
  const [automationRate, setAutomationRate] = React.useState<number | null | undefined>(undefined);
  const [avgCycleTime, setAvgCycleTime] = React.useState<number | null | undefined>(undefined);
  const [totalPOs, setTotalPOs] = React.useState<number | null>(null);
  const [spendBySupplier, setSpendBySupplier] = React.useState<SupplierSpend[]>([]);
  const [completedCycles, setCompletedCycles] = React.useState<number | null>(null);
  const [transferEvents, setTransferEvents] = React.useState<number | null>(null);

  React.useEffect(() => {
    getAutomationRate().then(setAutomationRate);
    getAvgCycleTime().then(setAvgCycleTime);
    getPurchaseOrders().then((pos) => setTotalPOs(pos.length));
    getSpendBySupplier().then(setSpendBySupplier);
    getCompletedCycleCount().then(setCompletedCycles);
    getTransferEventCount().then(setTransferEvents);
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        description="Procurement performance, cycle times and automation impact"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Automation Rate"
          value={automationRate === undefined ? "…" : automationRate === null ? "—" : `${automationRate}%`}
          icon={Zap}
          accent="bg-primary-50 text-primary-600 dark:bg-primary-500/10"
        />
        <KpiCard
          label="Avg. Cycle Time"
          value={avgCycleTime === undefined ? "…" : avgCycleTime === null ? "—" : `${avgCycleTime} days`}
          icon={Clock}
          accent="bg-green-50 text-green-600 dark:bg-green-500/10"
        />
        <KpiCard
          label="Invoice Processing"
          value="0.9 days"
          icon={ScanText}
          accent="bg-violet-50 text-violet-600 dark:bg-violet-500/10"
          note="Illustrative — no live invoice-cycle timestamps yet"
        />
        <KpiCard
          label="Monthly PO Volume"
          value={totalPOs === null ? "…" : totalPOs.toString()}
          icon={ShoppingCart}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-500/10"
        />
        <KpiCard
          label="Completed Procurement Cycles"
          value={completedCycles === null ? "…" : completedCycles.toString()}
          icon={CheckCircle2}
          accent="bg-green-50 text-green-600 dark:bg-green-500/10"
          note="Invoices matched through to Approved"
        />
        <KpiCard
          label="Inter-DC Transfers"
          value={transferEvents === null ? "…" : transferEvents.toString()}
          icon={ArrowLeftRight}
          accent="bg-orange-50 text-orange-600 dark:bg-orange-500/10"
          note="Demand Sensing — completed transfers"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Spend by Supplier" description="Live total spend per supplier, across real purchase orders">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={spendBySupplier} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <YAxis dataKey="supplier" type="category" width={100} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="spend" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {spendBySupplier.length === 0 && (
            <p className="pt-2 text-center text-xs text-muted-foreground">No purchase orders yet.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Procurement Cycle Time"
          description="Requisition-to-PO vs invoice processing (days)"
          action={<IllustrativeBadge />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cycleTimeTrend} margin={{ left: -20, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="requisitionToPO" name="Requisition → PO" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="invoiceProcessing" name="Invoice Processing" stroke="#d97706" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Touchless Processing Trend"
          description="Percentage of P2P cycle requiring zero human intervention"
          action={<IllustrativeBadge />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={touchlessTrend} margin={{ left: -20, top: 10 }}>
              <defs>
                <linearGradient id="touchlessGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="touchless" name="Touchless %" stroke="#16a34a" fill="url(#touchlessGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly PO Volume"
          description="Total purchase orders created per month"
          action={<IllustrativeBadge />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyPOVolume} margin={{ left: -20, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="volume" name="PO Volume" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
