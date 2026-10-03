/* Original paper-city artwork and a small shared platform/input loop. */
window.W = (() => {
  const c = document.querySelector('canvas'), ctx = c.getContext('2d'), $ = id => document.getElementById(id);
  const C = {ink:'#36463e',paper:'#f8f2df',green:'#537d63',mint:'#b8ceb5',orange:'#dc7852',yellow:'#e8bd62',blue:'#a9c8c5',pink:'#e5ab99',wall:'#e6e9d8'};
  const route=LEVEL_ROUTE,totalLevels=route.order.length,chapterNames=['先出得了门','街上的东西各有想法','邻居的问题不止一点点','逛完这里就回家','回家以后，还有新乌龙','明天，也很不正常'],chapterNumbers=['一','二','三','四','五','六'];
  const levels = {}, held = new Set(), inputSources = new Map(), zones = new Map();
  let s, last=0, activeDrag=null, audio, sound=true, unlocked=1, unlockedLevels=new Set([route.order[0]]), records={}, savedLevel=1, modal=false, hintStep=0, run=0, dialogPointer=false,challengeMode=false,tryoutReturn=0,tryoutState=null,tryoutHints=0;
  const dev = new URLSearchParams(location.search).get('dev') === '1';
  try { const restored=route.restore(JSON.parse(localStorage.getItem('wulong-city-v1')||'{}')); unlockedLevels=restored.unlockedLevels;unlocked=route.frontier(unlockedLevels);records=restored.records;savedLevel=restored.level;sound=restored.sound; } catch {}
  function save(){if(challengeMode)return;try{localStorage.setItem('wulong-city-v1',JSON.stringify({orderVersion:2,unlocked,unlockedLevels:route.order.filter(id=>unlockedLevels.has(id)),records,level:s.id,sound}));}catch{say('浏览器未允许存档，本次仍可继续游玩。');}}
  function tone(freq=420,duration=.1){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.75,audio.currentTime+duration);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
  function say(message){if(s)s.feedback=message;$('feedback').textContent=message;}
  function rect(x,y,w,h,fill=C.paper,r=0,stroke=C.ink){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function line(x,y,a,b,col=C.ink,width=2,dash=[]){ctx.beginPath();ctx.setLineDash(dash);ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([]);}
  function ellipse(x,y,rx,ry,fill=C.paper,stroke=C.ink){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function text(t,x,y,size=14,col=C.ink,align='center'){ctx.font=`${size>=24?'bold ':''}${size}px "Microsoft YaHei","PingFang SC",sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=col;ctx.fillText(t,x,y);}
  function poly(points,fill,stroke=C.ink){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function face(x,y,look=1,mood='happy',scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);let blink=s&&Math.sin(s.t*1.7)> .997;for(const a of [-8,8]){ellipse(a,0,3.8,blink?1:5,C.paper,null);ellipse(a+look*1.5,0,1.9,blink?.6:3,C.ink,null);}if(mood==='fear'){ellipse(0,13,5,7,C.paper);line(-13,-8,-5,-11);line(5,-11,13,-8);}else{ctx.beginPath();ctx.arc(0,6,7,.2,Math.PI-.2);ctx.strokeStyle=C.ink;ctx.lineWidth=2;ctx.stroke();}if(mood==='shy'){ellipse(-16,8,6,3,C.pink,null);ellipse(16,8,6,3,C.pink,null);}ctx.restore();}
  function actor(x,y,dir=1,scale=1,pose='normal'){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);const step=s&&Math.abs(s.p.vx)>1?Math.sin(s.t*15)*3:0;ellipse(0,1,17,4,'#485d4920',null);line(-7,-11,-9+step,0,C.ink,4);line(7,-11,9-step,0,C.ink,4);rect(-14,-33,28,24,C.green,7);line(-17,-27,-20,-13,C.ink,3);line(17,-27,20,-15,C.ink,3);rect(-15,-58,30,29,C.paper,12);ellipse(dir*5-5,-46,2,2,C.ink,null);ellipse(dir*5+5,-46,2,2,C.ink,null);line(dir*3,-38,dir*3+5,-38);poly([[-20,-56],[-15,-68],[11,-68],[16,-55],[24,-55],[24,-51],[-20,-51]],C.yellow);line(-5,-69,1,-75,C.ink,2);line(1,-75,7,-69,C.ink,2);poly([[-11,-31],[0,-28],[12,-32],[8,-24],[-1,-26],[-11,-20]],C.orange);rect(9,-21,14,11,C.yellow,2);if(pose==='grab'){line(-20,-52,-28,-60,C.orange);line(20,-52,28,-60,C.orange);}ctx.restore();}
  function bird(x,y,dir=1,color=C.green){ctx.save();ctx.translate(x,y);ctx.scale(dir,1);line(-12,8,15,8,C.ink,3);poly([[-8,0],[-16,16],[0,8]],color);ellipse(0,-10,13,20,color);ellipse(4,-22,12,12,color);poly([[14,-26],[23,-20],[13,-17]],C.yellow);ellipse(8,-25,3,3,C.paper);ellipse(9,-25,1.4,1.4,C.ink);line(-5,7,-5,11);line(5,7,5,11);ctx.restore();}
  function sign(label,x,y,w=90){line(x,y+20,x,y+60,'#9ca58f',3);rect(x-w/2,y-13,w,29,C.paper,3);text(label,x,y+2,12);}
  function handle(x,y,label=''){ellipse(x,y,10,10,C.yellow);ellipse(x,y,4,4,C.paper);if(label)text(label,x,y+25,11,C.green);}
  function door(x,y,open=false,label='出口'){rect(x-24,y-87,48,87,open?'#6c8468':C.mint,18);if(open){rect(x-15,y-69,30,69,'#3e5746',5,null);}else ellipse(x+14,y-41,3,3,C.yellow);text(label,x,y-103,12,C.green);}
  function background(kind='street'){rect(0,0,480,520,'#eef0e2',0,null);if(kind==='inside'){rect(22,28,436,408,'#f2eddc',12,'#d3d8c5');for(let x=42;x<470;x+=36)line(x,34,x,431,'#e4e0cd',1);line(22,317,458,317,'#d4d8c4',4);}else{ellipse(395,65,25,25,'#ecd69b',null);for(let i=0;i<7;i++){let x=i*77-13,top=172+(i%3)*23;rect(x,top,67,266-top,i%2?'#dce2d2':'#d5dfd0',3,null);for(let j=0;j<2;j++)rect(x+15+j*27,top+16,10,17,'#f2efdd',2,null);}for(const x of [56,224]){ellipse(x,83,25,9,C.paper,null);ellipse(x+21,80,16,12,C.paper,null);}}rect(0,437,480,83,'#e3e4d1',0,null);line(0,436,480,436,'#7c9276',3);for(let x=8;x<480;x+=31)line(x,448,x+9,447,'#c3cbb6',1);for(let i=0;i<90;i++){let x=(i*139+37)%480,y=(i*83+12)%490;ellipse(x,y,.6,.6,'#7d826518',null);}}
  function hit(id,label,x,y,w,h,click,drag,up){const min=(drag?44:36)*480/(c.clientWidth||480),nw=Math.max(w,min),nh=Math.max(h,min);x=Math.max(0,Math.min(480-nw,x-(nw-w)/2));y=Math.max(0,Math.min(490-nh,y-(nh-h)/2));W.frameZones.set(id,{id,label,x,y,w:nw,h:nh,click,drag,up});}
  function near(x,range=65){return Math.abs(s.p.x-x)<range;}
  function win(){if(s.won)return;s.won=true;s.finishAt=s.t+1.1;s.p.vx=0;clearInput();tone(730,.22);say(LEVEL_DATA[s.id].joke);if(!challengeMode){records[s.id]=LEVEL_DATA[s.id].record;route.unlockNext(unlockedLevels,s.id);unlocked=route.frontier(unlockedLevels);save();}}
  function hold(action,source,down){
    let sources=inputSources.get(action);
    if(down){if(!sources)inputSources.set(action,sources=new Set());sources.add(source);}
    else sources?.delete(source);
    if(sources?.size)held.add(action);else{held.delete(action);inputSources.delete(action);}
    $(action)?.classList.toggle('pressed',held.has(action));
  }
  function clearInput(){held.clear();inputSources.clear();if(activeDrag){levels[s.id].cancel?.(s);activeDrag=null;}document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
  function close(){if($('dialog').open)$('dialog').close();modal=false;clearInput();last=0;$('canvas').focus({preventScroll:true});}
  function open(html){clearInput();dialogPointer=false;modal=true;$('dialog-body').innerHTML=html+'<button class="secondary" data-close>返回游戏</button>';if(!$('dialog').open)$('dialog').showModal();$('dialog-body').querySelector('[data-close]')?.addEventListener('click',close);}
  // A held movement touch must not click a result button that appears beneath it.
  $('dialog').addEventListener('pointerdown',()=>{dialogPointer=true;});
  $('dialog').addEventListener('pointercancel',()=>{dialogPointer=false;});
  // Chromium can report detail=0 for touch clicks too; only a click without a pointer type is keyboard activation.
  $('dialog').addEventListener('click',e=>{if((e.detail>0||e.pointerType)&&!dialogPointer){e.preventDefault();e.stopImmediatePropagation();}dialogPointer=false;},true);
  function heading(title,sub='乌龙城 · 奇遇记'){return `<div class="eyebrow">${sub}</div><h2 id="dialog-title">${title}</h2>`;}
  function menu(){let html=heading('今天想去哪里逛逛')+'<p>一件一件来，总会有办法。</p>';chapterNames.forEach((name,j)=>{html+=`<div class="eyebrow">0${j+1} / ${name}</div><div class="level-grid">`;for(const id of route.order.slice(j*5,j*5+5)){const number=route.number(id);let enabled=levels[id]&&(dev||unlockedLevels.has(id));html+=`<button data-level="${id}" title="${LEVEL_DATA[id]?.title||'制作中'}" aria-label="第${number}关 ${LEVEL_DATA[id]?.title||'制作中'}${records[id]?' 已完成':''}" class="${records[id]?'done':''} ${s.id===id?'current':''}" ${enabled?'':'disabled'}>${String(number).padStart(2,'0')}</button>`;}html+='</div>';});html+='<div class="records">奇遇记录';for(const id of route.order)if(records[id]&&LEVEL_DATA[id])html+=`<div class="record">${String(route.number(id)).padStart(2,'0')} / ${LEVEL_DATA[id].record}</div>`;html+='</div>';if(dev)html+='<p>开发选关：所有已实现关卡开放。</p>';open(html);document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>start(Number(b.dataset.level),false));}
  function result(){let d=LEVEL_DATA[s.id],end=!route.next(s.id)||challengeMode;open(heading(challengeMode?'这段奇遇，轮到你出题':end?'今天的奇遇告一段落':'又遇见一件奇妙的事',`奇遇 ${String(route.number(s.id)).padStart(2,'0')} · ${challengeMode?'分享体验完成':'已归档'}`)+`<div class="stamp">处理完毕</div><p>“${d.joke}”</p><div class="ending">${end&&!challengeMode?'乌龙没有结束，今天先到这里。<br>谢谢你，让不正常的城市过上了正常的一天。':d.record}</div><button class="primary" id="next">${tryoutReturn?'回到刚才的主线':end?'回到选关与奇遇记录':'下一段奇遇 →'}</button><button class="secondary" id="again">再玩这关</button><button class="secondary" id="share">分享这段奇遇</button><p id="share-status" role="status"></p><input id="share-link" aria-label="奇遇挑战链接" readonly hidden>`);$('next').onclick=()=>tryoutReturn?returnFromTryout():end?menu():start(route.next(s.id),false);$('again').onclick=()=>start(s.id,challengeMode);$('share').onclick=shareChallenge;}
  async function shareChallenge(){const b=$('share'),status=$('share-status'),url=new URL(location.origin);url.pathname=location.pathname;url.searchParams.set('challenge',s.id);status.textContent='';$('share-link').hidden=true;const payload={title:'乌龙城 · '+LEVEL_DATA[s.id].title,text:(s.won?'我把这段乌龙处理完了。':'我遇到一段新乌龙。')+'你会怎么解决「'+LEVEL_DATA[s.id].title+'」？',url:url.href};b.disabled=true;try{if(navigator.share){try{await navigator.share(payload);status.textContent='分享入口已打开。';return;}catch(e){if(e&&typeof e==='object'&&e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(payload.url);status.textContent='挑战链接已复制，发给朋友试试看。';}catch{const link=$('share-link');link.hidden=false;link.value=payload.url;link.focus();link.select();status.textContent='长按或选中下面的链接，复制后发给朋友。';}}finally{b.disabled=false;}}
  function start(id,shared=challengeMode){close();challengeMode=shared;if(!shared){tryoutReturn=0;tryoutState=null;}hintStep=0;run++;s={id,run,t:0,p:{x:65,y:436,vx:0,vy:0,dir:1,grounded:true},won:false,feedback:'',...levels[id].init()};W.s=s;$('title').textContent=LEVEL_DATA[id].title;$('goal').textContent=LEVEL_DATA[id].goal;$('chapter').textContent=tryoutReturn?'今日试演 · 不改主线进度':challengeMode?'分享体验 · 不改主线进度':`第${chapterNumbers[Math.floor((route.number(id)-1)/5)]}章 · ${chapterNames[Math.floor((route.number(id)-1)/5)]}`;$('counter').textContent=String(route.number(id)).padStart(2,'0')+' / '+totalLevels;$('tryout').hidden=!(tryoutReturn||!challengeMode&&id===1);$('tryout-choices').hidden=!!tryoutReturn;$('tryout-back').hidden=!tryoutReturn;say(LEVEL_DATA[id].intro);zones.clear();$('hotspots').replaceChildren();save();draw();}
  document.querySelectorAll('[data-try]').forEach(button=>button.onclick=()=>{if(challengeMode||s.id!==1)return;tryoutReturn=s.id;tryoutState=s;tryoutHints=hintStep;start(Number(button.dataset.try),true);});
  function returnFromTryout(){const original=tryoutState,hints=tryoutHints;if(!original)return;start(original.id,false);s=original;s.run=run;W.s=s;hintStep=hints;say(s.feedback);draw();}
  $('tryout-back').onclick=returnFromTryout;
  function jump(){if(modal||s.won)return;if(levels[s.id].jump?.(s)===false)return;if(s.p.grounded&&!s.locked){s.p.vy=-410;s.p.grounded=false;tone(340,.08);}}
  function physics(dt){const p=s.p;let axis=Number(held.has('right'))-Number(held.has('left'));p.vx=s.locked||s.won?0:axis*145;if(axis&&!s.locked&&!s.won)p.dir=axis;if(s.manual)return;const solids=[...(levels[s.id].floor===false?[]:[{x:-50,y:436,w:580,h:100}]),...(levels[s.id].platforms?.(s)||[])];p.x+=p.vx*dt;for(const q of solids)if(q.solid&&p.y>q.y+7&&p.y-52<q.y+q.h&&p.x+12>q.x&&p.x-12<q.x+q.w){if(p.vx>0)p.x=q.x-12;else if(p.vx<0)p.x=q.x+q.w+12;}p.x=Math.max(22,Math.min(458,p.x));const old=p.y;p.vy+=(held.has('down')&&!s.locked?2400:1050)*dt;p.y+=p.vy*dt;p.grounded=false;for(const q of solids){if(p.vy>=0&&old<=q.y+4&&p.y>=q.y&&p.x+10>q.x&&p.x-10<q.x+q.w){p.y=q.y;p.vy=0;p.grounded=true;}}}
  function hotspotKeydown(e,id){
    const zone=zones.get(id);
    if(!zone||modal||s.won)return;
    // Enter operates objects; movement and Space stay available after an object gains focus.
    if(e.key==='Enter'){
      e.preventDefault();e.stopPropagation();if(e.repeat)return;
      if(zone.drag){
        if(activeDrag?.id==='keyboard'&&activeDrag.z.id===id){const grab=activeDrag;activeDrag=null;grab.z.up?.();}
        else{clearInput();activeDrag={z:zone,p:{x:zone.x+zone.w/2,y:zone.y+zone.h/2},run,id:'keyboard',moved:false};say('抓住了'+zone.label+'。方向键调整，回车松开，Esc暂停并取消。');}
      }else if(zone.click){zone.click();tone();}
      return;
    }
    if(zone.drag&&activeDrag?.id==='keyboard'&&activeDrag.z.id===id&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();e.stopPropagation();
      const p=activeDrag.p;p.x+=e.key==='ArrowLeft'?-35:e.key==='ArrowRight'?35:0;p.y+=e.key==='ArrowUp'?-40:e.key==='ArrowDown'?40:0;
      activeDrag.moved=true;zone.drag(p.x,p.y);
    }
  }
  function draw(){W.frameZones=new Map();ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,480,520);levels[s.id].draw(s);if(!s.hideActor)actor(s.p.x,s.p.y,s.p.dir,1,s.id===3?'grab':'normal');for(const [id,z] of W.frameZones){let b=zones.get(id)?.el;if(!b){b=document.createElement('button');b.className='hotspot';b.dataset.zone=id;$('hotspots').append(b);b.addEventListener('keydown',e=>hotspotKeydown(e,id));}b.setAttribute('aria-label',z.label+(z.drag?'，可拖动；键盘回车抓起，方向键调整，回车松开':'，回车操作'));Object.assign(b.style,{left:z.x/480*100+'%',top:z.y/520*100+'%',width:z.w/480*100+'%',height:z.h/520*100+'%'});zones.set(id,{...z,el:b});}for(const [id,z] of zones)if(!W.frameZones.has(id)){z.el.remove();zones.delete(id);}}
  function frame(now){let dt=Math.min((now-last)/1000||0,1/30);last=now;if(s&&!modal){s.t+=dt;if(!s.won){physics(dt);levels[s.id].update?.(s,dt);}else if(!s.presented&&s.t>s.finishAt){s.presented=true;result();}draw();}requestAnimationFrame(frame);}
  function point(e){const b=c.getBoundingClientRect();return{x:(e.clientX-b.left)*480/b.width,y:(e.clientY-b.top)*520/b.height};}
  function boot(){const params=new URLSearchParams(location.search),requested=Number(params.get('level')),challenge=params.get('challenge'),shared=params.getAll('challenge').length===1&&/^[1-9]\d*$/.test(challenge||'')?Number(challenge):0;start(levels[shared]?shared:dev&&levels[requested]?requested:levels[savedLevel]&&unlockedLevels.has(savedLevel)?savedLevel:1,!!levels[shared]);if(params.has('challenge')&&!levels[shared])say('分享链接的关卡无效，已返回你的主线进度。');$('sound').textContent=sound?'♪':'♩';$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');requestAnimationFrame(frame);}
  $('stage').addEventListener('pointerdown',e=>{if(modal||s.won||activeDrag||e.button!==0)return;const p=point(e);let list=[...zones.values()].reverse();let z=list.find(z=>p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h);if(z){e.preventDefault();activeDrag={z,p,run,id:e.pointerId,moved:false};$('stage').setPointerCapture(e.pointerId);tone(380,.05);}});
  $('stage').addEventListener('pointermove',e=>{if(!activeDrag||activeDrag.id!==e.pointerId||activeDrag.run!==run||modal)return;const p=point(e);if(Math.hypot(p.x-activeDrag.p.x,p.y-activeDrag.p.y)>4)activeDrag.moved=true;if(activeDrag.z.drag&&activeDrag.moved)activeDrag.z.drag(p.x,p.y);});
  $('stage').addEventListener('pointerup',e=>{if(!activeDrag||activeDrag.id!==e.pointerId)return;const {z,moved,run:started}=activeDrag;activeDrag=null;if(started!==run||modal)return;if(!moved)z.click?.();z.up?.();});
  for(const event of ['pointercancel','lostpointercapture'])$('stage').addEventListener(event,e=>{if(activeDrag?.id!==e.pointerId)return;levels[s.id].cancel?.(s);activeDrag=null;});
  for(const action of ['left','right','jump']){
    const b=$(action);
    b.addEventListener('pointerdown',e=>{e.preventDefault();if(modal||s.won||e.button!==0)return;b.setPointerCapture(e.pointerId);hold(action,`pointer:${e.pointerId}`,true);if(action==='jump')jump();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>hold(action,`pointer:${e.pointerId}`,false));
    b.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(modal||s.won)return;hold(action,`button:${e.code}`,true);if(action==='jump'&&!e.repeat)jump();}});
    b.addEventListener('keyup',e=>hold(action,`button:${e.code}`,false));
  }
  const keyActions={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ArrowDown:'down',KeyS:'down'};
  const keyAliases={a:'left',d:'right',w:'jump',s:'down',' ':'jump'};
  function keyAction(e){return keyActions[e.code]||keyActions[e.key]||keyAliases[e.key.toLowerCase()];}
  document.addEventListener('keydown',e=>{
    if(modal||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    if(e.key==='Escape'){e.preventDefault();pause();return;}
    const action=keyAction(e);if(!action)return;
    e.preventDefault();if(s.won||activeDrag?.id==='keyboard')return;
    hold(action,`key:${e.code||e.key}`,true);
    if(action==='jump'&&!e.repeat)jump();
  });
  document.addEventListener('keyup',e=>{
    const action=keyAction(e);if(action)hold(action,`key:${e.code||e.key}`,false);
    // A release still belongs to the original button if focus changed while Enter was held.
    for(const control of ['left','right','jump'])hold(control,`button:${e.code}`,false);
  });
  function pause(){open(heading('歇一小会儿')+'<p>城市可以等你。所有动作已经暂停。</p><button class="primary" data-resume>继续探索</button><button class="secondary" data-menu>选关 / 退出本关</button>');document.querySelector('[data-resume]').onclick=close;document.querySelector('[data-menu]').onclick=menu;}
  window.addEventListener('blur',()=>{clearInput();if(s&&!modal&&!s.won)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(s&&!modal&&!s.won)pause();}});$('dialog').addEventListener('cancel',()=>{modal=false;clearInput();last=0;});$('dialog').addEventListener('close',()=>{if(!$('dialog').open){modal=false;last=0;$('canvas').focus({preventScroll:true});}});$('pause').onclick=pause;$('menu').onclick=menu;$('retry').onclick=()=>start(s.id);$('hint').onclick=()=>{const d=LEVEL_DATA[s.id];open(heading('换个角度看看')+`<div class="hint-step">提示 ${hintStep+1} / 3</div><p>${d.hints[hintStep]}</p><button class="primary" data-close-hint>回去试试</button><button class="secondary" data-more>${hintStep<2?'再明确一点':'重新看第一条'}</button>`);document.querySelector('[data-close-hint]').onclick=close;document.querySelector('[data-more]').onclick=()=>{hintStep=(hintStep+1)%3;$('hint').click();};};$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'♪':'♩';$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');save();tone();};$('fullscreen').onclick=async()=>{clearInput();try{if(document.fullscreenElement)await document.exitFullscreen();else if($('game').requestFullscreen)await $('game').requestFullscreen();else say('当前浏览器不支持全屏；可添加到主屏幕后游玩。');}catch{say('此浏览器未允许全屏，仍可正常游玩。');}};document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'进入全屏');if(!modal)$('canvas').focus({preventScroll:true});});
  if(dev)window.__wulong={snapshot:()=>JSON.parse(JSON.stringify({state:s,modal,unlocked,unlockedLevels:route.order.filter(id=>unlockedLevels.has(id)),levelNumber:route.number(s.id),records,sound,challengeMode,totalLevels,zones:[...zones.values()].map(({id,x,y,w,h,label})=>({id,x,y,w,h,label}))}))};
  return {C,ctx,rect,line,ellipse,text,poly,face,actor,bird,sign,handle,door,background,hit,near,win,say,tone,boot,levels,add:(id,l)=>levels[id]=l,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),frameZones:new Map()};
})();
