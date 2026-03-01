# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

OneClaw is a pnpm + Turborepo monorepo with three runtime components:

| Service | Stack | Port | Dev command |
|---------|-------|------|-------------|
| **API** (`apps/api`) | TypeScript/Hono | 3000 | `pnpm --filter @oneclaw/api dev` |
| **Harness** (`packages/harness`) | TypeScript/Hono | 9000 | `pnpm --filter @oneclaw/harness dev` |
| **OneClaw Node** (`oneclaw-node/`) | Rust/Axum | 8787 | `cd oneclaw-node && cargo run -- daemon` |

Both TypeScript services use `tsx watch` for hot-reloading in dev mode.

### Running services

- API and Harness run without external service credentials; they warn and continue without Supabase/Stripe/etc.
- Create a minimal `.env.local` at repo root with `NODE_ENV=development` and desired port settings. See `.env.example` for all available keys.
- Start API: `pnpm --filter @oneclaw/api dev`
- Start Harness: `pnpm --filter @oneclaw/harness dev`
- Build all TS packages: `pnpm build` (harness DTS fails — see Known issues)

### Known pre-existing issues

1. **Harness DTS build fails**: Duplicate `Job` type exported from both `execution/runner` and `database/schema` in `packages/harness/src/index.ts`. CJS/ESM outputs build fine; only `.d.ts` generation fails. Dev mode (`tsx watch`) is unaffected.
2. **Rust build fails**: Type mismatch in `oneclaw-node/src/daemon.rs:265` — `is_complex_request` expects `&[serde_json::Value]` but gets `&Vec<ToolCallResult>`. Requires `libssl-dev` system package for OpenSSL.
3. **ESLint**: No `.eslintrc` configuration exists. `pnpm lint` fails with "No files matching pattern src/" because ESLint defaults to `.js` without config.
4. **Tests**: No test files exist in any package. `pnpm test` exits immediately.

### System dependencies

- `libssl-dev` and `pkg-config` are required for building the Rust binary (`openssl-sys` crate).

### Useful endpoints for testing

- `GET /` and `GET /health` on both services
- `GET /api/v1/status` (API) — shows which external services are configured
- `GET /tools` (Harness) — lists all 10 registered tools
- `POST /execute` (Harness) — execute workflow; use `"dryRun": true` for testing without external APIs
- `GET /api/v1/workflows` (API) — lists available workflows with pricing
