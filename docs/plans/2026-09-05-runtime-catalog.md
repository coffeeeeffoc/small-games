# Runtime Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement #16: launch a published cultivation snapshot through Runtime Catalog with fixed sessions and safe offline/corruption fallback.

**Architecture:** Runtime reads only its published projection and stores session snapshots and stable canary assignments. Shell requests a session, then uses the existing verified iframe/fallback loader. An anonymous read-only Artifact delivery route in the existing Management process serves only published snapshots, with signature/hash verification and strict CSP/CORS; S3 remains private and Runtime receives no S3 credentials.

**Tech Stack:** Existing TypeScript/Zod/Fastify/Drizzle, React, browser Host and iframe loaders.

---

The user-selected serial ticket workflow takes precedence over separate-worktree,
implementation-subagent and per-step commit handoffs. One coordinator writes and one
reviewed commit completes this ticket. Local `executing-plans` substitutes for unavailable
superpowers runners.

## Choices and invariants

- Reuse the existing Management S3 verifier for published byte delivery. A new asset
  service adds an unnecessary process; public S3 would expose unpromoted candidates and
  cannot supply the loader's required CSP without a gateway. The delivery base URL is
  configured separately so a CDN can replace this endpoint later.
- `gameVersion` remains the executable build version for compatible v1 handshakes.
  Add optional `publishedVersionId` to Game Session to pin the immutable content+Artifact
  snapshot from #15. Never feed a new snapshot's content to an older fallback executable.
- Runtime fixes Game, published version, build version, Channel, server-owned Ad Authority
  (`none` until managed policy #18), UUID session, locale and supported capabilities.
- Stable player IDs come from the Shell's local identity until player login #17.
  Canary assignment hashes player+Game and persists the chosen snapshot for the current
  stable/canary snapshot pair, so repeat sessions and percentage changes do not reshuffle it.
  Promotion or rollback starts a new epoch for new sessions; existing sessions remain fixed.
- Explicit pinned versions must already exist in Runtime and match the selected Game.
  Default stable and a bounded request timeout preserve local play when Runtime is absent.
- Runtime cannot read Management tables. Delivery never exposes drafts, private signing
  keys or S3 credentials; unpromoted Artifact IDs have no public delivery route.

## Task 1: Session/Catalog contracts and selection

Files: `packages/game-contract/src/schemas.ts`, `packages/release-contract/src/catalog.ts`,
`packages/release-contract/src/index.ts`, `services/runtime-api/src/catalog/store.ts`,
`infra/migrations/005-runtime-sessions.sql`, `services/runtime-api/tests/catalog.test.ts`.

1. Write schema/selection tests for fixed fields, unknown pins and canary repeatability.
2. Run `pnpm --filter @coffeeeeffoc/runtime-api test`; expect missing implementation failure.
3. Add strict DTOs and schema-local SQL reads. Session transaction chooses a Channel/pin,
   inserts or reads an epoch-scoped assignment, and inserts an immutable session context.
4. Verify repeated selection, rollback/promotion epochs and unchanged prior sessions.

## Task 2: Published HTTP and Artifact delivery

Files: `services/runtime-api/src/catalog/routes.ts`, Runtime app/exports;
`services/management-api/src/artifact-delivery.ts`, Management app/exports;
`services/management-api/tests/artifact-delivery.test.ts`.

1. Test unpromoted IDs, bad Origin, signature/resource damage and missing objects.
2. Expose Runtime Catalog and session routes with strict parsing, bounded responses and
   exact Shell Origin. Expose only the published remote-entry resource through the existing
   Artifact repository, with strict CSP, explicit CORS header exposure and no credentials.
3. Re-run both service suites; missing/corrupt Artifacts fail closed without executing code.

## Task 3: Shell sessions and fallback identity

Files: `apps/shell-web/src/runtime-client.ts`, `registry.ts`, `ShellApp.tsx`, `host.ts`,
`GameViewport.tsx`, `index.ts`; `packages/game-loader/src/iframe.ts`, `fallback.ts`;
Shell/loader tests.

1. Write actual React/loader integration tests for Catalog launch, pinning and offline
   local Catalog. Reuse existing fake iframe transport to check exact Host session/content.
2. Fetch Runtime Catalog on entry and request a fixed session on launch. Show Channel/pin
   controls and visible fallback status. Preserve the trusted built-in registry.
3. Carry published ID/content with each remote candidate and cached LKG. Target uses its
   Runtime session; fallback gets a new matching local session and its own content.
4. Distinguish remote artifacts by entry/integrity rather than build version alone; verify
   corrupted target rejection and LKG/built-in recovery with same build/different content.

## Task 4: Wiring, live checks and review

Files: `scripts/platform-config.mjs`, `scripts/platform.mjs`,
`scripts/catalog.integration.mjs`, `docs/architecture/runtime-catalog.md`.

1. Wire local Runtime and Artifact delivery URLs, Shell Origin and migration 005 without
   broadening S3 access. Keep absent configuration compatible with existing health tests.
2. Run live SQL/HTTP fixtures for published-only reads, session immutability, canary
   repeatability, explicit pins and byte delivery. Restrict fixtures/cleanup to owned IDs.
3. Run root formatting, boundaries, lint, types, unit/contract/integration, builds and smoke;
   then existing live platform/auth/release regressions and the new Catalog integration.
4. Read-only spec/standards review, fix findings, commit #16, comment and close. Refresh
   native dependencies before beginning another ticket.
