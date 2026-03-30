import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import {
  Loader2, CheckCircle2, AlertCircle, ArrowRight,
  Copy, Play, Upload, X, Clock, FileSearch, Brain, BarChart3,
} from "lucide-react";
import type { RFPQuestion } from "@/lib/types";

type Step = "upload" | "parsing" | "parsed" | "analyzing" | "error";

const PARSE_MESSAGES = [
  { icon: FileSearch, text: "Reading document structure...", sub: "Extracting text from all sheets and sections" },
  { icon: Brain,      text: "Identifying evaluation criteria...", sub: "AI is scanning for questions and requirements" },
  { icon: Brain,      text: "Classifying question types...", sub: "Tagging quantitative vs qualitative criteria" },
  { icon: BarChart3,  text: "Assigning category weights...", sub: "Distributing importance scores across categories" },
  { icon: Brain,      text: "Still working on a large document...", sub: "Processing remaining sections in parallel" },
  { icon: Brain,      text: "Finalising question list...", sub: "Almost done — merging results across all chunks" },
];

const ANALYSIS_MESSAGES = [
  { text: "Parsing supplier documents...",         sub: "Extracting answers from all sheets" },
  { text: "Mapping answers to questions...",        sub: "Matching supplier responses to RFP criteria" },
  { text: "Scoring quantitative criteria...",       sub: "Comparing numbers, dates and percentages" },
  { text: "Scoring qualitative responses...",       sub: "Evaluating written answers with AI" },
  { text: "Computing category breakdowns...",       sub: "Aggregating weighted scores per category" },
  { text: "Ranking suppliers...",                   sub: "Sorting by overall weighted score" },
  { text: "Generating insights & recommendations...", sub: "Almost there!" },
];

function ProgressCard({
  messages,
  msgIndex,
  label,
  supplierCount,
  categoryCount,
}: {
  messages: typeof PARSE_MESSAGES | typeof ANALYSIS_MESSAGES;
  msgIndex: number;
  label: string;
  supplierCount?: number;
  categoryCount?: number;
}) {
  const msg = messages[Math.min(msgIndex, messages.length - 1)] as any;
  const Icon = msg.icon ?? Brain;
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
          {supplierCount !== undefined && categoryCount !== undefined && (
            <p className="text-xs text-muted-foreground mt-2">
              {supplierCount} supplier{supplierCount !== 1 ? "s" : ""} · {categoryCount} categories
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Processing</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-[2000ms] ease-in-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Please keep this tab open</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NewRfpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [rfpId, setRfpId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<RFPQuestion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [supplierFiles, setSupplierFiles] = useState<File[]>([]);
  const [uploadingSuppliers, setUploadingSuppliers] = useState(false);
  const [suppliersUploaded, setSuppliersUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [parseMsgIdx, setParseMsgIdx] = useState(0);
  const [analysisMsgIdx, setAnalysisMsgIdx] = useState(0);

  // Rotate through progress messages every N seconds
  const startMessageRotation = (
    setter: (i: number) => void,
    total: number,
    intervalMs = 7000
  ) => {
    let idx = 0;
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, total - 1);
      setter(idx);
      if (idx >= total - 1) clearInterval(timer);
    }, intervalMs);
    return timer;
  };

  const handleRfpUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setStep("parsing");
    setParseMsgIdx(0);
    setError(null);

    const timer = startMessageRotation(setParseMsgIdx, PARSE_MESSAGES.length, 7000);
    try {
      const uploadResult = await api.uploadRfp(files[0]);
      const id = uploadResult.rfp_id;
      setRfpId(id);

      // parseRfp fires job + polls — UI stays on "parsing" the whole time
      const parsed = await api.parseRfp(id);
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

  const handleSupplierFilesSelected = (files: File[]) => {
    if (!files || files.length === 0) return;
    setSupplierFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !names.has(f.name))];
    });
  };

  const removeSupplierFile = (name: string) => {
    setSupplierFiles(prev => prev.filter(f => f.name !== name));
  };

  const handleUploadAndAnalyse = async () => {
    if (!rfpId || supplierFiles.length === 0) return;
    setUploadingSuppliers(true);
    setSuppliersUploaded(0);
    setError(null);
    try {
      for (let i = 0; i < supplierFiles.length; i++) {
        await api.uploadSupplier(rfpId, supplierFiles[i]);
        setSuppliersUploaded(i + 1);
      }

      setStep("analyzing");
      setAnalysisMsgIdx(0);
      setUploadingSuppliers(false);

      const timer = startMessageRotation(setAnalysisMsgIdx, ANALYSIS_MESSAGES.length, 9000);
      try {
        const result = await api.runAnalysis(rfpId);
        clearInterval(timer);
        analysisStore.setResult(rfpId, result);
        navigate("/analysis");
      } catch (err) {
        clearInterval(timer);
        throw err;
      }
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      setStep("error");
    } finally {
      setUploadingSuppliers(false);
    }
  };

  const handleCopyId = () => {
    if (!rfpId) return;
    navigator.clipboard.writeText(rfpId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stepIndex = { upload: 0, parsing: 1, parsed: 1, analyzing: 2, error: 0 }[step];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New RFP Evaluation</h1>
        <p className="text-muted-foreground mt-1">Upload your RFP and supplier responses to begin AI-powered evaluation</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {["Upload & Parse RFP", "Add Suppliers", "Analyse"].map((s, i) => (
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

      {/* Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload RFP Template</CardTitle>
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

      {/* Parsing spinner with live messages */}
      {step === "parsing" && (
        <ProgressCard
          messages={PARSE_MESSAGES}
          msgIndex={parseMsgIdx}
          label="Parsing RFP with AI..."
        />
      )}

      {/* Analysis spinner with live messages */}
      {step === "analyzing" && (
        <ProgressCard
          messages={ANALYSIS_MESSAGES}
          msgIndex={analysisMsgIdx}
          label="Running agentic analysis..."
          supplierCount={supplierFiles.length}
          categoryCount={categories.length}
        />
      )}

      {/* Error */}
      {step === "error" && (
        <Card className="border-destructive/30">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => setStep(rfpId ? "parsed" : "upload")}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsed */}
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

          {rfpId && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">RFP ID</p>
                  <p className="text-sm font-mono font-semibold mt-0.5">{rfpId}</p>
                </div>
                <button onClick={handleCopyId} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy ID"}
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
                          q.question_type === "quantitative"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}>
                          {q.question_type === "quantitative" ? "QNT" : "QLT"}
                        </span>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Supplier Responses</CardTitle>
              <CardDescription>Upload one file per supplier (xlsx, xls, csv, pdf, docx)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUploadZone
                onFileSelect={handleSupplierFilesSelected}
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.docx"
                label="Add Supplier Response Files"
                description="Drop files here or click to browse"
              />

              {supplierFiles.length > 0 && (
                <div className="space-y-2">
                  {supplierFiles.map((f) => (
                    <div key={f.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium truncate max-w-xs">{f.name}</span>
                        <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => removeSupplierFile(f.name)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleUploadAndAnalyse}
                disabled={supplierFiles.length === 0 || uploadingSuppliers}
                className="w-full gap-2"
              >
                {uploadingSuppliers ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {suppliersUploaded}/{supplierFiles.length}...</>
                ) : (
                  <><Play className="h-4 w-4" /> Upload & Run Analysis ({supplierFiles.length} supplier{supplierFiles.length !== 1 ? "s" : ""})</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
