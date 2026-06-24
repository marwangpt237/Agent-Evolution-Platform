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
  supervisor: "Orchestrates multi-agent pipelines",
  planner: "Decomposes tasks into executable steps",
  researcher: "Gathers information and context",
  coder: "Writes and executes code",
  reviewer: "Reviews and validates agent outputs",
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
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Agent Fleet</h1>
          <p className="text-muted-foreground mt-1 text-sm">Spawn and manage specialized AI agents.</p>
        </div>
        <Bot className="w-8 h-8 text-primary opacity-50" />
      </div>

      {/* Spawn panel */}
      <div>
        <h2 className="text-sm text-muted-foreground uppercase tracking-widest mb-3">Spawn Agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agentTypes.map((type) => (
            <Card
              key={type}
              className="bg-card border-border shadow-none cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => handleSpawn(type)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm capitalize">{type}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{agentDesc[type]}</div>
                </div>
                <Button
                  size="icon" variant="ghost"
                  disabled={spawning === type || spawnAgent.isPending}
                >
                  <Plus className={cn("w-4 h-4 text-primary", spawning === type && "animate-pulse")} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Running agents */}
      <div>
        <h2 className="text-sm text-muted-foreground uppercase tracking-widest mb-3">Active Instances</h2>
        {isLoading ? (
          <div className="text-primary animate-pulse">Loading agents...</div>
        ) : !agents?.length ? (
          <div className="text-center py-10 text-muted-foreground">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No agent instances. Spawn one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <Card key={agent.id} className="bg-card border-border shadow-none">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-xs border", statusColor[agent.status] ?? "")}>
                      {agent.status}
                    </Badge>
                    <span className="text-sm font-medium capitalize">{agent.agentType}</span>
                    {agent.model && (
                      <span className="text-xs text-muted-foreground">→ {agent.model}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {(agent.tokensUsed ?? 0).toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(agent.createdAt), "HH:mm")}
                    </span>
                    {agent.status !== "stopped" && (
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => stopAgent.mutate({ id: agent.id })}
                      >
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
