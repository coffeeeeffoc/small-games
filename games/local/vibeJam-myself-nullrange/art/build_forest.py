"""B3 masked needle branches and denser forest patches, within B2 collision envelopes."""
import bpy, bmesh, math, random, json, hashlib, struct
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
MODELS=OUT.parent/'assets/resources/models'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
image=bpy.data.images.load(str(OUT/'pine-branch-source.png'));image.scale(512,512);image.pack()
needles=bpy.data.materials.new('B3 masked pine needles');needles.use_nodes=True;needles.use_backface_culling=False
bsdf=needles.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.88
tex=needles.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
needles.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);needles.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
needles.surface_render_method='DITHERED'
bark=bpy.data.materials.new('B3 cedar bark');bark.diffuse_color=(.11,.07,.045,1);bark.use_nodes=True
bark.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.11,.07,.045,1)
records=[]
billboard=bpy.data.images.load(str(OUT/'pine-silhouette-source.png'));billboard.scale(512,768);billboard.pack()
silhouette=bpy.data.materials.new('B3 masked pine silhouette');silhouette.use_nodes=True;silhouette.use_backface_culling=False
sb=silhouette.node_tree.nodes.get('Principled BSDF');sb.inputs['Roughness'].default_value=1
st=silhouette.node_tree.nodes.new('ShaderNodeTexImage');st.image=billboard
silhouette.node_tree.links.new(st.outputs['Color'],sb.inputs['Base Color']);silhouette.node_tree.links.new(st.outputs['Alpha'],sb.inputs['Alpha'])
silhouette.surface_render_method='DITHERED'
def join(parts,name):
 bpy.ops.object.select_all(action='DESELECT')
 for p in parts:p.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=parts[0];o.name=name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 return o

def tree(name,height,radius,seed):
 rng=random.Random(seed)
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.26,radius2=.06,depth=height,location=(0,0,height/2))
 trunk=bpy.context.object;trunk.data.materials.append(bark)
 if not trunk.data.uv_layers:trunk.data.uv_layers.new(name='UVMap')
 vs=[];fs=[]
 for tier in range(8):
  z=height*(.16+tier*.10);r=radius*(1-tier*.105)
  for arm in range(5):
   a=arm*math.tau/5+tier*.83+rng.uniform(-.12,.12);f=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0));root=Vector((0,0,z))
   length=r*rng.uniform(.85,1.12);width=length*.68
   # Two folded frond planes give a branch volume from both side and overhead views.
   for fold in [-1,0,1]:
    i=len(vs);end=root+f*length+Vector((0,0,length*.45))
    vs.extend([root-side*width*.18,root+side*width*.18,end+side*width*.72+Vector((0,0,fold*width*.75)),end-side*width*.72+Vector((0,0,fold*width*.32))]);fs.append((i,i+1,i+2,i+3))
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();d.materials.append(needles)
 uv=d.uv_layers.new(name='UVMap')
 for p in d.polygons:
  for index,co in zip(p.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[index].uv=co
 n=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(n)
 return join([trunk,n],name)

def export(o,name):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.calc_loop_triangles()
 dest=MODELS/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
 raw=dest.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);binary=raw[20+jl:]
 for mat in doc.get('materials',[]):
  if mat['name'] in [needles.name,silhouette.name]:mat.update(alphaMode='MASK',alphaCutoff=.45,doubleSided=True)
 text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
 payload=struct.pack('<II',len(text),0x4e4f534a)+text+binary
 dest.write_bytes(struct.pack('<4sII',b'glTF',2,12+len(payload))+payload)
 points=[(v.co.x,v.co.z,-v.co.y) for v in o.data.vertices]
 record=dict(name=name,triangles=len(o.data.loop_triangles),bytes=dest.stat().st_size,bounds=dict(min=[min(p[i] for p in points) for i in range(3)],max=[max(p[i] for p in points) for i in range(3)]),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),generator='build_forest.py',sourceHash=hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest())
 assert record['triangles']<=6000
 records.append(record)
 return o
sources=[export(tree('pine-'+str(i+1),h,r,90+i),'pine-'+str(i+1)) for i,(h,r) in enumerate([(18,5.1),(14,4.6),(22,4.9)])]
for patch in range(2):
 rng=random.Random(850+patch);parts=[];cards=[];faces=[]
 for i in range(20):
  t=sources[i%3].copy();t.data=sources[i%3].data.copy();bpy.context.collection.objects.link(t)
  a=i*2.39996;r=math.sqrt((i+.5)/20)*22
  t.location=(math.cos(a)*r,math.sin(a)*r,-3);t.rotation_euler.z=rng.random()*math.tau
  scale=rng.uniform(.72,1);t.scale=(scale,scale,scale);parts.append(t)
  height=[18,14,22][i%3]*scale; width=[5.1,4.6,4.9][i%3]*scale
  for plane in range(3):
   angle=plane*math.pi/3+t.rotation_euler.z;side=Vector((math.cos(angle)*width,math.sin(angle)*width,0));base=Vector(t.location)
   k=len(cards);cards.extend([base-side,base+side,base+side+Vector((0,0,height)),base-side+Vector((0,0,height))]);faces.append((k,k+1,k+2,k+3))
 export(join(parts,'forest-'+str(patch+1)),'forest-'+str(patch+1))
 d=bpy.data.meshes.new('Distant spruce canopy');d.from_pydata(cards,[],faces);d.update();d.materials.append(silhouette)
 uv=d.uv_layers.new(name='UVMap')
 for p in d.polygons:
  for k,co in zip(p.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[k].uv=co
 o=bpy.data.objects.new('forest-lod-'+str(patch+1),d);bpy.context.collection.objects.link(o)
 export(o,o.name)
manifest=json.loads((OUT/'manifest.json').read_text())
for row in records:manifest['assets']=[r for r in manifest['assets'] if r['name']!=row['name']]+[row]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'forest-manifest.json').write_text(json.dumps(dict(authoring='Original 3D branches using supplied generated transparent needle texture; MASK, double-sided',sourceTexture='pine-branch-source.png',textureSha256=hashlib.sha256((OUT/'pine-branch-source.png').read_bytes()).hexdigest(),silhouetteTexture='pine-silhouette-source.png',silhouetteSource='image_gen: exec-8cefc5df-cc65-4fba-9d17-9a9e0c9020fb.png',silhouetteSha256=hashlib.sha256((OUT/'pine-silhouette-source.png').read_bytes()).hexdigest(),assets=records),indent=2)+'\n')
image.filepath='//pine-branch-source.png';billboard.filepath='//pine-silhouette-source.png'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'forest.blend'))
print('FOREST_READY '+json.dumps(records))
