import React, { useState } from "react";
import { DollarSign, TrendingDown, BarChart2, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SupplierPricingIngest from "@/components/SupplierPricingIngest";

interface PriceRow {
  id: string;
  lineItem: string;
  category: string;
  unitOfMeasure: string;
  supplier: string;
  unitPrice: number;
  quantity: number;
  total: number;
  delta: number;
  currency?: string;
}

const PricingPage: React.FC = () => {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const categories = ["All", ...Array.from(new Set(rows.map((r) => r.category)))];
  const filtered = activeCategory === "All" ? rows : rows.filter((r) => r.category === activeCategory);

  const totalSpend = rows.reduce((s, r) => s + r.total, 0);
  const avgDelta   = rows.length ? rows.reduce((s, r) => s + r.delta, 0) / rows.length : 0;
  const suppliers  = new Set(rows.map((r) => r.supplier)).size;

  // Auto-detect currency from data, default to USD
  const currency = rows[0]?.currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

  const handleCommit = (newRows: Record<string, unknown>[]) => {
    setRows((prev) => {
      const merged = [...prev];
      for (const raw of newRows) {
        const row = raw as PriceRow;
        const idx = merged.findIndex(
          (r) => r.lineItem === row.lineItem && r.supplier === row.supplier
        );
        if (idx >= 0) merged[idx] = row;
        else merged.push(row);
      }
      return merged;
    });
  };

  // Pivot data for comparison table
  const supplierList = [...new Set(filtered.map((r) => r.supplier))].sort();
  const lineItems    = [...new Set(filtered.map((r) => r.lineItem))];

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pricing Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload supplier sheets to compare bids and identify savings.
          </p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </div>

      {/* KPI Strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Total Quoted Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{fmt(totalSpend)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" /> Avg. Price Delta vs Baseline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold tabular-nums ${avgDelta < 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {avgDelta > 0 ? "+" : ""}{avgDelta.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" /> Suppliers Compared
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{suppliers}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Panel */}
      <SupplierPricingIngest projectId="unassigned" onCommit={handleCommit} />

      {/* Supplier Bid Comparison Table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-medium">Supplier Bid Comparison</CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant={activeCategory === cat ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/40 z-10">
                      Line Item
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Category
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      UoM
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Qty
                    </th>
                    {supplierList.map((s) => (
                      <th
                        key={s}
                        className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {s}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Best Bid
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Savings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((lineItem) => {
                    const itemRows   = filtered.filter((r) => r.lineItem === lineItem);
                    const ref        = itemRows[0];
                    const priceMap   = Object.fromEntries(itemRows.map((r) => [r.supplier, r.unitPrice]));
                    const prices     = Object.values(priceMap).filter((p) => p != null) as number[];
                    const bestPrice  = prices.length ? Math.min(...prices) : null;
                    const worstPrice = prices.length ? Math.max(...prices) : null;
                    const savings    =
                      bestPrice != null && worstPrice != null && worstPrice !== bestPrice
                        ? ((worstPrice - bestPrice) / worstPrice) * 100
                        : 0;

                    return (
                      <tr
                        key={lineItem}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        {/* Line Item */}
                        <td className="px-4 py-2.5 font-medium sticky left-0 bg-background z-10 whitespace-nowrap">
                          {lineItem}
                        </td>
                        {/* Category */}
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {ref?.category ?? "—"}
                        </td>
                        {/* UoM */}
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {ref?.unitOfMeasure ?? "—"}
                        </td>
                        {/* Qty */}
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                          {ref?.quantity != null ? ref.quantity.toLocaleString() : "—"}
                        </td>
                        {/* One column per supplier */}
                        {supplierList.map((s) => {
                          const price   = priceMap[s] ?? null;
                          const isBest  = price != null && price === bestPrice  && prices.length > 1;
                          const isWorst = price != null && price === worstPrice && prices.length > 1;
                          return (
                            <td
                              key={s}
                              className={`px-4 py-2.5 tabular-nums text-right font-medium ${
                                isBest
                                  ? "text-green-600 dark:text-green-400"
                                  : isWorst
                                  ? "text-red-600 dark:text-red-400"
                                  : ""
                              }`}
                            >
                              {price != null ? (
                                fmt(price)
                              ) : (
                                <span className="text-muted-foreground/40 text-xs italic">—</span>
                              )}
                            </td>
                          );
                        })}
                        {/* Best Bid */}
                        <td className="px-4 py-2.5 tabular-nums text-right font-semibold text-green-600 dark:text-green-400">
                          {bestPrice != null ? fmt(bestPrice) : "—"}
                        </td>
                        {/* Savings % */}
                        <td className="px-4 py-2.5 tabular-nums text-right">
                          {savings > 0 ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {savings.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PricingPage;