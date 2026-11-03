import test from 'node:test';
import assert from 'node:assert/strict';
import {safeArea,watchSafeArea,fitName} from '../assets/scripts/core/SafeArea.ts';
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
