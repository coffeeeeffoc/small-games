import { mkdir, readFile, writeFile, readdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'vite';
import { alias } from './workspace-inputs.mjs';
import { writeWorld } from './world-resources.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export const sceneUuid = '3a4d7981-9491-4229-88ed-e82ae7ac8997';
export const componentUuid = '73c17a9c-d373-4d23-8273-9725342ee11b';
export const surfaceUuid = '82e1209a-373f-4f45-a070-2328f1463a6d';
export const effectUuid = '0d59ca81-962e-41df-a58e-8a864b81bc3a';
function uuid(relative) {
  if (relative === 'assets/scenes/main.scene') return sceneUuid;
  if (relative === 'assets/scripts/CastleCannon.ts') return componentUuid;
  if (relative === 'assets/resources/castle-surface.mtl') return surfaceUuid;
  if (relative === 'assets/resources/castle.effect') return effectUuid;
  const h = createHash('md5')
    .update('castle-cannon:' + relative)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function compressedUuid(id) {
  const h = id.replaceAll('-', ''),
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = h.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const value = parseInt(h.slice(i, i + 3), 16);
    out += chars[value >> 6] + chars[value & 63];
  }
  return out;
}
export async function prepare() {
  for (const folder of ['assets/scenes', 'assets/resources', 'assets/scripts/core', 'reports'])
    await mkdir(path.join(root, folder), { recursive: true });
  const bundle = await build({
    root,
    resolve: { alias },
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir: 'assets/scripts/core',
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: path.join(root, 'src/cocos-core.ts'),
        formats: ['es'],
        fileName: () => 'core.js',
      },
    },
  });
  const chunks = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((b) => b.output ?? []);
  const modules = chunks.flatMap((c) => Object.keys(c.modules ?? {}));
  if (
    modules.some((m) =>
      /[/\\]three[/\\]|game-castle-cannon[/\\]src[/\\]index\.ts$|duel-scene/.test(m),
    )
  )
    throw Error('Legacy renderer leaked into Creator core');
  await writeFile(
    path.join(root, 'assets/scripts/core/core.d.ts'),
    `export * from ${JSON.stringify(path.relative(path.join(root, 'assets/scripts/core'), path.join(root, 'src/cocos-core.js')).replaceAll('\\', '/'))};\n`,
  );
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      ssr: path.join(root, 'scripts/bake-world.ts'),
      outDir: 'reports/baker',
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: 'bake-world.mjs' } },
    },
  });
  const { bakeWorld } = await import(
    pathToFileURL(path.join(root, 'reports/baker/bake-world.mjs')).href + '?v=' + Date.now()
  );
  const world = bakeWorld();
  await writeWorld(path.join(root, 'assets/resources'), world);
  const copiedArt = path.resolve(root, 'assets/resources/castle-cannon-art');
  if (!copiedArt.startsWith(path.resolve(root) + path.sep))
    throw Error('Invalid generated art path');
  await rm(copiedArt, { recursive: true, force: true });
  await cp(
    path.join(root, 'public/castle-cannon-art'),
    path.join(root, 'assets/resources/castle-cannon-art'),
    { recursive: true },
  );
  const scene = [
    { __type__: 'cc.SceneAsset', _name: 'main', scene: { __id__: 1 } },
    {
      __type__: 'cc.Scene',
      _name: 'main',
      _children: [{ __id__: 2 }],
      _active: true,
      _components: [],
      _prefab: null,
      _id: sceneUuid,
    },
    {
      __type__: 'cc.Node',
      _name: 'CastleCannon',
      _parent: { __id__: 1 },
      _children: [],
      _active: true,
      _components: [{ __id__: 3 }],
      _prefab: null,
      _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
      _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
      _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
      _layer: 1073741824,
    },
    {
      __type__: compressedUuid(componentUuid),
      node: { __id__: 2 },
      _enabled: true,
      surface: { __uuid__: surfaceUuid, __expectedType__: 'cc.Material' },
    },
  ];
  await writeFile(
    path.join(root, 'assets/scenes/main.scene'),
    JSON.stringify(scene, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'assets/resources/castle-surface.mtl'),
    JSON.stringify({
      __type__: 'cc.Material',
      _name: 'CastleSurface',
      _objFlags: 0,
      _native: '',
      _effectAsset: { __uuid__: effectUuid },
      _techIdx: 0,
      _defines: [],
      _props: [{ roughness: 0.85, metallic: 0 }],
    }),
  );
  for (const [name, source] of Object.entries({
    shot: 'fire',
    impact: 'break',
    win: 'win',
    lose: 'lose',
  }))
    await cp(
      path.join(root, 'public/castle-cannon-audio', source + '.wav'),
      path.join(root, 'assets/resources', name + '.wav'),
    );
  for (const entry of await readdir(path.join(root, 'assets'), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.name.endsWith('.meta') || entry.name.endsWith('.d.ts')) continue;
    const file = path.join(entry.parentPath, entry.name),
      relative = path.relative(root, file).replaceAll('\\', '/'),
      ext = path.extname(file),
      id = uuid(relative);
    const importer = entry.isDirectory()
      ? 'directory'
      : {
          '.ts': 'typescript',
          '.js': 'javascript',
          '.json': 'json',
          '.png': 'image',
          '.jpg': 'image',
          '.wav': 'audio-clip',
          '.scene': 'scene',
          '.mtl': 'material',
          '.effect': 'effect',
        }[ext];
    if (!importer) throw Error('Unknown asset importer: ' + file);
    const ver = {
      directory: '1.2.0',
      typescript: '4.0.24',
      javascript: '4.0.24',
      json: '1.0.0',
      image: '1.0.27',
      'audio-clip': '1.0.12',
      scene: '1.1.50',
      material: '1.0.21',
      effect: '1.7.1',
    }[importer];
    const meta = { ver, importer, imported: true, uuid: id, files: [], subMetas: {}, userData: {} };
    if (importer === 'image') {
      meta.files = ['.json', ext];
      meta.userData = { type: 'texture', hasAlpha: ext === '.png', redirect: id + '@6c48a' };
      meta.subMetas['6c48a'] = {
        ver: '1.0.22',
        importer: 'texture',
        imported: true,
        uuid: id + '@6c48a',
        files: ['.json'],
        subMetas: {},
        id: '6c48a',
        name: 'texture',
        displayName: path.basename(file, ext),
        userData: {
          wrapModeS: ext === '.png' ? 'clamp-to-edge' : 'repeat',
          wrapModeT: ext === '.png' ? 'clamp-to-edge' : 'repeat',
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
          anisotropy: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: id,
          visible: false,
        },
      };
    }
    const content = JSON.stringify(meta, null, 2) + '\n';
    let old = '';
    try {
      old = await readFile(file + '.meta', 'utf8');
    } catch {
      /* The first import has no metadata yet. */
    }
    if (old !== content) await writeFile(file + '.meta', content);
  }
  console.log(
    `Prepared Creator core without Three; ${Object.keys(world.geometries).length} shared geometries, ${Object.keys(world.materials).length} original materials.`,
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepare();
