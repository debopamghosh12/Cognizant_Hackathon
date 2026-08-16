"use client";
import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";
import { ReplenishmentCard } from "@/components/shared/replenishment-card";
import type { ReplenishmentNeed } from "@/lib/data";
import { getReplenishmentNeeds, initiateTransfer, createRequisitionFromNeed } from "@/lib/api";

export default function DemandSensingPage() {
  const [needs, setNeeds] = React.useState<ReplenishmentNeed[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const loadNeeds = React.useCallback(
    () =>
      getReplenishmentNeeds()
        .then((n) => {
          setNeeds(n);
          setLoadError(null);
        })
        .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load replenishment needs")),
    []
  );

  React.useEffect(() => {
    loadNeeds().finally(() => setIsLoading(false));
  }, [loadNeeds]);

  // Both actions leave the resolved/created card's confirmation state
  // showing (handled inside ReplenishmentCard) rather than yanking the
  // card away immediately -- refetching in the background just keeps the
  // rest of the list (urgency, other alerts) current.
  async function handleInitiateTransfer(need: ReplenishmentNeed) {
    await initiateTransfer(need);
    await loadNeeds();
  }

  async function handleCreateRequisition(need: ReplenishmentNeed) {
    const requisition = await createRequisitionFromNeed(need);
    await loadNeeds();
    return requisition;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Demand Sensing"
        description="Forecasted replenishment needs, ranked by urgency"
      />

      {loadError && (
        <Card className="mb-4 border-red-200 dark:border-red-900">
          <CardContent className="p-3 text-sm text-red-600">{loadError}</CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <p>
            A simple, explainable moving-average + seasonal-multiplier forecast (not ML) compared against current
            stock and lead time. Each need is checked for a cost-effective inter-DC transfer of near-expiry stock
            before falling back to sourcing from a supplier. An experimental ML forecast (XGBoost) is also
            available per card for comparison — on our test data it does not yet outperform this rule-based
            approach, so it remains opt-in only.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {needs.map((n) => (
          <ReplenishmentCard
            key={n.id}
            need={n}
            onInitiateTransfer={handleInitiateTransfer}
            onCreateRequisition={handleCreateRequisition}
          />
        ))}
        {needs.length === 0 && !loadError && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading replenishment needs..." : "No replenishment needs right now — all stock levels are healthy."}
          </p>
        )}
      </div>
    </div>
  );
}
