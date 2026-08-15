"use client";
import { CheckCircle2, XCircle, ShoppingCart, PackageCheck, Receipt, Wand2, Send } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface MatchRow {
  label: string;
  po: string;
  gr: string;
  invoice: string;
  match: boolean;
}

const rows: MatchRow[] = [
  { label: "Order Quantity", po: "1,200 units", gr: "1,200 units", invoice: "1,200 units", match: true },
  { label: "Unit Price", po: "₹6.80", gr: "—", invoice: "₹6.80", match: true },
  { label: "Total Amount", po: "₹8,160.00", gr: "—", invoice: "₹8,160.00", match: true },
  { label: "Supplier", po: "MedSource Pharmaceuticals", gr: "MedSource Pharmaceuticals", invoice: "MedSource Pharmaceuticals", match: true },
  { label: "Tax Amount", po: "₹408.00", gr: "—", invoice: "₹430.00", match: false },
  { label: "Delivery Date", po: "2026-08-16", gr: "2026-08-14", invoice: "2026-08-14", match: false },
];

export default function MatchingPage() {
  const matchScore = Math.round((rows.filter((r) => r.match).length / rows.length) * 100);

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
            <Button size="sm">
              <Wand2 size={15} /> Auto Match
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Comparing</p>
            <p className="text-sm font-semibold text-foreground">PO-88231 · SHP-4471 · INV-204</p>
          </div>
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-600" />
              <CardTitle>Purchase Order</CardTitle>
            </div>
            <CardDescription>PO-88231</CardDescription>
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
            <CardDescription>SHP-4471</CardDescription>
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
            <CardDescription>INV-204</CardDescription>
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
    </div>
  );
}
