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
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Execution Plans</h1>
          <p className="text-muted-foreground mt-1 text-sm">Define multi-step agentic workflows.</p>
        </div>
        <Map className="w-8 h-8 text-primary opacity-50" />
      </div>

      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New plan title..."
          className="bg-card border-border font-mono"
        />
        <Button onClick={handleCreate} disabled={createPlan.isPending || !newTitle.trim()}>
          <Plus className="w-4 h-4 mr-2" /> Create
        </Button>
      </div>

      {isLoading ? (
        <div className="text-primary animate-pulse">Loading plans...</div>
      ) : !plans?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Map className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No plans yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="bg-card border-border shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{plan.title}</CardTitle>
                    <Badge className={cn("text-xs border", statusColor[plan.status] ?? statusColor.draft)}>
                      {plan.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => executePlan.mutate({ id: plan.id })}
                      disabled={plan.status === "executing"}
                      title="Execute plan"
                    >
                      <Play className="w-4 h-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
                    >
                      {expanded === plan.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => deletePlan.mutate({ id: plan.id })}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                  <span>{plan.completedSteps}/{plan.totalSteps} steps</span>
                  <span>{format(new Date(plan.createdAt), "MMM d, HH:mm")}</span>
                </div>
              </CardHeader>
              {expanded === plan.id && (
                <CardContent>
                  <div className="h-px bg-border mb-3" />
                  {plan.totalSteps === 0 ? (
                    <p className="text-sm text-muted-foreground">No steps defined.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Steps visible on plan detail view.</p>
                  )}
                  {plan.description && (
                    <p className="text-sm text-foreground mt-2">{plan.description}</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
