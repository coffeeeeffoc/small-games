import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { evidence } from './case';
import './puzzles.css';

type Props = {
  kind: 'photo' | 'phone' | 'camera';
  solved: string[];
  onSolve: (id: string) => void;
  onCollect: (id: string) => void;
};
type Point = { x: number; y: number };
type Transform = Point & { scale: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const record = (id: string) => evidence.find((item) => item.id === id);

function FoundingPhoto() {
  return <svg viewBox="0 0 640 440" className="pz-photo-art" aria-label="望潮档案馆开馆合照，右下方有一块纪念铭牌" role="img">
    <defs>
      <linearGradient id="photo-wall" x2="0" y2="1"><stop stopColor="#bdb5a0"/><stop offset="1" stopColor="#787461"/></linearGradient>
      <linearGradient id="photo-floor" x2="0" y2="1"><stop stopColor="#5e5c4d"/><stop offset="1" stopColor="#aaa28a"/></linearGradient>
      <filter id="photo-grain"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".14"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
    </defs>
    <g filter="url(#photo-grain)">
      <path fill="url(#photo-wall)" d="M0 0h640v335H0z"/>
      <path fill="url(#photo-floor)" d="M0 335h640v105H0z"/>
      <path fill="#504f43" d="M235 65h180v263H235z"/>
      <path fill="#242d2d" d="M249 79h152v249H249z"/>
      <path stroke="#857d61" strokeWidth="5" d="M325 80v246"/>
      <path fill="#ddd1a8" d="M189 33h270v31H189z"/>
      <text x="324" y="55" textAnchor="middle" fill="#4b4d41" fontSize="20" fontFamily="serif" letterSpacing="9">望 潮 档 案 馆</text>
      {[78, 480].map((x) => <g key={x}><path fill="#5a6554" d={`M${x} 160h81v128H${x}z`}/><path stroke="#aaa48a" strokeWidth="6" d={`M${x + 40} 160v128M${x} 225h81`}/><path fill="#a39d88" d={`M${x - 8} 287h97v14H${x - 8}z`}/></g>)}
      <path stroke="#c7b775" strokeWidth="4" d="M44 307Q307 345 594 305" fill="none"/>
      {[{ x: 171, coat: '#3d4c49', skin: '#b8a486', hair: '#31382f' }, { x: 249, coat: '#737567', skin: '#c4b08d', hair: '#343730' }, { x: 330, coat: '#3e4540', skin: '#c4b298', hair: '#514e40' }, { x: 409, coat: '#56666b', skin: '#c8b596', hair: '#2e3330' }].map((person, index) => <g key={person.x} transform={`translate(${person.x} ${index === 2 ? 184 : 193})`}>
        <path d="M-23 135l4 77h14l7-78 8 78h14l5-77" fill="#333c37"/>
        <path d="M-25 57Q0 43 25 57l12 88h-74z" fill={person.coat}/>
        <path d="M-7 44h14v20H-7z" fill={person.skin}/>
        <ellipse cy="29" rx="18" ry="25" fill={person.skin}/>
        <path d="M-19 27Q-24-5 1 2Q26 1 19 30L12 13-8 16-14 35z" fill={person.hair}/>
        <path d="M-9 28h4m10 0h4" stroke="#515446" strokeWidth="2"/>
        <path d="M-4 41q4 3 8 0" fill="none" stroke="#796e58"/>
      </g>)}
      <path fill="#777961" d="M507 322h85v70h-85z"/>
      <path fill="#c0b17f" stroke="#494d41" strokeWidth="2" d="M511 324h77v38h-77z"/>
      <text x="550" y="336" textAnchor="middle" fill="#333d34" fontSize="5">望潮私人档案馆 · 开馆纪念</text>
      <text x="550" y="353" textAnchor="middle" fill="#283b33" fontFamily="monospace" fontSize="14" fontWeight="bold">09.17</text>
    </g>
    <path d="M0 0h640v440H0z" fill="none" stroke="#e4d5af" strokeWidth="16"/>
    <path d="M10 429h620" stroke="#443f30" strokeOpacity=".4"/>
  </svg>;
}

function PhotoPuzzle({ solved, onSolve }: Pick<Props, 'solved' | 'onSolve'>) {
  const viewport = useRef<HTMLDivElement>(null);
  const points = useRef(new Map<number, Point>());
  const moved = useRef(0);
  const plaquePressed = useRef(false);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [notice, setNotice] = useState('');
  const done = solved.includes('photo');

  function bounded(next: Transform): Transform {
    const bounds = viewport.current?.getBoundingClientRect();
    return { ...next, x: clamp(next.x, -(next.scale - 1) * (bounds?.width ?? 320) / 2, (next.scale - 1) * (bounds?.width ?? 320) / 2), y: clamp(next.y, -(next.scale - 1) * (bounds?.height ?? 220) / 2, (next.scale - 1) * (bounds?.height ?? 220) / 2) };
  }
  function local(event: PointerEvent): Point {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!points.current.size) {
      moved.current = 0;
      plaquePressed.current = (event.target as Element).closest('.pz-photo-hotspot') !== null;
    } else plaquePressed.current = false;
    points.current.set(event.pointerId, local(event));
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const previous = points.current.get(event.pointerId);
    if (!previous) return;
    const before = [...points.current.values()];
    const next = local(event);
    moved.current += Math.hypot(next.x - previous.x, next.y - previous.y);
    points.current.set(event.pointerId, next);
    const after = [...points.current.values()];
    setTransform((current) => {
      if (before.length < 2) return bounded({ ...current, x: current.x + next.x - previous.x, y: current.y + next.y - previous.y });
      const middle = (pair: Point[]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
      const distance = (pair: Point[]) => Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      const scale = clamp(current.scale * distance(after) / Math.max(1, distance(before)), 1, 4);
      const from = middle(before);
      const to = middle(after);
      return bounded({ scale, x: to.x - (from.x - current.x) * scale / current.scale, y: to.y - (from.y - current.y) * scale / current.scale });
    });
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (event.type === 'pointerup' && points.current.size === 1 && plaquePressed.current && moved.current < 8) inspect();
    plaquePressed.current = false;
    points.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function zoom(delta: number) {
    setTransform((current) => bounded({ ...current, scale: clamp(current.scale + delta, 1, 4) }));
  }
  function inspect() {
    if (transform.scale < 1.7) return;
    onSolve('photo');
    setNotice('铭牌刻着「09.17」。这是望潮档案馆开馆的日期。');
  }

  return <section className="pz-photo pz-module" aria-label="照片调查">
    <div className="pz-instrument-line"><span>ARCHIVE / 001</span><span>馆庆合照</span></div>
    <div ref={viewport} className="pz-photo-viewport" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={(event) => points.current.delete(event.pointerId)}>
      <div className="pz-photo-transform" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
        <FoundingPhoto />
        <button type="button" className="pz-photo-hotspot" aria-label="检查照片中的开馆铭牌" disabled={transform.scale < 1.7} onClick={(event) => { if (event.detail === 0) inspect(); }} />
      </div>
      <span className="pz-zoom-readout" aria-live="polite">{transform.scale.toFixed(1)}×</span>
    </div>
    <div className="pz-controls">
      <button type="button" onClick={() => zoom(-.4)} disabled={transform.scale <= 1} aria-label="缩小照片">−</button>
      <span>双指缩放 · 拖动观察</span>
      <button type="button" onClick={() => zoom(.4)} disabled={transform.scale >= 4} aria-label="放大照片">＋</button>
      <button type="button" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}>复位</button>
    </div>
    <p className="pz-instruction">右下角似乎有一块开馆铭牌。放大到 1.7× 后检查它。</p>
    <button type="button" className="pz-primary" disabled={transform.scale < 1.7} onClick={inspect}>{done ? '重新检查铭牌' : '检查铭牌'}</button>
    <div className="pz-feedback" role="status">{notice || (done ? '已记录：开馆日期 09.17。锁屏提示是「开馆那一天」。' : '')}</div>
  </section>;
}

const fragments = [
  { id: 'type', label: '类型：预约消息' },
  { id: 'created', label: '创建：19:48' },
  { id: 'execute', label: '执行：20:40' },
  { id: 'status', label: '状态：服务器自动发送' },
];
const scrambled = ['execute', 'status', 'type', 'created'];

function RestorePuzzle({ solved, onSolve }: Pick<Props, 'solved' | 'onSolve'>) {
  const [order, setOrder] = useState(scrambled);
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ id: string; y: number; pointerId: number; centers: number[] } | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [message, setMessage] = useState('');
  const done = solved.includes('restore');
  function move(id: string, to: number) {
    setOrder((current) => {
      const next = current.filter((item) => item !== id);
      next.splice(clamp(to, 0, current.length - 1), 0, id);
      return next;
    });
    setMessage('');
  }
  function end(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    if (!cancel) {
      const centers = drag.current.centers;
      let nearest = 0;
      centers.forEach((center, index) => { if (Math.abs(center - event.clientY) < Math.abs(centers[nearest] - event.clientY)) nearest = index; });
      move(drag.current.id, nearest);
    }
    drag.current = null;
    setDragging(null);
    setOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function restore() {
    if (!order.every((id, index) => fragments[index].id === id)) {
      setMessage('回执结构不完整。按「类型 → 创建 → 执行 → 状态」还原，时间字段各归其位。');
      return;
    }
    onSolve('restore');
    setMessage('回执恢复成功，原始记录已加入证据。请留意创建时间与执行时间的差别。');
  }
  return <section className="pz-restore" aria-label="恢复删除信息">
    <div className="pz-document-label">RECOVERY / 04 FRAGMENTS</div>
    <h3>一张被删除的回执</h3>
    <p className="pz-instruction">拖住左侧把手排列碎片，也可用上下按钮。回执结构：类型 → 创建 → 执行 → 状态。</p>
    <ol className="pz-fragments">
      {order.map((id, index) => <li key={id} ref={(node) => { if (node) rows.current.set(id, node); else rows.current.delete(id); }} className={dragging === id ? 'is-dragging' : ''} style={dragging === id ? { transform: `translateY(${offset}px)` } : undefined}>
        <button type="button" className="pz-drag-handle" aria-label={`拖动碎片：${fragments.find((item) => item.id === id)!.label}`} onPointerDown={(event) => {
          if (drag.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id, y: event.clientY, pointerId: event.pointerId, centers: order.map((rowId) => { const rect = rows.current.get(rowId)!.getBoundingClientRect(); return rect.top + rect.height / 2; }) };
          setDragging(id);
        }} onPointerMove={(event) => { if (drag.current?.pointerId === event.pointerId) setOffset(event.clientY - drag.current.y); }} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onLostPointerCapture={() => { drag.current = null; setDragging(null); setOffset(0); }}>⠿</button>
        <span><small>碎片 {index + 1}</small>{fragments.find((item) => item.id === id)!.label}</span>
        <div className="pz-fragment-actions"><button type="button" disabled={index === 0} onClick={() => move(id, index - 1)} aria-label={`上移${fragments.find((item) => item.id === id)!.label}`}>↑</button><button type="button" disabled={index === 3} onClick={() => move(id, index + 1)} aria-label={`下移${fragments.find((item) => item.id === id)!.label}`}>↓</button></div>
      </li>)}
    </ol>
    <button type="button" className="pz-primary" onClick={restore}>{done ? '再次校验回执' : '校验并恢复'}</button>
    <div role="status" className="pz-feedback">{message}</div>
    {done && <div className="pz-recovered"><span className="pz-document-label">已恢复的原始记录</span><p>{record('schedule')?.detail}</p></div>}
  </section>;
}

const apps = [
  { id: 'chat', name: '聊天', icon: '◌', color: '#526f67' },
  { id: 'photos', name: '相册', icon: '▧', color: '#7b745c' },
  { id: 'calls', name: '通话', icon: '⌁', color: '#586b72' },
  { id: 'memo', name: '备忘', icon: '≡', color: '#897555' },
  { id: 'transfer', name: '转账', icon: '↗', color: '#677967' },
  { id: 'deleted', name: '已删除', icon: '⌫', color: '#795e5a' },
] as const;
type AppId = (typeof apps)[number]['id'];

function PhonePuzzle({ solved, onSolve, onCollect }: Omit<Props, 'kind'>) {
  const phone = useRef<HTMLElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [app, setApp] = useState<AppId | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const unlocked = solved.includes('unlock');
  useEffect(() => {
    phone.current?.closest('.modal-content')?.scrollTo({ top: 0 });
    if (unlocked) phone.current?.querySelector<HTMLElement>('.pz-phone-header')?.focus({ preventScroll: true });
  }, [app, unlocked]);
  function unlock() {
    if (code !== '0917') { setError('密码不正确。锁屏提示：开馆那一天。'); setCode(''); return; }
    if (!solved.includes('photo')) { setError('还没有记录密码依据。请先调查馆庆合照，放大并检查铭牌。'); return; }
    setError('');
    onSolve('unlock');
  }
  function take(id: string) { onCollect(id); setTaken((current) => current.includes(id) ? current : [...current, id]); }
  function collectButton(id: string) {
    return <button type="button" className="pz-record-collect" onClick={() => take(id)}>{taken.includes(id) ? '已取证 · 再查看' : '记录此条证据'}<span aria-hidden="true">↗</span></button>;
  }
  return <section ref={phone} className="pz-phone pz-module" aria-label="顾言的手机">
    <div className="pz-phone-status"><span>21:17</span><span>▂▄▆ &nbsp; 72% ▰</span></div>
    {!unlocked ? <form className="pz-lockscreen" onSubmit={(event) => { event.preventDefault(); unlock(); }}>
      <div className="pz-lock-icon" aria-hidden="true">⌑</div>
      <p className="pz-document-label">此手机属于</p><h3>顾言</h3>
      <p>输入四位密码</p>
      <input aria-label="四位手机密码" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
      <p className="pz-password-hint">密码提示：开馆那一天</p>
      <div className="pz-keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => <button type="button" key={key} onClick={() => { setCode((current) => (current + key).slice(0, 4)); setError(''); }}>{key}</button>)}<button type="button" className="pz-key-small" onClick={() => setCode('')}>清空</button><button type="button" onClick={() => setCode((current) => (current + '0').slice(0, 4))}>0</button><button type="button" onClick={() => setCode((current) => current.slice(0, -1))} aria-label="删除最后一位密码">⌫</button></div>
      <button type="submit" className="pz-primary" disabled={code.length !== 4}>解锁手机</button>
      <div role="status" className="pz-feedback pz-error">{error}</div>
    </form> : <>
      <div className="pz-phone-header" tabIndex={-1} aria-label={app ? `${apps.find((item) => item.id === app)?.name}应用` : '手机应用主页'}>{app ? <button type="button" onClick={() => setApp(null)}>‹ 所有应用</button> : <div><small>数字取证 / DEVICE 01</small><h3>顾言的手机</h3></div>}<span>{app ? apps.find((item) => item.id === app)?.name : '已解锁'}</span></div>
      {!app ? <><p className="pz-instruction pz-phone-intro">查看原始记录。你认为有价值的内容，需要单独取证。</p><div className="pz-app-grid">{apps.map((item) => <button type="button" key={item.id} onClick={() => setApp(item.id)}><span style={{ background: item.color }} aria-hidden="true">{item.icon}</span>{item.name}{item.id === 'deleted' && <small>4 个碎片</small>}</button>)}</div><div className="pz-phone-wallpaper"><span>潮水会退。</span><span>记录会留下。</span><small>GU YAN / PRIVATE ARCHIVE</small></div></> : <div className="pz-phone-content">
        {app === 'chat' && <div className="pz-chat">
          <div className="pz-chat-room">望潮 · 预展工作群 <small>5 人</small></div>
          <p className="pz-chat-time">今天 18:35</p><div className="pz-chat-message"><small>许曼</small><p>胸牌放在入口。直播彩排 19:30，大家记得试麦。</p></div>
          <p className="pz-chat-time">今天 20:40</p><div className="pz-chat-message is-own"><small>顾言</small><p>我还在核对账目，谁都别上来。</p></div>
          <p className="pz-record-note">{record('message')?.detail}</p>{collectButton('message')}
          <div className="pz-chat-room pz-private-room">顾言 ↔ 林岑 <small>私人聊天</small></div><p className="pz-chat-time">今天 19:52</p><div className="pz-chat-message is-own"><small>顾言</small><p>{record('threat')?.summary}</p></div><div className="pz-chat-message"><small>林岑</small><p>别在预展上说。我会来。</p></div><p className="pz-record-note">{record('threat')?.detail}</p>{collectButton('threat')}
        </div>}
        {app === 'photos' && <><p className="pz-document-label">相册 / 收藏 01</p><PhotoPuzzle solved={solved} onSolve={onSolve} /><div className="pz-ordinary-record"><strong>另有 23 张藏品工作照</strong><p>器物边缘、修复色卡与展架尺寸，没有拍摄到今晚的现场。</p></div></>}
        {app === 'calls' && <><p className="pz-document-label">最近通话</p>{[{ name: '印务公司', time: '今天 17:26', note: '已接通 · 02:13' }, { name: '许曼', time: '今天 16:40', note: '已接通 · 00:48' }, { name: '未保存的号码', time: '昨天 10:03', note: '未接来电' }].map((call) => <div className="pz-call-record" key={call.name}><span aria-hidden="true">↙</span><div><strong>{call.name}</strong><small>{call.note}</small></div><time>{call.time}</time></div>)}<p className="pz-instruction">20:00 之后没有通话记录。这份列表无法证明手机主人当时的位置。</p></>}
        {app === 'memo' && <><p className="pz-document-label">备忘录 / 预展</p><article className="pz-memo"><span>09 / 17</span><h3>在开幕前</h3><p>□ 门口伞架搬到廊内<br/>□ 直播结束后收回话筒<br/>□ 给档案编号重新贴标<br/>□ 21:00，带原始账页开会</p><small>最后编辑 18:12</small></article><p className="pz-instruction">普通工作清单。需要其他来源验证它与案件的关系。</p></>}
        {app === 'transfer' && <><p className="pz-document-label">账单 / 本月</p><article className="pz-transfer"><span className="pz-transfer-icon" aria-hidden="true">↗</span><small>备用金账户 → 医疗缴费账户</small><h3>¥ 28,000.00</h3><span>转账成功 · 操作人：许曼</span><p>{record('transfer')?.detail}</p></article>{collectButton('transfer')}<div className="pz-ordinary-record"><strong>其他账目</strong><p>09.15　展览保险　− ¥ 680.00<br/>09.12　图录印刷　− ¥ 2,400.00</p></div></>}
        {app === 'deleted' && <RestorePuzzle solved={solved} onSolve={onSolve} />}
      </div>}
      {app && <nav className="pz-app-tabs" aria-label="手机应用">{apps.map((item) => <button type="button" key={item.id} aria-current={app === item.id ? 'page' : undefined} onClick={() => setApp(item.id)}>{item.name}</button>)}</nav>}
    </>}
    <div className="pz-home-bar" aria-hidden="true" />
  </section>;
}

function CameraFrame({ minute }: { minute: number }) {
  const lin = minute === 27;
  const zhou = minute === 32;
  return <svg className="pz-camera-art" viewBox="0 0 640 420" role="img" aria-label={lin ? '20:27，林岑在阅档室门外转角，面孔清晰，袖口包着铜镇纸，身后房门仍开着' : zhou ? '20:32，周屿仍在一楼直播台操作录像设备' : `20:${minute}，走廊和大厅的常规监控画面`}>
    <defs><linearGradient id="camera-floor" x2="0" y2="1"><stop stopColor="#354345"/><stop offset="1" stopColor="#71827c"/></linearGradient><radialGradient id="camera-vignette"><stop offset=".2" stopColor="#0a1916" stopOpacity="0"/><stop offset="1" stopColor="#08110f" stopOpacity=".65"/></radialGradient></defs>
    <rect width="640" height="420" fill="#6b7a70"/>
    <path d="M0 0h640v70L380 244H192L0 144z" fill="#46594f"/>
    <path d="M192 70h188v174H192z" fill="#738276"/>
    <path d="M0 420V145l192 100h188L640 70v350z" fill="url(#camera-floor)"/>
    <path d="M0 0l192 70v176L0 146z" fill="#576a61"/>
    <path d="M29 66l102 30v98L29 158z" fill="#293c34"/>
    <path d="M40 82l78 21v74l-78-27z" fill="#899387"/>
    <path d="M224 126h112v118H224z" fill="#1c3028"/>
    <path d="M225 125l62 22v116l-62-20z" fill="#596c5c"/>
    <path stroke="#a8afa0" strokeWidth="3" d="M280 181v15"/>
    <path stroke="#a6aea0" strokeWidth="2" d="M192 245L14 420M245 245L211 420M305 245L424 420M380 245L640 389M0 307h478M0 371h604" opacity=".5"/>
    <path fill="#99a596" d="M300 20h124l-33 16h-119z"/>
    {lin ? <g transform="translate(398 120)">
      <path d="M-59 143l12 148h34l15-94 18 94h33l-1-148" fill="#263c36"/>
      <path d="M-40 69q44-32 82 5l33 100-145 3z" fill="#849894"/>
      <path d="M-18 63h39v36h-39z" fill="#b5c0a7"/>
      <path d="M-38 39q-5-58 38-56 49 0 42 79l-27 17-37-2z" fill="#21372f"/>
      <ellipse cx="1" cy="37" rx="27" ry="37" fill="#c7cbb1"/>
      <path d="M-27 27Q-29-5 3-5q32 3 27 27L14 9Q2 21-27 27" fill="#23362f"/>
      <path d="M-18 36h9m17 0h9" stroke="#3d5041" strokeWidth="3"/><path d="M1 41l-3 12h6m-14 8q9 5 18-1" fill="none" stroke="#74846e" strokeWidth="2"/>
      <path d="M-61 104l38 49 78-21 10 25-99 31-48-55" fill="#a1afa5"/><path d="M-14 141l61-21 22 36-69 13z" fill="#617b78"/>
      <path d="M19 139l32-10 8 13-31 10z" fill="#bcad7c" stroke="#465544" strokeWidth="2"/>
      <rect x="-35" y="-10" width="72" height="91" fill="none" stroke="#d4ddbb" strokeDasharray="8 7" opacity=".6"/>
    </g> : zhou ? <g>
      <path d="M124 278h359v101H124z" fill="#405850"/><path d="M106 268h391v20H106z" fill="#adb3a0"/>
      <path d="M336 219h94v54h-94z" fill="#1c332b" stroke="#a0b3a1" strokeWidth="4"/><path d="M346 227h73v32h-73z" fill="#72968b"/>
      <g transform="translate(472 171)"><path d="M-28 74l-6 89h57l-3-89z" fill="#85958b"/><path d="M-19 48h35v36h-35z" fill="#b4bea5"/><ellipse cy="29" rx="24" ry="30" fill="#c1c9af"/><path d="M-25 28q-6-47 27-38 35-4 23 34L7 5-15 18z" fill="#2e4037"/><path d="M-14 29h6m14 0h6" stroke="#3b5446" strokeWidth="3"/><path d="M-18 80l-37 21-30-7-9 14 48 13 36-13" fill="#82958a"/></g>
      <g transform="translate(226 182)" fill="#435a4e"><ellipse cy="22" rx="20" ry="26"/><path d="M-21 50h42l21 55h-83z"/></g>
      <g transform="translate(147 166)" fill="#304b3c"><ellipse cy="22" rx="19" ry="25"/><path d="M-22 51h46l17 65h-81z"/></g>
      <path d="M202 246h57" stroke="#cfceae" strokeWidth="3"/><circle cx="281" cy="240" r="5" fill="#ceceb0"/>
    </g> : <><path d="M471 167l123-79v153l-123 45z" fill="#304a3c"/><path d="M470 286v134m39-158v158m39-183v183m39-208v208" stroke="#98a899" strokeWidth="4"/>{minute > 20 && minute < 34 && <g transform={`translate(${440 + (minute % 5) * 12} 160)`} opacity=".7"><ellipse cy="21" rx="13" ry="16" fill="#b1baa2"/><path d="M-17 37h34l12 67h-55z" fill="#485e50"/></g>}</>}
    <rect width="640" height="420" fill="url(#camera-vignette)"/>
    <g fill="none" stroke="#cbd5bb" strokeWidth="1.5" opacity=".65"><path d="M25 64V25h44m502 0h44v39M25 355v39h44m502 0h44v-39"/></g>
  </svg>;
}

function CameraPuzzle({ solved, onSolve }: Pick<Props, 'solved' | 'onSolve'>) {
  const [minute, setMinute] = useState(10);
  const [notice, setNotice] = useState('');
  const [flash, setFlash] = useState(0);
  const currentId = minute === 27 ? 'camera-lin' : minute === 32 ? 'camera-zhou' : null;
  function seek(value: number) { setMinute(clamp(value, 10, 40)); setNotice(''); }
  function capture() {
    setFlash((current) => current + 1);
    if (!currentId) { setNotice(`20:${minute} 的画面没有足够清晰的人物或关键动作。可继续拖动时间轴检查其他时刻。`); return; }
    onSolve(currentId);
    setNotice(minute === 27 ? '已保存 20:27：林岑的面孔清晰可辨，袖口包着铜镇纸；阅档室房门仍敞开。' : '已保存 20:32：周屿仍在一楼直播台操作录像设备。');
  }
  return <section className="pz-camera pz-module" aria-label="监控录像调查">
    <div className="pz-instrument-line"><span>SECURITY / PLAYBACK</span><span className="pz-live-indicator">原始录像</span></div>
    <div className="pz-monitor">
      <CameraFrame minute={minute} />
      <div className="pz-monitor-top"><span>主监控 · {minute === 32 ? '一楼大厅' : '楼梯转角'}</span><span>● REC</span></div>
      <div className="pz-monitor-bottom"><span>2026 / 09 / 17</span><strong>20:{String(minute).padStart(2, '0')}:00</strong></div>
      {flash > 0 && <div key={flash} className="pz-capture-flash" />}
    </div>
    <div className="pz-camera-scrubber"><label htmlFor="camera-time">拖动回放时间轴 <output htmlFor="camera-time">20:{minute}</output></label><input id="camera-time" type="range" min={10} max={40} step={1} value={minute} onChange={(event) => seek(Number(event.target.value))} aria-valuetext={`20点${minute}分`} /><div className="pz-time-ticks"><span>20:10</span><span>20:20</span><span>20:30</span><span>20:40</span></div></div>
    <div className="pz-controls pz-camera-controls"><button type="button" onClick={() => seek(minute - 1)} disabled={minute === 10} aria-label="监控后退一分钟">− 1 分</button><span>逐帧定位</span><button type="button" onClick={() => seek(minute + 1)} disabled={minute === 40} aria-label="监控前进一分钟">＋ 1 分</button></div>
    <p className="pz-frame-description">{minute === 27 ? '转角处的人抬起了头，面孔与袖口包裹的物体都能辨认。' : minute === 32 ? '大厅镜头扫过直播台，操作录像设备的人清晰入镜。' : '画面中的光影不断变化。寻找足以辨认人物和行动的一帧。'}</p>
    <button type="button" className="pz-primary" onClick={capture}>{currentId && solved.includes(currentId) ? '重新截取当前画面' : '截取当前画面'}</button>
    <div role="status" className="pz-feedback">{notice}</div>
    <p className="pz-calibration">取证说明：主监控原始通道按时间合并展示。录像与门锁时钟已经校准；侧廊停用不影响这些通道。</p>
  </section>;
}

export default function Puzzles({ kind, solved, onSolve, onCollect }: Props) {
  if (kind === 'photo') return <PhotoPuzzle solved={solved} onSolve={onSolve} />;
  if (kind === 'camera') return <CameraPuzzle solved={solved} onSolve={onSolve} />;
  return <PhonePuzzle solved={solved} onSolve={onSolve} onCollect={onCollect} />;
}
