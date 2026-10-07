const cache=new Map<Function,{status:string;value?:any;error?:any;promise:Promise<any>}>();
/** React suspense promise boundary, preserving real async resource initialization. */
export function suspend(load:()=>Promise<any>,_keys:any[]){let item=cache.get(load);if(!item){item={status:'pending',promise:Promise.resolve().then(load)};cache.set(load,item);item.promise.then(value=>{item!.status='ready';item!.value=value;},error=>{item!.status='error';item!.error=error;});}if(item.status==='error')throw item.error;if(item.status==='ready')return item.value;throw item.promise;}
