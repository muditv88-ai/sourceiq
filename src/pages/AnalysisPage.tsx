import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ScoreDisplay from "@/components/ScoreDisplay";
import { analysisStore } from "@/lib/analysisStore";
import type { AnalysisResult, SupplierResult, CategoryScore } from "@/lib/types";
import {
  Trophy, TrendingUp, TrendingDown, ArrowUpDown,
  ChevronDown, ChevronUp, PlusCircle, Info,
} from "lucide-react";

export default function AnalysisPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"rank" | "score">("rank");

  useEffect(() => {
    const stored = analysisStore.getResult();
    if (stored) setResult(stored);
  }, []);

  if (!result) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-4">
        <p className="text-muted-foreground text-lg">No analysis results yet.</p>
        <Button onClick={() => navigate("/new")} className="gap-2">
          <PlusCircle className="h-4 w-4" /> Start New Evaluation
        </Button>
      </div>
    );
  }

  const suppliers = [...result.suppliers].sort((a, b) =>
    sortBy === "rank" ? a.rank - b.rank : b.overall_score - a.overall_score
  );

  const allCategories = Array.from(
    new Set(suppliers.flatMap(s => s.category_scores.map(c => c.category)))
  );

  const top = suppliers[0];

  // Score color helper
  const scoreColor = (score: number) =>
    score >= 7.5 ? "text-success font-semibold"
    : score >= 5 ? "text-warning font-semibold"
    : "text-destructive font-semibold";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Analysis</h1>
          <p className="text-muted-foreground mt-1">{result.analysis_summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setSortBy(sortBy === "rank" ? "score" : "rank")}>
            <ArrowUpDown className="h-4 w-4" />
            Sort by {sortBy === "rank" ? "Score" : "Rank"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/new")}>
            <PlusCircle className="h-4 w-4 mr-2" /> New
          </Button>
        </div>
      </div>

      {/* Top Supplier Banner */}
      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-6 flex items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center">
            <Trophy className="h-7 w-7 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">Recommended Supplier</p>
            <p className="text-xl font-bold mt-0.5">{top.supplier_name}</p>
            <p className="text-sm text-muted-foreground mt-1">{top.recommendation}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold text-success">{top.overall_score.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">out of 10</p>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comparison Matrix</CardTitle>
          <CardDescription>Weighted scores by category (0–10). Click a row to drill down.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Overall</th>
                  {allCategories.map(cat => (
                    <th key={cat} className="text-center p-3 font-medium text-muted-foreground whitespace-nowrap">{cat}</th>
                  ))}
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => {
                  const catMap = Object.fromEntries(s.category_scores.map(c => [c.category, c.weighted_score]));
                  const isExpanded = expandedSupplier === s.supplier_id;
                  return (
                    <>
                      <tr
                        key={s.supplier_id}
                        className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedSupplier(isExpanded ? null : s.supplier_id)}
                      >
                        <td className="p-3">
                          <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">#{s.rank}</span>
                        </td>
                        <td className="p-3 font-medium">{s.supplier_name}</td>
                        <td className="p-3 text-center">
                          <span className={`text-base ${scoreColor(s.overall_score)}`}>{s.overall_score.toFixed(1)}</span>
                        </td>
                        {allCategories.map(cat => (
                          <td key={cat} className={`p-3 text-center ${scoreColor(catMap[cat] ?? 0)}`}>
                            {catMap[cat] != null ? catMap[cat].toFixed(1) : "—"}
                          </td>
                        ))}
                        <td className="p-3">
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </td>
                      </tr>

                      {/* Supplier drill-down */}
                      {isExpanded && (
                        <tr key={`${s.supplier_id}-detail`}>
                          <td colSpan={allCategories.length + 4} className="bg-muted/10 p-4">
                            <div className="space-y-4">

                              {/* Strengths / Weaknesses */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                                    <TrendingUp className="h-4 w-4 text-success" /> Strengths
                                  </p>
                                  <ul className="space-y-1">
                                    {s.strengths.map(str => (
                                      <li key={str} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-success mt-0.5">•</span> {str}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                                    <TrendingDown className="h-4 w-4 text-destructive" /> Weaknesses
                                  </p>
                                  <ul className="space-y-1">
                                    {s.weaknesses.map(w => (
                                      <li key={w} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-destructive mt-0.5">•</span> {w}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              {/* Per-category question breakdown */}
                              <div>
                                <p className="text-sm font-semibold mb-2">Question-level Scores</p>
                                <div className="space-y-2">
                                  {s.category_scores.map((cat: CategoryScore) => {
                                    const catKey = `${s.supplier_id}-${cat.category}`;
                                    const catExpanded = expandedCategory === catKey;
                                    return (
                                      <div key={cat.category} className="rounded-lg border bg-background">
                                        {/* Category header */}
                                        <button
                                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                                          onClick={e => { e.stopPropagation(); setExpandedCategory(catExpanded ? null : catKey); }}
                                        >
                                          <span className="text-sm font-medium">{cat.category}</span>
                                          <div className="flex items-center gap-3">
                                            <span className={`text-sm font-bold ${scoreColor(cat.weighted_score)}`}>
                                              {cat.weighted_score.toFixed(1)} / 10
                                            </span>
                                            {catExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                          </div>
                                        </button>

                                        {/* Question rows */}
                                        {catExpanded && (
                                          <div className="border-t divide-y">
                                            {cat.questions.map(q => (
                                              <div key={q.question_id} className="px-4 py-3 space-y-1">
                                                <div className="flex items-start justify-between gap-4">
                                                  <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                      <span className="text-xs font-bold text-primary">{q.question_id}</span>
                                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                        q.question_type === "quantitative"
                                                          ? "bg-blue-100 text-blue-700"
                                                          : "bg-purple-100 text-purple-700"
                                                      }`}>
                                                        {q.question_type === "quantitative" ? "Quantitative" : "Qualitative"}
                                                      </span>
                                                      <span className="text-xs text-muted-foreground">Weight: {q.weight}%</span>
                                                    </div>
                                                    <p className="text-sm font-medium">{q.question_text}</p>
                                                  </div>
                                                  <span className={`text-base font-bold shrink-0 ${scoreColor(q.score)}`}>
                                                    {q.score.toFixed(1)}/10
                                                  </span>
                                                </div>
                                                {/* Supplier answer */}
                                                <div className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                                                  <span className="font-medium text-foreground">Answer: </span>{q.supplier_answer}
                                                </div>
                                                {/* AI rationale */}
                                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                                                  <span>{q.rationale}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Final Recommendation */}
      <Card className="border-primary/30">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-primary mb-2">📋 Final Recommendation</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.top_recommendation}</p>
        </CardContent>
      </Card>
    </div>
  );
}
