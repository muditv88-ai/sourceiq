import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FilePlus,
  BarChart3,
  SlidersHorizontal,
  Mail,
  FileSpreadsheet,
} from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/rfp/new", icon: FilePlus, label: "New RFP" },
  { to: "/analysis", icon: BarChart3, label: "Analysis" },
  { to: "/scenarios", icon: SlidersHorizontal, label: "Scenarios" },
  { to: "/communications", icon: Mail, label: "Communications" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">ProcureIQ</h1>
            <p className="text-xs text-sidebar-foreground/60">RFP Evaluator</p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === to
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/50 text-xs text-sidebar-foreground/60">
          <p className="font-medium text-sidebar-foreground/80 mb-1">API Status</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>Connected to backend</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>

      {/* Global floating chat agent */}
      <ChatWidget />
    </div>
  );
}
