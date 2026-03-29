import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ScoreDisplay from "@/components/ScoreDisplay";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Supplier } from "@/lib/types";

// Demo data
const demoSuppliers: Supplier[] = [
  {
    name: "Acme Solutions",
    overall_score: 87,
    category_scores: { Technical: 90, Pricing: 82, Experience: 88, Support: 85 },
    strengths: ["Strong technical capabilities", "Proven track record", "24/7 support"],
    weaknesses: ["Higher pricing tier"],
    rank: 1,
  },
  {
    name: "GlobalTech Corp",
    overall_score: 79,
    category_scores: { Technical: 85, Pricing: 78, Experience: 72, Support: 80 },
    strengths: ["Competitive pricing", "Global presence"],
    weaknesses: ["Limited local support", "Fewer references"],
    rank: 2,
  },
  {
    name: "NovaBridge Inc",
    overall_score: 72,
    category_scores: { Technical: 70, Pricing: 90, Experience: 60, Support: 68 },
    strengths: ["Best pricing", "Flexible contracts"],
    weaknesses: ["Newer to market", "Smaller team", "Limited certifications"],
    rank: 3,
  },
  {
    name: "Pinnacle Services",
    overall_score: 65,
    category_scores: { Technical: 60, Pricing: 75, Experience: 65, Support: 62 },
    strengths: ["Good pricing", "Local presence"],
    weaknesses: ["Technical gaps", "Limited scalability"],
    rank: 4,
  },
];

const demoInsights = [
  "Acme Solutions leads with a 87/100 overall score, excelling in Technical (90) and Experience (88).",
  "NovaBridge offers the best pricing but has the lowest Experience score — consider requesting case studies.",
  "All suppliers meet minimum technical requirements. Key differentiators are support quality and pricing.",
  "Gap analysis reveals no supplier covers IoT integration — consider adding to clarification requests.",
];

const demoRecommendation =
  "Based on the weighted evaluation, Acme Solutions is the recommended vendor. While their pricing is 12% above average, their superior technical capabilities and support infrastructure justify the premium. Consider negotiating volume discounts with Acme while keeping GlobalTech as an alternative.";

export default function AnalysisPage() {
  const [sortBy, setSortBy] = useState<"rank" | "score">("rank");
  const [expanded, setExpanded] = useState<string | null>(null);
  const suppliers = demoSuppliers;
  const categories = Object.keys(suppliers[0]?.category_scores || {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Comparative evaluation of {suppliers.length} suppliers
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setSortBy(sortBy === "rank" ? "score" : "rank")}>
          <ArrowUpDown className="h-4 w-4" />
          Sort by {sortBy === "rank" ? "Score" : "Rank"}
        </Button>
      </div>

      {/* Top Supplier Card */}
      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-6 flex items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center">
            <Trophy className="h-7 w-7 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">Recommended Supplier</p>
            <p className="text-xl font-bold mt-0.5">{suppliers[0].name}</p>
            <p className="text-sm text-muted-foreground mt-1">{demoRecommendation.slice(0, 120)}...</p>
          </div>
          <ScoreDisplay score={suppliers[0].overall_score} size="lg" />
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comparison Matrix</CardTitle>
          <CardDescription>Scores across all evaluation categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Overall</th>
                  {categories.map((cat) => (
                    <th key={cat} className="text-center p-3 font-medium text-muted-foreground">
                      {cat}
                    </th>
                  ))}
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <>
                    <tr
                      key={s.name}
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === s.name ? null : s.name)}
                    >
                      <td className="p-3">
                        <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                          #{s.rank}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-center">
                        <ScoreDisplay score={s.overall_score} size="sm" showLabel={false} />
                      </td>
                      {categories.map((cat) => {
                        const score = s.category_scores[cat];
                        const cls =
                          score >= 80
                            ? "text-success font-semibold"
                            : score >= 65
                            ? "text-warning font-semibold"
                            : "text-destructive font-semibold";
                        return (
                          <td key={cat} className={`p-3 text-center ${cls}`}>
                            {score}
                          </td>
                        );
                      })}
                      <td className="p-3">
                        {expanded === s.name ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                    {expanded === s.name && (
                      <tr key={`${s.name}-detail`} className="bg-muted/20">
                        <td colSpan={categories.length + 4} className="p-4">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2 mb-2">
                                <TrendingUp className="h-4 w-4 text-success" /> Strengths
                              </p>
                              <ul className="space-y-1">
                                {s.strengths.map((str) => (
                                  <li key={str} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-success mt-1">•</span> {str}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2 mb-2">
                                <TrendingDown className="h-4 w-4 text-destructive" /> Weaknesses
                              </p>
                              <ul className="space-y-1">
                                {s.weaknesses.map((w) => (
                                  <li key={w} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-destructive mt-1">•</span> {w}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-warning" /> AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {demoInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="h-5 w-5 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{insight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Recommendation */}
      <Card className="border-primary/30">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-primary mb-2">📋 Final Recommendation</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{demoRecommendation}</p>
        </CardContent>
      </Card>
    </div>
  );
}
