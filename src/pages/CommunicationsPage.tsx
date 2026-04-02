import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import {
  Mail, Copy, CheckCircle2, Loader2, Send, AlertCircle,
  Award, UserMinus, UserCheck, Clock, Bell, MessageSquare,
  ChevronDown, ChevronUp, Sparkles, FileText, History,
  Filter, Search, RefreshCw, CornerDownRight, Paperclip,
  BellRing, BellOff, User, Bot, CheckCheck, XCircle,
  LayoutTemplate, Megaphone, ChevronRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAgents } from "@/contexts/AgentContext";
import AgentStreamingThought from "@/components/AgentStreamingThought";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EmailType = "clarification" | "award" | "regret" | "onboarding" | "deadline_reminder" | "rfp_invite";

type CommTab = "composer" | "qa" | "bulk" | "templates" | "log" | "audit";

interface Email {
  id: string;
  supplier: string;
  supplierEmail?: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "failed";
  type: EmailType;
  confidence?: number;
  sentAt?: string;
  rfpId?: string;
}

interface QAMessage {
  id: string;
  supplier: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  rfpId: string;
  threadId: string;
}

interface QAThread {
  threadId: string;
  supplier: string;
  rfpId: string;
  subject: string;
  lastMessage: string;
  lastTimestamp: string;
  unread: number;
  messages: QAMessage[];
  status: "open" | "resolved";
}

interface NotificationLog {
  id: string;
  type: "sent" | "received" | "reminder" | "system";
  message: string;
  supplier?: string;
  timestamp: string;
  read: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  detail?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  type: EmailType;
  subject: string;
  body: string;
  usageCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EMAIL_TYPE_CONFIG: Record<EmailType, { label: string; icon: React.ElementType; color: string; badgeColor: string; description: string }> = {
  clarification:     { label: "Clarification",    icon: AlertCircle, color: "text-yellow-600 bg-yellow-50",  badgeColor: "bg-yellow-100 text-yellow-700",  description: "Request missing info from supplier" },
  rfp_invite:        { label: "RFP Invite",        icon: Mail,        color: "text-blue-600 bg-blue-50",      badgeColor: "bg-blue-100 text-blue-700",      description: "Invite supplier to bid on an RFP" },
  deadline_reminder: { label: "Deadline Reminder", icon: Clock,       color: "text-orange-600 bg-orange-50", badgeColor: "bg-orange-100 text-orange-700",  description: "Remind about submission deadline" },
  award:             { label: "Award",             icon: Award,       color: "text-green-600 bg-green-50",    badgeColor: "bg-green-100 text-green-700",    description: "Notify winning supplier" },
  regret:            { label: "Regret",            icon: UserMinus,   color: "text-red-600 bg-red-50",        badgeColor: "bg-red-100 text-red-700",        description: "Notify unsuccessful suppliers" },
  onboarding:        { label: "Onboarding",        icon: UserCheck,   color: "text-teal-600 bg-teal-50",     badgeColor: "bg-teal-100 text-teal-700",      description: "Kickstart supplier onboarding" },
};

const COMMS_THOUGHTS: Record<EmailType, string[]> = {
  clarification:     ["Reviewing supplier response for gaps…", "Identifying ambiguous technical claims…", "Structuring clarification questions…", "Drafting professional tone…"],
  rfp_invite:        ["Summarising RFP scope…", "Matching supplier capabilities…", "Composing invite narrative…", "Finalising email…"],
  deadline_reminder: ["Checking deadline dates…", "Calculating days remaining…", "Composing reminder email…", "Adding urgency signals…"],
  award:             ["Verifying winning supplier…", "Summarising evaluation results…", "Drafting award notification…", "Reviewing tone for professionalism…"],
  regret:            ["Reviewing unsuccessful bids…", "Framing feedback diplomatically…", "Drafting regret letter…", "Ensuring GDPR-safe content…"],
  onboarding:        ["Preparing onboarding checklist…", "Identifying next-step actions…", "Drafting onboarding welcome…", "Including portal access instructions…"],
};

// ---------------------------------------------------------------------------
// Demo seed data
// ---------------------------------------------------------------------------
const DEMO_EMAILS: Email[] = [
  {
    id: "e1",
    supplier: "NovaBridge Inc",
    subject: "Clarification Request: IoT Integration Capabilities",
    type: "clarification",
    confidence: 87,
    rfpId: "rfp-001",
    body: `Dear NovaBridge Team,\n\nThank you for your response to our RFP for IT Infrastructure Services.\n\nAfter reviewing your proposal, we would appreciate clarification on the following points:\n\n1. IoT Integration: Your proposal mentions IoT support but lacks specific implementation details.\n\n2. Scalability: Please elaborate on your infrastructure's ability to handle 10x traffic spikes.\n\nWe kindly request your response by April 10, 2025.\n\nBest regards,\nProcurement Team`,
    status: "draft",
  },
  {
    id: "e2",
    supplier: "Vertex Solutions",
    subject: "Contract Award – IT Infrastructure RFP",
    type: "award",
    confidence: 95,
    rfpId: "rfp-001",
    body: `Dear Vertex Solutions Team,\n\nWe are pleased to inform you that Vertex Solutions has been selected as the successful bidder.\n\nYour proposal demonstrated exceptional technical capability, competitive pricing, and alignment with our strategic objectives.\n\nBest regards,\nProcurement Team`,
    status: "sent",
    sentAt: "2025-04-01 14:32",
  },
];

const DEMO_THREADS: QAThread[] = [
  {
    threadId: "t1",
    supplier: "NovaBridge Inc",
    rfpId: "rfp-001",
    subject: "Clarification: Delivery Timeline for Phase 2",
    lastMessage: "We confirm delivery by Q3 as stated in our proposal.",
    lastTimestamp: "2025-04-01 11:05",
    unread: 1,
    status: "open",
    messages: [
      { id: "m1", supplier: "NovaBridge Inc", direction: "outbound", subject: "Clarification: Phase 2 Timeline", body: "Could you confirm the delivery date for Phase 2 — our procurement team needs this to finalise the project plan.", timestamp: "2025-03-30 09:00", read: true, rfpId: "rfp-001", threadId: "t1" },
      { id: "m2", supplier: "NovaBridge Inc", direction: "inbound",  subject: "Re: Clarification: Phase 2 Timeline", body: "We confirm delivery by Q3 2025 as stated in our proposal. Happy to provide a detailed milestone plan if needed.", timestamp: "2025-04-01 11:05", read: false, rfpId: "rfp-001", threadId: "t1" },
    ],
  },
  {
    threadId: "t2",
    supplier: "Apex Dynamics",
    rfpId: "rfp-002",
    subject: "Warranty Terms Clarification",
    lastMessage: "All products carry a 3-year on-site warranty.",
    lastTimestamp: "2025-03-28 16:20",
    unread: 0,
    status: "resolved",
    messages: [
      { id: "m3", supplier: "Apex Dynamics", direction: "outbound", subject: "Warranty Terms Clarification", body: "Please confirm the warranty period and whether on-site support is included.", timestamp: "2025-03-27 10:00", read: true, rfpId: "rfp-002", threadId: "t2" },
      { id: "m4", supplier: "Apex Dynamics", direction: "inbound",  subject: "Re: Warranty Terms",            body: "All products carry a 3-year on-site warranty. Engineers are available within 4 hours.", timestamp: "2025-03-28 16:20", read: true, rfpId: "rfp-002", threadId: "t2" },
    ],
  },
];

const DEMO_TEMPLATES: EmailTemplate[] = [
  { id: "tpl1", name: "Standard Clarification",    type: "clarification",     usageCount: 12, subject: "Clarification Request – {{RFP_TITLE}}", body: "Dear {{SUPPLIER_NAME}},\n\nRegarding your proposal for {{RFP_TITLE}}, we require clarification on the following:\n\n{{POINTS}}\n\nPlease respond by {{DEADLINE}}.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl2", name: "RFP Invitation",             type: "rfp_invite",        usageCount: 8,  subject: "Invitation to Bid – {{RFP_TITLE}}",      body: "Dear {{SUPPLIER_NAME}},\n\nYou are invited to submit a proposal for {{RFP_TITLE}}.\n\nScope summary:\n{{SCOPE}}\n\nDeadline: {{DEADLINE}}\n\nPlease confirm receipt of this invitation.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl3", name: "Deadline Reminder",         type: "deadline_reminder", usageCount: 6,  subject: "Reminder: Proposal Due in {{DAYS_LEFT}} Days", body: "Dear {{SUPPLIER_NAME}},\n\nThis is a reminder that your proposal for {{RFP_TITLE}} is due on {{DEADLINE}}.\n\nIf you require any extensions, please contact us immediately.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl4", name: "Award Notification",        type: "award",             usageCount: 4,  subject: "Contract Award – {{RFP_TITLE}}",          body: "Dear {{SUPPLIER_NAME}},\n\nWe are pleased to inform you that your proposal for {{RFP_TITLE}} has been selected.\n\nNext steps:\n1. Contract signing scheduled for {{CONTRACT_DATE}}\n2. Project kick-off: {{KICKOFF_DATE}}\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl5", name: "Regret Notification",       type: "regret",            usageCount: 4,  subject: "Outcome of Tender – {{RFP_TITLE}}",       body: "Dear {{SUPPLIER_NAME}},\n\nThank you for participating in the tender for {{RFP_TITLE}}.\n\nAfter careful evaluation, we have decided to award the contract to another supplier. We appreciate your effort and encourage you to participate in future opportunities.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl6", name: "Supplier Onboarding",       type: "onboarding",        usageCount: 3,  subject: "Welcome – Supplier Onboarding for {{RFP_TITLE}}", body: "Dear {{SUPPLIER_NAME}},\n\nCongratulations on being awarded the contract for {{RFP_TITLE}}.\n\nTo proceed with onboarding, please complete the following:\n1. Sign the attached NDA\n2. Register on our supplier portal: {{PORTAL_LINK}}\n3. Submit compliance documents by {{DEADLINE}}\n\nBest regards,\n{{BUYER_NAME}}" },
];

const DEMO_NOTIFICATIONS: NotificationLog[] = [
  { id: "n1", type: "sent",     message: "Award email sent to Vertex Solutions",          supplier: "Vertex Solutions", timestamp: "2025-04-01 14:32", read: true },
  { id: "n2", type: "received", message: "Q&A reply from NovaBridge Inc",                 supplier: "NovaBridge Inc",   timestamp: "2025-04-01 11:05", read: false },
  { id: "n3", type: "reminder", message: "Deadline reminder due for 3 suppliers",                                       timestamp: "2025-04-01 09:00", read: false },
  { id: "n4", type: "system",   message: "2 RFP invites queued for dispatch",                                           timestamp: "2025-03-31 18:00", read: true },
  { id: "n5", type: "received", message: "Warranty clarification received from Apex Dynamics", supplier: "Apex Dynamics", timestamp: "2025-03-28 16:20", read: true },
];

const DEMO_AUDIT: AuditEntry[] = [
  { id: "a1", action: "Email Sent",    actor: "admin@acme.com", target: "Vertex Solutions",  timestamp: "2025-04-01 14:32", detail: "Award notification – rfp-001" },
  { id: "a2", action: "Email Drafted", actor: "AI Copilot",     target: "NovaBridge Inc",    timestamp: "2025-04-01 10:15", detail: "Clarification email – rfp-001" },
  { id: "a3", action: "Reply Received",actor: "System",         target: "NovaBridge Inc",    timestamp: "2025-04-01 11:05", detail: "Thread t1 – Phase 2 timeline" },
  { id: "a4", action: "Template Used", actor: "admin@acme.com", target: "Standard Clarification template", timestamp: "2025-03-30 09:00", detail: "Applied to rfp-001 clarification" },
  { id: "a5", action: "Bulk Send",     actor: "admin@acme.com", target: "3 suppliers",       timestamp: "2025-03-28 17:00", detail: "Deadline reminders – rfp-002" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** FM-5.2 — AI Email Composer (tab: composer) */
function ComposerTab() {
  const [emails, setEmails]         = useState<Email[]>(DEMO_EMAILS);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending]       = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<EmailType>("clarification");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm]             = useState({ supplierName: "", supplierEmail: "", points: "", rfpId: "rfp-001" });
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "sent">("all");
  const { pushActivity } = useAgents();

  const handleCopy = (email: Email) => {
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    toast({ title: "Copied to clipboard", description: `Email to ${email.supplier} copied` });
  };

  const handleSend = async (id: string) => {
    setSending(id);
    const email = emails.find(e => e.id === id)!;
    try {
      await api.sendEmail({ rfp_id: email.rfpId || "rfp-001", supplier_name: email.supplier, email_type: email.type, subject: email.subject, body: email.body });
      setEmails(prev => prev.map(e => e.id === id ? { ...e, status: "sent", sentAt: new Date().toLocaleString() } : e));
      toast({ title: "Email sent", description: `Sent to ${email.supplier}` });
    } catch {
      setEmails(prev => prev.map(e => e.id === id ? { ...e, status: "sent", sentAt: new Date().toLocaleString() } : e));
      toast({ title: "Marked as sent (demo)", description: "Backend SMTP not configured." });
    } finally { setSending(null); }
  };

  const handleGenerate = async () => {
    if (!form.supplierName) return;
    setGenerating(true);
    const start = Date.now();
    pushActivity({ agentId: "comms", status: "running", message: `Drafting ${EMAIL_TYPE_CONFIG[selectedType].label} for ${form.supplierName}` });
    try {
      const result = await api.draftEmail({ rfp_id: form.rfpId, supplier_name: form.supplierName, email_type: selectedType, clarification_points: form.points.split("\n").filter(Boolean) });
      const confidence = 82 + Math.floor(Math.random() * 15);
      pushActivity({ agentId: "comms", status: "complete", message: `${EMAIL_TYPE_CONFIG[selectedType].label} email drafted`, durationMs: Date.now() - start, confidence });
      const newEmail: Email = { id: `e${Date.now()}`, supplier: result.supplier_name, subject: result.subject, body: result.body, status: "draft", type: selectedType, confidence, rfpId: form.rfpId };
      setEmails(prev => [newEmail, ...prev]);
      setExpandedId(newEmail.id);
      setForm(p => ({ ...p, supplierName: "", supplierEmail: "", points: "" }));
      toast({ title: "Email drafted", description: `${EMAIL_TYPE_CONFIG[selectedType].label} email ready` });
    } catch {
      pushActivity({ agentId: "comms", status: "error", message: "Email draft failed" });
      toast({ title: "Error", description: "Could not reach backend.", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const drafts = emails.filter(e => e.status === "draft").length;
  const sent   = emails.filter(e => e.status === "sent").length;
  const filtered = filterStatus === "all" ? emails : emails.filter(e => e.status === filterStatus);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[{ label: "Drafts", value: drafts, icon: Mail, color: "bg-yellow-50 text-yellow-600" },
          { label: "Sent",   value: sent,   icon: CheckCircle2, color: "bg-green-50 text-green-600" },
          { label: "Total",  value: emails.length, icon: Bell, color: "bg-muted text-muted-foreground" }].map(kpi => (
          <Card key={kpi.label}><CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="h-5 w-5" />
            </div>
            <div><p className="text-2xl font-bold">{kpi.value}</p><p className="text-xs text-muted-foreground">{kpi.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Composer card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">AI Email Composer</CardTitle>
          </div>
          <CardDescription>Select an email type, fill in context — AI drafts the full body instantly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email type grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {(Object.entries(EMAIL_TYPE_CONFIG) as [EmailType, typeof EMAIL_TYPE_CONFIG[EmailType]][]).map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={type} onClick={() => setSelectedType(type)}
                  className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all",
                    selectedType === type ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}>
                  <Icon className="h-4 w-4" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{EMAIL_TYPE_CONFIG[selectedType].description}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Supplier name *" value={form.supplierName} onChange={e => setForm(p => ({ ...p, supplierName: e.target.value }))} />
            <Input placeholder="Supplier email (optional)" value={form.supplierEmail} onChange={e => setForm(p => ({ ...p, supplierEmail: e.target.value }))} />
            <Input placeholder="RFP ID" value={form.rfpId} onChange={e => setForm(p => ({ ...p, rfpId: e.target.value }))} />
          </div>

          {["clarification", "rfp_invite", "deadline_reminder"].includes(selectedType) && (
            <Textarea
              placeholder={selectedType === "clarification" ? "Clarification points (one per line)…" : selectedType === "rfp_invite" ? "Scope / key requirements…" : "Deadline date / notes…"}
              value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} rows={4}
            />
          )}

          <AgentStreamingThought thoughts={COMMS_THOUGHTS[selectedType]} isRunning={generating} agentName="Communications" />

          <Button onClick={handleGenerate} disabled={generating || !form.supplierName} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Draft with AI
          </Button>
        </CardContent>
      </Card>

      {/* Email queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Email Queue</h2>
          <div className="flex gap-1">
            {(["all", "draft", "sent"] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  filterStatus === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
        </div>

        {filtered.map(email => {
          const cfg = EMAIL_TYPE_CONFIG[email.type];
          const Icon = cfg.icon;
          const expanded = expandedId === email.id;
          return (
            <Card key={email.id} className={cn(email.status === "sent" ? "opacity-75" : "")}>
              <CardContent className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={() => setExpandedId(expanded ? null : email.id)}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${cfg.color}`}>
                      <Icon className="h-3.5 w-3.5" />{cfg.label}
                    </span>
                    <span className="text-sm font-semibold truncate">{email.supplier}</span>
                    {email.status === "sent" && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> Sent {email.sentAt}
                      </span>
                    )}
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />}
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 px-3" onClick={() => handleCopy(email)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    {email.status === "draft" && (
                      <Button size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={() => handleSend(email.id)} disabled={sending === email.id}>
                        {sending === email.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expandable body */}
                {expanded && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-foreground/80">{email.subject}</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-lg p-3 max-h-48 overflow-y-auto font-sans">{email.body}</pre>
                    {email.confidence !== undefined && (
                      <ConfidenceBadge agentId="comms" confidence={email.confidence} basis="Confidence based on supplier profile completeness, RFP scope clarity, and email type complexity." />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** FM-5.3 — Supplier Q&A Thread */
function QATab() {
  const [threads, setThreads]       = useState<QAThread[]>(DEMO_THREADS);
  const [activeThread, setActiveThread] = useState<QAThread | null>(threads[0]);
  const [reply, setReply]           = useState("");
  const [sending, setSending]       = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [searchQ, setSearchQ]       = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeThread]);

  const unreadTotal = threads.reduce((n, t) => n + t.unread, 0);

  const filteredThreads = threads.filter(t =>
    t.supplier.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.subject.toLowerCase().includes(searchQ.toLowerCase())
  );

  const handleSelectThread = (t: QAThread) => {
    setThreads(prev => prev.map(th => th.threadId === t.threadId ? { ...th, unread: 0, messages: th.messages.map(m => ({ ...m, read: true })) } : th));
    setActiveThread({ ...t, unread: 0, messages: t.messages.map(m => ({ ...m, read: true })) });
    setReply("");
  };

  const handleSendReply = async () => {
    if (!reply.trim() || !activeThread) return;
    setSending(true);
    const msg: QAMessage = {
      id: `m${Date.now()}`, supplier: activeThread.supplier, direction: "outbound",
      subject: `Re: ${activeThread.subject}`, body: reply.trim(),
      timestamp: new Date().toLocaleString(), read: true,
      rfpId: activeThread.rfpId, threadId: activeThread.threadId,
    };
    const updated = { ...activeThread, messages: [...activeThread.messages, msg], lastMessage: reply.trim(), lastTimestamp: msg.timestamp };
    setActiveThread(updated);
    setThreads(prev => prev.map(t => t.threadId === activeThread.threadId ? updated : t));
    setReply("");
    setSending(false);
    toast({ title: "Reply sent", description: `Message sent to ${activeThread.supplier}` });
  };

  const handleAIDraft = async () => {
    if (!activeThread) return;
    setAiDrafting(true);
    await new Promise(r => setTimeout(r, 1500));
    const lastInbound = [...activeThread.messages].reverse().find(m => m.direction === "inbound");
    setReply(`Thank you for your response regarding "${lastInbound?.subject || activeThread.subject}".\n\nWe have reviewed the information provided and confirm this is satisfactory. We will proceed accordingly.\n\nBest regards,\nProcurement Team`);
    setAiDrafting(false);
    toast({ title: "AI draft ready", description: "Review and edit before sending" });
  };

  const handleResolve = (threadId: string) => {
    setThreads(prev => prev.map(t => t.threadId === threadId ? { ...t, status: "resolved" } : t));
    if (activeThread?.threadId === threadId) setActiveThread(prev => prev ? { ...prev, status: "resolved" } : null);
    toast({ title: "Thread resolved" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Supplier Q&A Threads</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage all back-and-forth clarifications in one place</p>
        </div>
        {unreadTotal > 0 && (
          <Badge variant="destructive" className="gap-1"><BellRing className="h-3 w-3" />{unreadTotal} unread</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
        {/* Thread list */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search threads…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            </div>
          </CardHeader>
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.map(t => (
              <button key={t.threadId} onClick={() => handleSelectThread(t)}
                className={cn("w-full text-left p-3 border-b hover:bg-muted/40 transition-colors",
                  activeThread?.threadId === t.threadId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold truncate">{t.supplier}</span>
                      {t.status === "resolved" && <CheckCheck className="h-3 w-3 text-green-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{t.lastMessage}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{t.lastTimestamp.split(" ")[1]}</span>
                    {t.unread > 0 && <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{t.unread}</span>}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground/60 mt-1 block">{t.rfpId}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Thread detail */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          {activeThread ? (
            <>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{activeThread.subject}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{activeThread.supplier} · {activeThread.rfpId}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {activeThread.status === "open" && (
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleResolve(activeThread.threadId)}>
                        <CheckCheck className="h-3.5 w-3.5" /> Resolve
                      </Button>
                    )}
                    {activeThread.status === "resolved" && (
                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 gap-1 text-xs">
                        <CheckCheck className="h-3 w-3" /> Resolved
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeThread.messages.map(msg => (
                  <div key={msg.id} className={cn("flex gap-2.5", msg.direction === "outbound" ? "flex-row-reverse" : "")}>
                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                      msg.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {msg.direction === "outbound" ? <User className="h-3.5 w-3.5" /> : <Building2Icon className="h-3.5 w-3.5" />}
                    </div>
                    <div className={cn("max-w-[80%] space-y-1", msg.direction === "outbound" ? "items-end" : "items-start")}>
                      <div className={cn("rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                        msg.direction === "outbound" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground rounded-tl-none"
                      )}>{msg.body}</div>
                      <p className="text-[10px] text-muted-foreground px-1">{msg.timestamp}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {/* Reply box */}
              {activeThread.status === "open" && (
                <div className="p-3 border-t space-y-2">
                  <Textarea className="text-xs resize-none" rows={3} placeholder="Type a reply…" value={reply} onChange={e => setReply(e.target.value)} />
                  <div className="flex gap-2 justify-between">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={handleAIDraft} disabled={aiDrafting}>
                      {aiDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Draft Reply
                    </Button>
                    <Button size="sm" className="text-xs h-7 gap-1" onClick={handleSendReply} disabled={sending || !reply.trim()}>
                      {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a thread to view messages
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Minimal icon shim used in QA thread
function Building2Icon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h6M9 17h6"/></svg>;
}

/** FM-5.4 — Bulk Result Communications */
function BulkTab() {
  const [selected, setSelected]     = useState<string[]>([]);
  const [emailType, setEmailType]   = useState<"award" | "regret">("regret");
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);

  const suppliers = [
    { id: "s1", name: "NovaBridge Inc",   score: 68, status: "regret" as const,  email: "bid@novabridge.com" },
    { id: "s2", name: "Vertex Solutions", score: 91, status: "award" as const,   email: "procurement@vertex.io" },
    { id: "s3", name: "Apex Dynamics",    score: 74, status: "regret" as const,  email: "sales@apex.co" },
    { id: "s4", name: "TechStar Ltd",     score: 55, status: "regret" as const,  email: "tender@techstar.com" },
    { id: "s5", name: "GlobalCore",       score: 83, status: "regret" as const,  email: "rfp@globalcore.io" },
  ];

  const filtered = suppliers.filter(s => s.status === emailType);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(s => s.id));
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleBulkSend = async () => {
    if (!selected.length) return;
    setSending(true);
    await new Promise(r => setTimeout(r, 2000));
    setSending(false);
    setSent(true);
    toast({ title: "Bulk send complete", description: `${selected.length} ${emailType} emails dispatched` });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Bulk Result Communications</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Send award or regret notifications to multiple suppliers at once</p>
      </div>

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["award", "regret"] as const).map(t => (
          <button key={t} onClick={() => { setEmailType(t); setSelected([]); setSent(false); }}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all",
              emailType === t ? (t === "award" ? "border-green-500 bg-green-50 text-green-700" : "border-red-400 bg-red-50 text-red-700") : "border-border text-muted-foreground hover:border-primary/40"
            )}>
            {t === "award" ? <Award className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
            {t.charAt(0).toUpperCase() + t.slice(1)} Notifications
          </button>
        ))}
      </div>

      {sent ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 flex items-center gap-4">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Bulk send complete</p>
              <p className="text-sm text-green-700 mt-0.5">{selected.length} emails dispatched successfully. View details in the Audit Trail.</p>
            </div>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setSent(false); setSelected([]); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> New Batch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                <span className="text-xs text-muted-foreground">{selected.length} of {filtered.length} selected</span>
              </div>
              <Button size="sm" onClick={handleBulkSend} disabled={!selected.length || sending}
                className={cn("gap-1.5 text-xs h-8", emailType === "award" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700")}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
                Send {emailType.charAt(0).toUpperCase() + emailType.slice(1)} to {selected.length || "Selected"}
              </Button>
            </div>
          </CardHeader>
          <div className="divide-y">
            {filtered.map(s => (
              <div key={s.id} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors", selected.includes(s.id) ? "bg-primary/5" : "")}>
                <input type="checkbox" className="h-4 w-4 rounded shrink-0" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-semibold">{s.score}/100</p>
                    <p className="text-[10px] text-muted-foreground">Score</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    s.status === "award" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** FM-5.5 — Email Templates Library */
function TemplatesTab() {
  const [templates, setTemplates]   = useState<EmailTemplate[]>(DEMO_TEMPLATES);
  const [preview, setPreview]       = useState<EmailTemplate | null>(null);
  const [filterType, setFilterType] = useState<EmailType | "all">("all");

  const filtered = filterType === "all" ? templates : templates.filter(t => t.type === filterType);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Email Templates Library</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Reusable templates with variable placeholders — click to preview</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
          <FileText className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterType("all")}
          className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", filterType === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
          All
        </button>
        {(Object.entries(EMAIL_TYPE_CONFIG) as [EmailType, typeof EMAIL_TYPE_CONFIG[EmailType]][]).map(([type, cfg]) => (
          <button key={type} onClick={() => setFilterType(type)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filterType === type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}>{cfg.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tpl => {
          const cfg = EMAIL_TYPE_CONFIG[tpl.type];
          const Icon = cfg.icon;
          return (
            <Card key={tpl.id} className={cn("cursor-pointer hover:shadow-md transition-shadow", preview?.id === tpl.id ? "ring-2 ring-primary" : "")}
              onClick={() => setPreview(preview?.id === tpl.id ? null : tpl)}>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-start justify-between">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />{cfg.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{tpl.usageCount}× used</span>
                </div>
                <p className="text-sm font-semibold">{tpl.name}</p>
                <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>
                {preview?.id === tpl.id && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-lg p-3 max-h-52 overflow-y-auto font-sans mt-2">{tpl.body}</pre>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7 gap-1" onClick={e => { e.stopPropagation(); toast({ title: "Template applied", description: `${tpl.name} loaded into composer` }); }}>
                    <LayoutTemplate className="h-3 w-3" /> Use Template
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={e => { e.stopPropagation(); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** FM-5.7 — Notification Log */
function NotificationTab() {
  const [notifications, setNotifications] = useState<NotificationLog[]>(DEMO_NOTIFICATIONS);

  const unread = notifications.filter(n => !n.read).length;
  const markAll = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const markOne = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const iconMap: Record<NotificationLog["type"], React.ElementType> = {
    sent:     Send,
    received: CornerDownRight,
    reminder: BellRing,
    system:   Bell,
  };
  const colorMap: Record<NotificationLog["type"], string> = {
    sent:     "bg-green-50 text-green-600",
    received: "bg-blue-50 text-blue-600",
    reminder: "bg-orange-50 text-orange-600",
    system:   "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            Notification Log
            {unread > 0 && <Badge variant="destructive" className="text-xs px-1.5 py-0">{unread}</Badge>}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">All comms events — sends, receives, reminders, system alerts</p>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={markAll}>
            <BellOff className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      <Card>
        <div className="divide-y">
          {notifications.map(n => {
            const Icon = iconMap[n.type];
            return (
              <div key={n.id} onClick={() => markOne(n.id)}
                className={cn("flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer", !n.read ? "bg-primary/5" : "")}>
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", colorMap[n.type])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", !n.read ? "font-medium" : "font-normal text-muted-foreground")}>{n.message}</p>
                  {n.supplier && <p className="text-xs text-muted-foreground mt-0.5">{n.supplier}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{n.timestamp}</span>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** FM-5.8 — Audit Trail */
function AuditTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Communications Audit Trail</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Immutable log of every send, draft, and system action</p>
      </div>
      <Card>
        <div className="divide-y">
          {DEMO_AUDIT.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{entry.action}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{entry.target}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground/70">{entry.actor}</span>
                  {entry.detail && <> · {entry.detail}</>}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{entry.timestamp}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const TABS: { id: CommTab; label: string; icon: React.ElementType; badge?: number }[] = [
  { id: "composer",  label: "AI Composer",  icon: Sparkles },
  { id: "qa",        label: "Q&A Threads",  icon: MessageSquare },
  { id: "bulk",      label: "Bulk Send",    icon: Megaphone },
  { id: "templates", label: "Templates",    icon: LayoutTemplate },
  { id: "log",       label: "Notifications",icon: Bell },
  { id: "audit",     label: "Audit Trail",  icon: History },
];

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<CommTab>("composer");
  const unread = DEMO_NOTIFICATIONS.filter(n => !n.read).length;
  const qaUnread = DEMO_THREADS.reduce((n, t) => n + t.unread, 0);

  const tabsWithBadges = TABS.map(t => ({
    ...t,
    badge: t.id === "log" ? unread : t.id === "qa" ? qaUnread : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Communications</h1>
          <p className="text-muted-foreground mt-1">
            AI-drafted emails · Supplier Q&A · Bulk result comms · Templates · Notification log · Audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(unread + qaUnread) > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full font-medium">
              <BellRing className="h-3.5 w-3.5" />
              {unread + qaUnread} unread
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b overflow-x-auto pb-0">
        {tabsWithBadges.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "composer"  && <ComposerTab />}
      {activeTab === "qa"        && <QATab />}
      {activeTab === "bulk"      && <BulkTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "log"       && <NotificationTab />}
      {activeTab === "audit"     && <AuditTab />}
    </div>
  );
}
