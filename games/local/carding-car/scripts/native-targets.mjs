import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Creator 3.8's documented extension ID, not a renamed WeChat export.
// https://github.com/cocos/cocos-docs/blob/master/versions/3.8/zh/editor/publish/publish-bytedance-mini-game.md
const targets = {
  wechatgame: { platform: 'wechatgame', channel: 'wechat', variable: 'WECHAT_APP_ID', field: 'wechatAppId', preview: 'touristappid' },
  bilibili: { platform: 'wechatgame', channel: 'bilibili', variable: 'BILIBILI_APP_ID', field: 'bilibiliAppId', preview: 'preview-only' },
  douyin: { platform: 'bytedance-mini-game', channel: 'douyin', variable: 'DOUYIN_APP_ID', field: 'douyinAppId', preview: '' },
};
export function nativeTarget(target, release = {}, environment = process.env) {
  const descriptor = targets[target];
  if (!descriptor) throw new Error(target === 'kuaishou'
    ? 'Creator 3.8.8 has no verified Kuaishou build extension in this project; install and validate a compatible official adapter first.'
    : `Unsupported native target: ${target}`);
  const appId = environment[descriptor.variable] || release[descriptor.field] || '';
  if (typeof appId !== 'string' || (appId && !/^[A-Za-z0-9_-]+$/.test(appId)))
    throw new Error(`${descriptor.variable} / ${descriptor.field} must be a public platform AppID.`);
  if (target === 'douyin' && appId && !/^tt[A-Za-z0-9_-]+$/.test(appId))
    throw new Error('DOUYIN_APP_ID / douyinAppId must be a Douyin tt AppID.');
  if (target === 'wechatgame' && appId && appId !== 'touristappid' && !/^wx[A-Za-z0-9_-]+$/.test(appId))
    throw new Error('WECHAT_APP_ID / wechatAppId must be a WeChat wx AppID or touristappid.');
  if (target === 'bilibili' && /^(wx|tt|touristappid$|preview-only$)/i.test(appId))
    throw new Error('BILIBILI_APP_ID / bilibiliAppId must be a Bilibili AppID.');
  return { ...descriptor, appId, configured: Boolean(appId && appId !== 'touristappid'),
    outputName: target === 'bilibili' ? 'wechat-bilibili-source' : descriptor.platform,
    outputAppId: appId || descriptor.preview,
  };
}
export function nativePackages(target, release = {}, environment = process.env) {
  const descriptor = nativeTarget(target, release, environment);
  return {
    [descriptor.platform]: { appid: descriptor.outputAppId, orientation: 'landscape', separateEngine: false },
    ...(target === 'bilibili' ? { 'biligame-builder': {
      isBiliGame: true, biliGameAppId: descriptor.outputAppId, biliGameVersion: '0.1.0',
    } } : {}),
  };
}
export async function verifyNativeOutput(directory, descriptor, expectedSourceHash) {
  const game = JSON.parse(await readFile(path.join(directory, 'game.json'), 'utf8'));
  const project = JSON.parse(await readFile(path.join(directory, 'project.config.json'), 'utf8'));
  await readFile(path.join(directory, 'game.js'), 'utf8');
  if (project.appid !== descriptor.outputAppId)
    throw new Error(`Native output AppID does not match ${descriptor.variable}.`);
  if (game.deviceOrientation !== 'landscape')
    throw new Error('Native game must keep the landscape touch-control layout.');
  if (expectedSourceHash) {
    const info = JSON.parse(await readFile(path.join(directory, 'build-info.json'), 'utf8'));
    if (info.creator !== '3.8.8' || info.sourceHash !== expectedSourceHash)
      throw new Error('Native Creator artifact does not match current sources; rebuild before platform validation.');
  }
  let mainBytes = 0, totalBytes = 0;
  const declared = game.subpackages || game.subPackages || [];
  const resources = declared.find((item) => item.name === 'resources');
  if (!resources || !(await stat(path.join(directory, resources.root || resources.name))).isDirectory())
    throw new Error('Native resources must exist as a local resources subpackage.');
  const subpackages = declared.map((item) =>
    String(item.root || item.name).replaceAll('\\', '/').replace(/\/$/, '') + '/');
  for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const full = path.join(file.parentPath, file.name), bytes = (await stat(full)).size;
    totalBytes += bytes;
    const relative = path.relative(directory, full).replaceAll('\\', '/');
    if (!subpackages.some((prefix) => relative.startsWith(prefix))) mainBytes += bytes;
  }
  if (mainBytes > 4 * 1024 * 1024 || totalBytes > 20 * 1024 * 1024)
    throw new Error(`Native package budget exceeded: main=${mainBytes}, total=${totalBytes}.`);
  return { mainBytes, totalBytes, configured: descriptor.configured };
}
