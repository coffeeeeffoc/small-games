# Immutable Game Artifacts

With local infrastructure running (`pnpm infra:up`), run `pnpm artifact:build`.
It checks repository formatting, package boundaries and their tests, process-secret
tests, and every workspace's lint, types, unit/contract/integration tests, build and
smoke gates before signing or uploading anything. Tasks use two concurrent workers
to keep memory bounded on local Windows machines. HTML uses
relative asset URLs. The Artifact includes the HTML, its JS/CSS resources, and
the self-contained `remote-entry.js` used by the existing Web iframe loader.
It does not publish a Game Version or move a Release Channel.

The final JSON line reports the Artifact address, Game Version, signing key ID,
trusted public key and resource count. The same bytes and key yield the same
address/signature on repeated builds. Source changes, build-time environment
changes or signing-key rotation produce a different address.

## Signing and trust

The manifest is strict format version 1. It binds the Game Manifest (Game Contract
version, content schema version, capabilities and load modes), the iframe entry,
every resource path/size/SHA-256, and the signing key ID. Object keys are
`artifacts/<SHA-256 of canonical manifest>/<resource path>`. `manifest.json` contains
the manifest, address and Ed25519 signature. Object keys are sorted for canonical
JSON; resource descriptors are sorted by path. No timestamps affect reproducibility.

The first local build creates `.scratch/artifact-signing/local-key.json` using an
exclusive write; later builds reuse it. This ignored development-only file contains
a private key: do not commit, upload or share it. Unix creation mode is 0600;
Windows uses inherited directory ACLs, which the operator must restrict to their
account. Production must supply a protected signer instead of this local file:
`ARTIFACT_SIGNING_PRIVATE_KEY` is hex PKCS8 and `ARTIFACT_TRUSTED_PUBLIC_KEY` is
hex SPKI. Both are required together. Private-key environment material is removed
before child processes start, and never printed. The public key is safe to distribute.

Readers obtain their trusted public key through deployment configuration, not from
an untrusted Artifact. `readArtifact` verifies the requested address, compatible
manifest and configured Ed25519 signer before loading resources; it verifies every
resource size/hash before returning any executable bytes. Unsupported algorithms,
Game Contract versions, missing entries, duplicate paths and traversal are rejected.
An unverified descriptor is never sufficient authority to run code.

## Storage and delivery

Management's S3 adapter uses `If-None-Match: *`. An existing object is accepted only
after byte comparison proves equality. Different bytes are rejected, with no
unconditional retry. An uncertain write response (including MinIO closing the
socket for an existing key) is resolved only by reading and comparing existing
bytes; a failed read remains a failure. Unsupported conditional writes and storage failures fail
closed. All resources are written before the signed manifest completion marker.
A failed upload can leave unreferenced resources but no usable completed Artifact;
retrying is safe. The ordinary mutable `put` method rejects the Artifact prefix.
Reads are streamed with a 20 MiB per-object limit; total signed size is limited to
100 MiB. Application-level immutability assumes storage credentials remain trusted:
production IAM should deny deletion and enforce conditional writes for this prefix.
Local MinIO root credentials are development-only, not a production security policy.

`createArtifactRepository` supplies Management with commit/read operations; the
shared verifier is usable by delivery/browser adapters. Delivery must configure an
independent Artifact origin, the existing loader's strict CSP, and the trusted key.
Select `remote-entry.js` from the verified bytes and use its SHA-256 as the iframe
loader integrity. Do not replace the existing iframe sandbox with direct execution
of uploaded HTML. Runtime Catalog publication and delivery wiring follow in #15/#16.

## Verification

`pnpm test:platform` runs the real build command twice and checks equal addresses,
MinIO write idempotence, overwrite rejection, complete verified reads, simulated
tampered/missing delivery and unavailable object storage. Successful local Artifacts
are retained; no automatic destructive cleanup runs. Unit tests cover interrupted
uploads, retries, incompatible metadata, path attacks, wrong keys and signatures.

References: [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[enforcing conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html),
[Node Web Crypto](https://nodejs.org/api/webcrypto.html).
