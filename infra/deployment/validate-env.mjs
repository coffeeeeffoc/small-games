import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateDeploymentEnvironment(services, env) {
  const invalid = new Set();
  if (services.some((name) => ['runtime', 'management'].includes(name))) {
    for (const key of ['POSTGRES_PASSWORD', 'RUNTIME_DB_PASSWORD', 'MANAGEMENT_DB_PASSWORD'])
      if (!/^[a-f0-9]{64}$/.test(env[key] ?? '')) invalid.add(key);
  }
  if (services.includes('runtime') && !/^[a-f0-9]{64}$/.test(env.COMPETITION_INTERNAL_KEY ?? ''))
    invalid.add('COMPETITION_INTERNAL_KEY');
  const origin = (key, fallback) => {
    try {
      const value = env[key] || fallback;
      const url = new URL(value);
      if (
        url.origin !== value ||
        (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      )
        invalid.add(key);
    } catch {
      invalid.add(key);
    }
  };
  origin('APP_ORIGIN', 'http://localhost:8080');
  if (services.includes('runtime')) {
    try {
      const platforms = JSON.parse(env.COMPETITION_PLATFORM_CONFIG || '[]');
      const supported = new Set(['wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap']);
      const seen = new Set();
      if (!Array.isArray(platforms)) throw new Error();
      for (const item of platforms) {
        if (
          !item ||
          !supported.has(item.platform) ||
          typeof item.appId !== 'string' ||
          !item.appId ||
          typeof item.secret !== 'string' ||
          item.secret.length < 16
        )
          throw new Error();
        const identity = `${item.platform}:${item.appId}`;
        if (seen.has(identity)) throw new Error();
        seen.add(identity);
      }
    } catch {
      invalid.add('COMPETITION_PLATFORM_CONFIG');
    }
  }
  if (services.includes('management')) {
    origin('STUDIO_ORIGIN');
    for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
      if (!env[key]) invalid.add(key);
    try {
      const url = new URL(env.S3_ENDPOINT);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        invalid.add('S3_ENDPOINT');
    } catch {
      invalid.add('S3_ENDPOINT');
    }
  }
  if (invalid.size)
    throw new Error(`Missing or invalid deployment variables: ${[...invalid].join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = JSON.parse(
      await readFile(new URL('./manifest.json', import.meta.url), 'utf8'),
    );
    const local = parseEnv(await readFile(new URL('./.env', import.meta.url), 'utf8'));
    validateDeploymentEnvironment(manifest.services, { ...local, ...process.env });
    console.log(`Deployment configuration OK: ${manifest.services.join(', ') || 'frontend only'}`);
  } catch (error) {
    // Print field names only. Values and database URLs never enter diagnostics.
    console.error(
      error.code === 'ENOENT'
        ? 'Create .env from .env.example in a completed bundle first.'
        : error.message,
    );
    process.exitCode = 1;
  }
}
