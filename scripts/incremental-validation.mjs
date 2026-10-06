import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { affectedPackages, isDocumentation, riskPlan } from './validation-plan.mjs';

const validationTool =
  /^(?:scripts\/(?:validate-(?:push(?:-hook)?|tree)|validation-plan|incremental-validation|validate-candidate|run-selected-(?:shell|browser)|ci-validation|rule-tasks|cocos-validation|workspace-bootstrap|pages-test-scope)(?:\.[^/]+)?\.mjs|\.githooks\/[^/]+)$/;
// Reviewed shared navigation contracts: exercise both home and immersive frame exits.
const navigationSamples = ['letters-words2', 'xiangqi-five'];
export function incrementalPlan({
  packages,
  games,
  changedPaths,
  readSource,
  fileScopes = new Map(),
}) {
  const paths = changedPaths.filter((file) => !isDocumentation(file));
  const unknown = paths.filter(
    (file) =>
      !packages.some((pkg) => file === pkg.dir || file.startsWith(pkg.dir + '/')) &&
      !validationTool.test(file) &&
      !fileScopes.has(file),
  );
  assert(
    !unknown.length,
    `Incremental scope undefined for: ${unknown.join(', ')}. Define affected consumers before publishing; no automatic full regression.`,
  );
  const registrationFiles = new Set([
    'apps/shell-web/src/standalone-games.json',
    'apps/shell-web/src/game-meta.json',
    'apps/shell-web/package.json',
    'pnpm-lock.yaml',
  ]);
  const unclassifiedRegistration = paths.filter(
    (file) => registrationFiles.has(file) && !fileScopes.has(file),
  );
  assert(
    !unclassifiedRegistration.length,
    `Incremental registration scope undefined for: ${unclassifiedRegistration.join(', ')}. Define a reviewed structural comparison before publishing.`,
  );
  const affected = affectedPackages(packages, paths);
  const directGames = games.filter((game) =>
    paths.some((file) => file === game.source || file.startsWith(game.source + '/')),
  );
  const shared = paths.some((file) => file.startsWith('packages/'));
  const registrations = new Set([...fileScopes.values()].flat());
  const selected = shared
    ? games.filter((game) => affected.some((pkg) => pkg.dir === game.source))
    : games.filter((game) => directGames.includes(game) || registrations.has(game.source));
  const ids = new Set();
  for (const game of selected) {
    const scope = { required: true, full: false, game_ids: [game.id], game_sources: [game.source] };
    const result = riskPlan({
      changedPaths: paths.filter((file) => file.startsWith(game.source + '/')),
      scope,
      readSource,
    });
    if (
      registrations.has(game.source) ||
      shared ||
      (result.risk !== 'rules' && result.risk !== 'metadata')
    )
      ids.add(game.id);
  }
  const shellChanged = paths.some(
    (file) => file.startsWith('apps/shell-web/') && !fileScopes.has(file),
  );
  if (shellChanged || paths.some((file) => validationTool.test(file)))
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  return {
    full: false,
    browser: ids.size > 0,
    browser_ids: [...ids].sort(),
    game_sources: selected.map((game) => game.source),
    validation_tools: paths.some((file) => validationTool.test(file)),
  };
}

// Literal per-game adapter data is wiring; edits to executable code retain shared
// navigation coverage. JSON parsing never executes candidate source.
export function entryAdapterFileScopes({ changedPaths, readBase, readHead, games }) {
  const file = 'apps/shell-web/scripts/standalone-game-entry.mjs';
  const scopes = new Map();
  if (!changedPaths.includes(file)) return scopes;
  try {
    const parse = (text) => {
      const data = {};
      const rest = text.replace(
        /export const (markers|homeControls|legacyEntryIds) = ([\s\S]*?);/g,
        (whole, name, literal) => {
          const json = literal
            .replace(/'([^'\\]*)'/g, (_, value) => JSON.stringify(value))
            .replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/,\s*([}\]])/g, '$1');
          data[name] = JSON.parse(json);
          return `export const ${name} = DATA;`;
        },
      );
      assert(Object.keys(data).length === 3 && Array.isArray(data.legacyEntryIds));
      return { data, rest };
    };
    const before = parse(readBase(file)),
      after = parse(readHead(file));
    if (before.rest !== after.rest) return scopes;
    const ids = new Set();
    for (const name of ['markers', 'homeControls'])
      for (const id of new Set([
        ...Object.keys(before.data[name]),
        ...Object.keys(after.data[name]),
      ]))
        if (!isDeepStrictEqual(before.data[name][id], after.data[name][id])) ids.add(id);
    for (const id of new Set([...before.data.legacyEntryIds, ...after.data.legacyEntryIds]))
      if (before.data.legacyEntryIds.includes(id) !== after.data.legacyEntryIds.includes(id))
        ids.add(id);
    if ([...ids].some((id) => !games.some((game) => game.id === id))) return scopes;
    scopes.set(
      file,
      games.filter((game) => ids.has(game.id)).map((game) => game.source),
    );
  } catch {
    // Unknown literal grammar stays a shared contract change.
  }
  return scopes;
}
