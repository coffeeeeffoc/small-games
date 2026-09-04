import assert from 'node:assert/strict';

import { createServer, preview } from 'vite';

async function assertServesApplication(server, label) {
  const address = server.httpServer?.address();
  assert(address && typeof address === 'object', `${label} did not expose a listening address`);

  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
  console.log(`${label} smoke check passed on port ${address.port}.`);
}

const developmentServer = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});

try {
  await developmentServer.listen();
  await assertServesApplication(developmentServer, 'Legacy web development server');
} finally {
  await developmentServer.close();
}

const previewServer = await preview({
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
});

try {
  await assertServesApplication(previewServer, 'Legacy web production build');
} finally {
  await previewServer.close();
}
