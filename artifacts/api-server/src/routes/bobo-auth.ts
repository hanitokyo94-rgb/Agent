/**
 * Bobo Auth — Remote authentication service for agent-built projects
 * Projects deployed to Vercel can call these endpoints to manage their users.
 *
 * All endpoints require: Authorization: Bearer <BOBO_PROJECT_KEY>
 * BOBO_PROJECT_KEY = the projectId from AI Builder
 *
 * Endpoints:
 *   POST /api/bobo/auth/register   { email, password, name? } → { user, token }
 *   POST /api/bobo/auth/login      { email, password }        → { user, token }
 *   GET  /api/bobo/auth/verify     (Authorization: Bearer <jwt>) → { user }
 *   GET  /api/bobo/auth/users      → { users: [...] }
 *   DELETE /api/bobo/auth/user/:id → { success }
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { findById } from "../lib/storage.js";

const router = Router();

// Data lives alongside the workspace
const WORKSPACES_DIR = process.env.WORKSPACES_DIR ?? path.resolve(process.cwd(), "../../agentdata/projects");

const JWT_SECRET = process.env.SESSION_SECRET ?? "bobo-auth-secret-dev";

// ── tiny JWT (no external dep) ──────────────────────────────────────
function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}
function sign(payload: Record<string, any>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const crypto = require("crypto");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verify(token: string): Record<string, any> | null {
  try {
    const [header, body, sig] = token.split(".");
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // 30-day expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Helpers ─────────────────────────────────────────────────────────
function getProjectKey(req: any): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function getBoboUsersPath(projectId: string): string {
  const dir = path.join(WORKSPACES_DIR, projectId, ".bobo");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "auth-users.json");
}

function readBoboUsers(projectId: string): any[] {
  const fp = getBoboUsersPath(projectId);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, "utf-8")); } catch { return []; }
}

function writeBoboUsers(projectId: string, users: any[]): void {
  fs.writeFileSync(getBoboUsersPath(projectId), JSON.stringify(users, null, 2));
}

function validateProjectKey(projectKey: string): boolean {
  // Project key must correspond to an existing project
  const project = findById<any>("projects", projectKey);
  return !!project;
}

// ── Routes ──────────────────────────────────────────────────────────

// POST /api/bobo/auth/register
router.post("/bobo/auth/register", async (req, res) => {
  const projectKey = getProjectKey(req);
  if (!projectKey || !validateProjectKey(projectKey)) {
    res.status(401).json({ error: "Invalid BOBO_PROJECT_KEY" });
    return;
  }
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password) { res.status(400).json({ error: "email and password are required" }); return; }

  const users = readBoboUsers(projectKey);
  if (users.find((u) => u.email === email)) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email,
    name: name ?? email.split("@")[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeBoboUsers(projectKey, users);

  const token = sign({
    sub: user.id,
    email: user.email,
    projectId: projectKey,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// POST /api/bobo/auth/login
router.post("/bobo/auth/login", async (req, res) => {
  const projectKey = getProjectKey(req);
  if (!projectKey || !validateProjectKey(projectKey)) {
    res.status(401).json({ error: "Invalid BOBO_PROJECT_KEY" });
    return;
  }
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: "email and password are required" }); return; }

  const users = readBoboUsers(projectKey);
  const user = users.find((u) => u.email === email);
  if (!user) { res.status(401).json({ error: "Invalid email or password" }); return; }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }

  const token = sign({
    sub: user.id,
    email: user.email,
    projectId: projectKey,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// GET /api/bobo/auth/verify  (Authorization: Bearer <jwt_token>)
router.get("/bobo/auth/verify", (req, res) => {
  const projectKey = req.query.projectKey as string;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verify(token);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }
  if (projectKey && payload.projectId !== projectKey) {
    res.status(401).json({ error: "Token does not belong to this project" });
    return;
  }

  const users = readBoboUsers(payload.projectId);
  const user = users.find((u) => u.id === payload.sub);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser, valid: true });
});

// GET /api/bobo/auth/users — list all users for a project
router.get("/bobo/auth/users", (req, res) => {
  const projectKey = getProjectKey(req);
  if (!projectKey || !validateProjectKey(projectKey)) {
    res.status(401).json({ error: "Invalid BOBO_PROJECT_KEY" });
    return;
  }
  const users = readBoboUsers(projectKey).map(({ passwordHash: _, ...u }) => u);
  res.json({ users, count: users.length });
});

// DELETE /api/bobo/auth/user/:userId
router.delete("/bobo/auth/user/:userId", (req, res) => {
  const projectKey = getProjectKey(req);
  if (!projectKey || !validateProjectKey(projectKey)) {
    res.status(401).json({ error: "Invalid BOBO_PROJECT_KEY" });
    return;
  }
  const users = readBoboUsers(projectKey);
  const filtered = users.filter((u) => u.id !== req.params.userId);
  if (filtered.length === users.length) { res.status(404).json({ error: "User not found" }); return; }
  writeBoboUsers(projectKey, filtered);
  res.json({ success: true });
});

export default router;
