"use client";
import * as React from "react";
import { Send, Sparkles, Bot } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ChatBubble } from "@/components/assistant/chat-bubble";
import { AIResponseCard } from "@/components/assistant/ai-response-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendChatMessage, type ChatResult } from "@/lib/api";

type MessageContent =
  | { kind: "text"; text: string }
  | {
      kind: "card";
      title: string;
      badge?: string;
      badgeVariant?: "success" | "warning" | "destructive" | "info" | "neutral";
      fields?: { label: string; value: string }[];
      note?: string;
    };

interface Message {
  id: number;
  role: "user" | "assistant";
  content: MessageContent[];
}

// Genuine requisition-style asks that resolve cleanly against chatbot's
// known SKU aliases (chatbot/db.py) -- unlike the mock's old prompts, these
// all actually work against the real /chat endpoint.
const suggestedPrompts = [
  "Order 500 units of Paracetamol for Siliguri DC by Friday",
  "We need 200 boxes of Amoxicillin ASAP",
  "Order 300 units of Ibuprofen 400mg for Chennai DC",
];

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  PENDING: "neutral",
  VALIDATED: "success",
  FLAGGED: "warning",
  REJECTED: "destructive",
};

const ASSUMED_FIELD_LABEL: Record<string, string> = {
  destination_dc: "destination DC",
};

let idCounter = 1;
function nextId() {
  idCounter += 1;
  return idCounter;
}

function buildResultCard(result: ChatResult): Message {
  const req = result.requisition;
  const assumed = req.assumed_fields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const noteParts: string[] = [];
  if (assumed.length > 0) {
    const labels = assumed.map((f) => ASSUMED_FIELD_LABEL[f] ?? f);
    noteParts.push(`${labels.join(", ")} not stated — assumed a default.`);
  }
  if (result.validation_errors.length > 0) {
    noteParts.push(...result.validation_errors);
  }

  return {
    id: nextId(),
    role: "assistant",
    content: [
      {
        kind: "card",
        title: `Requisition Draft — REQ-${req.id}`,
        badge: req.status,
        badgeVariant: STATUS_BADGE_VARIANT[req.status] ?? "neutral",
        fields: [
          { label: "SKU", value: req.sku_name ? `${req.sku_id} · ${req.sku_name}` : req.sku_id },
          { label: "Quantity", value: `${req.quantity.toLocaleString()} units` },
          { label: "Destination DC", value: req.destination_dc },
          { label: "Urgency", value: req.urgency },
        ],
        note: noteParts.length > 0 ? noteParts.join(" ") : undefined,
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
          text: "Hi 👋 I'm your Autonomous Procurement Assistant. Tell me what you need in plain English and I'll turn it into a structured requisition.",
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

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMessage: Message = { id: nextId(), role: "user", content: [{ kind: "text", text: trimmed }] };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setThinking(true);
    try {
      const result = await sendChatMessage(trimmed);
      setMessages((prev) => [...prev, buildResultCard(result)]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: [
            {
              kind: "text",
              text: e instanceof Error ? `Something went wrong: ${e.message}` : "Something went wrong processing that request.",
            },
          ],
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] animate-fade-in flex-col">
      <PageHeader
        title="AI Procurement Assistant"
        description="Natural-language interface for raising requisitions"
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
                    badgeVariant={c.badgeVariant}
                    fields={c.fields}
                    note={c.note}
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
              placeholder="e.g. order 500 units of paracetamol for Siliguri DC by Friday"
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
