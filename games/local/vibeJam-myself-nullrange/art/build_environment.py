"""Original Null Range environment assets. Run with Blender --background --python."""
import bpy, bmesh, math, random, json, hashlib
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
MODELS = OUT.parent / 'assets/resources/models'
MODELS.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(291026)

def material(name, color, metallic=0, roughness=.8, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'bark': material('Weathered cedar bark', (.17,.13,.10)),
    'pine': material('Pine needles shadow', (.065,.16,.13)),
    'pineLight': material('Pine needles tips', (.16,.28,.20)),
    'pineMid': material('Pine needles middle', (.10,.22,.17)),
    'rock': material('Slate blue stone', (.23,.31,.36)),
    'rockLight': material('Fractured slate faces', (.38,.44,.46)),
    'rockDark': material('Deep slate seams', (.12,.19,.23)),
    'moss': material('Moss ledges', (.28,.36,.23)),
    'snow': material('Alpine snow', (.79,.84,.83)),
    'cloud': material('Ivory vapor', (.82,.88,.91), roughness=1),
    'moon': material('Lunar surface', (.70,.78,.81), roughness=1, emission=.12),
    'moonDark': material('Lunar maria', (.36,.43,.48), roughness=1, emission=.10),
    'moonRim': material('Lunar crater rims', (.81,.85,.86), roughness=1, emission=.15),
    'ivory': material('Titanium ivory', (.77,.80,.74), metallic=.35, roughness=.35),
    'navy': material('Midnight ceramic', (.045,.085,.12), metallic=.35, roughness=.3),
    'red': material('Hostile vermilion', (.58,.10,.055), metallic=.35, roughness=.35),
    'glass': material('Smoked canopy', (.035,.10,.14), metallic=.6, roughness=.12),
    'amber': material('Amber identification', (.91,.46,.10), metallic=.25, roughness=.4),
    'cyan': material('Ion exhaust', (.12,.77,.88), emission=2.0),
}
catalog = []

def mesh(name, vertices, faces, mats, indices=None, smooth=False):
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.clear()
    for key in mats: data.materials.append(M[key])
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    for i,p in enumerate(data.polygons):
        p.material_index = indices[i] if indices else 0
        p.use_smooth = smooth
    return obj

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    obj=parts[0]; obj.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return obj

def ico(name, loc, scale, mat, subdivisions=2, smooth=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj=bpy.context.object; obj.name=name; obj.scale=scale
    obj.data.materials.append(M[mat])
    for p in obj.data.polygons: p.use_smooth=smooth
    return obj

def cone(name, r1, r2, depth, loc, mat, vertices=12):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(M[mat]); return o

def export(obj, name):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    # Stable planar UVs keep shared rock/lunar surfaces editable and portable.
    uv = obj.data.uv_layers.new(name='SurfaceUV')
    for loop in obj.data.loops:
        v = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (v.x / 14, (v.y + v.z) / 14)
    obj.data.calc_loop_triangles()
    tris=len(obj.data.loop_triangles)
    assert 0<tris<=12000, (name,tris)
    assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
    dest=MODELS/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,
        export_materials='EXPORT',export_tangents=True,export_cameras=False,export_lights=False,export_yup=True)
    points=[(v.co.x,v.co.z,-v.co.y) for v in obj.data.vertices]
    catalog.append({'name':name,'object':obj,'triangles':tris,'bytes':dest.stat().st_size,
        'bounds':{'min':[min(p[i] for p in points) for i in range(3)],
                  'max':[max(p[i] for p in points) for i in range(3)]},
        'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})

def pine(name, height, radius, seed):
    rng=random.Random(seed)
    parts=[cone('Trunk',height*.024,height*.008,height,(0,0,height/2),'bark')]
    verts=[]; faces=[]; colors=[]
    for tier in range(6):
        z=height*(.17+tier*.125)
        rad=radius*(1-tier*.14)
        count=10
        start=len(verts)
        for ring,(rr,zz) in enumerate([(rad*.28,z+.9),(rad,z),(rad*.79,z+.7),(0,z+height*.24)]):
            for k in range(count):
                a=k*math.tau/count+tier*.69
                jag=1+rng.uniform(-.2,.16)
                verts.append((math.cos(a)*rr*jag,math.sin(a)*rr*jag,zz+rng.uniform(-.25,.25)))
        for ring in range(3):
            for k in range(count):
                faces.append((start+ring*count+k,start+ring*count+(k+1)%count,
                    start+(ring+1)*count+(k+1)%count,start+(ring+1)*count+k))
                colors.append(rng.choices([0,1,2],[.5,.15,.35])[0])
    parts.append(mesh('Layered needle boughs',verts,faces,['pine','pineLight','pineMid'],colors))
    export(join(parts,name),name)

for i,(h,r) in enumerate([(18,4.5),(14,3.8),(22,4.0)]): pine('pine-'+str(i+1),h,r,90+i)

for i in range(3):
    o=ico('rock', (0,0,1.6),(3.8,2.8,2.4),'rock',2)
    o.data.materials.append(M['rockLight']);o.data.materials.append(M['moss'])
    rng=random.Random(400+i)
    for v in o.data.vertices:
        v.co*=rng.uniform(.82,1.18)
        v.co.z=max(v.co.z,-.63)
    for p in o.data.polygons:
        p.material_index=2 if p.center.z>.4 and rng.random()<.35 else rng.randrange(2)
    export(o,'rock-'+str(i+1))

for index in range(2):
    rng=random.Random(30+index)
    parts=[]
    for i in range(9):
        x=(i-4)*2.8; y=rng.uniform(-2.8,2.8); z=rng.uniform(0,2)
        parts.append(ico('Cloud vapor', (x,y,z),(rng.uniform(3,5),rng.uniform(3,5),rng.uniform(1.5,3)), 'cloud',2,True))
    export(join(parts,'Cloud bank'),'cloud-'+str(index+1))

# Original ridged mountain, with snow and rock determined by slope and altitude.
for index in range(2):
    rng=random.Random(60+index); n=36; vs=[]; fs=[]; ids=[]
    for j in range(n+1):
        y=(j/n-.5)*2
        for i in range(n+1):
            x=(i/n-.5)*2
            base=max(0,1-abs(x)**1.3-abs(y*.85)**1.8)
            ridges=(.72+.20*math.sin(x*13+y*9)+.08*math.cos(y*24-x*19))
            z=base*ridges*145 + rng.random()*base*5
            vs.append((x*150,y*120,z))
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i;b=a+1;c=a+n+2;d=a+n+1
            for face in [(a,b,c),(a,c,d)]:
                fs.append(face)
                va,vb,vc=[Vector(vs[v]) for v in face]
                normal=(vb-va).cross(vc-va).normalized();alt=(va.z+vb.z+vc.z)/3
                ids.append(3 if alt>82 and normal.z>.55 else 4 if alt<25 and normal.z>.65 else rng.choices([0,1,2],[.55,.25,.2])[0])
    export(mesh('Mountain ridge',vs,fs,['rock','rockLight','rockDark','snow','moss'],ids),'ridge-'+str(index+1))

moon=ico('Moon',(0,0,0),(6,6,6),'moon',4,True)
craters=[(Vector(v).normalized(),radius,depth) for v,radius,depth in [((.2,-1,.3),.23,.025),((-.4,-1,.6),.18,.022),((.65,-1,-.2),.15,.02),((-.2,-1,-.5),.32,.032)]]
rng=random.Random(198)
for i in range(54):
    direction=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1))).normalized()
    radius=rng.uniform(.045,.16)
    craters.append((direction,radius,radius*.1))
for v in moon.data.vertices:
    n=v.co.normalized(); depression=0
    for center,radius,depth in craters:
        d=(n-center).length
        if d<radius: depression+=depth*(1-d/radius)**.5
    v.co*=1-depression
moon.data.materials.append(M['moonDark']);moon.data.materials.append(M['moonRim'])
moon.data.update()
for p in moon.data.polygons:
    center=sum((moon.data.vertices[i].co for i in p.vertices),Vector()).normalized()
    for direction,radius,depth in craters:
        d=(center-direction).length/radius
        if d<.75: p.material_index=1;break
        if d<1.16:p.material_index=2
export(moon,'moon')

def aircraft(name, primary, scale=1):
    # Blender +Y nose exports to glTF -Z, matching the simulation forward axis.
    verts=[]; faces=[]
    rings=[(-7,1.8,.8),(-4,2.2,1.15),(0,1.9,1.15),(4,1.3,.95),(8,.55,.45),(11,.05,.05)]
    for y,w,h in rings:
        for k in range(8):
            a=k*math.tau/8;verts.append((math.cos(a)*w,y,math.sin(a)*h))
    for j in range(len(rings)-1):
        for k in range(8): faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
    faces.extend([tuple(range(7,-1,-1)),tuple(range(40,48))])
    parts=[mesh('Sculpted fuselage',verts,faces,[primary],smooth=True)]
    for side in [-1,1]:
        wing=[(side*1.1,3,0),(side*10,-3,.2),(side*8.5,-5,.18),(side*1.5,-3,.15)]
        pts=wing+[(x,y,z-.26) for x,y,z in wing]
        parts.append(mesh('Swept wing',pts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],[primary]))
        tail=[(side*1.6,-6,.5),(side*2.7,-6,4),(side*2.4,-3,3.5),(side*1.6,-2,.7)]
        pts=tail+[(x+side*.16,y,z) for x,y,z in tail]
        parts.append(mesh('Canted tail',pts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],['navy']))
        parts.append(ico('Amber wing marker',(side*8,-3,.3),(.8,.6,.07),'amber',1))
    parts.append(ico('Canopy',(0,3.5,.85),(.85,2.8,.75),'glass',2,True))
    # Separate panels, intakes and nacelles make the local airframe readable from chase view.
    for side in [-1,1]:
        parts.append(ico('Engine nacelle',(side*1.9,-3.5,-.4),(.95,4.4,.9),'ivory' if primary=='ivory' else primary,3,True))
        intake=cone('Air intake',.68,.72,1.2,(side*1.9,.2,-.35),'navy',20)
        intake.rotation_euler.x=math.pi/2;parts.append(intake)
        for j in range(4):
            parts.append(mesh('Wing panel seam',[(side*(2.4+j*1.3),1-j*.65,.22),(side*(2.5+j*1.3),1-j*.65,.22),(side*(3.1+j*1.2),-3.7,.22),(side*(3+j*1.2),-3.7,.22)],[(0,1,2,3)],['navy']))
        parts.append(mesh('Amber wing stripe',[(side*6,-1,.24),(side*6.7,-1.5,.24),(side*7.5,-4.7,.24),(side*6.8,-4.7,.24)],[(0,1,2,3)],['amber']))
        for j in range(3):
            ring=cone('Nozzle ribs',.85,.85,.13,(side*1.9,-7.4-j*.24,-.4),'navy',20)
            ring.rotation_euler.x=math.pi/2;parts.append(ring)
        glow=cone('Twin ion core',.64,.64,.08,(side*1.9,-8.1,-.4),'cyan',20)
        glow.rotation_euler.x=math.pi/2;parts.append(glow)
    obj=join(parts,name)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:
        if face.normal.z<0 and (all(abs(v.co.z-.22)<.001 for v in face.verts) or all(abs(v.co.z-.24)<.001 for v in face.verts)):
            face.normal_flip()
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    obj.scale=(scale,)*3
    export(obj,name)

aircraft('interceptor','red',.9)
aircraft('recon-drone','navy',.65)

parts=[cone('Beacon foundation',3,2.4,1,(0,0,.5),'rock',8),
    cone('Beacon tower',1.1,.55,11,(0,0,6),'navy',8),
    ico('Sensor',(0,0,12),(1.7,1.7,1.0),'ivory',2),
    cone('Signal emitter',.24,.24,1.8,(0,0,13.3),'cyan',12)]
export(join(parts,'Beacon'),'beacon')

# Merge repeated trees by material so forest density does not multiply draw calls.
pine_sources=[row['object'] for row in catalog if row['name'].startswith('pine-')]
for patch in range(2):
    rng=random.Random(850+patch); parts=[]
    for i in range(10):
        tree=pine_sources[i%len(pine_sources)].copy()
        tree.data=pine_sources[i%len(pine_sources)].data.copy()
        bpy.context.collection.objects.link(tree)
        tree.location=((i%4-1.5)*12+rng.uniform(-3,3),(i//4-1)*13+rng.uniform(-3,3),-3)
        tree.rotation_euler.z=rng.random()*math.tau
        scale=rng.uniform(.8,1.12);tree.scale=(scale,scale,scale)
        parts.append(tree)
    export(join(parts,'Forest patch'),'forest-'+str(patch+1))

serial=[{k:v for k,v in row.items() if k!='object'} for row in catalog]
(OUT/'manifest.json').write_text(json.dumps({'tool':'Blender '+bpy.app.version_string,
    'authoring':'Original procedural meshes; no external model copies','upAxis':'Y','aircraftForward':'-Z',
    'sourceHash':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest(), 'assets':serial},indent=2),encoding='utf-8')
assert len(serial)==16 and len({row['name'] for row in serial})==17

# Keep an editable, organized source scene; production GLBs were exported at origin.
for i,row in enumerate(catalog):
    obj=row['object']
    x=(i%5-2)*26;y=(i//5)*30
    if row['name'].startswith('ridge'):obj.scale=(.09,)*3
    if row['name'].startswith('forest'):obj.scale=(.42,)*3
    obj.location=(x,y,0)

bpy.ops.mesh.primitive_plane_add(size=250,location=(0,25,-.4))
floor=bpy.context.object;floor.name='Preview floor';floor.data.materials.append(M['navy'])
bpy.ops.object.camera_add(location=(105,-135,120))
camera=bpy.context.object;camera.rotation_euler=(Vector((0,38,5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=175;bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(0,-20,100))
bpy.context.object.data.energy=170000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=90
bpy.context.scene.world.color=(.3,.36,.42)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'nullrange-environment.blend'),compress=True)
# Preview rendering is separate from the reproducible production export.
print('NULLRANGE_ASSETS_OK',len(serial),sum(a['triangles'] for a in serial))
