import './utf8';
import React,{Suspense} from 'react';
import * as THREE from 'three';
import {createRoot,extend,advance,useFrame} from '@react-three/fiber';
import {Scene} from './generated/Scene';
import * as Rapier from './generated/rapier.mjs';
import {installNativeResources,loadAssetManifest,readAsset,clearNativeResources,createTextureCanvas} from './resources';
import {installNativeWasm} from './wasm';
import {installAudio,disposeAudio} from './audio';
import {createNativeState} from './state';
import {createHud} from './hud';
import {attachNativeInput} from './input';
import {DEFAULT_FOV} from '../src/camera-controls';
import {input,type WorldData} from '../src/world';
class NativeSceneBoundary extends React.Component<any,{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(error:Error){this.props.onError(error);}render(){return this.state.failed?null:this.props.children;}}
let current=false;
/** Real original Scene/Rapier on the host WebGL2 Canvas, no DOM/browser entry. */
export async function startNativeTravelBundGame(sdk:any,config:any={}){
 if(current)throw Error('TRAVEL_UNAVAILABLE: only one native city session may run at a time');
 for(const name of ['createCanvas','getSystemInfoSync','readFile','instantiateWasm','getStorageSync','setStorageSync','onHide','onShow','offHide','offShow'])if(typeof sdk?.[name]!=='function')throw Error('TRAVEL_UNAVAILABLE: host '+name+' required');
 if(typeof sdk.createImage!=='function'&&typeof sdk.loadImage!=='function')throw Error('TRAVEL_UNAVAILABLE: genuine native image decoder required');
 current=true;let root:any,hud:any,touch:any,api:any,renderer:any,frameId:any,disposed=false,last=0,visible=true;const cleanup:Function[]=[];
 try{
  installNativeResources(sdk,config.assetRoot||'assets/',config.assetBase||'');installNativeWasm(sdk,(config.assetRoot||'assets/').replace(/\/?$/,'/')+'rapier/rapier.wasm');installAudio(sdk);
  // Initialization executes real package WASM. No native/mock physics fallback.
  await loadAssetManifest();
  await Rapier.init();
  const data=JSON.parse(await readAsset('world/world.json','utf8') as string) as WorldData;
  if(!Array.isArray(data.tiles)||!Array.isArray(data.landmarks)||!Array.isArray(data.colliders))throw Error('TRAVEL_RESOURCE: invalid world data');
  const canvas=sdk.createCanvas();const context=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,preserveDrawingBuffer:true});
  if(!context||typeof context.createVertexArray!=='function')throw Error('TRAVEL_UNAVAILABLE: Three 0.180 requires a genuine WebGL2 context');
  // Native canvas emits the genuine platform context events when provided.
  // Three's listener contract is attached to an adapter object; no DOM is created.
  const listeners=new Map<string,Set<Function>>();
  const renderCanvas=new Proxy(canvas,{get(target,key){if(key==='addEventListener')return (name:string,fn:Function)=>{if(typeof target.addEventListener==='function')target.addEventListener(name,fn);else{let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(fn);}};if(key==='removeEventListener')return (name:string,fn:Function)=>{if(typeof target.removeEventListener==='function')target.removeEventListener(name,fn);else listeners.get(name)?.delete(fn);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){return Reflect.set(target,key,value,target);}});
  renderer=new THREE.WebGLRenderer({canvas:renderCanvas,context,antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const camera=new THREE.PerspectiveCamera(DEFAULT_FOV,1,.25,12000);camera.position.set(-393,2.6,37);(camera as any).manual=true;
  api=createNativeState(sdk,data,config);let resolveReady:(value:any)=>void=()=>{},rejectReady:(error:any)=>void=()=>{};const whenReady=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});const readyHandler=api.onReady;api.onReady=()=>{readyHandler();resolveReady(true);};let world:any,worldCamera:any;const rotation=new THREE.Matrix4(),projection=new THREE.Matrix4(),inverse=new THREE.Matrix4();
  function renderWorld(){if(!world||!worldCamera)return;projection.copy(worldCamera.projectionMatrix);inverse.copy(worldCamera.projectionMatrixInverse);if(hud.dimensions.rotated){rotation.makeRotationZ(-Math.PI/2);worldCamera.projectionMatrix.premultiply(rotation);worldCamera.projectionMatrixInverse.copy(worldCamera.projectionMatrix).invert();}renderer.autoClear=true;renderer.render(world,worldCamera);worldCamera.projectionMatrix.copy(projection);worldCamera.projectionMatrixInverse.copy(inverse);}
  function capture(){if(!api.state.ready)return api.notify('真实场景尚未准备好。');try{renderWorld();const {physicalWidth:w,physicalHeight:h,rotated}=hud.dimensions;const width=canvas.width,height=canvas.height,pixels=new Uint8Array(width*height*4);context.readPixels(0,0,width,height,context.RGBA,context.UNSIGNED_BYTE,pixels);const output=createTextureCanvas();output.width=width;output.height=height;const ctx=output.getContext('2d'),image=ctx.createImageData(width,height);for(let row=0;row<height;row++)image.data.set(pixels.subarray((height-1-row)*width*4,(height-row)*width*4),row*width*4);ctx.putImageData(image,0,0);let photo=output;if(rotated){photo=createTextureCanvas();photo.width=height;photo.height=width;const p=photo.getContext('2d');p.translate(0,width);p.rotate(-Math.PI/2);p.drawImage(output,0,0);}api.settlePhoto(photo);hud.render();}catch(error){api.notify('真实画面拍照失败：'+(error as Error).message);}}
  function exportPhoto(){const photo=api.state.photo;if(!photo)return;if(typeof photo.toTempFilePath!=='function'||typeof sdk.saveImageToPhotosAlbum!=='function')return api.notify('宿主未提供相册保存，照片保留在本次手记。');photo.toTempFilePath({success:(result:any)=>sdk.saveImageToPhotosAlbum({filePath:result.tempFilePath,success:()=>api.notify('照片已保存到相册。'),fail:()=>api.notify('相册保存未完成，照片仍在本次手记。')}),fail:()=>api.notify('宿主照片导出不可用。')});}
  hud=createHud(api,sdk,capture,exportPhoto);touch=attachNativeInput(sdk,hud,api);api.bind(()=>{hud.render();renderScene();},touch.clear);hud.onImagesReady(()=>hud.render());
  extend(THREE);root=createRoot(renderCanvas);
  function Composite(){useFrame((state)=>{world=state.scene;worldCamera=state.camera;renderWorld();renderer.autoClear=false;renderer.clearDepth();renderer.render(hud.scene,hud.camera);},1);return null;}
  const sceneFailed=(error:Error)=>{rejectReady(error);api.state.notice='真实城市加载失败：'+error.message;api.pause();};
  function renderScene(){if(!root||disposed)return;const s=api.state;root.render(<><NativeSceneBoundary onError={sceneFailed}><Suspense fallback={null}><Scene data={data} night={s.night} active={s.active} ready={s.ready} teleport={s.teleport} onReady={api.onReady} onTelemetry={api.onTelemetry} onPhotoView={api.onPhotoView} quality={s.quality} renderDetail={s.renderDetail} crowd={s.crowd} motion={s.motion} zoom={s.zoom} lifeEvent={s.lifeEvent} onLifeTarget={api.onLifeTarget}/></Suspense></NativeSceneBoundary><Composite/></>);}
  async function resize(){touch.clear();const info=sdk.getSystemInfoSync();if(!(info.windowWidth>0&&info.windowHeight>0))throw Error('TRAVEL_UNAVAILABLE: invalid native viewport');hud.resize(info);renderer.setPixelRatio(api.state.quality===0?.85:Math.min(info.pixelRatio||1,api.state.quality===1?1.25:2));renderer.setSize(info.windowWidth,info.windowHeight,false);camera.aspect=hud.dimensions.width/hud.dimensions.height;camera.updateProjectionMatrix();await root.configure({gl:renderer,camera,frameloop:'never',shadows:true,dpr:renderer.getPixelRatio(),size:{width:info.windowWidth,height:info.windowHeight,top:0,left:0}});renderScene();}
  await resize();
  const hide=()=>{visible=false;touch.clear();api.pause();last=0;},show=()=>{visible=true;last=0;void resize().catch((e:any)=>api.notify(e.message));};sdk.onHide(hide);sdk.onShow(show);cleanup.push(()=>sdk.offHide(hide),()=>sdk.offShow(show));
  if(typeof sdk.onWindowResize==='function'){const onResize=()=>void resize();sdk.onWindowResize(onResize);cleanup.push(()=>sdk.offWindowResize?.(onResize));}
  const request=canvas.requestAnimationFrame?.bind(canvas)||globalThis.requestAnimationFrame?.bind(globalThis),cancel=canvas.cancelAnimationFrame?.bind(canvas)||globalThis.cancelAnimationFrame?.bind(globalThis);if(!request)throw Error('TRAVEL_UNAVAILABLE: real host animation frames required');
  function frame(now:number){if(disposed)return;if(visible){const step=last?Math.min(.05,Math.max(0,(now-last)/1000)):0;last=now;clock+=step;advance(clock,true);if(input.active&&api.state.zoom!==zoom){zoom=api.state.zoom;renderScene();}}frameId=request(frame);}let clock=0,zoom=api.state.zoom;frameId=request(frame);
  const result={canvas,whenReady,ready:()=>api.state.ready,dispose(){if(disposed)return;disposed=true;cancel?.(frameId);touch.dispose();api.dispose();for(const fn of cleanup)fn();root.unmount();hud.dispose();renderer.dispose();disposeAudio();clearNativeResources();current=false;},snapshot(){return {page:api.state.page,ready:api.state.ready,stats:api.state.stats,visits:[...api.state.visits],photoHunts:[...api.state.huntSave.completed],huntId:api.state.huntId,inputs:touch.snapshot(),dimensions:hud.dimensions,buttons:hud.hits.map(({id,x,y,w,h,disabled}:any)=>({id,x,y,w,h,disabled})),source:'original Scene / real Three WebGL2 / real Rapier WASM',platform:config.platform};}};
  return result;
 }catch(error){disposed=true;try{touch?.dispose();api?.dispose();for(const fn of cleanup)fn();root?.unmount();hud?.dispose();renderer?.dispose();disposeAudio();clearNativeResources();}finally{current=false;}throw error;}
}
