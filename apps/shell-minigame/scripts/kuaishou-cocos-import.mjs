import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MiB = 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function relativeFile(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Error('Unsafe package path.');
  return value;
}
async function directory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value))
    throw Error('Explicit absolute local directory required.');
  const resolved = path.resolve(value);
  // Reject links in all ancestors, not just package children.
  let current = resolved;
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw Error('Package path contains a symlink.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (!(await lstat(resolved)).isDirectory() || (await realpath(resolved)) !== resolved)
    throw Error('Package directory required.');
  return resolved;
}
export async function inventory(directoryPath) {
  const root = await directory(directoryPath);
  const output = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('Package contains a symlink.');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        output.push({
          path: relativeFile(path.relative(root, full).split(path.sep).join('/')),
          bytes: bytes.length,
          sha256: digest(bytes),
        });
      } else throw Error('Unsupported package file type.');
    }
  }
  await walk(root);
  return output.sort((a, b) => a.path.localeCompare(b.path));
}
const json = async (root, file) =>
  JSON.parse(await readFile(path.join(root, relativeFile(file)), 'utf8'));
function uncomment(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
function requireCall(text, filename) {
  text = uncomment(text);
  return new RegExp(
    `\\brequire\\s*\\(\\s*['"](?:\\./)?${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`,
  ).test(text);
}

/** Validates an explicitly supplied converted package; never invokes or authenticates DevTools.
 * verifiedSourceInventory must be captured at trusted Creator source staging, before conversion.
 * projectConfigurationFile/appIdField describe the actual supplied DevTools file, not a guessed schema.
 */
export async function verifyConvertedPackage(options) {
  const {
    sourceDirectory,
    convertedDirectory,
    gameRoot,
    currentSourceHash,
    verifiedSourceInventory,
    appId = '',
    mode = 'preview',
    projectConfigurationFile,
    appIdField,
  } = options;
  if (!['preview', 'release'].includes(mode)) throw Error('Invalid build mode.');
  if (
    typeof appId !== 'string' ||
    (appId && !/^[A-Za-z0-9_-]+$/.test(appId)) ||
    /^(wx|tt|touristappid$|preview-only$)/i.test(appId)
  )
    throw Error('Invalid Kuaishou AppID.');
  if (mode === 'release' && (!appId || appId === 'kwai_game_test_appid'))
    throw Error('Release requires a configured Kuaishou AppID.');
  if (!/^[a-f0-9]{64}$/.test(currentSourceHash || ''))
    throw Error('Current source fingerprint required.');
  await directory(gameRoot);
  const source = await directory(sourceDirectory),
    converted = await directory(convertedDirectory);
  if (
    source === converted ||
    source.startsWith(converted + path.sep) ||
    converted.startsWith(source + path.sep)
  )
    throw Error('Source and converted packages must be independent directories.');
  if (!Array.isArray(verifiedSourceInventory) || !verifiedSourceInventory.length)
    throw Error('Trusted staged source inventory required.');
  const expected = verifiedSourceInventory
    .map((file) => ({ path: relativeFile(file.path), bytes: file.bytes, sha256: file.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (
    new Set(expected.map((file) => file.path)).size !== expected.length ||
    expected.some(
      (file) =>
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256),
    )
  )
    throw Error('Invalid trusted source inventory.');
  const sourceFiles = await inventory(source);
  if (JSON.stringify(expected) !== JSON.stringify(sourceFiles))
    throw Error('Staged source integrity mismatch.');
  const info = await json(source, 'build-info.json');
  if (
    info.creator !== '3.8.8' ||
    info.sourceHash !== currentSourceHash ||
    (info.target && info.target !== 'wechatgame') ||
    (info.platform && info.platform !== 'wechatgame')
  )
    throw Error('Creator source provenance mismatch.');
  const sourceGame = await json(source, 'game.json');
  if (sourceGame.deviceOrientation !== 'landscape')
    throw Error('Source must be a native landscape package.');
  const sourceEntry = await readFile(path.join(source, 'game.js'), 'utf8');
  const settings = sourceFiles.filter((file) =>
    /(?:^|\/)settings(?:\.[a-zA-Z0-9_-]+)?\.(?:json|js)$/.test(file.path),
  );
  if (!sourceEntry.trim() || !/\brequire\s*\(/.test(sourceEntry) || !settings.length)
    throw Error('Native Creator entry/settings required.');
  const convertedFiles = await inventory(converted),
    byPath = new Map(convertedFiles.map((file) => [file.path, file]));
  const mutable = new Set([
    'game.js',
    'game.json',
    'build-info.json',
    'platform-manifest.json',
    'project.config.json',
  ]);
  if (projectConfigurationFile) mutable.add(relativeFile(projectConfigurationFile));
  for (const file of sourceFiles) {
    if (mutable.has(file.path)) continue;
    const counterpart = byPath.get(file.path);
    if (!counterpart || counterpart.sha256 !== file.sha256 || counterpart.bytes !== file.bytes)
      throw Error(`Converted resource missing or changed: ${file.path}`);
  }
  const game = await json(converted, 'game.json');
  if (game.deviceOrientation !== 'landscape') throw Error('Converted game orientation mismatch.');
  if (!projectConfigurationFile || !['appid', 'appId'].includes(appIdField))
    throw Error('Explicit actual DevTools project configuration and AppID field required.');
  const project = await json(converted, projectConfigurationFile);
  const expectedAppId = appId || 'kwai_game_test_appid';
  if (
    project[appIdField] !== expectedAppId ||
    ['appid', 'appId'].some((field) => field in game && game[field] !== expectedAppId)
  )
    throw Error('Converted Kuaishou AppID mismatch.');
  const entry = await readFile(path.join(converted, 'game.js'), 'utf8');
  if (!requireCall(entry, 'kwaiadapter.js') || !byPath.has('kwaiadapter.js'))
    throw Error('Converted entry must require existing kwaiadapter.js.');
  const adapter = await readFile(path.join(converted, 'kwaiadapter.js'), 'utf8');
  if (!/\bks\s*(?:\.|\[)|\b(?:globalThis|window|GameGlobal)\s*\.\s*ks\b/.test(uncomment(adapter)))
    throw Error('Adapter has no Kuaishou API boundary.');
  // An adapter reference cannot replace the actual Creator entry.
  const stripped = entry
    .replace(/\brequire\s*\(\s*['"](?:\.\/)?kwaiadapter\.js['"]\s*\)\s*;?/g, '')
    .trim();
  if (stripped !== sourceEntry.trim())
    throw Error('Converted Creator entry differs beyond adapter import; explicit review required.');
  const subpackages = game.subpackages || [];
  if (!Array.isArray(subpackages)) throw Error('Invalid subpackages.');
  const roots = subpackages.map(
    (item) => relativeFile(String(item.root || '').replace(/\/$/, '')) + '/',
  );
  if (
    new Set(roots).size !== roots.length ||
    roots.some((root, i) => roots.some((other, j) => i !== j && root.startsWith(other)))
  )
    throw Error('Overlapping subpackage paths.');
  const resources = subpackages.find((item) => item.name === 'resources');
  if (
    !resources ||
    !byPath.has(relativeFile(String(resources.root || '').replace(/\/$/, '')) + '/game.js')
  )
    throw Error('Native resources subpackage entry required.');
  for (const root of roots)
    if (!byPath.has(root + 'game.js')) throw Error('Subpackage entry missing.');
  const totalBytes = convertedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const mainBytes = convertedFiles
    .filter((file) => !roots.some((root) => file.path.startsWith(root)))
    .reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > 30 * MiB || mainBytes > 6 * MiB)
    throw Error(`Kuaishou package budget exceeded: main=${mainBytes}, total=${totalBytes}.`);
  return {
    directory: converted,
    status: 'converted-integrity-verified-host-unverified',
    sourceHash: currentSourceHash,
    creator: '3.8.8',
    appId,
    previewOnly: !appId || appId === 'kwai_game_test_appid',
    mainBytes,
    totalBytes,
    files: convertedFiles,
    sourceInventorySha256: digest(JSON.stringify(sourceFiles)),
    sourceProvenance: 'fingerprint-and-trusted-staged-inventory',
    conversionReceipt: 'unverified',
    officialToolVerified: false,
    realDeviceVerified: false,
    projectConfigurationSchemaVerified: false,
  };
}
export const importConvertedPackage = verifyConvertedPackage;
