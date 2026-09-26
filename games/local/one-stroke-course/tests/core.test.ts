import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels, validateLevel } from '../src/levels';
import { clientToWorld, finishStroke, length, processStroke, validateGeometry } from '../src/geometry';
import { scoreRun } from '../src/scoring';
import { decodeDraft, newDraft } from '../src/storage';
import { gateState } from '../src/challenges';
const l=levels[0],p=(x: number,y: number)=>({x,y});
test('空线、极短、超长、未到终点和越界会给出原因',()=>{
  for(const points of [[],[l.start],[l.start,p(158,410)],[l.start,p(800,410)],[l.start,p(300,80),l.end]])assert.equal(finishStroke(points,l).ok,false);
  assert.match(validateGeometry([l.start,p(900,160),p(180,230),l.end],l).reason,/墨水/);
});
test('自交、重叠、过近、实体和尖刺被拒绝',()=>{
  const generous={...l,inkBudget:4000};
  assert.match(validateGeometry([l.start,p(600,180),p(270,200),p(650,460),l.end],generous).reason,/自交/);
  assert.match(validateGeometry([l.start,p(800,410),p(300,410),l.end],generous).reason,/自交|重叠/);
  assert.match(validateGeometry([l.start,p(750,410),p(750,395),p(200,395),p(200,200),p(900,200),l.end],generous).reason,/太近/);
  assert.match(finishStroke([l.start,l.end],{...l,solids:[{x:400,y:390,w:100,h:100}]}).reason,/实体/);
  assert.match(finishStroke([l.start,l.end],{...l,hazards:[{x:400,y:390,w:100,h:100}]}).reason,/尖刺/);
});
test('全部参考线有效、点数有上限、统计同源',()=>{
  for(const level of levels){const c=finishStroke(level.reference,level);assert.equal(c.ok,true,`${level.id}: ${c.reason}`);assert.ok(c.points.length<=200);assert.equal(c.usedInk,length(c.points));assert.ok(c.usedInk<=level.parInk);}
  for(const level of levels)if(level.alternate){const c=finishStroke(level.alternate,level);assert.equal(c.ok,true,`${level.id} 另一种画法: ${c.reason}`);}
  assert.equal(validateGeometry(Array.from({length:201},(_,i)=>p(155+i*4,410)),l).ok,false);
  assert.equal(processStroke([l.start,l.start,l.end]).length,2);
});
test('悬空区禁止画线，压门周期及重复周期一致',()=>{
  const key=levels[1];assert.match(finishStroke([key.start,{x:560,y:290},key.end],key).reason,/悬空区/);
  const gate=levels[3].challenges[0];assert.equal(gate.kind,'gate');if(gate.kind!=='gate')return;
  assert.equal(gateState(gate,1).open,false);assert.equal(gateState(gate,3).open,true);
  assert.equal(gateState(gate,0).bottom,515);assert.equal(gateState(gate,3).bottom,245);
  assert.ok(gateState(gate,2.5).bottom<515);assert.ok(gateState(gate,4).bottom>245);
  assert.deepEqual(gateState(gate,1),gateState(gate,1+gate.closed+gate.open+gate.travel*2));
});
test('端点吸附和缩放坐标，包括高 DPR 下的 CSS 像素',()=>{
  const c=finishStroke([p(159,414),p(947,400)],l);assert.equal(c.ok,true);assert.deepEqual(c.points,[l.start,l.end]);
  assert.deepEqual(clientToWorld(187.5,302.5,{left:110,top:97.5,width:550,height:280}),l.start);
});
test('组合机关参数有效，非法周期和无法停球的充能台被拒绝',()=>{
  for(const level of levels)validateLevel(level);
  assert.throws(()=>validateLevel({...l,challenges:[{kind:'gate',x:400,width:30,closed:2,travel:0,open:1}]}));
  assert.throws(()=>validateLevel({...l,challenges:[{kind:'saw',x:400,y:350,amplitude:50,period:0,radius:20}]}));
  assert.throws(()=>validateLevel({...l,challenges:[{kind:'charge',x:400,y:410,width:20,speed:.8,hold:.5}]}));
  const gate={kind:'gate' as const,x:400,width:30,closed:2,travel:.3,open:1,offset:1.5};
  assert.deepEqual(gateState(gate,1),gateState({...gate,offset:0},2.5));
});
test('评分公式、取整、边界和无效配置',()=>{
  assert.equal(scoreRun(l,3,l.parInk,l.parTime).total,100);
  assert.deepEqual(scoreRun(l,0,l.inkBudget,l.slowTime),{base:50,stars:0,ink:0,time:0,total:50});
  assert.equal(scoreRun(l,2,(l.inkBudget+l.parInk)/2,(l.slowTime+l.parTime)/2).total,80);
  assert.equal(scoreRun(l,3,0,0).total,100);assert.equal(scoreRun(l,0,99999,99999).total,50);
  assert.throws(()=>scoreRun({...l,parInk:l.inkBudget},3,800,2));assert.throws(()=>validateLevel({...l,parTime:l.slowTime}));
  assert.throws(()=>scoreRun(l,4,800,3));assert.throws(()=>scoreRun(l,3,NaN,3));
});
test('改笔画/规则使自测和旧最佳成绩失效，损坏存档被拒绝',()=>{
  const points=finishStroke(l.reference,l).points,d=newDraft(l,points);d.tested=true;d.best=100;
  assert.equal(decodeDraft(JSON.stringify(d),l).tested,true);
  assert.equal(newDraft(l,points).tested,false);
  const changed=decodeDraft(JSON.stringify({...d,rulesVersion:'old'}),l);assert.equal(changed.tested,false);assert.equal(changed.best,null);
  assert.throws(()=>decodeDraft('{oops',l));assert.throws(()=>decodeDraft(JSON.stringify({...d,points:[{x:'bad',y:0}]}),l));
  assert.throws(()=>decodeDraft(JSON.stringify({...d,templateId:'other'}),l));assert.throws(()=>decodeDraft(JSON.stringify({...d,version:2}),l));
});
