import { clientToWorld, distance, GEOMETRY } from './geometry';
import type { Point } from './levels';
export class Controls {
  private keys=new Set<string>();
  private pointers=new Map<number,string>();
  jumpQueued=false;
  private abort=new AbortController();
  constructor(unlock: ()=>void) {
    const signal=this.abort.signal;
    const codes=['ArrowLeft','ArrowRight','KeyA','KeyD','Space'];
    window.addEventListener('keydown',e=>{
      if((e.target as HTMLElement)?.matches('button,select,input')&&e.code==='Space') return;
      if(codes.includes(e.code)){e.preventDefault();unlock();if(e.code==='Space'&&!this.keys.has(e.code))this.jumpQueued=true;this.keys.add(e.code);}
    },{signal});
    window.addEventListener('keyup',e=>{this.keys.delete(e.code);},{signal});
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{e.preventDefault();unlock();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,button.dataset.control!);if(button.dataset.control==='jump')this.jumpQueued=true;button.classList.add('held');},{signal});
      const release=(e: PointerEvent)=>{this.pointers.delete(e.pointerId);button.classList.remove('held');};
      button.addEventListener('pointerup',release,{signal});button.addEventListener('pointercancel',release,{signal});button.addEventListener('lostpointercapture',release,{signal});
    });
  }
  get axis(): number { const values=[...this.pointers.values()];return Number(this.keys.has('KeyD')||this.keys.has('ArrowRight')||values.includes('right'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')||values.includes('left')); }
  consumeJump(): boolean { const value=this.jumpQueued;this.jumpQueued=false;return value; }
  clear(): void {this.keys.clear();this.pointers.clear();this.jumpQueued=false;document.querySelectorAll('.held').forEach(e=>e.classList.remove('held'));}
  destroy(): void {this.clear();this.abort.abort();}
}
export class DrawingInput {
  private id: number|null=null;
  private points: Point[]=[];
  private abort=new AbortController();
  constructor(private canvas: HTMLCanvasElement,private callbacks: {
    begin:(p: Point)=>boolean; move:(points: Point[])=>void; finish:(points: Point[])=>void; cancel:(reason: string)=>void;
  }) {
    const signal=this.abort.signal;
    const point=(e: PointerEvent)=>clientToWorld(e.clientX,e.clientY,canvas.getBoundingClientRect());
    canvas.addEventListener('pointerdown',e=>{
      if(this.id!==null || !e.isPrimary || e.button!==0) return;
      if(!callbacks.begin(point(e)))return;
      e.preventDefault();this.id=e.pointerId;this.points=[point(e)];canvas.setPointerCapture(e.pointerId);
    },{signal});
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.id)return;
      const p=point(e);
      if(p.x<0||p.x>1100||p.y<0||p.y>560){this.cancel('笔画移出画布，已取消；请重新从起点画线。');return;}
      if(distance(p,this.points.at(-1)!)<GEOMETRY.sampleDistance)return;
      if(this.points.length>=GEOMETRY.maxInputPoints){this.cancel('采样点过多，请画得简洁一些。');return;}
      this.points.push(p);callbacks.move(this.points);
    },{signal});
    canvas.addEventListener('pointerup',e=>{if(e.pointerId!==this.id)return;this.points.push(point(e));this.id=null;callbacks.finish(this.points);},{signal});
    canvas.addEventListener('pointercancel',e=>{if(e.pointerId===this.id)this.cancel('触摸被中断，笔画已取消；请重新画线。');},{signal});
    canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===this.id)this.cancel('绘制中断，请重新画线。');},{signal});
  }
  cancel(reason='绘制已取消，请重新画线。'): void {if(this.id===null)return;const id=this.id;this.id=null;if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.points=[];this.callbacks.cancel(reason);}
  destroy(): void {this.id=null;this.abort.abort();}
}
