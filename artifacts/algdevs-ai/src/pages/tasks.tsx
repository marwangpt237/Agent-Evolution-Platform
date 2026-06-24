import { useState } from "react";
import { useListTasks, useCreateTask, useCancelTask, useRetryTask, useGetTaskStats } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const statusColor: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  queued: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  running: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground",
  paused: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const agentTypes = ["supervisor", "planner", "researcher", "coder", "reviewer"];

export default function Tasks() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterAgent, setFilterAgent] = useState<string>("");

  const { data: tasks, isLoading } = useListTasks({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: (filterStatus || undefined) as any,
    agentType: filterAgent || undefined,
  });
  const { data: stats } = useGetTaskStats();
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Task Queue</h1>
          <p className="text-muted-foreground mt-1 text-sm">Monitor agent tasks and execution status.</p>
        </div>
        <CheckSquare className="w-8 h-8 text-primary opacity-50" />
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {(["running", "completed", "failed", "pending"] as const).map((s) => (
            <Card key={s} className="bg-card border-border shadow-none cursor-pointer" onClick={() => setFilterStatus(filterStatus === s ? "" : s)}>
              <CardContent className="pt-4 pb-3">
                <div className={cn("text-2xl font-bold", s === "completed" ? "text-green-400" : s === "failed" ? "text-destructive" : s === "running" ? "text-yellow-400" : "text-foreground")}>
                  {(stats?.[s as keyof typeof stats] as number) ?? 0}
                </div>
                <div className="text-xs text-muted-foreground capitalize mt-1">{s}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {agentTypes.map((a) => (
          <Button
            key={a}
            variant={filterAgent === a ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterAgent(filterAgent === a ? "" : a)}
            className="text-xs font-mono"
          >
            {a}
          </Button>
        ))}
        {(filterStatus || filterAgent) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus(""); setFilterAgent(""); }}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-primary animate-pulse">Loading tasks...</div>
      ) : !tasks?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No tasks found{filterStatus || filterAgent ? " matching filters" : ""}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="bg-card border-border shadow-none">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge className={cn("text-xs border shrink-0", statusColor[task.status] ?? "")}>
                      {task.status}
                    </Badge>
                    <span className="text-sm font-medium truncate">{task.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">→ {task.agentType}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {format(new Date(task.createdAt), "HH:mm")}
                    </span>
                    {task.status === "failed" && (
                      <Button variant="ghost" size="icon" onClick={() => retryTask.mutate({ id: task.id })} title="Retry">
                        <RotateCcw className="w-3.5 h-3.5 text-primary" />
                      </Button>
                    )}
                    {(task.status === "running" || task.status === "queued" || task.status === "pending") && (
                      <Button variant="ghost" size="icon" onClick={() => cancelTask.mutate({ id: task.id })} title="Cancel">
                        <XCircle className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {task.errorMessage && (
                  <p className="text-xs text-destructive mt-2 truncate">{task.errorMessage}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
