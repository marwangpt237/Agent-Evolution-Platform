# From AlgDevs-AI to Manus AI: UI & Logic Comparison

> This document compares the current AlgDevs-AI project to a Manus-style autonomous AI agent and lists exactly what would need to change in the UI and backend logic to close the gap.

---

## What Manus AI Actually Is (as of 2026)

Manus is **not** a chatbot. It is an **autonomous generalist AI agent** that accepts a high-level brief, plans the work, executes multi-step tasks using tools, and delivers a finished artifact (report, code, deployed app, spreadsheet, etc.) with minimal human supervision.

### Manus core capabilities

| Capability | Description |
|------------|-------------|
| **Multi-agent orchestration** | An *Executor Agent* coordinates a *Planner Agent* and a *Knowledge Agent* inside a shared Linux sandbox. |
| **Browser Agent** | Headless Chromium that can navigate, click, fill forms, scrape, take screenshots, and verify actions with vision models. |
| **CodeAct paradigm** | The agent emits executable Python/JS/bash code rather than rigid JSON tool calls. This lets it chain pandas + Playwright + REST calls + matplotlib in one step. |
| **Wide Research** | Deep multi-source research across the web, synthesizing large amounts of information. |
| **Asynchronous execution** | Long-running tasks continue in the background and notify the user when done. |
| **File & artifact generation** | Writes code, downloads CSVs, produces reports, builds full web apps (backend + DB + auth). |
| **"Manus's Computer" UI** | A live interface showing what the agent is doing right now: browser tabs, terminal output, files, reasoning steps, and a timeline. |
| **Self-correction** | Updates its plan as it learns new information, retries failed steps, and handles edge cases. |

---

## Part 1: UI — What Would Need to Change

### Current AlgDevs-AI UI

The current frontend is a **static admin dashboard** with a dark sidebar and separate pages:

- **Dashboard** — stat cards, recent events, provider health.
- **Chat** — session list + simple chat bubbles.
- **Plans** — static plan cards with status badges; no live execution view.
- **Tasks** — filterable list of tasks with retry/cancel buttons.
- **Artifacts** — grid of artifact cards with small previews.
- **Agents** — spawn buttons + list of idle/running instances.
- **Sandbox** — basic code editor + output panel + execution history.
- **Settings** — provider management form.

The UI is **page-based** and **request/response driven**. It shows the *result* of actions, not the *process*.

### Manus-like UI

A Manus-style interface is **process-first**, not page-first. It should feel like you are watching a digital employee work on a virtual computer.

#### 1. Unified Mission Control / "Agent Workspace" (replaces the static dashboard)

Instead of nine separate pages, the default view should be a single workspace divided into panes:

```
┌──────────────────────────────────────────────────────────────┐
│  Brief / Chat      │  Live Plan Timeline                     │
│  (user input +       │  (steps, status, reasoning,            │
│   agent responses)   │   screenshots, terminal output)          │
├──────────────────────┼─────────────────────────────────────────┤
│  File Browser        │  Active Tools / Environment              │
│  (artifacts,         │  (browser preview, code editor,          │
│   generated files)   │   logs, running tasks)                 │
└──────────────────────────────────────────────────────────────┘
```

Key components:

- **Brief panel** — chat-style input where the user writes the goal, plus a thread of agent reasoning messages.
- **Live timeline** — vertical timeline of plan steps: pending → running → completed/failed. Each step shows:
  - Step title and description
  - Current reasoning / sub-tasks
  - Live terminal/browser output
  - Screenshots (for browser steps)
  - Generated files/artifacts
- **Environment tabs** — switch between browser preview, code editor, terminal output, and file explorer.
- **Artifact preview** — side-by-side rendered preview of generated files (Markdown, HTML, code, images, spreadsheets).
- **Background tasks indicator** — shows tasks running even when the user navigates away.

#### 2. Real-time streaming instead of polling

Manus shows updates as they happen. The current project uses React Query with 10-second stale time and manual polling. To look like Manus you would need:

- **WebSockets** or **Server-Sent Events (SSE)** pushing updates for:
  - Agent reasoning/thoughts
  - Plan step status changes
  - New terminal/sandbox output
  - Browser screenshots
  - File creation events
- **Optimistic UI** for user actions (send brief, execute plan, cancel task).
- **Smooth animations** for state transitions (step running, progress bars, typing indicators).

#### 3. Browser preview pane

Add a pane that renders a live browser view:

- Show current URL.
- Show screenshot of what the agent is looking at.
- Show action log: "clicked button", "filled input", "scrolled", "extracted table".
- Allow the user to take over or annotate the browser if needed.

The current project has no browser capability at all.

#### 4. Code + terminal + file explorer pane

Upgrade the existing Sandbox page into a persistent environment panel:

- File tree of the sandbox workspace.
- Monaco/CodeMirror editor for reading/editing generated files.
- Terminal stream showing command output in real time.
- Output visualization (matplotlib charts, HTML previews, tables).

#### 5. Artifact-first delivery

When a task completes, the UI should prominently display the artifact:

- Generated reports with Markdown rendering.
- Download buttons for files.
- Code repos with syntax highlighting and copy buttons.
- Deployed app links.
- Summary cards showing what was accomplished.

#### 6. Mobile / PWA considerations

Manus has desktop and mobile apps. The current PWA is a good start, but a Manus-like mobile UI would need:

- A chat-first mobile view.
- Push notifications for completed long-running tasks.
- Collapsible environment panes.
- Swipeable task timeline.

---

## Part 2: Logic — What Would Need to Change

### Current AlgDevs-AI logic

The backend has the *shape* of an agent platform but most of the intelligence is stubbed:

- **Chat** — sends message history to Groq/Gemini/OpenRouter and returns a text response.
- **Plans** — stores plans and steps; `POST /plans/:id/execute` only sets status to `executing`; it does not actually run the plan.
- **Tasks** — `TaskQueue` picks pending tasks via PostgreSQL `SKIP LOCKED`, but `executeTaskLogic()` only sleeps 2 seconds and returns a fake string.
- **Agents** — database records only; no real dispatch logic.
- **Sandbox** — runs a one-off snippet via E2B REST API; no persistent workspace or file system.
- **Events** — logs creation events but does not stream reasoning or tool calls.

### Manus-like logic

To become a Manus-style agent, the backend needs an **autonomous execution loop** with **tool use**, **dynamic planning**, and **real-time observability**.

#### 1. Multi-agent orchestration with real dispatch

Replace the stub `TaskQueue.executeTaskLogic()` with a true orchestrator:

```text
User Brief
    ↓
Supervisor / Executor Agent
    ↓
Planner Agent → decomposes into steps, chooses tools
    ↓
Specialized Agents (per step):
  - Researcher Agent → Browser + web search
  - Coder Agent → CodeAct sandbox execution
  - Reviewer Agent → validates output, suggests fixes
    ↓
Artifact delivery + event log update
```

Each agent should be a role/prompt specialization rather than just a database row. The database can still track *instances*, but the execution logic should call the right model prompt chain.

#### 2. Tool registry and CodeAct

Manus uses **CodeAct** — the agent emits code snippets that are executed. Implement a tool registry where each tool is a function the agent can call:

| Tool | Purpose |
|------|---------|
| `browser_navigate(url)` | Browser agent opens a URL and returns screenshot + DOM. |
| `browser_click(selector)` | Clicks an element, returns result. |
| `browser_extract(query)` | Extracts text/tables from the page. |
| `python(code)` | Runs Python in the E2B sandbox and returns stdout/stderr/files. |
| `bash(command)` | Runs shell commands in the sandbox. |
| `file_read(path)` | Reads a file from the sandbox workspace. |
| `file_write(path, content)` | Writes a file. |
| `api_request(method, url, body)` | Makes REST calls. |
| `search(query)` | Web search via Serper/Tavily/SearchAPI. |
| `plan_update(steps)` | Revises the current plan based on new findings. |
| `artifact_create(...)` | Saves a generated artifact to the database. |

The LLM should receive a system prompt like:

> "You are the Coder Agent. You have access to Python, bash, file_read, file_write, and api_request. Emit a Python code block to perform the step. The code will be executed in a sandbox. After execution, summarize the result and any files created."

#### 3. Dynamic planning engine

The current plan steps are static. Manus updates the plan as it works:

- After each step, the Planner Agent evaluates the result.
- If a step fails or reveals new requirements, it can:
  - Add new sub-steps
  - Remove irrelevant steps
  - Reorder dependencies
  - Mark steps as skipped
- Store the plan version history so users can see how it evolved.

Implementation: create a `planOrchestrator` service that loops:

1. Load current plan + completed context.
2. Ask Planner Agent for the next action (or a plan update).
3. Execute the action (browser, code, etc.).
4. Update step status and emit events.
5. Repeat until done or max iterations reached.

#### 4. Persistent sandbox workspace

The current sandbox runs one-off snippets. A Manus-like system needs a **persistent, per-session workspace**:

- Each session gets a dedicated E2B sandbox (or a long-lived container).
- Files created by the agent persist across messages.
- The UI can browse the file tree.
- The agent can reference previous files and build iteratively.

Changes needed:
- Store `sandboxId` on the `sessions` table.
- Reuse the same sandbox across steps instead of creating/destroying each time.
- Mount a workspace directory and return file metadata.

#### 5. Browser agent

Add a new `BrowserAgent` class (or integrate Playwright/Puppeteer via E2B or a local headless browser):

- Receives natural-language instructions: "Find the pricing page and extract the table."
- Uses a vision-capable model (Gemini, GPT-4o) to interpret screenshots.
- Executes actions: navigate, click, type, scroll, extract.
- Returns screenshot + text extraction to the orchestrator.

This requires:
- A new backend service/module.
- A browser preview endpoint (`/api/browser/screenshot`, `/api/browser/action`).
- WebSocket/SSE streaming of screenshots.

#### 6. Streaming and events

The current `events` table is a simple audit log. It needs to become a **real-time observability stream**:

- Event types: `reasoning.started`, `reasoning.completed`, `tool.called`, `tool.result`, `browser.action`, `file.created`, `step.updated`, `plan.updated`, `artifact.generated`.
- Emit events during execution.
- Broadcast events over WebSockets/SSE to the frontend.
- Store events so users can replay the execution timeline later.

#### 7. Memory and context management

Manus handles long-running tasks that exceed a single context window. The backend needs:

- **Summarization** of completed steps so the LLM context stays manageable.
- **Retrieval-Augmented Generation (RAG)** over artifacts, previous sessions, and user preferences.
- **User preference learning** — e.g., "User likes concise reports in Markdown." Store preferences in a new `user_preferences` table or in the session metadata.

#### 8. Asynchronous execution

Currently the task queue runs in the same Node process on a 5-second interval. For Manus-like autonomy:

- Move the executor to a **background worker** (or separate container/service).
- Use the database task queue as the source of truth.
- Support task cancellation, progress checkpoints, and resume after restart.
- Implement push notifications (web push for PWA, email, or webhooks) when long tasks complete.

#### 9. Self-correction and verification

- Each step output should be passed to a **Reviewer Agent**.
- The reviewer checks if the output satisfies the step goal and constraints.
- If not, the planner creates a retry or fix step.
- This loop is what makes the system reliable enough to run unsupervised.

#### 10. Security and isolation

- Keep sandboxed code isolated (E2B already helps here).
- Restrict browser agent to allowed domains if needed.
- Sanitize user inputs and LLM-generated code before execution.
- Add rate limits and cost controls for AI providers.

---

## Part 3: Concrete Roadmap to Manus-Like Behavior

### Phase 1 — Real-time UI (1–2 weeks)

1. Add WebSocket or SSE server to `api-server`.
2. Replace separate pages with a single **Agent Workspace** layout.
3. Add live plan timeline component.
4. Add environment tabs (browser, terminal, files, artifacts).
5. Update events to stream in real time.

### Phase 2 — Tool system (2–3 weeks)

1. Implement a `ToolRegistry` and tool-call schema.
2. Convert the existing sandbox endpoint into a persistent workspace per session.
3. Add a headless browser service (Playwright in E2B or a local container).
4. Add `file_read`, `file_write`, `python`, `bash`, `browser_*`, `api_request`, `search` tools.

### Phase 3 — Autonomous loop (3–4 weeks)

1. Implement the `ExecutorAgent` / `SupervisorAgent` orchestrator.
2. Implement `PlannerAgent` that creates and updates plans dynamically.
3. Implement `CoderAgent` and `ResearcherAgent` using the tool registry.
4. Implement `ReviewerAgent` for verification.
5. Replace the stub `executeTaskLogic()` with the real agent loop.

### Phase 4 — Advanced features (ongoing)

1. Wide Research: deep web research with source synthesis.
2. Full-stack app generation: scaffold Next.js/NestJS projects, run builds, deploy.
3. Memory/preference learning.
4. Mobile push notifications.
5. API access for external integrations.

---

## Summary Table: Current vs. Manus

| Area | Current AlgDevs-AI | Manus AI | Gap |
|------|-------------------|----------|-----|
| **Chat** | Simple Q&A with history | Brief → autonomous execution | Needs brief-driven orchestration |
| **Plans** | Static, manually executed | Dynamic, self-updating | Needs dynamic planning engine |
| **Tasks** | Stub execution (2s delay) | Real tool-using agents | Needs agent dispatch + tools |
| **Browser** | None | Headless browser with vision | Add browser agent |
| **Code** | One-off snippets | Persistent CodeAct workspace | Reuse sandbox per session |
| **UI** | Static dashboard pages | Live "computer" workspace | Rebuild as process-first UI |
| **Real-time** | Polling | Streaming/SSE/WebSocket | Add real-time event stream |
| **Artifacts** | Simple text preview | Rich preview + delivery | Add file preview + download |
| **Memory** | None | Summarization + preferences | Add context management |
| **Async** | In-process queue | Background workers | Move executor to worker |

---

## Bottom Line

**AlgDevs-AI already has the right foundation** — a clean monorepo, typed API, database, task queue, sandbox hook, and PWA frontend. But it is currently a **scaffold with stubbed execution**. To become Manus-like, the core work is not more UI polish; it is building an **autonomous agent loop** that can plan, use tools (browser + code), observe results, self-correct, and stream the entire process to a unified, live workspace UI.
