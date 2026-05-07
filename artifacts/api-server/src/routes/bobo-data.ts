/**
 * Bobo Data — Remote key-value data store for agent-built projects
 * Projects deployed to Vercel can call these endpoints to store/retrieve data.
 *
 * All endpoints require: Authorization: Bearer <BOBO_PROJECT_KEY>
 * BOBO_PROJECT_KEY = the projectId from AI Builder
 *
 * Endpoints:
 *   POST   /api/bobo/data/set           { key, value }     → { success }
 *   GET    /api/bobo/data/get?key=X     → { key, value }
 *   DELETE /api/bobo/data/delete?key=X  → { success }
 *   GET    /api/bobo/data/list          → { items: [{key, value}] }
 *   POST   /api/bobo/data/batch-set     { items: [{key, value}] } → { count }
 *   DELETE /api/bobo/data/clear         → { deleted }
 *
 * Values can be any JSON-serializable type (string, number, object, array).
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { findById } from "../lib/storage.js";

const router = Router();

const WORKSPACES_DIR = process.env.WORKSPACES_DIR ?? path.resolve(process.cwd(), "../../agentdata/projects");

function getProjectKey(req: any): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function validateProjectKey(projectKey: string): boolean {
  return !!findById<any>("projects", projectKey);
}

function getBoboDataPath(projectId: string): string {
  const dir = path.join(WORKSPACES_DIR, projectId, ".bobo");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "data.json");
}

function readData(projectId: string): Record<string, any> {
  const fp = getBoboDataPath(projectId);
  if (!fs.existsSync(fp)) return {};
  try { return JSON.parse(fs.readFileSync(fp, "utf-8")); } catch { return {}; }
}

function writeData(projectId: string, data: Record<string, any>): void {
  fs.writeFileSync(getBoboDataPath(projectId), JSON.stringify(data, null, 2));
}

function authMiddleware(req: any, res: any): string | null {
  const projectKey = getProjectKey(req);
  if (!projectKey || !validateProjectKey(projectKey)) {
    res.status(401).json({ error: "Invalid BOBO_PROJECT_KEY" });
    return null;
  }
  return projectKey;
}

// POST /api/bobo/data/set
router.post("/bobo/data/set", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;
  const { key, value } = req.body as { key?: string; value?: any };
  if (!key) { res.status(400).json({ error: "key is required" }); return; }

  const data = readData(projectKey);
  data[key] = value;
  writeData(projectKey, data);
  res.json({ success: true, key });
});

// GET /api/bobo/data/get?key=X
router.get("/bobo/data/get", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;
  const key = req.query.key as string;
  if (!key) { res.status(400).json({ error: "key is required" }); return; }

  const data = readData(projectKey);
  if (!(key in data)) { res.status(404).json({ error: "Key not found" }); return; }
  res.json({ key, value: data[key] });
});

// DELETE /api/bobo/data/delete?key=X
router.delete("/bobo/data/delete", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;
  const key = req.query.key as string;
  if (!key) { res.status(400).json({ error: "key is required" }); return; }

  const data = readData(projectKey);
  if (!(key in data)) { res.status(404).json({ error: "Key not found" }); return; }
  delete data[key];
  writeData(projectKey, data);
  res.json({ success: true, key });
});

// GET /api/bobo/data/list?prefix=X (optional prefix filter)
router.get("/bobo/data/list", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;
  const prefix = req.query.prefix as string | undefined;

  const data = readData(projectKey);
  let items = Object.entries(data).map(([key, value]) => ({ key, value }));
  if (prefix) items = items.filter((i) => i.key.startsWith(prefix));
  res.json({ items, count: items.length });
});

// POST /api/bobo/data/batch-set
router.post("/bobo/data/batch-set", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;
  const { items } = req.body as { items?: Array<{ key: string; value: any }> };
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array required" }); return; }

  const data = readData(projectKey);
  for (const item of items) {
    if (item.key) data[item.key] = item.value;
  }
  writeData(projectKey, data);
  res.json({ success: true, count: items.length });
});

// DELETE /api/bobo/data/clear
router.delete("/bobo/data/clear", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;

  const data = readData(projectKey);
  const deleted = Object.keys(data).length;
  writeData(projectKey, {});
  res.json({ success: true, deleted });
});

// GET /api/bobo/data/info — quota info
router.get("/bobo/data/info", (req, res) => {
  const projectKey = authMiddleware(req, res);
  if (!projectKey) return;

  const fp = getBoboDataPath(projectKey);
  const data = readData(projectKey);
  const size = fs.existsSync(fp) ? fs.statSync(fp).size : 0;
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB

  res.json({
    keyCount: Object.keys(data).length,
    usedBytes: size,
    maxBytes: MAX_SIZE,
    usedMB: Math.round(size / 1024 / 1024 * 100) / 100,
    maxMB: 100,
  });
});

export default router;
