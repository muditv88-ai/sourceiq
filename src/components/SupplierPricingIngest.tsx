import React, { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface IngestStatus {
  state: "idle" | "uploading" | "processing" | "done" | "error";
  message?: string;
  rowsIngested?: number;
}

const SupplierPricingIngest: React.FC = () => {
  const [status, setStatus] = useState<IngestStatus>({ state: "idle" });
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file) return;
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!allowed.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setStatus({ state: "error", message: "Please upload an Excel (.xlsx / .xls) or CSV file." });
      return;
    }
    setStatus({ state: "uploading", message: `Uploading ${file.name}…` });
    // Simulate processing
    setTimeout(() => {
      setStatus({ state: "processing", message: "Parsing pricing rows…" });
      setTimeout(() => {
        setStatus({ state: "done", message: `${file.name} ingested successfully.`, rowsIngested: 142 });
      }, 1800);
    }, 1000);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => setStatus({ state: "idle" });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          Upload Supplier Pricing Sheet
        </CardTitle>
        <CardDescription>
          Upload an Excel or CSV file exported from a supplier's quote. The agent will
          parse line-item prices and map them to your RFP structure automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.state === "idle" && (
          <div
            className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("pricing-file-input")?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Click to upload</span> or drag &amp; drop
            </p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls, or .csv — max 10 MB</p>
            <input
              id="pricing-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={onFileInput}
            />
          </div>
        )}

        {(status.state === "uploading" || status.state === "processing") && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{status.message}</span>
          </div>
        )}

        {status.state === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">{status.message}</p>
                {status.rowsIngested && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {status.rowsIngested} line items extracted and queued for normalisation.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary">{status.rowsIngested} rows</Badge>
              <Button variant="ghost" size="sm" onClick={reset}>Upload another</Button>
            </div>
          </div>
        )}

        {status.state === "error" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-800 dark:text-red-300">{status.message}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>Try again</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierPricingIngest;
