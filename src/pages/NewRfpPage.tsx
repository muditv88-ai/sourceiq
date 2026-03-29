import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, Copy } from "lucide-react";
import type { Requirement } from "@/lib/types";

type Step = "upload" | "parsing" | "parsed" | "error";

export default function NewRfpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [rfpId, setRfpId] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setStep("parsing");
    setError(null);

    try {
      const uploadResult = await api.uploadRfp(files[0]);
      setRfpId(uploadResult.id);

      const parseResult = await api.parseRfp(uploadResult.id);
      setRequirements(parseResult.requirements);
      setMetadata(parseResult.metadata);
      setStep("parsed");
    } catch (err: any) {
      setError(err.message || "Failed to upload and parse RFP");
      setStep("error");
    }
  };

  const handleCopyId = () => {
    if (!rfpId) return;
    navigator.clipboard.writeText(rfpId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New RFP Evaluation</h1>
        <p className="text-muted-foreground mt-1">
          Upload your RFP template to start evaluating suppliers
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {["Upload", "Parse", "Analyze"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i === 0 && step !== "upload"
                  ? "bg-success text-success-foreground"
                  : i === 0
                  ? "bg-primary text-primary-foreground"
                  : i === 1 && step === "parsed"
                  ? "bg-success text-success-foreground"
                  : i === 1 && step === "parsing"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
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
            <CardDescription>
              Upload an Excel file (.xlsx) containing your RFP requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploadZone onFileSelect={handleUpload} />
          </CardContent>
        </Card>
      )}

      {/* Parsing */}
      {step === "parsing" && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-semibold">Processing your RFP...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Uploading and parsing requirements
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
              <p className="font-semibold text-destructive">Upload Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setStep("upload")}
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsed Results */}
      {step === "parsed" && (
        <div className="space-y-4">
          {/* Success banner */}
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium">
                RFP parsed successfully — {requirements.length} requirements found
              </span>
            </CardContent>
          </Card>

          {/* RFP ID Banner */}
          {rfpId && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    RFP ID
                  </p>
                  <p className="text-sm font-mono font-semibold mt-0.5">{rfpId}</p>
                </div>
                <button
                  onClick={handleCopyId}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy ID"}
                </button>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          {Object.keys(metadata).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">RFP Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                        {key.replace(/_/g, " ")}
                      </dt>
                      <dd className="text-sm font-medium mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Requirements Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requirements Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((req) => (
                      <tr key={req.id} className="border-t">
                        <td className="p-3">
                          <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                            {req.category}
                          </span>
                        </td>
                        <td className="p-3">{req.description}</td>
                        <td className="p-3 text-right font-mono">{req.weight}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Supplier Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Supplier Responses</CardTitle>
              <CardDescription>
                Upload supplier response files to start the analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUploadZone
                onFileSelect={async (files) => {
                  if (!rfpId || files.length === 0) return;
                  try {
                    await api.runAnalysis(rfpId, files);
                    navigate("/analysis");
                  } catch (err: any) {
                    setError(err.message);
                  }
                }}
                multiple
                label="Upload Supplier Responses"
                description="Upload one or more supplier response Excel files"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
