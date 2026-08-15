"use client";
import { Truck, Warehouse, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { shipments } from "@/lib/data";

export default function GoodsReceiptPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Goods Receipt"
        description="Track inbound shipments and reconcile received quantities against purchase orders"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shipments.map((s) => {
          const pct = Math.round((s.receivedQty / s.orderedQty) * 100);
          const pending = s.orderedQty - s.receivedQty;
          return (
            <Card key={s.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10">
                    <Truck size={17} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.id}</p>
                    <p className="text-xs text-muted-foreground">Linked to {s.poId}</p>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-foreground">{s.supplier}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Warehouse size={13} /> {s.warehouse}
                </div>

                <div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Received progress</span>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="mt-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-[11px] text-muted-foreground">Received qty</p>
                    <p className="mt-1 text-sm font-semibold text-green-600">{s.receivedQty.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="text-[11px] text-muted-foreground">Pending qty</p>
                    <p className="mt-1 text-sm font-semibold text-amber-600">{pending.toLocaleString()}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">Expected: {s.expectedDate}</p>

                <Button className="w-full" disabled={s.status === "Fully Received"}>
                  <PackageCheck size={15} />
                  {s.status === "Fully Received" ? "Fully Received" : "Receive Goods"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
