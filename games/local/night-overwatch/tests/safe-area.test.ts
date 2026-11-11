import test from 'node:test';
import assert from 'node:assert/strict';
import {safeArea,safeAreaSources,watchSafeArea,fitName} from '../assets/scripts/core/SafeArea.ts';
const zero={left:0,right:0,top:0,bottom:0};
test('trusted native safe/status/capsule bounds merge by max without DPR multiplication',()=>{
 const sdk={getWindowInfo(){assert.equal(this,sdk);return{windowWidth:844,windowHeight:390,pixelRatio:3,statusBarHeight:24,safeArea:{left:0,right:844,top:12,bottom:390}};},getMenuButtonBoundingClientRect(){return{top:20,bottom:32};}};
 assert.deepEqual(safeArea(844,390,zero,[sdk]),{...zero,top:32,capsule:true});
 assert.deepEqual(safeArea(568,320,zero,[sdk]),{...zero,capsule:false});
 assert.deepEqual(safeArea(844,390,zero,[]),{...zero,capsule:false});
 assert.deepEqual(safeArea(844,390,{...zero,top:7},[{getWindowInfo(){throw Error();}}]),{...zero,top:7,capsule:false});
 assert.deepEqual(safeArea(844,390,zero,[{getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,statusBarHeight:NaN})}]),{...zero,capsule:false});
});
test('native same-size resize invalidates once and is removable; names retain whole code points',()=>{
 let callback=()=>{},count=0;const sdk={onWindowResize(fn){callback=fn;},offWindowResize(fn){assert.equal(fn,callback);callback=()=>{};}};
 const stop=watchSafeArea(()=>count++,[sdk]);callback();assert.equal(count,1);stop();callback();assert.equal(count,1);
 assert.equal(fitName('夜航',80,14),'夜航');assert(fitName('W'.repeat(16),140,12).endsWith('…'));assert.equal(fitName('夜航守望长昵称😀',70,14),'夜航守望…');assert(!fitName('😀'.repeat(20),70,14).includes('�'));
});
test('a complete capsule only reserves its rectangle; host status bar height counts in portrait only',()=>{
 const capsule={left:740,right:832,top:16,bottom:52};
 const sdk={getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:3,statusBarHeight:24}),getMenuButtonBoundingClientRect:()=>capsule};
 assert.deepEqual(safeArea(844,390,zero,[sdk]),{...zero,capsule:true,capsuleRect:capsule});
 assert.deepEqual(safeArea(844,390,{...zero,top:60},[sdk]),{...zero,top:60,capsule:true,capsuleRect:capsule});
 // Redmi K90 / TapTap: the hidden landscape status bar is still reported as 58px, also echoed as safeArea.top.
 const k90={getWindowInfo:()=>({windowWidth:919,windowHeight:423,statusBarHeight:58,safeArea:{left:0,right:919,top:58,bottom:423}}),getMenuButtonBoundingClientRect:()=>({left:816,right:903,top:23,bottom:56})};
 assert.equal(safeArea(919,423,{...zero,left:58},[k90]).top,0);assert.equal(safeArea(919,423,{...zero,left:58},[k90]).left,58);
 const portrait={getWindowInfo:()=>({windowWidth:423,windowHeight:919,statusBarHeight:58,safeArea:{left:0,right:423,top:58,bottom:900}})};
 assert.deepEqual(safeArea(423,919,zero,[portrait]),{...zero,top:58,bottom:19,capsule:false});
 assert.deepEqual(safeAreaSources([sdk,{getWindowInfo(){throw Error('x');}}]),[{windowWidth:844,windowHeight:390,pixelRatio:3,statusBarHeight:24,safeArea:undefined,capsule},{error:'Error: x'}]);
});
