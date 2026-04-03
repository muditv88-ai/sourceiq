import React, { useState } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldX, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ??
  "http://localhost:8000";

interface Diagnostics {
  file_name: string;
  detected_sheet_name: string;
  raw_non_empty_rows: number;
  accepted_line_items: number;
  excluded_rows: { reason: string; preview: string }[];
  column_mapping: Record<string, string>;
  sample_rows: Record<string, unknown>[];
  parse_confidence: "high" | "medium" | "low";
  warnings: string[];
}

interface UploadResponse {
  staging_id: string;
  sheet_names: string[];
  selected_sheet: string;
  detected_header_row: number;
  diagnostics: Diagnostics;
  rows?: Record<string, unknown>[];  // returned by ingest-v2
}

type Stage = "idle" | "uploading" | "review" | "reparsing" | "confirming" | "done" | "error";

const ConfidencePill: React.FC<{ level: "high" | "medium" | "low" }> = ({ level }) => {
  const cfg = {
    high:   { Icon: ShieldCheck, label: "High confidence",   cls: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" },
    medium: { Icon: ShieldAlert, label: "Medium confidence", cls: "border-yellow-300 text-yellow-700 dark:border-yellow-600 dark:text-yellow-400" },
    low:    { Icon: ShieldX,     label: "Low confidence",    cls: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400" },
  }[level];
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${cfg.cls}`}>
      <cfg.Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
};

interface Props {
  projectId?: string;
  onCommit?: (rows: Record<string, unknown>[]) => void;
}

const SupplierPricingIngest: React.FC<Props> = ({ projectId: propProjectId, onCommit }) => {
  const [stage, setStage]               = useState<Stage>("idle");
  const [dragOver, setDragOver]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [projectId, setProjectId]       = useState(propProjectId ?? "");
  const [response, setResponse]         = useState<UploadResponse | null>(null);
  const [activeSheet, setActiveSheet]   = useState("");
  const [headerRow, setHeaderRow]       = useState(0);
  const [headerInput, setHeaderInput]   = useState("1");
  const [showSample, setShowSample]     = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const handleFile = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setErrorMsg("Please upload an Excel (.xlsx / .xls) or CSV file.");
      setStage("error");
      return;
    }
    setStage("uploading");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("supplier_name", supplierName || file.name);
    if (projectId) fd.append("project_id", projectId);
    try {
      const res = await fetch(`${API_BASE}/pricing-analysis/ingest-v2`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Upload failed");
      }
      const data: UploadResponse = await res.json();
      setResponse(data);
      setActiveSheet(data.selected_sheet);
      setHeaderRow(data.detected_header_row);
      setHeaderInput(String(data.detected_header_row + 1));
      setStage("review");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
      setStage("error");
    }
  };

  const handleReparse = async (sheet: string, hRow: number | null) => {
    if (!response) return;
    setStage("reparsing");
    try {
      const res = await fetch(`${API_BASE}/pricing-analysis/reparse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staging_id: response.staging_id, sheet_name: sheet, header_row: hRow }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Reparse failed");
      }
      const data: UploadResponse = await res.json();
      setResponse({ ...data, sheet_names: response.sheet_names });
      setActiveSheet(data.selected_sheet);
      setHeaderRow(data.detected_header_row);
      setHeaderInput(String(data.detected_header_row + 1));
      setStage("review");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Reparse failed");
      setStage("error");
    }
  };

  const handleConfirm = async () => {
    if (!response) return;
    setStage("confirming");
    try {
      const res = await fetch(`${API_BASE}/pricing-analysis/confirm-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows:          response.rows ?? [],
          project_id:    projectId || "unassigned",
          supplier_name: supplierName || response.diagnostics.file_name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Confirm failed");
      }
      const data = await res.json();
      setConfirmedCount(data.line_items_committed ?? response.diagnostics.accepted_line_items);
      onCommit?.(data.rows ?? []);
      setStage("done");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Confirm failed");
      setStage("error");
    }
  };

  const reset = () => {
    setStage("idle"); setResponse(null); setErrorMsg("");
    setShowSample(false); setShowExcluded(false);
    setSupplierName(""); setProjectId(propProjectId ?? "");
    setActiveSheet(""); setHeaderRow(0); setHeaderInput("1");
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const d = response?.diagnostics;
  const sheetNames = response?.sheet_names ?? [];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          Upload Supplier Pricing Sheet
        </CardTitle>
        <CardDescription>
          Supports Excel files with multiple tabs. Select the correct sheet and adjust
          the header row if your data doesn't start at row 1.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">

        {stage === "idle" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Supplier name <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. Pharma Co Ltd"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Project ID <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. proj-001"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                />
              </div>
            </div>
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-lg
                border-2 border-dashed p-10 transition-colors cursor-pointer
                ${dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById("pricing-file-input")?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                <span className="font-medium text-foreground">Click to upload</span> or drag &amp; drop
              </p>
              <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv — max 10 MB</p>
              <input
                id="pricing-file-input" type="file" accept=".xlsx,.xls,.csv"
                className="sr-only" onChange={onFileInput}
              />
            </div>
          </div>
        )}

        {(stage === "uploading" || stage === "reparsing") && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {stage === "uploading" ? "Uploading and parsing…" : "Re-parsing with new settings…"}
            </span>
          </div>
        )}

        {stage === "review" && d && (
          <div className="space-y-4">

            {sheetNames.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Sheet tabs found ({sheetNames.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sheetNames.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setActiveSheet(s); handleReparse(s, null); }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors
                        ${activeSheet === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reading: <span className="font-medium text-foreground">{activeSheet}</span>
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Header row
                  {headerRow > 0 && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                      — auto-detected at row {headerRow + 1}
                    </span>
                  )}
                </label>
                <input
                  type="number" min={1} max={50}
                  value={headerInput}
                  onChange={(e) => setHeaderInput(e.target.value)}
                  className="w-20 rounded-md border border-border bg-background px-3 py-1.5
                    text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <Button
                size="sm" variant="outline" className="gap-1.5 shrink-0"
                onClick={() => {
                  const n = parseInt(headerInput, 10);
                  if (!isNaN(n) && n >= 1) {
                    const idx = n - 1;
                    setHeaderRow(idx);
                    handleReparse(activeSheet, idx);
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Re-parse
              </Button>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                Change if column headers are not on row 1
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidencePill level={d.parse_confidence} />
                <Badge variant="secondary" className="text-xs">Sheet: {d.detected_sheet_name}</Badge>
                <Badge variant="secondary" className="text-xs">{d.accepted_line_items} line items</Badge>
                <Badge variant="secondary" className="text-xs">{d.raw_non_empty_rows} rows scanned</Badge>
              </div>
              {d.warnings.length > 0 && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2
                  dark:border-yellow-800 dark:bg-yellow-950 space-y-0.5">
                  {d.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-800 dark:text-yellow-300">⚠ {w}</p>
                  ))}
                </div>
              )}
              {d.parse_confidence === "low" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2
                  dark:border-red-800 dark:bg-red-950">
                  <p className="text-xs text-red-800 dark:text-red-300">
                    Required columns not detected. Try a different sheet tab or adjust the header row.
                  </p>
                </div>
              )}
            </div>

            {Object.keys(d.column_mapping).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Detected column mapping
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {Object.entries(d.column_mapping).map(([raw, canonical]) => (
                    <div key={raw}
                      className="flex items-center gap-1.5 rounded-md border border-border
                        bg-background px-2 py-1.5 text-xs min-w-0">
                      <span className="font-medium truncate max-w-[90px]" title={raw}>{raw}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="text-primary font-mono truncate">{canonical}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                onClick={() => setShowSample((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                  hover:text-foreground transition-colors"
              >
                {showSample ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showSample ? "Hide" : "Preview"} sample rows ({d.sample_rows.length})
              </button>
              {showSample && d.sample_rows.length > 0 && (
                <div className="mt-2 rounded-lg border border-border overflow-x-auto">
                  <table className="min-w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {Object.keys(d.sample_rows[0]).slice(0, 8).map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.sample_rows.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          {Object.values(row).slice(0, 8).map((val, j) => (
                            <td key={j} className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              {val === null || val === undefined
                                ? <span className="italic text-muted-foreground/40">—</span>
                                : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {d.excluded_rows.length > 0 && (
              <div>
                <button
                  onClick={() => setShowExcluded((s) => !s)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                    hover:text-foreground transition-colors"
                >
                  {showExcluded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showExcluded ? "Hide" : "Show"} excluded rows ({d.excluded_rows.length})
                </button>
                {showExcluded && (
                  <div className="mt-2 space-y-1">
                    {d.excluded_rows.slice(0, 10).map((r, i) => (
                      <div key={i} className="rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs">
                        <span className="font-medium text-muted-foreground">{r.reason}: </span>
                        <span className="text-muted-foreground/70">{r.preview}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleConfirm} size="sm" className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Confirm &amp; Commit {d.accepted_line_items} items
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {stage === "confirming" && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Committing to project…</span>
          </div>
        )}

        {stage === "done" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4
              dark:border-green-800 dark:bg-green-950">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Pricing sheet committed successfully
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {confirmedCount} line items are now available for comparison and analysis.
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Badge variant="secondary">{confirmedCount} items committed</Badge>
              <Button variant="ghost" size="sm" onClick={reset}>Upload another sheet</Button>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4
              dark:border-red-800 dark:bg-red-950">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-300">{errorMsg}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>Try again</Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
};

export default SupplierPricingIngest;
