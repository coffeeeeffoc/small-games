import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapTapAdProvider } from '../src/taptap-h5-ads.js';
function fixture() {
  const listeners={}, config=[];
  const ad={ show:async()=>{}, load:async()=>{},
    onClose:fn=>listeners.close=fn, offClose:fn=>{if(listeners.close===fn) delete listeners.close;},
    onError:fn=>listeners.error=fn, offError:fn=>{if(listeners.error===fn) delete listeners.error;} };
  return {listeners,ad,config,sdk:{createRewardedVideoAd:options=>{config.push(options);return ad;}}};
}
test('missing SDK or real configuration is unavailable, never a mock success', async()=>{
  for (const [sdk,id] of [[undefined,'id'],[{},'id'],[{createRewardedVideoAd(){throw Error('must not call');}},'']])
    assert.deepEqual(await createTapTapAdProvider(sdk,id).show(),{status:'unavailable'});
});
test('show success alone does not reward, completion is strict and late events are ignored',async()=>{
  const f=fixture(),provider=createTapTapAdProvider(f.sdk,'fixture-only');
  let settled=false; const pending=provider.show().then(result=>{settled=true;return result;});
  await Promise.resolve(); await Promise.resolve(); assert.equal(settled,false);
  assert.deepEqual(await provider.show(),{status:'unavailable'});
  const close=f.listeners.close; close({isEnded:true}); close({isEnded:true});
  assert.deepEqual(await pending,{status:'completed'}); assert.deepEqual(f.listeners,{});
  assert.deepEqual(f.config,[{adUnitId:'fixture-only',multiton:false}]);
  provider.dispose(); assert.deepEqual(await provider.show(),{status:'unavailable'});
});
test('dismissal, errors and disposal never reward and remove only their own listeners',async()=>{
  for(const exit of ['cancel','error','dispose']) {
    const f=fixture(),provider=createTapTapAdProvider(f.sdk,'fixture-only'),pending=provider.show();
    const close=f.listeners.close;
    if(exit==='dispose') provider.dispose(); else if(exit==='error') f.listeners.error(); else close({isEnded:false});
    close({isEnded:true});
    assert.equal((await pending).status,exit==='error'?'failed':'dismissed');
    assert.deepEqual(f.listeners,{});
  }
});
test('one recovery load/show is allowed but a failed recovery returns failed',async()=>{
  const f=fixture();let shows=0; f.ad.show=async()=>{shows++;throw Error('offline');};
  const provider=createTapTapAdProvider(f.sdk,'fixture-only');
  assert.equal((await provider.show()).status,'failed'); assert.equal(shows,2); assert.deepEqual(f.listeners,{});
});
test('an unclosed singleton cannot lend an old completion to another request', async()=>{
  for (const exit of ['error', 'timeout', 'cancel']) {
    const f=fixture(),provider=createTapTapAdProvider(f.sdk,'fixture-only',5),first=provider.show();
    const oldClose=f.listeners.close;
    if(exit==='error') f.listeners.error();
    if(exit==='cancel') provider.cancel();
    assert.equal((await first).status,exit==='cancel'?'dismissed':'failed');
    assert.deepEqual(await provider.show(),{status:'unavailable'});
    oldClose({isEnded:true});
    assert.deepEqual(await provider.show(),{status:'unavailable'});
    assert.equal(f.config.length,1);
  }
});
test('confirmed destruction permits a fresh request after cancellation', async()=>{
  const f=fixture(); f.ad.destroy=async()=>{};
  const provider=createTapTapAdProvider(f.sdk,'fixture-only'),first=provider.show();
  provider.cancel(); assert.equal((await first).status,'dismissed');
  await Promise.resolve();
  const next=provider.show(); f.listeners.close({isEnded:false});
  assert.equal((await next).status,'dismissed'); assert.equal(f.config.length,2);
});
