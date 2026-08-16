"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, FileInput, TrendingUp, TrendingDown, Minus, CheckCircle2, CalendarClock, Megaphone, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import type { ReplenishmentNeed, Requisition } from "@/lib/data";

const TREND_ICON = { Rising: TrendingUp, Stable: Minus, Falling: TrendingDown };

export function ReplenishmentCard({
  need,
  onInitiateTransfer,
  onCreateRequisition,
}: {
  need: ReplenishmentNeed;
  onInitiateTransfer: (need: ReplenishmentNeed) => Promise<void>;
  onCreateRequisition: (need: ReplenishmentNeed) => Promise<Requisition>;
}) {
  const [isTransferring, setIsTransferring] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [transferDone, setTransferDone] = React.useState(false);
  const [createdRequisition, setCreatedRequisition] = React.useState<Requisition | null>(null);

  const TrendIcon = TREND_ICON[need.trend];

  async function handleTransfer() {
    setIsTransferring(true);
    setError(null);
    try {
      await onInitiateTransfer(need);
      setTransferDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate transfer");
    } finally {
      setIsTransferring(false);
    }
  }

  async function handleCreateRequisition() {
    setIsCreating(true);
    setError(null);
    try {
      const req = await onCreateRequisition(need);
      setCreatedRequisition(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create requisition");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground">{need.skuName}</p>
              <StatusBadge status={need.urgency} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {need.skuId} · {need.destinationDC}
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <TrendIcon size={13} /> {need.trend} · {need.confidence} confidence
          </div>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg bg-secondary/60 p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{need.reason}</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-secondary p-2.5">
            <p className="text-[10px] text-muted-foreground">Current Stock</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{need.currentStock.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-secondary p-2.5">
            <p className="text-[10px] text-muted-foreground">Reorder Point</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{need.reorderPoint.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-secondary p-2.5">
            <p className="text-[10px] text-muted-foreground">Recommended Qty</p>
            <p className="mt-0.5 text-sm font-semibold text-primary-700 dark:text-primary-400">
              {need.recommendedQty.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Secondary detail from the newer forecast signals -- additive,
            kept visually subordinate to the stats grid above and the
            transfer/requisition action below, which remain the primary
            focus of the card. Each row only renders when its field is
            actually present/relevant, never a fabricated default. */}
        {(need.recommendedReorderFrequencyDays ||
          need.promoActive ||
          (need.distributorSignal && need.distributorSignal !== "No Data") ||
          need.escalated) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            {Boolean(need.recommendedReorderFrequencyDays) && (
              <span className="flex items-center gap-1">
                <CalendarClock size={11} /> Reorder every {need.recommendedReorderFrequencyDays} days
              </span>
            )}
            {need.distributorSignal && need.distributorSignal !== "No Data" && (
              <span>Distributor orders: {need.distributorSignal}</span>
            )}
            {need.promoActive && (
              <Badge variant="info" className="gap-1">
                <Megaphone size={10} /> Promo active (+{need.promoLiftPct ?? 0}% demand)
              </Badge>
            )}
            {need.escalated && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert size={10} /> Escalated to {need.escalationTarget ?? "Procurement Lead"}
              </Badge>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        {transferDone ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0" />
            Transfer initiated — inventory updated.
          </div>
        ) : createdRequisition ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>
              Requisition {createdRequisition.id} created —{" "}
              <Link
                href={
                  `/requisitions?highlight=${encodeURIComponent(createdRequisition.id)}` +
                  `&sku=${encodeURIComponent(need.skuId)}` +
                  `&qty=${encodeURIComponent(need.recommendedQty)}` +
                  `&dc=${encodeURIComponent(need.destinationDC)}`
                }
                className="font-medium underline"
              >
                view it
              </Link>
              .
            </span>
          </div>
        ) : need.transfer ? (
          <div className="mt-4">
            <div className="flex gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-primary-800 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300">
              <ArrowLeftRight size={14} className="mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                <strong>Transfer recommended:</strong> {need.transfer.quantity.toLocaleString()} units of{" "}
                {need.skuId} available at {need.transfer.fromDC} (expiring in {need.transfer.daysToExpiry} days) —
                more cost-effective than a new order ({formatCurrency(need.transfer.transferCost)} transfer vs{" "}
                {formatCurrency(need.transfer.supplierCost)} to source).
              </p>
            </div>
            <Button size="sm" className="mt-3 w-full" disabled={isTransferring} onClick={handleTransfer}>
              <ArrowLeftRight size={14} /> {isTransferring ? "Transferring..." : "Initiate Transfer"}
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">No transfer available — sourcing from supplier.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              disabled={isCreating}
              onClick={handleCreateRequisition}
            >
              <FileInput size={14} /> {isCreating ? "Creating..." : "Create Requisition"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
