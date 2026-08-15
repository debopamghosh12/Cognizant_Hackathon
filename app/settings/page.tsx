"use client";
import { Bell, Shield, Zap, Users, Building2, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/layout/theme-provider";

const toggles = [
  { icon: Bell, label: "Email notifications", description: "Get notified about approvals, delays and flagged invoices", enabled: true },
  { icon: Zap, label: "Auto-approve low-risk POs", description: "Automatically approve purchase orders under ₹4,00,000 with 95%+ AI confidence", enabled: true },
  { icon: Shield, label: "Require MFA for approvals", description: "Add an extra verification step for high-value approvals", enabled: false },
  { icon: Users, label: "Delegate approvals when away", description: "Route approvals to your backup approver during time off", enabled: true },
];

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="Settings" description="Manage your workspace preferences and automation rules" />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-primary-600" />
              <CardTitle>Organization</CardTitle>
            </div>
            <CardDescription>Cognizant Supply Chain — Autonomous P2P Workspace</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Workspace ID</p>
              <p className="text-sm font-medium text-foreground">cog-p2p-prod-04</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-medium text-foreground">Enterprise</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Region</p>
              <p className="text-sm font-medium text-foreground">Asia Pacific (Mumbai)</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Active warehouses</p>
              <p className="text-sm font-medium text-foreground">6</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how the platform looks on your device</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                  {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Dark mode</p>
                  <p className="text-xs text-muted-foreground">Currently {theme === "light" ? "off" : "on"}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                Switch to {theme === "light" ? "Dark" : "Light"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automation & Notifications</CardTitle>
            <CardDescription>Control how much of the P2P cycle runs autonomously</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {toggles.map((t) => (
              <div key={t.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <t.icon size={15} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                <button
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    t.enabled ? "bg-primary-600" : "bg-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      t.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
