import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { readCollection, insertRecord, findWhere, updateRecord } from "../lib/storage.js";
import { logger } from "../lib/logger.js";
import { sendOtpEmail } from "../lib/mailer.js";

const router = Router();

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string | null;
  onboardingCompleted: boolean;
  emailVerified: boolean;
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

interface OtpRecord {
  id: string;
  userId: string;
  code: string;
  expiresAt: string;
  used: boolean;
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

function generateOtp(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function createAndSendOtp(user: User): Promise<void> {
  // Invalidate old OTPs for this user
  const existing = findWhere<OtpRecord>("otps", (o) => o.userId === user.id && !o.used);
  const all = readCollection<OtpRecord>("otps");
  const updated = all.map((o) =>
    o.userId === user.id && !o.used ? { ...o, used: true } : o
  );
  const { writeCollection } = await import("../lib/storage.js");
  writeCollection("otps", updated);

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const otp: OtpRecord = {
    id: uuidv4(),
    userId: user.id,
    code,
    expiresAt,
    used: false,
  };
  insertRecord("otps", otp);

  // Send email — don't throw if fails, just log
  try {
    await sendOtpEmail(user.email, user.name, code);
  } catch (err) {
    logger.error({ err }, "Failed to send OTP email");
  }
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
    emailVerified: false,
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

  // Send OTP asynchronously
  await createAndSendOtp(user);

  req.log.info({ userId: user.id }, "User registered");
  res.json({
    user: toPublic(user),
    token,
    emailVerificationRequired: true,
  });
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
  res.json({
    user: toPublic(user),
    token,
    emailVerificationRequired: !user.emailVerified,
  });
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
  const allUsers = readCollection<User>("users");
  const sorted = [...allUsers].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const isAdmin = user.plan === "admin" || sorted[0]?.id === userId;
  res.json({ ...toPublic(user), isAdmin });
});

router.post("/auth/send-otp", async (req, res) => {
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
  if (user.emailVerified) {
    res.json({ success: true, message: "Already verified" });
    return;
  }
  await createAndSendOtp(user);
  res.json({ success: true });
});

router.post("/auth/verify-otp", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { code } = req.body as { code?: string };
  if (!code || code.length !== 8) {
    res.status(400).json({ error: "Invalid code format" });
    return;
  }
  const otps = findWhere<OtpRecord>(
    "otps",
    (o) => o.userId === userId && !o.used && o.code === code
  );
  const otp = otps[0];
  if (!otp) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }
  if (new Date(otp.expiresAt) < new Date()) {
    res.status(400).json({ error: "Code has expired. Request a new one." });
    return;
  }
  // Mark OTP as used
  updateRecord("otps", otp.id, { used: true });
  // Mark user as verified
  const updated = updateRecord<User>("users", userId, { emailVerified: true });
  if (!updated) {
    res.status(500).json({ error: "Failed to verify account" });
    return;
  }
  req.log.info({ userId }, "Email verified");
  res.json({ success: true, user: toPublic(updated) });
});

export default router;
