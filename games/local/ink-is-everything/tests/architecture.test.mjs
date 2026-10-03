import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const layers = ['core', 'content', 'render', 'ui'];

async function modulesIn(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const relative = path.posix.join(directory, entry.name);
      return entry.isDirectory()
        ? modulesIn(relative)
        : entry.name.endsWith('.mjs')
          ? [relative]
          : [];
    }),
  );
  return nested.flat();
}

async function runtimeGraph() {
  const files = [
    'game.mjs',
    'engine.mjs',
    'art.mjs',
    'levels.mjs',
    ...(await Promise.all(layers.map(modulesIn))).flat(),
  ];
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    const imports = [
      ...source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g),
    ];
    const dependencies = imports.map((match) => {
      assert.ok(
        match[1].startsWith('.'),
        `${file}: browser runtime import must be relative: ${match[1]}`,
      );
      return path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    });
    graph.set(file, dependencies);
  }
  return graph;
}

test('runtime imports resolve and preserve the core, content and renderer boundaries', async () => {
  const graph = await runtimeGraph();
  for (const [file, dependencies] of graph) {
    const layer = file.split('/')[0];
    for (const dependency of dependencies) {
      assert.ok(graph.has(dependency), `${file}: missing runtime module ${dependency}`);
      if (['core', 'content', 'render'].includes(layer)) {
        assert.ok(
          dependency.startsWith(`${layer}/`),
          `${file}: ${layer} must remain independent of ${dependency}; pass data through the public API`,
        );
      }
    }
  }
});

test('runtime modules have no circular imports', async () => {
  const graph = await runtimeGraph();
  const checked = new Set();
  function visit(file, ancestors = []) {
    assert.ok(!ancestors.includes(file), `Circular import: ${[...ancestors, file].join(' → ')}`);
    if (checked.has(file)) return;
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...ancestors, file]);
    checked.add(file);
  }
  for (const file of graph.keys()) visit(file);
});
