/**
 * Manus-inspired Agent Stream
 * POST /api/projects/:projectId/agent/stream
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { findById, findWhere, insertRecord, updateRecord } from "../lib/storage.js";
import { getWorkspaceDir, getProjectSecrets, listFilesRecursive } from "./workspace.js";
import { deployToVercel } from "../lib/vercel-deploy.js";
import type { User } from "./auth.js";

const execAsync = promisify(exec);
const router = Router();

// ── File-based agent logger ─────────────────────────────────────────────────
const LOGS_DIR = path.resolve(process.cwd(), "../../agentdata/logs");

function agentLog(
  level: "INFO" | "WARN" | "ERROR",
  projectId: string,
  event: string,
  data?: Record<string, unknown>
) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const logFile = path.join(LOGS_DIR, `agent-${today}.log`);
    const entry =
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        projectId,
        event,
        ...(data ?? {}),
      }) + "\n";
    fs.appendFileSync(logFile, entry);
  } catch {}
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

const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "message_notify",
      description: "Send a progress update to the user (non-blocking). Use for: acknowledging requests, reporting progress. NOT for final results — use task_done for that.",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Notification message" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "task_done",
      description: "REQUIRED: Signal task completion. Call this ALWAYS when finished. Include a full summary with all results, URLs, file paths. This marks completion in the UI — without it the task appears unfinished.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Complete summary with results, file paths, URLs, next steps" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_write",
      description: "Write or overwrite a file. Creates parent directories automatically.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path e.g. src/index.ts" },
          content: { type: "string", description: "Complete file content" },
          append: { type: "boolean", description: "If true, append instead of overwrite" },
        },
        required: ["file", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_read",
      description: "Read a file from the project workspace.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path" },
          start_line: { type: "integer", description: "Optional 0-based start line" },
          end_line: { type: "integer", description: "Optional end line (exclusive)" },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_str_replace",
      description: "Replace exact string in a file. More efficient than rewriting whole file.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path" },
          old_str: { type: "string", description: "Exact string to find (must match exactly)" },
          new_str: { type: "string", description: "Replacement string" },
        },
        required: ["file", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_find_by_name",
      description: "Find files by name pattern (glob) in workspace.",
      parameters: {
        type: "object",
        properties: { glob: { type: "string", description: "Glob pattern e.g. '*.ts' or 'src/**/*.tsx'" } },
        required: ["glob"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_find_in_content",
      description: "Search for text/regex within files.",
      parameters: {
        type: "object",
        properties: {
          regex: { type: "string", description: "Search pattern (regex or plain text)" },
          file: { type: "string", description: "Optional: specific file to search in" },
        },
        required: ["regex"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_list",
      description: "List all files and directories in the project workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "file_delete",
      description: "Delete a file from the project workspace.",
      parameters: {
        type: "object",
        properties: { file: { type: "string", description: "Relative file path to delete" } },
        required: ["file"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "shell_exec",
      description: "Execute a shell command in the project workspace. Timeout: 90s max. Use for: builds, tests, git ops, checking packages.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command. Use -y/-f flags to avoid prompts." },
          timeout: { type: "integer", description: "Timeout in seconds (default: 90, max: 300)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "install_packages",
      description: "Install npm packages into the project workspace.",
      parameters: {
        type: "object",
        properties: {
          packages: { type: "array", items: { type: "string" }, description: "Package names to install" },
          dev: { type: "boolean", description: "If true, install as devDependencies" },
        },
        required: ["packages"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL. Returns page content as text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL including protocol" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method (default: GET)" },
          body: { type: "string", description: "Optional request body for POST/PUT" },
          headers: { type: "object", description: "Optional HTTP headers" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information, docs, examples.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query (3-5 keywords)" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_secret",
      description: "Store a secret/env var for the project. Injected as env vars at runtime.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Env var name e.g. DATABASE_URL" },
          value: { type: "string", description: "Secret value" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_secrets",
      description: "List names (not values) of stored project secrets.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_secret",
      description: "Ask the user to provide a required API key or secret. Use when you need a key that isn't stored yet. The user will be prompted to enter it.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "The env var name needed e.g. GOOGLE_API_KEY" },
          description: { type: "string", description: "What this key is used for (shown to user)" },
        },
        required: ["key", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "deploy_to_vercel",
      description: "Deploy project to Vercel for a live public URL. Call AFTER building and testing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "expo_snack",
      description: "Upload the Expo/React Native mobile app to Expo Snack for instant preview. Returns a QR code the user can scan with Expo Go on their phone. Call AFTER writing all app files (App.tsx must exist at root).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "App display name" },
          description: { type: "string", description: "Brief app description" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "build_preview",
      description: "Build the web project and open a live in-platform browser preview so the user can see the app. Call AFTER writing all files and installing packages. Automatically detects Vite/CRA/Next.js and builds with the correct base path.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function getSystemPrompt(lang: string | null | undefined, workspaceFileCount: number, platformUrl?: string): string {
  const isArabic = lang === "ar" || lang?.startsWith("ar");
  const filesContext = workspaceFileCount > 0
    ? `\n[Workspace: ${workspaceFileCount} files currently in project]`
    : `\n[Workspace: empty — no files yet]`;

  const basePrompt = `You are an advanced autonomous coding agent — a hybrid of Claude, Manus, OpenCode, and Replit Agent.${filesContext}

<streaming_style>
Stream your thinking live like a terminal. Divide work into phases with clear titles.
Show progress before answers. Use concise engineering language that feels "alive".

Format your responses using markdown cards:
### 🔍 Reading project structure
### 📝 Analyzing the issue  
### ⚡ Applying fix
### ✅ Final result

Use terminal-style output:
\`\`\`
Scanning repository...
Found 12 matching files
Analyzing issue...
Applying patch...
✓ Done
\`\`\`

Show artifact summaries after generating code:
────────────────────────────
Artifact: [name]
Language: [TypeScript/Python/etc]
Files Modified: [list]
────────────────────────────
</streaming_style>

<capabilities>
- Read, write, precisely edit files (targeted replacements)
- Execute shell commands and process results
- Install npm packages and manage projects
- Browse web, fetch APIs and documentation
- Search web for up-to-date info
- Store secrets and manage env vars
- Request secrets from user when needed (use request_secret tool)
- Deploy projects to Vercel for live public URLs
- Build Expo/React Native mobile apps and upload to Expo Snack for instant QR code preview on phone
- Call build_preview to build a web app and open a live browser preview panel inside the platform
</capabilities>

<agent_loop>
You operate iteratively:
1. Analyze user request — understand the TRUE intent
2. Auto-detect task type (NEVER ask user "do you want chat or build mode?"):
   - Conversation/question → respond with reasoning, use web_search if needed
   - Build/code/project → use full tool suite: write files, install, build, deploy
3. Execute in logical order:
   file_write (package.json first) → file_write (source) → install_packages → build_preview (for live preview) → deploy_to_vercel (for public URL)
4. Notify progress with message_notify at each meaningful step
5. ALWAYS end with task_done — NEVER finish without calling it
</agent_loop>

<preview_rules>
## CRITICAL: How to show web projects to users

ALWAYS use build_preview tool for ANY web project (HTML, React, Vue, static site, etc).
NEVER try to start a localhost server (python3 -m http.server, node server, npx serve, etc.) — 
these ports are NOT accessible to the user's browser and will always fail.

When user asks to "run", "show", "open", "preview", or "view" a web project:
→ Use build_preview tool — it builds and opens a live preview panel automatically.

For simple static HTML (no package.json): build_preview copies files and shows them instantly.
For React/Vue/Vite projects: build_preview installs dependencies and builds automatically.

NEVER give users a localhost URL. The only working preview method is build_preview.
</preview_rules>

<project_architecture>
## MANDATORY: Every project must be properly structured. NEVER put everything in one file.

### Full-stack project structure (DEFAULT for any web app):
\`\`\`
project-name/
├── api-server/              # Backend (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── routes/          # Express route handlers (auth.ts, users.ts, etc.)
│   │   ├── middleware/      # Auth middleware, error handlers, rate limiting
│   │   ├── lib/             # Utilities: db.ts, logger.ts, storage.ts
│   │   ├── models/          # TypeScript interfaces and schemas
│   │   ├── app.ts           # Express app setup
│   │   └── index.ts         # Entry point (server.listen)
│   ├── package.json
│   └── tsconfig.json
│
└── app/                     # Frontend (React + Vite + TypeScript)
    ├── src/
    │   ├── components/
    │   │   ├── ui/          # Base design system: Button, Input, Card, Badge, Modal, Tooltip, Avatar, Skeleton, Toast
    │   │   ├── layout/      # Navbar, Sidebar, Footer, PageLayout
    │   │   └── features/    # Domain components: UserCard, ProductGrid, etc.
    │   ├── pages/           # Route-level components: Home, Dashboard, Profile, Settings
    │   ├── hooks/           # Custom hooks: useAuth, useDebounce, useLocalStorage, useFetch
    │   ├── lib/             # api.ts (fetch client), utils.ts, formatters.ts, constants.ts
    │   ├── stores/          # Zustand state stores (optional)
    │   ├── types/           # TypeScript: types.ts, api.types.ts
    │   ├── index.css        # Global styles + Tailwind directives
    │   ├── main.tsx         # React root
    │   └── App.tsx          # Router + layouts
    ├── public/
    ├── package.json
    ├── vite.config.ts       # Proxy: /api → localhost:3001
    ├── tailwind.config.ts
    └── tsconfig.json
\`\`\`

### Backend-only project:
\`\`\`
project-name/
├── src/
│   ├── routes/
│   ├── middleware/
│   ├── lib/
│   ├── models/
│   └── index.ts
├── package.json
└── tsconfig.json
\`\`\`

### CLI / Script project:
\`\`\`
project-name/
├── src/
│   ├── commands/    # Individual command files
│   ├── lib/
│   └── index.ts
├── package.json
└── tsconfig.json
\`\`\`
</project_architecture>

<ui_libraries>
## TOP UI/UX LIBRARIES — Always use these for best results:

### Core Stack (use in EVERY React project):
- **Tailwind CSS v3** — utility-first CSS, fast, consistent: \`npm install tailwindcss postcss autoprefixer\`
- **shadcn/ui** — best component library (copy-paste Radix + Tailwind), accessible: \`npx shadcn@latest init\`
- **Radix UI** — headless accessible primitives (used by shadcn): \`@radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select\`
- **Lucide React** — beautiful SVG icons, 1000+: \`npm install lucide-react\`
- **class-variance-authority** + **clsx** + **tailwind-merge** — for component variants: \`npm install cva clsx tailwind-merge\`

### Animation & Motion:
- **Framer Motion** — #1 animation library, silky smooth: \`npm install framer-motion\`
- **tailwindcss-animate** — CSS keyframe animations for Tailwind: \`npm install tailwindcss-animate\`

### Forms & Validation:
- **React Hook Form** — performant forms: \`npm install react-hook-form\`
- **Zod** — TypeScript-first schema validation: \`npm install zod @hookform/resolvers\`

### Data & State:
- **TanStack Query v5** — async state, caching, refetching: \`npm install @tanstack/react-query\`
- **Zustand** — minimal state management: \`npm install zustand\`
- **Axios** — HTTP client with interceptors: \`npm install axios\`

### Charts & Data Viz:
- **Recharts** — composable React charts: \`npm install recharts\`
- **Chart.js + react-chartjs-2** — powerful charts: \`npm install chart.js react-chartjs-2\`

### Tables:
- **TanStack Table v8** — headless, powerful: \`npm install @tanstack/react-table\`

### Date/Time:
- **date-fns** — lightweight date utility: \`npm install date-fns\`
- **dayjs** — minimalist moment.js alternative: \`npm install dayjs\`

### Notifications:
- **Sonner** — beautiful toast notifications: \`npm install sonner\`
- **react-hot-toast** — simple toasts: \`npm install react-hot-toast\`

### Routing:
- **React Router v6** — \`npm install react-router-dom\`
- **wouter** — tiny router (2kb): \`npm install wouter\`

### Markdown / Rich Text:
- **react-markdown** + **rehype-highlight** — render markdown: \`npm install react-markdown rehype-highlight\`
- **@uiw/react-md-editor** — markdown editor: \`npm install @uiw/react-md-editor\`

### Developer Experience:
- **TypeScript** — always, no exceptions
- **ESLint + Prettier** — code quality
- **Vite** — fast bundler for frontend

## UI/UX Design Principles to Follow:
- Use **8px spacing scale**: p-2, p-4, p-6, p-8 (never odd numbers)
- Use **semantic color tokens**: primary, secondary, muted, destructive, accent
- Add **subtle shadows**: shadow-sm, shadow-md for cards, dropdowns
- Use **border-radius**: rounded-lg (8px) for cards, rounded-xl (12px) for large surfaces, rounded-full for pills
- Add **hover + focus + active states** to ALL interactive elements
- Add **loading skeletons** while data fetches (Skeleton component)
- Add **empty states** with illustration/icon + message + action button
- Add **error states** with clear error message + retry button
- Use **micro-animations**: transition-all duration-200 for color changes, scale-95 for button press
- Dark mode support via CSS variables (--background, --foreground, --primary, etc.)
- Mobile-first responsive design with sm: md: lg: breakpoints
</ui_libraries>

<build_rules>
- TypeScript for BOTH backend and frontend — NO JavaScript
- NEVER put all code in one file — always use proper folder structure above
- Start with ALL package.json files first (frontend + backend separately)
- Install ALL dependencies before writing source code
- Use shadcn/ui + Tailwind + Framer Motion for beautiful UI
- For editing: prefer file_str_replace over rewriting entire files
- Chain shell commands: e.g. "npm install && npm run build && npm start"
- After building: verify it works with shell_exec, then deploy
- Use web_search to find latest docs, package versions, and best practices
- Add .env.example files showing required env vars
- Write README.md with setup instructions
- NO placeholders, NO TODO, NO mock data — real executable code only
- Every component needs: loading state, error state, empty state
- Every form needs: validation (Zod), error messages, disabled state while submitting
- Every API route needs: auth middleware, input validation, error handling
</build_rules>

<secrets_handling>
- If you need an API key not stored yet, call request_secret to ask user
- NEVER hardcode real secrets in files — always use env vars
- Use .env file pattern with process.env.KEY_NAME
</secrets_handling>

<critical_rules>
- ALWAYS call task_done when finished — this is REQUIRED, never skip it
- If approaching iteration limit, call task_done with current progress summary
- Never stop mid-task without explanation — always call task_done
- Match user language (Arabic/English)
- Be concise in updates, thorough in final results
</critical_rules>

<bobo_services>
## Bobo Auth — Remote Authentication (USE THIS for all projects needing user login)

The platform provides a hosted auth service. Your built projects can call these APIs from anywhere (Vercel, etc.) by setting BOBO_PROJECT_KEY to the project ID.

### Setup in your project:
\`\`\`env
BOBO_PROJECT_KEY=<projectId>
BOBO_API_URL=${platformUrl ?? "https://your-platform-url.repl.co"}
\`\`\`

### Bobo Auth API calls (add to your backend):
\`\`\`typescript
const BOBO_URL = process.env.BOBO_API_URL;
const BOBO_KEY = process.env.BOBO_PROJECT_KEY;
const headers = { "Content-Type": "application/json", "Authorization": \`Bearer \${BOBO_KEY}\` };

// Register a user
const res = await fetch(\`\${BOBO_URL}/api/bobo/auth/register\`, {
  method: "POST", headers,
  body: JSON.stringify({ email, password, name })
});
const { user, token } = await res.json();

// Login
const res = await fetch(\`\${BOBO_URL}/api/bobo/auth/login\`, {
  method: "POST", headers,
  body: JSON.stringify({ email, password })
});
const { user, token } = await res.json();

// Verify token (call from middleware)
const res = await fetch(\`\${BOBO_URL}/api/bobo/auth/verify\`, {
  headers: { "Authorization": \`Bearer \${userJwtToken}\` }
});
const { user, valid } = await res.json();
\`\`\`

## Bobo Data — Remote Key-Value Storage (USE THIS for all projects needing data persistence)

\`\`\`typescript
const BOBO_URL = process.env.BOBO_API_URL;
const BOBO_KEY = process.env.BOBO_PROJECT_KEY;
const headers = { "Content-Type": "application/json", "Authorization": \`Bearer \${BOBO_KEY}\` };

// Save data (value can be any JSON — string, number, object, array)
await fetch(\`\${BOBO_URL}/api/bobo/data/set\`, {
  method: "POST", headers,
  body: JSON.stringify({ key: "users:123", value: { name: "Ali", email: "ali@x.com" } })
});

// Get data
const res = await fetch(\`\${BOBO_URL}/api/bobo/data/get?key=users:123\`, { headers });
const { value } = await res.json();

// List all keys (optional prefix filter)
const res = await fetch(\`\${BOBO_URL}/api/bobo/data/list?prefix=users:\`, { headers });
const { items } = await res.json(); // [{ key, value }, ...]

// Delete a key
await fetch(\`\${BOBO_URL}/api/bobo/data/delete?key=users:123\`, { method: "DELETE", headers });
\`\`\`

### Key naming conventions:
- users:{id} → user profiles
- tasks:{userId}:{id} → todo items  
- posts:{id} → blog posts
- settings:{userId} → user settings
- counter:{name} → counters

IMPORTANT: ALWAYS use Bobo Auth + Bobo Data in projects that need auth or storage. 
Set the environment variables using set_secret tool and use them in .env files.
Get the project's BOBO_PROJECT_KEY with get_secrets (it equals the projectId, visible in logs).
</bobo_services>

<expo_mobile>
## Building Expo / React Native Mobile Apps

When the user asks to build a mobile app, use this structure and workflow:

### Project structure:
\`\`\`
my-app/
├── App.tsx                  # ← REQUIRED entry point (must be at root)
├── app.json                 # Expo config: name, slug, version, sdkVersion
├── package.json
├── tsconfig.json
├── babel.config.js
├── assets/
│   ├── icon.png
│   └── splash.png
├── src/
│   ├── screens/             # Screen components (HomeScreen, ProfileScreen, etc.)
│   ├── components/          # Reusable UI components
│   ├── navigation/          # React Navigation setup
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Utilities, API client
│   └── types/               # TypeScript types
\`\`\`

### Required package.json (minimal working Snack-compatible):
\`\`\`json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "App.tsx",
  "scripts": { "start": "expo start" },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.2",
    "react-native": "0.76.5"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "typescript": "^5.3.0"
  }
}
\`\`\`

### Key libraries:
- **React Navigation** — navigation: \`@react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs\`
- **Expo Router** — file-based navigation (alternative): \`expo-router\`
- **NativeWind** — Tailwind for React Native: \`nativewind tailwindcss\`
- **React Native Paper** — Material Design: \`react-native-paper\`
- **Expo Vector Icons** — icons: \`@expo/vector-icons\` (bundled with Expo)
- **React Native Reanimated** — animations: \`react-native-reanimated\`
- **AsyncStorage** — local storage: \`@react-native-async-storage/async-storage\`

### Example App.tsx:
\`\`\`tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello World!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold' },
});
\`\`\`

### Workflow for building mobile apps:
1. Write App.tsx + all screens/components
2. Write package.json + app.json + tsconfig.json + babel.config.js
3. Call \`expo_snack\` tool — uploads all files to Expo Snack, returns a QR code
4. User scans QR with Expo Go on their phone to test live

### Snack limitations (keep code compatible):
- No native modules requiring build steps
- No local assets that can't be inline
- Use CDN images when possible (via { uri: 'https://...' })
- Stick to Expo SDK packages (expo-*, react-native-*)

### After expo_snack succeeds, the UI shows a QR card — tell the user to:
1. Install "Expo Go" on their phone (App Store / Play Store)
2. Scan the QR code in the card
3. The app opens instantly on their device
</expo_mobile>`;

  if (isArabic) {
    return basePrompt + `

<arabic_mode>
تحدث العربية مع المستخدم. استخدم أسلوبًا تقنيًا مباشرًا.
استمر في العمل حتى تكتمل المهمة — لا تتوقف في المنتصف أبدًا.
اتصل دائمًا بـ task_done عند الانتهاء.

هيكل المشاريع الإلزامي:
- NEVER تضع كل الكود في ملف واحد
- دائمًا استخدم هيكل المجلدات المنظّم: api-server/ + app/ (components/ui/ + pages/ + hooks/ + lib/)
- استخدم أقوى مكتبات: Tailwind CSS + shadcn/ui + Framer Motion + Lucide React + React Hook Form + Zod + TanStack Query
- كل مشروع ويب = TypeScript + React + Vite للفرونت + Express + TypeScript للباك
- جودة إنتاجية كاملة: loading states + error states + empty states + dark mode + responsive
</arabic_mode>`;
  }

  return basePrompt;
}

async function executeTool(
  name: string,
  args: Record<string, any>,
  projectId: string,
  sendEvent: (event: string, data: unknown) => void
): Promise<string> {
  const wsDir = getWorkspaceDir(projectId);
  const secrets = getProjectSecrets(projectId);

  const safePath = (p: string) => {
    const abs = path.resolve(wsDir, p.startsWith("/") ? p.slice(1) : p);
    if (!abs.startsWith(wsDir)) throw new Error("Path outside workspace");
    return abs;
  };

  switch (name) {
    case "message_notify": {
      sendEvent("notify", { text: args.text });
      return `[Notification sent]`;
    }

    case "task_done": {
      sendEvent("task_done", { summary: args.summary });
      return `[Task marked complete]`;
    }

    case "file_write": {
      const abs = safePath(args.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (args.append && fs.existsSync(abs)) {
        fs.appendFileSync(abs, args.content, "utf-8");
        return `✓ Appended to: ${args.file}`;
      }
      fs.writeFileSync(abs, args.content, "utf-8");
      return `✓ Written: ${args.file} (${args.content.length} chars)`;
    }

    case "file_read": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `Error: File not found: ${args.file}`;
      let content = fs.readFileSync(abs, "utf-8");
      if (args.start_line !== undefined || args.end_line !== undefined) {
        const lines = content.split("\n");
        const start = args.start_line ?? 0;
        const end = args.end_line ?? lines.length;
        content = lines.slice(start, end).join("\n");
      }
      return content.length > 12000 ? content.slice(0, 12000) + "\n...[truncated at 12000 chars]" : content;
    }

    case "file_str_replace": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `Error: File not found: ${args.file}`;
      const content = fs.readFileSync(abs, "utf-8");
      if (!content.includes(args.old_str)) {
        return `Error: String not found in ${args.file}. Verify old_str matches exactly (including whitespace).`;
      }
      const updated = content.replace(args.old_str, args.new_str);
      fs.writeFileSync(abs, updated, "utf-8");
      return `✓ Replaced in ${args.file}`;
    }

    case "file_find_by_name": {
      const { execSync } = await import("child_process");
      try {
        const result = execSync(`find . -name "${args.glob.replace(/"/g, "")}" 2>/dev/null | head -50`, {
          cwd: wsDir, encoding: "utf-8", timeout: 10000,
        });
        return result.trim() || "No files found matching pattern.";
      } catch {
        const all = listFilesRecursive(wsDir);
        const pattern = args.glob.replace(/\*/g, ".*").replace(/\?/g, ".");
        const re = new RegExp(pattern, "i");
        const matches = all.filter((f) => re.test(path.basename(f.path)));
        return matches.length > 0 ? matches.map((f) => f.path).join("\n") : "No files found.";
      }
    }

    case "file_find_in_content": {
      const files = args.file
        ? [{ path: args.file, isDir: false, size: 0 }]
        : listFilesRecursive(wsDir).filter((f) => !f.isDir);
      const results: string[] = [];
      const re = new RegExp(args.regex, "gm");
      for (const f of files) {
        try {
          const abs = safePath(f.path);
          const content = fs.readFileSync(abs, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, i) => {
            if (re.test(line)) results.push(`${f.path}:${i + 1}: ${line.trim()}`);
          });
        } catch {}
      }
      return results.length > 0
        ? results.slice(0, 100).join("\n") + (results.length > 100 ? `\n...[${results.length - 100} more]` : "")
        : "No matches found.";
    }

    case "file_list": {
      const files = listFilesRecursive(wsDir);
      if (files.length === 0) return "Workspace is empty — no files yet.";
      return files
        .map((f) => `${f.isDir ? "📁" : "📄"} ${f.path}${!f.isDir ? ` (${f.size}B)` : ""}`)
        .join("\n");
    }

    case "file_delete": {
      const abs = safePath(args.file);
      if (!fs.existsSync(abs)) return `File not found: ${args.file}`;
      fs.rmSync(abs, { recursive: true, force: true });
      return `✓ Deleted: ${args.file}`;
    }

    case "shell_exec": {
      const timeoutMs = Math.min((args.timeout ?? 90) * 1000, 300000);
      try {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd: wsDir,
          timeout: timeoutMs,
          env: { ...process.env, ...secrets, NODE_ENV: "production" },
          maxBuffer: 1024 * 1024 * 4,
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return out.length > 8000 ? out.slice(0, 8000) + "\n...[output truncated]" : out || "(command succeeded, no output)";
      } catch (err: any) {
        const out = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
        return `Exit ${err.code ?? 1}:\n${(out || err.message).slice(0, 6000)}`;
      }
    }

    case "install_packages": {
      const pkgs = (args.packages as string[])
        .map((p) => p.replace(/[^a-zA-Z0-9@/._~^<>=\-]/g, ""))
        .join(" ");
      const flag = args.dev ? "--save-dev" : "--save";
      try {
        const { stdout, stderr } = await execAsync(`npm install ${pkgs} ${flag}`, {
          cwd: wsDir, timeout: 180000,
          env: { ...process.env, NPM_CONFIG_YES: "true" },
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return `✓ Installed: ${pkgs}\n${out.slice(0, 2000)}`;
      } catch (err: any) {
        return `Install error:\n${[err.stdout, err.stderr].filter(Boolean).join("\n").trim().slice(0, 3000) || err.message}`;
      }
    }

    case "fetch_url": {
      try {
        const res = await fetch(args.url, {
          method: args.method ?? "GET",
          headers: { "User-Agent": "Mozilla/5.0 AI-Agent/2.0", ...(args.headers ?? {}) },
          body: args.body ? args.body : undefined,
          signal: AbortSignal.timeout(30000),
        });
        const text = await res.text();
        const truncated = text.length > 15000 ? text.slice(0, 15000) + "\n...[truncated]" : text;
        return `HTTP ${res.status} — ${args.url}\nContent-Type: ${res.headers.get("content-type")}\n\n${truncated}`;
      } catch (err: any) {
        return `Fetch error: ${err.message}`;
      }
    }

    case "web_search": {
      try {
        const encoded = encodeURIComponent(args.query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          headers: { "User-Agent": "Mozilla/5.0 AI-Agent/2.0" },
          signal: AbortSignal.timeout(15000),
        });
        const html = await res.text();
        const results: string[] = [];
        const re = /class="result__title"[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>(.*?)<\/div>/gm;
        let m;
        while ((m = re.exec(html)) !== null && results.length < 10) {
          const url = m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0];
          const title = m[2].replace(/<[^>]+>/g, "").trim();
          const snippet = m[3].replace(/<[^>]+>/g, "").trim();
          if (title && snippet) results.push(`**${title}**\n${decodeURIComponent(url)}\n${snippet}`);
        }
        if (results.length === 0) {
          const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
          return `Search results for "${args.query}":\n${text}`;
        }
        return `Search results for "${args.query}":\n\n${results.join("\n\n")}`;
      } catch (err: any) {
        return `Search error: ${err.message}`;
      }
    }

    case "set_secret": {
      const current = getProjectSecrets(projectId);
      current[args.key] = args.value;
      const secretsPath = path.join(wsDir, ".secrets.json");
      fs.mkdirSync(wsDir, { recursive: true });
      fs.writeFileSync(secretsPath, JSON.stringify(current, null, 2), "utf-8");
      return `✓ Secret stored: ${args.key}`;
    }

    case "get_secrets": {
      const current = getProjectSecrets(projectId);
      const platformUrl = process.env.PLATFORM_URL ?? "https://your-platform.replit.app";
      // Auto-inject BOBO vars if not already set
      if (!current["VITE_BOBO_PROJECT_KEY"]) current["VITE_BOBO_PROJECT_KEY"] = projectId;
      if (!current["VITE_BOBO_API_URL"]) current["VITE_BOBO_API_URL"] = platformUrl;
      const keys = Object.keys(current);
      return `Stored secrets (names only):\n${keys.join("\n")}\n\nNote: VITE_BOBO_PROJECT_KEY=${projectId} and VITE_BOBO_API_URL=${platformUrl} are auto-configured.`;
    }

    case "request_secret": {
      sendEvent("request_secret", { key: args.key, description: args.description });
      return `[Waiting for user to provide: ${args.key}]`;
    }

    case "deploy_to_vercel": {
      const token = process.env.VERCEL_TOKEN;
      if (!token) return "❌ VERCEL_TOKEN not configured. Use request_secret to ask the user for it.";
      try {
        const project = findById<any>("projects", projectId);
        const result = await deployToVercel(
          token,
          wsDir,
          project?.name ?? "ai-project",
          project?.vercelProjectId,
          secrets
        );
        updateRecord("projects", projectId, {
          vercelUrl: result.url,
          vercelProjectId: result.projectId,
          vercelProjectName: result.projectName,
          lastDeployedAt: new Date().toISOString(),
        });
        sendEvent("deploy_done", { url: result.url });
        return `✅ Deployed!\n🔗 Live URL: ${result.url}\n📦 Project: ${result.projectName}`;
      } catch (err: any) {
        return `❌ Deploy failed: ${err.message}`;
      }
    }

    case "expo_snack": {
      try {
        const allFiles = listFilesRecursive(wsDir).filter((f) => !f.isDir);
        const snackFiles: Record<string, { type: "CODE"; contents: string }> = {};
        const textExts = new Set([".tsx", ".ts", ".js", ".jsx", ".json", ".css", ".md"]);
        let hasEntry = false;

        for (const file of allFiles) {
          if (
            file.path.includes("node_modules") ||
            file.path.startsWith(".git") ||
            file.path.includes("/.git/")
          ) continue;
          const ext = path.extname(file.path).toLowerCase();
          if (!textExts.has(ext)) continue;
          try {
            const abs = path.join(wsDir, file.path);
            const content = fs.readFileSync(abs, "utf-8");
            if (content.length > 80000) continue;
            snackFiles[file.path] = { type: "CODE", contents: content };
            if (file.path === "App.tsx" || file.path === "App.js") hasEntry = true;
          } catch {}
        }

        if (!hasEntry) {
          return "❌ No Expo entry file found. The project must have App.tsx or App.js at the root.";
        }

        const payload = {
          name: args.name ?? "My App",
          description: args.description ?? "Built with AI Builder",
          sdkVersion: "52.0.0",
          files: snackFiles,
        };

        const response = await fetch("https://exp.host/--/api/v2/snack/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Expo-Platform": "web",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const errText = await response.text();
          return `❌ Expo Snack API error ${response.status}: ${errText.slice(0, 400)}`;
        }

        const result = await response.json() as any;
        const snackId = result.hashId ?? result.id;
        if (!snackId) {
          return `❌ No snack ID in response: ${JSON.stringify(result).slice(0, 300)}`;
        }

        const snackUrl = `https://snack.expo.dev/${snackId}`;
        const expoGoUrl = `exp://exp.host/${snackId}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(expoGoUrl)}&margin=10&bgcolor=ffffff`;

        sendEvent("expo_snack", { url: snackUrl, qrUrl, snackId, expoGoUrl });

        return `✅ Uploaded to Expo Snack!\n🔗 Snack URL: ${snackUrl}\n📱 Scan with Expo Go to test live on your phone`;
      } catch (err: any) {
        return `❌ expo_snack failed: ${err.message}`;
      }
    }

    case "build_preview": {
      try {
        sendEvent("notify", { text: "Building project for preview..." });
        const pkgPath = path.join(wsDir, "package.json");
        const rootIndexHtml = path.join(wsDir, "index.html");

        // ── Plain HTML project (no package.json, just static files) ──
        if (!fs.existsSync(pkgPath) && fs.existsSync(rootIndexHtml)) {
          const distPath = path.join(wsDir, "dist");
          fs.mkdirSync(distPath, { recursive: true });
          // Copy all workspace files (except dist/.git) into dist/
          const entries = fs.readdirSync(wsDir);
          for (const entry of entries) {
            if (["dist", ".git", "node_modules"].includes(entry)) continue;
            const src = path.join(wsDir, entry);
            const dest = path.join(distPath, entry);
            fs.cpSync(src, dest, { recursive: true, force: true });
          }
          sendEvent("preview_ready", { url: `/api/projects/${projectId}/preview/` });
          return `✅ Static HTML project ready — preview is now live in the browser panel.`;
        }

        // ── Node/bundled project — detect framework and build ──
        let buildCmd = "npm run build";
        let pm = "npm";
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const usesYarn = fs.existsSync(path.join(wsDir, "yarn.lock"));
          const usesPnpm = fs.existsSync(path.join(wsDir, "pnpm-lock.yaml"));
          pm = usesPnpm ? "pnpm" : usesYarn ? "yarn" : "npm";
          if (deps["vite"] || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-vue"] || deps["@vitejs/plugin-solid"]) {
            buildCmd = `${pm} run build -- --base /api/projects/${projectId}/preview/`;
          } else if (deps["react-scripts"]) {
            buildCmd = `PUBLIC_URL=/api/projects/${projectId}/preview ${pm} run build`;
          } else {
            buildCmd = `${pm} run build`;
          }
        }

        // Auto-install node_modules if missing
        const nmDir = path.join(wsDir, "node_modules");
        if (!fs.existsSync(nmDir)) {
          sendEvent("notify", { text: "Installing dependencies..." });
          try {
            await execAsync(`${pm} install`, {
              cwd: wsDir,
              timeout: 180000,
              env: { ...process.env, ...secrets },
              maxBuffer: 1024 * 1024 * 8,
            });
          } catch (installErr: any) {
            const installOut = [installErr.stdout, installErr.stderr].filter(Boolean).join("\n").trim();
            return `❌ Dependency install failed:\n${(installOut || installErr.message).slice(0, 3000)}`;
          }
        }

        sendEvent("notify", { text: "Building project..." });
        const { stdout, stderr } = await execAsync(buildCmd, {
          cwd: wsDir,
          timeout: 180000,
          env: { ...process.env, ...secrets, NODE_ENV: "production" },
          maxBuffer: 1024 * 1024 * 8,
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        const distPath = path.join(wsDir, "dist");
        const buildPath = path.join(wsDir, "build");
        const outPath = path.join(wsDir, "out");
        const hasOutput =
          fs.existsSync(path.join(distPath, "index.html")) ||
          fs.existsSync(path.join(buildPath, "index.html")) ||
          fs.existsSync(path.join(outPath, "index.html"));
        if (hasOutput) {
          sendEvent("preview_ready", { url: `/api/projects/${projectId}/preview/` });
          return `✅ Build complete! Preview is now live in the browser panel.\n${out.slice(0, 1500)}`;
        }
        return `Build ran but no index.html found in dist/build/out.\n${out.slice(0, 3000)}`;
      } catch (err: any) {
        const out = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
        return `❌ Build failed:\n${(out || err.message).slice(0, 4000)}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

router.post("/projects/:projectId/agent/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { content, customAI, githubToken } = req.body as {
    content?: string;
    customAI?: { baseUrl?: string; apiKey?: string; model?: string };
    githubToken?: string;
  };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  const users = findWhere<User>("users", (u) => u.id === userId);
  const user = users[0];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  // Prevent socket timeout for long-running agents
  (req.socket as any)?.setTimeout?.(0);
  (req.socket as any)?.setNoDelay?.(true);
  (req.socket as any)?.setKeepAlive?.(true, 15000);
  // Also disable the server-level timeout for this socket
  res.setTimeout?.(0);

  // Track if client disconnected
  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });
  req.on("aborted", () => { clientDisconnected = true; });

  // Send SSE keepalive ping every 8 seconds to prevent proxy/browser timeouts
  const keepAliveInterval = setInterval(() => {
    if (clientDisconnected) { clearInterval(keepAliveInterval); return; }
    try { res.write(": ping\n\n"); (res as any).flush?.(); } catch { clearInterval(keepAliveInterval); clientDisconnected = true; }
  }, 8000);

  const sendEvent = (event: string, data: unknown) => {
    if (clientDisconnected) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Flush immediately so the browser receives each event without buffering
      (res as any).flush?.();
    } catch {}
  };

  // Save user message
  const userMsgId = (await import("uuid")).v4();
  const userMsg = {
    id: userMsgId,
    projectId: req.params.projectId,
    role: "user" as const,
    content,
    thinkingSteps: null,
    attachmentUrl: null,
    createdAt: new Date().toISOString(),
  };
  insertRecord("messages", userMsg);
  sendEvent("user_message", userMsg);

  // Load history
  const allMsgs = findWhere<any>("messages", (m) => m.projectId === req.params.projectId);
  allMsgs.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const wsDir = getWorkspaceDir(req.params.projectId);
  const wsFiles = fs.existsSync(wsDir) ? listFilesRecursive(wsDir).filter((f) => !f.isDir) : [];

  // Custom AI credentials (from user's own AI config in Settings)
  const useCustomAI = customAI?.apiKey && customAI.apiKey.trim().length > 0;
  const platformApiKey = process.env.AI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const platformBaseURL = process.env.AI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const platformModel = process.env.AI_MODEL ?? "gpt-5.4";

  const OpenAI = (await import("openai")).default;

  function makeClient(apiKey: string, baseURL?: string) {
    return new OpenAI({ apiKey, baseURL: baseURL || undefined });
  }

  let client = makeClient(
    useCustomAI ? customAI!.apiKey! : platformApiKey!,
    useCustomAI ? (customAI!.baseUrl || undefined) : platformBaseURL
  );

  // Build initial messages — use last 20 for context
  const historyMessages = allMsgs.slice(-20).map((m: any) => ({ role: m.role, content: m.content }));

  const platformUrl = process.env.PLATFORM_URL ?? `https://${req.headers.host}`;

  const messages: any[] = [
    { role: "system", content: getSystemPrompt(user?.language, wsFiles.length, platformUrl) },
    ...historyMessages,
  ];

  const aiMsgId = (await import("uuid")).v4();
  let fullContent = "";
  const toolsUsed: string[] = [];
  const model = (useCustomAI && customAI!.model) ? customAI!.model : platformModel;
  const usingCustomAI = useCustomAI;

  sendEvent("ai_source", { source: usingCustomAI ? "custom" : "platform", model });
  const isThinkingModel = model.toLowerCase().includes("qwen") || model.toLowerCase().includes("deepseek-r") || model.toLowerCase().includes("qwq");

  agentLog("INFO", req.params.projectId, "agent_start", {
    model,
    plan: (users[0] as any)?.plan ?? "free",
    msgLen: content.length,
    historyCount: allMsgs.length,
  });

  try {
    let continueLoop = true;
    let iterations = 0;
    // Plan-based agent power: free=30, build=50, scale=70, admin=80
    const planPower: Record<string, number> = { free: 25, build: 40, scale: 60, admin: 80 };
    const userPlanStr = (users[0] as any)?.plan ?? "free";
    const MAX_ITERATIONS = planPower[userPlanStr] ?? 30;
    let taskDoneCalled = false;

    while (continueLoop && iterations < MAX_ITERATIONS && !taskDoneCalled && !clientDisconnected) {
      iterations++;
      agentLog("INFO", req.params.projectId, "iteration_start", { iteration: iterations, maxIterations: MAX_ITERATIONS });

      // Prune tool messages if context is too large (keep last 40 messages)
      if (messages.length > 55) {
        const systemMsg = messages[0];
        const recent = messages.slice(-40);
        // Ensure we don't break tool_call/tool_result pairs
        messages.length = 0;
        messages.push(systemMsg, ...recent);
      }

      const reqParams: any = {
        model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        max_tokens: 16384,
        stream: true,
      };
      if (isThinkingModel) {
        reqParams.extra_body = { enable_thinking: false };
      }

      let stream: any;
      try {
        stream = await client.chat.completions.create(reqParams);
      } catch (err: any) {
        sendEvent("error", { message: `API error: ${err.message}` });
        break;
      }

      let iterText = "";
      let thinkBuffer = "";
      let inThink = false;
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let finishReason = "";

      try {
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta.content) {
            if (isThinkingModel) {
              let text = delta.content;
              thinkBuffer += text;
              let visible = "";
              let buf = thinkBuffer;
              while (true) {
                if (!inThink) {
                  const startIdx = buf.indexOf("<think>");
                  if (startIdx === -1) { visible += buf; buf = ""; break; }
                  visible += buf.slice(0, startIdx);
                  buf = buf.slice(startIdx + 7);
                  inThink = true;
                } else {
                  const endIdx = buf.indexOf("</think>");
                  if (endIdx === -1) { buf = ""; break; }
                  buf = buf.slice(endIdx + 8);
                  inThink = false;
                }
              }
              thinkBuffer = buf;
              if (visible) {
                iterText += visible;
                fullContent += visible;
                sendEvent("chunk", { delta: visible, msgId: aiMsgId });
              }
            } else {
              iterText += delta.content;
              fullContent += delta.content;
              sendEvent("chunk", { delta: delta.content, msgId: aiMsgId });
            }
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: "", name: "", arguments: "" };
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }
      } catch (streamErr: any) {
        // Stream error — log it and retry the iteration (up to 2 retries)
        agentLog("ERROR", req.params.projectId, "stream_error", { message: (streamErr as any)?.message, iteration: iterations });
        sendEvent("notify", { text: `⚠️ Stream interrupted (iteration ${iterations}) — retrying...` });
        // Pop the malformed assistant message we just pushed before retrying
        if (messages[messages.length - 1]?.role === "assistant") messages.pop();
        iterations--; // Don't count this failed iteration
        continue;
      }

      agentLog("INFO", req.params.projectId, "finish_reason", {
        iteration: iterations,
        finishReason,
        toolCallCount: toolCalls.length,
        iterTextLen: iterText.length,
      });

      // Push assistant turn
      messages.push({
        role: "assistant",
        content: iterText || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }))
          : undefined,
      });

      // Execute tools
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          if (!tc.name) continue;

          if (tc.name !== "message_notify" && tc.name !== "task_done") {
            toolsUsed.push(tc.name);
          }

          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.arguments || "{}"); } catch {}

          agentLog("INFO", req.params.projectId, "tool_call", { name: tc.name, iteration: iterations });
          sendEvent("tool_call", { name: tc.name, args, status: "running" });

          const result = await executeTool(tc.name, args, req.params.projectId, sendEvent);

          agentLog("INFO", req.params.projectId, "tool_result", {
            name: tc.name,
            resultLen: result.length,
            success: !result.startsWith("❌"),
          });
          sendEvent("tool_result", {
            name: tc.name,
            result: result.length > 3000 ? result.slice(0, 3000) + "\n...[truncated]" : result,
            status: "done",
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.length > 8000 ? result.slice(0, 8000) + "\n...[truncated]" : result,
          });

          if (tc.name === "task_done") {
            agentLog("INFO", req.params.projectId, "task_done", {
              iteration: iterations,
              toolsUsed,
              summary: (args.summary ?? "").toString().slice(0, 200),
            });
            taskDoneCalled = true;
            continueLoop = false;
            break;
          }
        }
      } else {
        // No tool calls — check finish reason
        if (finishReason === "stop" || finishReason === "end_turn" || finishReason === "length") {
          agentLog("INFO", req.params.projectId, "loop_exit", { reason: `no_tools_finish_${finishReason}`, iteration: iterations });
          continueLoop = false;
        } else if (!finishReason) {
          agentLog("WARN", req.params.projectId, "loop_exit", { reason: "no_tools_no_finish_reason", iteration: iterations });
          continueLoop = false;
        }
      }

      // Safety: if we're near the iteration limit and task_done not called, prompt to finish
      if (iterations >= MAX_ITERATIONS - 3 && !taskDoneCalled && continueLoop) {
        messages.push({
          role: "user",
          content: "You are close to the iteration limit. Please call task_done NOW with a summary of what was accomplished so far.",
        });
      }
    }

    // If loop ended without task_done, force send a task_done event so the UI shows completion
    if (!taskDoneCalled) {
      const autoSummary = fullContent
        ? fullContent.slice(-600)
        : `Completed ${toolsUsed.length} actions: ${toolsUsed.slice(-8).join(", ")}`;
      sendEvent("task_done", {
        summary: toolsUsed.length > 0
          ? `✅ Done! Completed ${toolsUsed.length} steps.\n\n${autoSummary}`
          : autoSummary,
      });
    }

    // Save final AI message
    const aiMsg = {
      id: aiMsgId,
      projectId: req.params.projectId,
      role: "assistant" as const,
      content: fullContent,
      thinkingSteps: toolsUsed.length > 0 ? toolsUsed : null,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    // Always persist — even if client disconnected, save progress to DB
    try {
      // Delete any partial record saved mid-stream, then insert final
      insertRecord("messages", aiMsg);
      updateRecord<any>("projects", req.params.projectId, { updatedAt: new Date().toISOString() });
      if (user) {
        updateRecord<User>("users", userId, { creditsUsed: (user.creditsUsed ?? 0) + 1 });
      }
    } catch (saveErr) {
      agentLog("ERROR", req.params.projectId, "save_failed", { message: (saveErr as any)?.message });
    }

    sendEvent("done", aiMsg);
  } catch (err: any) {
    agentLog("ERROR", req.params.projectId, "agent_failed", { message: (err as any)?.message });
    req.log?.error({ err }, "Agent stream failed");
    sendEvent("error", { message: err.message ?? "Agent error" });
  } finally {
    clearInterval(keepAliveInterval);
    try { res.end(); } catch {}
  }
});

// ── GitHub push route ─────────────────────────────────────────────────
router.post("/projects/:projectId/github/push", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const project = findById<any>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { token, repo, message } = req.body as { token: string; repo: string; message?: string };
  if (!token || !repo) {
    res.status(400).json({ error: "token and repo are required (format: owner/repo)" });
    return;
  }

  const wsDir = getWorkspaceDir(req.params.projectId);
  if (!fs.existsSync(wsDir)) {
    res.status(400).json({ error: "Project workspace is empty — no files to push" });
    return;
  }

  try {
    const commitMsg = message || `Update from AI Builder — ${new Date().toISOString().slice(0, 10)}`;
    const remoteUrl = `https://${token}@github.com/${repo}.git`;

    // Init git if needed
    if (!fs.existsSync(path.join(wsDir, ".git"))) {
      await execAsync(`git init && git branch -M main`, { cwd: wsDir });
    }

    // Set up git user if not set
    await execAsync(`git config user.email "ai-builder@platform.dev" && git config user.name "AI Builder"`, { cwd: wsDir });

    // Stage all, commit, push
    await execAsync(`git add -A`, { cwd: wsDir });

    let commitOutput = "";
    try {
      const { stdout } = await execAsync(`git commit -m "${commitMsg.replace(/"/g, "'")}"`, { cwd: wsDir });
      commitOutput = stdout;
    } catch (e: any) {
      // If nothing to commit, that's OK
      if (!e.stdout?.includes("nothing to commit")) throw e;
      commitOutput = "Nothing new to commit";
    }

    await execAsync(`git remote remove origin 2>/dev/null || true`, { cwd: wsDir });
    await execAsync(`git remote add origin ${remoteUrl}`, { cwd: wsDir });
    await execAsync(`git push -u origin main --force`, { cwd: wsDir });

    const repoUrl = `https://github.com/${repo}`;
    res.json({ success: true, url: repoUrl, commit: commitOutput.trim() });
  } catch (err: any) {
    const msg = err.stderr ?? err.message ?? "Push failed";
    res.status(500).json({ error: msg.replace(token, "***") });
  }
});

export default router;
