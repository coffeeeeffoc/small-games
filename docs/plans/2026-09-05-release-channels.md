# Release Channels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement #15: immutable published snapshots, transactional outbox delivery, confirmed Channel changes and rollback.

**Architecture:** Management commits an immutable Game Version snapshot, publication request and audit entry in one transaction. Runtime consumes a versioned authenticated HTTP projection in its own transaction; Management moves its acknowledged pointer only after a matching receipt. Failed delivery retains the pending request and old acknowledged pointer; retries reuse the event identity.

**Tech Stack:** TypeScript, Zod, Fastify, Drizzle/PostgreSQL, existing signed Artifact verifier, React/TanStack Query.

---

Execution follows the user-selected `implement-all-issue-tickets` workflow: one
coordinator/checkout, read-only dual review, and one verified commit for this ticket.
The unavailable superpowers runner is replaced by the local executing-plans steps;
no implementation delegation or additional worktree is created.

## Transaction and identity invariants

- Game Version snapshot ID hashes the signed Artifact address and normalized content.
  It is distinct from the executable build version in the Artifact's Game Manifest;
  this allows content-only releases without recompiling code. Explicit pin/rollback
  selects the snapshot ID, never mutable draft state.
- At most one unacknowledged event exists per Game/Channel. Enqueue checks the last
  observed Channel revision; the browser must re-read after a conflict.
- Runtime commits the immutable snapshot, deduplication receipt and Channel pointer
  atomically. Replayed identical events return the same receipt; altered replays fail.
- A lost HTTP response after Runtime commit is an uncertain acknowledgment, not an
  uncommitted projection. Retrying converges without duplicate versions or pointer drift.
- Service credentials remain schema-scoped. Only a shared wire schema crosses
  services; HTTP adapters carry a server-only token. Production uses TLS.
- Publishing verifies the stored Artifact signature/resources and Game-owned content
  schema before entering the transaction. No private signing key enters either service.

## Task 1: Versioned release transport

Files: create `packages/release-contract/src/index.ts`, `model.ts`, package/config
files and `tests/release.test.ts`.

1. Write schema vectors for channels, envelope/Artifact identity, revisions and receipts.
2. Run `pnpm --filter @coffeeeeffoc/release-contract test`; expect missing-module failure.
3. Implement strict format-v1 DTOs and deterministic snapshot hashing using existing
   `canonicalBytes`/`sha256`. Require envelope Game/schema compatibility with the signed
   descriptor and a request UUID for replay handling.
4. Re-run tests/typecheck; every invalid vector rejects and equal inputs produce equal IDs.

Core expected assertions:

```ts
expect(first.id).toBe(retry.id);
expect(projectionSchema.safeParse({ ...event, formatVersion: 2 }).success).toBe(false);
```

## Task 2: Runtime projection transaction

Files: create `infra/migrations/004-release-channels.sql`,
`services/runtime-api/src/releases/store.ts`, `routes.ts`, and `tests/releases.test.ts`;
modify Runtime app/public exports and dependency manifest.

1. Write replay, altered replay, stale generation, authentication and rollback vectors.
2. Run the focused tests; expect missing implementation failure.
3. In one Runtime transaction, lock the Channel, compare its revision, insert immutable
   snapshot and event receipt, then update the pointer. Return the stored receipt on
   identical replay. Verify the descriptor using the configured public key first.
4. Verify that a rejected operation leaves both pointer and event count unchanged.

## Task 3: Management publication and outbox

Files: create `services/management-api/src/releases/model.ts`, `store.ts`, `routes.ts`,
`projection.ts`, `worker.ts`, and `tests/releases.test.ts`; modify app/auth/public exports.

1. Write tests for creator-only rejection, publisher grant, draft revision conflict,
   failed delivery, successful retry, lost acknowledgment and immutable rollback.
2. Run the focused tests and confirm the new paths fail before implementation.
3. Enqueue under a Channel row lock. Atomically insert the snapshot, outbox event and
   audit. Use the input request UUID plus request hash for HTTP retries.
4. Process one pending row with `FOR UPDATE SKIP LOCKED`, bounded HTTP delivery and
   a matching receipt check. On failure update attempt/error metadata only. On success
   atomically acknowledge the pointer and event. Worker shutdown aborts in-flight I/O.
5. Re-run focused tests; verify old pointer on pre-commit failure and convergence after
   a lost response. Application roles have no update/delete grants on snapshots/audits.

## Task 4: Studio confirmation and status

Files: create `apps/studio-web/src/release-client.ts`, `release-panel.tsx`,
`tests/releases.test.tsx`; modify workspace view and styles.

1. Write actual React tests for selecting a saved draft/Artifact/Channel, confirming
   stable changes, cancelling, showing delivery status and rolling back to an existing ID.
2. Run the focused test and verify missing UI failure.
3. Render current versus target snapshot, draft revision, Artifact identity and Channel
   before explicit confirmation. Preserve request identity during retry and local input
   on errors. Re-read state after successful projection or optimistic conflict.
4. Verify cancellation sends no write and non-publishers have no publishing controls.

## Task 5: Local wiring and fault verification

Files: modify `scripts/platform-config.mjs`, `scripts/platform.mjs`,
`scripts/build-artifact.mjs`; create `scripts/releases.integration.mjs` and
`docs/architecture/release-channels.md`.

1. Export only the local signer's public key to a separate ignored file after a verified
   build. Local runners load that public file or an explicit environment override.
2. Apply the new migration through the existing idempotent bootstrap. Register an
   authenticated projection route and bounded outbox worker in normal service startup.
3. Run real SQL/HTTP fixtures: enqueue, failure before apply, retry, duplicate delivery,
   rollback and permission-denied attempts to mutate immutable data. Remove only the
   uniquely owned test fixtures using owner credentials in cleanup.
4. Run root format, boundaries, lint, typecheck, unit/contract/integration, build and smoke
   with bounded concurrency; run the live platform regression scripts.
5. Obtain clean spec/standards review, commit scoped changes, comment verification on #15
   and close it. Refresh the native dependency frontier only after closure.
