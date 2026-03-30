import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { pricingStore } from "@/lib/pricingStore";
import { analysisStore } from "@/lib/analysisStore";
import { api } from "@/lib/api";
import type {
  PricingResult, TotalCostResult, BestOfBestBreakdown,
  MarketBasketCombo, AwardStrategy, AwardRecommendation,
} from "@/lib/types";
import {
  DollarSign, Trophy, PlusCircle, Download, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  TrendingDown, Split, Layers, Star, Pencil, Save, X,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const complexityColor = (c: string) =>
  c === "Low" ? "bg-emerald-100 text-emerald-700"
  : c === "Medium" ? "bg-amber-100 text-amber-700"
  : "bg-red-100 text-red-700";

const riskColor = (r: string) =>
  r === "Low" ? "text-emerald-600"
  : r === "Medium" ? "text-amber-600"
  : "text-red-600";

// ── Poll helper ───────────────────────────────────────────────────────────────
function usePricingPoller(
  rfpId: string | null,
  onResult: (result: PricingResult) => void,
  onError: (err: string) => void,
) {
  const [polling, setPolling] = useState(false);
  const [jobId, setJobId]     = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!rfpId) return;
    setPolling(true);
    try {
      const { job_id } = await api.analyzePricing(rfpId);
      setJobId(job_id);
    } catch (e: unknown) {
      onError(String(e));
      setPolling(false);
    }
  }, [rfpId, onError]);

  useEffect(() => {
    if (!jobId || !polling) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getPricingStatus(jobId);
        if (status.status === "completed" && status.result) {
          clearInterval(interval);
          setPolling(false);
          onResult(status.result as PricingResult);
        } else if (status.status === "failed") {
          clearInterval(interval);
          setPolling(false);
          onError(status.error ?? "Analysis failed");
        }
      } catch (e: unknown) {
        clearInterval(interval);
        setPolling(false);
        onError(String(e));
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [jobId, polling, onResult, onError]);

  return { polling, start };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const navigate = useNavigate();
  const rfpId    = analysisStore.getRfpId();

  const [result, setResult]                 = useState<PricingResult | null>(pricingStore.getResult());
  const [error, setError]                   = useState<string | null>(null);
  const [activeTab, setActiveTab]           = useState<"summary" | "matrix" | "scenarios" | "award">("summary");
  const [expandedDesc, setExpandedDesc]     = useState<string | null>(null);
  const [expandedCombo, setExpandedCombo]   = useState<number | null>(null);
  const [exporting, setExporting]           = useState<string | null>(null);

  // Correction state
  const [correcting, setCorrecting]         = useState<string | null>(null);  // supplier name
  const [corrections, setCorrections]       = useState<Record<string, Record<string, string>>>({});
  const [savingCorrections, setSavingCorrections] = useState(false);

  const handleResult = useCallback((r: PricingResult) => {
    pricingStore.setResult(r.rfp_id ?? rfpId ?? "", r);
    setResult(r);
    setError(null);
  }, [rfpId]);

  const handleError = useCallback((e: string) => setError(e), []);

  const { polling, start } = usePricingPoller(rfpId, handleResult, handleError);

  const handleExport = async (format: "xlsx" | "csv") => {
    if (!rfpId) return;
    setExporting(format);
    try { await api.exportPricing(rfpId, format); }
    catch (e) { setError(String(e)); }
    finally   { setExporting(null); }
  };

  const handleSaveCorrections = async () => {
    if (!rfpId || !correcting) return;
    setSavingCorrections(true);
    try {
      const correctionList = Object.entries(corrections).map(([desc, fields]) => ({
        description: desc,
        ...Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
        ),
      }));
      const updated = await api.correctPricing(rfpId, correcting, correctionList) as PricingResult;
      handleResult(updated);
      setCorrecting(null);
      setCorrections({});
    } catch (e) { setError(String(e)); }
    finally     { setSavingCorrections(false); }
  };

  // ── No RFP guard ──────────────────────────────────────────────────────────
  if (!rfpId) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-4">
        <p className="text-muted-foreground text-lg">No RFP loaded. Run an analysis first.</p>
        <Button onClick={() => navigate("/rfp/new")} className="gap-2">
          <PlusCircle className="h-4 w-4" /> Start New Evaluation
        </Button>
      </div>
    );
  }

  // ── No result yet ─────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <DollarSign className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Pricing Analysis</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Extracts pricing tables from supplier documents, builds a cost model,
            and runs 5 award scenarios.
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button onClick={start} disabled={polling} className="gap-2 min-w-[200px]">
          {polling
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Analysing…</>
            : <><DollarSign className="h-4 w-4" /> Run Pricing Analysis</>}
        </Button>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────
  const { total_costs, best_of_best, overall_best, market_basket_2, market_basket_3, award_recommendation, cost_model } = result;
  const suppliers = cost_model?.suppliers ?? [];
  const matrix    = cost_model?.matrix    ?? {};

  const tabs = [
    { id: "summary",   label: "Cost Summary",        icon: DollarSign },
    { id: "matrix",    label: "Price Matrix",         icon: Layers },
    { id: "scenarios", label: "Scenarios",            icon: Split },
    { id: "award",     label: "Award Strategy",       icon: Trophy },
  ] as const;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pricing Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {suppliers.length} supplier(s) · {Object.keys(matrix).length} line items
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={start} disabled={polling}>
            <RefreshCw className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
            {polling ? "Re-analysing…" : "Re-run"}
          </Button>
          {(["xlsx", "csv"] as const).map(fmt2 => (
            <Button key={fmt2} variant="outline" size="sm" className="gap-1.5"
              disabled={exporting === fmt2} onClick={() => handleExport(fmt2)}>
              <Download className="h-3.5 w-3.5" />
              {exporting === fmt2 ? "Exporting…" : fmt2.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Award Recommendation Banner ── */}
      {award_recommendation && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Trophy className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Recommended Award Strategy</p>
              <p className="text-lg font-bold mt-0.5">{award_recommendation.recommended_strategy}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Total: <span className="font-semibold text-foreground">{fmt(award_recommendation.recommended_total)}</span>
                &nbsp;·&nbsp; Savings opportunity: <span className="font-semibold text-emerald-600">{fmt(award_recommendation.savings_opportunity)}</span>
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setActiveTab("award")}>
              View Detail
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ════════════════════ TAB: COST SUMMARY ════════════════════ */}
      {activeTab === "summary" && (
        <div className="space-y-4">
          {/* Supplier cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(total_costs ?? []).map((tc: TotalCostResult) => (
              <Card key={tc.supplier_name}
                className={tc.rank === 1 ? "border-emerald-200" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{tc.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">{tc.line_item_count} line items</p>
                    </div>
                    {tc.rank === 1 && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                        <Trophy className="h-3 w-3 mr-1" /> Lowest
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{fmt(tc.total_cost)}</p>
                  {/* Category breakdown */}
                  <div className="mt-3 space-y-1">
                    {Object.entries(tc.by_category ?? {}).map(([cat, cost]) => (
                      <div key={cat} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[60%]">{cat}</span>
                        <span className="font-medium">{fmt(cost as number)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Best of best summary */}
          {best_of_best && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" /> Best of Best
                </CardTitle>
                <CardDescription>If you awarded each line item to the cheapest supplier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 flex-wrap">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-bold text-emerald-600">{fmt(best_of_best.total_cost)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-2">Wins per supplier</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(best_of_best.wins_by_supplier ?? {}).map(([s, w]) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}: <span className="font-bold ml-1">{w as number} items</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════ TAB: PRICE MATRIX ════════════════════ */}
      {activeTab === "matrix" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">Price Matrix</CardTitle>
                <CardDescription>All line items with supplier prices. Green = lowest price.</CardDescription>
              </div>
              {/* Correction mode controls */}
              {correcting ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Editing: <strong>{correcting}</strong></span>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={savingCorrections}
                    onClick={handleSaveCorrections}>
                    <Save className="h-3.5 w-3.5" />
                    {savingCorrections ? "Saving…" : "Save Corrections"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCorrecting(null); setCorrections({}); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {suppliers.map(s => (
                    <Button key={s} size="sm" variant="outline" className="gap-1.5"
                      onClick={() => setCorrecting(s)}>
                      <Pencil className="h-3.5 w-3.5" /> Correct {s}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Line Item</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                    {suppliers.map(s => (
                      <th key={s} className="text-right p-3 font-medium text-muted-foreground whitespace-nowrap">{s}</th>
                    ))}
                    <th className="text-right p-3 font-medium text-muted-foreground">Best Price</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Best Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(matrix).map(([desc, smap]) => {
                    // Find best supplier for this row
                    const prices = Object.entries(smap)
                      .filter(([, v]) => v !== null && (v as {total: number}).total > 0)
                      .map(([s, v]) => ({ s, total: (v as {total: number}).total }));
                    const best = prices.length ? prices.reduce((a, b) => a.total < b.total ? a : b) : null;
                    const isExpanded = expandedDesc === desc;
                    const cats = Object.values(smap).filter(Boolean).map((v: unknown) => (v as {category: string}).category);
                    const cat = cats[0] ?? "";

                    return (
                      <>
                        <tr key={desc}
                          className="border-t hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => setExpandedDesc(isExpanded ? null : desc)}>
                          <td className="p-3 font-medium max-w-[240px]">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                              <span className="truncate">{desc}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{cat}</td>
                          {suppliers.map(s => {
                            const val = smap[s];
                            const isBest = best && best.s === s;
                            if (correcting === s && val) {
                              const corrVal = corrections[desc]?.["total"] ?? String(val.total ?? "");
                              return (
                                <td key={s} className="p-2" onClick={e => e.stopPropagation()}>
                                  <Input
                                    className="h-7 w-28 text-right text-xs"
                                    value={corrVal}
                                    onChange={e => setCorrections(prev => ({
                                      ...prev,
                                      [desc]: { ...(prev[desc] ?? {}), total: e.target.value },
                                    }))}
                                  />
                                </td>
                              );
                            }
                            return (
                              <td key={s} className={`p-3 text-right ${
                                isBest ? "text-emerald-600 font-semibold" : "text-muted-foreground"
                              }`}>
                                {val ? fmt(val.total) : "—"}
                              </td>
                            );
                          })}
                          <td className="p-3 text-right font-semibold text-emerald-600">
                            {best ? fmt(best.total) : "—"}
                          </td>
                          <td className="p-3 text-right text-xs text-muted-foreground">
                            {best?.s ?? "—"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${desc}-detail`}>
                            <td colSpan={suppliers.length + 4} className="bg-muted/10 px-6 py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                {suppliers.map(s => {
                                  const val = smap[s];
                                  if (!val) return null;
                                  return (
                                    <div key={s} className="rounded-lg border bg-background p-3 space-y-1">
                                      <p className="text-xs font-semibold">{s}</p>
                                      <p className="text-sm font-bold">{fmt(val.total)}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Qty: {val.quantity} × {fmt(val.unit_price)}
                                      </p>
                                      {val.notes && (
                                        <p className="text-xs text-muted-foreground italic">{val.notes}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="p-3 font-bold" colSpan={2}>Total</td>
                    {suppliers.map(s => {
                      const tc = total_costs?.find(t => t.supplier_name === s);
                      return (
                        <td key={s} className="p-3 text-right font-bold">{tc ? fmt(tc.total_cost) : "—"}</td>
                      );
                    })}
                    <td className="p-3 text-right font-bold text-emerald-600">
                      {best_of_best ? fmt(best_of_best.total_cost) : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════ TAB: SCENARIOS ════════════════════ */}
      {activeTab === "scenarios" && (
        <div className="space-y-4">

          {/* Best of Best */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" /> Best of Best
              </CardTitle>
              <CardDescription>Lowest price per line item, awarded to different suppliers as needed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <p className="text-2xl font-bold text-emerald-600">{fmt(best_of_best?.total_cost ?? 0)}</p>
                <p className="text-sm text-muted-foreground">theoretical minimum (highest management complexity)</p>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium text-muted-foreground">Line Item</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Best Supplier</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Best Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(best_of_best?.breakdown ?? []).map((b: BestOfBestBreakdown) => (
                      <tr key={b.description} className="border-t hover:bg-muted/20">
                        <td className="p-2">{b.description}</td>
                        <td className="p-2 text-muted-foreground">{b.category}</td>
                        <td className="p-2 font-medium text-emerald-600">{b.best_supplier}</td>
                        <td className="p-2 text-right font-medium">{fmt(b.best_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Market Basket 2 */}
          {market_basket_2?.combinations?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Split className="h-4 w-4 text-blue-500" /> Market Basket — 2 Suppliers
                </CardTitle>
                <CardDescription>Optimal category-level split across 2 suppliers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(market_basket_2.combinations ?? []).slice(0, 3).map((combo: MarketBasketCombo, i: number) => {
                  const isExpanded = expandedCombo === i;
                  const isBest    = i === 0;
                  return (
                    <div key={i} className={`rounded-lg border ${ isBest ? "border-emerald-200 bg-emerald-50/30" : "" }`}>
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20"
                        onClick={() => setExpandedCombo(isExpanded ? null : i)}>
                        <div className="flex items-center gap-3">
                          {isBest && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Best</Badge>}
                          <span className="text-sm font-medium">{combo.suppliers.join(" + ")}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{fmt(combo.total_cost)}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1">Category</th>
                                <th className="text-left pb-1">Awarded To</th>
                                <th className="text-right pb-1">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(combo.category_detail ?? {}).map(([cat, detail]) => (
                                <tr key={cat} className="border-t">
                                  <td className="py-1.5">{cat}</td>
                                  <td className="py-1.5 text-emerald-600 font-medium">{detail.awarded_to}</td>
                                  <td className="py-1.5 text-right">{fmt(detail.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Market Basket 3 */}
          {market_basket_3?.combinations?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-500" /> Market Basket — 3 Suppliers
                </CardTitle>
                <CardDescription>Optimal category-level split across 3 suppliers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(market_basket_3.combinations ?? []).slice(0, 3).map((combo: MarketBasketCombo, i: number) => {
                  const isExpanded = expandedCombo === (i + 100);
                  const isBest    = i === 0;
                  return (
                    <div key={i} className={`rounded-lg border ${ isBest ? "border-purple-200 bg-purple-50/20" : "" }`}>
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20"
                        onClick={() => setExpandedCombo(isExpanded ? null : i + 100)}>
                        <div className="flex items-center gap-3">
                          {isBest && <Badge className="bg-purple-100 text-purple-700 text-[10px]">Best</Badge>}
                          <span className="text-sm font-medium">{combo.suppliers.join(" + ")}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{fmt(combo.total_cost)}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1">Category</th>
                                <th className="text-left pb-1">Awarded To</th>
                                <th className="text-right pb-1">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(combo.category_detail ?? {}).map(([cat, detail]) => (
                                <tr key={cat} className="border-t">
                                  <td className="py-1.5">{cat}</td>
                                  <td className="py-1.5 text-purple-600 font-medium">{detail.awarded_to}</td>
                                  <td className="py-1.5 text-right">{fmt(detail.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════ TAB: AWARD STRATEGY ════════════════════ */}
      {activeTab === "award" && award_recommendation && (
        <div className="space-y-4">

          {/* Recommended strategy hero */}
          <Card className="border-emerald-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Recommended Strategy</p>
                  <p className="text-xl font-bold">{award_recommendation.recommended_strategy}</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(award_recommendation.recommended_total)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Saves <span className="font-semibold text-emerald-600">{fmt(award_recommendation.savings_opportunity)}</span> vs worst-case
                  </p>
                  <div className="mt-3 space-y-1">
                    {(award_recommendation.rationale ?? []).map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span> {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* All strategies comparison table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Strategies Compared</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Strategy</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total Cost</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Complexity</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Risk</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Suppliers</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Saves vs Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(award_recommendation.all_strategies ?? []).map((s: AwardStrategy, i: number) => {
                      const isRec = s.strategy === award_recommendation.recommended_strategy;
                      return (
                        <tr key={i} className={`border-t ${
                          isRec ? "bg-emerald-50/50" : "hover:bg-muted/20"
                        }`}>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              {isRec && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                              {s.strategy}
                            </div>
                          </td>
                          <td className="p-3 text-right font-semibold">{fmt(s.total)}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${complexityColor(s.complexity)}`}>
                              {s.complexity}
                            </span>
                          </td>
                          <td className={`p-3 text-center text-sm font-medium ${riskColor(s.risk)}`}>{s.risk}</td>
                          <td className="p-3 text-center text-muted-foreground">{s.suppliers_involved}</td>
                          <td className="p-3 text-right">
                            <span className="text-emerald-600 font-medium">{fmt(s.saving_vs_worst)}</span>
                            <span className="text-muted-foreground text-xs ml-1">({s.saving_vs_worst_pct}%)</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Market basket allocation detail for recommended if applicable */}
          {award_recommendation.all_strategies
            .find((s: AwardStrategy) => s.strategy === award_recommendation.recommended_strategy && s.allocation) && (() => {
            const rec = award_recommendation.all_strategies
              .find((s: AwardStrategy) => s.strategy === award_recommendation.recommended_strategy)!;
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-emerald-500" /> Category Award Allocation
                  </CardTitle>
                  <CardDescription>Which supplier to award each category to under the recommended strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(rec.allocation ?? {}).map(([cat, supplier]) => (
                      <div key={cat} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">{cat}</span>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{supplier}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}
    </div>
  );
}
