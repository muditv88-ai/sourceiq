/**
 * PricingPage.tsx — Full rebuild
 *
 * Features:
 * 1. Project dropdown — switch projects at top
 * 2. KPI cards — bids received, bid coverage, potential savings, lowest bid
 * 3. Two ingest modes — pick from project supplier files (primary) + direct upload (fallback)
 * 4. Preview table — shows parsed rows immediately after ingest with diagnostics
 * 5. Multi-supplier comparison table — item × supplier pivot with AI comment column
 * 6. Agent ticker — bottom strip showing live agent activity
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; status?: string; }
interface SupplierFile { path: string; name: string; filename?: string; }
interface DiagRow { reason: string; preview: string; }
interface IngestResult {
  staging_id?: string;
  sheet_names?: string[];
  selected_sheet?: string;
  detected_header_row?: number;
  rows?: ParsedRow[];          // v2 stateless
  diagnostics: {
    file_name: string;
    accepted_line_items: number;
    excluded_rows: DiagRow[];
    column_mapping: Record<string,string>;
    sample_rows: Record<string,unknown>[];
    parse_confidence: "high"|"medium"|"low";
    warnings: string[];
  };
}
interface ParsedRow { item?: string; supplier?: string; unit?: string; quantity?: unknown; unit_price?: unknown; total_price?: unknown; currency?: string; [k:string]:unknown; }
interface BidRow extends ParsedRow { delta_pct?: number; bid_position?: string; }
interface PivotRow { item: string; lowest_supplier?: string; lowest_price?: number; highest_supplier?: string; highest_price?: number; saving_vs_baseline_pct?: number; [supplier:string]: unknown; }
interface KPISummary { bids_received: number; suppliers_compared: number; potential_savings_pct: number|null; avg_delta_pct: number|null; lowest_bid: number|null; highest_bid: number|null; }
interface AgentLog { id: string; agent_id: string; status: string; message: string; timestamp: number; }
interface StagedSupplier { supplierName: string; rows: ParsedRow[]; fileName: string; committed: boolean; }

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (v: unknown, prefix = "") =>
  v == null || v === "" ? "—" : `${prefix}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const confidenceBadge = (c: string) => ({
  high:   "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  medium: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  low:    "bg-red-500/20 text-red-300 border border-red-500/30",
}[c] ?? "bg-zinc-700 text-zinc-300");

// Colour pool for supplier chips
const SUPPLIER_COLORS = [
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
];

// ── AI comment generator (client-side heuristic, no extra API call) ────────
function generateComment(row: PivotRow, suppliers: string[]): string {
  const prices = suppliers.map(s => row[s] as number|null).filter(p => p != null) as number[];
  if (prices.length < 2) return "—";
  const min = Math.min(...prices), max = Math.max(...prices);
  const spread = ((max - min) / min * 100).toFixed(1);
  const parts: string[] = [];
  if (row.lowest_supplier) parts.push(`${row.lowest_supplier} lowest`);
  if (row.highest_supplier) parts.push(`${row.highest_supplier} highest`);
  parts.push(`${spread}% spread`);
  if (parseFloat(spread) > 20) parts.push("⚠ high variance — negotiate");
  else if (parseFloat(spread) < 5) parts.push("✓ competitive market");
  if (row.saving_vs_baseline_pct != null && row.saving_vs_baseline_pct > 0)
    parts.push(`${row.saving_vs_baseline_pct.toFixed(1)}% vs baseline`);
  return parts.join(" · ");
}

// ══════════════════════════════════════════════════════════════════════════════
export default function PricingPage() {
  // ── Project state ──────────────────────────────────────────────────────
  const [projects, setProjects]         = useState<Project[]>([]);
  const [projectId, setProjectId]       = useState<string>("");
  const [supplierFiles, setSupplierFiles] = useState<SupplierFile[]>([]);

  // ── Ingest state ───────────────────────────────────────────────────────
  const [ingestMode, setIngestMode]     = useState<"project"|"upload">("project");
  const [selectedFile, setSelectedFile] = useState<SupplierFile|null>(null);
  const [uploadFile, setUploadFile]     = useState<File|null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [ingesting, setIngesting]       = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult|null>(null);

  // ── Staged suppliers (confirmed batches) ──────────────────────────────
  const [staged, setStaged]             = useState<StagedSupplier[]>([]);

  // ── Comparison data ────────────────────────────────────────────────────
  const [kpi, setKpi]                   = useState<KPISummary|null>(null);
  const [bids, setBids]                 = useState<BidRow[]>([]);
  const [pivot, setPivot]               = useState<PivotRow[]>([]);
  const [pivotSuppliers, setPivotSuppliers] = useState<string[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // ── Agent ticker ───────────────────────────────────────────────────────
  const [agentLogs, setAgentLogs]       = useState<AgentLog[]>([]);
  const tickerRef                       = useRef<HTMLDivElement>(null);

  // ── Token ──────────────────────────────────────────────────────────────
  const token = localStorage.getItem("access_token") ?? "";
  const headers = { Authorization: `Bearer ${token}` };

  // ══════════════════════════════════════════════════════════════════════
  // Load projects
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    fetch(`${API}/projects`, { headers })
      .then(r => r.json())
      .then(d => {
        const list: Project[] = d.projects ?? [];
        setProjects(list);
        if (list.length > 0 && !projectId) setProjectId(list[0].id);
      })
      .catch(() => {});
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  // Load supplier files when project changes
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!projectId) return;
    setSupplierFiles([]);
    setSelectedFile(null);
    setIngestResult(null);
    setStaged([]);
    setBids([]);
    setPivot([]);
    setKpi(null);

    // Load project detail to get supplier files
    fetch(`${API}/projects/${projectId}`, { headers })
      .then(r => r.json())
      .then(d => {
        const files: SupplierFile[] = (d.suppliers ?? []).map((s: SupplierFile) => ({
          path: s.path,
          name: s.name,
          filename: s.path?.split("/").pop() ?? s.name,
        }));
        setSupplierFiles(files);
      })
      .catch(() => {});
  }, [projectId]);

  // ══════════════════════════════════════════════════════════════════════
  // Poll agent logs
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/agent-logs?limit=20`, { headers })
        .then(r => r.json())
        .then((logs: AgentLog[]) => {
          const pricing = logs.filter(l => l.agent_id === "pricing" || l.agent_id === "rfp");
          if (pricing.length) setAgentLogs(pricing);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [token]);

  // ══════════════════════════════════════════════════════════════════════
  // Ingest from project file (fetch file bytes → POST to /ingest-v2)
  // ══════════════════════════════════════════════════════════════════════
  const ingestFromProject = async () => {
    if (!selectedFile || !projectId) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      // Fetch the file from the project store
      const urlRes = await fetch(
        `${API}/projects/${projectId}/files/supplier/${encodeURIComponent(selectedFile.filename ?? selectedFile.name)}/url`,
        { headers }
      );
      if (!urlRes.ok) throw new Error("Could not get file URL");
      const urlData = await urlRes.json();

      let fileBlob: Blob;
      if (urlData.url) {
        // GCS signed URL
        const fileRes = await fetch(urlData.url);
        fileBlob = await fileRes.blob();
      } else {
        throw new Error("No download URL returned");
      }

      const fname = selectedFile.filename ?? selectedFile.name;
      const formData = new FormData();
      formData.append("file", new File([fileBlob], fname));
      formData.append("supplier_name", supplierName || selectedFile.name);
      formData.append("project_id", projectId);
      formData.append("header_row", "0");

      const res = await fetch(`${API}/pricing-analysis/ingest-v2`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data: IngestResult = await res.json();
      setIngestResult(data);
    } catch (e: unknown) {
      setIngestResult({ diagnostics: { file_name: "", accepted_line_items: 0, excluded_rows: [], column_mapping: {}, sample_rows: [], parse_confidence: "low", warnings: [(e as Error).message ?? "Failed"] } });
    } finally {
      setIngesting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Ingest from direct upload
  // ══════════════════════════════════════════════════════════════════════
  const ingestFromUpload = async () => {
    if (!uploadFile) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("supplier_name", supplierName || uploadFile.name.replace(/\.[^.]+$/, ""));
      if (projectId) formData.append("project_id", projectId);
      formData.append("header_row", "0");

      const res = await fetch(`${API}/pricing-analysis/ingest-v2`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data: IngestResult = await res.json();
      setIngestResult(data);
    } catch (e: unknown) {
      setIngestResult({ diagnostics: { file_name: "", accepted_line_items: 0, excluded_rows: [], column_mapping: {}, sample_rows: [], parse_confidence: "low", warnings: [(e as Error).message ?? "Failed"] } });
    } finally {
      setIngesting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Confirm (stage) parsed rows
  // ══════════════════════════════════════════════════════════════════════
  const confirmRows = async () => {
    if (!ingestResult?.rows?.length && !ingestResult?.diagnostics?.sample_rows?.length) return;
    const rows = (ingestResult.rows ?? ingestResult.diagnostics.sample_rows) as ParsedRow[];
    const sName = supplierName || selectedFile?.name || uploadFile?.name?.replace(/\.[^.]+$/, "") || "Supplier";

    // POST to confirm-v2 (stateless)
    try {
      const res = await fetch(`${API}/pricing-analysis/confirm-v2`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rows, project_id: projectId, supplier_name: sName }),
      });
      if (!res.ok) throw new Error("Confirm failed");
    } catch {}

    setStaged(prev => {
      const existing = prev.findIndex(s => s.supplierName === sName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { supplierName: sName, rows, fileName: ingestResult.diagnostics.file_name, committed: true };
        return updated;
      }
      return [...prev, { supplierName: sName, rows, fileName: ingestResult.diagnostics.file_name, committed: true }];
    });

    setIngestResult(null);
    setSelectedFile(null);
    setUploadFile(null);
    setSupplierName("");
    refreshComparison();
  };

  // ══════════════════════════════════════════════════════════════════════
  // Refresh KPI + bids + pivot from backend
  // ══════════════════════════════════════════════════════════════════════
  const refreshComparison = useCallback(async () => {
    if (!projectId) return;
    setLoadingComparison(true);
    try {
      const [kpiRes, bidsRes, pivotRes] = await Promise.all([
        fetch(`${API}/pricing-analysis/summary/${projectId}`, { headers }),
        fetch(`${API}/pricing-analysis/bids/${projectId}?limit=200`, { headers }),
        fetch(`${API}/pricing-analysis/comparison/${projectId}`, { headers }),
      ]);
      if (kpiRes.ok) setKpi(await kpiRes.json());
      if (bidsRes.ok) { const d = await bidsRes.json(); setBids(d.bids ?? []); }
      if (pivotRes.ok) {
        const d = await pivotRes.json();
        setPivot(d.pivot ?? []);
        setPivotSuppliers(d.suppliers ?? []);
      }
    } catch {}
    setLoadingComparison(false);
  }, [projectId]);

  useEffect(() => { refreshComparison(); }, [projectId, refreshComparison]);

  // Also refresh whenever staged changes
  useEffect(() => {
    if (staged.length > 0) refreshComparison();
  }, [staged]);

  // ══════════════════════════════════════════════════════════════════════
  // Remove supplier from comparison
  // ══════════════════════════════════════════════════════════════════════
  const removeSupplier = async (name: string) => {
    await fetch(`${API}/pricing-analysis/supplier/${projectId}/${encodeURIComponent(name)}`, {
      method: "DELETE", headers,
    });
    setStaged(prev => prev.filter(s => s.supplierName !== name));
    refreshComparison();
  };

  // ── Ingest result rows (v2 returns full rows, fallback to sample) ──────
  const previewRows: ParsedRow[] = ingestResult
    ? ((ingestResult.rows ?? ingestResult.diagnostics?.sample_rows ?? []) as ParsedRow[])
    : [];

  const previewColumns = previewRows.length > 0
    ? Object.keys(previewRows[0]).filter(k => !["project_id"].includes(k))
    : [];

  // ── Ticker text ────────────────────────────────────────────────────────
  const tickerText = agentLogs.length > 0
    ? agentLogs.map(l => `[${l.agent_id.toUpperCase()}] ${l.message}`).join("   ·   ")
    : "Pricing Agent idle — upload supplier bid sheets to begin analysis";

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0e0f11] text-[#e8eaf0] flex flex-col font-sans">

      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pricing Analysis</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Compare supplier bids · identify savings · benchmark positions</p>
          </div>

          {/* Project selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Project</span>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="bg-[#1b1e24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 min-w-[180px]"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col gap-5 overflow-hidden">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Bids Received" value={kpi?.bids_received ?? staged.reduce((a,s)=>a+s.rows.length,0)} unit="line items" color="teal" />
          <KpiCard label="Suppliers" value={kpi?.suppliers_compared ?? staged.length} unit="compared" color="blue" />
          <KpiCard
            label="Potential Savings"
            value={kpi?.potential_savings_pct != null ? `${kpi.potential_savings_pct.toFixed(1)}%` : "—"}
            unit="vs median baseline"
            color="emerald"
          />
          <KpiCard
            label="Lowest Bid"
            value={kpi?.lowest_bid != null ? fmt(kpi.lowest_bid) : "—"}
            unit="per unit"
            color="violet"
          />
        </div>

        {/* ── Main content: ingest + comparison ── */}
        <div className="flex gap-5 flex-1 min-h-0">

          {/* ── Left panel: ingest ── */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">

            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-medium">
              <button
                onClick={() => setIngestMode("project")}
                className={`flex-1 py-2 transition-colors ${ingestMode === "project" ? "bg-teal-600 text-white" : "bg-[#1b1e24] text-zinc-400 hover:text-white"}`}
              >
                From Project Files
              </button>
              <button
                onClick={() => setIngestMode("upload")}
                className={`flex-1 py-2 transition-colors ${ingestMode === "upload" ? "bg-teal-600 text-white" : "bg-[#1b1e24] text-zinc-400 hover:text-white"}`}
              >
                Upload New
              </button>
            </div>

            <div className="bg-[#14161a] border border-white/8 rounded-xl p-4 flex flex-col gap-3">

              {/* Supplier name */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Supplier Name</label>
                <input
                  type="text"
                  placeholder="Auto-detected from file"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full bg-[#1b1e24] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 placeholder:text-zinc-600"
                />
              </div>

              {/* Mode-specific input */}
              {ingestMode === "project" ? (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Project Supplier Files
                    {supplierFiles.length > 0 && <span className="text-zinc-500 ml-1">({supplierFiles.length} available)</span>}
                  </label>
                  {supplierFiles.length === 0 ? (
                    <div className="text-xs text-zinc-500 bg-[#1b1e24] rounded-lg p-3 border border-white/5">
                      No supplier files uploaded for this project yet.
                      <button onClick={() => setIngestMode("upload")} className="text-teal-400 ml-1 hover:underline">Upload one?</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                      {supplierFiles.map(f => (
                        <button
                          key={f.path}
                          onClick={() => { setSelectedFile(f); if (!supplierName) setSupplierName(f.name); }}
                          className={`text-left px-3 py-2 rounded-lg text-xs transition-colors border ${
                            selectedFile?.path === f.path
                              ? "bg-teal-600/20 border-teal-500/40 text-teal-300"
                              : "bg-[#1b1e24] border-white/5 text-zinc-300 hover:border-white/20"
                          }`}
                        >
                          <div className="font-medium truncate">{f.name}</div>
                          <div className="text-zinc-500 truncate">{f.filename}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Bid Sheet (.xlsx / .csv)</label>
                  <label className="flex flex-col items-center justify-center gap-1 border border-dashed border-white/15 rounded-lg p-4 cursor-pointer hover:border-teal-500/50 transition-colors bg-[#1b1e24]">
                    <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    <span className="text-xs text-zinc-400">{uploadFile ? uploadFile.name : "Click to browse"}</span>
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              {/* Parse button */}
              <button
                onClick={ingestMode === "project" ? ingestFromProject : ingestFromUpload}
                disabled={ingesting || (ingestMode === "project" ? !selectedFile : !uploadFile)}
                className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {ingesting ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Parsing…</>
                ) : "Parse Bid Sheet"}
              </button>
            </div>

            {/* Staged suppliers */}
            {staged.length > 0 && (
              <div className="bg-[#14161a] border border-white/8 rounded-xl p-4">
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">In Comparison</div>
                <div className="flex flex-col gap-1.5">
                  {staged.map((s, i) => (
                    <div key={s.supplierName} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>
                          {s.supplierName}
                        </span>
                        <span className="text-xs text-zinc-500 truncate">{s.rows.length} items</span>
                      </div>
                      <button
                        onClick={() => removeSupplier(s.supplierName)}
                        className="text-zinc-600 hover:text-red-400 transition-colors text-xs"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right panel: preview + comparison ── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">

            {/* Parse preview */}
            {ingestResult && (
              <div className="bg-[#14161a] border border-white/8 rounded-xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Parse Preview</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceBadge(ingestResult.diagnostics.parse_confidence)}`}>
                      {ingestResult.diagnostics.parse_confidence} confidence
                    </span>
                    <span className="text-xs text-zinc-400">
                      {ingestResult.diagnostics.accepted_line_items} rows accepted
                      {ingestResult.diagnostics.excluded_rows.length > 0 && `, ${ingestResult.diagnostics.excluded_rows.length} excluded`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={confirmRows}
                      disabled={previewRows.length === 0}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                    >
                      ✓ Add to Comparison
                    </button>
                    <button
                      onClick={() => setIngestResult(null)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                </div>

                {/* Warnings */}
                {ingestResult.diagnostics.warnings.length > 0 && (
                  <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
                    {ingestResult.diagnostics.warnings.map((w,i) => (
                      <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
                    ))}
                  </div>
                )}

                {/* Column mapping pills */}
                {Object.keys(ingestResult.diagnostics.column_mapping).length > 0 && (
                  <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-1.5">
                    {Object.entries(ingestResult.diagnostics.column_mapping).map(([orig, canon]) => (
                      <span key={orig} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                        <span className="text-zinc-500">{orig}</span> → <span className="text-teal-400">{canon}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Table */}
                {previewRows.length > 0 ? (
                  <div className="overflow-auto max-h-52">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#1b1e24]">
                        <tr>
                          {previewColumns.map(c => (
                            <th key={c} className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                            {previewColumns.map(c => (
                              <td key={c} className="px-3 py-2 whitespace-nowrap text-zinc-300">
                                {row[c] != null ? String(row[c]) : <span className="text-zinc-600">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                    No rows parsed. Check column headers — need at least an item and unit_price column.
                  </div>
                )}
              </div>
            )}

            {/* Comparison table */}
            {(pivot.length > 0 || loadingComparison) ? (
              <div className="flex-1 bg-[#14161a] border border-white/8 rounded-xl flex flex-col min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Bid Comparison</span>
                    <span className="text-xs text-zinc-400">{pivot.length} items · {pivotSuppliers.length} suppliers</span>
                  </div>
                  <button
                    onClick={refreshComparison}
                    className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {loadingComparison ? <span className="w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin" /> : "↻"} Refresh
                  </button>
                </div>

                <div className="overflow-auto flex-1">
                  <table className="w-full text-xs min-w-full">
                    <thead className="sticky top-0 bg-[#1b1e24] z-10">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-zinc-400 font-medium whitespace-nowrap w-48">Item / Description</th>
                        {pivotSuppliers.map((s, i) => (
                          <th key={s} className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>{s}</span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left text-zinc-400 font-medium whitespace-nowrap">Best Price</th>
                        <th className="px-3 py-2.5 text-left text-zinc-400 font-medium min-w-[200px]">Agent Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivot.map((row, i) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                          <td className="px-4 py-2.5 text-zinc-200 font-medium max-w-[180px] truncate">{String(row.item ?? "—")}</td>
                          {pivotSuppliers.map(s => {
                            const val = row[s] as number | null;
                            const isLowest = s === row.lowest_supplier;
                            const isHighest = s === row.highest_supplier;
                            return (
                              <td key={s} className="px-3 py-2.5 text-right whitespace-nowrap">
                                {val != null ? (
                                  <span className={`inline-flex items-center gap-1 ${isLowest ? "text-emerald-400 font-semibold" : isHighest ? "text-red-400" : "text-zinc-300"}`}>
                                    {isLowest && <span className="text-[10px]">▼</span>}
                                    {isHighest && <span className="text-[10px]">▲</span>}
                                    {fmt(val)}
                                  </span>
                                ) : <span className="text-zinc-600">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {row.lowest_supplier && row.lowest_price != null ? (
                              <span className="text-emerald-400 font-medium">{fmt(row.lowest_price)} <span className="text-zinc-500 font-normal text-[10px]">({row.lowest_supplier})</span></span>
                            ) : <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-400 max-w-xs">
                            {generateComment(row, pivotSuppliers)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : staged.length === 0 && !ingestResult ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-3 opacity-30">📊</div>
                  <div className="text-zinc-400 text-sm">No bids loaded yet</div>
                  <div className="text-zinc-600 text-xs mt-1">Select a supplier file from the project or upload a bid sheet</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Agent Ticker ── */}
      <div className="border-t border-white/8 bg-[#0a0b0d] py-2 px-4 overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${agentLogs[0]?.status === "running" ? "bg-teal-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Agent</span>
          </div>
          <div className="overflow-hidden flex-1" ref={tickerRef}>
            <div
              className="text-xs text-zinc-400 whitespace-nowrap"
              style={{ animation: tickerText.length > 80 ? "ticker 20s linear infinite" : undefined }}
            >
              {tickerText}
            </div>
          </div>
          {agentLogs[0] && (
            <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              agentLogs[0].status === "complete" ? "bg-emerald-500/20 text-emerald-400" :
              agentLogs[0].status === "running"  ? "bg-teal-500/20 text-teal-400" :
              agentLogs[0].status === "error"    ? "bg-red-500/20 text-red-400" :
              "bg-zinc-700 text-zinc-400"
            }`}>
              {agentLogs[0].status}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, color }: { label: string; value: string|number; unit: string; color: string }) {
  const colors: Record<string,string> = {
    teal:   "border-teal-500/25 bg-teal-500/5",
    blue:   "border-blue-500/25 bg-blue-500/5",
    emerald:"border-emerald-500/25 bg-emerald-500/5",
    violet: "border-violet-500/25 bg-violet-500/5",
  };
  const valueColors: Record<string,string> = {
    teal: "text-teal-300", blue: "text-blue-300", emerald: "text-emerald-300", violet: "text-violet-300",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? ""}`}>
      <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${valueColors[color] ?? "text-white"}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{unit}</div>
    </div>
  );
}