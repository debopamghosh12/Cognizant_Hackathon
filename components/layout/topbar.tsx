"use client";
import Link from "next/link";
import { Bell, Menu, Moon, Search, Sun, ChevronDown, LogOut, UserCircle, HelpCircle, ShieldAlert, ShoppingCart, GitCompareArrows, FileText, CheckCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/layout/theme-provider";
import { useGlobalSearch } from "@/components/layout/search-context";
import { useNotifications, type AppNotification } from "@/components/layout/notifications-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NOTIFICATION_ICON: Record<AppNotification["category"], typeof ShieldAlert> = {
  escalation: ShieldAlert,
  po: ShoppingCart,
  match: GitCompareArrows,
  requisition: FileText,
};

function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { query, setQuery } = useGlobalSearch();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <button
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search POs, requisitions, suppliers, invoices..."
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Notifications">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
                >
                  <CheckCheck size={12} /> Mark all as read
                </button>
              )}
            </div>
            <DropdownMenuSeparator className="my-0" />
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No notifications yet — they'll appear here as things happen in the app.
                </p>
              ) : (
                notifications.map((n) => {
                  const Icon = NOTIFICATION_ICON[n.category];
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => markAsRead(n.id)}
                      className={cn(
                        "flex items-start gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-accent",
                        !n.read && "bg-primary-50/60 dark:bg-primary-500/10"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          n.read ? "bg-secondary text-muted-foreground" : "bg-primary-100 text-primary-600 dark:bg-primary-500/20"
                        )}
                      >
                        <Icon size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("leading-snug text-foreground", !n.read && "font-semibold")}>{n.message}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-600" />}
                    </Link>
                  );
                })
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent focus:outline-none">
            <Avatar className="h-7 w-7">
              <AvatarFallback>PS</AvatarFallback>
            </Avatar>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-xs font-semibold text-foreground">Priya Sharma</p>
              <p className="text-[10px] text-muted-foreground">Procurement Lead</p>
            </div>
            <ChevronDown size={14} className="hidden text-muted-foreground sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserCircle size={15} /> Profile settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle size={15} /> Help center
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">
              <LogOut size={15} /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
