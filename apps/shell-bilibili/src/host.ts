import { createNativeGameHost } from '@coffeeeeffoc/native-game-shell';
export function createBilibiliGameHost(
  sdk: Parameters<typeof createNativeGameHost>[0],
  manifest: Parameters<typeof createNativeGameHost>[1],
  content: Parameters<typeof createNativeGameHost>[2],
  options: Omit<Parameters<typeof createNativeGameHost>[3], 'platformId'>,
) {
  return createNativeGameHost(sdk, manifest, content, { ...options, platformId: 'bilibili' });
}
