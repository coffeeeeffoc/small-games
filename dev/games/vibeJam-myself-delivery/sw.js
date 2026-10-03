const NAME='tangerine-969510aa2b90';
const FILES=["./","./index.html","./icon.svg","./manifest.webmanifest","./assets/index-ByiAPXjd.css","./assets/index-CR2zq222.js"];
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tangerine-')&&k!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));
 else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});