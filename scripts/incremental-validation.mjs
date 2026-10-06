import assert from 'node:assert/strict';
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
