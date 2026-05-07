/**
 * Templates — public browse + use
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  readCollection,
  insertRecord,
  updateRecord,
  findById,
} from "../lib/storage.js";

const router = Router();

const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR ??
  path.resolve(process.cwd(), "../../agentdata/projects");

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

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ── GET /api/templates — list all public templates ──────────────────
router.get("/templates", (req, res) => {
  const projects = readCollection<any>("projects");
  const templates = projects
    .filter((p) => p.isTemplate && p.templateMeta)
    .map((p) => ({
      id: p.id,
      name: p.templateMeta?.name ?? p.name,
      description: p.templateMeta?.description ?? p.description ?? "",
      prompt: p.templateMeta?.prompt ?? "",
      category: p.templateMeta?.category ?? "General",
      tags: p.templateMeta?.tags ?? [],
      usageCount: p.templateMeta?.usageCount ?? 0,
      agentPower: p.templateMeta?.agentPower ?? "economy",
      createdAt: p.createdAt,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  res.json(templates);
});

// ── POST /api/templates/:id/use — create project from template ──────
router.post("/templates/:templateId/use", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { name } = req.body as { name?: string };
  const template = findById<any>("projects", req.params.templateId);

  if (!template || !template.isTemplate) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Create new project from template
  const newProjectId = uuidv4();
  const newProject = {
    id: newProjectId,
    name: name || `${template.templateMeta?.name ?? template.name} — Copy`,
    description: template.description,
    category: template.category,
    url: null,
    userId,
    fromTemplate: req.params.templateId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  insertRecord("projects", newProject);

  // Copy workspace files from template
  const srcDir = getWorkspaceDir(req.params.templateId);
  const destDir = getWorkspaceDir(newProjectId);
  try {
    copyDirRecursive(srcDir, destDir);
  } catch {}

  // Increment usage count
  const usageCount = (template.templateMeta?.usageCount ?? 0) + 1;
  updateRecord<any>("projects", req.params.templateId, {
    templateMeta: { ...(template.templateMeta ?? {}), usageCount },
  });

  res.json({ projectId: newProjectId, ...newProject });
});

export default router;
