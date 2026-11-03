import {AbsoluteFill, CanvasImage, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio, Video} from '@remotion/media';
const ink = '#081724', mint = '#a3eadc';
const fill = {width: '100%', height: '100%', objectFit: 'cover' as const};
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
function Copy({eyebrow, title, sub}: {eyebrow: string; title: string; sub: string}) {
 const frame = useCurrentFrame();
 return <div style={{position: 'absolute', left: 100, bottom: 115, opacity: interpolate(frame, [0, 12], [0, 1], clamp), translate: `0 ${interpolate(frame, [0, 18], [24, 0], clamp)}px`}}>
 <div style={{fontSize: 24, letterSpacing: 7, color: mint, marginBottom: 22}}>{eyebrow}</div>
 <div style={{fontSize: 86, fontWeight: 900, letterSpacing: 4, lineHeight: 1.2}}>{title}</div>
 <div style={{fontSize: 34, color: '#d6e2e8', marginTop: 24, letterSpacing: 4}}>{sub}</div></div>;
}
function Brand({closing = false}: {closing?: boolean}) {
 const frame = useCurrentFrame(); const {fps} = useVideoConfig();
 return <AbsoluteFill style={{background: ink}}>
 <CanvasImage src={staticFile('title.png')} style={{...fill, scale: interpolate(frame, [0, 7 * fps], [1, 1.045], clamp)}} />
 <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(3,12,22,.95), transparent 72%)'}} />
 <Copy eyebrow={closing ? 'NIGHT OVERWATCH / 夜航07' : '空中火力支援 · 战术行动'} title={closing ? '每一发，都为他们开路。' : '夜幕之下，你是空中防线。'} sub={closing ? '进入火控席  ·  守护撤离之路' : '发现威胁  /  精准支援  /  护送撤离'} /></AbsoluteFill>;
}
function Imaging({image, number, title, sub}: {image: string; number: string; title: string; sub: string}) {
 const frame = useCurrentFrame(); const {fps} = useVideoConfig();
 return <AbsoluteFill style={{background: ink}}>
 <CanvasImage src={staticFile(image)} style={{position: 'absolute', width: 1440, height: 810, right: -90, top: 115, scale: interpolate(frame, [0, 3 * fps], [1, 1.04], clamp)}} />
 <AbsoluteFill style={{background: 'linear-gradient(90deg, #081724 8%, rgba(8,23,36,.94) 27%, rgba(8,23,36,.1) 66%), linear-gradient(0deg, #081724, transparent 30%)'}} />
 <div style={{position: 'absolute', left: 100, top: 95, fontSize: 25, color: mint, letterSpacing: 5}}>成像系统 / {number}</div>
 <div style={{position: 'absolute', left: 95, top: 195, fontSize: 180, fontWeight: 200, color: '#a3eadc22'}}>{number}</div>
 <Copy eyebrow="看清战场，判断先机" title={title} sub={sub} />
 <div style={{position: 'absolute', right: 100, bottom: 72, fontSize: 22, color: '#9cabb7'}}>游戏内画面 · 成像展示</div></AbsoluteFill>;
}
function Combat({start, title, sub}: {start: number; title: string; sub: string}) {
 const {fps} = useVideoConfig();
 return <AbsoluteFill style={{background: ink}}>
 <Video src={staticFile('combat.mp4')} trimBefore={start * fps} muted style={{position: 'absolute', width: 1664, height: 936, left: 128, top: 0}} />
 <AbsoluteFill style={{background: 'linear-gradient(0deg, #081724 2%, rgba(8,23,36,.88) 13%, transparent 43%)'}} />
 <div style={{position: 'absolute', right: 100, top: 65, padding: '12px 20px', background: '#081724dd', fontSize: 22, color: mint, letterSpacing: 3}}>浏览器实录 · 战斗剪辑</div>
 <Copy eyebrow="FIRE SUPPORT / 火力支援" title={title} sub={sub} /></AbsoluteFill>;
}
export function Trailer() {
 const frame = useCurrentFrame(); const {fps} = useVideoConfig();
 return <AbsoluteFill style={{background: ink, color: '#f6f2df', fontFamily: 'Microsoft YaHei, sans-serif'}}>
 <Sequence name="夜航任务" durationInFrames={4 * fps}><Brand /></Sequence>
 <Sequence name="夜景" from={4 * fps} durationInFrames={3 * fps}><Imaging image="night.png" number="01" title="穿越夜幕" sub="夜景成像 · 俯瞰沿线威胁" /></Sequence>
 <Sequence name="增强" from={7 * fps} durationInFrames={3 * fps}><Imaging image="enhanced.png" number="02" title="看清每一处地形" sub="增强成像 · 清晰观察战场" /></Sequence>
 <Sequence name="热像" from={10 * fps} durationInFrames={3 * fps}><Imaging image="thermal.png" number="03" title="让目标显现" sub="热像成像 · 搜寻目标踪迹" /></Sequence>
 <Sequence name="发现威胁" from={13 * fps} durationInFrames={5 * fps}><Combat start={3} title="锁定威胁，果断开火" sub="切换火力 · 把握弹着时机" /></Sequence>
 <Sequence name="保护友军" from={18 * fps} durationInFrames={5 * fps}><Combat start={11} title="守住他们的归途" sub="辨别敌我 · 掩护友军与撤离车队" /></Sequence>
 <Sequence name="品牌收尾" from={23 * fps} durationInFrames={7 * fps}><Brand closing /></Sequence>
 <Audio src={staticFile('score.wav')} volume={0.8} />
 <div style={{position: 'absolute', bottom: 0, height: 4, width: `${frame / (30 * fps - 1) * 100}%`, background: mint}} />
 <AbsoluteFill style={{background: '#030910', opacity: interpolate(frame, [0, 12, 29 * fps, 30 * fps - 1], [1, 0, 0, 1], clamp), pointerEvents: 'none'}} /></AbsoluteFill>;
}
