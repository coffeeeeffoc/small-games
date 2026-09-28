"""Original Blender meshes. Run: blender --background --factory-startup --python <this file>.

No downloads/textures. Blender Z-up <-> Cocos Y-up: (x, y, z) <-> (x, z, -y).
Use -- --verify to re-open the saved blend and GLBs and check the runtime exports.
"""
import bpy
import bmesh
import hashlib
import json
import math
import struct
import sys
import uuid
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'art'
RUNTIME = ROOT / 'assets/resources/models/aircraft'
MUZZLE = Vector((-1.8, -1.1, 1.2))
EYE = Vector((0, .8, -1.4))
AXIS = Vector((-1, -1, 0)).normalized()
NAMES = ('cabin', 'house', 'pine')
PALETTE = {
    'wall': (.043, .060, .069), 'panel': (.072, .090, .097),
    'edge': (.09, .125, .14), 'steel': (.10, .125, .14),
    'collar': (.16, .185, .18), 'dark': (.014, .021, .025),
    'bolt': (.20, .235, .24), 'brass': (.23, .17, .075),
    'teal': (.14, .47, .44), 'plaster': (.33, .32, .28),
    'roof': (.20, .17, .15), 'wood': (.115, .105, .085),
    'window': (.82, .46, .16), 'bark': (.12, .10, .08),
    'needles': (.078, .145, .12), 'needles2': (.11, .19, .15),
}


def blender(v):
    return Vector((v[0], -v[2], v[1]))


def cocos(v):
    return Vector((v[0], v[2], -v[1]))


def meta(path, importer):
    path = Path(str(path) + '.meta')
    if not path.exists():
        path.write_text(json.dumps({
            'ver': '1.0.0' if importer == 'json' else '1.2.0',
            'importer': importer, 'imported': True,
            'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, 'night-overwatch/original/' + path.name)),
            'files': ['.json'] if importer == 'json' else [], 'subMetas': {}, 'userData': {},
        }, indent=2) + '\n', encoding='utf-8')


def finish(name, tone, bevel=0):
    obj = bpy.context.object
    obj.name = name
    obj['palette'] = tone
    obj['provenance'] = 'original Blender'
    if bevel:
        modifier = obj.modifiers.new('Machined edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def box(name, center, size, tone, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=blender(center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(name, tone, bevel)


def cylinder(name, a, b, radius, tone, segments=12, top=None):
    a, b = blender(a), blender(b)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius,
                                  radius2=radius if top is None else top,
                                  depth=delta.length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(name, tone)


def ring(name, center, direction, radius, thickness, tone):
    bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=6,
                                   major_radius=radius, minor_radius=thickness,
                                   location=blender(center))
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = blender(direction).to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(name, tone)


def mesh_object(name, points, faces, tone):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([blender(v) for v in points], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    return finish(name, tone)


def cabin():
    # Open port-side bay: only a narrow forward rib and sill, no glass/fullscreen quad.
    box('Port forward wall', (-.38, .37, 1.86), (1.15, 2.25, .18), 'wall', .035)
    box('Inner removable panel', (-.36, .12, 1.751), (.94, 1.46, .035), 'panel', .018)
    box('Forward structural rib', (-.97, .26, 1.75), (.12, 2.20, .15), 'edge', .02)
    box('Bay overhead spar', (-.44, 1.48, .2), (1.22, .16, 3.4), 'wall', .025)
    box('Sill outside view cone', (-.4, -.96, 1.9), (1.15, .15, .45), 'panel', .025)
    # Port cheek continues below the gun. With the lowered physical eye this
    # forms a narrow left edge, instead of adding a screen-space cabin overlay.
    box('Port lower cheek', (-1.23,-1.40,1.85), (.32,1.66,.40), 'wall', .035)
    box('Port cheek inner lip', (-1.43,-1.39,1.65), (.075,1.65,.075), 'edge', .014)
    box('Lower cheek service panel', (-1.24,-1.41,1.632), (.24,1.24,.025), 'panel', .012)
    for height in [-.87,-1.39,-1.92]:
        cylinder('Cheek fastener', (-1.24,height,1.61), (-1.24,height,1.592), .025,'bolt',6)
    for height in [-.48, .0, .48, .96]:
        for x in [-.76, .04]:
            cylinder('Panel captive bolt', (x, height, 1.709), (x, height, 1.69), .028, 'bolt', 6)
    for height in [.64, .75, .86]:
        box('Vent recess', (-.31, height, 1.727), (.48, .023, .018), 'dark')
    box('Cabin indicator bezel', (-.35, 1.08, 1.73), (.23, .095, .023), 'dark')
    box('Cabin indicator', (-.35, 1.08, 1.713), (.12, .024, .015), 'teal')
    # Fixed 45-degree port barrel: the front plane center is exactly FLIGHT.muzzle.
    def along(distance):
        return MUZZLE - AXIS * distance
    cylinder('Steel barrel', along(.04), along(1.02), .092, 'steel', 20)
    for distance in [.18, .53, .88]:
        cylinder('Barrel clamp', along(distance-.035), along(distance+.035), .127, 'collar', 16)
        ring('Clamp raised rim', along(distance), AXIS, .127, .013, 'edge')
    cylinder('Recoil sleeve', along(.91), along(1.37), .158, 'panel', 16)
    cylinder('Breech rear cap', along(1.37), along(1.42), .172, 'edge', 16)
    # Hollow bore, not a capped cylinder. Ring lies behind muzzle plane, never forward.
    front, rear = along(0), along(.10)
    u = Vector((0, 0, 1))
    v = AXIS.cross(u).normalized()
    points = [center + (u*math.cos(i*math.tau/20)+v*math.sin(i*math.tau/20))*radius
              for center, radius in [(front,.115),(rear,.115),(front,.066),(rear,.066)] for i in range(20)]
    faces = []
    for i in range(20):
        j = (i+1)%20
        faces.extend([(i,j,20+j,20+i), (i,40+i,40+j,j), (40+i,60+i,60+j,40+j)])
    mesh_object('Muzzle crown and open bore', points, faces, 'collar')
    cylinder('Dark bore recess', along(.106), along(.11), .067, 'dark', 20)
    mount = along(1.17)
    cylinder('Trunnion axle', mount+Vector((0,0,-.24)), mount+Vector((0,0,.24)), .112, 'steel')
    for sign in [-1,1]:
        z = mount.z + sign*.23
        cylinder('Trunnion end bolt', (mount.x,mount.y,z), (mount.x,mount.y,z+sign*.03), .073, 'bolt', 8)
        cylinder('Angled support strut', (mount.x,mount.y-.07,z), (-.32,-.72,z), .041, 'edge', 8)
    box('Mount base', (-.30,-.78,1.21), (.43,.10,.71), 'panel', .028)
    cylinder('Recoil hydraulic piston', along(.29)+Vector((0,.15,.11)),
             along(1.23)+Vector((0,.15,.11)), .039, 'bolt', 10)
    for offset in [0,.12,.24]:
        box('Feed cassette seam', (mount.x+.17+offset,mount.y+.15,1.43), (.095,.24,.12), 'brass', .009)
    anchor = bpy.data.objects.new('FLIGHT.muzzle', None)
    anchor.location = blender(MUZZLE)
    anchor.empty_display_size = .12
    bpy.context.collection.objects.link(anchor)


def house():
    box('Stone foundation', (0,.09,0), (1.25,.18,.98), 'wood', .025)
    box('Plaster walls', (0,.40,0), (1.16,.62,.87), 'plaster', .015)
    pts = [(-.65,.71,-.52),(.65,.71,-.52),(.65,.71,.52),(-.65,.71,.52),
           (-.65,1.02,0),(.65,1.02,0)]
    mesh_object('Pitched roof', pts, [(0,4,5,1),(3,2,5,4),(0,3,4),(1,5,2),(0,1,2,3)], 'roof')
    box('Chimney', (.32,.91,-.22), (.14,.42,.16), 'plaster', .009)
    box('Chimney cap', (.32,1.12,-.22), (.19,.055,.21), 'wood')
    box('Wood door', (0,.285,.449), (.19,.39,.029), 'wood')
    for z in [-.45,.45]:
        for x in [-.37,.37]:
            box('Window frame', (x,.46,z), (.21,.21,.027), 'wood')
            box('Warm interior', (x,.46,z+math.copysign(.017,z)), (.155,.153,.016), 'window')
            box('Window mullion', (x,.46,z+math.copysign(.029,z)), (.015,.175,.016), 'wood')
    for x in [-.59,.59]:
        box('Gable window', (x,.77,0), (.025,.12,.15), 'wood')


def pine():
    cylinder('Pine trunk', (0,0,0), (0,1.01,0), .060, 'bark', 7, .032)
    for i in range(4):
        bottom = .30+i*.25
        cylinder('Pine needle tier', (0,bottom,0), (0,bottom+.56-i*.035,0),
                 .39-i*.079, 'needles' if i%2==0 else 'needles2', 9, 0)


def bake(objects):
    # One vertex-color emission shader also previews the exact no-light runtime palette.
    mat = bpy.data.materials.get('Baked vertex colors') or bpy.data.materials.new('Baked vertex colors')
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    colors = tree.nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'Color'
    # Direct color-to-surface exports KHR_materials_unlit; an Emission node loses
    # its per-vertex tint in GLB because emissiveFactor cannot multiply COLOR_0.
    tree.links.new(colors.outputs['Color'], out.inputs['Surface'])
    for obj in objects:
        # Thin bevel intersections need welding before triangulation/export.
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.00001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data); bm.free(); obj.data.update()
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        attr = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        rgb = PALETTE[obj['palette']]
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for polygon in obj.data.polygons:
            n = cocos(normal_matrix @ polygon.normal).normalized()
            shade = .54 + .40*max(0,n.dot(Vector((-.35,.79,-.50)))) + .16*max(0,n.dot(Vector((.2,.1,1))))
            if obj['palette'] in ('window','teal'):
                shade = 1
            for loop in polygon.loop_indices:
                attr.data[loop].color = tuple(min(1,c*shade) for c in rgb)+(1,)


def geometry(objects):
    g = dict(positions=[], normals=[], colors=[], indices=[])
    lookup = {}
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for triangle in mesh.loop_triangles:
            normal = cocos(normal_matrix @ triangle.normal).normalized()
            for vertex, loop in zip(triangle.vertices, triangle.loops):
                p = cocos(obj.matrix_world @ mesh.vertices[vertex].co)
                c = mesh.color_attributes['Color'].data[loop].color
                key = tuple(round(v,6) for v in (*p,*normal,*c))
                if key not in lookup:
                    lookup[key] = len(g['positions'])//3
                    g['positions'].extend(key[:3]); g['normals'].extend(key[3:6]); g['colors'].extend(key[6:])
                g['indices'].append(lookup[key])
    return g


def validate_geometry(g):
    count = len(g['positions'])//3
    assert len(g['positions']) == count*3 and len(g['normals']) == count*3
    assert len(g['colors']) == count*4 and 0<count<=65535
    assert len(g['indices'])%3 == 0 and 0<len(g['indices'])<=24000
    assert all(math.isfinite(v) for key in g for v in g[key])
    assert all(0<=v<=1 for v in g['colors'])
    assert all(isinstance(i,int) and 0<=i<count for i in g['indices'])
    for i in range(0,len(g['normals']),3):
        assert abs(Vector(g['normals'][i:i+3]).length-1)<.00001
    vertices = [Vector(g['positions'][i:i+3]) for i in range(0,len(g['positions']),3)]
    for i in range(0,len(g['indices']),3):
        a,b,c = [vertices[j] for j in g['indices'][i:i+3]]
        assert (b-a).cross(c-a).length>1e-10, 'Degenerate triangle'
    return {'triangles':len(g['indices'])//3,'vertices':count,
            'bounds': {'min':[min(p[i] for p in vertices) for i in range(3)],
                       'max':[max(p[i] for p in vertices) for i in range(3)]}}


def camera(name, position, target, fov=78):
    bpy.ops.object.camera_add(location=blender(position))
    obj=bpy.context.object; obj.name=name
    obj.rotation_euler=(blender(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.type='PERSP'; obj.data.sensor_fit='VERTICAL'; obj.data.sensor_height=24
    obj.data.lens=12/math.tan(math.radians(fov)/2)
    obj.data.clip_start=.025; obj.data.clip_end=1500
    return obj


def preview(name, objects, cam, resolution=(1280,720)):
    scene=bpy.context.scene
    bpy.context.preferences.filepaths.save_version=0
    for obj in scene.objects:
        if obj.type=='MESH': obj.hide_render=obj not in objects
    scene.camera=cam
    scene.render.resolution_x,scene.render.resolution_y=resolution
    scene.render.filepath=str(ART/'previews'/f'{name}.png')
    bpy.ops.render.render(write_still=True)


def verify():
    result={'source':'original Blender','blender':bpy.app.version_string,'meshes':{}}
    bpy.ops.wm.open_mainfile(filepath=str(ART/'aircraft-assets.blend'))
    assert (cocos(bpy.data.objects['FLIGHT.muzzle'].location)-MUZZLE).length<1e-6
    for name in NAMES:
        g=json.loads((RUNTIME/f'{name}.json').read_text())
        stats=validate_geometry(g)
        objects=sorted([o for o in bpy.data.collections[name].objects if o.type=='MESH'],key=lambda o:o.name)
        assert geometry(objects)==g, f'{name}: source / runtime mismatch'
        data=(ART/f'{name}.glb').read_bytes()
        magic,version,length=struct.unpack_from('<III',data)
        assert magic==0x46546c67 and version==2 and length==len(data)
        size,chunk=struct.unpack_from('<II',data,12)
        assert chunk==0x4e4f534a
        gltf=json.loads(data[20:20+size])
        assert not gltf.get('images') and not gltf.get('textures'), 'External textures forbidden'
        assert all('uri' not in b for b in gltf['buffers'])
        assert all('KHR_materials_unlit' in m.get('extensions',{}) for m in gltf['materials'])
        assert all('COLOR_0' in p['attributes'] for m in gltf['meshes'] for p in m['primitives'])
        triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
        assert triangles==stats['triangles'], f'{name}: GLB/runtime triangle mismatch'
        stats.update(jsonBytes=(RUNTIME/f'{name}.json').stat().st_size,
                     glbBytes=len(data), sha256=hashlib.sha256((RUNTIME/f'{name}.json').read_bytes()).hexdigest())
        result['meshes'][name]=stats
    # Round-trip actual GLBs in a clean Blender scene, rather than checking filenames only.
    for name in NAMES:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(ART/f'{name}.glb'))
        objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
        tris=0
        for obj in objs:
            obj.data.calc_loop_triangles(); tris+=len(obj.data.loop_triangles)
            assert len(obj.data.color_attributes)>0
        assert tris==result['meshes'][name]['triangles']
    result['passed']=True
    (ART/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print('ASSET_VALIDATION '+json.dumps(result))


def build():
    ART.mkdir(exist_ok=True); (ART/'previews').mkdir(exist_ok=True); RUNTIME.mkdir(parents=True,exist_ok=True)
    meta(RUNTIME,'directory')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    groups={}
    for name,build_fn in [('cabin',cabin),('house',house),('pine',pine)]:
        collection=bpy.data.collections.new(name); scene.collection.children.link(collection)
        before=set(scene.objects); build_fn(); objects=list(set(scene.objects)-before)
        for obj in objects:
            for old in list(obj.users_collection): old.objects.unlink(obj)
            collection.objects.link(obj)
        groups[name]=sorted([o for o in objects if o.type=='MESH'],key=lambda o:o.name)
        bpy.context.view_layer.update()
        bake(groups[name]); g=geometry(groups[name]); validate_geometry(g)
        (RUNTIME/f'{name}.json').write_text(json.dumps(g,separators=(',',':'))+'\n')
        meta(RUNTIME/f'{name}.json','json')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(ART/f'{name}.glb'),export_format='GLB',use_selection=True,
                                  export_yup=True,export_materials='EXPORT',export_attributes=True,
                                  export_vertex_color='NAME',export_vertex_color_name='Color')
    scene.render.engine='CYCLES'; scene.cycles.samples=8
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=True
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
    scene.render.resolution_percentage=100
    studio=camera('Cabin asset inspection',(-4.3,2.5,-2.8),(-.6,.05,1.1),47)
    observation=camera('Aircraft camera - reference position',EYE,(-180,-100,0),78)
    preview('cabin-studio',groups['cabin'],studio)
    preview('cabin-camera',groups['cabin'],observation)
    preview('house',groups['house'],camera('House inspection',(2,1.8,2),(0,.5,0),42),(720,720))
    preview('pine',groups['pine'],camera('Pine inspection',(1.8,1.55,2.1),(0,.78,0),46),(720,720))
    for obj in scene.objects: obj.hide_render=False
    scene.camera=observation
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/'aircraft-assets.blend'))
    metadata={'source':'original Blender','generator':'scripts/model-aircraft.py','blender':bpy.app.version_string,
              'reference':'docs/design/flight-concepts.png','units':'1 = 10 meters; stylized compressed assembly',
              'coordinateSystem':'Cocos right-handed Y-up, forward +Z, port -X',
              'blenderToCocos':'(x,y,z) -> (x,z,-y)','muzzle':list(MUZZLE),'barrelDirection':list(AXIS),
              'cameraLocal':list(EYE),'recommendedCameraLocal':[.4,-.8,-.55],
              'runtimeShader':'builtin-unlit USE_VERTEX_COLOR',
              'textures':[],'resources':[f'models/aircraft/{n}' for n in NAMES],
              'note':'Rigid aircraft-space open bay, no screen overlay. Previews are asset renders, not game screenshots.'}
    (ART/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    verify()


def camera_study():
    bpy.ops.wm.open_mainfile(filepath=str(ART/'aircraft-assets.blend'))
    scene=bpy.context.scene
    objects=[o for o in bpy.data.collections['cabin'].objects if o.type=='MESH']
    g=json.loads((RUNTIME/'cabin.json').read_text())
    vertices=[blender(g['positions'][i:i+3]) for i in range(0,len(g['positions']),3)]
    triangles=[g['indices'][i:i+3] for i in range(0,len(g['indices']),3)]
    bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
    results=[]
    for name,eye in [('existing',EYE),('lower-a',(.4,-.8,-.55)),('lower-b',(.8,-.95,-.3)),
                     ('lower-c',(1.2,-1.2,-.3))]:
        cam=camera(name,eye,(-180,-100,0),70)
        preview('camera-'+name,objects,cam)
        bpy.context.view_layer.update()
        uv=world_to_camera_view(scene,cam,blender(MUZZLE))
        # Geometric mask checks do not rely on background color or alpha compositing.
        frame=cam.data.view_frame(scene=scene)
        hits=0; center_hits=0; center_count=0
        cols,rows=128,72
        for y in range(rows):
            for x in range(cols):
                u=(x+.5)/cols; v=(y+.5)/rows
                local=Vector((min(p.x for p in frame)*(1-u)+max(p.x for p in frame)*u,
                              min(p.y for p in frame)*(1-v)+max(p.y for p in frame)*v,frame[0].z))
                ray=cam.matrix_world.to_quaternion()@local.normalized()
                hit=bvh.ray_cast(cam.location,ray,30)[0] is not None
                hits+=hit
                if .30<u<.88 and .20<v<.80:
                    center_hits+=hit; center_count+=1
        result={'name':name,'cameraLocal':list(eye),'fovVertical':70,'muzzleScreen':[round(uv.x,4),round(1-uv.y,4)],
                'occupiedPercent':round(100*hits/(cols*rows),3),
                'centralOccupiedPercent':round(100*center_hits/center_count,3)}
        results.append(result)
    (ART/'camera-study.json').write_text(json.dumps(results,indent=2)+'\n')
    print('CAMERA_STUDY '+json.dumps(results))


if '--camera-study' in sys.argv:
    camera_study()
elif '--verify' in sys.argv:
    verify()
else:
    build()
