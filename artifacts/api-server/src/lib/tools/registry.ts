import { db, artifactsTable, eventsTable } from "@workspace/db";
import type { ToolDefinition, ToolHandler, ToolResult, ToolContext } from "./types";
import {
  getOrCreateSandbox,
  runSandboxCommand,
  readSandboxFile,
  writeSandboxFile,
  listSandboxFiles,
} from "./sandbox";
import { broadcastEvent } from "../events-stream";
import { duckDuckGoSearch, fetchAndParsePage } from "./web-utils";

const definitions = new Map<string, ToolDefinition>();
const handlers = new Map<string, ToolHandler>();

export function registerTool(def: ToolDefinition, handler: ToolHandler): void {
  definitions.set(def.name, def);
  handlers.set(def.name, handler);
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return definitions.get(name);
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(definitions.values());
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const handler = handlers.get(name);
  if (!handler) {
    return { success: false, error: `Tool "${name}" not found` };
  }
  return handler(params, ctx);
}

function logEvent(ctx: ToolContext, eventType: string, description: string) {
  const event = {
    eventType,
    entityType: "task" as const,
    entityId: ctx.taskId,
    description,
  };

  void db
    .insert(eventsTable)
    .values(event)
    .catch(() => {});

  broadcastEvent(event);
}

// ───────────────────────────────────────────────────────────────────────────
// Python tool
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "python",
    description:
      "Execute Python code in the session's persistent sandbox. Use this for data analysis, file manipulation, web scraping, or generating artifacts. You can write files to the workspace and read them later.",
    parameters: [
      {
        name: "code",
        type: "string",
        description: "Python code to execute",
        required: true,
      },
      {
        name: "timeoutSeconds",
        type: "number",
        description: "Maximum execution time in seconds (default 60)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const timeoutMs = (Number(params.timeoutSeconds) || 60) * 1000;

    const result = await runSandboxCommand(
      sandbox.sandboxId,
      `python3 -c ${JSON.stringify(String(params.code))}`,
      timeoutMs
    );

    logEvent(ctx, "tool.python", "Executed Python code in sandbox");

    return {
      success: (result as any).exitCode === 0,
      output: (result as any).stdout,
      error: (result as any).stderr || undefined,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// Bash tool
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "bash",
    description:
      "Execute a shell command in the session's persistent sandbox. Use this for installing packages, running scripts, or file system operations.",
    parameters: [
      {
        name: "command",
        type: "string",
        description: "Shell command to execute",
        required: true,
      },
      {
        name: "timeoutSeconds",
        type: "number",
        description: "Maximum execution time in seconds (default 60)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const timeoutMs = (Number(params.timeoutSeconds) || 60) * 1000;

    const result = await runSandboxCommand(
      sandbox.sandboxId,
      String(params.command),
      timeoutMs
    );

    logEvent(ctx, "tool.bash", "Executed shell command in sandbox");

    return {
      success: (result as any).exitCode === 0,
      output: (result as any).stdout,
      error: (result as any).stderr || undefined,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_read
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_read",
    description: "Read a file from the session's sandbox workspace.",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Relative or absolute path to the file",
        required: true,
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const path = String(params.path);
    const content = await readSandboxFile(sandbox.sandboxId, path);
    return { success: true, output: content };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_write
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_write",
    description:
      "Write a file to the session's sandbox workspace. Files persist across tool calls and can be read later by the same session.",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Relative or absolute path for the file",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "File content",
        required: true,
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const path = String(params.path);
    await writeSandboxFile(sandbox.sandboxId, path, String(params.content));

    logEvent(ctx, "tool.file_write", `Wrote file ${path}`);

    return { success: true, output: `File written to ${path}` };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// file_list
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "file_list",
    description: "List files in the session's sandbox workspace.",
    parameters: [
      {
        name: "directory",
        type: "string",
        description: "Directory to list (default: /home/user)",
      },
    ],
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const dir = String(params.directory || "/home/user");
    const files = await listSandboxFiles(sandbox.sandboxId, dir);
    return { success: true, output: JSON.stringify(files, null, 2), files };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// api_request
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "api_request",
    description: "Make an HTTP request to an external API or website.",
    parameters: [
      {
        name: "url",
        type: "string",
        description: "URL to request",
        required: true,
      },
      {
        name: "method",
        type: "string",
        description: "HTTP method (GET, POST, PUT, DELETE, PATCH). Default GET.",
      },
      {
        name: "headers",
        type: "object",
        description: "Optional headers object",
      },
      {
        name: "body",
        type: "string",
        description: "Optional request body string",
      },
    ],
  },
  async (params) => {
    const method = String(params.method || "GET").toUpperCase();
    const init: RequestInit = { method };

    if (params.headers && typeof params.headers === "object") {
      init.headers = params.headers as Record<string, string>;
    }

    if (params.body && ["POST", "PUT", "PATCH"].includes(method)) {
      init.body = String(params.body);
    }

    const res = await fetch(String(params.url), init);
    const text = await res.text();

    return {
      success: res.ok,
      output: `Status: ${res.status}\n\n${text.slice(0, 8000)}`,
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// artifact_create
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "artifact_create",
    description:
      "Create an artifact record in the platform. Use this to deliver final outputs such as reports, code files, data exports, or documentation.",
    parameters: [
      {
        name: "title",
        type: "string",
        description: "Artifact title",
        required: true,
      },
      {
        name: "artifactType",
        type: "string",
        description: "One of: markdown, code, json, csv, report, zip, text, other",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "Artifact content",
      },
      {
        name: "filePath",
        type: "string",
        description: "Optional file path reference",
      },
    ],
  },
  async (params, ctx) => {
    const content = params.content ? String(params.content) : null;
    const sizeBytes = content ? Buffer.byteLength(content, "utf8") : null;

    const [artifact] = await db
      .insert(artifactsTable)
      .values({
        title: String(params.title),
        artifactType: String(params.artifactType),
        content,
        filePath: params.filePath ? String(params.filePath) : null,
        creatorAgent: ctx.taskId ? `task-${ctx.taskId}` : "agent",
        taskId: ctx.taskId,
        workspaceId: ctx.workspaceId,
        sizeBytes,
      })
      .returning();

    logEvent(ctx, "artifact.created", `Artifact "${artifact.title}" created by agent`);

    return {
      success: true,
      output: `Artifact ${artifact.id} created: ${artifact.title}`,
      artifacts: [
        {
          title: artifact.title,
          artifactType: artifact.artifactType,
          content: artifact.content ?? undefined,
          filePath: artifact.filePath ?? undefined,
        },
      ],
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// web_search
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "web_search",
    description: "Search the web for current information. Returns relevant results with titles, URLs, and snippets.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "The search query",
        required: true,
      },
    ],
  },
  async (params) => {
    const results = await duckDuckGoSearch(String(params.query), 5);
    return { success: true, output: JSON.stringify(results, null, 2) };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// fetch_page
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "fetch_page",
    description: "Retrieve the text content of a web page as markdown.",
    parameters: [
      {
        name: "url",
        type: "string",
        description: "The URL of the page to fetch",
        required: true,
      },
    ],
  },
  async (params) => {
    const result = await fetchAndParsePage(String(params.url));
    if (typeof result === 'object' && 'error' in result) {
      return { success: false, error: result.error as string };
    }
    return { success: true, output: String(result).slice(0, 15000) };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// edit_file
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "edit_file",
    description: "Edit a file by searching for existing text and replacing it.",
    parameters: [
      { name: "path", type: "string", required: true, description: "Relative file path in the workspace" },
      { name: "old_text", type: "string", required: true, description: "The text to find in the file" },
      { name: "new_text", type: "string", required: true, description: "The replacement text" }
    ],
  },
  async (params, ctx) => {
    try {
      const sandbox = await getOrCreateSandbox(ctx.sessionId);
      const filePath = String(params.path);
      const oldText = String(params.old_text);
      const newText = String(params.new_text);
      
      const content = await readSandboxFile(sandbox.sandboxId, filePath);
      if (!content.includes(oldText)) {
        return { success: false, error: "old_text not found in file" };
      }
      
      const updated = content.replace(oldText, newText);
      await writeSandboxFile(sandbox.sandboxId, filePath, updated);
      
      logEvent(ctx, "tool.edit_file", `Edited file: ${filePath}`);
      return { success: true, output: `Successfully edited ${filePath}` };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────
// ask_user
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "ask_user",
    description: "Ask the user a clarifying question when you are stuck or need missing information to proceed.",
    parameters: [
      {
        name: "question",
        type: "string",
        description: "The question to ask the user",
        required: true,
      },
    ],
  },
  async (params, ctx) => {
    // We emit an event that the frontend can listen to
    await broadcastEvent({ // @ts-expect-error type override

      eventType: "agent.waiting",
      entityType: "task",
      entityId: ctx.taskId,
      description: String(params.question),
      metadata: JSON.stringify({ question: params.question })
    });
    
    // We return a prompt instructing the agent to stop and wait
    return { 
      success: true, 
      output: "[AGENT PAUSED] I have asked the user. I should now wait for their response and do nothing else until they reply. I will output a final artifact or summary that says 'Waiting for user input'." 
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// memorize
// ───────────────────────────────────────────────────────────────────────────
import { memoriesTable } from "@workspace/db";

registerTool(
  {
    name: "memorize",
    description: "Save an important fact, preference, or concept to long-term memory so you remember it in future sessions.",
    parameters: [{ name: "content", type: "string", required: true, description: "The fact to remember" }]
  },
  async (params, ctx) => {
    await db.insert(memoriesTable).values({ content: String(params.content) });
    logEvent(ctx, "tool.memorize", `Memorized: ${params.content}`);
    return { success: true, output: "Saved to long-term memory." };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// clone_github_repo
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "clone_github_repo",
    description: "Clone a public GitHub repository into the workspace.",
    parameters: [
      { name: "repo_url", type: "string", required: true },
      { name: "dir_name", type: "string", required: true, description: "Directory to clone into (relative to /home/user)" }
    ]
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const dir = String(params.dir_name);
    const cmd = `git clone "${params.repo_url}" "/home/user/${dir}" && cd "/home/user/${dir}" && find . -maxdepth 2 -type f`;
    const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
    logEvent(ctx, "tool.clone_github", `Cloned repo ${params.repo_url}`);
    return { 
      success: (result as any).exitCode === 0, 
      output: `STDOUT:\n${(result as any).stdout}\nSTDERR:\n${(result as any).stderr}`,
      error: (result as any).exitCode === 0 ? undefined : (result as any).stderr
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// deploy_html
// ───────────────────────────────────────────────────────────────────────────
registerTool(
  {
    name: "deploy_html",
    description: "Deploy a single HTML file to the internet for free using htmlpasta.com so the user can see it live.",
    parameters: [{ name: "file_path", type: "string", required: true, description: "Path to the HTML file in the workspace" }]
  },
  async (params, ctx) => {
    const sandbox = await getOrCreateSandbox(ctx.sessionId);
    const cmd = `curl -s -X POST -d @"${params.file_path}" https://htmlpasta.com/api`;
    const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
    logEvent(ctx, "tool.deploy", `Deployed HTML: ${(result as any).stdout}`);
    return { 
      success: (result as any).exitCode === 0, 
      output: `Deployed successfully. Live URL: ${(result as any).stdout}`,
      error: (result as any).exitCode === 0 ? undefined : (result as any).stderr
    };
  }
);

// ───────────────────────────────────────────────────────────────────────────
// search_codebase
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "search_codebase",
  description: "Search across the entire workspace for specific keywords or regex patterns.",
  parameters: [{ name: "query", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `grep -rnw '/home/user' -e "${String(params.query)}" | head -n 50`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  logEvent(ctx, "tool.grep", `Searched codebase for ${params.query}`);
  return { 
    success: (result as any).exitCode === 0 || (result as any).exitCode === 1, // grep returns 1 if no lines matched
    output: (result as any).stdout ? (result as any).stdout : "No matches found.",
    error: (result as any).exitCode > 1 ? (result as any).stderr : undefined
  };
});

// ───────────────────────────────────────────────────────────────────────────
// fetch_wikipedia
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "fetch_wikipedia",
  description: "Fetch accurate, hallucination-free summaries from Wikipedia.",
  parameters: [{ name: "title", type: "string", required: true }]
}, async (params) => {
  const title = encodeURIComponent(String(params.title));
  const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${title}`);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const extract = Object.values(pages)[0]?.extract;
  return { success: true, output: extract || "No Wikipedia article found." };
});

// ───────────────────────────────────────────────────────────────────────────
// youtube_transcript
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "youtube_transcript",
  description: "Extract the transcript of a YouTube video using its Video ID.",
  parameters: [{ name: "video_id", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  await runSandboxCommand(sandbox.sandboxId, 'pip install youtube-transcript-api', 30000);
  const code = `from youtube_transcript_api import YouTubeTranscriptApi
import sys
try:
    tx = YouTubeTranscriptApi.get_transcript(sys.argv[1])
    print(" ".join([x['text'] for x in tx]))
except Exception as e:
    print(str(e))`;
  const cmd = `python3 -c """${code}""" "${String(params.video_id)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  logEvent(ctx, "tool.youtube", `Fetched transcript for ${params.video_id}`);
  return { success: true, output: (result as any).stdout.slice(0, 15000) };
});

// ───────────────────────────────────────────────────────────────────────────
// search_packages
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "search_packages",
  description: "Search the NPM registry for up-to-date javascript package info.",
  parameters: [{ name: "package_name", type: "string", required: true }]
}, async (params) => {
  const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(String(params.package_name))}&size=3`);
  const data = await res.json();
  const pkgs = data.objects?.map(o => `${o.package.name}@${o.package.version} - ${o.package.description}`).join('\n');
  return { success: true, output: pkgs || "No packages found." };
});

// ───────────────────────────────────────────────────────────────────────────
// github_push
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "github_push",
  description: "Commit and push code from the workspace to a GitHub repo using a Personal Access Token.",
  parameters: [
    { name: "repo_url_with_token", type: "string", required: true, description: "e.g. https://<token>@github.com/user/repo.git" },
    { name: "commit_message", type: "string", required: true }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && git config --global user.name "AI Agent" && git config --global user.email "agent@arena.ai" && git add . && git commit -m "${String(params.commit_message)}" && git remote add origin2 "${String(params.repo_url_with_token)}" && git push -u origin2 main --force`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
  logEvent(ctx, "tool.github_push", "Committed and pushed code to Github");
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// analyze_error
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "analyze_error",
  description: "Send a crash log or stack trace to the LLM to get an immediate fix instruction.",
  parameters: [{ name: "error_log", type: "string", required: true }]
}, async (params) => {
  const msgs = [{ role: "user" as const, content: `Explain exactly why this failed and how to fix it:\n\n${params.error_log}` }];
  const { chatCompletion } = await import("../ai");
  const res = await chatCompletion(msgs, "groq", { maxTokens: 800 });
  return { success: true, output: res.content };
});

// ───────────────────────────────────────────────────────────────────────────
// create_report
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "create_report",
  description: "Compile gathered information into a highly stylized Markdown report and save it.",
  parameters: [
    { name: "title", type: "string", required: true },
    { name: "markdown_content", type: "string", required: true }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const path = `/home/user/${String(params.title).replace(/\\s+/g, '_')}.md`;
  await writeSandboxFile(sandbox.sandboxId, path, String(params.markdown_content));
  logEvent(ctx, "tool.create_report", `Generated markdown report: ${path}`);
  return { success: true, output: `Report written to ${path}. User can open it in the preview/files tab.` };
});

// ───────────────────────────────────────────────────────────────────────────
// read_document
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "read_document",
  description: "Extract text from a PDF or DOCX file inside the workspace.",
  parameters: [{ name: "path", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  await runSandboxCommand(sandbox.sandboxId, 'pip install PyPDF2 python-docx', 30000);
  const code = `
import sys, os
path = sys.argv[1]
ext = os.path.splitext(path)[1].lower()
if ext == '.pdf':
    from PyPDF2 import PdfReader
    reader = PdfReader(path)
    print('\\n'.join(page.extract_text() for page in reader.pages))
elif ext == '.docx':
    from docx import Document
    doc = Document(path)
    print('\\n'.join(p.text for p in doc.paragraphs))
else:
    print("Unsupported format")
  `;
  const cmd = `python3 -c """${code}""" "${String(params.path)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 45000);
  logEvent(ctx, "tool.read_doc", `Read document: ${params.path}`);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout.slice(0, 15000), error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// explore_api
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "explore_api",
  description: "Fetch OpenAPI/Swagger docs from a URL and extract endpoint definitions.",
  parameters: [{ name: "url", type: "string", required: true }]
}, async (params) => {
  const res = await fetch(String(params.url));
  const data = await res.json();
  if (!data.paths) return { success: false, output: "No OpenAPI paths found." };
  const endpoints = Object.keys(data.paths).map(p => `- ${p} : ${Object.keys(data.paths[p]).join(',')}`).join('\n');
  return { success: true, output: endpoints };
});


// ───────────────────────────────────────────────────────────────────────────
// analyze_image (Pollinations AI Vision)
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "analyze_image",
  description: "Use Pollinations AI Vision to look at an image file in the workspace and answer questions about it.",
  parameters: [
    { name: "path", type: "string", required: true, description: "Path to image in workspace" },
    { name: "prompt", type: "string", required: true, description: "What to ask about the image" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const path = String(params.path);
  const b64Res = await runSandboxCommand(sandbox.sandboxId, `base64 -w 0 "${path}"`, 30000);
  if (b64Res.exitCode !== 0) return { success: false, error: b64Res.stderr };
  
  const ext = path.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpeg';
  const b64 = `data:image/${mime};base64,${b64Res.stdout.trim()}`;

  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: String(params.prompt) },
            { type: "image_url", image_url: { url: b64 } }
          ]
        }]
      })
    });
    const data = await res.json();
    return { success: true, output: data.choices?.[0]?.message?.content || JSON.stringify(data) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// ───────────────────────────────────────────────────────────────────────────
// scrape_js_site (Jina Reader)
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "scrape_js_site",
  description: "Scrape dynamic Javascript single-page apps (SPAs) cleanly using Jina Reader API.",
  parameters: [{ name: "url", type: "string", required: true }]
}, async (params) => {
  const res = await fetch(`https://r.jina.ai/${String(params.url)}`);
  const text = await res.text();
  return { success: res.ok, output: text.slice(0, 15000), error: res.ok ? undefined : text };
});

// ───────────────────────────────────────────────────────────────────────────
// request_code_review (Debate Mode / Critic)
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "request_code_review",
  description: "Pass a snippet of code or logic to a Senior AI Developer to get a harsh critique and catch bugs.",
  parameters: [{ name: "code_or_logic", type: "string", required: true }]
}, async (params) => {
  const { chatCompletion } = await import("../ai");
  const messages = [
    { role: "system" as const, content: "You are a harsh, brilliant senior engineer. Review this code/logic and point out flaws, security risks, and bugs. Be brutally honest and concise." },
    { role: "user" as const, content: String(params.code_or_logic) }
  ];
  const res = await chatCompletion(messages, "groq", { maxTokens: 1000 });
  return { success: true, output: res.content };
});

// ───────────────────────────────────────────────────────────────────────────
// lint_workspace
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "lint_workspace",
  description: "Formats all code in the workspace using Prettier to make it clean and readable.",
  parameters: []
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `npm install -g prettier && prettier --write "/home/user/**/*.{js,ts,jsx,tsx,json,css,md,html}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// generate_diagram
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "generate_diagram",
  description: "Generates an architecture or flow diagram using Mermaid syntax and saves it as an SVG.",
  parameters: [
    { name: "mermaid_syntax", type: "string", required: true, description: "Raw mermaid code (e.g. graph TD; A-->B;)" },
    { name: "filename", type: "string", required: true, description: "Output path, e.g. /home/user/diagram.svg" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const b64 = Buffer.from(String(params.mermaid_syntax)).toString('base64');
  const url = `https://mermaid.ink/svg/${b64}`;
  const cmd = `curl -sL "${url}" -o "${String(params.filename)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  return { success: (result as any).exitCode === 0, output: `Diagram saved to ${params.filename}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// text_to_speech
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "text_to_speech",
  description: "Convert text to spoken audio (.mp3) using gTTS.",
  parameters: [
    { name: "text", type: "string", required: true },
    { name: "filename", type: "string", required: true, description: "Must end in .mp3" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  await runSandboxCommand(sandbox.sandboxId, "pip install gTTS", 30000);
  const code = `from gtts import gTTS
import sys
tts = gTTS(sys.argv[1])
tts.save(sys.argv[2])`;
  const cmd = `python3 -c """${code}""" "${String(params.text).replace(/"/g, '\\"')}" "${String(params.filename)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 45000);
  return { success: (result as any).exitCode === 0, output: `Audio saved to ${params.filename}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// generate_qr_code
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "generate_qr_code",
  description: "Generate a QR code image for a URL or string.",
  parameters: [
    { name: "data", type: "string", required: true },
    { name: "filename", type: "string", required: true, description: "Must end in .png" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  await runSandboxCommand(sandbox.sandboxId, "pip install qrcode[pil]", 30000);
  const code = `import qrcode
import sys
img = qrcode.make(sys.argv[1])
img.save(sys.argv[2])`;
  const cmd = `python3 -c """${code}""" "${String(params.data).replace(/"/g, '\\"')}" "${String(params.filename)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  return { success: (result as any).exitCode === 0, output: `QR code saved to ${params.filename}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// extract_colors
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "extract_colors",
  description: "Extract the dominant hex colors from an image file.",
  parameters: [{ name: "image_path", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  await runSandboxCommand(sandbox.sandboxId, "pip install colorthief", 30000);
  const code = `from colorthief import ColorThief
import sys
color_thief = ColorThief(sys.argv[1])
palette = color_thief.get_palette(color_count=5)
print([ '#%02x%02x%02x' % c for c in palette ])`;
  const cmd = `python3 -c """${code}""" "${String(params.image_path)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// sandbox_time_machine (git checkout)
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "revert_file",
  description: "Reverts a file to its state from a previous commit (if Git tracking is enabled).",
  parameters: [{ name: "path", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && git checkout HEAD -- "${String(params.path)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 10000);
  return { success: (result as any).exitCode === 0, output: `Reverted ${params.path}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// deploy_vercel
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "deploy_vercel",
  description: "Deploy the current workspace to Vercel for free.",
  parameters: [
    { name: "token", type: "string", required: true, description: "Your Vercel API token" },
    { name: "project_name", type: "string", required: true, description: "The name of the project" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && npx vercel --token "${String(params.token)}" --name "${String(params.project_name)}" --yes --prod`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
  logEvent(ctx, "tool.deploy_vercel", `Deployed to Vercel: ${params.project_name}`);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// run_unit_tests
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "run_unit_tests",
  description: "Install and run unit tests for the current project using vitest or pytest.",
  parameters: [{ name: "command", type: "string", required: true, description: "Test command to run, e.g., 'npm test' or 'pytest'" }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && ${String(params.command)}`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
  logEvent(ctx, "tool.run_unit_tests", `Ran tests: ${params.command}`);
  return { success: (result as any).exitCode === 0, output: `STDOUT:\n${(result as any).stdout}\nSTDERR:\n${(result as any).stderr}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// bulk_find_replace
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "bulk_find_replace",
  description: "Use sed to find and replace text across multiple files in the workspace instantly.",
  parameters: [
    { name: "search", type: "string", required: true },
    { name: "replace", type: "string", required: true },
    { name: "file_pattern", type: "string", required: true, description: "e.g., '*.js' or 'src/**/*.ts'" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `find /home/user -type f -name "${String(params.file_pattern)}" -exec sed -i 's/${String(params.search).replace(/\//g, '\\/')}/${String(params.replace).replace(/\//g, '\\/')}/g' {} +`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  logEvent(ctx, "tool.bulk_find_replace", `Replaced ${params.search} with ${params.replace} in ${params.file_pattern}`);
  return { success: (result as any).exitCode === 0, output: "Bulk replace successful.", error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// zip_files
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "zip_files",
  description: "Compress files or directories into a zip archive.",
  parameters: [
    { name: "target", type: "string", required: true, description: "File or directory to zip" },
    { name: "output_filename", type: "string", required: true, description: "Output zip file name" }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && zip -r "${String(params.output_filename)}" "${String(params.target)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  logEvent(ctx, "tool.zip_files", `Zipped ${params.target} to ${params.output_filename}`);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// unzip_archive
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "unzip_archive",
  description: "Extract a zip archive in the workspace.",
  parameters: [{ name: "archive_path", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `cd /home/user && unzip -o "${String(params.archive_path)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 30000);
  logEvent(ctx, "tool.unzip_archive", `Unzipped ${params.archive_path}`);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// download_direct
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "download_direct",
  description: "Download a file directly into the sandbox using wget.",
  parameters: [
    { name: "url", type: "string", required: true },
    { name: "output_filename", type: "string", required: true }
  ]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `wget -O "/home/user/${String(params.output_filename)}" "${String(params.url)}"`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 60000);
  logEvent(ctx, "tool.download_direct", `Downloaded ${params.url} to ${params.output_filename}`);
  return { success: (result as any).exitCode === 0, output: `Downloaded successfully.`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// check_ports
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "check_ports",
  description: "Check which processes are listening on open ports in the sandbox.",
  parameters: []
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `netstat -tuln || ss -tuln`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 10000);
  return { success: (result as any).exitCode === 0, output: (result as any).stdout, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});

// ───────────────────────────────────────────────────────────────────────────
// kill_process
// ───────────────────────────────────────────────────────────────────────────
registerTool({
  name: "kill_process",
  description: "Kill a process by its PID to free up ports or stop background tasks.",
  parameters: [{ name: "pid", type: "string", required: true }]
}, async (params, ctx) => {
  const sandbox = await getOrCreateSandbox(ctx.sessionId);
  const cmd = `kill -9 ${String(params.pid)}`;
  const result = await runSandboxCommand(sandbox.sandboxId, cmd, 10000);
  logEvent(ctx, "tool.kill_process", `Killed process ${params.pid}`);
  return { success: (result as any).exitCode === 0, output: `Killed process ${params.pid}`, error: (result as any).exitCode === 0 ? undefined : (result as any).stderr };
});
