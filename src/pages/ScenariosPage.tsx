import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import ScoreDisplay from "@/components/ScoreDisplay";
import { Play, RotateCcw, ArrowLeftRight } from "lucide-react";

const defaultWeights: Record<string, number> = {
  Technical: 30,
  Pricing: 25,
  Experience: 25,
  Support: 20,
};

const suppliers = [
  { name: "Acme Solutions", scores: { Technical: 90, Pricing: 82, Experience: 88, Support: 85 } },
  { name: "GlobalTech Corp", scores: { Technical: 85, Pricing: 78, Experience: 72, Support: 80 } },
  { name: "NovaBridge Inc", scores: { Technical: 70, Pricing: 90, Experience: 60, Support: 68 } },
  { name: "Pinnacle Services", scores: { Technical: 60, Pricing: 75, Experience: 65, Support: 62 } },
];

function calcOverall(scores: Record<string, number>, weights: Record<string, number>) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.entries(weights).reduce((sum, [cat, w]) => sum + (scores[cat] || 0) * (w / totalWeight), 0);
}

export default function ScenariosPage() {
  const [weights, setWeights] = useState(defaultWeights);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<Record<string, number> | null>(null);

  const activeSuppliers = suppliers.filter((s) => !excluded.has(s.name));
  const ranked = activeSuppliers
    .map((s) => ({ ...s, overall: calcOverall(s.scores, weights) }))
    .sort((a, b) => b.overall - a.overall);

  const handleReset = () => {
    setWeights(defaultWeights);
    setExcluded(new Set());
    setBaseline(null);
  };

  const handleSnapshot = () => {
    const snap: Record<string, number> = {};
    ranked.forEach((s) => (snap[s.name] = s.overall));
    setBaseline(snap);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scenario Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Adjust weights and exclusions to explore what-if scenarios
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleSnapshot}>
            <ArrowLeftRight className="h-4 w-4" /> Snapshot Baseline
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category Weights</CardTitle>
              <CardDescription>Adjust importance of each criterion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(weights).map(([category, weight]) => (
                <div key={category} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="text-muted-foreground font-mono">{weight}%</span>
                  </div>
                  <Slider
                    value={[weight]}
                    onValueChange={([v]) => setWeights((prev) => ({ ...prev, [category]: v }))}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Total: {Object.values(weights).reduce((a, b) => a + b, 0)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exclude Suppliers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suppliers.map((s) => (
                <label key={s.name} className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={excluded.has(s.name)}
                    onCheckedChange={(checked) => {
                      const next = new Set(excluded);
                      checked ? next.add(s.name) : next.delete(s.name);
                      setExcluded(next);
                    }}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scenario Results</CardTitle>
              <CardDescription>
                Rankings based on current weight configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ranked.map((s, i) => {
                  const diff = baseline ? s.overall - (baseline[s.name] || 0) : null;
                  return (
                    <div
                      key={s.name}
                      className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                        #{i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{s.name}</p>
                        <div className="flex gap-3 mt-1">
                          {Object.entries(s.scores).map(([cat, score]) => (
                            <span key={cat} className="text-xs text-muted-foreground">
                              {cat}: <span className="font-mono">{score}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {diff !== null && diff !== 0 && (
                          <span
                            className={`text-xs font-medium ${
                              diff > 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(1)}
                          </span>
                        )}
                        <ScoreDisplay score={s.overall} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Weight Distribution Bar */}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Weight Distribution</p>
              <div className="flex h-4 rounded-full overflow-hidden">
                {Object.entries(weights).map(([cat, w], i) => {
                  const total = Object.values(weights).reduce((a, b) => a + b, 0);
                  const colors = [
                    "bg-primary",
                    "bg-accent",
                    "bg-warning",
                    "bg-info",
                  ];
                  return (
                    <div
                      key={cat}
                      className={`${colors[i % colors.length]} transition-all`}
                      style={{ width: `${(w / total) * 100}%` }}
                      title={`${cat}: ${w}%`}
                    />
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2">
                {Object.entries(weights).map(([cat, w], i) => {
                  const dots = ["bg-primary", "bg-accent", "bg-warning", "bg-info"];
                  return (
                    <span key={cat} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${dots[i % dots.length]}`} />
                      {cat}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
