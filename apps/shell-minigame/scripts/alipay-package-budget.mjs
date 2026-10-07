import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const REFERENCE = 'https://opendocs.alipay.com/mini-game/08uo7z';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasControl = (value) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function invalid(message) {
  throw failure('INVALID_SUBPACKAGE', message);
}
function declarations(game) {
  if (!object(game)) invalid('Alipay game.json must be an object.');
  if (Object.hasOwn(game, 'subPackages')) invalid('Alipay game.json uses lowercase subpackages.');
  const entries = game.subpackages === undefined ? [] : game.subpackages;
  if (!Array.isArray(entries)) invalid('Alipay subpackages must be an array.');
  const names = new Set();
  const roots = new Set();
  return entries.map((entry) => {
    if (!object(entry) || Object.keys(entry).some((key) => !['name', 'root'].includes(key)))
      invalid('Each ordinary Alipay subpackage must contain only name and root.');
    if (
      typeof entry.name !== 'string' ||
      !entry.name ||
      entry.name.trim() !== entry.name ||
      hasControl(entry.name)
    )
      invalid('Alipay subpackage name must be a nonempty string.');
    if (names.has(entry.name)) invalid('Duplicate Alipay subpackage name.');
    const value = entry.root;
    if (
      typeof value !== 'string' ||
      !value ||
      value.trim() !== value ||
      value.includes('\\') ||
      path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      /^[a-z][a-z\d+.-]*:/i.test(value) ||
      hasControl(value) ||
      /[?#%]/.test(value)
    )
      invalid('Alipay subpackage root must be a safe package-relative directory.');
    const root = value.endsWith('/') ? value.slice(0, -1) : value;
    if (root.split('/').some((part) => !part || part === '.' || part === '..'))
      invalid('Alipay subpackage root cannot contain empty, dot or parent segments.');
    for (const other of roots) {
      if (root === other || root.startsWith(`${other}/`) || other.startsWith(`${root}/`))
        invalid('Alipay subpackage roots must be unique and nonoverlapping.');
    }
    names.add(entry.name);
    roots.add(root);
    return { name: entry.name, root, bytes: 0, fileCount: 0 };
  });
}

/**
 * Official ordinary mini-game budgets: main 4M, total main+subpackages 20M,
 * and no individual ordinary-subpackage limit (guide updated 2026-07-23).
 * Decimal defaults are conservative while the official "M" unit is ambiguous.
 * Measure every actual file, including all provenance manifests; no inventory
 * exclusions or manifest-declared byte counts can reduce this measurement.
 */
export async function verifyAlipayPackageBudget(
  directory,
  { mainBudget = 4_000_000, totalBudget = 20_000_000 } = {},
) {
  if (
    !Number.isSafeInteger(mainBudget) ||
    mainBudget <= 0 ||
    !Number.isSafeInteger(totalBudget) ||
    totalBudget <= 0
  )
    throw failure('INVALID_BUDGET', 'Alipay budgets must be positive safe integers in bytes.');
  const root = path.resolve(directory);
  const files = [];
  async function walk(absolute) {
    const info = await lstat(absolute);
    if (info.isSymbolicLink())
      throw failure('SYMLINK', 'Alipay package cannot contain symbolic links.');
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await walk(path.join(absolute, name));
    } else if (info.isFile()) {
      if (!Number.isSafeInteger(info.size) || info.size < 0)
        throw failure('INVALID_FILE_SIZE', 'Alipay file byte size cannot be measured safely.');
      files.push({
        path: path.relative(root, absolute).split(path.sep).join('/'),
        bytes: info.size,
      });
    } else
      throw failure(
        'SPECIAL_FILE',
        'Alipay package must contain only directories and regular files.',
      );
  }
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink())
    throw failure('SYMLINK', 'Alipay package directory cannot be a symbolic link.');
  if (!rootInfo.isDirectory())
    throw failure('INVALID_DIRECTORY', 'Alipay package directory is required.');
  await walk(root);
  if (!files.some((file) => file.path === 'game.json'))
    throw failure('INVALID_SUBPACKAGE', 'Alipay package requires a regular game.json file.');
  let game;
  try {
    game = JSON.parse(await readFile(path.join(root, 'game.json'), 'utf8'));
  } catch (error) {
    throw failure('INVALID_SUBPACKAGE', `Cannot read Alipay game.json: ${error.message}`);
  }
  const subpackages = declarations(game);
  const paths = new Set(files.map((file) => file.path));
  for (const entry of subpackages) {
    if (!paths.has(`${entry.root}/game.js`))
      invalid(`Alipay subpackage ${entry.name} requires a real ${entry.root}/game.js file.`);
  }
  let mainBytes = 0;
  let mainFileCount = 0;
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes;
    if (!Number.isSafeInteger(totalBytes))
      throw failure('INVALID_FILE_SIZE', 'Alipay total byte size cannot be measured safely.');
    const entry = subpackages.find((item) => file.path.startsWith(`${item.root}/`));
    if (entry) {
      entry.bytes += file.bytes;
      entry.fileCount++;
    } else {
      mainBytes += file.bytes;
      mainFileCount++;
    }
  }
  if (mainBytes > mainBudget)
    throw failure(
      'MAIN_BUDGET_EXCEEDED',
      `Alipay main package exceeds ${mainBudget} bytes including all manifests: ${mainBytes}`,
    );
  if (totalBytes > totalBudget)
    throw failure(
      'TOTAL_BUDGET_EXCEEDED',
      `Alipay main and subpackages exceed ${totalBudget} bytes: ${totalBytes}`,
    );
  return {
    mainBytes,
    totalBytes,
    mainBudget,
    totalBudget,
    mainFileCount,
    fileCount: files.length,
    subpackages,
    reference: REFERENCE,
    referenceUpdated: '2026-07-23',
    measurement: 'all-actual-uncompressed-files',
  };
}
