import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { installTapTapLogin } from './taptap-login.mjs';
import {
  digest,
  inventory,
  tapIdentity,
  verifyTapProject,
  verifyOfficialPackage,
  zipInventory,
} from './taptap-package.mjs';

// Synthetic ZIP fixtures exercise the auditor only. They are not TapTap SDKs,
// official-tool outputs, uploadable game packages or device validation.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries, { method = 8, symlinkEntry, descriptor } = {}) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name),
      bytes = Buffer.from(value),
      encoded = method === 8 ? deflateRawSync(bytes) : bytes;
    const header = Buffer.alloc(30),
      directory = Buffer.alloc(46),
      crc = crc32(bytes);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(encoded.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(encoded.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(((name === symlinkEntry ? 0xa000 : 0x8000) << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    let footer = Buffer.alloc(0);
    if (descriptor) {
      header.writeUInt16LE(8, 6);
      header.fill(0, 14, 26);
      directory.writeUInt16LE(8, 8);
      const signed = descriptor === 'signed';
      footer = Buffer.alloc(signed ? 16 : 12);
      const at = signed ? 4 : 0;
      if (signed) footer.writeUInt32LE(0x08074b50);
      footer.writeUInt32LE(crc, at);
      footer.writeUInt32LE(encoded.length, at + 4);
      footer.writeUInt32LE(bytes.length, at + 8);
    }
    local.push(header, filename, encoded, footer);
    central.push(directory, filename);
    offset += header.length + filename.length + encoded.length + footer.length;
  }
  const records = Buffer.concat(central),
    footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(entries.length, 8);
  footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(records.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, records, footer]);
}
async function withFixture(fn) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'tap-package-audit-'));
  try {
    const projectDirectory = path.join(base, 'project');
    await mkdir(projectDirectory);
    const entries = [
      ['game.js', 'const sdk=typeof tap === "undefined" ? undefined : tap; sdk.createCanvas();'],
      ['game.json', JSON.stringify({ deviceOrientation: 'portrait', appId: '' })],
      ['project.config.json', JSON.stringify({ appid: '' })],
      ['texture.bin', Buffer.from([0, 1, 255])],
    ];
    for (const [name, bytes] of entries) await writeFile(path.join(projectDirectory, name), bytes);
    const packageFile = path.join(base, 'game.zip'),
      officialToolPath = path.join(base, 'synthetic-tool-evidence');
    await writeFile(packageFile, zip(entries));
    await writeFile(officialToolPath, 'synthetic test input, not an official tool');
    const verifiedProjectInventory = await inventory(projectDirectory);
    await fn({
      base,
      entries,
      projectDirectory,
      packageFile,
      officialToolPath,
      verifiedProjectInventory,
      currentSourceHash: digest(JSON.stringify(verifiedProjectInventory)),
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}
test('TapTap preview uses no fake ID and release requires a real configured token', () => {
  assert.equal(tapIdentity('').previewOnly, true);
  assert.equal(tapIdentity('public_opaque_id', 'release').appId, 'public_opaque_id');
  assert.throws(() => tapIdentity('', 'release'), /requires a configured/);
  assert.throws(() => tapIdentity('token with spaces'), /Invalid public/);
});
test('real source entry global guards survive CJS lowering and SDK arguments', () =>
  withFixture(async (options) => {
    for (const entry of [
      'const raw=typeof tap==="undefined"?undefined:tap;',
      'var raw = typeof tap === "undefined" ? void 0 : tap;',
      "var sdks = { taptap: typeof tap !== 'undefined' ? tap : undefined };",
      'startGame(typeof tap === "undefined" ? void 0 : tap, {});',
      'var raw = "undefined" === typeof tap ? void 0 : tap;',
      'var VO=typeof tap>`u`?void 0:tap,HO={platform:`taptap`};',
    ]) {
      await writeFile(path.join(options.projectDirectory, 'game.js'), entry);
      const result = await verifyTapProject({ directory: options.projectDirectory });
      assert.equal(result.officialToolVerified, false);
      assert.equal(result.realDeviceVerified, false);
    }
  }));
test('full ZIP bytes bind the imported package to current source without authenticating the tool', () =>
  withFixture(async (options) => {
    const result = await verifyOfficialPackage(options);
    assert.equal(result.status, 'supplied-package-integrity-verified');
    assert.equal(result.sha256, digest(await readFile(options.packageFile)));
    assert.deepEqual(result.files, options.verifiedProjectInventory);
    assert.equal(result.officialToolVerified, false);
    assert.equal(result.tool.authenticityVerified, false);
  }));
test('renamed WeChat and APK content cannot establish a TapTap source package', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.projectDirectory, 'game.js'),
      'wx.createCanvas(); // tap.createCanvas();',
    );
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /no reachable tap API boundary/,
    );
    await writeFile(
      path.join(options.projectDirectory, 'game.js'),
      'const doc="tap.createCanvas()";wx.createCanvas();',
    );
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /no reachable tap API boundary/,
    );
    await writeFile(path.join(options.projectDirectory, 'game.js'), 'tap.createCanvas();');
    await writeFile(path.join(options.projectDirectory, 'AndroidManifest.xml'), 'APK');
    await assert.rejects(verifyTapProject({ directory: options.projectDirectory }), /APK content/);
  }));
test('runtime boundary must be reachable from game.js through existing local imports', () =>
  withFixture(async (options) => {
    await writeFile(path.join(options.projectDirectory, 'game.js'), "require('./adapter.js');");
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /dependency missing/,
    );
    await writeFile(path.join(options.projectDirectory, 'adapter.js'), 'tap.createCanvas();');
    await verifyTapProject({ directory: options.projectDirectory });
    await writeFile(path.join(options.projectDirectory, 'game.js'), 'ks.createCanvas();');
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /no reachable tap API boundary/,
    );
  }));
test('ZIP tampering, omitted resources and stale source inventories fail independently', () =>
  withFixture(async (options) => {
    await writeFile(
      options.packageFile,
      zip(options.entries.filter(([name]) => name !== 'texture.bin')),
    );
    await assert.rejects(verifyOfficialPackage(options), /does not match/);
    await writeFile(
      options.packageFile,
      zip(
        options.entries.map(([name, bytes]) => [name, name === 'texture.bin' ? 'tampered' : bytes]),
      ),
    );
    await assert.rejects(verifyOfficialPackage(options), /does not match/);
    await writeFile(options.packageFile, zip(options.entries));
    await writeFile(path.join(options.projectDirectory, 'texture.bin'), 'new source');
    await assert.rejects(verifyOfficialPackage(options), /source project integrity mismatch/);
  }));
test('tool configuration and trusted source provenance cannot be omitted', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyOfficialPackage({ ...options, officialToolPath: undefined }),
      /actual official TapTap packing tool/,
    );
    await assert.rejects(
      verifyOfficialPackage({ ...options, currentSourceHash: '' }),
      /fingerprint required/,
    );
    await assert.rejects(
      verifyOfficialPackage({ ...options, verifiedProjectInventory: [] }),
      /Trusted TapTap source inventory/,
    );
  }));
test('release ZIP audit requires the current login helper and exact configured Tap identity/API', () =>
  withFixture(async (options) => {
    const config = {
      platform: 'taptap',
      game: 'carding-car',
      appId: 'public_id',
      apiUrl: 'https://runtime.example.invalid',
      preview: false,
    };
    await writeFile(
      path.join(options.projectDirectory, 'game.json'),
      JSON.stringify({ deviceOrientation: 'portrait', appId: config.appId }),
    );
    await writeFile(
      path.join(options.projectDirectory, 'project.config.json'),
      JSON.stringify({ appid: config.appId }),
    );
    let files = await inventory(options.projectDirectory);
    await assert.rejects(
      verifyOfficialPackage({
        ...options,
        ...config,
        mode: 'release',
        verifiedProjectInventory: files,
      }),
      /tap-login.js/,
    );
    await installTapTapLogin(options.projectDirectory, config);
    files = await inventory(options.projectDirectory);
    const entries = await Promise.all(
      files.map(async (file) => [
        file.path,
        await readFile(path.join(options.projectDirectory, file.path)),
      ]),
    );
    await writeFile(options.packageFile, zip(entries));
    await assert.rejects(
      verifyOfficialPackage({
        ...options,
        ...config,
        mode: 'release',
        apiUrl: '',
        verifiedProjectInventory: files,
      }),
      /server login API URL/,
    );
    const result = await verifyOfficialPackage({
      ...options,
      ...config,
      mode: 'release',
      verifiedProjectInventory: files,
    });
    assert.equal(result.login.configured, true);
    assert.equal(result.loginPublicConfig.platform, 'taptap');
    assert.equal(result.officialToolVerified, false);
    await assert.rejects(
      verifyOfficialPackage({
        ...options,
        ...config,
        mode: 'release',
        game: 'night-overwatch',
        verifiedProjectInventory: files,
      }),
      /login bootstrap differs/,
    );
  }));
test('ZIP traversal, duplicate paths, symlinks, local-header mismatches and CRC corruption are rejected', () => {
  assert.throws(
    () => zipInventory(zip([['../game.js', 'tap.createCanvas();']])),
    /Unsafe TapTap package path/,
  );
  assert.throws(
    () =>
      zipInventory(
        zip([
          ['game.js', 'one'],
          ['game.js', 'two'],
        ]),
      ),
    /Duplicate/,
  );
  assert.throws(
    () => zipInventory(zip([['game.js', 'one']], { symlinkEntry: 'game.js' })),
    /symlink/,
  );
  const badLocal = zip([['game.js', 'one']], { method: 0 });
  badLocal.writeUInt32LE(9, 22);
  assert.throws(() => zipInventory(badLocal), /local CRC or size mismatch/);
  const missingDescriptor = zip([['game.js', 'one']], { method: 0 });
  missingDescriptor.writeUInt16LE(8, 6);
  missingDescriptor.writeUInt16LE(8, 30 + 'game.js'.length + 3 + 8);
  assert.throws(() => zipInventory(missingDescriptor), /descriptor mismatch or missing/);
  const corrupt = zip([['game.js', 'one']], { method: 0 });
  corrupt[30 + 'game.js'.length] ^= 1;
  assert.throws(() => zipInventory(corrupt), /CRC or size mismatch/);
});
test('compressed expansion is limited before inflation and stored ZIPs retain binary hashes', () => {
  assert.throws(
    () => zipInventory(zip([['big.bin', Buffer.alloc(1024 * 1024)]]), { maxBytes: 1024 }),
    /expanded package budget/,
  );
  const bytes = Buffer.from([0, 97, 115, 109, 255]);
  assert.deepEqual(zipInventory(zip([['engine.wasm', bytes]], { method: 0 })), [
    { path: 'engine.wasm', bytes: bytes.length, sha256: digest(bytes) },
  ]);
});
test('streamed ZIPs require complete signed or unsigned data descriptors with matching bytes', () => {
  for (const descriptor of ['signed', 'unsigned']) {
    const bytes = zip([['game.js', 'tap.createCanvas();']], { method: 0, descriptor });
    assert.equal(zipInventory(bytes)[0].sha256, digest('tap.createCanvas();'));
    const descriptorStart = 30 + 'game.js'.length + 'tap.createCanvas();'.length;
    bytes[descriptorStart + (descriptor === 'signed' ? 4 : 0)] ^= 1;
    assert.throws(() => zipInventory(bytes), /descriptor mismatch/);
  }
});
test('unsafe filesystem paths, identity mismatch and unsafe subpackages are rejected', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.projectDirectory, 'game.json'),
      JSON.stringify({ deviceOrientation: 'portrait', appId: 'touristappid' }),
    );
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /AppID mismatch/,
    );
    await writeFile(
      path.join(options.projectDirectory, 'game.json'),
      JSON.stringify({ deviceOrientation: 'portrait', subPackages: [{ root: '../outside' }] }),
    );
    await assert.rejects(
      verifyTapProject({ directory: options.projectDirectory }),
      /Unsafe TapTap package path/,
    );
    const linked = path.join(options.base, 'linked');
    await symlink(
      options.projectDirectory,
      linked,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(verifyTapProject({ directory: linked }), /symlink/);
  }));
