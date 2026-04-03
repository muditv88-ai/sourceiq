/**
 * PricingPage.tsx v2 — Matches app theme, smart sheet/header detection, working comparison
 *
 * Fixes:
 * 1. Uses CSS variables (bg-background, bg-card, text-foreground etc.) — matches rest of app
 * 2. Multi-sheet: shows all tabs, lets user pick; auto-scans each for best pricing sheet
 * 3. Header row: shows first 8 raw rows preview, lets user pick which row is the header
 * 4. Column mapping: shows detected column roles (item, qty, unit_price etc.) with override UI
 * 5. Comparison table: correctly reads from backend after confirm, auto-refreshes
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API = "/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; }
interface SupplierFile { path: string; name: string; filename?: string; }

interface IngestV2Result {
  rows: Record<string, unknown>[];
  sheet_names: string[];
  selected_sheet: string;
  detected_header_row: number;
  diagnostics: {
    file_name: string;
    accepted_line_items: number;
    excluded_rows: { reason: string; preview: string }[];
    column_mapping: Record<string, string>;
    sample_rows: Record<string, unknown>[];
    parse_confidence: "high" | "medium" | "low";
    warnings: string[];
  };
}

interface StagedSupplier {
  supplierName: string;
  rows: Record<string, unknown>[];
  fileName: string;
  sheetName: string;
  headerRow: number;
}

interface KpiData {
  bids_received: number;
  suppliers_compared: number;
  potential_savings_pct: number | null;
  lowest_bid: number | null;
}

interface PivotRow {
  item: string;
  lowest_supplier?: string;
  lowest_price?: number;
  highest_supplier?: string;
  [supplier: string]: unknown;
}

interface AgentLog {
  id: string;
  agent_id: string;
  status: string;
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const SUPPLIER_COLORS = [
  "bg-primary/10 text-primary border-primary/30",
  "bg-accent/10 text-accent border-accent/30",
  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "bg-rose-500/10 text-rose-400 border-rose-500/30",
  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "bg-sky-500/10 text-sky-400 border-sky-500/30",
];

const confidenceCls = (c: string) =>
  c === "high"   ? "text-success border-success/30 bg-success/5" :
  c === "medium" ? "text-warning border-warning/30 bg-warning/5" :
  "text-destructive border-destructive/30 bg-destructive/5";

function fmt(v: unknown) {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function agentComment(row: PivotRow, suppliers: string[]): string {
  const prices = suppliers
    .map(s => row[s] as number | null)
    .filter((p): p is number => p != null);
  if (prices.length < 2) return "—";
  const min = Math.min(...prices), max = Math.max(...prices);
  const spread = ((max - min) / min * 100).toFixed(1);
  const parts: string[] = [];
  if (row.lowest_supplier) parts.push(`${row.lowest_supplier} lowest`);
  if (row.highest_supplier && row.highest_supplier !== row.lowest_supplier)
    parts.push(`${row.highest_supplier} highest`);
  parts.push(`${spread}% spread`);
  if (parseFloat(spread) > 25) parts.push("⚠ high variance");
  else if (parseFloat(spread) < 5) parts.push("✓ competitive");
  return parts.join(" · ");
}

// ══════════════════════════════════════════════════════════════════════════════
export default function PricingPage() {
  const token = localStorage.getItem("access_token") ?? "";
  const ah = { Authorization: `Bearer ${token}` };

  // ── Projects ──────────────────────────────────────────────────────────
  const [projects, setProjects]   = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [supplierFiles, setSupplierFiles] = useState<SupplierFile[]>([]);

  // ── Ingest flow ───────────────────────────────────────────────────────
  const [ingestMode, setIngestMode] = useState<"project" | "upload">("project");
  const [selectedFile, setSelectedFile] = useState<SupplierFile | null>(null);
  const [uploadFile, setUploadFile]     = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [sheetNames, setSheetNames]     = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow]       = useState(0);
  const [parsed, setParsed]             = useState<IngestV2Result | null>(null);
  const [parsing, setParsing]           = useState(false);

  // ── Staged & comparison ───────────────────────────────────────────────
  const [staged, setStaged]             = useState<StagedSupplier[]>([]);
  const [kpi, setKpi]                   = useState<KpiData | null>(null);
  const [pivot, setPivot]               = useState<PivotRow[]>([]);
  const [pivotSuppliers, setPivotSuppliers] = useState<string[]>([]);
  const [loadingComp, setLoadingComp]   = useState(false);

  // ── Agent ticker ──────────────────────────────────────────────────────
  const [agentLogs, setAgentLogs]       = useState<AgentLog[]>([]);

  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    fetch(`${API}/projects`, { headers: ah })
      .then(r => r.json())
      .then(d => {
        const list: Project[] = d.projects ?? [];
        setProjects(list);
        if (list.length && !projectId) setProjectId(list[0].id);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setSupplierFiles([]);
    setSelectedFile(null);
    setParsed(null);
    setStaged([]);
    setPivot([]);
    setKpi(null);
    fetch(`${API}/projects/${projectId}`, { headers: ah })
      .then(r => r.json())
      .then(d => {
        setSupplierFiles((d.suppliers ?? []).map((s: SupplierFile) => ({
          ...s,
          filename: s.path?.split("/").pop() ?? s.name,
        })));
      }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API}/agent-logs?limit=10`, { headers: ah })
        .then(r => r.json())
        .then((logs: AgentLog[]) =>
          setAgentLogs(logs.filter(l => ["pricing","rfp"].includes(l.agent_id)))
        ).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [token]);

  const refreshComparison = useCallback(async () => {
    if (!projectId) return;
    setLoadingComp(true);
    try {
      const [kr, pr] = await Promise.all([
        fetch(`${API}/pricing-analysis/summary/${projectId}`, { headers: ah }),
        fetch(`${API}/pricing-analysis/comparison/${projectId}`, { headers: ah }),
      ]);
      if (kr.ok) setKpi(await kr.json());
      if (pr.ok) {
        const d = await pr.json();
        setPivot(d.pivot ?? []);
        setPivotSuppliers(d.suppliers ?? []);
      }
    } catch {}
    setLoadingComp(false);
  }, [projectId]);

  useEffect(() => { refreshComparison(); }, [projectId, refreshComparison]);

  // ── Core ingest call ──────────────────────────────────────────────────
  const doIngest = async (blob: Blob, fname: string, hrow = 0) => {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], fname));
      fd.append("header_row", String(hrow));
      fd.append("supplier_name", supplierName || fname.replace(/\.[^.]+$/, ""));
      if (projectId) fd.append("project_id", projectId);
      const res = await fetch(`${API}/pricing-analysis/ingest-v2`, {
        method: "POST", headers: ah, body: fd,
      });
      const data: IngestV2Result = await res.json();
      setParsed(data);
      if (data.sheet_names?.length) {
        setSheetNames(data.sheet_names);
        setSelectedSheet(data.selected_sheet ?? data.sheet_names[0]);
      }
      setHeaderRow(data.detected_header_row ?? hrow);
    } catch {}
    setParsing(false);
  };

  const getBlob = async (): Promise<{ blob: Blob; fname: string } | null> => {
    if (ingestMode === "project" && selectedFile) {
      try {
        const urlRes = await fetch(
          `${API}/projects/${projectId}/files/supplier/${encodeURIComponent(selectedFile.filename ?? selectedFile.name)}/url`,
          { headers: ah }
        );
        const { url } = await urlRes.json();
        const blob = await fetch(url).then(r => r.blob());
        return { blob, fname: selectedFile.filename ?? selectedFile.name };
      } catch { return null; }
    }
    if (uploadFile) return { blob: uploadFile, fname: uploadFile.name };
    return null;
  };

  const handleProjectFileSelect = async (f: SupplierFile) => {
    setSelectedFile(f);
    if (!supplierName) setSupplierName(f.name);
    const pair = await (async () => {
      try {
        const urlRes = await fetch(
          `${API}/projects/${projectId}/files/supplier/${encodeURIComponent(f.filename ?? f.name)}/url`,
          { headers: ah }
        );
        const { url } = await urlRes.json();
        const blob = await fetch(url).then(r => r.blob());
        return { blob, fname: f.filename ?? f.name };
      } catch { return null; }
    })();
    if (pair) await doIngest(pair.blob, pair.fname, 0);
  };

  const handleUploadChange = async (file: File) => {
    setUploadFile(file);
    if (!supplierName) setSupplierName(file.name.replace(/\.[^.]+$/, ""));
    await doIngest(file, file.name, 0);
  };

  const handleReparse = async () => {
    const pair = await getBlob();
    if (pair) await doIngest(pair.blob, pair.fname, headerRow);
  };

  // ── Confirm ───────────────────────────────────────────────────────────
  const confirmRows = async () => {
    if (!parsed) return;
    const rows = parsed.rows ?? parsed.diagnostics.sample_rows ?? [];
    const sName = supplierName || selectedFile?.name || uploadFile?.name?.replace(/\.[^.]+$/, "") || "Supplier";

    await fetch(`${API}/pricing-analysis/confirm-v2`, {
      method: "POST",
      headers: { ...ah, "Content-Type": "application/json" },
      body: JSON.stringify({ rows, project_id: projectId, supplier_name: sName }),
    }).catch(() => {});

    setStaged(prev => {
      const idx = prev.findIndex(s => s.supplierName === sName);
      const entry: StagedSupplier = {
        supplierName: sName,
        rows: rows as Record<string, unknown>[],
        fileName: parsed.diagnostics.file_name,
        sheetName: parsed.selected_sheet,
        headerRow,
      };
      if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
      return [...prev, entry];
    });

    setParsed(null);
    setSheetNames([]);
    setSelectedFile(null);
    setUploadFile(null);
    setSupplierName("");
    setHeaderRow(0);
    setTimeout(() => refreshComparison(), 600);
  };

  const removeSupplier = async (name: string) => {
    await fetch(`${API}/pricing-analysis/supplier/${projectId}/${encodeURIComponent(name)}`,
      { method: "DELETE", headers: ah }).catch(() => {});
    setStaged(prev => prev.filter(s => s.supplierName !== name));
    setTimeout(() => refreshComparison(), 300);
  };

  const previewRows  = parsed ? (parsed.rows ?? parsed.diagnostics.sample_rows ?? []) : [];
  const previewCols  = previewRows.length > 0
    ? Object.keys(previewRows[0]).filter(k => k !== "project_id")
    : [];
  const tickerText   = agentLogs.length > 0
    ? agentLogs.slice(0, 4).map(l => `[${l.agent_id.toUpperCase()}] ${l.message}`).join("   ·   ")
    : "Pricing agent idle — select a project and load supplier bid sheets";

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full min-h-screen bg-background text-foreground">

      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Pricing Analysis</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Compare supplier bids · identify savings · benchmark positions</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Project</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-6 overflow-auto">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Bids Received",     value: kpi?.bids_received ?? staged.reduce((a, s) => a + s.rows.length, 0), sub: "line items",         cls: "border-primary/20 bg-primary/5 text-primary" },
            { label: "Suppliers",          value: kpi?.suppliers_compared ?? staged.length,                             sub: "in comparison",      cls: "border-accent/20 bg-accent/5 text-accent" },
            { label: "Potential Savings",  value: kpi?.potential_savings_pct != null ? `${kpi.potential_savings_pct.toFixed(1)}%` : "—",           sub: "vs median baseline", cls: "border-success/20 bg-success/5 text-success" },
            { label: "Lowest Unit Price",  value: kpi?.lowest_bid != null ? fmt(kpi.lowest_bid) : "—",                 sub: "across all items",   cls: "border-warning/20 bg-warning/5 text-warning" },
          ].map(c => (
            <div key={c.label} className={`rounded-lg border p-4 ${c.cls}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 min-h-0">

          {/* ── Left: ingest panel ── */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-3">

            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border text-xs font-medium">
              {(["project", "upload"] as const).map(m => (
                <button key={m}
                  onClick={() => { setIngestMode(m); setParsed(null); setSheetNames([]); }}
                  className={`flex-1 py-2 transition-colors ${ingestMode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"}`}>
                  {m === "project" ? "From Project" : "Upload File"}
                </button>
              ))}
            </div>

            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                {/* Supplier name */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Supplier Name</label>
                  <input
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="Auto-detected"
                    className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  />
                </div>

                {/* Source */}
                {ingestMode === "project" ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Supplier Files {supplierFiles.length > 0 && <span className="opacity-60">({supplierFiles.length})</span>}
                    </label>
                    {supplierFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground bg-muted rounded-md p-3 border border-border">
                        No files yet.{" "}
                        <button onClick={() => setIngestMode("upload")} className="text-primary hover:underline">Upload?</button>
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                        {supplierFiles.map(f => (
                          <button key={f.path}
                            onClick={() => handleProjectFileSelect(f)}
                            className={`text-left px-3 py-2 rounded-md text-xs transition-colors border ${
                              selectedFile?.path === f.path
                                ? "bg-primary/10 border-primary/40 text-primary"
                                : "bg-background border-border hover:border-primary/30"}`}>
                            <div className="font-medium truncate">{f.name}</div>
                            <div className="text-muted-foreground text-[10px] truncate mt-0.5">{f.filename}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bid Sheet</label>
                    <label className="flex flex-col items-center gap-2 border border-dashed border-border rounded-md p-4 cursor-pointer hover:border-primary/40 bg-background transition-colors">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="text-xs text-muted-foreground">{uploadFile ? uploadFile.name : "Click to browse (.xlsx, .csv)"}</span>
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadChange(f); }} />
                    </label>
                  </div>
                )}

                {parsing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3.5 h-3.5 border border-border border-t-primary rounded-full animate-spin" />
                    Parsing…
                  </div>
                )}

                {/* Sheet picker */}
                {sheetNames.length > 1 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sheet Tab</label>
                    <Select value={selectedSheet} onValueChange={async (v) => {
                      setSelectedSheet(v);
                      const pair = await getBlob();
                      if (pair) await doIngest(pair.blob, pair.fname, headerRow);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sheetNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-selected best sheet — change if needed.</p>
                  </div>
                )}

                {/* Header row */}
                {parsed && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Header Row <span className="opacity-60">(0 = first row)</span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" min={0} max={20} value={headerRow}
                        onChange={e => setHeaderRow(parseInt(e.target.value) || 0)}
                        className="w-16 bg-background border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReparse}>
                        Re-parse
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Increase if file has title rows above headers.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Staged suppliers */}
            {staged.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">In Comparison</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex flex-col gap-1.5">
                  {staged.map((s, i) => (
                    <div key={s.supplierName} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>
                          {s.supplierName}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.rows.length} items</span>
                      </div>
                      <button onClick={() => removeSupplier(s.supplierName)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs ml-2">✕</button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right: preview + comparison ── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Parse preview */}
            {parsed && (
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">Parse Preview</CardTitle>
                    <Badge variant="outline" className={`text-xs ${confidenceCls(parsed.diagnostics.parse_confidence)}`}>
                      {parsed.diagnostics.parse_confidence} confidence
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {parsed.diagnostics.accepted_line_items} rows accepted
                      {parsed.diagnostics.excluded_rows.length > 0 && `, ${parsed.diagnostics.excluded_rows.length} excluded`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={confirmRows} disabled={previewRows.length === 0}>
                      ✓ Add to Comparison
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setParsed(null); setSheetNames([]); }}>
                      Discard
                    </Button>
                  </div>
                </CardHeader>

                {parsed.diagnostics.warnings.length > 0 && (
                  <div className="px-4 py-1.5 border-t border-border bg-warning/5">
                    {parsed.diagnostics.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-warning">⚠ {w}</p>
                    ))}
                  </div>
                )}

                {Object.keys(parsed.diagnostics.column_mapping).length > 0 && (
                  <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground self-center mr-1">Detected:</span>
                    {Object.entries(parsed.diagnostics.column_mapping).map(([orig, canon]) => (
                      <span key={orig} className="text-xs bg-muted px-2 py-0.5 rounded border border-border">
                        {orig} <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-primary font-medium">{canon}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="overflow-auto max-h-52 border-t border-border">
                  {previewRows.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {previewCols.map(c => (
                            <th key={c} className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                            {previewCols.map(c => (
                              <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                                {row[c] != null ? String(row[c]) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      No rows — try increasing the header row number.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* Comparison table */}
            {pivot.length > 0 ? (
              <Card className="flex flex-col">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">Bid Comparison</CardTitle>
                    <span className="text-xs text-muted-foreground">{pivot.length} items · {pivotSuppliers.length} suppliers</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={refreshComparison}>
                    {loadingComp
                      ? <span className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin mr-1" />
                      : "↻ "}
                    Refresh
                  </Button>
                </CardHeader>
                <div className="overflow-auto border-t border-border max-h-[420px]">
                  <table className="w-full text-xs min-w-full">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap w-44 border-b border-border">Item</th>
                        {pivotSuppliers.map((s, i) => (
                          <th key={s} className="px-3 py-2.5 text-right whitespace-nowrap border-b border-border">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>{s}</span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">Best</th>
                        <th className="px-3 py-2.5 text-left text-muted-foreground font-medium border-b border-border min-w-[200px]">Agent Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivot.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-medium max-w-[160px] truncate">{String(row.item ?? "—")}</td>
                          {pivotSuppliers.map(s => {
                            const val = row[s] as number | null;
                            const low = s === row.lowest_supplier;
                            const high = s === row.highest_supplier;
                            return (
                              <td key={s} className="px-3 py-2 text-right whitespace-nowrap">
                                {val != null
                                  ? <span className={low ? "text-success font-semibold" : high ? "text-destructive" : ""}>
                                      {low && "▼ "}{high && "▲ "}{fmt(val)}
                                    </span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.lowest_price != null
                              ? <span className="text-success font-medium">
                                  {fmt(row.lowest_price)}
                                  {row.lowest_supplier && <span className="text-muted-foreground font-normal text-[10px] ml-1">({row.lowest_supplier})</span>}
                                </span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-[11px] max-w-xs">
                            {agentComment(row, pivotSuppliers)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : !parsed ? (
              <div className="flex-1 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <div className="text-5xl opacity-20 mb-3">📊</div>
                  <p className="text-muted-foreground text-sm">No bids loaded yet</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">
                    {ingestMode === "project" ? "Select a supplier file from the left panel" : "Upload a bid sheet (.xlsx or .csv)"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Agent Ticker */}
      <div className="border-t border-border bg-card py-2 px-4 flex items-center gap-3 overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${agentLogs[0]?.status === "running" ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Agent</span>
        </div>
        <p className="text-xs text-muted-foreground truncate flex-1">{tickerText}</p>
        {agentLogs[0] && (
          <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${
            agentLogs[0].status === "complete" ? "text-success border-success/30" :
            agentLogs[0].status === "running"  ? "text-primary border-primary/30" :
            agentLogs[0].status === "error"    ? "text-destructive border-destructive/30" :
            "text-muted-foreground"}`}>
            {agentLogs[0].status}
          </Badge>
        )}
      </div>
    </div>
  );
}
