# Chinese Auto Bot Access Key API

A Replit-hosted API that verifies access keys and lets approved Telegram admins view or rotate the current key.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server through its managed workflow
- `pnpm --filter @workspace/access-key-checker run dev` — run the Chinese Auto Bot web preview
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — apply schema changes to the development database
- `POST /api/verify-key` — accepts `{"key":"..."}` and returns `{"ok":true|false}`
- Main site flow: `/` → `/login` → `/countdown` → `/pin` → `/countdown-2`
- `/test-key` is a separate temporary page for testing the live key-verification API
- Only access-key verification is real; sign-in and PIN screens are visual prototype steps
- Telegram admin commands: `/key`, `/newkey`, `/setkey NEWKEY`
- Required shared environment variable: `ADMIN_IDS` — comma-separated numeric Telegram user IDs
- Optional shared environment variable: `ALLOWED_ORIGIN` — allow browser requests from one trusted origin; unset means no cross-origin access
- Required Replit Secret: `TELEGRAM_BOT_TOKEN` — Telegram Bot API token, never store it in source
- `DATABASE_URL` is provided by Replit and must not be set manually

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/access-key.ts` — access-key verification route and rate limit
- `artifacts/api-server/src/lib/telegram-bot.ts` — Telegram polling and admin commands
- `artifacts/api-server/src/lib/access-key.ts` — key generation, persistence helpers, and comparison
- `artifacts/access-key-checker/src/App.tsx` — five-screen access flow and temporary checker
- `artifacts/access-key-checker/design-reference/` — supplied five-screen design archive
- `artifacts/access-key-checker/public/assets/` — supplied logo and hero images
- `lib/db/src/schema/access-key-state.ts` — persistent key and Telegram update offset

## Architecture decisions

- Key state and Telegram update offsets are stored in PostgreSQL so restarts do not reset the key or replay processed commands.
- The bot uses the Telegram Bot API directly with `TELEGRAM_BOT_TOKEN` and long polling; an existing webhook must be removed before polling can work.
- The verification route fails closed rather than using a built-in default key.
- The supplied five-screen design archive is the source of truth for the web preview; do not replace it with a generic checker design.

## Product

The API checks access keys for the companion app. Authorized Telegram admins can retrieve the current key, generate a new six-character key, or set a custom 4–32 character alphanumeric key.

## User preferences

_No additional preferences recorded._

## Gotchas

- Configure `ADMIN_IDS` before using Telegram commands. If it is empty, Telegram polling stays disabled.
- The verification endpoint allows 10 attempts per IP per minute; the in-memory limiter resets when the process restarts.
- Cross-origin browser calls require setting `ALLOWED_ORIGIN`; same-origin and server-to-server calls do not.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
