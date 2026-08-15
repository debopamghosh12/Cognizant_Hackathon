import { Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aiRecommendations } from "@/lib/data";

const impactVariant: Record<string, "destructive" | "warning" | "info"> = {
  High: "destructive",
  Medium: "warning",
  Low: "info",
};

export function AIRecommendationPanel() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Sparkles size={14} />
          </div>
          <CardTitle>AI Recommendations</CardTitle>
        </div>
        <CardDescription>Insights generated from live procurement signals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiRecommendations.map((rec) => (
          <div
            key={rec.id}
            className="group cursor-pointer rounded-lg border border-border p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:hover:bg-primary-500/5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{rec.title}</p>
              <Badge variant={impactVariant[rec.impact]} className="shrink-0">
                {rec.impact}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 opacity-0 transition-opacity group-hover:opacity-100">
              Take action <ArrowRight size={12} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
