# Release Channels

Management publishes an immutable snapshot of a verified signed Artifact and normalized
saved content. Its SHA-256 ID is the published Game Version ID, distinct from the
Artifact's executable build version. Content-only releases therefore need no code rebuild.
Explicit version selection and rollback use this snapshot ID; executable loader handshakes
continue to use the Game Manifest build version.

Each Game has `development`, `canary` and `stable` pointers. Studio requires publisher
permission, a saved draft revision, a verified Artifact ID and explicit impact confirmation.
Rollback selects an existing snapshot and never updates or deletes Artifact bytes.
Both operations record the actor, previous/target pointers and confirmation in an
append-only audit table. Application roles cannot update/delete snapshots or audit rows.

Management locks the Channel and atomically writes the snapshot, outbox event and audit.
There can be only one pending transition per Channel; stale revisions conflict. The worker
delivers a versioned authenticated HTTP projection. Runtime validates the signed descriptor
against its configured public key, then commits its snapshot, pointer and event receipt in
one transaction. Identical event replays return the receipt; altered or stale events fail.
Management acknowledges its pointer only after receiving the matching receipt.

This is not a distributed atomic commit: if Runtime commits and the response is lost,
Runtime may temporarily be ahead of Management's acknowledged pointer. Replaying the same
event converges without duplicate versions. Before Runtime commit, delivery failures leave
both pointers unchanged. Failed acknowledgments remain visible in Studio and retry each
second. The single local worker attempts one row per tick, with a three-second HTTP timeout;
`FOR UPDATE SKIP LOCKED` also permits multiple service instances without duplicate claims.

## Configuration and verification

`pnpm artifact:build` exports the development signer's public key to ignored
`.scratch/artifact-signing/public-key.txt` after successful verification. The local runner
reads only that public file, never `local-key.json`. Restart services after the first build.
Without publication configuration, health/auth/draft routes still work and writes return 503.
Production must provide matching `ARTIFACT_TRUSTED_PUBLIC_KEY` (hex SPKI Ed25519) and
`RELEASE_PROJECTION_TOKEN` (at least 32 characters) to both services, and an HTTPS
`RUNTIME_PROJECTION_URL` to Management. Only loopback development URLs may use HTTP.
Keep the token server-only and restrict access to the internal Runtime endpoint.

Apply migration 004 with `pnpm infra:up`; run `node scripts/releases.integration.mjs`
after building services. It checks real SQL and HTTP failure/replay/rollback paths using
UUID-owned temporary snapshots and removes only its own fixtures. The Artifact build
gate covers all workspaces. Runtime Catalog/session selection is the next ticket (#16),
not part of this publication control-plane change.
