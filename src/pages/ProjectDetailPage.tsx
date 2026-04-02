import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Clock,
  FileText,
  Users,
  BarChart3,
  Calendar,
  CheckCircle2,
  Circle,
  AlertCircle,
  Folder,
  Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type LifecycleStage =
  | "Draft RFP"
  | "RFP Active"
  | "Responses Due"
  | "Evaluation"
  | "Awarded"
  | "Closed";

const LIFECYCLE_STAGES: LifecycleStage[] = [
  "Draft RFP",
  "RFP Active",
  "Responses Due",
  "Evaluation",
  "Awarded",
  "Closed",
];

interface TimelineEvent {
  date: string;
  label: string;
  done: boolean;
}

interface AuditEntry {
  ts: string;
  user: string;
  action: string;
}

// ── Mock project ──────────────────────────────────────────────────────────────
const MOCK_PROJECT = {
  id: "P001",
  name: "Industrial Fasteners Q3",
  category: "Direct Materials",
  stage: "RFP Active" as LifecycleStage,
  deadline: "2026-05-15",
  responseRate: 60,
  activeRfps: 2,
  savingsAchieved: 12400,
  daysToDeadline: 43,
  team: [
    { name: "Mudit V", role: "Owner" },
    { name: "Priya K", role: "Collaborator" },
    { name: "James T", role: "Viewer" },
  ],
  timeline: [
    { date: "2026-03-20", label: "RFP Launched",       done: true },
    { date: "2026-04-01", label: "R1 Responses Due",   done: true },
    { date: "2026-04-20", label: "R2 Negotiations",    done: false },
    { date: "2026-05-01", label: "Final Evaluation",   done: false },
    { date: "2026-05-15", label: "Award",               done: false },
  ] as TimelineEvent[],
  audit: [
    { ts: "2026-04-02 09:14", user: "Mudit V",  action: "Uploaded R1 supplier response for Apex Components" },
    { ts: "2026-04-01 17:30", user: "Priya K",  action: "Sent deadline reminder to 3 suppliers" },
    { ts: "2026-03-25 11:00", user: "Mudit V",  action: "Activated RFP and notified suppliers" },
    { ts: "2026-03-20 09:00", user: "System",   action: "RFP created from AI builder" },
  ] as AuditEntry[],
};

// ── Lifecycle stepper ─────────────────────────────────────────────────────────
const LifecycleStepper = ({ current }: { current: LifecycleStage }) => {
  const currentIdx = LIFECYCLE_STAGES.indexOf(current);
  return (
    <div className="flex items-center gap-0">
      {LIFECYCLE_STAGES.map((stage, idx) => (
        <div key={stage} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
              idx < currentIdx
                ? "bg-primary border-primary text-primary-foreground"
                : idx === currentIdx
                ? "border-primary text-primary"
                : "border-muted text-muted-foreground"
            }`}>
              {idx < currentIdx ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
            </div>
            <span className={`text-[10px] mt-1 whitespace-nowrap ${
              idx === currentIdx ? "text-primary font-medium" : "text-muted-foreground"
            }`}>{stage}</span>
          </div>
          {idx < LIFECYCLE_STAGES.length - 1 && (
            <div className={`h-0.5 w-10 mx-1 mb-5 ${
              idx < currentIdx ? "bg-primary" : "bg-muted"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
};

// ── Countdown timer ───────────────────────────────────────────────────────────
const Countdown = ({ days }: { days: number }) => (
  <div className="flex gap-3">
    {[
      { val: days,               unit: "days" },
      { val: (days * 24) % 24,   unit: "hrs" },
      { val: Math.floor(Math.random() * 59), unit: "min" },
    ].map(({ val, unit }) => (
      <div key={unit} className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums">{String(val).padStart(2, "0")}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    ))}
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = MOCK_PROJECT; // TODO: fetch by id from API

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate("/projects")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{project.category}</Badge>
            <Badge>{project.stage}</Badge>
          </div>
        </div>
        <Countdown days={project.daysToDeadline} />
      </div>

      {/* Lifecycle stepper */}
      <Card>
        <CardContent className="pt-5 pb-5 overflow-x-auto">
          <LifecycleStepper current={project.stage} />
        </CardContent>
      </Card>

      {/* KPI strip — FM-1.1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active RFPs",        value: project.activeRfps,                      icon: FileText,  color: "text-blue-600" },
          { label: "Response Rate",      value: `${project.responseRate}%`,              icon: BarChart3, color: "text-emerald-600" },
          { label: "Days to Deadline",   value: project.daysToDeadline,                  icon: Clock,     color: "text-amber-600" },
          { label: "Savings Achieved",   value: `$${project.savingsAchieved.toLocaleString()}`, icon: CheckCircle2, color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabs: Timeline + Docs + Team */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline"><Calendar className="h-3.5 w-3.5 mr-1.5" />Timeline</TabsTrigger>
              <TabsTrigger value="documents"><Folder className="h-3.5 w-3.5 mr-1.5" />Documents</TabsTrigger>
              <TabsTrigger value="team"><Users className="h-3.5 w-3.5 mr-1.5" />Team</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <Card>
                <CardContent className="pt-5 space-y-4">
                  {project.timeline.map((ev) => (
                    <div key={ev.label} className="flex items-center gap-3">
                      {ev.done
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                      <div className="flex-1">
                        <p className={`text-sm ${ev.done ? "line-through text-muted-foreground" : "font-medium"}`}>{ev.label}</p>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{ev.date}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                    <Folder className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">Document Vault</p>
                    <p className="text-xs text-muted-foreground max-w-xs">Store RFP docs, drawings, and supplier responses here. FM-1.5 — wire to GCS bucket.</p>
                    <Button size="sm" variant="outline">
                      <FileText className="h-4 w-4 mr-2" /> Upload Document
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team">
              <Card>
                <CardContent className="pt-5 space-y-3">
                  {project.team.map((m) => (
                    <div key={m.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {m.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="text-sm font-medium">{m.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{m.role}</Badge>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <Users className="h-4 w-4 mr-2" /> Add Team Member
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Activity / Audit trail — FM-1.6 */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.audit.map((a) => (
                <div key={a.ts} className="flex gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs leading-relaxed">{a.action}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{a.ts} · {a.user}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
