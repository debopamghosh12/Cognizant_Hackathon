"use client";
import * as React from "react";
import { MapPin, Clock, IndianRupee, FileCheck2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Supplier } from "@/lib/data";
import { getSuppliers } from "@/lib/api";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .finally(() => setIsLoading(false));
  }, []);

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
        {suppliers.map((s) => (
          <Card key={s.id} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.category}</p>
              </div>
              <StatusBadge status={s.performance} />
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={13} /> {s.location}
                <span className="mx-1">•</span>
                <FileCheck2 size={13} /> {s.contracts} active contracts
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <ShieldCheck size={13} className="text-primary-600" /> Reliability score
                  </span>
                  <span className="font-semibold text-foreground">{s.reliabilityScore}/100</span>
                </div>
                <Progress value={s.reliabilityScore} className="mt-1.5" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-3">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={12} /> Lead time
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground">{s.leadTimeDays} days</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <IndianRupee size={12} /> Unit cost
                  </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">₹{s.unitCost.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">On-time delivery</span>
                <Badge variant={s.onTimeDelivery >= 90 ? "success" : s.onTimeDelivery >= 75 ? "warning" : "destructive"}>
                  {s.onTimeDelivery}%
                </Badge>
              </div>

              <Button className="mt-auto w-full" variant="outline">
                Select Supplier
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
