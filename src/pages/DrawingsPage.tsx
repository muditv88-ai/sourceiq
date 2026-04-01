import { useState, useRef } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  FileImage, Upload, Trash2, Loader2, Link2, Eye, FolderOpen,
} from "lucide-react";

interface Drawing {
  id: string;
  filename: string;
  type: string;
  project_id?: string;
  line_item_id?: string;
  url?: string;
  uploaded_at: string;
}

const DEMO: Drawing[] = [
  { id: "d1", filename: "HVAC_Layout_Floor1.pdf",   type: "pdf",  project_id: "proj-001", uploaded_at: new Date(Date.now() - 2*86400000).toISOString() },
  { id: "d2", filename: "Electrical_Panel_DWG.dwg", type: "dwg",  project_id: "proj-001", uploaded_at: new Date(Date.now() - 86400000).toISOString() },
  { id: "d3", filename: "Site_Plan_Overview.png",   type: "png",  project_id: "proj-001", uploaded_at: new Date().toISOString() },
];

const TYPE_COLORS: Record<string, string> = {
  pdf:  "bg-red-100 text-red-700",
  dwg:  "bg-blue-100 text-blue-700",
  dxf:  "bg-purple-100 text-purple-700",
  png:  "bg-green-100 text-green-700",
  svg:  "bg-teal-100 text-teal-700",
  tiff: "bg-orange-100 text-orange-700",
};

export default function DrawingsPage() {
  const [drawings, setDrawings] = useState<Drawing[]>(DEMO);
  const [uploading, setUploading] = useState(false);
  const [attachTarget, setAttachTarget] = useState({ drawingId: "", lineItemId: "" });
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await api.uploadDrawing(file);
        setDrawings(prev => [{
          id: res.drawing_id ?? Date.now().toString(),
          filename: file.name,
          type: file.name.split(".").pop()?.toLowerCase() ?? "file",
          project_id: res.project_id,
          url: res.url,
          uploaded_at: new Date().toISOString(),
        }, ...prev]);
      }
      toast({ title: "Drawing(s) uploaded", description: `${files.length} file(s) stored` });
    } catch {
      // Graceful fallback
      for (const file of Array.from(files)) {
        setDrawings(prev => [{
          id: Date.now().toString() + Math.random(),
          filename: file.name,
          type: file.name.split(".").pop()?.toLowerCase() ?? "file",
          uploaded_at: new Date().toISOString(),
        }, ...prev]);
      }
      toast({ title: "Uploaded (local)", description: "Backend not reachable — shown locally only." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAttach() {
    if (!attachTarget.drawingId || !attachTarget.lineItemId) return;
    setAttaching(true);
    try {
      await api.attachDrawing(attachTarget.drawingId, attachTarget.lineItemId);
      toast({ title: "Drawing attached", description: `Linked to line item ${attachTarget.lineItemId}` });
      setAttachTarget({ drawingId: "", lineItemId: "" });
    } catch {
      toast({ title: "Attached (local)", description: "Backend not reachable — shown locally only." });
    } finally {
      setAttaching(false);
    }
  }

  function handleRemove(id: string) {
    setDrawings(prev => prev.filter(d => d.id !== id));
    toast({ title: "Removed", description: "Drawing removed from list" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Technical Drawings</h1>
        <p className="text-muted-foreground mt-1">Upload and attach engineering drawings to RFP line items</p>
      </div>

      {/* Upload zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Upload Drawings</CardTitle>
          <CardDescription>Supports PDF, DWG, DXF, PNG, SVG, TIFF</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <FileImage className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DWG, DXF, PNG, SVG, TIFF accepted</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.dwg,.dxf,.png,.svg,.tiff,.tif" className="hidden" onChange={e => handleUpload(e.target.files)} />
        </CardContent>
      </Card>

      {/* Attach to line item */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Attach to RFP Line Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={attachTarget.drawingId}
              onChange={e => setAttachTarget(p => ({ ...p, drawingId: e.target.value }))}
            >
              <option value="">Select drawing...</option>
              {drawings.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
            </select>
            <Input
              placeholder="Line item ID (e.g. LI-003)"
              value={attachTarget.lineItemId}
              onChange={e => setAttachTarget(p => ({ ...p, lineItemId: e.target.value }))}
            />
            <Button onClick={handleAttach} disabled={attaching || !attachTarget.drawingId || !attachTarget.lineItemId} className="gap-2">
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Attach
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Drawings list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Uploaded Drawings ({drawings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {drawings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No drawings uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {drawings.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{d.filename}</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.uploaded_at).toLocaleString()}{d.line_item_id ? ` · Linked: ${d.line_item_id}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${TYPE_COLORS[d.type] ?? "bg-muted text-muted-foreground"}`}>{d.type}</span>
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemove(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
