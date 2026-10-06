"""Two original working gunners, with tailored coats, articulated limbs and tools.
Geometry uses game Y-up coordinates and the shared compact/AO exporter.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
parts=[]
group='loader'
def finish(o,color,bevel=0,metal=0):
    o['color']=color; o['group']=group; o['metal']=metal
    for p in o.data.polygons: p.use_smooth=True
    if bevel:
        m=o.modifiers.new('Soft sewn and forged edges','BEVEL'); m.width=bevel; m.segments=2
        m=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL'); m.keep_sharp=True
    parts.append(o); return o
def box(name,p,s,c,bevel=.04,metal=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,c,bevel,metal)
def ellipsoid(name,p,s,c,metal=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,radius=1,location=p)
    o=bpy.context.object;o.name=name;o.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,c,metal=metal)
def limb(name,a,b,r,c):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r,radius2=r*.84,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return finish(o,c,.035)
def coat(lean):
    # A fitted waist, flared coat hem, sloping shoulders and front opening.
    verts=[]
    for y,w,d,z in [(.82,.48,.26,.04),(1.03,.36,.24,0),(1.38,.44,.28,-lean),(1.62,.46,.25,-lean)]:
        verts.extend([(-w,y,z-d),(w,y,z-d),(w,y,z+d),(-w,y,z+d)])
    faces=[(3,2,1,0),(12,13,14,15)]
    for i in range(3):
        for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    mesh=bpy.data.meshes.new('tailored coat');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('flared blue wool coat',mesh);bpy.context.collection.objects.link(o)
    finish(o,'#1764a0',.07)
    box('front coat placket',(0,1.24,-.28-lean*.7),(.055,.61,.035),'#d6c7a6',.01)
    box('leather waist belt',(0,1.03,-.02),(.84,.13,.55),'#514438')
    box('brass belt buckle',(0,1.03,-.31),(.18,.14,.05),'#b7a57c',.025,.6)
    for y in [1.2,1.4,1.55]:ellipsoid('coat button',(.10,y,-.30-lean*.8),(.035,.035,.02),'#b7a57c',.5)
def figure(role):
    global group
    group=role; lean=.15 if role=='gunner' else .06
    # Offset knees and planted soles make the work poses legible.
    for side in [-1,1]:
        hip=(side*.22,.88,0);knee=(side*.27,.49,side*.10+.04);ankle=(side*.30,.17,side*.13+.04)
        limb('trouser thigh',hip,knee,.17,'#746b55');limb('trouser shin',knee,ankle,.14,'#746b55')
        ellipsoid('bent cloth knee',knee,(.17,.18,.17),'#746b55')
        box('rounded leather boot',(ankle[0],.13,ankle[2]-.10),(.35,.25,.57),'#403c35',.08)
        box('thick boot sole',(ankle[0],.03,ankle[2]-.10),(.37,.06,.60),'#282d2c',.02)
    coat(lean)
    ellipsoid('neck',(0,1.68,-lean),(.16,.20,.16),'#c99b70')
    ellipsoid('warm face',(0,1.93,-lean-.03),(.34,.35,.29),'#ddb38a')
    for side in [-1,1]:
        ellipsoid('ear',(side*.33,1.91,-lean),(.09,.13,.08),'#c99b70')
        ellipsoid('dark attentive eye',(side*.125,1.99,-lean-.295),(.032,.038,.018),'#263234')
        brow=box('eyebrow',(side*.125,2.055,-lean-.29),(.12,.035,.025),'#5a4432',.012)
        brow.rotation_euler.z=side*.14
        ellipsoid('moustache',(side*.085,1.83,-lean-.285),(.12,.065,.045),'#6a4c35')
    ellipsoid('rounded nose',(0,1.91,-lean-.32),(.09,.115,.08),'#c99b70')
    ellipsoid('blue domed helmet',(0,2.14,-lean),(.385,.25,.34),'#367db0',.45)
    box('helmet brow brim',(0,2.04,-lean-.32),(.80,.07,.16),'#427b99',.045,.45)
    box('helmet centre rib',(0,2.25,-lean-.08),(.07,.10,.52),'#b0b6aa',.04,.6)
    for side in [-1,1]:
        box('helmet cheek plate',(side*.28,1.85,-lean+.03),(.12,.32,.20),'#427b99',.055,.4)
    if role=='loader':
        elbows=[(-.64,1.26,-.10),(.64,1.23,-.08)]
        hands=[(-.21,1.17,-.54),(.21,1.17,-.54)]
        ellipsoid('solid round held in both hands',(0,1.26,-.57),(.25,.25,.25),'#3c4240',.7)
    else:
        elbows=[(-.63,1.30,-.43),(.62,1.42,-.42)]
        hands=[(-.36,1.22,-.85),(.32,1.39,-.88)]
        limb('long wooden rammer',(-.63,1.13,-.94),(1.22,1.66,-.94),.045,'#70583b')
        ellipsoid('rammer padded head',(1.23,1.66,-.94),(.14,.18,.14),'#b8aa89')
    for side,elbow,hand in zip([-1,1],elbows,hands):
        shoulder=(side*.43,1.52,-lean)
        limb('blue coat upper sleeve',shoulder,elbow,.19,'#367db0')
        ellipsoid('rolled linen cuff',elbow,(.19,.14,.18),'#d6c7a6')
        limb('bare working forearm',elbow,hand,.125,'#ddb38a')
        ellipsoid('hand gripping tool',hand,(.15,.13,.12),'#c99b70')
        for finger in range(3):
            ellipsoid('curled finger',(hand[0]+(finger-1)*.06,hand[1]-.07,hand[2]-.075),(.035,.07,.04),'#ddb38a')
figure('loader');figure('gunner')
sys.path.insert(0,str(Path(__file__).parent))
from sculpt_export import export_meshes
export_meshes(parts,sys.argv[sys.argv.index('--')+1])
