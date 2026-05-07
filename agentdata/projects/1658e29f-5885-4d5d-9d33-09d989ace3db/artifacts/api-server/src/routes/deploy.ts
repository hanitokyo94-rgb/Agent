/**
 * Vercel Deploy routes
 * POST /api/projects/:projectId/deploy  — deploy/redeploy
 * GET  /api/projects/:projectId/deploy  — get deploy info
 */
import { Router } from "express";
import { findById, updateRecord } from "../lib/storage.js";
import { getWorkspaceDir, getProjectSecrets } from "./workspace.js";
import { deployToVercel } from "../lib/vercel-deploy.js";

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

// GET /api/projects/:projectId/deploy
router.get("/projects/:projectId/deploy", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    vercelUrl: project.vercelUrl ?? null,
    vercelProjectId: project.vercelProjectId ?? null,
    vercelProjectName: project.vercelProjectName ?? null,
    lastDeployedAt: project.lastDeployedAt ?? null,
  });
});

// POST /api/projects/:projectId/deploy
router.post("/projects/:projectId/deploy", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

  const token = process.env.VERCEL_TOKEN;
  if (!token) { res.status(500).json({ error: "VERCEL_TOKEN not configured" }); return; }

  const wsDir = getWorkspaceDir(req.params.projectId);
  const secrets = getProjectSecrets(req.params.projectId);

  try {
    const result = await deployToVercel(
      token,
      wsDir,
      project.name ?? "ai-project",
      project.vercelProjectId,
      secrets
    );

    // Save deploy info to project
    updateRecord("projects", req.params.projectId, {
      vercelUrl: result.url,
      vercelProjectId: result.projectId,
      vercelProjectName: result.projectName,
      lastDeployedAt: new Date().toISOString(),
    });

    res.json({ success: true, url: result.url, ...result });
  } catch (err: any) {
    req.log?.error({ err }, "Deploy failed");
    res.status(500).json({ error: err.message ?? "Deploy failed" });
  }
});

export default router;
