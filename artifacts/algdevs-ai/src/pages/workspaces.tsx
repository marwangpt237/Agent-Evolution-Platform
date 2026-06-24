import { useState } from "react";
import { useListWorkspaces, useCreateWorkspace, useDeleteWorkspace } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function Workspaces() {
  const [newName, setNewName] = useState("");
  const { data: workspaces, isLoading } = useListWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createWorkspace.mutate({ data: { name: newName } }, { onSuccess: () => setNewName("") });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Workspaces</h1>
          <p className="text-muted-foreground mt-1 text-sm">Isolated environments for agent projects.</p>
        </div>
        <Briefcase className="w-8 h-8 text-primary opacity-50" />
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Workspace name..."
          className="bg-card border-border font-mono"
        />
        <Button onClick={handleCreate} disabled={createWorkspace.isPending || !newName.trim()}>
          <Plus className="w-4 h-4 mr-2" /> Create
        </Button>
      </div>

      {isLoading ? (
        <div className="text-primary animate-pulse">Loading workspaces...</div>
      ) : !workspaces?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No workspaces yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspaces.map((ws) => (
            <Card key={ws.id} className="bg-card border-border shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{ws.name}</CardTitle>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => deleteWorkspace.mutate({ id: ws.id })}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {ws.description && <p className="text-sm text-muted-foreground mb-3">{ws.description}</p>}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{ws.artifactCount} artifacts</span>
                  <span>{ws.taskCount} tasks</span>
                  <span className="ml-auto">{format(new Date(ws.createdAt), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
