/** Keep caught Creator startup failures visible on devices without a console. */
export function reportStartupFailure(wx, error) {
  const message = String(error?.message || error);
  const fs = wx.getFileSystemManager();
  const details = ['启动失败：' + message];
  for (const dir of ['assets', 'assets/internal', 'subpackages']) {
    try {
      details.push(dir + ': ' + fs.readdirSync(dir).join(', '));
    } catch (failure) {
      details.push(dir + ': ' + String(failure?.message || failure));
    }
  }
  const content = details.join('\n');
  console.error('[carding-car startup]', content);
  wx.showModal({ title: '卡丁车启动失败', content, showCancel: false, confirmText: '知道了' });
}

export function verifyResourceConfig(wx, fsUtils, expectedPacks, buildId) {
  const readJson = fsUtils.readJson;
  console.warn('[carding-car build]', buildId);
  fsUtils.readJson = function (file, callback) {
    return readJson.call(this, file, (error, data) => {
      if (!error && /^subpackages\/resources\/config(?:\.[^.]+)?\.json$/.test(file)) {
        const actual = Object.keys(data.packs || {}).sort();
        console.warn('[carding-car resource config]', buildId, JSON.stringify(actual));
        if (JSON.stringify(actual) !== JSON.stringify(expectedPacks)) {
          error = new Error('资源配置与构建不一致，版本 ' + buildId + '；实际资源包：' + actual.join(', '));
          wx.showModal({ title: '资源版本不一致', content: error.message, showCancel: false });
        }
      }
      callback(error, data);
    });
  };
}

export function instrumentWechatStartup(source, expectedPacks, buildId) {
  const caughtError = 'console.error(err);';
  if (!source.includes(caughtError)) throw new Error('Creator startup error handler changed');
  source = source.replace(caughtError, `(${reportStartupFailure.toString()})(wx, err);`);
  if (expectedPacks) {
    const adapter = "require('./engine-adapter');";
    if (!source.includes(adapter)) throw new Error('Creator engine adapter hook changed');
    source = source.replace(adapter, `(${verifyResourceConfig.toString()})(wx, window.fsUtils, ${JSON.stringify(expectedPacks)}, ${JSON.stringify(buildId)});\n${adapter}`);
  }
  return source;
}
