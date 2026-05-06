# AI Builder Platform

A full-stack AI coding assistant platform (like Rocket.new / Replit Agent) where users create projects, chat with an AI agent, and have code built and deployed automatically.

## Run & Operate

- **Start app (dev):** `PORT=23863 BASE_PATH=/ pnpm --filter @workspace/app run dev`
- **Start API (dev):** `pnpm --filter @workspace/api-server run dev`
- **Typecheck:** `pnpm run typecheck`
- **API codegen:** `pnpm --filter @workspace/api-spec run codegen`

Required env vars:
- `AI_API_KEY` — OpenAI-compatible API key (required for agent to work)
- `AI_BASE_URL` — Optional custom base URL (e.g. OpenRouter)
- `AI_MODEL` — Model name, default `anthropic/claude-opus-4-6`

## Stack

- **Monorepo:** pnpm workspaces, Node 24, TypeScript 5.9
- **Frontend:** React + Vite + TailwindCSS v4 + Wouter + TanStack Query
- **Backend:** Express 5 (ESM), JSON file storage (`data/` dir), OpenAI SDK with SSE streaming
- **Validation:** Zod (`lib/api-zod`), Orval codegen from `lib/api-spec/openapi.yaml`
- **Auth:** Bearer token (base64 `userId:timestamp`), stored in `localStorage`

## Where things live

- `artifacts/app/src/pages/AgentChat.tsx` — main chat UI (redesigned: no avatars, file diff chips, localStorage persistence)
- `artifacts/app/src/components/MyFiles.tsx` — iOS-style file attach modal
- `artifacts/api-server/src/routes/agent-stream.ts` — SSE streaming agent endpoint
- `artifacts/api-server/src/routes/` — all API routes
- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `data/` — JSON file storage (gitignored): `users.json`, `projects.json`, `messages.json`
- `.local/skills/bobo-auth/SKILL.md` — OAuth skill guide
- `.local/skills/bobodata/SKILL.md` — local data storage skill guide
- `bobo.md` — project plan & task tracker

## Architecture decisions

- JSON file storage (not a DB) — simple, zero-config, fine for early stage
- SSE streaming with named events: `chunk`, `notify`, `task_done`, `tool_call`, `tool_result`, `deploy_done`, `done`, `error`
- localStorage message persistence (`chat-messages-${projectId}`) for resilience against page refresh/background kills
- Agent stream route at `/api/projects/:id/agent/stream` (POST → SSE)
- `lib/api-zod/src/index.ts` must only export from `./generated/api` (not `./generated/types`) — avoids duplicate exports

## Product

- Landing page with hero, auth modal (sign in / register)
- Onboarding (3-step: skill level, category, ad source)
- Dashboard — project list, create with examples
- Chat (`/chat/:projectId`) — clean minimal UI like ChatGPT/Claude: user gray bubbles, assistant plain text, file diff chips with +N/-N line counts, collapsible tool steps, code viewer modal, MyFiles attach modal, connection status indicator
- Sidebar — credits bar, project list, user avatar, settings link
- Settings — profile, subscription plans, appearance

## User preferences

- Chat UI: no agent avatar, clean/minimal like ChatGPT or Claude
- File ops shown as clickable chips with `+added -removed` line counts
- MyFiles uses iOS-style modal with Upload + Project Files tabs

## Gotchas

- `artifacts/app: web` workflow fails (port conflict with "Start application") — use "Start application" instead
- Bearer token decode: `Buffer.from(token, 'base64').toString().split(':')[0]` = userId
- Codegen regenerates types — if typecheck fails, check `lib/api-zod/src/index.ts` has only one export line

## Pointers

- Skills: `.local/skills/bobo-auth/`, `.local/skills/bobodata/`, `.local/skills/react-vite/`
