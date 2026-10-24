import { Camera, Color, DirectionalLight, ImageAsset, JsonAsset, Material, Mesh, MeshRenderer, Node, Quat, Rect, Texture2D, Vec3, Vec4, gfx, primitives, resources, utils, view } from 'cc';
import { activeGun, direction, gunDirection, previewTrajectory, type DuelView } from './core/core.js';

type Geometry = {positions:number[];normals?:number[];uvs?:number[];colors?:number[];tangents?:number[];indices?:number[];lines:boolean};
type Surface = {color:string;opacity:number;transparent:boolean;side:number;roughness:number;metallic:number;vertexColors:boolean;map:string;maps?:{color:string;normal:string;metalRoughness:string};tint?:number[]};
type Model = {name:string;position:number[];rotation:number[];scale:number[];visible:boolean;geometry?:string;material?:string;children:Model[]};
type WorldAsset = {version:2;tree:Model;geometries:Record<string,string>;materials:Record<string,Surface>};
export class CastleWorld {
  root: Node;
  camera: Camera;
  nodes = new Map<string,Node>();
  meshes = new Map<string,Mesh>();
  materials = new Map<string,Material>();
  textures = new Map<string,Texture2D>();
  effects = new Map<string,Node>();
  dots: Node[]=[];
  ring: Node;
  ready=false;
  disposed=false;
  trajectory: ReturnType<typeof previewTrajectory> = {points:[],power:0.65,impact:null,hit:''};
  private generation=0;
  private trajectoryKey='';
  private trajectoryTime=-1;
  private lastSkin=-1;
  private sphere:Mesh;
  constructor(parent:Node, private surface:Material) {
    this.root=this.node('CastleWorld',parent);
    this.camera=this.node('CastleCamera',parent).addComponent(Camera);
    this.camera.visibility=1<<30;
    this.camera.priority=0;
    this.camera.near=0.15;this.camera.far=650;
    this.camera.clearFlags=Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor=new Color(157,192,221);
    const globals=parent.scene!.globals;
    globals.skybox.enabled=false;
    globals.ambient.skyLightingColor=new Color(209,228,248);
    globals.ambient.groundLightingColor=new Color(135,128,104);
    globals.ambient.skyIllum=25500;
    globals.fog.enabled=true;globals.fog.type=0;globals.fog.fogStart=185;globals.fog.fogEnd=550;
    globals.fog.fogColor=new Color(177,202,221);
    globals.shadows.enabled=true;globals.shadows.type=1;globals.shadows.shadowMapSize=1024;
    const sun=this.node('AfternoonSun',this.root);sun.setRotationFromEuler(-46,-55,0);
    const light=sun.addComponent(DirectionalLight);light.color=new Color(255,238,205);light.illuminance=48000;light.shadowEnabled=true;light.shadowDistance=180;
    this.sphere=utils.createMesh(primitives.sphere(1,{segments:10}));this.meshes.set('effect-sphere',this.sphere);
    const glow=new Material();glow.initialize({effectName:'builtin-unlit'});glow.setProperty('mainColor',new Color(255,218,132));this.materials.set('trajectory',glow);
    for(let i=0;i<80;i++) {const dot=this.shape('PreviewDot'+i,this.sphere,glow);dot.setScale(0.20,0.20,0.20);dot.active=false;this.dots.push(dot);}
    const ringGeo={positions:[] as number[],indices:[] as number[]};
    for(let i=0;i<48;i++){const a=i*Math.PI*2/48;ringGeo.positions.push(Math.cos(a)*1.7,0,Math.sin(a)*1.7,Math.cos(a)*1.85,0,Math.sin(a)*1.85);const n=i*2,j=((i+1)%48)*2;ringGeo.indices.push(n,j,n+1,n+1,j,j+1);}
    const ringMesh=utils.createMesh(ringGeo);this.meshes.set('landing-ring',ringMesh);this.ring=this.shape('LandingRing',ringMesh,glow);this.ring.active=false;
  }
  node(name:string,parent=this.root) {const n=new Node(name);n.layer=1<<30;parent.addChild(n);return n;}
  shape(name:string,mesh:Mesh,material:Material) {const n=this.node(name),r=n.addComponent(MeshRenderer);r.mesh=mesh;r.setMaterial(material,0);return n;}
  async load() {
    const token=++this.generation;
    const asset=await new Promise<JsonAsset>((resolve,reject)=>resources.load('world',JsonAsset,(e,a)=>e?reject(e):resolve(a)));
    if(this.disposed||token!==this.generation)return;
    const data=asset.json as WorldAsset;
    if(data.version!==2)throw Error('Unsupported Castle world asset version');
    const paths=Array.from(new Set(Object.values(data.materials).flatMap(m=>m.maps?Object.values(m.maps):m.map?[m.map]:[])));
    for(let i=0;i<paths.length;i+=4) await Promise.all(paths.slice(i,i+4).map(async path=>{
      const image=await new Promise<ImageAsset>((resolve,reject)=>resources.load(path.replace(/\.[^.]+$/,''),ImageAsset,(e,a)=>e?reject(e):resolve(a)));
      if(this.disposed||token!==this.generation)return;
      const texture=new Texture2D();texture.image=image;texture.setWrapMode(Texture2D.WrapMode.REPEAT,Texture2D.WrapMode.REPEAT);this.textures.set(path,texture);
    }));
    if(this.disposed||token!==this.generation)return;
    const geometries:Record<string,Geometry>={},entries=Object.entries(data.geometries);
    for(let i=0;i<entries.length;i+=4)await Promise.all(entries.slice(i,i+4).map(async([key,path])=>{
      const asset=await new Promise<JsonAsset>((resolve,reject)=>resources.load(path,JsonAsset,(e,a)=>e?reject(e):resolve(a)));
      if(this.disposed||token!==this.generation)return;
      const g=asset.json as Geometry;geometries[key]=g;
      this.meshes.set(key,utils.createMesh({...g,primitiveMode:g.lines?gfx.PrimitiveMode.LINE_LIST:gfx.PrimitiveMode.TRIANGLE_LIST}));
    }));
    if(this.disposed||token!==this.generation)return;
    for(const [key,m] of Object.entries(data.materials)) {
      const mat=new Material();
      mat.initialize({effectAsset:this.surface.effectAsset!,technique:m.transparent?1:0,defines:{USE_VERTEX_COLOR:m.vertexColors,USE_ALBEDO_MAP:!!(m.maps||m.map),USE_NORMAL_MAP:!!m.maps,USE_PBR_MAP:!!m.maps,CC_SURFACES_USE_TWO_SIDED:m.side===2},states:{rasterizerState:{cullMode:m.side===2?gfx.CullMode.NONE:m.side===1?gfx.CullMode.FRONT:gfx.CullMode.BACK}}});
      const color=new Color().fromHEX(m.color);color.a=Math.round(m.opacity*255);
      mat.setProperty('mainColor',color);mat.setProperty('roughness',m.roughness);mat.setProperty('metallic',m.metallic);
      if(m.maps){mat.setProperty('mainTexture',this.textures.get(m.maps.color)!);mat.setProperty('normalMap',this.textures.get(m.maps.normal)!);mat.setProperty('pbrMap',this.textures.get(m.maps.metalRoughness)!);}
      else if(m.map)mat.setProperty('mainTexture',this.textures.get(m.map)!);
      if(m.tint)mat.setProperty('clothTint',new Vec4(m.tint[0],m.tint[1],m.tint[2],1));
      this.materials.set(key,mat);
    }
    const spawn=(m:Model,parent:Node)=>{
      const n=this.node(m.name||'OriginalMesh',parent);
      if(m.name)this.nodes.set(m.name,n);
      n.setPosition(m.position[0],m.position[1],m.position[2]);n.setRotation(new Quat(...m.rotation as [number,number,number,number]));n.setScale(m.scale[0],m.scale[1],m.scale[2]);n.active=m.visible;
      if(m.geometry){const r=n.addComponent(MeshRenderer);r.mesh=this.meshes.get(m.geometry)!;r.setMaterial(this.materials.get(m.material!)!,0);if(!geometries[m.geometry].lines){r.shadowCastingMode=1;r.receiveShadow=1;}}
      m.children.forEach(c=>spawn(c,n));return n;
    };
    spawn(data.tree,this.root);this.ready=true;
  }
  resize(width:number,height:number) {
    const f=view.getFrameSize(),scale=Math.min(f.width/width,f.height/height),w=width*scale/f.width,h=height*scale/f.height;
    this.camera.rect=new Rect((1-w)/2,(1-h)/2,w,h);
  }
  update(v:DuelView) {
    if(!this.ready)return;
    const d=direction(v.side),me=v.duel.fighters[v.side],gun=activeGun(me)??me.guns[0];
    this.root.scene!.globals.shadows.enabled=!v.p.lowPower;
    for(const s of v.duel.structures){this.nodes.get(`structure:${s.id}:intact`)!.active=s.hp>0;this.nodes.get(`structure:${s.id}:debris`)!.active=s.hp<=0;this.nodes.get(`structure:${s.id}:cracks`)!.active=s.hp>0&&s.hp<s.maxHp*0.7;}
    for(const p of v.duel.fighters) {
      for(const g of p.guns){const base=this.nodes.get(`gun:${p.side}:${g.id}:base`)!,barrel=this.nodes.get(`gun:${p.side}:${g.id}:barrel`)!,vector=gunDirection(p.side,g);base.active=g.bunker===p.destroyed;base.setRotationFromEuler(0,Math.atan2(-vector.x,-vector.z)*180/Math.PI,g.hp>0?0:9);barrel.setRotationFromEuler(g.pitch,0,0);barrel.setPosition(0,barrel.position.y,Math.max(0,0.2-(v.duel.time-g.firedAt))*2);}
      const group=this.nodes.get(`person:${p.side}:group`)!,loading=!!activeGun(p)&&activeGun(p)!.reload<1&&!p.crouched&&!p.route.length;
      this.nodes.get(`person:${p.side}:march`)!.active=!loading;this.nodes.get(`person:${p.side}:load`)!.active=loading;
      group.setPosition(p.position.x,p.position.y+(p.route.length&&v.p.motion?Math.abs(Math.sin(v.duel.time*11))*0.09:0),p.position.z);group.setRotationFromEuler(0,90*direction(p.side),p.hp<=0?-90:p.crouched?-63:0);group.setScale(1,p.crouched?0.45:1,1);
    }
    if(this.lastSkin!==v.p.skin){this.lastSkin=v.p.skin;for(const[key,m]of this.materials){if(key.startsWith('soldier:blue:')){const c=[[1,1,1],[5.2,2.1,0.23],[4.5,1.15,0.75]][v.p.skin];m.setProperty('clothTint',new Vec4(c[0],c[1],c[2],1));}if(key.startsWith('#1764a0:'))m.setProperty('mainColor',new Color().fromHEX(['#1764a0','#d5a435','#cb756c'][v.p.skin]));}}
    const live=new Set<string>();
    for(const s of v.duel.shells){const id='shell:'+s.id;live.add(id);let n=this.effects.get(id);if(!n){n=this.shape(id,this.sphere,this.materials.get('trajectory')!);this.effects.set(id,n);}n.setPosition(s.position.x,s.position.y,s.position.z);n.setScale(0.28,0.28,0.28);}
    for(const i of v.duel.impacts){const age=v.duel.time-i.at;if(age>0.65)continue;const id='impact:'+i.id;live.add(id);let n=this.effects.get(id);if(!n){n=this.shape(id,this.sphere,this.materials.get('trajectory')!);this.effects.set(id,n);}n.setPosition(i.position.x,i.position.y+0.3,i.position.z);const scale=(0.4+age*3)*(1-age/0.65);n.setScale(scale,scale,scale);}
    for(const[id,n]of this.effects)if(!live.has(id)){n.destroy();this.effects.delete(id);}
    const main=['home','maps','campaign','matching','skins','settings','help'].includes(v.screen);
    if(main){this.camera.fov=48;this.camera.node.setPosition(-145*d,30,54*d);this.camera.node.lookAt(new Vec3(-62*d,3,0));}
    else if(v.scope){this.camera.fov=17;this.camera.node.setPosition(gun.position.x-3*d,gun.position.y+7,gun.position.z+2*d);this.camera.node.lookAt(new Vec3(62*d,3.5+v.scopeY,-v.scopeX*d));}
    else if(me.node==='shelter'&&!me.route.length){this.camera.fov=54;this.camera.node.setPosition(-64*d,4.2,8*d);this.camera.node.lookAt(new Vec3(-69*d,1.8,0));}
    else {const origin=me.route.length?me.position:gun.position;this.camera.fov=55;this.camera.node.setPosition(origin.x-4*d,origin.y+4.5,origin.z+0.7*d);this.camera.node.lookAt(new Vec3(origin.x+32*d,origin.y+1.5,origin.z-6*d));}
    const active=activeGun(me),show=!main&&!!active&&!me.route.length&&me.healing===null&&!me.crouched&&active.hp>0;
    if(show&&active){const key=`${v.matchId}:${v.side}:${active.id}:${active.pitch}:${active.yaw}:${active.charge===null?'idle':Math.floor((v.duel.time-active.charge)*20)}:${v.duel.structures.map(s=>s.hp>0?1:0).join('')}`;
      if(key!==this.trajectoryKey || Math.abs(v.duel.time-this.trajectoryTime)>=0.05){this.trajectoryKey=key;this.trajectoryTime=v.duel.time;this.trajectory=previewTrajectory(v.duel,v.side,active);}
    } else this.trajectory={points:[],power:0.65,impact:null,hit:''};
    this.dots.forEach((n,i)=>{const p=this.trajectory.points[i];n.active=!!p&&show;if(p){n.setPosition(p.x,p.y,p.z);const radius=Math.max(0.08,Math.min(0.35,Vec3.distance(n.worldPosition,this.camera.node.worldPosition)*0.0035));n.setScale(radius,radius,radius);}});
    this.ring.active=show&&!!this.trajectory.impact;
    if(this.trajectory.impact){const p=this.trajectory.impact;this.ring.setPosition(p.x,p.y+0.12,p.z);}
  }
  dispose(){this.disposed=true;++this.generation;this.root.destroy();this.camera.node.destroy();for(const m of this.meshes.values())m.destroy();for(const m of this.materials.values())m.destroy();for(const t of this.textures.values())t.destroy();}
}
