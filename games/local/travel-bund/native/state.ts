import {input,clearInput,readVisits,destinations,stories,type WorldData,type V3} from '../src/world';
import {readSettings,SETTINGS_KEY} from '../src/settings';
import {RENDER_DETAIL_KEY,isRenderDetail,type RenderDetail} from '../src/render-settings';
import {explorationRoutes,routeProgress,type RouteId} from '../src/routes';
import {photoHunts,readPhotoHuntSave,isPhotoHuntUnlocked,settlePhotoHunt,photoHuntTarget,PHOTO_HUNT_SAVE_KEY,type PhotoPose} from '../src/photo-hunts';
import {setAudio,audioActivity,chime,lifeSound} from './audio';
import type {LifeEvent,LifeTarget} from '../src/life';
export function createNativeState(sdk:any,data:WorldData,config:any={}){
 const read=(key:string)=>{try{const value=sdk.getStorageSync(key);return typeof value==='string'?value:JSON.stringify(value??null);}catch{return null;}};
 const settings=readSettings(read(SETTINGS_KEY),true);
 const storedDetail=read(RENDER_DETAIL_KEY)?.replace(/^"|"$/g,'');
 const state={page:'home',ready:false,active:false,night:settings.night,sound:settings.sound,quality:settings.quality,renderDetail:(isRenderDetail(storedDetail)?storedDetail:'light') as RenderDetail,crowd:settings.crowd,motion:settings.motion,sensitivity:settings.sensitivity,zoom:1,
  data,teleport:{...destinations[0],pitch:0,serial:0},stats:{position:[...destinations[0].position] as V3,yaw:destinations[0].yaw,pitch:0,speed:0,grounded:false,fps:0,calls:0,triangles:0},lifeTarget:null as LifeTarget|null,lifeEvent:null as LifeEvent|null,
  visits:readVisits(read('travel-bund.visits.v1')),moments:readVisits(read('travel-bund.moments.v1')),huntSave:readPhotoHuntSave(read(PHOTO_HUNT_SAVE_KEY)),huntId:null as string|null,previewId:photoHunts[0].id,selectedRoute:null as RouteId|null,story:null as WorldData['landmarks'][number]|null,notice:'',photo:null as any,reference:null as any,photoRead:null as ((target?:V3)=>PhotoPose)|null,
  audioAvailable:typeof sdk.createInnerAudioContext==='function',shareAvailable:!!config.shareEnabled&&typeof sdk.shareAppMessage==='function'};
 let changed=()=>{},cancelTouches=()=>{};
 const save=(key:string,value:any)=>{try{sdk.setStorageSync(key,typeof value==='string'?value:JSON.stringify(value));return true;}catch{state.notice='已保留本次进度，宿主暂不能存档。';return false;}};
 const notify=(message:string)=>{state.notice=message;changed();};
 function page(value:string){cancelTouches();clearInput();state.page=value;state.active=value==='playing'&&state.ready;input.active=state.active;audioActivity(state.active);changed();}
 function persistSettings(){save(SETTINGS_KEY,{night:state.night,sound:state.sound,quality:state.quality,sensitivity:state.sensitivity,crowd:state.crowd,motion:state.motion});save(RENDER_DETAIL_KEY,state.renderDetail);}
 function keepMoment(id:string){state.moments=[...new Set([...state.moments,id])];save('travel-bund.moments.v1',state.moments);}
 const api={state,bind(onChange:()=>void,onCancel:()=>void){changed=onChange;cancelTouches=onCancel;},page,notify,
  onReady:()=>{state.ready=true;if(state.page==='playing')state.active=input.active=true;changed();},
  onTelemetry:(value:any)=>{state.stats=value;changed();},onPhotoView:(read:any)=>{state.photoRead=read;},onLifeTarget:(target:LifeTarget|null)=>{state.lifeTarget=target;changed();},
  start(){if(!state.ready)return notify('真实城市和物理正在加载，请稍候。');page('playing');},
  home(){input.sitting=false;state.huntId=null;page('home');},pause(){page('pause');},
  travel(index:number,yaw?:number,pitch?:number){const d=destinations[index];if(!d)return;input.sitting=false;state.teleport={...d,yaw:yaw??d.yaw,pitch:pitch??[0,.3,.35,0,1.05][index],serial:state.teleport.serial+1};api.start();notify('已到达 '+d.name);},
  chooseRoute(id:RouteId){const progress=routeProgress(id,state.visits);if(!progress)return;state.huntId=null;state.selectedRoute=id;const stop=progress.next||progress.route.stops[0],landing=destinations[stop.destination],landmark=data.landmarks.find(l=>l.id===stop.landmark);api.travel(stop.destination,landmark?Math.atan2(landing.position[0]-landmark.position[0],landing.position[2]-landmark.position[2]):landing.yaw,landmark?Math.min(1.1,Math.atan2(stop.viewHeight,Math.hypot(landing.position[0]-landmark.position[0],landing.position[2]-landmark.position[2]))):0);},
  previewHunt(id:string){if(!isPhotoHuntUnlocked(state.huntSave,id))return;state.previewId=id;page('hunt-preview');},
  startHunt(id=state.previewId){const hunt=photoHunts.find(h=>h.id===id);if(!hunt||!isPhotoHuntUnlocked(state.huntSave,id))return;state.huntId=id;state.selectedRoute=null;input.sitting=false;state.teleport={...hunt.start,serial:state.teleport.serial+1};api.start();notify(hunt.clue);},
  settlePhoto(photo:any){state.photo=photo;const hunt=photoHunts.find(h=>h.id===state.huntId);if(hunt&&state.active){const pose=state.photoRead?.(photoHuntTarget(hunt,data)??undefined);if(!pose)return notify('真实镜头还未准备好。');const result=settlePhotoHunt(state.huntSave,hunt.id,pose,data);if(!result.ok)return notify(result.reason);state.huntSave=result.save;save(PHOTO_HUNT_SAVE_KEY,state.huntSave);chime();page('hunt-result');}else{chime();notify('已拍照，可在手记查看本次照片。');}},
  interact(){if(input.sitting){input.sitting=false;return notify('起身，继续走走。');}const p=state.stats.position,bench=data.benches.find(b=>Math.hypot(p[0]-b.position[0],p[2]-b.position[2])<4);if(bench){input.sitting=true;return notify('坐一会儿，听听江风。');}const landmark=[...data.landmarks].sort((a,b)=>Math.hypot(p[0]-a.position[0],p[2]-a.position[2])-Math.hypot(p[0]-b.position[0],p[2]-b.position[2]))[0];if(landmark&&Math.hypot(p[0]-landmark.position[0],p[2]-landmark.position[2])<140){state.story=landmark;page('story');}else notify('走近地标或长椅，可以发现更多。');},
  collect(){if(!state.story)return;state.visits=[...new Set([...state.visits,state.story.id])];save('travel-bund.visits.v1',state.visits);chime();const progress=routeProgress(state.selectedRoute,state.visits);notify(progress&&!progress.next?'路线三处打卡完成。':'这一处风景，已收入手记。');},
  meet(){const target=state.lifeTarget;if(!target||!state.active)return;state.lifeEvent={id:target.id,kind:target.kind,serial:(state.lifeEvent?.serial||0)+1};if(target.kind==='kiosk')page('stall');else{keepMoment(target.kind);lifeSound(target.kind);notify(target.kind==='visitor'?'你好呀！今天的江风很舒服。':'扑棱棱，小鸽子绕了一圈又落回江边。');}},
  drink(){keepMoment('drink');lifeSound('drink');page('playing');notify('一杯江边清凉，已收入生活手记。');},
  postcard(){keepMoment('postcard');page('playing');notify('明信片已收入手记，按拍照留住眼前真实风景。');},
  toggle(key:'night'|'sound'|'crowd'|'motion'){state[key]=!state[key];if(key==='sound'){if(!state.audioAvailable){state.sound=false;notify('宿主音频不可用，当前静音。');}setAudio(state.sound);}persistSettings();changed();},
  detail(value:RenderDetail){if(isRenderDetail(value)){state.renderDetail=value;persistSettings();changed();}},quality(value:number){if([0,1,2].includes(value)){state.quality=value;persistSettings();changed();}},sensitivity(value:number){state.sensitivity=Math.max(.4,Math.min(2,value));input.sensitivity=state.sensitivity;persistSettings();changed();},
  share(){if(!state.shareAvailable)return notify('平台分享未配置。');const query=state.selectedRoute?'route='+state.selectedRoute:'';try{sdk.shareAppMessage({title:'一起去外滩漫游',query});notify('已打开平台分享入口，分享结果由宿主决定。');}catch{notify('宿主暂不能打开分享。');}},
  progress:()=>routeProgress(state.selectedRoute,state.visits),stories,photoHunts,explorationRoutes,
  dispose(){cancelTouches();clearInput();input.active=false;audioActivity(false);persistSettings();changed=()=>{};}}
 input.sensitivity=state.sensitivity;setAudio(state.sound&&state.audioAvailable);return api;
}
