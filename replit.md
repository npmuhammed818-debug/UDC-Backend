# UDC Backend

The initial UDC (UpDownCircle) backend provides a small Node.js API foundation for a future WhatsApp-based B2B trade platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/index.ts` — server entry point
- `artifacts/api-server/src/app.ts` — Express application setup
- `artifacts/api-server/src/routes/` — API route modules
- `artifacts/api-server/src/routes/health.ts` — current UDC test endpoint
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/api-client-react/` and `lib/api-zod/` — generated API clients and schemas
- `lib/db/` — reserved shared database package for future persistence

## Architecture decisions

- Express routes are grouped by domain so future WhatsApp, users, buyers, sellers, agents, and deals modules can be added independently.
- OpenAPI is the API contract source of truth; generated clients and schemas are refreshed with codegen.
- The server requires `PORT` from the runtime environment and is routed under `/api`.

## Product

The first increment is intentionally limited to a running API check. Future increments can add WhatsApp Cloud API integration, AI workflows, database persistence, and B2B trade entities without replacing the server foundation.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
- Verify the API through the routed path: `GET /api/healthz`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
