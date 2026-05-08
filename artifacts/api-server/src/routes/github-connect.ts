/**
 * GitHub connect routes — per-project GitHub token + repo config
 *
 * GET  /api/projects/:id/github/status      — connection info
 * POST /api/projects/:id/github/connect     — verify token, create repo if needed, save config
 * POST /api/projects/:id/github/disconnect  — remove saved config
 * PATCH /api/projects/:id/github/settings   — update autoPush flag
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { findById } from "../lib/storage.js";

const router = Router();

const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR ??
  path.resolve(process.cwd(), "../../agentdata/projects");

function getCfgPath(projectId: string): string {
  const dir = path.join(WORKSPACES_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, ".github-config.json");
}

function readCfg(projectId: string): Record<string, any> | null {
  const p = getCfgPath(projectId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function getUserId(req: any): string | null {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) return null;
  try { return Buffer.from(auth.slice(7), "base64").toString().split(":")[0] || null; } catch { return null; }
}

async function ghFetch(url: string, token: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "AI-Builder/1.0",
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

// ── Status ────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/github/status", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const cfg = readCfg(req.params.projectId);
  if (!cfg) { res.json({ connected: false }); return; }

  res.json({
    connected: true,
    repo: cfg.repo,
    username: cfg.username,
    connectedAt: cfg.connectedAt,
    lastPushedAt: cfg.lastPushedAt ?? null,
    autoPush: cfg.autoPush ?? false,
  });
});

// ── Connect ───────────────────────────────────────────────────────────────────
router.post("/projects/:projectId/github/connect", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const { token, repo, autoPush } = req.body as { token?: string; repo?: string; autoPush?: boolean };
  if (!token) { res.status(400).json({ error: "GitHub token is required" }); return; }
  if (!repo) { res.status(400).json({ error: "Repository name is required (e.g. username/my-project)" }); return; }

  // 1. Verify token
  const userRes = await ghFetch("https://api.github.com/user", token);
  if (!userRes.ok) {
    const err: any = await userRes.json().catch(() => ({}));
    res.status(400).json({ error: `Invalid GitHub token: ${err.message ?? userRes.statusText}` });
    return;
  }
  const ghUser: any = await userRes.json();
  const username: string = ghUser.login;

  // 2. Normalise repo to owner/name
  const [repoOwner, repoName] = repo.includes("/") ? repo.split("/", 2) : [username, repo];
  const fullRepo = `${repoOwner}/${repoName}`;

  // 3. Check repo existence — create if missing
  const repoCheckRes = await ghFetch(`https://api.github.com/repos/${fullRepo}`, token);
  if (repoCheckRes.status === 404) {
    const createRes = await ghFetch("https://api.github.com/user/repos", token, {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        private: true,
        description: `Created by AI Builder — ${project.name ?? fullRepo}`,
        auto_init: false,
      }),
    });
    if (!createRes.ok) {
      const err: any = await createRes.json().catch(() => ({}));
      res.status(400).json({ error: `Failed to create repo: ${err.message ?? "unknown error"}` });
      return;
    }
  } else if (!repoCheckRes.ok) {
    res.status(400).json({ error: `Cannot access repo ${fullRepo} — check token permissions` });
    return;
  }

  // 4. Save config
  const cfg = {
    token,
    repo: fullRepo,
    username,
    connectedAt: new Date().toISOString(),
    autoPush: autoPush ?? false,
    lastPushedAt: null as string | null,
  };
  fs.writeFileSync(getCfgPath(req.params.projectId), JSON.stringify(cfg, null, 2));

  res.json({ connected: true, repo: fullRepo, username, connectedAt: cfg.connectedAt });
});

// ── Disconnect ────────────────────────────────────────────────────────────────
router.post("/projects/:projectId/github/disconnect", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const p = getCfgPath(req.params.projectId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ connected: false });
});

// ── Settings (toggle autoPush etc.) ──────────────────────────────────────────
router.patch("/projects/:projectId/github/settings", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Project not found" }); return; }

  const cfg = readCfg(req.params.projectId);
  if (!cfg) { res.status(400).json({ error: "Not connected to GitHub" }); return; }

  const { autoPush } = req.body as { autoPush?: boolean };
  if (autoPush !== undefined) cfg.autoPush = autoPush;
  fs.writeFileSync(getCfgPath(req.params.projectId), JSON.stringify(cfg, null, 2));
  res.json({ autoPush: cfg.autoPush });
});

export { readCfg, getCfgPath };
export default router;
