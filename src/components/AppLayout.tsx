import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FilePlus,
  BarChart3,
  SlidersHorizontal,
  Mail,
  FileSpreadsheet,
  DollarSign,
  FolderOpen,
  Users,
  LogOut,
  UserCircle2,
  FileImage,
  Activity,
  Files,
} from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import AgentActivityStrip from "@/components/AgentActivityStrip";
import { useAuth } from "@/contexts/AuthContext";
import { useAgents } from "@/contexts/AgentContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/",               icon: LayoutDashboard,  label: "Dashboard" },
  { to: "/projects",       icon: FolderOpen,        label: "Projects" },
  { to: "/rfp/new",        icon: FilePlus,          label: "New RFP" },
  { to: "/documents",      icon: Files,             label: "Documents" },
  { to: "/suppliers",      icon: Users,             label: "Suppliers" },
  { to: "/analysis",       icon: BarChart3,         label: "Technical Analysis" },
  { to: "/pricing",        icon: DollarSign,        label: "Pricing Analysis" },
  { to: "/scenarios",      icon: SlidersHorizontal, label: "Scenarios" },
  { to: "/drawings",       icon: FileImage,         label: "Drawings" },
  { to: "/communications", icon: Mail,              label: "Communications" },
  { to: "/agent-analytics",icon: Activity,          label: "Agent Analytics" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activities } = useAgents();

  const hasActivity = activities.length > 0;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">SourceIQ</h1>
            <p className="text-xs text-sidebar-foreground/60">RFP Evaluator</p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === to
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {label === "Agent Analytics" && hasActivity && (
                <span className="ml-auto h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User menu */}
        <div className="p-3 mx-3 mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
                <UserCircle2 className="h-5 w-5 shrink-0" />
                <span className="truncate">{user?.username}</span>
                <span className="ml-auto text-xs text-sidebar-foreground/40 capitalize">{user?.role}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{user?.username}</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* API Status */}
        <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/50 text-xs text-sidebar-foreground/60">
          <p className="font-medium text-sidebar-foreground/80 mb-1">API Status</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>Connected to backend</span>
          </div>
        </div>
      </aside>

      {/* Main content — padded at bottom to clear the strip */}
      <main className="flex-1 overflow-y-auto pb-9">
        <div className="p-8">{children}</div>
      </main>

      {/* Global floating chat agent */}
      <ChatWidget />

      {/* Agent Activity Strip — fixed bottom bar */}
      <AgentActivityStrip />
    </div>
  );
}
