/**
 * Manus-inspired Agent Stream
 * POST /api/projects/:projectId/agent/stream
 * Single unified endpoint — AI auto-detects chat vs build intent
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { findById, findWhere, insertRecord, updateRecord } from "../lib/storage.js";
import { getWorkspaceDir, getProjectSecrets, listFilesRecursive } from "./workspace.js";
import { deployToVercel } from "../lib/vercel-deploy.js";
import type { User } from "./auth.js";

const execAsync = promisify(exec);
const router = Router();

// ── Auth helper ────────────────────────────────────────────────────
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

// ── Tool definitions (Manus-style) ─────────────────────────────────
const AGENT_TOOLS = [
  // ── Messaging ──
  {
    type: "function" as const,
    function: {
      name: "message_notify",
      description: "Send a progress update or status message to the user without stopping. Use for: acknowledging requests, reporting progress, explaining your plan. Do NOT use for delivering final results — use task_done for that.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Notification message text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "task_done",
      description: "Signal that the current task is fully complete. Send the final summary/result to the user. Always call this when the task is done — it marks completion in the UI.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Complete summary of what was accomplished, results, file paths, URLs, etc." },
        },
        required: ["summary"],
      },
    },
  },

  // ── File operations ──
  {
    type: "function" as const,
    function: {
      name: "file_write",
      description: "Write or overwrite a file in the project workspace. Creates parent directories automatically. Use for creating new files or completely replacing file content.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path e.g. src/index.ts or public/index.html" },
          content: { type: "string", description: "Complete file content to write" },
          append: { type: "boolean", description: "If true, append to existing file instead of overwriting" },
        },
        required: ["file", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_read",
      description: "Read the content of a file in the project workspace. Optionally specify line range.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path" },
          start_line: { type: "integer", description: "Optional: 0-based starting line to read from" },
          end_line: { type: "integer", description: "Optional: end line (exclusive)" },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_str_replace",
      description: "Replace an exact string within a file. Use for targeted edits — more efficient than rewriting the whole file. The old_str must match exactly.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path" },
          old_str: { type: "string", description: "Exact string to find and replace" },
          new_str: { type: "string", description: "Replacement string" },
        },
        required: ["file", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_find_by_name",
      description: "Find files by name pattern (glob) in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          glob: { type: "string", description: "Glob pattern e.g. '*.ts' or 'src/**/*.tsx'" },
        },
        required: ["glob"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_find_in_content",
      description: "Search for text or regex pattern within files in the workspace.",
      parameters: {
        type: "object",
        properties: {
          regex: { type: "string", description: "Search pattern (regex or plain text)" },
          file: { type: "string", description: "Optional: specific file to search in. If omitted, searches all files." },
        },
        required: ["regex"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_list",
      description: "List all files and directories in the project workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_delete",
      description: "Delete a file from the project workspace.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path to delete" },
        },
        required: ["file"],
      },
    },
  },

  // ── Shell ──
  {
    type: "function" as const,
    function: {
      name: "shell_exec",
      description: "Execute a shell command in the project workspace. Use for: running builds, compiling TypeScript, running tests, starting servers briefly, checking installed packages, git operations, etc. Chains with && are supported. Timeout: 90 seconds.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute. Use -y/-f flags to avoid interactive prompts." },
          timeout: { type: "integer", description: "Optional timeout in seconds (default: 90, max: 300)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "install_packages",
      description: "Install npm packages into the project workspace via npm install.",
      parameters: {
        type: "object",
        properties: {
          packages: {
            type: "array",
            items: { type: "string" },
            description: "Package names to install e.g. ['express', '@types/express', 'typescript']",
          },
          dev: { type: "boolean", description: "If true, install as devDependencies (--save-dev)" },
        },
        required: ["packages"],
      },
    },
  },

  // ── Web ──
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL. Use for: reading API docs, downloading data, checking APIs, reading GitHub raw files, fetching web pages. Returns page content as text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL including protocol" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method (default: GET)" },
          body: { type: "string", description: "Optional request body for POST/PUT" },
          headers: { type: "object", description: "Optional HTTP headers as key-value pairs" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information. Use for: finding documentation, researching libraries, getting latest info, finding examples.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (3-5 keywords, Google-style)" },
        },
        required: ["query"],
      },
    },
  },

  // ── Secrets & Config ──
  {
    type: "function" as const,
    function: {
      name: "set_secret",
      description: "Store a secret or environment variable for the project. These are injected as env vars when running the project.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Environment variable name e.g. DATABASE_URL" },
          value: { type: "string", description: "Secret value" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_secrets",
      description: "List the names (not values) of stored project secrets/environment variables.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Deploy ──
  {
    type: "function" as const,
    function: {
      name: "deploy_to_vercel",
      description: "Deploy the project to Vercel and get a public live URL. Call AFTER the project is built and tested. On subsequent calls, redeploys to the same URL. Handles both static sites and Node.js apps.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── System prompt (Manus-inspired) ────────────────────────────────
function getSystemPrompt(lang: string | null | undefined, workspaceFileCount: number): string {
  const isArabic = lang === "ar" || lang?.startsWith("ar");

  const filesContext = workspaceFileCount > 0
    ? (isArabic ? `\nالمشروع يحتوي حالياً على ${workspaceFileCount} ملف في مساحة العمل.` : `\nProject currently has ${workspaceFileCount} files in workspace.`)
    : "";

  if (isArabic) {
    return `أنت وكيل ذكاء اصطناعي متقدم — مدعوم بقدرات مشابهة لـ Manus AI. تعمل في بيئة Linux مع وصول كامل للإنترنت.${filesContext}

<قدراتك>
- قراءة وكتابة وتعديل الملفات بدقة عالية
- تنفيذ أوامر shell ومعالجة النتائج
- تثبيت حزم npm وإدارة المشاريع
- تصفح الإنترنت وجلب API والمستندات
- البحث في الويب للمعلومات الحديثة
- حفظ الـ secrets وإدارة متغيرات البيئة
- نشر المشاريع على Vercel والحصول على روابط حية
</قدراتك>

<طريقة العمل>
1. **حلل الطلب**: افهم ماذا يريد المستخدم بدقة
2. **قرر النوع تلقائياً**:
   - طلب محادثة/سؤال/معلومات → أجب مباشرة بدون أدوات (أو بأدوات محدودة مثل web_search)
   - طلب بناء/كود/مشروع → استخدم الأدوات الكاملة للبناء والنشر
   - لا تسأل المستخدم "هل تريد محادثة أم بناء؟" — اكتشف بنفسك
3. **نفّذ بترتيب منطقي**: للمشاريع، اتبع هذا الترتيب:
   - file_write (package.json أولاً) → file_write (باقي الملفات) → install_packages → shell_exec (build/test) → deploy_to_vercel
4. **أخبر المستخدم بالتقدم**: استخدم message_notify لكل خطوة مهمة
5. **أنهِ بـ task_done**: عند اكتمال أي مهمة، لخّص النتيجة
</طريقة العمل>

<قواعد البناء>
- ابدأ دائماً بـ package.json مع جميع dependencies
- TypeScript للـ backend دائماً
- Frontend: HTML/CSS/JS احترافي أو React مع Vite
- لا placeholders، لا TODO، لا mock data — كود حقيقي قابل للتشغيل فقط
- عند تعديل ملف موجود: استخدم file_str_replace بدلاً من إعادة كتابة الملف كله
- بعد التثبيت والبناء: اختبر أن كل شيء يعمل ثم انشر على Vercel
</قواعد البناء>

<قواعد التواصل>
- استخدم message_notify للتحديثات المؤقتة
- استخدم task_done عند الانتهاء من أي مهمة
- تكلم بنفس لغة المستخدم
- لا قوائم مطوّلة في ردودك — استخدم نصاً متدفقاً
- كن مباشراً ومختصراً في التحديثات، مفصّلاً في النتائج
</قواعد التواصل>`;
  }

  return `You are an advanced AI agent — powered with capabilities similar to Manus AI. You operate in a Linux environment with full internet access and a project workspace.${filesContext}

<capabilities>
- Read, write, and precisely edit files (targeted string replacements)
- Execute shell commands and process results
- Install npm packages and manage projects
- Browse the web, fetch APIs and documentation
- Search the web for up-to-date information
- Store secrets and manage environment variables
- Deploy projects to Vercel and provide live public URLs
</capabilities>

<agent_loop>
You operate iteratively:
1. Analyze the user's request to understand the true intent
2. Auto-detect the task type — NO need to ask the user to switch modes:
   - Conversation/question/information → respond directly (use web_search if needed for current info)
   - Build/code/project/automation → use the full tool suite to build, test, and deploy
   - The AI determines intent — never ask "do you want chat or build mode?"
3. Execute in logical order. For projects:
   file_write (package.json first) → file_write (source files) → install_packages → shell_exec (build/test) → deploy_to_vercel
4. Notify progress with message_notify at each meaningful step
5. End every task with task_done — summarize what was accomplished
</agent_loop>

<build_rules>
- Always start with package.json containing ALL required dependencies
- TypeScript for backend always — never plain JS for backend
- Frontend: professional HTML/CSS/JS or React with Vite
- NO placeholders, NO TODO comments, NO mock data — real executable code only
- For editing existing files: prefer file_str_replace over rewriting the whole file
- Chain shell commands with && to minimize roundtrips: e.g. "cd .. && npm install && npm run build"
- After installing and building: verify it works, then deploy to Vercel automatically
- Use web_search + fetch_url to find correct APIs, docs, and latest package versions
</build_rules>

<communication_rules>
- Use message_notify for intermediate progress updates (non-blocking)
- Use task_done when fully completing any task — include all results, URLs, file paths
- Match the user's language (Arabic/English)
- Avoid bullet-point lists in responses — use flowing prose
- Be concise in updates, thorough in final results
- Never mention tool names to the user — say what you're doing naturally
</communication_rules>

<error_handling>
- If a command fails, read the error and try alternative approaches
- If a package install fails, check the error, try a different version or approach
- After 3 failed attempts on the same step, notify the user and explain the situation
- Never silently swallow errors — always report what happened
</error_handling>`;
}

// ── Tool executor ──────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, any>,
  projectId: string,
  sendEvent: (event: string, data: unknown) => void
): Promise<string> {
  const wsDir = getWorkspaceDir(projectId);
  const secrets = getProjectSecrets(projectId);

  // Helper: safe path inside workspace
  const safePath = (p: string) => {
    const abs = path.resolve(wsDir, p.startsWith("/") ? p.slice(1) : p);
    if (!abs.startsWith(wsDir)) throw new Error("Path outside workspace");
    return abs;
  };

  switch (name) {
    // ── Messaging ──
    case "message_notify": {
      sendEvent("notify", { text: args.text });
      return `[Notification sent to user]`;
    }

    case "task_done": {
      sendEvent("task_done", { summary: args.summary });
      return `[Task marked complete]`;
    }

    // ── File ops ──
    case "file_write": {
      const abs = safePath(args.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (args.append && fs.existsSync(abs)) {
        fs.appendFileSync(abs, args.content, "utf-8");
        return `✓ Appended to: ${args.file}`;
      }
      fs.writeFileSync(abs, args.content, "utf-8");
      return `✓ Written: ${args.file} (${args.content.length} chars)`;
    }

    case "file_read": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `Error: File not found: ${args.file}`;
      let content = fs.readFileSync(abs, "utf-8");
      if (args.start_line !== undefined || args.end_line !== undefined) {
        const lines = content.split("\n");
        const start = args.start_line ?? 0;
        const end = args.end_line ?? lines.length;
        content = lines.slice(start, end).join("\n");
      }
      return content.length > 12000 ? content.slice(0, 12000) + "\n...[truncated at 12000 chars]" : content;
    }

    case "file_str_replace": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `Error: File not found: ${args.file}`;
      const content = fs.readFileSync(abs, "utf-8");
      if (!content.includes(args.old_str)) {
        return `Error: String not found in ${args.file}. Make sure old_str matches exactly (including whitespace).`;
      }
      const updated = content.replace(args.old_str, args.new_str);
      fs.writeFileSync(abs, updated, "utf-8");
      return `✓ Replaced in ${args.file}`;
    }

    case "file_find_by_name": {
      const { execSync } = await import("child_process");
      try {
        const result = execSync(`find . -name "${args.glob.replace(/"/g, "")}" 2>/dev/null | head -50`, {
          cwd: wsDir, encoding: "utf-8", timeout: 10000,
        });
        return result.trim() || "No files found matching pattern.";
      } catch {
        // Fallback: manual glob
        const all = listFilesRecursive(wsDir);
        const pattern = args.glob.replace(/\*/g, ".*").replace(/\?/g, ".");
        const re = new RegExp(pattern, "i");
        const matches = all.filter((f) => re.test(path.basename(f.path)));
        return matches.length > 0 ? matches.map((f) => f.path).join("\n") : "No files found.";
      }
    }

    case "file_find_in_content": {
      const files = args.file
        ? [{ path: args.file, isDir: false, size: 0 }]
        : listFilesRecursive(wsDir).filter((f) => !f.isDir);
      const results: string[] = [];
      const re = new RegExp(args.regex, "gm");
      for (const f of files) {
        try {
          const abs = safePath(f.path);
          const content = fs.readFileSync(abs, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, i) => {
            if (re.test(line)) results.push(`${f.path}:${i + 1}: ${line.trim()}`);
          });
        } catch {}
      }
      return results.length > 0
        ? results.slice(0, 100).join("\n") + (results.length > 100 ? `\n...[${results.length - 100} more]` : "")
        : "No matches found.";
    }

    case "file_list": {
      const files = listFilesRecursive(wsDir);
      if (files.length === 0) return "Workspace is empty — no files yet.";
      return files
        .map((f) => `${f.isDir ? "📁" : "📄"} ${f.path}${!f.isDir ? ` (${f.size}B)` : ""}`)
        .join("\n");
    }

    case "file_delete": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `File not found: ${args.file}`;
      fs.rmSync(abs, { recursive: true, force: true });
      return `✓ Deleted: ${args.file}`;
    }

    // ── Shell ──
    case "shell_exec": {
      const timeoutMs = Math.min((args.timeout ?? 90) * 1000, 300000);
      try {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd: wsDir,
          timeout: timeoutMs,
          env: { ...process.env, ...secrets, NODE_ENV: "production" },
          maxBuffer: 1024 * 1024 * 4, // 4MB
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return out.length > 8000 ? out.slice(0, 8000) + "\n...[output truncated]" : out || "(command succeeded, no output)";
      } catch (err: any) {
        const out = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
        return `Exit ${err.code ?? 1}:\n${(out || err.message).slice(0, 6000)}`;
      }
    }

    case "install_packages": {
      const pkgs = (args.packages as string[])
        .map((p) => p.replace(/[^a-zA-Z0-9@/._~^<>=\-]/g, ""))
        .join(" ");
      const flag = args.dev ? "--save-dev" : "--save";
      try {
        const { stdout, stderr } = await execAsync(`npm install ${pkgs} ${flag}`, {
          cwd: wsDir, timeout: 180000,
          env: { ...process.env, NPM_CONFIG_YES: "true" },
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return `✓ Installed: ${pkgs}\n${out.slice(0, 2000)}`;
      } catch (err: any) {
        return `Install error:\n${[err.stdout, err.stderr].filter(Boolean).join("\n").trim().slice(0, 3000) || err.message}`;
      }
    }

    // ── Web ──
    case "fetch_url": {
      try {
        const res = await fetch(args.url, {
          method: args.method ?? "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 AI-Agent/2.0",
            ...(args.headers ?? {}),
          },
          body: args.body ? args.body : undefined,
          signal: AbortSignal.timeout(30000),
        });
        const text = await res.text();
        const truncated = text.length > 15000 ? text.slice(0, 15000) + "\n...[truncated]" : text;
        return `HTTP ${res.status} — ${args.url}\nContent-Type: ${res.headers.get("content-type")}\n\n${truncated}`;
      } catch (err: any) {
        return `Fetch error: ${err.message}`;
      }
    }

    case "web_search": {
      // Use DuckDuckGo HTML for search results
      try {
        const encoded = encodeURIComponent(args.query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          headers: { "User-Agent": "Mozilla/5.0 AI-Agent/2.0" },
          signal: AbortSignal.timeout(15000),
        });
        const html = await res.text();
        // Extract result text
        const results: string[] = [];
        const re = /class="result__title"[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>(.*?)<\/div>/gm;
        let m;
        while ((m = re.exec(html)) !== null && results.length < 10) {
          const url = m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0];
          const title = m[2].replace(/<[^>]+>/g, "").trim();
          const snippet = m[3].replace(/<[^>]+>/g, "").trim();
          if (title && snippet) results.push(`**${title}**\n${decodeURIComponent(url)}\n${snippet}`);
        }
        if (results.length === 0) {
          // fallback: extract visible text
          const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
          return `Search results for "${args.query}":\n${text}`;
        }
        return `Search results for "${args.query}":\n\n${results.join("\n\n")}`;
      } catch (err: any) {
        return `Search error: ${err.message}`;
      }
    }

    // ── Secrets ──
    case "set_secret": {
      const current = getProjectSecrets(projectId);
      current[args.key] = args.value;
      const secretsPath = path.join(wsDir, ".secrets.json");
      fs.mkdirSync(wsDir, { recursive: true });
      fs.writeFileSync(secretsPath, JSON.stringify(current, null, 2), "utf-8");
      return `✓ Secret stored: ${args.key}`;
    }

    case "get_secrets": {
      const current = getProjectSecrets(projectId);
      const keys = Object.keys(current);
      if (keys.length === 0) return "No secrets stored for this project.";
      return `Stored secrets (names only):\n${keys.join("\n")}`;
    }

    // ── Deploy ──
    case "deploy_to_vercel": {
      const token = process.env.VERCEL_TOKEN;
      if (!token) return "❌ VERCEL_TOKEN not configured. Ask the user to add it in project settings.";
      try {
        const project = findById<any>("projects", projectId);
        const result = await deployToVercel(
          token,
          wsDir,
          project?.name ?? "ai-project",
          project?.vercelProjectId,
          secrets
        );
        updateRecord("projects", projectId, {
          vercelUrl: result.url,
          vercelProjectId: result.projectId,
          vercelProjectName: result.projectName,
          lastDeployedAt: new Date().toISOString(),
        });
        // Notify frontend of the deploy URL
        sendEvent("deploy_done", { url: result.url });
        return `✅ Deployed successfully!\n🔗 Live URL: ${result.url}\n📦 Project: ${result.projectName}\n📊 Status: ${result.readyState}`;
      } catch (err: any) {
        return `❌ Deploy failed: ${err.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── Stream endpoint ────────────────────────────────────────────────
router.post("/projects/:projectId/agent/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { content } = req.body as { content?: string };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  const users = findWhere<User>("users", (u) => u.id === userId);
  const user = users[0];

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
    attachmentUrl: null,
    createdAt: new Date().toISOString(),
  };
  insertRecord("messages", userMsg);
  sendEvent("user_message", userMsg);

  // Load history
  const allMsgs = findWhere<any>("messages", (m) => m.projectId === req.params.projectId);
  allMsgs.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Count workspace files for context
  const wsDir = getWorkspaceDir(req.params.projectId);
  const wsFiles = fs.existsSync(wsDir) ? listFilesRecursive(wsDir).filter((f) => !f.isDir) : [];

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY, baseURL: process.env.AI_BASE_URL });

  const messages: any[] = [
    { role: "system", content: getSystemPrompt(user?.language, wsFiles.length) },
    // Include last 16 messages for context
    ...allMsgs.slice(-16).map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const aiMsgId = (await import("uuid")).v4();
  let fullContent = "";
  const toolsUsed: string[] = [];
  const model = process.env.AI_MODEL ?? "anthropic/claude-opus-4-6";
  // Qwen3 and some models emit <think>...</think> blocks — strip from user-facing content
  const isThinkingModel = model.toLowerCase().includes("qwen") || model.toLowerCase().includes("deepseek-r") || model.toLowerCase().includes("qwq");

  try {
    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      const reqParams: any = {
        model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        max_tokens: 8192,
        stream: true,
      };
      // Qwen3: disable built-in thinking to avoid conflicts with tool calling
      if (isThinkingModel) {
        reqParams.extra_body = { enable_thinking: false };
      }

      const stream = await client.chat.completions.create(reqParams);

      let iterText = "";
      let thinkBuffer = "";
      let inThink = false;
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta.content) {
          // Handle <think>...</think> tokens from Qwen3 / DeepSeek-R1
          if (isThinkingModel) {
            let text = delta.content;
            // Feed into think-filter
            thinkBuffer += text;

            // Extract visible content (outside <think> blocks)
            let visible = "";
            let buf = thinkBuffer;
            while (true) {
              if (!inThink) {
                const startIdx = buf.indexOf("<think>");
                if (startIdx === -1) {
                  visible += buf;
                  buf = "";
                  break;
                }
                visible += buf.slice(0, startIdx);
                buf = buf.slice(startIdx + 7);
                inThink = true;
              } else {
                const endIdx = buf.indexOf("</think>");
                if (endIdx === -1) {
                  // Still inside think block, consume
                  buf = "";
                  break;
                }
                buf = buf.slice(endIdx + 8);
                inThink = false;
              }
            }
            thinkBuffer = buf;

            if (visible) {
              iterText += visible;
              fullContent += visible;
              sendEvent("chunk", { delta: visible, msgId: aiMsgId });
            }
          } else {
            iterText += delta.content;
            fullContent += delta.content;
            sendEvent("chunk", { delta: delta.content, msgId: aiMsgId });
          }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: "", name: "", arguments: "" };
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
            }
          }
        }

        if (choice.finish_reason === "stop" || choice.finish_reason === "end_turn") {
          continueLoop = false;
        }
      }

      // Push assistant turn — use clean content without think tokens for history
      messages.push({
        role: "assistant",
        content: iterText || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }))
          : undefined,
      });

      // Execute tools
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          if (!tc.name) continue;
          // Skip internal tools from tracking
          if (tc.name !== "message_notify" && tc.name !== "task_done") {
            toolsUsed.push(tc.name);
          }

          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.arguments || "{}"); } catch {}

          sendEvent("tool_call", { name: tc.name, args, status: "running" });

          const result = await executeTool(tc.name, args, req.params.projectId, sendEvent);

          sendEvent("tool_result", {
            name: tc.name,
            result: result.length > 3000 ? result.slice(0, 3000) + "\n...[truncated]" : result,
            status: "done",
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.length > 8000 ? result.slice(0, 8000) + "\n...[truncated]" : result,
          });

          // If task_done called, break the loop
          if (tc.name === "task_done") {
            continueLoop = false;
            break;
          }
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
      thinkingSteps: toolsUsed.length > 0 ? toolsUsed : null,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    insertRecord("messages", aiMsg);
    updateRecord<any>("projects", req.params.projectId, { updatedAt: new Date().toISOString() });

    // Deduct credit
    if (user) {
      updateRecord<User>("users", userId, { creditsUsed: (user.creditsUsed ?? 0) + 1 });
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
