/** Package-resource bridge. No network fetch, DOM, or replacement physics. */
function failure(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  return error;
}
function packagePath(value) {
  if (typeof value !== 'string') throw failure('INVALID_PATH', 'Package path must be a string');
  const path = value.replace(/^\//, '');
  if (
    !path ||
    !/^[A-Za-z0-9_./-]+$/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw failure('INVALID_PATH', 'Only package-relative resource paths are supported');
  }
  return path;
}
function checkData(data, type) {
  const valid =
    type === 'utf8'
      ? typeof data === 'string'
      : Object.prototype.toString.call(data) === '[object ArrayBuffer]';
  if (!valid) throw failure('INVALID_DATA', `Native file read did not return ${type}`);
  return data;
}
function checkInstance(result) {
  const instance = result?.instance ?? result;
  if (!instance || typeof instance.exports !== 'object' || instance.exports === null) {
    throw failure('INVALID_WASM_RESULT', 'Native WASM instantiation did not return an instance');
  }
  return result?.instance ? result : { instance };
}
export function attachKuaishouNativeResources(
  sdk,
  { allowedAssetHosts = [], requestTimeoutMs = 15000 } = {},
) {
  if (!sdk || (typeof sdk !== 'object' && typeof sdk !== 'function'))
    throw failure('UNAVAILABLE', 'Kuaishou native SDK is unavailable');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 60000)
    throw failure('INVALID_CONFIG', 'Request timeout must be between 1 and 60000 ms');
  async function readFile(value, type = 'arraybuffer') {
    const path = packagePath(value);
    if (type !== 'arraybuffer' && type !== 'utf8')
      throw failure('INVALID_TYPE', 'Resource type must be arraybuffer or utf8');
    const manager =
      typeof sdk.getFileSystemManager === 'function' ? sdk.getFileSystemManager() : undefined;
    if (!manager || typeof manager.readFileSync !== 'function')
      throw failure('UNAVAILABLE', 'Kuaishou native readFileSync is unavailable');
    const filePath = path;
    const data = manager.readFileSync(filePath, type === 'utf8' ? 'utf8' : undefined);
    return checkData(data, type);
  }
  async function instantiateWasm(value, imports = {}) {
    const path = packagePath(value);
    if (!path.endsWith('.wasm'))
      throw failure('INVALID_PATH', 'WASM package resource must end in .wasm');
    const native = undefined;
    if (typeof native?.instantiate === 'function') {
      // A real host compilation/link failure is final; never substitute another engine.
      return checkInstance(await native.instantiate(path, imports));
    }
    const engine = globalThis.WebAssembly;
    if (typeof engine?.instantiate !== 'function')
      throw failure('UNAVAILABLE', 'Kuaishou WASM instantiation is unavailable');
    return checkInstance(await engine.instantiate(await readFile(path), imports));
  }
  async function readRemoteAsset(url, type = 'arraybuffer') {
    if (type !== 'arraybuffer' && type !== 'utf8')
      throw failure('INVALID_TYPE', 'Resource type must be arraybuffer or utf8');
    const match =
      typeof url === 'string' ? /^https:\/\/([a-zA-Z0-9.-]+)(\/[^\s#]*)?$/.exec(url) : null;
    if (
      !match ||
      !match[1].includes('.') ||
      match[1].split('.').some((part) => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part))
    ) {
      throw failure('INVALID_URL', 'Remote asset must use a credential-free HTTPS domain URL');
    }
    if (!Array.isArray(allowedAssetHosts) || allowedAssetHosts.length === 0)
      throw failure('CONFIG_REQUIRED', 'Remote asset host allowlist is required');
    if (
      !allowedAssetHosts.some(
        (host) => typeof host === 'string' && host.toLowerCase() === match[1].toLowerCase(),
      )
    )
      throw failure('HOST_BLOCKED', 'Remote asset host is not configured');
    if (typeof sdk.request !== 'function')
      throw failure('UNAVAILABLE', 'Native request is unavailable');
    return new Promise((resolve, reject) => {
      let settled = false;
      let task;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback(value);
      };
      const timer = globalThis.setTimeout(() => {
        finish(reject, failure('TIMEOUT', 'Native asset request timed out'));
        if (typeof task?.abort === 'function') {
          try {
            task.abort();
          } catch {
            /* Failure is already reported. */
          }
        }
      }, requestTimeoutMs);
      const options = {
        url,
        method: 'GET',
        dataType: 'string',
        responseType: type === 'arraybuffer' ? 'arraybuffer' : 'text',
        success(result) {
          if (
            !Number.isInteger(result?.statusCode) ||
            result.statusCode < 200 ||
            result.statusCode >= 300
          ) {
            finish(
              reject,
              failure('HTTP_ERROR', `Remote asset HTTP status ${String(result?.statusCode)}`),
            );
            return;
          }
          try {
            finish(resolve, checkData(result.data, type));
          } catch (error) {
            finish(reject, error);
          }
        },
        fail(error) {
          finish(
            reject,
            failure('REQUEST_FAILED', error?.errMsg ?? 'Native asset request failed', error),
          );
        },
      };
      try {
        task = sdk.request(options);
      } catch (error) {
        finish(reject, error);
      }
    });
  }
  async function loadSubpackage(name) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name))
      throw failure('INVALID_NAME', 'Subpackage name must be a configured package name');
    if (typeof sdk.loadSubpackage !== 'function')
      throw failure('UNAVAILABLE', 'Native loadSubpackage is unavailable');
    return new Promise((resolve, reject) => {
      let settled = false;
      let task;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback(value);
      };
      const timer = globalThis.setTimeout(() => {
        finish(reject, failure('TIMEOUT', 'Native subpackage load timed out'));
        if (typeof task?.abort === 'function') {
          try {
            task.abort();
          } catch {
            /* Failure is already reported. */
          }
        }
      }, requestTimeoutMs);
      const options = {
        name,
        success(result) {
          finish(resolve, result);
        },
        fail(error) {
          finish(
            reject,
            failure('SUBPACKAGE_FAILED', error?.errorMsg ?? 'Native subpackage load failed', error),
          );
        },
      };
      try {
        task = sdk.loadSubpackage(options);
      } catch (error) {
        finish(reject, error);
      }
    });
  }
  const overrides = { readFile, instantiateWasm, readRemoteAsset, loadSubpackage };
  const bound = new Map();
  // An overlay target also works when native SDK properties are frozen/non-configurable.
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (Object.hasOwn(overrides, key)) return overrides[key];
      const value = Reflect.get(sdk, key, sdk);
      if (typeof value !== 'function') return value;
      if (!bound.has(key) || bound.get(key).source !== value)
        bound.set(key, { source: value, method: value.bind(sdk) });
      return bound.get(key).method;
    },
    ownKeys() {
      return [...new Set([...Reflect.ownKeys(sdk), ...Reflect.ownKeys(overrides)])];
    },
    getOwnPropertyDescriptor(_target, key) {
      if (Object.hasOwn(overrides, key) || key in sdk)
        return { configurable: true, enumerable: true };
    },
    has(_target, key) {
      return Object.hasOwn(overrides, key) || key in sdk;
    },
    set(_target, key, value) {
      return Reflect.set(sdk, key, value, sdk);
    },
  });
}
export const attachNativeResources = attachKuaishouNativeResources;
