"""Original Kestrel / Warden airframes; Blender +Y nose -> glTF -Z, metres.
Run Blender --background --python build_variants.py. Editable sources in art; runtime binaries only in assets/resources/models.
"""
import bpy, bmesh, math, json, hashlib
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
parts = []
materials = {}

def material(name, color, metal, rough, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    materials[name] = m

def mesh(name, vertices, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    data.materials.append(materials[mat])
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for f in data.polygons:
        f.use_smooth = smooth
    parts.append(obj)
    return obj

def body(name, rings, mat, x=0, z=0, count=24):
    vs = [(x + math.cos(i * math.tau/count)*w, y, z + math.sin(i * math.tau/count)*h)
          for y,w,h in rings for i in range(count)]
    fs = [(j*count+i, j*count+(i+1)%count, (j+1)*count+(i+1)%count, (j+1)*count+i)
          for j in range(len(rings)-1) for i in range(count)]
    fs += [tuple(range(count-1,-1,-1)), tuple((len(rings)-1)*count+i for i in range(count))]
    return mesh(name, vs, fs, mat, True)

def plate(name, points, mat, depth=.12):
    n = len(points)
    return mesh(name, points + [(x,y,z-depth) for x,y,z in points],
                [tuple(range(n)), tuple(range(2*n-1,n-1,-1))] +
                [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], mat)

def strip(name, points, mat='Seam', width=.025):
    vs, fs = [], []
    for start,end in zip(points, points[1:]):
        a,b = Vector(start),Vector(end)
        cross = Vector((0,0,1)).cross((b-a).normalized())
        if cross.length < .1:
            cross = Vector((0,1,0)).cross((b-a).normalized())
        cross.normalize()
        cross *= width/2
        n = len(vs)
        vs += [a+cross,b+cross,b-cross,a-cross]
        fs.append((n,n+1,n+2,n+3))
    return mesh(name,vs,fs,mat)

def canopy(y, width, length, height):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(0,y,1))
    obj = bpy.context.object
    obj.name = 'Smoked canopy'
    obj.scale = (width,length,height)
    obj.data.materials.append(materials['Glass'])
    parts.append(obj)
    for p in obj.data.polygons:
        p.use_smooth = True
    for offset in [-.65,.35,.75]:
        radius = math.sqrt(1-offset*offset)
        strip('Canopy structural frame', [(width*radius*1.015*math.cos(i*math.pi/16),
              y+offset*length,1+height*radius*1.015*math.sin(i*math.pi/16)) for i in range(17)],'Amber',.05)

def nozzle(x, y, radius):
    for k in range(20):
        a,b = k*math.tau/20,(k+1)*math.tau/20-.012
        vs = [(x+r*radius*math.cos(t),y+dy,-.1+r*radius*math.sin(t))
              for dy,r in [(1,1),(0,.93),(-.25,.83),(-.25,.7),(.6,.68)] for t in [a,b]]
        mesh('Hollow exhaust petal',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],'Steel',True)
    body('Recessed exhaust core',[(y+.5,radius*.64,radius*.64),(y+.55,radius*.64,radius*.64)],'Cyan',x=x,z=-.1)

def airframe(kind):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    parts.clear()
    light = kind == 'kestrel'
    rings = ([(-6.8,.86,.43),(-5,1.05,.58),(-2,1.15,.68),(0,1.0,.72),(2,.95,.72),(4,.78,.62),(6,.55,.42),(8,.30,.24),(10,.012,.012)]
             if light else [(-7.5,2.35,.68),(-6,2.7,.92),(-3,2.45,.96),(0,2.0,.86),(3,1.5,.8),(5,1.25,.72),(7,.86,.53),(9,.36,.26),(11,.012,.012)])
    body('Sculpted fuselage',rings,'Ivory')
    body('Dark dorsal spine',[(y,w*.60,h*.34) for y,w,h in rings[2:-1]],'Navy',z=.73)
    canopy(3.4 if light else 4.1,.62 if light else .87,1.9 if light else 2.3,.64 if light else .72)
    for y,w,h in rings[1:-1]:
        strip('Service panel ring',[(w*1.008*math.cos(i*math.tau/32),y,h*1.01*math.sin(i*math.tau/32)) for i in range(33)],width=.02)
    for a in [.35,1.12,2.02,2.8]:
        strip('Longitudinal panel',[(w*1.01*math.cos(a),y,h*1.015*math.sin(a)) for y,w,h in rings])
    body('Nose identification band',[(7.4,.4,.30),(7.7,.355,.275)] if light else [(8.4,.52,.36),(8.7,.44,.32)],'Amber')
    for side in [-1,1]:
        def mir(points): return [(x*side,y,z) for x,y,z in points]
        if light:
            wing=[(.95,1.1,.12),(1.5,.8,.14),(7,-3.4,.22),(6.5,-4.9,.16),(1,-4,.15)]
            plate('Narrow swept wing',mir(wing),'Ivory',.17)
            plate('Forward canard',mir([(.75,4.2,.2),(3.4,2.7,.3),(3.15,1.7,.25),(.9,2.6,.18)]),'Navy',.11)
            plate('Canard amber leading edge',mir([(.8,4.25,.23),(3.45,2.75,.33),(3.3,2.5,.33),(.9,4.0,.23)]),'Amber',.02)
            plate('Wing tip stripe',mir([(5.75,-2.5,.25),(6.2,-2.9,.26),(6.8,-4.75,.2),(6.4,-4.9,.2)]),'Amber',.02)
            plate('Trailing control surface',mir([(1.25,-3.1,.2),(6.5,-4.94,.2),(6.95,-3.95,.25),(2.7,-2.5,.25)]),'Navy',.025)
            tail=[(.8,-6,.55),(1.7,-6.2,3.15),(1.7,-3.9,2.85),(.8,-2.8,.6)]
            engine_x, engine_y, radius = .72,-7.1,.59
        else:
            wing=[(1.65,3.3,.22),(3.0,2.4,.28),(10.3,-3.2,.35),(10.1,-6.1,.28),(4.7,-7.4,.25),(1.5,-6.7,.22)]
            plate('Broad cranked delta wing',mir(wing),'Ivory',.29)
            plate('Armoured wing root',mir([(1.85,1.2,.36),(3.5,-.2,.43),(4.2,-4.1,.4),(2.2,-5.8,.34)]),'Navy',.09)
            plate('Broad trailing flap',mir([(4.9,-5.7,.36),(10.14,-4.45,.4),(10.1,-6.15,.32),(4.7,-7.45,.3)]),'Navy',.04)
            plate('Outer identification stripe',mir([(8.7,-2.05,.38),(9.4,-2.57,.4),(9.6,-6.22,.34),(8.9,-6.42,.34)]),'Amber',.026)
            # Recessed fixed hardpoint pods make the heavy silhouette readable from the chase camera.
            body('Armoured underwing pod',[(-5.9,.48,.45),(-4.5,.58,.56),(-1,.46,.43),(.8,.08,.08)],'Navy',x=side*5.4,z=-.55)
            body('Pod identification collar',[(-2,.485,.45),(-1.55,.47,.44)],'Amber',x=side*5.4,z=-.55)
            tail=[(1.85,-6.4,.8),(3.35,-6.7,3.95),(3.1,-3.8,3.5),(1.85,-2.3,.9)]
            engine_x, engine_y, radius = 1.5,-8.05,.96
        p=mir(tail)
        q=[(x+side*.13,y,z) for x,y,z in p]
        mesh('Canted stabiliser',p+q,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'Navy')
        strip('Amber fin crest',mir([tail[1],tail[2]]),'Amber',.19)
        for frac in [.35,.65]:
            root=wing[0];tip=wing[2]
            start=(root[0]+(tip[0]-root[0])*frac,root[1]+(tip[1]-root[1])*frac,.4 if not light else .27)
            strip('Wing panel division',mir([start,(start[0]-.35,-3.0,.4 if not light else .27),(start[0]-.1,-4.3,.4 if not light else .27)]),width=.03)
        body('Engine nacelle',[(engine_y+.7,radius,radius),(engine_y+2,radius*1.12,radius*1.05),(-2,radius*1.05,radius*.95),(.8,radius*.82,radius*.75)],'Ivory',x=side*engine_x,z=-.1)
        body('Inset intake',[(.82,radius*.8,radius*.73),(1.1,radius*.72,radius*.65)],'Navy',x=side*engine_x,z=-.1)
        nozzle(side*engine_x,engine_y,radius)
        for y in [-5,-4.55,-4.1]:
            plate('Engine cooling vent',mir([(engine_x-.25,y,radius*.97),(engine_x+.3,y,radius*.97),(engine_x+.3,y+.18,radius*.97),(engine_x-.25,y+.18,radius*.97)]),'Navy',.02)
        emblem_x = 3.5 if light else 6.7
        plate('Amber squadron insignia',mir([(emblem_x,-1.8,.42),(emblem_x+.6,-2.15,.42),(emblem_x,-2.65,.42),(emblem_x-.6,-2.25,.42)]),'Amber',.02)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    obj=parts[0]
    obj.name=kind
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    uv=obj.data.uv_layers.new(name='SurfaceUV')
    for loop in obj.data.loops:
        v=obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(v.x/14,(v.y+v.z)/14)
    obj.data.calc_loop_triangles()
    triangles=len(obj.data.loop_triangles)
    assert triangles <= 8000
    dest=OUT.parent/'assets/resources/models'/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')))
    ps=[(v.co.x,v.co.z,-v.co.y) for v in obj.data.vertices]
    record={'name':kind,'triangles':triangles,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
            'bounds':{'min':[min(p[i] for p in ps) for i in range(3)],'max':[max(p[i] for p in ps) for i in range(3)]},
            'nozzles':[[-engine_x,-.1,-engine_y],[engine_x,-.1,-engine_y]],
            'generator':'build_variants.py','sourceHash':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),
            'authoring':'Original Blender meshes authored for Null Range; no downloaded model geometry','tool':'Blender '+bpy.app.version_string}
    return record

for args in [('Ivory',(.80,.82,.76),.35,.32),('Navy',(.025,.055,.085),.3,.29),('Amber',(.95,.44,.055),.25,.3),('Glass',(.035,.095,.13),.65,.12),('Steel',(.12,.17,.20),.8,.3),('Seam',(.085,.12,.13),.2,.6),('Cyan',(.07,.8,1),.15,.25,3)]:
    material(*args)
records=[airframe(kind) for kind in ['kestrel','warden']]
(OUT/'variants-manifest.json').write_text(json.dumps({'assets':records},indent=2)+'\n')
manifest=json.loads((OUT/'manifest.json').read_text())
manifest['assets']=[a for a in manifest['assets'] if a['name'] not in ['kestrel','warden']]+records
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('VARIANTS_READY '+json.dumps(records))
