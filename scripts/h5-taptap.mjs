import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, stat, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { h5AdGames, prepareH5Ads } from './h5-ad-config.mjs';
import { prepareH5Service } from './competition-h5-service.mjs';
import { inventory, zipInventory, digest } from '../apps/shell-minigame/scripts/taptap-package.mjs';

const { values } = parseArgs({
  options: {
    game: { type: 'string', default: 'all' },
    matrix: { type: 'boolean' },
    'with-ads': { type: 'boolean' },
    'without-ads': { type: 'boolean' },
    'with-service': { type: 'boolean' },
    'without-service': { type: 'boolean' },
    local: { type: 'boolean' },
    output: { type: 'string' },
  },
});
const root = fileURLToPath(new URL('../', import.meta.url));
const games = values.game === 'all' ? h5AdGames : [values.game];
assert(
  games.every((game) => h5AdGames.includes(game)),
  'Unknown H5 game',
);
assert(!(values['with-ads'] && values['without-ads']), 'Choose an advertising mode');
assert(!(values['with-service'] && values['without-service']), 'Choose a service mode');
const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const submoduleSHA = execFileSync(
  'git',
  ['-C', 'games/submodules/xiangqi-five', 'rev-parse', 'HEAD'],
  { cwd: root, encoding: 'utf8' },
).trim();
assert.equal(
  execFileSync('git', ['status', '--porcelain', '--ignore-submodules=none'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  '',
  'Commit source changes before packaging',
);
const output = path.resolve(
  root,
  values.output || `outputs/h5-taptap/${sourceSHA.slice(0, 12)}-${Date.now()}`,
);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const modes = values.matrix
  ? [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]
  : [
      [
        values['with-ads'] || (!values['without-ads'] && process.env.H5_ADS_ENABLED === '1'),
        values['with-service'] ||
          (!values['without-service'] && process.env.COMPETITION_SERVICE_ENABLED === '1'),
      ],
    ];
const manifests = [];
for (const game of games)
  for (const [ads, service] of modes) {
    const name = `${game}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`;
    const directory = path.join(output, name),
      dist = path.join(directory, 'dist');
    const gameRoot = path.join(
      root,
      game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}`,
    );
    const env = {
      ...process.env,
      H5_ADS_ENABLED: ads ? '1' : '0',
      COMPETITION_SERVICE_ENABLED: service ? '1' : '0',
    };
    const resolvedGame = await realpath(gameRoot);
    assert.equal(path.relative(root, resolvedGame).startsWith('..'), false);
    const buildOutput = path.resolve(resolvedGame, 'dist');
    assert.equal(path.dirname(buildOutput), resolvedGame);
    const existingOutput = await realpath(buildOutput).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existingOutput)
      assert.equal(existingOutput, buildOutput, 'Generated output cannot be a link');
    // Remove only this game's generated output so removed sources cannot leak into a ZIP.
    await rm(buildOutput, { recursive: true, force: true });
    execFileSync(process.execPath, [game === 'xiangqi-five' ? 'build.js' : 'scripts/build.mjs'], {
      cwd: gameRoot,
      env,
      stdio: 'inherit',
    });
    await mkdir(directory);
    await cp(buildOutput, dist, { recursive: true });
    const adConfig = await prepareH5Ads(game, dist, { env });
    const serviceConfig = await prepareH5Service(game, dist, { env, local: Boolean(values.local) });
    const files = await inventory(dist);
    assert(files.some((file) => file.path === 'index.html'));
    const zip = path.join(output, `${name}.zip`);
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($env:H5_ZIP_OUTPUT, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in ($env:H5_ZIP_FILES | ConvertFrom-Json)) {
    $entry = $archive.CreateEntry(('dist/' + $file.path), [IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [DateTimeOffset]::Parse('2000-01-01T00:00:00Z')
    $inputStream = [IO.File]::OpenRead((Join-Path $env:H5_ZIP_SOURCE ('dist/' + $file.path)))
    try { $entryStream = $entry.Open(); try { $inputStream.CopyTo($entryStream) } finally { $entryStream.Dispose() } }
    finally { $inputStream.Dispose() }
  }
} finally { $archive.Dispose() }`,
      ],
      {
        env: {
          ...process.env,
          H5_ZIP_SOURCE: directory,
          H5_ZIP_OUTPUT: zip,
          H5_ZIP_FILES: JSON.stringify(files),
        },
        stdio: 'inherit',
      },
    );
    const bytes = await readFile(zip);
    assert.deepEqual(
      zipInventory(bytes),
      files
        .map((file) => ({ ...file, path: 'dist/' + file.path }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      'ZIP must exactly match this variant',
    );
    const manifest = {
      name,
      game,
      packageType: 'h5',
      entry: 'dist/index.html',
      adsEnabled: ads,
      adMode: adConfig.adMode,
      adUnitConfigured: Boolean(adConfig.adUnitId),
      serviceEnabled: service,
      apiUrl: serviceConfig.apiUrl,
      localValidation: Boolean(values.local),
      sourceSHA,
      submoduleSHA,
      zip: path.basename(zip),
      bytes: (await stat(zip)).size,
      sha256: digest(bytes),
      files,
      realAdsVerified: false,
      realDeviceVerified: false,
    };
    await writeFile(path.join(output, `${name}.json`), JSON.stringify(manifest, null, 2) + '\n');
    manifests.push(manifest);
    console.log(`Verified ${name}: ${manifest.sha256}`);
  }
await writeFile(
  path.join(output, 'matrix.json'),
  JSON.stringify({ sourceSHA, submoduleSHA, variants: manifests }, null, 2) + '\n',
);
console.log(`H5_MATRIX ${output}`);
