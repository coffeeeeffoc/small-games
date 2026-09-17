import json,struct,io,pathlib
from PIL import Image
root=pathlib.Path('games/local/carding-car')
b=(root/'art-source/kart.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);start=20+n;data=b[start+8:];v=j['bufferViews'][j['images'][0]['bufferView']];img=Image.open(io.BytesIO(data[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]));print('Original texture',img.size)
img.thumbnail((512,512));out=io.BytesIO();img.convert('RGB').save(out,format='JPEG',quality=88);texture=out.getvalue();offset=v.get('byteOffset',0);data=data[:offset]+texture;data+=b'\0'*((-len(data))%4);v['byteLength']=len(texture);j['images'][0]['mimeType']='image/jpeg';j['buffers'][0]['byteLength']=len(data)
# The shaded texture already contains the soft toy lighting.
j.setdefault('extensionsUsed',[]).append('KHR_materials_unlit')
for m in j['materials']:m.setdefault('extensions',{})['KHR_materials_unlit']={}
h=json.dumps(j,separators=(',',':')).encode();h+=b' '*((-len(h))%4)
result=struct.pack('<III',0x46546c67,2,28+len(h)+len(data))+struct.pack('<II',len(h),0x4e4f534a)+h+struct.pack('<II',len(data),0x004e4942)+data
outpath=root/'assets/resources/models/kart.glb';outpath.parent.mkdir(parents=True,exist_ok=True);outpath.write_bytes(result);print('Mobile GLB',len(result),'bytes')
