/** Actual UTF-8 decoding for hosts without the browser TextDecoder global. */
export class PortableUtf8Decoder {
 readonly encoding='utf-8';readonly fatal:boolean;readonly ignoreBOM:boolean;
 private pending=new Uint8Array(0);private beginning=true;
 constructor(label='utf-8',options:{fatal?:boolean;ignoreBOM?:boolean}={}){if(!['utf-8','utf8','unicode-1-1-utf-8'].includes(label.toLowerCase().trim()))throw new RangeError('Only UTF-8 is supported by the native decoder');this.fatal=!!options.fatal;this.ignoreBOM=!!options.ignoreBOM;}
 decode(input?:ArrayBuffer|ArrayBufferView,options:{stream?:boolean}={}){
  const raw=input===undefined?new Uint8Array(0):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input as ArrayBuffer);
  const data=new Uint8Array(this.pending.length+raw.length);data.set(this.pending);data.set(raw,this.pending.length);this.pending=new Uint8Array(0);let out='';
  const emit=(code:number)=>{if(this.beginning){this.beginning=false;if(code===0xfeff&&!this.ignoreBOM)return;}out+=String.fromCodePoint(code);};
  const invalid=()=>{if(this.fatal)throw new TypeError('Invalid UTF-8 data');emit(0xfffd);};
  for(let i=0;i<data.length;){const lead=data[i];if(lead<0x80){emit(lead);i++;continue;}
   const count=lead>=0xc2&&lead<=0xdf?2:lead>=0xe0&&lead<=0xef?3:lead>=0xf0&&lead<=0xf4?4:0;
   if(!count){invalid();i++;continue;}let code=lead&((1<<(7-count))-1),used=1,valid=true;
   for(let j=1;j<count;j++){if(i+j>=data.length){if(options.stream){this.pending=data.slice(i);return out;}valid=false;break;}const next=data[i+j],min=j===1&&lead===0xe0?0xa0:j===1&&lead===0xf0?0x90:0x80,max=j===1&&lead===0xed?0x9f:j===1&&lead===0xf4?0x8f:0xbf;if(next<min||next>max){valid=false;break;}code=(code<<6)|(next&63);used++;}
   if(valid)emit(code);else invalid();i+=used;
  }
  if(!options.stream)this.beginning=true;return out;
 }
}
export function decodeUtf8(bytes:ArrayBuffer){return new PortableUtf8Decoder().decode(bytes);}
// Three's GLB parser and Rapier's original glue also use this genuine algorithm.
if(typeof globalThis.TextDecoder==='undefined')(globalThis as any).TextDecoder=PortableUtf8Decoder;
