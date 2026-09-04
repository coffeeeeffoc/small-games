import assert from 'node:assert/strict';

import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';

async function assertServesApplication(server: ViteDevServer | PreviewServer, label: string) {
  const address = server.httpServer?.address();
  assert(address && typeof address === 'object', `${label} did not expose a listening address`);

  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
  console.log(`${label} smoke check passed on port ${address.port}.`);
}

/** Starts and verifies both Vite development and production-preview entries for one app. */
export async function runViteAppSmoke(applicationName: string): Promise<void> {
  const developmentServer = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });

  try {
    await developmentServer.listen();
    await assertServesApplication(developmentServer, `${applicationName} development server`);
  } finally {
    await developmentServer.close();
  }

  const previewServer = await preview({
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  });

  try {
    await assertServesApplication(previewServer, `${applicationName} production build`);
  } finally {
    await previewServer.close();
  }
}
