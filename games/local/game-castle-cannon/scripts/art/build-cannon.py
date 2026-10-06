"""Original cannon sculpture, exported as embedded geometry for H5/native parity.
Run: blender -b --python scripts/art/build-cannon.py -- src/models/cannon.json
Coordinates intentionally use the game's X/Y-up/Z space; no external model assets.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts=[]
WOOD=['#a36e38','#b17d43','#946835','#c29758']
IRON='#686b61'; EDGE='#a9a48a'
def finish(o,color,group='base',bevel=0,metal=0,smooth=False):
    o['color']=color; o['group']=group; o['metal']=metal
    if bevel:
        for poly in o.data.polygons:poly.use_smooth=True
        m=o.modifiers.new('Hand-rounded edges','BEVEL'); m.width=bevel; m.segments=2
        m=o.modifiers.new('Face-weighted normals','WEIGHTED_NORMAL'); m.keep_sharp=True; m.weight=50
    if smooth:
        for p in o.data.polygons:p.use_smooth=True
    parts.append(o); return o
def box(name,position,size,color,bevel=.07,group='base',metal=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position); o=bpy.context.object; o.name=name
    o.scale=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,color,group,bevel,metal)
def cylinder(name,position,radius,depth,color,axis='z',group='base',metal=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=position)
    o=bpy.context.object; o.name=name
    if axis=='x':o.rotation_euler.y=math.pi/2
    if axis=='y':o.rotation_euler.x=math.pi/2
    return finish(o,color,group,.045,metal,True)
def lathe(name,profile,color,group='barrel',metal=0,axis='z',pos=(0,0,0),segments=32):
    verts=[]; faces=[]
    for r,z in profile:
        for i in range(segments):
            a=i*math.tau/segments; v=(math.cos(a)*r,math.sin(a)*r,z)
            if axis=='x':v=(z,v[1],-v[0])
            verts.append(tuple(v[j]+pos[j] for j in range(3)))
    for row in range(len(profile)-1):
        for i in range(segments):
            a=row*segments+i;b=row*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,color,group,0,metal,True)
def cheek(x):
    # Long curved silhouette: a trunnion shoulder and a tapered rear trail.
    outline=[(-2.9,1.2),(-2.9,1.85),(-1.6,2.2),(-.85,2.75),(.1,2.95),(.9,2.85),(1.55,2.3),(3.25,1.65),(3.5,1.15)]
    verts=[(x+side*.36,y,z) for side in [-1,1] for z,y in outline]
    n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('carriage cheek');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('sculpted oak cheek',mesh);bpy.context.collection.objects.link(o)
    finish(o,'#946835',bevel=.14)
    for z,y in [(-2.35,1.72),(-1.1,2.14),(.2,2.48),(1.35,2.03),(2.8,1.58)]:
        for side in [-1,1]:
            cylinder('forged carriage bolt',(x+side*.39,y,z),.105,.12,EDGE,'x',metal=.65)
for i in range(6): box('thick transverse oak bed',(0,1.17,-2.65+i*1.05),(4.6,.58,1.01),WOOD[i%3],.10)
for x in [-1.65,1.65]:
    box('long oak rail',(x,.82,.2),(.68,.52,7.0),'#8d6236',.12);cheek(x)
    for z in [-2.5,2.7]:box('iron binding strap',(x,1.5,z),(.84,.12,.42),IRON,.035,metal=.8)
cylinder('continuous heavy axle',(0,1.56,.6),.24,6.6,IRON,'x',metal=.75)
for side in [-1,1]:
    x=side*2.82
    # Thick wheel felloe with rounded section; genuine open interior.
    profile=[(1.17,-.29),(1.40,-.29),(1.50,-.23),(1.54,-.12),(1.54,.12),(1.50,.23),(1.40,.29),(1.17,.29),(1.13,.20),(1.13,-.20),(1.17,-.29)]
    lathe('rounded oak wheel rim',profile,'#a36e38','base',axis='x',pos=(x,1.56,.6),segments=32)
    lathe('forged wheel tyre',[(1.51,-.23),(1.59,-.19),(1.61,-.11),(1.61,.11),(1.59,.19),(1.51,.23),(1.51,-.23)],IRON,'base',.8,'x',(x,1.56,.6),32)
    for i in range(10):
        a=i*math.tau/10
        o=box('rounded radial wheel spoke',(x,1.56+math.cos(a)*.74,.6+math.sin(a)*.74),(.40,1.18,.24),WOOD[i%4],.06)
        o.rotation_euler.x=a
        cylinder('tyre rivet',(x+side*.26,1.56+math.cos(a)*1.45,.6+math.sin(a)*1.45),.07,.08,EDGE,'x',metal=.7)
    cylinder('oak hub',(x,1.56,.6),.43,.74,'#946835','x')
    cylinder('iron hub cap',(x+side*.47,1.56,.6),.29,.18,IRON,'x',metal=.8)
    cylinder('axle end',(x+side*.59,1.56,.6),.14,.18,EDGE,'x',metal=.7)
# Curved stave-built wooden barrel; each board is separate, with a tiny real seam.
zs=[-2.3,-2.1,-1.2,0,.9,1.7,2.35,2.55]
rs=[1.10,1.20,1.35,1.47,1.49,1.43,1.29,1.17]
for i in range(24):
    a0=i*math.tau/24+.006;a1=(i+1)*math.tau/24-.006
    verts=[]
    for z,r in zip(zs,rs):
        for a in [a0,a1]:verts.append((math.cos(a)*r,math.sin(a)*r,z))
    faces=[(j,j+1,j+3,j+2) for j in range(0,len(verts)-2,2)]
    mesh=bpy.data.meshes.new('barrel stave');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('curved oak stave',mesh);bpy.context.collection.objects.link(o)
    finish(o,WOOD[i%4],'barrel',smooth=True)
lathe('rounded breech',[(0,2.57),(.9,2.57),(1.18,2.51),(1.26,2.38),(1.21,2.29)],IRON,metal=.75)
cylinder('breech button',(0,0,2.72),.24,.28,EDGE,group='barrel',metal=.7)
# True hollow muzzle, including an inner bore and an annular face, never a black disk.
lathe('hollow forged muzzle',[(1.14,-2.28),(1.14,-2.65),(1.21,-2.72),(1.22,-3.0),(1.16,-3.12),(.87,-3.12),(.83,-3.04),(.83,-1.1),(.87,-1.04),(1.14,-2.28)],'#405053',metal=.8)
for z,r in [(-2.13,1.23),(-1.35,1.35),(.75,1.49),(2.05,1.37)]:
    lathe('rounded forged barrel band',[(r-.025,z-.16),(r+.06,z-.16),(r+.10,z-.1),(r+.10,z+.1),(r+.06,z+.16),(r-.025,z+.16)],IRON,metal=.8)
    for i in range(12):
        a=i*math.tau/12
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=6,radius=.073,location=(math.cos(a)*(r+.10),math.sin(a)*(r+.10),z))
        finish(bpy.context.object,EDGE,'barrel',metal=.7,smooth=True)
for x in [-1.56,1.56]:
    cylinder('elevation trunnion',(x,0,0),.27,.55,IRON,'x','barrel',.75)
    cylinder('bearing',(x,3.1,0),.42,.55,IRON,'x',metal=.75)
box('elevation wedge',(0,1.88,2.0),(1.9,.7,1.15),'#a36e38',.12)
sys.path.insert(0,str(Path(__file__).parent))
from sculpt_export import export_meshes
export_meshes(parts,sys.argv[sys.argv.index('--')+1])
