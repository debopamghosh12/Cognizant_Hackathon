"use client";
import { Bell, Menu, Moon, Search, Sun, ChevronDown, LogOut, UserCircle, HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/layout/theme-provider";
import { useGlobalSearch } from "@/components/layout/search-context";
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

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { query, setQuery } = useGlobalSearch();

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

        <button className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Notifications">
          <Bell size={18} />
          <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
        </button>

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
