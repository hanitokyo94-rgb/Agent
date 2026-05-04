/**
 * Vercel Deploy helper — uploads project files and deploys via Vercel API v13
 * Supports: create project, deploy files, redeploy on same alias
 */
import fs from "fs";
import path from "path";

const VERCEL_API = "https://api.vercel.com";

interface DeployResult {
  url: string;
  deploymentId: string;
  projectId: string;
  projectName: string;
  readyState: string;
  alias?: string[];
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
}

function generateProjectName(projectName: string): string {
  const base = slug(projectName || "ai-project");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/** Read all files in directory recursively, skipping node_modules/.git/.secrets */
function collectFiles(dir: string, base = ""): Array<{ file: string; data: string; encoding: "utf-8" | "base64" }> {
  const SKIP = new Set(["node_modules", ".git", ".secrets.json", "dist", ".next"]);
  const results: Array<{ file: string; data: string; encoding: "utf-8" | "base64" }> = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath, relPath));
      } else {
        const stat = fs.statSync(fullPath);
        if (stat.size > 5 * 1024 * 1024) continue; // skip files > 5MB
        try {
          const buf = fs.readFileSync(fullPath);
          const isBinary = buf.includes(0);
          results.push({
            file: relPath,
            data: isBinary ? buf.toString("base64") : buf.toString("utf-8"),
            encoding: isBinary ? "base64" : "utf-8",
          });
        } catch {}
      }
    }
  } catch {}
  return results;
}

/** Get or create a Vercel project, return projectId and projectName */
async function ensureProject(
  token: string,
  desiredName: string,
  storedProjectId?: string
): Promise<{ projectId: string; projectName: string }> {
  // Try to fetch existing project by stored ID
  if (storedProjectId) {
    const r = await fetch(`${VERCEL_API}/v9/projects/${storedProjectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const p = await r.json();
      return { projectId: p.id, projectName: p.name };
    }
  }

  // Create new project
  const name = generateProjectName(desiredName);
  const r = await fetch(`${VERCEL_API}/v10/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      framework: null,
      publicSource: false,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Failed to create Vercel project: ${err}`);
  }
  const p = await r.json();
  return { projectId: p.id, projectName: p.name };
}

/** Deploy files to Vercel */
export async function deployToVercel(
  token: string,
  wsDir: string,
  projectName: string,
  storedProjectId?: string,
  projectEnv?: Record<string, string>
): Promise<DeployResult> {
  // 1. Ensure project exists
  const { projectId, projectName: vercelProjectName } = await ensureProject(token, projectName, storedProjectId);

  // 2. Collect files
  const files = collectFiles(wsDir);
  if (files.length === 0) throw new Error("No files to deploy");

  // 3. Determine build config — detect if it's a static or node project
  const hasPackageJson = files.some((f) => f.file === "package.json");
  const hasIndexHtml = files.some((f) => f.file === "index.html" || f.file === "public/index.html");
  const hasIndexTs = files.some((f) => f.file === "index.ts" || f.file === "src/index.ts");

  // 4. Prepare env vars for deployment
  const envVars: Array<{ key: string; value: string; target: string[] }> = [];
  if (projectEnv) {
    for (const [key, value] of Object.entries(projectEnv)) {
      if (!key.startsWith("_") && key !== "VERCEL_TOKEN") {
        envVars.push({ key, value, target: ["production", "preview"] });
      }
    }
  }

  // Add env vars to project
  if (envVars.length > 0) {
    await fetch(`${VERCEL_API}/v10/projects/${projectId}/env`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(envVars),
    }).catch(() => {});
  }

  // 5. Create deployment
  const deployBody: any = {
    name: vercelProjectName,
    project: projectId,
    files,
    target: "production",
    projectSettings: {
      framework: null,
    },
  };

  // For static sites, use static builder
  if (hasIndexHtml && !hasPackageJson) {
    deployBody.projectSettings = { framework: null };
  }

  // For node projects with package.json
  if (hasPackageJson) {
    let pkgJson: any = {};
    const pkgFile = files.find((f) => f.file === "package.json");
    if (pkgFile) {
      try { pkgJson = JSON.parse(pkgFile.data as string); } catch {}
    }
    // Set build/start commands based on package.json scripts
    const buildCmd = pkgJson.scripts?.build ?? null;
    const startCmd = pkgJson.scripts?.start ?? (hasIndexTs ? "npx tsx index.ts" : "node index.js");
    deployBody.projectSettings = {
      framework: null,
      buildCommand: buildCmd,
      outputDirectory: pkgJson.scripts?.build ? "dist" : null,
      installCommand: "npm install",
    };
  }

  const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(deployBody),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    throw new Error(`Vercel deployment failed: ${errText.slice(0, 500)}`);
  }

  const deployment = await deployRes.json();

  // 6. Wait for deployment to be ready (poll up to 3 min)
  let readyState = deployment.readyState ?? "BUILDING";
  let deploymentId = deployment.id ?? deployment.uid;
  let finalUrl = deployment.url ?? "";

  if (readyState !== "READY" && readyState !== "ERROR") {
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pollRes.ok) {
        const d = await pollRes.json();
        readyState = d.readyState ?? readyState;
        finalUrl = d.url ?? finalUrl;
        if (readyState === "READY" || readyState === "ERROR") break;
      }
    }
  }

  const liveUrl = finalUrl ? `https://${finalUrl}` : `https://${vercelProjectName}.vercel.app`;

  return {
    url: liveUrl,
    deploymentId,
    projectId,
    projectName: vercelProjectName,
    readyState,
    alias: [`https://${vercelProjectName}.vercel.app`],
  };
}
