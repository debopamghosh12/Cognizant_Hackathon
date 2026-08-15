"use client";
import * as React from "react";
import { Truck, Warehouse, PackageCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Delivery } from "@/lib/data";
import { getDeliveries, receiveDelivery, type ReceiveDeliveryResult } from "@/lib/api";

function DeliveryCard({ delivery, onReceived }: { delivery: Delivery; onReceived: () => void }) {
  const [isReceiving, setIsReceiving] = React.useState(false);
  const [result, setResult] = React.useState<ReceiveDeliveryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [quantityInput, setQuantityInput] = React.useState("");

  const hasDelivery = delivery.receivedQty !== null;
  const isFullyReceived = delivery.status === "Fully Received";
  const pct = hasDelivery ? Math.round(((delivery.receivedQty ?? 0) / delivery.orderedQty) * 100) : 0;

  const handleReceive = async () => {
    setIsReceiving(true);
    setError(null);
    try {
      // The input is this delivery's increment (added to whatever's already
      // been received, capped at ordered qty) -- left blank delivers
      // everything still outstanding in one click.
      const increment = quantityInput.trim() === "" ? undefined : Number(quantityInput);
      const res = await receiveDelivery(delivery.id, increment);
      setResult(res);
      setQuantityInput("");
      onReceived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record delivery");
    } finally {
      setIsReceiving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10">
            <Truck size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{delivery.id}</p>
            <p className="text-xs text-muted-foreground">{delivery.item}</p>
          </div>
        </div>
        <StatusBadge status={delivery.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">{delivery.supplier}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Warehouse size={13} /> {delivery.destinationDC}
        </div>

        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Received progress</span>
            <span className="font-medium text-foreground">{hasDelivery ? `${pct}%` : "—"}</span>
          </div>
          <Progress value={pct} className="mt-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-[11px] text-muted-foreground">Ordered qty</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{delivery.orderedQty.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-[11px] text-muted-foreground">Received qty</p>
            <p className="mt-1 text-sm font-semibold text-green-600">
              {hasDelivery ? delivery.receivedQty!.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Expected: {new Date(delivery.expectedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>

        {result && (
          <Badge variant={isFullyReceived ? "success" : "warning"} className="w-full justify-center py-1.5">
            {isFullyReceived ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            Received {result.quantity_received.toLocaleString()} / {delivery.orderedQty.toLocaleString()} total
          </Badge>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {!isFullyReceived && (
          <Input
            type="number"
            min={0}
            placeholder="This delivery's qty (blank = remaining)"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            disabled={isReceiving}
            className="text-sm"
          />
        )}

        <Button className="w-full" disabled={isFullyReceived || isReceiving} onClick={handleReceive}>
          <PackageCheck size={15} />
          {isFullyReceived ? "Fully Received" : isReceiving ? "Recording..." : "Record Delivery"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Only POs actually sent to a supplier are awaiting delivery here -- a
// Draft PO hasn't gone anywhere yet, and a Cancelled one never will.
const ELIGIBLE_PO_STATUSES = new Set(["Sent", "Acknowledged", "Partially Received", "Completed"]);

export default function GoodsReceiptPage() {
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadDeliveries = React.useCallback(
    () => getDeliveries().then((all) => setDeliveries(all.filter((d) => ELIGIBLE_PO_STATUSES.has(d.poStatus)))),
    []
  );

  React.useEffect(() => {
    loadDeliveries().finally(() => setIsLoading(false));
  }, [loadDeliveries]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Goods Receipt"
        description="Track inbound purchase orders and record deliveries against them"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {deliveries.map((d) => (
          <DeliveryCard key={d.id} delivery={d} onReceived={loadDeliveries} />
        ))}
      </div>
      {deliveries.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {isLoading ? "Loading purchase orders..." : "No purchase orders yet."}
        </p>
      )}
    </div>
  );
}
