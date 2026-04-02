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
}

const PricingPage: React.FC = () => {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const categories = ["All", ...Array.from(new Set(rows.map((r) => r.category)))];
  const filtered = activeCategory === "All" ? rows : rows.filter((r) => r.category === activeCategory);

  const totalSpend = rows.reduce((s, r) => s + r.total, 0);
  const avgDelta   = rows.length ? rows.reduce((s, r) => s + r.delta, 0) / rows.length : 0;
  const suppliers  = new Set(rows.map((r) => r.supplier)).size;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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

      {/* Table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-medium">Line Item Comparison</CardTitle>
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
                    {["Line Item", "Category", "UoM", "Supplier", "Unit Price", "Qty", "Total", "Δ vs Baseline"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{row.lineItem}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.unitOfMeasure}</td>
                      <td className="px-4 py-2.5">{row.supplier}</td>
                      <td className="px-4 py-2.5 tabular-nums">{fmt(row.unitPrice)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.quantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">{fmt(row.total)}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        <span className={row.delta < 0 ? "text-green-600 dark:text-green-400" : row.delta > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                          {row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
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
