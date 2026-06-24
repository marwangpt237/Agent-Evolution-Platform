import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  Terminal,
  MessageSquare,
  Map,
  CheckSquare,
  Box,
  Briefcase,
  Bot,
  Code,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Terminal },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/plans", label: "Plans", icon: Map },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/artifacts", label: "Artifacts", icon: Box },
  { href: "/workspaces", label: "Workspaces", icon: Briefcase },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/sandbox", label: "Sandbox", icon: Code },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 mr-3 shrink-0",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      {item.label}
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground dark">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 border-r border-border bg-card flex flex-col transition-transform duration-200 ease-in-out",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <Bot className="w-5 h-5 text-primary mr-2 shrink-0" />
          <span className="font-mono font-bold tracking-tight text-base text-primary">
            AlgDevs-AI
          </span>
          {/* Close button (mobile only) */}
          <button
            className="ml-auto md:hidden text-muted-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-border shrink-0">
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
            System Online
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="h-14 flex items-center px-4 border-b border-border bg-card shrink-0 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Bot className="w-5 h-5 text-primary mr-2" />
          <span className="font-mono font-bold tracking-tight text-base text-primary">
            AlgDevs-AI
          </span>
          {/* Current page name */}
          <span className="ml-auto text-sm text-muted-foreground capitalize">
            {navItems.find((n) => isActive(n.href))?.label ?? ""}
          </span>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col bg-background relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
          <div className="relative z-10 flex-1 overflow-y-auto">{children}</div>
        </main>

        {/* Mobile bottom nav — quick access to most-used pages */}
        <nav className="md:hidden flex border-t border-border bg-card shrink-0">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5 mb-0.5", active ? "text-primary" : "")} />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
