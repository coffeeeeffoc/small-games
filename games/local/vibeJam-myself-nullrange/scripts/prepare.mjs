import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeSoundBank } from './sound-bank.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export const sceneUuid = '0dcf0c53-f0f9-48cd-a4d6-841508e72db5';
export const componentUuid = '70a75132-38e7-4b37-8b65-dff0a4870b7e';
export function compressedUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const value = parseInt(hex.slice(i, i + 3), 16);
    result += chars[value >> 6] + chars[value & 63];
  }
  return result;
}
export async function prepare() {
  await mkdir(path.join(root, 'assets/scenes'), { recursive: true });
  await mkdir(path.join(root, 'assets/resources/audio'), { recursive: true });
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
      _name: 'NullRange',
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
      surface: {
        __uuid__: '4f067038-bae5-4c45-bc65-3096869d7d3b',
        __expectedType__: 'cc.Material',
      },
    },
  ];
  await writeFile(
    path.join(root, 'assets/scenes/main.scene'),
    JSON.stringify(scene, null, 2) + '\n',
  );
  await writeSoundBank(path.join(root, 'assets/resources/audio'));
  const entries = await readdir(path.join(root, 'assets'), {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.name.endsWith('.meta')) continue;
    const file = path.join(entry.parentPath, entry.name);
    try {
      await access(file + '.meta');
      continue;
    } catch {}
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const hash = createHash('md5')
      .update('nullrange:' + relative)
      .digest('hex');
    const uuid = relative.endsWith('NullRange.ts')
      ? componentUuid
      : relative.endsWith('main.scene')
        ? sceneUuid
        : `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
    const ext = path.extname(file);
    const importer = entry.isDirectory()
      ? 'directory'
      : {
          '.ts': 'typescript',
          '.js': 'javascript',
          '.png': 'image',
          '.jpg': 'image',
          '.effect': 'effect',
          '.scene': 'scene',
          '.wav': 'audio-clip',
          '.mtl': 'material',
        }[ext];
    if (!importer) continue;
    const ver = {
      directory: '1.2.0',
      typescript: '4.0.24',
      javascript: '4.0.24',
      image: '1.0.27',
      scene: '1.1.50',
      'audio-clip': '1.0.12',
      material: '1.0.21',
      effect: '1.7.1',
    }[importer];
    const meta = { ver, importer, imported: true, uuid, files: [], subMetas: {}, userData: {} };
    if (ext === '.png' || ext === '.jpg') {
      meta.files = ['.json', ext];
      meta.userData = { type: 'texture', hasAlpha: false, redirect: uuid + '@6c48a' };
      meta.subMetas['6c48a'] = {
        ver: '1.0.22',
        importer: 'texture',
        imported: true,
        uuid: uuid + '@6c48a',
        files: ['.json'],
        subMetas: {},
        id: '6c48a',
        name: 'texture',
        displayName: entry.name.slice(0, -4),
        userData: {
          wrapModeS: entry.name.includes('panorama') ? 'clamp-to-edge' : 'repeat',
          wrapModeT: entry.name.includes('panorama') ? 'clamp-to-edge' : 'repeat',
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'linear',
          anisotropy: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: uuid,
          visible: false,
        },
      };
    }
    await writeFile(file + '.meta', JSON.stringify(meta, null, 2) + '\n');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepare();
