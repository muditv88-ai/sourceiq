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
  delta: number; // % vs lowest bid
}

const MOCK_ROWS: PriceRow[] = [
  { id: "1", lineItem: "Structural Steel (Grade 250)", category: "Materials", unitOfMeasure: "tonne", supplier: "SteelCo", unitPrice: 1240, quantity: 80, total: 99200, delta: 0 },
  { id: "2", lineItem: "Structural Steel (Grade 250)", category: "Materials", unitOfMeasure: "tonne", supplier: "MetalWorks", unitPrice: 1310, quantity: 80, total: 104800, delta: 5.6 },
  { id: "3", lineItem: "Concrete Ready Mix 32 MPa", category: "Materials", unitOfMeasure: "m³", supplier: "BuildSupply", unitPrice: 185, quantity: 420, total: 77700, delta: 0 },
  { id: "4", lineItem: "Concrete Ready Mix 32 MPa", category: "Materials", unitOfMeasure: "m³", supplier: "ConcreteNow", unitPrice: 198, quantity: 420, total: 83160, delta: 7.0 },
  { id: "5", lineItem: "Labour – Formwork", category: "Labour", unitOfMeasure: "hr", supplier: "TradeForce", unitPrice: 72, quantity: 600, total: 43200, delta: 0 },
  { id: "6", lineItem: "Labour – Formwork", category: "Labour", unitOfMeasure: "hr", supplier: "SiteCrew", unitPrice: 78, quantity: 600, total: 46800, delta: 8.3 },
];

const PricingPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const categories = ["All", ...Array.from(new Set(MOCK_ROWS.map((r) => r.category)))];

  const filtered =
    activeCategory === "All" ? MOCK_ROWS : MOCK_ROWS.filter((r) => r.category === activeCategory);

  const totalLowest = MOCK_ROWS.filter((r) => r.delta === 0).reduce((sum, r) => sum + r.total, 0);
  const totalHighest = MOCK_ROWS.reduce((sum, r) => sum + r.total, 0) - totalLowest;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pricing Analysis</h1>
          <p className="text-sm text-muted-foreground">Compare supplier line-item pricing and identify savings opportunities.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Lowest-Bid Total
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">{fmt(totalLowest)}</p>
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
              {fmt(totalHighest)}
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
            <p className="text-2xl font-semibold tabular-nums">{MOCK_ROWS.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upload ingest */}
      <SupplierPricingIngest />

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Price comparison table */}
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
                        <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 text-xs">
                          Lowest
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          +{row.delta.toFixed(1)}%
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PricingPage;
