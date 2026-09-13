# Game directory integration implementation plan

**Goal:** Consolidate 19 games under `games/local/` and `games/submodules/`, preserving the history and behavior of the existing eight games.

**Architecture:** Git ownership determines the source directory. Existing Game Host packages keep their names and IDs; standalone HTML games retain the Shell's static iframe delivery and `/games/<id>/` URLs. The existing standalone catalog supplies source paths to the build script.

**Tech Stack:** Git submodules, pnpm workspace, Turborepo, Node.js, Vite, Playwright.

## 1. Establish the baseline

- Check the clean parent worktree and the four initialized submodules.
- Run the existing eight games, Shell and Workspace Agent tests before moving files.

## 2. Move the existing eight games

- Use `git mv apps/game-<name> games/local/game-<name>` for all four built-in games.
- Use `git mv games/<name> games/submodules/<name>` for all four submodules; keep their recorded commits.
- Update `pnpm-workspace.yaml`, root scripts and lockfile, standalone source paths, dependency discovery and formatter exclusions.
- Update Workspace Agent discovery, safe source paths, Source Extension paths and their existing tests.
- Update executable scripts and current documentation that reference the old directories; retain historical plan documents.

## 3. Verify the migrated eight before importing more

- Run dependency boundary checks, game/Agent/Shell tests, affected typecheck/lint and Pages build.
- Run actual embedded/direct game interactions and built-in game smoke checks.
- Confirm Git detects renames and all four submodule commits are unchanged.

## 4. Import the eleven standalone games

- Copy source, assets, tests and documentation into `games/local/`; exclude dependencies, caches, build output and generated test artifacts. Keep original sibling directories intact during verification.
- Reuse each game's build/test scripts. Add minimal static-copy builds to `letters-words`, `letters-words2` and `travel`.
- Add the eleven entries to the existing standalone catalog and Shell workspace dependencies; regenerate the root lockfile.
- Extend the existing Pages interaction checks to all 19 games, including direct URLs and return navigation.

## 5. Final validation and documentation

- Run all game tests, relevant platform checks, Pages build and browser interactions under `/small-games/`.
- Verify mobile viewports, relative asset URLs and packaged web assets.
- Update `docs/standalone-games.md` and ADR-0009 with the directory rules, commands, integration boundaries and measured validation results.
- Record any pre-existing failures separately from migration regressions. Do not claim physical-device or remote deployment validation.
