import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { findWhere, updateRecord, getUploadsDir } from "../lib/storage.js";
import type { User } from "./auth.js";
import { toPublic } from "./auth.js";

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

const upload = multer({
  dest: getUploadsDir(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/user/onboarding", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { skillLevel, category, adSource } = req.body as {
    skillLevel?: string;
    category?: string;
    adSource?: string;
  };
  if (!skillLevel || !category || !adSource) {
    res.status(400).json({ error: "skillLevel, category, and adSource are required" });
    return;
  }
  const users = findWhere<User>("users", (u) => u.id === userId);
  if (!users[0]) { res.status(404).json({ error: "User not found" }); return; }
  const updated = updateRecord<User>("users", userId, {
    skillLevel,
    category,
    adSource,
    onboardingCompleted: true,
  });
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(toPublic(updated));
});

router.put("/user/profile", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { name, avatar } = req.body as { name?: string; avatar?: string | null };
  const patch: Partial<User> = {};
  if (name !== undefined) patch.name = name;
  if (avatar !== undefined) patch.avatar = avatar;
  const updated = updateRecord<User>("users", userId, patch);
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(toPublic(updated));
});

router.post("/user/avatar", upload.single("file"), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const fs = (await import("fs")).default;
  const ext = path.extname(req.file.originalname) || ".jpg";
  const newName = `${uuidv4()}${ext}`;
  const avatarUrl = `/api/uploads/${newName}`;
  fs.renameSync(req.file.path, path.join(getUploadsDir(), newName));
  updateRecord<User>("users", userId, { avatar: avatarUrl });
  res.json({ avatarUrl });
});

export default router;
