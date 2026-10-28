"""Original eroded alpine massifs, exported from Blender outside the flight region."""
import bpy, math, json, hashlib
from pathlib import Path
OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mat = bpy.data.materials.new('B3 slate strata')
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.27,.31,.34,1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .94

def noise(x, y, seed):
    ix, iy = math.floor(x), math.floor(y)
    u, v = x-ix, y-iy
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    def h(a,b):
        n = (a*374761393+b*668265263+seed*144269) & 0xffffffff
        n = ((n^(n>>13))*1274126177) & 0xffffffff
        return (n^(n>>16))/2147483647.5-1
    return (h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-v)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*v

records=[]
for index in range(2):
    n=96; vs=[]; fs=[]
    peaks=[(-105,24,242,150,125),(20,-27,285,145,155),(136,35,197,125,135)]
    if index: peaks=[(-125,-10,184,120,130),(-12,30,264,165,145),(110,-30,227,140,150)]
    for j in range(n+1):
        y=(j/n*2-1)*190
        for i in range(n+1):
            x=(i/n*2-1)*260
            wx=x+noise(x/95,y/95,11+index)*22
            wy=y+noise(x/95,y/95,29+index)*25
            mass=max(max(0,1-math.hypot((wx-px)/rx,(wy-py)/ry))**.72*h for px,py,h,rx,ry in peaks)
            erosion=sum((1-abs(noise(wx/scale,wy/scale,71+index+octave)))*weight for octave,(scale,weight) in enumerate([(75,65),(32,38),(15,22),(7,10)]))
            envelope=min(1,mass/45)
            height=max(0,mass+envelope*(erosion-90))
            vs.append((x,y,height))
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i; b=a+n+1
            fs.extend([(a,a+1,b),(a+1,b+1,b)])
    mesh=bpy.data.meshes.new('Eroded granite massif')
    mesh.from_pydata(vs,[],fs);mesh.update();mesh.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    uv=mesh.uv_layers.new(name='SurfaceUV')
    for loop in mesh.loops:
        v=mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(v.x/40,(v.y+v.z)/40)
    name='ridge-'+str(index+1)
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    dest=OUT.parent/'assets/resources/models'/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
    points=[(v.co.x,v.co.z,-v.co.y) for v in mesh.vertices]
    records.append(dict(name=name,triangles=len(fs),bytes=dest.stat().st_size,bounds=dict(min=[min(p[i] for p in points) for i in range(3)],max=[max(p[i] for p in points) for i in range(3)]),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),generator='build_ridges.py',sourceHash=hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()))
manifest=json.loads((OUT/'manifest.json').read_text())
for row in records:manifest['assets']=[r for r in manifest['assets'] if r['name']!=row['name']]+[row]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'ridges-manifest.json').write_text(json.dumps(records,indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ridges.blend'))
print('RIDGES_READY '+json.dumps(records))
