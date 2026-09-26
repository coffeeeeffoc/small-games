import type Phaser from 'phaser';
import { BALL_RADIUS, TRACK_RADIUS, type Level, type Point, type Rect } from './levels';
import { distance } from './geometry';
export const STEP = 1000/120;
export const MOTION = { maxX:6.2, maxY:12, groundForce:.0019, airForce:.00065, jump:7.3, coyote:100, buffer:120 };
export class CoursePhysics {
  ball: MatterJS.BodyType;
  solids: MatterJS.BodyType[]=[];
  hazards: MatterJS.BodyType[]=[];
  finish: MatterJS.BodyType;
  track: MatterJS.BodyType[]=[];
  starBodies=new Map<string,MatterJS.BodyType>();
  grounded=false;
  jumps=0;
  private time=0;
  private lastGround=-Infinity;
  private jumpRequest=-Infinity;
  private lastJump=-Infinity;
  constructor(readonly matter: Phaser.Physics.Matter.MatterPhysics,level: Level,points: Point[]) {
    const rectangle=(r: Rect,label: string,sensor=false)=>matter.add.rectangle(r.x+r.w/2,r.y+r.h/2,r.w,r.h,{isStatic:true,isSensor:sensor,label,friction:.015,frictionStatic:.02});
    this.solids.push(rectangle({x:30,y:level.start.y-TRACK_RADIUS,w:131,h:160},'start'));
    const parking=level.challenges.find(c=>c.kind==='parking');
    const endWidth=parking?parking.edge-949:125;
    this.solids.push(rectangle({x:949,y:level.end.y-TRACK_RADIUS,w:endWidth,h:560-level.end.y},'end'));
    this.solids.push(...level.solids.map(r=>rectangle(r,'obstacle')));
    this.hazards=level.hazards.map(r=>rectangle(r,'spikes',true));
    for(let i=0;i<points.length;i++) {
      const a=points[i];
      this.track.push(matter.add.circle(a.x,a.y,TRACK_RADIUS,{isStatic:true,label:'track',friction:.015,frictionStatic:.02},20));
      if(i===0) continue;
      const b=points[i-1];
      this.track.push(matter.add.rectangle((a.x+b.x)/2,(a.y+b.y)/2,distance(a,b)+.4,TRACK_RADIUS*2,
        {isStatic:true,label:'track',angle:Math.atan2(a.y-b.y,a.x-b.x),friction:.015,frictionStatic:.02}));
    }
    this.solids.push(...this.track);
    this.finish=rectangle({x:994,y:level.end.y-87,w:48,h:82},'finish',true);
    for(const star of level.stars) this.starBodies.set(star.id,matter.add.circle(star.x,star.y,14,{isStatic:true,isSensor:true,label:star.id}));
    this.ball=matter.add.circle(100,level.start.y-TRACK_RADIUS-BALL_RADIUS-3,BALL_RADIUS,
      {label:'player',friction:.005,frictionStatic:.015,frictionAir:.009,restitution:0,density:.002,slop:.02},24);
  }
  step(axis: number,jump: boolean): boolean {
    this.time+=STEP;
    if(jump)this.jumpRequest=this.time;
    if(this.grounded && this.time-this.lastJump>150)this.lastGround=this.time;
    const canJump=this.time-this.lastGround<=MOTION.coyote && this.time-this.jumpRequest<=MOTION.buffer;
    if(canJump){
      this.matter.body.setVelocity(this.ball,{x:this.ball.velocity.x,y:-MOTION.jump});
      this.jumpRequest=-Infinity;this.lastGround=-Infinity;this.lastJump=this.time;this.grounded=false;this.jumps++;
    }
    const force=this.grounded?MOTION.groundForce:MOTION.airForce;
    this.matter.body.applyForce(this.ball,this.ball.position,{x:Math.max(-1,Math.min(1,axis))*force*this.ball.mass,y:0});
    const vx=this.ball.velocity.x,vy=this.ball.velocity.y;
    if(Math.abs(vx)>MOTION.maxX || Math.abs(vy)>MOTION.maxY) this.matter.body.setVelocity(this.ball,{x:Math.max(-MOTION.maxX,Math.min(MOTION.maxX,vx)),y:Math.max(-MOTION.maxY,Math.min(MOTION.maxY,vy))});
    this.matter.world.step(STEP);
    const velocity=this.ball.velocity;
    if(Math.abs(velocity.x)>MOTION.maxX || Math.abs(velocity.y)>MOTION.maxY)
      this.matter.body.setVelocity(this.ball,{x:Math.max(-MOTION.maxX,Math.min(MOTION.maxX,velocity.x)),y:Math.max(-MOTION.maxY,Math.min(MOTION.maxY,velocity.y))});
    // Matter normal points from bodyB to bodyA. Walls and ceilings cannot refresh coyote time.
    this.grounded=this.matter.query.collides(this.ball,this.solids).some(c=>{
      const ny=c.bodyA===this.ball?c.normal.y:-c.normal.y;
      return ny<-.55 && c.supports.some(p=>p && p.y>this.ball.position.y+BALL_RADIUS*.3);
    });
    return canJump;
  }
  touching(bodies: MatterJS.BodyType[]): boolean {return this.matter.query.collides(this.ball,bodies).length>0;}
  collect(): string[] {
    const collected: string[]=[];
    for(const [id,body] of this.starBodies) if(this.touching([body])) {collected.push(id);this.matter.world.remove(body);this.starBodies.delete(id);}
    return collected;
  }
  destroy(): void {
    this.matter.world.remove([...this.solids,...this.hazards,this.finish,this.ball,...this.starBodies.values()]);
    // Remove stale contact pairs immediately, rather than waiting for the next simulation tick.
    this.matter.pairs.clear(this.matter.world.engine.pairs);
  }
}
