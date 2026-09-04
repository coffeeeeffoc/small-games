import { act, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

const manifest = gameManifestSchema.parse({
  gameId: 'test-game',
  version: '1.0.0',
  gameContractVersion: 1,
  contentSchemaVersion: 1,
  capabilities: ['content'],
  loadModes: ['in-process'],
  entry: 'index.html',
  integrity: 'test',
});
const definition = createReactGameDefinition({
  manifest,
  requiredCapabilities: ['content'],
  contentSchema: z.object({ title: z.string() }),
  render: (_host, content, active) => createElement('p', null, `${content.title}:${active}`),
});
const content = { gameId: 'test-game', schemaVersion: 1, revision: 1, payload: { title: 'Ready' } };

describe('React Game adapter', () => {
  it('mounts, pauses, resumes, disposes idempotently, and mounts again', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = createInMemoryGameHost({
      session: { gameId: 'test-game', capabilities: ['content'] },
      content,
    });
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof definition.mount>>;
    await act(async () => {
      lifecycle = await definition.mount(target, host);
    });
    expect(target.textContent).toBe('Ready:true');
    await act(async () => lifecycle.pause());
    expect(target.textContent).toBe('Ready:false');
    await act(async () => lifecycle.resume());
    expect(target.textContent).toBe('Ready:true');
    await act(async () => lifecycle.dispose());
    await act(async () => lifecycle.dispose());
    expect(target.childElementCount).toBe(0);
    let again!: Awaited<ReturnType<typeof definition.mount>>;
    await act(async () => {
      again = await definition.mount(target, host);
    });
    await act(async () => again.dispose());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('rejects identity, newer content, and invalid payloads', async () => {
    const target = document.createElement('div');
    const wrongIdentity = createInMemoryGameHost({
      session: { gameId: 'other', capabilities: ['content'] },
      content,
    });
    await expect(definition.mount(target, wrongIdentity)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const newer = createInMemoryGameHost({
      session: { gameId: 'test-game', capabilities: ['content'] },
      content: { ...content, schemaVersion: 2 },
    });
    await expect(definition.mount(target, newer)).rejects.toMatchObject({
      code: 'CONTENT_INCOMPATIBLE',
    });
    const invalid = createInMemoryGameHost({
      session: { gameId: 'test-game', capabilities: ['content'] },
      content: { ...content, payload: {} },
    });
    await expect(definition.mount(target, invalid)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
