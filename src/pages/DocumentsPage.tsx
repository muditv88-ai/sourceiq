import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  FileImage,
  File,
  Trash2,
  Download,
  Loader2,
  Zap,
  FolderOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Category = "rfp_templates" | "supplier_responses" | "drawings" | "misc";
type AnalysisType = "rfp_parse" | "bid_intake" | "pricing";

interface ProjectFile {
  id: string;
  filename: string;
  display_name: string;
  category: Category;
  content_type: string;
  size_bytes: number;
  rfp_id?: string;
  supplier_id?: string;
  analysis_status: "none" | "pending" | "complete" | "error";
  created_at: string;
}

const TABS: { key: Category; label: string; analysisType: AnalysisType }[] = [
  { key: "rfp_templates",      label: "RFP Templates",       analysisType: "rfp_parse" },
  { key: "supplier_responses", label: "Supplier Responses",  analysisType: "bid_intake" },
  { key: "drawings",           label: "Drawings",             analysisType: "rfp_parse" },
  { key: "misc",               label: "Miscellaneous",        analysisType: "rfp_parse" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadge(status: ProjectFile["analysis_status"]) {
  const map = {
    none:     "bg-muted text-muted-foreground",
    pending:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    complete: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    error:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels = { none: "Not analysed", pending: "Analysing…", complete: "Analysed", error: "Error" };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[status])}>
      {labels[status]}
    </span>
  );
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (contentType === "application/pdf")  return <FileText  className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const projectId = analysisStore.getRfpId() ?? "";

  const [activeTab,   setActiveTab]   = useState<Category>("rfp_templates");
  const [files,       setFiles]       = useState<ProjectFile[]>([]);
  const [loadedTabs,  setLoadedTabs]  = useState<Set<Category>>(new Set());
  const [tabLoading,  setTabLoading]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [actionId,    setActionId]    = useState<string | null>(null);

  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const tabFiles   = files.filter((f) => f.category === activeTab);

  // ── load files for a tab ────────────────────────────────────────────────
  async function loadTab(cat: Category) {
    if (!projectId) return;
    setTabLoading(true);
    try {
      const data: ProjectFile[] = await api.listFiles(projectId, cat);
      setFiles((prev) => [
        ...prev.filter((f) => f.category !== cat),
        ...data,
      ]);
      setLoadedTabs((prev) => new Set([...prev, cat]));
    } catch {
      toast({ title: "Error", description: "Could not load files.", variant: "destructive" });
    } finally {
      setTabLoading(false);
    }
  }

  function switchTab(cat: Category) {
    setActiveTab(cat);
    if (!loadedTabs.has(cat)) loadTab(cat);
  }

  // load first tab on mount
  useState(() => { loadTab("rfp_templates"); });

  // ── upload ───────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!projectId) {
        toast({ title: "No project selected", description: "Open a project first before uploading files.", variant: "destructive" });
        return;
      }
      if (accepted.length === 0) return;
      setUploading(true);
      try {
        for (const file of accepted) {
          const result: ProjectFile = await api.uploadFile({
            file,
            project_id: projectId,
            category: activeTab,
            user_id: "user",
          });
          setFiles((prev) => [result, ...prev]);
        }
        toast({ title: "Upload complete", description: `${accepted.length} file(s) uploaded to ${currentTab.label}.` });
      } catch {
        toast({ title: "Upload failed", description: "Could not upload files.", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [activeTab, projectId, currentTab.label, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  // ── download ─────────────────────────────────────────────────────────────
  async function handleDownload(file: ProjectFile) {
    if (!projectId) return;
    try {
      const res = await api.getFileUrl(projectId, file.id);
      window.open(res.url, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not generate download link.", variant: "destructive" });
    }
  }

  // ── analyse ──────────────────────────────────────────────────────────────
  async function handleAnalyse(file: ProjectFile) {
    if (!projectId) return;
    setActionId(file.id);
    setFiles((prev) =>
      prev.map((f) => f.id === file.id ? { ...f, analysis_status: "pending" } : f)
    );
    try {
      const res = await api.analyseFile(projectId, file.id, currentTab.analysisType);
      setFiles((prev) =>
        prev.map((f) => f.id === file.id ? { ...f, analysis_status: res.analysis_status } : f)
      );
      toast({ title: "Analysis complete", description: `${file.display_name} analysed successfully.` });
    } catch {
      setFiles((prev) =>
        prev.map((f) => f.id === file.id ? { ...f, analysis_status: "error" } : f)
      );
      toast({ title: "Analysis failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  // ── delete ───────────────────────────────────────────────────────────────
  async function handleDelete(file: ProjectFile) {
    if (!projectId) return;
    if (!confirm(`Delete "${file.display_name}"? This cannot be undone.`)) return;
    setActionId(file.id);
    try {
      await api.deleteFile(projectId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast({ title: "File deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload, manage, and trigger AI analysis on project files.
        </p>
      </div>

      {!projectId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No project selected</p>
          <p className="text-xs text-muted-foreground mt-1">Open a project from the Projects page to manage its documents.</p>
        </div>
      )}

      {projectId && (
        <>
          {/* Category tabs */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {files.filter((f) => f.category === tab.key).length}
                </span>
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {isDragActive ? "Drop files here" : `Upload to ${currentTab.label}`}
                </p>
                <p className="text-xs text-muted-foreground">Drag & drop or click to browse</p>
              </div>
            )}
          </div>

          {/* File list */}
          {tabLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tabFiles.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <File className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No files in {currentTab.label} yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">File</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Uploaded</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tabFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {fileIcon(file.content_type)}
                          <span className="font-medium truncate max-w-xs">{file.display_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                      <td className="px-4 py-3">{statusBadge(file.analysis_status)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleAnalyse(file)}
                            disabled={actionId === file.id}
                            title="Analyse with AI"
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                          >
                            {actionId === file.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Zap className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDownload(file)}
                            title="Download"
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(file)}
                            disabled={actionId === file.id}
                            title="Delete"
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
