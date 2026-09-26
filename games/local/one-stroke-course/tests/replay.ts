import type { CourseScene } from '../src/scene';
declare global { interface Window { __course: CourseScene } }
export type Action = { x?: number; time?: number; after?: number; axis?: -1|0|1; jump?: boolean };
export const routeInputs: Record<string,Action[]> = {
  connect:[],
  'jump-key':[{x:440,jump:true}],
  'saw-crossing':[{x:390,axis:-1},{after:22/120,axis:0},{time:2.6,axis:1}],
  'pulse-gate':[{x:415,axis:-1},{after:22/120,axis:0},{time:2.85,axis:1}],
  'charge-stop':[{x:500,axis:-1},{after:22/120,axis:0},{time:3.5,axis:1}],
  'soft-landing':[{x:955,axis:-1},{after:22/120,axis:0}],
  'double-jump':[{x:260,jump:true},{x:630,jump:true}],
  'double-gate':[{x:275,axis:-1},{after:22/120,axis:0},{time:2.2,axis:1},{x:610,axis:-1},{after:22/120,axis:0},{time:4.3,axis:1}],
  'key-parking':[{x:440,jump:true},{x:955,axis:-1},{after:26/120,axis:0}],
  'charge-gate':[{x:325,axis:-1},{after:30/120,axis:0},{time:3.4,axis:1}],
  'wind-key':[{x:570,jump:true}],
  'final-exam':[{x:230,jump:true},{x:490,axis:-1},{after:40/120,axis:0},{time:3.45,axis:1},{x:955,axis:-1},{after:26/120,axis:0}],
  free:[],
};

// Runs in the browser: only ordinary directional/jump input, never player state edits.
export function runReference({index,alternate=false,naive=false,actions=[]}: {index:number;alternate?:boolean;naive?:boolean;actions?:Action[]}) {
  const s=window.__course;s.manual=true;s.select(index);s.example(alternate);s.start();
  let axis=1,action=0,previousTime=0,maxSpeed=0;
  const inputs: {time:number;x:number;axis:number;jump:boolean}[]=[{time:0,x:100,axis:1,jump:false}];
  for(let tick=0;tick<3600&&s.phase==='running';tick++){
    let jump=false;const next=actions[action];
    if(!naive&&next&&(next.x===undefined||s.course.ball.position.x>=next.x)&&(next.time===undefined||s.elapsed>=next.time)&&(next.after===undefined||s.elapsed-previousTime>=next.after-1e-8)){
      axis=next.axis??axis;jump=next.jump??false;action++;previousTime=s.elapsed;
      inputs.push({time:s.elapsed,x:s.course.ball.position.x,axis,jump});
    }
    s.fixedTick(axis,jump);maxSpeed=Math.max(maxSpeed,Math.abs(s.course.ball.velocity.x));
  }
  return {...s.snapshot(),maxSpeed,inputs,alternate,naive};
}
