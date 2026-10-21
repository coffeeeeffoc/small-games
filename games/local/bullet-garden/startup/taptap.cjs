'use strict';
const sdk = typeof tap !== 'undefined' ? tap : globalThis.tap;
if (!sdk || typeof sdk.createCanvas !== 'function') throw new Error('TapTap runtime is required.');
// Creator's converted adapter uses wx; the rewarded provider uses the real tap SDK.
globalThis.tap = sdk;
if (typeof globalThis.wx === 'undefined') globalThis.wx = sdk;
if (typeof GameGlobal !== 'undefined') {
  GameGlobal.tap = sdk;
  if (typeof GameGlobal.wx === 'undefined') GameGlobal.wx = globalThis.wx;
}
