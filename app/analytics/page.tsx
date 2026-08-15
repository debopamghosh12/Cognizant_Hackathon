"use client";
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
import { Zap, Clock, ScanText, ShoppingCart } from "lucide-react";
import {
  spendBySupplier,
  cycleTimeTrend,
  touchlessTrend,
  monthlyPOVolume,
} from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  fontSize: 12,
  background: "hsl(var(--card))",
};

export default function AnalyticsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        description="Procurement performance, cycle times and automation impact"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Automation Rate" value="78%" icon={Zap} trend={{ value: "+4%", direction: "up" }} accent="bg-primary-50 text-primary-600 dark:bg-primary-500/10" />
        <KpiCard label="Avg. Cycle Time" value="1.6 days" icon={Clock} trend={{ value: "-0.5d", direction: "down", positive: true }} accent="bg-green-50 text-green-600 dark:bg-green-500/10" />
        <KpiCard label="Invoice Processing" value="0.9 days" icon={ScanText} trend={{ value: "-0.4d", direction: "down", positive: true }} accent="bg-violet-50 text-violet-600 dark:bg-violet-500/10" />
        <KpiCard label="Monthly PO Volume" value="312" icon={ShoppingCart} trend={{ value: "-2.5%", direction: "down", positive: false }} accent="bg-amber-50 text-amber-600 dark:bg-amber-500/10" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Spend by Supplier" description="Year-to-date spend across top suppliers">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={spendBySupplier} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${v / 100000}L`} axisLine={false} tickLine={false} />
                <YAxis dataKey="supplier" type="category" width={100} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="spend" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Procurement Cycle Time" description="Requisition-to-PO vs invoice processing (days)">
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

        <ChartCard title="Touchless Processing Trend" description="Percentage of P2P cycle requiring zero human intervention">
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

        <ChartCard title="Monthly PO Volume" description="Total purchase orders created per month">
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
