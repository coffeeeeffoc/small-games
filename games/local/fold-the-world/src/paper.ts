import Phaser from 'phaser';
import { buildWorld, connections, movingSide, WIDTH, HEIGHT, type Fold, type Entity } from './geometry';
import type { Puzzle } from './game';
import { creaseName, TEXT as T } from './strings';
const C = {paper:0xf4eddc, back:0xe8dbc1, line:0xd8cdb8, ink:0x364b45, fold:0x6c897a, danger:0xb85940, accent:0xc97950};
export class Paper {
  private base: Phaser.GameObjects.Graphics;
  private leaf: Phaser.GameObjects.Graphics;
  private fixed: Phaser.GameObjects.Graphics;
  private moving: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private tags: Phaser.GameObjects.Text[] = [];
  private edgeLabels: Phaser.GameObjects.Text[];
  constructor(private scene: Phaser.Scene) {
    this.base=scene.add.graphics(); this.leaf=scene.add.graphics(); this.fixed=scene.add.graphics(); this.moving=scene.add.graphics(); this.ghost=scene.add.graphics(); this.top=scene.add.graphics();
    this.edgeLabels=[true,false].map(left=>scene.add.text(left?52:WIDTH-52,196,'',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'16px',color:'#9e6548'}).setOrigin(left?0:1,.5));
  }
  private entity(g: Phaser.GameObjects.Graphics, e: Entity, moved: boolean, offset = 0): void {
    const x=e.x-offset, y=e.y;
    if(e.kind==='platform') {
      g.fillStyle(0x263e34,0.1).fillRect(x+3,y+5,e.w,e.h);
      g.fillStyle(moved?C.fold:C.ink).fillRect(x,y,e.w,e.h);
      g.lineStyle(2,moved?0xc5d7bf:0x768479).lineBetween(x+2,y+2,x+e.w-2,y+2);
      if(moved) { g.lineStyle(1,0xd9e4cd,0.45); for(let a=5;a<e.w-4;a+=12) g.lineBetween(x+a,y+Math.min(6,e.h),x+Math.min(a+7,e.w-2),y+e.h-3); }
      else { g.fillStyle(0xb0b9a3,0.5); for(let a=8;a<e.w-4;a+=18) g.fillCircle(x+a,y+e.h-5,1); }
    } else if(e.kind==='spike') {
      g.fillStyle(C.danger); const n=Math.ceil(e.w/12);
      for(let i=0;i<n;i++) g.fillTriangle(x+i*e.w/n,y+e.h,x+(i+0.5)*e.w/n,y,x+(i+1)*e.w/n,y+e.h);
      g.lineStyle(2,0x793d31).lineBetween(x,y+e.h,x+e.w,y+e.h);
    } else if(e.kind==='key') {
      g.lineStyle(3,0xbd863c).strokeCircle(x+8,y+6,5).lineBetween(x+8,y+11,x+8,y+22).lineBetween(x+8,y+18,x+14,y+18);
      g.fillStyle(0xfff7d9).fillCircle(x+7,y+4,1.5);
    } else {
      g.fillStyle(0xe1b779).fillRoundedRect(x-3,y-3,e.w+6,e.h+3,{tl:15,tr:15,bl:0,br:0});
      g.fillStyle(0x426658).fillRoundedRect(x,y,e.w,e.h,{tl:12,tr:12,bl:0,br:0});
      g.lineStyle(1,0xdad8ad).strokeRoundedRect(x+4,y+4,e.w-8,e.h-5,{tl:8,tr:8,bl:0,br:0});
      g.fillStyle(0xf6e6b9).fillCircle(x+e.w-8,y+22,2);
    }
  }
  draw(game: Puzzle, selected: Fold, time: number, marker: {x:number;y:number}|null=null): void {
    for(const g of [this.base,this.leaf,this.fixed,this.moving,this.ghost,this.top]) { g.clear(); g.setAlpha(1); g.setPosition(0,0); g.setScale(1,1); }
    const b=this.base;
    b.fillStyle(C.paper).fillRect(0,0,WIDTH,HEIGHT);
    b.lineStyle(1,C.line,0.35); for(let x=24;x<WIDTH;x+=24) for(let y=24;y<HEIGHT;y+=24) b.lineBetween(x,y,x+1,y);
    b.lineStyle(1,C.line,0.65).strokeRect(16,16,WIDTH-32,HEIGHT-32);
    b.lineStyle(1,C.line,0.35); for(let x=40;x<WIDTH-40;x+=15) b.lineBetween(x,548,x+5,548);
    const transition = game.mode==='FOLD_PREVIEW'||game.mode==='FOLD_ANIMATING'||game.visualTransition;
    const operation = transition ? game.fold ?? game.target : game.fold;
    const crease = operation && game.level.creases.find(c=>c.id===operation.crease);
    const progress = transition ? (game.fold ? 1-game.preview : game.preview) : (game.fold?1:0);
    const visible = game.level.entities.filter(e=>e.kind!=='key'||!game.collected.has(e.id));
    if(crease && operation) {
      const sideLeft=operation.direction==='left-to-right', length=sideLeft?crease.x:WIDTH-crease.x;
      const s=Math.cos(Math.PI*progress), lift=Math.sin(Math.PI*progress);
      // Only the selected paper leaf and its objects compress around the crease.
      const from=sideLeft?-length:0;
      b.fillStyle(0xd9cfba,0.38).fillRect(sideLeft?0:crease.x,16,length,HEIGHT-32);
      b.lineStyle(1,0xb8ac96,0.2); for(let y=50;y<HEIGHT-30;y+=22) b.lineBetween(sideLeft?24:crease.x+24,y,(sideLeft?crease.x:WIDTH)-24,y-14);
      b.fillStyle(0x534a3a,0.10+lift*0.10).fillRect(Math.min(crease.x,crease.x+(sideLeft?-1:1)*length*s)+8+lift*18,20+lift*10,Math.abs(length*s)+8,HEIGHT-40);
      this.leaf.setPosition(crease.x,18*lift).setScale(s,1-0.06*lift);
      this.leaf.fillStyle(s<0?C.back:C.paper).fillRect(from,18,length,HEIGHT-36);
      this.leaf.lineStyle(2,0xc6b99d).strokeRect(from,18,length,HEIGHT-36);
      this.leaf.lineStyle(1,0xcbbb9e,0.25); for(let y=42;y<HEIGHT-25;y+=26) this.leaf.lineBetween(from+8,y,from+length-8,y);
      this.moving.setPosition(crease.x,18*lift).setScale(s,1-0.06*lift);
      for(const e of visible) if(movingSide(e,crease.x,operation.direction)) this.entity(this.moving,e,s<0,crease.x); else this.entity(this.fixed,e,false);
    } else for(const e of visible) this.entity(this.fixed,e,false);
    if(transition) {
      this.ghost.setAlpha(0.3);
      for(const e of buildWorld(game.level,game.target,game.collected)) this.entity(this.ghost,e,e.moved);
    }
    const t=this.top;
    // Hazards always sit above the overlapping paper, never concealed by its background.
    if(!transition) for(const e of game.world.filter(e=>e.kind==='spike')) this.entity(t,e,e.moved);
    for(const mark of connections(game.world)) {
      t.lineStyle(2,0xc99753,0.9).lineBetween(mark.x-6,mark.y-5,mark.x,mark.y-1).lineBetween(mark.x,mark.y-1,mark.x+6,mark.y-5);
    }
    this.tags.forEach(tag=>tag.setVisible(false));
    game.level.creases.forEach((c,i)=>{
      const active=c.id===selected.crease;
      t.lineStyle(active?2:1,active?C.accent:0xa79882,active?0.7:0.45);
      for(let y=80;y<HEIGHT-50;y+=14) t.lineBetween(c.x,y,c.x,y+7);
      let tag=this.tags[i];
      if(!tag) { tag=this.scene.add.text(c.x,48,'',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'16px',color:'#9e6548'}).setOrigin(0.5); this.tags.push(tag); }
      tag.setVisible(true).setPosition(c.x,202).setText(creaseName(c.id)).setAlpha(active?1:0.5);
    });
    this.edgeLabels.forEach(label=>label.setVisible(false));
    for(const [i,fromLeft] of [true,false].entries()) {
      if(transition||(!game.fold&&!game.level.creases.some(c=>c.directions.includes(fromLeft?'left-to-right':'right-to-left'))))continue;
      const x=fromLeft?23:WIDTH-23;
      t.fillStyle(C.accent).fillRoundedRect(x-18,210,36,108,12);
      t.lineStyle(2,0xfff4db); for(let y=230;y<300;y+=12) t.lineBetween(x-6,y,x+6,y);
      t.fillStyle(C.paper); const d=(fromLeft?1:-1)*(game.fold?-1:1);
      t.fillTriangle(x+d*10,264,x-d*2,258,x-d*2,270);
      this.edgeLabels[i].setText(game.fold?(fromLeft?T.unfoldLeft:T.unfoldRight):(fromLeft?T.foldRight:T.foldLeft)).setVisible(true);
    }
    const p=game.body, face=p.vx>8?2:p.vx<-8?-2:0;
    if(marker){
      const radius=17+Math.sin(time/260)*3;
      t.lineStyle(3,0xb47631,0.9).strokeCircle(marker.x,marker.y-6,radius);
      t.lineStyle(1,0xfff6cf).strokeCircle(marker.x,marker.y-6,radius+4);
      t.fillStyle(0xb47631).fillTriangle(marker.x,marker.y-27,marker.x-6,marker.y-38,marker.x+6,marker.y-38);
    }
    if(game.mode!=='DEAD'||Math.sin(time/45)>0) {
      t.fillStyle(0x433c30,0.12).fillEllipse(p.x+12,p.y+p.h+4,26,5);
      t.fillStyle(C.accent).fillRoundedRect(p.x,p.y,p.w,p.h,4);
      t.lineStyle(1,0x965133).strokeRoundedRect(p.x,p.y,p.w,p.h,4);
      t.fillStyle(0xfff2d6,0.35).fillRect(p.x+3,p.y+3,p.w-6,2);
      t.fillStyle(0x353d35).fillCircle(p.x+7+face,p.y+10,1.6).fillCircle(p.x+15+face,p.y+10,1.6);
      t.lineStyle(1,0x653b2e).lineBetween(p.x+9+face,p.y+17,p.x+13+face,p.y+17);
    }
  }
}
