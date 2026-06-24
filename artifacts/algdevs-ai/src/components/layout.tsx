import { Link, useLocation } from "wouter";
import { 
  Terminal, 
  MessageSquare, 
  Map, 
  CheckSquare, 
  Box, 
  Briefcase, 
  Bot, 
  Code, 
  Settings 
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Bot className="w-6 h-6 text-primary mr-2" />
          <span className="font-mono font-bold tracking-tight text-lg text-primary">AlgDevs-AI</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 mr-3", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
            System Online
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="relative z-10 flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
