# Manus-like Implementation — What Changed

This document lists the concrete changes made to transform AlgDevs-AI from a static agent dashboard into a Manus-style autonomous agent workspace.

## Backend Changes

### 1. Persistent sandbox per session
- Added `sandboxId` column to the `sessions` table.
- Created `src/lib/tools/sandbox.ts` to manage E2B sandboxes:
  - `getOrCreateSandbox(sessionId)` — creates or reuses a sandbox for a session.
  - `runSandboxCommand`, `readSandboxFile`, `writeSandboxFile`, `listSandboxFiles`, `closeSandbox`.

### 2. Tool registry (CodeAct-style)
- Created `src/lib/tools/types.ts` — tool definitions, tool calls, tool results.
- Created `src/lib/tools/registry.ts` — registers and executes tools:
  - `python` — execute Python in the persistent sandbox.
  - `bash` — execute shell commands.
  - `file_read`, `file_write`, `file_list` — workspace file operations.
  - `api_request` — HTTP requests.
  - `artifact_create` — save generated outputs as artifacts.

### 3. Agent executor
- Created `src/lib/agent/types.ts` — execution context and result types.
- Created `src/lib/agent/executor.ts` — `executeAgentTask()`:
  - Builds a tool prompt for the LLM.
  - Parses JSON tool calls from the LLM response.
  - Executes tools in a loop (up to 10 iterations).
  - Broadcasts reasoning and tool events in real time.
  - Saves task output and marks tasks completed.
- `executePlanStep()` — executes a single plan step as the right agent type.

### 4. Planner agent
- Created `src/lib/agent/planner.ts` — `createPlanFromBrief()` and `replanAfterFailure()`:
  - Uses the LLM to decompose a brief into steps.
  - Each step is assigned an agent type and dependencies.

### 5. Real-time events via SSE
- Created `src/lib/events-stream.ts` — in-memory event bus with `broadcastEvent()` and `subscribeToEvents()`.
- Added `GET /api/events/stream` endpoint in `src/routes/events-stream.ts`.
- The frontend can subscribe to live task/plan/artifact/agent events.

### 6. Task queue now executes real agent logic
- Updated `src/lib/queue.ts` — `executeTaskLogic()` now calls `executeAgentTask()`.
- Pending tasks from any source are picked up and executed autonomously.

### 7. New API routes
- `POST /api/agent/execute` — accepts `{ sessionId, brief }`, creates a plan from the brief, and starts background execution.
- `GET /api/sessions/:sessionId/sandbox/files` — list files in the session sandbox.
- `GET /api/sessions/:sessionId/sandbox/files/*` — read a specific file from the session sandbox.
- All new routes are wired in `src/routes/index.ts`.

## Frontend Changes

### 1. New Agent Workspace page
- Created `src/pages/agent-workspace.tsx`:
  - Mission/session sidebar.
  - Brief input box at the top — the user enters a high-level goal and clicks Run.
  - Real-time connection indicator.
  - Tabs: Timeline, Files, Artifacts, Logs.
  - Timeline tab shows plans and tasks with live status badges.
  - Files tab shows the sandbox workspace file tree and file contents.
  - Logs tab shows the live event stream.

### 2. New hooks
- `src/hooks/use-event-stream.ts` — EventSource hook for SSE with auto-reconnect.
- `src/hooks/use-agent-execute.ts` — mutation hook for `POST /api/agent/execute`.
- `src/hooks/use-sandbox-files.ts` — query hooks for sandbox file listing and reading.

### 3. Navigation updates
- Updated `src/App.tsx` — `/` and `/workspace` now render the Agent Workspace.
- Updated `src/components/layout.tsx` — Agent Workspace is the first navigation item.
- Old Dashboard moved to `/dashboard`.

### 4. Shared client export
- Updated `lib/api-client-react/src/index.ts` to export `customFetch` and `CustomFetchOptions` so the new hooks can make custom API calls without regenerating the entire client.

## Database Migration

The `sessions` table now has a `sandbox_id` column. Run the Drizzle push to apply the schema change:

```bash
pnpm --filter @workspace/db push
```

## Environment Variables

Required for the new features:

```env
DATABASE_URL=...
GROQ_API_KEY=...
E2B_API_KEY=...
```

Optional:

```env
E2B_TEMPLATE_ID=base   # defaults to base
```

## How to Use

1. Open the app — the default page is now **Agent Workspace**.
2. Create a new mission (session) or select an existing one.
3. Enter a brief such as:
   > "Research the top 3 open-source AI agent frameworks, compare them, and write a markdown report."
4. Click **Run**.
5. The planner creates a multi-step plan, the executor starts running it, and the UI updates live.
6. Switch to **Files** to see generated files in the sandbox workspace.
7. Switch to **Logs** to watch tool calls, reasoning, and completion events.

## What Is Still a Prototype / Gap

- The LLM tool call parser is a simple regex over JSON code blocks. It can be replaced with a structured output parser for better reliability.
- The browser agent is not yet implemented; the `api_request` tool does basic HTTP fetching.
- No vision model integration for browser screenshots.
- Replanning after a failed step is implemented in the planner but not automatically invoked on step failure.
- The mobile Agent Workspace layout is functional but not yet optimized for small screens.
- The OpenAPI spec was not regenerated for the new endpoints; the frontend uses custom fetch directly.
