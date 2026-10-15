import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { root, games } from './config.mjs';
import { verifyArtifact, verifyCreatorOutput } from './build.mjs';
import { inventory, relativeFile } from '../../../apps/shell-minigame/scripts/taptap-package.mjs';

// Official DevTools does the conversion. This command verifies supplied bytes;
// it neither authors kwaiadapter.js nor calls the result device-verified.
const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    directory: { type: 'string' },
    'project-file': { type: 'string' },
    'appid-field': { type: 'string' },
  },
});
assert(
  values.game &&
    values.directory &&
    values['project-file'] &&
    ['appid', 'appId'].includes(values['appid-field']),
  'Required: --game ID --directory REAL_CONVERTED_DIR --project-file ACTUAL_FILE --appid-field appid|appId',
);
assert(Object.hasOwn(games, values.game), 'Unknown game');
const receiptPath = path.join(root, values.game, 'build/kuaishou.receipt.json');
const source = path.join(root, values.game, 'build/kuaishou-source');
const receipt = await verifyArtifact(source, receiptPath);
assert.equal(receipt.config.platform, 'kuaishou');
const converted = path.resolve(values.directory);
assert(
  converted !== source &&
    !converted.startsWith(source + path.sep) &&
    !source.startsWith(converted + path.sep),
  'Converted package must be separate from source',
);
const files = await inventory(converted),
  byPath = new Map(files.map((f) => [f.path, f]));
const projectFile = relativeFile(values['project-file']);
const mutable = new Set(['game.js', 'game.json', 'project.config.json', projectFile]);
for (const file of receipt.files)
  if (!mutable.has(file.path))
    assert.deepEqual(
      byPath.get(file.path),
      file,
      `Converted engine/resource changed: ${file.path}`,
    );
const sourceEntry = await readFile(path.join(source, 'game.js'), 'utf8');
const entry = await readFile(path.join(converted, 'game.js'), 'utf8');
const adapterRequire = /\brequire\s*\(\s*['"](?:\.\/)?kwaiadapter\.js['"]\s*\)\s*;?/g;
assert(adapterRequire.test(entry), 'Real converted entry must import kwaiadapter.js');
assert.equal(
  entry.replace(adapterRequire, '').trim(),
  sourceEntry.trim(),
  'Converted Creator entry changed beyond official adapter import; review the new conversion format first',
);
const adapter = await readFile(path.join(converted, 'kwaiadapter.js'), 'utf8');
assert(
  /\bks\s*(?:\.|\[)|\b(?:globalThis|window|GameGlobal)\s*\.\s*ks\b/.test(
    adapter.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''),
  ),
  'Kuaishou SDK boundary missing',
);
const project = JSON.parse(await readFile(path.join(converted, projectFile), 'utf8'));
assert.equal(
  project[values['appid-field']],
  receipt.config.appId || 'kwai_game_test_appid',
  'Converted AppID mismatch',
);
const checked = await verifyCreatorOutput(converted, receipt.config);
await writeFile(
  path.join(root, values.game, 'build/kuaishou-converted.receipt.json'),
  JSON.stringify(
    {
      ...receipt,
      files: checked.files,
      status: 'converted-integrity-checked-host-unverified',
      realDeviceVerified: false,
      officialToolVerified: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Converted Kuaishou bytes verified; official-tool origin and device acceptance remain unverified:',
  converted,
);
