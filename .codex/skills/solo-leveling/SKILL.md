---
name: solo-leveling
description: Work on the Solo Leveling repository. Use when modifying, testing, debugging, or explaining this pnpm workspace, including the TypeScript Fastify/Discord server, shared XP/rank logic, React dashboard, SQLite migrations, Docker deployment, or Android blocker client.
---

# Solo Leveling

## Project Shape

Treat this repository as a local-first Discord activity tracker:

- `server/`: Fastify API, Discord bot, SQLite access, daily quest workflows, CLI commands, Vitest tests.
- `shared/`: shared TypeScript types and deterministic XP/rank constants. Build this before tests that import the package.
- `web/`: Vite React dashboard.
- `migrations/`: SQL files applied by the server migration runner.
- `data/`: local SQLite files, ignored by git.
- `mobile/`: native Android client that calls server APIs and uses AccessibilityService for app blocking.

## Commands

Use pnpm from the repository root:

```bash
pnpm test
pnpm lint
pnpm build
pnpm dev
pnpm dev:server
pnpm dev:web
pnpm migrate
pnpm app doctor
pnpm reset:local-data --confirm
```

Prefer focused package commands while iterating:

```bash
pnpm --filter @solo-leveling/server test
pnpm --filter @solo-leveling/server lint
pnpm --filter @solo-leveling/web test
pnpm --filter @solo-leveling/web lint
pnpm --filter @solo-leveling/shared build
```

## Workflow

- Read the nearest package scripts before adding commands.
- Keep changes inside the workspace packages implied by the task.
- Preserve privacy boundaries: do not log bot tokens, raw Discord content, or local database contents.
- Avoid committing `.env`, SQLite files under `data/`, generated `dist/` outputs, `.gradle/`, or Android Studio metadata.
- Update migrations deliberately; do not alter applied migration semantics casually.
- For server changes, run the focused server tests first, then root `pnpm test` when shared behavior or package contracts are affected.
- For shared package changes, run `pnpm --filter @solo-leveling/shared build` before dependent tests.
- For web UI changes, run web lint/build checks and verify the actual local UI when a dev server is necessary.
- For Android changes, use the Android validation workflow only when the task touches `mobile/`.

## Domain Notes

- `STORE_MESSAGE_CONTENT=false` means message text is processed in memory and not persisted.
- Daily Quest thread creation and metric ingestion are intended to be idempotent.
- `DAILY_QUEST_TIER_OVERRIDE` is development/test-only and must not bypass rank restrictions.
- The mobile client does not read SQLite directly; it calls `/api/daily` and `/api/daily/flush`.
