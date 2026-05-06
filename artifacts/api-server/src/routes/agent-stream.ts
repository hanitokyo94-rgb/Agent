/**
 * Agent Builder streaming endpoint with full tool-calling support
 * POST /api/projects/:projectId/agent/stream
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { findById, findWhere, insertRecord, updateRecord, readCollection } from "../lib/storage.js";
import { getWorkspaceDir, getProjectSecrets, listFilesRecursive } from "./workspace.js";
import { deployToVercel } from "../lib/vercel-deploy.js";
import type { User } from "./auth.js";

const execAsync = promisify(exec);
const router = Router();

function getUserId(req: any): string | null {
  let userId = req.session?.userId;
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        userId = decoded.split(":")[0];
      } catch { return null; }
    }
  }
  return userId ?? null;
}

// ─── Tool definitions ──────────────────────────────────────────────
const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a file in the project workspace. Creates directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path e.g. src/index.ts" },
          content: { type: "string", description: "The full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the content of a file in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List all files in the project workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Run a shell command in the project workspace (e.g. compile, test, build).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "install_packages",
      description: "Install npm packages into the project workspace.",
      parameters: {
        type: "object",
        properties: {
          packages: {
            type: "array",
            items: { type: "string" },
            description: "Package names to install e.g. ['express', 'typescript']",
          },
        },
        required: ["packages"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL (browse the web, read docs, get APIs).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          method: { type: "string", enum: ["GET", "POST"], description: "HTTP method" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_secret",
      description: "Store a secret/environment variable for the project.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Secret key name" },
          value: { type: "string", description: "Secret value" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_project",
      description: "Run the project entry point (index.ts). Use after all files are written.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "deploy_to_vercel",
      description: "Deploy the project to Vercel and get a live public URL. Call this after the project is built and tested. It will create a unique URL and redeploy on the same project on subsequent calls.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function getAgentSystemPrompt(lang: string | null | undefined): string {
  const isArabic = lang === "ar" || lang?.startsWith("ar");
  if (isArabic) {
    return `أنت وكيل ذكاء اصطناعي خبير في بناء ونشر المشاريع البرمجية الكاملة. عندك صلاحيات كاملة.

قدراتك:
- كتابة وقراءة الملفات في مساحة العمل
- تشغيل أوامر shell مباشرة
- تثبيت حزم npm
- تشغيل المشروع محلياً
- تصفح الإنترنت وجلب APIs والمستندات
- حفظ secrets وبيانات البيئة
- النشر التلقائي على Vercel والحصول على رابط حي

قواعد البناء الصارمة:
1. ابدأ دائماً بـ package.json مع جميع dependencies المطلوبة
2. ملف الدخول الرئيسي: index.ts (TypeScript دائماً)
3. Backend: TypeScript + Express/Fastify مع types كاملة
4. Frontend: HTML/CSS/JS احترافي أو React مع Vite
5. اكتب كود حقيقي قابل للتشغيل - بدون placeholders أو TODO
6. بعد اكتمال البناء: شغّل run_project للتحقق
7. بعد التأكيد: استخدم deploy_to_vercel للنشر التلقائي والحصول على رابط حي
8. عند Redeploy: استخدم نفس أداة deploy_to_vercel وستحافظ على نفس الرابط

ترتيب العمل المثالي:
write_file (package.json) → write_file (الملفات) → install_packages → run_project → deploy_to_vercel

أسلوبك:
- ابدأ مباشرة بدون مقدمات طويلة
- أخبر المستخدم بكل خطوة بوضوح
- عند الانتهاء: اعرض الرابط الحي وملخص الملفات`;
  }

  return `You are an expert AI agent that builds and deploys complete software projects. You have full permissions.

Your capabilities:
- Write and read files in the project workspace
- Execute shell commands directly
- Install npm packages
- Run the project locally to test it
- Browse the web and fetch APIs/documentation
- Manage secrets and environment variables
- Deploy automatically to Vercel and get a live public URL

Strict build rules:
1. Always start with package.json including ALL required dependencies
2. Main entry file: index.ts (TypeScript always)
3. Backend: TypeScript + Express/Fastify with proper types
4. Frontend: Professional HTML/CSS/JS or React with Vite
5. Write real, executable code — NO placeholders, NO "TODO", NO mock data
6. After building: call run_project to verify it works
7. After verification: call deploy_to_vercel to deploy and get a live URL
8. On redeploy: use deploy_to_vercel again — it reuses the same Vercel project/URL

Ideal workflow order:
write_file (package.json) → write_file (files) → install_packages → run_project → deploy_to_vercel

Style:
- Start building immediately without lengthy introductions
- Tell the user what you're doing at each step
- When done: show the live URL prominently and a file summary`;
}

// ─── Execute tool ──────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, any>,
  projectId: string
): Promise<string> {
  const wsDir = getWorkspaceDir(projectId);
  const secrets = getProjectSecrets(projectId);

  switch (name) {
    case "write_file": {
      const abs = path.resolve(wsDir, args.path);
      if (!abs.startsWith(wsDir)) return "Error: Invalid path";
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, args.content, "utf-8");
      return `✓ Written: ${args.path} (${args.content.length} chars)`;
    }

    case "read_file": {
      const abs = path.resolve(wsDir, args.path);
      if (!abs.startsWith(wsDir)) return "Error: Invalid path";
      if (!fs.existsSync(abs)) return `Error: File not found: ${args.path}`;
      const content = fs.readFileSync(abs, "utf-8");
      return content.length > 8000 ? content.slice(0, 8000) + "\n...[truncated]" : content;
    }

    case "list_files": {
      const files = listFilesRecursive(wsDir);
      if (files.length === 0) return "No files in workspace yet.";
      return files
        .map((f) => `${f.isDir ? "📁" : "📄"} ${f.path}${f.isDir ? "/" : ` (${f.size}B)`}`)
        .join("\n");
    }

    case "run_command": {
      try {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd: wsDir,
          timeout: 60000,
          env: { ...process.env, ...secrets },
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return out || "(no output)";
      } catch (err: any) {
        return `Exit ${err.code ?? 1}:\n${[err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message}`;
      }
    }

    case "install_packages": {
      const pkgs = (args.packages as string[])
        .map((p) => p.replace(/[^a-zA-Z0-9@/._~-]/g, ""))
        .join(" ");
      try {
        const { stdout, stderr } = await execAsync(`npm install ${pkgs} --save`, {
          cwd: wsDir,
          timeout: 120000,
        });
        return `✓ Installed: ${pkgs}\n${stderr || ""}`.trim();
      } catch (err: any) {
        return `Install error: ${err.stderr || err.message}`;
      }
    }

    case "fetch_url": {
      try {
        const res = await fetch(args.url, {
          method: args.method ?? "GET",
          headers: { "User-Agent": "AI Builder Agent/1.0" },
        });
        const text = await res.text();
        const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n...[truncated]" : text;
        return `HTTP ${res.status} ${args.url}\nContent-Type: ${res.headers.get("content-type")}\n\n${truncated}`;
      } catch (err: any) {
        return `Fetch error: ${err.message}`;
      }
    }

    case "set_secret": {
      const current = getProjectSecrets(projectId);
      current[args.key] = args.value;
      const secretsPath = path.join(wsDir, ".secrets.json");
      fs.writeFileSync(secretsPath, JSON.stringify(current, null, 2), "utf-8");
      return `✓ Secret stored: ${args.key}`;
    }

    case "run_project": {
      const entryFiles = ["index.ts", "src/index.ts", "index.js", "src/index.js"];
      let entry = "index.ts";
      for (const f of entryFiles) {
        if (fs.existsSync(path.join(wsDir, f))) { entry = f; break; }
      }
      const hasTsx = fs.existsSync(path.join(wsDir, "node_modules/.bin/tsx"));
      try {
        const { stdout, stderr } = await execAsync(
          hasTsx ? `timeout 20 npx tsx ${entry}` : `timeout 20 node ${entry}`,
          { cwd: wsDir, timeout: 25000, env: { ...process.env, ...secrets, NODE_ENV: "production" } }
        );
        return `✓ Project ran successfully!\n${[stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)"}`;
      } catch (err: any) {
        const out = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
        return `Project output:\n${out || err.message}`;
      }
    }

    case "deploy_to_vercel": {
      const token = process.env.VERCEL_TOKEN;
      if (!token) return "❌ VERCEL_TOKEN not configured. Ask the user to add it.";
      try {
        const project = findById<any>("projects", projectId);
        const result = await deployToVercel(
          token,
          wsDir,
          project?.name ?? "ai-project",
          project?.vercelProjectId,
          secrets
        );
        // Save deploy info
        updateRecord("projects", projectId, {
          vercelUrl: result.url,
          vercelProjectId: result.projectId,
          vercelProjectName: result.projectName,
          lastDeployedAt: new Date().toISOString(),
        });
        return `✅ Deployed to Vercel!\n🔗 Live URL: ${result.url}\n📦 Project: ${result.projectName}\n📊 Status: ${result.readyState}`;
      } catch (err: any) {
        return `❌ Deploy failed: ${err.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Stream endpoint ───────────────────────────────────────────────
router.post("/projects/:projectId/agent/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { content, attachmentUrl } = req.body as {
    content?: string;
    attachmentUrl?: string | null;
  };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  const users = findWhere<User>("users", (u) => u.id === userId);
  const user = users[0];
  const userLang = user?.language;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Save user message
  const userMsgId = (await import("uuid")).v4();
  const userMsg = {
    id: userMsgId,
    projectId: req.params.projectId,
    role: "user" as const,
    content,
    thinkingSteps: null,
    attachmentUrl: attachmentUrl ?? null,
    createdAt: new Date().toISOString(),
  };
  insertRecord("messages", userMsg);
  sendEvent("user_message", userMsg);

  // Load message history
  const allMsgs = findWhere<any>("messages", (m) => m.projectId === req.params.projectId);
  allMsgs.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });

  const messages: any[] = [
    { role: "system", content: getAgentSystemPrompt(userLang) },
    ...allMsgs.slice(-10).map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const aiMsgId = (await import("uuid")).v4();
  let fullContent = "";
  const toolCallsUsed: string[] = [];

  try {
    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 15;

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      const stream = await client.chat.completions.create({
        model: process.env.AI_MODEL ?? "anthropic/claude-opus-4-6",
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
        stream: true,
      });

      let iterationText = "";
      // ✅ FIX: Use a plain object map instead of a sparse array
      // to avoid undefined holes when iterating later.
      const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Stream text
        if (delta.content) {
          iterationText += delta.content;
          fullContent += delta.content;
          sendEvent("chunk", { delta: delta.content, msgId: aiMsgId });
        }

        // Accumulate tool calls into the map
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index === undefined) continue;
            if (!toolCallsMap[tc.index]) {
              toolCallsMap[tc.index] = { id: tc.id ?? "", name: "", arguments: "" };
            }
            if (tc.id) toolCallsMap[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsMap[tc.index].name = tc.function.name;
            if (tc.function?.arguments) toolCallsMap[tc.index].arguments += tc.function.arguments;
          }
        }

        if (choice.finish_reason === "stop" || choice.finish_reason === "end_turn") {
          continueLoop = false;
        }
      }

      // ✅ FIX: Convert map to a dense array — no undefined holes guaranteed.
      const toolCalls = Object.values(toolCallsMap);

      // Push assistant message
      messages.push({
        role: "assistant",
        content: iterationText || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined,
      });

      // Execute tool calls
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          // ✅ FIX: Guard against entries with empty name (partial chunks)
          if (!tc || !tc.name) continue;

          toolCallsUsed.push(tc.name);

          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.arguments || "{}"); } catch {}

          // Notify frontend of tool call start
          sendEvent("tool_call", {
            name: tc.name,
            args,
            status: "running",
          });

          const result = await executeTool(tc.name, args, req.params.projectId);

          // Notify frontend of tool result
          sendEvent("tool_result", {
            name: tc.name,
            result: result.length > 2000 ? result.slice(0, 2000) + "\n...[truncated]" : result,
            status: "done",
          });

          // Append truncated result for context
          const truncatedForContext = result.length > 6000 ? result.slice(0, 6000) + "\n...[truncated]" : result;
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncatedForContext,
          });
        }
      } else {
        continueLoop = false;
      }
    }

    // Save final AI message
    const aiMsg = {
      id: aiMsgId,
      projectId: req.params.projectId,
      role: "assistant" as const,
      content: fullContent,
      thinkingSteps: toolCallsUsed.length > 0 ? toolCallsUsed : null,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    insertRecord("messages", aiMsg);
    updateRecord<any>("projects", req.params.projectId, { updatedAt: new Date().toISOString() });

    // Deduct credit
    if (user) {
      updateRecord<User>("users", userId, {
        creditsUsed: (user.creditsUsed ?? 0) + 1,
      });
    }

    sendEvent("done", aiMsg);
  } catch (err: any) {
    req.log?.error({ err }, "Agent stream failed");
    sendEvent("error", { message: err.message ?? "Agent error" });
  } finally {
    res.end();
  }
});

export default router;
