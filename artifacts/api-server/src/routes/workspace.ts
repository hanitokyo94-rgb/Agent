import { Router } from "express";
import fs from "fs";
import path from "path";
import net from "net";
import { exec, spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { promisify } from "util";
import { findById, findWhere, readCollection, updateRecord } from "../lib/storage.js";
import type { User } from "./auth.js";

const execAsync = promisify(exec);
const router = Router();

// Track allocated ports so concurrent run requests don't collide
const allocatedPorts = new Set<number>();

async function findAvailablePort(start = 3456, end = 3900): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (allocatedPorts.has(port)) continue;
    const available = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (available) { allocatedPorts.add(port); return port; }
  }
  return start; // fallback
}

// Track live running processes per project
const runningProcesses = new Map<string, ChildProcess>();

// Use process.cwd() (= artifacts/api-server/) to avoid __dirname bundle issues
const WORKSPACES_DIR = process.env.WORKSPACES_DIR ?? path.resolve(process.cwd(), "../../agentdata/projects");

function getWorkspaceDir(projectId: string): string {
  const dir = path.join(WORKSPACES_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserId(req: any): string | null {
  let userId = req.session?.userId;
  if (!userId) {
    // Check Authorization header OR query param (needed for EventSource / direct download links)
    const rawAuth = req.headers.authorization
      || (req.query.authorization ? decodeURIComponent(req.query.authorization as string) : null)
      || (req.query.token ? `Bearer ${decodeURIComponent(req.query.token as string)}` : null);
    const authHeader = rawAuth as string | undefined;
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

function listFilesRecursive(dir: string, base = ""): Array<{ path: string; size: number; isDir: boolean }> {
  const items: Array<{ path: string; size: number; isDir: boolean }> = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".secrets.json") continue;
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        items.push({ path: relPath, size: 0, isDir: true });
        items.push(...listFilesRecursive(fullPath, relPath));
      } else {
        const stat = fs.statSync(fullPath);
        items.push({ path: relPath, size: stat.size, isDir: false });
      }
    }
  } catch {}
  return items;
}

function sanitizePath(wsDir: string, filePath: string): string | null {
  const resolved = path.resolve(wsDir, filePath);
  if (!resolved.startsWith(wsDir)) return null;
  return resolved;
}

// GET /api/projects/:projectId/files
router.get("/projects/:projectId/files", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const files = listFilesRecursive(wsDir);
  res.json({ files });
});

// GET /api/projects/:projectId/file?path=src/index.ts
router.get("/projects/:projectId/file", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const abs = sanitizePath(wsDir, filePath);
  if (!abs) { res.status(400).json({ error: "Invalid path" }); return; }
  if (!fs.existsSync(abs)) { res.status(404).json({ error: "File not found" }); return; }
  const content = fs.readFileSync(abs, "utf-8");
  res.json({ path: filePath, content });
});

// PUT /api/projects/:projectId/file
router.put("/projects/:projectId/file", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const { path: filePath, content } = req.body as { path: string; content: string };
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const abs = sanitizePath(wsDir, filePath);
  if (!abs) { res.status(400).json({ error: "Invalid path" }); return; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content ?? "", "utf-8");
  res.json({ success: true, path: filePath });
});

// DELETE /api/projects/:projectId/file
router.delete("/projects/:projectId/file", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const abs = sanitizePath(wsDir, filePath);
  if (!abs || !fs.existsSync(abs)) { res.status(404).json({ error: "File not found" }); return; }
  fs.rmSync(abs, { recursive: true, force: true });
  res.json({ success: true });
});

// POST /api/projects/:projectId/shell
router.post("/projects/:projectId/shell", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const { command, timeout = 30000 } = req.body as { command: string; timeout?: number };
  if (!command) { res.status(400).json({ error: "command is required" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const secrets = getProjectSecrets(req.params.projectId);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: wsDir, timeout: Math.min(Number(timeout), 120000),
      env: { ...process.env, ...secrets },
    });
    res.json({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
  } catch (err: any) {
    res.json({ stdout: err.stdout || "", stderr: err.stderr || err.message || "", exitCode: err.code ?? 1 });
  }
});

// POST /api/projects/:projectId/install
router.post("/projects/:projectId/install", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const { packages } = req.body as { packages: string[] };
  if (!packages?.length) { res.status(400).json({ error: "packages array is required" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const pkgList = packages.map((p) => p.replace(/[^a-zA-Z0-9@/._-]/g, "")).join(" ");
  try {
    const { stdout, stderr } = await execAsync(`npm install ${pkgList}`, { cwd: wsDir, timeout: 120000 });
    res.json({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
  } catch (err: any) {
    res.json({ stdout: err.stdout || "", stderr: err.stderr || err.message, exitCode: 1 });
  }
});

// POST /api/projects/:projectId/run (legacy — kept for compatibility)
router.post("/projects/:projectId/run", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const wsDir = getWorkspaceDir(req.params.projectId);
  const secrets = getProjectSecrets(req.params.projectId);
  killProject(req.params.projectId);
  const entryFiles = ["index.ts", "src/index.ts", "index.js", "src/index.js"];
  let entry = "index.ts";
  for (const f of entryFiles) {
    if (fs.existsSync(path.join(wsDir, f))) { entry = f; break; }
  }
  const hasTsx = fs.existsSync(path.join(wsDir, "node_modules/.bin/tsx"));
  const command = hasTsx ? `npx tsx ${entry}` : `node ${entry}`;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: wsDir, timeout: 60000, env: { ...process.env, ...secrets, PORT: "3456" },
    });
    res.json({ stdout: stdout || "", stderr: stderr || "", exitCode: 0, entry });
  } catch (err: any) {
    res.json({ stdout: err.stdout || "", stderr: err.stderr || err.message, exitCode: 1, entry });
  }
});

// GET /api/projects/:projectId/run/stream — SSE streaming run console
router.get("/projects/:projectId/run/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const wsDir = getWorkspaceDir(req.params.projectId);
  const secrets = getProjectSecrets(req.params.projectId);

  // Kill any existing process for this project
  const existingProc = runningProcesses.get(req.params.projectId);
  if (existingProc) {
    try { existingProc.kill("SIGTERM"); } catch {}
    runningProcesses.delete(req.params.projectId);
  }

  // Detect run command from project type
  function detectRunCommand(): { cmd: string; args: string[]; label: string } {
    const pkgPath = path.join(wsDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const pm = fs.existsSync(path.join(wsDir, "pnpm-lock.yaml")) ? "pnpm"
          : fs.existsSync(path.join(wsDir, "yarn.lock")) ? "yarn" : "npm";
        const script = pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start"
          : pkg.scripts?.serve ? "serve" : null;
        if (script) return { cmd: pm, args: ["run", script], label: `${pm} run ${script}` };
      } catch {}
    }
    if (fs.existsSync(path.join(wsDir, "main.py"))) return { cmd: "python3", args: ["main.py"], label: "python3 main.py" };
    if (fs.existsSync(path.join(wsDir, "app.py"))) return { cmd: "python3", args: ["app.py"], label: "python3 app.py" };
    if (fs.existsSync(path.join(wsDir, "index.html"))) return { cmd: "python3", args: ["-m", "http.server", "3456"], label: "python3 -m http.server 3456" };
    const entry = ["index.ts","src/index.ts","index.js","src/index.js"].find((f) => fs.existsSync(path.join(wsDir, f))) ?? "index.js";
    const hasTsx = fs.existsSync(path.join(wsDir, "node_modules/.bin/tsx"));
    return hasTsx
      ? { cmd: "npx", args: ["tsx", entry], label: `npx tsx ${entry}` }
      : { cmd: "node", args: [entry], label: `node ${entry}` };
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, text: string) => {
    try { res.write(`data: ${JSON.stringify({ type, text, ts: Date.now() })}\n\n`); (res as any).flush?.(); } catch {}
  };

  const { cmd, args, label } = detectRunCommand();
  const port = await findAvailablePort();
  send("info", `▶ Starting: ${label}`);
  send("info", `📂 Workspace: ${wsDir}`);
  send("info", `🔌 Port: ${port}`);

  const proc = spawn(cmd, args, {
    cwd: wsDir,
    env: { ...process.env, ...secrets, PORT: String(port), FORCE_COLOR: "1", NO_COLOR: "0" },
    shell: true,
  });

  runningProcesses.set(req.params.projectId, proc);

  proc.on("exit", () => { allocatedPorts.delete(port); });

  proc.stdout?.on("data", (data: Buffer) => {
    data.toString().split("\n").filter(Boolean).forEach((line) => send("stdout", line));
  });
  proc.stderr?.on("data", (data: Buffer) => {
    data.toString().split("\n").filter(Boolean).forEach((line) => send("stderr", line));
  });
  proc.on("error", (err) => send("error", `Process error: ${err.message}`));
  proc.on("exit", (code, signal) => {
    runningProcesses.delete(req.params.projectId);
    send("exit", `Process exited — code: ${code ?? signal ?? "unknown"}`);
    try { res.end(); } catch {}
  });

  req.on("close", () => {
    try { proc.kill("SIGTERM"); } catch {}
    runningProcesses.delete(req.params.projectId);
  });
});

// DELETE /api/projects/:projectId/run/stream — stop the running process
router.delete("/projects/:projectId/run/stream", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const proc = runningProcesses.get(req.params.projectId);
  if (proc) {
    try { proc.kill("SIGTERM"); setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 3000); } catch {}
    runningProcesses.delete(req.params.projectId);
  }
  res.json({ success: true, stopped: !!proc });
});

// GET /api/projects/:projectId/run/status — check if process is running
router.get("/projects/:projectId/run/status", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json({ running: runningProcesses.has(req.params.projectId) });
});

// GET /api/projects/:projectId/download — download project as ZIP
router.get("/projects/:projectId/download", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const wsDir = getWorkspaceDir(req.params.projectId);
  const projectName = (project.name ?? "project").replace(/[^a-zA-Z0-9._-]/g, "_");

  try {
    res.setHeader("Content-Disposition", `attachment; filename="${projectName}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Cache-Control", "no-cache");

    const { stdout } = await execAsync(
      `zip -r - . --exclude "node_modules/*" --exclude ".git/*" --exclude "dist/*" --exclude "*.map" --exclude ".secrets.json" 2>/dev/null || true`,
      { cwd: wsDir, maxBuffer: 1024 * 1024 * 100, encoding: "buffer" }
    ) as any;
    res.end(stdout);
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/fetch
router.post("/projects/:projectId/fetch", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { url, method = "GET", headers: reqHeaders } = req.body as {
    url: string; method?: string; headers?: Record<string, string>;
  };
  if (!url) { res.status(400).json({ error: "url is required" }); return; }
  try {
    const response = await fetch(url, {
      method,
      headers: { "User-Agent": "Mozilla/5.0 AI Builder Bot", ...reqHeaders },
    });
    const text = await response.text();
    const truncated = text.length > 20000 ? text.slice(0, 20000) + "\n...[truncated]" : text;
    res.json({ status: response.status, contentType: response.headers.get("content-type"), body: truncated, url });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/secrets
router.get("/projects/:projectId/secrets", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  res.json({ secrets: getProjectSecrets(req.params.projectId) });
});

// PUT /api/projects/:projectId/secrets
router.put("/projects/:projectId/secrets", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }
  const { secrets } = req.body as { secrets: Record<string, string> };
  setProjectSecrets(req.params.projectId, secrets);
  res.json({ success: true });
});

// GET /api/projects/:projectId/raw/:filepath
// Serves any raw file from the project workspace (images, assets, etc.)
router.get("/projects/:projectId/raw/:filepath", (req, res) => {
  const wsDir = path.join(WORKSPACES_DIR, req.params.projectId);
  const relPath = decodeURIComponent(req.params.filepath);
  const filePath = path.resolve(wsDir, relPath);
  if (!filePath.startsWith(path.resolve(wsDir))) {
    res.status(403).send("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.status(404).send("Not found");
    return;
  }
  res.sendFile(filePath);
});

// GET /api/projects/:projectId/preview  and  /api/projects/:projectId/preview/*
// Serves the built static output of a user project, with SPA fallback.
function getPreviewServeDir(projectId: string): string | null {
  const wsDir = path.join(WORKSPACES_DIR, projectId);
  for (const d of ["dist", "build", "out", ".next/out"]) {
    const candidate = path.join(wsDir, d);
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  // Fallback: serve from workspace root if index.html exists there (simple static sites)
  if (fs.existsSync(path.join(wsDir, "index.html"))) return wsDir;
  return null;
}

// Mount a catch-all handler for all preview paths using router.use (avoids path-to-regexp wildcard issues in Express 5)
router.use("/projects/:projectId/preview", (req, res) => {
  const serveDir = getPreviewServeDir(req.params.projectId);
  if (!serveDir) {
    res.status(404).json({ error: "No preview built yet. Ask the agent to build_preview first." });
    return;
  }
  // req.path is relative to the /preview mount point (e.g. "/" or "/assets/main.css")
  const relPath = (req.path === "/" || req.path === "") ? "index.html" : req.path.replace(/^\/+/, "");
  const filePath = path.resolve(serveDir, relPath);
  // Security: prevent path traversal
  if (!filePath.startsWith(path.resolve(serveDir))) {
    res.status(403).send("Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    // SPA fallback — return index.html for any unknown path
    res.sendFile(path.join(serveDir, "index.html"));
  }
});

// Helpers
function killProject(projectId: string) {
  const proc = runningProcesses.get(projectId);
  if (proc) {
    try { proc.kill("SIGTERM"); } catch {}
    runningProcesses.delete(projectId);
  }
}

function getSecretsPath(projectId: string): string {
  return path.join(getWorkspaceDir(projectId), ".secrets.json");
}
function getProjectSecrets(projectId: string): Record<string, string> {
  const fp = getSecretsPath(projectId);
  if (!fs.existsSync(fp)) return {};
  try {
    const raw: Record<string, string> = JSON.parse(fs.readFileSync(fp, "utf-8"));
    // Resolve __PLATFORM_URL__ placeholder set during backfill / migration
    const platformUrl = process.env.PLATFORM_URL ?? `https://${process.env.REPL_SLUG ?? "platform"}.replit.app`;
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      resolved[k] = typeof v === "string" ? v.replace(/__PLATFORM_URL__/g, platformUrl) : v;
    }
    return resolved;
  } catch { return {}; }
}
function setProjectSecrets(projectId: string, secrets: Record<string, string>) {
  fs.writeFileSync(getSecretsPath(projectId), JSON.stringify(secrets, null, 2), "utf-8");
}

export { getWorkspaceDir, getProjectSecrets, listFilesRecursive, WORKSPACES_DIR };
export default router;
