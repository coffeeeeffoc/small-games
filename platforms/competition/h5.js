import './client.js';
import { scoreText, gapText } from './format.js';

export function mountCompetition(game, createRenderer) {
  if (document.querySelector('[data-competition-launch]')) return;
  globalThis.__installCompetition();
  const client=globalThis.__competition, renderer=createRenderer({createImage:()=>new Image(),assetBase:new URL('./',location.href).href});
  const launch=document.createElement('button');
  launch.textContent='好友 PK · 全站榜'; launch.dataset.competitionLaunch='';
  launch.style.cssText='position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:1000;min-height:44px;border-radius:12px;padding:8px 14px;background:#164c49;color:white;border:1px solid #8bd1c4;font:14px system-ui';
  const dialog=document.createElement('dialog');
  dialog.className='competition-dialog';
  const style=document.createElement('style');style.textContent='.competition-dialog p,.competition-dialog label,.competition-dialog span{color:#f0f8f7}.competition-dialog input{color:#112f37;background:#fff;font:16px system-ui;min-height:44px;box-sizing:border-box}.competition-dialog button:disabled{opacity:.6}.competition-dialog::backdrop{background:#07171dcc}';document.head.append(style);
  dialog.style.cssText='padding:0;border:0;border-radius:14px;width:min(680px,100%);max-width:100%;height:100dvh;max-height:100dvh;background:#102a32;color:#f0f8f7';
  dialog.innerHTML=`<div style="height:100%;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;padding-bottom:max(8px,env(safe-area-inset-bottom))">
    <nav style="display:flex;gap:8px;flex-wrap:wrap"><button data-close>退出 PK</button><button data-game-fullscreen>全屏</button><button data-rules>规则</button><button data-board>全站榜</button></nav>
    <p role="status" style="margin:8px 0;font:14px/1.4 system-ui" data-status>同规则双人挑战，服务端确认结果。</p>
    <section data-lobby><button data-create>创建好友挑战</button><label>房间码 <input data-code maxlength="12" autocomplete="off" style="width:145px"></label><button data-join>加入</button>
      <p>游客身份保存在当前浏览器；清除数据或换设备会生成新身份。离线练习不进入全站榜。</p></section>
    <section data-room hidden><span data-room-code></span><button data-share>复制邀请</button><button data-ready>准备</button><button data-rematch hidden>再来一局</button></section>
    <section data-details hidden style="overflow:auto;max-height:40%;font:14px/1.5 system-ui"></section>
    <canvas data-play style="width:100%;flex:1;min-height:0;touch-action:none"></canvas></div>`;
  document.body.append(launch,dialog);
  style.textContent += 'body:is(.is-playing,.focus-play,.play-focus,.game-page) > [data-competition-launch]{display:none}.competition-dialog{position:fixed;inset:0;margin:auto}.competition-dialog[data-playing] [data-room]{display:none}.competition-dialog[data-playing] [data-status]{margin:2px 0!important}.competition-dialog [data-details]{position:absolute;inset:60px 8px 8px;max-height:none!important;z-index:3;padding:12px;background:#102a32;border:1px solid #76aaa6;border-radius:10px}.competition-dialog [data-details] [data-dismiss]{position:sticky;top:0;display:block;margin-left:auto}';
  for(const button of dialog.querySelectorAll('button')) button.style.cssText='min-height:44px;padding:8px 12px;background:#21565a;color:white;border:1px solid #76aaa6;border-radius:8px;font:14px system-ui;touch-action:manipulation';
  const select=q=>dialog.querySelector(q), status=select('[data-status]'), canvas=select('canvas'), ctx=canvas.getContext('2d');
  let room=null,poll=null,busy=false,pending=null,frame=0,lastPoll=0,resultShown=null;
  function detailPanel(){const details=select('[data-details]');details.hidden=false;details.replaceChildren();const close=document.createElement('button');close.dataset.dismiss='';close.textContent='返回游戏';close.style.cssText='min-height:44px;padding:8px 16px;background:#21565a;color:white;border:1px solid #76aaa6;border-radius:8px';close.onclick=()=>{details.hidden=true;};details.append(close);return details;}
  function feedback(error){status.textContent=error instanceof Error?error.message:String(error);}
  function accept(value){if(room?.code!==value.code)pending=null;room=value;select('[data-room]').hidden=false;select('[data-lobby]').hidden=true;
    select('[data-room-code]').textContent=`房间 ${room.code} · ${room.players.length}/2 `;
    select('[data-ready]').hidden=room.status!=='waiting';select('[data-ready]').disabled=room.players[room.you]?.ready;
    select('[data-rematch]').hidden=!['finished','abandoned','expired'].includes(room.status);
    select('[data-board]').hidden=room.status==='playing';
    dialog.toggleAttribute('data-playing',room.status==='playing');
    const states={waiting:'等待双方准备',playing:room.players[room.you]?.result?.finished?'已完成，等待对方':'比赛中，操作由服务端确认',finished:'比赛结束，结果已确认',abandoned:'玩家退出，本局中断，不计未完成成绩',expired:'邀请已过期，请再来一局'};
    status.textContent=states[room.status]+(room.status==='playing'?` · 剩余 ${Math.max(0,Math.ceil((room.deadline-room.serverNow)/1000))} 秒`:'');
    if(room.status==='finished'&&resultShown!==room.code){resultShown=room.code;showResults();}
    try{localStorage.setItem(`competition-room:${game}`,room.code);}catch{}
  }
  async function run(task){if(busy)return;busy=true;try{await task();}catch(error){if(error.code&&error.code!=='SERVICE_UNAVAILABLE')pending=null;feedback(error);}finally{busy=false;}}
  async function refresh(){if(!room || busy || !dialog.open || Date.now()-lastPoll<(room.pollMs||1200))return;lastPoll=Date.now();try{accept(await client.request(`/rooms/${room.code}`));}catch(error){feedback(error);}}
  function showResults(){const details=detailPanel();
    const again=document.createElement('button');again.textContent='再次挑战';again.style.cssText='min-height:44px;padding:8px 16px;background:#21565a;color:white;border:1px solid #76aaa6;border-radius:8px';again.onclick=()=>select('[data-rematch]').click();details.append(again);
    for(const entry of room.results || []) {const p=document.createElement('p');const me=entry.playerId===room.players[room.you].id;
      const rank=entry.after.me?.rank,old=entry.before?.rank;
      p.textContent=`${me?'你':'对方'}：${entry.result.eligible?'有效成绩 '+scoreText(game,entry.result.score,entry.result.secondary):'本局无有效成绩'}；${game==='xiangqi-five'?'总积分':'个人最佳'} ${entry.after.me?scoreText(game,entry.after.me.score,entry.after.me.secondary):'暂无'}；排名 ${rank??'暂无'}${old&&rank?'（变化 '+(old-rank)+'）':''}；合格 ${entry.after.eligiblePlayers} 人${entry.after.previous?'；下一目标 '+scoreText(game,entry.after.previous.score,entry.after.previous.secondary):''}${entry.reason?'；'+entry.reason:''}`;
      details.append(p);
      const gap=document.createElement('p');gap.textContent=`${me?'你':'对方'}：${gapText(game,entry.after)}`;details.append(gap);
    }
  }
  async function showBoard(){const board=await client.request(`/boards/${game}`),details=detailPanel();
    const summary=document.createElement('p');summary.textContent=`${game==='xiangqi-five'?'总积分':'个人最佳'} ${board.me?scoreText(game,board.me.score,board.me.secondary):'暂无'}；${gapText(game,board)}`;details.append(summary);
    for(const text of [board.description||board.title,`合格参赛 ${board.eligiblePlayers} 人；我的排名 ${board.me?.rank??'尚无有效成绩'}`,...board.top.map(row=>`${row.rank}. 玩家 ${row.playerId.slice(0,8)} · ${scoreText(game,row.score,row.secondary)}`)]) {const p=document.createElement('p');p.textContent=text;details.append(p);}
    if(!board.top.length){const p=document.createElement('p');p.textContent='全站榜暂为空，完成一次有效挑战即可参与。';details.append(p);}
  }
  function draw(){if(!dialog.open)return;const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
    const width=Math.floor(rect.width*ratio),height=Math.floor(rect.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    if(room?.state)renderer.draw(ctx,rect.width,rect.height,room.state);frame=requestAnimationFrame(draw);
  }
  async function open(){window.dispatchEvent(new CustomEvent('competition-visibility',{detail:{open:true}}));dialog.showModal();draw();poll=setInterval(refresh,250);
    const invite=new URL(location.href).searchParams.get('pk');
    let saved;try{saved=localStorage.getItem(`competition-room:${game}`);}catch{}
    if(invite && /^[A-F0-9]{12}$/.test(invite)){select('[data-code]').value=invite;feedback('已读取邀请，请点击加入。');}
    else if(saved) await run(async()=>accept(await client.request(`/rooms/${saved}`)));
  }
  launch.onclick=()=>void open();
  select('[data-create]').onclick=()=>void run(async()=>accept(await client.request('/rooms',{body:JSON.stringify({game})})));
  select('[data-join]').onclick=()=>void run(async()=>{const result=await client.request('/rooms/join',{body:JSON.stringify({code:select('[data-code]').value.trim().toUpperCase(),game})});accept(result);});
  select('[data-ready]').onclick=()=>void run(async()=>accept(await client.request(`/rooms/${room.code}/ready`,{body:'{}'})));
  select('[data-rematch]').onclick=()=>void run(async()=>{const result=await client.request(`/rooms/${room.code}/rematch`,{body:'{}'});accept(await client.request('/rooms/join',{body:JSON.stringify({code:result.rematch})}));select('[data-details]').hidden=true;});
  select('[data-share]').onclick=()=>void run(async()=>{const url=new URL(location.href);url.searchParams.set('pk',room.code);await navigator.clipboard.writeText(url.href);feedback('邀请链接已复制；也可发送房间码 '+room.code);});
  select('[data-board]').onclick=()=>void run(showBoard);
  select('[data-rules]').onclick=()=>void run(async()=>{if(!select('[data-details]').hidden){select('[data-details]').hidden=true;return;}const details=detailPanel();const p=document.createElement('p');p.textContent='正在读取比赛规则…';details.append(p);p.textContent=room?.state?.rules || (await client.request(`/boards/${game}`)).description || '双方准备后开始，服务端验证操作与计时。';});
  select('[data-close]').onclick=()=>{dialog.close();void run(async()=>{try{if(room&&['waiting','playing'].includes(room.status))await client.request(`/rooms/${room.code}/leave`,{body:'{}'});}catch{launch.textContent='已退出 · 房间待确认';launch.title='网络不可用，服务端尚未确认退出。重连可查看原房间，否则按时限结束。';}});};
  dialog.addEventListener('cancel',event=>{event.preventDefault();select('[data-close]').click();});
  dialog.addEventListener('close',()=>{clearInterval(poll);cancelAnimationFrame(frame);window.dispatchEvent(new CustomEvent('competition-visibility',{detail:{open:false}}));});
  canvas.addEventListener('pointerup',event=>{if(!room||room.status!=='playing')return;const rect=canvas.getBoundingClientRect();const action=renderer.tap(event.clientX-rect.left,event.clientY-rect.top,room.state);if(!action)return;
    void run(async()=>{if(!pending)pending={seq:room.seq+1,action};const next=await client.request(`/rooms/${room.code}/actions`,{body:JSON.stringify(pending)});pending=null;accept(next);});});
  if(new URL(location.href).searchParams.has('pk'))void open();
}
