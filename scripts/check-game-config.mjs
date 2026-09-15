import { readFile, readdir, stat, lstat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { runCommand } from './platform-process.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAME_ROOTS = ['games/local', 'games/submodules'];
const normalize = (value) => value.replaceAll('\\', '/');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
};
const safePath = (value) =>
  typeof value === 'string' &&
  /^[\w.-]+(?:\/[\w.-]+)*$/.test(value) &&
  !value.split('/').some((part) => part === '.' || part === '..');
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const disabled = (value) =>
  value === false || /^(?:false|\$\{\{\s*false\s*\}\})$/.test(String(value));
const commands = (workflow) =>
  Object.values(workflow?.jobs || {})
    .flatMap((job) =>
      disabled(job.if)
        ? []
        : (job.steps || []).filter((step) => !disabled(step.if)).map((step) => step.run || ''),
    )
    .join('\n')
    .replace(/^\s*#.*$/gm, '');

/** Discover from disk first, so an unregistered game cannot disappear from the audit. */
export async function auditGameConfig(root = ROOT, { artifacts = false } = {}) {
  root = path.resolve(root);
  const errors = [],
    warnings = [],
    games = [];
  const fail = (code, location, message) => errors.push({ code, path: location, message });
  async function read(location, format = 'text') {
    try {
      const value = await readFile(path.join(root, location), 'utf8');
      return format === 'json' ? JSON.parse(value) : format === 'yaml' ? yaml.load(value) : value;
    } catch (error) {
      fail(
        'invalid-config',
        location,
        error.code === 'ENOENT' ? '文件不存在' : `无法读取配置：${error.message}`,
      );
      return format === 'text' ? '' : {};
    }
  }
  const [workspace, lock, shell, manifest, registry, smoke, turbo, rootPackage] = await Promise.all(
    [
      read('pnpm-workspace.yaml', 'yaml'),
      read('pnpm-lock.yaml', 'yaml'),
      read('apps/shell-web/package.json', 'json'),
      read('apps/shell-web/src/standalone-games.json', 'json'),
      read('apps/shell-web/src/registry.ts'),
      read('apps/shell-web/scripts/standalone-game-checks.mjs'),
      read('turbo.json', 'json'),
      read('package.json', 'json'),
    ],
  );
  const catalog = Array.isArray(manifest) ? manifest : [];
  if (!Array.isArray(manifest))
    fail('invalid-config', 'apps/shell-web/src/standalone-games.json', '游戏清单必须是数组');
  const registeredDefinitions = new Set(
    [...withoutComments(registry).matchAll(/\bdefinition\s*:\s*(\w+)/g)].map((match) => match[1]),
  );
  const builtins = new Set(
    [...withoutComments(registry).matchAll(/^\s*import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/gm)]
      .filter((match) =>
        match[1].split(',').some((name) =>
          registeredDefinitions.has(
            name
              .split(/\bas\b/)
              .at(-1)
              .trim(),
          ),
        ),
      )
      .map((match) => match[2]),
  );
  const markerBlock =
    withoutComments(smoke).match(/export\s+const\s+markers\s*=\s*\{([\s\S]*?)\n?\};/)?.[1] || '';
  const markers = new Set(
    [...markerBlock.matchAll(/(?:['"]([^'"]+)['"]|([\w-]+))\s*:/g)].map(
      (match) => match[1] || match[2],
    ),
  );
  const exercised = new Set(
    [...withoutComments(smoke).matchAll(/\bid\s*===?\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    ),
  );
  const ids = new Set(),
    sources = new Set(),
    names = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') {
      fail('invalid-config', 'catalog', '游戏条目必须是对象');
      continue;
    }
    if (typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(entry.id))
      fail('unsafe-id', String(entry.id), 'id 必须是 URL 安全的字母、数字和连字符');
    if (ids.has(entry.id)) fail('duplicate-id', String(entry.id), '重复的游戏 id');
    ids.add(entry.id);
    if (
      !safePath(entry.source) ||
      !GAME_ROOTS.some(
        (directory) =>
          entry.source.startsWith(directory + '/') && entry.source.split('/').length === 3,
      )
    )
      fail(
        'unsafe-source',
        String(entry.source),
        '源码必须位于 games/local 或 games/submodules 的直接子目录',
      );
    if (sources.has(entry.source)) fail('duplicate-source', String(entry.source), '源码重复登记');
    sources.add(entry.source);
    if (!safePath(entry.output))
      fail('unsafe-output', String(entry.source), '输出必须是游戏目录内的相对路径');
    if (!markers.has(entry.id))
      fail('missing-marker', String(entry.source), '缺少 Pages ready marker');
    if (!exercised.has(entry.id))
      fail('missing-exercise', String(entry.source), '缺少 exerciseStandalone 真实操作分支');
  }
  for (const directory of GAME_ROOTS) {
    let children;
    try {
      children = await readdir(path.join(root, directory), { withFileTypes: true });
    } catch (error) {
      fail('missing-directory', directory, `不能枚举游戏目录：${error.code}`);
      continue;
    }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!child.isDirectory() || child.name.startsWith('.')) continue;
      const source = `${directory}/${child.name}`;
      let pkg;
      try {
        pkg = JSON.parse(await readFile(path.join(root, source, 'package.json'), 'utf8'));
      } catch {
        fail(
          'missing-package',
          source,
          '游戏目录缺少有效 package.json；子模块请先 pnpm games:init',
        );
        continue;
      }
      const entry = catalog.find((candidate) => candidate?.source === source);
      const builtin = builtins.has(pkg.name);
      const game = {
        source,
        name: pkg.name,
        id: entry?.id || child.name,
        kind: entry ? 'standalone' : builtin ? 'builtin' : 'unregistered',
      };
      games.push(game);
      if (!pkg.name || names.has(pkg.name))
        fail('duplicate-package', source, 'package name 缺失或与其他游戏重复');
      names.add(pkg.name);
      if (!entry && !builtin)
        fail(
          'unregistered-game',
          source,
          '发现未登记游戏：补充 standalone-games.json、Shell workspace 依赖和浏览器操作检查',
        );
      if (entry && builtin)
        fail('duplicate-registration', source, '同一游戏同时作为内置 Game 和 iframe 登记');
      let included = false;
      for (const glob of workspace.packages || []) {
        if (typeof glob !== 'string') continue;
        if (path.matchesGlob(source, glob.replace(/^!/, ''))) included = !glob.startsWith('!');
      }
      if (!included) fail('workspace-missing', source, 'pnpm workspace 没有包含此游戏');
      if (!Object.hasOwn(lock.importers || {}, source))
        fail('lock-missing', source, 'pnpm-lock.yaml 缺少 importer，请运行 pnpm install');
      const locked = lock.importers?.['apps/shell-web']?.dependencies?.[pkg.name];
      if (locked?.specifier !== 'workspace:*' || locked?.version !== `link:../../${source}`)
        fail('lock-missing', source, 'Shell 的锁定依赖或 link 目标不匹配，请运行 pnpm install');
      if (shell.dependencies?.[pkg.name] !== 'workspace:*')
        fail(
          'shell-dependency',
          source,
          'Shell 必须直接声明 workspace:* 依赖，才能参与 affected CI 和构建缓存',
        );
      for (const script of ['build', 'test'])
        if (!pkg.scripts?.[script]?.trim())
          fail(`missing-${script}`, source, `package.json 缺少 ${script} 脚本`);
      if (entry && safePath(entry.output)) {
        const outputs =
          turbo.tasks?.[`${pkg.name}#build`]?.outputs ?? turbo.tasks?.build?.outputs ?? [];
        if (!outputs.some((glob) => path.matchesGlob(`${entry.output}/index.html`, glob)))
          fail('cache-output', source, 'Turbo build outputs 未覆盖游戏输出，缓存命中时会漏打包');
        if (artifacts) await checkArtifacts(root, entry, fail);
      }
    }
  }
  for (const entry of catalog)
    if (entry && safePath(entry.source) && !games.some((game) => game.source === entry.source))
      fail('missing-package', entry.source, '清单所指游戏不存在或尚未初始化');

  for (const [name, token] of [
    ['games:build', 'build'],
    ['games:test', 'test'],
  ]) {
    const command = rootPackage.scripts?.[name] || '';
    if (!command.includes(`run ${token}`) || !command.includes('--filter=./games/*/*'))
      fail('workflow-gate', 'package.json', `${name} 未覆盖两层游戏目录`);
  }
  if (!turbo.tasks?.['@coffeeeeffoc/shell-web#build:pages']?.dependsOn?.includes('^build'))
    fail('workflow-gate', 'turbo.json', 'Pages 任务必须依赖 ^build');
  const prepare = await read('apps/shell-web/scripts/prepare-standalone-games.mjs');
  if (
    !prepare.includes('standalone-games.json') ||
    !prepare.includes('catalog.map') ||
    !prepare.includes('game.output') ||
    !prepare.includes('game.id')
  )
    fail(
      'workflow-gate',
      'apps/shell-web/scripts/prepare-standalone-games.mjs',
      'Pages 准备脚本必须按完整 Game Catalog 构建与复制',
    );
  for (const name of ['ci', 'pages', 'mobile']) {
    const location = `.github/workflows/${name}.yml`;
    const workflow = await read(location, 'yaml');
    const run = commands(workflow);
    if (
      !workflow.on?.push ||
      (!workflow.on?.pull_request && !Object.hasOwn(workflow.on || {}, 'pull_request'))
    )
      fail('workflow-gate', location, '必须覆盖 push 和 pull_request');
    const jobs = Object.values(workflow.jobs || {}).filter((job) =>
      (job.steps || []).some((step) => /actions\/checkout@/.test(step.uses || '')),
    );
    for (const job of jobs) {
      const steps = job.steps || [];
      if (
        !steps.some(
          (step) =>
            /actions\/checkout@/.test(step.uses || '') && step.with?.submodules === 'recursive',
        )
      )
        fail('workflow-gate', location, '构建任务必须递归检出素材与游戏子模块');
      if (!/\bpnpm check:games\b/.test(commands({ jobs: { current: job } })))
        fail('workflow-gate', location, '构建任务缺少 pnpm check:games');
    }
    const required =
      name === 'ci'
        ? ['test:game-config', 'build:affected', 'test:affected', 'check:dependencies']
        : name === 'pages'
          ? ['games:test', 'build:pages', 'test:pages', 'check:games --artifacts']
          : ['android:apk', 'ios:simulator'];
    for (const command of required)
      if (!run.includes(`pnpm ${command}`)) fail('workflow-gate', location, `缺少 pnpm ${command}`);
    if (name === 'pages') {
      const upload = jobs
        .flatMap((job) => job.steps || [])
        .find((step) => /actions\/upload-pages-artifact@/.test(step.uses || ''));
      if (upload?.with?.path !== 'apps/shell-web/dist')
        fail('workflow-gate', location, 'Pages 上传目录不是 Shell dist');
      if (
        !Object.values(workflow.jobs || {}).some((job) =>
          job.steps?.some((step) => /actions\/deploy-pages@/.test(step.uses || '')),
        )
      )
        fail('workflow-gate', location, '缺少 Pages 部署任务');
    }
  }
  const android = await read('apps/shell-android/app/build.gradle');
  const ios = await read('apps/shell-ios/scripts/build-ios.mjs');
  if (
    !android.includes('build:pages') ||
    !android.includes('../shell-web/dist') ||
    !android.includes("dependsOn 'syncWeb'")
  )
    fail(
      'workflow-gate',
      'apps/shell-android/app/build.gradle',
      'Android 必须重新构建并打包 Shell dist',
    );
  if (!ios.includes('build:pages') || !ios.includes('../../shell-web/dist/'))
    fail(
      'workflow-gate',
      'apps/shell-ios/scripts/build-ios.mjs',
      'iOS 必须重新构建并打包 Shell dist',
    );
  if (artifacts) {
    try {
      if (!(await stat(path.join(root, 'apps/shell-web/dist/index.html'))).isFile())
        throw new Error();
    } catch {
      fail(
        'missing-artifact',
        'apps/shell-web/dist/index.html',
        '缺少大厅入口，请先 pnpm build:pages',
      );
    }
  }
  return { games, errors, warnings };
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function checkArtifacts(root, game, fail) {
  const source = path.resolve(root, game.source, game.output);
  const packaged = path.resolve(root, 'apps/shell-web/dist/games', game.id);
  if (!inside(root, source) || !inside(path.join(root, 'apps/shell-web/dist/games'), packaged))
    return;
  for (const directory of [source, packaged]) {
    try {
      if (
        (await lstat(directory)).isSymbolicLink() ||
        !inside(root, await realpath(directory)) ||
        !(await stat(path.join(directory, 'index.html'))).isFile()
      )
        throw new Error();
    } catch {
      fail(
        'missing-artifact',
        normalize(path.relative(root, directory)),
        '找不到构建后的 index.html，请先 pnpm build:pages',
      );
      return;
    }
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail('unsafe-output', game.source, '构建输出不能包含符号链接');
        continue;
      }
      if (entry.isDirectory()) {
        await visit(file);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(source, file),
        copy = path.join(packaged, relative);
      try {
        if ((await lstat(copy)).isSymbolicLink() || !inside(packaged, await realpath(copy)))
          throw new Error();
        if (
          (await stat(copy)).size !== (await stat(file)).size ||
          (await checksum(copy)) !== (await checksum(file))
        )
          fail(
            'stale-artifact',
            normalize(path.relative(root, copy)),
            'Pages 副本与当前游戏构建不同',
          );
      } catch {
        fail(
          'missing-artifact',
          normalize(path.relative(root, copy)),
          '游戏资源未被复制到 Pages/移动端入口',
        );
      }
      if (!/\.(html|css)$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      const references = file.endsWith('.css')
        ? [
            ...text.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)]+))\s*\)/g),
          ].map((match) => match[1] ?? match[2] ?? match[3])
        : [...text.matchAll(/<(?:script|link|img|audio|video|source)\b[^>]*>/gi)].flatMap((tag) =>
            [...tag[0].matchAll(/\b(?:src|href|poster)\s*=\s*['"]([^'"]+)['"]/g)].map(
              (match) => match[1],
            ),
          );
      for (const reference of references) {
        if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(reference)) continue;
        if (reference.startsWith('/')) {
          fail(
            'absolute-asset',
            normalize(path.relative(root, file)),
            `资源 ${reference} 使用根路径，会破坏 Pages 子路径部署`,
          );
          continue;
        }
        let target;
        try {
          target = path.resolve(path.dirname(file), decodeURIComponent(reference.split(/[?#]/)[0]));
        } catch {
          fail('missing-asset', game.source, `非法资源 URL：${reference}`);
          continue;
        }
        try {
          if (!inside(source, await realpath(target)) || !(await stat(target)).isFile())
            throw new Error();
        } catch {
          fail(
            'missing-asset',
            normalize(path.relative(root, file)),
            `相对资源缺失或越界：${reference}`,
          );
        }
      }
    }
  }
  await visit(source);
}

async function main(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith('--') && arg !== '--'));
  if (flags.has('--help')) {
    console.log(
      'pnpm check:games [目录名/id/包名 ...] [--json] [--artifacts] [--verify]\n默认审计全部 games/local 与 games/submodules；--artifacts 检查现有 Pages 副本；--verify 运行游戏测试构建、SDK smoke、完整 Pages 操作回归及移动端 Web 打包。',
    );
    return;
  }
  for (const flag of flags)
    if (!['--json', '--artifacts', '--verify'].includes(flag)) throw new Error(`未知参数 ${flag}`);
  if (flags.has('--verify') && flags.has('--json'))
    throw new Error('--verify 会输出构建日志，请单独使用 --json');
  const names = args.filter((arg) => !arg.startsWith('--'));
  const report = await auditGameConfig(ROOT, { artifacts: flags.has('--artifacts') });
  const selected = names.length
    ? report.games.filter((game) =>
        names.some((name) =>
          [game.source, path.basename(game.source), game.name, game.id].includes(name),
        ),
      )
    : report.games;
  for (const name of names)
    if (
      !selected.some((game) =>
        [game.source, path.basename(game.source), game.name, game.id].includes(name),
      )
    )
      report.errors.push({
        code: 'unknown-game',
        path: name,
        message: '目录、id 或包名没有匹配游戏',
      });
  if (flags.has('--json')) console.log(JSON.stringify({ ...report, selected }, null, 2));
  else {
    console.table(
      selected.map((game) => ({
        游戏目录: game.source,
        包名: game.name,
        装载: game.kind,
        配置: report.errors.some((error) => error.path === game.source) ? '失败' : '已登记',
      })),
    );
    for (const error of report.errors)
      console.error(`[${error.code}] ${error.path}: ${error.message}`);
    console.log(
      `发现 ${report.games.length} 个游戏；${report.errors.length} 个问题。${flags.has('--artifacts') ? '已校验 Pages 制品。' : '此步骤只检查配置，不代替实际构建与浏览器验证。'}`,
    );
  }
  if (report.errors.length) {
    process.exitCode = 1;
    return;
  }
  if (!flags.has('--verify')) return;
  if (!process.env.npm_execpath) throw new Error('请通过 pnpm check:games --verify 运行构建回归');
  const pnpm = (args) =>
    runCommand(process.execPath, [process.env.npm_execpath, ...args], { cwd: ROOT });
  await pnpm(['check:dependencies']);
  await pnpm([
    'exec',
    'turbo',
    'run',
    'test',
    'build',
    ...selected.map((game) => `--filter=./${game.source}`),
    '--concurrency=1',
    '--output-logs=errors-only',
  ]);
  await pnpm([
    'exec',
    'turbo',
    'run',
    'build',
    'smoke',
    '--filter=@coffeeeeffoc/shell-bilibili',
    '--concurrency=1',
    '--force',
    '--output-logs=errors-only',
  ]);
  await pnpm(['build:pages', '--output-logs=errors-only']);
  const built = await auditGameConfig(ROOT, { artifacts: true });
  if (built.errors.length)
    throw new Error(built.errors.map((error) => `${error.path}: ${error.message}`).join('\n'));
  await pnpm(['test:pages']);
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  await runCommand(python, ['scripts/test-mobile-assets.py'], { cwd: ROOT });
  await runCommand(python, ['scripts/mobile-assets.py'], { cwd: ROOT });
  console.log(
    '游戏、SDK、Pages 和移动端 Web 资源包回归通过。APK/iOS 原生编译仍由 mobile workflow 或 pnpm android:apk / ios:simulator 验证。',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
