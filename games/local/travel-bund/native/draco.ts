import * as THREE from 'three';
import createDecoder from './generated/draco-decoder.mjs';
let modulePromise:Promise<any>|null=null;
const attributeType:any={Float32Array,Int8Array,Int16Array,Int32Array,Uint8Array,Uint16Array,Uint32Array};
export const nativeDraco={preload(){return this;},
 decodeDracoFile(buffer:ArrayBuffer,onLoad:any,ids:any,types:any,_colorSpace?:any,onError?:any){
  modulePromise||=createDecoder({});
  void modulePromise!.then((draco:any)=>{
   const decoder=new draco.Decoder(),geometry=new draco.Mesh(),input=new draco.DecoderBuffer();
   try{
    input.Init(new Int8Array(buffer),buffer.byteLength);const status=decoder.DecodeBufferToMesh(input,geometry);if(!status.ok()||!geometry.ptr)throw Error('TRAVEL_RESOURCE: Draco decode '+status.error_msg());
    const result=new THREE.BufferGeometry();
    for(const[name,id]of Object.entries(ids)){
     const attribute=decoder.GetAttributeByUniqueId(geometry,id),Type=attributeType[types[name]||'Float32Array'];if(!Type)throw Error('TRAVEL_RESOURCE: invalid Draco component type');
     const num=geometry.num_points()*attribute.num_components(),size=num*Type.BYTES_PER_ELEMENT,ptr=draco._malloc(size),typeMap:any={Float32Array:draco.DT_FLOAT32,Int8Array:draco.DT_INT8,Int16Array:draco.DT_INT16,Int32Array:draco.DT_INT32,Uint8Array:draco.DT_UINT8,Uint16Array:draco.DT_UINT16,Uint32Array:draco.DT_UINT32};
     if(!decoder.GetAttributeDataArrayForAllPoints(geometry,attribute,typeMap[Type.name],size,ptr))throw Error('TRAVEL_RESOURCE: Draco attribute decode');
     const array=new Type(draco.HEAPF32.buffer,ptr,num).slice();draco._free(ptr);result.setAttribute(name,new THREE.BufferAttribute(array,attribute.num_components()));
    }
    const count=geometry.num_faces()*3,ptr=draco._malloc(count*4);decoder.GetTrianglesUInt32Array(geometry,count*4,ptr);const indices=new Uint32Array(draco.HEAPF32.buffer,ptr,count).slice();draco._free(ptr);result.setIndex(new THREE.BufferAttribute(indices,1));onLoad(result);
   }catch(error){onError?.(error);}finally{draco.destroy(input);draco.destroy(geometry);draco.destroy(decoder);}
  }).catch(error=>onError?.(error));
 }
};
