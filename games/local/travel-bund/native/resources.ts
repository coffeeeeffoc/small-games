import {useLoader} from '@react-three/fiber';
import {sha256} from './sha256';
import {decodeUtf8} from './utf8';
import {nativeDraco} from './draco';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
let sdk:any, root='assets/',remoteBase='';
const loaded=new Set<string>(),hashes=new Map<string,string>();
export async function loadAssetManifest(){const raw=await sdk.readFile(assetPath('native-assets-manifest.json'),'utf8');const manifest=JSON.parse(raw);for(const item of manifest.files){if(item.delivery==='remote-pinned')hashes.set(item.path,item.sha256);}if(!hashes.size)throw Error('TRAVEL_RESOURCE: pinned GLB hash manifest required');return manifest;}
export function installNativeResources(value:any,assetRoot='assets/',assetBase=''){
 if(typeof value?.readFile!=='function')throw Error('TRAVEL_UNAVAILABLE: native readFile required');
 if(typeof value.createCanvas!=='function')throw Error('TRAVEL_UNAVAILABLE: host Canvas required');
 sdk=value;root=assetRoot.replace(/\/?$/,'/');remoteBase=assetBase;if(remoteBase&&!/^https:\/\//.test(remoteBase))throw Error('TRAVEL_RESOURCE: assetBase must be HTTPS');if(remoteBase&&typeof sdk.readRemoteAsset!=='function')throw Error('TRAVEL_UNAVAILABLE: real remote asset reader required');
}
export function assetPath(value:string){return root+value.replace(/^assets\//,'');}
export async function readAsset(value:string,type='arraybuffer'){
 const relative=value.replace(/^assets\//,'');const remote=remoteBase&&hashes.has(relative);
 const result=remote?await sdk.readRemoteAsset(remoteBase.replace(/\/?$/,'/')+relative,'arraybuffer'):await sdk.readFile(assetPath(value),type);
 if((remote||type==='arraybuffer')&&Object.prototype.toString.call(result)!=='[object ArrayBuffer]')throw Error('TRAVEL_RESOURCE: expected real ArrayBuffer for '+value);
 if(!remote&&type==='utf8'&&typeof result!=='string')throw Error('TRAVEL_RESOURCE: expected UTF8 string for '+value);
 if(remote){const name=value.replace(/^assets\//,''),expected=hashes.get(name);if(!expected||sha256(result as ArrayBuffer)!==expected)throw Error('TRAVEL_RESOURCE: remote asset integrity mismatch '+name);}
 if(remote&&type==='utf8')return decodeUtf8(result as ArrayBuffer);
 return result;
}
export function createTextureCanvas(){const c=sdk?.createCanvas();if(!c?.getContext('2d'))throw Error('TRAVEL_UNAVAILABLE: real offscreen Canvas2D texture support required');return c;}
export function nativeDevEnabled(){return false;}
class NativeGLTFLoader extends GLTFLoader {
 constructor(manager?:any){super(manager);this.setDRACOLoader(nativeDraco as any);}
 load(url:string,onLoad:any,_progress?:any,onError?:any){
  void readAsset(url).then((bytes)=>this.parseAsync(bytes as ArrayBuffer,'')).then(gltf=>{loaded.add(url);onLoad(gltf);},error=>onError?.(error));
 }
}
export function useNativeGLTF(url:string,_decoder?:string){return useLoader(NativeGLTFLoader,url);}
export function nativeAssetLoaded(name:string){return loaded.has('assets/world/'+name+'.glb');}
export function createNativeImage(value:string){
 if(typeof sdk.loadImage==='function')return Promise.resolve(sdk.loadImage(assetPath(value)));
 if(typeof sdk.createImage!=='function')throw Error('TRAVEL_UNAVAILABLE: host images required');
 return new Promise<any>((resolve,reject)=>{const image=sdk.createImage();image.onload=()=>resolve(image);image.onerror=(e:any)=>reject(Error('TRAVEL_RESOURCE: image '+value));image.src=assetPath(value);});
}
export function clearNativeResources(){loaded.clear();sdk=null;}
