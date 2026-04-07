import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import {
  FlaskConical, FolderOpen, ChevronRight, Loader2, Plus,
  Trophy, ShieldAlert, CheckCircle2, AlertCircle, XCircle,
  BarChart3, Save, Award, Scale, Zap, TrendingDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RankedSupplier {
  name: string;
  overall_score: number;
  category_scores: Record<string, number>;
  rank: number;
}

interface SavedScenario {
  scenario_id: string;
  name?: string;
  created_at?: string;
  weights?: Record<string, number>;
  ranked_suppliers?: RankedSupplier[];
  notes?: string[];
}

interface RiskItem {
  supplier: string;
  risk_level: "low" | "medium" | "high";
  factors: string[];
}

// ── Pre-built templates (FM-8.1) ──────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "best-value",
    label: "Best Value",
    icon: Scale,
    description: "Balanced across all criteria",
    weights: { Technical: 30, Pricing: 35, Experience: 20, Support: 15 },
  },
  {
    id: "lowest-cost",
    label: "Lowest Cost",
    icon: TrendingDown,
    description: "Price-dominant evaluation",
    weights: { Technical: 15, Pricing: 60, Experience: 15, Support: 10 },
  },
  {
    id: "technical-leader",
    label: "Technical Leader",
    icon: Zap,
    description: "Prioritise technical capability",
    weights: { Technical: 55, Pricing: 20, Experience: 15, Support: 10 },
  },
  {
    id: "risk-averse",
    label: "Risk Averse",
    icon: ShieldAlert,
    description: "Experience & support heavy",
    weights: { Technical: 25, Pricing: 20, Experience: 35, Support: 20 },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = {
  low: "text-green-600 bg-green-50 border-green-200",
  medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
  high: "text-red-600 bg-red-50 border-red-200",
};

const RISK_ICON: Record<string, JSX.Element> = {
  low: <CheckCircle2 className="h-3.5 w-3.5" />,
  medium: <AlertCircle className="h-3.5 w-3.5" />,
  high: <XCircle className="h-3.5 w-3.5" />,
};

function weightTotal(w: Record<string, number>) {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScenariosPage() {
  // ── Project picker ──────────────────────────────────────────────────────────
  const [projects, setProjects]           = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState("");

  // ── Suppliers (for exclusion) ───────────────────────────────────────────────
  const [suppliers, setSuppliers]         = useState<string[]>([]);
  const [excluded, setExcluded]           = useState<Set<string>>(new Set());

  // ── Weights (FM-8.2) ────────────────────────────────────────────────────────
  const [weights, setWeights]             = useState({ Technical: 30, Pricing: 35, Experience: 20, Support: 15 });
  const [scenarioName, setScenarioName]   = useState("");

  // ── Running ─────────────────────────────────────────────────────────────────
  const [running, setRunning]             = useState(false);
  const [runError, setRunError]           = useState("");
  const [result, setResult]               = useState<{ ranked_suppliers: RankedSupplier[]; notes: string[]; scenario_id: string } | null>(null);

  // ── Saved scenarios (FM-8.3) ────────────────────────────────────────────────
  const [saved, setSaved]                 = useState<SavedScenario[]>([]);
  const [loadingSaved, setLoadingSaved]   = useState(false);
  const [compareBase, setCompareBase]     = useState<string | null>(null);

  // ── Risk assessment (FM-8.5) ────────────────────────────────────────────────
  const [risks, setRisks]                 = useState<RiskItem[]>([]);
  const [loadingRisk, setLoadingRisk]     = useState(false);
  const [riskError, setRiskError]         = useState("");

  // ── Award workflow (FM-8.6) ─────────────────────────────────────────────────
  const [awardStatus, setAwardStatus]     = useState<any>(null);
  const [awarding, setAwarding]           = useState(false);
  const [awardJustification, setAwardJustification] = useState("");
  const [awardError, setAwardError]       = useState("");

  // ── Load projects ───────────────────────────────────────────────────────────
  useEffect(() => {
    api.listProjects()
      .then(r => setProjects((r.projects ?? []).map(p => ({ id: (p as any).project_id || p.id, name: p.name }))))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, []);

  // ── On project selected: load suppliers, saved scenarios, award status ──────
  useEffect(() => {
    if (!selectedProject) return;

    api.listSuppliers()
      .then(r => setSuppliers((r.suppliers ?? []).map((s: any) => s.name)))
      .catch(() => {});

    setLoadingSaved(true);
    api.listScenarios(selectedProject)
      .then(r => setSaved(r.scenarios ?? []))
      .catch(() => setSaved([]))
      .finally(() => setLoadingSaved(false));

    api.getAwardStatus(selectedProject)
      .then(r => setAwardStatus(r))
      .catch(() => setAwardStatus(null));
  }, [selectedProject]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function applyTemplate(tpl: typeof TEMPLATES[number]) {
    setWeights({ ...tpl.weights });
    setScenarioName(tpl.label);
  }

  function toggleExclude(name: string) {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function runScenario() {
    if (!selectedProject) return;
    setRunning(true); setRunError(""); setResult(null);
    try {
      // Normalize weights from 0-100 to 0-1 format
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      const normalizedWeights: Record<string, number> = {};
      for (const [k, v] of Object.entries(weights)) {
        normalizedWeights[k] = total > 0 ? v / total : 0;
      }

      const res = await api.createScenario({
        project_id: selectedProject,
        weights: normalizedWeights,
        excluded_suppliers: Array.from(excluded),
        title: scenarioName || undefined,
      });
      setResult(res);
      api.listScenarios(selectedProject).then(r => setSaved(r.scenarios ?? [])).catch(() => {});
    } catch (e: any) {
      setRunError(e?.message ?? "Scenario run failed.");
    } finally { setRunning(false); }
  }

  async function runRiskAssessment() {
    if (!selectedProject) return;
    setLoadingRisk(true); setRiskError("");
    try {
      const res = await api.riskAssessment({ project_id: selectedProject, scenario_id: result?.scenario_id });
      setRisks(res.risks ?? []);
    } catch (e: any) {
      setRiskError(e?.message ?? "Risk assessment failed.");
    } finally { setLoadingRisk(false); }
  }

  async function recommendAward() {
    if (!selectedProject) return;
    setAwarding(true); setAwardError("");
    try {
      const res = await api.recommendAward({ project_id: selectedProject, justification: awardJustification || undefined });
      setAwardStatus({ ...res, status: "recommended" });
    } catch (e: any) {
      setAwardError(e?.message ?? "Award recommendation failed.");
    } finally { setAwarding(false); }
  }

  const total = weightTotal(weights);
  const baseScenario = compareBase ? saved.find(s => s.scenario_id === compareBase) : null;

  // ── Project picker screen ────────────────────────────────────────────────────
  if (!selectedProject) {
    return (
      <div className="max-w-xl mx-auto mt-16 space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Scenario Planner</h1>
          <p className="text-muted-foreground text-sm">Model award outcomes under different weighting strategies.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Select Project</CardTitle></CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No projects found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProject(p.id)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors flex items-center justify-between group">
                    <span className="font-medium text-sm">{p.name}</span>
                    <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const projectName = projects.find(p => p.id === selectedProject)?.name ?? selectedProject;

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scenario Planner</h1>
          <p className="text-muted-foreground mt-1 text-sm">{projectName}</p>
        </div>
        <button onClick={() => setSelectedProject("")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Change project
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT COLUMN: Config ───────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* FM-8.1 Templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Templates</CardTitle>
              <CardDescription className="text-xs">Start from a pre-built weighting strategy</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(tpl => {
                const Icon = tpl.icon;
                return (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                    className="flex flex-col items-start gap-1 p-3 rounded-lg border hover:bg-muted hover:border-primary/30 transition-colors text-left">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">{tpl.label}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{tpl.description}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* FM-8.2 Weight sliders */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Scoring Weights</CardTitle>
                <span className={`text-xs font-semibold tabular-nums ${total === 100 ? "text-green-600" : "text-destructive"}`}>
                  {total}%
                </span>
              </div>
              {total !== 100 && (
                <p className="text-xs text-destructive">Weights must sum to 100%</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(weights).map(([cat, val]) => (
                <div key={cat} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{cat}</span>
                    <span className="tabular-nums text-muted-foreground">{val}%</span>
                  </div>
                  <Slider value={[val]} min={0} max={100} step={5}
                    onValueChange={([v]) => setWeights(prev => ({ ...prev, [cat]: v }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* FM-8.4 Supplier exclusions */}
          {suppliers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Exclude Suppliers</CardTitle>
                <CardDescription className="text-xs">Remove from this scenario's ranking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {suppliers.map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
                    <input type="checkbox" checked={excluded.has(s)} onChange={() => toggleExclude(s)}
                      className="rounded border-border" />
                    <span className={excluded.has(s) ? "line-through text-muted-foreground" : ""}>{s}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Scenario name + Run */}
          <div className="space-y-2">
            <Input placeholder="Scenario name (optional)" value={scenarioName}
              onChange={e => setScenarioName(e.target.value)} className="text-sm" />
            <Button className="w-full gap-2" onClick={runScenario}
              disabled={running || total !== 100}>
              {running
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                : <><Plus className="h-4 w-4" /> Run Scenario</>}
            </Button>
            {runError && (
              <div className="flex items-center gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{runError}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Results ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Current scenario result */}
          {result && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    {scenarioName || "Scenario Result"}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{result.ranked_suppliers.length} suppliers</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.ranked_suppliers.map(s => {
                  const baseSup = baseScenario?.ranked_suppliers?.find(b => b.name === s.name);
                  const delta = baseSup ? s.overall_score - baseSup.overall_score : null;
                  return (
                    <div key={s.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors
                        ${s.rank === 1 ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                        ${s.rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {s.rank === 1 ? <Trophy className="h-3.5 w-3.5" /> : s.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{s.name}</span>
                          {delta !== null && (
                            <span className={`text-xs font-medium ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} vs base
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 flex-wrap mt-1">
                          {Object.entries(s.category_scores).map(([cat, sc]) => (
                            <span key={cat} className="text-xs text-muted-foreground">
                              {cat}: <span className="font-medium tabular-nums text-foreground">{sc.toFixed(1)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold tabular-nums">{s.overall_score.toFixed(1)}</div>
                        <div className="text-xs text-muted-foreground">overall</div>
                      </div>
                    </div>
                  );
                })}
                {result.notes.length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    {result.notes.map((n, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">- </span>{n}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* FM-8.3 Saved scenario comparison */}
          {(loadingSaved || saved.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Save className="h-4 w-4" /> Saved Scenarios
                  </CardTitle>
                  {saved.length > 0 && (
                    <span className="text-xs text-muted-foreground">Set one as baseline to see deltas above</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingSaved ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : saved.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved scenarios yet. Run one above to save it.</p>
                ) : (
                  <div className="space-y-2">
                    {saved.map(s => (
                      <div key={s.scenario_id}
                        className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-colors
                          ${compareBase === s.scenario_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                        <div>
                          <div className="font-medium">{s.name ?? s.scenario_id.slice(0, 12) + "…"}</div>
                          {s.created_at && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setCompareBase(compareBase === s.scenario_id ? null : s.scenario_id)}
                          className={`text-xs px-2 py-1 rounded border transition-colors
                            ${compareBase === s.scenario_id
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary/40 hover:bg-muted"}`}>
                          {compareBase === s.scenario_id ? "Baseline ✓" : "Set Baseline"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* FM-8.5 Risk Assessment */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-600" /> Risk Assessment
                </CardTitle>
                <Button size="sm" variant="outline" onClick={runRiskAssessment} disabled={loadingRisk || !selectedProject}>
                  {loadingRisk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Assessment"}
                </Button>
              </div>
              <CardDescription className="text-xs">AI-generated supplier risk factors for this project</CardDescription>
            </CardHeader>
            <CardContent>
              {riskError && (
                <div className="flex items-center gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded mb-3">
                  <AlertCircle className="h-3.5 w-3.5" />{riskError}
                </div>
              )}
              {risks.length === 0 && !loadingRisk && (
                <p className="text-sm text-muted-foreground">Click "Run Assessment" to evaluate supplier risks.</p>
              )}
              {loadingRisk && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analysing risks…
                </div>
              )}
              <div className="space-y-3">
                {risks.map(r => (
                  <div key={r.supplier} className={`p-3 rounded-lg border text-sm ${RISK_COLOR[r.risk_level] ?? ""}`}>
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      {RISK_ICON[r.risk_level]}
                      {r.supplier}
                      <Badge variant="outline" className="text-xs capitalize ml-auto">{r.risk_level}</Badge>
                    </div>
                    <ul className="space-y-0.5 pl-1">
                      {r.factors.map((f, i) => (
                        <li key={i} className="text-xs opacity-90 flex items-start gap-1">
                          <span className="mt-0.5 opacity-60">- </span>{f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* FM-8.6 Award Approval Workflow */}
          <Card className={awardStatus?.status === "approved" ? "border-green-400" : "border-primary/30"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Award Recommendation
              </CardTitle>
              <CardDescription className="text-xs">Generate and submit AI-backed award recommendation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {awardStatus?.status === "approved" ? (
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">Award Approved</p>
                    <p className="text-sm text-green-700">Recommended: <strong>{awardStatus.recommended_supplier}</strong></p>
                    {awardStatus.justification && <p className="text-xs text-green-600 mt-1">{awardStatus.justification}</p>}
                    {awardStatus.confidence && <p className="text-xs text-green-600 mt-0.5">Confidence: {Math.round(awardStatus.confidence * 100)}%</p>}
                  </div>
                </div>
              ) : awardStatus?.status === "recommended" ? (
                <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/30 rounded-lg">
                  <Award className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Recommendation Pending Approval</p>
                    <p className="text-sm text-muted-foreground">Recommended: <strong>{awardStatus.recommended_supplier}</strong></p>
                    {awardStatus.justification && <p className="text-xs text-muted-foreground mt-1">{awardStatus.justification}</p>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Optional justification / notes</label>
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      rows={3}
                      placeholder="Add context for approvers (e.g. strategic rationale, risk mitigations)…"
                      value={awardJustification}
                      onChange={e => setAwardJustification(e.target.value)}
                    />
                  </div>
                  <Button className="w-full gap-2" onClick={recommendAward} disabled={awarding}>
                    {awarding
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                      : <><Award className="h-4 w-4" /> Generate Award Recommendation</>}
                  </Button>
                  {awardError && (
                    <div className="flex items-center gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{awardError}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}


