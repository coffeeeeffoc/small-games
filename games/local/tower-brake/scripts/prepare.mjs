import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export const sceneUuid = 'a61b756d-39e8-42f7-bc63-22a01979c082';
export const componentUuid = 'cd17eaaf-b7b9-4218-8f85-088cf8c8ca54';
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
  await mkdir(path.join(root, 'assets/resources'), { recursive: true });
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
      _name: 'TowerBrake',
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
        __uuid__: 'b6a21aa0-fb1a-471d-ac8c-f4cf75bc0123',
        __expectedType__: 'cc.Material',
      },
    },
  ];
  await writeFile(
    path.join(root, 'assets/scenes/main.scene'),
    JSON.stringify(scene, null, 2) + '\n',
  );
  for (const [name, frequency] of Object.entries({
    pass: 880,
    brake: 330,
    bounce: 440,
    lost: 150,
    won: 660,
    wind: 0,
  })) {
    const rate = 16000,
      count = name === 'wind' ? rate * 2 : Math.round(rate * 0.24),
      bytes = Buffer.alloc(44 + count * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24);
    bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(count * 2, 40);
    let noise = 0,
      seed = 17;
    for (let i = 0; i < count; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noise = noise * 0.96 + (seed / 4294967296 - 0.5) * 0.04;
      const t = i / rate,
        envelope = Math.sin((Math.PI * i) / count) ** 2;
      const value = frequency
        ? Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 15) * envelope
        : noise * envelope;
      bytes.writeInt16LE(Math.round(value * 14000), 44 + i * 2);
    }
    await writeFile(path.join(root, 'assets/resources', name + '.wav'), bytes);
  }
  await mkdir(path.join(root, 'assets/scripts/core'), { recursive: true });
  for (const name of ['engine', 'levels', 'progress', 'geometry']) {
    const source = await readFile(path.join(root, name + '.mjs'), 'utf8');
    await writeFile(
      path.join(root, 'assets/scripts/core', name + '.js'),
      source.replaceAll(".mjs'", ".js'"),
    );
  }
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
      .update('tower-brake:' + relative)
      .digest('hex');
    const uuid = relative.endsWith('TowerBrake.ts')
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
          '.scene': 'scene',
          '.wav': 'audio-clip',
        }[ext];
    if (!importer) continue;
    const ver = {
      directory: '1.2.0',
      typescript: '4.0.24',
      javascript: '4.0.24',
      image: '1.0.27',
      scene: '1.1.50',
      'audio-clip': '1.0.12',
    }[importer];
    const meta = { ver, importer, imported: true, uuid, files: [], subMetas: {}, userData: {} };
    if (ext === '.png') {
      meta.files = ['.json', '.png'];
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
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
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
