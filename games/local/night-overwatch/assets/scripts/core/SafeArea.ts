export type Insets = { left:number; right:number; top:number; bottom:number };
export type CapsuleRect = { left:number; right:number; top:number; bottom:number };
export function nativeHosts(root: any = globalThis): any[] { return [root.tap,root.wx,root.bl,root.tt,root.my].filter(Boolean); }
/** Host values are CSS/window coordinates, never device pixels. */
export function safeArea(width:number,height:number,baseline:Insets,hosts=nativeHosts()) {
  const result:{left:number;right:number;top:number;bottom:number;capsule:boolean;capsuleRect?:CapsuleRect}={...baseline,capsule:false};
  const valid=(n:unknown,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
  // Hosts hide the status bar in landscape but keep reporting its nominal height (some echo it as safeArea.top);
  // a Redmi K90 reports 58px, leaving an empty band above every header. Real top cutouts still arrive via `baseline`.
  // ponytail: assumes no host shows the bar in landscape; gate on a host visibility flag if one ever does.
  const hostTop=height>=width;
  for(const sdk of hosts)try {
    const get=sdk.getWindowInfo||sdk.getWindowInfoSync||sdk.getSystemInfoSync;
    const info=get?.call(sdk);
    if(!info||info.windowWidth!==width||info.windowHeight!==height)continue;
    const area=info.safeArea;
    if(area&&valid(area.top,height)&&valid(area.bottom,height)&&valid(area.left,width)&&valid(area.right,width)&&area.bottom>=area.top&&area.right>=area.left){
      if(hostTop)result.top=Math.max(result.top,area.top);result.bottom=Math.max(result.bottom,height-area.bottom);
      result.left=Math.max(result.left,area.left);result.right=Math.max(result.right,width-area.right);
    }
    if(hostTop&&valid(info.statusBarHeight,height))result.top=Math.max(result.top,info.statusBarHeight);
    const capsule=sdk.getMenuButtonBoundingClientRect?.call(sdk);
    if(capsule&&valid(capsule.top,height)&&valid(capsule.bottom,height)&&capsule.bottom>capsule.top){
      result.capsule=true;
      if(valid(capsule.left,width)&&valid(capsule.right,width)&&capsule.right>capsule.left)
        result.capsuleRect={left:capsule.left,right:capsule.right,top:capsule.top,bottom:capsule.bottom};
      else result.top=Math.max(result.top,capsule.bottom);
    }
  }catch { /* Unavailable native APIs retain engine safe area. */ }
  return result;
}
/** Unmerged host readings for the developer snapshot, to tell which source moved an inset on a real device. */
export function safeAreaSources(hosts=nativeHosts()) {
  return hosts.map(sdk=>{try{
    const info=(sdk.getWindowInfo||sdk.getWindowInfoSync||sdk.getSystemInfoSync)?.call(sdk)||{};
    return {windowWidth:info.windowWidth,windowHeight:info.windowHeight,pixelRatio:info.pixelRatio,statusBarHeight:info.statusBarHeight,safeArea:info.safeArea,capsule:sdk.getMenuButtonBoundingClientRect?.call(sdk)};
  }catch(error){return {error:String(error)};}});
}
export function watchSafeArea(changed:()=>void,hosts=nativeHosts()) {
  const attached:any[]=[];
  for(const sdk of hosts)try{if(sdk.onWindowResize){sdk.onWindowResize.call(sdk,changed);attached.push(sdk);}}catch{}
  if(typeof window!=='undefined')for(const event of ['resize','orientationchange','pageshow','focus'])window.addEventListener?.(event,changed);
  if(typeof window!=='undefined')window.visualViewport?.addEventListener('resize',changed);
  return ()=>{for(const sdk of attached)try{sdk.offWindowResize?.call(sdk,changed);}catch{};if(typeof window!=='undefined'){for(const event of ['resize','orientationchange','pageshow','focus'])window.removeEventListener?.(event,changed);window.visualViewport?.removeEventListener('resize',changed);}};
}
/** Whole code points and a visible ellipsis, without font shrink or wrapping. */
export function fitName(name:string,width:number,font:number,measure=(s:string)=>Array.from(s).length*font) {
  const chars=Array.from(name);
  if(measure(name)<=width)return name;
  while(chars.length&&measure(chars.join('')+'…')>width)chars.pop();
  return chars.join('')+'…';
}
