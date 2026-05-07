# AI Builder Platform

A full-stack AI coding assistant platform (like Manus / Replit Agent) — users create projects, chat with an autonomous coding agent, and have code built and deployed automatically.

## Run & Operate

- **Start app (dev):** `pnpm --filter @workspace/app run dev`
- **Start API (dev):** `pnpm --filter @workspace/api-server run dev`
- **Typecheck:** `pnpm run typecheck`
- **API codegen:** `pnpm --filter @workspace/api-spec run codegen`

Required env vars:
- `AI_API_KEY` — OpenAI-compatible API key (required for agent to work)
- `AI_BASE_URL` — Optional custom base URL (e.g. OpenRouter)
- `AI_MODEL` — Model name, default `anthropic/claude-opus-4-5`
- `VERCEL_TOKEN` — Optional, for deploy_to_vercel tool

## Stack

- **Monorepo:** pnpm workspaces, Node 24, TypeScript 5.9
- **Frontend:** React + Vite + TailwindCSS v4 + Wouter + TanStack Query
- **Backend:** Express 5 (ESM), JSON file storage (`agentdata/`), OpenAI SDK with SSE streaming
- **Auth:** Bearer token (base64 `userId:timestamp`), stored in localStorage
- **Codegen:** Orval from `lib/api-spec/openapi.yaml`

## Where things live

- `artifacts/app/src/pages/AgentChat.tsx` — main agent chat UI: 3-dot menu, file chips, secret banners, background persistence
- `artifacts/app/src/pages/Dashboard.tsx` — project list + auto-name generation from description
- `artifacts/app/src/components/FileModal.tsx` — VS Code-style file tree + line numbers viewer/editor
- `artifacts/app/src/components/SecretsPanel.tsx` — project secrets manager
- `artifacts/app/src/components/MyFiles.tsx` — file attach modal
- `artifacts/api-server/src/routes/agent-stream.ts` — autonomous SSE agent (Manus-style, 40 iter max)
- `artifacts/api-server/src/lib/vercel-deploy.ts` — Vercel deployment helper
- `agentdata/` — JSON file storage (gitignored): `users.json`, `projects.json`, `messages.json`, `projects/`
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- `agentdata/` for all storage (was `data/`) — `agentdata/projects/{id}/` for workspace files
- MAX_ITERATIONS=40 for agent loop; context pruning after 40 messages to avoid token overflow
- Agent always calls `task_done` at end — UI shows completion; safety prompt injected at iteration 37+
- SSE events: `chunk`, `notify`, `task_done`, `tool_call`, `tool_result`, `deploy_done`, `request_secret`, `done`, `error`
- Background task persistence via localStorage (`agent-pending-{projectId}`) — survives refresh
- File diff chips show `+added -removed` line counts; clickable to open code view modal
- Secret request UI: agent calls `request_secret` tool → frontend shows inline amber banner

## Product

- Landing page + auth (register / sign in)
- Onboarding (3-step wizard)
- Dashboard — auto-generates project name from description (debounced 800ms)
- Chat (`/chat/:projectId`) — 3-dot menu (My Files, Run, Shell, Deploy, Databobo, Authbobo, Git, API Keys), file tree panel, deploy banner, secret request banners
- File viewer — VS Code-style tree with line numbers, inline edit, delete
- Secrets panel — add/remove project env vars
- Sidebar — credits bar, project list, settings link
- Admin panel

## User preferences

- Storage path: `agentdata/` (not `data/`)
- Chat: clean minimal style like Claude/Perplexity, no avatars, file chips with line counts
- 3-dot menu with: My Files, Run Project, Shell, Deploy, Databobo, Authbobo, Git, API Keys
- FileModal: VS Code-style file tree + line numbers panel
- Dashboard: auto-generate project name from description (debounced)
- Agent: MAX_ITERATIONS=40, streaming/terminal response style, always call task_done

## Gotchas

- Bearer token decode: `Buffer.from(token, 'base64').toString().split(':')[0]` = userId
- Codegen regenerates types — if typecheck fails, check `lib/api-zod/src/index.ts` has only one export line
- Agent stream pruning: keeps last 30 messages if context > 40 msgs
- Workspace files stored at: `agentdata/projects/{projectId}/`

## Pointers

- Skills: `.local/skills/react-vite/`, `.local/skills/workflows/`
