"""Render the Office sample from Blender's CC0 realistic human mesh.

Run: blender --background --factory-startup --python art/build_scene.py -- preview
Run: blender --background --factory-startup --python art/build_scene.py -- render
This is a fixed-camera, authored animation sample, not a general character system.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'public' / 'office-scene'
FRAMES = ROOT / 'frames'
SOURCE = ROOT / 'source' / 'human-base-meshes' / 'human_base_meshes_bundle.blend'
MODE = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'preview'
ONLY = sys.argv[sys.argv.index('--clip')+1] if '--clip' in sys.argv else None
START = int(sys.argv[sys.argv.index('--start')+1]) if '--start' in sys.argv else 0
END = int(sys.argv[sys.argv.index('--end')+1]) if '--end' in sys.argv else 10000
OUT.mkdir(parents=True, exist_ok=True)
FRAMES.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24 if MODE == 'preview' else 16
scene.cycles.use_denoising = True
try:
    devices=bpy.context.preferences.addons['cycles'].preferences
    devices.compute_device_type='OPTIX';devices.get_devices()
    for device in devices.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
    scene.cycles.denoiser='OPTIX'
    scene.cycles.denoising_use_gpu=True
except Exception:
    scene.cycles.device='CPU'
if '--cpu' in sys.argv:
    scene.cycles.device='CPU';scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=False
if '--eevee' in sys.argv:
    scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x = 780
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.render.fps = 30
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.world.color = (.25, .25, .25)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

def material(name, color, roughness=.5, metal=0, noise=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    n = m.node_tree.nodes
    p = n.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    if noise:
        tex = n.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 85
        bump = n.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise
        bump.inputs['Distance'].default_value = .008
        m.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

skin = material('Warm natural skin', (.34, .18, .105), .62, noise=.20)
skin.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value = .07
shirt = material('Dust blue cotton shirt', (.18, .32, .4), .78, noise=.23)
pants = material('Charcoal trousers', (.038, .051, .065), .85, noise=.27)
hair = material('Dark brown hair', (.028, .018, .012), .69, noise=.35)
leather = material('Dark leather shoes', (.022, .026, .033), .35)
white = material('Warm off-white', (.77, .76, .69), .58)
wall = material('Warm plaster', (.55, .59, .58), .94, noise=.13)
wood = material('Ash desk surface', (.38, .255, .145), .55, noise=.13)
black = material('Graphite plastic', (.025, .032, .037), .44)
metal = material('Powder-coated steel', (.17, .2, .21), .34, .65)
floor_mat = material('Office carpet', (.11, .13, .14), .96, noise=.8)
glass = material('Frosted glass', (.24, .37, .39), .3, .1)
leaf_mat = material('Plant leaves', (.055, .12, .064), .7)
screen_mat = material('Screen dark navy', (.016, .034, .044), .22)
screen_mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value = (.035, .09, .11, 1)
screen_mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = .4
STATIC=[]
FRONT=[]

def cube(name, loc, scale, mat, bevel=.015, group=STATIC):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m=o.modifiers.new('Manufactured edge radius','BEVEL'); m.width=bevel; m.segments=3
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    o.data.materials.append(mat)
    if group is not None: group.append(o)
    return o

def cylinder(name,loc,radius,depth,mat,group=STATIC):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    b=o.modifiers.new('Small edge','BEVEL');b.width=.006;b.segments=2
    if group is not None:group.append(o)
    return o

def line(name, points, radius, mat, group=STATIC):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=3
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(mat)
    if group is not None:group.append(o)
    return o

def area(name,loc,energy,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

# Office architectural shell and quiet, lived-in objects.
cube('Floor',(0,1.6,-.06),(6,8,.1),floor_mat,0)
cube('Rear plaster wall',(0,5.2,1.5),(6,.12,3),wall,0)
cube('Left wall',(-2.4,1.5,1.5),(.12,7.4,3),wall,0)
for x in [-1.45,-.35,.75,1.85]:
    cube('Window dark frame',(x,5.1,1.85),(1.04,.06,1.5),metal,.006)
    cube('Window pane',(x,5.05,1.85),(.98,.02,1.44),glass,.004)
    for z in [1.35,1.58,1.81,2.04,2.27]:
        cube('Venetian blind',(x,5.0,z),(1.03,.1,.018),white,.002)
for y in [-1,0,1,2,3,4]:
    line('Carpet seam',[(-2.3,y,.001),(2.6,y,.001)],.002,black)
cube('Glass meeting partition',(-1.9,2.8,1.2),(.045,2.3,2.4),glass,.005)
for y in [1.65,2.8,3.95]:cube('Partition frame',(-1.89,y,1.2),(.08,.06,2.4),metal,.006)
cube('Notice board',(1.16,5.06,1.5),(.7,.045,.44),wood,.015)
for i in range(4):cube('Pinned page',(.91+i*.145,5.027,1.52+(.035 if i%2 else 0)),(.12,.006,.25),white,.002)

def desk(prefix,x,y,front=False):
    g=FRONT if front else STATIC
    cube(prefix+' table top',(x,y,.755),(1.55,.77,.06),wood,.018,g)
    for dx in [-.67,.67]:
        for dy in [-.28,.28]:cube(prefix+' metal leg',(x+dx,y+dy,.37),(.04,.04,.73),metal,.006,g)
    cube(prefix+' cable tray',(x,y+.25,.62),(1.1,.16,.09),black,.01,g)
    return g

desk('Hero',0,-.28,True)
cube('Drawer cabinet',(.58,-.28,.38),(.38,.57,.69),white,.022,FRONT)
for z in [.25,.47,.65]:
    cube('Drawer face',(.58,-.575,z),(.345,.018,.17),white,.007,FRONT)
    cube('Drawer pull',(.58,-.597,z+.045),(.16,.025,.012),metal,.004,FRONT)

def monitor(prefix,x,y,angle=0,g=STATIC):
    # Screen plane faces -Y; rotate assembly together around its stand.
    parts=[]
    parts.append(cube(prefix+' base',(x,y,.801),(.3,.2,.024),metal,.012,g))
    parts.append(cube(prefix+' stem',(x,y,.94),(.035,.03,.27),metal,.008,g))
    body=cube(prefix+' display',(x,y,1.14),(.58,.04,.35),black,.014,g);parts.append(body)
    screen=cube(prefix+' luminous screen',(x,y-.023,1.14),(.54,.006,.304),screen_mat,.002,g);parts.append(screen)
    pivot=Vector((x,y,.8))
    for o in parts:
        o.location=pivot+Matrix.Rotation(angle,4,'Z')@(o.location-pivot);o.rotation_euler.z=angle
    return screen

main_screen=monitor('Hero',-.25,-.15,math.radians(20),FRONT)
keyboard=cube('Low-profile keyboard',(-.19,-.53,.802),(.36,.13,.018),black,.007,FRONT)
keyboard.location.y=-.045
for row in range(4):
    for col in range(12):cube('Keyboard key',(-.345+col*.028,-.09+row*.029,.814),(.024,.023,.007),metal,.002,FRONT)
mouse=cube('Mouse',(.21,-.085,.81),(.06,.1,.035),black,.02,FRONT)
cup=cylinder('Coffee cup',(-.66,-.5,.875),.048,.16,white,FRONT)
cylinder('Coffee surface',(-.66,-.5,.958),.040,.003,material('Coffee',(.047,.022,.009),.2),FRONT)
line('Cup handle',[(-.7,-.5,.93),(-.747,-.5,.92),(-.758,-.5,.86),(-.7,-.5,.84)],.012,white,FRONT)
cube('Document',(-.16,-.1,.79),(.24,.32,.004),white,.001,FRONT)
for i in range(8):line('Printed table',[(-.26,-.22+i*.034,.794),(-.07,-.22+i*.034,.794)],.0015,metal,FRONT)
cube('Sticky note',(-.66,-.21,.797),(.09,.075,.003),material('Sticky yellow',(.76,.57,.2),.8),.001,FRONT)

def chair(prefix,x,y):
    items=[]
    cylinder(prefix+' pedestal',(x,y,.25),.034,.38,metal,items)
    for i in range(5):
        a=i*math.tau/5
        end=(x+.29*math.cos(a),y+.29*math.sin(a),.085)
        line(prefix+' chair spoke',[(x,y,.17),end],.022,metal,items)
        cylinder(prefix+' caster',end,.047,.035,black,items).rotation_euler.x=math.pi/2
    cube(prefix+' seat',(x,y,.49),(.47,.46,.09),black,.07,items)
    cube(prefix+' fabric back',(x,y+.22,.79),(.45,.07,.49),black,.045,items)
    for s in [-1,1]:
        line(prefix+' arm support',[(x+s*.25,y,.5),(x+s*.27,y,.68),(x+s*.27,y-.14,.68)],.015,metal,items)
        cube(prefix+' armrest',(x+s*.27,y-.05,.705),(.065,.27,.035),black,.02,items)
    STATIC.extend(items)

chair('Hero',0,.37)
desk('Colleague',-.82,2.7)
monitor('Colleague',-.91,2.54,.08)
chair('Colleague',-.82,3.16)
desk('Boss',.63,4.13)
monitor('Boss',.29,4.0,.0)
chair('Boss',.63,4.6)
cube('File stack',(.96,4.1,.83),(.22,.31,.12),white,.012)
for i in range(4):line('File edge',[(.85,3.94,.8+i*.023),(1.07,3.94,.8+i*.023)],.002,metal)
cylinder('Planter',(-1.55,.68,.25),.15,.5,white)
for i in range(12):
    a=i*2.4; h=.72+(i%4)*.11
    end=(-1.55+.26*math.cos(a),.68+.26*math.sin(a),h)
    line('Plant stem',[(-1.55,.68,.44),end],.008,leaf_mat)
    leaf=cube('Plant leaf',end,(.08,.25,.012),leaf_mat,.035);leaf.rotation_euler=(.5,a,a)

area('Window daylight',(-2.8,-.8,4.5),450,(.76,.86,1.0),4,(0,.8,.7))
area('Warm ceiling',(1.7,2.5,4.3),350,(1.0,.87,.67),3,(0,1,.8))
area('Face fill',(2,-3,2.4),80,(1.0,.88,.77),2,(0,.3,1.1))
bpy.ops.object.camera_add(location=(1.6,-5.4,2.7))
camera=bpy.context.object;camera.name='Office locked portrait camera'
camera.rotation_euler=(Vector((.08,.72,1.28))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.1;camera.data.lens=52
scene.camera=camera

def load_human(prefix, color):
    with bpy.data.libraries.load(str(SOURCE),link=False) as (src,dst):
        dst.objects=['GEO-body_male_realistic','GEO-body_male_realistic.eye.L','GEO-body_male_realistic.eye.R']
    items=dst.objects
    body=items[0]; source_x=body.location.x
    for o in items:
        scene.collection.objects.link(o);o.name=prefix+' '+o.name
        o.parent=None;o.matrix_parent_inverse=Matrix.Identity(4)
        o.location.x-=source_x
        o.animation_data_clear()
        for m in list(o.modifiers):o.modifiers.remove(m)
        o.hide_set(False);o.hide_render=False
        for p in o.data.polygons:p.use_smooth=True
    body.data.materials.clear();body.data.materials.append(skin)
    for p in body.data.polygons:p.material_index=0
    for v in body.data.vertices:
        if abs(v.co.x)>.35 and v.co.z<.94:
            curl=max(0,min(1,(.94-v.co.z)/.15))
            v.co.x-=math.copysign(.021*curl*curl,v.co.x)
            v.co.z+=.012*curl*curl
    sub=body.modifiers.new('Anatomical surface subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
    # Tailored cloth shells follow the real anatomy, expanded rather than painted on.
    cloth_sources={}
    def shell(name, predicate, mat, puff):
        selected=[p for p in body.data.polygons if predicate(p.center)]
        # Polygon centers need explicit coordinates before the dependency graph evaluates.
        selected=[p for p in body.data.polygons if predicate(sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices))]
        used=sorted({i for p in selected for i in p.vertices}); remap={v:i for i,v in enumerate(used)}
        verts=[]
        for i in used:
            v=body.data.vertices[i];co=v.co.copy()+v.normal*puff
            if name=='shirt' and abs(co.x)<.23:
                co.x*=1.035;co.y*=1.035
            if name=='shirt' and co.z<1.055:co.z=1.033
            if name=='trousers' and co.z>1.025:co.z=1.032
            verts.append(co)
        me=bpy.data.meshes.new(prefix+' '+name);me.from_pydata(verts,[],[[remap[i] for i in p.vertices] for p in selected]);me.update()
        o=bpy.data.objects.new(prefix+' '+name,me);scene.collection.objects.link(o);o.data.materials.append(mat)
        for p in me.polygons:p.use_smooth=True
        sub=o.modifiers.new('Cloth smooth','SUBSURF');sub.levels=1;sub.render_levels=1
        solid=o.modifiers.new('Cloth hem thickness','SOLIDIFY');solid.thickness=.003
        items.append(o);return o
    # Store each shell's source indices so cloth and skin share identical weights.
    def make_shell(name,predicate,mat,puff):
        o=shell(name,predicate,mat,puff)
        selected=[p for p in body.data.polygons if predicate(sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices))]
        cloth_sources[o.name]=sorted({i for p in selected for i in p.vertices})
        return o
    make_shell('shirt',lambda v:1.005<v.z<1.545 and (abs(v.x)<.25 or v.z>1.09),color,.010)
    make_shell('trousers',lambda v:.115<v.z<1.06 and abs(v.x)<.25,pants,.014)
    make_shell('shoes',lambda v:v.z<.14,leather,.007)
    hair_mat=hair if prefix=='Hero' else material(prefix+' hair',(.095,.10,.093) if prefix=='Boss' else (.095,.043,.019),.78,noise=.4)
    hair_obj=make_shell('hair',lambda v:v.z>(1.65 if prefix=='Boss' else 1.60) and (v.y>-.055 or v.z>(1.77 if prefix=='Boss' else 1.745)),hair_mat,.008)
    # A compact humanoid rig; its bones are actual mesh deformation, not cutout parts.
    arm=bpy.data.armatures.new(prefix+' rig');rig=bpy.data.objects.new(prefix+' rig',arm);scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    specs={
      'pelvis':((0,0,.94),(0,0,1.09),None),
      'spine':((0,0,1.09),(0,0,1.41),'pelvis'),
      'neck':((0,0,1.41),(0,0,1.57),'spine'),
      'head':((0,0,1.57),(0,0,1.78),'neck'),
    }
    for s,suffix in [(1,'L'),(-1,'R')]:
        specs.update({
         'upper_arm.'+suffix:((s*.185,0,1.445),(s*.325,-.012,1.19),'spine'),
         'forearm.'+suffix:((s*.325,-.012,1.19),(s*.402,-.026,.967),'upper_arm.'+suffix),
         'hand.'+suffix:((s*.402,-.026,.967),(s*.43,-.044,.852),'forearm.'+suffix),
         'thigh.'+suffix:((s*.11,0,.96),(s*.118,-.005,.526),'pelvis'),
         'shin.'+suffix:((s*.118,-.005,.526),(s*.105,.024,.105),'thigh.'+suffix),
         'foot.'+suffix:((s*.105,.024,.105),(s*.105,-.17,.055),'shin.'+suffix),
        })
    for name,(head,tail,parent) in specs.items():
        b=arm.edit_bones.new(name);b.head=head;b.tail=tail
        if parent:b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
    for o in items:
        if 'eye.' in o.name:continue
        if o==body:
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
            bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        else:
            o.parent=rig
            groups=[o.vertex_groups.new(name=g.name) for g in body.vertex_groups]
            for new_i,source_i in enumerate(cloth_sources[o.name]):
                for g in body.data.vertices[source_i].groups:groups[g.group].add([new_i],g.weight,'REPLACE')
            mod=o.modifiers.new('Shared anatomical rig','ARMATURE');mod.object=rig
        # Armature must deform base vertices before subdivision/shell thickness.
        arm_mod=next(m for m in o.modifiers if m.type=='ARMATURE')
        bpy.context.view_layer.objects.active=o
        while o.modifiers.find(arm_mod.name)>0:bpy.ops.object.modifier_move_up(modifier=arm_mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:
        if 'eye.' in o.name:
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            o.parent=rig
            o.vertex_groups.new(name='head').add(list(range(len(o.data.vertices))),1,'REPLACE')
            mod=o.modifiers.new('Eyes follow anatomical head','ARMATURE');mod.object=rig
            # Use source geometry; replace flat asset-browser material with living eyes.
            o.data.materials.clear();o.data.materials.append(material(prefix+' sclera',(.74,.69,.58),.22))
            o.data.materials.append(material(prefix+' iris',(.045,.028,.012),.28))
            o.data.materials.append(black)
            center=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
            for p in o.data.polygons:
                c=sum((o.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)-center
                if c.y<-.011:p.material_index=2 if c.x*c.x+c.z*c.z<.000013 else 1
    # Do not render skin concealed by clothes: prevents skin poking through a bent knee.
    import bmesh
    bm=bmesh.new();bm.from_mesh(body.data)
    covered=[]
    for f in bm.faces:
        c=f.calc_center_median()
        if (.14<c.z<.98 and abs(c.x)<.24) or (.96<c.z<1.50 and (abs(c.x)<.24 or c.z>1.12)):
            covered.append(f)
    bmesh.ops.delete(bm,geom=covered,context='FACES_ONLY');bm.to_mesh(body.data);bm.free()
    def attach_detail(o,bone):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        if o.type=='CURVE':bpy.ops.object.convert(target='MESH');o=bpy.context.object
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        o.parent=rig;o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE')
        modifier=o.modifiers.new('Attached to anatomical rig','ARMATURE');modifier.object=rig
        items.append(o);return o
    iris_mat=material(prefix+' visible brown iris',(.024,.015,.007),.35)
    for side in [-1,1]:
        # Visible corneal caps sit just ahead of the source eyelid opening.
        for name,radius,mat,yy in [('iris',.0065,iris_mat,-.131),('pupil',.003,black,-.133)]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=radius,location=(side*.030,-.0+yy,1.677))
            o=bpy.context.object;o.name=prefix+' '+name;o.scale.y=.2;o.data.materials.append(mat)
            for p in o.data.polygons:p.use_smooth=True
            attach_detail(o,'head')
        brow=line(prefix+' eyebrow',[(side*.014,-.118,1.709),(side*.031,-.127,1.714),(side*.048,-.116,1.708)],.0027,hair_mat,None)
        attach_detail(brow,'head')
    if prefix=='Boss':
        for side in [-1,1]:
            points=[(side*.031+.020*math.cos(a),-.139,1.678+.014*math.sin(a)) for a in [i*math.tau/16 for i in range(17)]]
            attach_detail(line('Boss glasses rim',points,.0016,metal,None),'head')
        attach_detail(line('Boss glasses bridge',[(-.011,-.14,1.68),(.011,-.14,1.68)],.0015,metal,None),'head')
    body.shape_key_add(name='Basis')
    smile=body.shape_key_add(name='Soft smile')
    speaking=body.shape_key_add(name='Speaking jaw')
    grip=body.shape_key_add(name='Phone grip')
    for v in body.data.vertices:
        p=v.co
        if p.y<-.095 and 1.59<p.z<1.63 and .013<abs(p.x)<.042:
            smile.data[v.index].co.z+=.0035*math.sin((p.z-1.59)/.04*math.pi)
        if p.y<-.09 and 1.56<p.z<1.615:
            speaking.data[v.index].co.z-=.003*math.sin((p.z-1.56)/.055*math.pi)
        if p.x<-.35 and p.z<.94:
            curl=max(0,min(1,(.94-p.z)/.15))
            grip.data[v.index].co.x+=.080*curl*curl
            grip.data[v.index].co.z+=.055*curl*curl
    return {'rig':rig,'body':body,'items':items,'specs':specs}

hero=load_human('Hero',shirt)
boss=load_human('Boss',material('Boss navy shirt',(.045,.076,.10),.77,noise=.2))
colleague=load_human('Colleague',material('Colleague shirt',(.25,.135,.145),.8,noise=.18))

def point_bone(rig,name,target):
    p=rig.pose.bones[name]
    current_head=p.head.copy()
    direction=Vector(target)-current_head
    # Preserve anatomical bone roll: resetting roll twists sleeves into balloons.
    rotation=(p.tail-p.head).normalized().rotation_difference(direction.normalized())
    p.matrix=Matrix.Translation(current_head) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-current_head) @ p.matrix
    bpy.context.view_layer.update()

def reach_hand(rig,side,hand):
    shoulder=rig.pose.bones['upper_arm.'+side].head.copy()
    upper=rig.data.bones['upper_arm.'+side].length
    lower=rig.data.bones['forearm.'+side].length
    delta=Vector(hand)-shoulder;distance=min(delta.length,upper+lower-.001);direction=delta.normalized()
    along=(upper*upper-lower*lower+distance*distance)/(2*distance)
    height=math.sqrt(max(0,upper*upper-along*along))
    pole=Vector(((.40 if side=='L' else -.40),-.10,1.10))-shoulder
    outward=(pole-direction*pole.dot(direction)).normalized()
    elbow=shoulder+direction*along+outward*height
    point_bone(rig,'upper_arm.'+side,elbow)
    point_bone(rig,'forearm.'+side,hand)

def hand_roll(rig,side,normal):
    p=rig.pose.bones['hand.'+side];axis=(p.tail-p.head).normalized()
    rest_normal=Vector((1 if side=='L' else -1,0,0))
    current=p.matrix.to_3x3() @ rig.data.bones[p.name].matrix_local.to_3x3().inverted() @ rest_normal
    current=(current-axis*current.dot(axis)).normalized()
    desired=Vector(normal);desired=(desired-axis*desired.dot(axis)).normalized()
    angle=math.atan2(axis.dot(current.cross(desired)),current.dot(desired))
    head=p.head.copy()
    p.matrix=Matrix.Translation(head) @ Matrix.Rotation(angle,4,axis) @ Matrix.Translation(-head) @ p.matrix
    bpy.context.view_layer.update()

def pose_person(person,loc,seat=True,amount=0,alert=0,talk=0,relief=0,walk=0,turn=0,reach=0):
    r=person['rig'];r.location=loc;r.rotation_euler.z=turn
    for p in r.pose.bones:p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion()
    bpy.context.view_layer.update()
    if seat:
        for side in ['L','R']:
            x=.12 if side=='L' else -.12
            point_bone(r,'thigh.'+side,(x,-.43,.95))
            point_bone(r,'shin.'+side,(x,-.42,.52))
            point_bone(r,'foot.'+side,(x,-.60,.49))
        # Small chest shifts belong to authored motion, while hands target desk/phone.
        r.pose.bones['spine'].rotation_quaternion=Quaternion((1,0,0),-.055+relief*.045)
        bpy.context.view_layer.update()
        left_hand=Vector((.21,-.31,1.32))
        right_hand=Vector((-.19,-.27,1.32)).lerp(Vector((-.23,-.42,1.34)),reach).lerp(Vector((.04,-.36,1.43)),amount)
        for side,hand in [('L',left_hand),('R',right_hand)]:
            reach_hand(r,side,hand)
            wrist=r.pose.bones['hand.'+side].head.copy()
            finger_direction=Vector((-.01,-.10,0))
            if side=='R':finger_direction=finger_direction.lerp(Vector((0,-.015,.11)),amount)
            point_bone(r,'hand.'+side,wrist+finger_direction)
            hand_roll(r,side,Vector((0,0,1)).lerp(Vector((0,-1,.1)),amount if side=='R' else 0))
        head=r.pose.bones['head']
        head.rotation_quaternion=Quaternion((0,0,1),-.14-alert*.40+talk*.13) @ Quaternion((1,0,0),.045+amount*.18-relief*.055)
    else:
        for side,sign in [('L',1),('R',-1)]:
            point_bone(r,'upper_arm.'+side,(sign*.235,0,1.16))
            point_bone(r,'forearm.'+side,(sign*.225,-.02,.92))
            r.pose.bones['thigh.'+side].rotation_quaternion=Quaternion((1,0,0),walk*sign*.26)
            r.pose.bones['shin.'+side].rotation_quaternion=Quaternion((1,0,0),max(0,-walk*sign)*.3)
            r.pose.bones['upper_arm.'+side].rotation_quaternion @= Quaternion((1,0,0),-walk*sign*.22)
        r.pose.bones['head'].rotation_quaternion=Quaternion((0,0,1),alert*.28)
    bpy.context.view_layer.update()
    person['body'].data.shape_keys.key_blocks['Soft smile'].value=amount*.5+relief*.5
    person['body'].data.shape_keys.key_blocks['Speaking jaw'].value=abs(talk)
    person['body'].data.shape_keys.key_blocks['Phone grip'].value=amount

pose_person(hero,(0,.37,-.49),True)
pose_person(colleague,(-.82,3.16,-.49),True,alert=.15)
pose_person(boss,(.35,1.8,0),False,turn=.3)
phone=cube('Hero actual phone',(-.20,-.12,.813),(.072,.145,.009),black,.01,None)
phone_screen=cube('Hero phone glass',(-.20,-.12,.819),(.064,.131,.001),screen_mat,.006,None)
PHONE_HOME=Matrix.Translation(Vector((-.20,-.12,.813))) @ Matrix.Rotation(math.pi,4,'X')
pose_person(hero,(0,.37,-.49),True,reach=1)
hand_world=hero['rig'].matrix_world @ hero['rig'].pose.bones['hand.R'].matrix
PHONE_BIND=hand_world.inverted() @ PHONE_HOME
pose_person(hero,(0,.37,-.49),True)
HERO_ITEMS=hero['items']+[phone,phone_screen]
BOSS_ITEMS=boss['items']
COLLEAGUE_ITEMS=colleague['items']

def phone_pose(amount):
    # Rigid grip: the device follows the same hand transform through the entire lift.
    hand=hero['rig'].matrix_world @ hero['rig'].pose.bones['hand.R'].matrix
    transform=hand @ PHONE_BIND if amount>0 else PHONE_HOME
    for o,offset in [(phone,0),(phone_screen,.006)]:
        o.matrix_world=transform @ Matrix.Translation(Vector((0,0,offset)))
    phone_screen.hide_render=amount<.02

def visibility(group,visible):
    for o in group:o.hide_render=not visible

def holdout(group,enabled):
    for o in group:o.is_holdout=enabled

EDGE=[]
cube('Foreground desk edge',(0,-.675,.755),(1.55,.014,.060),wood,.008,EDGE)

def render(path):
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)

def project(p):
    v=world_to_camera_view(scene,camera,Vector(p));return [round(v.x*390,2),round((1-v.y)*500,2)]

def screen_corners():
    bpy.context.view_layer.update()
    return [project(main_screen.matrix_world@Vector(p)) for p in [(-.27,-.004,.152),(.27,-.004,.152),(.27,-.004,-.152),(-.27,-.004,-.152)]]

phone_pose(0)
meta={
 'version':1,'scene':{'width':390,'height':500,'renderScale':2,'offsetY':90},
 'layers':{'background':'background.webp','foreground':'foreground.webp'},
 'hotspots':{'computer':project(main_screen.location),'phone':project(phone.location),'drawer':project(phone.location),'file':project((-.16,-.1,.797)),'bossFar':project((.35,1.8,1.1)),'bossNear':project((.45,1.05,1.1))},
 'screenCorners':screen_corners(),
 'clips':{},
 'license':{'humanBase':'CC0','author':'Julien Kaspar / Blender Studio','source':'https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip'},
}
(ROOT/'projection.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'office-scene.blend'))
if MODE=='preview':
    render(ROOT/'preview.png')
    pose_person(hero,(0,.37,-.49),True,amount=1,reach=1);phone_pose(1)
    render(ROOT/'preview-phone.png')
else:
    visibility(HERO_ITEMS,False);visibility(BOSS_ITEMS,False);visibility(EDGE,False)
    if ONLY in [None,'layers']:render(FRAMES/'background.png')
    visibility(STATIC,False);visibility(COLLEAGUE_ITEMS,False);visibility(FRONT,False);visibility(EDGE,True)
    if ONLY in [None,'layers']:render(FRAMES/'foreground.png')
    visibility(STATIC,True);visibility(COLLEAGUE_ITEMS,True);visibility(FRONT,True)
    holdout(STATIC+FRONT+COLLEAGUE_ITEMS+EDGE,True)
    visibility(HERO_ITEMS,True)
    clips=[('work',12,1.0,True),('pickup',18,.6,False),('use',16,1.0,True),('stow',18,.6,False),('stow-fast',12,.4,False),('watch',12,.7,True),('talk',16,1.1,True),('relief',16,1.2,False)]
    for name,count,duration,loop in clips:
        if ONLY is not None and ONLY!=name:continue
        for i in range(count):
            if not START<=i<END:continue
            t=i/(count-1);ease=t*t*(3-2*t)
            progress=t if name=='pickup' else 1-t if name.startswith('stow') else 1 if name=='use' else 0
            reach=min(progress/.32,1)
            lifted=max(0,(progress-.32)/.68);amount=lifted*lifted*(3-2*lifted)
            pose_person(hero,(0,.37,-.49),True,amount=amount,reach=reach,alert=(.55+.05*math.sin(t*math.tau)) if name=='watch' else 0,talk=.4*math.sin(t*math.tau) if name=='talk' else 0,relief=math.sin(t*math.pi) if name=='relief' else 0)
            if name in ['work','use']:
                hero['rig'].pose.bones['head'].rotation_quaternion @= Quaternion((0,0,1),.017*math.sin(t*math.tau))
                if name=='work':hero['rig'].pose.bones['hand.R'].rotation_quaternion @= Quaternion((1,0,0),.015*math.sin(t*math.tau*2))
                bpy.context.view_layer.update()
            phone_pose(amount)
            render(FRAMES/(name+'-'+str(i).zfill(3)+'.png'))
        meta['clips'][name]={'count':count,'duration':duration,'loop':loop,'fps':count/duration,'events':[{'at':.33,'name':'phone-grip'}] if name=='pickup' else [{'at':duration*.84,'name':'phone-hidden'}] if name.startswith('stow') else []}
    visibility(HERO_ITEMS,False);visibility(BOSS_ITEMS,True)
    for name,count,duration in [('boss-far',8,1),('boss-near',8,1),('boss-watch',8,1),('boss-leave',8,1)]:
        if ONLY is not None and ONLY!=name:continue
        for i in range(count):
            if not START<=i<END:continue
            t=i/(count-1);near=name!='boss-far';y=1.05 if near else 1.8
            pose_person(boss,(.45 if near else .35,y,0),False,alert=(.7+.06*math.sin(t*math.tau)) if name=='boss-watch' else .09*math.sin(t*math.tau),walk=math.sin(t*math.tau) if name in ['boss-near','boss-leave'] else 0,turn=math.pi if name=='boss-leave' else .3)
            render(FRAMES/(name+'-'+str(i).zfill(3)+'.png'))
        meta['clips'][name]={'count':count,'duration':duration,'loop':True,'fps':count/duration,'events':[]}
    (ROOT/'projection.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print('OFFICE_ASSETS_COMPLETE',MODE)
