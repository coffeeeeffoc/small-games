import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),out=new URL('./generated/',import.meta.url),require=createRequire(new URL('../package.json',import.meta.url));
await mkdir(out,{recursive:true});
const sources={};
for(const name of ['Scene.tsx','StreetLife.tsx','clouds.ts']){
 let s=await readFile(new URL('src/'+name,root),'utf8');
 s=s.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,id)=>`from '${['StreetLife','clouds'].includes(id)?'./'+id:'../../src/'+id}'`);
 s=s.replace(/import \{ useGLTF \} from '@react-three\/drei';/g,"import { useNativeGLTF as useGLTF } from '../resources';");
 s=s.replace(/from '@react-three\/rapier'/g,"from './react-three-rapier.mjs'");
 s=s.replace(/from '\.\.\/\.\.\/src\/audio'/g,"from '../audio'");
 s=s.replace(/from '\.\.\/\.\.\/src\/debug-snapshots'/g,"from '../diagnostics'");
 s=s.replaceAll('import.meta.env.BASE_URL',"'assets/'");
 s=s.replaceAll("document.createElement('canvas')",'createTextureCanvas()');
 s=s.replaceAll('window.SmallGamesDev.isEnabled()','nativeDevEnabled()');
 s=`// Generated from original ${name}; only platform boundaries replaced.\nimport {createTextureCanvas,nativeDevEnabled} from '../resources';\n`+s;
 if(name==='Scene.tsx'){
  // Export Scene exactly; omit the browser-only Tour/Canvas wrapper.
  const marker='// The homepage and tour share one runtime and viewpoint;';
  if(!s.includes(marker))throw Error('Scene wrapper marker changed');s=s.slice(0,s.indexOf(marker));
  s=s.replace('{ Canvas, useFrame, useThree }','{ useFrame, useThree }');
 }
 sources[name]=s;
}
const reactRapier=require.resolve('@react-three/rapier');
const rapierPackage=createRequire(reactRapier).resolve('@dimforge/rapier3d-compat');
let rp=await readFile(new URL('./rapier.mjs','file://'+dirname(rapierPackage)+'/'),'utf8');
let removed=0;rp=rp.replace(/"[A-Za-z0-9+/=]{100000,}"/g,()=>{removed++;return '""';});
if(removed!==1)throw Error('Rapier inline WASM shape changed; must inspect before transforming');
rp=rp.replaceAll('WebAssembly.instantiateStreaming','nativeWasm.instantiateStreaming').replaceAll('WebAssembly.instantiate','nativeWasm.instantiate');
rp=rp.replace(/([A-Za-z]+) instanceof WebAssembly\.Instance/g,'($1 && $1.exports && !$1.instance)');
if(rp.includes('WebAssembly.'))throw Error('Unreviewed Rapier WebAssembly API');
sources['rapier.mjs']="// Rapier 0.19.2 Apache-2.0; original JS binding, packaged real WASM via SDK.\nimport '../utf8';\nimport {nativeWasm} from '../wasm';\n"+rp;
let rr=await readFile(new URL('./react-three-rapier.esm.js','file://'+dirname(reactRapier)+'/'),'utf8');
rr=rr.replaceAll("'@dimforge/rapier3d-compat'","'./rapier.mjs'");rr=rr.replace("from 'suspend-react'","from '../suspend'").replace("from 'three-stdlib'","from 'three/addons/utils/BufferGeometryUtils.js'");sources['react-three-rapier.mjs']='// Generated from @react-three/rapier 2.2.0 (MIT), original reconciler/physics.\n'+rr;
let draco=await readFile(new URL('../../../assets/bund/runtime/draco/draco_decoder.js',root),'utf8');
const footer="if (typeof exports === 'object' && typeof module === 'object')";
if(!draco.includes(footer))throw Error('Draco JS export changed');draco=draco.slice(0,draco.indexOf(footer));
draco=draco.replace('typeof window=="object"','false').replace('typeof importScripts=="function"','false').replace('typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"','false').replace('require("fs")','null').replace('require("path")','null');
sources['draco-decoder.mjs']='// Official Draco decoder, Apache-2.0. Pure JS (asm.js), no Worker/eval.\n'+draco+'\nexport default DracoDecoderModule;\n';
for(const [name,s] of Object.entries(sources)){
 const p=new URL(name,out);if(process.argv.includes('--check')){if(await readFile(p,'utf8')!==s)throw Error(`Stale native source ${name}`);}else await writeFile(p,s);
}
console.log(JSON.stringify({generated:Object.keys(sources),rapierWasm:fileURLToPath(new URL('./rapier_wasm3d_bg.wasm','file://'+dirname(rapierPackage)+'/'))}));
