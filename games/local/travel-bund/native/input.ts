import {input,clearInput} from '../src/world';
export function attachNativeInput(sdk:any,hud:any,api:any){
 const fingers=new Map<number,any>();let joystick:number|null=null,pinch:[number,number]|null=null,pinchDistance=0,pinchZoom=1;
 const inside=(p:any,b:any)=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;
 function clear(){fingers.clear();joystick=null;pinch=null;clearInput();}
 function sceneFingers(){return [...fingers].filter(([,f])=>f.kind==='scene');}
 function beginPinch(){const scene=sceneFingers();if(scene.length===2&&!pinch){pinch=[scene[0][0],scene[1][0]];pinchDistance=Math.hypot(scene[0][1].x-scene[1][1].x,scene[0][1].y-scene[1][1].y);pinchZoom=api.state.zoom;input.look=[0,0];}}
 function start(event:any){for(const t of event.changedTouches||event.touches||[]){const p=hud.point(t);if(fingers.has(p.id))continue;const hit=[...hud.hits].reverse().find((h:any)=>!h.disabled&&inside(p,h));if(hit){if(hit.id==='joystick'&&api.state.active&&joystick===null){joystick=p.id;fingers.set(p.id,{...p,kind:'stick',center:[hit.x+hit.w/2,hit.y+hit.h/2]});}else fingers.set(p.id,{...p,kind:'button',hit,cancelled:false});}else if(api.state.active){fingers.set(p.id,{...p,kind:sceneFingers().length>=2?'extra':'scene',idle:false});beginPinch();}else fingers.set(p.id,{...p,kind:'scroll',cancelled:false});}}
 function move(event:any){for(const t of event.changedTouches||event.touches||[]){const p=hud.point(t),f=fingers.get(p.id);if(!f)continue;const dx=p.x-f.x,dy=p.y-f.y;
  if(f.kind==='stick'){input.stick=[Math.max(-1,Math.min(1,(p.x-f.center[0])/42)),Math.max(-1,Math.min(1,(p.y-f.center[1])/42))];}
  else if(f.kind==='button'){if(!inside(p,f.hit))f.cancelled=true;if(!api.state.active&&Math.abs(dy)>3){f.cancelled=true;hud.scroll(dy);}}
  else if(f.kind==='scroll')hud.scroll(dy);
  else if(f.kind==='scene'&&api.state.active){if(pinch){f.x=p.x;f.y=p.y;const a=fingers.get(pinch[0]),b=fingers.get(pinch[1]);if(a&&b&&pinchDistance>2){api.state.zoom=Math.max(1,Math.min(3,pinchZoom*Math.hypot(a.x-b.x,a.y-b.y)/pinchDistance));}}else if(!f.idle&&sceneFingers()[0]?.[0]===p.id){input.look[0]+=dx;input.look[1]+=dy;}}
  f.x=p.x;f.y=p.y;hud.render();
 }}
 function end(event:any,cancelled=false){for(const t of event.changedTouches||[]){const p=hud.point(t),f=fingers.get(p.id);fingers.delete(p.id);if(joystick===p.id){joystick=null;input.stick=[0,0];}if(pinch?.includes(p.id)){pinch=null;input.look=[0,0];for(const[,contact]of sceneFingers())contact.idle=true;}
  if(!cancelled&&f?.kind==='button'&&!f.cancelled&&inside(p,f.hit))f.hit.run();
 }}
 const cancel=(e:any)=>end(e,true),handlers={TouchStart:start,TouchMove:move,TouchEnd:end,TouchCancel:cancel};
 for(const[name,fn]of Object.entries(handlers)){if(typeof sdk['on'+name]!=='function'||typeof sdk['off'+name]!=='function')throw Error('TRAVEL_UNAVAILABLE: native '+name+' lifecycle required');sdk['on'+name](fn);}
 return {clear,dispose(){clear();for(const[name,fn]of Object.entries(handlers))sdk['off'+name](fn);},snapshot:()=>({touches:fingers.size,joystick,pinch,stick:[...input.stick],look:[...input.look]})};
}
