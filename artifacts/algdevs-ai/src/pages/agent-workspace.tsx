import { useState, useEffect, useMemo } from "react";
import { useListSessions, useCreateSession, useListPlans, useListTasks } from "@workspace/api-client-react";
import { useEventStream } from "@/hooks/use-event-stream";
import { useAgentExecute } from "@/hooks/use-agent-execute";
import { useSandboxFiles, useSandboxFile } from "@/hooks/use-sandbox-files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Bot,
  Play,
  Plus,
  Terminal,
  FileText,
  Box,
  CheckSquare,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";

const statusColor: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function AgentWorkspace() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("timeline");

  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const { data: plans, isLoading: plansLoading } = useListPlans();
  const { data: tasks } = useListTasks();
  const createSession = useCreateSession();
  const agentExecute = useAgentExecute();
  const { events, connected } = useEventStream(["task", "plan", "artifact", "agent"]);
  const { data: sandboxFiles } = useSandboxFiles(activeSessionId);
  const { data: fileContent } = useSandboxFile(activeSessionId, selectedFile);

  // When a new session is created, select it
  useEffect(() => {
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const activeSession = useMemo(
    () => sessions?.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const sessionPlans = useMemo(
    () => plans?.filter((p) => p.sessionId === activeSessionId) ?? [],
    [plans, activeSessionId]
  );

  const sessionTasks = useMemo(
    () => tasks?.filter((t) => t.sessionId === activeSessionId) ?? [],
    [tasks, activeSessionId]
  );

  const sessionEvents = useMemo(
    () => events.filter((e) => e.entityId === activeSessionId || e.entityType === "task" || e.entityType === "plan"),
    [events, activeSessionId]
  );

  const handleCreateSession = () => {
    createSession.mutate(
      { data: { title: "New Mission", mode: "agent" } },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
        },
      }
    );
  };

  const handleExecute = () => {
    if (!activeSessionId || !brief.trim()) return;
    agentExecute.mutate(
      { sessionId: activeSessionId, brief: brief.trim() },
      {
        onSuccess: () => {
          setBrief("");
          setActiveTab("timeline");
        },
      }
    );
  };

  return (
    <div className="h-full flex flex-col font-mono">
      {/* Top bar */}
      <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-card">
        <Bot className="w-5 h-5 text-primary" />
        <span className="font-bold tracking-tight">Agent Workspace</span>
        <div className="ml-auto flex items-center gap-3">
          {connected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-destructive" />
          )}
          <Button size="sm" variant="outline" onClick={handleCreateSession} disabled={createSession.isPending}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Mission
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: sessions */}
        <div className="w-64 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Missions</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sessionsLoading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
              ) : !sessions?.length ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No missions yet.</div>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      activeSessionId === session.id
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <div className="font-medium truncate">{session.title}</div>
                    <div className="text-xs opacity-60">{session.mode}</div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main workspace */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Brief input area */}
          <div className="p-4 border-b border-border bg-card shrink-0">
            <div className="flex gap-2">
              <Input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExecute()}
                placeholder={activeSessionId ? "Describe your mission... (e.g., Research AI agents and write a report)" : "Select or create a mission first"}
                disabled={!activeSessionId || agentExecute.isPending}
                className="bg-background border-border font-mono text-sm"
              />
              <Button
                onClick={handleExecute}
                disabled={!activeSessionId || !brief.trim() || agentExecute.isPending}
                className="shrink-0"
              >
                {agentExecute.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <Play className="w-4 h-4 mr-1.5" />
                )}
                Run
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The agent will create a plan, use tools (Python, bash, APIs), and deliver artifacts.
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-3 justify-start bg-card border border-border">
              <TabsTrigger value="timeline" className="text-xs">
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="files" className="text-xs">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Files
              </TabsTrigger>
              <TabsTrigger value="artifacts" className="text-xs">
                <Box className="w-3.5 h-3.5 mr-1.5" />
                Artifacts
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs">
                <Terminal className="w-3.5 h-3.5 mr-1.5" />
                Logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="flex-1 overflow-hidden m-0 px-4 pb-4">
              <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 mt-0">
                {/* Plans */}
                <Card className="bg-card border-border shadow-none flex flex-col">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Plans</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                    <ScrollArea className="h-full">
                      <div className="space-y-2">
                        {plansLoading ? (
                          <div className="text-sm text-muted-foreground">Loading...</div>
                        ) : !sessionPlans.length ? (
                          <div className="text-sm text-muted-foreground py-8 text-center">
                            No plans yet. Enter a mission above.
                          </div>
                        ) : (
                          sessionPlans.map((plan) => (
                            <div key={plan.id} className="border border-border rounded-md p-2.5">
                              <div className="flex items-center gap-2">
                                <Badge className={cn("text-xs border", statusColor[plan.status] ?? statusColor.pending)}>
                                  {plan.status}
                                </Badge>
                                <span className="text-sm font-medium">{plan.title}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {plan.completedSteps}/{plan.totalSteps} steps
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Tasks */}
                <Card className="bg-card border-border shadow-none flex flex-col">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Tasks</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                    <ScrollArea className="h-full">
                      <div className="space-y-2">
                        {!sessionTasks.length ? (
                          <div className="text-sm text-muted-foreground py-8 text-center">No tasks yet.</div>
                        ) : (
                          sessionTasks.map((task) => (
                            <div key={task.id} className="border border-border rounded-md p-2.5">
                              <div className="flex items-center gap-2">
                                <Badge className={cn("text-xs border", statusColor[task.status] ?? statusColor.pending)}>
                                  {task.status}
                                </Badge>
                                <span className="text-sm font-medium">{task.title}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">→ {task.agentType}</div>
                              {task.output && (
                                <pre className="text-xs text-muted-foreground mt-2 bg-background p-2 rounded border border-border line-clamp-4">
                                  {task.output}
                                </pre>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="files" className="flex-1 overflow-hidden m-0 px-4 pb-4">
              <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-1 bg-card border-border shadow-none flex flex-col">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Workspace Files</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                    <ScrollArea className="h-full">
                      {!sandboxFiles?.files.length ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">No files yet.</div>
                      ) : (
                        <div className="space-y-1">
                          {sandboxFiles.files.map((file) => (
                            <button
                              key={file.path}
                              onClick={() => setSelectedFile(file.path.replace(/^\//, ""))}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors",
                                selectedFile === file.path.replace(/^\//, "")
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground hover:bg-accent"
                              )}
                            >
                              <div className="truncate">{file.path}</div>
                              <div className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 bg-card border-border shadow-none flex flex-col">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                      {selectedFile ?? "Select a file"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                    <ScrollArea className="h-full">
                      {fileContent ? (
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-background p-3 rounded border border-border">
                          {fileContent.content}
                        </pre>
                      ) : (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          Select a file from the workspace to view its contents.
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="artifacts" className="flex-1 overflow-hidden m-0 px-4 pb-4">
              <Card className="bg-card border-border shadow-none h-full flex flex-col">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Generated Artifacts</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                  <ScrollArea className="h-full">
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      Artifacts created by the agent will appear here. Visit the Artifacts page for full management.
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="flex-1 overflow-hidden m-0 px-4 pb-4">
              <Card className="bg-card border-border shadow-none h-full flex flex-col">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Live Event Log</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden px-3 pb-3">
                  <ScrollArea className="h-full">
                    <div className="space-y-2">
                      {sessionEvents.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">No events yet.</div>
                      ) : (
                        sessionEvents.map((event, i) => (
                          <div key={i} className="text-xs border-b border-border/50 pb-2 last:border-0">
                            <span className="font-bold text-primary uppercase">[{event.eventType}]</span>{" "}
                            <span className="text-foreground">{event.description}</span>
                            {event.metadata && (
                              <pre className="text-muted-foreground mt-1 text-[10px] line-clamp-2">
                                {event.metadata}
                              </pre>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
