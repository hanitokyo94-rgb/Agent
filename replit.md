# AI Builder Platform

## Overview

A full AI Builder Platform (like Rocket.new) built as a pnpm workspace monorepo with TypeScript. Features streaming AI chat, project management, auth, onboarding, credits system, and settings with subscriptions.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS v4 + Wouter + @tanstack/react-query
- **Backend**: Express 5 (ESM), JSON file storage (`data/` dir), OpenAI SDK with SSE streaming
- **Validation**: Zod (`lib/api-zod`), Orval codegen from OpenAPI spec
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- **Auth**: Bearer token (base64 encoded userId:timestamp), stored in localStorage
- **AI**: OpenAI-compatible API via env vars `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run build` — build API server (esbuild)
- `pnpm --filter @workspace/api-server run dev` — build + run API server

## Workspace Packages

- `artifacts/app` — React+Vite frontend, port from `$PORT` env var, previewPath `/`
- `artifacts/api-server` — Express 5 API server, port 8080, paths `/api`
- `lib/api-spec` — OpenAPI spec + Orval config
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod schemas (only exports from `./generated/api`)
- `lib/api-types` — Shared TypeScript types

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/healthz | Health check |
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Get current user |
| POST | /api/user/onboarding | Complete onboarding |
| PUT | /api/user/profile | Update profile |
| POST | /api/user/avatar | Upload avatar |
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| POST | /api/projects/generate-name | AI-generate project name |
| GET | /api/projects/:id | Get project |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| GET | /api/projects/:id/messages | List messages |
| POST | /api/projects/:id/messages | Send message (non-streaming) |
| POST | /api/projects/:id/messages/stream | Send message (SSE streaming) |
| POST | /api/projects/:id/upload | Upload file |

## Data Storage

JSON files stored in `data/` directory (gitignored):
- `data/users.json` — User records with credits, plan, language, country
- `data/projects.json` — Project records
- `data/messages.json` — Message history with thinkingSteps

## Features

- **Auth Modal**: Beautiful slide-up auth modal on landing page
- **Onboarding**: 3-step onboarding (skill level, category, ad source)
- **Dashboard**: Project creation with examples, recent projects list
- **Chat**: SSE streaming with thinking steps progress bar, Markdown rendering, stop button
- **Sidebar**: Fixed sidebar with credits bar, project list, user info (mobile + desktop)
- **Settings**: Profile, subscription plans, appearance tabs
- **Language detection**: Auto-detects Arabic/English from browser, adjusts AI responses
- **Country detection**: Detects from timezone

## Important Notes

- `lib/api-zod/src/index.ts` must only export from `./generated/api` (NOT `./generated/types`) to avoid duplicate exports
- The codegen script regenerates zod types; if typecheck fails, ensure index.ts only has one export line
- Bearer token decoding: `Buffer.from(token, 'base64').toString().split(':')[0]` = userId
- SSE streaming events: `thinking` → `chunk` → `done` (or `error`)
