"""Original rounded timber lookout and real voussoir arch; game coordinates, Y up."""
import bpy, math, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from sculpt_export import export_meshes
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=[]
def mesh(name,vertices,faces,color,group='lookout',bevel=.06,metal=0):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    return finish(o,color,group,bevel,metal)
def finish(o,color,group='lookout',bevel=.06,metal=0):
    o['color']=color;o['group']=group;o['metal']=metal
    if bevel:
        for poly in o.data.polygons:poly.use_smooth=True
        m=o.modifiers.new('Soft hand-carved edges','BEVEL');m.width=bevel;m.segments=2
        m=o.modifiers.new('Face-weighted normals','WEIGHTED_NORMAL');m.keep_sharp=True
    parts.append(o);return o
def box(name,p,size,color,bevel=.06,metal=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,color,bevel=bevel,metal=metal)
def beam(name,a,b,width,depth,color):
    # Carved timber follows its real load path, with gently tapered ends.
    from mathutils import Vector
    a=Vector(a);b=Vector(b);d=b-a
    o=box(name,(a+b)*.5,(width,d.length,depth),color,.075)
    o.rotation_euler=d.to_track_quat('Y','Z').to_euler();return o
def bolt(p,axis='z'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=5,radius=.075,location=p)
    o=bpy.context.object;o.name='iron bracket rivet';o.scale=(1,1,.55) if axis=='z' else (.55,1,1)
    for poly in o.data.polygons:poly.use_smooth=True
    finish(o,'#a9a48a',bevel=0,metal=.7)
for i in range(8):
    box('rounded oak platform board',(-2.23+i*.64,13.2,0),(.61,.33,5.25),['#a36e38','#b17d43','#946835'][i%3],.07)
for x in [-2,2]:
    beam('outer bearing post',(x,12.7,-2),(x,15.9,-2),.38,.42,'#725034')
    beam('outer bearing post',(x,12.7,2),(x,15.9,2),.38,.42,'#725034')
    for z in [-2,2]:
        beam('diagonal brace',(x,13.3,z),(x*.1,15.4,z),.24,.28,'#a57b4d')
        box('iron post foot',(x,13.38,z+.23),(.48,.58,.1),'#686b61',.045,.75)
        for y in [13.22,13.55]:bolt((x,y,z+.30))
for z in [-2.04,2.04]:
    beam('cross timber',(-2.22,15.6,z),(2.22,15.6,z),.42,.37,'#946835')
    beam('guard rail',(-2.20,14.3,z),(2.20,14.3,z),.27,.28,'#a36e38')
    for x in [-1.65,0,1.65]:
        box('rail joint plate',(x,14.3,z+.16),(.40,.38,.075),'#686b61',.04,.7)
        bolt((x,14.3,z+.22))
for x in [-2.05,2.05]:beam('side top timber',(x,15.6,-2.25),(x,15.6,2.25),.38,.38,'#946835')
# Four genuine roof slopes, including rounded individual overlapping tiles.
base=15.92;top=18.25;half=2.8
verts=[(-half,base,-half),(half,base,-half),(half,base,half),(-half,base,half),(0,top,0)]
mesh('hip roof underlay',verts,[(0,4,1),(1,4,2),(2,4,3),(3,4,0),(0,1,2,3)],'#795c3d',bevel=.025)
for side in range(4):
    angle=side*math.pi/2
    for row in range(6):
        near=row/6;far=min(1,(row+1.17)/6)
        n=max(1,round(8*(1-near)))
        for col in range(n):
            tile=[]
            for level,t in enumerate([near,far]):
                z=half*(1-t);span=half*(1-t)
                for u in [col/n,(col+1)/n]:
                    x=(-1+u*2)*span
                    y=base+(top-base)*t+.04+math.sin(col*11+row*7)*.018
                    tile.append((math.cos(angle)*x+math.sin(angle)*z,y,-math.sin(angle)*x+math.cos(angle)*z))
            front=[tile[0],tile[1],tile[3],tile[2]]
            back=[(x,y-.10,z) for x,y,z in front]
            mesh('rounded clay shingle',front+back,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],['#995335','#a66a40','#8e5037'][(col+row)%3],bevel=.025)
# Voussoirs are curved stone wedges, with full depth and a real inner opening.
for i in range(13):
    start=i*math.pi/13+.012;end=(i+1)*math.pi/13-.012
    verts=[]
    for z in [-.48,.48]:
        for r in [3.35,4.30]:
            for a in [start,(start+end)/2,end]:verts.append((math.cos(a)*r,math.sin(a)*r,z))
    faces=[]
    for j in range(2):faces += [(j,j+1,j+4,j+3),(j+6,j+9,j+10,j+7),(j,j+6,j+7,j+1),(j+3,j+4,j+10,j+9)]
    faces += [(0,3,9,6),(2,8,11,5)]
    mesh('curved chipped arch stone',verts,faces,['#cbb78e','#d4c19b','#bda984','#e0ccaa','#c6b28e'][i%5],'arch',.07)
export_meshes(parts,sys.argv[sys.argv.index('--')+1])
