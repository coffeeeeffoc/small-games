import test from 'node:test';
import assert from 'node:assert/strict';
import { isSoftwareRenderer, effectiveRendererQuality } from '../src/renderer-capabilities.ts';

function context(renderer: unknown) {
  return {
    getExtension(name: string) {
      assert.equal(name, 'WEBGL_debug_renderer_info');
      return { UNMASKED_RENDERER_WEBGL: 0x9246 };
    },
    getParameter(parameter: number) {
      assert.equal(parameter, 0x9246);
      return renderer;
    },
  };
}

test('actual software renderer strings cap every preferred quality at zero', () => {
  for (const renderer of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 18.1.8, 256 bits)',
    'Vulkan (lavapipe)',
    'Software Rasterizer',
  ]) {
    const software = isSoftwareRenderer(context(renderer));
    assert.equal(software, true, renderer);
    for (const preferred of [0, 1, 2])
      assert.equal(effectiveRendererQuality(preferred, software), 0);
  }
});

test('hardware renderer and unrecognized results preserve player preferences', () => {
  for (const renderer of [
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)',
    'Apple M2',
    '',
    null,
    123,
  ]) {
    const software = isSoftwareRenderer(context(renderer));
    assert.equal(software, false);
    for (const preferred of [0, 1, 2])
      assert.equal(effectiveRendererQuality(preferred, software), preferred);
  }
});

test('missing, restricted, or throwing renderer capability preserves quality', () => {
  assert.equal(
    isSoftwareRenderer({
      getExtension: () => null,
      getParameter: () => {
        throw Error('must not query');
      },
    }),
    false,
  );
  assert.equal(
    isSoftwareRenderer({
      getExtension: () => {
        throw Error('restricted');
      },
      getParameter: () => '',
    }),
    false,
  );
  assert.equal(
    isSoftwareRenderer({
      ...context(''),
      getParameter: () => {
        throw Error('context lost');
      },
    }),
    false,
  );
});
