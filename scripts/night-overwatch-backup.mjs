import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Binary pipes are intentional: PowerShell text redirection corrupts custom-format pg_dump.
function docker(args, { input, env = process.env } = {}) {
  const result = spawnSync('docker', args, {
    input,
    env,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw Error('Local database verification failed at ' + args[0]);
  return result.stdout;
}
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const query = (name, text) =>
  docker(
    [
      'exec',
      '-i',
      name,
      'psql',
      '-qAtX',
      '-U',
      'platform_owner',
      '-d',
      'small_games',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: text },
  )
    .toString('utf8')
    .trim();
export async function databaseFingerprint(name) {
  const tables = JSON.parse(
    query(
      name,
      "select coalesce(json_agg(json_build_array(schemaname,tablename) order by schemaname,tablename),'[]'::json) from pg_tables where schemaname not in ('pg_catalog','information_schema') and schemaname not like 'pg_toast%';",
    ),
  );
  const result = {};
  for (const [schema, table] of tables) {
    const value = query(
      name,
      `select json_build_object('count',count(*),'digest',md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text),''))) from ${quote(schema)}.${quote(table)} t;`,
    );
    result[schema + '.' + table] = JSON.parse(value);
  }
  return result;
}
/** Stop the old Runtime before calling. Only the disposable restore container is removed. */
export async function verifyNightBackup({ postgres, work, image }) {
  assert.equal(postgres, 'night-overwatch-taptap-test-postgres-1');
  assert.match(image, /^small-games-bundle:night-[a-z0-9-]+$/);
  const directory = path.join(work, 'backup-' + Date.now()),
    restore = 'night-overwatch-restore-' + randomBytes(6).toString('hex');
  await mkdir(directory, { recursive: true });
  const source = await databaseFingerprint(postgres);
  const dump = docker(['exec', postgres, 'pg_dump', '-Fc', '-U', 'platform_owner', 'small_games']);
  assert(dump.subarray(0, 5).toString() === 'PGDMP', 'Expected binary PostgreSQL archive');
  await writeFile(path.join(directory, 'database.dump'), dump, { mode: 0o600, flag: 'wx' });
  const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('hex') };
  let started = false;
  try {
    docker(
      [
        'run',
        '-d',
        '--name',
        restore,
        '--network',
        'none',
        '-e',
        'POSTGRES_USER=platform_owner',
        '-e',
        'POSTGRES_DB=small_games',
        '-e',
        'POSTGRES_PASSWORD',
        'postgres:17.6-alpine',
      ],
      { env },
    );
    started = true;
    let ready = false;
    for (let n = 0; n < 80; n++) {
      try {
        query(restore, 'select 1;');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert(ready, 'Restore PostgreSQL was not ready');
    const roles = JSON.parse(
      query(
        postgres,
        "select coalesce(json_agg(rolname),'[]'::json) from pg_roles where rolname not like 'pg_%' and rolname<>'platform_owner';",
      ),
    );
    for (const role of roles) query(restore, `create role ${quote(role)};`);
    docker(
      [
        'exec',
        '-i',
        restore,
        'pg_restore',
        '--exit-on-error',
        '-U',
        'platform_owner',
        '-d',
        'small_games',
      ],
      { input: dump },
    );
    const restored = await databaseFingerprint(restore);
    assert.deepEqual(restored, source, 'Restored table counts/digests differ');
    // Migration is rehearsed only in the restored database, with the exact newly built Runtime image.

    const result = docker(
      [
        'run',
        '--rm',
        '-i',
        '--network',
        'container:' + restore,
        '-e',
        'RUNTIME_DATABASE_URL',
        image,
        'node',
        '--input-type=module',
      ],
      {
        input: migrationScript,
        env: {
          ...process.env,
          RUNTIME_DATABASE_URL: `postgres://platform_owner:${env.POSTGRES_PASSWORD}@127.0.0.1:5432/small_games`,
        },
      },
    );
    const preview = JSON.parse(result.toString('utf8').trim());
    const report = {
      verifiedAt: new Date().toISOString(),
      image,
      archiveSha256: createHash('sha256').update(dump).digest('hex'),
      tables: source,
      preview,
    };
    await writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    console.log(
      'Backup restored and compared: ' +
        Object.keys(source).length +
        ' tables; legacy rehearsal ' +
        JSON.stringify(preview),
    );
    return directory;
  } finally {
    if (started) docker(['rm', '-fv', restore]);
  }
}

export const migrationScript = `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {openDatabase} from './packages/service-kit/dist/index.js';
import {nightAssets,previewNightMigration} from './services/runtime-api/dist/competition/night-assets.js';
import rule from './services/runtime-api/rules/night.mjs';
const require=createRequire(new URL('./services/runtime-api/package.json',import.meta.url));const {sql}=require('drizzle-orm');
const db=openDatabase(process.env.RUNTIME_DATABASE_URL,'runtime');
try{
const wallets=await db.db.execute(sql\`select id,data from runtime.competition_matches where id like 'night-wallet:%' order by id\`);
const before=JSON.stringify(await db.db.execute(sql\`select id,data,created_at from runtime.competition_matches where board='night-overwatch:private-wallet-v1' order by id\`));
let preservedCoins=0,conversionCoins=0,signDays=0;
for(const row of wallets){const owner=row.id.slice('night-wallet:'.length),preview=await previewNightMigration(db.db,owner);preservedCoins+=preview.preservedCoins;conversionCoins+=preview.conversionCoins;signDays+=preview.signedDays.length;
 const prior=(await db.db.execute(sql\`select data from runtime.competition_matches where id=\${'night-assets:'+owner}\`))[0]?.data;const first=await db.db.transaction(tx=>nightAssets(tx,owner,Date.now(),rule.progression));const again=await db.db.transaction(tx=>nightAssets(tx,owner,Date.now(),rule.progression));assert.equal(first.coins,prior?.coins??preview.preservedCoins);assert.equal(again.coins,first.coins);assert.equal(again.mail.filter(m=>m.id===preview.version).length,1);assert(preview.signedDays.every(day=>again.signedDays.includes(day)));
}
assert.equal(JSON.stringify(await db.db.execute(sql\`select id,data,created_at from runtime.competition_matches where board='night-overwatch:private-wallet-v1' order by id\`)),before);
console.log(JSON.stringify({wallets:wallets.length,preservedCoins,conversionCoins,signDays,legacyRowsUnchanged:true,idempotent:true}));
}finally{await db.close();}`;

export function migrateNightWallets({ postgres, image, password }) {
  assert.equal(postgres, 'night-overwatch-taptap-test-postgres-1');
  const output = docker(
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'container:' + postgres,
      '-e',
      'RUNTIME_DATABASE_URL',
      image,
      'node',
      '--input-type=module',
    ],
    {
      input: migrationScript,
      env: {
        ...process.env,
        RUNTIME_DATABASE_URL: `postgres://platform_owner:${password}@127.0.0.1:5432/small_games`,
      },
    },
  );
  return JSON.parse(output.toString('utf8').trim());
}
