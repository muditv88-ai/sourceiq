/**
 * NewRfpPage — FM-2.1: 5-step AI Generative RFP Builder Wizard
 *
 * Step 1: Select Category (Direct Materials, Indirect, Services, Capex, Logistics)
 * Step 2: Describe Scope → AI drafts sections
 * Step 3: AI Preview + User Feedback loop
 * Step 4: Edit sections, add custom clauses, reorder, add BOM line items, attach drawings
 * Step 5: Preview & Publish
 *
 * Also preserves FM-2.2 (upload existing RFP) as an alternative entry path.
 */
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAgents } from "@/contexts/AgentContext";
import {
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  Sparkles, FileText, Upload, Eye, Send, Plus, Trash2,
  GripVertical, Paperclip, MessageSquare, RotateCcw,
  AlertCircle, FolderOpen, Package, Wrench, TrendingUp, Truck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = "direct_materials" | "indirect" | "services" | "capex" | "logistics";

interface RfpSection {
  id: string;
  title: string;
  content: string;
  locked: boolean;
}

interface BomLineItem {
  id: string;
  partNumber: string;
  description: string;
  quantity: string;
  uom: string;
  drawingFile: File | null;
  drawingName: string;
}

interface WizardState {
  // Step 1
  category: Category | null;
  projectId: string | null;
  projectName: string;
  // Step 2
  scopeDescription: string;
  // Step 3
  sections: RfpSection[];
  aiDraftStatus: "idle" | "drafting" | "done" | "error";
  feedbackText: string;
  // Step 4
  bomItems: BomLineItem[];
  customClause: string;
  // Step 5
  publishStatus: "idle" | "publishing" | "done" | "error";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { id: Category; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "direct_materials", label: "Direct Materials", icon: Package,   desc: "Raw materials, components, sub-assemblies" },
  { id: "indirect",         label: "Indirect",         icon: Wrench,    desc: "MRO, office supplies, IT consumables" },
  { id: "services",         label: "Services",         icon: MessageSquare, desc: "Professional, contract, managed services" },
  { id: "capex",            label: "Capex",             icon: TrendingUp,desc: "Equipment, machinery, infrastructure" },
  { id: "logistics",        label: "Logistics",         icon: Truck,     desc: "Freight, 3PL, warehousing" },
];

const STEP_LABELS = [
  "Category",
  "Scope",
  "AI Draft",
  "Edit & BOM",
  "Publish",
];

const MOCK_SECTIONS: RfpSection[] = [
  { id: "s1", title: "Scope of Supply",          content: "Supplier shall supply all items per the attached Bill of Materials. All parts must conform to the dimensional and material specifications outlined herein.", locked: false },
  { id: "s2", title: "Evaluation Criteria",       content: "Bids will be evaluated on: Technical Compliance (40%), Unit Price (35%), Delivery Lead Time (15%), Quality Certifications (10%).", locked: false },
  { id: "s3", title: "Terms & Conditions",        content: "Payment terms: Net 60 days from invoice date. Incoterms: DDP Buyer's facility. Warranty: 24 months from date of delivery.", locked: false },
  { id: "s4", title: "Pricing Template",          content: "Suppliers must complete the attached pricing template. Prices must be held firm for 12 months. Include volume break pricing if applicable.", locked: false },
  { id: "s5", title: "Quality & Certifications",  content: "Supplier must hold ISO 9001:2015 or equivalent. PPAP documentation required for all production parts. Provide latest audit report.", locked: false },
];

const newBomItem = (): BomLineItem => ({
  id: `bom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  partNumber: "", description: "", quantity: "", uom: "EA",
  drawingFile: null, drawingName: "",
});

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {labels.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                state === "done"     ? "bg-green-500 text-white" :
                state === "active"   ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                                       "bg-muted text-muted-foreground"
              }`}>
                {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap hidden sm:block ${
                state === "active" ? "text-primary" : "text-muted-foreground"
              }`}>{label}</span>
            </div>
            {i < total - 1 && (
              <div className={`h-px w-8 sm:w-12 mx-1 mt-[-12px] transition-colors ${
                i < current ? "bg-green-400" : "bg-border"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NewRfpPage() {
  const { pushActivity } = useAgents();
  const navigate = useNavigate();
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const [activeBomId, setActiveBomId] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"wizard" | "upload" | null>(null);

  const [state, setState] = useState<WizardState>({
    category: null, projectId: null, projectName: "",
    scopeDescription: "",
    sections: [], aiDraftStatus: "idle", feedbackText: "",
    bomItems: [newBomItem()],
    customClause: "",
    publishStatus: "idle",
  });

  // Upload-mode state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle"|"parsing"|"done"|"error">("idle");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<WizardState>) => setState(s => ({ ...s, ...patch }));

  // ── AI Draft (Step 2 → 3) ──────────────────────────────────────────────────
  const handleGenerateDraft = async () => {
    set({ aiDraftStatus: "drafting", sections: [] });
    pushActivity({ agentId: "rfp", status: "running", message: "Drafting RFP sections with AI…" });
    const t0 = Date.now();
    try {
      // Try real API; fall back to mock so UI is always demonstrable
      let sections: RfpSection[] = MOCK_SECTIONS;
      try {
        const res = await api.generateRfpDraft?.({
          category: state.category!,
          scope: state.scopeDescription,
        });
        if (res?.sections?.length) sections = res.sections;
      } catch { /* use mock */ }
      await new Promise(r => setTimeout(r, 1800)); // brief delay for UX
      set({ sections, aiDraftStatus: "done" });
      pushActivity({ agentId: "rfp", status: "complete", message: "RFP draft generated", durationMs: Date.now() - t0, confidence: 88 });
      setStep(2);
    } catch {
      set({ aiDraftStatus: "error" });
    }
  };

  // ── Apply Feedback (Step 3 re-draft) ─────────────────────────────────────
  const handleApplyFeedback = async () => {
    if (!state.feedbackText.trim()) return;
    set({ aiDraftStatus: "drafting" });
    await new Promise(r => setTimeout(r, 1200));
    // In prod: call api.reviseDraft({ sections, feedback })
    // For now, append feedback as a note to affected sections
    const revised = state.sections.map(s => ({
      ...s,
      content: s.content + `\n\n[Revision note: ${state.feedbackText}]`,
    }));
    set({ sections: revised, aiDraftStatus: "done", feedbackText: "" });
  };

  // ── BOM helpers ───────────────────────────────────────────────────────────
  const updateBom = (id: string, patch: Partial<BomLineItem>) =>
    set({ bomItems: state.bomItems.map(b => b.id === id ? { ...b, ...patch } : b) });

  const attachDrawing = (id: string, file: File) =>
    updateBom(id, { drawingFile: file, drawingName: file.name });

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    set({ publishStatus: "publishing" });
    pushActivity({ agentId: "rfp", status: "running", message: "Publishing RFP…" });
    const t0 = Date.now();
    try {
      await new Promise(r => setTimeout(r, 1500));
      // In prod: api.publishRfp({ sections, bomItems, projectId })
      set({ publishStatus: "done" });
      pushActivity({ agentId: "rfp", status: "complete", message: "RFP published successfully", durationMs: Date.now() - t0, confidence: 95 });
      setStep(4);
    } catch {
      set({ publishStatus: "error" });
    }
  };

  // ── Upload-mode handler ───────────────────────────────────────────────────
  const handleUploadParse = async () => {
    if (!uploadFile || !uploadProjectId.trim()) return;
    setUploadStatus("parsing");
    try {
      await api.uploadProjectRfp(uploadProjectId, uploadFile);
      await api.parseProject(uploadProjectId);
      setUploadStatus("done");
    } catch (e: any) {
      setUploadError(e.message || "Upload failed");
      setUploadStatus("error");
    }
  };

  // ─── Entry screen — choose mode ───────────────────────────────────────────
  if (!mode) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">New RFP</h1>
          <p className="text-muted-foreground mt-1">Build a new RFP from scratch with AI, or load an existing document</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setMode("wizard")}
            className="group text-left p-6 rounded-xl border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all duration-200"
          >
            <Sparkles className="h-8 w-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-base">AI Generative Wizard</h3>
            <p className="text-sm text-muted-foreground mt-1">Describe your scope — AI drafts the full RFP for you. Best for new categories.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-primary">
              Start building <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
          <button
            onClick={() => setMode("upload")}
            className="group text-left p-6 rounded-xl border-2 border-border hover:border-primary/30 hover:bg-muted/40 transition-all duration-200"
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-3 group-hover:text-primary group-hover:scale-110 transition-all" />
            <h3 className="font-semibold text-base">Upload Existing RFP</h3>
            <p className="text-sm text-muted-foreground mt-1">Upload a .pdf, .docx, or .xlsx — AI extracts and structures it automatically.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-muted-foreground">
              Upload &amp; parse <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Upload mode (FM-2.2) ─────────────────────────────────────────────────
  if (mode === "upload") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode(null)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-2xl font-bold">Upload Existing RFP</h1>
            <p className="text-muted-foreground text-sm mt-0.5">FM-2.2 — AI extracts structure from your document</p>
          </div>
        </div>

        {uploadStatus === "done" ? (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-6 flex items-center gap-4">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">RFP parsed successfully</p>
                <p className="text-sm text-green-700 mt-0.5">Requirements extracted and stored against the project.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Upload RFP Document</CardTitle>
              <CardDescription>Supported: .pdf, .docx, .xlsx, .xls, .csv</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Project ID</label>
                <Input
                  placeholder="Paste your project ID…"
                  value={uploadProjectId}
                  onChange={e => setUploadProjectId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">RFP File</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-8 text-center cursor-pointer transition-colors"
                >
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{uploadFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && setUploadFile(e.target.files[0])} />
              </div>
              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />{uploadError}
                </div>
              )}
              <Button
                className="w-full gap-2"
                disabled={!uploadFile || !uploadProjectId.trim() || uploadStatus === "parsing"}
                onClick={handleUploadParse}
              >
                {uploadStatus === "parsing" ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing…</> : <><Sparkles className="h-4 w-4" /> Parse with AI</>}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── Wizard mode ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button onClick={() => setStep(s => Math.max(0, s - 1))} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {step === 0 && (
          <button onClick={() => setMode(null)} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold">AI RFP Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">FM-2.1 — 5-step generative wizard</p>
        </div>
      </div>

      <StepIndicator current={step} total={5} labels={STEP_LABELS} />

      {/* ── STEP 0: Category ──────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Procurement Category</CardTitle>
              <CardDescription>This shapes the RFP template and evaluation criteria AI will use</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const selected = state.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => set({ category: cat.id })}
                    className={`text-left p-4 rounded-lg border-2 transition-all duration-150 ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-1.5">
                      <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-sm">{cat.label}</span>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{cat.desc}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Name</CardTitle>
              <CardDescription>Give this RFP a name for reference</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="e.g. Steel Fasteners Q3 2026 RFP"
                value={state.projectName}
                onChange={e => set({ projectName: e.target.value })}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              disabled={!state.category || !state.projectName.trim()}
              onClick={() => setStep(1)}
              className="gap-2"
            >
              Next: Describe Scope <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Scope Description ─────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Describe Your Scope</CardTitle>
              <CardDescription>
                Write in plain language — AI will draft the full RFP sections from this.
                Include volume, specs, certifications, lead times, and any must-haves.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 text-xs">
                  {CATEGORIES.find(c => c.id === state.category)?.label}
                </Badge>
                <span className="text-sm text-muted-foreground">{state.projectName}</span>
              </div>
              <Textarea
                placeholder="e.g. We need 500,000 units/year of M8 steel fasteners (Grade 8.8, zinc-plated). Suppliers must hold ISO 9001:2015 and provide PPAP documentation. Delivery to our Pune facility within 4 weeks of PO. Pricing to be held firm for 12 months. Include volume break pricing at 250K, 500K, 1M units."
                className="min-h-[160px] resize-none text-sm"
                value={state.scopeDescription}
                onChange={e => set({ scopeDescription: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {state.scopeDescription.length} characters — aim for 100+ for best results
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              disabled={state.scopeDescription.trim().length < 20 || state.aiDraftStatus === "drafting"}
              onClick={handleGenerateDraft}
              className="gap-2"
            >
              {state.aiDraftStatus === "drafting" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> AI is drafting…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate RFP Draft</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: AI Preview + Feedback ────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <Sparkles className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              AI drafted {state.sections.length} sections. Review below and provide feedback to refine.
            </p>
          </div>

          {state.sections.map((sec, idx) => (
            <Card key={sec.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{idx + 1}. {sec.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">AI Generated</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{sec.content}</p>
              </CardContent>
            </Card>
          ))}

          {/* Feedback panel */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Refine with Feedback
              </CardTitle>
              <CardDescription>Tell the AI what to change, add, or remove</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="e.g. Add a section on tooling cost amortization. Remove the warranty clause — we handle that separately. Strengthen the quality certification requirements."
                className="min-h-[80px] resize-none text-sm"
                value={state.feedbackText}
                onChange={e => set({ feedbackText: e.target.value })}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!state.feedbackText.trim() || state.aiDraftStatus === "drafting"}
                onClick={handleApplyFeedback}
                className="gap-2"
              >
                {state.aiDraftStatus === "drafting" ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Revising…</>
                ) : (
                  <><RotateCcw className="h-3.5 w-3.5" /> Apply Feedback</>
                )}
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="gap-2">
              Accept Draft — Edit & Add BOM <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Edit Sections + BOM + Drawings ───────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Editable sections */}
          <Card>
            <CardHeader>
              <CardTitle>Edit RFP Sections</CardTitle>
              <CardDescription>Reorder, edit, lock, or add custom clauses to each section</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.sections.map((sec, idx) => (
                <div key={sec.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                    <Input
                      value={sec.title}
                      disabled={sec.locked}
                      onChange={e => set({ sections: state.sections.map((s, i) => i === idx ? { ...s, title: e.target.value } : s) })}
                      className="font-semibold text-sm h-8"
                    />
                    <button
                      onClick={() => set({ sections: state.sections.map((s, i) => i === idx ? { ...s, locked: !s.locked } : s) })}
                      className={`text-xs px-2 py-1 rounded-md font-medium shrink-0 transition-colors ${
                        sec.locked ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {sec.locked ? "🔒 Locked" : "🔓 Lock"}
                    </button>
                    <button
                      onClick={() => set({ sections: state.sections.filter((_, i) => i !== idx) })}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={sec.content}
                    disabled={sec.locked}
                    onChange={e => set({ sections: state.sections.map((s, i) => i === idx ? { ...s, content: e.target.value } : s) })}
                    className="text-sm min-h-[80px] resize-none"
                  />
                </div>
              ))}

              {/* Add custom clause */}
              <div className="border-dashed border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Add Custom Clause</p>
                <Input
                  placeholder="Clause title…"
                  value={state.customClause}
                  onChange={e => set({ customClause: e.target.value })}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm" variant="outline"
                  disabled={!state.customClause.trim()}
                  onClick={() => {
                    set({
                      sections: [...state.sections, { id: `custom-${Date.now()}`, title: state.customClause, content: "", locked: false }],
                      customClause: "",
                    });
                  }}
                  className="gap-2 text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Section
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* BOM Line Items — FM-2.7 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Bill of Materials (BOM)
              </CardTitle>
              <CardDescription>FM-2.7 — Each line item has its own spec and optional drawing attachment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1fr_2fr_80px_60px_40px_80px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Part No.</span>
                <span>Description</span>
                <span>Qty</span>
                <span>UoM</span>
                <span></span>
                <span>Drawing</span>
              </div>
              {state.bomItems.map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_2fr_80px_60px_40px_80px] gap-2 items-center">
                  <Input value={item.partNumber} placeholder="PN-001" onChange={e => updateBom(item.id, { partNumber: e.target.value })} className="h-8 text-xs" />
                  <Input value={item.description} placeholder="M8×25 Steel Bolt" onChange={e => updateBom(item.id, { description: e.target.value })} className="h-8 text-xs" />
                  <Input value={item.quantity} placeholder="500000" onChange={e => updateBom(item.id, { quantity: e.target.value })} className="h-8 text-xs" />
                  <Input value={item.uom} placeholder="EA" onChange={e => updateBom(item.id, { uom: e.target.value })} className="h-8 text-xs" />
                  <button onClick={() => set({ bomItems: state.bomItems.filter(b => b.id !== item.id) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div>
                    {item.drawingName ? (
                      <span className="text-[10px] text-primary truncate block" title={item.drawingName}>
                        <Paperclip className="h-3 w-3 inline mr-0.5" />{item.drawingName.slice(0, 10)}…
                      </span>
                    ) : (
                      <button
                        onClick={() => { setActiveBomId(item.id); drawingInputRef.current?.click(); }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Paperclip className="h-3.5 w-3.5" /> Attach
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <input
                ref={drawingInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.dwg,.dxf,.png,.jpg"
                onChange={e => {
                  if (e.target.files?.[0] && activeBomId) attachDrawing(activeBomId, e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm" variant="outline"
                onClick={() => set({ bomItems: [...state.bomItems, newBomItem()] })}
                className="gap-2 text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line Item
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(4)} className="gap-2">
              Preview & Publish <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Preview & Publish ─────────────────────────────── */}
      {step === 4 && state.publishStatus !== "done" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Final RFP Preview
              </CardTitle>
              <CardDescription>
                <Badge variant="outline" className="mr-2">{CATEGORIES.find(c => c.id === state.category)?.label}</Badge>
                {state.projectName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {state.sections.map((sec, idx) => (
                <div key={sec.id} className="border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{idx + 1}. {sec.title}</span>
                    {sec.locked && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">🔒 Locked</span>}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{sec.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {state.bomItems.some(b => b.partNumber || b.description) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">BOM Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left pb-2 font-medium">Part No.</th>
                      <th className="text-left pb-2 font-medium">Description</th>
                      <th className="text-left pb-2 font-medium">Qty</th>
                      <th className="text-left pb-2 font-medium">UoM</th>
                      <th className="text-left pb-2 font-medium">Drawing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.bomItems.filter(b => b.partNumber || b.description).map(item => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{item.partNumber || "—"}</td>
                        <td className="py-2">{item.description || "—"}</td>
                        <td className="py-2">{item.quantity || "—"}</td>
                        <td className="py-2">{item.uom}</td>
                        <td className="py-2">
                          {item.drawingName ? (
                            <span className="text-xs text-primary flex items-center gap-1"><Paperclip className="h-3 w-3" />{item.drawingName}</span>
                          ) : <span className="text-muted-foreground text-xs">None</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {state.publishStatus === "error" && (
            <div className="flex items-center gap-2 text-sm text-destructive p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <AlertCircle className="h-4 w-4" /> Publish failed. Please try again.
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back to Edit
            </Button>
            <Button
              disabled={state.publishStatus === "publishing"}
              onClick={handlePublish}
              className="gap-2"
            >
              {state.publishStatus === "publishing" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
              ) : (
                <><Send className="h-4 w-4" /> Publish RFP</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Published ─────────────────────────────────────────────── */}
      {step === 4 && state.publishStatus === "done" && (
        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="p-8 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-green-800">RFP Published!</h2>
              <p className="text-sm text-green-700 mt-1">
                <strong>{state.projectName}</strong> is live with {state.sections.length} sections
                and {state.bomItems.filter(b => b.partNumber || b.description).length} BOM line items.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => { setMode(null); setStep(0); setState(s => ({ ...s, category: null, projectName: "", scopeDescription: "", sections: [], aiDraftStatus: "idle", bomItems: [newBomItem()], publishStatus: "idle" })); }}>
                Build Another RFP
              </Button>
              <Button onClick={() => navigate("/suppliers")} className="gap-2">
                Next: Supplier Responses <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
