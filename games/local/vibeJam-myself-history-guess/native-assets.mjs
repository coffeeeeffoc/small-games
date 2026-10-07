/** Loads original images after their declared native resource package is ready. */
export function createNativeHistoryImageLoader(sdk, assetPackages, { imageTimeoutMs = 15000 } = {}) {
  if (!Number.isFinite(imageTimeoutMs) || imageTimeoutMs <= 0) throw new Error('Invalid history image timeout');
  const packages = new Map();
  const failure = message => new Error(`历史场景资源不可用：${message}`);
  return async function loadImage(source) {
    if (typeof source !== 'string' || !/^assets\/(?:competition\/)?[a-z0-9-]+\.webp$/.test(source)) throw failure('图片路径无效');
    let imagePath = source;
    if (assetPackages !== undefined) {
      const entry = Object.hasOwn(assetPackages ?? {}, source) ? assetPackages[source] : undefined;
      if (!entry || typeof entry.name !== 'string' || !/^[a-zA-Z0-9-]+$/.test(entry.name) || entry.path !== `${entry.name}/${source}`) throw failure('图片分包声明缺失或无效');
      if (typeof sdk?.loadSubpackage !== 'function') throw failure('宿主不支持分包加载');
      let pending = packages.get(entry.name);
      if (!pending) {
        pending = Promise.resolve().then(() => {
          const result = sdk.loadSubpackage(entry.name);
          if (!result || typeof result.then !== 'function') throw failure('分包宿主未返回加载 Promise');
          return result;
        });
        packages.set(entry.name, pending);
        pending.catch(() => { if (packages.get(entry.name) === pending) packages.delete(entry.name); });
      }
      await pending;
      imagePath = entry.path;
    }
    if (typeof sdk?.createImage !== 'function') throw failure('宿主不支持原生图片');
    return new Promise((resolve, reject) => {
      let image, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (image) { image.onload = null; image.onerror = null; }
        error ? reject(error) : resolve(image);
      };
      const timer = setTimeout(() => finish(failure('图片加载超时')), imageTimeoutMs);
      try {
        image = sdk.createImage();
        if (!image || typeof image !== 'object') throw failure('宿主未创建真实图片对象');
        image.onload = () => finish(Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0 ? undefined : failure('图片尺寸无效'));
        image.onerror = () => finish(failure('图片加载失败'));
        image.src = imagePath;
      } catch (error) { finish(error); }
    });
  };
}
