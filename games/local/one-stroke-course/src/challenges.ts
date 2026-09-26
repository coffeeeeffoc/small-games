import type Phaser from 'phaser';
import { BALL_RADIUS, TRACK_RADIUS, type Challenge, type Level } from './levels';
import { CoursePhysics, STEP } from './physics';

export function gateState(config: Extract<Challenge,{kind:'gate'}>,seconds: number) {
  const period=config.closed+2*config.travel+config.open;
  const phase=(seconds+(config.offset??0))%period;
  let lift=0;
  if(phase>=config.closed&&phase<config.closed+config.travel)lift=(phase-config.closed)/config.travel;
  else if(phase>=config.closed+config.travel&&phase<config.closed+config.travel+config.open)lift=1;
  else if(phase>=config.closed+config.travel+config.open)lift=1-(phase-config.closed-config.travel-config.open)/config.travel;
  return {bottom:515-270*lift,open:lift===1,
    untilOpen:phase<config.closed?config.closed-phase:0,
    untilClose:phase>=config.closed&&phase<config.closed+config.travel+config.open?config.closed+config.travel+config.open-phase:0};
}

/** Goal-specific sensors and state, all in the existing Phaser Matter world. */
class Mechanism {
  keyTaken=false;
  holdSeconds=0;
  gateBottom=515;
  private key?: MatterJS.BodyType;
  private gate?: MatterJS.BodyType;
  private gateHit=false;
  private saw?: MatterJS.BodyType;
  private charged=false;
  private platform?: MatterJS.BodyType;
  constructor(private course: CoursePhysics,private level: Level,readonly config: Challenge) {
    const c=this.config,m=course.matter;
    if(c?.kind==='key')this.key=m.add.circle(c.position.x,c.position.y,13,{isStatic:true,isSensor:true,label:'air-key'});
    if(c?.kind==='gate')this.gate=m.add.rectangle(c.x,285,c.width,460,{isStatic:true,isSensor:true,label:'press'});
    if(c.kind==='saw')this.saw=m.add.circle(c.x,this.sawY(0),c.radius,{isStatic:true,isSensor:true,label:'saw'});
    if(c.kind==='charge'){
      this.platform=m.add.rectangle(c.x,c.y, c.width,TRACK_RADIUS*2,{isStatic:true,friction:.015,frictionStatic:.02,label:'charge-pad'});
      course.solids.push(this.platform);
    }
  }
  private sawY(seconds: number): number {const c=this.config;return c.kind==='saw'?c.y+Math.sin((seconds+(c.offset??0))*Math.PI*2/c.period)*c.amplitude:0;}
  beforeStep(seconds: number): void {
    const c=this.config,b=this.course.ball;
    if(c.kind==='wind'){
      const r=c.area;if(b.position.x>=r.x&&b.position.x<=r.x+r.w&&b.position.y>=r.y&&b.position.y<=r.y+r.h)
        this.course.matter.body.applyForce(b,b.position,{x:c.force*b.mass,y:0});
    }
    if(this.saw){this.course.matter.body.setPosition(this.saw,{x:this.saw.position.x,y:this.sawY(seconds)});this.gateHit=this.course.touching([this.saw]);}
    if(this.config?.kind!=='gate'||!this.gate)return;
    this.gateBottom=gateState(this.config,seconds).bottom;
    this.course.matter.body.setPosition(this.gate,{x:this.config.x,y:this.gateBottom-230});
    this.gateHit=this.course.touching([this.gate]);
  }
  update(): string|null {
    const c=this.config,b=this.course.ball;
    if(this.key&&!this.keyTaken&&!this.course.grounded&&this.course.jumps>0&&this.course.touching([this.key])){
      this.keyTaken=true;this.course.matter.world.remove(this.key);this.key=undefined;
    }
    if(this.gate&&(this.gateHit||this.course.touching([this.gate])))return '撞上压门了。先在门前按反方向减速，等门抬起再通过；也可以画一段更好停留的缓坡。';
    if(this.saw&&(this.gateHit||this.course.touching([this.saw])))return '碰到巡游锯轮了。观察它的上下移动，在它远离赛道时通过；改线高度会改变安全窗口。';
    if(c.kind==='charge'&&!this.charged){
      const inside=Math.abs(b.position.x-c.x)+BALL_RADIUS<=c.width/2;
      const onPad=Math.abs(b.position.y-(c.y-TRACK_RADIUS-BALL_RADIUS))<3;
      this.holdSeconds=inside&&onPad&&this.course.grounded&&Math.hypot(b.velocity.x,b.velocity.y)<=c.speed?this.holdSeconds+STEP/1000:0;
      if(this.holdSeconds>=c.hold)this.charged=true;
    }
    if(c?.kind==='parking'){
      if(b.position.x>c.edge)return '冲过终点断崖了。刹车要提前：向右冲刺时按左减速，或把末段画成缓冲上坡。';
      const inside=b.position.x-BALL_RADIUS>=c.left&&b.position.x+BALL_RADIUS<=c.right;
      const onPad=Math.abs(b.position.y-(this.level.end.y-TRACK_RADIUS-BALL_RADIUS))<3;
      const slow=Math.hypot(b.velocity.x,b.velocity.y)<=c.speed;
      this.holdSeconds=inside&&onPad&&this.course.grounded&&slow?this.holdSeconds+STEP/1000:0;
    }
    return null;
  }
  get canFinish(): boolean {
    if(this.config?.kind==='key')return this.keyTaken;
    if(this.config?.kind==='parking')return this.holdSeconds>=this.config.hold;
    if(this.config.kind==='charge')return this.charged;
    return true;
  }
  get locked(): boolean {return this.config.kind==='key'&&!this.keyTaken||this.config.kind==='charge'&&!this.charged;}
  get done(): boolean {
    const c=this.config,x=this.course.ball.position.x;
    if(c.kind==='key')return this.keyTaken;
    if(c.kind==='charge')return this.charged;
    if(c.kind==='parking')return this.canFinish;
    if(c.kind==='wind')return x>c.area.x+c.area.w;
    return x>c.x+(c.kind==='gate'?c.width/2:c.radius)+BALL_RADIUS;
  }
  get x(): number {const c=this.config;return c.kind==='key'?c.position.x:c.kind==='parking'?c.left:c.kind==='wind'?c.area.x:c.x;}
  status(seconds: number): string {
    const c=this.config;
    if(c?.kind==='key')return this.keyTaken?'钥匙已取得！落回赛道，前往终点。':'终点未解锁 · 起跳碰到悬空钥匙 · 金框内小球可进入，不能画线';
    if(c?.kind==='gate'){
      if(this.course.ball.position.x>c.x+c.width/2+BALL_RADIUS)return '压门已通过！继续向终点前进。';
      const state=gateState(c,seconds);
      return state.open?`门已抬起 · ${state.untilClose.toFixed(1)} 秒后落下 · 向右通过`:
        state.untilOpen>0?`压门关闭 · ${state.untilOpen.toFixed(1)} 秒后抬起 · 门前按反方向减速`:'压门正在移动 · 等到绿色通行灯再出发';
    }
    if(c?.kind==='parking')return `终点停稳 ${Math.min(this.holdSeconds,c.hold).toFixed(1)} / ${c.hold.toFixed(1)} 秒 · 当前速度 ${Math.round(Math.hypot(this.course.ball.velocity.x,this.course.ball.velocity.y)*60)} · 目标 ≤ ${Math.round(c.speed*60)} · 反方向刹车`;
    if(c.kind==='charge')return this.charged?'充能完成，可以出发！':`蓝台充能 ${Math.min(this.holdSeconds,c.hold).toFixed(1)} / ${c.hold.toFixed(1)} 秒 · 整球入台、低速接地 · 按反方向刹车`;
    if(c.kind==='saw')return '锯轮上下移动 · 在它远离你的赛道时通过 · 反方向可以刹车等待';
    if(c.kind==='wind')return '逆风区 ← 空中更容易被吹回，靠近目标后再起跳';
    return '';
  }
  paint(g: Phaser.GameObjects.Graphics,seconds: number): void {
    const c=this.config;
    if(c?.kind==='key'){
      const r=c.noInk;
      g.fillStyle(0xe6b33c,.07);g.fillRect(r.x,r.y,r.w,r.h);g.lineStyle(1,0xc79b36,.7);
      for(let x=r.x;x<r.x+r.w;x+=14){g.lineBetween(x,r.y,Math.min(x+7,r.x+r.w),r.y);g.lineBetween(x,r.y+r.h,Math.min(x+7,r.x+r.w),r.y+r.h);}
      for(let y=r.y;y<r.y+r.h;y+=14){g.lineBetween(r.x,y,r.x,Math.min(y+7,r.y+r.h));g.lineBetween(r.x+r.w,y,r.x+r.w,Math.min(y+7,r.y+r.h));}
      if(!this.keyTaken){const p=c.position;g.lineStyle(5,0xc59527);g.strokeCircle(p.x-5,p.y-4,8);g.lineBetween(p.x+1,p.y+2,p.x+16,p.y+17);g.lineBetween(p.x+12,p.y+13,p.x+18,p.y+7);}
    }
    if(c?.kind==='gate'){
      const state=gateState(c,seconds),left=c.x-c.width/2;
      g.fillStyle(0xd66749,.07);g.fillRect(left,125,c.width,390);
      g.lineStyle(1,0xb48873,.5);g.lineBetween(left,125,left,515);g.lineBetween(left+c.width,125,left+c.width,515);
      g.fillStyle(0x667c77);g.fillRect(left,125,c.width,Math.max(0,this.gateBottom-125));
      g.fillStyle(0xd66749);g.fillRect(left,this.gateBottom-12,c.width,12);
      g.fillStyle(state.open?0x267e79:0xd66749);g.fillCircle(c.x,109,8);
      g.lineStyle(2,0xd66749,.6);for(let y=365;y<470;y+=12)g.lineBetween(c.x-110,y,c.x-110,y+6);
    }
    if(c?.kind==='parking'){
      const y=this.level.end.y-TRACK_RADIUS;
      g.fillStyle(0x267e79,.14);g.fillRect(c.left,y-40,c.right-c.left,40);g.lineStyle(2,0x267e79);g.strokeRect(c.left,y-40,c.right-c.left,40);
      g.fillStyle(0x267e79);g.fillRect(c.left,y+6,(c.right-c.left)*Math.min(1,this.holdSeconds/c.hold),5);
      g.lineStyle(2,0xd66749);g.lineBetween(c.edge,y-35,c.edge,y+55);
      for(let x=890;x<949;x+=20){g.lineBetween(x+8,y-50,x,y-43);g.lineBetween(x,y-43,x+8,y-36);}
    }
    if(c.kind==='charge'){
      g.fillStyle(0x467eaa,.12);g.fillRect(c.x-c.width/2,c.y-46,c.width,40);
      g.lineStyle(2,0x467eaa);g.strokeRect(c.x-c.width/2,c.y-46,c.width,40);
      g.fillStyle(this.charged?0x267e79:0x467eaa);g.fillRect(c.x-c.width/2,c.y-6,c.width,12);
      g.fillStyle(0xe6b33c);g.fillRect(c.x-c.width/2,c.y+10,c.width*Math.min(1,this.holdSeconds/c.hold),5);
      g.lineStyle(3,0x467eaa);g.strokePoints([{x:c.x+4,y:c.y-40},{x:c.x-5,y:c.y-27},{x:c.x+5,y:c.y-27},{x:c.x-4,y:c.y-14}]);
    }
    if(c.kind==='saw'){
      const y=this.saw?.position.y??this.sawY(seconds);
      g.lineStyle(2,0xd66749,.25);g.lineBetween(c.x,c.y-c.amplitude,c.x,c.y+c.amplitude);
      const teeth=Array.from({length:24},(_,i)=>{const angle=i*Math.PI/12+seconds*3,r=i%2?c.radius-6:c.radius;return {x:c.x+Math.cos(angle)*r,y:y+Math.sin(angle)*r};});
      g.fillStyle(0xd66749);g.fillPoints(teeth,true);g.lineStyle(2,0x864936);g.strokePoints(teeth,true);g.fillStyle(0xf9f7ef);g.fillCircle(c.x,y,7);
    }
    if(c.kind==='wind'){
      const r=c.area;g.fillStyle(0x799bae,.08);g.fillRect(r.x,r.y,r.w,r.h);g.lineStyle(1,0x467eaa,.4);
      for(let y=r.y+25;y<r.y+r.h;y+=40)for(let x=r.x+20;x<r.x+r.w-20;x+=65){const dx=(seconds*40)%20;g.lineBetween(x+dx,y,x+dx+25,y);g.lineBetween(x+dx,y,x+dx+6,y-5);}
    }
  }
  destroy(): void {for(const body of [this.key,this.gate,this.saw,this.platform])if(body)this.course.matter.world.remove(body);}
}

/** Multiple independent mechanisms share the same ball, clock and Matter world. */
export class ChallengeRun {
  private readonly items: Mechanism[];
  constructor(course: CoursePhysics,level: Level){this.items=level.challenges.map(c=>new Mechanism(course,level,c)).sort((a,b)=>a.x-b.x);}
  beforeStep(seconds: number): void {this.items.forEach(m=>m.beforeStep(seconds));}
  update(): string|null {let failure: string|null=null;for(const m of this.items)failure??=m.update();return failure;}
  get keyCount(): number {return this.items.filter(m=>m.config.kind==='key'&&m.keyTaken).length;}
  get keyTaken(): boolean {const keys=this.items.filter(m=>m.config.kind==='key');return keys.length>0&&keys.every(m=>m.keyTaken);}
  get holdSeconds(): number {return Math.max(0,...this.items.map(m=>m.holdSeconds));}
  get gateBottom(): number {return this.items.find(m=>m.config.kind==='gate')?.gateBottom??515;}
  get canFinish(): boolean {return this.items.every(m=>m.canFinish);}
  get locked(): boolean {return this.items.some(m=>m.locked);}
  get unmet(): string {return this.items.some(m=>m.config.kind==='key'&&m.locked)?'终点仍上锁：还有悬空钥匙没拿到。调整坡度与起跳位置，再试一次。':'终点仍上锁：充能台没有充满。整球在蓝台低速接地，进度填满后再出发。';}
  status(seconds: number): string {return this.items.find(m=>!m.done)?.status(seconds)??(this.items.length?'机关已完成，前往终点！':'');}
  paint(g: Phaser.GameObjects.Graphics,seconds: number): void {this.items.forEach(m=>m.paint(g,seconds));}
  destroy(): void {this.items.forEach(m=>m.destroy());}
}
