import React, { useState, useCallback } from "react";
import {
  TrendingDown, Users, BarChart3, Trophy,
  ChevronUp, ChevronDown, ArrowUpDown,
  AlertCircle, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SupplierPricingIngest from "@/components/SupplierPricingIngest";

const PAGE_SIZES = [10, 20, 50, 100];
type SortDir = "asc" | "desc";

interface PriceRow {
  lineItem: string;
  category: string;
  unitOfMeasure: string;
  supplier: string;
  unitPrice: number;
  quantity: number;
  total: number;
  delta: number;
  bidPosition?: string;
  deltaPct?: number;
  [key: string]: unknown;
}
interface SupplierSummary {
  supplier: string; lineItems: number;
  avgUnitPrice: number; minUnitPrice: number; totalValue: number;
}
interface PivotRow {
  lineItem: string; lowestSupplier: string | null; lowestPrice: number | null;
  highestSupplier: string | null; highestPrice: number | null; savingPct: number | null;
  [key: string]: unknown;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const DeltaBadge: React.FC<{ val: number | null | undefined }> = ({ val }) => {
  if (val == null) return <span className="text-muted-foreground text-xs">—</span>;
  const up = val > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums
      ${up ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
      {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(val).toFixed(1)}%
    </span>
  );
};

const KPICard: React.FC<{
  icon: React.ReactNode; label: string; value: string;
  sub?: string; highlight?: "green" | "amber" | "default";
}> = ({ icon, label, value, sub, highlight = "default" }) => (
  <Card>
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-semibold tabular-nums leading-tight
            ${highlight === "green" ? "text-green-600 dark:text-green-400"
            : highlight === "amber" ? "text-amber-600 dark:text-amber-400"
            : "text-foreground"}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="text-muted-foreground/60 shrink-0 mt-0.5">{icon}</div>
      </div>
    </CardContent>
  </Card>
);

function computeKPIs(rows: PriceRow[]) {
  if (!rows.length) return null;
  const prices = rows.map((r) => r.unitPrice).filter((p) => p != null && !isNaN(p));
  if (!prices.length) return null;
  const sorted  = [...prices].sort((a, b) => a - b);
  const median  = sorted[Math.floor(sorted.length / 2)];
  const min     = sorted[0];
  const max     = sorted[sorted.length - 1];
  const mean    = prices.reduce((a, b) => a + b, 0) / prices.length;
  const suppliers = new Set(rows.map((r) => r.supplier)).size;
  return {
    bidsReceived:        rows.length,
    suppliersCompared:   suppliers,
    potentialSavingsPct: median > 0 ? +((( median - min) / median) * 100).toFixed(2) : null,
    avgDeltaPct:         median > 0 ? +(((mean - median) / median) * 100).toFixed(2) : null,
    baseline: median, lowestBid: min, highestBid: max,
  };
}

function computeSuppliers(rows: PriceRow[]): SupplierSummary[] {
  const map: Record<string, PriceRow[]> = {};
  rows.forEach((r) => { (map[r.supplier] ??= []).push(r); });
  return Object.entries(map).map(([supplier, rs]) => {
    const prices = rs.map((r) => r.unitPrice).filter((p) => !isNaN(p));
    return {
      supplier, lineItems: rs.length,
      avgUnitPrice: +(prices.reduce((a, b) => a + b, 0) / (prices.length || 1)).toFixed(2),
      minUnitPrice: +Math.min(...prices).toFixed(2),
      totalValue:   +rs.reduce((a, r) => a + (r.total ?? 0), 0).toFixed(2),
    };
  });
}

function computePivot(rows: PriceRow[], baseline: number | null) {
  const suppliersSet = [...new Set(rows.map((r) => r.supplier))].sort();
  const itemsSet     = [...new Set(rows.map((r) => r.lineItem))];
  const pivot: PivotRow[] = itemsSet.map((item) => {
    const itemRows = rows.filter((r) => r.lineItem === item);
    const row: PivotRow = { lineItem: item, lowestSupplier: null, lowestPrice: null,
      highestSupplier: null, highestPrice: null, savingPct: null };
    const pairs: [string, number][] = [];
    suppliersSet.forEach((sup) => {
      const m = itemRows.find((r) => r.supplier === sup);
      row[sup] = m ? m.unitPrice : null;
      if (m && !isNaN(m.unitPrice)) pairs.push([sup, m.unitPrice]);
    });
    if (pairs.length) {
      pairs.sort((a, b) => a[1] - b[1]);
      row.lowestSupplier  = pairs[0][0];
      row.lowestPrice     = pairs[0][1];
      row.highestSupplier = pairs[pairs.length - 1][0];
      row.highestPrice    = pairs[pairs.length - 1][1];
      const bl = baseline ?? pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
      row.savingPct = bl > 0 ? +((( bl - pairs[0][1]) / bl) * 100).toFixed(2) : null;
    }
    return row;
  });
  return { pivot, suppliers: suppliersSet };
}

const BID_COLS: { key: string; label: string }[] = [
  { key: "lineItem",      label: "Item" },
  { key: "supplier",      label: "Supplier" },
  { key: "unitOfMeasure", label: "Unit" },
  { key: "quantity",      label: "Qty" },
  { key: "unitPrice",     label: "Unit Price" },
  { key: "total",         label: "Total" },
  { key: "deltaPct",      label: "Δ vs Baseline" },
  { key: "bidPosition",   label: "Position" },
];

const PricingPage: React.FC = () => {
  const [allRows, setAllRows]   = useState<PriceRow[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [offset, setOffset]     = useState(0);
  const [sortCol, setSortCol]   = useState("unitPrice");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");

  const handleCommit = useCallback((newRows: Record<string, unknown>[]) => {
    setAllRows((prev) => [...prev, ...(newRows as PriceRow[])]);
    setOffset(0);
  }, []);

  const handleDelete = (supplier: string) => {
    if (!confirm(`Remove all bids from "${supplier}"?`)) return;
    setAllRows((prev) => prev.filter((r) => r.supplier !== supplier));
    setOffset(0);
  };

  const kpis      = computeKPIs(allRows);
  const suppliers = computeSuppliers(allRows);
  const { pivot, suppliers: pivotSuppliers } = computePivot(allRows, kpis?.baseline ?? null);

  const annotated: PriceRow[] = allRows.map((row) => {
    const itemRows  = allRows.filter((r) => r.lineItem === row.lineItem);
    const sortedI   = [...itemRows].sort((a, b) => a.unitPrice - b.unitPrice);
    const rank      = sortedI.findIndex((r) => r.supplier === row.supplier && r.unitPrice === row.unitPrice) + 1;
    const maxRank   = sortedI.length;
    const bl        = kpis?.baseline;
    const deltaPct  = bl ? +((( row.unitPrice - bl) / bl) * 100).toFixed(2) : null;
    const pos = rank === 1 ? "🥇 Lowest" : rank === maxRank ? "Highest"
      : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
    return { ...row, bidPosition: pos, deltaPct };
  });

  const sorted    = [...annotated].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });
  const total      = sorted.length;
  const paginated  = sorted.slice(offset, offset + pageSize);
  const totalPages = Math.ceil(total / pageSize) || 1;
  const curPage    = Math.floor(offset / pageSize) + 1;

  const toggleSort = (col: string) => {
    if (col === sortCol) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const hasAnalysis = pivot.length > 0 && pivotSuppliers.length >= 2;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pricing Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload supplier bids, compare line items, and identify savings opportunities.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Potential Savings"
          value={kpis?.potentialSavingsPct != null ? `${kpis.potentialSavingsPct.toFixed(1)}%` : "—"}
          sub={kpis?.baseline != null
            ? `Lowest bid vs median baseline (${fmt(kpis.baseline)})`
            : "Upload bids to calculate"}
          highlight={kpis?.potentialSavingsPct != null && kpis.potentialSavingsPct > 0 ? "green" : "default"}
        />
        <KPICard
          icon={<Users className="h-5 w-5" />}
          label="Bids Received"
          value={kpis ? String(kpis.bidsReceived) : "—"}
          sub={kpis?.suppliersCompared
            ? `${kpis.suppliersCompared} supplier${kpis.suppliersCompared !== 1 ? "s" : ""} compared`
            : undefined}
        />
        <KPICard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Avg Delta from Baseline"
          value={kpis?.avgDeltaPct != null
            ? `${kpis.avgDeltaPct > 0 ? "+" : ""}${kpis.avgDeltaPct.toFixed(1)}%` : "—"}
          sub={kpis?.lowestBid != null
            ? `Range: ${fmt(kpis.lowestBid)} – ${fmt(kpis.highestBid)}` : "No bids yet"}
          highlight={kpis?.avgDeltaPct == null ? "default"
            : kpis.avgDeltaPct < 0 ? "green" : kpis.avgDeltaPct > 5 ? "amber" : "default"}
        />
      </div>

      {/* Supplier chips */}
      {suppliers.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uploaded Suppliers</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="flex flex-wrap gap-2">
              {suppliers.map((s) => (
                <div key={s.supplier}
                  className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs">
                  <span className="font-medium text-foreground">{s.supplier}</span>
                  <span className="text-muted-foreground">
                    {s.lineItems} items · min {fmt(s.minUnitPrice)}
                  </span>
                  <button onClick={() => handleDelete(s.supplier)}
                    className="ml-1 text-muted-foreground hover:text-red-500 transition-colors"
                    title={`Remove ${s.supplier}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      <SupplierPricingIngest onCommit={handleCommit} />

      {/* Bid Analysis Pivot */}
      {hasAnalysis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              Bid Analysis
              <Badge variant="secondary">{pivot.length} items · {pivotSuppliers.length} suppliers</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Side-by-side unit price per item. 🥇 = lowest bid per item. Saving% vs median baseline.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full text-xs border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-left
                      font-medium text-muted-foreground min-w-[200px] border-r border-border">
                      Item
                    </th>
                    {pivotSuppliers.map((s) => (
                      <th key={s} className="px-4 py-2.5 text-right font-medium text-muted-foreground min-w-[130px]">
                        {s}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground min-w-[120px]">
                      Saving vs Baseline
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground min-w-[140px]">
                      Lowest Bid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.map((row, i) => (
                    <tr key={i} className={`border-b border-border last:border-0
                      ${i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-medium
                        text-foreground border-r border-border max-w-[220px] truncate"
                        title={row.lineItem}>{row.lineItem}</td>
                      {pivotSuppliers.map((s) => {
                        const price     = row[s] as number | null;
                        const isLowest  = price != null && s === row.lowestSupplier;
                        const isHighest = price != null && s === row.highestSupplier && pivotSuppliers.length > 1;
                        return (
                          <td key={s} className="px-4 py-2.5 text-right tabular-nums">
                            {price == null
                              ? <span className="text-muted-foreground/40 italic">—</span>
                              : <span className={`font-mono text-xs font-medium
                                  ${isLowest  ? "text-green-600 dark:text-green-400"
                                  : isHighest ? "text-red-500 dark:text-red-400"
                                  : "text-muted-foreground"}`}>
                                  {isLowest && "🥇 "}{fmt(price)}
                                </span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right">
                        {row.savingPct != null
                          ? <span className={`text-xs font-medium tabular-nums
                              ${row.savingPct > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-500 dark:text-red-400"}`}>
                              {row.savingPct > 0 ? "↓ " : "↑ "}{Math.abs(row.savingPct).toFixed(1)}%
                            </span>
                          : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {row.lowestSupplier
                          ? <>{row.lowestSupplier} <span className="font-mono tabular-nums">{fmt(row.lowestPrice)}</span></>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Baseline = median unit price across all uploaded bids ({fmt(kpis?.baseline)}).
            </div>
          </CardContent>
        </Card>
      )}

      {!hasAnalysis && allRows.length > 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-5 text-center text-sm text-muted-foreground">
          Upload bids from <span className="font-medium">at least 2 suppliers</span> to see the side-by-side comparison.
        </div>
      )}

      {/* All Bids Table */}
      {total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2">
                All Bids
                <Badge variant="secondary">{total} line items</Badge>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show</span>
                <select value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs
                    focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} per page</option>)}
                </select>
                <span className="text-xs text-muted-foreground">Page {curPage} of {totalPages}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {BID_COLS.map(({ key, label }) => (
                      <th key={key} onClick={() => toggleSort(key)}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground
                          cursor-pointer hover:text-foreground select-none">
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {sortCol === key
                            ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => (
                    <tr key={i} className={`border-b border-border last:border-0
                      ${row.bidPosition === "🥇 Lowest"
                        ? "bg-green-50/60 dark:bg-green-950/20"
                        : i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                      <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate"
                        title={row.lineItem}>{row.lineItem}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.supplier}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.unitOfMeasure || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(row.quantity as number, 0)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmt(row.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{fmt(row.total)}</td>
                      <td className="px-4 py-2.5 text-right"><DeltaBadge val={row.deltaPct} /></td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium
                          ${row.bidPosition === "🥇 Lowest" ? "text-green-700 dark:text-green-400"
                          : row.bidPosition === "Highest"   ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"}`}>
                          {row.bidPosition}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Showing {Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - pageSize))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={offset + pageSize >= total}
                  onClick={() => setOffset((o) => o + pageSize)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PricingPage;
