import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface SandboxFile {
  path: string;
  size: number;
}

export interface SandboxFilesResult {
  sandboxId: string;
  files: SandboxFile[];
}

export function useSandboxFiles(sessionId: number | null) {
  return useQuery<SandboxFilesResult, Error>({
    queryKey: ["sandbox-files", sessionId],
    queryFn: async () => {
      return customFetch<SandboxFilesResult>(`/api/sessions/${sessionId}/sandbox/files`);
    },
    enabled: !!sessionId,
  });
}

export function useSandboxFile(sessionId: number | null, path: string | null) {
  return useQuery<{ path: string; content: string }, Error>({
    queryKey: ["sandbox-file", sessionId, path],
    queryFn: async () => {
      return customFetch<{ path: string; content: string }>(
        `/api/sessions/${sessionId}/sandbox/files/${path}`
      );
    },
    enabled: !!sessionId && !!path,
  });
}
