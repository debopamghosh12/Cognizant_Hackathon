"use client";
import * as React from "react";
import { Plus, Search, SlidersHorizontal, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Requisition } from "@/lib/data";
import { getRequisitions } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const statusFilters = ["All", "PENDING", "APPROVED", "AUTO_APPROVED", "REJECTED", "CONVERTED_TO_PO"];

export default function RequisitionsPage() {
  const [requisitions, setRequisitions] = React.useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");

  React.useEffect(() => {
    getRequisitions()
      .then(setRequisitions)
      .finally(() => setIsLoading(false));
  }, []);

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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Purchase Requisitions"
        description={`${requisitions.length} requisitions across all warehouses`}
        action={
          <>
            <Button variant="outline" size="sm">
              <Download size={15} /> Export
            </Button>
            <Button size="sm">
              <Plus size={15} /> Create Requisition
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

      <Card>
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
              <TableRow key={r.id}>
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
    </div>
  );
}