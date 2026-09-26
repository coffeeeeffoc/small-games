import Phaser from 'phaser';
import { CourseScene } from './scene';
import { HEIGHT, levels, WIDTH } from './levels';
import { length } from './geometry';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <header><a class="brand" href="./" aria-label="一笔造关首页"><span class="brand-mark">〰</span><div>一笔造关<small>ONE STROKE / YOUR COURSE</small></div></a>
    <div class="tagline">一张纸，一笔路，一次冒险。</div><div class="utilities"><button id="sound" title="切换音效">声音 开</button><button id="fullscreen" title="进入或退出全屏">全屏 ⛶</button><button id="help-button" aria-label="查看玩法帮助">?</button></div></header>
  <main>
    <nav class="chapter-bar" aria-label="选择关卡"><span class="chapter-label">12 关 · 滑动选关</span><div class="chapters">${levels.map((l,i)=>`<button data-level="${i}" title="${l.name}"><b>${l.id==='free'?'∞':String(i+1).padStart(2,'0')}</b><span>${l.name}</span></button>`).join('')}</div></nav>
    <section class="workbench" aria-label="一笔造关游戏区域">
      <div class="statusbar"><div class="phase"><span id="phase-number">01</span><strong id="phase-name">画一条路</strong></div><div class="run-stats"><span id="star-stat">☆ ☆ ☆</span><span id="timer">0.00<small>s</small></span></div><div class="ink-stat"><span>剩余墨水 <b id="ink-value">1060</b></span><meter id="ink-meter" min="0" max="1060" value="1060"></meter></div></div>
      <div id="stage"><div id="game"></div><span class="anchor-label start-label">起笔 →</span><div id="pause-panel" class="overlay" hidden><div class="card"><span class="eyebrow">TAKE A BREATH</span><h2>试跑已暂停</h2><p>计时已停止，按键已释放。</p><div class="result-actions"><button id="resume" class="primary">继续试跑 →</button><button id="pause-retry">重新试跑</button><button id="pause-redraw">重新画线</button></div></div></div>
        <div id="result-panel" class="overlay" hidden><div class="card result"><span id="result-eyebrow" class="eyebrow">RUN COMPLETE</span><h2 id="result-title"></h2><div id="result-score"></div><p id="result-stats"></p><p id="geometry-stat"></p><div id="score-parts"></div><p id="result-advice"></p><div class="result-actions"><button id="retry" class="primary">再跑一次 ↻</button><button id="result-redraw">重新画线</button><button id="next">下一关 →</button></div></div></div>
      </div>
      <div class="message-row"><span id="status-dot">●</span><p id="message" role="status" aria-live="polite"></p><div class="message-action"><span id="draft-state"></span><button id="redraw-inline" hidden title="清空整条笔画，从起点重新画">↶ 重新画线</button></div></div>
    </section>
    <div class="toolbar"><div class="drawing-actions"><button id="redraw">↶ 重新画线</button><button id="example">查看示例</button><button id="alternate" hidden>另一种画法</button><button id="save">保存草稿</button><button id="load">加载草稿</button></div><div class="touch-controls" aria-label="移动操作"><button data-control="left" aria-label="向左移动">←</button><button data-control="right" aria-label="向右移动">→</button><button data-control="jump" aria-label="跳跃">跳跃 ↑</button></div><div class="primary-actions"><span id="control-hint">A / D 移动 <kbd>空格</kbd> 跳跃</span><button id="pause-button" hidden>暂停 Ⅱ</button><button id="start" class="primary" disabled>开始试跑 →</button></div></div>
  </main><footer><span>画线改变关卡，操作决定结果。</span><span>本地实验 · 无需登录</span></footer>
  <dialog id="help"><button id="close-help" class="close" aria-label="关闭帮助">×</button><span class="eyebrow">HOW TO PLAY</span><h2>画一条你能跑过的路。</h2><ol><li>从左侧圆环按下，连续画到右侧圆环，松手结束。</li><li>一笔成形，不可补画；不满意就「重新画线」。</li><li>开始试跑，A / D 或方向键移动，空格跳跃。手机可同时按方向和跳跃。</li><li>收集星星，避开危险，抵达旗帜。后续关卡需要跳跃取钥匙、等压门、躲移动锯轮、中途停稳充能，或在终点停稳。逆风会改变跳跃落点。反方向按键可以刹车。失败可一键重试。</li></ol><p>通关 50 分 + 星星 30 分 + 墨水 10 分 + 时间 10 分。各分项四舍五入后求和。画线和暂停不计时。</p><p>星星、障碍、墨水会改变路线选择。示例只提供一条路线，仍需亲自操控。</p><p>草稿只存本机浏览器。自测状态与最佳分数属于当前笔画及规则版本，不是防篡改证明。</p></dialog>
  <div id="rotate"><span>↻</span><h2>把手机横过来</h2><p>留一张宽一点的纸，<br>来画你自己的冒险。</p><small>横屏后可点击「全屏」获得更大操作空间。</small></div>`;
const scene=new CourseScene();
const el=<T extends HTMLElement=HTMLElement>(id: string)=>document.getElementById(id) as T;
const button=(id: string,action: ()=>void)=>el(id).addEventListener('click',()=>{action();el(id).blur();render();});
let ready=false,lastPhase='',lastLevel=-1;
window.addEventListener('course-ready',()=>{
  ready=true;
  button('start',()=>scene.start());button('retry',()=>scene.start());button('redraw',()=>scene.redraw());button('result-redraw',()=>scene.redraw());
  button('redraw-inline',()=>scene.redraw());
  button('example',()=>scene.example());button('alternate',()=>scene.example(true));button('save',()=>scene.save());button('load',()=>scene.loadLocal());button('resume',()=>scene.resume());button('pause-retry',()=>scene.start());button('pause-redraw',()=>scene.redraw());button('pause-button',()=>scene.pause());
  button('next',()=>scene.select(Math.min(levels.length-1,scene.levelIndex+1)));
  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b=>b.addEventListener('click',()=>{scene.select(Number(b.dataset.level));b.blur();render();}));
  window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(scene.paused)scene.resume();else scene.pause();render();}});
  render();
});
button('sound',()=>{scene.effects.unlock();scene.effects.muted=!scene.effects.muted;el('sound').textContent=`声音 ${scene.effects.muted?'关':'开'}`;el('sound').setAttribute('aria-pressed',String(scene.effects.muted));});
button('fullscreen',()=>{
  const request=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();
  if(request)void request.catch(()=>{scene.message='当前浏览器不支持全屏，请横屏游玩。';render();});
  else{scene.message='当前浏览器未提供全屏接口，请横屏游玩。';render();}
});
document.addEventListener('fullscreenchange',()=>{el('fullscreen').textContent=document.fullscreenElement?'退出全屏 ⛶':'全屏 ⛶';});
button('help-button',()=>{if(ready)scene.pause();el<HTMLDialogElement>('help').showModal();});
button('close-help',()=>el<HTMLDialogElement>('help').close());
function render(): void {
  if(!ready)return;
  const state=scene.snapshot(),running=state.phase==='running',settled=state.phase==='success'||state.phase==='failure';
  document.body.dataset.phase=state.phase;
  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b=>{const selected=Number(b.dataset.level)===scene.levelIndex;b.classList.toggle('selected',selected);b.setAttribute('aria-current',String(selected));b.disabled=running;});
  if(lastLevel!==scene.levelIndex){document.querySelector('.chapters .selected')?.scrollIntoView({block:'nearest',inline:'center'});lastLevel=scene.levelIndex;}
  const phaseNames={drawing:'画一条路',ready:'赛道已就绪',running:'亲手跑过它',success:'挑战完成',failure:'再试一种可能'};
  el('phase-name').textContent=phaseNames[state.phase];el('phase-number').textContent=running?'02':settled?'03':'01';
  el('star-stat').textContent='★'.repeat(state.stars)+'☆'.repeat(3-state.stars);el('timer').innerHTML=`${state.elapsed.toFixed(2)}<small>s</small>`;
  const remaining=Math.max(0,scene.level.inkBudget-state.usedInk);
  el('ink-value').textContent=String(Math.floor(remaining));el<HTMLMeterElement>('ink-meter').max=scene.level.inkBudget;el<HTMLMeterElement>('ink-meter').value=remaining;
  el('message').textContent=running&&state.objective?state.objective:state.message;el('draft-state').textContent=scene.draft?scene.draft.tested?`已自测 · 最佳 ${scene.draft.best} 分`:'未自测':'';
  const showRedraw=!running&&!settled&&(state.points.length>1||state.preview.length>1);
  el('redraw-inline').hidden=!showRedraw;el('draft-state').hidden=showRedraw;
  el('message').parentElement!.classList.toggle('has-stroke',showRedraw);
  el<HTMLButtonElement>('start').disabled=state.phase!=='ready';el('start').hidden=running||settled;
  el('pause-button').hidden=!running;el('pause-panel').hidden=!state.paused;
  ['example','alternate','save','load'].forEach(id=>{el<HTMLButtonElement>(id).disabled=running||(id==='save'&&!scene.draft);});
  el('alternate').hidden=!scene.level.alternate;
  el('result-panel').hidden=!settled;
  el('next').hidden=state.phase!=='success'||scene.levelIndex===levels.length-1;
  if(settled && (lastPhase!==state.phase||el('result-title').dataset.level!==state.level)){
    el('result-title').dataset.level=state.level;
    el('result-eyebrow').textContent=state.phase==='success'?'RUN COMPLETE / 本次试跑':'TRY AGAIN / 本次试跑';
    el('result-title').textContent=state.phase==='success'?'这条路，你跑通了！':'差一点，换个办法。';
    el('result-score').textContent=state.score?`${state.score.total} 分`:`前进 ${Math.round(state.progress*100)}%`;
    el('result-stats').textContent=`本局 ${state.elapsed.toFixed(2)} 秒 · ${state.stars}/3 颗星`;
    el('geometry-stat').textContent=`赛道几何：长度 ${length(scene.points).toFixed(1)} · ${scene.points.length} 个折点`;
    el('score-parts').innerHTML=state.score?`<span>通关<b>${state.score.base}/50</b></span><span>星星<b>${state.score.stars}/30</b></span><span>墨水<b>${state.score.ink}/10</b></span><span>时间<b>${state.score.time}/10</b></span>`:'';
    el('result-advice').textContent=state.message;
    const primaryAction=el('next').hidden?'retry':'next';
    for(const id of ['retry','next'])el(id).classList.toggle('primary',id===primaryAction);
    el(primaryAction).focus({preventScroll:true});
  }
  lastPhase=state.phase;
}
setInterval(render,80);
// Explicit diagnostic opt-in; never used by normal gameplay or production builds.
if(import.meta.env.DEV && new URLSearchParams(location.search).has('test')){
  Object.assign(window,{__course:scene});
}
// Register ready/UI listeners before Phaser boots, including warm-cache page reloads.
new Phaser.Game({type:Phaser.AUTO,parent:'game',width:WIDTH,height:HEIGHT,backgroundColor:'#f9f7ef',
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
  physics:{default:'matter',matter:{gravity:{x:0,y:1},autoUpdate:false,positionIterations:8,velocityIterations:8}},
  render:{antialias:true,pixelArt:false},scene:[scene],audio:{noAudio:true}});
