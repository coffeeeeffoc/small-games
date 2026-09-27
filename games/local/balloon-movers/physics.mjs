const M = globalThis.Matter ?? (await import('./vendor/matter.js')).default;
const { Engine, Bodies, Body, Composite, Constraint, Vector, Events } = M;
export const STEP = 1000 / 120;
export const SIZE = { w: 760, h: 620 };
export const LEVELS = [
  { name: '沙发先走', item: '沙发', w: 116, h: 56, com: 0, anchorY: -20, opening: [95, 390], wind: .000055, startY: 479, hint: '先绑气球。飞过窗后，左右轮流排气，落到黄垫上。', setup: { left: 2, right: 2, longLeft: false, longRight: false } },
  { name: '冰箱侧身', item: '冰箱', w: 64, h: 130, com: 0, anchorY: -9, opening: [190, 365], wind: .00005, startY: 442, hint: '左右气量不同，冰箱就会倾斜。轻擦窗沿没关系。', setup: { left: 1, right: 2, longLeft: false, longRight: false } },
  { name: '钢琴窄窗', item: '钢琴', w: 152, h: 82, com: 17, anchorY: -25, opening: [193, 370], wind: .00005, startY: 466, hint: '重心偏右：右端多绑。短绳收紧轮廓，长绳更容易碰窗沿。', setup: { left: 1, right: 2, longLeft: false, longRight: false } }
];
export function createGame(levelIndex, setup = LEVELS[levelIndex]?.setup) {
  const level = LEVELS[levelIndex];
  if (!level || !setup || !['left','right'].every(k => Number.isInteger(setup[k]) && setup[k] >= 0 && setup[k] <= 3) || setup.left + setup.right > 4) throw new Error('无效装配');
  const engine = Engine.create({ positionIterations: 8, velocityIterations: 6, constraintIterations: 8 });
  engine.gravity.y = 1; engine.gravity.scale = .00008;
  const worldRect = (x,y,w,h,label) => Bodies.rectangle(x,y,w,h,{ isStatic:true, label, friction:.8, restitution:.02, collisionFilter:{category:1,mask:15} });
  const [top,bottom] = level.opening;
  const ground = worldRect(170, 524, 340, 34, 'floor');
  const upper = worldRect(364, top / 2, 26, top, 'frame');
  const lower = worldRect(364, (bottom + 610) / 2, 26, 610 - bottom, 'frame');
  const mat = worldRect(579, 522, 334, 34, 'mat');
  const furniture = Bodies.rectangle(148, level.startY, level.w, level.h, { frictionAir:.042, friction:.65, restitution:.03, collisionFilter:{category:2,mask:5}, label:'furniture' });
  Body.setMass(furniture, 3);
  Body.setCentre(furniture, { x:level.com,y:0 }, true);
  Body.setInertia(furniture, 3 * (level.w ** 2 + level.h ** 2) / 12 + 3 * level.com ** 2);
  const state = { engine, furniture, ground, mat, walls:[upper,lower], balloons:[], level, levelIndex, setup:{...setup}, tick:0, phase:'ready', reason:'', settled:0, settleOrigin:null, lastSupport:-999, bumps:0, lastBump:-999, peakAngle:0 };
  Composite.add(engine.world, [ground, upper, lower, mat, furniture]);
  for (const [side, count] of [['left',setup.left], ['right',setup.right]]) {
    for(let n=0;n<count;n++) {
      const direction = side === 'left' ? -1 : 1;
      const ringX = direction * (level.w / 2 - 8);
      const long = side === 'left' ? setup.longLeft : setup.longRight;
      const length = long ? 54 : 34;
      const dx = direction * (17 + n * 5);
      const pointA = {x:ringX-level.com,y:level.anchorY};
      const pos = {x:148+ringX+dx,y:level.startY+level.anchorY-Math.sqrt(length*length-dx*dx)};
      const body = Bodies.circle(pos.x,pos.y,13,{frictionAir:.06,friction:.1,restitution:0,collisionFilter:{category:4,mask:3,group:-1}, label:'balloon'});
      Body.setMass(body,.045);
      const a=Vector.add(furniture.position,pointA), delta=Vector.sub(pos,a), angle=Math.atan2(delta.y,delta.x), half=length/4;
      // ponytail: two collision links per tether; no winding, knotting or rope editing. More segments only if a future layout needs bending.
      const links=[.25,.75].map(t=>{const link=Bodies.rectangle(a.x+delta.x*t,a.y+delta.y*t,length/2,2,{angle,frictionAir:.06,friction:.1,restitution:0,collisionFilter:{category:8,mask:1}});Body.setMass(link,.025);return link;});
      const end=sign=>Vector.rotate({x:sign*half,y:0},angle);
      const rope=Constraint.create({bodyA:furniture,pointA,bodyB:links[0],pointB:end(-1),length:0,stiffness:.9});
      const middle=Constraint.create({bodyA:links[0],pointA:end(1),bodyB:links[1],pointB:end(-1),length:0,stiffness:.9});
      const tip=Constraint.create({bodyA:links[1],pointA:end(1),bodyB:body,length:0,stiffness:.9});
      state.balloons.push({body,rope,middle,tip,links,side,gas:1,length,radius:13});
      Composite.add(engine.world,[body,...links,rope,middle,tip]);
    }
  }
  Events.on(engine,'collisionStart',ev=> {
    for(const pair of ev.pairs) if((pair.bodyA===furniture && pair.bodyB.label==='frame') || (pair.bodyB===furniture && pair.bodyA.label==='frame')) {
      if(state.tick-state.lastBump>90) {state.bumps++;state.lastBump=state.tick;}
    }
  });
  return state;
}
export function launch(s) { if (s.phase==='ready' && s.balloons.length) s.phase='flying'; }
export function anchor(s,b) { return Vector.add(s.furniture.position, b.rope.pointA); }
export function ropePoints(s,b){return [anchor(s,b),Vector.add(b.links[0].position,b.middle.pointA),b.body.position];}
export function center(s) { const v=Vector.rotate({x:-s.level.com,y:0},s.furniture.angle); return Vector.add(s.furniture.position,v); }
export function step(s, input = {}) {
  if(s.phase!=='flying') return;
  s.tick++;
  const f=s.furniture;
  const windAt = x => s.level.wind * Math.max(0,Math.min(1,(635-x)/195));
  Body.applyForce(f,f.position,{x:f.mass*windAt(f.position.x),y:0});
  for(const b of s.balloons) {
    if(input[b.side]) b.gas=Math.max(0,b.gas-.14*STEP/1000);
    const nextRadius=13*(.3+.7*Math.cbrt(b.gas));
    Body.scale(b.body,nextRadius/b.radius,nextRadius/b.radius); b.radius=nextRadius;
    Body.setMass(b.body,.045); b.body.collisionFilter.mask = b.gas < .04 ? 1 : 3;
    Body.applyForce(b.body,b.body.position,{x:b.body.mass*windAt(b.body.position.x),y:-.000134*b.gas});
  }
  Engine.update(s.engine,STEP);
  s.peakAngle=Math.max(s.peakAngle,Math.abs(f.angle));
  const pts=f.vertices;
  const inside=Math.min(...pts.map(p=>p.x))>413 && Math.max(...pts.map(p=>p.x))<745;
  const contact=s.engine.pairs.list.some(p=>p.isActive && ((p.bodyA===f&&p.bodyB===s.mat)||(p.bodyB===f&&p.bodyA===s.mat)));
  if(contact) s.lastSupport=s.tick;
  const supported=s.tick-s.lastSupport<18 && Math.abs(Math.max(...pts.map(p=>p.y))-505)<1.5;
  const origin=s.settleOrigin;
  if(inside && supported && origin && Math.hypot(f.position.x-origin.x,f.position.y-origin.y)<1 && Math.abs(f.angle-origin.angle)<.017) s.settled++;
  else {s.settled=0;s.settleOrigin=inside&&supported?{...f.position,angle:f.angle}:null;}
  if(s.settled>=120){s.phase='won';s.reason='轻轻落地，搬家完成！';}
  else if(f.position.y < -120){s.phase='lost';s.reason='飞得太高了，下次早点排气。';}
  else if(f.position.y>680 || f.position.x>850 || f.position.x< -80){s.phase='lost';s.reason='飞过接货垫了，下次提前排气。';}
  else if(s.tick>600 && f.position.x<330 && s.engine.pairs.list.some(p=>p.isActive && ((p.bodyA===f&&p.bodyB===s.ground)||(p.bodyB===f&&p.bodyA===s.ground))) && s.balloons.reduce((sum,b)=>sum+.000134*b.gas,0)<.00024){s.phase='lost';s.reason='浮力不够了：多绑一只气球，或晚一点排气。';}
  else if(s.tick>=7200){s.phase='lost';s.reason='卡住了，换个绑法或早点排气再试。';}
  return s;
}
export function simulate(index,setup,events=[],limit=7200) {
  const s=createGame(index,setup);launch(s);
  for(let i=0;i<limit&&s.phase==='flying';i++) {
    const t=s.tick/120;
    step(s,{left:events.some(e=>e.side==='left'&&t>=e.at&&t<e.at+e.duration),right:events.some(e=>e.side==='right'&&t>=e.at&&t<e.at+e.duration)});
  }
  return s;
}
export function summary(s){return {phase:s.phase,t:+(s.tick/120).toFixed(2),x:+s.furniture.position.x.toFixed(1),y:+s.furniture.position.y.toFixed(1),angle:+(s.furniture.angle*180/Math.PI).toFixed(1),gas:s.balloons.map(b=>+b.gas.toFixed(2)),bumps:s.bumps};}
