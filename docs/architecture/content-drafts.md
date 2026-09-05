# Cultivation Dynamic Content drafts

Run `pnpm infra:up` to apply the idempotent Management draft migration, then start
`pnpm dev:platform` and `pnpm --filter @coffeeeeffoc/studio-web dev`. Sign in with a
creator account initialized using [Studio authentication](studio-authentication.md).

The workspace can create, select, read, edit, validate and save named cultivation
drafts. The JSON editor contains the public envelope (`gameId`, `schemaVersion`,
`revision`, `payload`). Validation errors include full field paths. Invalid edits
stay in the editor and cannot be saved or previewed. A failed save leaves the local
buffer intact. A conflict requires explicitly re-reading and merging; copying the
local JSON first preserves edits. Switching drafts asks before discarding edits.
Closing or reloading the page discards unsaved edits; no player storage is used.

Game Version 1.1.0 owns schema v2 and its v1 migration; its built-in integrity
identity is `builtin:cultivation@1.1.0`, distinct from 1.0.0. v2 makes the previously fixed title
editable. Old v1 documents are validated before adding that title. Both the Web
and native Canvas Game entries normalize old content, without changing game rules
or mutating the source document. Unsupported future versions are rejected.
The Game's public `./content` entry and common envelope package emit Node-compatible
JavaScript and declarations so Management and Studio use the same implementation.
Turbo builds these public dependencies before consumers.

Management owns `management.content_drafts`; Runtime has no grants on that table.
Every endpoint below requires an authenticated `creator` role, and writes require
the configured exact Studio Origin. An `admin` role alone is not a creator grant.

| Endpoint                    | Behavior                                                                |
| --------------------------- | ----------------------------------------------------------------------- |
| `GET /api/drafts/`          | List current drafts                                                     |
| `POST /api/drafts/`         | Create from defaults with `{name}` and revision 0                       |
| `GET /api/drafts/:id`       | Read a draft; 404 if absent                                             |
| `POST /api/drafts/validate` | Validate/migrate an envelope without persistence; 422 with field errors |
| `PUT /api/drafts/:id`       | Save `{name, revision, envelope}` using the last read revision          |

Saving uses one conditional SQL UPDATE against the expected revision. Exactly one
concurrent writer succeeds; a stale or removed draft returns 409 without overwrite.
The server increments both draft and envelope revision together, ignoring the edited
envelope revision. The migration and save do not write release pointers or published
content. Publishing is separate future work.

Preview explicitly snapshots the current editor content, even before saving. It
mounts the actual bundled Game entry with a fresh in-memory Game Host, a unique
preview session, content/storage capabilities only, and `adAuthority: none`. Game
progress is discarded on close or replacement; previews never use localStorage,
Runtime saves, real ads or player navigation. Source code is trusted built-in code;
this is not a sandbox for arbitrary uploaded executable code. No publication or
recompilation is needed to preview a new draft.

Focused verification: Game migration/contract tests; Management authenticated API
tests; Studio editor/actual Game isolation tests. `pnpm test:platform` additionally
tests real PostgreSQL persistence and concurrent HTTP writes, with uniquely named
temporary drafts/accounts removed afterward.
