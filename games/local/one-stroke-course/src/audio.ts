export class Sound {
  private context?: AudioContext;
  muted=false;
  unlock(): void {
    try { this.context??=new AudioContext(); void this.context.resume().catch(()=>{}); } catch { /* Audio is optional; game remains playable. */ }
  }
  play(kind: 'draw'|'jump'|'star'|'fail'|'win'): void {
    const ctx=this.context;
    if(this.muted||!ctx||ctx.state!=='running') return;
    const frequencies={draw:240,jump:440,star:880,fail:140,win:660};
    const osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    osc.type='sine';osc.frequency.setValueAtTime(frequencies[kind],now);
    osc.frequency.exponentialRampToValueAtTime(frequencies[kind]*(kind==='fail'?.5:1.4),now+.12);
    gain.gain.setValueAtTime(kind==='draw'?.009:.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);
    osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(now+.2);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
}
