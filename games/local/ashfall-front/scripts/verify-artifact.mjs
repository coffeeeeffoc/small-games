import { verifyPrebuilt } from './artifact.mjs';
console.log(
  'Verified Creator runtime:',
  await verifyPrebuilt(new URL('../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')),
);
