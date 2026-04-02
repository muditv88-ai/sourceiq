import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Upload,
  Star,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building2,
  Mail,
  Filter,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SupplierStatus = "Approved" | "Pending" | "Rejected" | "Restricted";
type SupplierTier = 1 | 2 | 3;

interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  commodity: string;
  geography: string;
  certifications: string[];
  status: SupplierStatus;
  tier: SupplierTier;
  onTimeDelivery: number; // percentage
  qualityScore: number;   // out of 100
  preferred: boolean;
}

// ── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: "S001", name: "Apex Components Ltd", contact: "Raj Mehta",
    email: "raj@apexcomp.com", commodity: "Direct Materials", geography: "India",
    certifications: ["ISO 9001", "IATF 16949"], status: "Approved", tier: 1,
    onTimeDelivery: 96, qualityScore: 88, preferred: true,
  },
  {
    id: "S002", name: "GlobalParts GmbH", contact: "Lisa Braun",
    email: "lisa@globalparts.de", commodity: "Capex", geography: "Germany",
    certifications: ["ISO 9001", "CE"], status: "Approved", tier: 1,
    onTimeDelivery: 91, qualityScore: 82, preferred: false,
  },
  {
    id: "S003", name: "SteelTech Asia", contact: "Wei Zhang",
    email: "w.zhang@steeltech.cn", commodity: "Direct Materials", geography: "China",
    certifications: ["ISO 14001"], status: "Pending", tier: 2,
    onTimeDelivery: 78, qualityScore: 71, preferred: false,
  },
  {
    id: "S004", name: "FastLog Carriers", contact: "Priya Nair",
    email: "priya@fastlog.in", commodity: "Logistics", geography: "India",
    certifications: ["ISO 9001"], status: "Approved", tier: 2,
    onTimeDelivery: 89, qualityScore: 79, preferred: false,
  },
  {
    id: "S005", name: "MRO Supplies Inc", contact: "Tom Carter",
    email: "tom@mrosupplies.us", commodity: "Indirect", geography: "USA",
    certifications: ["ISO 9001", "OSHA"], status: "Restricted", tier: 3,
    onTimeDelivery: 65, qualityScore: 60, preferred: false,
  },
];

const ONBOARDING_STAGES = [
  { key: "invited",   label: "Invited",     icon: Mail },
  { key: "profile",   label: "Profile",     icon: Building2 },
  { key: "docs",      label: "Documents",   icon: Upload },
  { key: "review",    label: "Under Review",icon: Clock },
  { key: "approved",  label: "Approved",    icon: CheckCircle },
];

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: SupplierStatus }) => {
  const map: Record<SupplierStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    Approved:   { variant: "default",     label: "Approved" },
    Pending:    { variant: "secondary",   label: "Pending" },
    Rejected:   { variant: "destructive", label: "Rejected" },
    Restricted: { variant: "outline",     label: "Restricted" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
};

// ── Score bar ─────────────────────────────────────────────────────────────────
const ScoreBar = ({ value, label }: { value: number; label: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          value >= 90 ? "bg-emerald-500" : value >= 75 ? "bg-amber-500" : "bg-red-500"
        }`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SupplierManagementPage() {
  const [search, setSearch] = useState("");
  const [selectedCommodity, setSelectedCommodity] = useState("All");

  const commodities = ["All", ...Array.from(new Set(MOCK_SUPPLIERS.map((s) => s.commodity)))];

  const filtered = MOCK_SUPPLIERS.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.commodity.toLowerCase().includes(search.toLowerCase()) ||
      s.geography.toLowerCase().includes(search.toLowerCase());
    const matchCommodity = selectedCommodity === "All" || s.commodity === selectedCommodity;
    return matchSearch && matchCommodity;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Supplier Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Directory, onboarding, and performance — Module 3</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" /> Bulk Invite (CSV)
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Suppliers",    value: MOCK_SUPPLIERS.length,                                            icon: Building2,    color: "text-blue-600" },
          { label: "Approved",           value: MOCK_SUPPLIERS.filter((s) => s.status === "Approved").length,    icon: CheckCircle,  color: "text-emerald-600" },
          { label: "Pending Onboarding", value: MOCK_SUPPLIERS.filter((s) => s.status === "Pending").length,    icon: Clock,        color: "text-amber-600" },
          { label: "Restricted",         value: MOCK_SUPPLIERS.filter((s) => s.status === "Restricted").length, icon: AlertTriangle, color: "text-red-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding Pipeline</TabsTrigger>
          <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
        </TabsList>

        {/* ── Directory Tab ── */}
        <TabsContent value="directory" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search supplier, commodity, geography…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {commodities.map((c) => (
                <Button
                  key={c}
                  variant={selectedCommodity === c ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCommodity(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Geography</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Certifications</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {s.preferred && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.contact}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{s.commodity}</TableCell>
                    <TableCell className="text-sm">{s.geography}</TableCell>
                    <TableCell>
                      <Badge variant="outline">Tier {s.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.certifications.map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Onboarding Pipeline Tab ── */}
        <TabsContent value="onboarding">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Onboarding Pipeline — FM-3.2</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="flex gap-4 min-w-max">
                  {ONBOARDING_STAGES.map(({ key, label, icon: Icon }) => (
                    <div key={key} className="w-52">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <div className="space-y-2">
                        {MOCK_SUPPLIERS
                          .filter((s) => {
                            if (key === "approved") return s.status === "Approved";
                            if (key === "review")   return s.status === "Restricted";
                            if (key === "invited")  return s.status === "Pending";
                            return false;
                          })
                          .map((s) => (
                            <div key={s.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
                              <p className="font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.commodity}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Scorecards Tab ── */}
        <TabsContent value="scorecards">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_SUPPLIERS.filter((s) => s.status === "Approved").map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{s.name}</CardTitle>
                    {s.preferred && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.commodity} · {s.geography}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScoreBar value={s.onTimeDelivery} label="On-Time Delivery" />
                  <ScoreBar value={s.qualityScore}   label="Quality Score" />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {s.certifications.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
