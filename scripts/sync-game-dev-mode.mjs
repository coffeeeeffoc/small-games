import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const normalize = (text) => text.replaceAll('\r\n', '\n');
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Discover actual game directories, including games not yet registered in the Shell. */
export async function devModeTargets(root = ROOT) {
  const targets = [
    { source: 'apps/shell-web', runtime: 'dev-mode.js', entry: 'index.html', vite: true },
  ];
  for (const parent of ['games/local', 'games/submodules']) {
    for (const dir of await readdir(path.join(root, parent), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const source = `${parent}/${dir.name}`;
      if (!(await exists(path.join(root, source, 'package.json')))) continue;
      const pkg = JSON.parse(await readFile(path.join(root, source, 'package.json'), 'utf8'));
      const vite = /\bvite\s+build\b/.test(pkg.scripts?.build ?? '');
      const generated = /\bnode scripts\/build\.mjs web-mobile\b/.test(pkg.scripts?.build ?? '');
      const entry = (await exists(path.join(root, source, 'index.html')))
        ? 'index.html'
        : 'static-site/index.html';
      targets.push({
        source,
        runtime: generated ? 'scripts/dev-mode.js' : entry.replace('index.html', 'dev-mode.js'),
        entry: generated ? null : entry,
        vite,
        build: pkg.scripts?.build,
      });
    }
  }
  return targets;
}

export async function syncGameDevMode({ root = ROOT, check = false } = {}) {
  const errors = [];
  const targets = await devModeTargets(root);
  for (const target of targets) {
    for (const name of ['dev-mode.js', 'dev-mode.d.ts']) {
      const source = normalize(await readFile(path.join(root, 'platforms/h5', name), 'utf8'));
      const destination = path.join(
        root,
        target.source,
        target.runtime.replace('dev-mode.js', name),
      );
      if (check) {
        if (
          !(await exists(destination)) ||
          normalize(await readFile(destination, 'utf8')) !== source
        )
          errors.push(`${target.source}: ${name} 缺失或不同步；运行 pnpm sync:dev-mode。`);
      } else {
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }
    }
    // Source checks also cover the independent build, rather than only patched Shell copies.
    if (check) {
      if (target.entry) {
        const file = path.join(root, target.source, target.entry);
        const html = (await exists(file)) ? await readFile(file, 'utf8') : '';
        if (!/<script\b[^>]*\bsrc=["']\.\/dev-mode\.js["'][^>]*><\/script>/.test(html))
          errors.push(`${target.source}: 网页入口未加载 ./dev-mode.js。`);
      }
      if (!target.vite && target.build) {
        const build = target.build.match(/\bnode\s+(\S+)/)?.[1];
        const content =
          build && (await exists(path.join(root, target.source, build)))
            ? await readFile(path.join(root, target.source, build), 'utf8')
            : '';
        if (!content.includes('dev-mode.js'))
          errors.push(`${target.source}: 独立构建未复制 dev-mode.js。`);
      }
    }
  }
  return { games: targets.length - 1, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await syncGameDevMode({ check: process.argv.includes('--check') });
  for (const error of result.errors) console.error(error);
  console.log(
    `Developer mode: ${result.games} games ${process.argv.includes('--check') ? 'checked' : 'synced'}, ${result.errors.length} issues.`,
  );
  if (result.errors.length) process.exitCode = 1;
}
