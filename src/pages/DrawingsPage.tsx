import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAgents } from "@/contexts/AgentContext";
import {
  Upload, FileImage, Link2, Loader2, FolderOpen,
  ChevronRight, CheckCircle2, AlertCircle, Trash2,
} from "lucide-react";

export default function DrawingsPage() {
  const { pushActivity } = useAgents();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects]           = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [drawings, setDrawings]           = useState<any[]>([]);
  const [loadingDrawings, setLoadingDrawings] = useState(false);

  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [attachingId, setAttachingId]     = useState<string | null>(null);
  const [lineItemInputs, setLineItemInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    api.listProjects()
      .then(r => setProjects((r.projects ?? []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoadingDrawings(true);
    api.listDrawings(selectedProject)
      .then(r => setDrawings(r.drawings ?? []))
      .catch(() => setDrawings([]))
      .finally(() => setLoadingDrawings(false));
  }, [selectedProject]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;
    setUploading(true); setUploadError(""); setUploadSuccess("");
    try {
      const r = await api.uploadDrawing(file, selectedProject);
      setDrawings(prev => [...prev, r]);
      setUploadSuccess(`"${file.name}" uploaded successfully.`);
      pushActivity({ agentId: "drawings", status: "complete", message: `Drawing ${file.name} uploaded` });
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAttach(drawingId: string) {
    const lineItemId = lineItemInputs[drawingId];
    if (!lineItemId) return;
    setAttachingId(drawingId);
    try {
      await api.attachDrawing(drawingId, lineItemId, selectedProject);
      setDrawings(prev =>
        prev.map(d => d.drawing_id === drawingId ? { ...d, attached_to: lineItemId } : d)
      );
      setLineItemInputs(prev => ({ ...prev, [drawingId]: "" }));
    } catch (e: any) {
      alert(e?.message ?? "Attach failed.");
    } finally { setAttachingId(null); }
  }

  // ── Project picker ──────────────────────────────────────────────────────────
  if (!selectedProject) {
    return (
      <div className="max-w-xl mx-auto mt-16 space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileImage className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Drawings & Attachments</h1>
          <p className="text-muted-foreground text-sm">
            Upload technical drawings and attach them to RFP BOM line items.
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Select Project</CardTitle></CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
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

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Drawings & Attachments</h1>
          <p className="text-muted-foreground mt-1 text-sm">{projectName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedProject("")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Change project
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg"
            onChange={handleUpload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
              : <><Upload className="h-4 w-4 mr-2" /> Upload Drawing</>}
          </Button>
        </div>
      </div>

      {/* Feedback banners */}
      {uploadError && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{uploadSuccess}
        </div>
      )}

      {/* Drawing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loadingDrawings ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl border bg-muted animate-pulse" />
          ))
        ) : drawings.length === 0 ? (
          <div className="col-span-3 text-center py-16 text-muted-foreground">
            <FileImage className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No drawings yet</p>
            <p className="text-sm">Upload a PDF, DWG, DXF, or image to get started.</p>
          </div>
        ) : drawings.map((d: any) => (
          <Card key={d.drawing_id ?? d.filename} className="group">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileImage className="h-5 w-5 text-primary flex-shrink-0" />
                  <CardTitle className="text-sm truncate">{d.filename ?? d.name}</CardTitle>
                </div>
                {d.attached_to
                  ? <Badge className="text-xs flex-shrink-0 gap-1">
                      <CheckCircle2 className="h-3 w-3" />Attached
                    </Badge>
                  : <Badge variant="outline" className="text-xs flex-shrink-0">Unattached</Badge>
                }
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.attached_to ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Link2 className="h-3 w-3" /> Line item: <span className="font-medium text-foreground">{d.attached_to}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Line item ID to attach"
                    value={lineItemInputs[d.drawing_id] ?? ""}
                    onChange={e => setLineItemInputs(prev => ({ ...prev, [d.drawing_id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleAttach(d.drawing_id)}
                  />
                  <Button size="sm" variant="outline"
                    disabled={attachingId === d.drawing_id || !lineItemInputs[d.drawing_id]}
                    onClick={() => handleAttach(d.drawing_id)}>
                    {attachingId === d.drawing_id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Link2 className="h-3 w-3" />}
                  </Button>
                </div>
              )}
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  View file ↗
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}