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

test('shown ads keep their completion listener beyond the opening timeout, including load/show recovery', async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for (const retry of [false, true]) {
    const f=fixture(); let shows=0, loads=0, settled=false;
    f.ad.show=async()=>{if (++shows===1 && retry) throw Error('not ready');};
    f.ad.load=async()=>{loads++;};
    const provider=createTapTapAdProvider(f.sdk,'fixture-only');
    const pending=provider.show().then(result=>{settled=true; return result;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(shows,retry?2:1); assert.equal(loads,retry?1:0);
    t.mock.timers.tick(60000);
    await Promise.resolve();
    assert.equal(settled,false,'60-second ad playback must not be classified as a failed request');
    assert.equal(typeof f.listeners.close,'function');
    const close=f.listeners.close;
    close({isEnded:true}); close({isEnded:true});
    assert.deepEqual(await pending,{status:'completed'});
    assert.deepEqual(f.listeners,{});
    provider.dispose();
  }
});

test('waiting longer never grants a reward for an incomplete or missing completion flag',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for (const result of [{isEnded:false},{},undefined,{isEnded:'true'}]) {
    const f=fixture(),provider=createTapTapAdProvider(f.sdk,'fixture-only');
    const pending=provider.show();
    await new Promise(resolve=>setImmediate(resolve));
    t.mock.timers.tick(180000);
    assert.equal(typeof f.listeners.close,'function');
    f.listeners.close(result);
    assert.deepEqual(await pending,{status:'dismissed'});
    provider.dispose();
  }
});

test('an opening or recovery load that never resolves still times out without rewarding',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for (const retry of [false,true]) {
    const f=fixture(); let resolveOpening;
    const blocked=new Promise(resolve=>resolveOpening=resolve);
    f.ad.show=()=>retry?Promise.reject(Error('not ready')):blocked;
    f.ad.load=()=>blocked;
    const provider=createTapTapAdProvider(f.sdk,'fixture-only');
    const pending=provider.show(),oldClose=f.listeners.close;
    await new Promise(resolve=>setImmediate(resolve));
    t.mock.timers.tick(44000);
    assert.deepEqual(await pending,{status:'failed'});
    resolveOpening(); oldClose({isEnded:true});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(f.listeners,{});
    assert.deepEqual(await provider.show(),{status:'unavailable'});
    provider.dispose();
  }
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
    const f=fixture();
    if (exit==='timeout') f.ad.show=()=>new Promise(()=>{});
    const provider=createTapTapAdProvider(f.sdk,'fixture-only',5),first=provider.show();
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
