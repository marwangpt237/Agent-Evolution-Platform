import { useState } from "react";
import { useListPlans, useCreatePlan, useExecutePlan, useDeletePlan } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Plus, Play, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  executing: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function Plans() {
  const [newTitle, setNewTitle] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: plans, isLoading } = useListPlans();
  const createPlan = useCreatePlan();
  const executePlan = useExecutePlan();
  const deletePlan = useDeletePlan();

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createPlan.mutate({ data: { title: newTitle } }, { onSuccess: () => setNewTitle("") });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 font-mono">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">Execution Plans</h1>
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">Multi-step agentic workflows.</p>
        </div>
        <Map className="w-7 h-7 text-primary opacity-50 shrink-0 ml-4" />
      </div>

      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New plan title..."
          className="bg-card border-border font-mono text-sm"
        />
        <Button onClick={handleCreate} disabled={createPlan.isPending || !newTitle.trim()} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 md:mr-2" />
          <span className="hidden md:inline">Create</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-primary animate-pulse text-sm">Loading plans...</div>
      ) : !plans?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Map className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No plans yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Card key={plan.id} className="bg-card border-border shadow-none">
              <CardHeader className="pb-2 pt-3 px-3 md:px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge className={cn("text-xs border shrink-0", statusColor[plan.status] ?? statusColor.draft)}>
                      {plan.status}
                    </Badge>
                    <CardTitle className="text-sm truncate">{plan.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => executePlan.mutate({ id: plan.id })}
                      disabled={plan.status === "executing"}>
                      <Play className="w-3.5 h-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}>
                      {expanded === plan.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => deletePlan.mutate({ id: plan.id })}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  <span>{plan.completedSteps}/{plan.totalSteps} steps</span>
                  <span>{format(new Date(plan.createdAt), "MMM d, HH:mm")}</span>
                </div>
              </CardHeader>
              {expanded === plan.id && (
                <CardContent className="px-3 md:px-4 pb-3">
                  <div className="h-px bg-border mb-2" />
                  {plan.description
                    ? <p className="text-sm text-foreground">{plan.description}</p>
                    : <p className="text-sm text-muted-foreground">No description.</p>}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
