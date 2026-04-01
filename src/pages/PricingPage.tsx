/**
 * PricingPage v2
 *
 * Calls the dedicated /pricing-analysis/analyze endpoint,
 * polls for completion, then renders:
 *   - L1 / L2 / L3 supplier ranking cards
 *   - Full price matrix (unit prices per line item, lowest highlighted green)
 *   - Best-of-Best breakdown (cheapest supplier per SKU, savings vs worst)
 *   - Award recommendation with all strategy scenarios
 *
 * Falls back to the lightweight price_comparison table from analysisStore
 * if the dedicated pricing job has never been run.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analysisStore } from "@/lib/analysisStore";
import { pricingStore } from "@/lib/pricingStore";
import { api } from "@/lib/api";
import type { PricingResult, PriceComparisonRow } from "@/lib/types";
import {
  DollarSign, TrendingDown, AlertCircle, Download,
  BarChart3, ArrowRight, Trophy, RefreshCw, CheckCircle2,
} from "lucide-react";

type Tab = "matrix" | "bob" | "award";

export default function PricingPage() {
  const navigate        = useNavigate();
  const analysisResult  = analysisStore.getResult();

  const [pricing, setPricing]     = useState<PricingResult | null>(
    () => pricingStore.getResult()
  );
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  const rfpId     = analysisResult?.rfp_id;
  const projectId = (analysisResult as any)?._project_id as string | undefined;

  const matrixSuppliers  = pricing?.cost_model?.suppliers ?? [];
  const descriptions     = pricing?.cost_model?.descriptions ?? (pricing?.cost_model as any)?.descriptions ?? [];
  const matrix           = pricing?.cost_model?.matrix ?? {};
  const totalCosts       = pricing?.total_costs ?? [];
  const bob              = pricing?.best_of_best ?? null;
  const award            = pricing?.award_recommendation ?? null;

  // Simple fallback: lightweight rows from the technical analysis run
  const simplePriceRows: PriceComparisonRow[] =
    analysisResult?.price_comparison ?? [];

  // ── Supplier display names for the fallback table ───────────────────────────
  const analysisSuppliers = analysisResult?.suppliers?.map(s => s.supplier_name) ?? [];

  async function runPricingAnalysis() {
    if (!rfpId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.runPricingAnalysis(rfpId, projectId);
      pricingStore.setResult(rfpId, result);
      setPricing(result);
    } catch (e: any) {
      setError(e.message ?? "Pricing analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Guard: nothing to show at all ──────────────────────────────────────────
  if (!analysisResult && !pricing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Pricing Analysis</h1>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center gap-4">
            <DollarSign className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">No analysis result yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Run the technical analysis first, then return here to run pricing.
              </p>
            </div>
            <Button onClick={() => navigate("/suppliers")} className="gap-2">
              Go to Supplier Responses <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ─ Page header with action buttons ───────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pricing Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {pricing
              ? `${matrixSuppliers.length} supplier${matrixSuppliers.length !== 1 ? "s" : ""} · ${
                  (descriptions as string[]).length
                } line items`
              : "Run dedicated pricing analysis for full scenario modelling"}
          </p>
        </div>
        <div className="flex gap-2">
          {pricing && rfpId && (
            <Button
              variant="outline"
              onClick={() => api.exportPricing(rfpId, "xlsx")}
              className="gap-2"
            >
              <Download className="h-4 w-4" /> Export XLSX
            </Button>
          )}
          <Button
            onClick={runPricingAnalysis}
            disabled={loading || !rfpId}
            className="gap-2"
          >
            {loading ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Analysing…</>
            ) : pricing ? (
              <><RefreshCw className="h-4 w-4" /> Re-run Pricing</>
            ) : (
              <><BarChart3 className="h-4 w-4" /> Run Pricing Analysis</>
            )}
          </Button>
        </div>
      </div>

      {/* ─ Error banner ──────────────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex gap-3 items-center text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════ FULL PRICING RESULT ══════════════════════════════════ */}
      {pricing ? (
        <>
          {/* L1 / L2 / L3 ranking cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {totalCosts.slice(0, 3).map((tc) => (
              <Card
                key={tc.supplier_name}
                className={tc.rank === 1 ? "border-green-500 bg-green-50/40" : ""}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center
                      text-white font-bold text-sm shrink-0
                      ${ tc.rank === 1 ? "bg-green-600"
                       : tc.rank === 2 ? "bg-blue-500"
                       : "bg-slate-400" }`}
                  >
                    L{tc.rank}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{tc.supplier_name}</p>
                    <p className="text-sm text-muted-foreground">
                      ${tc.total_cost.toLocaleString(undefined, {
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tc.line_item_count} line items
                    </p>
                  </div>
                  {tc.rank === 1 && (
                    <Trophy className="h-5 w-5 text-green-600 ml-auto shrink-0" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Award recommendation banner */}
          {award && (
            <Card className="bg-blue-50/50 border-blue-200">
              <CardContent className="p-4 flex gap-4 items-start">
                <CheckCircle2 className="h-6 w-6 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-blue-900">
                    Recommended: {award.recommended_strategy}
                  </p>
                  <p className="text-sm text-blue-700 mt-0.5">
                    Total ${
                      award.recommended_total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })
                    }{" · "}
                    Saves ${
                      award.savings_opportunity.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })
                    } vs worst strategy
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {award.rationale.map((r, i) => (
                      <li key={i} className="text-xs text-blue-700">• {r}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab bar */}
          <div className="flex gap-0 border-b">
            {(["matrix", "bob", "award"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "matrix" ? "Price Matrix"
                  : tab === "bob" ? "Best of Best"
                  : "All Strategies"}
              </button>
            ))}
          </div>

          {/* ─ Tab: Price Matrix ──────────────────────────────────────────────────── */}
          {activeTab === "matrix" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Full Price Matrix</CardTitle>
                <CardDescription>
                  Unit price per line item per supplier. Green cell = lowest quoted price.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 pr-4 font-semibold text-muted-foreground pl-2">
                          Line Item
                        </th>
                        <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">
                          Category
                        </th>
                        {matrixSuppliers.map((s) => (
                          <th
                            key={s}
                            className="text-right py-2 px-3 font-semibold"
                          >
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(descriptions as string[]).map((desc) => {
                        const row = matrix[desc] ?? {};
                        const prices = matrixSuppliers
                          .map((s) => row[s]?.unit_price ?? null)
                          .filter((p): p is number => p !== null && p > 0);
                        const minPrice = prices.length ? Math.min(...prices) : null;
                        const category =
                          Object.values(row).find((v) => v?.category)?.category ?? "—";
                        return (
                          <tr
                            key={desc}
                            className="border-b last:border-0 hover:bg-muted/20"
                          >
                            <td
                              className="py-2 pr-4 pl-2 font-medium max-w-xs truncate"
                              title={desc}
                            >
                              {desc}
                            </td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground">
                              {category}
                            </td>
                            {matrixSuppliers.map((s) => {
                              const val   = row[s];
                              const isMin = val && minPrice !== null && val.unit_price === minPrice;
                              return (
                                <td
                                  key={s}
                                  className={`py-2 px-3 text-right font-mono text-xs ${
                                    isMin
                                      ? "text-green-700 bg-green-50 font-semibold"
                                      : ""
                                  }`}
                                >
                                  {val ? (
                                    `$${val.unit_price.toLocaleString(undefined, {
                                      minimumFractionDigits: 4,
                                      maximumFractionDigits: 4,
                                    })}`
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─ Tab: Best of Best ───────────────────────────────────────────────────── */}
          {activeTab === "bob" && bob && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best of Best</CardTitle>
                <CardDescription>
                  Theoretical minimum — cheapest supplier per line item from any supplier.
                  Grand total:{" "}
                  <strong>
                    ${bob.total_cost.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 pr-4 pl-2 font-semibold text-muted-foreground">
                          Line Item
                        </th>
                        <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">
                          Best Supplier
                        </th>
                        <th className="text-right py-2 pr-4 font-semibold text-muted-foreground">
                          Unit Price
                        </th>
                        <th className="text-right py-2 pr-4 font-semibold text-muted-foreground">
                          Line Total
                        </th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">
                          Saving vs Worst
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bob.breakdown.map((b) => (
                        <tr
                          key={b.description}
                          className="border-b last:border-0 hover:bg-muted/20"
                        >
                          <td
                            className="py-2 pr-4 pl-2 font-medium max-w-xs truncate"
                            title={b.description}
                          >
                            {b.description}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="secondary">{b.best_supplier}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            ${b.best_unit_price?.toLocaleString(undefined, {
                              minimumFractionDigits: 4,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs text-green-700 font-semibold">
                            ${b.best_total.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2 text-right font-mono text-xs text-orange-600">
                            {b.savings_vs_worst > 0
                              ? `$${b.savings_vs_worst.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}`
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Wins summary */}
                {bob.wins_by_supplier && (
                  <div className="mt-4 pt-3 border-t flex gap-6 flex-wrap">
                    {Object.entries(bob.wins_by_supplier).map(([s, w]) => (
                      <div key={s} className="text-sm">
                        <span className="font-semibold">{s}:</span>{" "}
                        <span className="text-muted-foreground">{w} line item wins</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─ Tab: All Strategies ─────────────────────────────────────────────────── */}
          {activeTab === "award" && award && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strategy Comparison</CardTitle>
                <CardDescription>
                  All award scenarios ranked by total cost
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 pl-2 font-semibold text-muted-foreground">
                          Strategy
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-muted-foreground">
                          Total Cost
                        </th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">
                          Complexity
                        </th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">
                          Risk
                        </th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">
                          Saving vs Worst
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {award.all_strategies.map((s, i) => (
                        <tr
                          key={i}
                          className={`border-b last:border-0 hover:bg-muted/20 ${
                            s.strategy === award.recommended_strategy
                              ? "bg-blue-50/60"
                              : ""
                          }`}
                        >
                          <td className="py-2.5 pr-4 pl-2 font-medium">
                            {s.strategy}
                            {s.strategy === award.recommended_strategy && (
                              <Badge className="ml-2 text-xs" variant="default">
                                Recommended
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">
                            ${s.total.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant={
                                s.complexity === "Low"
                                  ? "secondary"
                                  : s.complexity === "Very High"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {s.complexity}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant={
                                s.risk === "Low"
                                  ? "secondary"
                                  : s.risk === "High" || s.risk === "Very High"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {s.risk}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right font-mono text-xs text-green-700">
                            {s.saving_vs_worst_pct > 0
                              ? `${s.saving_vs_worst_pct.toFixed(1)}%`
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* ══════════════════ FALLBACK: simple price_comparison ═════════════════════ */
        <>
          {simplePriceRows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Quoted Prices
                </CardTitle>
                <CardDescription>
                  Basic price table from the technical analysis run.
                  Click “Run Pricing Analysis” above for full scenario modelling,
                  savings analysis, and Excel export.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 pr-4 pl-2 font-semibold text-muted-foreground">
                          Line Item
                        </th>
                        {analysisSuppliers.map((s) => (
                          <th
                            key={s}
                            className="text-right py-2 px-3 font-semibold"
                          >
                            {s}
                          </th>
                        ))}
                        <th className="text-right py-2 font-semibold text-muted-foreground">
                          Unit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {simplePriceRows.map((row) => {
                        // Highlight cheapest supplier in each row
                        const entries = Object.entries(row.suppliers)
                          .map(([k, v]) => ({
                            k,
                            n: parseFloat(v.replace(/[^0-9.]/g, "")),
                          }))
                          .filter((x) => !isNaN(x.n) && x.n > 0);
                        const minVal      = entries.length ? Math.min(...entries.map((x) => x.n)) : null;
                        const bestSupplier = entries.find((x) => x.n === minVal)?.k ?? null;
                        return (
                          <tr
                            key={row.line_item}
                            className="border-b last:border-0 hover:bg-muted/20"
                          >
                            <td className="py-2.5 pr-4 pl-2 font-medium">
                              {row.line_item}
                            </td>
                            {analysisSuppliers.map((s) => (
                              <td
                                key={s}
                                className={`py-2.5 px-3 text-right font-mono text-xs ${
                                  s === bestSupplier
                                    ? "text-green-700 bg-green-50 font-semibold"
                                    : ""
                                }`}
                              >
                                {row.suppliers[s] ?? (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            ))}
                            <td className="py-2.5 text-right text-xs text-muted-foreground">
                              {row.unit || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-14 text-center gap-3">
                <TrendingDown className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="font-semibold">No pricing data yet</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Click “Run Pricing Analysis” to extract prices from supplier
                    documents and model award scenarios.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
