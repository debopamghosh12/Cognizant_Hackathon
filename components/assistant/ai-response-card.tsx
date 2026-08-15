import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AIResponseField {
  label: string;
  value: string;
}

export interface AIResponseAction {
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "secondary";
}

export function AIResponseCard({
  title,
  badge,
  fields,
  note,
  actions,
  onAction,
}: {
  title: string;
  badge?: string;
  fields?: AIResponseField[];
  note?: string;
  actions?: AIResponseAction[];
  onAction?: (label: string) => void;
}) {
  return (
    <div className="mt-2 w-full max-w-md rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {badge && (
          <Badge variant="success" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      {fields && (
        <dl className="divide-y divide-border">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-4 py-2 text-xs">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{note}</p>}
      {actions && (
        <div className={cn("flex flex-wrap gap-2 p-3", fields || note ? "border-t border-border" : "")}>
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.variant ?? "outline"}
              onClick={() => onAction?.(a.label)}
            >
              {a.icon && <a.icon size={13} />}
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
