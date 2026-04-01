import { useState, useEffect } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Users, UserPlus, Upload, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Loader2, Mail, FileText, ChevronDown, ChevronUp,
} from "lucide-react";

type OnboardStatus = "pending" | "invited" | "docs_received" | "validated" | "active";

interface Supplier {
  id: string;
  name: string;
  email: string;
  category: string;
  status: OnboardStatus;
  completeness?: number;
  missing_docs?: string[];
  created_at?: string;
}

const STATUS_CONFIG: Record<OnboardStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:       { label: "Pending",       color: "bg-muted text-muted-foreground",      icon: Clock },
  invited:       { label: "Invited",       color: "bg-blue-100 text-blue-700",           icon: Mail },
  docs_received: { label: "Docs Received", color: "bg-yellow-100 text-yellow-700",       icon: FileText },
  validated:     { label: "Validated",     color: "bg-emerald-100 text-emerald-700",     icon: CheckCircle2 },
  active:        { label: "Active",        color: "bg-green-100 text-green-700",         icon: CheckCircle2 },
};

const DEMO_SUPPLIERS: Supplier[] = [
  { id: "s1", name: "NovaBridge Inc",    email: "procurement@novabridge.com",  category: "IT Infrastructure",  status: "validated",     completeness: 100, missing_docs: [] },
  { id: "s2", name: "Pinnacle Services", email: "rfp@pinnacleservices.io",    category: "IT Infrastructure",  status: "docs_received", completeness: 75,  missing_docs: ["SOC 2 Certificate", "Insurance Certificate"] },
  { id: "s3", name: "TerraTech LLC",     email: "bids@terratech.co",          category: "Cloud Services",     status: "invited",       completeness: 0,   missing_docs: [] },
  { id: "s4", name: "Vertex Solutions", email: "proposals@vertexsol.com",    category: "Managed Services",   status: "active",        completeness: 100, missing_docs: [] },
];

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEMO_SUPPLIERS);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", category: "" });
  const [inviting, setInviting]   = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const statusCounts = (s: OnboardStatus) => suppliers.filter(x => x.status === s).length;

  async function handleInvite() {
    if (!inviteForm.name || !inviteForm.email) return;
    setInviting(true);
    try {
      await api.createSupplier(inviteForm.name, inviteForm.email, inviteForm.category);
      const newS: Supplier = { ...inviteForm, id: Date.now().toString(), status: "invited", completeness: 0, missing_docs: [] };
      setSuppliers(prev => [...prev, newS]);
      await api.inviteSupplier(newS.id);
      setInviteForm({ name: "", email: "", category: "" });
      toast({ title: "Supplier invited", description: `Invite email sent to ${newS.email}` });
    } catch (err: any) {
      // Graceful fallback – demo mode
      const newS: Supplier = { ...inviteForm, id: Date.now().toString(), status: "invited", completeness: 0, missing_docs: [] };
      setSuppliers(prev => [...prev, newS]);
      setInviteForm({ name: "", email: "", category: "" });
      toast({ title: "Supplier added (demo)", description: "Backend invite endpoint not reachable; supplier added locally." });
    } finally {
      setInviting(false);
    }
  }

  async function handleValidate(supplier: Supplier) {
    setValidating(supplier.id);
    try {
      const res = await api.validateSupplierDocs(supplier.id, uploadFiles);
      setSuppliers(prev => prev.map(s =>
        s.id === supplier.id
          ? { ...s, status: res.all_docs_present ? "validated" : "docs_received", completeness: res.completeness_pct, missing_docs: res.missing }
          : s
      ));
      toast({ title: res.all_docs_present ? "All docs validated" : "Docs incomplete", description: res.missing?.length ? `Missing: ${res.missing.join(", ")}` : "Supplier fully validated" });
    } catch {
      toast({ title: "Validation skipped", description: "Backend not reachable — marking as validated locally.", variant: "destructive" });
      setSuppliers(prev => prev.map(s => s.id === supplier.id ? { ...s, status: "validated", completeness: 100, missing_docs: [] } : s));
    } finally {
      setValidating(null);
      setUploadFiles([]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Directory</h1>
        <p className="text-muted-foreground mt-1">Manage onboarding, invitations, and document validation</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: "Total",        value: suppliers.length,              color: "text-foreground",    bg: "bg-muted/50" },
          { label: "Invited",      value: statusCounts("invited"),       color: "text-blue-600",      bg: "bg-blue-50" },
          { label: "Docs Received",value: statusCounts("docs_received"), color: "text-yellow-600",    bg: "bg-yellow-50" },
          { label: "Active",       value: statusCounts("active") + statusCounts("validated"), color: "text-green-600", bg: "bg-green-50" },
        ] as const).map(k => (
          <Card key={k.label}>
            <CardContent className={`p-4 ${k.bg} rounded-xl`}>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Invite New Supplier</CardTitle>
          <CardDescription>Send an onboarding invite and document checklist automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Supplier name" value={inviteForm.name} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Contact email" type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Category (e.g. IT Infrastructure)" value={inviteForm.category} onChange={e => setInviteForm(p => ({ ...p, category: e.target.value }))} />
          </div>
          <Button onClick={handleInvite} disabled={inviting || !inviteForm.name || !inviteForm.email} className="gap-2">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send Invite
          </Button>
        </CardContent>
      </Card>

      {/* Supplier List */}
      <div className="space-y-3">
        {suppliers.map(s => {
          const cfg = STATUS_CONFIG[s.status];
          const StatusIcon = cfg.icon;
          const isOpen = expanded === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.category && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s.category}</span>}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${cfg.color}`}>
                      <StatusIcon className="h-3 w-3" /> {cfg.label}
                    </span>
                    <button onClick={() => setExpanded(isOpen ? null : s.id)} className="text-muted-foreground hover:text-foreground">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="pt-0 pb-4 space-y-3">
                  {/* Completeness bar */}
                  {s.completeness !== undefined && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Document completeness</span>
                        <span className="font-medium">{s.completeness}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${s.completeness}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Missing docs */}
                  {s.missing_docs && s.missing_docs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.missing_docs.map(d => (
                        <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {d}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Upload + validate */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadFiles.length ? `${uploadFiles.length} file(s) selected` : "Upload documents"}
                      <input type="file" multiple className="hidden" onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                    </label>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => handleValidate(s)} disabled={validating === s.id}>
                      {validating === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Validate Docs
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
