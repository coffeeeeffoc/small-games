"""Original chipped limestone block for the gatehouse's real masonry modules."""
import bpy, sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from sculpt_export import export_meshes
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Restrained corner sculpting keeps each block under 120 triangles for mobile rendering.
bpy.ops.mesh.primitive_cube_add(size=1)
o=bpy.context.object;o.name='hand-cut limestone';o['group']='stone';o['color']='#ffffff';o['metal']=0
for v in o.data.vertices:
    x,y,z=v.co
    # Keep mortar-bearing sides stable; chip selected corner/edge surfaces.
    factor=1-.025*(math.sin(x*13+y*17+z*23)+1)
    v.co*=factor
m=o.modifiers.new('Soft quarried edges','BEVEL');m.width=.09;m.segments=2;m.angle_limit=.7
m=o.modifiers.new('Stone face normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=50
export_meshes([o],sys.argv[sys.argv.index('--')+1])
