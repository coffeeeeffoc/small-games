import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION_PATTERN, contentVersion } from '@coffeeeeffoc/repository-bridge';

describe('Repository Bridge content versions', () => {
  it('matches the published SHA-256 test vectors', async () => {
    expect(await contentVersion('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await contentVersion('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable for identical content and differs for a single changed byte', async () => {
    const source = 'export const safe = true;\n';
    expect(await contentVersion(source)).toBe(await contentVersion(source));
    expect(await contentVersion(source)).not.toBe(await contentVersion(source.replace(';', ',;')));
    expect(await contentVersion('a\n')).not.toBe(await contentVersion('a\r\n'));
    expect(CONTENT_VERSION_PATTERN.test(await contentVersion(source))).toBe(true);
  });
});
