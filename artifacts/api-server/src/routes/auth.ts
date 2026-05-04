import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { readCollection, insertRecord, findWhere } from "../lib/storage.js";
import { logger } from "../lib/logger.js";

const router = Router();

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string | null;
  onboardingCompleted: boolean;
  skillLevel: string | null;
  category: string | null;
  adSource: string | null;
  country: string | null;
  language: string | null;
  credits: number;
  creditsUsed: number;
  plan: string;
  createdAt: string;
}

export function toPublic(u: User) {
  const { passwordHash: _, ...pub } = u;
  return pub;
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
      } catch {
        return null;
      }
    }
  }
  return userId ?? null;
}

router.post("/auth/register", async (req, res) => {
  const { name, email, password, country, language } = req.body as {
    name?: string; email?: string; password?: string; country?: string; language?: string;
  };
  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email and password are required" });
    return;
  }
  const existing = findWhere<User>("users", (u) => u.email === email);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: uuidv4(),
    name,
    email,
    passwordHash,
    avatar: null,
    onboardingCompleted: false,
    skillLevel: null,
    category: null,
    adSource: null,
    country: country ?? null,
    language: language ?? null,
    credits: 20,
    creditsUsed: 0,
    plan: "free",
    createdAt: new Date().toISOString(),
  };
  insertRecord("users", user);
  req.session!.userId = user.id;
  const token = Buffer.from(`${user.id}:${Date.now()}`).toString("base64");
  req.log.info({ userId: user.id }, "User registered");
  res.json({ user: toPublic(user), token });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const users = findWhere<User>("users", (u) => u.email === email);
  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  req.session!.userId = user.id;
  const token = Buffer.from(`${user.id}:${Date.now()}`).toString("base64");
  req.log.info({ userId: user.id }, "User logged in");
  res.json({ user: toPublic(user), token });
});

router.post("/auth/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ success: true });
});

router.get("/auth/me", (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const users = findWhere<User>("users", (u) => u.id === userId);
  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(toPublic(user));
});

export default router;
