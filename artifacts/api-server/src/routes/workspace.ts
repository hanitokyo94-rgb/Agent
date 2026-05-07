import { Router } from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { findById, findWhere, readCollection, updateRecord } from "../lib/storage.js";
import type { User } from "./auth.js";

const execAsync = promisify(exec);
const router = Router();

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

// POST /api/projects/:projectId/run
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
const runningProcesses: Record<string, any> = {};
function killProject(projectId: string) {
  if (runningProcesses[projectId]) {
    try { runningProcesses[projectId].kill("SIGTERM"); } catch {}
    delete runningProcesses[projectId];
  }
}

function getSecretsPath(projectId: string): string {
  return path.join(getWorkspaceDir(projectId), ".secrets.json");
}
function getProjectSecrets(projectId: string): Record<string, string> {
  const fp = getSecretsPath(projectId);
  if (!fs.existsSync(fp)) return {};
  try { return JSON.parse(fs.readFileSync(fp, "utf-8")); } catch { return {}; }
}
function setProjectSecrets(projectId: string, secrets: Record<string, string>) {
  fs.writeFileSync(getSecretsPath(projectId), JSON.stringify(secrets, null, 2), "utf-8");
}

export { getWorkspaceDir, getProjectSecrets, listFilesRecursive, WORKSPACES_DIR };
export default router;
