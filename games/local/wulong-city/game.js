/* Original paper-city artwork and a small shared platform/input loop. */
window.W = (() => {
  const c = document.querySelector('canvas'), ctx = c.getContext('2d'), $ = id => document.getElementById(id);
  const assets={};for(const [key,file] of [['city','city-scene.webp'],['room','room-scene.webp'],['actor','xiaocha.png']]){const picture=new Image();picture.onload=()=>{assets[key]=picture;if(s)draw();};picture.src='./assets/art/'+file;}
  const {C,rect,line,ellipse,text,poly,face,actor,bird,sign,handle,door,background}=WulongArt.create(ctx,()=>s,assets);
  const route=LEVEL_ROUTE,totalLevels=route.order.length,chapterNames=['出门就有乌龙','街坊各有想法','日常不按常理','沿河慢慢逛','云巷的小麻烦','老街的新办法','街角藏着答案','夜市也有脾气','屋顶上的奇遇','百日乌龙大会'];
  const levels = {}, held = new Set(), inputSources = new Map(), zones = new Map();
  let s, last=0, activeDrag=null, audio, sound=true, unlocked=1, unlockedLevels=new Set([route.order[0]]), records={}, savedLevel=1, modal=false, hintStep=0, run=0, dialogPointer=false,challengeMode=false,tryoutReturn=0,tryoutState=null,tryoutHints=0,currentPage='home',chapterPage=0,practiceMode=false;
  const dev = window.SmallGamesDev.isEnabled();
  try { const restored=route.restore(JSON.parse(localStorage.getItem('wulong-city-v1')||'{}')); unlockedLevels=restored.unlockedLevels;unlocked=route.frontier(unlockedLevels);records=restored.records;savedLevel=restored.level;sound=restored.sound; } catch {}
  function save(){if(challengeMode||practiceMode)return;savedLevel=s.id;try{localStorage.setItem('wulong-city-v1',JSON.stringify({orderVersion:2,unlocked,unlockedLevels:route.order.filter(id=>unlockedLevels.has(id)),records,level:s.id,sound}));}catch{say('浏览器未允许存档，本次仍可继续游玩。');}}
  function tone(freq=420,duration=.1){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.75,audio.currentTime+duration);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
  function say(message){if(s)s.feedback=message;$('feedback').textContent=message;}
  function hit(id,label,x,y,w,h,click,drag,up){const min=44*480/(c.clientWidth||480),nw=Math.max(w,min),nh=Math.max(h,min);x=Math.max(0,Math.min(480-nw,x-(nw-w)/2));y=Math.max(0,Math.min(490-nh,y-(nh-h)/2));W.frameZones.set(id,{id,label,x,y,w:nw,h:nh,click,drag,up});}
  function near(x,range=65){return Math.abs(s.p.x-x)<range;}
  function win(){if(s.won)return;s.won=true;s.finishAt=s.t+1.1;s.p.vx=0;clearInput();tone(730,.22);say(LEVEL_DATA[s.id].joke);if(!challengeMode&&!practiceMode){records[s.id]=LEVEL_DATA[s.id].record;route.unlockNext(unlockedLevels,s.id);unlocked=route.frontier(unlockedLevels);save();}}
  function hold(action,source,down){
    let sources=inputSources.get(action);
    if(down){if(!sources)inputSources.set(action,sources=new Set());sources.add(source);}
    else sources?.delete(source);
    if(sources?.size)held.add(action);else{held.delete(action);inputSources.delete(action);}
    $(action)?.classList.toggle('pressed',held.has(action));
  }
  function clearInput(){held.clear();inputSources.clear();if(activeDrag){levels[s.id].cancel?.(s);activeDrag=null;}document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
  function notifyHost(){try{if(window.parent!==window&&document.referrer)window.parent.postMessage({type:'small-games:display-state',gameId:'wulong-city',screen:currentPage==='home'?'home':'playing'},new URL(document.referrer).origin);}catch{}}
  window.addEventListener('load',notifyHost,{once:true});
  function view(page){currentPage=page;notifyHost();$('game').dataset.page=page;$('home-page').hidden=page!=='home';$('play-page').hidden=page!=='play';$('dialog').hidden=page==='home'||page==='play';$('settings-tools').hidden=page!=='pause';$('tryout').hidden=page!=='records'||challengeMode;modal=page!=='play';last=0;}
  function close(){clearInput();view('play');$('canvas').focus({preventScroll:true});}
  function open(html,page='hint'){clearInput();dialogPointer=false;$('dialog-body').innerHTML=html;view(page);$('dialog-body').querySelector('button')?.focus({preventScroll:true});$('dialog').scrollTop=0;}
  function home(){if(challengeMode&&!tryoutReturn)start(unlockedLevels.has(savedLevel)?savedLevel:1,false);clearInput();view('home');const completed=Object.keys(records).filter(id=>LEVEL_DATA[id]).length;$('home-progress').textContent=`奇遇手记 ${completed} / ${totalLevels}`;$('start-game').innerHTML=`${completed||s?.t>0?'继续':'开始'}奇遇 <span>→</span>`;$('tryout').hidden=true;$('home-settings').focus({preventScroll:true});}
  // A held movement touch must not click a result button that appears beneath it.
  $('dialog').addEventListener('pointerdown',()=>{dialogPointer=true;});
  $('dialog').addEventListener('pointercancel',()=>{dialogPointer=false;});
  // Chromium can report detail=0 for touch clicks too; only a click without a pointer type is keyboard activation.
  $('dialog').addEventListener('click',e=>{if(e.target.closest?.('[data-game-dev-tools]'))return;if((e.detail>0||e.pointerType)&&!dialogPointer){e.preventDefault();e.stopImmediatePropagation();}dialogPointer=false;},true);
  function heading(title,sub='乌龙城 · 奇遇记'){return `<div class="eyebrow">${sub}</div><h2 id="dialog-title">${title}</h2>`;}
  function backButton(id='levels-back'){return `<button id="${id}" class="round-button page-back" aria-label="返回主页"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5 7 12l7 7"/></svg></button>`;}
  function menu(reset=true){if(challengeMode&&!tryoutReturn)start(unlockedLevels.has(savedLevel)?savedLevel:1,false);if(reset)chapterPage=Math.floor((route.number(s.id)-1)/10);const ids=route.order.slice(chapterPage*10,chapterPage*10+10);let html=backButton()+heading('选择关卡',`奇遇 ${Object.keys(records).filter(id=>LEVEL_DATA[id]).length} / ${totalLevels}`)+`<div class="chapter-banner">第 ${chapterPage+1} 章 · ${chapterNames[chapterPage]}</div><div class="level-grid">`;for(const id of ids){const number=route.number(id),enabled=levels[id]&&(dev||unlockedLevels.has(id));html+=`<button data-level="${id}" title="${LEVEL_DATA[id].title}" aria-label="第${number}关 ${LEVEL_DATA[id].title}${records[id]?' 已完成':enabled?' 已解锁':' 未解锁'}" class="${records[id]?'done':''} ${s.id===id?'current':''}" ${enabled?'':'disabled'}><b>${String(number).padStart(2,'0')}</b><small>${records[id]?'已完成':enabled?'奇遇':'未解锁'}</small></button>`;}html+=`</div><div class="chapter-nav"><button id="chapter-prev" class="round-button" aria-label="上一章" ${chapterPage===0?'disabled':''}>‹</button><span>${chapterPage+1} / ${Math.ceil(totalLevels/10)}</span><button id="chapter-next" class="round-button" aria-label="下一章" ${chapterPage===Math.ceil(totalLevels/10)-1?'disabled':''}>›</button></div><button class="primary" id="continue-level">继续第 ${String(route.number(s.id)).padStart(2,'0')} 关 →</button>`;if(dev)html+='<p class="dev-note">开发选关 · 未解锁关卡仅供试玩</p>';open(html,'levels');$('levels-back').onclick=home;$('chapter-prev').onclick=()=>{chapterPage--;menu(false);};$('chapter-next').onclick=()=>{chapterPage++;menu(false);};$('continue-level').onclick=()=>s.won?start(route.next(s.id)||s.id,false):close();document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>start(Number(b.dataset.level),false));}
  function recordPage(){let html=backButton('records-back')+heading('奇遇手记',`${Object.keys(records).filter(id=>LEVEL_DATA[id]).length} 段已收藏`)+`<div class="journal-art">✦</div><div class="records">`;for(const id of route.order)if(records[id]&&LEVEL_DATA[id])html+=`<article class="record"><span>第 ${String(route.number(id)).padStart(2,'0')} 关</span><h3>${LEVEL_DATA[id].title}</h3><p>${LEVEL_DATA[id].record}</p></article>`;if(!Object.keys(records).length)html+='<p class="empty-records">街坊的故事，等你翻开。<br>完成奇遇后会收录在这里。</p>';html+='</div><button class="primary" data-home>返回小城</button>';open(html,'records');$('records-back').onclick=home;document.querySelector('[data-home]').onclick=home;}
  function result(){const d=LEVEL_DATA[s.id],end=!route.next(s.id)||challengeMode;open(heading('乌龙解决啦！',`第 ${String(route.number(s.id)).padStart(2,'0')} 关 · ${challengeMode||practiceMode?'试玩完成':'奇遇已收藏'}`)+`<div class="result-emblem"><span>✦</span><b>妙</b><span>✦</span></div><p class="result-joke">“${d.joke}”</p><div class="ending">${d.record}</div><button class="primary" id="next">${tryoutReturn?'回到刚才的主线':end?'回到选关':'下一关 →'}</button><div class="result-actions"><button class="secondary" id="again">再玩一次</button><button class="secondary" id="share">分享奇遇</button></div><p id="share-status" role="status"></p><input id="share-link" aria-label="奇遇挑战链接" readonly hidden><button class="text-button" data-home>返回主页</button>`,'result');$('next').onclick=()=>tryoutReturn?returnFromTryout():end?menu():start(route.next(s.id),false);$('again').onclick=()=>start(s.id,challengeMode);$('share').onclick=shareChallenge;document.querySelector('[data-home]').onclick=()=>tryoutReturn?returnFromTryout():home();}
  async function shareChallenge(){const b=$('share'),status=$('share-status'),url=new URL(location.origin);url.pathname=location.pathname;url.searchParams.set('challenge',s.id);status.textContent='';$('share-link').hidden=true;const payload={title:'乌龙城 · '+LEVEL_DATA[s.id].title,text:(s.won?'我把这段乌龙处理完了。':'我遇到一段新乌龙。')+'你会怎么解决「'+LEVEL_DATA[s.id].title+'」？',url:url.href};b.disabled=true;try{if(navigator.share){try{await navigator.share(payload);status.textContent='分享入口已打开。';return;}catch(e){if(e&&typeof e==='object'&&e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(payload.url);status.textContent='挑战链接已复制，发给朋友试试看。';}catch{const link=$('share-link');link.hidden=false;link.value=payload.url;link.focus();link.select();status.textContent='长按或选中下面的链接，复制后发给朋友。';}}finally{b.disabled=false;}}
  function start(id,shared=challengeMode){if(!levels[id]||!shared&&!dev&&!unlockedLevels.has(id))return;clearInput();challengeMode=shared;practiceMode=dev&&!shared&&!unlockedLevels.has(id);if(!shared){tryoutReturn=0;tryoutState=null;}hintStep=0;run++;s={id,run,t:0,p:{x:65,y:436,vx:0,vy:0,dir:1,grounded:true},won:false,feedback:'',...levels[id].init()};W.s=s;$('title').textContent=LEVEL_DATA[id].title;$('goal').textContent=LEVEL_DATA[id].goal;$('chapter').textContent=tryoutReturn?'今日试演 · 不改主线进度':challengeMode?'分享体验 · 不改主线进度':`第 ${Math.floor((route.number(id)-1)/10)+1} 章 · ${chapterNames[Math.floor((route.number(id)-1)/10)]}`;$('counter').textContent=String(route.number(id)).padStart(2,'0')+' / '+totalLevels;$('tryout-back').hidden=!tryoutReturn;say(LEVEL_DATA[id].intro);zones.clear();$('hotspots').replaceChildren();save();close();draw();}
  document.querySelectorAll('[data-try]').forEach(button=>button.onclick=()=>{if(challengeMode||tryoutReturn)return;tryoutReturn=s.id;tryoutState=s;tryoutHints=hintStep;start(Number(button.dataset.try),true);});
  function returnFromTryout(){const original=tryoutState,hints=tryoutHints;if(!original)return;start(original.id,false);s=original;s.run=run;W.s=s;hintStep=hints;say(s.feedback);if(s.won)result();else draw();}
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
  function boot(){const params=new URLSearchParams(location.search),requested=Number(params.get('level')),challenge=params.get('challenge'),shared=params.getAll('challenge').length===1&&/^[1-9]\d*$/.test(challenge||'')?Number(challenge):0;start(levels[shared]?shared:dev&&levels[requested]?requested:levels[savedLevel]&&unlockedLevels.has(savedLevel)?savedLevel:1,!!levels[shared]);if(params.has('challenge')&&!levels[shared])say('分享链接的关卡无效，已返回你的主线进度。');if(!levels[shared]&&!(dev&&levels[requested]))home();$('sound').textContent=sound?'音效：开':'音效：关';$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');requestAnimationFrame(frame);}

  $('stage').addEventListener('pointerdown',e=>{if(modal||s.won||activeDrag||e.button!==0)return;const p=point(e);let list=[...zones.values()].reverse();const candidates=list.filter(z=>p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h);let z=candidates[0];if(z?.id.includes('-note-'))z=candidates.filter(q=>q.id.includes('-note-')).sort((a,b)=>Math.hypot(p.x-a.x-a.w/2,p.y-a.y-a.h/2)-Math.hypot(p.x-b.x-b.w/2,p.y-b.y-b.h/2))[0];if(z){e.preventDefault();activeDrag={z,p,run,id:e.pointerId,moved:false};$('stage').setPointerCapture(e.pointerId);tone(380,.05);}});
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
  function pause(fromHome=false){const wasHome=fromHome||currentPage==='home';open(heading(wasHome?'小城设置':'歇一小会儿',wasHome?'乌龙城 · 设置':'城市可以等你')+`<div class="pause-art"><span>☽</span><p>${wasHome?'让奇遇合你的心意':'喝口茶，再出发'}</p></div>${wasHome?'':'<button class="primary" data-resume>继续探索</button><button class="secondary" id="retry">重试本关</button>'}<button class="secondary" id="pause-levels">选择关卡</button><button class="secondary" id="pause-home" data-home>返回主页</button>`,'pause');document.querySelector('[data-resume]')?.addEventListener('click',close);$('retry')?.addEventListener('click',()=>start(s.id));$('pause-levels').onclick=()=>menu();$('pause-home').onclick=()=>tryoutReturn?returnFromTryout():home();}
  function showHint(){const d=LEVEL_DATA[s.id];open(heading('换个角度看看',`第 ${String(route.number(s.id)).padStart(2,'0')} 关`)+`<div class="hint-art">?</div><div class="hint-step">提示 ${hintStep+1} / 3</div><p class="hint-text">${d.hints[hintStep]}</p><button class="primary" data-close-hint>回去试试</button><button class="secondary" data-more>${hintStep<2?'再明确一点':'重新看第一条'}</button>`,'hint');document.querySelector('[data-close-hint]').onclick=close;document.querySelector('[data-more]').onclick=()=>{hintStep=(hintStep+1)%3;showHint();};}
  window.addEventListener('blur',()=>{clearInput();if(s&&!modal&&!s.won)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(s&&!modal&&!s.won)pause();}});
  $('pause').onclick=()=>pause();$('menu').onclick=()=>tryoutReturn?returnFromTryout():home();$('hint').onclick=showHint;$('home-settings').onclick=()=>pause(true);$('home-levels').onclick=()=>menu();$('home-records').onclick=recordPage;$('start-game').onclick=()=>s.won?start(route.next(s.id)||s.id,false):close();
  $('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'音效：开':'音效：关';$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');save();tone();};$('fullscreen').onclick=async()=>{clearInput();try{if(document.fullscreenElement)await document.exitFullscreen();else if($('game').requestFullscreen)await $('game').requestFullscreen();else $('fullscreen').textContent='当前设备不支持全屏';}catch{$('fullscreen').textContent='保持当前画面游玩';}};document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'进入全屏');$('fullscreen').textContent=document.fullscreenElement?'退出全屏':'进入全屏';});
  window.addEventListener('pagehide',()=>{clearInput();audio?.suspend?.();});
  if(dev)window.__wulong={snapshot:()=>JSON.parse(JSON.stringify({state:s,modal,unlocked,unlockedLevels:route.order.filter(id=>unlockedLevels.has(id)),levelNumber:route.number(s.id),records,sound,challengeMode,practiceMode,currentPage,hintStep,totalLevels,zones:[...zones.values()].map(({id,x,y,w,h,label})=>({id,x,y,w,h,label}))}))};
  return {C,ctx,rect,line,ellipse,text,poly,face,actor,bird,sign,handle,door,background,hit,near,win,say,tone,boot,levels,add:(id,l)=>levels[id]=l,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),frameZones:new Map()};
})();
