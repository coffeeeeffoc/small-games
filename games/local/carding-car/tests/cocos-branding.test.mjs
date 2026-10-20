import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { brandCocos } from '../scripts/cocos-branding.mjs';

test('H5/native branding removes engine assets and keeps the entire MD5 reference chain valid', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cocos-branding-'));
  try {
    for (const native of [false, true]) {
      const dir = path.join(root, String(native));
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src/settings.aaaaa.json'), JSON.stringify({
        CocosEngine: '3.8.8', splashScreen: { totalTime: 2000, logo: { type: 'default', base64: 'ENGINE-LOGO' } },
      }));
      await writeFile(path.join(dir, 'application.bbbbb.js'), "this.settingsPath = 'src/settings.aaaaa.json';");
      await writeFile(path.join(dir, native ? 'game.js' : 'index.ccccc.js'), "System.import('./application.bbbbb.js');");
      if (!native) await writeFile(path.join(dir, 'index.html'), "<script>System.import('./index.ccccc.js')</script>");
      else {
        await writeFile(path.join(dir, 'first-screen.js'), "let useLogo = true;\nlet useDefaultLogo = true;\nlet logoName = 'logo.png';");
        await writeFile(path.join(dir, 'slogan.png'), 'ENGINE-SLOGAN');
      }
      const logo = native ? new URL('../scripts/startup-logo.png', import.meta.url) : undefined;
      await brandCocos(dir, logo);
      const names = (await readdir(dir, { recursive: true })).sort();
      for (const name of names.filter((name) => /\.[a-f0-9]{5}\.(js|json)$/.test(name))) {
        const bytes = await readFile(path.join(dir, name));
        assert.equal(name.match(/\.([a-f0-9]{5})\./)[1], createHash('md5').update(bytes).digest('hex').slice(0, 5));
        assert(!bytes.toString().includes('ENGINE-LOGO'));
        for (const ref of bytes.toString().matchAll(/['"](?:\.\/)?((?:src\/)?(?:application|settings)\.[a-f0-9]{5}\.(?:js|json))['"]/g))
          assert(names.includes(ref[1].replaceAll('/', path.sep)));
      }
      assert(!names.includes('application.bbbbb.js'));
      assert(!names.includes('slogan.png'));
      if (native) {
        assert.match(await readFile(path.join(dir, 'first-screen.js'), 'utf8'), /useDefaultLogo = false/);
        assert.deepEqual(await readFile(path.join(dir, 'logo.png')), await readFile(logo));
      }
      await brandCocos(dir, logo);
      assert.deepEqual((await readdir(dir, { recursive: true })).sort(), names);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
