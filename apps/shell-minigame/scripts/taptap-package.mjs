import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The review guide says below 20 MB; the overview also mentions 60 MB. Use the
// stricter local ceiling until the actual official tool validates the project.
export const tapPackageBudgetBytes = 20 * 1024 * 1024;
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function relativeFile(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    /[\\\0]/.test(value) ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Error('Unsafe TapTap package path.');
  return value;
}
export async function localPath(value, kind = 'directory') {
  if (typeof value !== 'string' || !path.isAbsolute(value))
    throw Error('Explicit absolute local path required.');
  const resolved = path.resolve(value);
  let current = resolved;
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw Error('TapTap path contains a symlink.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const info = await lstat(resolved);
  if (
    (kind === 'directory' ? !info.isDirectory() : !info.isFile()) ||
    (await realpath(resolved)) !== resolved
  )
    throw Error(`TapTap ${kind} required.`);
  return resolved;
}
export async function inventory(directory) {
  const root = await localPath(directory),
    files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('TapTap package contains a symlink.');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        files.push({
          path: relativeFile(path.relative(root, full).split(path.sep).join('/')),
          bytes: bytes.length,
          sha256: digest(bytes),
        });
      } else throw Error('Unsupported TapTap package file type.');
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export function trustedInventory(value) {
  if (!Array.isArray(value) || !value.length)
    throw Error('Trusted TapTap source inventory required.');
  const files = value
    .map((file) => ({ path: relativeFile(file.path), bytes: file.bytes, sha256: file.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (
    new Set(files.map((file) => file.path)).size !== files.length ||
    files.some(
      (file) =>
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256),
    )
  )
    throw Error('Invalid trusted TapTap inventory.');
  return files;
}
export function tapIdentity(appId = '', mode = 'preview') {
  if (!['preview', 'release'].includes(mode)) throw Error('Invalid TapTap build mode.');
  // Official docs give examples, not an authoritative length/prefix schema.
  if (typeof appId !== 'string' || (appId && !/^[A-Za-z0-9_-]+$/.test(appId)))
    throw Error('Invalid public TapTap AppID.');
  if (mode === 'release' && !appId) throw Error('TapTap release requires a configured AppID.');
  return { appId, mode, previewOnly: mode === 'preview' };
}
const json = async (root, file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
function visitAst(ast, visitor) {
  const pending = [ast];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (typeof node.type === 'string') visitor(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === 'object') pending.push(value);
    }
  }
}

/** Checks source structure, not execution in TapTap or official-tool authenticity. */
export async function verifyTapProject({
  directory,
  appId = '',
  mode = 'preview',
  orientation,
  verifiedSourceInventory,
  maxBytes = tapPackageBudgetBytes,
  entryPrefixToIgnore = '',
} = {}) {
  tapIdentity(appId, mode);
  const root = await localPath(directory),
    files = await inventory(root);
  if (
    verifiedSourceInventory &&
    JSON.stringify(trustedInventory(verifiedSourceInventory)) !== JSON.stringify(files)
  )
    throw Error('TapTap source project integrity mismatch.');
  const names = new Set(files.map((file) => file.path));
  for (const required of ['game.js', 'game.json', 'project.config.json'])
    if (!names.has(required)) throw Error(`TapTap project requires root ${required}.`);
  if (files.some((file) => /(?:^|\/)(?:AndroidManifest\.xml|classes\d*\.dex)$/.test(file.path)))
    throw Error('APK content cannot be imported as a TapTap mini game.');
  const game = await json(root, 'game.json'),
    project = await json(root, 'project.config.json');
  if (
    !['portrait', 'landscape'].includes(game.deviceOrientation) ||
    (orientation && game.deviceOrientation !== orientation)
  )
    throw Error('TapTap game orientation mismatch.');
  if (
    (game.appId || '') !== appId ||
    (project.appid || '') !== appId ||
    ['appid', 'appId'].some((key) => key in game && game[key] && game[key] !== appId)
  )
    throw Error('TapTap project AppID mismatch; preview does not use a fabricated identity.');
  if (game.subPackages && game.subpackages)
    throw Error('Ambiguous TapTap subpackage configuration.');
  const subpackages = game.subPackages || game.subpackages || [];
  if (!Array.isArray(subpackages)) throw Error('Invalid TapTap subpackage configuration.');
  const roots = subpackages.map(
    (item) => relativeFile(String(item.root || '').replace(/\/$/, '')) + '/',
  );
  if (
    new Set(roots).size !== roots.length ||
    roots.some((root, i) => roots.some((other, j) => i !== j && root.startsWith(other)))
  )
    throw Error('Overlapping TapTap subpackages.');
  for (const root of roots)
    if (!names.has(root + 'game.js')) throw Error('TapTap subpackage entry missing.');
  // Follow only local CommonJS imports from the actual entry. A stray tap-named
  // file or a comment cannot establish a Tap runtime boundary for a renamed ZIP.
  const visited = new Set();
  let runtimeBoundary = false;
  // Vite is already the reviewed build dependency. Its AST parser distinguishes
  // real global references from comments, regexes and quoted/template examples,
  // including the minifier's typeof tap > `u` guard.
  const { parseAst } = await import('vite');
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    let source = await readFile(path.join(root, file), 'utf8');
    if (file === 'game.js' && entryPrefixToIgnore) {
      if (!source.startsWith(entryPrefixToIgnore))
        throw Error('TapTap expected source bootstrap prefix missing.');
      source = source.slice(entryPrefixToIgnore.length);
    }
    const imports = [];
    const ast = parseAst(source);
    visitAst(ast, (node) => {
      if (
        node.type === 'MemberExpression' &&
        ((node.object?.type === 'Identifier' && node.object.name === 'tap') ||
          (['GameGlobal', 'globalThis'].includes(node.object?.name) &&
            (node.computed ? node.property?.value : node.property?.name) === 'tap'))
      )
        runtimeBoundary = true;
      if (
        node.type === 'ConditionalExpression' &&
        [node.consequent, node.alternate].some(
          (branch) => branch?.type === 'Identifier' && branch.name === 'tap',
        )
      )
        visitAst(node.test, (test) => {
          if (
            test.type === 'UnaryExpression' &&
            test.operator === 'typeof' &&
            test.argument?.type === 'Identifier' &&
            test.argument.name === 'tap'
          )
            runtimeBoundary = true;
        });
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments?.length === 1 &&
        typeof node.arguments[0]?.value === 'string' &&
        node.arguments[0].value.startsWith('.')
      )
        imports.push(node.arguments[0].value);
    });
    for (const name of imports) {
      const imported = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      relativeFile(imported);
      const candidate = [imported, imported + '.js', imported + '/index.js'].find((name) =>
        names.has(name),
      );
      if (!candidate) throw Error(`TapTap local entry dependency missing: ${imported}`);
      if (/\.js$/.test(candidate)) await visit(candidate);
    }
  }
  await visit('game.js');
  if (!runtimeBoundary)
    throw Error(
      'TapTap entry has no reachable tap API boundary; renaming another platform package is not conversion.',
    );
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes >= maxBytes)
    throw Error(`TapTap conservative package budget exceeded: ${totalBytes}.`);
  return {
    directory: root,
    files,
    totalBytes,
    orientation: game.deviceOrientation,
    appId,
    mode,
    sourceInventorySha256: digest(JSON.stringify(files)),
    integrityVerified: true,
    officialToolVerified: false,
    realDeviceVerified: false,
  };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Non-extracting ZIP audit. Supports standard stored/deflated single-disk ZIPs.
 * Unsupported/encrypted/ZIP64 outputs require explicit review, never relabeling. */
export function zipInventory(bytes, { maxBytes = tapPackageBudgetBytes } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50)
    throw Error(
      'TapTap output must be a ZIP with mini game entries, not a renamed APK or foreign package.',
    );
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw Error('Invalid TapTap ZIP central directory.');
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    start = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count === 65535 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    count !== bytes.readUInt16LE(end + 8) ||
    start + size !== end
  )
    throw Error('Unsupported TapTap ZIP layout.');
  const files = [],
    names = new Set(),
    ranges = [];
  let cursor = start,
    totalBytes = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error('Invalid TapTap ZIP entry.');
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20),
      length = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34),
      attributes = bytes.readUInt32LE(cursor + 38),
      offset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      flags & 0x2041 ||
      ![0, 8].includes(method) ||
      disk ||
      [compressed, length, offset].includes(0xffffffff)
    )
      throw Error('Unsupported TapTap ZIP entry format.');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = rawName.toString('utf8'),
      isDirectory = name.endsWith('/');
    if (!Buffer.from(name, 'utf8').equals(rawName))
      throw Error('Invalid TapTap ZIP filename encoding.');
    const file = relativeFile(isDirectory ? name.slice(0, -1) : name);
    if (names.has(file)) throw Error('Duplicate TapTap ZIP entry.');
    names.add(file);
    const unixType = (attributes >>> 16) & 0xf000;
    if (unixType && unixType !== (isDirectory ? 0x4000 : 0x8000))
      throw Error('TapTap ZIP contains a symlink or special entry.');
    if (
      offset + 30 > start ||
      bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 6) !== flags ||
      bytes.readUInt16LE(offset + 8) !== method
    )
      throw Error('TapTap ZIP local header mismatch.');
    if (
      !(flags & 8) &&
      (bytes.readUInt32LE(offset + 14) !== crc ||
        bytes.readUInt32LE(offset + 18) !== compressed ||
        bytes.readUInt32LE(offset + 22) !== length)
    )
      throw Error('TapTap ZIP local CRC or size mismatch.');
    const localNameLength = bytes.readUInt16LE(offset + 26),
      localExtraLength = bytes.readUInt16LE(offset + 28);
    const body = offset + 30 + localNameLength + localExtraLength,
      finish = body + compressed;
    if (
      finish > start ||
      !bytes.subarray(offset + 30, offset + 30 + localNameLength).equals(rawName)
    )
      throw Error('TapTap ZIP local filename mismatch.');
    let rangeFinish = finish;
    if (flags & 8) {
      const descriptor =
        finish + (finish + 4 <= start && bytes.readUInt32LE(finish) === 0x08074b50 ? 4 : 0);
      rangeFinish = descriptor + 12;
      if (
        rangeFinish > start ||
        bytes.readUInt32LE(descriptor) !== crc ||
        bytes.readUInt32LE(descriptor + 4) !== compressed ||
        bytes.readUInt32LE(descriptor + 8) !== length
      )
        throw Error('TapTap ZIP data descriptor mismatch or missing.');
    }
    if (ranges.some(([a, b]) => offset < b && rangeFinish > a))
      throw Error('Overlapping TapTap ZIP entries.');
    ranges.push([offset, rangeFinish]);
    totalBytes += length;
    if (totalBytes >= maxBytes) throw Error('TapTap ZIP expanded package budget exceeded.');
    const encoded = bytes.subarray(body, finish);
    const decoded =
      method === 0 ? encoded : inflateRawSync(encoded, { maxOutputLength: Math.max(1, length) });
    if (decoded.length !== length || crc32(decoded) !== crc || (isDirectory && length))
      throw Error('TapTap ZIP entry CRC or size mismatch.');
    if (!isDirectory) files.push({ path: file, bytes: length, sha256: digest(decoded) });
    cursor = next;
  }
  if (cursor !== end) throw Error('Unexpected TapTap ZIP directory data.');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Import supplied official-tool output; this records local provenance but cannot
 * authenticate who produced the ZIP. It never runs an undocumented packer CLI. */
export async function verifyOfficialPackage({
  projectDirectory,
  packageFile,
  officialToolPath,
  verifiedProjectInventory,
  currentSourceHash,
  appId = '',
  mode = 'preview',
  orientation,
  game,
  apiUrl = '',
} = {}) {
  if (!/^[a-f0-9]{64}$/.test(currentSourceHash || ''))
    throw Error('Current TapTap source fingerprint required.');
  const expected = trustedInventory(verifiedProjectInventory);
  const project = await verifyTapProject({
    directory: projectDirectory,
    appId,
    mode,
    orientation,
    verifiedSourceInventory: expected,
  });
  let login;
  if (mode === 'release') {
    const { verifyTapTapLogin } = await import('./taptap-login.mjs');
    login = await verifyTapTapLogin(projectDirectory, {
      platform: 'taptap',
      game,
      appId,
      apiUrl,
      preview: false,
    });
  }
  if (!officialToolPath)
    throw Error('Supply the actual official TapTap packing tool path; no ZIP is fabricated.');
  const tool = await localPath(
      officialToolPath,
      (await lstat(officialToolPath)).isDirectory() ? 'directory' : 'file',
    ),
    output = await localPath(packageFile, 'file');
  if (!/\.zip$/i.test(output)) throw Error('TapTap official output must be supplied as a ZIP.');
  if ((await lstat(output)).size >= tapPackageBudgetBytes)
    throw Error('TapTap ZIP package budget exceeded.');
  const bytes = await readFile(output),
    packagedFiles = zipInventory(bytes);
  if (JSON.stringify(packagedFiles) !== JSON.stringify(expected))
    throw Error('TapTap ZIP does not match the trusted current source project.');
  const toolEvidence = (await lstat(tool)).isDirectory()
    ? { files: await inventory(tool) }
    : { bytes: (await lstat(tool)).size, sha256: digest(await readFile(tool)) };
  if (toolEvidence.files) toolEvidence.inventorySha256 = digest(JSON.stringify(toolEvidence.files));
  return {
    packageFile: output,
    bytes: bytes.length,
    sha256: digest(bytes),
    files: packagedFiles,
    currentSourceHash,
    sourceInventorySha256: project.sourceInventorySha256,
    ...(login ? { login, loginPublicConfig: { platform: 'taptap', game, appId, apiUrl } } : {}),
    tool: { path: tool, ...toolEvidence, authenticityVerified: false },
    status: 'supplied-package-integrity-verified',
    integrityVerified: true,
    officialToolVerified: false,
    realDeviceVerified: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      package: { type: 'string' },
      tool: { type: 'string' },
      inventory: { type: 'string' },
      appid: { type: 'string' },
      release: { type: 'boolean' },
      game: { type: 'string' },
      'api-url': { type: 'string' },
    },
  });
  const options = {
    directory: values.project ? path.resolve(values.project) : undefined,
    appId: values.appid || '',
    mode: values.release ? 'release' : 'preview',
    game: values.game,
    apiUrl: values['api-url'] || '',
  };
  if (values.package) {
    if (!values.inventory)
      throw Error('Package import requires --inventory from the current source staging.');
    const source = JSON.parse(await readFile(path.resolve(values.inventory), 'utf8'));
    console.log(
      JSON.stringify(
        await verifyOfficialPackage({
          ...options,
          projectDirectory: options.directory,
          packageFile: path.resolve(values.package),
          officialToolPath: values.tool ? path.resolve(values.tool) : undefined,
          verifiedProjectInventory: source.files,
          currentSourceHash: source.sourceHash,
        }),
        null,
        2,
      ),
    );
  } else console.log(JSON.stringify(await verifyTapProject(options), null, 2));
}
