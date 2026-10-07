import {build} from 'esbuild';
import {prepareNativeAssets} from './prepare-assets.mjs';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
export async function prepareNativeBuild(outDirectory){
 execFileSync(process.execPath,[fileURLToPath(new URL('./generate-sources.mjs',import.meta.url))],{stdio:'pipe'});
 await mkdir(outDirectory,{recursive:true});
 await rm(join(outDirectory,'assets'),{recursive:true,force:true});
 const assets=await prepareNativeAssets(join(outDirectory,'assets'),{remote:true});
 const sourceEntry=fileURLToPath(new URL('./index.tsx',import.meta.url));
 const built=await build({entryPoints:[sourceEntry],outfile:join(outDirectory,'native-entry.mjs'),bundle:true,format:'esm',platform:'neutral',target:'es2020',jsx:'automatic',conditions:['import','default'],mainFields:['module','main'],define:{'process.env.NODE_ENV':'"production"'},minify:true,metafile:true});
 const entry=join(outDirectory,'native-entry.mjs');await writeFile(join(outDirectory,'bundle-metafile.json'),JSON.stringify(built.metafile,null,2));
 return {entry,sourceEntry,metafile:built.metafile,sourceInputs:Object.keys(built.metafile.inputs),mainPackageBytes:assets.mainPackageAssetBytes+(await readFile(entry)).length+(await readFile(join(outDirectory,'assets/native-assets-manifest.json'))).length,remoteBytes:assets.remoteBytes,assetDirectory:join(outDirectory,'assets'),assetManifest:assets,requires:['genuine-webgl2','genuine-rapier-wasm','native-canvas2d','native-touch','storage','animation-frame'],status:'requires-remote-assets-and-platform-validation'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){console.log(JSON.stringify(await prepareNativeBuild(process.argv[2]||fileURLToPath(new URL('../../../../.scratch/travel-bund-native/',import.meta.url)))));}
