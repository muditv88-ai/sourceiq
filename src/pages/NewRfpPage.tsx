import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, Copy, Play, Upload, X } from "lucide-react";
import type { RFPQuestion } from "@/lib/types";

type Step = "upload" | "parsing" | "parsed" | "analyzing" | "error";

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

  const handleRfpUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setStep("parsing");
    setError(null);
    try {
      const uploadResult = await api.uploadRfp(files[0]);
      const id = uploadResult.rfp_id;
      setRfpId(id);
      const parsed = await api.parseRfp(id);
      setQuestions(parsed.questions);
      setCategories(parsed.categories);
      setStep("parsed");
    } catch (err: any) {
      setError(err.message || "Failed to upload and parse RFP");
      setStep("error");
    }
  };

  const handleSupplierFilesSelected = (files: File[]) => {
    setSupplierFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      const newFiles = files.filter(f => !names.has(f.name));
      return [...prev, ...newFiles];
    });
  };

  const removeSupplierFile = (name: string) => {
    setSupplierFiles(prev => prev.filter(f => f.name !== name));
  };

  const handleUploadAndAnalyse = async () => {
    if (!rfpId || supplierFiles.length === 0) return;
    setUploadingSuppliers(true);
    setError(null);
    try {
      // Upload each supplier file
      for (let i = 0; i < supplierFiles.length; i++) {
        await api.uploadSupplier(rfpId, supplierFiles[i]);
        setSuppliersUploaded(i + 1);
      }
      // Run analysis
      setStep("analyzing");
      const result = await api.runAnalysis(rfpId);
      analysisStore.setResult(rfpId, result);
      navigate("/analysis");
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
        {["Upload RFP", "Parse", "Analyse"].map((s, i) => (
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

      {/* Upload RFP */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload RFP Template</CardTitle>
            <CardDescription>Supports xlsx, xls, csv, pdf, docx</CardDescription>
          </CardHeader>
          <CardContent><FileUploadZone onFileSelect={handleRfpUpload} /></CardContent>
        </Card>
      )}

      {/* Parsing / Analyzing spinner */}
      {(step === "parsing" || step === "analyzing") && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-semibold">
                {step === "parsing" ? "Parsing RFP with AI..." : "Running agentic analysis..."}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {step === "parsing"
                  ? "Extracting questions, categories and weights"
                  : `Scoring ${supplierFiles.length} supplier(s) across ${categories.length} categories`}
              </p>
            </div>
          </CardContent>
        </Card>
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

      {/* Parsed state */}
      {step === "parsed" && (
        <div className="space-y-4">
          {/* Success banner */}
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium">
                RFP parsed — {questions.length} questions across {categories.length} categories
              </span>
            </CardContent>
          </Card>

          {/* RFP ID */}
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

          {/* Extracted questions preview */}
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
                      }`}>{q.question_type === "quantitative" ? "QNT" : "QLT"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{q.category} · Weight: {q.weight}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Supplier upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Supplier Responses</CardTitle>
              <CardDescription>Upload one file per supplier (xlsx, xls, csv, pdf, docx)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUploadZone
                onFileSelect={handleSupplierFilesSelected}
                multiple
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
