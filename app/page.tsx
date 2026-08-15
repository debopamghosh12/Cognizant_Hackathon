"use client";
import * as React from "react";
import { FileClock, Bot, ScanText, GitCompareArrows, Zap } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/shared/chart-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { AIRecommendationPanel } from "@/components/dashboard/ai-recommendation-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  kpis,
  procurementTrend,
  poStatusDistribution,
  recentActivity,
  touchlessTrend,
} from "@/lib/data";
import { getRequisitions, getPurchaseOrders, getInvoiceMatches } from "@/lib/api";

export default function DashboardPage() {
  const [totalRequisitions, setTotalRequisitions] = React.useState<number | null>(null);
  const [totalPOs, setTotalPOs] = React.useState<number | null>(null);
  // undefined = still loading, null = loaded but no attempted matches yet
  const [matchRate, setMatchRate] = React.useState<number | null | undefined>(undefined);

  React.useEffect(() => {
    getRequisitions().then((r) => setTotalRequisitions(r.length));
    getPurchaseOrders().then((p) => setTotalPOs(p.length));
    getInvoiceMatches().then((matches) => {
      const approved = matches.filter((m) => m.match_status === "Approved").length;
      const flagged = matches.filter((m) => m.match_status === "Flagged_For_Review").length;
      const attempted = approved + flagged;
      setMatchRate(attempted === 0 ? null : Math.round((approved / attempted) * 1000) / 10);
    });
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Procurement Overview"
        description="Real-time visibility into your autonomous procure-to-pay pipeline"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Requisitions"
          value={totalRequisitions === null ? "…" : totalRequisitions.toString()}
          icon={FileClock}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-500/10"
        />
        <KpiCard
          label="Auto-Generated POs"
          value={totalPOs === null ? "…" : totalPOs.toString()}
          icon={Bot}
          accent="bg-primary-50 text-primary-600 dark:bg-primary-500/10"
        />
        <KpiCard
          label="Invoice OCR Success Rate"
          value={`${kpis.ocrSuccessRate}%`}
          icon={ScanText}
          trend={{ value: "+2.1%", direction: "up", positive: true }}
          accent="bg-violet-50 text-violet-600 dark:bg-violet-500/10"
        />
        <KpiCard
          label="3-Way Match Success Rate"
          value={matchRate === undefined ? "…" : matchRate === null ? "—" : `${matchRate}%`}
          icon={GitCompareArrows}
          accent="bg-green-50 text-green-600 dark:bg-green-500/10"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Procurement Trend"
          description="Requisitions raised vs. purchase orders created"
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={procurementTrend} margin={{ left: -20, top: 10 }}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="poGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                  background: "hsl(var(--card))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="requisitions" name="Requisitions" stroke="#2563eb" fill="url(#reqGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="orders" name="Purchase Orders" stroke="#16a34a" fill="url(#poGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Purchase Order Status" description="Distribution across active POs">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={poStatusDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {poStatusDistribution.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                  background: "hsl(var(--card))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent Procurement Activity</CardTitle>
            <CardDescription>Live event stream from the autonomous P2P engine</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={{
                      success: "bg-green-500",
                      warning: "bg-amber-500",
                      neutral: "bg-slate-400",
                      danger: "bg-red-500",
                    }[activity.status] + " h-2 w-2 shrink-0 rounded-full"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{activity.type}</p>
                    <p className="truncate text-xs text-muted-foreground">{activity.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <Zap size={14} />
                </div>
                <CardTitle>Touchless Automation</CardTitle>
              </div>
              <CardDescription>Share of P2P cycle requiring zero human touch</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">78%</span>
                <Badge variant="success">+4% MoM</Badge>
              </div>
              <Progress value={78} className="mt-3" />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {touchlessTrend.slice(-3).map((t) => (
                  <div key={t.month} className="rounded-md bg-secondary py-2">
                    <p className="text-xs text-muted-foreground">{t.month}</p>
                    <p className="text-sm font-semibold text-foreground">{t.touchless}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <AIRecommendationPanel />
      </div>
    </div>
  );
}
