import assert from 'node:assert/strict';
import { writeFile, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { wheelTravel, WHEEL_DURATION } from '../assets/scripts/Quartermaster.ts';

// Original pentatonic arpeggio and percussion; acceleration/braking share the visual curve.
const rate=22050,notes=[523.25,659.25,783.99,1046.5,880,783.99,659.25,587.33];
for(const [name,seconds]of [['wheel-click',.16],['wheel-spin',WHEEL_DURATION/1000],['wheel-win',.85]]){
  const samples=new Float64Array(Math.ceil(seconds*rate));
  const note=(at,frequency,duration,gain,percussion=false)=>{
    for(let i=0;i<duration*rate&&Math.round(at*rate)+i<samples.length;i++){
      const t=i/rate,envelope=Math.min(1,t/.004)*Math.exp(-t/(duration/5));
      const signal=percussion?Math.sin(2*Math.PI*(95*t+1.6*(1-Math.exp(-t*50))))
        :Math.sin(2*Math.PI*frequency*t)+.24*Math.sin(4*Math.PI*frequency*t);
      samples[Math.round(at*rate)+i]+=signal*gain*envelope;
    }
  };
  if(name==='wheel-spin'){
    let previous=-1;
    for(let i=0;i<samples.length;i++){
      const step=Math.floor(wheelTravel(i/samples.length)*33);
      if(step===previous)continue;previous=step;
      const at=i/rate;note(at,notes[step%notes.length],.17,.28);
      note(at,0,.09,step%4===0?.35:.14,true);
      if(step%4===0)note(at,130.81,.3,.18);
    }
  }else if(name==='wheel-win'){
    for(const [i,frequency]of [523.25,659.25,783.99,1046.5].entries())note(i*.09,frequency,.55,.24);
    note(0,0,.18,.3,true);
  }else{note(0,783.99,.13,.35);note(.025,1046.5,.12,.22);}
  const peak=Math.max(...samples.map(Math.abs));assert(peak>0&&peak<1,'Audio must be audible and unclipped');
  const bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)bytes.writeInt16LE(Math.round(samples[i]*28000),44+i*2);
  const file=new URL(`../assets/resources/audio/${name}.wav`,import.meta.url);await writeFile(file,bytes);
  try{await access(new URL(file.href+'.meta'));}catch{await writeFile(new URL(file.href+'.meta'),JSON.stringify({ver:'1.0.0',importer:'audio-clip',imported:true,uuid:randomUUID(),files:['.json','.wav'],subMetas:{},userData:{downloadMode:0}},null,2)+'\n');}
  console.log(`${name}: ${seconds}s, peak ${peak.toFixed(3)}, ${bytes.length} bytes`);
}
