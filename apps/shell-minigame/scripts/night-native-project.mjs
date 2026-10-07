import { cp, mkdir, mkdtemp, lstat, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (text) => text.replaceAll('\r\n', '\n');
const recipe = [
  {
    file: 'assets/scripts/HUD.ts',
    originalSha256: '27d84696429f13989b893cbe0bf40b7607d2d235ae1840fa0ed9f7f72536abb5',
    changes: [
      {
        before:
          "    this.button('fullscreen', this.t('全屏', 'FULL SCREEN'), right - (small ? 64 : 88), top + (small ? 12 : 6), small ? 64 : 88, small ? 32 : 44, this.globalControls).fontSize = small ? 11 : 12;",
        after:
          "    if (sys.isBrowser) this.button('fullscreen', this.t('全屏', 'FULL SCREEN'), right - (small ? 64 : 88), top + (small ? 12 : 6), small ? 64 : 88, small ? 32 : 44, this.globalControls).fontSize = small ? 11 : 12;",
      },
    ],
  },
  {
    file: 'assets/scripts/Platform.ts',
    originalSha256: '91f4bf90f410578062b9702d1aa75882c11e4e234a5f9196e9a9598010319488',
    changes: [
      {
        before: '    return screen.fullScreen();',
        after: '    return sys.isBrowser && screen.fullScreen();',
      },
      {
        before: '  async fullscreen() {\n    try {',
        after: '  async fullscreen() {\n    if (!sys.isBrowser) return false;\n    try {',
      },
    ],
  },
];
export const adaptationRecipeSha256 = sha(JSON.stringify({ version: 1, recipe }));
async function inventory(root) {
  const files = [];
  async function walk(current) {
    if ((await lstat(current)).isSymbolicLink())
      throw Error('Native staging input contains a symlink.');
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw Error('Native staging input contains a symlink.');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        files.push({
          path: path.relative(root, full).split(path.sep).join('/'),
          bytes: bytes.length,
          sha256: sha(bytes),
        });
      } else throw Error('Unsupported staging input file type.');
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function copyTree(source, destination) {
  const files = await inventory(source);
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    await mkdir(path.dirname(path.join(destination, file.path)), { recursive: true });
    await cp(path.join(source, file.path), path.join(destination, file.path));
  }
  if (JSON.stringify(files) !== JSON.stringify(await inventory(destination)))
    throw Error('Staged copy integrity mismatch.');
  return files;
}
async function copyFile(source, destination) {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error('Native staging input must be a regular file.');
  const bytes = await readFile(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { bytes: bytes.length, sha256: sha(bytes) };
}

/** Stage only native project inputs. Does not run Creator or authenticate plugins. */
export async function prepareNativeProject(gameRoot, { stageBase } = {}) {
  gameRoot = path.resolve(gameRoot);
  const artifact = await import(pathToFileURL(path.join(gameRoot, 'scripts/artifact.mjs')));
  const canonicalSourceHash = await artifact.sourceHash(gameRoot);
  if (path.basename(gameRoot) !== 'night-overwatch')
    return { projectRoot: gameRoot, canonicalSourceHash, sourceHash: canonicalSourceHash };
  const packageInfo = JSON.parse(await readFile(path.join(gameRoot, 'package.json'), 'utf8'));
  if (
    packageInfo.name !== '@coffeeeeffoc/night-overwatch' ||
    packageInfo.creator?.version !== '3.8.8'
  )
    throw Error('Unreviewed Night Creator project identity.');
  const inputs = [];
  for (const item of recipe) {
    const bytes = await readFile(path.join(gameRoot, item.file));
    let text = normalize(bytes.toString('utf8'));
    if (sha(text) !== item.originalSha256)
      throw Error(`Unreviewed canonical Night source: ${item.file}`);
    for (const change of item.changes) {
      if (text.split(change.before).length !== 2)
        throw Error('Native guard recipe must match exactly once.');
      text = text.replace(change.before, change.after);
    }
    inputs.push({
      file: item.file,
      canonicalSha256: sha(bytes),
      normalizedCanonicalSha256: sha(normalize(bytes.toString('utf8'))),
      nativeSha256: sha(text),
      output: text,
    });
  }
  const base = path.resolve(
    stageBase || path.join(gameRoot, '../../../.scratch/nine-native-cocos'),
  );
  if (base === gameRoot || base.startsWith(gameRoot + path.sep))
    throw Error('Native stage must be outside canonical project.');
  await mkdir(base, { recursive: true });
  const session = await mkdtemp(path.join(base, 'night-'));
  const projectRoot = path.join(session, 'games/local/night-overwatch');
  try {
    await mkdir(projectRoot, { recursive: true });
    const copied = {};
    for (const folder of ['assets', 'scripts', 'settings', 'startup'])
      copied[folder] = await copyTree(path.join(gameRoot, folder), path.join(projectRoot, folder));
    for (const file of ['package.json', 'tsconfig.json'])
      copied[file] = await copyFile(path.join(gameRoot, file), path.join(projectRoot, file));
    const cardRoot = path.resolve(gameRoot, '../carding-car');
    for (const file of ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs'])
      copied['carding-car/scripts/' + file] = await copyFile(
        path.join(cardRoot, 'scripts', file),
        path.join(session, 'games/local/carding-car/scripts', file),
      );
    for (const input of inputs) await writeFile(path.join(projectRoot, input.file), input.output);
    let extension;
    for (const owner of [gameRoot, cardRoot]) {
      const extensionSource = path.join(owner, 'extensions/biligame-builder');
      const exists = await lstat(extensionSource).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (!exists) continue;
      const files = await copyTree(
        extensionSource,
        path.join(projectRoot, 'extensions/biligame-builder'),
      );
      extension = {
        source: extensionSource,
        files,
        inventorySha256: sha(JSON.stringify(files)),
        authenticityVerified: false,
      };
      break;
    }
    const sourceHash = await artifact.sourceHash(projectRoot);
    if ((await artifact.sourceHash(gameRoot)) !== canonicalSourceHash)
      throw Error('Canonical Night inputs changed during staging.');
    for (const input of inputs)
      if (sha(await readFile(path.join(gameRoot, input.file))) !== input.canonicalSha256)
        throw Error('Canonical source changed during staging.');
    const adaptation = {
      version: 1,
      canonicalRoot: gameRoot,
      projectRoot,
      creator: '3.8.8',
      canonicalSourceHash,
      sourceHash,
      adaptationRecipeSha256,
      inputs: inputs.map((input) => ({
        file: input.file,
        canonicalSha256: input.canonicalSha256,
        normalizedCanonicalSha256: input.normalizedCanonicalSha256,
        nativeSha256: input.nativeSha256,
      })),
      copied,
      ...(extension ? { extension } : {}),
      creatorBuildVerified: false,
    };
    await writeFile(
      path.join(session, 'adaptation-receipt.json'),
      JSON.stringify(adaptation, null, 2),
    );
    return { projectRoot, canonicalSourceHash, sourceHash, adaptationRecipeSha256, adaptation };
  } catch (error) {
    await rm(session, { recursive: true, force: true });
    throw error;
  }
}
