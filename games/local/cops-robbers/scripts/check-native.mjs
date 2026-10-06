import assert from 'node:assert/strict';
import { startNativeCopsGame } from '../src/native.js';
import { levels } from '../src/levels.js';
import { legalTargets } from '../src/engine.js';
import { quickSolutions } from '../src/quick-trials.js';
let clock = 1000;
const originalNow = Date.now; Date.now = () => clock += 200;
function host(saved = {}, size = [390, 844]) {
 const listeners = new Map(), writes = [];
 const sdk = { createCanvas: () => ({ getContext: () => new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 80 }) : () => {} }) }), getSystemInfoSync: () => ({ windowWidth: size[0], windowHeight: size[1], pixelRatio: 2, safeArea: {top: 28,bottom: size[1] - 18} }), getStorageSync: () => JSON.stringify(saved), setStorageSync: (_, raw) => writes.push(JSON.parse(raw)) };
 for (const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']) { sdk[`on${event}`] = fn => listeners.set(event, fn); sdk[`off${event}`] = fn => { if (listeners.get(event) === fn) listeners.delete(event); }; }
 return {sdk,listeners,writes,size};
}
function tap(game, host, id) {
 const h = game.getState().hits.find(h => h.id === id); assert.ok(h, `missing ${id}`);
 const touch = {identifier:1,clientX:h.x+h.w/2,clientY:h.y+h.h/2};
 host.listeners.get('TouchStart')({touches:[touch]}); host.listeners.get('TouchEnd')({touches:[],changedTouches:[touch]});
}
const h = host({completed:{1:{turns:7,stars:3}}, relayCompleted:{4:{turns:10,stars:2}}, extra:'preserved'}), game = startNativeCopsGame(h.sdk);
assert.equal(game.getState().page,'home'); tap(game,h,'选择关卡');
assert.ok(game.getState().hits.some(hit=>hit.id.startsWith('2 内外夹击'))); assert.ok(!game.getState().hits.some(hit=>hit.id.startsWith('3 巷口接力')));
tap(game,h,'返回主页'); tap(game,h,'开始巡逻'); assert.equal(game.getState().levelId,2);
const before = game.getState().board;
const hit=game.getState().hits.find(hit=>hit.id==='留守一步'), t={identifier:1,clientX:hit.x+20,clientY:hit.y+20};
h.listeners.get('TouchStart')({touches:[t]}); h.listeners.get('TouchMove')({touches:[{...t,clientX:-30}]}); h.listeners.get('TouchEnd')({touches:[],changedTouches:[t]}); assert.deepEqual(game.getState().board,before);
h.listeners.get('TouchStart')({touches:[t]}); h.listeners.get('TouchCancel')({}); h.listeners.get('TouchEnd')({touches:[],changedTouches:[t]}); assert.deepEqual(game.getState().board,before);
h.listeners.get('TouchStart')({touches:[t,{...t,identifier:2}]}); h.listeners.get('TouchEnd')({touches:[],changedTouches:[t]}); assert.deepEqual(game.getState().board,before);
h.listeners.get('Hide')(); assert.equal(game.getState().page,'pause'); h.listeners.get('Show')(); assert.equal(game.getState().page,'pause');
tap(game,h,'继续'); h.size[0]=320; h.size[1]=568; h.listeners.get('WindowResize')(); assert.deepEqual(game.getState().board,before);
for (const hit of game.getState().hits) assert.ok(hit.w>=44 && hit.h>=44);
tap(game,h,'暂停'); tap(game,h,'返回主页');
tap(game,h,'切换：标准 / 接力 / 快练'); assert.equal(game.getState().mode,'relay');
tap(game,h,'开始巡逻');
const relayBoard=game.getState().board, relayLevel=levels.find(level=>level.id===game.getState().levelId);
const target=legalTargets(relayLevel,relayBoard,0).find(n=>n!==relayBoard.cops[0]);
assert.ok(Number.isInteger(target)); tap(game,h,`node${target}`);
assert.equal(game.getState().board.relayLast,0);
if(game.getState().page==='play') {
 const after=game.getState().board, forbidden=legalTargets(relayLevel,after,0).find(n=>n!==after.cops[0]);
 if(Number.isInteger(forbidden)){tap(game,h,`node${forbidden}`); assert.deepEqual(game.getState().board,after)}
 tap(game,h,'撤销'); assert.deepEqual(game.getState().board,relayBoard);
 tap(game,h,'暂停');
}
tap(game,h,'返回主页'); tap(game,h,'切换：标准 / 接力 / 快练'); assert.equal(game.getState().mode,'quick'); tap(game,h,'开始巡逻');
for (const plan of quickSolutions[1]) { const state=game.getState().board; const actor=plan.findIndex((n,i)=>n!==state.cops[i]); if(actor>=0) tap(game,h,`cop${actor}`); if(actor<0) tap(game,h,'留守一步'); else { const node=game.getState().hits.find(hit=>hit.id===`node${plan[actor]}`); assert.ok(node); tap(game,h,node.id); } }
assert.equal(game.getState().page,'result'); assert.ok(game.getState().board.robbers.every(n=>n===-1)); assert.equal(h.writes.at(-1).quickCompleted[1].stars,3); assert.equal(h.writes.at(-1).extra,'preserved'); assert.ok(h.writes.at(-1).relayCompleted[4]);
tap(game,h,'下一关'); assert.equal(game.getState().levelId,2);
tap(game,h,'暂停'); tap(game,h,'学习 / 帮助'); tap(game,h,'返回'); assert.equal(game.getState().page,'pause');
game.dispose(); assert.equal(h.listeners.size,0);
const restoredHost=host(h.writes.at(-1)); const restored=startNativeCopsGame(restoredHost.sdk); restoredHost.listeners.get('Hide')(); assert.equal(restoredHost.writes.at(-1).patrols['quick:standard'].levelId,2); tap(restored,restoredHost,'切换：标准 / 接力 / 快练'); tap(restored,restoredHost,'切换：标准 / 接力 / 快练'); tap(restored,restoredHost,'继续巡逻'); assert.equal(restored.getState().levelId,2); restored.dispose();
const broken=host(); broken.sdk.getStorageSync=()=>{throw new Error('disabled')}; broken.sdk.setStorageSync=()=>{throw new Error('disabled')}; const fallback=startNativeCopsGame(broken.sdk); tap(fallback,broken,'开始巡逻'); assert.equal(fallback.getState().page,'play'); assert.equal(fallback.getState().storageOK,false); fallback.dispose();
const pkHost=host(); let exitPK, pkStopped=0;
const parent=startNativeCopsGame(pkHost.sdk,{apiUrl:'https://fixture.invalid'},(_sdk,config,renderer)=>{exitPK=config.onExit; assert.equal(typeof renderer,'function'); return {stop(){pkStopped++}}});
tap(parent,pkHost,'好友挑战'); assert.equal(pkHost.listeners.size,0);
exitPK(); assert.equal(pkStopped,1); assert.ok(pkHost.listeners.size>0);
parent.dispose(); assert.equal(pkHost.listeners.size,0,'outer dispose also cleans resumed solo child');
Date.now=originalNow;
console.log('native cops: touch cancellation/multitouch, safe-area, resize, pause, quick victory/unlock, v3 preservation, cleanup, storage fallback passed');
