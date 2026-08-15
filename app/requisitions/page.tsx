"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, SlidersHorizontal, Download, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Requisition } from "@/lib/data";
import { getRequisitions, getConvertedRequisitionIds, findBestSupplier, generatePO } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const statusFilters = ["All", "PENDING", "APPROVED", "AUTO_APPROVED", "REJECTED", "CONVERTED_TO_PO"];

export default function RequisitionsPage() {
  return (
    <React.Suspense fallback={null}>
      <RequisitionsPageContent />
    </React.Suspense>
  );
}

function RequisitionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requisitions, setRequisitions] = React.useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [selected, setSelected] = React.useState<Requisition | null>(null);
  const [isSourcing, setIsSourcing] = React.useState(false);
  const [sourcingResult, setSourcingResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([getRequisitions(), getConvertedRequisitionIds()])
      .then(([reqs, convertedIds]) => {
        const withStatus = reqs.map((r) =>
          convertedIds.has(r.id) ? { ...r, status: "CONVERTED_TO_PO" as const } : r
        );
        setRequisitions(withStatus);

        const highlight = searchParams.get("highlight");
        if (highlight) {
          setSelected(withStatus.find((r) => r.id === highlight) ?? null);
        }
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRunAiSourcing() {
    if (!selected) return;
    setIsSourcing(true);
    setSourcingResult(null);
    try {
      const bestSupplier = await findBestSupplier(selected.sku);
      if (!bestSupplier) {
        setSourcingResult(`No suppliers available for ${selected.sku}.`);
        return;
      }
      await generatePO(selected, bestSupplier);
      router.push("/purchase-orders");
    } catch (e) {
      setSourcingResult(e instanceof Error ? e.message : "AI Sourcing failed.");
    } finally {
      setIsSourcing(false);
    }
  }

  const filtered = requisitions.filter((r) => {
    const matchesQuery =
      r.id.toLowerCase().includes(query.toLowerCase()) ||
      r.itemName.toLowerCase().includes(query.toLowerCase()) ||
      r.requester.toLowerCase().includes(query.toLowerCase()) ||
      r.sourceWarehouse.toLowerCase().includes(query.toLowerCase()) ||
      r.destinationDC.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "All" || r.status === status;
    return matchesQuery && matchesStatus;
  });

  function handleExport() {
    const headers = [
      "Requisition ID", "Requester", "SKU", "Item Name", "Quantity",
      "Source Warehouse", "Destination DC", "Priority", "Status",
      "Estimated Cost", "Created Date",
    ];
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...filtered.map((r) =>
        [r.id, r.requester, r.sku, r.itemName, r.quantity, r.sourceWarehouse,
         r.destinationDC, r.priority, r.status, r.estimatedCost, r.createdDate]
          .map(escape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `requisitions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Purchase Requisitions"
        description={`${requisitions.length} requisitions across all warehouses`}
        action={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download size={15} /> Export
            </Button>
            <Button size="sm" asChild>
              <Link href="/assistant">
                <Plus size={15} /> Create Requisition
              </Link>
            </Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ID, item, requester, warehouse or DC..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-56">
            <SlidersHorizontal size={14} className="mr-1 text-muted-foreground" />
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requisition ID</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Item / SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Source Warehouse</TableHead>
                <TableHead>Destination DC</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Estimated Cost</TableHead>
                <TableHead>Created Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => {
                    setSelected(r);
                    setSourcingResult(null);
                  }}
                  className={"cursor-pointer " + (selected?.id === r.id ? "bg-primary-50 dark:bg-primary-500/10" : "")}
                >
                  <TableCell className="font-medium text-primary-700 dark:text-primary-400">{r.id}</TableCell>
                  <TableCell>{r.requester}</TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{r.itemName}</p>
                    <p className="text-xs text-muted-foreground">{r.sku}</p>
                  </TableCell>
                  <TableCell>{r.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{r.sourceWarehouse}</TableCell>
                  <TableCell className="text-muted-foreground">{r.destinationDC}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(r.estimatedCost, "INR")}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.createdDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    {isLoading ? "Loading requisitions..." : "No requisitions match your filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {selected && (
          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Requisition Detail</CardTitle>
                  <CardDescription>{selected.id}</CardDescription>
                </div>
                <StatusBadge status={selected.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Item / SKU</dt>
                  <dd className="font-medium text-foreground">{selected.itemName} ({selected.sku})</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Quantity</dt>
                  <dd className="font-medium text-foreground">{selected.quantity.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Destination DC</dt>
                  <dd className="font-medium text-foreground">{selected.destinationDC}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd className="font-medium text-foreground">{selected.priority}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Requester</dt>
                  <dd className="font-medium text-foreground">{selected.requester}</dd>
                </div>
              </dl>

              {selected.status === "PENDING" && (
                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={handleRunAiSourcing} disabled={isSourcing}>
                    <Sparkles size={15} /> {isSourcing ? "Sourcing..." : "Run AI Sourcing"}
                  </Button>
                  {sourcingResult && (
                    <p className="text-center text-xs text-muted-foreground">{sourcingResult}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}