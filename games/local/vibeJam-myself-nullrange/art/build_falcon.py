"""Original editable Falcon model. Blender +Y nose -> glTF -Z; metres."""
import bpy, bmesh, math, json, hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts=[]; mats={}
for name,col,metal,rough,emit in [
 ('Ivory',(0.80,.82,.76),.35,.32,0),('Navy',(.025,.055,.085),.3,.29,0),
 ('Amber',(.95,.44,.055),.25,.3,0),('Glass',(.035,.095,.13),.65,.12,0),
 ('Steel',(.12,.17,.20),.8,.3,0),('Seam',(.085,.12,.13),.2,.6,0),
 ('Cyan',(.07,.8,1),.15,.25,3)]:
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1)
 p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Emission Color'].default_value=(*col,1);p.inputs['Emission Strength'].default_value=emit;mats[name]=m
def mesh(name,vs,fs,mat,smooth=False):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();d.materials.append(mats[mat])
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);parts.append(o)
 for p in d.polygons:p.use_smooth=smooth
 return o
def body(name,rings,mat,x=0,z=0,n=24):
 vs=[(x+math.cos(k*math.tau/n)*w,y,z+math.sin(k*math.tau/n)*h) for y,w,h in rings for k in range(n)]
 fs=[(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k) for j in range(len(rings)-1) for k in range(n)]
 fs.extend([tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+k for k in range(n))])
 return mesh(name,vs,fs,mat,True)
def plate(name,vs,mat,depth=.10):
 n=len(vs);verts=vs+[(x,y,z-depth) for x,y,z in vs]
 return mesh(name,verts,[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
def strip(name,points,mat='Seam',width=.025):
 vs=[];fs=[]
 for a,b in zip(points,points[1:]):
  a,b=Vector(a),Vector(b);v=(b-a).normalized();cross=Vector((0,0,1)).cross(v)
  if cross.length<.1:cross=Vector((0,1,0)).cross(v)
  cross.normalize();cross*=width/2;i=len(vs)
  vs.extend([a+cross,b+cross,b-cross,a-cross]);fs.append((i,i+1,i+2,i+3))
 return mesh(name,vs,fs,mat)
R=[(-8,1.5,.5),(-6,1.8,.72),(-4,2,.8),(-2,2.15,.83),(0,1.9,.85),(2,1.7,.87),(4,1.35,.83),(6,1.13,.75),(8,.9,.65),(10,.67,.48),(12,.38,.29),(13.8,.015,.015)]
body('Continuous sculpted fuselage',R,'Ivory')
# Dorsal cockpit spine, with low curved canopy and amber frames.
body('Dorsal navy spine',[(y,w*.72,h*.33) for y,w,h in [(-1,.9,.6),(1,1,.8),(3,1.15,1),(5,1.05,1),(7,.65,.8),(8,.1,.1)]],'Navy',z=.78)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(0,4.6,1.12))
canopy=bpy.context.object;canopy.name='Armoured smoked canopy';canopy.scale=(.82,2.45,.76);canopy.data.materials.append(mats['Glass']);parts.append(canopy)
for p in canopy.data.polygons:p.use_smooth=True
for y in [3.2,5.4,6.6]:
 d=(y-4.6)/2.45;r=math.sqrt(max(0,1-d*d))
 strip('Canopy brass frame',[(.83*r*math.cos(a),y,1.12+.775*r*math.sin(a)) for a in [i*math.pi/16 for i in range(17)]],'Amber',.055)
strip('Canopy centre rail',[(0,2.2,1.15),(0,3.2,1.76),(0,4.6,1.9),(0,6.4,1.64),(0,7,1.15)],'Navy',.06)
# Airframe panel seams follow the actual radial surface rather than floating flat decals.
for y,w,h in R[1:-1]:
 strip('Fuselage service ring',[(math.cos(a)*w*1.002,y,math.sin(a)*h*1.01) for a in [i*math.tau/32 for i in range(33)]],width=.018)
for a in [.3,1.05,2.09,2.84]:
 strip('Fuselage longitudinal panel',[(math.cos(a)*w*1.003,y,math.sin(a)*h*1.015) for y,w,h in R],width=.018)
body('Nose radome',[(12.4,.30,.23),(13.8,.016,.016),(14.15,.008,.008)],'Navy')
body('Nose identification band',[(11.7,.422,.32),(12,.385,.294),(12.25,.338,.26)],'Amber')
for side in [-1,1]:
 def mirror(points):return [(x*side,y,z) for x,y,z in points]
 wing=[(1.35,3,.05),(3.1,1.65,.15),(10.6,-4.9,.21),(9.1,-6.25,.16),(2.15,-4.8,.20),(1.4,-1.9,.12)]
 plate('Swept lifting wing',mirror(wing),'Ivory',.23)
 plate('Navy trailing control surface',mirror([(3.3,-4.85,.23),(9.1,-6.28,.23),(10.05,-5.38,.27),(4.1,-3.85,.27)]),'Navy',.035)
 plate('Amber outer wing stripe',mirror([(8.35,-2.98,.24),(8.84,-3.4,.245),(9.8,-5.87,.25),(9.25,-6.08,.24)]),'Amber',.026)
 strip('Wing forward edge',mirror([(2.1,2.4,.18),(3.1,1.69,.20),(10.6,-4.9,.255)]),'Navy',.075)
 for pts in [[(2.6,.6,.21),(3.6,-1.3,.23),(8.5,-4.4,.27)],[(2.8,-2.1,.23),(6.1,-3.1,.25),(9.2,-5.35,.27)],[(5.8,-.7,.245),(5,-2.75,.25),(4.1,-3.85,.29)]]:
  strip('Wing panel engraving',mirror(pts),width=.025)
 # Canted vertical stabilisers, with visible thickness and segmented markings.
 fin=[(1.35,-6.5,.7),(2.85,-6.65,4.3),(2.65,-3.7,3.85),(1.35,-1.9,.7)]
 p=mirror(fin);q=[(x+side*.14,y,z) for x,y,z in p];mesh('Canted vertical stabiliser',p+q,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Navy')
 plate('Amber tail cap',mirror([(2.69,-6.6,3.94),(2.85,-6.65,4.3),(2.65,-3.7,3.85),(2.51,-3.6,3.52)]),'Amber',.025)
 plate('Tailplane',mirror([(1.5,-5.0,.15),(5.3,-7.8,.15),(4.6,-8.7,.10),(1.55,-7.6,.1)]),'Ivory',.16)
 plate('Tailplane navy tip',mirror([(4.7,-7.33,.18),(5.3,-7.8,.18),(4.6,-8.7,.13),(4.1,-8.1,.16)]),'Navy',.02)
 # Two separate sculpted engine pods and genuine hollow exhaust rings.
 body('Engine nacelle',[(-8.3,.86,.84),(-7,.99,.94),(-4,1.03,.88),(-1,.94,.76),(1.9,.72,.64)],'Ivory',x=side*1.18,z=-.16)
 body('Recessed intake',[ (1.85,.69,.62),(2.2,.61,.55)],'Navy',x=side*1.18,z=-.16)
 for y in [-6.2,-5.7,-5.2,-4.7]:
  plate('Engine upper vent',mirror([(.83,y,.74),(1.6,y,.74),(1.6,y+.23,.74),(.83,y+.23,.74)]),'Navy',.015)
 for k in range(20):
  a=k*math.tau/20;b=(k+1)*math.tau/20-.014
  vs=[]
  for y,r in [(-8,.89),(-8.8,.81),(-9.15,.75),(-9.15,.64),(-8.4,.61)]:
   for ang in [a,b]:vs.append((side*1.18+r*math.cos(ang),y,-.16+r*math.sin(ang)))
  mesh('Exhaust petal',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],'Steel',True)
 body('Recessed ion core',[(-8.65,.58,.58),(-8.72,.58,.58)],'Cyan',x=side*1.18,z=-.16)
 # Small canopy-side caution plate and an inset wing emblem.
 plate('Caution plate',mirror([(1.33,2.1,.73),(1.53,1.7,.73),(1.66,1.9,.73),(1.45,2.3,.73)]),'Amber',.02)
 plate('Wing insignia',mirror([(4.8,-1.7,.26),(5.5,-2.1,.26),(4.85,-2.7,.26),(4.2,-2.3,.26)]),'Amber',.015)
 strip('Wing insignia inset',mirror([(4.7,-1.99,.29),(5.1,-2.19,.29),(4.75,-2.46,.29)]),'Navy',.1)
# Join by shared materials for one transform with seven material primitives.
bpy.ops.object.select_all(action='DESELECT')
for p in parts:p.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=parts[0];obj.name='falcon'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(obj.data)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
uv=obj.data.uv_layers.new(name='SurfaceUV')
for loop in obj.data.loops:
 v=obj.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/14,(v.y+v.z)/14)
obj.data.calc_loop_triangles();triangles=len(obj.data.loop_triangles)
assert triangles<=8000,triangles
dest=OUT.parent/'assets/resources/models/falcon.glb';bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
ps=[(v.co.x,v.co.z,-v.co.y) for v in obj.data.vertices]
record={'name':'falcon','tool':'Blender '+bpy.app.version_string,'authoring':'Original procedural meshes from the Null Range aircraft reference; no downloaded Hyper3D geometry','triangles':triangles,'bytes':dest.stat().st_size,'bounds':{'min':[min(p[i] for p in ps) for i in range(3)],'max':[max(p[i] for p in ps) for i in range(3)]},'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sourceHash':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()}
(OUT/'falcon-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
manifest=json.loads((OUT/'manifest.json').read_text())
record['generator']='build_falcon.py'
manifest['assets']=[a for a in manifest['assets'] if a['name']!='falcon']+[record]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'falcon.blend'))
print('FALCON_READY '+json.dumps(record))
