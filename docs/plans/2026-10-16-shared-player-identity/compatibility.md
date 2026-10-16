# Shared competition identity compatibility checkpoint

Date: 2026-10-16. Implementation checkpoint: local commit `151e6e49d1d35a14ca73cccca285e5e62da85461`, not yet published.
Fixed old source: `26756c80cfa4ddf9bda16269265e353fddeaeeaf`.

## Evidence and limits

`services/runtime-api/tests/competition-compatibility-fixture.mjs` extracts the exact old H5 client,
competition store, routes and their value-import closure using `git show`. It preserves source bytes,
transforms TypeScript with Node 24.21.0, and binds already installed dependencies. The generated
`.scratch/identity-compat/26756c80cfa4ddf9bda16269265e353fddeaeeaf/manifest.json` records every source
and loaded-source SHA-256 and actual dependency entry paths/hashes. Dependencies are current installed
Fastify 5.12.3, rate-limit 11.2.0, Drizzle 0.45.2 and Zod 4.1.5. This does not recreate the entire old
application build or old dependency installation.

The four combinations below passed actual old/candidate client code, actual old/candidate Runtime
routes and stores, Fastify HTTP injection, and an explicitly named in-memory SQL adapter. They are
wire-contract tests, not a PostgreSQL, natural game, official SDK or device acceptance result.

| H5 client | Runtime competition HTTP implementation | Base login, GET/update me, board, create/read room, same UUID after >1 day | Real PostgreSQL/HTTP              |
| --------- | --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Fixed old | Fixed old                               | Passed                                                                     | Passed with actual old client     |
| Fixed old | Candidate                               | Passed                                                                     | Passed with actual old client     |
| Candidate | Fixed old                               | Passed                                                                     | Passed with actual current client |
| Candidate | Candidate                               | Passed, including v2 refresh                                               | Passed with actual current client |

No actual old APK sample was tested: APK compatibility is **unknown**. Platform official code exchange
and SDK login remain unverified here; no mocked official exchange is described as real authentication.

## Lifetime and feature support

- Old guest bodies with no `identityVersion` retain 180-day access. Installation metadata does not
  select this protocol. Existing token rows keep their original expiry.
- Explicit `identityVersion: 2` receives one-day access plus a stable 180-day refresh secret. New H5
  code sends version 2 even when crypto or storage is unavailable. Refresh retains the UUID.
- Other version values and owner/identity claims fail strict input validation.
- The fixed old Runtime ignores the new guest-body version, so new clients receive the old 180-day
  credential and can use base APIs. It has no refresh/upgrade endpoints: HTTP 404 is expected and
  tested. Near expiry, a new client reports that unsupported renewal; it never silently creates a
  replacement guest. New identity features are **unsupported on the old service**.
- The fixed old client cannot refresh. The candidate's explicit legacy lifetime preserves its
  existing behavior beyond one day; it makes no new recovery promise after its 180-day expiry.

## Public data contract

Ranking rows have only `userId`, `playerId`, `nickname`, `name`, `avatarUrl`, coarse `region`,
`profileSource`, `profileUpdatedAt`, `score`, `secondary`, `rank`, `position`, `total`. Both UUID
aliases retain the original player UUID. `top`, `me`, `previous` and `threshold` are checked separately
using 102 isolated adapter rows so positions 100, 101 and 102 are populated.

Room players, their result, opponent result, and persisted `results[]` are rebuilt at read time.
`before` is a single ranking row; `after` is a finite ranking wrapper, including its four row slots and
numeric gap. Results retain boolean `finished`/`eligible`, numeric `score`/`secondary`, and letters'
numeric `correct`/`accuracy`/`assisted`. Current room-rule files are unchanged from the fixed revision;
those are the only three room-result extensions. Optional old fields remain optional.

Canaries cover subject/openid, app ID, bearer, IP, precise coordinates and internal associations for
anonymous/self/other board projections and both room members; an outsider is rejected. The completed
room is an intentionally persisted fixture, not a naturally played match. Subject and credentials
never enter the public DTO. Game `rule.view()` still owns raw gameplay state. Three-choose-two's public
provider field and the separate Carrom game state were not changed by this serializer fix.

Negative contracts reject deleted fields, changed primitive types, changed status/error codes and
extra persisted canary keys. Nickname, avatar and coarse-region trust-boundary tests remain active.

## Commands and current results

Latest complete Runtime run: **183 passed, 0 failed, 0 skipped**, 27 files,
real PostgreSQL, `--maxWorkers=1 --testTimeout=30000`. This supersedes the earlier
no-database/skipped checkpoint below. Fixture cleanup uses the existing owner;
real browser Runtime still needs the application-role acceptance.

- Runtime `typecheck`: passed.
- Runtime `lint --max-warnings 0`: passed.
- Initial no-database Runtime `vitest run --maxWorkers=1`: **162 passed, 18 skipped**.
- Real PostgreSQL suite: **180 unique tests passed across the full run and two targeted reruns**, all 18 database cases executed. Two initial 5s timeouts needed 30s targeted reruns; a TCT fixture renewed all three expired platform credentials using the same verified tuples. Assertions were retained.
- Damaged ranking-cache regression and identity/compatibility unit targets: **44 passed** after strict UUID/finite-number serialization. Both related PG files then passed 7 tests; the expanded real-client four-way PG test passed again.
- Publication scope, incremental planner, tree validator and H5 matrix contracts: **135 passed**. Temporary dependency-free fixtures use the system temporary directory, outside the repository's node_modules ancestor path.
- Node client/gateway/identity/game-services tests: **54 passed**.

The first lint attempt caught an unused test-only disable and was fixed. An initial Vitest attempt
hit a Windows sandbox temporary-cache ENOENT; rerunning with the normal writable TEMP/TMP and one
worker completed. These are the final results, not claims that every intermediate run passed.

The initial automatic-approval rejection was resolved after the parent supplied
the exact original user's authorization for local/API tests. One same-action
review approved starting the existing owned container; it was not replaced.
The new gated `competition-compatibility.integration.test.mjs` uses genuine fixed old store/routes
against the expanded schema, loopback HTTP, old INSERT/read/write, cross-version profile/room
ownership and isolated leaderboard writes. It **passed against real PostgreSQL**,
as did identity concurrency, upgrade/refresh ordering and TOCTOU cases. This is
now includes the four-way actual old/current H5-client × old/current Runtime
matrix over real loopback HTTP and PG. Fixture
seeding/cleanup used the existing local owner; actual browser Runtime must still
be tested with `runtime_app`. Migration 013 was applied twice to the existing
`competition_test` database; original rows, owners and ACLs were unchanged.
See `local-postgres-migration.json` and `local-postgres-tests.json`. No production
data changes or deployment happened.
Migration 013 now grants only SELECT/INSERT/DELETE on its new refresh table; its
reviewed checksum is `807825e0f99eb41b0ad97c0b1a7a2a98d5cbf1ad0d9d7406e08c2ed557c0978f`.
It does not change any original table owner/ACL. No cleanup privilege is added by these tests.

The compatibility fixture and tests belong to the existing Runtime package scope.
A publication-plan regression locks them to Runtime's complete rule tests without
selecting unrelated game browsers; unknown repository-level siblings remain blocked.
