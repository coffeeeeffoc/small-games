# Runtime Catalog and fixed sessions

Runtime reads only `runtime.release_channels` and immutable `runtime.game_versions`.
The Catalog returns compact Channel/version/Manifest metadata; published content is returned
with a newly created session. Drafts and operator credentials never enter either response.

`POST /api/runtime/sessions` fixes Game ID, executable build version, published snapshot ID,
requested Channel, UUID session ID, locale and required capabilities. Web Ad Authority is
server-owned `none` until Managed Ad policy is enabled (#18); clients cannot choose it.
The Host freezes the context and capabilities before exposing them to a Game. The optional
`publishedVersionId` extends v1 without changing the executable-version handshake.

An explicit snapshot ID takes priority over Channel selection, but must exist in Runtime
and belong to the requested Game. Capability mismatch or unavailable versions reject.
Canary hashes the stable guest player UUID and Game ID into 100 buckets (default 10%).
The first selected snapshot is retained in `runtime.canary_assignments` for the current
stable/canary snapshot pair, even if the percentage changes. Promotion or rollback
starts a new epoch for new sessions. This identity is local guest identity, not player authentication; cloud
save login is separate work in #17. Existing session rows are never mutated by publication.

## Delivery and fallback

S3 stays private. The existing Management process serves a read-only
`/published/:publishedVersionId/remote-entry.js` endpoint, only for acknowledged published
snapshots (including historical ones). It verifies the stored signature and all resource
hashes before serving the remote entry. Exact Shell Origin CORS, exposed strict CSP and
`nosniff` are set; no cookie is required or sent. Runtime has no S3 credential.
`ARTIFACT_DELIVERY_URL` permits moving this read-only endpoint behind a CDN later.

The Shell fetches Catalog/session with a two-second timeout and no credentials. Remote
bytes still pass the existing independent-origin, CSP, SHA-256 and opaque iframe handshake
checks. Target, cached last-known-good and built-in remain the finite fallback order.
Each remote candidate carries its own published ID/content; fallback creates a fresh
matching session and never reuses the target's content or server session ID. If Runtime
is unavailable, local default Catalog and storage keep the Game playable.

There may be a short window after Runtime projection commits but before Management
acknowledges it: Catalog can select the new snapshot while delivery still rejects it.
The existing fallback applies; outbox retry makes delivery available after acknowledgment.

## Local configuration and tests

Use `http://localhost:5173` for the Web Shell, matching the default embedded iframe Origin.
Local runners set `SHELL_ORIGIN`, Runtime `ARTIFACT_DELIVERY_URL` and the existing public-key
configuration. `VITE_RUNTIME_URL` overrides the Shell Runtime address. If changing Shell
Origin, also rebuild the Artifact with matching `VITE_SHELL_ORIGIN` and set `SHELL_ORIGIN`
for the services. Use HTTPS for non-loopback delivery. `CANARY_PERCENT` accepts 0–100.

`pnpm infra:up` applies migration 005. After the normal build, run
`node scripts/catalog.integration.mjs [gated-artifact-id]`. Without an ID it runs the full
Artifact build gate first. The test creates and drops only a UUID-named isolated database,
uses real publication/outbox/Runtime routes, and launches the actual iframe Game in a
headless browser. It needs free port 5173 and Chromium (Windows defaults to installed Edge;
override `PLAYWRIGHT_EXECUTABLE_PATH` if needed). It covers explicit pins, sticky canary,
session immutability, response corruption fallback and Runtime-offline local startup.
S3 bytes, existing databases and user publication pointers remain untouched.
