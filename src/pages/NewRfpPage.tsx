/**
 * NewRfpPage — Select a project and upload + parse the RFP document.
 * Supplier uploads live in SupplierResponsesPage.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { useAgents } from "@/contexts/AgentContext";
import AgentStreamingThought from "@/components/AgentStreamingThought";
import {
  Loader2, CheckCircle2, AlertCircle, ArrowRight,
  Copy, FileSearch, Brain, BarChart3, FolderOpen, Clock,
} from "lucide-react";
import type { Project, RFPQuestion } from "@/lib/types";

type Step = "select_project" | "upload" | "parsing" | "parsed" | "error";

const PARSE_MESSAGES = [
  { icon: FileSearch, text: "Reading document structure...",        sub: "Extracting text from all sheets and sections" },
  { icon: Brain,      text: "Identifying evaluation criteria...",   sub: "AI is scanning for questions and requirements" },
  { icon: Brain,      text: "Classifying question types...",        sub: "Tagging quantitative vs qualitative criteria" },
  { icon: BarChart3,  text: "Assigning category weights...",        sub: "Distributing importance scores across categories" },
  { icon: Brain,      text: "Still working on a large document...", sub: "Processing remaining sections in parallel" },
  { icon: Brain,      text: "Finalising question list...",          sub: "Almost done — merging results across all chunks" },
];

function ProgressCard({ messages, msgIndex, label }: {
  messages: typeof PARSE_MESSAGES;
  msgIndex: number;
  label: string;
}) {
  const msg = messages[Math.min(msgIndex, messages.length - 1)];
  const Icon = msg.icon;
  const progress = Math.min(95, ((msgIndex + 1) / messages.length) * 100);
  return (
    <Card>
      <CardContent className="p-10 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <Loader2 className="h-5 w-5 text-primary animate-spin absolute -bottom-1 -right-1" />
        </div>
        <div className="text-center space-y-1.5 max-w-sm">
          <p className="font-semibold text-lg">{label}</p>
          <p className="text-sm font-medium text-foreground">{msg.text}</p>
          <p className="text-sm text-muted-foreground">{msg.sub}</p>
        </div>
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Processing</span><span>{Math.round(progress)}%</span>
          </div>
          <div className="bg-muted rounded-full h-2 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-[2000ms] ease-in-out" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /><span>Please keep this tab open</span>
        </div>
      </CardContent>
    </Card>
  );
}

const RFP_PARSE_THOUGHTS = [
  "Reading uploaded RFP document…",
  "Extracting key procurement requirements…",
  "Identifying evaluation criteria…",
  "Structuring sections and scoring weights…",
  "Finalising RFP metadata…",
];

export default function NewRfpPage() {
  const { pushActivity } = useAgents();
  const navigate = useNavigate();
  const [step, setStep]             = useState<Step>("select_project");
  const [projects, setProjects]     = useState<Project[]>([]);
  const [projectId, setProjectId]   = useState<string | null>(null);
  const [questions, setQuestions]   = useState<RFPQuestion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [parseMsgIdx, setParseMsgIdx] = useState(0);

  useEffect(() => {
    api.listProjects().then(r => setProjects(r.projects || [])).catch(() => {});
  }, []);

  const startRotation = (setter: (i: number) => void, total: number, ms = 7000) => {
    let idx = 0;
    const t = setInterval(() => {
      idx = Math.min(idx + 1, total - 1);
      setter(idx);
      if (idx >= total - 1) clearInterval(t);
    }, ms);
    return t;
  };

  const handleRfpUpload = async (files: File[]) => {
    if (!files[0] || !projectId) return;
    setStep("parsing"); setParseMsgIdx(0); setError(null);
    const timer = startRotation(setParseMsgIdx, PARSE_MESSAGES.length);
    try {
      const _rfpStart = Date.now();
      pushActivity({ agentId: 'rfp', status: 'running', message: 'Parsing RFP document…' });
      await api.uploadProjectRfp(projectId, files[0]);
      const parsed = await api.parseProject(projectId);
      pushActivity({ agentId: 'rfp', status: 'complete', message: 'RFP parsed and requirements extracted', durationMs: Date.now() - _rfpStart, confidence: 91 });
      clearInterval(timer);
      setQuestions(Array.isArray(parsed.questions) ? parsed.questions : []);
      setCategories(Array.isArray(parsed.categories) ? parsed.categories : []);
      setStep("parsed");
    } catch (err: any) {
      clearInterval(timer);
      setError(err.message || "Failed to upload and parse RFP");
      setStep("error");
    }
  };

  const stepIndex = { select_project: 0, upload: 1, parsing: 1, parsed: 1, error: 0 }[step];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New RFP</h1>
        <p className="text-muted-foreground mt-1">Select a project, upload and parse your RFP document</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {["Select Project", "Upload & Parse RFP", "Done"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              i < stepIndex ? "bg-success text-success-foreground"
              : i === stepIndex ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
            }`}>{i + 1}</div>
            <span className="text-sm font-medium">{s}</span>
            {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select project */}
      {step === "select_project" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Select Project</CardTitle>
            <CardDescription>Choose which project this RFP belongs to</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No projects yet. <button onClick={() => navigate("/projects")} className="text-primary underline">Create one first</button>.
              </p>
            ) : (
              projects.map(p => (
                <button key={p.project_id}
                  onClick={() => { setProjectId(p.project_id); setStep("upload"); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors text-left">
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    {p.meta?.category && <p className="text-xs text-muted-foreground">{p.meta.category}</p>}
                  </div>
                  {p.rfp_filename && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">RFP exists — will replace</span>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload RFP Document</CardTitle>
            <CardDescription>Supports xlsx, xls, csv, pdf, docx</CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploadZone
              onFileSelect={handleRfpUpload}
              accept=".xlsx,.xls,.csv,.pdf,.docx"
              label="Upload RFP Template"
              description="Drag & drop or click to browse"
            />
          </CardContent>
        </Card>
      )}

      {/* Parsing spinner */}
      {step === "parsing" && (
        <ProgressCard messages={PARSE_MESSAGES} msgIndex={parseMsgIdx} label="Parsing RFP with AI..." />
      )}

      {/* Error */}
      {step === "error" && (
        <Card className="border-destructive/30">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => setStep("upload")}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsed success */}
      {step === "parsed" && (
        <div className="space-y-4">
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium">
                RFP parsed — {questions.length} question{questions.length !== 1 ? "s" : ""} across {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
              </span>
            </CardContent>
          </Card>

          {projectId && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Project ID</p>
                  <p className="text-sm font-mono font-semibold mt-0.5">{projectId}</p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(projectId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors">
                  <Copy className="h-3.5 w-3.5" />{copied ? "Copied!" : "Copy ID"}
                </button>
              </CardContent>
            </Card>
          )}

          {questions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extracted Questions</CardTitle>
                <CardDescription>AI-identified evaluation criteria from your RFP</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {questions.map((q) => (
                    <div key={q.question_id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="text-xs font-bold text-primary">{q.question_id}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          q.question_type === "quantitative" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>{q.question_type === "quantitative" ? "QNT" : "QLT"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{q.question_text}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{q.category} · Weight: {q.weight}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep("select_project"); setProjectId(null); }} className="flex-1">
              Parse Another RFP
            </Button>
            <Button onClick={() => navigate("/suppliers")} className="flex-1 gap-2">
              Next: Upload Supplier Responses →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
