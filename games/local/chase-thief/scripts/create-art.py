"""Original AI-authored modular city assets, generated with Blender 4.x.
Run: blender -b --python scripts/create-art.py
Meshes are exported in Y-up metres with normals, colours and rigid bone bindings.
"""
import bpy, math, json, os, hashlib, wave, struct, random
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets/resources/art")
SOURCE = os.path.join(ROOT, "art-source")
os.makedirs(OUT, exist_ok=True)
os.makedirs(SOURCE, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}
groups = {}
current = []

def mat(name, rgb):
    if name not in materials:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*rgb, 1)
        materials[name] = m
    return materials[name]

C = {
    "jacket": (0.055, .25, .48), "trim": (.11, .36, .56), "skin": (.67, .43, .27),
    "pants": (.105, .14, .155), "hair": (.07, .055, .045), "shoe": (.16, .12, .09),
    "sole": (.68, .62, .49), "shirt": (.82, .81, .7), "wood": (.40, .22, .105),
    "lightwood": (.63, .41, .21), "dark": (.095, .14, .145), "iron": (.13, .19, .18),
    "cream": (.83, .77, .61), "orange": (.87, .32, .075), "teal": (.08, .33, .29),
    "leaf": (.21, .36, .13), "leaflight": (.40, .49, .19), "terra": (.61, .27, .15),
    "yellow": (.96, .69, .20), "red": (.74, .17, .08),
    "skinlight": (.74, .51, .35), "lip": (.48, .25, .18), "eye": (.92, .89, .81),
    "iris": (.19, .12, .075)
}
for n, c in C.items(): mat(n, c)

def finish(obj, name, color, bone=None, bevel=0):
    obj.name = name
    obj.data.materials.append(materials[color])
    if bevel:
        mod = obj.modifiers.new("Soft manufactured edges", 'BEVEL')
        mod.width = bevel
        mod.segments = 3 if bone else 1
    if bone: obj["bone"] = bone
    current.append(obj)
    return obj

def box(name, loc, scale, color, bone=None, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, color, bone, bevel)

def ball(name, loc, scale, color, bone=None, detail=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=max(detail, 24) if bone else detail,
                                       ring_count=16 if bone else 8, radius=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons: p.use_smooth = True
    return finish(o, name, color, bone)

def rod(name, a, b, radius, color, bone=None, radius2=None, vertices=10):
    mid = (Vector(a) + Vector(b)) / 2
    d = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius2 is None else radius2,
                                  depth=d.length, location=mid)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    for p in o.data.polygons: p.use_smooth = True
    return finish(o, name, color, bone)

def group(name):
    global current
    current = []
    groups[name] = current

group("runner")
bones = [
    ("hips", None, (0, .91, 0)), ("spine", "hips", (0, 1.08, 0)),
    ("head", "spine", (0, 1.55, 0)),
    ("armL", "spine", (-.255, 1.43, 0)), ("foreL", "armL", (-.29, 1.12, .015)),
    ("armR", "spine", (.255, 1.43, 0)), ("foreR", "armR", (.29, 1.12, .015)),
    ("thighL", "hips", (-.125, .91, 0)), ("shinL", "thighL", (-.125, .49, 0)),
    ("footL", "shinL", (-.125, .105, 0)),
    ("thighR", "hips", (.125, .91, 0)), ("shinR", "thighR", (.125, .49, 0)),
    ("footR", "shinR", (.125, .105, 0)),
]
bone_positions = {n: Vector(p) for n, parent, p in bones}

def profile(name, rings, color, bone):
    """Elliptical clothing silhouette with smooth shared normals and rounded ends."""
    vertices, faces = [], []
    segments = 24
    for y, rx, rz, cz in rings:
        for i in range(segments):
            a = i * math.tau / segments
            vertices.append((rx * math.cos(a), y, cz + rz * math.sin(a)))
    for r in range(len(rings) - 1):
        for i in range(segments):
            a = r * segments + i; b = r * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    for p in mesh.polygons: p.use_smooth = True
    return finish(obj, name, color, bone)

def limb(name, a, b, radius, color, bone, depth=1):
    midpoint = (Vector(a) + Vector(b)) / 2; direction = Vector(b) - Vector(a)
    half = direction.length / 2
    obj = profile(name, [(-half-radius*.4,.001,.001,0),(-half,radius*.96,radius*depth,0),
        (-half*.35,radius,radius*depth,0),(half*.5,radius*.85,radius*.85*depth,0),
        (half,radius*.78,radius*.78*depth,0),(half+radius*.4,.001,.001,0)], color, bone)
    obj.location = midpoint
    obj.rotation_euler = direction.to_track_quat('Y', 'Z').to_euler()
    return obj

profile("Fitted jacket", [(1.00,.18,.115,0),(1.04,.22,.145,0),(1.15,.215,.15,0),
    (1.32,.25,.16,0),(1.43,.25,.145,0),(1.49,.19,.125,0),(1.52,.09,.09,0)], "jacket", "spine")
ball("Soft jacket hem", (0,1.035,0),(.225,.055,.15),"trim","spine")
box("Jacket zip", (0,1.29,.157),(.009,.40,.01),"cream","spine",.004)
for sign in [-1,1]:
    collar=box("Folded collar",(sign*.066,1.495,.082),(.065,.08,.026),"trim","spine",.012)
    collar.rotation_euler.z=sign*.38
    pocket=box("Welt pocket",(sign*.14,1.15,.135),(.10,.012,.014),"trim","spine",.006)
    pocket.rotation_euler.z=sign*.22
rod("Neck", (0, 1.49, 0), (0, 1.62, 0), .075, "skin", "head")
profile("Face and jaw",[(1.565,.045,.035,.04),(1.59,.073,.067,.026),(1.63,.101,.095,.018),
    (1.70,.121,.113,.008),(1.77,.123,.111,0),(1.83,.105,.09,-.01),(1.865,.05,.045,-.01),
    (1.875,.001,.001,-.01)],"skinlight","head")
profile("Shaped short hair",[(1.77,.12,.087,-.029),(1.80,.128,.109,-.018),(1.86,.119,.105,-.015),
    (1.90,.078,.07,-.008),(1.915,.001,.001,0)],"hair","head")
fringe=ball("Swept fringe",(-.037,1.825,.077),(.093,.047,.049),"hair","head");fringe.rotation_euler.z=-.22
for x in [-.12,.12]:
    ball("Ear",(x,1.715,0),(.025,.041,.022),"skin","head")
ball("Nose bridge",(0,1.72,.112),(.021,.042,.026),"skinlight","head")
ball("Nose tip",(0,1.698,.136),(.025,.019,.023),"skinlight","head")
for sign in [-1,1]:
    x=sign*.045
    ball("Eye socket",(x,1.743,.106),(.023,.012,.009),"skin","head")
    ball("Eye white",(x,1.746,.112),(.016,.006,.004),"eye","head")
    ball("Iris",(x,1.746,.116),(.006,.006,.002),"iris","head")
    brow=ball("Eyebrow",(x,1.764,.109),(.025,.004,.006),"hair","head");brow.rotation_euler.z=sign*-.1
ball("Lower lip",(0,1.653,.111),(.032,.006,.008),"lip","head")
ball("Trousers hip", (0, .92, 0), (.205, .15, .14), "pants", "hips")
for sign, suffix in [(-1, "L"), (1, "R")]:
    x = .125 * sign
    limb("Upper sleeve "+suffix,(sign*.23,1.45,0),(sign*.29,1.12,.015),.083,"jacket","arm"+suffix,1.08)
    ball("Soft elbow "+suffix,(sign*.29,1.12,.015),(.065,.067,.068),"jacket","fore"+suffix)
    limb("Lower sleeve "+suffix,(sign*.29,1.12,.015),(sign*.30,.96,.025),.066,"jacket","fore"+suffix)
    ball("Cuff "+suffix,(sign*.30,.96,.025),(.054,.025,.055),"trim","fore"+suffix)
    limb("Wrist "+suffix,(sign*.30,.97,.025),(sign*.30,.89,.03),.043,"skinlight","fore"+suffix)
    ball("Hand "+suffix,(sign*.30,.87,.04),(.047,.066,.034),"skinlight","fore"+suffix)
    ball("Thumb "+suffix,(sign*.265,.89,.062),(.024,.038,.024),"skin","fore"+suffix)
    for i in range(3):ball("Fingers "+suffix,(sign*(.278+i*.019),.827,.048),(.012,.026,.023),"skinlight","fore"+suffix)
    limb("Thigh "+suffix,(x,.92,0),(x,.49,0),.102,"pants","thigh"+suffix,1.1)
    ball("Knee "+suffix,(x,.49,0),(.079,.08,.079),"pants","shin"+suffix)
    limb("Calf "+suffix,(x,.49,0),(x,.14,0),.078,"pants","shin"+suffix)
    ball("Sneaker " + suffix, (x, .09, .055), (.092, .075, .17), "shoe", "foot"+suffix)
    box("Sole " + suffix, (x, .035, .055), (.18, .035, .29), "sole", "foot"+suffix, .02)
    for z in [.08, .12]: box("Lace", (x, .15, z), (.10, .008, .012), "cream", "foot"+suffix, 0)
box("Satchel", (.17, 1.11, -.19), (.23, .27, .10), "shoe", "spine", .045)
strap = box("Satchel strap", (-.01, 1.32, -.165), (.035, .5, .018), "shoe", "spine")
strap.rotation_euler.z = -.40

# Real Blender armature with rigid vertex groups, retained for subsequent weight refinement.
armature = bpy.data.armatures.new("Runner skeleton")
rig = bpy.data.objects.new("Runner rig", armature)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, parent, position in bones:
    b = armature.edit_bones.new(name)
    b.head = position
    b.tail = Vector(position) + Vector((0, .1, 0))
    if parent: b.parent = armature.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for obj in groups["runner"]:
    vg = obj.vertex_groups.new(name=obj["bone"])
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    modifier = obj.modifiers.new("Rigid armature binding", 'ARMATURE')
    modifier.object = rig

group("crate")
box("Crate body", (0,.48,0), (.95,.96,.85), "wood")
for y in [.12,.36,.6,.84]:
    for z in [-.44,.44]: box("Horizontal planks",(0,y,z),(1.0,.18,.045),"lightwood")
for x in [-.44,.44]:
    for z in [-.46,.46]: box("Corner braces",(x,.48,z),(.10,1,.06),"wood")
box("Upper crate body", (0,1.47,0), (.82,.94,.78), "wood")
for y in [1.12,1.40,1.70]:
    for z in [-.40,.40]: box("Upper crate planks",(0,y,z),(.85,.19,.04),"lightwood")
for x in [-.38,.38]:
    for z in [-.42,.42]: box("Upper crate braces",(x,1.47,z),(.08,.98,.06),"wood")
group("barrier")
for x in [-.85,.85]:
    box("Foot",(x,.065,0),(.25,.13,.60),"iron")
    box("Post",(x,.41,0),(.10,.70,.10),"cream")
box("Board",(0,.59,0),(1.9,.28,.13),"cream")
for x in [-.72,-.24,.24,.72]:
    p=box("Warning stripe",(x,.59,.071),(.19,.29,.015),"orange",bevel=0)
    p.rotation_euler.z=.24
group("beam")
for x in [-1,1]:
    rod("Upright",(x,0,0),(x,2.15,0),.065,"teal")
    box("Anchor",(x,.04,0),(.3,.08,.4),"iron")
box("Low hanging shutter",(0,1.62,0),(2.08,.73,.15),"teal")
for y in [1.32,1.48,1.64,1.80,1.96]: box("Shutter rib",(0,y,.095),(2.05,.026,.045),"cream",bevel=0)
group("barrel")
rod("Barrel",(0,.1,0),(0,.85,0),.34,"wood",vertices=12)
for y in [.18,.72]: rod("Iron hoop",(0,y-.035,0),(0,y+.035,0),.357,"iron",vertices=12)
group("cart")
box("Cart tray",(0,.73,0),(1.8,.20,.95),"lightwood")
for x in [-.73,.73]:
    for z in [-.38,.38]:
        rod("Wheel",(x-.06,.25,z),(x+.06,.25,z),.22,"iron",vertices=12)
        rod("Frame",(x,.25,z),(x,.72,z),.04,"iron")
for level in range(3):
    y=1.05+level*.44
    box("Loaded delivery crate",(0,y,0),(1.65-level*.10,.39,.83),"wood")
    for z in [-.44,.44]:
        box("Delivery crate rim",(0,y+.14,z),(1.72-level*.10,.08,.06),"lightwood")
        for x in [-.69,0,.69]: box("Delivery crate brace",(x,y,z),(.07,.4,.055),"lightwood")
for i in range(3): ball("Produce",((i-1)*.40,2.20,0),(.16,.16,.14),"orange" if i%2 else "red")
group("stall")
box("Counter",(0,.82,0),(2.3,.16,1.3),"wood")
for x in [-1.05,1.05]:
    for z in [-.5,.5]: rod("Stall poles",(x,0,z),(x,2.4,z),.045,"wood")
for i in range(8):
    box("Canvas awning",(-1.15+i*.33,2.42,0),(.33,.08,1.7),"cream" if i%2 else "teal")
    box("Awning fringe",(-1.15+i*.33,2.25,.82),(.33,.3,.035),"cream" if i%2 else "teal")
for i in range(15): ball("Fruit",((i%5-2)*.37,1.02,(i//5-1)*.32),(.15,.14,.15),"yellow" if i%3 else "orange")
group("tree")
box("Tree planter",(0,.2,0),(1.1,.4,1.1),"cream")
rod("Tree trunk",(0,.3,0),(.08,2.4,0),.12,"wood",radius2=.06)
for i in range(7):
    t=i*2.4
    ball("Leaves",(.40*math.cos(t),2.1+(i%3)*.25,.4*math.sin(t)),(.63,.55,.65),"leaf" if i%2 else "leaflight",detail=8)
group("lamp")
rod("Lamp pole",(0,0,0),(0,3.7,0),.05,"iron")
rod("Lamp arm",(0,3.6,0),(.45,3.6,0),.045,"iron")
box("Lamp glass",(.45,3.45,0),(.24,.32,.24),"yellow")
box("Lamp cap",(.45,3.65,0),(.36,.08,.36),"iron")
group("bench")
for z in [-.22,0,.22]: box("Seat slats",(0,.52,z),(1.6,.07,.16),"wood")
for y in [.75,.95]: box("Back slats",(0,y,-.27),(1.6,.12,.07),"lightwood")
for x in [-.6,.6]:
    rod("Leg",(x,0,.2),(x,.55,.2),.04,"iron")
    rod("Back support",(x,0,-.23),(x,1,-.23),.04,"iron")
group("bin")
box("Bin body",(0,.45,0),(.55,.9,.55),"teal",bevel=.04)
box("Bin lid",(0,.94,0),(.62,.09,.62),"iron",bevel=.03)
group("pot")
rod("Clay pot",(0,0,0),(0,.42,0),.2,"terra",radius2=.3)
for i in range(5):
    t=i*2.4
    ball("Plant leaf",(.19*math.cos(t),.57+i*.055,.19*math.sin(t)),(.18,.22,.11),"leaf",detail=8)
group("coin")
rod("Recovered token",(0,.35,-.055),(0,.35,.055),.24,"yellow",vertices=12)
box("Token mark",(0,.35,.06),(.07,.26,.018),"cream",bevel=.015)
group("aircon")
box("AC unit",(0,0,0),(1.0,.55,.35),"cream")
rod("AC fan",(0,0,.18),(0,0,.2),.2,"iron",vertices=16)
for x in [-.28,-.14,0,.14,.28]: box("Grille",(x,0,.22),(.012,.43,.02),"cream",bevel=0)

depsgraph = bpy.context.evaluated_depsgraph_get()
def export_objects(objects, bone=None):
    result = {"positions":[],"normals":[],"colors":[],"uvs":[],"indices":[]}
    vertices = {}
    for obj in objects:
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        color = tuple(obj.data.materials[0].diffuse_color)
        inv = bone_positions.get(bone, Vector((0,0,0)))
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            for vi in tri.vertices:
                vertex = mesh.vertices[vi]
                p = obj.matrix_world @ vertex.co - inv
                n = normal_matrix @ (vertex.normal if mesh.polygons[tri.polygon_index].use_smooth else tri.normal)
                n.normalize()
                position = tuple(round(v,5) for v in p)
                normal = tuple(round(v,5) for v in n)
                tint = tuple(round(v,4) for v in color)
                key = position + normal + tint
                if key not in vertices:
                    vertices[key] = len(result["positions"]) // 3
                    result["positions"].extend(position)
                    result["normals"].extend(normal)
                    result["colors"].extend(tint)
                    result["uvs"].extend((0,0))
                result["indices"].append(vertices[key])
        ev.to_mesh_clear()
    return result
data = {"version":1,"generator":"Blender "+bpy.app.version_string,"units":"metres-Y-up","meshes":{},"rig":[]}
for name, objects in groups.items():
    if name != "runner": data["meshes"][name] = export_objects(objects)
for name, parent, position in bones:
    subset = [o for o in groups["runner"] if o["bone"]==name]
    origin = Vector(position) - (bone_positions[parent] if parent else Vector((0,0,0)))
    data["rig"].append({"name":name,"parent":parent,"position":list(origin),
                        "mesh":export_objects(subset,name)})
with open(os.path.join(OUT,"city-models.json"),"w") as f:
    json.dump(data,f,separators=(',',':'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,"city-kit.blend"))

# Original short synthesized cues, played through Cocos AudioSource.
random.seed(19)
for name, dur, freq in [("step",.065,115),("jump",.18,420),("slide",.22,170),("coin",.16,980),("hit",.26,100),("click",.08,600)]:
    rate=22050
    frames=[]
    for i in range(int(dur*rate)):
        t=i/rate; env=(1-t/dur)**2
        tone=math.sin(2*math.pi*(freq*t+(180*t*t if name=="jump" else 0)))
        noise=(random.random()*2-1)*(.65 if name in ["hit","slide","step"] else .03)
        frames.append(struct.pack("<h",int(max(-1,min(1,(tone*.35+noise)*env)) * 16000)))
    with wave.open(os.path.join(OUT,name+".wav"),"wb") as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(b"".join(frames))
print("Exported",len(data["meshes"]),"props,",len(data["rig"]),"rigid-bound bones.")
