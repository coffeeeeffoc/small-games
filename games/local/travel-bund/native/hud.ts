import * as THREE from 'three';
import {destinations,input} from '../src/world';
import {isPhotoHuntUnlocked} from '../src/photo-hunts';
import {createTextureCanvas,createNativeImage} from './resources';
export type Hit={id:string;x:number;y:number;w:number;h:number;run:()=>void;disabled?:boolean};
export function createHud(api:any,sdk:any,onCapture:()=>void,onExport:()=>void){
 const canvas=createTextureCanvas(),ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;scene.add(mesh);
 let width=844,height=390,physicalWidth=844,physicalHeight=390,rotated=false,scale=1,hits:Hit[]=[],scroll=0,scrollMax=0,contentMax=0,page='',safe={left:12,right:12,top:12,bottom:12};const references=new Map<string,any>();let readyImage=()=>{};
 const ink='#234950',paper='#f6edda',coral='#e37960',green='#527b77';
 function round(x:number,y:number,w:number,h:number,color:string,r=12){ctx.fillStyle=color;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fill();}
 function text(value:string,x:number,y:number,size=18,color=ink,align='left'){ctx.font=`${size>=23?'bold ':''}${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);}
 function wrap(value:string,x:number,y:number,w:number,size=16,maxLines=4){ctx.font=`${size}px sans-serif`;let line='',row=0;for(const ch of value){if(ctx.measureText(line+ch).width>w&&line){text(line,x,y+row*(size+8),size);line='';row++;if(row>=maxLines)return;}line+=ch;}text(line,x,y+row*(size+8),size);}
 function button(id:string,title:string,x:number,y:number,w:number,h:number,run:()=>void,disabled=false){
  const sy=y-(api.state.page==='playing'?0:scroll);contentMax=Math.max(contentMax,y+h);if(api.state.page==='playing'||(sy>=safe.top+62&&sy+h<=height-safe.bottom-56))hits.push({id,x,y:sy,w,h,run,disabled});
  round(x,y,w,h,disabled?'#d9d6c9':coral,10);text(title,x+w/2,y+h/2,Math.min(18,w/Math.max(4,title.length)),disabled?'#8b8e81':'#fff8ed','center');
 }
 function fixedButton(id:string,title:string,x:number,y:number,w:number,h:number,run:()=>void){hits.push({id,x,y,w,h,run});round(x,y,w,h,paper);text(title,x+w/2,y+h/2,17,ink,'center');}
 function panelStart(title:string){round(safe.left,safe.top,api.state.page==='home'?(width-safe.left-safe.right)*.46:width-safe.left-safe.right,height-safe.top-safe.bottom,paper);text(title,api.state.page==='home'?safe.left+(width-safe.left-safe.right)*.23:width/2,safe.top+30,api.state.page==='home'?21:27,ink,'center');ctx.save();ctx.beginPath();ctx.rect(safe.left+12,safe.top+62,width-safe.left-safe.right-24,height-safe.top-safe.bottom-122);ctx.clip();ctx.translate(0,-scroll);contentMax=0;}
 function panelEnd(){ctx.restore();scrollMax=Math.max(0,contentMax-(height-safe.bottom-68));scroll=Math.min(scroll,scrollMax);fixedButton('back',api.state.page==='home'?'帮助 / 学习':'返回',safe.left+14,height-safe.bottom-52,110,44,()=>api.state.page==='home'?api.page('help'):api.page(api.state.ready?'playing':'home'));}
 function loadReference(hunt:any){if(references.has(hunt.id))return;references.set(hunt.id,null);void createNativeImage(hunt.referenceImage).then(img=>{references.set(hunt.id,img);readyImage();},()=>{references.set(hunt.id,false);readyImage();});}
 function render(){
  const s=api.state;if(page!==s.page){page=s.page;scroll=0;}ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,width,height);hits=[];contentMax=0;
  if(s.page==='playing'){
   fixedButton('home','返回',safe.left,safe.top,70,44,()=>api.home());fixedButton('map','地图',width-safe.right-116,safe.top,62,44,()=>api.page('map'));fixedButton('pause','',width-safe.right-48,safe.top,48,44,()=>api.pause());ctx.fillStyle=ink;ctx.fillRect(width-safe.right-33,safe.top+12,5,20);ctx.fillRect(width-safe.right-22,safe.top+12,5,20);
   const progress=api.progress(),hunt=api.photoHunts.find((h:any)=>h.id===s.huntId);if(progress?.next){const landmark=s.data.landmarks.find((l:any)=>l.id===progress.next.landmark),d=landmark?Math.hypot(s.stats.position[0]-landmark.position[0],s.stats.position[2]-landmark.position[2]):0;round(safe.left+80,safe.top,Math.min(270,width-330),44,paper);text(progress.next.name+' '+Math.round(d)+'m',safe.left+90,safe.top+22,15);}
   if(hunt){loadReference(hunt);const image=references.get(hunt.id);round(safe.left+80,safe.top,200,68,paper);if(image)ctx.drawImage(image,safe.left+85,safe.top+4,74,58);text(hunt.title,safe.left+164,safe.top+22,13);fixedButton('hunt-hint','找景提示',safe.left+160,safe.top+40,115,44,()=>api.page('hunt-help'));}
   const joy={x:safe.left+70,y:height-safe.bottom-68};ctx.strokeStyle='#f8f2e5';ctx.lineWidth=3;ctx.fillStyle='#284a5066';ctx.beginPath();ctx.arc(joy.x,joy.y,58,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff2df';ctx.beginPath();ctx.arc(joy.x+input.stick[0]*32,joy.y+input.stick[1]*32,22,0,Math.PI*2);ctx.fill();hits.push({id:'joystick',x:joy.x-64,y:joy.y-64,w:128,h:128,run:()=>{}});
   const actionX=width-safe.right-220,actionY=height-safe.bottom-54;
   fixedButton('jump','跳跃',actionX,actionY,66,48,()=>{input.jump=true;});fixedButton('photo','拍照',actionX+74,actionY,66,48,onCapture);fixedButton('journal','手记',actionX+148,actionY,72,48,()=>api.page('journal'));
   fixedButton('interact',input.sitting?'起身':'观察 / 坐下',actionX,actionY-58,140,44,()=>api.interact());
   if(s.lifeTarget){const x=s.lifeTarget.screen[0]/100*width,y=s.lifeTarget.screen[1]/100*height;fixedButton('life',s.lifeTarget.name,Math.max(safe.left,Math.min(width-safe.right-110,x-55)),Math.max(safe.top+64,Math.min(height-safe.bottom-120,y)),110,44,()=>api.meet());}
   if(s.notice){round(width/2-175,height-safe.bottom-34,350,28,'#f6eddaee');text(s.notice.slice(0,25),width/2,height-safe.bottom-20,13,ink,'center');}
  }else{
   const titles:any={home:'江风入境 · 外滩漫游',map:'游览地图',routes:'游览路线',hunts:'照片寻景', 'hunt-preview':'寻景准备','hunt-result':'找到这段风景','hunt-help':'找景提示',pause:'歇一会儿',settings:'游览设置',help:'学习操作',journal:'旅行手记',story:s.story?.name||'地标故事',stall:'江风小站'};panelStart(titles[s.page]||'外滩漫游');
   const x=safe.left+28,w=width-safe.left-safe.right-56,y=safe.top+78;
   if(s.page==='home'){
    wrap('在百年江风里，遇见上海的过去与未来。',x,y,w*.44,18);button('start',s.ready?'进入游览':'城市与物理加载中',x,y+68,w*.44,52,()=>api.start(),!s.ready);
    button('routes','游览路线',x,y+130,w*.44,48,()=>api.page('routes'));button('hunts','照片寻景',x+w*.50,y,w*.48,50,()=>api.page('hunts'));button('journal','旅行手记',x+w*.50,y+62,w*.48,50,()=>api.page('journal'));button('settings','设置',x+w*.50,y+124,w*.48,50,()=>api.page('settings'));
   }else if(s.page==='map'){
    // Exact authored bounds and destinations drive the map, no fictional city substitute.
    round(x,y,w*.53,166,'#d8e2d8');const [minX,minZ,maxX,maxZ]=s.data.bounds;for(const tri of s.data.water){ctx.beginPath();tri.forEach(([px,pz]:number[],i:number)=>{const mx=x+(px-minX)/(maxX-minX)*w*.53,my=y+(pz-minZ)/(maxZ-minZ)*166;i?ctx.lineTo(mx,my):ctx.moveTo(mx,my);});ctx.closePath();ctx.fillStyle='#8ebcbd';ctx.fill();}
    destinations.forEach((d:any,i:number)=>{button('dest-'+i,d.name,x+w*.57,y+i*54,w*.43,46,()=>api.travel(i));const mx=x+(d.position[0]-minX)/(maxX-minX)*w*.53,my=y+(d.position[2]-minZ)/(maxZ-minZ)*166;round(mx-5,my-5,10,10,coral,5);text(String(i+1),mx+8,my,12);});button('routes','探索路线',x,y+180,w*.25,46,()=>api.page('routes'));button('hunts','照片寻景',x+w*.28,y+180,w*.25,46,()=>api.page('hunts'));
   }else if(s.page==='routes')api.explorationRoutes.forEach((r:any,i:number)=>{const n=r.stops.filter((stop:any)=>s.visits.includes(stop.landmark)).length;button('route-'+r.id,r.title+` ${n}/3`,x,y+i*80,w,48,()=>api.chooseRoute(r.id));wrap(r.description,x,y+i*80+65,w,14,1);});
   else if(s.page==='hunts'){
    const cw=(w-24)/4;api.photoHunts.forEach((h:any,i:number)=>{loadReference(h);const image=references.get(h.id);round(x+i*(cw+8),y,cw,154,'#e6dfca');if(image)ctx.drawImage(image,x+i*(cw+8)+5,y+5,cw-10,85);text(h.title,x+i*(cw+8)+cw/2,y+111,15,ink,'center');button('hunt-'+h.id,s.huntSave.completed.includes(h.id)?'已完成 / 重拍':'开始寻景',x+i*(cw+8),y+144,cw,46,()=>api.previewHunt(h.id),!isPhotoHuntUnlocked(s.huntSave,h.id));});
   }else if(['hunt-preview','hunt-help','hunt-result'].includes(s.page)){
    const h=api.photoHunts.find((h:any)=>h.id===(s.page==='hunt-preview'?s.previewId:s.huntId));if(h){loadReference(h);const image=references.get(h.id);if(image)ctx.drawImage(image,x,y,w*.40,155);if(s.page==='hunt-result'&&s.photo)ctx.drawImage(s.photo,x+w*.47,y,w*.5,155);else wrap(s.page==='hunt-help'?h.hint:h.clue,x+w*.47,y+16,w*.5,17,5);button('hunt-start',s.page==='hunt-help'?'继续寻找':s.page==='hunt-result'?'再看这段风景':'开始寻景',x,y+171,w*.40,48,()=>s.page==='hunt-preview'?api.startHunt():api.start());if(s.page==='hunt-result'){const next=api.photoHunts[api.photoHunts.indexOf(h)+1];if(next)button('hunt-next','下一关',x+w*.47,y+171,w*.5,48,()=>api.previewHunt(next.id));}}
   }else if(s.page==='pause'){
    wrap('江风会等你。对局和镜头已保留，继续时请重新触摸操作。',x,y,w,17,2);button('resume','继续漫游',x,y+65,w*.47,50,()=>api.start());button('home','返回主页',x+w*.53,y+65,w*.47,50,()=>api.home());button('settings','设置',x,y+127,w*.47,48,()=>api.page('settings'));button('help','学习操作',x+w*.53,y+127,w*.47,48,()=>api.page('help'));
   }else if(s.page==='settings'){
    const lw=w*.47,rw=w*.47;for(const [i,key]of ['night','sound','crowd','motion'].entries()){const names:any={night:'夜景',sound:s.audioAvailable?'环境音':'宿主声音不可用',crowd:'街头游客',motion:'生活动画'};button('setting-'+key,names[key]+' '+(s[key]?'开':'关'),x+(i%2)*(lw+20),y+Math.floor(i/2)*58,lw,48,()=>api.toggle(key));}
    ['original','balanced','light'].forEach((v,i)=>button('detail-'+v,(['原始模型','均衡模型','轻量模型'][i])+(s.renderDetail===v?' ✓':''),x+i*(w/3+2),y+122,w/3-8,46,()=>api.detail(v)));
    [0,1,2].forEach((v,i)=>button('quality-'+v,['流畅画面','清晰画面','精细画面'][i]+(s.quality===v?' ✓':''),x+i*(w/3+2),y+176,w/3-8,46,()=>api.quality(v)));
    button('sensitivity-minus','转头慢一点',x,y+234,w*.47,46,()=>api.sensitivity(s.sensitivity-.2));button('sensitivity-plus','转头快一点',x+w*.53,y+234,w*.47,46,()=>api.sensitivity(s.sensitivity+.2));wrap('原生环境音不支持浏览器空间声场；拍照保存和分享取决于宿主真实能力。',x,y+300,w,15,3);contentMax=y+380;
   }else if(s.page==='help'){
    wrap('左下摇杆移动；拖动空白场景环顾。可同时移动和转头。场景两根手指张开或捏合可放大/缩小；摇杆手指不参与缩放。',x,y,w*.47,17,5);wrap('点跳跃跨阶，点拍照留住真实画面。走近地标或长椅后点观察；点游客/鸽子/小站的场景标签互动。',x+w*.53,y,w*.47,17,5);wrap('暂停、后台、返回和方向变化会释放手势。恢复后重新接触。寻景以站位、视角和真实加载的建筑判断，不以收藏代替通关。',x,y+150,w,16,4);contentMax=y+250;
   }else if(s.page==='story'){
    wrap(api.stories[s.story?.id]||'这里是两岸漫游中可以收藏的一处风景。',x,y,w,17,5);button('collect',s.visits.includes(s.story?.id)?'已收入手记':'收入手记',x,y+152,w*.48,50,()=>api.collect());
   }else if(s.page==='stall'){
    button('drink','一杯江边清凉',x,y+30,w*.47,100,()=>api.drink());button('postcard','一张外滩明信片',x+w*.53,y+30,w*.47,100,()=>api.postcard());wrap('这是街头生活小礼物，不涉及广告奖励或登录。',x,y+163,w,15);
   }else if(s.page==='journal'){
    const ids=s.visits;wrap(`地标 ${ids.length} 处 · 生活 ${s.moments.length} 段 · 寻景 ${s.huntSave.completed.length}/4`,x,y,w,17,1);ids.forEach((id:string,i:number)=>text('✓ '+(s.data.landmarks.find((l:any)=>l.id===id)?.name||id),x,y+40+i*32,15));const photoY=y+60+ids.length*32;if(s.photo){ctx.drawImage(s.photo,x,photoY,w*.47,Math.min(150,w*.47*.5));button('export','保存真实照片',x+w*.53,photoY,w*.47,46,onExport);}else text('本次还没有照片，回到江边拍一张吧。',x,photoY,16);button('share',s.shareAvailable?'邀请同一路线':'平台分享未配置',x,photoY+170,w*.47,46,()=>api.share(),!s.shareAvailable);button('hunts','照片寻景',x+w*.53,photoY+170,w*.47,46,()=>api.page('hunts'));contentMax=photoY+235;
   }
   panelEnd();if(s.notice){text(s.notice.slice(0,42),width/2,height-safe.bottom-28,13,ink,'center');}
  }
  texture.needsUpdate=true;
 }
 function resize(info:any){physicalWidth=info.windowWidth;physicalHeight=info.windowHeight;rotated=physicalHeight>physicalWidth;width=rotated?physicalHeight:physicalWidth;height=rotated?physicalWidth:physicalHeight;scale=Math.min(info.pixelRatio||1,1.5);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const area=info.safeArea||{left:0,top:0,right:physicalWidth,bottom:physicalHeight};safe=rotated?{left:Math.max(12,area.top||0),right:Math.max(60,physicalHeight-(area.bottom??physicalHeight)),top:Math.max(12,physicalWidth-(area.right??physicalWidth)),bottom:Math.max(12,area.left||0)}:{left:Math.max(12,area.left||0),right:Math.max(60,physicalWidth-(area.right??physicalWidth)),top:Math.max(12,area.top||0),bottom:Math.max(12,physicalHeight-(area.bottom??physicalHeight))};camera.left=-physicalWidth/2;camera.right=physicalWidth/2;camera.top=physicalHeight/2;camera.bottom=-physicalHeight/2;camera.updateProjectionMatrix();mesh.scale.set(width,height,1);mesh.rotation.z=rotated?-Math.PI/2:0;render();}
 return {scene,camera,render,resize,onImagesReady(fn:()=>void){readyImage=fn;},get hits(){return hits;},get dimensions(){return {width,height,physicalWidth,physicalHeight,rotated};},point(raw:any){const x=raw.clientX??raw.x,y=raw.clientY??raw.y;return {id:raw.identifier??raw.id??0,x:rotated?y:x,y:rotated?physicalWidth-x:y};},scroll(dy:number){scroll=Math.max(0,Math.min(scrollMax,scroll-dy));render();},dispose(){texture.dispose();material.dispose();mesh.geometry.dispose();references.clear();}};
}
