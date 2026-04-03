import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingDown, Users, BarChart3, ArrowUpDown,
  ChevronUp, ChevronDown, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SupplierPricingIngest from "@/components/SupplierPricingIngest";

const API_BASE =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ??
  "http://localhost:8000";

interface KPIs {
  bids_received: number;
  suppliers_compared: number;
  potential_savings_pct: number | null;
  avg_delta_pct: number | null;
  baseline: number | null;
  baseline_source: string | null;
  lowest_bid: number | null;
  highest_bid: number | null;
}

interface BidRow {
  item?: string;
  supplier?: string;
  unit?: string;
  quantity?: number | string;
  unit_price?: number | null;
  total_price?: number | null;
  currency?: string;
  delta_pct?: number | null;
  bid_position?: string;
  [key: string]: unknown;
}

type SortDir = "asc" | "desc";

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: decimals });

const DeltaBadge: React.FC<{ val: number | null | undefined }> = ({ val }) => {
  if (val == null) return <span className="text-muted-foreground">—</span>;
  const positive = val > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums
      ${positive ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
      {positive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(val).toFixed(1)}%
    </span>
  );
};

const KPICard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "amber" | "default";
}> = ({ icon, label, value, sub, highlight = "default" }) => {
  const accent = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    default: "text-foreground",
  }[highlight];
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-semibold tabular-nums leading-tight ${accent}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="text-muted-foreground/60 shrink-0 mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const PROJECT_ID = "proj-default";

const PricingPage: React.FC = () => {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<string>("unit_price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [kRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/pricing-analysis/summary/${PROJECT_ID}`),
        fetch(`${API_BASE}/pricing-analysis/bids/${PROJECT_ID}`),
      ]);
      if (kRes.ok) setKpis(await kRes.json());
      if (bRes.ok) {
        const data = await bRes.json();
        setBids(data.bids ?? []);
        setColumns(data.columns ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const handleCommit = () => setRefreshKey((k) => k + 1);

  const sorted = [...bids].sort((a, b) => {
    const av = a[sortCol]; const bv = b[sortCol];
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (col: string) => {
    if (col === sortCol) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const HIDDEN_COLS = new Set(["project_id"]);
  const visibleCols = columns.filter((c) => !HIDDEN_COLS.has(c));

  const colLabel = (c: string) =>
    c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pricing Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload supplier bids, compare line items, and identify savings opportunities.
        </p>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Potential Savings"
          value={kpis?.potential_savings_pct != null ? `${kpis.potential_savings_pct.toFixed(1)}%` : "—"}
          sub={
            kpis?.baseline != null
              ? `vs ${kpis.baseline_source === "median_of_bids" ? "median" : "baseline"} ${fmt(kpis.baseline)}`
              : "Upload bids to calculate"
          }
          highlight={kpis?.potential_savings_pct != null && kpis.potential_savings_pct > 0 ? "green" : "default"}
        />
        <KPICard
          icon={<Users className="h-5 w-5" />}
          label="Bids Received"
          value={kpis ? String(kpis.bids_received) : "—"}
          sub={kpis?.suppliers_compared ? `${kpis.suppliers_compared} supplier${kpis.suppliers_compared > 1 ? "s" : ""} compared` : undefined}
        />
        <KPICard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Avg Delta from Baseline"
          value={kpis?.avg_delta_pct != null ? `${kpis.avg_delta_pct > 0 ? "+" : ""}${kpis.avg_delta_pct.toFixed(1)}%` : "—"}
          sub={
            kpis?.baseline_source === "median_of_bids"
              ? "Baseline = median of bids"
              : kpis?.baseline_source === "provided"
              ? "Baseline from RFP template"
              : "No bids uploaded yet"
          }
          highlight={
            kpis?.avg_delta_pct == null ? "default"
            : kpis.avg_delta_pct < 0 ? "green"
            : kpis.avg_delta_pct > 5 ? "amber"
            : "default"
          }
        />
      </div>

      {/* ── Upload ── */}
      <SupplierPricingIngest projectId={PROJECT_ID} onCommit={handleCommit} />

      {/* ── Bid Table ── */}
      {bids.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>All Bids</span>
              <Badge variant="secondary">{bids.length} line items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {visibleCols.map((col) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground
                          whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                      >
                        <span className="inline-flex items-center gap-1">
                          {colLabel(col)}
                          {sortCol === col
                            ? sortDir === "asc"
                              ? <ChevronUp className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />
                            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-0 transition-colors
                        ${row.bid_position === "🥇 Lowest"
                          ? "bg-green-50/60 dark:bg-green-950/20"
                          : i % 2 === 0 ? "bg-background" : "bg-muted/10"
                        }`}
                    >
                      {visibleCols.map((col) => (
                        <td key={col} className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                          {col === "delta_pct"
                            ? <DeltaBadge val={row[col] as number | null} />
                            : col === "bid_position"
                            ? <span className={`text-xs font-medium
                                ${row[col] === "🥇 Lowest"
                                  ? "text-green-700 dark:text-green-400"
                                  : row[col] === "Highest"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"}`}>
                                {String(row[col] ?? "—")}
                              </span>
                            : col === "unit_price" || col === "total_price"
                            ? <span className="font-mono">
                                {row[col] != null ? fmt(row[col] as number) : "—"}
                              </span>
                            : <span className="text-muted-foreground">
                                {row[col] != null ? String(row[col]) : "—"}
                              </span>
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {kpis?.baseline_source === "median_of_bids" && (
              <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Baseline not provided — using median of all bids ({fmt(kpis.baseline)}) as reference.
                Upload an RFP template with target prices to override.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PricingPage;
