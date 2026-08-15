"use client";
import * as React from "react";
import { CheckCircle2, XCircle, ShoppingCart, PackageCheck, Receipt, Wand2, Send, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getInvoiceMatches, type InvoiceMatch } from "@/lib/api";

const EXTRACTION_STATUS_LABEL: Record<string, string> = {
  Failed: "OCR extraction failed completely for this invoice.",
  Incomplete: "OCR extraction found this invoice's fields illegible or missing.",
};

export default function MatchingPage() {
  const [matches, setMatches] = React.useState<InvoiceMatch[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadMatches = React.useCallback(() => getInvoiceMatches().then(setMatches), []);

  React.useEffect(() => {
    loadMatches().finally(() => setIsLoading(false));
  }, [loadMatches]);

  async function handleAutoMatch() {
    setIsRefreshing(true);
    try {
      await loadMatches();
    } finally {
      setIsRefreshing(false);
    }
  }

  const selected = matches[0] ?? null;
  const rows = selected?.rows ?? [];
  const matchScore = rows.length > 0 ? Math.round((rows.filter((r) => r.match).length / rows.length) * 100) : 0;

  const emptyReason = selected
    ? EXTRACTION_STATUS_LABEL[selected.extraction_status] ??
      (selected.match_status === "Awaiting_Goods_Receipt"
        ? "No goods receipt recorded for this PO yet — nothing to compare quantity received against."
        : null)
    : null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="3-Way Matching"
        description="Cross-verify purchase order, goods receipt and invoice data before payment"
        action={
          <>
            <Button variant="outline" size="sm">
              <Send size={15} /> Send for Review
            </Button>
            <Button size="sm" onClick={handleAutoMatch} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {isRefreshing ? "Matching..." : "Auto Match"}
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Comparing</p>
            <p className="text-sm font-semibold text-foreground">
              {isLoading
                ? "Loading..."
                : selected
                ? `${selected.po_id} · ${selected.gr_id ?? "—"} · ${selected.invoice_id}`
                : "No invoices processed yet"}
            </p>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-48">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Match Score</span>
                  <span className="font-bold text-foreground">{matchScore}%</span>
                </div>
                <Progress value={matchScore} className="mt-1.5" indicatorClassName={matchScore >= 90 ? "bg-green-600" : "bg-amber-500"} />
              </div>
              <Badge variant={matchScore >= 90 ? "success" : "warning"} className="text-sm">
                {matchScore >= 90 ? "Auto-Approvable" : "Needs Review"}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {isLoading
              ? "Loading matches..."
              : emptyReason ?? "No comparable invoice data yet."}
          </CardContent>
        </Card>
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-600" />
              <CardTitle>Purchase Order</CardTitle>
            </div>
            <CardDescription>{selected?.po_id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-foreground">{r.po}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PackageCheck size={16} className="text-primary-600" />
              <CardTitle>Goods Receipt</CardTitle>
            </div>
            <CardDescription>{selected?.gr_id ?? "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-foreground">{r.gr}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-primary-600" />
              <CardTitle>Invoice</CardTitle>
            </div>
            <CardDescription>{selected?.invoice_id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.label}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-xs",
                  r.match
                    ? "bg-green-50 dark:bg-green-500/10"
                    : "bg-red-50 dark:bg-red-500/10"
                )}
              >
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {r.match ? (
                    <CheckCircle2 size={13} className="text-green-600" />
                  ) : (
                    <XCircle size={13} className="text-red-600" />
                  )}
                  {r.label}
                </span>
                <span className={cn("font-semibold", r.match ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                  {r.invoice}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
