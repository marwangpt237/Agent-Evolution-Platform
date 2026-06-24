import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Layout from "@/components/layout";
import AgentDashboard from "@/pages/agent-dashboard";
import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import Plans from "@/pages/plans";
import Tasks from "@/pages/tasks";
import Artifacts from "@/pages/artifacts";
import Workspaces from "@/pages/workspaces";
import Agents from "@/pages/agents";
import Sandbox from "@/pages/sandbox";
import Settings from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Agent Workspace - Main page (mobile-friendly) */}
      <Route path="/" component={AgentDashboard} />
      
      {/* Task-specific workspace */}
      <Route path="/workspace/:taskId" component={AgentDashboard} />
      
      {/* Dashboard */}
      <Route path="/dashboard" component={Dashboard} />
      
      {/* Chat Interface */}
      <Route path="/chat" component={Chat} />
      <Route path="/chat/:sessionId" component={Chat} />
      
      {/* Plans */}
      <Route path="/plans" component={Plans} />
      <Route path="/plans/:id" component={Plans} />
      
      {/* Tasks List & Detail */}
      <Route path="/tasks" component={Tasks} />
      <Route path="/tasks/:id" component={Tasks} />
      
      {/* Artifacts */}
      <Route path="/artifacts" component={Artifacts} />
      
      {/* Workspaces */}
      <Route path="/workspaces" component={Workspaces} />
      
      {/* Agents */}
      <Route path="/agents" component={Agents} />
      
      {/* Sandbox */}
      <Route path="/sandbox" component={Sandbox} />
      
      {/* Settings */}
      <Route path="/settings" component={Settings} />
      
      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
