import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  Mail,
  Copy,
  CheckCircle2,
  Loader2,
  Send,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Email {
  supplier: string;
  subject: string;
  body: string;
  status: "draft" | "sent";
}

const demoEmails: Email[] = [
  {
    supplier: "NovaBridge Inc",
    subject: "Clarification Request: IoT Integration Capabilities",
    body: `Dear NovaBridge Team,

Thank you for your response to our RFP for IT Infrastructure Services.

After reviewing your proposal, we would appreciate clarification on the following points:

1. IoT Integration: Your proposal mentions IoT support but lacks specific implementation details. Could you provide architecture diagrams and case studies?

2. Scalability: Please elaborate on your infrastructure's ability to handle 10x traffic spikes.

3. Certifications: We noticed your team's SOC 2 certification is pending. What is the expected completion date?

We kindly request your response by April 5, 2025.

Best regards,
Procurement Team`,
    status: "draft",
  },
  {
    supplier: "Pinnacle Services",
    subject: "Clarification Request: Technical Capabilities & References",
    body: `Dear Pinnacle Services Team,

Thank you for your RFP submission. We have a few follow-up questions:

1. Could you provide 3 additional references from clients with similar requirements?
2. What is your proposed timeline for full deployment?
3. Please detail your disaster recovery procedures.

We look forward to your response.

Best regards,
Procurement Team`,
    status: "draft",
  },
];

export default function CommunicationsPage() {
  const [emails, setEmails] = useState<Email[]>(demoEmails);
  const [generating, setGenerating] = useState(false);
  const [customPoints, setCustomPoints] = useState("");

  const handleCopy = (email: Email) => {
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    toast({ title: "Copied to clipboard", description: `Email to ${email.supplier} copied` });
  };

  const handleMarkSent = (index: number) => {
    setEmails((prev) =>
      prev.map((e, i) => (i === index ? { ...e, status: "sent" } : e))
    );
    toast({ title: "Marked as sent", description: `Email to ${emails[index].supplier}` });
  };

  const handleGenerate = async () => {
    if (!customPoints.trim()) return;
    setGenerating(true);
    try {
      const result = await api.draftEmail({
        rfp_id: "rfp-001",
        supplier_name: "Custom Supplier",
        clarification_points: customPoints.split("\n").filter(Boolean),
      });
      setEmails((prev) => [
        ...prev,
        { supplier: result.supplier_name, subject: result.subject, body: result.body, status: "draft" },
      ]);
      setCustomPoints("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Communications</h1>
        <p className="text-muted-foreground mt-1">
          Draft and manage clarification emails to suppliers
        </p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{emails.filter((e) => e.status === "draft").length}</p>
              <p className="text-xs text-muted-foreground">Drafts Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{emails.filter((e) => e.status === "sent").length}</p>
              <p className="text-xs text-muted-foreground">Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{emails.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate New */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate New Clarification Email</CardTitle>
          <CardDescription>Enter clarification points (one per line) and AI will draft the email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={"What is your disaster recovery plan?\nCan you provide SOC 2 certification?\nWhat SLA guarantees do you offer?"}
            value={customPoints}
            onChange={(e) => setCustomPoints(e.target.value)}
            rows={4}
          />
          <Button onClick={handleGenerate} disabled={generating || !customPoints.trim()} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Generate Email
          </Button>
        </CardContent>
      </Card>

      {/* Email List */}
      <div className="space-y-4">
        {emails.map((email, i) => (
          <Card key={i} className={email.status === "sent" ? "opacity-70" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{email.supplier}</CardTitle>
                  <CardDescription className="mt-1">{email.subject}</CardDescription>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    email.status === "sent"
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {email.status === "sent" ? "Sent" : "Draft"}
                </span>
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
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handleMarkSent(i)}>
                    <Send className="h-3.5 w-3.5" /> Mark as Sent
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
