import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tracked = (cwd) =>
  execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
const files = tracked(root);
const chess = 'games/submodules/xiangqi-five';
files.push(...tracked(path.join(root, chess)).map((file) => `${chess}/${file}`));
const violations = [];
let checked = 0;
for (const file of files) {
  if (!/^(games\/|apps\/shell-web\/(src\/|index.html))/.test(file)) continue;
  if (/(^|\/)(docs|reports|publishing|vendor|tests|node_modules|build|dist)\//.test(file)) continue;
  if (!/\.(?:[cm]?js|tsx?|html|css)$/.test(file) || /(?:\.d\.ts|\.test\.[^.]+)$/.test(file))
    continue;
  if (/\/(?:test[^/]*|[^/]*(?:browser|check|review|playtest)[^/]*)\//.test(file)) continue;
  if (/(?:^|\/)[^/]*(?:browser|check-|review|playtest|test\.)[^/]*\.[cm]?[jt]s$/.test(file))
    continue;
  if (!existsSync(path.join(root, file))) continue;
  const source = readFileSync(path.join(root, file), 'utf8');
  checked++;
  if (
    /(?:request|exit|toggle|enter)(?:Full[Ss]creen)|\bautoFullScreen\s*\(|enableAutoFullScreen\(true\)|data-game-fullscreen|\.gameFullscreen\s*=|<script\b[^>]*fullscreen\.js|:fullscreen|:-webkit-full-screen/i.test(
      source,
    )
  )
    violations.push(file);
}
assert.deepEqual(violations, [], 'Games and the Shell must not expose browser fullscreen');
assert.equal(existsSync(path.join(root, 'platforms/h5/fullscreen.js')), false);
console.log(
  `PASS: ${checked} game/Shell source files have no browser fullscreen controls or calls.`,
);
