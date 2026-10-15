import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('deployment loads game .env without evaluating it, respects existing variables and works without a file', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cops deployment env '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'games/local/cops-robbers');
  const scripts = path.join(game, 'scripts');
  await mkdir(scripts, { recursive: true });
  const deploy = path.join(scripts, 'deploy-taptap.ps1');
  await copyFile(new URL('./deploy-taptap.ps1', import.meta.url), deploy);
  await writeFile(path.join(scripts, 'package-taptap.ps1'), '$global:LASTEXITCODE = 0');
  await writeFile(path.join(game, '.env'), "TAPTAP_DEVELOPER_ID=123\r\nTAPTAP_COPS_ROBBERS_APP_ID=456\r\nTAPTAP_COPS_ROBBERS_AD_UNIT_ID=slot-fixture\r\nPLAYWRIGHT_EXECUTABLE_PATH='C:\\fixture browser\\chrome.exe'\r\nCOP_ROB_CONFIG_TEST_SECRET='not imported'\r\n");
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const source = path.join(root, 'check.ps1');
  await writeFile(source, `
$ErrorActionPreference = 'Stop'
$global:seen = @()
foreach ($key in @('TAPTAP_DEVELOPER_ID','TAPTAP_COPS_ROBBERS_APP_ID','TAPTAP_COPS_ROBBERS_AD_UNIT_ID','BROWSER_EXECUTABLE','PLAYWRIGHT_EXECUTABLE_PATH','CHROMIUM_PATH','PLAYWRIGHT_BROWSERS_PATH','COP_ROB_CONFIG_TEST_SECRET')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
function node {
  if ($args[0] -like '--env-file=*') { & ${quote(process.execPath)} @args; $global:LASTEXITCODE = $LASTEXITCODE; return }
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'scripts/check-taptap-ads.mjs') {
    $global:seen += [ordered]@{ developer = $env:TAPTAP_DEVELOPER_ID; app = $env:TAPTAP_COPS_ROBBERS_APP_ID; ad = $env:TAPTAP_COPS_ROBBERS_AD_UNIT_ID; browser = $env:PLAYWRIGHT_EXECUTABLE_PATH }
    if ($env:COP_ROB_CONFIG_TEST_SECRET) { throw 'Only deployment keys may be imported' }
  }
}
& ${quote(deploy)} -PackageOnly
$env:TAPTAP_COPS_ROBBERS_APP_ID = '789'
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\\override browser.exe'
& ${quote(deploy)} -PackageOnly
[IO.File]::Delete(${quote(path.join(game, '.env'))})
foreach ($key in @('TAPTAP_DEVELOPER_ID','TAPTAP_COPS_ROBBERS_APP_ID','TAPTAP_COPS_ROBBERS_AD_UNIT_ID','PLAYWRIGHT_EXECUTABLE_PATH')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
& ${quote(deploy)} -PackageOnly
[IO.File]::WriteAllText(${quote(path.join(root, 'seen.json'))}, ($global:seen | ConvertTo-Json))
`);
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', source], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /TapTap target: H5 .*not the Tap mini-app ZIP uploader/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'seen.json'), 'utf8')), [
    { developer: '123', app: '456', ad: 'slot-fixture', browser: 'C:\\fixture browser\\chrome.exe' },
    { developer: '123', app: '789', ad: 'slot-fixture', browser: 'C:\\override browser.exe' },
    { developer: null, app: null, ad: null, browser: null },
  ]);
});
