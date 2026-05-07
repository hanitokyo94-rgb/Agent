import { Router } from "express";
import fs from "fs";
import path from "path";
import {
  readCollection,
  updateRecord,
  findWhere,
  writeCollection,
} from "../lib/storage.js";
import type { User } from "./auth.js";
import { toPublic } from "./auth.js";

const ADMIN_CONFIG_PATH = path.join(process.cwd(), "agentdata", "admin-config.json");

function readAdminConfig(): Record<string, any> {
  try {
    if (fs.existsSync(ADMIN_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function writeAdminConfig(data: Record<string, any>) {
  try {
    fs.mkdirSync(path.dirname(ADMIN_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

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
      } catch {
        return null;
      }
    }
  }
  return userId ?? null;
}

function isAdmin(userId: string): boolean {
  // The first registered user is the admin, OR users with plan === "admin"
  const users = readCollection<User>("users");
  if (users.length === 0) return false;
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  if (user.plan === "admin") return true;
  // first user is admin
  const sorted = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return sorted[0]?.id === userId;
}

function adminMiddleware(req: any, res: any, next: any) {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.adminUserId = userId;
  next();
}

router.get("/admin/stats", adminMiddleware, (req, res) => {
  const users = readCollection<User>("users");
  const messages = readCollection<{ role: string }>("messages");
  const projects = readCollection<{ userId: string }>("projects");
  res.json({
    totalUsers: users.length,
    totalProjects: projects.length,
    totalMessages: messages.length,
    freeUsers: users.filter((u) => u.plan === "free" || !u.plan).length,
    paidUsers: users.filter((u) => u.plan !== "free" && u.plan !== "admin").length,
    totalCreditsUsed: users.reduce((s, u) => s + (u.creditsUsed ?? 0), 0),
  });
});

router.get("/admin/users", adminMiddleware, (req, res) => {
  const users = readCollection<User>("users");
  const projects = readCollection<{ userId: string; id: string }>("projects");
  const messages = readCollection<{ projectId: string }>("messages");

  const projectsByUser: Record<string, number> = {};
  for (const p of projects) {
    projectsByUser[p.userId] = (projectsByUser[p.userId] ?? 0) + 1;
  }

  const result = users
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((u) => ({
      ...toPublic(u),
      projectCount: projectsByUser[u.id] ?? 0,
    }));

  res.json(result);
});

router.put("/admin/users/:userId", adminMiddleware, (req, res) => {
  const { userId } = req.params;
  const { credits, creditsUsed, plan, name } = req.body as {
    credits?: number;
    creditsUsed?: number;
    plan?: string;
    name?: string;
  };

  const patch: Partial<User> = {};
  if (credits !== undefined) patch.credits = Number(credits);
  if (creditsUsed !== undefined) patch.creditsUsed = Number(creditsUsed);
  if (plan !== undefined) patch.plan = plan;
  if (name !== undefined) patch.name = name;

  const updated = updateRecord<User>("users", userId, patch);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toPublic(updated));
});

router.delete("/admin/users/:userId", adminMiddleware, (req, res) => {
  const { userId } = req.params;
  const users = readCollection<User>("users");
  const filtered = users.filter((u) => u.id !== userId);
  if (filtered.length === users.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  writeCollection("users", filtered);
  res.json({ success: true });
});

router.get("/admin/users/:userId/projects", adminMiddleware, (req, res) => {
  const { userId } = req.params;
  const projects = findWhere<any>("projects", (p) => p.userId === userId);
  const messages = readCollection<{ projectId: string; role: string }>("messages");
  const result = projects.map((p: any) => ({
    ...p,
    messageCount: messages.filter((m) => m.projectId === p.id).length,
  }));
  res.json(result);
});

// ── Platform AI config ─────────────────────────────────────────────────
router.get("/admin/config", adminMiddleware, (req, res) => {
  const config = readAdminConfig();
  res.json({
    model: config.model ?? process.env.AI_MODEL ?? "gpt-5.4",
    baseURL: config.baseURL ?? process.env.AI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "",
  });
});

router.put("/admin/config", adminMiddleware, (req, res) => {
  const { model, baseURL } = req.body as { model?: string; baseURL?: string };
  const current = readAdminConfig();
  if (model !== undefined) current.model = model;
  if (baseURL !== undefined) current.baseURL = baseURL;
  writeAdminConfig(current);
  if (model) process.env.AI_MODEL = model;
  if (baseURL) process.env.AI_BASE_URL = baseURL;
  res.json({ success: true, model: current.model, baseURL: current.baseURL });
});

export default router;
