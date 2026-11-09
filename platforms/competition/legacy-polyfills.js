// Classic script loaded before every other H5 script. Older Android WebViews (common on
// phones without Play updates) parse the lowered service code but miss these runtime APIs.
(function (root) {
  if (typeof globalThis === 'undefined') root.globalThis = root;
  var define = function (target, name, value) {
    if (target && !target[name])
      Object.defineProperty(target, name, { configurable: true, writable: true, value: value });
  };
  define(Object, 'hasOwn', function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  });
  var at = function (index) {
    var length = this.length,
      i = Math.trunc(index) || 0;
    if (i < 0) i += length;
    return i < 0 || i >= length ? undefined : this[i];
  };
  define(Array.prototype, 'at', at);
  define(String.prototype, 'at', at);
  if (typeof Uint8Array === 'function')
    define(Object.getPrototypeOf(Uint8Array.prototype), 'at', at);
  define(Array.prototype, 'flatMap', function (callback, thisArg) {
    return Array.prototype.concat.apply([], this.map(callback, thisArg));
  });
  define(root, 'queueMicrotask', function (callback) {
    Promise.resolve()
      .then(callback)
      .catch(function (error) {
        setTimeout(function () {
          throw error;
        });
      });
  });
  if (typeof AbortController === 'function' && typeof AbortSignal === 'function')
    define(AbortSignal, 'timeout', function (ms) {
      var controller = new AbortController();
      setTimeout(function () {
        controller.abort();
      }, ms);
      return controller.signal;
    });
  // ponytail: JSON-only clone; current callers pass plain loadout data. Use a full clone if Maps/Dates appear.
  define(root, 'structuredClone', function (value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
