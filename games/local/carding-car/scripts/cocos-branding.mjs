import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Remove the embedded engine logo before packaging, keeping Creator's MD5 chain valid. */
export async function brandCocos(directory, logo) {
  const root = await realpath(directory);
  const native = !!logo;
  const read = async (name) => {
    assert(/^(?:src\/)?[\w.-]+\.(?:html|js|json|png)$/.test(name), 'Unexpected Creator path');
    const filename = path.resolve(root, name);
    assert(filename.startsWith(root + path.sep), 'Creator path escaped output');
    assert(!(await lstat(filename)).isSymbolicLink(), 'Creator output cannot contain links');
    return readFile(filename, 'utf8');
  };
  const one = (source, regex) => {
    const matches = [...source.matchAll(regex)];
    assert.equal(matches.length, 1, 'Unknown Creator bootstrap; review branding');
    return matches[0][1].replace(/^\.\//, '');
  };
  const entryName = native ? 'game.js' : 'index.html';
  let entry = await read(entryName);
  const indexName = native ? undefined : one(entry, /System\.import\(['"](\.\/index(?:\.[\w-]+)?\.js)['"]\)/g);
  const index = indexName ? await read(indexName) : entry;
  const appName = one(index, /['"](\.\/application(?:\.[\w-]+)?\.js)['"]/g);
  const app = await read(appName);
  const settingsName = one(app, /settingsPath\s*=\s*['"](src\/settings(?:\.[\w-]+)?\.json)['"]/g);
  const original = await read(settingsName);
  const settings = JSON.parse(original);
  assert.equal(settings.CocosEngine, '3.8.8', 'Branding requires Creator 3.8.8 review');
  const splash = { ...settings.splashScreen, totalTime: 0, logo: { type: 'none' } };
  const changed = JSON.stringify(settings.splashScreen) !== JSON.stringify(splash);
  settings.splashScreen = splash;
  const edits = [];
  const rehash = async (name, content, before) => {
    if (content === before) return name;
    const digest = createHash('md5').update(content).digest('hex').slice(0, 5);
    const next = name.replace(/(?:\.[\w-]+)?\.(json|js)$/, `.${digest}.$1`);
    const existing = await readFile(path.join(root, next)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    assert(!existing || existing.equals(Buffer.from(content)), 'Creator short hash collision');
    edits.push({ name, next, content });
    return next;
  };
  const nextSettings = await rehash(settingsName, changed ? JSON.stringify(settings) : original, original);
  const nextApp = await rehash(appName, app.replace(settingsName, nextSettings), app);
  if (indexName) {
    const nextIndex = await rehash(indexName, index.replace(appName, nextApp), index);
    entry = entry.replace(indexName, nextIndex);
  } else entry = entry.replace(appName, nextApp);
  let firstScreen, picture;
  if (native) {
    firstScreen = await read('first-screen.js');
    for (const [key, value] of [['useLogo', 'true'], ['useDefaultLogo', 'false'], ['logoName', "'logo.png'"]]) {
      const regex = new RegExp(`let ${key} = [^;]+;`, 'g');
      assert.equal([...firstScreen.matchAll(regex)].length, 1, 'Unknown native first screen');
      firstScreen = firstScreen.replace(regex, `let ${key} = ${value};`);
    }
    picture = await readFile(logo);
    assert.equal(picture.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Startup logo must be PNG');
  }
  for (const edit of edits) await writeFile(path.join(root, edit.next), edit.content);
  await writeFile(path.join(root, entryName), entry);
  if (native) {
    await writeFile(path.join(root, 'first-screen.js'), firstScreen);
    await writeFile(path.join(root, 'logo.png'), picture);
    await unlink(path.join(root, 'slogan.png')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
  for (const edit of edits) if (edit.name !== edit.next) await unlink(path.join(root, edit.name));
}
