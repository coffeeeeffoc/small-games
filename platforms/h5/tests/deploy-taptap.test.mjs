import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';

test(
  'H5 manifest enforces portrait, rejects mismatched archives and never defaults preserve orientation',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'taptap-h5-orientation-'));
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const uploader = fileURLToPath(new URL('../deploy-taptap.ps1', import.meta.url));
    try {
      const zip = path.join(directory, 'game.zip'),
        manifest = path.join(directory, 'game.json');
      const bytes = Buffer.from('no live upload');
      await writeFile(zip, bytes);
      await writeFile(
        manifest,
        JSON.stringify({
          game: 'xiangqi-five',
          packageType: 'h5',
          entry: 'dist/index.html',
          zip: 'game.zip',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          orientation: 'portrait',
        }),
      );
      const script = `
$ErrorActionPreference='Stop'
$global:probes=0
$global:uploads=0
function taptap-cli {
  $global:LASTEXITCODE=0
  if ($args[0] -eq 'package-management') { $global:probes++; return '{"ok":true,"data":{"status":"completed","result":{"available_package_types":["h5"]}}}' }
  $global:uploads++
  if ($args[$args.IndexOf('--screen-orientation')+1] -ne '1') { throw 'Portrait was not passed' }
  return '{"ok":true,"data":{"status":"completed"}}'
}
function Reject-BeforeCli($arguments) {
  $before=$global:probes
  $rejected=$false
  try { & ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -DryRun @arguments } catch { $rejected=$true }
  if (!$rejected -or $global:probes -ne $before) { throw 'Invalid orientation/manifest reached CLI' }
}
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -DryRun
Reject-BeforeCli @{ScreenOrientation=0}
$m=Get-Content -Raw -LiteralPath ${quote(manifest)} | ConvertFrom-Json
$m.game='cops-robbers-realtime'; $m.orientation='preserve'
$m | ConvertTo-Json | Set-Content -LiteralPath ${quote(manifest)}
Reject-BeforeCli @{}
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1 -DryRun
$m.sha256='wrong'; $m | ConvertTo-Json | Set-Content -LiteralPath ${quote(manifest)}
Reject-BeforeCli @{ScreenOrientation=1}
Remove-Item -LiteralPath ${quote(manifest)}
Reject-BeforeCli @{}
if ($global:uploads -ne 2) { throw 'Unexpected upload count' }
`;
      const source = path.join(directory, 'check.ps1');
      await writeFile(source, script);
      const result = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', source],
        { encoding: 'utf8', timeout: 30000 },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
      assert.equal(path.dirname(directory), os.tmpdir());
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  'H5 uploader passes exact package/channel parameters, preserves intent, and never submits review',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'taptap-h5-'));
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const uploader = fileURLToPath(new URL('../deploy-taptap.ps1', import.meta.url));
    try {
      const zip = path.join(directory, 'game with spaces.zip');
      await writeFile(zip, 'zip fixture: no live upload');
      const script = `
$ErrorActionPreference = 'Stop'
$global:calls = @()
$global:probes = @()
function taptap-cli {
  if ($args[0] -eq 'package-management') {
    $global:probes += ,@($args)
    $global:LASTEXITCODE = 0
    return '{"ok":true,"data":{"status":"completed","result":{"available_package_types":["mini_app","h5"]}}}'
  }
  $global:calls += ,@($args)
  if (!(Test-Path -LiteralPath $args[1])) { throw 'ZIP must be inside CLI cwd' }
  $global:LASTEXITCODE = 0
  if ($global:fail) { return '{"ok":false,"error":{"code":"FAILED"}}' }
  return '{"ok":true,"data":{"status":"completed","version_id":"fixture"}}'
}
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1 -DryRun
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1
if ($global:calls.Count -ne 2) { throw 'Exact successful upload must be reused' }
if ($global:probes.Count -ne 2) { throw 'Every new upload or preview needs a package-type check; successful receipts need no new upload' }
foreach ($probe in $global:probes) {
  if ($probe[1] -ne 'get-available-package-types' -or $probe -contains '--yes') { throw 'Package-type check must be read-only' }
  if ($probe[$probe.IndexOf('--app-id')+1] -ne '456' -or $probe[$probe.IndexOf('--dev-id')+1] -ne '123') { throw 'Package-type check must use the upload account and app' }
}
if ($global:calls[0] -notcontains '--dry-run' -or $global:calls[0] -contains '--yes') { throw 'Preview cannot upload' }
if ($global:calls[1] -notcontains '--yes') { throw 'Upload flag missing' }
if ($global:calls[1][0] -ne 'upload-h5-package' -or $global:calls[1][1] -ne 'game with spaces.zip') { throw 'Wrong channel or ZIP' }
foreach ($call in $global:calls) {
  if ($call[$call.IndexOf('--screen-orientation')+1] -ne '1') { throw 'Wrong portrait orientation' }
  if ($call[$call.IndexOf('--app-id')+1] -ne '456' -or $call[$call.IndexOf('--dev-id')+1] -ne '123') { throw 'Wrong account' }
}
if ($global:calls[0][$global:calls[0].IndexOf('--idempotency-key')+1] -ne $global:calls[1][$global:calls[1].IndexOf('--idempotency-key')+1]) { throw 'Retry intent changed' }
& ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 0
if ($global:calls.Count -ne 3 -or $global:calls[2][$global:calls[2].IndexOf('--screen-orientation')+1] -ne '0') { throw 'New orientation must not reuse the old receipt' }
if ($global:calls[1][$global:calls[1].IndexOf('--idempotency-key')+1] -eq $global:calls[2][$global:calls[2].IndexOf('--idempotency-key')+1]) { throw 'Different orientation needs a different intent' }
$rejected = $false
try { & ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId '<YOUR_ID>' -AppId 456 } catch { $rejected = $true }
if (!$rejected -or $global:calls.Count -ne 3) { throw 'Placeholder IDs must fail before CLI calls' }
$global:fail = $true
$rejected = $false
try { & ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1 -DryRun } catch { $rejected = $true }
if (!$rejected) { throw 'Structured platform failure must fail the script' }
`;
      const source = path.join(directory, 'check.ps1');
      await writeFile(source, script);
      const result = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', source],
        { encoding: 'utf8', timeout: 30000 },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const receipt = JSON.parse(await readFile(path.join(directory, 'taptap-upload.json')));
      assert.equal(receipt.uploaded, true);
      assert.equal(receipt.packageType, 'h5');
      assert.equal(receipt.reviewSubmitted, false);
      assert.equal(receipt.onlineVerified, false);
      assert.equal(receipt.appId, '456');
      assert.equal(receipt.developerId, '123');
      assert.equal(receipt.screenOrientation, 0);
      assert.match(receipt.idempotencyKey, /^h5-123-456-0-[a-f0-9]{64}$/);
      const preview = JSON.parse(
        await readFile(path.join(directory, 'taptap-upload-preview.json')),
      );
      assert.equal(preview.uploaded, false);
      assert.equal(preview.dryRun, true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  'H5 uploader stops before uploading when the app only offers mini-app packages or the capability query fails',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'taptap-package-type-'));
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const uploader = fileURLToPath(new URL('../deploy-taptap.ps1', import.meta.url));
    try {
      const zip = path.join(directory, 'h5.zip');
      await writeFile(zip, 'zip fixture: no live upload');
      const source = path.join(directory, 'check.ps1');
      await writeFile(
        source,
        `
$ErrorActionPreference = 'Stop'
$global:uploads = 0
$global:probes = 0
function taptap-cli {
  if ($args[0] -ne 'package-management' -or $args[1] -ne 'get-available-package-types') {
    $global:uploads++
    throw 'No upload is allowed without confirmed H5 support'
  }
  $global:probes++
  $global:LASTEXITCODE = $(if ($global:response -eq 'exit-failure') { 1 } else { 0 })
  return $global:response
}
$responses = @(
  '{"ok":true,"data":{"status":"completed","result":{"available_package_types":["mini_app"]}}}',
  '{"ok":true,"data":{"status":"completed","result":{"available_package_types":[]}}}',
  '{"ok":true,"data":{"status":"completed","result":{"available_package_types":"h5"}}}',
  '{"ok":true,"data":{"status":"completed","result":{}}}',
  '{"ok":true,"data":{"status":"accepted","result":{"available_package_types":["h5"]}}}',
  '{"ok":false,"error":{"code":"FORBIDDEN"}}',
  'invalid JSON',
  'exit-failure'
)
$startDirectory = (Get-Location).Path
foreach ($response in $responses) {
  $global:response = $response
  $rejected = $false
  try { & ${quote(uploader)} -ZipPath ${quote(zip)} -DeveloperId 123 -AppId 456 -ScreenOrientation 1 } catch {
    $rejected = $true
    if ($response -eq $responses[0] -and $_.Exception.Message -notlike '*cannot be uploaded as a Tap mini-app package*') { throw 'Type mismatch needs an actionable explanation' }
  }
  if (!$rejected -or $global:uploads -ne 0) { throw 'Unverified H5 capability must block uploading' }
  if ((Get-Location).Path -ne $startDirectory) { throw 'Rejected upload must preserve cwd' }
}
if ($global:probes -ne $responses.Count) { throw 'Every attempt must query capabilities' }
if (Test-Path -LiteralPath ${quote(path.join(directory, 'taptap-upload.json'))}) { throw 'Rejected attempts cannot write success receipts' }
`,
      );
      const result = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', source],
        { encoding: 'utf8', timeout: 30000 },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
