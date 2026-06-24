import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Layout from "./components/layout";
import Dashboard from "./pages/dashboard";
import Chat from "./pages/chat";
import Plans from "./pages/plans";
import Tasks from "./pages/tasks";
import Artifacts from "./pages/artifacts";
import Workspaces from "./pages/workspaces";
import Agents from "./pages/agents";
import Sandbox from "./pages/sandbox";
import Settings from "./pages/settings";

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
      <Route path="/" component={Dashboard} />
      <Route path="/chat" component={Chat} />
      <Route path="/plans" component={Plans} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/artifacts" component={Artifacts} />
      <Route path="/workspaces" component={Workspaces} />
      <Route path="/agents" component={Agents} />
      <Route path="/sandbox" component={Sandbox} />
      <Route path="/settings" component={Settings} />
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
