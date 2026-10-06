import bpy, json, struct, base64, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path

def export_meshes(parts, output):
    # Export evaluated, triangulated normals; planar UVs are authored per dominant face.
    deps=bpy.context.evaluated_depsgraph_get(); result=[]
    for o in parts:
        obj=o.evaluated_get(deps);mesh=obj.to_mesh();mesh.calc_loop_triangles()
        pos=[];normal=[];uv=[]
        wood=o['color'] in {'#a36e38','#b17d43','#946835','#c29758','#8d6236','#725034','#a57b4d'}
        spans=[max(v.co[a] for v in mesh.vertices)-min(v.co[a] for v in mesh.vertices) for a in range(3)]
        grain=max(range(3),key=lambda a:spans[a])
        for t in mesh.loop_triangles:
            for li in t.loops:
                v=mesh.vertices[mesh.loops[li].vertex_index];p=o.matrix_world@v.co
                n=o.matrix_world.to_3x3()@mesh.corner_normals[li].vector;n.normalize()
                pos.extend(round(c,5) for c in p);normal.extend(round(c,5) for c in n)
                if abs(n.x)>.7:u,w=p.z,p.y
                elif abs(n.y)>.7:u,w=p.x,p.z
                else:u,w=p.x,p.y
                if wood:
                    if o['group']=='barrel':u,w=math.atan2(p.y,p.x)*.7,p.z
                    else:
                        dominant=max(range(3),key=lambda a:abs(mesh.corner_normals[li].vector[a]))
                        across=next(a for a in range(3) if a!=grain and a!=dominant) if dominant!=grain else (grain+1)%3
                        u,w=v.co[across],v.co[grain]
                uv.extend([round(u*.32,5),round(w*.32,5)])
        result.append(dict(name=o.name,group=o['group'],color=o['color'],metal=o['metal'],position=pos,normal=normal,uv=uv))
        obj.to_mesh_clear()
    # Merge by material and pivot, deduplicate the evaluated corners, then quantize.
    # 1/4096 world units is well below a screen pixel; signed normals use 1/32767.
    batches={}
    maxima={}
    for part in result:
        key=(part['group'],part['color'],part['metal'])
        maxima[key]=max(maxima.get(key,0), max(abs(v) for v in part['position']))
    scales={key:4096 if maximum<7.99 else 1024 for key,maximum in maxima.items()}
    for part in result:
        key=(part['group'],part['color'],part['metal'])
        batch=batches.setdefault(key,dict(vertices=[],indices=[],lookup={}))
        for i in range(len(part['position'])//3):
            v=tuple(round(c*scales[key]) for c in part['position'][i*3:i*3+3])+tuple(round(c*32767) for c in part['normal'][i*3:i*3+3])+tuple(round(c*4096) for c in part['uv'][i*2:i*2+2])
            if v not in batch['lookup']:
                batch['lookup'][v]=len(batch['vertices']);batch['vertices'].append(v)
            batch['indices'].append(batch['lookup'][v])
    # Bake restrained ambient occlusion from the actual geometry, per movable pivot.
    # Ray length and sample count are fixed, making exports deterministic and reviewable.
    geometry_groups={}
    for part in result:
        group=geometry_groups.setdefault(part['group'],dict(vertices=[],faces=[]))
        start=len(group['vertices'])
        group['vertices'] += [Vector(part['position'][i:i+3]) for i in range(0,len(part['position']),3)]
        group['faces'] += [(start+i,start+i+1,start+i+2) for i in range(0,len(part['position'])//3,3)]
    trees={key:BVHTree.FromPolygons(value['vertices'],value['faces'],all_triangles=True) for key,value in geometry_groups.items()}
    packed=[]
    for (group,color,metal),batch in batches.items():
        assert len(batch['vertices'])<65536
        vertices=b''.join(struct.pack('<8h',*v) for v in batch['vertices'])
        indices=struct.pack('<'+'H'*len(batch['indices']),*batch['indices'])
        shades=[]
        scale=scales[(group,color,metal)]
        for v in batch['vertices']:
            p=Vector(v[:3])/scale;n=Vector(v[3:6])/32767
            n.normalize()
            tangent=n.cross(Vector((0,1,0)) if abs(n.y)<.9 else Vector((1,0,0)));tangent.normalize()
            bitangent=n.cross(tangent);hits=0
            for sample in range(12):
                z=(sample+.5)/12;r=math.sqrt(1-z*z);angle=sample*2.39996323
                direction=n*z+tangent*(math.cos(angle)*r)+bitangent*(math.sin(angle)*r)
                if trees[group].ray_cast(p+n*.014,direction,.85)[0] is not None:hits+=1
            shades.append(round(255*(1-.45*hits/12)))
        packed.append(dict(group=group,color=color,metal=metal,positionScale=scale,vertices=base64.b64encode(vertices).decode(),indices=base64.b64encode(indices).decode(),occlusion=base64.b64encode(bytes(shades)).decode()))

    output=Path(output);output.write_text(json.dumps(packed,indent=2)+'\n')
    print('Original sculpture:',len(parts),'parts;',sum(len(p['position'])//9 for p in result),'triangles;',len(packed),'batches;',output.stat().st_size,'bytes')
