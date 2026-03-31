import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, History } from "lucide-react";
import { analysisStore } from "@/lib/analysisStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: Record<string, unknown> | null;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hi! I'm your SourceIQ assistant. I can explain scores, answer questions about the analysis, or help you adjust how items are scored. What would you like to know?",
};

export default function ChatWidget() {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState<"chat" | "audit">("chat");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const projectId = analysisStore.getRfpId() ?? undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadAudit() {
    if (!projectId) return;
    setAuditLoading(true);
    try {
      const res = await api.getAuditLog(projectId);
      setAuditLog(res.entries ?? []);
    } catch {
      // silently ignore
    } finally {
      setAuditLoading(false);
    }
  }

  function handleTabChange(t: "chat" | "audit") {
    setTab(t);
    if (t === "audit") loadAudit();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const history = [...messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const rfpId          = analysisStore.getRfpId();
      const analysisResult = analysisStore.getResult();

      const res = await api.chat(
        history.map((m) => ({ role: m.role, content: m.content })),
        rfpId ?? undefined,
        analysisResult ?? undefined,
        projectId,
        "user"
      );

      const assistantMsg: Message = {
        role: "assistant",
        content: res.message,
        action: res.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't reach the backend. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="Open AI assistant"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[620px] flex flex-col rounded-2xl shadow-2xl border border-border bg-background overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-semibold text-sm">SourceIQ Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => handleTabChange("chat")}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                tab === "chat"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Chat
            </button>
            <button
              onClick={() => handleTabChange("audit")}
              className={cn(
                "flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors",
                tab === "audit"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="h-3 w-3" /> Audit Log
            </button>
          </div>

          {/* Chat tab */}
          {tab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 max-h-[460px]">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2 text-sm",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {msg.role === "user" ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 max-w-[78%] leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      )}
                    >
                      {msg.content}
                      {msg.action && (
                        <div className="mt-2 text-xs bg-background/20 rounded-lg px-2 py-1 font-mono">
                          Action: {msg.action.type as string}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-3 py-3 border-t border-border flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about scores, request changes..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* Audit tab */}
          {tab === "audit" && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0 max-h-[500px]">
              {!projectId && (
                <p className="text-xs text-muted-foreground text-center py-8">Open a project to see its audit log.</p>
              )}
              {projectId && auditLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {projectId && !auditLoading && auditLog.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No actions logged yet.</p>
              )}
              {auditLog.map((entry, i) => (
                <div key={i} className="text-xs border border-border rounded-lg px-3 py-2 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{entry.action}</span>
                    <span className="text-muted-foreground">{entry.actor}</span>
                  </div>
                  <p className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
