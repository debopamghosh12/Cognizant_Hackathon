"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Clock, IndianRupee, FileCheck2, ShieldCheck, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { Supplier, Requisition } from "@/lib/data";
import { getSuppliers, getRequisitions, getConvertedRequisitionIds, generatePO, getSupplierReliabilityTrends } from "@/lib/api";
import type { ReliabilityTrend } from "@/lib/anomaly-detection";
import { useGlobalSearch } from "@/components/layout/search-context";

function SupplierCard({
  supplier,
  requisitions,
  trend,
}: {
  supplier: Supplier;
  requisitions: Requisition[];
  // Only real, non-cancelled PO history yields an entry -- no entry means
  // "show nothing" (see getSupplierReliabilityTrends()), never a placeholder.
  trend?: ReliabilityTrend;
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const matching = requisitions.filter((r) => r.status === "PENDING" && r.sku === supplier.skuId);

  async function handleSelect(requisition: Requisition) {
    setIsGenerating(true);
    setError(null);
    try {
      await generatePO(requisition, supplier);
      router.push("/purchase-orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PO");
      setIsGenerating(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <p className="text-sm font-semibold text-foreground">{supplier.name}</p>
          <p className="text-xs text-muted-foreground">{supplier.category}</p>
        </div>
        <StatusBadge status={supplier.performance} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={13} /> {supplier.location}
          <span className="mx-1">•</span>
          <FileCheck2 size={13} /> {supplier.contracts} active contracts
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <ShieldCheck size={13} className="text-primary-600" /> Reliability score
            </span>
            <span className="font-semibold text-foreground">{supplier.reliabilityScore}/100</span>
          </div>
          <Progress value={supplier.reliabilityScore} className="mt-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock size={12} /> Lead time
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{supplier.leadTimeDays} days</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <IndianRupee size={12} /> Unit cost
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">₹{supplier.unitCost.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">On-time delivery</span>
          <Badge variant={supplier.onTimeDelivery >= 90 ? "success" : supplier.onTimeDelivery >= 75 ? "warning" : "destructive"}>
            {supplier.onTimeDelivery}%
          </Badge>
        </div>

        {trend && <p className="text-xs text-amber-600 dark:text-amber-400">⚠ {trend.warning}</p>}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {matching.length === 0 ? (
          <div className="mt-auto space-y-1">
            <Button className="w-full" variant="outline" disabled>
              Select Supplier
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              No pending requisitions need {supplier.skuId}
            </p>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="mt-auto w-full" variant="outline" disabled={isGenerating}>
                {isGenerating ? "Generating PO..." : "Select Supplier"}
                {!isGenerating && <ChevronDown size={14} />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Generate PO for requisition</DropdownMenuLabel>
              {matching.map((r) => (
                <DropdownMenuItem key={r.id} onClick={() => handleSelect(r)}>
                  {r.id} — {r.quantity.toLocaleString()} units → {r.destinationDC}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuppliersPage() {
  const { query } = useGlobalSearch();
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [requisitions, setRequisitions] = React.useState<Requisition[]>([]);
  const [trends, setTrends] = React.useState<Map<string, ReliabilityTrend>>(new Map());
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([getSuppliers(), getRequisitions(), getConvertedRequisitionIds(), getSupplierReliabilityTrends()])
      .then(([s, reqs, convertedIds, supplierTrends]) => {
        setSuppliers(s);
        setRequisitions(
          reqs.map((r) => (convertedIds.has(r.id) ? { ...r, status: "CONVERTED_TO_PO" as const } : r))
        );
        setTrends(supplierTrends);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filteredSuppliers = suppliers.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.skuId.toLowerCase().includes(q);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Suppliers"
        description={
          isLoading ? "Loading suppliers..." : `${suppliers.length} qualified suppliers across your procurement network`
        }
        action={<Button size="sm">Add Supplier</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredSuppliers.map((s) => (
          <SupplierCard key={s.id} supplier={s} requisitions={requisitions} trend={trends.get(s.id)} />
        ))}
      </div>
      {!isLoading && filteredSuppliers.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {suppliers.length > 0 ? "No suppliers match your search." : "No suppliers found."}
        </p>
      )}
    </div>
  );
}
