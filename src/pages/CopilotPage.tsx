import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Zap,
  FileText,
  BarChart3,
  Mail,
  Trophy,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolUsed?: string;
}

const QUICK_ACTIONS = [
  { label: "Send reminder to all suppliers",         icon: Mail,      prompt: "Send a reminder to all suppliers who haven't responded yet" },
  { label: "Best technical score",                   icon: BarChart3, prompt: "Show me the best technical score across all suppliers" },
  { label: "Generate award letter for Supplier X",   icon: Trophy,    prompt: "Draft an award letter for the top-scoring supplier" },
  { label: "Create RFP for industrial fasteners",    icon: FileText,  prompt: "Create an RFP for industrial fasteners, 500K pieces per year, ISO 9001 required" },
];

const SUGGESTED_PROMPTS = [
  "Which suppliers are at risk of missing the deadline?",
  "Summarize the pricing analysis for this project",
  "What's the biggest gap in Supplier B's technical response?",
  "Generate a negotiation brief for the top 3 suppliers",
];

// ── Message bubble ─────────────────────────────────────────────────────────────
const MessageBubble = ({ msg }: { msg: Message }) => {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[75%] space-y-1 ${
        isUser ? "items-end" : "items-start"
      } flex flex-col`}>
        {msg.toolUsed && (
          <Badge variant="secondary" className="text-xs self-start">
            <Zap className="h-3 w-3 mr-1" /> {msg.toolUsed}
          </Badge>
        )}
        <div className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}>
          {msg.content}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your SourceIQ Copilot. I can help you manage RFPs, analyse supplier responses, draft communications, and run award scenarios. What would you like to do today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // TODO: wire to /api/chat endpoint (chat_agent.py)
    await new Promise((r) => setTimeout(r, 1200));
    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: `I've received your request: "${text}". This action will be routed to the appropriate agent. (Connect to /api/chat for live responses — FM-9.3)`,
      timestamp: new Date(),
      toolUsed: "chat_agent",
    };
    setMessages((prev) => [...prev, botMsg]);
    setIsTyping(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">AI Copilot</h1>
          <p className="text-xs text-muted-foreground">Agentic assistant — FM-9 · Context: all active projects</p>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <Card className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4 py-4">
              <div className="space-y-4">
                {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
                {isTyping && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-sm px-4 py-3">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
          </Card>

          {/* Suggested prompts */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors text-muted-foreground"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <div className="flex gap-2">
            <Input
              placeholder="Ask the copilot anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              className="flex-1"
            />
            <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick Actions sidebar */}
        <div className="w-64 shrink-0 space-y-3">
          <p className="text-sm font-medium">Quick Actions</p>
          {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
            <Card
              key={label}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => sendMessage(prompt)}
            >
              <CardContent className="pt-3 pb-3 flex items-start gap-3">
                <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
