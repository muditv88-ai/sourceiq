/**
 * PricingPage — Reads price_comparison from the analysis result stored in analysisStore.
 * No separate pricing job needed — pricing is already extracted during the main analysis run.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analysisStore } from "@/lib/analysisStore";
import {
  DollarSign, TrendingDown, AlertCircle, Download, BarChart3, ArrowRight,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";

type PriceRow = {
  line_item: string;
  suppliers: Record<string, string>;
  unit?: string;
};

function getSupplierNames(result: AnalysisResult): string[] {
  return result.suppliers?.map((s) => s.supplier_name) ?? [];
}

function bestValue(row: PriceRow, supplierNames: string[]): string | null {
  let best: number | null = null;
  let bestName: string | null = null;
  for (const name of supplierNames) {
    const raw = row.suppliers[name];
    if (!raw) continue;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && (best === null || num < best)) {
      best = num;
      bestName = name;
    }
  }
  return bestName;
}

export default function PricingPage() {
  const navigate = useNavigate();
  const result = analysisStore.getResult();

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pricing Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Price data is extracted automatically during the analysis run.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center gap-4">
            <DollarSign className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">No analysis result yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload supplier responses and run analysis first to see pricing data here.
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

  const supplierNames = getSupplierNames(result);
  const priceRows: PriceRow[] = (result as any).price_comparison ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pricing Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Price comparison extracted from supplier response documents
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Suppliers</p>
            <p className="text-2xl font-bold mt-1">{supplierNames.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Line Items</p>
            <p className="text-2xl font-bold mt-1">{priceRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Top Scorer</p>
            <p className="text-lg font-bold mt-1 truncate">
              {result.suppliers?.[0]?.supplier_name ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {priceRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center gap-3">
            <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-semibold">No pricing data found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The AI could not extract pricing lines from the supplier responses.
                Ensure the response files contain price, cost, rate or fee data.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Price Comparison Table
            </CardTitle>
            <CardDescription>
              Green cell = lowest quoted value for that line item
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Line Item</th>
                    {supplierNames.map(n => (
                      <th key={n} className="text-right py-2 px-3 font-semibold">{n}</th>
                    ))}
                    <th className="text-right py-2 pl-3 font-semibold text-muted-foreground">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {priceRows.map((row) => {
                    const best = bestValue(row, supplierNames);
                    return (
                      <tr key={row.line_item} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-4 font-medium">{row.line_item}</td>
                        {supplierNames.map(n => (
                          <td key={n}
                            className={`py-2.5 px-3 text-right font-mono ${
                              n === best ? "text-green-700 bg-green-50 font-semibold" : ""
                            }`}>
                            {row.suppliers[n] ?? <span className="text-muted-foreground/50">—</span>}
                          </td>
                        ))}
                        <td className="py-2.5 pl-3 text-right text-muted-foreground text-xs">{row.unit || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-supplier pricing scores */}
      {result.suppliers && result.suppliers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Commercial Scores</h2>
          {result.suppliers.map(s => (
            <Card key={s.supplier_name}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{s.supplier_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rank #{s.rank ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{s.commercial_score ?? s.overall_score ?? 0}%</p>
                  <p className="text-xs text-muted-foreground">commercial score</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
