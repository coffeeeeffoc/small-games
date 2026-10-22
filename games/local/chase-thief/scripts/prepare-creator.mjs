/** Materialize an actual Creator project, kept separate from the verified source-Web build. */
import { cp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url),
  out = new URL('.creator-project/', root);
const uuid = (name) => {
  const h = createHash('sha256')
    .update('chase-thief/' + name)
    .digest('hex')
    .slice(0, 32);
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
};
const entryUuid = uuid('Entry.ts'),
  sceneUuid = uuid('main.scene');
await rm(out, { recursive: true, force: true });
await mkdir(new URL('assets/scenes/', out), { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });
await writeFile(
  new URL('package.json', out),
  JSON.stringify(
    { name: 'chase-thief-creator', uuid: uuid('project'), creator: { version: '3.8.8' } },
    null,
    2,
  ),
);
await writeFile(
  new URL('assets/scripts/Entry.ts.meta', out),
  JSON.stringify({
    ver: '4.0.24',
    importer: 'typescript',
    imported: true,
    uuid: entryUuid,
    files: [],
    subMetas: {},
    userData: {},
  }),
);
const raw = entryUuid.replaceAll('-', ''),
  classId = raw.slice(0, 2) + Buffer.from(raw.slice(2), 'hex').toString('base64');
await writeFile(
  new URL('assets/scenes/main.scene', out),
  JSON.stringify(
    [
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
        _name: 'Chase',
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
      { __type__: classId, node: { __id__: 2 }, _enabled: true },
    ],
    null,
    2,
  ),
);
await writeFile(
  new URL('assets/scenes/main.scene.meta', out),
  JSON.stringify({
    ver: '1.1.50',
    importer: 'scene',
    imported: true,
    uuid: sceneUuid,
    files: ['.json'],
    subMetas: {},
    userData: {},
  }),
);
await mkdir(new URL('settings/v2/packages/', out), { recursive: true });
await writeFile(
  new URL('settings/v2/packages/project.json', out),
  JSON.stringify({ __version__: '1.0.6' }),
);
await writeFile(
  new URL('settings/v2/packages/engine.json', out),
  JSON.stringify({
    designResolution: { width: 390, height: 844, fitWidth: true, fitHeight: false },
  }),
);
console.log(
  `Creator 3.8.8 project prepared: ${fileURLToPath(out)}\nOpen assets/scenes/main.scene in Creator. This step does not validate an Editor/native build.`,
);
