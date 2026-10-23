import { Camera, Canvas, Color, EditBox, Graphics, ImageAsset, Label, LabelOutline, Layers, Node, Rect, ResolutionPolicy, Sprite, SpriteFrame, Texture2D, UITransform, resources, view } from 'cc';
export const W=360;
export type Control={id:string;label:string;x:number;y:number;w:number;h:number;disabled:boolean};
export const color=(hex:string)=>new Color().fromHEX(hex);
// Pixel crops from the supplied 1254 x 1254 transparent atlas; replace this file to reskin.
export const UI_KIT={panel:[69,119,499,475],gold:[619,225,612,279],blue:[36,770,650,277],fire:[714,645,490,484]} as const;
export class CastleUI {
  H=780;scale=1;hitSize=50;top=8;bottom=8;
  root:Node;camera:Camera;
  controls:Control[]=[];
  nodes=new Map<string,Node>();seen=new Set<string>();pressed=new Set<string>();
  frames=new Map<string,SpriteFrame>();texture:Texture2D|null=null;
  ready=false;disposed=false;server:EditBox|null=null;
  constructor(parent:Node){
    this.root=this.node('CastleCanvas',parent);const canvas=this.root.addComponent(Canvas);
    this.camera=this.node('UICamera',parent).addComponent(Camera);this.camera.projection=Camera.ProjectionType.ORTHO;this.camera.priority=2;this.camera.near=0.1;this.camera.far=2000;this.camera.visibility=Layers.Enum.UI_2D;this.camera.clearFlags=Camera.ClearFlag.DEPTH_ONLY;canvas.cameraComponent=this.camera;
    this.resize();
  }
  node(name:string,parent=this.root){const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform);return n;}
  resize(){const f=view.getFrameSize();this.H=Math.max(640,Math.min(1000,W*f.height/f.width));this.scale=Math.min(f.width/W,f.height/this.H);this.hitSize=50;view.setDesignResolutionSize(W,this.H,ResolutionPolicy.SHOW_ALL);this.root.getComponent(UITransform)!.setContentSize(W,this.H);this.root.setPosition(W/2,this.H/2);this.camera.node.setPosition(W/2,this.H/2,1000);this.camera.orthoHeight=this.H/2;
    const style=typeof document==='undefined'?null:getComputedStyle(document.documentElement);this.top=Math.max(8,(parseFloat(style?.getPropertyValue('--safe-top')||'0')||0)/this.scale);this.bottom=Math.max(8,(parseFloat(style?.getPropertyValue('--safe-bottom')||'0')||0)/this.scale);
  }
  async load(){const asset=await new Promise<ImageAsset>((resolve,reject)=>resources.load('ui-kit',ImageAsset,(e,a)=>e?reject(e):resolve(a)));if(this.disposed)return;if(asset.width!==1254||asset.height!==1254)throw Error('Unexpected UI atlas dimensions');this.texture=new Texture2D();this.texture.image=asset;
    for(const[key,rect]of Object.entries(UI_KIT)){const f=new SpriteFrame();f.texture=this.texture;f.rect=new Rect(...rect);if(key!=='fire'){f.insetLeft=f.insetRight=90;f.insetTop=f.insetBottom=90;}this.frames.set(key,f);}this.ready=true;
  }
  begin(){this.controls=[];this.seen.clear();}
  end(){for(const[id,n]of this.nodes)if(!this.seen.has(id))n.active=false;}
  cached(id:string){this.seen.add(id);let n=this.nodes.get(id);if(!n){n=this.node(id);this.nodes.set(id,n);}n.active=true;n.setSiblingIndex(this.root.children.length-1);return n;}
  place(n:Node,x:number,y:number,w:number,h:number){n.setPosition(x+w/2-W/2,this.H/2-y-h/2);n.getComponent(UITransform)!.setContentSize(w,h);}
  sprite(id:string,kind:string,x:number,y:number,w:number,h:number,tint='#ffffff'){const n=this.cached(id);this.place(n,x,y,w,h);if(kind!=='fire'){n.getComponent(UITransform)!.setContentSize(w/0.15,h/0.15);n.setScale(0.15,0.15,1);}const s=n.getComponent(Sprite)||n.addComponent(Sprite);s.spriteFrame=this.frames.get(kind)!;s.type=kind==='fire'?Sprite.Type.SIMPLE:Sprite.Type.SLICED;s.sizeMode=Sprite.SizeMode.CUSTOM;s.color=color(tint);return n;}
  panel(id:string,x:number,y:number,w:number,h:number){return this.sprite(id,'panel',x,y,w,h);}
  rect(id:string,x:number,y:number,w:number,h:number,fill:string){const n=this.cached(id);this.place(n,x,y,w,h);const g=n.getComponent(Graphics)||n.addComponent(Graphics);g.clear();g.fillColor=color(fill);g.rect(-w/2,-h/2,w,h);g.fill();return g;}
  text(id:string,value:string,x:number,y:number,size=18,width=320,fill='#fff1cd',height=size*1.5){const n=this.cached(id);this.place(n,x-width/2,y-height/2,width,height);const l=n.getComponent(Label)||n.addComponent(Label);if(l.string!==value)l.string=value;l.fontFamily='Microsoft YaHei';l.fontSize=size;l.lineHeight=size*1.4;l.isBold=size>=18;l.color=color(fill);l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;l.overflow=Label.Overflow.SHRINK;const outline=n.getComponent(LabelOutline)||n.addComponent(LabelOutline);outline.color=color('#20180de8');outline.width=size>=26?2:1;return l;}
  button(id:string,label:string,x:number,y:number,w:number,h=this.hitSize,selected=false,disabled=false,round=false){h=Math.max(h,this.hitSize);const pressed=this.pressed.has(id)&&!disabled;const n=this.sprite('button:'+id,round?'fire':selected?'gold':'blue',x+(pressed?1:0),y+(pressed?2:0),w-(pressed?2:0),h-(pressed?2:0),disabled?'#7c858e':pressed?'#cfad76':'#ffffff');// Input is routed once through the global pointer handler, including held fire and cancel.
    this.text('label:'+id,label,x+w/2,y+h/2+(pressed?2:0),round?18:selected&&h>65?25:17,w-(round?26:18),disabled?'#c0b9a8':selected?'#fff6d7':'#fff1cd',h-12);
    this.controls.push({id,label,x,y,w,h,disabled});return n;
  }
  at(x:number,y:number){return [...this.controls].reverse().find(c=>x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h);}
  bar(id:string,value:number,x:number,y:number,w:number,fill:string){this.rect(id+'bg',x,y,w,7,'#101d27');this.rect(id,x,y,Math.max(0,Math.min(1,value))*w,7,fill);}
  charge(x:number,y:number,size:number,power:number){const n=this.cached('charge-ring');this.place(n,x,y,size,size);const g=n.getComponent(Graphics)||n.addComponent(Graphics);g.clear();g.strokeColor=color('#ffe3a0');g.lineWidth=3;g.arc(0,0,size/2-2,Math.PI/2,Math.PI/2-Math.PI*2*power,true);g.stroke();}
  serverField(value:string,y:number){const n=this.cached('server-input');this.place(n,30,y,300,this.hitSize);if(!this.server){this.server=n.addComponent(EditBox);this.server.inputMode=EditBox.InputMode.URL;this.server.maxLength=250;const text=this.node('server-value',n),label=text.addComponent(Label);text.getComponent(UITransform)!.setContentSize(280,this.hitSize);label.fontSize=14;label.color=color('#fff1cd');label.overflow=Label.Overflow.SHRINK;this.server.textLabel=label;this.server.string=value;}return this.server;}
  dispose(){this.disposed=true;this.root.destroy();this.camera.node.destroy();for(const f of this.frames.values())f.destroy();this.texture?.destroy();}
}
