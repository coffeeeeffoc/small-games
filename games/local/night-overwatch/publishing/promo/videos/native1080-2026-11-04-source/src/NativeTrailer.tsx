import {AbsoluteFill, CanvasImage, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio, Video} from '@remotion/media';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};
const ink='#081724',mint='#a3eadc';

function Brand({closing=false}:{closing?:boolean}){
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <AbsoluteFill>
  <CanvasImage src={staticFile('title.png')} style={{width:1920,height:1080,scale:interpolate(frame,[0,4*fps],[1,1.035],clamp)}}/>
  <AbsoluteFill style={{background:'linear-gradient(0deg,rgba(3,12,22,.92),transparent 65%)'}}/>
  <div style={{position:'absolute',left:100,bottom:115,opacity:interpolate(frame,[0,10],[0,1],clamp),translate:`0 ${interpolate(frame,[0,15],[20,0],clamp)}px`}}>
   <div style={{fontSize:24,color:mint,letterSpacing:7,marginBottom:22}}>空中火力支援 · 战术行动</div>
   <div style={{fontSize:86,fontWeight:900,letterSpacing:4}}>{closing?'每一发，都为他们开路。':'夜幕之下，你是空中防线。'}</div>
   <div style={{fontSize:32,letterSpacing:4,marginTop:24,color:'#d6e2e8'}}>{closing?'进入火控席  ·  守护撤离之路':'发现威胁  /  精准支援  /  护送撤离'}</div>
  </div>
 </AbsoluteFill>;
}

function Combat({file,start,title,sub,index}:{file:string;start:number;title:string;sub:string;index?:string}){
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <AbsoluteFill>
  <Video src={staticFile(file)} trimBefore={start*fps} muted style={{width:1920,height:1080}}/>
  <div style={{position:'absolute',left:0,bottom:115,width:1060,height:230,background:'linear-gradient(90deg,rgba(3,12,22,.84),rgba(3,12,22,.45) 70%,transparent)'}}/>
  <div style={{position:'absolute',left:80,bottom:165,opacity:interpolate(frame,[0,7],[0,1],clamp),translate:`${interpolate(frame,[0,12],[-18,0],clamp)}px 0`}}>
   <div style={{display:'flex',alignItems:'center',gap:22}}>
    {index&&<span style={{fontSize:24,color:mint,border:'1px solid #a3eadc88',padding:'8px 12px',letterSpacing:3}}>{index}</span>}
    <span style={{fontSize:62,fontWeight:900,letterSpacing:4,textShadow:'0 2px 8px #0008'}}>{title}</span>
   </div>
   <div style={{fontSize:29,letterSpacing:4,color:'#deebe9',marginTop:15}}>{sub}</div>
  </div>
 </AbsoluteFill>;
}

export function NativeTrailer(){
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background:ink,color:'#f6f2df',fontFamily:'Microsoft YaHei, sans-serif'}}>
  <Sequence name="夜航任务" durationInFrames={4*fps}><Brand/></Sequence>
  <Sequence name="速射炮连射" from={4*fps} durationInFrames={3*fps}><Combat file="rapid1080.mp4" start={3.5} title="速射炮 · 连续压制" sub="捕捉目标，火力不停" index="01 / 04"/></Sequence>
  <Sequence name="榴弹炮弹着" from={7*fps} durationInFrames={3*fps}><Combat file="blast1080.mp4" start={2} title="榴弹炮 · 精准爆破" sub="把握弹着时机，清除沿线威胁" index="02 / 04"/></Sequence>
  <Sequence name="重炮打击" from={10*fps} durationInFrames={3*fps}><Combat file="heavy1080.mp4" start={5} title="重型榴弹炮 · 强力打击" sub="选择时机，一发破局" index="03 / 04"/></Sequence>
  <Sequence name="燃烧弹火区" from={13*fps} durationInFrames={5*fps}><Combat file="incendiary1080.mp4" start={5.5} title="燃烧弹 · 火线封锁" sub="持续火区，改变战场路线" index="04 / 04"/></Sequence>
  <Sequence name="热像搜敌" from={18*fps} durationInFrames={2.5*fps}><Combat file="thermal1080.mp4" start={4.5} title="切换热像，发现威胁" sub="夜景 / 增强 / 热像"/></Sequence>
  <Sequence name="速射追击" from={20.5*fps} durationInFrames={2.5*fps}><Combat file="rapid1080.mp4" start={6} title="切换火力，持续支援" sub="四种武器，各有战术"/></Sequence>
  <Sequence name="最后打击" from={23*fps} durationInFrames={3*fps}><Combat file="blast1080.mp4" start={6} title="守住他们的归途" sub="辨别敌我 · 掩护友军与撤离车队"/></Sequence>
  <Sequence name="品牌收尾" from={26*fps} durationInFrames={4*fps}><Brand closing/></Sequence>
  <Audio src={staticFile('ignite.m4a')}/>
  <AbsoluteFill style={{background:'#030910',opacity:interpolate(frame,[0,10,29.4*fps,30*fps-1],[1,0,0,1],clamp),pointerEvents:'none'}}/>
 </AbsoluteFill>;
}
