"use client";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, cn } from "@/lib/utils";
import type { Approval } from "@/lib/data";

export function ApprovalCard({ approval }: { approval: Approval }) {
  const level = approval.confidence >= 90 ? "high" : approval.confidence >= 70 ? "medium" : "low";
  const levelConfig = {
    high: { color: "bg-green-600", badge: "success" as const, label: "High Confidence" },
    medium: { color: "bg-amber-500", badge: "warning" as const, label: "Medium Confidence" },
    low: { color: "bg-red-500", badge: "destructive" as const, label: "Low Confidence" },
  }[level];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground">{approval.invoiceId}</p>
              <Badge variant={levelConfig.badge}>{levelConfig.label}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{approval.supplier}</p>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(approval.amount)}</p>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Sparkles size={12} className="text-primary-600" /> AI Confidence Score
            </span>
            <span className="font-semibold text-foreground">{approval.confidence}%</span>
          </div>
          <Progress value={approval.confidence} className="mt-1.5" indicatorClassName={levelConfig.color} />
        </div>

        <div className="mt-3 flex gap-2 rounded-lg bg-secondary/60 p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{approval.reasoning}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="success" className="flex-1">
            <CheckCircle2 size={14} /> Approve
          </Button>
          <Button size="sm" variant="destructive" className="flex-1">
            <XCircle size={14} /> Reject
          </Button>
          <Button size="sm" variant="outline" className="flex-1">
            <AlertTriangle size={14} /> Escalate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
