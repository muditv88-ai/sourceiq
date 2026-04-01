import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Users, UserPlus, Upload, CheckCircle2, Clock, AlertCircle,
  Loader2, Mail, FileText, ChevronDown, ChevronUp,
  Pencil, Trash2, ArrowRight, FlaskConical,
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

/** Normalise raw backend shape → Supplier */
function normSupplier(raw: any): Supplier {
  return {
    id:           String(raw.supplier_id ?? raw.id ?? ""),
    name:         raw.name ?? raw.supplier_name ?? String(raw.supplier_id ?? raw.id ?? ""),
    email:        raw.email ?? "",
    category:     raw.category ?? "",
    status:       (raw.status ?? "pending") as OnboardStatus,
    completeness: raw.completeness_pct ?? raw.completeness,
    missing_docs: raw.missing_docs ?? raw.missing ?? [],
    created_at:   raw.created_at,
  };
}

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<string | null>(null);

  // Invite form
  const [inviteForm, setInviteForm]   = useState({ name: "", email: "", category: "" });
  const [inviting, setInviting]       = useState(false);

  // Validate — tracked per-supplier so only that card shows a spinner
  const [validating, setValidating]   = useState<string | null>(null);
  // uploadFiles keyed by supplier id
  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});

  // Edit dialog
  const [editTarget, setEditTarget]   = useState<Supplier | null>(null);
  const [editForm, setEditForm]       = useState({ name: "", email: "", category: "", status: "pending" as OnboardStatus });
  const [saving, setSaving]           = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // ── Load suppliers ────────────────────────────────────────────────
  useEffect(() => { fetchSuppliers(); }, []);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const res = await api.listSuppliers();
      setSuppliers((res.suppliers ?? []).map(normSupplier));
    } catch {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }

  // ── KPI counts ───────────────────────────────────────────────────
  const statusCounts = (s: OnboardStatus) => suppliers.filter(x => x.status === s).length;
  const readyCount = statusCounts("validated") + statusCounts("active");

  // ── Invite ───────────────────────────────────────────────────────
  async function handleInvite() {
    if (!inviteForm.name || !inviteForm.email) return;
    setInviting(true);
    try {
      const created = await api.createSupplier(inviteForm.name, inviteForm.email, inviteForm.category);
      const newS: Supplier = {
        id: String(created.supplier_id ?? Date.now()),
        ...inviteForm,
        status: "invited",
        completeness: 0,
        missing_docs: [],
      };
      await api.inviteSupplier(newS.id).catch(() => null);
      setSuppliers(prev => [...prev, newS]);
      setInviteForm({ name: "", email: "", category: "" });
      toast({ title: "Supplier invited", description: `Invite email sent to ${newS.email}` });
    } catch {
      const newS: Supplier = {
        id: String(Date.now()),
        ...inviteForm,
        status: "invited",
        completeness: 0,
        missing_docs: [],
      };
      setSuppliers(prev => [...prev, newS]);
      setInviteForm({ name: "", email: "", category: "" });
      toast({ title: "Supplier added (local)", description: "Backend not reachable; added locally." });
    } finally {
      setInviting(false);
    }
  }

  // ── Validate docs ────────────────────────────────────────────────
  async function handleValidate(supplier: Supplier) {
    const files = uploadFiles[supplier.id] ?? [];

    // Guard: must select at least one file first
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please choose one or more documents to upload before validating.",
        variant: "destructive",
      });
      return;
    }

    setValidating(supplier.id);
    try {
      const res = await api.validateSupplierDocs(supplier.id, files);
      setSuppliers(prev => prev.map(s =>
        s.id === supplier.id
          ? {
              ...s,
              status: res.all_docs_present ? "validated" : "docs_received",
              completeness: res.completeness_pct,
              missing_docs: res.missing,
            }
          : s
      ));
      toast({
        title: res.all_docs_present ? "All docs validated ✓" : "Docs incomplete",
        description: res.missing?.length
          ? `Missing: ${res.missing.join(", ")}`
          : "Supplier fully validated.",
      });
    } catch (err: any) {
      // Distinguish user/validation errors from genuine network failures
      const msg: string = err?.message ?? "";
      const isNetworkError =
        msg.includes("Failed to fetch") ||
        msg.includes("Network") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504");

      if (isNetworkError) {
        // Backend genuinely unreachable — apply local fallback
        setSuppliers(prev => prev.map(s =>
          s.id === supplier.id ? { ...s, status: "validated", completeness: 100, missing_docs: [] } : s
        ));
        toast({ title: "Validated (offline)", description: "Backend not reachable — marked as validated locally." });
      } else {
        // API returned a real error (e.g. 400, 422) — show the message
        toast({
          title: "Validation failed",
          description: msg || "The server rejected the documents. Please check the files and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setValidating(null);
      setUploadFiles(prev => ({ ...prev, [supplier.id]: [] }));
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────
  function openEdit(s: Supplier) {
    setEditTarget(s);
    setEditForm({ name: s.name, email: s.email, category: s.category, status: s.status });
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.updateSupplier(editTarget.id, editForm);
      setSuppliers(prev => prev.map(s => s.id === editTarget.id ? { ...s, ...editForm } : s));
      toast({ title: "Supplier updated", description: `${editForm.name} saved successfully.` });
    } catch {
      setSuppliers(prev => prev.map(s => s.id === editTarget.id ? { ...s, ...editForm } : s));
      toast({ title: "Updated (local)", description: "Backend not reachable — changes saved locally." });
    } finally {
      setSaving(false);
      setEditTarget(null);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteSupplier(deleteTarget.id);
    } catch {
      // Remove locally regardless
    } finally {
      setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
      toast({ title: "Supplier removed", description: `${deleteTarget.name} has been deleted.` });
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Directory</h1>
        <p className="text-muted-foreground mt-1">Manage onboarding, invitations, and document validation</p>
      </div>

      {/* ── Next-step CTA banner — shown when ≥1 supplier is ready ── */}
      {readyCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {readyCount} supplier{readyCount > 1 ? "s" : ""} ready for evaluation
                </p>
                <p className="text-xs text-muted-foreground">
                  Upload their RFP responses and run technical + pricing analysis.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/supplier-responses")}
              >
                <Upload className="h-3.5 w-3.5" /> Upload Responses
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => navigate("/analysis")}
              >
                <FlaskConical className="h-3.5 w-3.5" /> Run Analysis
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: "Total",         value: suppliers.length,                 color: "text-foreground",  bg: "bg-muted/50" },
          { label: "Invited",       value: statusCounts("invited"),          color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Docs Received", value: statusCounts("docs_received"),    color: "text-yellow-600",  bg: "bg-yellow-50" },
          { label: "Active",        value: readyCount,                       color: "text-green-600",   bg: "bg-green-50" },
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
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite New Supplier
          </CardTitle>
          <CardDescription>Send an onboarding invite and document checklist automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Supplier name"                      value={inviteForm.name}     onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Contact email" type="email"         value={inviteForm.email}    onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Category (e.g. IT Infrastructure)"  value={inviteForm.category} onChange={e => setInviteForm(p => ({ ...p, category: e.target.value }))} />
          </div>
          <Button onClick={handleInvite} disabled={inviting || !inviteForm.name || !inviteForm.email} className="gap-2">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send Invite
          </Button>
        </CardContent>
      </Card>

      {/* Supplier List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading suppliers…
        </div>
      ) : suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">No suppliers yet. Use the form above to invite your first supplier.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => {
            const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isOpen = expanded === s.id;
            const filesForSupplier = uploadFiles[s.id] ?? [];
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

                    <div className="flex items-center gap-2">
                      {s.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {s.category}
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${cfg.color}`}>
                        <StatusIcon className="h-3 w-3" /> {cfg.label}
                      </span>

                      <button
                        onClick={() => openEdit(s)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                        title="Edit supplier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                        title="Delete supplier"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => setExpanded(isOpen ? null : s.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="pt-0 pb-4 space-y-3">
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

                    {s.missing_docs && s.missing_docs.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {s.missing_docs.map(d => (
                          <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {d}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Upload + Validate — per-supplier file state */}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-xs border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                        <Upload className="h-3.5 w-3.5" />
                        {filesForSupplier.length
                          ? `${filesForSupplier.length} file(s) selected`
                          : "Upload documents"}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={e =>
                            setUploadFiles(prev => ({ ...prev, [s.id]: Array.from(e.target.files ?? []) }))
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => handleValidate(s)}
                        disabled={validating === s.id}
                      >
                        {validating === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Validate Docs
                      </Button>
                    </div>

                    {/* Per-supplier next-step shortcuts */}
                    {(s.status === "validated" || s.status === "active") && (
                      <div className="pt-1 flex gap-2 border-t">
                        <p className="text-xs text-muted-foreground self-center mr-1">Next steps:</p>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => navigate("/supplier-responses")}>
                          <Upload className="h-3 w-3" /> Upload RFP Response
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => navigate("/analysis")}>
                          <FlaskConical className="h-3 w-3" /> Run Analysis
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>Update supplier details and onboarding status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Supplier Name</label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Input placeholder="e.g. IT Infrastructure" value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={editForm.status}
                onChange={e => setEditForm(p => ({ ...p, status: e.target.value as OnboardStatus }))}
              >
                {(Object.keys(STATUS_CONFIG) as OnboardStatus[]).map(k => (
                  <option key={k} value={k}>{STATUS_CONFIG[k].label}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.name || !editForm.email} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Supplier?</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed from the directory. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
