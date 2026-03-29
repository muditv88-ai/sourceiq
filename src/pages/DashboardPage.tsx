import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FilePlus,
  BarChart3,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  ArrowRight,
  Users,
  CheckCircle2,
} from "lucide-react";
import type { RfpSummary } from "@/lib/types";

// Demo data — replace with API calls when backend is live
const recentRfps: RfpSummary[] = [
  { id: "rfp-001", filename: "IT_Infrastructure_RFP_2025.xlsx", status: "analyzed", created_at: "2025-03-28", supplier_count: 5 },
  { id: "rfp-002", filename: "Cloud_Services_RFP.xlsx", status: "parsed", created_at: "2025-03-27", supplier_count: 3 },
  { id: "rfp-003", filename: "Security_Audit_RFP.xlsx", status: "uploaded", created_at: "2025-03-26" },
];

const statusConfig = {
  uploaded: { label: "Uploaded", color: "bg-info/10 text-info", icon: FileSpreadsheet },
  parsed: { label: "Parsed", color: "bg-warning/10 text-warning", icon: Clock },
  analyzed: { label: "Analyzed", color: "bg-success/10 text-success", icon: CheckCircle2 },
};

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage and evaluate your procurement RFPs
          </p>
        </div>
        <Button onClick={() => navigate("/rfp/new")} className="gap-2">
          <FilePlus className="h-4 w-4" />
          New RFP
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Active RFPs", value: "3", icon: FileSpreadsheet, trend: "+1 this week" },
          { label: "Suppliers Evaluated", value: "12", icon: Users, trend: "across 3 RFPs" },
          { label: "Avg Score", value: "74.2", icon: TrendingUp, trend: "+3.1 vs last month" },
          { label: "Pending Reviews", value: "2", icon: Clock, trend: "1 urgent" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.trend}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent RFPs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent RFPs</CardTitle>
          <CardDescription>Your latest procurement evaluations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentRfps.map((rfp) => {
              const sc = statusConfig[rfp.status];
              return (
                <div
                  key={rfp.id}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() =>
                    rfp.status === "analyzed"
                      ? navigate("/analysis")
                      : navigate("/rfp/new")
                  }
                >
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{rfp.filename}</p>
                    <p className="text-sm text-muted-foreground">{rfp.created_at}</p>
                  </div>
                  {rfp.supplier_count && (
                    <span className="text-sm text-muted-foreground">
                      {rfp.supplier_count} suppliers
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.color}`}>
                    {sc.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate("/rfp/new")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FilePlus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Upload New RFP</p>
              <p className="text-sm text-muted-foreground">Start a new evaluation</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate("/scenarios")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="font-semibold">Run Scenarios</p>
              <p className="text-sm text-muted-foreground">What-if analysis</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate("/communications")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="font-semibold">Pending Clarifications</p>
              <p className="text-sm text-muted-foreground">2 emails to send</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
