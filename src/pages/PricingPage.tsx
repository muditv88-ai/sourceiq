import React, { useState, useEffect } from "react";
import { DollarSign, TrendingDown, BarChart2, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SupplierPricingIngest from "@/components/SupplierPricingIngest";
import { pricingStore } from "@/lib/pricingStore";

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
}

const PricingPage: React.FC = () => {
  const [rows, setRows]                 = useState<PriceRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");

  // Poll store every 2s so the table refreshes after ingest confirms
  useEffect(() => {
    const sync = () => {
      const result = pricingStore.getResult();
      if (result?.rows) setRows(result.rows);
    };
    sync();
    const id = setInterval(sync, 2000);
    return () => clearInterval(id);
  }, []);

  const categories = ["All", ...Array.from(new Set(rows.map((r) => r.category)))];
  const filtered   = activeCategory === "All" ? rows : rows.filter((r) => r.category === activeCategory);

  const totalLowest  = rows.filter((r) => r.delta === 0).reduce((sum, r) => sum + r.total, 0);
  const totalSavings = rows.filter((r) => r.delta > 0).reduce((sum, r) => sum + (r.total - r.unitPrice * r.quantity / (1 + r.delta / 100)), 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pricing Analysis</h1>
          <p className="text-sm text-muted-foreground">Compare supplier line-item pricing and identify savings opportunities.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Lowest-Bid Total
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">{rows.length ? fmt(totalLowest) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> Potential Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400">
              {rows.length ? fmt(totalSavings) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" /> Line Items
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">{rows.length || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <SupplierPricingIngest onCommit={() => {
        const result = pricingStore.getResult();
        if (result?.rows) setRows(result.rows);
      }} />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No pricing data yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Upload a supplier pricing sheet above. After confirming, the table will populate automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {categories.map((cat) => (
              <Button key={cat} variant={activeCategory === cat ? "default" : "outline"} size="sm"
                onClick={() => setActiveCategory(cat)}>{cat}</Button>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Line Item</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Supplier</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Unit Price</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">vs Lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{row.lineItem}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                        <td className="px-4 py-3">{row.supplier}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmt(row.unitPrice)}<span className="text-muted-foreground text-xs"> /{row.unitOfMeasure}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(row.total)}</td>
                        <td className="px-4 py-3 text-center">
                          {row.delta === 0 ? (
                            <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 text-xs">Lowest</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">+{row.delta.toFixed(1)}%</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default PricingPage;
