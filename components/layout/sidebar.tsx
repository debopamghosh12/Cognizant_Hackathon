"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  Users,
  ShoppingCart,
  PackageCheck,
  ScanText,
  GitCompareArrows,
  ClipboardCheck,
  BarChart3,
  Settings,
  Boxes,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "AI Procurement Assistant", href: "/assistant", icon: Sparkles, badge: "AI" },
  { label: "Purchase Requisitions", href: "/requisitions", icon: FileText },
  { label: "Suppliers", href: "/suppliers", icon: Users },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart },
  { label: "Goods Receipt", href: "/goods-receipt", icon: PackageCheck },
  { label: "Invoice Processing (OCR)", href: "/invoices", icon: ScanText },
  { label: "3-Way Matching", href: "/matching", icon: GitCompareArrows },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Boxes className="h-4.5 w-4.5" size={18} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Cognizant P2P</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Autonomous Procurement
          </p>
        </div>
        <button
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
          onClick={onNavigate}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin px-2 py-3">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                size={17}
                className={cn(
                  "shrink-0",
                  active ? "text-primary-600 dark:text-primary-400" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 p-3 text-white">
          <p className="text-xs font-semibold">Touchless Automation</p>
          <p className="mt-0.5 text-[11px] text-primary-100">78% of P2P cycle is autonomous</p>
        </div>
      </div>
    </div>
  );
}
