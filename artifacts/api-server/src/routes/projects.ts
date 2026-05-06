import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  findWhere,
  insertRecord,
  updateRecord,
  deleteRecord,
  findById,
  readCollection,
  getUploadsDir,
} from "../lib/storage.js";

const router = Router();

interface Project {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  category: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
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

function countMessages(projectId: string): number {
  const msgs = readCollection<{ projectId: string }>("messages");
  return msgs.filter((m) => m.projectId === projectId).length;
}

function toProjectView(p: Project) {
  return { ...p, messageCount: countMessages(p.id) };
}

const upload = multer({
  dest: getUploadsDir(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get("/projects", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const projects = findWhere<Project>("projects", (p) => p.userId === userId);
  projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json(projects.map(toProjectView));
});

router.post("/projects/generate-name", async (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description) { res.status(400).json({ error: "description is required" }); return; }
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });
    const resp = await client.chat.completions.create({
      model: process.env.AI_MODEL ?? "anthropic/claude-opus-4-5",
      messages: [
        {
          role: "user",
          content: `Generate a short, memorable project name (2-4 words max) for this description: "${description}". Reply with only the project name, nothing else.`,
        },
      ],
      max_tokens: 30,
    });
    const name = resp.choices[0]?.message?.content?.trim() ?? description.slice(0, 30);
    res.json({ name });
  } catch (err) {
    req.log?.error({ err }, "Name generation failed");
    res.json({ name: description.slice(0, 40) });
  }
});

router.post("/projects", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { description, url, category } = req.body as {
    description?: string;
    url?: string | null;
    category?: string | null;
  };
  if (!description) { res.status(400).json({ error: "description is required" }); return; }
  const now = new Date().toISOString();
  const project: Project = {
    id: uuidv4(),
    name: description.slice(0, 40),
    description,
    url: url ?? null,
    category: category ?? null,
    userId,
    createdAt: now,
    updatedAt: now,
  };
  insertRecord("projects", project);
  res.json(toProjectView(project));
});

router.get("/projects/:projectId", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(toProjectView(project));
});

router.put("/projects/:projectId", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { name, description, url } = req.body as {
    name?: string;
    description?: string | null;
    url?: string | null;
  };
  const patch: Partial<Project> = { updatedAt: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (url !== undefined) patch.url = url;
  const updated = updateRecord<Project>("projects", req.params.projectId, patch);
  if (!updated) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(toProjectView(updated));
});

router.delete("/projects/:projectId", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  deleteRecord("projects", req.params.projectId);
  res.json({ success: true });
});

router.post("/projects/:projectId/upload", upload.single("file"), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const fs = (await import("fs")).default;
  const ext = path.extname(req.file.originalname) || ".bin";
  const newName = `${uuidv4()}${ext}`;
  const url = `/api/uploads/${newName}`;
  fs.renameSync(req.file.path, path.join(getUploadsDir(), newName));
  res.json({ url });
});

export default router;
