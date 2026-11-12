import { realpath } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPlatform } from '../platforms/build.mjs';
import * as actions from '../assets/scripts/core/Actions.ts';
import * as data from '../assets/scripts/core/Data.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';
import { Online } from '../assets/scripts/Online.ts';
import { Quartermaster, type ProgressionPage } from '../assets/scripts/Quartermaster.ts';
import { ECONOMY } from '../assets/scripts/core/Progression.ts';
import { assetFixture } from './progression-fixture.ts';

// Exercise the real HUD layout/drawing logic without building or launching Creator.
// These doubles record UI geometry; actual rendering still needs runtime QA.
class Transform {
  contentSize = { width: 0, height: 0 };
  setAnchorPoint() {}
  setContentSize(width: number, height: number) { this.contentSize = { width, height }; }
}
class SceneNode {
  static EventType = { NODE_DESTROYED: 'destroyed' };
  name: string;
  constructor(name = '') { this.name = name; }
  children: SceneNode[] = [];
  components = new Map();
  owner?: SceneNode;
  active = true;
  position = { x: 0, y: 0, z: 0 };
  get parent() { return this.owner; }
  set parent(value: SceneNode | undefined) {
    if (this.owner) this.owner.children.splice(this.owner.children.indexOf(this), 1);
    this.owner = value;
    value?.children.push(this);
  }
  get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  addChild(child: SceneNode) { child.parent = this; }
  addComponent(type: any) {
    const component = new type();
    component.node = this;
    this.components.set(type, component);
    return component;
  }
  getComponent(type: any) { return this.components.get(type); }
  getComponentsInChildren(type: any): any[] { return [...(this.components.has(type) ? [this.components.get(type)] : []), ...this.children.flatMap(child => child.getComponentsInChildren(type))]; }
  on() {}
  once() {}
  getChildByName(name: string) { return this.children.find(child => child.name === name); }
  setPosition(x: number, y: number, z = 0) { this.position = { x, y, z }; }
  setScale() {}
  setSiblingIndex(index: number) {
    const parent = this.parent!;
    parent.children.splice(parent.children.indexOf(this), 1);
    parent.children.splice(index, 0, this);
  }
  destroy() { this.active = false; this.parent = undefined; }
}
class Color {
  hex = '';
  fromHEX(hex: string) { this.hex = hex; return this; }
}
class Graphics {
  calls: { op: string; args: number[]; color: string; fill: string; width: number }[] = [];
  strokeColor = new Color();
  fillColor = new Color();
  lineWidth = 1;
  clear() { this.calls = []; }
}
for (const op of ['rect', 'roundRect', 'circle', 'moveTo', 'lineTo', 'close', 'stroke', 'fill'])
  Graphics.prototype[op] = function (...args: number[]) {
    this.calls.push({ op, args, color: this.strokeColor.hex, fill: this.fillColor.hex, width: this.lineWidth });
  };
const frame = { width: 568, height: 320 };
let inset = 0;
let artworkAvailable = false;
const cc = {
  EditBox: class { static InputMode = { SINGLE_LINE: 0 }; static InputFlag = { PASSWORD: 0, DEFAULT: 1 }; static EventType = { TEXT_CHANGED: 'change' }; isFocused() { return false; } },
  Vec3: class { x: number; y: number; z: number; constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } },
  UIOpacity: class { opacity = 255; }, Tween: { stopAllByTarget() {} },
  tween: (target: any) => ({ to(_time: number, values: object) { Object.assign(target, values); return this; }, call(callback: () => void) { callback(); return this; }, by(){return this;},delay(){return this;},set(){return this;},union(){return this;},repeatForever(){return this;},start() {} }),
  Node: SceneNode, UITransform: Transform, Graphics, Color,
  Camera: class { static ProjectionType = { ORTHO: 0 }; static ClearFlag = { DEPTH_ONLY: 0 }; },
  Canvas: class {}, Mask: class { static Type = { GRAPHICS_RECT: 0 }; },
  Sprite: class { static SizeMode = { CUSTOM: 0 }; static Type = { SIMPLE: 0, SLICED: 1 }; }, SpriteFrame: class { texture: any; rect: any={width:1024,height:512}; get originalSize() { return this.texture; } destroy() {} }, Texture2D: class {},
  TTFFont: class {},
  Rect: class { x: number; y: number; width: number; height: number; constructor(x: number, y: number, width: number, height: number) { Object.assign(this, { x, y, width, height }); } },
  resources: { load(name: string, _type: any, done: any) { if(name.startsWith('ui/progression/')||artworkAvailable&&!name.includes('home'))done(null,{width:1024,height:512});else done(new Error('unavailable art')); } },
  isValid: () => true,
  Label: class { static Overflow = { CLAMP: 0, SHRINK: 1, RESIZE_HEIGHT: 2 }; static HorizontalAlign = { CENTER: 0, LEFT: 1 }; static VerticalAlign = { CENTER: 0, TOP: 1 }; updateRenderData() {} },
  Layers: { Enum: { UI_2D: 1 } }, ResolutionPolicy: { EXACT_FIT: 0 },
  sys: { isMobile: false, isBrowser: false, getSafeAreaRect: () => ({ x: inset, y: inset, width: frame.width - inset * 2, height: frame.height - inset * 2 }) },
  view: { getFrameSize: () => frame, setDesignResolutionSize() {}, getScaleX: () => 1, getScaleY: () => 1 },
};
// Exercise the same adapted inputs supplied to the real native Creator build.
const nativeConfiguration = await buildPlatform('wechat', { configOnly: true, env: {} });
const hudURL = pathToFileURL(await realpath(path.join(path.dirname(path.dirname(nativeConfiguration.configuration)), 'assets/scripts/HUD.ts')));
(globalThis as any).__nightHudTestCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL?.startsWith(new URL('./',hudURL).href)) {
      if (id === 'cc' || id === './Effects') return { url: 'hud-test:' + id, shortCircuit: true };
      if (id.startsWith('./')) return next(new URL(/\.ts$/.test(id)?id:id+'.ts',context.parentURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'hud-test:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__nightHudTestCC;` };
    if (url === 'hud-test:./Effects') return { format: 'module', shortCircuit: true,
      source: 'export const drawEffects = () => ({ impacts: [], projectiles: [] });' };
    return next(url, context);
  },
});
let HUD: any;
try { ({ HUD } = await import(hudURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__nightHudTestCC; }
const heights: number[] = [];
const world = { zoom: 1, thermal: false, viewMode: 'night', project(p: data.Point, y = 0) {
  heights.push(y);
  return { x: frame.width / 2 + p.x, y: frame.height / 2 - p.z + y * 10, z: 0.5 };
} };
const overlaps = (a: any, b: any) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('equipped supports dock after normal weapons and every control reaches each safe edge independently', () => {
  try {
    for(const [width,height]of [[568,320],[844,390],[1280,720]]) for(const effects of [[],['emp'],['emp','drone'],['emp','laser']]) {
      Object.assign(frame,{width,height});inset=12;
      const hud=new HUD(new SceneNode()),sim=new Simulation('training-60');hud.touch=true;
      sim.applyLoadout({version:'night-growth-v1',level:10,effects,skipped:[]});sim.homingAmmo=5;sim.start();hud.update(sim,world);
      const ids=['weapon0','weapon1','weapon2','weapon3','homing','weapon4','skillUse','weapon5'];
      const controls=()=>hud.buttons.filter((b:any)=>ids.includes(b.id)&&b.label.node.activeInHierarchy);
      const rectangle=(l:any)=>{const size=l.node.getComponent(Transform).contentSize;return{x:l.node.position.x+frame.width/2-size.width/2,y:frame.height/2-l.node.position.y-size.height/2,w:size.width,h:size.height};};
      const support=controls().filter((b:any)=>['weapon4','skillUse','weapon5'].includes(b.id)).sort((a:any,b:any)=>a.x-b.x),homing=hud.buttons.find((b:any)=>b.id==='homing'),fire=hud.buttons.find((b:any)=>b.id==='fire');
      assert.equal(support.length,effects.length);assert(controls().every((b:any)=>b.y<=homing.y&&b.w>=44&&b.h===44));
      if(support.length){if(support[0].y===homing.y)assert.equal(support[0].x,homing.x+homing.w+8);for(let i=1;i<support.length;i++)if(support[i].y===support[i-1].y)assert(Math.abs(support[i].x-support[i-1].x-support[i-1].w-6)<1e-9);}
      for(const b of controls()) {
        assert(!overlaps(b,fire));assert(!overlaps(b,rectangle(hud.labels.get('weaponState'))));
        assert(controls().every((other:any)=>other===b||!overlaps(b,other)));
      }
      for(const id of ['notice','friendWarning','tutorial']) {
        const notice=rectangle(hud.labels.get(id));assert(controls().every((b:any)=>!overlaps(b,notice)));assert(!overlaps(notice,fire));assert(!overlaps(notice,rectangle(hud.labels.get('weaponState'))));
      }
      const geometry=()=>controls().map(({id,x,y,w,h}:any)=>({id,x,y,w,h}));
      for(const b of controls()) {
        const others=geometry().filter((r:any)=>r.id!==b.id);
        for(const position of [{x:0,y:.5},{x:1,y:.5},{x:.5,y:0},{x:.5,y:1}]) {
          hud.placeControl(b.id,position);const bounds=hud.controlBounds(b.id);
          const placed=hud.controlPositions[b.id];
          assert.equal(b.x,bounds.x+bounds.w*placed.x);assert.equal(b.y,bounds.y+bounds.h*placed.y);
          assert(!overlaps(b,fire),'dragged controls avoid the enlarged fire button');
          assert.equal(b.label.node.position.x,b.x+b.w/2-width/2);assert.deepEqual(geometry().filter((r:any)=>r.id!==b.id),others);
        }
        hud.placeControl(b.id);assert.equal(hud.controlPositions[b.id],undefined);
      }
      assert.match(hud.labels.get('weaponState').string,/弹着\n热量/);
      hud.placeControl('weapon0',{x:.2,y:0});
      const fresh=new HUD(new SceneNode());fresh.touch=true;fresh.update(sim,world);assert.deepEqual(fresh.controlPositions,{});
      Object.assign(frame,{width:568,height:320});hud.resize();hud.update(sim,world);
      const moved=hud.buttons.find((b:any)=>b.id==='weapon0');assert.equal(moved.y,inset);assert(moved.x>=inset&&moved.x+moved.w<=568-inset);
    }
  } finally {delete (cc.sys as any).localStorage;inset=0;}
});

test('control sizes keep touch targets reachable and paused layout mode exposes fire without firing',()=>{
 for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const scale of [.8,1,1.5]){
  Object.assign(frame,{width,height});inset=12;
  const hud=new HUD(new SceneNode()),sim=new Simulation('training-60');hud.touch=true;hud.fireScale=scale;hud.controlScale=scale;
  sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.homingAmmo=5;sim.start();hud.update(sim,world);
  const controls=hud.buttons.filter((b:any)=>['weapon0','weapon1','weapon2','weapon3','homing','weapon4','skillUse','fire'].includes(b.id)&&b.label.node.activeInHierarchy);
  for(const b of controls){
   assert(b.w>=44&&b.h>=44&&b.x>=inset&&b.y>=inset&&b.x+b.w<=width-inset&&b.y+b.h<=height-inset,`${width}/${scale}/${b.id} in safe bounds`);
   assert(!controls.some((other:any)=>other!==b&&overlaps(b,other)),`${width}/${scale}/${b.id} separated`);
  }
  assert.equal(hud.buttons.find((b:any)=>b.id==='fire').w,100*scale);
  sim.pause('settings',true);hud.controlsOpen=true;hud.update(sim,world);
  const buttons=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy);
  assert.equal(buttons.find((b:any)=>b.id==='resume')?.label.string,'继续战斗');
  for(const b of buttons)assert(!buttons.some((other:any)=>other!==b&&overlaps(b,other)));
  hud.layoutEditing=true;hud.update(sim,world);
  assert(!hud.modal);assert(hud.buttons.find((b:any)=>b.id==='layoutDone').label.node.activeInHierarchy);
  const fire=hud.buttons.find((b:any)=>b.id==='fire');assert.equal(hud.controlAt(fire.x+fire.w/2,fire.y+fire.h/2)?.id,'fire');
  for(const position of [{x:0,y:.5},{x:1,y:.5},{x:.5,y:0},{x:.5,y:1}]){
   hud.placeControl('fire',position);hud.update(sim,world);
   const label=hud.labels.get('weaponState'),size=label.node.getComponent(Transform).contentSize;
   assert(!overlaps(fire,{x:label.node.position.x+width/2-size.width/2,y:height/2-label.node.position.y-size.height/2,w:size.width,h:size.height}),'fire telemetry stays outside its touch target');
  }
  assert.equal(sim.fired,0);assert(sim.paused);
  sim.pause('background',true);hud.update(sim,world);assert(hud.modal,'system pauses cover editing');
 }
 inset=0;
});

test('high physical top insets and full capsules cannot push home actions into cards or cover layout controls',()=>{
 const getSafe=cc.sys.getSafeAreaRect;
 try{
  for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const fullCapsule of [false,true]){
   Object.assign(frame,{width,height});inset=0;
   cc.sys.getSafeAreaRect=()=>({x:12,y:12,width:width-24,height:height-12-52});
   const capsule={left:width-110,right:width-12,top:20,bottom:76};
   if(fullCapsule)(globalThis as any).tap={getWindowInfo:()=>({windowWidth:width,windowHeight:height,statusBarHeight:24}),getMenuButtonBoundingClientRect:()=>capsule};
   const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.touch=true;
   online.assets=assetFixture();hud.online=online;hud.quartermaster=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.update(sim,world);
   const strip=hud.modal.getComponentsInChildren(Graphics).flatMap((g:any)=>g.calls).find((c:any)=>c.op==='rect'&&c.fill==='#020e19c9');
   assert(strip,'home header backdrop is drawn');assert.equal(strip.args[1]+strip.args[3],height/2,'header backdrop reaches the screen top without moving safe content');
   if(width===568){const title=hud.modal.getComponentsInChildren(cc.Sprite).find((sprite:any)=>sprite.node.name==='Illustration:title');assert(title.node.getComponent(Transform).contentSize.width>=100,'the title stays readable beside the controls on a short safe viewport');}
   const buttons=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy);
   for(const b of buttons){assert(b.y>=52&&b.y+b.h<=height-12,`${width}/${fullCapsule}/${b.id} bounded`);assert(!buttons.some((other:any)=>other!==b&&overlaps(b,other)),`${width}/${fullCapsule}/${b.id} separated`);}
   const gear=buttons.find((b:any)=>b.id==='settings');if(fullCapsule)assert(gear.x+gear.w<capsule.left);
   sim.start();sim.pause('settings',true);
   for(const page of ['controlsOpen','zoomOpen']){
    hud.controlsOpen=page==='controlsOpen';hud.zoomOpen=page==='zoomOpen';hud.update(sim,world);
    const settings=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy);
    for(const b of settings)assert(!settings.some((other:any)=>other!==b&&overlaps(b,other)),`${width}/${fullCapsule}/${page}/${b.id} settings separated`);
   }
   hud.layoutEditing=true;hud.update(sim,world);
   for(const id of ['fire','weapon0']){hud.placeControl(id,{x:1,y:0});const b=hud.buttons.find((b:any)=>b.id===id);if(fullCapsule)assert(!overlaps(b,{x:capsule.left,y:capsule.top,w:capsule.right-capsule.left,h:capsule.bottom-capsule.top}));}
   delete (globalThis as any).tap;
  }
 }finally{cc.sys.getSafeAreaRect=getSafe;delete (globalThis as any).tap;inset=0;}
});

test('zoomed enemy diamonds stay visible across transparent controls and footer gaps',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;
 const hud=new HUD(new SceneNode()),sim=new Simulation();hud.touch=true;sim.start();hud.update(sim,world);
 const enemy=sim.addUnit('light',{x:0,z:0},false);sim.units=[enemy];hud.autoPriority=false;hud.touch=false;
 hud.placeControl('weapon0',{x:.4,y:.5});const button=hud.buttons.find((b:any)=>b.id==='weapon0');
 const points=[{x:button.x-12,y:button.y+22},{x:button.x+button.w/2,y:button.y+22},{x:button.x+button.w+12,y:button.y+22},{x:550,y:360},{x:810,y:310}];
 for(const p of points){
  const projected={...world,project:()=>({x:p.x,y:390-p.y,z:.5})};hud.marks.clear();hud.drawWorld(sim,projected);
  const x=p.x-422,y=195-p.y,r=enemy.kind==='heavy'?7:5,path=[['moveTo',x,y+r],['lineTo',x+r,y],['lineTo',x,y-r],['lineTo',x-r,y],['close'],['stroke']];
  assert(hud.marks.calls.some((_:any,i:number)=>path.every(([op,...args],j)=>{const c=hud.marks.calls[i+j];return c?.op===op&&c.color==='#ff525b'&&args.every((v,k)=>Math.abs(c.args[k]-Number(v))<.001);})),JSON.stringify(p));
 }
 assert.equal(hud.hit(button.x+button.w/2,button.y+22)?.id,'weapon0','interaction still respects the control hit area');
});

test('temporary layout ignores all old storage and keeps settings reachable',()=>{
  const accessed:string[]=[];
  (cc.sys as any).localStorage={getItem(key:string){accessed.push(key);return JSON.stringify({weapon4:{x:.5,y:.4},skillUse:{x:.6,y:.4},weapon5:{x:.7,y:.4}});},setItem(key:string){accessed.push(key);}};
  try {
    Object.assign(frame,{width:844,height:390});inset=0;
    const sim=new Simulation('training-60');sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.start();
    const hud=new HUD(new SceneNode());hud.touch=true;
    assert(hud.buttons.filter((b:any)=>['weapon4','skillUse','weapon5'].includes(b.id)).every((b:any)=>b.y===390-60+8),'initial support nodes start on the bottom line');
    hud.update(sim,world);assert.deepEqual(hud.controlPositions,{});
    const emp=hud.buttons.find((b:any)=>b.id==='skillUse'),drone=hud.buttons.find((b:any)=>b.id==='weapon4');assert.equal(emp.y,390-60+8);assert.equal(drone.y,emp.y);assert.equal(emp.x,drone.x+drone.w+6);
    hud.placeControl('skillUse',{x:.2,y:.3});const temporary={...hud.controlPositions.skillUse};
    const ordinary=new Simulation('training-60');ordinary.start();hud.update(ordinary,world);hud.update(sim,world);assert.deepEqual(hud.controlPositions.skillUse,temporary);
    assert.deepEqual(new HUD(new SceneNode()).controlPositions,{});
    const settings=hud.buttons.find((b:any)=>b.id==='settings'),bounds=hud.controlBounds('weapon0');
    hud.placeControl('weapon0',{x:(settings.x-bounds.x)/bounds.w,y:(settings.y-bounds.y)/bounds.h});
    assert.equal(hud.hit(settings.x+20,settings.y+20).id,'settings');assert.equal(hud.controlAt(settings.x+20,settings.y+20),undefined);
    const weapon=hud.buttons.find((b:any)=>b.id==='weapon0');assert(!overlaps(weapon,settings));assert.equal(hud.controlAt(weapon.x+weapon.w/2,weapon.y+weapon.h/2).id,'weapon0');
    assert.deepEqual(accessed,[],'layout never reads or writes localStorage');
  } finally {delete (cc.sys as any).localStorage;inset=0;}
});

test('custom controls remain draggable after large-to-small resize and hidden fire becomes visible',()=>{
  Object.assign(frame,{width:1280,height:720});inset=0;
  const sim=new Simulation('training-60');sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.homingAmmo=5;sim.start();
  const hud=new HUD(new SceneNode());hud.touch=true;hud.update(sim,world);
  const bounds=hud.controlBounds('weapon0'),fire=hud.buttons.find((b:any)=>b.id==='fire');
  hud.placeControl('weapon0',{x:1173/bounds.w,y:(fire.y+5)/bounds.h});
  Object.assign(frame,{width:568,height:320});hud.resize();hud.update(sim,world);
  let weapon=hud.buttons.find((b:any)=>b.id==='weapon0'),trigger=hud.buttons.find((b:any)=>b.id==='fire');
  assert(!overlaps(weapon,trigger));assert.equal(hud.controlAt(weapon.x+weapon.w/2,weapon.y+weapon.h/2)?.id,'weapon0');
  Object.assign(frame,{width:1280,height:720});hud.touch=false;hud.resize();hud.update(sim,world);
  const desktopBounds=hud.controlBounds('weapon0'),hiddenFire=hud.buttons.find((b:any)=>b.id==='fire');assert(!hiddenFire.label.node.activeInHierarchy);
  hud.placeControl('weapon0',{x:(hiddenFire.x+3)/desktopBounds.w,y:(hiddenFire.y+5)/desktopBounds.h});
  hud.touch=true;hud.resize();hud.update(sim,world);weapon=hud.buttons.find((b:any)=>b.id==='weapon0');trigger=hud.buttons.find((b:any)=>b.id==='fire');
  assert(trigger.label.node.activeInHierarchy);assert(!overlaps(weapon,trigger));assert.equal(hud.controlAt(weapon.x+weapon.w/2,weapon.y+weapon.h/2)?.id,'weapon0');
});

test('HUD: skins are mounted, visual bounds stay inside touch targets, and unavailable pagination rejects input', () => {
  Object.assign(frame,{width:844,height:390});inset=0;artworkAvailable=true;
  try {
    const hud=new HUD(new SceneNode()),sim=new Simulation();
    hud.online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.update(sim,world);
    assert(hud.interfaceArtworkReady);
    assert(hud.modal.getComponentsInChildren(cc.Sprite).some((s:any)=>s.type===cc.Sprite.Type.SLICED));
    const primary=hud.buttons.find((b:any)=>b.id==='missions');
    assert(primary.h>=44&&primary.visual.h<primary.h);
    assert.equal(hud.hit(primary.x+primary.w/2,primary.y+1)?.id,'missions','invisible padding remains tappable');
    hud.pressedButton='missions';hud.update(sim,world);
    assert(hud.globalGraphics.calls.some((c:any)=>c.fill==='#e5d5b433'),'press paints immediate feedback');
    hud.online.show('menu');hud.update(sim,world);
    assert.equal(hud.pressedButton,'','page change clears feedback');
    assert(!hud.buttons.some((b:any)=>b.id==='online:dismiss'));
    for (const id of ['friend','join','match','bot']) {
      const b=hud.buttons.find((b:any)=>b.id==='online:'+id);
      assert(b.label.isBold,id+': uses the skinned lobby action style');
      assert(b.h>=44);
    }
    assert(!hud.buttons.some((b:any)=>b.id==='online:roomNext'));assert(hud.listAreas.some((a:any)=>a.key==='rooms'&&a.max===0));
    assert(hud.modal.getComponentsInChildren(cc.Sprite).some((s:any)=>s.type===cc.Sprite.Type.SLICED));
  } finally {artworkAvailable=false;}
});

test('fire press and hover feedback follow the circular trigger at every configurable size',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;
 const hud=new HUD(new SceneNode()),sim=new Simulation();hud.touch=true;sim.start();
 for(const scale of [.8,1,1.5]){
  hud.fireScale=scale;hud.update(sim,world);const fire=hud.buttons.find((b:any)=>b.id==='fire');assert.equal(hud.controlAt(fire.x+fire.w/2,fire.y+fire.h/2)?.id,'fire');
  for(const pressed of [false,true]){
   hud.pressedButton=pressed?'fire':'';hud.mousePointer={x:fire.x+fire.w/2,y:fire.y+fire.h/2};hud.globalGraphics.clear();hud.buttonFeedback();
   const calls=hud.globalGraphics.calls;assert(calls.some((c:any)=>c.op==='circle'&&c.args[2]===Math.min(fire.w,fire.h)/2-3));assert(!calls.some((c:any)=>c.op==='rect'||c.op==='roundRect'));
  }
 }
});

test('wheel face spins, rim nudges, and neither receives a rectangular hover or press outline',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;
 const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
 online.authenticatedId='qa-pilot';online.assets=assetFixture();hud.online=online;hud.quartermaster=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster.page='supply';hud.update(sim,world);
 const wheel=hud.buttons.find((b:any)=>b.id==='qm:wheelTap');assert(wheel);
 for(const [dx,dy,id]of [[.5,.5,'qm:wheelTap'],[.96,.5,'qm:wheelNudge'],[.02,.02,'qm:wheelNudge']] as const){
  const x=wheel.x+wheel.w*dx,y=wheel.y+wheel.h*dy;assert.equal(hud.hit(x,y)?.id,id);
  for(const pressed of [false,true]){hud.pressedButton=pressed?id:'';hud.mousePointer={x,y};hud.globalGraphics.clear();hud.buttonFeedback();assert.equal(hud.globalGraphics.calls.length,0);}
 }
 wheel.disabled=true;assert.equal(hud.hit(wheel.x+wheel.w*.96,wheel.y+wheel.h*.5),undefined);
});

test('storage diagnostics remain readable and scrollable above a reachable close action on phones',()=>{
 for(const [width,height]of [[568,320],[844,390],[1280,720]]){
  Object.assign(frame,{width,height});inset=12;const hud=new HUD(new SceneNode()),sim=new Simulation();hud.missionsOpen=true;
  hud.storageError=['stage=readback','source=window.localStorage','name=QuotaExceededError code=22','message=Storage operation failed','getItem=function setItem=function removeItem=function key=function','length=number:3','writeBytes=320 actualType=undefined readBytes=0 matches=false','window.localStorage selection failed','name=SecurityError','message=Browser storage blocked'].join('\n');
  hud.update(sim,world);assert(hud.modalKey.startsWith('storageError:'));assert(hud.scrollNode);const close=hud.buttons.find((b:any)=>b.id==='close');assert(close.w>=44&&close.h>=44);assert.equal(hud.hit(close.x+close.w/2,close.y+close.h/2)?.id,'close');
  assert(hud.scrollArea.y+hud.scrollArea.h<=close.y);assert(hud.modal.getComponentsInChildren(cc.Label).filter((l:any)=>l.node.parent===hud.scrollNode).every((l:any)=>l.fontSize>=14));
  if(height===320){assert(hud.scrollMax>0);hud.scrollBy(hud.scrollMax);assert.equal(hud.scroll,hud.scrollMax);}
  hud.storageError='';hud.update(sim,world);assert.equal(hud.modalKey,'missions');
 }
 inset=0;
});

test('HUD: history keeps next page enabled while the server has another cursor', () => {
  Object.assign(frame,{width:844,height:390});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation();
  hud.online=new Online({getItem:()=>null,setItem(){}},()=>{});
  hud.online.history={matches:[],nextCursor:'older-records'};hud.online.show('history');hud.update(sim,world);
  assert(!hud.buttons.some((b:any)=>b.id==='online:dismiss'));
  const back=hud.buttons.find((b:any)=>b.id==='online:back');
  assert(back && back.label.string==='返回' && back.h>=44);
  const next=()=>hud.buttons.find((b:any)=>b.id==='online:historyMore');
  assert(!next().disabled);assert.equal(hud.hit(next().x+22,next().y+22)?.id,'online:historyMore');
  hud.online.history.nextCursor=null;hud.online.revision++;hud.update(sim,world);
  assert.equal(next(),undefined);
});

test('HUD: result uses each player settlement, marks your side and keeps small safe-area rows separate', () => {
  for (const [seat,a,b,title] of [[0,'win','loss','战斗胜利'],[1,'win','loss','战斗失败'],[0,'loss','loss','战斗失败'],[0,'draw','draw','战斗平局'],[-1,'win','loss','观战结束']] as const) {
    Object.assign(frame,{width:568,height:320}); inset=20;
    const hud=new HUD(new SceneNode()), sim=new Simulation(), online=new Online({getItem:()=>null,setItem(){}},()=>{});
    online.startBot(0); online.view!.finished=true; online.view!.winner=1;
    online.room={code:'123456',status:'finished',mode:'friend',you:seat,seq:0,state:online.view!,players:[
      {id:'a',nickname:'甲方飞行员',settlement:{outcome:a,points:120}},
      {id:'b',nickname:'乙方飞行员',settlement:{outcome:b,points:40}},
    ],settlement:seat<0?undefined:{outcome:seat===0?a:b,points:seat===0?120:40}};
    hud.online=online; sim.duelMode=true; sim.phase='failure'; hud.update(sim,world);
    const labels=hud.modal.getComponentsInChildren(cc.Label), heading=labels.find((l:any)=>l.string===title);
    assert(heading,title); if(seat>=0)assert.equal(heading.color.hex,title==='战斗胜利'?'#75db9e':title==='战斗失败'?'#ff525b':'#e5b65c');
    assert(labels.some((l:any)=>l.string.startsWith('A方')&&l.string.endsWith(a==='win'?'胜利':a==='loss'?'失败':'平局')));
    assert(labels.some((l:any)=>l.string.startsWith('B方')&&l.string.endsWith(b==='win'?'胜利':b==='loss'?'失败':'平局')));
    assert.equal(labels.filter((l:any)=>l.string.includes(' · 你')).length,seat<0?0:1);
    assert(!labels.some((l:any)=>l.string.includes('undefined')||l.string==='本地练习'));
    const sideB=labels.find((l:any)=>l.string.startsWith('B方')), time=labels.find((l:any)=>l.string==='作战用时');
    assert(sideB.node.position.y-time.node.position.y>=24,'both sides stay above the metric captions');
    assert(!hud.buttons.some((button:any)=>button.id==='settings'&&button.label.node.activeInHierarchy));

  }
  inset=0;
});

test('HUD: grouped rankings keep all 100 rows scrollable, medal the top three and reset on board changes',()=>{
  for (const [width,height] of [[568,320],[844,390],[1280,720]]) {
    Object.assign(frame,{width,height}); inset=20;
    const hud=new HUD(new SceneNode()), sim=new Simulation(), online=new Online({getItem:()=>null,setItem(){}},()=>{});
    const rows=Array.from({length:100},(_,i)=>({playerId:String(i).padStart(8,'0'),nickname:'这是一个包含十六个汉字的玩家昵称',rank:i+1,score:120-i,secondary:1200,wins:120-i,games:240}));
    hud.online=online;online.identity=rows[99];online.ranking={top:rows,me:rows[99]};online.show('ranking');
    for (const board of ['clears','level','points','win-rate'] as const) {
      online.board=board;online.revision++;hud.update(sim,world);
      const solo=board==='clears'||board==='level';
      assert.deepEqual(hud.buttons.filter((b:any)=>b.id.startsWith('online:board:')).map((b:any)=>b.id),solo?['online:board:clears','online:board:level']:['online:board:points','online:board:win-rate']);
      const labels=hud.scrollNode.getComponentsInChildren(cc.Label);
      assert.equal(labels.filter((l:any)=>/^第\d+名$/.test(l.string)).length,100);
      assert.equal(hud.scrollNode.children.filter((n:any)=>n.name.startsWith('RankMedal:')).length,3);
      assert.equal(hud.scroll,0);assert(hud.scrollArea.h>=50);
      assert(hud.scrollArea.y+hud.scrollArea.h<hud.buttons.find((b:any)=>b.id==='online:back').y-20);
      hud.scrollBy(Infinity);assert.equal(hud.scrollNode.position.y,hud.scrollMax);
      const last=labels.find((l:any)=>l.string==='第100名');
      assert.equal(last.node.position.y+hud.scroll,-hud.scrollArea.h/2+18,'last row remains fully visible at the end');
      assert(!hud.buttons.some((b:any)=>b.id==='online:pageNext'));
      const mine=hud.modal.getComponentsInChildren(cc.Label).find((l:any)=>l.string.startsWith('我的排名 第100名'));
      assert(mine);
      if(board==='win-rate'){
        assert.equal(mine.string,'我的排名 第100名 · 胜率 8.8% · 21/240');
        assert(labels.some((l:any)=>l.string==='胜率 50% · 120/240'));
      }
    }
  }
  inset=0;
});

test('HUD: campaign status shows the actual first and last level, excluding warmup and duel', () => {
  Object.assign(frame,{width:568,height:320});inset=0;
  const hud=new HUD(new SceneNode());
  for (const index of [0,119]) {
    const sim=new Simulation(MISSIONS[index].id);sim.start();hud.update(sim,world);
    assert.match(hud.labels.get('status').string,new RegExp(`^${index+1}关 · `));
    hud.lang='en';hud.update(sim,world);assert.match(hud.labels.get('status').string,new RegExp(`^L${index+1} · `));hud.lang='zh';
    sim.duelMode=true;hud.update(sim,world);assert(!hud.labels.get('status').string.includes('关'));
  }
  const warmup=new Simulation('training-60');warmup.start();hud.update(warmup,world);
  assert(!hud.labels.get('status').string.includes('关'));
});

test('HUD: identical names remain distinct, own ranking is highlighted, and closed rooms offer only leave', () => {
  Object.assign(frame, { width: 1280, height: 720 }); inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  const own = { playerId: '11111111-1111-4111-8111-111111111111', nickname: '夜航者', rank: 2, secondary: 1200 };
  const other = { ...own, playerId: '22222222-2222-4222-8222-222222222222', rank: 1, secondary: 1000 };
  hud.online = { identity: own, panel: 'ranking', revision: 1, board: 'level', level: 0, ranking: { top: [other, own], me: own } };
  hud.update(sim, world);
  const labels = hud.modal.getComponentsInChildren(cc.Label);
  const mine = labels.find((label: any) => label.string.includes('夜航者 #11111111'));
  const theirs = labels.find((label: any) => label.string.includes('夜航者 #22222222'));
  assert.match(mine.string, /11111111/); assert(labels.some((label:any)=>label.string==='第2名')); assert(labels.some((label:any)=>label.string.startsWith('我的排名 第2名'))); assert.match(theirs.string, /22222222/);
  assert.notEqual(mine.color.hex, theirs.color.hex);
  assert.equal(mine.horizontalAlign, cc.Label.HorizontalAlign.LEFT);
  assert.equal(theirs.horizontalAlign, cc.Label.HorizontalAlign.LEFT);
  assert(!hud.buttons.some((button: any) => button.id === 'online:dismiss'));
  assert(hud.buttons.some((button: any) => button.id === 'online:back'));
  hud.online.panel = 'room'; hud.online.room = { mode: 'friend', status: 'abandoned', code: 'A12BCD456789', players: [own, other], you: 0 };
  hud.online.message = '房间已结束'; hud.online.revision++;
  hud.update(sim, world);
  const ids = hud.buttons.filter((button: any) => button.label.node.parent === hud.modal).map((button: any) => button.id);
  assert.deepEqual(ids, ['online:backLobby']);
});

test('HUD: duel results keep global settings and share controls away from the close target after resize', () => {
  for(const [width,height] of [[568,320],[844,390],[1280,720]]){
    Object.assign(frame,{width,height});inset=0;
    const hud=new HUD(new SceneNode()),sim=new Simulation();
    hud.online=new Online({getItem:()=>null,setItem(){}},()=>{});
    hud.online.view={finished:true,winner:0};sim.duelMode=true;sim.phase='success';
    hud.screenControl=true;hud.touch=false;hud.resize();hud.update(sim,world);
    assert.equal(hud.modalKey,'duelResult');
    assert(!hud.buttons.some((b:any)=>hud.isGlobalAction(b.id)&&b.label.node.activeInHierarchy));
    for(const b of hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy)){
      assert.equal(hud.hit(b.x+b.w/2,b.y+b.h/2)?.id,b.id);
      assert(b.y>=0&&b.y+b.h<=height&&b.x>=0&&b.x+b.w<=width);
    }
  }
});

test('HUD: a full waiting room remains labelled as awaiting battle', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  hud.online = new Online({ getItem: () => null, setItem() {} }, () => {});
  hud.online.rooms = [{ code: '123456', status: 'waiting', players: [{ name: '甲' }, { name: '乙' }], playerCount: 2, canJoin: false, canSpectate: true }];
  hud.online.show('menu'); hud.update(sim, world);
  const caption = hud.modal.getComponentsInChildren(cc.Label).map((label: any) => label.string).find((text: string) => text.includes('2/2'));
  assert.match(caption, /等待开战/); assert(!caption.includes('对战中'));
});

test('HUD: lobby forms, records, boards and share control fit landscape phones and desktop', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    Object.assign(frame, { width, height }); inset = 0;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    const online = new Online({ getItem: () => null, setItem() {} }, () => {});
    hud.online = online; hud.touch = width < 1000; hud.screenControl = true; hud.resize();
    online.rooms = Array.from({ length: 5 }, (_, i) => ({ code: String(123456 + i), status: 'waiting', mode: 'friend',
      players: [{ id: 'a', name: '飞行员' }], playerCount: 1, canJoin: true, canSpectate: true }));
    online.history = { summary: { games: 3, wins: 1, losses: 1, draws: 1, winRate: 1 / 3 },
      matches: Array.from({ length: 3 }, (_, i) => ({ id: String(i), code: '123456', opponent: { name: '好友' },
        outcome: 'win', reason: 'disconnect', startedAt: 1, finishedAt: 30001, durationMs: 30000, points: 120 })) };
    for (const panel of ['', 'menu', 'profile', 'create', 'join', 'history', 'ranking'] as const) {
      online.show(panel); hud.update(sim, world);
      const gear = hud.buttons.find((b: any) => b.id === 'settings');
      assert.equal(gear.label.node.activeInHierarchy, panel === '', panel + ': settings only on the home page');
      if (panel) assert.notEqual(hud.hit(gear.x + 22, gear.y + 22)?.id, 'settings');
      if (panel === 'profile') assert(!hud.buttons.find((b: any) => b.id === 'online:saveName').label.isBold, 'name confirmation uses the quiet secondary style');
      const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy && (!hud.modal || b.label.node.parent === hud.modal || hud.isGlobalAction(b.id)));
      assert.equal(new Set(buttons.map((b: any) => b.id)).size, buttons.length, panel + ': duplicate controls');
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height, panel + ': ' + b.id);
        for (const other of buttons.slice(i + 1)) assert(!overlaps(b, other), panel + ': ' + b.id + '/' + other.id);
      }
      for (const field of hud.modal.getComponentsInChildren(cc.EditBox))
        assert(field.node.getComponent(cc.UITransform).contentSize.width >= (panel==='menu'?90:180));
    }
  }
});

test('HUD: focused forms survive refresh, records hide settings, and report sits below the map', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) for (const safe of [0, 12]) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    const online = new Online({ getItem: () => null, setItem() {} }, () => {});
    hud.online = online; online.show('profile'); hud.update(sim, world);
    const panel = hud.modal, field = panel.getComponentsInChildren(cc.EditBox)[0];
    field.isFocused = () => true;
    online.revision++; hud.update(sim, world);
    assert.equal(hud.modal, panel, 'background responses do not replace the focused input');
    assert(hud.editing);
    field.isFocused = () => false; hud.update(sim, world);
    assert.notEqual(hud.modal, panel, 'refresh resumes after editing ends');
    online.show('history'); hud.update(sim, world);
    const settings = hud.buttons.find((b: any) => b.id === 'settings');
    assert(!settings.label.node.activeInHierarchy);
    assert.notEqual(hud.hit(settings.x + 22, settings.y + 22)?.id, 'settings');
    online.show(''); sim.start(); hud.update(sim, world);
    assert(settings.label.node.activeInHierarchy);
    const report = hud.buttons.find((b: any) => b.id === 'battleReport'), map = hud.minimapLayout;
    assert(report.x+report.w<width/2);assert(report.y>=safe&&report.y<safe+8&&report.h>=44);assert(!hud.buttons.some((b:any)=>b.id==='equipment'&&b.label.node.activeInHierarchy));
    assert.equal(hud.hit(report.x + report.w / 2, report.y + report.h / 2)?.id, 'battleReport');
    assert(!hud.buttons.some((b: any) => b !== report && b.label.node.activeInHierarchy && overlaps(b, report)));
    assert(report.y + report.h < height - hud.footer - safe);
    assert(hud.g.calls.some((c: any) => c.op === 'roundRect' && c.fill === '#0b192950'));
  }
  inset = 0;
});

test('HUD: real urgent targets avoid convoy, supply and zoom controls on small screens', () => {
  for (const [width, height] of [[1366, 768], [844, 390], [568, 320]]) {
    Object.assign(frame, { width, height }); inset = 0;
    const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start();
    hud.touch = width < 1000; hud.rewardsAvailable = true;
    const enemy = sim.units.find(u => !u.friendly)!;
    enemy.x = sim.rescue.x + 5; enemy.z = sim.rescue.z; enemy.born = -30; enemy.attack = 3;
    hud.update(sim, world);
    const priority = hud.buttons.find((b: any) => b.id === 'priority');
    assert(priority.label.node.activeInHierarchy);
    for (const button of hud.buttons.filter((b: any) => b !== priority && b.label.node.activeInHierarchy))
      assert(!overlaps(priority, button), `${width}: priority overlaps ${button.id}`);
    sim.pause('settings', true); hud.zoomOpen = true; hud.update(sim, world); assert(!priority.label.node.activeInHierarchy);
    assert(!hud.labels.get('priorityMarker').node.active);
    hud.zoomOpen = false; hud.toolsOpen = true; hud.update(sim, world);
    assert(!priority.label.node.activeInHierarchy); assert(!hud.labels.get('priorityMarker').node.active);
    sim.pause('settings', false); hud.toolsOpen = false;
    sim.pause('advert', true); hud.advert = { kind: 'supply', mock: false }; hud.update(sim, world);
    hud.advert = undefined; sim.pause('advert', false); hud.update(sim, world);
    assert.equal(hud.modalKey, '', 'returning from an ad has no overlay hiding the battlefield');
    assert(hud.labels.get('priorityMarker').node.active, 'red priority marker returns on the first battle frame');
    assert(hud.marks.calls.some((call: any) => call.op === 'stroke' && call.color === '#ff525b'),
      'enemy markers are drawn again without advancing the simulation');
  }
});

test('HUD: desktop bottom battlefield accepts aim while controls and touch footer remain blocked', () => {
  for (const [width, height] of [[1366, 768], [1151, 798], [844, 390]]) {
    Object.assign(frame, { width, height });
    for (const safe of [0, 12]) {
      inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      sim.start(); hud.update(sim, world);
      for (const y of [height - hud.footer + 2, height - safe - 2])
        assert.equal(hud.blocksBattlefield(width / 2, y), false, 'empty footer is battlefield on mouse and touch');
      for (const id of ['weapon0', 'weapon1', 'weapon2']) {
        const b = hud.buttons.find((b: any) => b.id === id);
        assert(hud.blocksBattlefield(b.x + b.w / 2, b.y + b.h / 2), `${id} still blocks aim and battlefield fire`);
      }
    }
  }
  inset = 0;
});

test('HUD: escort and range entries are discoverable, and range results show a specific next goal in compact viewports', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) {
    Object.assign(frame, { width, height }); inset = 12;
    for (const lang of ['zh', 'en']) {
      const hud = new HUD(new SceneNode()); hud.lang = lang; hud.resize();
      const escort = new Simulation(); hud.update(escort, world);
      assert(hud.buttons.some((button: any) => button.id === 'missions'), 'home has a clear mission selector');
      assert(!hud.buttons.some((button: any) => button.id === 'training'), 'home keeps only primary choices');
      hud.missionsOpen = true; hud.update(escort, world);
      const trainingEntry = hud.buttons.find((button: any) => button.id === 'training');
      assert(trainingEntry); assert.equal(hud.hit(trainingEntry.x + trainingEntry.w / 2, trainingEntry.y + trainingEntry.h / 2)?.id, 'training');
      const sim = new Simulation('training-60'); hud.modalKey = 'rebuild'; hud.update(sim, world);
      hud.trainingBest = { time: 20, fired: 5, hitShots: 5, ammoSpent: 5 };
      for (const phase of ['briefing', 'success', 'failure'] as const) {
        sim.phase = phase; sim.failure = phase === 'failure' ? 'vehicle' : '';
        hud.update(sim, world);
        const buttons = hud.buttons.filter((button: any) => button.label.node.parent === hud.modal);
        assert.deepEqual(buttons.map((button: any) => button.id), phase === 'briefing' ? ['homeMenu', 'training', 'start'] : ['home', 'retry']);
        for (const button of buttons) {
          assert(button.w >= 44 && button.h >= 44);
          assert(button.y >= inset + 58 && button.y + button.h <= height - inset);
          assert(!buttons.some((other: any) => other !== button && overlaps(button, other)));
        }
        const labels = hud.modal.getComponentsInChildren(cc.Label).map((label:any)=>label.string).filter(Boolean).join('\n');
        assert.doesNotMatch(labels, /车队安全抵达|CONVOY EXTRACTED/);
        if (phase === 'briefing') assert.match(labels, lang === 'zh' ? /高地警戒/ : /HIGHLAND WATCH/);
        else {
          assert.match(labels, lang === 'zh' ? /再练一轮|重甲用重炮/ : /TRY AGAIN|Heavy for armor/);
          assert.match(labels, lang === 'zh' ? /最佳20.0s/ : /BEST 20.0s/);
        }
      }
      sim.phase = 'playing'; hud.update(sim, world);
      assert.match(hud.labels.get('progress').string, lang === 'zh' ? /热身清靶/ : /WARMUP/);
      assert(!hud.buttons.some((button: any) => button.id === 'convoy' && button.label.node.activeInHierarchy));
    }
  }
  inset = 0;
});

test('HUD: global actions hide behind panels, with safe modal layout, focus markers and zoom bindings', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768], [320, 568]]) {
    Object.assign(frame, { width, height });
    for (const lang of ['zh', 'en']) for (const safe of [0, 12]) {
      inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.lang = lang;
      hud.rewardsAvailable = true;
      hud.resize();
      const globals = hud.buttons.filter((b: any) => hud.isGlobalAction(b.id));
      assert.equal(globals.length, 1);
      for (const reason of ['briefing', 'manual', 'settings', 'help', 'settings', 'mission', 'orientation', 'success', 'failure', 'playing']) {
        sim.pauses.clear();
        sim.phase = ['briefing', 'success', 'failure'].includes(reason) ? reason as Simulation['phase'] : 'playing';
        if (!['briefing', 'success', 'failure', 'playing'].includes(reason)) sim.pauses.add(reason as any);
        hud.update(sim, world);
        assert.equal(hud.root.children.at(-1), hud.globalControls, 'global graphics render above the modal');
        for (const b of globals) {
          if (!['briefing', 'playing'].includes(reason)) {
            assert(!b.label.node.activeInHierarchy, reason + ': global action stays hidden');
            continue;
          }
          assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id, `${width}x${height} ${reason}: ${b.id}`);
          assert(b.w >= 44 && b.h >= (hud.mouseDesktop ? 32 : 44) && b.x >= safe && b.x + b.w <= width - safe);
          assert(b.y >= safe && b.y + b.h <= height - safe);
          assert(!hud.buttons.some((other: any) => other !== b && other.label.node.activeInHierarchy && overlaps(b, other)), 'globals never overlap active controls');
        }
        const controls = hud.buttons.filter((b: any) => hud.modal && b.label.node.parent === hud.modal);
        for (const b of controls) {
          assert(b.y >= safe && b.y + b.h <= height - safe, `${reason}: panel control stays within the safe area`);
          assert(!controls.some((other: any) => other !== b && overlaps(b, other)), `${reason}: panel controls do not overlap`);
        }
        if (reason === 'help') {
          const back = controls.find((b: any) => b.id === 'close');
          assert(back && back.label.string === (lang === 'zh' ? '返回' : 'BACK'));
          assert.equal(back.y, Math.max(...controls.map((b: any) => b.y)), 'return stays in the footer');
        }
        if (reason === 'manual' || reason === 'settings') assert.equal(hud.buttons.filter((b:any)=>hud.inModal(b.label.node)).map((b: any) => b.id).join(','), 'flightControls,zoomControls,buttonControls,sound,voicePrompts,autoPriority,language,help,updates,convoy,mission,supply,home,' + (reason === 'settings' ? 'close' : 'resume'));
      }
      sim.pause('settings', true); hud.toolsOpen = true; hud.update(sim, world);
      assert.equal(hud.modalKey, 'settings:flight');
      for (const id of ['rotateLeft', 'rotateRight', 'orbitLeft', 'orbitRight', 'altitudeUp', 'radiusOut', 'locate'])
        assert(hud.buttons.some((b: any) => b.id === id && b.label.node.activeInHierarchy));
      hud.toolsOpen = false; sim.pause('settings', false); hud.update(sim, world);
      assert(!hud.buttons.some((b: any) => b.id === 'orbitLeft' && b.label.node.activeInHierarchy));
      sim.pause('manual', true);
      sim.pause('settings', true);
      sim.pause('help', true);
      hud.update(sim, world);
      assert(hud.modalKey.startsWith('help:'));
      sim.pause('help', false);
      hud.update(sim, world);
      assert.equal(hud.modalKey, 'settings');
      sim.pause('settings', false);
      hud.update(sim, world);
      assert.equal(hud.modalKey, 'pause');
      hud.resize();
      hud.update(sim, world);
      assert.equal(hud.buttons.filter((b: any) => hud.isGlobalAction(b.id)).length, 1, 'resize never duplicates global actions');
    }
  }

  Object.assign(frame, { width: 568, height: 320 });
  inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  sim.start();
  sim.units = [sim.rescue, sim.units[1]];
  Object.assign(sim.rescue, { x: -90, z: 0 });
  const focus = sim.units[1];
  Object.assign(focus, { x: 0, z: 0, hp: focus.maxHp * 0.6 });
  const hostile = sim.addUnit('light', { x: 90, z: 0 }, false);
  sim.setAim(focus);
  const active = () => [...hud.unitLabels.values()].filter((l: any) => l.node.activeInHierarchy) as any[];
  for (const thermal of [false, true]) {
    world.thermal = thermal;
    for (const touch of [false, true]) {
      hud.touch = touch;
      hud.mousePointer = touch ? undefined : { x: 284, y: 160 };
      hud.update(sim, world);
      assert.equal(active().length, 1, 'only the hovered or touch-aimed unit has a label');
      assert.match(active()[0].string, /护卫 · 受损/);
      assert.doesNotMatch(active()[0].string, /%/);
      const calls = hud.marks.calls;
      assert(!calls.some((c: any) => c.op === 'rect' && c.args[3] === 2), 'no unit health bars');
      assert(calls.some((c: any) => c.op === 'rect' && c.color === '#82c9ed' && c.width === 2), 'friendly squares keep their color in thermal');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 95 && c.color === '#ff525b' && c.width === 2), '10px hostile diamonds keep their color in thermal');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 32 && c.args[1] === 0 && c.width === 6 && c.color === '#061116'), 'reticle has a wide dark outline');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 32 && c.args[1] === 0 && c.width === 3), 'reticle spans 64 pixels');
    }
  }
  assert(heights.includes(0.8) && !heights.includes(2.3), 'marker projection follows scaled vehicle height');
  focus.hp = focus.maxHp * 0.2;
  hud.update(sim, world);
  assert.match(active()[0].string, /重创/);
  Object.assign(hostile, { x: 0, z: 0, hp: hostile.maxHp * 0.2 });
  focus.x = -90;
  sim.setAim(hostile);
  hud.update(sim, world);
  const focused = active().filter((l) => !l.string.startsWith('×'));
  assert.equal(focused.length, 1);
  assert.match(focused[0].string, /轻车 · 重创/);
  assert.deepEqual(active().filter((l) => l.string.startsWith('×')).map((l) => l.string), ['×2']);
  hud.touch = false;
  hud.mousePointer = undefined;
  hud.update(sim, world);
  assert.deepEqual(active().map((l) => l.string), ['×2'], 'focus text disappears; only the coincident friendly group count remains');
  for (const [key, id] of [[187, 'zoomIn'], [107, 'zoomIn'], [189, 'zoomOut'], [109, 'zoomOut'], [49, 'weapon0'], [50, 'weapon1'], [51, 'weapon2']] as const)
    assert.equal(actions.ACTIONS.find((a) => (a.keys as readonly number[]).includes(key))?.id, id);
  assert(!actions.action('previous').binding.includes('Wheel') && !actions.action('next').binding.includes('Wheel'));
  assert.match(actions.bindingLabel('zoomIn', 'zh'), /滚轮/);
  for (const description of actions.action('weapon1').description) assert(description.includes(String(data.WEAPONS[1].ammo)));
  assert(actions.action('zoomOut').description.every((d) => d.includes('0.65×')));
  assert(actions.action('zoomIn').description.every((d) => d.includes('10×')));
});

test('HUD: short-screen information priority, focus clearance and friendly group expansion', () => {
  Object.assign(frame, { width: 568, height: 320 });
  inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  sim.start();
  const rescue = sim.rescue, enemy = sim.addUnit('turret', { x: 0, z: 0 }, false);
  sim.units = [rescue, enemy];
  Object.assign(rescue, { x: -90, z: 0 });
  sim.waveAt = sim.time;
  sim.lastWave = 0;
  sim.setAim(enemy);
  hud.touch = true;
  // Distant models have almost no vertical screen separation between body and marker.
  const distant = { ...world, project: (p: data.Point) => world.project(p) };
  const slot = () => ['friendWarning', 'notice', 'tutorial'].filter((id) => {
    const l = hud.labels.get(id);
    return l.node.activeInHierarchy && l.string;
  });
  for (const thermal of [false, true]) {
    distant.thermal = thermal;
    hud.update(sim, distant);
    assert.deepEqual(slot(), ['notice'], 'wave replaces tutorial, with no central banner');
    const l = hud.unitLabels.get(enemy.id);
    assert(l?.node.activeInHierarchy, 'focused name survives an active wave notice');
    const size = l.node.getComponent(Transform).contentSize, p = l.node.position;
    assert.equal(size.width, 120);
    assert(l.fontSize >= 12 && l.fontSize <= 13);
    assert(Math.hypot(Math.max(0, Math.abs(p.x) - size.width / 2), Math.max(0, Math.abs(p.y) - size.height / 2)) >= 40, 'entire focused label clears the reticle by 40px');
    for (const id of ['notice', 'friendWarning']) {
      const label = hud.labels.get(id), tutorial = hud.labels.get('tutorial');
      assert.equal(label.node.position.y, tutorial.node.position.y);
      assert.equal(label.node.getComponent(Transform).contentSize.height, 28);
    }
    Object.assign(rescue, { x: 0 });
    enemy.x = 90;
    sim.setAim(rescue);
    hud.update(sim, distant);
    assert.deepEqual(slot(), ['friendWarning'], 'friendly warning takes priority over wave and tutorial');
    Object.assign(rescue, { x: -90 });
    enemy.x = 0;
    sim.setAim(enemy);
  }
  sim.time = 5;
  hud.update(sim, distant);
  assert.deepEqual(slot(), ['tutorial'], 'tutorial returns when warning and wave clear');

  const group = [0, 4, 8].map((x) => Object.assign(sim.addUnit('escort', { x, z: 0 }, true), { group: 1 }));
  const heavy = sim.addUnit('heavy', { x: 90, z: 0 }, false);
  Object.assign(enemy, { x: 4, group: 1 });
  sim.units = [rescue, ...group, enemy, heavy];
  sim.setAim({ x: 140, z: 0 });
  hud.touch = false;
  hud.mousePointer = undefined;
  const visibleLabels = () => [...hud.unitLabels.values()].filter((l: any) => l.node.activeInHierarchy) as any[];
  const counts = () => visibleLabels().filter((l) => l.string.startsWith('×'));
  const squares = () => hud.marks.calls.filter((c: any) => c.op === 'rect' && c.args[2] === c.args[3] && c.color === '#82c9ed' && c.width === 2);
  for (const thermal of [false, true]) {
    distant.thermal = thermal;
    hud.update(sim, distant);
    assert.deepEqual(counts().map((l) => l.string), ['×3'], 'only same-group friendlies aggregate, never the nearby hostile');
    assert.equal(squares().length, 2, 'one rescue square and one grouped square');
    assert(squares().every((c: any) => c.args[2] === 10));
    assert(hud.marks.calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 97 && c.color === '#ff525b' && c.width === 2), 'unfocused heavy marker is 14px');
    const lead = hud.unitLabels.get(group[0].id);
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 28);
    hud.mousePointer = { x: 284, y: 160 };
    sim.setAim(group[0]);
    hud.update(sim, distant);
    assert.equal(counts().length, 0, 'focusing any member expands the whole group');
    assert.equal(squares().length, 4);
    assert.equal(squares().at(-1).args[2], 18, 'focus marker is 18px and drawn after other markers');
    assert.equal(hud.unitLabels.get(group[0].id), lead, 'group lead reuses its focus label');
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 120, 'focus restores count label width');
    assert.equal(lead.node.getComponent(Transform).contentSize.height, 24, 'focus restores count label height');
    assert(lead.fontSize >= 12 && lead.fontSize <= 13);
    assert.match(lead.string, /护卫/);
    hud.mousePointer = { x: 288, y: 160 };
    sim.setAim(group[1]);
    hud.update(sim, distant);
    assert.equal(counts().length, 0, 'a non-lead member also expands the group');
    assert.equal(squares().length, 4);
    assert(!lead.node.activeInHierarchy, 'former lead focus text hides on the next frame');
    assert(hud.unitLabels.get(group[1].id).node.activeInHierarchy);
    hud.mousePointer = undefined;
    sim.setAim({ x: 140, z: 0 });
    hud.update(sim, distant);
    assert.equal(lead.string, '×3');
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 28, 'count dimensions also restore after focus');
    assert(!hud.unitLabels.get(group[1].id).node.activeInHierarchy, 'member focus label hides when the group collapses again');
    group[2].hp = 0;
    hud.update(sim, distant);
    assert.equal(lead.string, '×2', 'dead allies do not count');
    group[2].hp = group[2].maxHp;
    for (const x of [12, 24]) {
      group[2].x = x;
      hud.update(sim, distant);
      assert.equal(counts().length, 0, 'all members must be mutually within 12px');
      assert.equal(squares().length, 4);
      assert(!lead.node.activeInHierarchy, 'old count is hidden on the next frame');
    }
    group[2].x = 8;
  }
});


test('HUD: desktop controls stay compact, touch keeps FIRE, cooldown stays on the weapon and trigger', () => {
  for (const touch of [false, true]) for (const width of [1366, 1920, 2560]) {
    Object.assign(frame, { width, height: 1080 }); inset = 0;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.touch = touch; hud.resize(); sim.start(); sim.selected = 2; sim.guns[2].cooldown = 2;
    hud.update(sim, world);
    const fire = hud.buttons.find((b: any) => b.id === 'fire');
    assert.equal(fire.label.node.activeInHierarchy, touch);
    assert.equal(hud.hit(fire.x + fire.w / 2, fire.y + fire.h / 2)?.id === 'fire', touch);
    for (const id of ['settings', 'weapon0', 'weapon1', 'weapon2']) {
      const b = hud.buttons.find((b: any) => b.id === id);
      assert(touch ? b.h >= 44 : b.h <= 44);
      if (!touch) assert(b.w <= 104);
    }
    const visibleText = [...hud.labels.values(), ...hud.buttons.map((b: any) => b.label)]
      .filter((l: any) => l.node.activeInHierarchy).map((l: any) => l.string).join('\n');
    assert(!visibleText.includes('装填'));assert(hud.buttons.find((b:any)=>b.id==='weapon2').detail.string.includes('2.0s'));if(touch)assert(fire.detail.string.includes('2.0s'));
    if (!touch) assert.equal(hud.footer, 60);
  }
});

test('HUD: rewards, zoom panel and mock ads fit small phones with safe areas and no overlapping buttons', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) for (const safe of [0, 12]) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation('training-60'); sim.start();
    hud.rewardsAvailable = true;
    for (const zoomOpen of [false, true]) {
      sim.pause('settings', zoomOpen); hud.zoomOpen = zoomOpen; hud.update(sim, world);
      const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
      for (const b of buttons) {
        assert(b.x >= safe && b.x + b.w <= width - safe);
        assert(b.y >= safe && b.y + b.h <= height - safe);
        assert(!buttons.some((other: any) => other !== b && overlaps(b, other)), `${b.id}: no overlap`);
      }
      assert.equal(buttons.some((b: any) => b.id === 'zoomUpgrade'), zoomOpen);
    }
    for (const kind of ['supply', 'zoom'] as const) {
      hud.advert = { kind, mock: true }; sim.pause('advert', true); hud.update(sim, world);
      const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
      assert.deepEqual(buttons.map((b: any) => b.id), ['adClose', 'adCancel']);
      assert.match(buttons[0].label.string, /完成模拟广告/);
      assert.match(buttons[1].label.string, /取消.*选择/);
      for (const b of buttons) {
        assert(b.h >= 44 && b.x >= safe && b.x + b.w <= width - safe);
        assert(b.y >= safe && b.y + b.h <= height - safe);
        assert(!buttons.some((other: any) => other !== b && overlaps(b, other)));
        assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id);
      }
    }
  }
  inset = 0;
});

test('HUD: combat supply, choices and buff countdown fit phones and the rotated logical viewport', () => {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { matchMedia: () => ({ matches: true }) };
  cc.sys.isBrowser = true;
  try {
    for (const [physicalWidth, physicalHeight] of [[568, 320], [844, 390], [390, 844], [1366, 768]])
      for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
        // The display adapter supplies landscape coordinates after rotating portrait phones.
        const width = Math.max(physicalWidth, physicalHeight), height = Math.min(physicalWidth, physicalHeight);
        Object.assign(frame, { width, height }); inset = safe;
        const hud = new HUD(new SceneNode()), sim = new Simulation();
        hud.lang = lang; hud.rewardsAvailable = true; hud.touch = width < 900; hud.resize(); sim.start();
        const visible = () => hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
        const control = (id: string) => visible().find((b: any) => b.id === id);
        const panelText = () => hud.modal.children.map((n: any) => n.getComponent(cc.Label)?.string).filter(Boolean).join('\n');
        const labelBox = (l: any) => {
          const size = l.node.getComponent(Transform).contentSize, p = l.node.position;
          return { x: p.x + width / 2 - size.width / 2, y: height / 2 - p.y - size.height / 2, w: size.width, h: size.height };
        };
        const checkLayout = () => {
          const buttons = visible();
          for (const b of buttons) {
            assert(b.x >= safe && b.x + b.w <= width - safe, `${physicalWidth}x${physicalHeight}: ${b.id} horizontal safe area`);
            assert(b.y >= safe && b.y + b.h <= height - safe, `${b.id}: vertical safe area`);
            assert(!buttons.some((other: any) => other !== b && overlaps(b, other)), `${b.id}: no overlapping controls`);
            assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.disabled ? undefined : b.id, `${b.id}: disabled targets reject touches`);
            if (b.id === 'supply' || b.id === 'supplyLater' || b.id === 'supplyWatch' || b.id.startsWith('reward:'))
              assert(b.w >= 44 && b.h >= 44);
          }
          const buff = hud.labels.get('buff');
          if (buff.node.activeInHierarchy) {
            const box = labelBox(buff);
            assert(box.w >= 60 && box.x >= safe && box.x + box.w <= width - safe);
            assert(box.y >= safe && box.y + box.h <= height - safe);
            assert(!buttons.some((b: any) => overlaps(box, b)), 'buff stays clear of controls');
            for (const id of ['health', 'status']) {
              const label = hud.labels.get(id);
              if (label.node.activeInHierarchy) assert(!overlaps(box, labelBox(label)), `buff clears ${id}`);
            }
          }
        };
        assert.equal(hud.supplyOpen, false); assert.equal(hud.pendingSupply, false);
        hud.update(sim, world); checkLayout();
        assert(!control('supply'), 'supply stays inside settings');
        sim.pause('manual', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'pause'); assert(control('supply'));
        hud.supplyOpen = true; sim.pause('supply', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:offer');
        assert.deepEqual(visible().map((b: any) => b.id), ['reward:tracking', 'reward:ammo', 'reward:rate', 'reward:restock', 'supplyLater', 'supplyWatch']);
        hud.pendingSupply = true; hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:choice');
        assert.deepEqual(visible().map((b: any) => b.id), ['reward:tracking', 'reward:ammo', 'reward:rate', 'reward:restock', 'supplyLater', 'supplyWatch']);
        assert.match(panelText(), lang === 'zh' ? /点选敌人，再按开火/ : /Tap an enemy, then FIRE/);
        assert.match(panelText(), /60/); assert.match(panelText(), /\+2/); assert.match(panelText(), /30%/);
        assert.doesNotMatch(panelText(), /恢复耐久|治疗|HEAL/i);
        const choiceLabels = hud.modal.children.map((n: any) => n.getComponent(cc.Label)).filter(Boolean);
        for (const l of choiceLabels) {
          const box = labelBox(l);
          assert(!choiceLabels.some((other: any) => other !== l && overlaps(box, labelBox(other))), 'choice card text does not overlap');
        }
        hud.supplyOpen = false; sim.pause('supply', false); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'pause');
        assert.match(control('supply').label.string, lang === 'zh' ? /待领取/ : /CLAIM/);
        hud.pendingSupply = false; sim.pauses.clear();
        sim.buff = { kind: 'tracking', remaining: 60 }; sim.resumeCountdown = 3; sim.pause('countdown', true);
        for (const remaining of [3, 2.2, 2, 1]) {
          sim.resumeCountdown = remaining; hud.update(sim, world); checkLayout();
          assert.equal(hud.modalKey, `countdown:${Math.ceil(remaining)}`);
          assert.equal(visible().length, 0, 'countdown hides controls that cannot act');
          assert(!hud.labels.get('buff').node.activeInHierarchy, 'countdown has no extra overlay');
          assert.match(panelText(), new RegExp(String(Math.ceil(remaining))));
        }
        sim.pause('countdown', false); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, '');
        assert(!control('supply'));
        sim.pause('settings', true); hud.update(sim, world); checkLayout();
        assert(control('supply').disabled); assert.equal(hud.hit(control('supply').x+10,control('supply').y+10),undefined);
        sim.pause('settings', false); hud.update(sim, world);
        assert(!hud.labels.get('buff').node.activeInHierarchy, 'tracking countdown moved into its button');
        assert.equal(control('homing').label.color.hex, control('weapon' + sim.selected).label.color.hex);
        assert(control('homing').label.isBold);
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪' : 'LOCK');
        hud.rewardsAvailable = false; hud.update(sim, world);
        assert(control('homing'), 'active tracking remains visible without ad availability or homing ammo');
        hud.rewardsAvailable = true;
        sim.buff.remaining = 4.2; hud.update(sim, world); checkLayout();
        assert.equal(control('homing').detail.color.hex, '#e5b65c');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪' : 'LOCK');
        sim.pause('settings', true); hud.zoomOpen = true; hud.update(sim, world); checkLayout();
        assert.equal(control('zoomUpgrade').label.color.hex, '#9bb4c8');
        assert.match(control('zoomUpgrade').label.string, lang === 'zh' ? /支援生效中/ : /SUPPORT ACTIVE/);
        hud.zoomOpen = false; sim.pause('settings', false); hud.supplyOpen = true; sim.pause('supply', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:offer', 'buff still allows opening the offer');
        assert.equal(control('supplyWatch').label.color.hex, '#9bb4c8');
        assert.match(panelText(), lang === 'zh' ? /支援已生效，结束后可再次领取/ : /SUPPORT ACTIVE.*WAIT UNTIL IT ENDS/);
        assert(control('supplyLater'), 'blocked offer can return to pause');
        hud.supplyOpen = false; sim.pause('supply', false);
        sim.buff = { kind: 'rate', remaining: 60 }; hud.update(sim, world); checkLayout();
        assert.match(hud.labels.get('buff').string, lang === 'zh' ? /射速提升/ : /RATE ×1\.3/);
        assert(!control('homing').label.isBold, 'expiry clears the tracking highlight');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪 +' : 'LOCK +');
        sim.homingAmmo = 2; sim.selectHoming(); hud.update(sim, world);
        assert(control('homing').label.isBold, 'homing weapon selection still highlights independently');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪 2' : 'LOCK 2');
        sim.buff = undefined; hud.update(sim, world); checkLayout();
        assert(!hud.labels.get('buff').node.activeInHierarchy);
        sim.pause('settings', true); hud.update(sim, world); checkLayout();
        assert.equal(control('supply').label.color.hex, '#e5edf3');
      }
  } finally {
    cc.sys.isBrowser = false; inset = 0;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});


test('HUD: browser and native hosts have no fullscreen control or state in any screen', () => {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { matchMedia: () => ({ matches: false }) };
  try {
    for (const browser of [false, true]) {
      cc.sys.isBrowser = browser;
      Object.assign(frame, { width: 844, height: 390 }); inset = 12;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      for (const reason of ['home', 'missions', 'playing', 'manual', 'settings', 'help', 'offer', 'choice', 'success', 'failure']) {
        sim.pauses.clear(); hud.supplyOpen = false;
        sim.phase = reason === 'success' || reason === 'failure' ? reason : ['home', 'missions'].includes(reason) ? 'briefing' : 'playing';
        hud.missionsOpen = reason === 'missions';
        if (['manual', 'settings', 'help'].includes(reason)) sim.pauses.add(reason as any);
        if (reason === 'offer' || reason === 'choice') { hud.supplyOpen = true; hud.pendingSupply = reason === 'choice'; }
        hud.update(sim, world);
        assert.equal(hud.buttons.some((button: any) => /fullscreen/i.test(button.id)), false, reason);
        assert.equal('fullscreen' in hud, false, 'removed state must not return');
        assert.equal(hud.isGlobalAction('fullscreen'), false);
        assert.equal(hud.buttons.filter((button: any) => button.id === 'settings' && button.label.node.activeInHierarchy).length, ['home', 'playing'].includes(reason) ? 1 : 0);
      }
    }
  } finally {
    cc.sys.isBrowser = false; inset = 0;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('HUD: all 120 operations are reachable by horizontal scrolling within phone safe areas',()=>{
 for(const [width,height]of [[568,320],[844,390]])for(const safe of [0,12]){
  Object.assign(frame,{width,height});inset=safe;const hud=new HUD(new SceneNode()),sim=new Simulation();hud.missionsOpen=true;const seen=new Set();
  for(let step=0;step<150;step++){hud.modalKey='rebuild';hud.update(sim,world);const area=hud.listAreas.find((a:any)=>a.key==='missions');assert(area&&area.max>0);const cards=hud.buttons.filter((b:any)=>b.id.startsWith('mission:')&&b.x+b.w>area.x&&b.x<area.x+area.w);assert(cards.length>0);for(const card of cards){seen.add(card.id);assert(card.clip&&card.w>=44&&card.h>=44);assert(card.clip.x>=safe&&card.clip.x+card.clip.w<=width-safe);}
   if((hud.listScroll.missions||0)>=area.max)break;hud.moveList('missions',area.w*.7);
  }
  assert.equal(seen.size,120);assert(!hud.buttons.some((b:any)=>/^missions(Previous|Next)$/.test(b.id)));
 }
 inset=0;
});

const panelLabels = (hud: any) => hud.modal.getComponentsInChildren(cc.Label);
const descendants=(node:any):any[]=>node.children.flatMap((child:any)=>[child,...descendants(child)]);
const labelBounds = (hud: any, label: any) => {
  const size = label.node.getComponent(Transform).contentSize, p = label.node.position;
  return { x: p.x + hud.w / 2 - size.width / 2, y: hud.h / 2 - p.y - size.height / 2, w: size.width, h: size.height };
};
const assertPanelTargets = (hud: any) => {
  const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy&&!b.clip);
  for (const button of buttons) {
    assert(button.w >= 44 && button.h >= 44, `${button.id}: at least 44px`);
    assert(button.x >= inset && button.x + button.w <= hud.w - inset);
    assert(button.y >= inset && button.y + button.h <= hud.h - inset);
    assert(!buttons.some((other: any) => other !== button && overlaps(button, other)), `${button.id}: no overlap`);
    assert.equal(hud.hit(button.x + button.w / 2, button.y + button.h / 2)?.id, button.disabled ? undefined : button.id);
  }
  const labels = hud.modal.children.map((node:any)=>node.getComponent(cc.Label)).filter((label:any)=>label?.string);
  for (const label of labels) {
    const box = labelBounds(hud, label);
    assert(!labels.some((other: any) => other !== label && overlaps(box, labelBounds(hud, other))), `${label.string}: text stays separate`);
  }
};

test('HUD: independent title cover precedes mission previews and compact settings', () => {
  for (const [width, height] of [[568, 320], [844, 320], [844, 390], [1366, 768]])
    for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
      Object.assign(frame, { width, height }); inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.lang = lang; hud.rewardsAvailable = true; hud.resize(); hud.update(sim, world);
      assertPanelTargets(hud);
      for (const id of ['help', 'missions']) assert(hud.buttons.some((b: any) => b.id === id && b.label.node.parent === hud.modal));
      assert(!hud.buttons.some((b: any) => b.id === 'start'));
      assert(hud.homeBackground.active, 'cover stays opaque even when artwork fails');
      assert(!panelLabels(hud).some((l: any) => l.string.includes(data.text(sim.mission.name, lang))));
      hud.missionsOpen = true; hud.update(sim, world);
      assert(hud.homeBackground.active, 'mission cards retain the illustrated cover'); assert(hud.buttons.some((b: any) => b.id === 'start'));
      hud.missionsOpen = false;
      sim.start(); sim.time = 38; sim.pause('manual', true); hud.update(sim, world);
      assertPanelTargets(hud);
      const captions = panelLabels(hud).map((l: any) => l.string);
      assert(captions.includes(lang === 'zh' ? '战斗设置' : 'BATTLE SETTINGS'));
      const graphics = hud.modal.getComponentsInChildren(Graphics).flatMap((g: any) => g.calls);
      const panel = graphics.find((c: any) => c.op === 'rect' && c.fill === '#b7b09488');
      assert(panel && panel.args[2] <= 622 && panel.args[3] === 1, 'header separator stays inside the centered panel');
      assert.equal(panel.args[0] + panel.args[2] / 2, 0, 'settings are horizontally centered');
      assert(panel.args[2] >= Math.min(640, width - safe * 2 - 32) - 28, 'settings use the available width');
      const resume = hud.buttons.find((b: any) => b.id === 'resume');
      assert(graphics.some((c: any) => c.op === 'roundRect' && c.fill === '#4a3d24' && c.args[0] === resume.visual.x - width / 2), 'resume is the amber primary action');
      for (const pending of [false, true]) {
        hud.supplyOpen = true; hud.pendingSupply = pending; hud.update(sim, world);
        assertPanelTargets(hud);
        const copy = panelLabels(hud).map((l: any) => l.string).join('\n');
        assert.match(copy, /60/); assert.match(copy, /\+2/); assert.match(copy, /30%/);
        if (height >= 390) assert(hud.modal.getComponentsInChildren(Graphics).flatMap((g: any) => g.calls).some((c: any) => c.op === 'circle' && c.args[2] === 9), 'tracking offer has a drawn icon');
        assert.match(copy, pending ? lang === 'zh' ? /启用并返回战斗/ : /ACTIVATE & RESUME/ : lang === 'zh' ? /看广告并启用/ : /WATCH AD & ACTIVATE/);
      }
      hud.supplyOpen = false; hud.pendingSupply = false; hud.rewardsAvailable = false; hud.modalKey = 'rebuild'; hud.update(sim, world);
      assertPanelTargets(hud);
      assert.deepEqual(hud.buttons.filter((b: any) => b.label.node.parent === hud.modal).map((b: any) => b.id), ['flightControls', 'zoomControls', 'buttonControls', 'sound', 'voicePrompts', 'autoPriority', 'language', 'help', 'updates', 'convoy', 'mission', 'home', 'resume'], 'offline settings omit only ads');
    }
  inset = 0;
});

test('HUD: mission cards expose their actual enemy count, lighting, selection, lock and cleared state', () => {
  for (const lang of ['zh', 'en']) {
    Object.assign(frame, { width: 568, height: 320 }); inset = 12;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.lang = lang; hud.missionsOpen = true; hud.resize();
    const text = () => panelLabels(hud).map((l: any) => l.string).join('\n');
    hud.update(sim, world); assertPanelTargets(hud);
    assert.match(text(), /001/); assert.match(text(), /002/); assert.match(text(), /003/);
    assert.match(text(), lang === 'zh' ? /当前/ : /SELECTED/);
    assert.match(text(), lang === 'zh' ? /夜航.*入门/ : /NIGHT OPS.*INTRO/);
    for (const mission of MISSIONS.slice(0, 3)) assert.match(text(), new RegExp(lang === 'zh' ? `敌方 ${mission.events.length}` : `${mission.events.length} HOSTILES`));
    hud.moveList('missions',hud.listAreas.find((a:any)=>a.key==='missions')!.w);hud.modalKey = 'rebuild'; hud.update(sim, world); assertPanelTargets(hud);
    assert.match(text(), lang === 'zh' ? /夜航/ : /NIGHT OPS/);
    assert.match(text(), lang === 'zh' ? /锁定/ : /LOCKED/);
    hud.missionProgress = { version: 1, cleared: ['patrol-03', MISSIONS[3].id] };
    hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert.match(text(), lang === 'zh' ? /已完成/ : /CLEARED/);
    assert.match(text(), lang === 'zh' ? /可出动/ : /AVAILABLE/);
    hud.developer = true; hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert.match(text(), lang === 'zh' ? /试玩.*不计进度/ : /PRACTICE/);
  }
  inset = 0;
});

test('HUD: compact guide keeps its tabs and footer reachable while content scrolls', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  for (const lang of ['zh', 'en']) {
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.lang = lang; hud.resize(); sim.pause('help', true); hud.update(sim, world);
    assertPanelTargets(hud);
    assert(hud.scrollMax > 0 && hud.scrollArea.h >= 56);
    const close = hud.buttons.find((b: any) => b.id === 'close');
    hud.scrollBy(Infinity);
    assert.equal(hud.scroll, hud.scrollMax); assert.equal(hud.scrollNode.position.y, hud.scrollMax);
    assert.equal(hud.hit(close.x + close.w / 2, close.y + close.h / 2)?.id, 'close');
    hud.scrollBy(-Infinity); assert.equal(hud.scroll, 0);
    sim.pause('help', false); sim.pause('settings', true); hud.update(sim, world);
    const controls = hud.buttons.filter((b: any) => b.label.node.parent === hud.modal);
    for (const b of controls) assert(b.h >= 44 && b.y + b.h <= frame.height - inset);
  }
  inset = 0;
});

test('HUD: flight values, direction selection and display controls stay separate in a centered panel', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); sim.pause('settings', true);
    hud.lang = lang; hud.toolsOpen = true; hud.rewardsAvailable = true; hud.update(sim, world);
    assertPanelTargets(hud);
    const left = hud.buttons.find((b: any) => b.id === 'altitudeDown').x;
    assert(left > safe + 80, 'keep the actual battlefield visible beside the centered panel');
    assert(panelLabels(hud).some((l: any) => l.string === '1000'));
    assert.equal(hud.buttons.find((b: any) => b.id === 'orbitRight').label.color.hex, '#82c9ed');
    sim.adjustAltitude(20); sim.setOrbitDirection(-1); hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert(panelLabels(hud).some((l: any) => l.string === '1200'));
    assert.equal(hud.buttons.find((b: any) => b.id === 'orbitLeft').label.color.hex, '#82c9ed');
    hud.toolsOpen = false; hud.zoomOpen = true; hud.update(sim, world); assertPanelTargets(hud);
    for (const id of ['view:night', 'view:enhanced', 'view:thermal', 'effects', 'lensIn', 'lensOut', 'zoomUpgrade'])
      assert(hud.buttons.some((b: any) => b.id === id && b.label.node.parent === hud.modal));
  }
  inset = 0;
});


test('mission previews draw distinct terrain and lighting, with actual contacts and endpoints', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 0;
  const hud = new HUD(new SceneNode()), pictures = [];
  for (const [map, light] of [['valley', 'day'], ['highland', 'day'], ['valley', 'dusk'], ['valley', 'night']]) {
    const g = new Graphics(); hud.routeGraphic(g, 0, 0, 240, 120, 0, map, light, MISSIONS[0].events);
    assert(g.calls.filter(c => c.op === 'fill').length > 1000, 'height-field terrain replaces the empty rectangle');
    assert(g.calls.some(c => c.op === 'stroke' && c.color === '#82c9ed'));
    assert.equal(g.calls.filter(c => c.op === 'stroke' && c.color === '#ff525b').length, MISSIONS[0].events.length);
    assert(g.calls.every(c => c.args.every(Number.isFinite)));
    pictures.push(JSON.stringify(g.calls));
  }
  assert.equal(new Set(pictures).size, 4);
});


test('an earned support remains activatable with no ad provider', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start();
  hud.rewardsAvailable = false; hud.pendingSupply = true; hud.supplyOpen = true;
  hud.update(sim, world); assertPanelTargets(hud);
  const claim = hud.buttons.find((b: any) => b.id === 'supplyWatch');
  assert(claim.label.node.activeInHierarchy); assert.match(claim.label.string, /启用并返回战斗/);
  assert.equal(hud.hit(claim.x + claim.w / 2, claim.y + claim.h / 2)?.id, 'supplyWatch');
  inset = 0;
});


test('HUD: minimal battle has no top backdrop and priority marker itself is a reachable control', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); hud.touch = true; hud.resize();
  const enemy = sim.units.find(u => !u.friendly)!;
  Object.assign(enemy, { x: sim.rescue.x + 5, z: sim.rescue.z, born: -30, attack: 3 });
  hud.update(sim, world);
  const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
  assert.deepEqual(buttons.map((b: any) => b.id).sort(), ['settings', 'battleReport', 'sensor', 'weapon0', 'weapon1', 'weapon2', 'weapon3', 'fire', 'priority'].sort());
  assert(!hud.g.calls.some((c: any) => ['rect', 'roundRect'].includes(c.op) && c.args[2] === frame.width), 'no full-width HUD backing');
  const priority = buttons.find((b: any) => b.id === 'priority');
  assert.equal(hud.hit(priority.x + 48, priority.y + 24)?.id, 'priority');
  assert.equal(hud.hit(priority.x + 48, priority.y + 57)?.id, 'priority', 'caption is clickable too');
  assert(priority.w >= 44 && priority.h >= 44); inset = 0;
});

test('automatic priority toggle removes only priority overlays and restores their touch target', () => {
  Object.assign(frame,{width:844,height:390});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation();sim.start();hud.touch=true;hud.resize();
  const enemy=sim.units.find(u=>!u.friendly)!;Object.assign(enemy,{x:sim.rescue.x+5,z:sim.rescue.z,born:-30,attack:3});
  hud.update(sim,world);const target=hud.buttons.find((b:any)=>b.id==='priority');assert(target.label.node.activeInHierarchy);
  const markCircles=()=>hud.marks.calls.filter((c:any)=>c.op==='circle'&&c.args[2]===6).length;
  const enabled=markCircles();hud.autoPriority=false;hud.update(sim,world);
  assert(!target.label.node.activeInHierarchy);assert.notEqual(hud.hit(target.x+48,target.y+24)?.id,'priority');
  assert(markCircles()<enabled);assert(hud.marks.calls.some((c:any)=>c.op==='fill'&&c.fill==='#ff525b'),'ordinary enemy contacts remain');
  hud.autoPriority=true;hud.update(sim,world);assert(target.label.node.activeInHierarchy);
});

test('compact tactics row, weapon skins and equipped skills keep independent readable targets',()=>{
  for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const lang of ['zh','en']){
    Object.assign(frame,{width,height});inset=12;const hud=new HUD(new SceneNode()),sim=new Simulation('training-60');
    hud.lang=lang;hud.touch=width<1000;hud.resize();sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.start();hud.update(sim,world);
    const controls=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy),tactic=controls.find((b:any)=>b.id==='battleReport');
    assert.equal(hud.h/2-hud.labels.get('health').node.position.y,tactic.y+tactic.h/2);
    assert(!hud.labels.get('health').string.includes('\n'));assert(!controls.some((b:any)=>b.id==='equipment'));
    for(const b of controls){assert(b.w>=44&&b.h>=44);for(const other of controls)if(other!==b)assert(!overlaps(b,other),`${width}: ${b.id}/${other.id}`);}
    sim.pause('settings',true);hud.update(sim,world);assertPanelTargets(hud);
    for(const id of ['sound','voicePrompts','autoPriority'])assert(hud.buttons.find((b:any)=>b.id===id)?.label.node.activeInHierarchy);
  }
  inset=0;
});

test('HUD: sound states draw different icons and ad feedback never paints over action buttons', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); sim.pause('settings', true);
  hud.update(sim, world); const on = hud.modal.getComponentsInChildren(Graphics).flatMap((g: any) => g.calls);
  hud.muted = true; hud.modalKey = 'rebuild'; hud.update(sim, world);
  const off = hud.modal.getComponentsInChildren(Graphics).flatMap((g: any) => g.calls);
  assert.notDeepEqual(on, off); assert(panelLabels(hud).some((l: any) => l.string === '游戏声音 关'));
  sim.pause('settings', false); hud.supplyOpen = true; hud.rewardsAvailable = true; sim.pause('supply', true);
  hud.supplyMessage = '观看已中断，未获得奖励'; hud.toast = hud.supplyMessage; hud.toastUntil = Date.now() + 4000;
  hud.update(sim, world); assert(!hud.labels.get('globalToast').node.activeInHierarchy);
  assert(panelLabels(hud).some((l: any) => l.string === hud.supplyMessage)); assertPanelTargets(hud);
  hud.supplyOpen = false; sim.pause('supply', false); sim.pause('manual', true); hud.update(sim, world);
  assert(!hud.labels.get('globalToast').node.activeInHierarchy, 'a transient battle notice must not cover the settings title');
  sim.pause('settings', true); hud.zoomOpen = true; hud.update(sim, world);
  assert(hud.labels.get('globalToast').node.activeInHierarchy, 'zoom ad errors remain visible above the panel');
  const toastY = hud.h / 2 - hud.labels.get('globalToast').node.position.y;
  assert(hud.buttons.filter((b: any) => b.label.node.parent === hud.modal).every((b: any) => b.y > toastY + 18));
  const toast = hud.labels.get('globalToast'), gear = hud.buttons.find((b: any) => b.id === 'settings');
  assert(toast.node.position.x + hud.w / 2 + toast.node.getComponent(Transform).contentSize.width / 2 < gear.x);
  hud.zoomOpen = false; sim.pause('settings', true); hud.toolsOpen = true; sim.pause('mission', true); hud.update(sim, world);
  assert.equal(hud.modalKey, 'mission'); sim.pause('mission', false); hud.update(sim, world);
  assert.equal(hud.modalKey, 'settings:flight');
  hud.supplyOpen = false; sim.pause('supply', false); sim.pause('settings', true); hud.exitConfirm = true; hud.update(sim, world);
  assert.equal(hud.modalKey, 'exit'); assertPanelTargets(hud);
  assert.deepEqual(hud.buttons.filter((b: any) => b.label.node.activeInHierarchy).map((b: any) => b.id), ['exitCancel', 'exitConfirm']);
  assert(panelLabels(hud).some((l: any) => l.string === '将会中断本次游戏并退出。')); inset = 0;
});

test('HUD: authored metal title and three day illustrations are loaded and cropped as runtime resources', () => {
  const load = cc.resources.load;
  const requested: string[] = [];
  cc.resources.load = (name: string, _type: any, done: any) => {
    requested.push(name); done(null, { width: 2172, height: 724 });
  };
  try {
    for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) {
      Object.assign(frame, { width, height }); inset = 12;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.resize(); hud.update(sim, world);
      assert(hud.modal.children.some((node: any) => node.name === 'MetalWordmark' && node.getComponent(cc.Sprite)?.spriteFrame), 'home uses the authored transparent metal title');
      hud.missionsOpen = true; hud.update(sim, world); assertPanelTargets(hud);
      const cards = descendants(hud.modal).filter((node: any) => node.name.startsWith('MissionIllustration-')&&node.getComponent(cc.Mask)).slice(0,3);
      assert.equal(cards.length, 3);
      assert.deepEqual(cards.map((node: any) => node.children[0].getComponent(cc.Sprite).spriteFrame.rect.x), [1448, 724, 1448], 'mission previews use the night operation artwork for each terrain');
      for (const crop of cards) {
        assert(crop.getComponent(cc.Mask), 'image crop has a real UI mask');
        const image = crop.children[0].getComponent(cc.Sprite), size = crop.getComponent(Transform).contentSize;
        assert.equal(image.spriteFrame.rect.width, 724); assert.equal(image.spriteFrame.rect.height, 724);
        assert(size.width >= 44 && size.height > 30, 'illustration remains visible on small phones');
      }
    }
    assert.deepEqual([...new Set(requested)].sort(), ['ui/button/texture', 'ui/insignia/texture', 'ui/mission-atlas/texture', 'ui/mission-day-atlas/texture', 'ui/panel/texture', 'ui/progression/01-home/texture', 'ui/progression/home/texture', 'ui/progression/night-ui-serif', 'ui/progression/skins/texture', 'ui/progression/title/texture', 'ui/title-metal/texture']);
  } finally { cc.resources.load = load; inset = 0; }
});

test('late interface textures cannot retain an ad panel after battle resumes',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;
 const load=cc.resources.load,callbacks=new Map();cc.resources.load=(name:any,_type:any,done:any)=>callbacks.set(name,done);
 try{
  const hud=new HUD(new SceneNode()),sim=new Simulation();sim.start();sim.pause('advert',true);hud.advert={kind:'zoom',mock:false};hud.update(sim,world);assert(hud.modal);
  hud.advert=undefined;sim.pause('advert',false);hud.modalKey='rebuild';
  callbacks.get('ui/panel/texture')(null,{width:1024,height:512});hud.update(sim,world);
  assert.equal(hud.modalKey,'');assert(!hud.modal);assert(!hud.buttons.some((b:any)=>b.id==='adClose'&&b.label.node.activeInHierarchy));
 }finally{cc.resources.load=load;}
});

test('priority touch target never hides nearby ordinary enemy diamonds',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;
 const hud=new HUD(new SceneNode()),sim=new Simulation();sim.start();
 const enemy=sim.units.find(u=>!u.friendly)!;Object.assign(enemy,{x:sim.rescue.x+5,z:sim.rescue.z,born:-30,attack:3});
 const neighbour={...enemy,id:9876,kind:'light' as const,x:enemy.x+12,attack:20};sim.units.push(neighbour);hud.update(sim,world);
 const point=world.project(neighbour,.8),x=point.x-frame.width/2,y=point.y-frame.height/2,r=neighbour.kind==='heavy'?7:5;
 assert.equal(hud.hit(point.x,frame.height-point.y)?.id,'priority');
 const path=[['moveTo',x,y+r],['lineTo',x+r,y],['lineTo',x,y-r],['lineTo',x-r,y],['close'],['stroke']];
 assert(hud.marks.calls.some((_:any,i:number)=>path.every(([op,...args],j)=>{
  const c=hud.marks.calls[i+j];return c?.op===op&&c.color==='#ff525b'&&args.every((v,k)=>Math.abs(c.args[k]-Number(v))<.001);
 })),'the neighbouring red diamond is fully drawn inside the priority target');
});

test('infantry use small solid team-color dots while vehicles keep their markers', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start();
  const infantry = sim.addUnit('infantry', { x: -75, z: 0 }, false);
  const ally = sim.addUnit('infantry', { x: 0, z: 35 }, true);
  const vehicles = (['light', 'turret', 'heavy'] as const).map((kind, i) =>
    sim.addUnit(kind, { x: 45 + i * 22, z: 0 }, false));
  sim.units = [sim.rescue, infantry, ally, ...vehicles];
  Object.assign(sim.rescue, { x: -110, z: 0 });
  sim.setAim({ x: 125, z: 50 });
  hud.update(sim, world);
  const calls = hud.marks.calls;
  const projected = world.project(infantry, 0.8);
  const x = projected.x - frame.width / 2, y = projected.y - frame.height / 2;
  assert(calls.some((call: any, i: number) => call.op === 'circle' &&
    call.args[0] === x && call.args[1] === y && call.args[2] === 1.5 &&
    calls[i + 1]?.op === 'fill' && calls[i + 1].fill === '#ff525b'), 'battlefield infantry marker is a filled red dot');
  assert(!calls.some((call: any) => call.op === 'moveTo' && call.args[0] === x && call.args[1] === y + 5),
    'infantry do not retain the vehicle diamond');
  for (const vehicle of vehicles) {
    const point = world.project(vehicle, 0.8);
    const radius = vehicle.kind === 'heavy' ? 7 : 5;
    assert(calls.some((call: any) => call.op === 'moveTo' && call.args[0] === point.x - frame.width / 2 &&
      call.args[1] === point.y - frame.height / 2 + radius && call.color === '#ff525b'),
    `${vehicle.kind} keeps its red diamond`);
  }
  const friendly = world.project(ally, 0.8);
  assert(calls.some((call: any, i: number) => call.op === 'circle' &&
    call.args[0] === friendly.x - frame.width / 2 && call.args[1] === friendly.y - frame.height / 2 &&
    call.args[2] === 1.5 && calls[i + 1]?.op === 'fill' && calls[i + 1].fill === '#82c9ed'),
  'friendly infantry use a filled blue dot');
  const map = hud.minimapLayout;
  const mapX = map.x + 8 + ((infantry.x + data.MAP.halfWidth) / (2 * data.MAP.halfWidth)) * (map.w - 16) - hud.w / 2;
  const mapY = hud.h / 2 - map.y - 25 - ((infantry.z + data.MAP.halfDepth) / (2 * data.MAP.halfDepth)) * (map.h - 33);
  assert(calls.some((call: any, i: number) => call.op === 'circle' && call.args[0] === mapX &&
    call.args[1] === mapY && call.args[2] === 1.5 && calls[i + 1]?.op === 'fill' &&
    calls[i + 1].fill === '#ff525b'), 'minimap infantry marker is a filled red dot');
  const allyMapX = map.x + 8 + ((ally.x + data.MAP.halfWidth) / (2 * data.MAP.halfWidth)) * (map.w - 16) - hud.w / 2;
  const allyMapY = hud.h / 2 - map.y - 25 - ((ally.z + data.MAP.halfDepth) / (2 * data.MAP.halfDepth)) * (map.h - 33);
  assert(calls.some((call: any, i: number) => call.op === 'circle' && call.args[0] === allyMapX &&
    call.args[1] === allyMapY && call.args[2] === 1.5 && calls[i + 1]?.op === 'fill' &&
    calls[i + 1].fill === '#82c9ed'), 'minimap friendly infantry marker is a filled blue dot');
});

test('combined phone safe areas keep lobby reconnect targets separate and ranking text readable',()=>{
 Object.assign(frame,{width:568,height:320});const safe=cc.sys.getSafeAreaRect;
 cc.sys.getSafeAreaRect=()=>({x:44,y:20,width:480,height:280});
 try{
  const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.online=online;
  online.show('menu');online.resumeCode='123456';hud.update(sim,world);assertPanelTargets(hud);
  const targets=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy);
  for(const a of targets)for(const b of targets)if(a!==b)assert(!overlaps(a,b),a.id+'/'+b.id);
  online.show('ranking');online.ranking={top:[{playerId:'11111111-1111-4111-8111-111111111111',nickname:'这是一个包含十六个汉字的玩家昵称',rank:1,score:120,secondary:0}],me:null};
  hud.update(sim,world);assertPanelTargets(hud);
  assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string.includes('#11111111')));
 }finally{cc.sys.getSafeAreaRect=safe;}
});


test('failed loadout artwork preserves the pending transaction leave confirmation',()=>{
  Object.assign(frame,{width:844,height:390});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
  online.authenticatedId='qa-pilot';online.assets=assetFixture();hud.online=online;
  const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
  hud.update(sim,world);q.show('loadout');
  q.pending={kind:'loadout',mode:'solo',loadout:structuredClone(q.loadout),requestId:'saved-loadout'};
  hud.progressionArt.frames.delete('hangar');hud.progressionArt.failed.add('hangar');
  q.back();hud.update(sim,world);
  assert(hud.buttons.some((b:any)=>b.id==='qm:leavePending'));
  assert.equal(q.pending.requestId,'saved-loadout','Loading must not discard a pending transaction');
});

test('progression pages keep every live action reachable on short and wide screens',()=>{
  const pages:ProgressionPage[]=['','modes','loadout','shop','supply','growth','tasks','inbox','warehouse','craft','receipts','checkin','probability'];
  for(const [width,height]of [[568,320],[844,390],[1280,720],[1672,941]])for(const safe of [0,12])for(const lang of ['zh','en']){
    Object.assign(frame,{width,height});inset=safe;
    const hud=new HUD(new SceneNode()),sim=new Simulation();hud.lang=lang;hud.touch=true;
    const online=new Online({getItem:()=>null,setItem(){}},()=>{});online.authenticatedId='qa-pilot';online.assets={...assetFixture(),economy:ECONOMY};hud.online=online;
    const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
    for(const page of pages)for(const detail of page==='shop'?[false,true]:[false]){
      q.page=page;q.detail=detail;q.index=0;q.message=['',''];q.revision++;hud.update(sim,world);
      const buttons=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy).map((b:any)=>{
        if(!b.clip)return b;
        const x=Math.max(b.x,b.clip.x),y=Math.max(b.y,b.clip.y);
        return {...b,x,y,w:Math.max(0,Math.min(b.x+b.w,b.clip.x+b.clip.w)-x),h:Math.max(0,Math.min(b.y+b.h,b.clip.y+b.clip.h)-y)};
      }).filter((b:any)=>b.w>0&&b.h>0);
      const ids=new Set();
      for(const b of buttons){
        const info=`${width}x${height}/${safe}/${lang}/${page}/${detail}/${b.id}`;
        assert(!ids.has(b.id),info+' unique');ids.add(b.id);
        const raw=hud.buttons.find((button:any)=>button.id===b.id)!;
        assert(raw.w>=44&&raw.h>=44,info+' 44px before viewport clipping');
        assert(b.x>=safe-.01&&b.y>=safe-.01&&b.x+b.w<=width-safe+.01&&b.y+b.h<=height-safe+.01,info+' in safe area');
        assert(!buttons.some((other:any)=>other!==b&&!b.id.startsWith('info:')&&!other.id.startsWith('info:')&&overlaps(b,other)),info+' no overlap');
        assert.equal(hud.hit(b.x+b.w/2,b.y+b.h/2)?.id,b.disabled?undefined:b.id,info+' reachable');
      }
    }
  }
  inset=0;
});

test('crafting shows material costs and owned states; stage bonuses use server history',async(t)=>{
  artworkAvailable=true;t.after(()=>{artworkAvailable=false;inset=0;});
  for(const [width,height]of [[568,320],[1280,720]]){
    Object.assign(frame,{width,height});inset=12;
    const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
    online.authenticatedId='qa-pilot';online.assets={...assetFixture(),economy:ECONOMY,available:{'fragment:weapon':11,'fragment:skill':6},clearedLevels:['corridor-01']};hud.online=online;
    const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;online.refreshAssets=async()=>online.assets;q.syncIdentity();q.show('warehouse');q.show('craft');await new Promise<void>(resolve=>setImmediate(resolve));hud.update(sim,world);
    assert.equal(hud.buttons.find((b:any)=>b.id==='qm:craftItem:drone-match')?.disabled,false);
    assert.equal(hud.buttons.find((b:any)=>b.id==='qm:craftItem:laser-match')?.disabled,true);
    q.craftTerm='permanent';online.assets.permanent.push('drone');q.revision++;hud.update(sim,world);
    assert.equal(hud.buttons.find((b:any)=>b.id==='qm:craftItem:drone-permanent')?.label.string,'已永久拥有');
    assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string.includes('Lv.6自动永久解锁')));
    q.craftTerm='match';q.revision++;hud.update(sim,world);
    assert.equal(hud.buttons.find((b:any)=>b.id==='qm:craftItem:drone-match')?.disabled,true);
    q.show('shop');await new Promise<void>(resolve=>setImmediate(resolve));
    for(const term of ['match','24h','permanent'] as const){q.term=term;q.selected='drone-'+term;q.detail=true;q.revision++;hud.update(sim,world);assert.equal(hud.buttons.find((b:any)=>b.id==='qm:buy')?.disabled,true);}
    q.detail=false;q.back();assert.equal(q.page,'craft');
    q.back();assert.equal(q.page,'warehouse');online.assets.inventory['fragment:weapon']=11;q.item='fragment:weapon';q.revision++;hud.update(sim,world);assert.equal(hud.buttons.filter((b:any)=>b.id==='qm:craft').length,1);q.page='';hud.missionsOpen=true;hud.resize();hud.modalKey='rebuild';hud.update(sim,world);
    const labels=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);
    assert(labels.includes('首通奖励已领取'),labels.join('|'));assert(labels.some((s:string)=>s.includes('每次通关：180金币 / 120EXP / 2武器碎片')));
    const area=hud.listAreas.find((a:any)=>a.key==='missions');assert(area.h>=100,'reward preview leaves complete small-screen cards');
    online.assets.clearedLevels=[];hud.missionProgress.cleared=['corridor-01'];hud.modalKey='rebuild';hud.update(sim,world);
    assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string.includes('资格以结算校验为准')));
  }
  inset=0;
});

test('check-in highlights today before and after claiming, retaining day seven until the next day',()=>{
  for(const [width,height]of [[568,320],[1280,720]]){
    Object.assign(frame,{width,height});inset=0;
    const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
    online.assets={...assetFixture(),economy:ECONOMY};hud.online=online;
    const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
    hud.update(sim,world);
    assert.equal(hud.buttons.find((b:any)=>b.id==='qm:loadout')?.label.string,'作战配置  ›');
    q.page='loadout';q.revision++;hud.update(sim,world);
    assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string==='作战配置'));
    q.page='checkin';
    for(const [count,signedToday,expected]of [[0,false,1],[1,true,1],[1,false,2],[2,true,2],[6,false,7],[7,true,7],[7,false,8],[8,true,8],[14,true,14]] as const){
      online.assets.signedDays=Array.from({length:count},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
      online.assets.signedToday=signedToday;q.revision++;hud.update(sim,world);
      const outlines=hud.modal.children.filter((n:SceneNode)=>n.name==='SelectedOutline');
      assert.equal(outlines.length,1);
      const [x,y,w,h]=outlines[0].getComponent(Graphics).calls.find((c:any)=>c.op==='roundRect').args;
      const labels=hud.modal.getComponentsInChildren(cc.Label),days=labels.filter((l:any)=>/^第 \d+ 天$/.test(l.string));
      const selected=days.filter((l:any)=>l.node.position.x>=x&&l.node.position.x<=x+w&&l.node.position.y>=y&&l.node.position.y<=y+h);
      assert.deepEqual(selected.map((l:any)=>l.string),[`第 ${expected} 天`],`${count} claimed / today ${signedToday}`);
      assert.equal(days[0].string,`第 ${expected<=7?1:8} 天`);
      assert.equal(labels.filter((l:any)=>l.string==='✓').length,count-(expected<=7?0:7));
      assert.equal(hud.buttons.find((b:any)=>b.id==='qm:checkinClaim')?.disabled,signedToday);
    }
  }
});

test('warehouse identifies terms and pool tiers; inbox cannot claim a selection from another page',()=>{
  Object.assign(frame,{width:568,height:320});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
  online.authenticatedId='qa-pilot';online.assets=assetFixture();hud.online=online;
  const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
  q.page='warehouse';q.item='power-24h';hud.update(sim,world);
  assert(hud.buttons.find((b:any)=>b.id==='qm:activate')?.disabled);
  assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string.includes('24小时')));
  q.item='pack:general:3';q.index=Math.floor(q.inventory.findIndex(([id])=>id===q.item)/3);q.revision++;hud.update(sim,world);
  assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string.includes('史诗')));
  q.page='inbox';q.index=1;q.selectedMail='mail-0';q.revision++;hud.update(sim,world);
  assert(hud.buttons.some((b:any)=>b.id==='qm:claimMail'),'scroll preserves selected mail rather than silently changing it');
  q.selectedMail='mail-2';q.revision++;hud.update(sim,world);
  assert(hud.buttons.some((b:any)=>b.id==='qm:claimMail'));
  online.assets.mail[2].body='请查收：{补偿明细}感谢支持';q.revision++;hud.update(sim,world);
  const lines=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);
  assert(lines.includes('200 金币 · 80 EXP · 3 补给箱'),'placeholder becomes its own line from the mail reward');
  assert(lines.includes('请查收：')&&lines.includes('感谢支持')&&!lines.some((s:string)=>s.includes('{补偿明细}')));
  assert(lines.includes('领取 · 200 金币 · 80 EXP · 3 补给箱'));
  online.assets.mail[2].reward={coins:0,xp:80,packs:0};q.revision++;hud.update(sim,world);
  const zero=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);
  assert(zero.includes('领取 · 80 EXP')&&zero.includes('80 EXP'),'zero-valued rewards are omitted from the button and the highlighted line');
});

test('warehouse sale includes the total, current crates have valid tiers, and synchronization stays an icon',()=>{
  for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const lang of ['zh','en']){
    Object.assign(frame,{width,height});inset=12;
    const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.lang=lang;
    online.assets={...assetFixture(),economy:ECONOMY};hud.online=online;
    const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;q.page='warehouse';q.item='tracking-match';
    for(const amount of [1,3,5]){
      q.amount=amount;q.revision++;hud.update(sim,world);
      const sale=hud.buttons.find((b:any)=>b.id==='qm:sell'),labels=hud.modal.getComponentsInChildren(cc.Label);
      assert.equal(sale.label.string,lang==='zh'?`出售可得${24*amount}`:`SELL FOR ${24*amount}`);
      assert(!labels.some((l:any)=>/^(可得|GAIN)/.test(l.string)));
      assert(hud.modal.children.some((n:SceneNode)=>n.name==='AssetSync:ready'));
    }
    for(const pool of ['general','gold'])for(let tier=0;tier<4;tier++){
      q.item=`pack:${pool}:${tier}`;online.assets.inventory[q.item]=1;online.assets.available[q.item]=1;q.revision++;hud.update(sim,world);
      assert(!hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>String(l.string).includes('undefined')));
    }
    q.busy=true;q.revision++;hud.update(sim,world);
    assert(hud.modal.children.some((n:SceneNode)=>n.name==='AssetSync:busy'));
    assert(!hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>/正在同步|Synchronizing/.test(l.string)));
    q.busy=false;q.message=['网络中断，请重试','Connection interrupted. Retry.'];q.revision++;hud.update(sim,world);
    assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string===q.message[lang==='zh'?0:1]));
    assert(!hud.modal.children.some((n:SceneNode)=>n.name==='AssetSync:ready'));
  }
  inset=0;
});

test('warehouse confirmation keeps the intended item and quantity when resizing changes the visible page',()=>{
  Object.assign(frame,{width:1280,height:720});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
  online.assets=assetFixture();hud.online=online;const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
  q.page='warehouse';q.index=1;hud.update(sim,world);q.amount=3;q.confirmation={kind:'sell',item:q.item,quantity:q.amount};q.revision++;hud.update(sim,world);
  const before=hud.modal.getComponentsInChildren(cc.Label).find((l:any)=>l.string.includes('总计 ')).string;
  Object.assign(frame,{width:568,height:320});hud.resize();q.revision++;hud.update(sim,world);
  const after=hud.modal.getComponentsInChildren(cc.Label).find((l:any)=>l.string.includes('总计 ')).string;
  assert.equal(after,before);assert(after.includes('×3'));assert.equal(q.item,q.confirmation.item);assert.equal(q.amount,3);
});

test('disabled active and cooling skills block battlefield input while special weapons remain separate',()=>{
  for(const touch of [false,true])for(const time of [1,5]){
    Object.assign(frame,{width:568,height:320});inset=12;
    const hud=new HUD(new SceneNode()),sim=new Simulation('training-60');hud.touch=touch;
    sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.start();sim.useSkill();sim.time=time;hud.update(sim,world);
    const skill=hud.buttons.find((b:any)=>b.id==='skillUse'),weapon=hud.buttons.find((b:any)=>b.id==='weapon4');
    assert(skill?.disabled);assert(weapon);assert(!overlaps(skill,weapon));
    assert(skill.label.string==='电磁干扰');assert.equal(hud.controlAt(skill.x+20,skill.y+20),skill);
    assert.equal(hud.hit(skill.x+20,skill.y+20),undefined);
    assert(hud.blocksBattlefield(skill.x+20,skill.y+20),'a disabled control must consume touch/mouse input');
  }
  inset=0;
});

test('skill status has distinct ready, active and cooldown colors without recoloring its name',()=>{
  Object.assign(frame,{width:568,height:320});inset=0;
  const hud=new HUD(new SceneNode()),sim=new Simulation('training-60');hud.touch=true;
  sim.applyLoadout({version:'night-growth-v1',level:10,effects:['emp','drone'],skipped:[]});sim.start();
  const colors=[];
  for(const [remaining,cooldown,text]of [[0,0,'就绪'],[12,0,'生效'],[0,20,'冷却']] as const){
    sim.skill.activeUntil=sim.time+remaining;sim.skill.readyAt=sim.time+cooldown;hud.update(sim,world);
    const skill=hud.buttons.find((b:any)=>b.id==='skillUse');assert.equal(skill.label.string,'电磁干扰');assert.match(skill.detail.string,new RegExp(text));colors.push(skill.detail.color.hex);
    assert.match(hud.buttons.find((b:any)=>b.id==='weapon4').label.string,/^无人机\s+3$/);
  }
  assert.equal(new Set(colors).size,3);
});

test('growth settlement keeps rewards, next mission and base actions separate; local bots never inherit solo points',()=>{
  for(const [width,height]of [[568,320],[844,390],[1280,720],[1672,941]]){
    Object.assign(frame,{width,height});inset=12;
    const hud=new HUD(new SceneNode()),sim=new Simulation('corridor-01'),online=new Online({getItem:()=>null,setItem(){}},()=>{});
    online.authenticatedId='qa-pilot';online.assets=assetFixture();online.rankStatus='finished';online.battleReward={status:'credited',points:100,coins:180,xp:120};hud.online=online;
    hud.quartermaster=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});sim.phase='success';hud.update(sim,world);
    const solo=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);
    assert(solo.includes('本局积分')&&solo.includes('+100'),'formal solo displays the authoritative point receipt');
    assert(solo.includes('+180')&&solo.includes('+120')&&solo.some((s:string)=>s.includes('收益已到账')));
    const saved=online.battleReward;online.battleReward=undefined;online.recorder={record(){}} as any;
    for(const status of ['needs-attention','update-required','identity-changed','storage-unavailable','unavailable']){
      online.rankStatus=status;hud.modalKey='rebuild';hud.update(sim,world);
      const labels=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);assert(!labels.some((s:string)=>s.includes('请保持联网')));assert(labels.includes('未确认'));
    }
    online.rankStatus='practice';hud.modalKey='rebuild';hud.update(sim,world);
    const practice=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);assert(practice.includes('本局积分')&&practice.includes('不计分'),'solo practice retains its score card without a fabricated score');
    online.rankStatus='local';online.recorder=undefined;hud.modalKey='rebuild';hud.update(sim,world);
    const offline=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);assert(offline.includes('本局积分')&&offline.includes('不计分'));
    online.battleReward=saved;online.rankStatus='finished';hud.modalKey='rebuild';hud.update(sim,world);
    const buttons=hud.buttons.filter((b:any)=>b.label.node.activeInHierarchy);
    for(const b of buttons)assert(!buttons.some((other:any)=>other!==b&&overlaps(b,other)),`${width} settlement ${b.id} overlap`);
    sim.duelMode=true;online.bot={} as any;hud.modalKey='rebuild';hud.update(sim,world);
    const captions=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);
    assert(!captions.includes('+100'),'local bot cannot inherit previous ranked points');
    assert(!captions.includes('本局积分'),'local practice has no score card');
    assert(captions.some((s:string)=>s.includes('训练不消耗库存')));
    online.bot=undefined;online.room={you:0,players:[{id:'qa-pilot'},{id:'opponent'}],settlement:{status:'credited',points:50,coins:200,xp:140}} as any;hud.modalKey='rebuild';hud.update(sim,world);
    const duel=hud.modal.getComponentsInChildren(cc.Label).map((l:any)=>l.string);assert(duel.includes('本局积分')&&duel.includes('+50'));
  }
  inset=0;
});

test('direct and recovered solo receipts refresh authoritative task progress in the open task page',async()=>{
  Object.assign(frame,{width:1280,height:720});inset=0;
  for(const delayed of [false,true]){
    const store={getItem:()=>null,setItem(){},removeItem(){}},online=new Online(store,()=>{}),hud=new HUD(new SceneNode()),sim=new Simulation('corridor-01');
    const before=assetFixture('task-pilot'),after=structuredClone(before);before.tasks.find(t=>t.event==='solo')!.progress=0;after.tasks.find(t=>t.event==='solo')!.progress=1;
    const receipt={accepted:true,status:'credited',points:100,coins:180,xp:120};let callback:(status:string)=>void=()=>{},fetches=0;
    const recorder:any={settlement:undefined,start:async()=>null,record(){},finish:async()=>delayed?null:receipt,invalidate(){}};
    const bridge:any={ready:Promise.resolve({identity:{id:'task-pilot'},capabilities:{leaderboards:true,multiplayer:true}}),createRecorder:(_v:string,options:any)=>{callback=options.onStatus;return recorder;},services:{nightAssets:async(owner:string)=>{assert.equal(owner,'task-pilot');fetches++;return after;}}};
    await online.connect(bridge);online.assets=before;hud.online=online;const q=new Quartermaster(online,store);hud.quartermaster=q;q.page='tasks';sim.phase='success';hud.update(sim,world);
    assert(panelLabels(hud).some((l:any)=>l.string==='0/2'));
    assert(panelLabels(hud).some((l:any)=>l.string==='完成2次单人关卡'));
    assert(panelLabels(hud).some((l:any)=>l.string==='每日任务'));
    assert.equal(before.tasks.find(t=>t.event==='solo')!.name,'完成2次单人任务','old server names are adapted only for display');
    await online.finishRanking();
    if(delayed){assert.equal(fetches,0);recorder.settlement={playerId:'task-pilot',runId:'current-run',result:receipt};callback('finished');}
    await new Promise(resolve=>setImmediate(resolve));hud.update(sim,world);
    assert.equal(fetches,1);assert.equal(q.assets,after,'task values use the complete server snapshot');
    assert(panelLabels(hud).some((l:any)=>l.string==='1/2'),'the already-open task page redraws after settlement');
    assert.equal(before.tasks.find(t=>t.event==='solo')!.progress,0,'the client does not increment its old task snapshot');online.dispose();
  }
});

test('stable tab identities animate ranking and settings changes without polling fades',()=>{
 Object.assign(frame,{width:1280,height:720});inset=0;const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.online=online;online.panel='ranking';online.board='level';
 const labels=['当前战区版 ▾','旧驻守版 ▾','旧梯度版 ▾','旧成长版 ▾','原始历史版 ▾'];let previous='';for(const [i,version]of ['night-campaign-v4','night-campaign-v3','night-campaign-v2','night-growth-v1','night-records-v1'].entries()){online.rankingVersion=version;online.revision++;hud.update(sim,world);assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>l.string===labels[i]));assert.notEqual(hud.semanticKey,previous);previous=hud.semanticKey;online.revision++;hud.update(sim,world);assert.equal(hud.semanticKey,previous);}
 hud.renderModal('settings',sim,world);previous=hud.semanticKey;hud.renderModal('settings:zoom',sim,world);assert.notEqual(hud.semanticKey,previous);previous=hud.semanticKey;hud.renderModal('settings:flight',sim,world);assert.notEqual(hud.semanticKey,previous);
});


test('refinement: one report shell keeps tabs and close fixed; names remain single-line in duel and spectating',()=>{
 for(const [width,height] of [[568,320],[844,390],[1280,720]]){
  Object.assign(frame,{width,height});inset=12;const hud=new HUD(new SceneNode()),sim=new Simulation();sim.start();sim.duelMode=true;
  const online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.online=online;
  const players=[{playerId:'10000001',nickname:'夜航守望这是很长的中文玩家昵称'},{playerId:'10000002',nickname:'WWWWMMMMWWWWMMMM'}];
  online.room={code:'ROOM',status:'playing',mode:'friend',you:0,seq:0,players,state:null};
  for(const spectator of [false,true]){online.room.spectator=spectator;hud.update(sim,world);
   for(const side of [0,1]){const l=hud.labels.get('spectator:'+side);assert(l.node.activeInHierarchy);assert.equal(l.enableWrapText,false);assert(!l.string.includes('\n'));assert(l.fontSize>=12);if(width===568)assert(l.string.endsWith('…'));}
  }
  hud.reportOpen=true;hud.update(sim,world);assertPanelTargets(hud);const close=hud.buttons.find((b:any)=>b.id==='close'),geometry=[close.x,close.y,close.w,close.h];
  assert(panelLabels(hud).some((l:any)=>l.string===players[0].nickname));assert(panelLabels(hud).some((l:any)=>l.string===players[1].nickname));
  hud.equipmentOpen=true;hud.update(sim,world);assertPanelTargets(hud);const second=hud.buttons.find((b:any)=>b.id==='close');assert.deepEqual([second.x,second.y,second.w,second.h],geometry);
  assert.equal(hud.buttons.filter((b:any)=>['close','equipmentClose'].includes(b.id)&&b.label.node.activeInHierarchy).length,1);
  assert(hud.buttons.some((b:any)=>b.id==='reportOverview'));assert(hud.buttons.some((b:any)=>b.id==='equipment'));
 }
 inset=0;
});
test('refinement: selected mission is positioned in the horizontal viewport and weapon cooldown switches immediately',()=>{
 Object.assign(frame,{width:568,height:320});inset=0;const hud=new HUD(new SceneNode()),sim=new Simulation(MISSIONS[79].id);hud.missionsOpen=true;hud.missionFocus=79;hud.update(sim,world);
 const area=hud.listAreas.find((a:any)=>a.key==='missions');assert.equal(area.axis,'x');const selected=hud.buttons.find((b:any)=>b.id==='mission:'+MISSIONS[79].id);assert(selected.x>=area.x&&selected.x+selected.w<=area.x+area.w);
 hud.missionsOpen=false;sim.start();hud.touch=true;hud.resize();Object.assign(sim.guns[2],{cooldown:2.3,cooldownTotal:4});sim.choose(2);hud.update(sim,world);
 const fire=()=>{const b=hud.buttons.find((b:any)=>b.id==='fire');return b.label.string+(b.detail?.node.active?b.detail.string:'');};assert(fire().includes('2.3s'));assert(hud.buttons.find((b:any)=>b.id==='weapon2').detail.string.includes('2.3s'));
 sim.choose(0);hud.update(sim,world);assert(!fire().includes('2.3s'));Object.assign(sim.guns[0],{heat:94,overheated:true,cooldown:.1,cooldownTotal:.2});hud.update(sim,world);assert(fire().includes('3.0s'));
 sim.guns[0].ammo=0;hud.update(sim,world);assert(!fire().includes('s'));assert(hud.buttons.find((b:any)=>b.id==='weapon0').detail.string.includes('弹尽'));
});

test('refinement: player-facing experience labels use EXP and combat configuration is named explicitly',()=>{
 Object.assign(frame,{width:844,height:390});inset=0;const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});online.authenticatedId='qa-pilot';online.assets=assetFixture();hud.online=online;
 const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;hud.update(sim,world);
 let labels=panelLabels(hud).map((l:any)=>l.string);assert(labels.some((s:string)=>s.includes('EXP')));assert(!labels.some((s:string)=>/\bXP\b/.test(s)));
 q.show('modes');hud.update(sim,world);assert(hud.buttons.find((b:any)=>b.id==='qm:loadout').label.string.includes('作战配置'));
});


test('new shop categories filter cards and the home lobby respects capability and compact safe headers',()=>{
 for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const lang of ['zh','en']){
  Object.assign(frame,{width,height});inset=12;const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});
  online.assets={...assetFixture(),economy:ECONOMY};online.authenticatedId='qa-pilot';online.available=true;hud.online=online;hud.lang=lang;const q=new Quartermaster(online,{getItem:()=>null,setItem(){},removeItem(){}});hud.quartermaster=q;
  hud.update(sim,world);const lobby=hud.buttons.find((b:any)=>b.id==='online:menu');assert(lobby);assert(lobby.w>=44&&lobby.h>=44);
  for(const b of hud.buttons.filter((b:any)=>b!==lobby&&b.label.node.activeInHierarchy))assert(!overlaps(lobby,b),`${width}/${lang} lobby overlaps ${b.id}`);
  online.available=false;online.revision++;hud.modalKey='rebuild';hud.update(sim,world);assert(!hud.buttons.some((b:any)=>b.id==='online:menu'));
  q.show('shop');for(const category of ['mod','weapon','skill'] as const){q.shopCategory=category;q.revision++;hud.update(sim,world);const cards=hud.buttons.filter((b:any)=>b.id.startsWith('product:'));assert(cards.length>0);for(const b of cards)assert.equal(q.catalog.find(p=>p.id===b.id.slice(8))!.category,category);assert(hud.buttons.some((b:any)=>b.id==='qm:shopCategory:'+category));}
 }inset=0;
});

test('lobby keeps the private tab usable without social service and insets the chat editor', () => {
  Object.assign(frame, { width: 844, height: 390 });
  inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  const online = new Online({ getItem: () => null, setItem() {} }, () => {});
  hud.online = online;
  online.show('menu');
  hud.update(sim, world);
  const button = (id: string) => hud.buttons.find((b: any) => b.id === `online:${id}`);
  const field = hud.modal.getChildByName('LobbyComposer');
  const editorWidth = field.getComponent(cc.UITransform).contentSize.width;
  const editorLeft = hud.w / 2 + field.position.x - editorWidth / 2;
  assert.equal(button('chatInbox').disabled, false);
  assert(Math.abs(editorLeft - button('chatPublic').x - 12) < 0.01);

  online.selectChat(undefined, true);
  hud.update(sim, world);
  assert(panelLabels(hud).some((label: any) => label.string === '私信服务暂不可用'));
  assert.equal(field.getComponent(cc.EditBox).enabled, false);
  assert.equal(button('chatSend').disabled, true);
  assert.equal(button('chatInvite').disabled, true);

  online.socialAvailable = true;
  online.revision++;
  hud.update(sim, world);
  assert(panelLabels(hud).some((label: any) => label.string.startsWith('暂无会话')));
  online.selectChat();
  hud.update(sim, world);
  assert.equal(field.getComponent(cc.EditBox).enabled, true);
  online.dispose();
});

test('global direct conversations retain their composer, fit touch screens and preserve the live room',()=>{
 for(const [width,height] of [[568,320],[844,390],[1280,720]]){
  Object.assign(frame,{width,height});inset=0;const hud=new HUD(new SceneNode()),sim=new Simulation(),online=new Online({getItem:()=>null,setItem(){}},()=>{});hud.online=online;
  online.identity={playerId:'a',nickname:'A'};online.authenticatedId='a';online.socialAvailable=true;online.chatAvailable=true;online.chatPeer={playerId:'b',nickname:'B',status:'available'};online.chatInbox=true;online.socialOpen=true;online.chatMessages=[{id:'1',playerId:'b',nickname:'B',recipientId:'a',text:'测试私信',at:1}];
  sim.start();const phase=sim.phase;hud.update(sim,world);const modal=hud.modal,field=modal.getComponentsInChildren(cc.EditBox)[0];assert(field);
  online.chatRevision++;hud.update(sim,world);assert.equal(hud.modal,modal);assert.equal(modal.getComponentsInChildren(cc.EditBox)[0],field);assert.equal(sim.phase,phase);
  const controls=hud.buttons.filter((b:any)=>hud.inModal(b.label.node));for(const b of controls){assert(b.w>=44&&b.h>=44,b.id);assert(b.x>=0&&b.x+b.w<=width&&b.y>=0&&b.y+b.h<=height,b.id);}
  assert(controls.some((b:any)=>b.id==='social:close'));assert(controls.some((b:any)=>b.id==='online:chatSend'));
  online.socialOpen=false;hud.updatesOpen=true;hud.update(sim,world);assert(hud.buttons.some((b:any)=>b.id==='updates:close'));assert(hud.modal.getComponentsInChildren(cc.Label).some((l:any)=>/重大更新/.test(l.string||'')));online.dispose();
 }
});
