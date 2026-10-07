import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const gameRoot=fileURLToPath(new URL('../',import.meta.url)),repoRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const require=createRequire(new URL('../package.json',import.meta.url));
async function decoderModule(){
 // Explicit fallback uses already-installed lock-pinned package, never downloads.
 let mod;try{mod=require('draco3d');}catch{mod=require(join(repoRoot,'node_modules/.pnpm/draco3d@1.5.7/node_modules/draco3d'));}
 return mod.createDecoderModule({});
}
const arrays={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
export function decodeGlb(source,draco){
 if(source.readUInt32LE(0)!==0x46546c67||source.readUInt32LE(4)!==2)throw Error('Invalid GLB');
 const jsonLen=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLen).toString()),binOffset=20+jsonLen;
 const originalBin=source.subarray(binOffset+8,binOffset+8+source.readUInt32LE(binOffset));
 let length=originalBin.length;const chunks=[originalBin];json.bufferViews||=[];
 function append(array){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const view=json.bufferViews.length;const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;return view;}
 let count=0;
 for(const mesh of json.meshes||[])for(const primitive of mesh.primitives){
  const ext=primitive.extensions?.KHR_draco_mesh_compression;if(!ext)continue;count++;
  const compressed=json.bufferViews[ext.bufferView],bytes=originalBin.subarray(compressed.byteOffset||0,(compressed.byteOffset||0)+compressed.byteLength),decoder=new draco.Decoder(),geometry=new draco.Mesh(),buffer=new draco.DecoderBuffer();buffer.Init(new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),bytes.length);
  const status=decoder.DecodeBufferToMesh(buffer,geometry);if(!status.ok()||!geometry.ptr)throw Error('Draco decode failed: '+status.error_msg());
  for(const [semantic,uniqueId]of Object.entries(ext.attributes)){
   const accessor=json.accessors[primitive.attributes[semantic]],Type=arrays[accessor.componentType];if(!Type)throw Error('Unknown GLB component type');
   const attribute=decoder.GetAttributeByUniqueId(geometry,uniqueId),num=geometry.num_points()*attribute.num_components(),size=num*Type.BYTES_PER_ELEMENT,ptr=draco._malloc(size);
   const dataType={5120:draco.DT_INT8,5121:draco.DT_UINT8,5122:draco.DT_INT16,5123:draco.DT_UINT16,5125:draco.DT_UINT32,5126:draco.DT_FLOAT32}[accessor.componentType];
   if(!decoder.GetAttributeDataArrayForAllPoints(geometry,attribute,dataType,size,ptr))throw Error('Draco attribute decode failed');
   const data=new Type(draco.HEAPF32.buffer,ptr,num).slice();draco._free(ptr);accessor.bufferView=append(data);accessor.byteOffset=0;accessor.count=geometry.num_points();
  }
  if(primitive.indices!==undefined){const accessor=json.accessors[primitive.indices],num=geometry.num_faces()*3,ptr=draco._malloc(num*4);decoder.GetTrianglesUInt32Array(geometry,num*4,ptr);const wide=new Uint32Array(draco.HEAPF32.buffer,ptr,num).slice();draco._free(ptr);const Type=arrays[accessor.componentType];accessor.bufferView=append(new Type(wide));accessor.byteOffset=0;accessor.count=num;}
  draco.destroy(geometry);draco.destroy(buffer);draco.destroy(decoder);delete primitive.extensions.KHR_draco_mesh_compression;if(!Object.keys(primitive.extensions).length)delete primitive.extensions;
 }
 if(!count)return {buffer:source,decodedPrimitives:0};
 for(const key of ['extensionsUsed','extensionsRequired'])if(json[key])json[key]=json[key].filter(x=>x!=='KHR_draco_mesh_compression');
 json.buffers=[{byteLength:length}];const data=Buffer.concat(chunks);const jsonBytes=Buffer.from(JSON.stringify(json)),jpad=(4-jsonBytes.length%4)%4,bpad=(4-data.length%4)%4,total=12+8+jsonBytes.length+jpad+8+data.length+bpad,out=Buffer.alloc(total);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);out.writeUInt32LE(jsonBytes.length+jpad,12);out.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(out,20);out.fill(32,20+jsonBytes.length,20+jsonBytes.length+jpad);const start=20+jsonBytes.length+jpad;out.writeUInt32LE(data.length+bpad,start);out.writeUInt32LE(0x004e4942,start+4);data.copy(out,start+8);return {buffer:out,decodedPrimitives:count};
}
async function files(root){let all=[];for(const f of await readdir(root,{withFileTypes:true})){const path=join(root,f.name);if(f.isDirectory())all.push(...await files(path));else all.push(path);}return all;}
function wav(rate,seconds,sample){const n=Math.floor(rate*seconds),data=Buffer.alloc(44+n*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample(i/rate,i)))*32767),44+i*2);return data;}
export async function prepareNativeAssets(out,options={}){
 const input=join(repoRoot,'assets/bund/runtime'),draco=await decoderModule(),manifest={source:'assets/bund/runtime (pinned assets submodule)',draco:options.decode?'1.5.7 build-time decode (package limit blocked)':'official 1.5.7 pure JS runtime decoder; original compressed assets',files:[]};await mkdir(out,{recursive:true});
 for(const path of await files(input)){
  const name=relative(input,path);if(name.startsWith('draco/'))continue;const target=join(out,name);await mkdir(dirname(target),{recursive:true});let bytes=await readFile(path),decodedPrimitives=0;if(options.decode&&name.endsWith('.glb'))({buffer:bytes,decodedPrimitives}=decodeGlb(bytes,draco));if(!(options.remote&&(name.endsWith('.glb')||name==='world/world.json')))await writeFile(target,bytes);manifest.files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),decodedPrimitives,delivery:options.remote&&(name.endsWith('.glb')||name==='world/world.json')?'remote-pinned':'package'});
 }
 await mkdir(join(out,'licenses'),{recursive:true});await copyFile(join(input,'draco/LICENSE'),join(out,'licenses/Apache-2.0.txt'));await copyFile(join(dirname(require.resolve('react')),'LICENSE'),join(out,'licenses/react-MIT.txt'));await copyFile(join(dirname(require.resolve('three')),'../LICENSE'),join(out,'licenses/three-MIT.txt'));await copyFile(join(gameRoot,'native/LICENSE-NOTICES.md'),join(out,'licenses/NOTICES.md'));
 const physicsPackage=createRequire(require.resolve('@react-three/rapier')).resolve('@dimforge/rapier3d-compat');await mkdir(join(out,'rapier'),{recursive:true});await copyFile(join(dirname(physicsPackage),'rapier_wasm3d_bg.wasm'),join(out,'rapier/rapier.wasm'));
 await mkdir(join(out,'photo-hunts'),{recursive:true});for(const name of ['clock-tower','stone-dome','green-roof','pearl-skyline'])await copyFile(join(gameRoot,'src/assets/photo-hunts',name+'.webp'),join(out,'photo-hunts',name+'.webp'));
 await mkdir(join(out,'audio'),{recursive:true});let seed=1729,smooth=0;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 const audio={wind:wav(22050,4,()=>{smooth=(smooth+noise()*.03)/1.03;return smooth*.4;}),step:wav(22050,.13,t=>Math.sin(2*Math.PI*(90-55*t/.13)*t)*.1*Math.exp(-t*35)),chime:wav(22050,.9,t=>[523.25,659.25,783.99].reduce((sum,f,i)=>{const x=t-i*.08;return sum+(x>=0&&x<.7?Math.sin(2*Math.PI*f*x)*.1*Math.exp(-x*5):0)},0))};
 for(const name of ['drink','pigeon','visitor'])audio[name]=wav(22050,.5,t=>Math.sin(2*Math.PI*(name==='drink'?1600:name==='pigeon'?650:380)*t)*.08*Math.exp(-t*10));
 for(const[name,bytes]of Object.entries(audio))await writeFile(join(out,'audio',name+'.wav'),bytes);
 for(const path of await files(out)){const name=relative(out,path);if(manifest.files.some(f=>f.path===name)||name==='native-assets-manifest.json')continue;const bytes=await readFile(path);manifest.files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 manifest.totalBytes=manifest.files.reduce((n,f)=>n+f.bytes,0);manifest.remoteBytes=manifest.files.filter(f=>f.delivery==='remote-pinned').reduce((n,f)=>n+f.bytes,0);manifest.mainPackageAssetBytes=manifest.totalBytes-manifest.remoteBytes;manifest.assetsSubmoduleSha=execFileSync('git',['rev-parse','HEAD:assets'],{cwd:repoRoot,encoding:'utf8'}).trim();await writeFile(join(out,'native-assets-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const out=process.argv[2]||join(repoRoot,'.scratch/travel-bund-native/assets');console.log(JSON.stringify({out,...await prepareNativeAssets(out)}));}
