import Phaser from 'phaser';
import { BALL_RADIUS, HEIGHT, levels, TRACK_RADIUS, WIDTH, type Point } from './levels';
import { distance, finishStroke, GEOMETRY, length, processStroke, validateGeometry } from './geometry';
import { Controls, DrawingInput } from './input';
import { CoursePhysics, STEP } from './physics';
import { Sound } from './audio';
import { advice, clamp01, scoreRun, type Score } from './scoring';
import { loadDraft, newDraft, saveDraft, type Draft } from './storage';
import { ChallengeRun } from './challenges';
export type Phase='drawing'|'ready'|'running'|'success'|'failure';
const INK=0x293c43,TEAL=0x267e79,CORAL=0xd66749,GOLD=0xe6b33c;
export class CourseScene extends Phaser.Scene {
  levelIndex=0;
  phase: Phase='drawing';
  paused=false;
  manual=false;
  points: Point[]=[];
  preview: Point[]=[];
  elapsed=0;
  collected=new Set<string>();
  progress=0;
  message='';
  failure='';
  score: Score|null=null;
  draft: Draft|null=null;
  course!: CoursePhysics;
  challenge!: ChallengeRun;
  controls!: Controls;
  drawing!: DrawingInput;
  effects=new Sound();
  private accumulator=0;
  private paper!: Phaser.GameObjects.Graphics;
  private rail!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[]=[];
  private abort=new AbortController();
  private lastTone=0;
  private trail: Point[]=[];
  private lastAttempt: Point[]=[];
  private ticks=0;
  get level(){return levels[this.levelIndex];}
  constructor(){super('course');}
  create(): void {
    this.matter.world.autoUpdate=false;
    this.paper=this.add.graphics();this.rail=this.add.graphics();this.actors=this.add.graphics();
    this.controls=new Controls(()=>this.effects.unlock());
    this.drawing=new DrawingInput(this.game.canvas,{
      begin:p=>this.beginStroke(p),move:points=>this.moveStroke(points),finish:points=>this.finishDrawing(points),
      cancel:reason=>{this.preview=[];this.message=reason;this.paintTrack();},
    });
    window.addEventListener('blur',()=>this.pause(),{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},{signal:this.abort.signal});
    window.addEventListener('resize',()=>{this.drawing.cancel('屏幕尺寸变化，请重新画线。');if(window.innerHeight>window.innerWidth)this.pause();},{signal:this.abort.signal});
    this.events.once('shutdown',()=>{this.abort.abort();this.drawing.destroy();this.controls.destroy();this.challenge.destroy();this.course.destroy();});
    const requested=new URLSearchParams(location.search).get('level');
    this.select(Math.max(0,levels.findIndex(level=>level.id===requested)));
    window.dispatchEvent(new Event('course-ready'));
  }
  select(index: number): void {
    if(index<0||index>=levels.length)return;
    this.drawing?.cancel();this.levelIndex=index;this.phase='drawing';this.paused=false;this.points=[];this.preview=[];this.draft=null;
    this.lastAttempt=[];this.message=this.level.hint;this.resetRun();this.paintPaper();this.paintTrack();
  }
  private resetRun(): void {
    this.challenge?.destroy();this.course?.destroy();this.controls.clear();this.course=new CoursePhysics(this.matter,this.level,this.points);
    this.challenge=new ChallengeRun(this.course,this.level);this.trail=[];this.ticks=0;
    this.elapsed=0;this.progress=0;this.collected.clear();this.failure='';this.score=null;this.accumulator=0;
  }
  beginStroke(p: Point): boolean {
    this.effects.unlock();
    if(this.phase!=='drawing'||this.paused)return false;
    if(distance(p,this.level.start)>GEOMETRY.snap){this.message='请从左侧「起笔」圆环按下，再连续画到终点。';return false;}
    this.preview=[{...this.level.start}];this.message='一笔连接终点 · 松手结束 · 不可补画第二笔';this.paintTrack();return true;
  }
  moveStroke(raw: Point[]): void {
    this.preview=processStroke([{...this.level.start},...raw.slice(1)]);
    const over=length(this.preview)-this.level.inkBudget;
    this.message=over>0?`墨水已超出 ${Math.ceil(over)}，松手后可以重新画线。`:'一笔连接终点 · 松手结束 · 不可补画第二笔';
    this.paintTrack();
    if(performance.now()-this.lastTone>100){this.effects.play('draw');this.lastTone=performance.now();}
  }
  finishDrawing(raw: Point[]): void {
    const check=finishStroke(raw,this.level);
    this.preview=check.points;
    if(!check.ok){this.message=check.reason;this.paintTrack(true);return;}
    this.accept(check.points);
  }
  private accept(points: Point[]): void {
    this.points=points.map(p=>({...p}));this.preview=[];this.phase='ready';this.draft=newDraft(this.level,this.points);
    this.message='赛道已连通。开始试跑后，用方向键移动，空格跳跃。';this.resetRun();this.paintTrack();
  }
  example(alternate=false): void {
    if(this.phase==='running')return;
    this.drawing.cancel();const check=finishStroke(alternate&&this.level.alternate?this.level.alternate:this.level.reference,this.level);
    if(!check.ok)throw new Error(`${this.level.id}: ${check.reason}`);
    this.accept(check.points);this.message=(alternate?this.level.alternateGuide:this.level.guide)||'已载入参考笔画；仍需你亲自操控。按住右键即可验证这条路线。';
  }
  start(): void {
    if(!this.points.length||!['ready','success','failure'].includes(this.phase)&&!(this.phase==='running'&&this.paused))return;
    this.effects.unlock();this.phase='running';this.paused=false;this.resetRun();
    this.message=window.matchMedia('(pointer:coarse)').matches?'按住下方箭头移动 · 可同时按跳跃 · 松开后有惯性':'向右前进 · 空格跳跃 · Esc 暂停';
  }
  redraw(): void {
    this.drawing.cancel();this.phase='drawing';this.paused=false;this.points=[];this.preview=[];this.draft=null;this.message=this.level.hint;
    this.resetRun();this.paintTrack();
  }
  pause(): void {this.controls.clear();this.drawing.cancel();this.accumulator=0;if(this.phase==='running')this.paused=true;}
  resume(): void {this.controls.clear();this.accumulator=0;this.paused=false;}
  save(): void {
    if(!this.draft)return;
    try{saveDraft(this.draft);this.message=this.draft.tested?'已保存：本机自测通过的作品。':'已保存草稿；这条线尚未自测通过。';}
    catch{this.message='保存失败：浏览器存储不可用或空间不足。当前赛道仍可游玩。';}
  }
  loadLocal(): void {
    if(this.phase==='running')return;
    try{const draft=loadDraft(this.level);if(!draft){this.message='这个模板还没有本地草稿。';return;}this.accept(draft.points);this.draft=draft;this.message=draft.tested?`已加载本机作品 · 最佳 ${draft.best??'—'} 分`:'已加载草稿，请完成当前规则版本的自测。';}
    catch(error){this.message=`无法加载草稿：${error instanceof Error?error.message:'数据损坏'}`;}
  }
  fixedTick(axis: number,jump: boolean): void {
    if(this.phase!=='running'||this.paused)return;
    this.challenge.beforeStep(this.elapsed);
    if(this.course.step(axis,jump))this.effects.play('jump');
    this.elapsed+=STEP/1000;
    const keys=this.challenge.keyCount,challengeFailure=this.challenge.update();
    if(this.challenge.keyCount>keys)this.effects.play('star');
    for(const id of this.course.collect()){this.collected.add(id);this.effects.play('star');}
    const pos=this.course.ball.position;
    if(this.ticks++%4===0){this.trail.push({x:pos.x,y:pos.y});if(this.trail.length>180)this.trail.shift();}
    this.progress=Math.max(this.progress,clamp01((pos.x-100)/900));
    if(challengeFailure){this.finish(false,challengeFailure);return;}
    if(this.course.touching(this.course.hazards)){this.finish(false,'碰到尖刺了。把线往上抬，给小球留出更多空间。');return;}
    if(pos.y>HEIGHT+35){this.finish(false,'掉进深坑了。检查低处的弯道，或提前起跳。');return;}
    if(pos.x<0||pos.x>WIDTH||pos.y<45){this.finish(false,'离开有效区域了。试着减速，或调整赛道的弯折。');return;}
    if(this.course.touching([this.course.finish])){
      if(this.challenge.locked)this.finish(false,this.challenge.unmet);
      else if(this.challenge.canFinish)this.finish(true);
    }
  }
  private finish(won: boolean,reason=''): void {
    this.phase=won?'success':'failure';this.failure=reason;this.controls.clear();this.effects.play(won?'win':'fail');
    if(won){
      this.progress=1;this.score=scoreRun(this.level,this.collected.size,length(this.points),this.elapsed);
      this.message=advice(this.collected.size,length(this.points),this.elapsed,this.level);
      if(this.draft){this.draft.tested=true;this.draft.best=Math.max(this.draft.best??0,this.score.total);try{saveDraft(this.draft);}catch{this.message+='（自动保存失败，可手动重试保存。）';}}
    }else {this.message=reason;this.lastAttempt=this.trail.map(p=>({...p}));}
  }
  update(_time: number,delta: number): void {
    if(!this.course)return;
    if(!this.manual&&this.phase==='running'&&!this.paused){
      this.accumulator+=Math.min(delta,100);
      while(this.accumulator>=STEP){this.fixedTick(this.controls.axis,this.controls.consumeJump());this.accumulator-=STEP;}
    }
    this.paintActors();
  }
  private label(x: number,y: number,text: string,size=16,color='#56676b'): void {
    this.labels.push(this.add.text(x,y,text,{fontFamily:'"Microsoft YaHei",sans-serif',fontSize:size,color,resolution:Math.min(window.devicePixelRatio||1,2)}));
  }
  private paintPaper(): void {
    const g=this.paper;g.clear();this.labels.forEach(l=>l.destroy());this.labels=[];
    g.fillStyle(0xf9f7ef);g.fillRect(0,0,WIDTH,HEIGHT);
    g.fillStyle(0x8fa29b,.24);
    for(let x=20;x<WIDTH;x+=25)for(let y=20;y<HEIGHT;y+=25)g.fillCircle(x,y,.8);
    g.lineStyle(1,0xb8c6ba,.7);
    for(let x=155;x<955;x+=16){g.lineBetween(x,130,x+8,130);g.lineBetween(x,500,x+8,500);}
    for(let y=130;y<500;y+=16){g.lineBetween(155,y,155,y+8);g.lineBetween(955,y,955,y+8);}
    this.label(37,28,`EXPERIMENT ${String(this.levelIndex+1).padStart(2,'0')}`,12,'#768880');
    this.label(36,53,this.level.lesson,29,'#293c43');
    this.label(37,99,this.level.challenges.length?'观察机关，改变操作节奏':'画出赛道，然后亲手跑过它。',15);
    this.label(788,35,`目标  ${this.level.parInk} 墨水 / ${this.level.parTime}s`,14);
    this.label(788,61,'三颗星 · 一条自己的路',14);
    const platform=(x: number,y: number,w: number)=>{
      g.fillStyle(0xdde5da);g.fillRect(x,y-TRACK_RADIUS,w,HEIGHT-y+TRACK_RADIUS);
      g.lineStyle(2,INK);g.lineBetween(x,y-TRACK_RADIUS,x+w,y-TRACK_RADIUS);
      g.lineStyle(1,0x99afa2,.55);for(let xx=x+8;xx<x+w;xx+=18)g.lineBetween(xx,y+12,Math.min(x+w,xx+18),y+30);
    };
    const parking=this.level.challenges.find(c=>c.kind==='parking');
    platform(30,this.level.start.y,131);platform(949,this.level.end.y,parking?parking.edge-949:125);
    for(const c of this.level.challenges){
      if(c.kind==='key')this.label(c.noInk.x,c.noInk.y-22,'悬空取钥 · 禁墨区',13,'#9e7b22');
      if(c.kind==='gate')this.label(c.x+c.width/2+12,160,'红灯等 / 绿灯行',13,'#267e79');
      if(c.kind==='charge')this.label(c.x-c.width/2,c.y+28,'停稳充能 → 解锁',13,'#467eaa');
      if(c.kind==='saw')this.label(c.x-55,c.y-c.amplitude-27,'锯轮巡游 ↕',13,'#b05c42');
      if(c.kind==='wind')this.label(c.area.x,c.area.y-24,'← 逆风：起跳点更靠前',13,'#467eaa');
      if(c.kind==='parking'){this.label(840,510,'反方向刹车 → 框内停稳',13,'#267e79');this.label(c.edge+1,484,'断崖',12,'#b05c42');}
    }
    for(const r of this.level.solids){
      g.fillStyle(0x758583);g.fillRoundedRect(r.x,r.y,r.w,r.h,4);g.lineStyle(2,INK);g.strokeRoundedRect(r.x,r.y,r.w,r.h,4);
      g.lineStyle(1,0xafbcb4);for(let y=r.y+20;y<r.y+r.h;y+=25)g.lineBetween(r.x+5,y,r.x+r.w-5,y);
    }
    for(const r of this.level.hazards){
      g.fillStyle(CORAL,.12);g.fillRect(r.x,r.y,r.w,r.h);
      for(let x=r.x;x<r.x+r.w;x+=20){g.fillStyle(CORAL);g.fillTriangle(x,r.y+20,Math.min(x+10,r.x+r.w),r.y,Math.min(x+20,r.x+r.w),r.y+20);}
      this.label(r.x+14,r.y+39,'尖刺 / 危险',13,'#b44f3b');
    }
    g.lineStyle(2,0xa8b6ab,.5);g.lineBetween(162,532,945,532);
    this.label(444,533,'空白也是关卡的一部分',12,'#95a397');
    this.label(44,this.level.start.y+38,'出发',17,'#267e79');
    this.label(1000,this.level.end.y+35,'终点',17,'#267e79');
  }
  private paintTrack(invalid=false): void {
    const g=this.rail;g.clear();const points=this.points.length?this.points:this.preview;
    if(points.length>1){
      g.lineStyle(TRACK_RADIUS*2,invalid?CORAL:INK,invalid?.65:1);g.beginPath();g.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>g.lineTo(p.x,p.y));g.strokePath();
      g.fillStyle(invalid?CORAL:INK,invalid?.65:1);points.forEach(p=>g.fillCircle(p.x,p.y,TRACK_RADIUS));
    }
  }
  private paintActors(): void {
    const g=this.actors;g.clear();
    if(this.lastAttempt.length>1){
      g.lineStyle(2,CORAL,.25);g.strokePoints(this.lastAttempt);
      const p=this.lastAttempt.at(-1)!;g.lineStyle(2,CORAL,.6);g.lineBetween(p.x-5,p.y-5,p.x+5,p.y+5);g.lineBetween(p.x+5,p.y-5,p.x-5,p.y+5);
    }
    this.challenge.paint(g,this.elapsed);
    for(const p of [this.level.start,this.level.end]){
      g.fillStyle(0xf9f7ef);g.fillCircle(p.x,p.y,12);g.lineStyle(3,TEAL);g.strokeCircle(p.x,p.y,12);g.fillStyle(TEAL);g.fillCircle(p.x,p.y,4);
    }
    for(const star of this.level.stars)if(!this.collected.has(star.id)){
      const vertices: Point[]=[];
      for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?6:13;vertices.push({x:star.x+Math.cos(a)*r,y:star.y+Math.sin(a)*r});}
      g.fillStyle(GOLD);g.fillPoints(vertices,true);g.lineStyle(1.5,0x997523);g.strokePoints(vertices,true);
    }
    const fy=this.level.end.y-TRACK_RADIUS;g.lineStyle(3,INK);g.lineBetween(1018,fy,1018,fy-72);
    g.fillStyle(this.challenge.locked?0x8a9486:TEAL);g.fillTriangle(1018,fy-72,1054,fy-60,1018,fy-48);
    if(this.challenge.locked){g.lineStyle(2,CORAL);g.strokeRoundedRect(990,fy-37,18,17,3);g.strokeCircle(999,fy-39,6);}
    const {x,y}=this.course.ball.position;
    g.fillStyle(INK,.1);g.fillEllipse(x+2,y+BALL_RADIUS+5,27,6);
    g.fillStyle(this.phase==='failure'?0xeac0a9:0xf4cf63);g.fillCircle(x,y,BALL_RADIUS);g.lineStyle(2,INK);g.strokeCircle(x,y,BALL_RADIUS);
    g.fillStyle(INK);g.fillCircle(x-4,y-3,1.8);g.fillCircle(x+5,y-3,1.8);
    g.lineStyle(1.8,INK);if(this.phase==='failure')g.lineBetween(x-4,y+6,x+5,y+6);else g.strokePoints([{x:x-4,y:y+4},{x,y:y+7},{x:x+5,y:y+4}]);
    if(this.phase==='drawing'){
      g.lineStyle(1.5,TEAL,.6);g.strokeCircle(this.level.start.x,this.level.start.y,25);g.strokeCircle(this.level.end.x,this.level.end.y,25);
    }
  }
  snapshot(){return {level:this.level.id,phase:this.phase,paused:this.paused,elapsed:this.elapsed,stars:this.collected.size,progress:this.progress,
    usedInk:length(this.points.length?this.points:this.preview),points:this.points,preview:this.preview,message:this.message,failure:this.failure,score:this.score,
    ball:{x:this.course.ball.position.x,y:this.course.ball.position.y,vx:this.course.ball.velocity.x,vy:this.course.ball.velocity.y},grounded:this.course.grounded,jumps:this.course.jumps,
    keyTaken:this.challenge.keyTaken,keyCount:this.challenge.keyCount,holdSeconds:this.challenge.holdSeconds,gateBottom:this.challenge.gateBottom,objective:this.challenge.status(this.elapsed),ghostPoints:this.lastAttempt.length,
    bodies:this.matter.world.getAllBodies().length,listeners:this.matter.world.eventNames().reduce((n,e)=>n+this.matter.world.listenerCount(e),0),tested:this.draft?.tested??false};}
  check(){return validateGeometry(this.points,this.level);}
}
