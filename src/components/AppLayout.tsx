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
  Building2,
  LogOut,
  UserCircle2,
  FileImage,
  Activity,
  Files,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Bell,
  BellRing,
} from "lucide-react";
import { useState } from "react";
import ChatWidget from "@/components/ChatWidget";
import AgentActivityStrip from "@/components/AgentActivityStrip";
import { useAuth } from "@/contexts/AuthContext";
import { useAgents } from "@/contexts/AgentContext";
import { useComms } from "@/contexts/CommsContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Nav structure — grouped by Feature Map module
// ---------------------------------------------------------------------------
type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: "pulse-blue" | "pulse-green";
};

type NavGroup = {
  heading: string;
  items: NavItem[];
  collapsible?: boolean;
};

const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { to: "/",               icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    heading: "Sourcing",
    items: [
      { to: "/projects",       icon: FolderOpen,       label: "Projects" },
      { to: "/rfp/new",        icon: FilePlus,         label: "New RFP" },
      { to: "/documents",      icon: Files,            label: "Documents" },
      { to: "/drawings",       icon: FileImage,        label: "Drawings" },
    ],
  },
  {
    heading: "Suppliers",
    items: [
      { to: "/suppliers",          icon: Users,    label: "Supplier Responses" },
      { to: "/suppliers/manage",   icon: Building2, label: "Supplier Directory" },
      { to: "/communications",     icon: Mail,     label: "Communications" },
    ],
  },
  {
    heading: "Analysis & Award",
    items: [
      { to: "/analysis",       icon: BarChart3,         label: "Technical Analysis" },
      { to: "/pricing",        icon: DollarSign,        label: "Pricing Analysis" },
      { to: "/scenarios",      icon: SlidersHorizontal, label: "Award Scenarios" },
    ],
  },
  {
    heading: "Intelligence",
    collapsible: true,
    items: [
      { to: "/copilot",         icon: Sparkles,  label: "AI Copilot",      badge: "pulse-green" },
      { to: "/agent-analytics", icon: Activity,  label: "Agent Analytics", badge: "pulse-blue" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Badge dot (sidebar nav pulse)
// ---------------------------------------------------------------------------
const NavBadgeDot = ({ type }: { type: "pulse-blue" | "pulse-green" }) => (
  <span className={cn("ml-auto h-2 w-2 rounded-full animate-pulse",
    type === "pulse-blue" ? "bg-blue-400" : "bg-emerald-400"
  )} />
);

// ---------------------------------------------------------------------------
// Collapsible group
// ---------------------------------------------------------------------------
function NavGroupSection({ group, currentPath, hasActivity }: {
  group: NavGroup;
  currentPath: string;
  hasActivity: boolean;
}) {
  const isGroupActive = group.items.some(i => currentPath.startsWith(i.to) && i.to !== "/");
  const [open, setOpen] = useState(isGroupActive || !group.collapsible);
  const isActive = (to: string) => to === "/" ? currentPath === "/" : currentPath.startsWith(to);

  return (
    <div className="mb-1">
      <button
        onClick={() => group.collapsible && setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-1 px-3 py-1 mb-0.5",
          group.collapsible ? "cursor-pointer hover:text-sidebar-foreground/80 transition-colors" : "cursor-default pointer-events-none"
        )}
      >
        <span className="text-[10px] font-semibold tracking-wider uppercase text-sidebar-foreground/40 flex-1 text-left">{group.heading}</span>
        {group.collapsible && (open
          ? <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
          : <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
        )}
      </button>

      {open && (
        <div className="space-y-0.5">
          {group.items.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(to)
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {badge && (label === "Agent Analytics" ? hasActivity : true) && (
                <NavBadgeDot type={badge} />
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Bell (header) — reads unreadCount from CommsContext
// ---------------------------------------------------------------------------
function NotificationBell() {
  const { unreadCount, notifications, markAllRead } = useComms();
  const navigate = useNavigate();

  const recentUnread = notifications.filter(n => !n.read).slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" aria-label="Notifications">
          {unreadCount > 0
            ? <BellRing className="h-4 w-4" />
            : <Bell className="h-4 w-4" />
          }
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
          )}
        </div>
        {recentUnread.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
            All caught up!
          </div>
        ) : (
          <>
            {recentUnread.map(n => (
              <DropdownMenuItem key={n.id} className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer" onClick={() => { navigate("/communications"); }}>
                <span className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{n.message}</p>
                  {n.supplier && <p className="text-[10px] text-muted-foreground mt-0.5">{n.supplier}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.timestamp}</p>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-center text-primary cursor-pointer justify-center py-2" onClick={() => navigate("/communications")}>
              View all in Communications →
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// AppLayout
// ---------------------------------------------------------------------------
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();
  const { activities }   = useAgents();
  const hasActivity = activities.length > 0;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Logo */}
        <div className="p-6 pb-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">SourceIQ</h1>
            <p className="text-xs text-sidebar-foreground/60">Procurement Copilot</p>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-3 mt-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <NavGroupSection key={group.heading} group={group} currentPath={location.pathname} hasActivity={hasActivity} />
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
                <LogOut className="mr-2 h-4 w-4" /> Sign out
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

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar with notification bell */}
        <header className="h-12 shrink-0 flex items-center justify-end gap-2 px-6 border-b bg-background">
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-9">
          <div className="p-8">{children}</div>
        </main>
      </div>

      {/* Global floating chat agent */}
      <ChatWidget />

      {/* Agent Activity Strip — fixed bottom bar */}
      <AgentActivityStrip />
    </div>
  );
}
