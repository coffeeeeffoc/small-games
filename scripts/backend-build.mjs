import { workspacePackages } from './validation-plan.mjs';

export const backendPackages = {
  management: '@coffeeeeffoc/management-api',
  runtime: '@coffeeeeffoc/runtime-api',
  kart: '@coffeeeeffoc/kart-server',
  tianxia: '@coffeeeeffoc/tianxia-server',
};
const emitted = (value) =>
  typeof value === 'string'
    ? /^\.\/(?:dist|lib|build)(?:-|\/)/.test(value)
    : value && typeof value === 'object' && Object.values(value).some(emitted);

export async function selectedBackendBuildCommands(services, root) {
  if (!services.length || services.some((name) => !Object.hasOwn(backendPackages, name)))
    throw new Error('BACKEND_SELECTION');
  const packages = await workspacePackages(root),
    byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const visited = new Set(),
    commands = [];
  const visit = (name, entry = false) => {
    if (visited.has(name)) return;
    visited.add(name);
    const pkg = byName.get(name);
    if (!pkg) throw new Error('BACKEND_PACKAGE');
    for (const [dependency, version] of Object.entries(pkg.dependencies ?? {}))
      if (version.startsWith('workspace:')) visit(dependency);
    if (!pkg.scripts?.build || (!entry && !emitted(pkg.exports))) return;
    commands.push(
      pkg.dir === 'games/local/game-cultivation'
        ? ['--filter', name, 'exec', 'tsc', '-p', 'tsconfig.content.json']
        : ['--filter', name, 'build'],
    );
  };
  for (const name of services) visit(backendPackages[name], true);
  return commands;
}
