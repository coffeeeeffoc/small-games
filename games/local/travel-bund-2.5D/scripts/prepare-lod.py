"""Derive distance LODs from the intact source, without writing to assets/bund."""
import bpy
import hashlib
import json
import math
import tempfile
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parents[1] / 'public' / 'lod'
out.mkdir(parents=True, exist_ok=True)
source = root / 'assets/bund/source/bund-environment.blend'
# Read a stable snapshot: another asset task may save the source during export.
source_bytes = source.read_bytes()
source_hash = hashlib.sha256(source_bytes).hexdigest()
with tempfile.NamedTemporaryFile(suffix='.blend', delete=False) as snapshot:
    snapshot.write(source_bytes)
snapshot_path = Path(snapshot.name)
try:
    bpy.ops.wm.open_mainfile(filepath=str(snapshot_path))
finally:
    snapshot_path.unlink()
objects = [o for c in bpy.data.collections if c.name[:2] in ['01','02','03','04','05','06'] for o in c.objects if o.type == 'MESH']
tiles = {}
for obj in objects:
    points = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    center = sum(points, Vector()) / 8
    # Terrain crossing the entire river remains in the permanent background.
    terrain = max(obj.dimensions.x, obj.dimensions.y) > 1200
    key = 'terrain' if terrain else f'{math.floor(center.x/700)}_{math.floor(center.y/700)}'
    tiles.setdefault(key, []).append(obj)

def export(name, selection):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selection: obj.hide_set(False); obj.select_set(True)
    bpy.context.view_layer.objects.active = selection[0]
    bpy.ops.export_scene.gltf(filepath=str(out/name), export_format='GLB', use_selection=True,
        export_extras=True, export_cameras=False, export_lights=False)

manifest = {'source_sha256': source_hash, 'tiles': []}
low_objects = []
for key, full in sorted(tiles.items()):
    points = [o.matrix_world @ Vector(v) for o in full for v in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    count = 0
    for obj in full: obj.data.calc_loop_triangles(); count += len(obj.data.loop_triangles)
    if key != 'terrain': export(key+'.glb', full)
    parent = bpy.data.objects.new('tile_'+key, None); bpy.context.scene.collection.objects.link(parent)
    parent['tile'] = key
    tile_low = []
    for obj in full:
        copy = obj.copy(); copy.data = obj.data.copy(); bpy.context.scene.collection.objects.link(copy)
        copy.parent = parent
        if key != 'terrain' and len(copy.data.polygons) > 60:
            bpy.context.view_layer.objects.active = copy
            modifier = copy.modifiers.new('Distant silhouette', 'DECIMATE')
            modifier.ratio = .035
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        tile_low.append(copy)
    low_count = 0
    for obj in tile_low: obj.data.calc_loop_triangles(); low_count += len(obj.data.loop_triangles)
    low_objects += [parent] + tile_low
    manifest['tiles'].append({'id': key, 'min': [low.x, low.z, -high.y], 'max': [high.x, high.z, -low.y],
        'triangles': count, 'lowTriangles': low_count, 'bytes': (out/(key+'.glb')).stat().st_size if key != 'terrain' else 0})
    print('LOD_TILE', key, count, low_count, flush=True)
export('overview.glb', low_objects)
manifest['overviewBytes'] = (out/'overview.glb').stat().st_size
(out/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('BUND_LOD_READY', manifest['overviewBytes'], flush=True)
