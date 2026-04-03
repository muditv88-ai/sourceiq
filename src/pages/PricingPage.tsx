/**
 * PricingPage.tsx v3
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowRight, BarChart3, FlaskConical, Download, Save } from "lucide-react";

const API = "/api";

interface Project { id: string; name: string; }
interface SupplierFile { path: string; name: string; filename?: string; }
interface IngestV2Result {
  rows: BidRow[];
  sheet_names: string[];
  selected_sheet: string;
  detected_header_row: number;
  diagnostics: {
    file_name: string;
    accepted_line_items: number;
    excluded_rows: { reason: string; preview: string }[];
    column_mapping: Record<string, string>;
    sample_rows: Record<string, unknown>[];
    parse_confidence: "high" | "medium" | "low";
    warnings: string[];
  };
}
interface BidRow {
  lineItem?: string; item?: string; category?: string; unitOfMeasure?: string;
  unit?: string; supplier?: string; unitPrice?: number; unit_price?: number;
  quantity?: number; total?: number; total_price?: number; delta?: number;
  [key: string]: unknown;
}
interface StagedSupplier {
  supplierName: string; rows: BidRow[]; fileName: string; sheetName: string; headerRow: number;
}
interface PivotRow {
  item: string; lowest_supplier?: string; lowest_price?: number;
  highest_supplier?: string; highest_price?: number;
  spread_pct?: number; avg_price?: number;
  [supplier: string]: unknown;
}
interface AgentLog { id: string; agent_id: string; status: string; message: string; }
type SortDir = "asc" | "desc" | null;

const SUPPLIER_COLORS = [
  "bg-primary/10 text-primary border-primary/30",
  "bg-accent/10 text-accent border-accent/30",
  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "bg-rose-500/10 text-rose-400 border-rose-500/30",
  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "bg-sky-500/10 text-sky-400 border-sky-500/30",
];

const confidenceCls = (c: string) =>
  c === "high"   ? "text-success border-success/30 bg-success/5" :
  c === "medium" ? "text-warning border-warning/30 bg-warning/5" :
                   "text-destructive border-destructive/30 bg-destructive/5";

function fmt(v: unknown) {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normaliseRow(r: BidRow): BidRow {
  return {
    ...r,
    lineItem:     String(r.lineItem ?? r.item ?? "—"),
    unitPrice:    Number(r.unitPrice ?? r.unit_price ?? 0),
    quantity:     Number(r.quantity ?? 1),
    total:        Number(r.total ?? r.total_price ?? 0),
    category:     String(r.category ?? "General"),
    unitOfMeasure: String(r.unitOfMeasure ?? r.unit ?? "—"),
    supplier:     String(r.supplier ?? "Unknown"),
  };
}

function buildPivot(staged: StagedSupplier[]): { pivot: PivotRow[]; suppliers: string[] } {
  const suppliers = staged.map(s => s.supplierName);
  const map = new Map<string, PivotRow>();
  for (const s of staged) {
    for (const rawRow of s.rows) {
      const r = normaliseRow(rawRow);
      const key = r.lineItem as string;
      if (!map.has(key)) map.set(key, { item: key });
      map.get(key)![s.supplierName] = r.unitPrice;
    }
  }
  const pivot: PivotRow[] = [];
  for (const [, pr] of map) {
    const prices = suppliers.map(s => pr[s] as number | undefined).filter((p): p is number => p != null && !isNaN(p));
    if (!prices.length) continue;
    const min = Math.min(...prices), max = Math.max(...prices);
    pr.lowest_price    = min;
    pr.highest_price   = max;
    pr.avg_price       = prices.reduce((a,b)=>a+b,0) / prices.length;
    pr.spread_pct      = min > 0 ? +((max-min)/min*100).toFixed(1) : 0;
    pr.lowest_supplier  = suppliers.find(s => (pr[s] as number) === min);
    pr.highest_supplier = suppliers.find(s => (pr[s] as number) === max);
    pivot.push(pr);
  }
  return { pivot, suppliers };
}

function agentComment(row: PivotRow, suppliers: string[]): string {
  const prices = suppliers.map(s => row[s] as number | null).filter((p): p is number => p != null);
  if (prices.length < 2) return "—";
  const parts: string[] = [];
  if (row.lowest_supplier) parts.push(`${row.lowest_supplier} lowest`);
  if (row.highest_supplier && row.highest_supplier !== row.lowest_supplier)
    parts.push(`${row.highest_supplier} highest`);
  const sp = row.spread_pct ?? 0;
  parts.push(`${sp.toFixed(1)}% spread`);
  if (sp > 25) parts.push("⚠ high variance");
  else if (sp < 5) parts.push("✓ competitive");
  return parts.join(" · ");
}

function SortHeader({ label, col, sortCol, sortDir, onSort }: {
  label: string; col: string; sortCol: string | null; sortDir: SortDir; onSort: (c: string) => void;
}) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border cursor-pointer select-none hover:text-foreground transition-colors">
      <span className="flex items-center gap-1">
        {label}
        {active ? (sortDir==="asc" ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>)
                : <ChevronsUpDown className="w-3 h-3 opacity-30"/>}
      </span>
    </th>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("access_token") ?? "";
  const ah = { Authorization: `Bearer ${token}` };
  const getUserId = () => {
    try { const p = JSON.parse(atob(token.split('.')[1])); return p.sub ?? p.user_id ?? p.id ?? ""; }
    catch { return ""; }
  };

  const [projects, setProjects]   = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [supplierFiles, setSupplierFiles] = useState<SupplierFile[]>([]);

  const [ingestMode, setIngestMode]     = useState<"project"|"upload">("project");
  const [selectedFile, setSelectedFile] = useState<SupplierFile|null>(null);
  const [uploadFile, setUploadFile]     = useState<File|null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [sheetNames, setSheetNames]     = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow]       = useState(0);
  const [parsed, setParsed]             = useState<IngestV2Result|null>(null);
  const [parsing, setParsing]           = useState(false);
  const [staged, setStaged]             = useState<StagedSupplier[]>([]);
  const [agentLogs, setAgentLogs]       = useState<AgentLog[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectLoadMsg, setProjectLoadMsg] = useState("");

  const [pageSize, setPageSize] = useState(20);
  const [page, setPage]         = useState(1);
  const [sortCol, setSortCol]   = useState<string|null>(null);
  const [sortDir, setSortDir]   = useState<SortDir>(null);
  const [cmpSortCol, setCmpSortCol] = useState<string|null>(null);
  const [cmpSortDir, setCmpSortDir] = useState<SortDir>(null);

  const allRows: BidRow[] = useMemo(
    () => staged.flatMap(s => s.rows.map(r => normaliseRow({...r, supplier: s.supplierName}))),
    [staged]
  );
  const { pivot: pivotRaw, suppliers: pivotSuppliers } = useMemo(() => buildPivot(staged), [staged]);

  const pivot = useMemo(() => {
    if (!cmpSortCol || !cmpSortDir) return pivotRaw;
    return [...pivotRaw].sort((a,b) => {
      const av = (a[cmpSortCol] as number) ?? 0, bv = (b[cmpSortCol] as number) ?? 0;
      return cmpSortDir === "asc" ? av - bv : bv - av;
    });
  }, [pivotRaw, cmpSortCol, cmpSortDir]);

  const sortedAllRows = useMemo(() => {
    if (!sortCol || !sortDir) return allRows;
    return [...allRows].sort((a,b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortDir==="asc" ? av-bv : bv-av;
      return sortDir==="asc" ? String(av??"").localeCompare(String(bv??"")) : String(bv??"").localeCompare(String(av??""));
    });
  }, [allRows, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedAllRows.length / pageSize));
  const pagedRows  = sortedAllRows.slice((page-1)*pageSize, page*pageSize);

  const kpiCards = useMemo(() => {
    const prices = allRows.map(r => r.unitPrice as number).filter(p => p > 0);
    const sorted = [...prices].sort((a,b)=>a-b);
    const avg    = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 0;
    return {
      totalBids:  allRows.length,
      suppliers:  staged.length,
      savingsPct: prices.length > 1 ? +((1-sorted[0]/avg)*100).toFixed(1) : null,
      lowestBid:  sorted[0] ?? null,
    };
  }, [allRows, staged]);

  const tickerText = agentLogs.length > 0
    ? agentLogs.slice(0,4).map(l=>`[${l.agent_id.toUpperCase()}] ${l.message}`).join("   ·   ")
    : "Pricing agent idle — load supplier bid sheets to begin analysis";

  useEffect(() => {
    const tok = localStorage.getItem("access_token") ?? "";
    const hdrs = { Authorization: `Bearer ${tok}` };
    fetch(`${API}/projects`, { headers: hdrs }).then(r=>r.json())
      .then(d => {
        // Handle both { projects:[...] } and { items:[...] } and plain array
        const l: Project[] = Array.isArray(d) ? d : (d.projects ?? d.items ?? []);
        setProjects(l);
        if (l.length) setProjectId(prev => prev || l[0].project_id);
      })
      .catch(()=>{});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setSupplierFiles([]); setSelectedFile(null); setParsed(null); setStaged([]); setPage(1);
    const tok2 = localStorage.getItem("access_token") ?? "";
    const hdrs2 = { Authorization: `Bearer ${tok2}` };
    setProjectLoading(true);
    setProjectLoadMsg("Loading project files…");
    // Use the persistent file library endpoint
    fetch(`${API}/files/${projectId}?category=supplier_responses`, { headers: hdrs2 })
      .then(r => r.ok ? r.json() : [])
      .then(async (files: {id:string; filename:string; display_name:string; size_bytes:number}[]) => {
        if (!files.length) {
          // fallback: try legacy suppliers.json metadata
          const proj = await fetch(`${API}/projects/${projectId}`, { headers: hdrs2 }).then(r=>r.json()).catch(()=>({}));
          const legacy: SupplierFile[] = (proj.suppliers??[]).map((s: SupplierFile)=>({...s, filename: s.path?.split("/").pop()??s.name}));
          setSupplierFiles(legacy);
          setProjectLoadMsg(legacy.length ? `Found ${legacy.length} supplier file${legacy.length>1?'s':''} (legacy)` : "No supplier files found in this project");
          setProjectLoading(false);
          return;
        }
        const mapped: SupplierFile[] = files.map(f=>({ path: f.id, name: f.display_name??f.filename, filename: f.filename, id: f.id }));
        setSupplierFiles(mapped);
        setProjectLoadMsg(`Found ${files.length} supplier file${files.length>1?'s':''}. Click to load bids.`);
        setProjectLoading(false);
      })
      .catch(() => {
        setProjectLoadMsg("Could not load project files");
        setProjectLoading(false);
      });

  }, [projectId]);

  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API}/agent-logs?limit=10`, { headers: ah }).then(r=>r.json())
        .then((logs: AgentLog[]) => setAgentLogs(logs.filter(l=>["pricing","rfp"].includes(l.agent_id))))
        .catch(()=>{});
    }, 3000);
    return () => clearInterval(t);
  }, [token]);

  useEffect(() => { setPage(1); }, [pageSize, sortCol, sortDir, staged]);

  useEffect(() => {
    if (typeof (window as any).XLSX !== 'undefined') return;
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    document.head.appendChild(s);
  }, []);

  const doIngest = useCallback(async (blob: Blob, fname: string, hrow=0, sname?: string, sheetOverride?: string, userPickedHeader=false) => {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], fname));
      fd.append("header_row", String(hrow));
      if (sname??supplierName) fd.append("supplier_name", sname??supplierName);
      if (projectId) fd.append("project_id", projectId);
      const sheetToSend = sheetOverride ?? selectedSheet;
      if (sheetToSend) fd.append("sheet_name", sheetToSend);
      const res  = await fetch(`${API}/pricing-analysis/ingest-v2`, { method:"POST", headers:ah, body:fd });
      const data: IngestV2Result = await res.json();
      setParsed(data);
      if (data.sheet_names?.length) {
        setSheetNames(data.sheet_names);
        // Only override displayed sheet if the user didn't explicitly pick one
        if (!sheetOverride) setSelectedSheet(data.selected_sheet??data.sheet_names[0]);
      }
      // Only override header row if user didn't manually set it
      if (!userPickedHeader) setHeaderRow(data.detected_header_row??hrow);
    } catch {}
    setParsing(false);
  }, [supplierName, projectId, token]);

  const getBlob = async (): Promise<{blob:Blob;fname:string}|null> => {
    if (ingestMode==="project"&&selectedFile) {
      try {
        const urlRes = await fetch(`${API}/files/${projectId}/supplier/${encodeURIComponent(selectedFile.filename??selectedFile.name)}/url`, { headers:ah });
        const { url } = await urlRes.json();
        return { blob: await fetch(url).then(r=>r.blob()), fname: selectedFile.filename??selectedFile.name };
      } catch { return null; }
    }
    if (uploadFile) return { blob: uploadFile, fname: uploadFile.name };
    return null;
  };

  const confirmRows = async () => {
    if (!parsed) return;
    const rows  = parsed.rows??[];
    const sName = supplierName||selectedFile?.name||uploadFile?.name?.replace(/\.[^.]+$/,"")||"Supplier";
    await fetch(`${API}/pricing-analysis/confirm-v2`, {
      method:"POST", headers:{...ah,"Content-Type":"application/json"},
      body: JSON.stringify({ rows, project_id:projectId, supplier_name:sName }),
    }).catch(()=>{});
    if (projectId) {
      
    }
    setStaged(prev => {
      const idx = prev.findIndex(s=>s.supplierName===sName);
      const entry: StagedSupplier = { supplierName:sName, rows, fileName:parsed.diagnostics.file_name, sheetName:parsed.selected_sheet, headerRow };
      if (idx>=0) { const u=[...prev]; u[idx]=entry; return u; }
      return [...prev, entry];
    });
    if (projectId && uploadFile) {
      const fd2 = new FormData();
      fd2.append("file", uploadFile);
      fd2.append("project_id", projectId!);
      fd2.append("category", "supplier_responses");
      fd2.append("user_id", getUserId());
      fd2.append("display_name", sName);
      await fetch(`${API}/files/upload`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd2}).catch(()=>{});
      // Refresh file list
      fetch(`${API}/files/${projectId}?category=supplier_responses`,{headers:ah}).then(r=>r.json())
        .then((files:{id:string;filename:string;display_name:string}[]) => {
          setSupplierFiles(files.map(f=>({path:f.id,name:f.display_name??f.filename,filename:f.filename,id:f.id} as SupplierFile)));
        // ── Auto-ingest saved files → rebuild bid tables on project switch ──
        (async () => {
          for (const f of files) {
            try {
              const fId = f.id ?? "";
              const urlEp = /^[0-9a-f-]{36}$/i.test(fId)
                ? `${API}/files/${projectId}/${fId}/url`
                : `${API}/files/${projectId}/supplier/${encodeURIComponent(f.filename??f.display_name)}/url`;
              const urlRes = await fetch(urlEp, { headers: { Authorization: `Bearer ${token}` } });
              if (!urlRes.ok) { console.warn("[auto-ingest] url fetch", urlRes.status); continue; }
              const { url } = await urlRes.json();
              // Proxy through backend to avoid CORS on signed GCS URLs
              const dlEp = /^[0-9a-f-]{36}$/i.test(fId)
                ? `${API}/files/${projectId}/${fId}/download`
                : url;
              const blobRes = await fetch(dlEp, { headers: { Authorization: `Bearer ${token}` } });
              if (!blobRes.ok) { console.warn("[auto-ingest] download", blobRes.status); continue; }
              const blob = await blobRes.blob();
              const fd = new FormData();
              fd.append("file", blob, f.filename ?? f.display_name ?? "file");
              const res = await fetch(`${API}/pricing-analysis/ingest-v2`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
              });
              if (!res.ok) { console.warn("[auto-ingest]", res.status, await res.text()); continue; }
              const data = await res.json();
              const rows: any[] = data.line_items ?? data.rows ?? data.items ?? [];
              const sName: string = data.supplier_name ?? f.filename ?? f.display_name ?? "Unknown";
              if (rows.length) {
                setStaged(prev => {
                  if (prev.find(s => s.supplierName === sName)) return prev;
                  return [...prev, { supplierName: sName, rows, fileName: f.filename ?? f.display_name ?? "", sheetName: "", headerRow: 0 }];
                });
              }
            } catch(e) { console.error("[auto-ingest] FAILED:", e); }
          }
        })();
        }).catch(()=>{});
    }
    setParsed(null); setSheetNames([]); setSelectedFile(null); setUploadFile(null); setSupplierName(""); setHeaderRow(0);
  };



  const downloadCSV = (filename: string, headers: string[], rows: unknown[][]) => {
    const esc = (v: unknown) => { const s=String(v??''); return /[,\n"]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
    const csv = [headers.map(esc).join(','), ...rows.map(r=>r.map(esc).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = filename; a.click();
  };

  const downloadXLSX = (filename: string, sheets: {name:string; headers:string[]; rows:unknown[][]}[]) => {
    if (typeof (window as any).XLSX !== 'undefined') {
      const XL = (window as any).XLSX;
      const wb = XL.utils.book_new();
      sheets.forEach(sh => { const ws=XL.utils.aoa_to_sheet([sh.headers,...sh.rows]); XL.utils.book_append_sheet(wb,ws,sh.name.slice(0,31)); });
      XL.writeFile(wb, filename);
    } else { sheets.forEach(sh => downloadCSV(`${sh.name}.csv`,sh.headers,sh.rows)); }
  };

  const handleDownload = (fmt: 'csv'|'xlsx') => {
    const abH = ['Item','Supplier','Category','UoM','Qty','Unit Price','Total','Delta vs Best'];
    const abR = sortedAllRows.map(r=>[String(r.lineItem??''),String(r.supplier??''),String(r.category??''),String(r.unitOfMeasure??''),Number(r.quantity??0),Number(r.unitPrice??0),Number(r.total??0),Number(r.delta??0)]);
    const cH = ['Item',...pivotSuppliers,'Lowest Price','Lowest Supplier','Highest Price','Highest Supplier','Avg Price','Spread %','Analysis'];
    const cR = pivot.map(r=>[String(r.item??''),...pivotSuppliers.map(s=>r[s]!=null?Number(r[s]):''),r.lowest_price!=null?Number(r.lowest_price):'',String(r.lowest_supplier??''),r.highest_price!=null?Number(r.highest_price):'',String(r.highest_supplier??''),r.avg_price!=null?+r.avg_price.toFixed(2):'',r.spread_pct!=null?Number(r.spread_pct):'',agentComment(r,pivotSuppliers)]);
    const pName = projects.find(p=>p.project_id===projectId)?.name??'project';
    const ts = new Date().toISOString().slice(0,10);
    if (fmt==='csv') {
      downloadCSV(`${pName}_all_bids_${ts}.csv`,abH,abR);
      if (pivot.length) downloadCSV(`${pName}_comparison_${ts}.csv`,cH,cR);
    } else {
      downloadXLSX(`${pName}_pricing_analysis_${ts}.xlsx`,[
        {name:'All Bids',headers:abH,rows:abR},
        ...(pivot.length?[{name:'Comparison',headers:cH,rows:cR}]:[]),
      ]);
    }
  };

  const removeSupplier = (name: string) => setStaged(prev=>prev.filter(s=>s.supplierName!==name));

  const handleSort = (col: string) => {
    if (sortCol===col) {
      if (sortDir==="asc") setSortDir("desc");
      else if (sortDir==="desc") { setSortDir(null); setSortCol(null); }
    } else { setSortCol(col); setSortDir("asc"); }
  };
  const handleCmpSort = (col: string) => {
    if (cmpSortCol===col) {
      if (cmpSortDir==="asc") setCmpSortDir("desc");
      else if (cmpSortDir==="desc") { setCmpSortDir(null); setCmpSortCol(null); }
    } else { setCmpSortCol(col); setCmpSortDir("asc"); }
  };

  const previewRows = parsed ? (parsed.rows??[]).slice(0,50) : [];
  const previewCols = previewRows.length > 0 ? Object.keys(previewRows[0]).filter(k=>!["id","delta"].includes(k)) : [];

  return (
    <div className="flex flex-col h-full min-h-screen bg-background text-foreground">

      {/* ── Header ── */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Pricing Analysis</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Compare supplier bids · identify savings · benchmark positions</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="h-8 w-52 rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>Select project…</option>
                {projects.map(p=><option key={p.id} value={p.project_id}>{p.name}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={()=>navigate("/scenario-builder")}>
              <BarChart3 className="w-3.5 h-3.5"/>Scenario Builder<ArrowRight className="w-3 h-3"/>
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={()=>navigate("/analysis")}>
              <FlaskConical className="w-3.5 h-3.5"/>Technical Analysis<ArrowRight className="w-3 h-3"/>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-6 overflow-auto">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:"Bids Received",    value: kpiCards.totalBids, sub:"line items",       cls:"border-primary/20 bg-primary/5 text-primary" },
            { label:"Suppliers",         value: kpiCards.suppliers,  sub:"in comparison",   cls:"border-accent/20 bg-accent/5 text-accent" },
            { label:"Potential Savings", value: kpiCards.savingsPct!=null?`${kpiCards.savingsPct}%`:"—", sub:"vs avg baseline", cls:"border-success/20 bg-success/5 text-success" },
            { label:"Lowest Unit Price", value: kpiCards.lowestBid!=null?fmt(kpiCards.lowestBid):"—",   sub:"across all items", cls:"border-warning/20 bg-warning/5 text-warning" },
          ].map(c=>(
            <div key={c.label} className={`rounded-lg border p-4 ${c.cls}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 min-h-0 flex-wrap lg:flex-nowrap">

          {/* ── Left: ingest panel ── */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-3">

            <div className="flex rounded-lg overflow-hidden border border-border text-xs font-medium">
              {(["project","upload"] as const).map(m=>(
                <button key={m} onClick={()=>{ setIngestMode(m); setParsed(null); setSheetNames([]); }}
                  className={`flex-1 py-2 transition-colors ${ingestMode===m?"bg-primary text-primary-foreground":"bg-card text-muted-foreground hover:text-foreground"}`}>
                  {m==="project"?"From Project":"Upload File"}
                </button>
              ))}
            </div>

            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Supplier Name</label>
                  <input value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Auto-detected"
                    className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"/>
                </div>

                {ingestMode==="project" ? (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Supplier Files {supplierFiles.length>0&&<span className="opacity-60">({supplierFiles.length})</span>}
                      {!projectLoading && projectLoadMsg && supplierFiles.length>0 && <span className="ml-1 text-[10px] text-success opacity-75">✓</span>}
                    </label>
                    {supplierFiles.length===0 ? (
                      <p className="text-xs text-muted-foreground bg-muted rounded-md p-3 border border-border">
                        No files yet.{" "}<button onClick={()=>setIngestMode("upload")} className="text-primary hover:underline">Upload?</button>
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                        {supplierFiles.map(f=>(
                          <button key={f.path} onClick={async()=>{
                            setSelectedFile(f);
                            if (!supplierName) setSupplierName(f.name);
                            try {
                              const fId = (f as any).id;
                              const isUUIDf = fId && /^[0-9a-f-]{36}$/i.test(fId);
                              const urlEp = isUUIDf
                                ? `${API}/files/${projectId}/${fId}/url`
                                : `${API}/files/${projectId}/supplier/${encodeURIComponent(f.filename??f.name)}/url`;
                              const urlRes = await fetch(urlEp, { headers:ah });
                              const { url } = await urlRes.json();
                              const blob = await fetch(url).then(r=>r.blob());
                              await doIngest(blob, f.filename??f.name, 0, f.name);
                            } catch {}
                          }}
                          className={`text-left px-3 py-2 rounded-md text-xs transition-colors border ${selectedFile?.path===f.path?"bg-primary/10 border-primary/40 text-primary":"bg-background border-border hover:border-primary/30"}`}>
                            <div className="font-medium truncate">{f.name}</div>
                            <div className="text-muted-foreground text-[10px] truncate mt-0.5">{f.filename}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bid Sheet</label>
                    <label className="flex flex-col items-center gap-2 border border-dashed border-border rounded-md p-4 cursor-pointer hover:border-primary/40 bg-background transition-colors">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                      </svg>
                      <span className="text-xs text-muted-foreground">{uploadFile?uploadFile.name:"Click to browse (.xlsx, .csv)"}</span>
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; setUploadFile(f); if(!supplierName) setSupplierName(f.name.replace(/\.[^.]+$/,"")); doIngest(f,f.name,0); }}/>
                    </label>
                  </div>
                )}

                {parsing&&(
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3.5 h-3.5 border border-border border-t-primary rounded-full animate-spin"/>Parsing…
                  </div>
                )}

                {sheetNames.length>1&&(
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sheet Tab</label>
                    <Select value={selectedSheet} onValueChange={async v=>{ setSelectedSheet(v); const pair=await getBlob(); if(pair) await doIngest(pair.blob,pair.fname,headerRow,undefined,v,false); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                      <SelectContent>{sheetNames.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-selected best sheet — change if needed.</p>
                  </div>
                )}

                {parsed&&(
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Header Row <span className="opacity-60">(0 = first row)</span></label>
                    <div className="flex gap-2 items-center">
                      <input type="number" min={0} max={20} value={headerRow}
                        onChange={e=>setHeaderRow(parseInt(e.target.value)||0)}
                        className="w-16 bg-background border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"/>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={async()=>{ const pair=await getBlob(); if(pair) await doIngest(pair.blob,pair.fname,headerRow,undefined,selectedSheet,true); }}>
                        Re-parse
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Increase if file has title rows above headers.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {(
              <Card>
                <CardHeader className="py-2 px-4 flex-row items-center justify-between">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">In Comparison</CardTitle>
                  {projectId&&staged.length>0&&<Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-primary" onClick={async()=>{
                    // files already persisted on confirm
                    const el=document.getElementById('save-toast');if(el){el.style.opacity='1';setTimeout(()=>{el.style.opacity='0';},2000);}
                  }}><Save className="w-3 h-3"/>Save</Button>}
                </CardHeader>
                <div id="save-toast" style={{opacity:0,transition:"opacity 0.4s"}} className="px-4 pb-1 text-[10px] text-success">✓ Saved to project</div>
                <CardContent className="px-4 pb-3 flex flex-col gap-1.5">
                  {staged.map((s,i)=>(
                    <div key={s.supplierName} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i%SUPPLIER_COLORS.length]}`}>{s.supplierName}</span>
                        <span className="text-xs text-muted-foreground">{s.rows.length} items</span>
                      </div>
                      <button onClick={()=>removeSupplier(s.supplierName)} className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs ml-2">✕</button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Parse preview */}
            {parsed&&(
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">Parse Preview</CardTitle>
                    <Badge variant="outline" className={`text-xs ${confidenceCls(parsed.diagnostics.parse_confidence)}`}>
                      {parsed.diagnostics.parse_confidence} confidence
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {parsed.diagnostics.accepted_line_items} rows accepted
                      {parsed.diagnostics.excluded_rows.length>0&&`, ${parsed.diagnostics.excluded_rows.length} excluded`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={()=>{ setParsed(null); setSheetNames([]); }}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={confirmRows}>✓ Add to Comparison</Button>
                  </div>
                </CardHeader>
                {parsed.diagnostics.warnings.length>0&&(
                  <div className="mx-4 mb-2 p-2 rounded-md bg-warning/5 border border-warning/20 text-xs text-warning space-y-0.5">
                    {parsed.diagnostics.warnings.map((w,i)=><div key={i}>⚠ {w}</div>)}
                  </div>
                )}
                <div className="overflow-auto border-t border-border max-h-52">
                  <table className="w-full text-xs min-w-full">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>{previewCols.map(c=><th key={c} className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {previewRows.length===0
                        ? <tr><td colSpan={previewCols.length} className="px-4 py-6 text-center text-muted-foreground">No rows — try increasing the header row number.</td></tr>
                        : previewRows.map((row,i)=>(
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              {previewCols.map(c=><td key={c} className="px-3 py-1.5 whitespace-nowrap">{row[c]!=null?String(row[c]):<span className="text-muted-foreground/40">—</span>}</td>)}
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── All Bids Table ── */}
            {(
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">All Bids</CardTitle>
                    <span className="text-xs text-muted-foreground">{allRows.length > 0 ? `${allRows.length} rows · ${staged.length} suppliers` : "No bids loaded — select a project or upload a file"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {allRows.length>0&&<><Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={()=>handleDownload('csv')}><Download className="w-3 h-3"/>CSV</Button><Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={()=>handleDownload('xlsx')}><Download className="w-3 h-3"/>XLSX</Button></>}
                    <span className="text-xs text-muted-foreground">Rows/page:</span>
                    {[10,20,50,100].map(n=>(
                      <button key={n} onClick={()=>setPageSize(n)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${pageSize===n?"bg-primary text-primary-foreground border-primary":"border-border text-muted-foreground hover:border-primary/40"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <div className="overflow-auto border-t border-border max-h-[380px]">
                  <table className="w-full text-xs min-w-full">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        {[
                          {col:"lineItem",label:"Item"}, {col:"supplier",label:"Supplier"},
                          {col:"category",label:"Category"}, {col:"unitOfMeasure",label:"UoM"},
                          {col:"quantity",label:"Qty"}, {col:"unitPrice",label:"Unit Price"},
                          {col:"total",label:"Total"}, {col:"delta",label:"Δ vs Best"},
                        ].map(({col,label})=>(
                          <SortHeader key={col} label={label} col={col} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((row,i)=>{
                        const delta = (row.delta as number)??0;
                        const sIdx  = staged.findIndex(s=>s.supplierName===row.supplier);
                        return (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-medium max-w-[180px] truncate">{String(row.lineItem??"—")}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${SUPPLIER_COLORS[(sIdx>=0?sIdx:0)%SUPPLIER_COLORS.length]}`}>{String(row.supplier??"—")}</span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{String(row.category??"—")}</td>
                            <td className="px-3 py-2 text-muted-foreground">{String(row.unitOfMeasure??"—")}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(row.quantity)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(row.unitPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(row.total)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={delta===0?"text-success font-semibold":delta>25?"text-destructive":"text-muted-foreground"}>
                                {delta===0?"✓ Best":`+${delta.toFixed(1)}%`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
                  <span>Showing {Math.min((page-1)*pageSize+1,allRows.length)}–{Math.min(page*pageSize,allRows.length)} of {allRows.length}</span>
                  <div className="flex gap-1">
                    <button onClick={()=>setPage(1)} disabled={page===1} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:border-primary/40">«</button>
                    <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:border-primary/40">‹</button>
                    <span className="px-3 py-1">Page {page} / {totalPages}</span>
                    <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:border-primary/40">›</button>
                    <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:border-primary/40">»</button>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Bid Comparison Table ── */}
            {true ? (
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">Bid Comparison</CardTitle>
                    <span className="text-xs text-muted-foreground">{pivot.length} SKUs · {pivotSuppliers.length} suppliers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={()=>navigate("/scenario-builder")}>
                      <BarChart3 className="w-3 h-3"/>Build Scenario
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={()=>navigate("/analysis")}>
                      <FlaskConical className="w-3 h-3"/>Technical Analysis
                    </Button>
                  </div>
                </CardHeader>
                <div className="overflow-auto border-t border-border max-h-[480px]">
                  <table className="w-full text-xs min-w-full">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <SortHeader label="Item" col="item" sortCol={cmpSortCol} sortDir={cmpSortDir} onSort={handleCmpSort}/>
                        {pivotSuppliers.map((s,i)=>(
                          <th key={s} className="px-3 py-2.5 text-right whitespace-nowrap border-b border-border">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SUPPLIER_COLORS[i%SUPPLIER_COLORS.length]}`}>{s}</span>
                          </th>
                        ))}
                        <SortHeader label="Lowest" col="lowest_price" sortCol={cmpSortCol} sortDir={cmpSortDir} onSort={handleCmpSort}/>
                        <SortHeader label="Highest" col="highest_price" sortCol={cmpSortCol} sortDir={cmpSortDir} onSort={handleCmpSort}/>
                        <SortHeader label="Avg" col="avg_price" sortCol={cmpSortCol} sortDir={cmpSortDir} onSort={handleCmpSort}/>
                        <SortHeader label="Spread %" col="spread_pct" sortCol={cmpSortCol} sortDir={cmpSortDir} onSort={handleCmpSort}/>
                        <th className="px-3 py-2.5 text-left text-muted-foreground font-medium border-b border-border min-w-[200px]">Analysis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivot.map((row,i)=>(
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 font-medium max-w-[160px] truncate">{String(row.item??"—")}</td>
                          {pivotSuppliers.map(s=>{
                            const val  = row[s] as number|null;
                            const low  = s===row.lowest_supplier;
                            const high = s===row.highest_supplier;
                            return (
                              <td key={s} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {val!=null
                                  ? <span className={low?"text-success font-semibold":high?"text-destructive":""}>
                                      {low&&"▼ "}{high&&"▲ "}{fmt(val)}
                                    </span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-success font-semibold">
                            {row.lowest_price!=null?<>{fmt(row.lowest_price)}{" "}<span className="text-muted-foreground/50 font-normal text-[10px]">({row.lowest_supplier})</span></>:"—"}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-destructive">
                            {row.highest_price!=null?<>{fmt(row.highest_price)}{" "}<span className="text-muted-foreground/50 font-normal text-[10px]">({row.highest_supplier})</span></>:"—"}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">{fmt(row.avg_price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className={(row.spread_pct??0)>25?"text-destructive font-semibold":(row.spread_pct??0)<5?"text-success":"text-warning"}>
                              {(row.spread_pct??0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-[11px] max-w-xs">{agentComment(row, pivotSuppliers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : !staged.length ? (
              <div className="flex-1 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <div className="text-5xl opacity-20 mb-3">📊</div>
                  <p className="text-muted-foreground text-sm">No bids loaded yet</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">
                    {ingestMode==="project"?"Select a supplier file from the left panel":"Upload a bid sheet (.xlsx or .csv)"}
                  </p>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>

      {/* ── Agent Ticker ── */}
      <div className="border-t border-border bg-card py-2 px-4 flex items-center gap-3 overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${agentLogs[0]?.status==="running"?"bg-primary animate-pulse":"bg-muted-foreground/30"}`}/>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Agent</span>
        </div>
        <p className="text-xs text-muted-foreground truncate flex-1">{tickerText}</p>
        {agentLogs[0]&&(
          <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${
            agentLogs[0].status==="complete"?"text-success border-success/30":
            agentLogs[0].status==="running" ?"text-primary border-primary/30":
            agentLogs[0].status==="error"   ?"text-destructive border-destructive/30":
            "text-muted-foreground"}`}>
            {agentLogs[0].status}
          </Badge>
        )}
      </div>
    </div>
  );
}
