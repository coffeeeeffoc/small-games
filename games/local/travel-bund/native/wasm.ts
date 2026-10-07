let instantiate: ((path: string, imports: WebAssembly.Imports)=>Promise<{instance:WebAssembly.Instance;module?:WebAssembly.Module}>) | null=null;
let path='assets/rapier/rapier.wasm';
export function installNativeWasm(sdk:any,assetPath:string){
 if(typeof sdk.instantiateWasm!=='function')throw Error('TRAVEL_UNAVAILABLE: real host WASM instantiate is required');
 instantiate=sdk.instantiateWasm.bind(sdk);path=assetPath;
}
export const nativeWasm={
 async instantiate(_bytes:unknown,imports:WebAssembly.Imports){
  if(!instantiate)throw Error('TRAVEL_UNAVAILABLE: native WASM bridge not installed');
  const result=await instantiate(path,imports);
  if(!result?.instance?.exports)throw Error('TRAVEL_UNAVAILABLE: host did not instantiate Rapier WASM');
  return result;
 }
};
