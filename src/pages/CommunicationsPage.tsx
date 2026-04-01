import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
  Mail, Copy, CheckCircle2, Loader2, Send, AlertCircle,
  Award, UserMinus, UserCheck, Clock, Bell,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type EmailType = "clarification" | "award" | "regret" | "onboarding" | "deadline_reminder" | "rfp_invite";

interface Email {
  supplier: string;
  subject: string;
  body: string;
  status: "draft" | "sent";
  type: EmailType;
}

const EMAIL_TYPE_CONFIG: Record<EmailType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  clarification:   { label: "Clarification",    icon: AlertCircle, color: "text-yellow-600 bg-yellow-50",  description: "Request missing info from supplier" },
  rfp_invite:      { label: "RFP Invite",       icon: Mail,        color: "text-blue-600 bg-blue-50",      description: "Invite supplier to bid on an RFP" },
  deadline_reminder: { label: "Deadline Reminder", icon: Clock,    color: "text-orange-600 bg-orange-50", description: "Remind about submission deadline" },
  award:           { label: "Award",            icon: Award,       color: "text-green-600 bg-green-50",    description: "Notify winning supplier" },
  regret:          { label: "Regret",           icon: UserMinus,   color: "text-red-600 bg-red-50",        description: "Notify unsuccessful suppliers" },
  onboarding:      { label: "Onboarding",       icon: UserCheck,   color: "text-teal-600 bg-teal-50",     description: "Kickstart supplier onboarding" },
};

const demoEmails: Email[] = [
  {
    supplier: "NovaBridge Inc",
    subject: "Clarification Request: IoT Integration Capabilities",
    type: "clarification",
    body: `Dear NovaBridge Team,\n\nThank you for your response to our RFP for IT Infrastructure Services.\n\nAfter reviewing your proposal, we would appreciate clarification on the following points:\n\n1. IoT Integration: Your proposal mentions IoT support but lacks specific implementation details. Could you provide architecture diagrams and case studies?\n\n2. Scalability: Please elaborate on your infrastructure's ability to handle 10x traffic spikes.\n\n3. Certifications: We noticed your team's SOC 2 certification is pending. What is the expected completion date?\n\nWe kindly request your response by April 5, 2025.\n\nBest regards,\nProcurement Team`,
    status: "draft",
  },
  {
    supplier: "Vertex Solutions",
    subject: "Contract Award – IT Infrastructure RFP",
    type: "award",
    body: `Dear Vertex Solutions Team,\n\nWe are pleased to inform you that following a thorough evaluation of all proposals submitted for our IT Infrastructure RFP, Vertex Solutions has been selected as the successful bidder.\n\nYour proposal demonstrated exceptional technical capability, competitive pricing, and alignment with our strategic objectives.\n\nOur procurement team will be in touch within 3 business days to initiate contract negotiations.\n\nCongratulations and we look forward to a successful partnership.\n\nBest regards,\nProcurement Team`,
    status: "draft",
  },
];

export default function CommunicationsPage() {
  const [emails, setEmails] = useState<Email[]>(demoEmails);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<EmailType>("clarification");
  const [form, setForm] = useState({ supplierName: "", supplierEmail: "", points: "", rfpId: "rfp-001" });

  const handleCopy = (email: Email) => {
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    toast({ title: "Copied to clipboard", description: `Email to ${email.supplier} copied` });
  };

  const handleSend = async (index: number) => {
    setSending(index);
    const email = emails[index];
    try {
      await api.sendEmail({
        rfp_id: form.rfpId,
        supplier_name: email.supplier,
        email_type: email.type,
        subject: email.subject,
        body: email.body,
      });
      setEmails(prev => prev.map((e, i) => i === index ? { ...e, status: "sent" } : e));
      toast({ title: "Email sent", description: `Sent to ${email.supplier}` });
    } catch {
      setEmails(prev => prev.map((e, i) => i === index ? { ...e, status: "sent" } : e));
      toast({ title: "Marked as sent (demo)", description: "Backend SMTP not configured; marked locally." });
    } finally {
      setSending(null);
    }
  };

  const handleGenerate = async () => {
    if (!form.supplierName) return;
    setGenerating(true);
    try {
      const result = await api.draftEmail({
        rfp_id: form.rfpId,
        supplier_name: form.supplierName,
        email_type: selectedType,
        clarification_points: form.points.split("\n").filter(Boolean),
      });
      setEmails(prev => [
        { supplier: result.supplier_name, subject: result.subject, body: result.body, status: "draft", type: selectedType },
        ...prev,
      ]);
      setForm(p => ({ ...p, supplierName: "", supplierEmail: "", points: "" }));
      toast({ title: "Email drafted", description: `${EMAIL_TYPE_CONFIG[selectedType].label} email ready` });
    } catch {
      toast({ title: "Error", description: "Could not reach backend.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const drafts = emails.filter(e => e.status === "draft").length;
  const sent   = emails.filter(e => e.status === "sent").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Communications</h1>
        <p className="text-muted-foreground mt-1">Draft, review, and send all procurement emails — from RFP invites to award notifications</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center"><Mail className="h-5 w-5 text-yellow-600" /></div>
          <div><p className="text-2xl font-bold">{drafts}</p><p className="text-xs text-muted-foreground">Drafts</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-2xl font-bold">{sent}</p><p className="text-xs text-muted-foreground">Sent</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Bell className="h-5 w-5 text-muted-foreground" /></div>
          <div><p className="text-2xl font-bold">{emails.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
      </div>

      {/* Email type picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate New Email</CardTitle>
          <CardDescription>Select an email type then fill in the details — AI drafts the body</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {(Object.entries(EMAIL_TYPE_CONFIG) as [EmailType, typeof EMAIL_TYPE_CONFIG[EmailType]][]).map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    selectedType === type
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">{EMAIL_TYPE_CONFIG[selectedType].description}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Supplier name *"
              value={form.supplierName}
              onChange={e => setForm(p => ({ ...p, supplierName: e.target.value }))}
            />
            <Input
              placeholder="RFP ID (optional)"
              value={form.rfpId}
              onChange={e => setForm(p => ({ ...p, rfpId: e.target.value }))}
            />
          </div>

          {["clarification", "rfp_invite", "deadline_reminder"].includes(selectedType) && (
            <Textarea
              placeholder={selectedType === "clarification"
                ? "Enter clarification points (one per line)..."
                : selectedType === "rfp_invite"
                ? "Scope of work / key requirements (one per line)..."
                : "Submission deadline date / additional notes..."}
              value={form.points}
              onChange={e => setForm(p => ({ ...p, points: e.target.value }))}
              rows={4}
            />
          )}

          <Button onClick={handleGenerate} disabled={generating || !form.supplierName} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Draft {EMAIL_TYPE_CONFIG[selectedType].label} Email
          </Button>
        </CardContent>
      </Card>

      {/* Email list */}
      <div className="space-y-4">
        {emails.map((email, i) => {
          const typeCfg = EMAIL_TYPE_CONFIG[email.type];
          const TypeIcon = typeCfg?.icon ?? Mail;
          return (
            <Card key={i} className={email.status === "sent" ? "opacity-70" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${typeCfg?.color ?? "bg-muted text-muted-foreground"}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{email.supplier}</CardTitle>
                      <CardDescription className="mt-0.5">{email.subject}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {typeCfg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCfg.color}`}>{typeCfg.label}</span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      email.status === "sent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {email.status === "sent" ? "Sent" : "Draft"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                  {email.body}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handleCopy(email)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  {email.status === "draft" && (
                    <Button size="sm" className="gap-2" onClick={() => handleSend(i)} disabled={sending === i}>
                      {sending === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
