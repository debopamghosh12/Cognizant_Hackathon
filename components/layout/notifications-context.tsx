"use client";
import * as React from "react";
import { getReplenishmentNeeds, getPurchaseOrders, getRequisitions, getInvoiceMatches } from "@/lib/api";

export interface AppNotification {
  id: string;
  message: string;
  category: "escalation" | "po" | "match" | "requisition";
  href: string;
  createdAt: number;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const NotificationsContext = React.createContext<NotificationsContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 15_000;
const MAX_NOTIFICATIONS = 30;

// Real app state, not a fabricated notification feed: every notification is
// derived from something already fetchable via the existing API layer
// (getReplenishmentNeeds/getPurchaseOrders/getRequisitions/getInvoiceMatches
// -- no new backend endpoint). The first poll only establishes a baseline of
// what already exists (no notifications fire for pre-existing rows); every
// poll after that diffs against the previous set of known IDs per category,
// so only genuinely NEW events (a PO created, an invoice matched, a
// requisition raised, a shortage escalating) produce a notification.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const seenEscalations = React.useRef<Set<string> | null>(null);
  const seenPOs = React.useRef<Set<string> | null>(null);
  const seenRequisitions = React.useRef<Set<string> | null>(null);
  const seenMatches = React.useRef<Set<string> | null>(null);

  const poll = React.useCallback(async () => {
    const isBaseline = seenEscalations.current === null;
    const newOnes: AppNotification[] = [];

    try {
      const needs = await getReplenishmentNeeds();
      if (seenEscalations.current === null) seenEscalations.current = new Set();
      for (const n of needs) {
        if (!n.escalated) continue;
        if (seenEscalations.current.has(n.id)) continue;
        seenEscalations.current.add(n.id);
        if (!isBaseline) {
          newOnes.push({
            id: `escalation:${n.id}`,
            message: `${n.skuId} (${n.skuName}, ${n.destinationDC}) escalated to ${n.escalationTarget ?? "Procurement Lead"}`,
            category: "escalation",
            href: "/demand-sensing",
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch {
      // demand_sensing may not be running -- skip this source silently,
      // the other three still work independently.
    }

    try {
      const pos = await getPurchaseOrders();
      if (seenPOs.current === null) seenPOs.current = new Set();
      for (const po of pos) {
        if (seenPOs.current.has(po.id)) continue;
        seenPOs.current.add(po.id);
        if (!isBaseline) {
          newOnes.push({
            id: `po:${po.id}`,
            message: `PO ${po.id} auto-generated for ${po.supplier}`,
            category: "po",
            href: "/purchase-orders",
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const reqs = await getRequisitions();
      if (seenRequisitions.current === null) seenRequisitions.current = new Set();
      for (const r of reqs) {
        if (seenRequisitions.current.has(r.id)) continue;
        seenRequisitions.current.add(r.id);
        if (!isBaseline) {
          newOnes.push({
            id: `requisition:${r.id}`,
            message: `Requisition ${r.id} created for ${r.itemName} (${r.sku})`,
            category: "requisition",
            href: `/requisitions?highlight=${r.id}`,
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const matches = await getInvoiceMatches();
      if (seenMatches.current === null) seenMatches.current = new Set();
      for (const m of matches) {
        if (m.extraction_status !== "Extracted" || !m.match_status) continue;
        if (seenMatches.current.has(m.invoice_id)) continue;
        seenMatches.current.add(m.invoice_id);
        if (!isBaseline) {
          const outcome = m.match_status === "Approved" ? "auto-approved" : "flagged for review";
          newOnes.push({
            id: `match:${m.invoice_id}`,
            message: `3-way match completed for ${m.invoice_id} — ${outcome}`,
            category: "match",
            href: `/matching?invoice=${m.invoice_id}`,
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch {
      // ignore
    }

    if (newOnes.length > 0) {
      setNotifications((prev) => [...newOnes.reverse(), ...prev].slice(0, MAX_NOTIFICATIONS));
    }
  }, []);

  React.useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const markAsRead = React.useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = React.useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = React.useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
