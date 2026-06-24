import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { Plan } from "@workspace/api-client-react";

export interface AgentExecuteInput {
  sessionId: number;
  brief: string;
}

export function useAgentExecute() {
  return useMutation<Plan, Error, AgentExecuteInput>({
    mutationFn: async (input) => {
      return customFetch<Plan>("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },
  });
}
