/**
 * GitHub Repo Import
 * POST /api/projects/github-import
 * Fetches a public GitHub repo's files and creates a new project workspace
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { insertRecord } from "../lib/storage.js";
import { WORKSPACES_DIR } from "./workspace.js";

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

interface GithubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

function parseGithubUrl(url: string): { owner: string; repo: string; branch?: string } | null {
  // Support formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch
  // github.com/owner/repo
  // owner/repo
  const clean = url.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const githubMatch = clean.match(/^github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
  if (githubMatch) {
    return { owner: githubMatch[1], repo: githubMatch[2].replace(/\.git$/, ""), branch: githubMatch[3] };
  }
  // bare owner/repo
  const bareMatch = clean.match(/^([^/]+)\/([^/\s]+)$/);
  if (bareMatch) {
    return { owner: bareMatch[1], repo: bareMatch[2].replace(/\.git$/, "") };
  }
  return null;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".cache", "vendor"]);
const SKIP_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mp3", ".wav", ".ogg",
  ".zip", ".tar", ".gz", ".rar", ".exe", ".dll", ".so", ".dylib", ".bin",
  ".lock", ".pdf", ".DS_Store"]);
const MAX_FILE_SIZE = 200 * 1024; // 200KB
const MAX_FILES = 150;

async function githubFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "AI-Builder-Platform/1.0",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  try {
    const info = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
    return info.default_branch ?? "main";
  } catch {
    return "main";
  }
}

async function fetchRepoTree(owner: string, repo: string, branch: string): Promise<GithubTreeItem[]> {
  const data = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  return data.tree ?? [];
}

async function fetchFileContent(owner: string, repo: string, branch: string, filePath: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AI-Builder-Platform/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// GET /api/github/info?url=...  — fetch repo info (name, description, stars)
router.get("/github/info", async (req, res) => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: "url is required" }); return; }
  const parsed = parseGithubUrl(url);
  if (!parsed) { res.status(400).json({ error: "Invalid GitHub URL" }); return; }
  try {
    const info = await githubFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    res.json({
      owner: parsed.owner,
      repo: parsed.repo,
      fullName: info.full_name,
      description: info.description ?? "",
      stars: info.stargazers_count ?? 0,
      language: info.language ?? "",
      defaultBranch: info.default_branch ?? "main",
      isPrivate: info.private ?? false,
      topics: info.topics ?? [],
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to fetch repo info" });
  }
});

// POST /api/projects/github-import
router.post("/projects/github-import", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { githubUrl } = req.body as { githubUrl?: string };
  if (!githubUrl) { res.status(400).json({ error: "githubUrl is required" }); return; }

  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) { res.status(400).json({ error: "Invalid GitHub URL format" }); return; }

  const { owner, repo } = parsed;
  let { branch } = parsed;

  try {
    // 1. Get repo info + default branch
    let repoInfo: any = {};
    try {
      repoInfo = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (repoInfo.private) {
        res.status(400).json({ error: "Private repositories are not supported. Please use a public repo." });
        return;
      }
    } catch (err: any) {
      if (err.message?.includes("404")) {
        res.status(404).json({ error: `Repository "${owner}/${repo}" not found. Make sure it's public.` });
        return;
      }
      throw err;
    }

    if (!branch) branch = repoInfo.default_branch ?? "main";

    // 2. Get file tree
    const tree = await fetchRepoTree(owner, repo, branch);
    const blobs = tree
      .filter((item) => item.type === "blob")
      .filter((item) => {
        // Skip large files
        if ((item.size ?? 0) > MAX_FILE_SIZE) return false;
        // Skip binary/irrelevant extensions
        const ext = path.extname(item.path).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) return false;
        // Skip dirs we don't care about
        const parts = item.path.split("/");
        if (parts.some((p) => SKIP_DIRS.has(p))) return false;
        return true;
      })
      .slice(0, MAX_FILES);

    if (blobs.length === 0) {
      res.status(400).json({ error: "No importable files found in this repository." });
      return;
    }

    // 3. Create project
    const projectId = uuidv4();
    const projectName = repoInfo.name ?? repo;
    const now = new Date().toISOString();
    const project = {
      id: projectId,
      name: projectName,
      description: repoInfo.description ?? `Imported from github.com/${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      category: repoInfo.language ?? null,
      userId,
      githubRepo: `${owner}/${repo}`,
      githubBranch: branch,
      createdAt: now,
      updatedAt: now,
    };
    insertRecord("projects", project);

    // 4. Create workspace and write files
    const wsDir = path.join(WORKSPACES_DIR, projectId);
    fs.mkdirSync(wsDir, { recursive: true });

    // Write files in parallel batches of 10
    let imported = 0;
    let failed = 0;
    const batchSize = 10;

    for (let i = 0; i < blobs.length; i += batchSize) {
      const batch = blobs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (item) => {
          const content = await fetchFileContent(owner, repo, branch!, item.path);
          if (content === null) { failed++; return; }
          const absPath = path.join(wsDir, item.path);
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          fs.writeFileSync(absPath, content, "utf-8");
          imported++;
        })
      );
    }

    // 5. Create initial message
    const { insertRecord: insertMsg } = await import("../lib/storage.js");
    const initialMsg = {
      id: uuidv4(),
      projectId,
      role: "assistant" as const,
      content: `# Repository imported: \`${owner}/${repo}\`\n\nSuccessfully imported **${imported}** files from [github.com/${owner}/${repo}](https://github.com/${owner}/${repo})${failed > 0 ? ` (${failed} files skipped)` : ""}.\n\n${repoInfo.description ? `**Description:** ${repoInfo.description}\n\n` : ""}**Language:** ${repoInfo.language ?? "Unknown"} | **Stars:** ${repoInfo.stargazers_count ?? 0} | **Branch:** \`${branch}\`\n\nWhat would you like to do with this project? I can:\n- Explain the codebase structure\n- Add new features\n- Fix bugs or improve code\n- Deploy it live`,
      thinkingSteps: null,
      attachmentUrl: null,
      createdAt: now,
    };
    insertRecord("messages", initialMsg);

    res.json({
      projectId,
      name: projectName,
      fileCount: imported,
      skipped: failed,
      githubUrl: `https://github.com/${owner}/${repo}`,
      branch,
    });
  } catch (err: any) {
    req.log?.error({ err }, "GitHub import failed");
    res.status(500).json({ error: err.message ?? "Import failed" });
  }
});

export default router;
