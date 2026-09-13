import { defineConfig } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 700 },
  plugins: [{
    name: 'island-offline',
    async closeBundle() {
      const assets = (await readdir('dist/assets')).map(name => `./assets/${name}`);
      const version = createHash('sha256').update(assets.join()).digest('hex').slice(0, 12);
      const files = ['./', './index.html', './icon.svg', './manifest.webmanifest', ...assets];
      await writeFile('dist/sw.js', `const NAME='tangerine-${version}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tangerine-')&&k!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));
 else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});`);
    },
  }],
});
