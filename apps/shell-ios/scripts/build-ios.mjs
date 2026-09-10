import { spawnSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin')
  throw new Error('iOS builds require macOS and Xcode. Use the Mobile workflow on GitHub Actions.');
const directory = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, cwd = directory) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.status}`);
}
run('pnpm', ['build:pages'], fileURLToPath(new URL('../../../', import.meta.url)));
await rm(new URL('../web/', import.meta.url), { recursive: true, force: true });
await cp(new URL('../../shell-web/dist/', import.meta.url), new URL('../web/', import.meta.url), {
  recursive: true,
  filter: (source) => !source.replaceAll('\\', '/').includes('/dist/mobile'),
});
const archive = process.argv.includes('--archive');
const signed = process.argv.includes('--signed');
if (
  signed &&
  (!archive ||
    !process.env.IOS_TEAM_ID ||
    !process.env.IOS_PROFILE_NAME ||
    !process.env.IOS_EXPORT_OPTIONS)
)
  throw new Error(
    '--signed requires --archive, IOS_TEAM_ID, IOS_PROFILE_NAME and IOS_EXPORT_OPTIONS',
  );
const settings = [
  'ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon',
  `CURRENT_PROJECT_VERSION=${process.env.IOS_BUILD_NUMBER ?? '2'}`,
  `MARKETING_VERSION=${process.env.APP_VERSION ?? '0.2.0'}`,
  ...(signed
    ? [
        `DEVELOPMENT_TEAM=${process.env.IOS_TEAM_ID}`,
        'CODE_SIGN_STYLE=Manual',
        `PROVISIONING_PROFILE_SPECIFIER=${process.env.IOS_PROFILE_NAME}`,
        'CODE_SIGN_IDENTITY=Apple Distribution',
      ]
    : ['CODE_SIGNING_ALLOWED=NO']),
];
run('xcodebuild', [
  '-project',
  'SmallGames.xcodeproj',
  '-scheme',
  'SmallGames',
  '-configuration',
  'Release',
  '-destination',
  archive ? 'generic/platform=iOS' : 'generic/platform=iOS Simulator',
  ...(archive
    ? ['-archivePath', 'dist/SmallGames.xcarchive', 'archive']
    : ['-derivedDataPath', 'build', 'build']),
  ...settings,
]);
if (signed)
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    'dist/SmallGames.xcarchive',
    '-exportPath',
    'dist',
    '-exportOptionsPlist',
    process.env.IOS_EXPORT_OPTIONS,
  ]);
else if (!archive) {
  await cp(
    new URL('../build/Build/Products/Release-iphonesimulator/SmallGames.app/', import.meta.url),
    new URL('../dist/SmallGames.app/', import.meta.url),
    { recursive: true },
  );
  run('ditto', [
    '-c',
    '-k',
    '--keepParent',
    'dist/SmallGames.app',
    'dist/SmallGames-simulator.zip',
  ]);
}
