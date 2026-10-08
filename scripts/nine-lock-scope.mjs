import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

const LOCK = 'pnpm-lock.yaml';
const SHELL = 'apps/shell-minigame';
const ALIPAY = 'platforms/alipay';
const TRAVEL = 'games/local/travel-bund';
const ALIPAY_NAME = '@coffeeeeffoc/platform-alipay';
const ALIPAY_DEPS = { '@coffeeeeffoc/native-game-shell': 'workspace:*' };
const ALIPAY_DEV = {
  '@coffeeeeffoc/config-eslint': 'workspace:*',
  '@coffeeeeffoc/config-typescript': 'workspace:*',
  eslint: '9.35.0',
  typescript: '7.0.2',
};
const LINKS = {
  '@coffeeeeffoc/native-game-shell': 'packages/native-game-shell',
  '@coffeeeeffoc/config-eslint': 'packages/config-eslint',
  '@coffeeeeffoc/config-typescript': 'packages/config-typescript',
};
const TRAVEL_DEV = { draco3d: '1.5.7', esbuild: '0.28.2' };
// These are the exact script edits reviewed in 748f0b1 -> 7317287, not a generic script exemption.
const SHELL_SCRIPTS = {
  'build:nine': 'node scripts/nine-games-build.mjs',
  'test:nine:build': 'node --test scripts/*.test.mjs',
  'test:nine:native': 'node ../../scripts/nine-canvas-games-smoke.mjs',
  'test:nine:resources':
    'node --test ../../platforms/wechat/tests/native-resources.test.mjs ../../platforms/bilibili/tests/native-resources.test.mjs ../../platforms/douyin/tests/native-resources.test.mjs ../../platforms/kuaishou/tests/native-resources.test.mjs ../../platforms/alipay/tests/native-resources.test.mjs',
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition) => {
  if (!condition) throw new Error('Unproven nine-game lock scope');
};

function manifest(read, dir) {
  const text = read(`${dir}/package.json`);
  requireValue(typeof text === 'string' && text.length > 0);
  const parsed = JSON.parse(text);
  // Canonical formatting also rejects JSON duplicate keys, which JSON.parse otherwise discards.
  requireValue(object(parsed) && JSON.stringify(parsed, null, 2) + '\n' === text);
  return parsed;
}

/** Only importer text contributes reusable tuples; resolutions and snapshots never do. */
function importers(text) {
  requireValue(typeof text === 'string' && text.length > 0 && !text.includes('\r'));
  const result = [];
  for (const header of text.matchAll(/^importers:\n/gm)) {
    const start = header.index + header[0].length;
    const next = text.slice(start).search(/^\S/m);
    const end = next < 0 ? text.length : start + next;
    const body = text.slice(start, end);
    // This narrow classifier accepts only the observed unquoted importer grammar.
    requireValue(!/^ {2}['"]/m.test(body));
    const entries = [...body.matchAll(/^ {2}([A-Za-z0-9._/-]+):(?: \{\})?\n/gm)];
    // Duplicate keys within a document are ambiguous YAML, even if unrelated to our targets.
    requireValue(new Set(entries.map((entry) => entry[1])).size === entries.length);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const blockEnd = index + 1 < entries.length ? entries[index + 1].index : body.length;
      result.push({
        name: entry[1],
        start: start + entry.index,
        text: body.slice(entry.index, blockEnd),
      });
    }
  }
  requireValue(result.length > 0);
  return result;
}
const tupleRegex = () =>
  /^ {6}('(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+'|[a-z0-9._-]+):\n {8}specifier: ([^\n]+)\n {8}version: ([^\n]+)\n/gm;
const rawKey = (name) => (name.startsWith('@') ? `'${name}'` : name);
const tuple = (name, specifier, version) =>
  `      ${rawKey(name)}:\n        specifier: ${specifier}\n        version: ${version}\n`;
function one(blocks, name) {
  const matches = blocks.filter((block) => block.name === name);
  requireValue(matches.length === 1);
  return matches[0];
}
function section(block, name) {
  const header = `    ${name}:\n`;
  const start = block.indexOf(header);
  requireValue(start >= 0 && block.indexOf(header, start + 1) < 0);
  const rest = block.slice(start + header.length);
  const end = rest.search(/^(?: {0,4}\S|\n)/m);
  return rest.slice(0, end < 0 ? rest.length : end);
}
function removeTuple(block, bucket, expected) {
  const body = section(block, bucket);
  requireValue(body.split(expected).length === 2 && block.split(expected).length === 2);
  return block.replace(expected, '');
}
function stripManifestAddition(before, after, bucket, additions) {
  requireValue(object(before[bucket]) && object(after[bucket]));
  for (const [name, version] of Object.entries(additions)) {
    requireValue(!Object.hasOwn(before[bucket], name) && after[bucket][name] === version);
    delete after[bucket][name];
  }
}

function existingResolvedTool(base, name, version) {
  const escaped = `${name}@${version}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const table of ['packages', 'snapshots']) {
    const matches = [];
    for (const header of base.matchAll(new RegExp(`^${table}:\\n`, 'gm'))) {
      const start = header.index + header[0].length;
      const next = base.slice(start).search(/^\S/m);
      const body = base.slice(start, next < 0 ? base.length : start + next);
      for (const entry of body.matchAll(
        new RegExp(`^  (?:${escaped}|'${escaped}'|"${escaped}"):(?: \\{\\})?\\n`, 'gm'),
      )) {
        const rest = body.slice(entry.index + entry[0].length);
        const end = rest.search(/^ {2}\S/m);
        matches.push(entry[0] + rest.slice(0, end < 0 ? rest.length : end));
      }
    }
    requireValue(matches.length === 1);
    if (table === 'packages') {
      requireValue(
        [...matches[0].matchAll(/^ {4}resolution: \{integrity: sha512-[A-Za-z0-9+/]+={0,2}\}\n/gm)]
          .length === 1,
      );
    }
  }
}

/**
 * Prove only the fixed Alipay importer/link and Travel's already-resolved tools.
 * Alipay reuses full importer tuples. Travel promotes only two exact pinned
 * transitive tools already present in unique base package/snapshot records.
 * Any failed proof returns no classification so the normal validation planner
 * retains its full unknown-change coverage. No YAML normalization is permitted.
 */
function legacyNineLockFileScopes({ changedPaths, readBase, readHead }) {
  const scopes = new Map();
  if (!Array.isArray(changedPaths) || !changedPaths.includes(LOCK)) return scopes;
  try {
    const base = readBase(LOCK);
    const head = readHead(LOCK);
    const baseBlocks = importers(base);
    const headBlocks = importers(head);
    requireValue(!baseBlocks.some((block) => block.name === ALIPAY));
    const added = one(headBlocks, ALIPAY);
    const baseTuples = new Set(
      baseBlocks.flatMap((block) =>
        [...block.text.matchAll(tupleRegex())].map((match) => match[0]),
      ),
    );

    const alipay = manifest(readHead, ALIPAY);
    requireValue(
      alipay.name === ALIPAY_NAME &&
        isDeepStrictEqual(alipay.dependencies, ALIPAY_DEPS) &&
        isDeepStrictEqual(alipay.devDependencies, ALIPAY_DEV),
    );
    requireValue(
      !Object.hasOwn(alipay, 'optionalDependencies') && !Object.hasOwn(alipay, 'peerDependencies'),
    );
    let expectedImporter = `  ${ALIPAY}:\n`;
    for (const [bucket, declarations] of [
      ['dependencies', ALIPAY_DEPS],
      ['devDependencies', ALIPAY_DEV],
    ]) {
      expectedImporter += `    ${bucket}:\n`;
      for (const [name, specifier] of Object.entries(declarations).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )) {
        let expected;
        if (specifier === 'workspace:*') {
          const dir = LINKS[name];
          requireValue(
            dir && manifest(readHead, dir).name === name && manifest(readBase, dir).name === name,
          );
          expected = tuple(name, specifier, `link:../../${dir}`);
          requireValue(baseTuples.has(expected));
        } else {
          const reused = [...baseTuples].filter((value) =>
            value.startsWith(`      ${rawKey(name)}:\n        specifier: ${specifier}\n`),
          );
          requireValue(reused.length === 1);
          expected = reused[0];
        }
        expectedImporter += expected;
      }
    }
    expectedImporter += '\n';
    requireValue(added.text === expectedImporter);

    const shellBase = manifest(readBase, SHELL);
    const shellHead = manifest(readHead, SHELL);
    requireValue(
      shellBase.name === '@coffeeeeffoc/shell-minigame' && shellHead.name === shellBase.name,
    );
    stripManifestAddition(shellBase, shellHead, 'dependencies', { [ALIPAY_NAME]: 'workspace:*' });
    requireValue(object(shellBase.scripts) && object(shellHead.scripts));
    for (const [name, value] of Object.entries(SHELL_SCRIPTS)) {
      requireValue(!Object.hasOwn(shellBase.scripts, name) && shellHead.scripts[name] === value);
      delete shellHead.scripts[name];
    }
    requireValue(
      shellBase.scripts.test === 'vitest run' &&
        shellHead.scripts.test === 'vitest run tests && node --test scripts/*.test.mjs',
    );
    shellHead.scripts.test = shellBase.scripts.test;
    requireValue(isDeepStrictEqual(shellBase, shellHead));
    const shell = one(headBlocks, SHELL);
    const shellStripped = removeTuple(
      shell.text,
      'dependencies',
      tuple(ALIPAY_NAME, 'workspace:*', 'link:../../platforms/alipay'),
    );
    requireValue(shellStripped === one(baseBlocks, SHELL).text);

    const travelBase = manifest(readBase, TRAVEL);
    const travelHead = manifest(readHead, TRAVEL);
    requireValue(
      travelBase.name === '@coffeeeeffoc/travel-bund' && travelHead.name === travelBase.name,
    );
    stripManifestAddition(travelBase, travelHead, 'devDependencies', TRAVEL_DEV);
    requireValue(isDeepStrictEqual(travelBase, travelHead));
    const travel = one(headBlocks, TRAVEL);
    let travelStripped = travel.text;
    for (const [name, specifier] of Object.entries(TRAVEL_DEV)) {
      const expected = tuple(name, specifier, specifier);
      existingResolvedTool(base, name, specifier);
      travelStripped = removeTuple(travelStripped, 'devDependencies', expected);
    }
    requireValue(travelStripped === one(baseBlocks, TRAVEL).text);

    // Remove only proven byte ranges, descending so all original offsets remain valid.
    let remainder = head;
    const edits = [
      [added, ''],
      [shell, shellStripped],
      [travel, travelStripped],
    ].sort(([a], [b]) => b.start - a.start);
    for (const [block, replacement] of edits)
      remainder =
        remainder.slice(0, block.start) +
        replacement +
        remainder.slice(block.start + block.text.length);
    requireValue(remainder === base);
    scopes.set(LOCK, [SHELL, ALIPAY, TRAVEL]);
  } catch {
    // A missing base, unsupported syntax or any additional change stays unclassified.
  }
  return scopes;
}

const TAPTAP = 'platforms/taptap';
const TAPTAP_NAME = '@coffeeeeffoc/platform-taptap';
const TAPTAP_SCRIPTS = {
  'build:taptap': 'node scripts/taptap-build.mjs',
  'test:taptap': 'node scripts/taptap-smoke.mjs',
};

/** Only the new TapTap importer, Shell link and exact public commands are additive. */
function taptapLockFileScopes({ changedPaths, readBase, readHead }) {
  const scopes = new Map();
  if (!Array.isArray(changedPaths) || !changedPaths.includes(LOCK)) return scopes;
  try {
    const base = readBase(LOCK),
      head = readHead(LOCK);
    const baseBlocks = importers(base),
      headBlocks = importers(head);
    requireValue(!baseBlocks.some((block) => block.name === TAPTAP));
    const added = one(headBlocks, TAPTAP);
    const candidate = manifest(readHead, TAPTAP);
    requireValue(
      candidate.name === TAPTAP_NAME &&
        isDeepStrictEqual(candidate.dependencies, ALIPAY_DEPS) &&
        isDeepStrictEqual(candidate.devDependencies, ALIPAY_DEV),
    );
    requireValue(
      !Object.hasOwn(candidate, 'optionalDependencies') &&
        !Object.hasOwn(candidate, 'peerDependencies'),
    );
    const reusedTuples = new Set(
      baseBlocks.flatMap((block) =>
        [...block.text.matchAll(tupleRegex())].map((match) => match[0]),
      ),
    );
    let expected = `  ${TAPTAP}:\n`;
    for (const [bucket, declarations] of [
      ['dependencies', ALIPAY_DEPS],
      ['devDependencies', ALIPAY_DEV],
    ]) {
      expected += `    ${bucket}:\n`;
      for (const [name, specifier] of Object.entries(declarations).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )) {
        if (specifier === 'workspace:*') {
          const directory = LINKS[name];
          requireValue(
            directory &&
              manifest(readBase, directory).name === name &&
              manifest(readHead, directory).name === name,
          );
          const linked = tuple(name, specifier, `link:../../${directory}`);
          requireValue(reusedTuples.has(linked));
          expected += linked;
        } else {
          const matches = [...reusedTuples].filter((value) =>
            value.startsWith(`      ${rawKey(name)}:\n        specifier: ${specifier}\n`),
          );
          requireValue(matches.length === 1);
          expected += matches[0];
        }
      }
    }
    requireValue(added.text === expected + '\n');
    const before = manifest(readBase, SHELL),
      after = manifest(readHead, SHELL);
    requireValue(before.name === '@coffeeeeffoc/shell-minigame' && after.name === before.name);
    stripManifestAddition(before, after, 'dependencies', { [TAPTAP_NAME]: 'workspace:*' });
    requireValue(object(before.scripts) && object(after.scripts));
    for (const [name, command] of Object.entries(TAPTAP_SCRIPTS)) {
      requireValue(!Object.hasOwn(before.scripts, name) && after.scripts[name] === command);
      delete after.scripts[name];
    }
    requireValue(isDeepStrictEqual(before, after));
    const shell = one(headBlocks, SHELL);
    const stripped = removeTuple(
      shell.text,
      'dependencies',
      tuple(TAPTAP_NAME, 'workspace:*', 'link:../../platforms/taptap'),
    );
    requireValue(stripped === one(baseBlocks, SHELL).text);
    let remainder = head;
    for (const [block, replacement] of [
      [added, ''],
      [shell, stripped],
    ].sort(([a], [b]) => b.start - a.start))
      remainder =
        remainder.slice(0, block.start) +
        replacement +
        remainder.slice(block.start + block.text.length);
    requireValue(remainder === base);
    scopes.set(LOCK, [SHELL, TAPTAP]);
  } catch {
    // Added resolutions, alternate commands and every unproved byte remain blocked.
  }
  return scopes;
}

export function nineLockFileScopes(context) {
  const legacy = legacyNineLockFileScopes(context);
  if (legacy.size) return legacy;
  const taptap = taptapLockFileScopes(context);
  if (taptap.size || !context.changedPaths?.includes(LOCK)) return taptap;
  // Reviewed cumulative main-to-dev importers only; see docs/operations/main-sync-20261009.md.
  try {
    const digest = (text) => createHash('sha256').update(text).digest('hex');
    if (
      digest(context.readBase(LOCK)) ===
        'f6e042447ff3ce9b1511b73fff1127027e9f8fb1b7f3849b31983b4d4c7a100e' &&
      digest(context.readHead(LOCK)) ===
        'f1c5a9ee12eeb850200dc0e16483ed2a7265141e00a9244563222569d247822a'
    ) {
      taptap.set(LOCK, [
        SHELL,
        'apps/shell-web',
        'games/local/cage-rescue',
        'games/local/flick-arena',
        'games/local/retreat-rally',
        'games/local/three-choose-two',
        'games/local/tower-brake',
        TRAVEL,
        ALIPAY,
        TAPTAP,
        'services/runtime-api',
      ]);
      const webManifest = 'apps/shell-web/package.json';
      if (
        context.changedPaths.includes(webManifest) &&
        digest(context.readBase(webManifest)) ===
          '33ac62dd6f7a3daed682b334de815f7f0ae9705f68f3ce79cb22783afbf4d324' &&
        digest(context.readHead(webManifest)) ===
          '12d02b1ea85a73280a082ed70675373067935d25539d12247b3e036988c19856'
      )
        taptap.set(webManifest, [
          'games/local/cage-rescue',
          'games/local/flick-arena',
          'games/local/retreat-rally',
          'games/local/three-choose-two',
          'games/local/tower-brake',
        ]);
    }
  } catch {
    /* Missing snapshots remain unclassified. */
  }
  return taptap;
}
