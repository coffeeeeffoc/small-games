import { describe, expect, it } from 'vitest';

import { runViteAppSmoke } from '@coffeeeeffoc/vite-smoke-test';

describe('Vite smoke test package', () => {
  it('publishes its smoke runner through the package root', () => {
    expect(runViteAppSmoke).toBeTypeOf('function');
  });
});
