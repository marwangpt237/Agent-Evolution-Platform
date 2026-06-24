import { useState } from "react";
import { useListAgents, useSpawnAgent, useStopAgent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, StopCircle, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const agentTypes = ["supervisor", "planner", "researcher", "coder", "reviewer"] as const;
type AgentType = typeof agentTypes[number];

const statusColor: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  busy: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  stopped: "bg-muted/50 text-muted-foreground/50",
  error: "bg-destructive/20 text-destructive border-destructive/30",
};

const agentDesc: Record<AgentType, string> = {
  supervisor: "Orchestrates pipelines",
  planner: "Decomposes tasks",
  researcher: "Gathers context",
  coder: "Writes & runs code",
  reviewer: "Validates outputs",
};

export default function Agents() {
  const [spawning, setSpawning] = useState<AgentType | null>(null);
  const { data: agents, isLoading } = useListAgents();
  const spawnAgent = useSpawnAgent();
  const stopAgent = useStopAgent();

  const handleSpawn = (agentType: AgentType) => {
    setSpawning(agentType);
    spawnAgent.mutate({ data: { agentType } }, { onSettled: () => setSpawning(null) });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 font-mono">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">Agent Fleet</h1>
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">Spawn and manage specialized AI agents.</p>
        </div>
        <Bot className="w-7 h-7 text-primary opacity-50 shrink-0 ml-4" />
      </div>

      <div>
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Spawn Agent</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {agentTypes.map((type) => (
            <Card
              key={type}
              className="bg-card border-border shadow-none cursor-pointer hover:border-primary/50 transition-colors active:scale-95"
              onClick={() => handleSpawn(type)}
            >
              <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                <Plus className={cn("w-4 h-4 text-primary", spawning === type && "animate-pulse")} />
                <div className="font-semibold text-xs capitalize">{type}</div>
                <div className="text-xs text-muted-foreground leading-tight">{agentDesc[type]}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Active Instances</h2>
        {isLoading ? (
          <div className="text-primary animate-pulse text-sm">Loading agents...</div>
        ) : !agents?.length ? (
          <div className="text-center py-10 text-muted-foreground">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No instances. Spawn one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <Card key={agent.id} className="bg-card border-border shadow-none">
                <CardContent className="py-2.5 px-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge className={cn("text-xs border shrink-0", statusColor[agent.status] ?? "")}>
                      {agent.status}
                    </Badge>
                    <span className="text-sm font-medium capitalize truncate">{agent.agentType}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {(agent.tokensUsed ?? 0).toLocaleString()} tok
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {format(new Date(agent.createdAt), "HH:mm")}
                    </span>
                    {agent.status !== "stopped" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => stopAgent.mutate({ id: agent.id })}>
                        <StopCircle className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
