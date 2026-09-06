const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function parse(source: string) {
  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch {
    throw new Error('DEPENDENCY_CHANGE_REJECTED');
  }
}

function dependencies(manifest: Record<string, unknown>): Map<string, string> {
  return new Map(
    dependencyFields.flatMap((field) => {
      const value = manifest[field];
      return value && typeof value === 'object'
        ? Object.entries(value).map(
            ([name, version]) => [`${field}:${name}`, String(version)] as const,
          )
        : [];
    }),
  );
}

function withoutDependencies(manifest: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(manifest).filter(([field]) => !dependencyFields.includes(field)),
  );
}

export function checkPackageManifest(
  mode: 'create' | 'modify',
  allowedDependencies: string[],
  previousSource: string | undefined,
  nextSource: string,
) {
  const previous = previousSource === undefined ? undefined : parse(previousSource);
  if (mode === 'modify' && !previous) throw new Error('DEPENDENCY_CHANGE_REJECTED');
  const next = parse(nextSource);
  if (
    previous &&
    JSON.stringify(withoutDependencies(previous)) !== JSON.stringify(withoutDependencies(next))
  )
    throw new Error('PACKAGE_JSON_CHANGE_REJECTED');

  const before = previous ? dependencies(previous) : new Map<string, string>();
  const after = dependencies(next);
  const changed = new Set([...before.keys(), ...after.keys()]);
  const allowed = new Set(allowedDependencies);
  if (
    [...changed].some(
      (entry) =>
        before.get(entry) !== after.get(entry) && !allowed.has(entry.slice(entry.indexOf(':') + 1)),
    )
  )
    throw new Error('DEPENDENCY_NOT_ALLOWED');
}
