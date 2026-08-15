"use client";
import * as React from "react";
import {
  Send,
  Sparkles,
  FileText,
  ShoppingCart,
  Users,
  TrendingUp,
  Bot,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ChatBubble } from "@/components/assistant/chat-bubble";
import { AIResponseCard, type AIResponseAction } from "@/components/assistant/ai-response-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MessageContent =
  | { kind: "text"; text: string }
  | {
      kind: "card";
      title: string;
      badge?: string;
      fields?: { label: string; value: string }[];
      note?: string;
      actions?: AIResponseAction[];
    };

interface Message {
  id: number;
  role: "user" | "assistant";
  content: MessageContent[];
}

const suggestedPrompts = [
  "Order 1200 units of Paracetamol for Delhi warehouse",
  "Generate a PO for Supplier ABC",
  "Check invoice INV-204",
  "Compare suppliers for Nitrile Gloves",
  "Forecast demand for MED-2201 next quarter",
];

const quickActions: AIResponseAction[] = [
  { label: "Generate Requisition", icon: FileText, variant: "outline" },
  { label: "Create Purchase Order", icon: ShoppingCart, variant: "outline" },
  { label: "Compare Suppliers", icon: Users, variant: "outline" },
  { label: "View Forecast", icon: TrendingUp, variant: "outline" },
];

let idCounter = 1;
function nextId() {
  idCounter += 1;
  return idCounter;
}

function buildAssistantReply(userText: string): Message {
  const lower = userText.toLowerCase();

  if (lower.includes("paracetamol") || (lower.includes("order") && lower.includes("delhi"))) {
    return {
      id: nextId(),
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "Got it — I checked current stock levels and supplier availability for Paracetamol 500mg at Delhi Central WH. Here's what I found:",
        },
        {
          kind: "card",
          title: "Requisition Draft — REQ-10241",
          badge: "Ready to submit",
          fields: [
            { label: "SKU", value: "MED-2201 · Paracetamol 500mg" },
            { label: "Quantity", value: "1,200 units" },
            { label: "Warehouse", value: "Delhi Central WH" },
            { label: "Recommended Supplier", value: "MedSource Pharmaceuticals" },
            { label: "Estimated Cost", value: "₹8,160.00" },
            { label: "Lead Time", value: "3 days" },
          ],
          note: "This quantity matches your reorder point and supplier MedSource has a 98% on-time delivery record.",
          actions: [
            { label: "Generate Requisition", icon: FileText },
            { label: "Create Purchase Order", icon: ShoppingCart, variant: "default" },
          ],
        },
      ],
    };
  }

  if (lower.includes("generate a po") || lower.includes("purchase order") || lower.includes("supplier abc")) {
    return {
      id: nextId(),
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "I've drafted a purchase order based on the most recent approved requisition linked to this supplier.",
        },
        {
          kind: "card",
          title: "Purchase Order Draft — PO-88232",
          badge: "Auto-generated",
          fields: [
            { label: "Supplier", value: "Apex Industrial Supplies" },
            { label: "Items", value: "Industrial Lubricant (Drum)" },
            { label: "Quantity", value: "80 units" },
            { label: "Amount", value: "₹3,368.00" },
            { label: "Expected Delivery", value: "2026-08-19" },
          ],
          actions: [
            { label: "Create Purchase Order", icon: ShoppingCart, variant: "default" },
            { label: "Compare Suppliers", icon: Users },
          ],
        },
      ],
    };
  }

  if (lower.includes("invoice") || lower.includes("inv-")) {
    return {
      id: nextId(),
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "I pulled up INV-204 and ran it through the 3-way matching engine. Here's the result:",
        },
        {
          kind: "card",
          title: "Invoice Check — INV-204",
          badge: "Matched",
          fields: [
            { label: "Supplier", value: "MedSource Pharmaceuticals" },
            { label: "Linked PO", value: "PO-88231" },
            { label: "Amount", value: "₹8,160.00" },
            { label: "OCR Confidence", value: "98.4%" },
            { label: "Match Score", value: "97%" },
          ],
          note: "PO, goods receipt and invoice values align within tolerance. This invoice is eligible for auto-approval.",
          actions: [
            { label: "View Forecast", icon: TrendingUp },
            { label: "Compare Suppliers", icon: Users },
          ],
        },
      ],
    };
  }

  if (lower.includes("compare") || lower.includes("gloves")) {
    return {
      id: nextId(),
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "Here's how your qualified suppliers stack up for this category:",
        },
        {
          kind: "card",
          title: "Supplier Comparison — Nitrile Gloves",
          fields: [
            { label: "Apex Industrial Supplies", value: "89 reliability · 5d lead time · ₹42.10/unit" },
            { label: "Global PackTech Ltd.", value: "82 reliability · 6d lead time · ₹1.30/unit" },
            { label: "NovaMed Distribution", value: "74 reliability · 8d lead time · ₹6.20/unit" },
          ],
          note: "Apex Industrial Supplies offers the best balance of reliability and lead time for this SKU category.",
          actions: [
            { label: "Compare Suppliers", icon: Users, variant: "default" },
            { label: "Create Purchase Order", icon: ShoppingCart },
          ],
        },
      ],
    };
  }

  if (lower.includes("forecast") || lower.includes("demand")) {
    return {
      id: nextId(),
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "Based on the last 6 months of consumption data, here's the demand forecast:",
        },
        {
          kind: "card",
          title: "Demand Forecast — MED-2201",
          badge: "Next Quarter",
          fields: [
            { label: "Projected Demand", value: "4,650 units" },
            { label: "Current Avg. Monthly Usage", value: "1,340 units" },
            { label: "Recommended Reorder Point", value: "1,000 units" },
            { label: "Stockout Risk", value: "Low" },
          ],
          note: "Demand is trending up 9% quarter-over-quarter across Delhi, Kolkata and Chennai warehouses.",
          actions: [{ label: "Generate Requisition", icon: FileText, variant: "default" }],
        },
      ],
    };
  }

  return {
    id: nextId(),
    role: "assistant",
    content: [
      {
        kind: "text",
        text: "I can help with that. Try asking me to order stock, generate a purchase order, check an invoice, compare suppliers, or view a demand forecast — or use one of the quick actions below.",
      },
    ],
  };
}

export default function AssistantPage() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content: [
        {
          kind: "text",
          text: "Hi Priya 👋 I'm your Autonomous Procurement Assistant. I can raise requisitions, generate purchase orders, check invoices, compare suppliers and forecast demand — just tell me what you need.",
        },
      ],
    },
  ]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMessage: Message = { id: nextId(), role: "user", content: [{ kind: "text", text: trimmed }] };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages((prev) => [...prev, buildAssistantReply(trimmed)]);
    }, 1100);
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] animate-fade-in flex-col">
      <PageHeader
        title="AI Procurement Assistant"
        description="Natural-language interface for requisitions, purchase orders, supplier comparison and invoice checks"
      />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role}>
              {m.content.map((c, i) =>
                c.kind === "text" ? (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>
                    {c.text}
                  </p>
                ) : (
                  <AIResponseCard
                    key={i}
                    title={c.title}
                    badge={c.badge}
                    fields={c.fields}
                    note={c.note}
                    actions={c.actions}
                    onAction={(label) => sendMessage(label)}
                  />
                )
              )}
            </ChatBubble>
          ))}

          {thinking && (
            <ChatBubble role="assistant">
              <div className="flex items-center gap-1.5 py-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </ChatBubble>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="border-t border-border px-4 py-3 sm:px-6">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Sparkles size={12} /> Suggested prompts
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-500/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {quickActions.map((a) => (
              <Button key={a.label} size="sm" variant="secondary" onClick={() => sendMessage(a.label)}>
                {a.icon && <a.icon size={13} />}
                {a.label}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Bot size={16} />
            </div>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to order stock, create a PO, check an invoice..."
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send size={16} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
