import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRoleAppearance, roleAvatarSvg, drawRoleAvatar } from '../src/role-appearance.js';
import { character, gamePortrait } from '../src/art.js';

globalThis.__CLASSIC_CHASE_ROLES__ = true;
globalThis.__chaseRoleStorage = { getItem: () => '{}' };
assert.equal(getRoleAppearance('cop').label, '保安');
assert.equal(getRoleAppearance('robber').label, '小偷');
assert.equal(getRoleAppearance('cop').color, '#6c6973');
const face = roleAvatarSvg('cop', 0, 0, 100);
assert.ok(face.includes('#55525c'), 'Fallback avatar uses the charcoal baseball cap');
assert.ok(!face.includes('#ffdc60'), 'Fallback avatar has no gold police badge');
assert.ok(gamePortrait('cop').includes('#cop-face'), 'Default avatars use the new atlas');
assert.ok(character('cop').includes('#cop'), 'Default board actors use the new atlas');
const colors = [];
const context = new Proxy({}, {
  get: (target, key) => target[key] ?? (() => {}),
  set: (target, key, value) => {
    if (key === 'fillStyle') colors.push(value);
    target[key] = value;
    return true;
  },
});
drawRoleAvatar(context, 'cop', 0, 0, 100);
assert.ok(colors.includes('#55525c'), 'Canvas without Path2D uses the security cap');
assert.ok(!colors.includes('#ffdc60'), 'Canvas fallback has no gold police badge');
const atlas = await readFile(new URL('../assets/patrol-characters.svg', import.meta.url), 'utf8');
for (const id of ['cop', 'robber', 'cop-face', 'robber-face'])
  assert.ok(atlas.includes(`id="${id}"`), `Preserve the ${id} atlas view contract`);
const bitmap = Buffer.from(atlas.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/)[1], 'base64');
assert.equal(bitmap.toString('ascii', 0, 4), 'RIFF');
assert.equal(bitmap.toString('ascii', 8, 12), 'WEBP');
for (const file of ['index.html', 'src/role-appearance.js', 'src/game-shell.js', 'src/duel-ui.js', '../../minigames/cops-robbers/controller.mjs']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /警察|警官|警徽|警帽|警车/, `${file} has no old police-facing text`);
}
delete globalThis.__chaseRoleStorage;
delete globalThis.__CLASSIC_CHASE_ROLES__;
console.log('Security art: labels, atlas contracts, SVG and Canvas fallbacks passed.');
