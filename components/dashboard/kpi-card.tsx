import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; direction: "up" | "down"; positive?: boolean };
  accent?: string;
  // For cards that are still illustrative/demo data rather than computed
  // live -- shown instead of a (fabricated) trend so it's never ambiguous
  // which numbers on the page are real.
  note?: string;
}

export function KpiCard({ label, value, icon: Icon, trend, accent = "bg-primary-50 text-primary-600", note }: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent)}>
          <Icon size={19} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "flex items-center gap-0.5 font-semibold",
              trend.positive === false ? "text-red-600" : "text-green-600"
            )}
          >
            {trend.direction === "up" ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {trend.value}
          </span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
      {note && <p className="mt-3 text-[11px] italic text-muted-foreground">{note}</p>}
    </Card>
  );
}
