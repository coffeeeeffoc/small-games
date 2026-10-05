import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Exercise the real cloud material/atlas on WebGL, independent of city loading.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const output = new URL('../../../../.scratch/travel-bund-clouds/', import.meta.url);
const errors = [];
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__cloud-preview', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html><body style="margin:0"><script type="module">
      import * as THREE from '/node_modules/.vite/deps/three.js';
      import {createClouds,CLOUD_COUNT,CLOUD_ATLAS_SIZE} from '/src/clouds.ts';
      const renderer=new THREE.WebGLRenderer({antialias:true});
      renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#779dad');
      const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,100);
      camera.position.z=8;
      const clouds=createClouds(),dummy=new THREE.Object3D();scene.add(clouds.mesh);
      for(let i=0;i<CLOUD_COUNT;i++) {
        dummy.position.set(i<4?(i%2?1.8:-1.8):100,i<4?(i<2?1.1:-1.1):100,0);
        dummy.scale.set(3.8,2.1,1);dummy.updateMatrix();clouds.mesh.setMatrixAt(i,dummy.matrix);
      }
      clouds.mesh.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);
      const pixels=clouds.texture.image.getContext('2d').getImageData(0,0,...CLOUD_ATLAS_SIZE).data;
      let translucent=0,opaque=0,empty=0;
      for(let i=3;i<pixels.length;i+=4) {const a=pixels[i];if(a===0)empty++;else if(a>240)opaque++;else translucent++;}
      window.cloudResult={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,atlasSize:CLOUD_ATLAS_SIZE,translucent,opaque,empty};
      window.cloudAtlas=clouds.texture.image.toDataURL('image/png');
      window.nightClouds=()=>{clouds.material.color.set('#627b96');clouds.material.opacity=.55;scene.background.set('#26394e');renderer.render(scene,camera);};
      window.disposeClouds=()=>{
        const released=[];
        for(const [name,resource] of [['mesh',clouds.mesh],['geometry',clouds.mesh.geometry],['material',clouds.material],['texture',clouds.texture]])resource.addEventListener('dispose',()=>released.push(name));
        scene.remove(clouds.mesh);clouds.dispose();renderer.dispose();return released;
      };
    </script></body></html>`,
  }));
  await page.goto(base + '/__cloud-preview');
  await page.waitForFunction(() => window.cloudResult);
  const result = await page.evaluate(() => window.cloudResult);
  assert.equal(result.calls, 1);
  assert.equal(result.triangles, 24);
  assert.deepEqual(result.atlasSize, [512, 256]);
  assert(result.translucent > 1000 && result.opaque > 1000 && result.empty > 1000);
  await page.screenshot({ path: fileURLToPath(new URL('material-day.png', output)) });
  const atlas = await page.evaluate(() => window.cloudAtlas);
  await writeFile(new URL('atlas.png', output), Buffer.from(atlas.split(',')[1], 'base64'));
  await page.evaluate(() => window.nightClouds());
  await page.screenshot({ path: fileURLToPath(new URL('material-night.png', output)) });
  const released = await page.evaluate(() => window.disposeClouds());
  assert.deepEqual(released, ['mesh', 'geometry', 'material', 'texture']);
  assert.deepEqual(errors, []);
  await writeFile(new URL('material-report.json', output), JSON.stringify({ ...result, released, errors }, null, 2));
  console.log(JSON.stringify({ ...result, released, errors }));
} finally { await browser.close(); await server.close(); }
