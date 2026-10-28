"""Bake original Blender materials to portable mobile albedo and tangent normal maps."""
import bpy, json, hashlib
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parent / 'assets/resources/textures'
OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=2)
plane=bpy.context.object
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.render.bake.use_pass_direct=False
scene.render.bake.use_pass_indirect=False
scene.render.bake.use_pass_color=True
scene.render.bake.margin=8
scene.render.image_settings.quality=90
catalog=[]

for name, dark, light, scale in [
    ('slate',(.18,.22,.25,1),(.62,.66,.66,1),7),
    ('ground',(.12,.19,.12,1),(.45,.49,.28,1),5),
    ('moon',(.24,.30,.34,1),(.79,.82,.81,1),4),
]:
    material=bpy.data.materials.new(name)
    material.use_nodes=True
    plane.data.materials.clear();plane.data.materials.append(material)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.9
    coords=nodes.new('ShaderNodeTexCoord')
    split=nodes.new('ShaderNodeSeparateXYZ');links.new(coords.outputs['UV'],split.inputs[0])
    periodic=[]
    for axis in ['X','Y']:
        angle=nodes.new('ShaderNodeMath');angle.operation='MULTIPLY';angle.inputs[1].default_value=6.28318530718
        links.new(split.outputs[axis],angle.inputs[0])
        for operation in ['COSINE','SINE']:
            trig=nodes.new('ShaderNodeMath');trig.operation=operation
            links.new(angle.outputs[0],trig.inputs[0]);periodic.append(trig.outputs[0])
    torus=nodes.new('ShaderNodeCombineXYZ')
    for source,target in zip(periodic[:3],torus.inputs):links.new(source,target)
    noise=nodes.new('ShaderNodeTexNoise')
    noise.noise_dimensions='4D'
    noise.inputs['Scale'].default_value=scale
    noise.inputs['Detail'].default_value=5
    noise.inputs['Roughness'].default_value=.72
    links.new(torus.outputs[0],noise.inputs['Vector']);links.new(periodic[3],noise.inputs['W'])
    detail=nodes.new('ShaderNodeTexNoise')
    detail.noise_dimensions='4D'
    detail.inputs['Scale'].default_value=95
    detail.inputs['Detail'].default_value=3
    links.new(torus.outputs[0],detail.inputs['Vector']);links.new(periodic[3],detail.inputs['W'])
    bands=nodes.new('ShaderNodeTexWave')
    bands.bands_direction='Y'
    bands.inputs['Scale'].default_value=9 if name=='slate' else 3
    bands.inputs['Distortion'].default_value=6
    bands.inputs['Detail'].default_value=4
    links.new(torus.outputs[0],bands.inputs['Vector'])
    blend=nodes.new('ShaderNodeMixRGB');blend.blend_type='MULTIPLY'
    blend.inputs[0].default_value=.25 if name=='slate' else .1
    links.new(noise.outputs['Fac'],blend.inputs[1]);links.new(bands.outputs['Fac'],blend.inputs[2])
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=dark
    ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=light
    links.new(blend.outputs[0],ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
    bumps=nodes.new('ShaderNodeBump')
    bumps.inputs['Strength'].default_value=.42
    bumps.inputs['Distance'].default_value=.035
    links.new(detail.outputs['Fac'],bumps.inputs['Height'])
    links.new(bumps.outputs['Normal'],bsdf.inputs['Normal'])
    target=nodes.new('ShaderNodeTexImage')
    maps=[('albedo','DIFFUSE')]+([('normal','NORMAL')] if name=='slate' else [])
    for kind, mode in maps:
        size=512 if kind=='normal' else 1024
        image=bpy.data.images.new(name+'-'+kind,width=size,height=size,alpha=False)
        if kind=='normal': image.colorspace_settings.name='Non-Color'
        target.image=image;nodes.active=target
        bpy.ops.object.bake(type=mode)
        path=OUT/('detail-normal.png' if kind=='normal' else name+'-albedo.jpg')
        image.filepath_raw=str(path);image.file_format='PNG' if kind=='normal' else 'JPEG';image.save()
        catalog.append({'name':path.name,'width':size,'height':size,'bytes':path.stat().st_size,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    nodes.remove(target)

(SOURCE/'surfaces-manifest.json').write_text(json.dumps({'source':'Original Blender procedural material bake',
    'sourceHash':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest(), 'tool':bpy.app.version_string,'assets':catalog},indent=2),encoding='utf-8')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'nullrange-surfaces.blend'),compress=True)
assert len(catalog)==4 and all(a['bytes']>2000 for a in catalog)
print('NULLRANGE_SURFACES_OK',len(catalog))
