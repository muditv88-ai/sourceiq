/**
 * SupplierPricingIngest.tsx
 *
 * Drop-in panel for PricingPage that lets users upload a supplier pricing
 * Excel file, sends it through the new /ingest-workbook pipeline, and
 * shows a structured result with:
 *   - Confidence tier badge (HIGH / MEDIUM / LOW)
 *   - Summary: total line items, missing totals, cost breakdown flag
 *   - Validation flags grouped by severity (error / warning / info)
 *   - Full canonical line-item table (collapsible, visible at HIGH)
 */

import { useState, useCallback } from "react";
import { Upload, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronUp, X, Loader2, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type {
  WorkbookIngestResult,
  PricingValidationFlag,
  PricingConfidenceTier,
  PricingLineItemCanonical,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  supplierName?: string;
  onIngestComplete?: (result: WorkbookIngestResult) => void;
}

const TIER_CONFIG: Record<PricingConfidenceTier, {
  label: string; color: string; bg: string; icon: React.ReactNode; description: string;
}> = {
  HIGH:   {
    label: "HIGH",
    color: "text-green-700",
    bg:    "bg-green-50 border-green-200",
    icon:  <CheckCircle2 className="h-5 w-5 text-green-600" />,
    description: "Auto-ingested into pricing analysis — no review required",
  },
  MEDIUM: {
    label: "MEDIUM",
    color: "text-amber-700",
    bg:    "bg-amber-50 border-amber-200",
    icon:  <AlertCircle className="h-5 w-5 text-amber-500" />,
    description: "Review mapped fields before running pricing analysis",
  },
  LOW:    {
    label: "LOW",
    color: "text-red-700",
    bg:    "bg-red-50 border-red-200",
    icon:  <AlertCircle className="h-5 w-5 text-red-500" />,
    description: "Manual review required — significant data issues found",
  },
};

export default function SupplierPricingIngest({ projectId, supplierName: initName = "", onIngestComplete }: Props) {
  const [file,           setFile]           = useState<File | null>(null);
  const [supplierName,   setSupplierName]   = useState(initName);
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<WorkbookIngestResult | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [showLineItems,  setShowLineItems]  = useState(false);
  const [isDragging,     setIsDragging]     = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setResult(null); setError(null); }
  }, []);

  async function handleIngest() {
    if (!file || !supplierName.trim() || !projectId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.ingestPricingWorkbook(file, supplierName.trim(), projectId);
      setResult(r);
      onIngestComplete?.(r);
    } catch (e: any) {
      setError(e.message ?? "Ingestion failed");
    } finally {
      setLoading(false);
    }
  }

  const tier    = result ? TIER_CONFIG[result.confidence_tier] : null;
  const errors  = result?.validation_flags.filter(f => f.severity === "error")   ?? [];
  const warns   = result?.validation_flags.filter(f => f.severity === "warning") ?? [];
  const infos   = result?.validation_flags.filter(f => f.severity === "info")    ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Ingest Supplier Pricing Sheet
        </CardTitle>
        <CardDescription>
          Upload a supplier Excel pricing file — the AI will detect the pricing sheet,
          map cost columns, validate formulas, and return a structured result.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Upload zone ─────────────────────────────────────────────── */}
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all",
            isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/40 hover:bg-muted/30",
          )}
        >
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {file ? <FileSpreadsheet className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
          </div>
          <div className="text-center">
            {file ? (
              <p className="font-medium text-foreground text-sm">{file.name}</p>
            ) : (
              <>
                <p className="font-semibold text-sm">Drop supplier pricing workbook here</p>
                <p className="text-xs text-muted-foreground mt-0.5">.xlsx files only</p>
              </>
            )}
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setResult(null); setError(null); }
            }}
          />
        </label>

        {/* ── Supplier name ────────────────────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Supplier Name</label>
          <input
            type="text"
            value={supplierName}
            onChange={e => setSupplierName(e.target.value)}
            placeholder="e.g. Supplier A"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <Button
          onClick={handleIngest}
          disabled={!file || !supplierName.trim() || loading}
          className="w-full gap-2"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analysing workbook&hellip;</>
          ) : (
            <><Upload className="h-4 w-4" /> Ingest Pricing Sheet</>
          )}
        </Button>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex gap-2 items-start text-destructive text-sm p-3 bg-destructive/5 rounded-lg border border-destructive/20">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Result ───────────────────────────────────────────────────── */}
        {result && tier && (
          <div className={cn("rounded-xl border p-4 space-y-4", tier.bg)}>

            {/* Tier banner */}
            <div className="flex items-start gap-3">
              {tier.icon}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("font-semibold text-sm", tier.color)}>
                    Confidence: {tier.label}
                  </span>
                  {result.auto_ingest && (
                    <Badge variant="outline" className="text-xs border-green-400 text-green-700">
                      Auto-ingested
                    </Badge>
                  )}
                  {result.review_needed && !result.auto_ingest && (
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                      Review required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{tier.description}</p>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Line Items",        value: result.total_line_items },
                { label: "Missing Totals",    value: result.missing_totals, warn: result.missing_totals > 0 },
                { label: "Cost Breakdown",    value: result.has_cost_breakdown ? "Yes" : "No" },
                { label: "Source Sheet",      value: result.source_sheet ?? "—" },
              ].map(stat => (
                <div key={stat.label} className="bg-white/60 rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={cn("font-semibold text-sm mt-0.5", (stat as any).warn ? "text-amber-700" : "text-foreground")}>
                    {String(stat.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Validation flags */}
            {(errors.length > 0 || warns.length > 0 || infos.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Validation Flags ({result.validation_flags.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {[...errors, ...warns, ...infos].map((flag, i) => (
                    <FlagRow key={i} flag={flag} />
                  ))}
                </div>
              </div>
            )}

            {/* Line items table — visible if schema present */}
            {result.schema?.line_items && result.schema.line_items.length > 0 && (
              <div>
                <button
                  onClick={() => setShowLineItems(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {showLineItems ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showLineItems ? "Hide" : "View"} {result.schema.line_items.length} line items
                </button>
                {showLineItems && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          {["SKU", "Description", "Volume", "Unit Cost", "ACV", "Confidence", "Issues"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.schema.line_items.map((item, i) => (
                          <LineItemRow key={i} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlagRow({ flag }: { flag: PricingValidationFlag }) {
  const cfg = {
    error:   { icon: <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />,   cls: "text-red-700" },
    warning: { icon: <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />, cls: "text-amber-700" },
    info:    { icon: <Info         className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />,  cls: "text-blue-700" },
  }[flag.severity] ?? { icon: null, cls: "" };

  return (
    <div className="flex items-start gap-2 bg-white/50 rounded px-2.5 py-1.5">
      {cfg.icon}
      <div className="min-w-0">
        <span className={cn("font-mono text-xs font-semibold", cfg.cls)}>{flag.code}</span>
        {flag.item_id && <span className="text-muted-foreground ml-1 text-xs">· {flag.item_id}</span>}
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{flag.message}</p>
      </div>
    </div>
  );
}

function LineItemRow({ item }: { item: PricingLineItemCanonical }) {
  const conf = item.confidence >= 0.85 ? "text-green-600" : item.confidence >= 0.6 ? "text-amber-600" : "text-red-600";
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-1.5 font-mono text-muted-foreground">{item.item_id}</td>
      <td className="px-3 py-1.5 max-w-[200px] truncate" title={item.description}>{item.description}</td>
      <td className="px-3 py-1.5 tabular-nums">{item.annual_volume?.toLocaleString() ?? "—"}</td>
      <td className="px-3 py-1.5 tabular-nums">{item.total_unit_cost != null ? item.total_unit_cost.toFixed(4) : "—"}</td>
      <td className="px-3 py-1.5 tabular-nums">{item.annual_contract_value != null ? item.annual_contract_value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</td>
      <td className={cn("px-3 py-1.5 tabular-nums font-medium", conf)}>{(item.confidence * 100).toFixed(0)}%</td>
      <td className="px-3 py-1.5 text-amber-600">{item.missing_fields.join(", ") || "—"}</td>
    </tr>
  );
}
