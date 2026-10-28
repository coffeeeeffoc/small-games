"""UV-correct lunar sphere for the separately credited NASA LROC map."""
import bpy, json, hashlib
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=6)
o=bpy.context.object;o.name='moon'
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new('Lunar surface');m.use_nodes=True;o.data.materials.append(m)
path=OUT.parent/'assets/resources/models/moon.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
o.data.calc_loop_triangles()
a=dict(name='moon',triangles=len(o.data.loop_triangles),bytes=path.stat().st_size,bounds=dict(min=[-6,-6,-6],max=[6,6,6]),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),generator='build_moon.py',sourceHash=hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest())
manifest=json.loads((OUT/'manifest.json').read_text());manifest['assets']=[r for r in manifest['assets'] if r['name']!='moon']+[a]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'lunar-manifest.json').write_text(json.dumps(dict(model=a,texture='lunar-lroc.jpg',textureSha256=hashlib.sha256((OUT.parent/'assets/resources/textures/lunar-lroc.jpg').read_bytes()).hexdigest(),credit="NASA Scientific Visualization Studio / Ernie Wright (USRA), LRO/LROC",source='https://svs.gsfc.nasa.gov/4720/'),indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'moon.blend'))
print('MOON_READY '+json.dumps(a))
