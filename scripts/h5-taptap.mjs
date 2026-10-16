import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from './h5-taptap-build.mjs';
export { buildH5Packages, writeH5Zip } from './h5-taptap-build.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(() => {
    console.error('H5_BUILD_FAILED');
    process.exitCode = 1;
  });
