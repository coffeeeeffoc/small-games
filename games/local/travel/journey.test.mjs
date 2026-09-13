import assert from 'node:assert/strict';
import { journeyFrame, JOURNEY_END } from './journey.mjs';
for(let p=0;p<=JOURNEY_END;p+=.025){
 const frames=Array.from({length:6},(_,i)=>journeyFrame(p,i));
 assert.ok(frames.some(f=>f.opacity===1));
 assert.ok(frames.filter(f=>f.opacity*f.copyOpacity>.01).length<=1);
}
console.log('Current preview frame checks passed.');
