// Tiny generated mono WAVs, decoded and played by Phaser's sound manager. No assets or network.
export function tone(frequency: number, duration: number, end = frequency): string {
  const rate = 22050, count = Math.floor(rate * duration), bytes = new Uint8Array(44+count*2), v = new DataView(bytes.buffer);
  const word = (offset: number, s: string): void => { for(let i=0;i<s.length;i++) bytes[offset+i]=s.charCodeAt(i); };
  word(0,'RIFF'); v.setUint32(4,36+count*2,true); word(8,'WAVE'); word(12,'fmt '); v.setUint32(16,16,true);
  v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  word(36,'data'); v.setUint32(40,count*2,true);
  for(let i=0;i<count;i++) { const t=i/rate, envelope=Math.sin(Math.PI*i/count)**2; v.setInt16(44+i*2,Math.sin(2*Math.PI*(frequency*t+(end-frequency)*t*t/(2*duration)))*envelope*8000,true); }
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
